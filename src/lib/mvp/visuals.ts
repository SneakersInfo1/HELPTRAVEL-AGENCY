export interface DestinationMedia {
  /**
   * Zdjęcie główne albo `null`, gdy nie ma wiarygodnej fotografii TEGO kierunku.
   * Wtedy komponent pokazuje układ bez zdjęcia — nigdy zdjęcie innego miejsca.
   */
  heroImage: string | null;
  /** Opis zdjęcia głównego, gdy pochodzi z rejestru zweryfikowanych zdjęć. */
  heroAlt?: string | null;
  gallery: string[];
  poster: string | null;
  credit: string | null;
  /** `true` = zdjęcia z rejestru obejrzanych ręcznie (`src/lib/media/verified-photos.ts`). */
  verified?: boolean;
}
