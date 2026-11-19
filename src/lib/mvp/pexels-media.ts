import "server-only";

import { liveSearchAllowed, photoDescribesDestination } from "@/lib/media/photo-guards";
import { noPhotoMedia, verifiedMediaFor } from "@/lib/media/verified-photos";

import type { DestinationProfile } from "./types";
import type { DestinationMedia } from "./visuals";

type PexelsPhoto = {
  src?: {
    large2x?: string;
    large?: string;
    original?: string;
    portrait?: string;
  };
  alt?: string;
};

type PhotoCandidate = {
  url: string;
  alt: string;
  baseScore: number;
};

function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function buildGenericQuery(destination: DestinationProfile): string {
  return removeDiacritics([destination.city, destination.country, "travel"].join(" "));
}

function extractUrl(photo: PexelsPhoto): string | null {
  // The Pexels photo id is all that matters: the custom CDN loader
  // (src/lib/images/cdn-loader.ts) rewrites `?w=` to the rendered width and
  // Pexels resizes the ORIGINAL on the fly, so `large` vs `large2x` produces
  // identical output. We keep `large` as the canonical source url.
  return photo.src?.large ?? photo.src?.large2x ?? photo.src?.original ?? photo.src?.portrait ?? null;
}

function scoreCandidate(candidate: PhotoCandidate, keywords: string[]): number {
  const haystack = removeDiacritics(`${candidate.alt} ${candidate.url}`.toLowerCase());
  return keywords.reduce((score, keyword) => {
    const normalized = removeDiacritics(keyword.toLowerCase());
    if (haystack.includes(normalized)) return score + 8;
    const firstWord = normalized.split(" ")[0] ?? normalized;
    return haystack.includes(firstWord) ? score + 3 : score;
  }, candidate.baseScore);
}

// Najwyżej tyle zapytań do Pexels naraz w jednym procesie (worker builda, funkcja ISR).
// To limit lokalny: build ma kilka workerów, więc globalnie zapytań może być więcej.
// Całościowo limit chronią: rejestr (ważne kierunki bez API), Data Cache 30 dni,
// brak zapytań na Preview i wyłącznik po pierwszej odmowie (niżej).
const MAX_CONCURRENT_PEXELS_REQUESTS = 2;
let activePexelsRequests = 0;
const pexelsQueue: Array<() => void> = [];

async function withPexelsSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activePexelsRequests >= MAX_CONCURRENT_PEXELS_REQUESTS) {
    await new Promise<void>((resolve) => pexelsQueue.push(resolve));
  }
  activePexelsRequests += 1;
  try {
    return await task();
  } finally {
    activePexelsRequests -= 1;
    pexelsQueue.shift()?.();
  }
}

// Wyłącznik: po odmowie (429), błędzie serwera, przekroczeniu czasu albo błędzie sieci
// proces przestaje pytać Pexels na 10 minut. Strony w tym czasie dostają układ bez
// zdjęcia (bez zapamiętywania), zamiast dobijać wyczerpany limit kolejnymi zapytaniami.
const PEXELS_PAUSE_MS = 10 * 60 * 1000;
const PEXELS_TIMEOUT_MS = 8000;
let pexelsPausedUntil = 0;

function pexelsPaused(): boolean {
  return Date.now() < pexelsPausedUntil;
}

/**
 * Wyniki wyszukiwania trzymamy w Data Cache 30 dni (wcześniej 1 dzień — po dobie
 * każdy build pytał API o wszystkie kierunki naraz). Zdjęcia miejsc nie wymagają
 * częstszego odświeżania; ręcznie odświeża je unieważnienie tagu `pexels-media`.
 * Odpowiedzi z błędem (np. 429) Next nie zapisuje, więc nie utrwalają awarii.
 */
const PEXELS_CACHE_SECONDS = 30 * 24 * 60 * 60;

