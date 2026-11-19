import "server-only";

import { unstable_cache } from "next/cache";

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
// Całościowo limit chronią: rejestr (ważne kierunki bez API), cache 30 dni,
// brak zapytań na Preview i wyłącznik po pierwszej porażce (niżej).
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

// Wyłącznik: po odmowie (429), błędzie HTTP, przekroczeniu czasu albo błędzie sieci
// proces przestaje pytać Pexels na 10 minut. Strony w tym czasie dostają układ bez
// zdjęcia, zamiast dobijać wyczerpany limit kolejnymi zapytaniami.
const PEXELS_PAUSE_MS = 10 * 60 * 1000;
const PEXELS_TIMEOUT_MS = 8000;
let pexelsPausedUntil = 0;

function pexelsPaused(): boolean {
  return Date.now() < pexelsPausedUntil;
}

class PexelsUnavailableError extends Error {}

/**
 * Jedno wyszukiwanie w slocie: zapytanie, status, treść i ewentualne otwarcie
 * wyłącznika dzieją się, zanim slot przejmie kolejne zadanie. Każda porażka rzuca
 * wyjątek, więc `unstable_cache` niczego nie zapisuje (awarie nie są cache'owane).
 */
async function searchPexelsStrict(query: string): Promise<PhotoCandidate[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new PexelsUnavailableError("brak klucza Pexels");
  return withPexelsSlot(async () => {
    // Sprawdzane w slocie: zadania czekające w kolejce nie ruszą po otwarciu wyłącznika.
    if (pexelsPaused()) throw new PexelsUnavailableError("wyłącznik Pexels otwarty");
    try {
      // `no-store`: cache'uje `unstable_cache` niżej. Gdyby cache'ował fetch, Next przy
      // odświeżaniu przeterminowanego wpisu pomijałby `signal`, czyli limit czasu i slot.
      // Bez `locale=pl-PL`: z nim Pexels oddaje opisy po polsku, odmienione („w Paryżu”),
      // których strażnik nazwy miasta i kraju nie rozpozna. Zapytanie jest po angielsku.
      const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) throw new PexelsUnavailableError(`Pexels HTTP ${response.status}`);
      const data = (await response.json()) as { photos?: PexelsPhoto[] };
      return (data.photos ?? [])
        .map((photo, index) => {
          const url = extractUrl(photo);
          if (!url) return null;
          return { url, alt: photo.alt ?? "", baseScore: Math.max(0, 20 - index) };
        })
        .filter((item): item is PhotoCandidate => Boolean(item));
    } catch (error) {
      pexelsPausedUntil = Date.now() + PEXELS_PAUSE_MS;
      throw error;
    }
  });
}

/**
 * Wyniki wyszukiwania w cache danych 30 dni (wcześniej 1 dzień — po dobie każdy build
 * pytał API o wszystkie kierunki naraz). Odświeżenie przeterminowanego wpisu w tle też
 * idzie przez `searchPexelsStrict`, więc obowiązuje je slot, limit czasu i wyłącznik.
 * Ręcznie odświeża unieważnienie tagu `pexels-media`.
 */
const PEXELS_CACHE_SECONDS = 30 * 24 * 60 * 60;
const searchPexelsCached = unstable_cache(searchPexelsStrict, ["pexels-search", "v2"], {
  revalidate: PEXELS_CACHE_SECONDS,
  tags: ["pexels-media"],
});

/**
 * Jedno zapytanie na kierunek. Zostają tylko zdjęcia, których opis wymienia miasto
 * i kraj kierunku (`photoDescribesDestination`).
 */
async function fetchDestinationMedia(destination: DestinationProfile): Promise<DestinationMedia | null> {
  if (!liveSearchAllowed(process.env) || pexelsPaused()) return null;

  const query = buildGenericQuery(destination);
  let candidates: PhotoCandidate[];
  try {
    candidates = await searchPexelsCached(query);
  } catch (error) {
    // Skrypty i testy bez serwera Nexta: `unstable_cache` nie ma gdzie trzymać danych.
    if (!(error instanceof Error && /incrementalCache missing/i.test(error.message))) return null;
    try {
      candidates = await searchPexelsStrict(query);
    } catch {
      return null;
    }
  }

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
// Wyników nie trzymamy dłużej: każdy render ponownie woła cache (trafienie), więc strona
// dostaje tag `pexels-media` i jego unieważnienie odświeża WSZYSTKIE strony.
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
