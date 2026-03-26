import "server-only";

import type { DestinationProfile } from "./types";
import { getDestinationMedia } from "./commercial-assets";
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

type DestinationRecipe = {
  hero: string[];
  gallery: string[];
  poster: string[];
};

const cache = new Map<string, Promise<DestinationMedia>>();

const recipesBySlug: Record<string, DestinationRecipe> = {
  "malaga-spain": {
    hero: ["Malaga Alcazaba", "Malaga Spain city center"],
    gallery: ["Malaga La Malagueta beach", "Malaga Gibralfaro", "Malaga Muelle Uno"],
    poster: ["Malaga old town", "Malaga harbour"],
  },
  "barcelona-spain": {
    hero: ["Barcelona Sagrada Familia", "Barcelona skyline"],
    gallery: ["Barcelona Barceloneta", "Barcelona Gothic Quarter", "Barcelona Park Guell"],
    poster: ["Barcelona architecture", "Barcelona city view"],
  },
  "lisbon-portugal": {
    hero: ["Lisbon tram 28", "Lisbon Alfama"],
    gallery: ["Lisbon miradouro", "Lisbon river view", "Lisbon old town"],
    poster: ["Lisbon skyline", "Lisbon pastel de nata"],
  },
  "valencia-spain": {
    hero: ["Valencia City of Arts and Sciences", "Valencia skyline"],
    gallery: ["Valencia Malvarrosa beach", "Valencia old town", "Valencia Turia park"],
    poster: ["Valencia architecture", "Valencia promenade"],
  },
  "rome-italy": {
    hero: ["Rome Colosseum", "Rome Italy"],
    gallery: ["Rome Trevi Fountain", "Rome piazza", "Rome Vatican"],
    poster: ["Rome old town", "Rome skyline"],
  },
  "prague-czechia": {
    hero: ["Prague Charles Bridge", "Prague old town"],
    gallery: ["Prague skyline", "Prague river", "Prague architecture"],
    poster: ["Prague city center", "Prague night"],
  },
  "budapest-hungary": {
    hero: ["Budapest Parliament", "Budapest Danube"],
    gallery: ["Budapest thermal baths", "Budapest bridge", "Budapest skyline"],
    poster: ["Budapest city view", "Budapest river"],
  },
  "marrakesh-morocco": {
    hero: ["Marrakesh medina", "Marrakesh Morocco"],
    gallery: ["Marrakesh souk", "Marrakesh desert", "Marrakesh riad"],
    poster: ["Marrakesh old town", "Marrakesh market"],
  },
  "athens-greece": {
    hero: ["Athens Acropolis", "Athens Greece"],
    gallery: ["Athens Plaka", "Athens skyline", "Athens ancient ruins"],
    poster: ["Athens city view", "Athens sunset"],
  },
};

function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildGenericQuery(destination: DestinationProfile): string {
  return removeDiacritics([destination.city, destination.country, "travel"].join(" "));
}

function extractUrl(photo: PexelsPhoto): string | null {
  return photo.src?.large2x ?? photo.src?.large ?? photo.src?.original ?? photo.src?.portrait ?? null;
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

async function fetchCandidates(query: string, apiKey: string): Promise<PhotoCandidate[]> {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&locale=pl-PL`,
    {
      headers: {
        Authorization: apiKey,
      },
    },
  );

  if (!response.ok) {
    return [];
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

async function pickUrls(apiKey: string, queries: string[], keywords: string[]): Promise<string[]> {
  for (const query of queries) {
    const candidates = await fetchCandidates(query, apiKey);
    if (candidates.length === 0) continue;

    const ranked = candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreCandidate(candidate, keywords),
      }))
      .sort((a, b) => b.score - a.score);

    const urls = ranked.map((item) => item.url);
    if (urls.length > 0) {
      return urls;
    }
  }

  return [];
}

async function fetchDestinationMedia(destination: DestinationProfile): Promise<DestinationMedia> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return getDestinationMedia(destination);
  }

  const recipe = recipesBySlug[destination.slug];
  const keywords = [destination.city, destination.country];
  let urls: string[] = [];

  if (recipe) {
    const heroUrls = await pickUrls(apiKey, recipe.hero, keywords);
    const galleryUrls = await pickUrls(apiKey, recipe.gallery, keywords);
    const posterUrls = await pickUrls(apiKey, recipe.poster, keywords);

    urls = [
      heroUrls[0],
      galleryUrls[0] ?? heroUrls[1],
      galleryUrls[1] ?? heroUrls[2],
      posterUrls[0] ?? galleryUrls[2] ?? heroUrls[0],
    ].filter((url): url is string => Boolean(url));
  } else {
    urls = await pickUrls(apiKey, [buildGenericQuery(destination)], keywords);
  }

  if (urls.length === 0) {
    return getDestinationMedia(destination);
  }

  return {
    heroImage: urls[0],
    gallery: [urls[1] ?? urls[0], urls[2] ?? urls[0], urls[3] ?? urls[1] ?? urls[0]],
    poster: urls[3] ?? urls[1] ?? urls[0],
    credit: "Zdjęcia z Pexels",
  };
}

export async function resolveDestinationMedia(destination: DestinationProfile): Promise<DestinationMedia> {
  if (destination.media) {
    return destination.media;
  }

  const cacheKey = destination.slug;
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = fetchDestinationMedia(destination).catch(() => getDestinationMedia(destination));
  cache.set(cacheKey, promise);
  return promise;
}
