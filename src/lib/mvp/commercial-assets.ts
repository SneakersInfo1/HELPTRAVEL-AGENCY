import { noPhotoMedia, verifiedMediaFor } from "@/lib/media/verified-photos";

import type { DestinationProfile } from "./types";
import type { DestinationMedia } from "./visuals";

export type TravelProviderKey = "flights" | "stays" | "attractions" | "cars";

// Media bez sieci (synchronicznie): tylko zdjęcia z rejestru zweryfikowanych.
//
// Dawniej ten moduł miał tabelę zdjęć Unsplash „na kierunek” i jedno ogólne zdjęcie
// dla reszty, używane też jako zapas, gdy wyszukiwanie Pexels zawiodło. Część
// przypisywała miastom cudze ikony (Barcelona = wieża Eiffla, Budapeszt = Brama
// Brandenburska, Ateny = czerwona fasada) — 19.11.2026 trafiły tak na produkcję.
// Zostały usunięte: kierunek bez zweryfikowanego zdjęcia dostaje układ bez zdjęcia.
export function getDestinationMedia(destination: DestinationProfile): DestinationMedia {
  return destination.media ?? verifiedMediaFor(destination.slug) ?? noPhotoMedia();
}

export function getDestinationMediaBySlug(slug: string): DestinationMedia {
  return verifiedMediaFor(slug) ?? noPhotoMedia();
}