/** `null` = awaria (odmowa, timeout, sieć); `[]` = API odpowiedziało, ale bez zdjęć. */
async function fetchCandidates(query: string, apiKey: string): Promise<PhotoCandidate[] | null> {
  const response = await withPexelsSlot(async () => {
    // Sprawdzane w slocie: zapytania czekające w kolejce nie ruszą po otwarciu wyłącznika.
    if (pexelsPaused()) return null;
    try {
      // Bez `locale=pl-PL`: z nim Pexels oddaje opisy po polsku, odmienione („w Paryżu”,
      // „Pragi”), których strażnik nazwy miasta i kraju nie rozpozna. Zapytanie jest po angielsku.
      return await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`, {
        headers: {
          Authorization: apiKey,
        },
        signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS),
        // Silently ignored outside the Next runtime, so tests/scripts are unaffected.
        cache: "force-cache",
        next: { revalidate: PEXELS_CACHE_SECONDS, tags: ["pexels-media"] },
      });
    } catch {
      pexelsPausedUntil = Date.now() + PEXELS_PAUSE_MS;
      return null;
    }
  });

  if (!response) return null;
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) pexelsPausedUntil = Date.now() + PEXELS_PAUSE_MS;
    return null;
  }

  const data = (await response.json()) as { photos?: PexelsPhoto[] };
  return (data.photos ?? [])
    .map((photo, index) => {
      const url = extractUrl(photo);
      if (!url) return null;
      return {
        url,
        alt: photo.alt ?? "",
        baseScore: Math.max(0, 20 - index),
      };
    })
    .filter((item): item is PhotoCandidate => Boolean(item));
}

/**
 * Jedno zapytanie na kierunek. Zostają tylko zdjęcia, których opis wymienia miasto
 * i kraj kierunku (`photoDescribesDestination`).
 */
async function fetchDestinationMedia(destination: DestinationProfile): Promise<DestinationMedia | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !liveSearchAllowed(process.env) || pexelsPaused()) return null;

  const candidates = await fetchCandidates(buildGenericQuery(destination), apiKey);
  if (!candidates) return null;

  const keywords = [destination.city, destination.country];
  const urls = candidates
    .filter((candidate) => photoDescribesDestination(candidate.alt, destination))
    .map((candidate) => ({ url: candidate.url, score: scoreCandidate(candidate, keywords) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);

  const unique = [...new Set(urls)];
  if (unique.length === 0) return null;
  const gallery = unique.slice(1, 4);
  return {
    heroImage: unique[0],
    heroAlt: null,
    gallery,
    poster: gallery[0] ?? unique[0],
    credit: "Zdjęcia z Pexels",
    verified: false,
  };
}

// Tylko deduplikacja zapytań w locie (kilka sekcji jednej strony pyta o ten sam kierunek).
// Wyników nie trzymamy dłużej: każdy render ponownie woła `fetch` (trafienie w Data Cache),
// więc strona dostaje tag `pexels-media` i jego unieważnienie odświeża WSZYSTKIE strony.
// Porażka nie zostaje w pamięci procesu.
const inFlight = new Map<string, Promise<DestinationMedia>>();

/**
 * Zdjęcia kierunku, w tej kolejności:
 *  1. rejestr zweryfikowanych zdjęć (bez sieci, deterministycznie);
 *  2. media z profilu kierunku (gdy profil je ma);
 *  3. wyszukiwanie Pexels na produkcji — tylko zdjęcia, których opis wymienia miasto i kraj;
 *  4. brak zdjęcia (`heroImage: null`) — komponenty pokazują układ bez zdjęcia.
 * Nigdy nie zwraca zdjęcia zastępczego innego miejsca.
 */
export async function resolveDestinationMedia(destination: DestinationProfile): Promise<DestinationMedia> {
  const verified = verifiedMediaFor(destination.slug);
  if (verified) return verified;
  if (destination.media) return destination.media;

  const key = destination.slug;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = fetchDestinationMedia(destination)
    .catch(() => null)
    .then((media) => media ?? noPhotoMedia())
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
