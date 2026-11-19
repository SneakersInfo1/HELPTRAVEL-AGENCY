// Zdjęcia przypięte do kierunków porównań — każde obejrzane ręcznie: prawdziwe ujęcie
// miejsca, z polskim opisem alternatywnym.
//
// Dlaczego przypięte, a nie z wyszukiwania: wyszukiwanie Pexels działa w trakcie builda
// i ma limit zapytań. Na Preview z 18.11.2026 drugi build w ciągu godziny dostał zdjęcia
// zapasowe — dla Aten pomarańczowy budynek w hero i brak galerii. Przypięte zdjęcia nie
// zależą od API. Kierunki bez wpisu korzystają jak dotąd z integracji (pexels-media.ts).
//
// Licencja Pexels: darmowe użycie, podpis nie jest wymagany; strona podaje „Zdjęcia: Pexels”.
// Kolejność galerii ma znaczenie: [0] panel werdyktu, [1] i [2] blok zdjęć w treści.

export interface PinnedPhoto {
  url: string;
  alt: string;
}

const pexels = (id: string, alt: string): PinnedPhoto => ({ url: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`, alt });

export const PINNED_COMPARISON_PHOTOS: Readonly<Record<string, { hero: PinnedPhoto; gallery: readonly PinnedPhoto[] }>> = {
  "athens-greece": {
    hero: pexels("34686183", "Akropol nad Atenami"),
    gallery: [
      pexels("11570800", "Biała kaplica nad dachami Aten, w tle wzgórze Likabettos"),
      pexels("30312498", "Odeon Heroda Attyka w Atenach"),
      pexels("35154967", "Marina w Pireusie"),
    ],
  },
  "rome-italy": {
    hero: pexels("35876917", "Wnętrze Koloseum w Rzymie"),
    gallery: [
      pexels("5610604", "Fontanna di Trevi nocą"),
      pexels("22391732", "Panteon w Rzymie"),
      pexels("32114353", "Dachy Rzymu z kopułą kościoła"),
    ],
  },
};
