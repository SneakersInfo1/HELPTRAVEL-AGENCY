// Zweryfikowane zdjęcia najważniejszych kierunków HelpTravel.
//
// Każde zdjęcie obejrzane ręcznie i potwierdzone opisem autora na Pexels: prawdziwe
// ujęcie TEGO miejsca, z polskim opisem alternatywnym. Kierunek bez wpisu nie dostaje
// zdjęcia „na oko” — zobacz `resolveDestinationMedia` (wyszukiwanie z kontrolą opisu
// albo układ bez zdjęcia).
//
// Dlaczego rejestr, a nie samo wyszukiwanie: wyszukiwanie Pexels działa w trakcie
// builda i ISR i ma limit zapytań. Po serii wdrożeń 19.11.2026 zabrakło limitu,
// a zdjęcia zapasowe przypisały miastom cudze ikony (Barcelona = wieża Eiffla).
// Wyszukiwarka myli się też sama: na „Rhodes Greece” zwraca Stare Miasto na Korfu,
// na „Antalya” zamek w Alanyi, na „Faro” Lagos. Zdjęcia z rejestru nie zależą od API.
//
// Zakres: strona główna, karty hubów „wyjazdy”, porównania i strony „Hotele w …”
// (test `verified-photos.test.ts` pilnuje kompletności).
// Licencja Pexels: darmowe użycie bez obowiązku podpisu; strony podają „Zdjęcia: Pexels”.
// Kolejność galerii ma znaczenie w porównaniach: [0] panel werdyktu, [1] i [2] blok zdjęć.
// Rozszerzenie pliku jest częścią adresu: kilka zdjęć Pexels to PNG (adres .jpeg daje 404).

import type { DestinationMedia } from "@/lib/mvp/visuals";

export interface VerifiedPhoto {
  url: string;
  alt: string;
}

export interface VerifiedDestinationPhotos {
  hero: VerifiedPhoto;
  gallery: readonly VerifiedPhoto[];
}

/** Data ostatniego ręcznego przeglądu rejestru. */
export const VERIFIED_PHOTOS_CHECKED_AT = "2026-11-19";

const pexels = (id: string, alt: string, ext: "jpeg" | "png" = "jpeg"): VerifiedPhoto => ({
  url: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.${ext}`,
  alt,
});

const only = (hero: VerifiedPhoto): VerifiedDestinationPhotos => ({ hero, gallery: [] });

export const VERIFIED_DESTINATION_PHOTOS: Readonly<Record<string, VerifiedDestinationPhotos>> = {
  // Kierunki opublikowanych porównań — zdjęcie główne i pełna galeria.
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
  "malaga-spain": {
    hero: pexels("26754793", "Mury twierdzy Alcazaba w Maladze, w tle miasto"),
    gallery: [
      pexels("39637822", "Widok na Malagę z twierdzy Alcazaba"),
      pexels("35894600", "Port i wybrzeże Malagi z lotu ptaka"),
      pexels("16901476", "Plaża w Maladze, w tle góry"),
    ],
  },
  "barcelona-spain": {
    hero: pexels("3779162", "Sklepienie bazyliki Sagrada Família w Barcelonie"),
    gallery: [
      pexels("998736", "Sagrada Família wśród drzew w Barcelonie"),
      pexels("34998182", "Plaża Barceloneta w słoneczny dzień"),
      // Opis autora na Pexels mówi „hotel W”, ale na zdjęciu są wieże Hotel Arts i Mapfre.
      pexels("36286755", "Wieże Hotel Arts i Mapfre oraz rzeźba ryby Gehry’ego nad morzem w Barcelonie"),
    ],
  },
  "valencia-spain": {
    hero: pexels("38128813", "Miasto Sztuki i Nauki w Walencji widziane z parku"),
    gallery: [
      pexels("33863801", "Miasto Sztuki i Nauki w Walencji o zachodzie słońca"),
      pexels("15044639", "Plaża i wybrzeże Walencji z lotu ptaka"),
      pexels("11223107", "Miasto Sztuki i Nauki w Walencji z lotu ptaka"),
    ],
  },
  "funchal-portugal": {
    hero: pexels("28126075", "Panorama Funchal z kolejką linową i wybrzeżem Madery"),
    gallery: [
      pexels("31237923", "Czerwone dachy Funchal nad oceanem"),
      pexels("28126076", "Kościół i ogrody nad oceanem w Funchal"),
      pexels("18528724", "Ulica w Funchal z kwitnącym drzewem"),
    ],
  },
  "santa-cruz-de-tenerife-spain": {
    hero: pexels("27596392", "Auditorio de Tenerife nad oceanem w Santa Cruz"),
    gallery: [
      pexels("30366957", "Plaża Las Teresitas na Teneryfie z lotu ptaka"),
      pexels("21815208", "Zabudowa Teneryfy nad oceanem, w tle góry"),
      pexels("13593499", "Palmy na plaży Las Teresitas na Teneryfie"),
    ],
  },

  // Pozostałe kierunki ze strony głównej (tam, gdzie zdjęcie z produkcji okazało się
  // właściwe, zostało — wygląd strony głównej się nie zmienia).
  "lisbon-portugal": only(pexels("19891046", "Czerwony tramwaj w wąskiej uliczce Lizbony")),
  "istanbul-turkey": only(pexels("6152151", "Nabrzeże Stambułu z meczetem i promem")),
  "heraklion-greece": only(pexels("31106545", "Marina w Heraklionie na Krecie")),
  "paris-france": only(pexels("4452039", "Katedra Notre-Dame w Paryżu")),
  "porto-portugal": only(pexels("35568555", "Dachy Porto o zachodzie słońca")),
  "naples-italy": only(pexels("9708488", "Neapol z lotu ptaka")),
  "palma-spain": only(pexels("37707039", "Katedra La Seu w Palma de Mallorca odbita w wodzie")),
  "alicante-spain": only(pexels("12674842", "Wybrzeże Alicante nad Morzem Śródziemnym")),
  "antalya-turkey": only(pexels("22921961", "Klifowe wybrzeże Antalyi z hotelami")),
  "faro-portugal": only(pexels("39759564", "Kościół i plac z fontanną w Faro")),
  // Wcześniej samolot nad morzem — zdjęcie z Korfu, ale nie pokazywało miejsca.
  "corfu-greece": only(pexels("35494297", "Stare miasto i port na Korfu z lotu ptaka")),

  // Huby „wyjazdy”, porównania i strony „Hotele w …”.
  "larnaca-cyprus": only(pexels("34673406", "Kamienny zabytkowy budynek w Larnace")),
  "prague-czechia": only(pexels("39292894", "Wełtawa i mosty w Pradze")),
  "budapest-hungary": only(pexels("33810795", "Budynek Parlamentu w Budapeszcie")),
  "tirana-albania": only(pexels("19597740", "Meczet Namazgah w Tiranie na tle gór")),
  "berlin-germany": only(pexels("19880720", "Brama Brandenburska w Berlinie")),
  "las-palmas-spain": only(pexels("37726977", "Kolorowe kamienice w Las Palmas de Gran Canaria")),
  "agadir-morocco": only(pexels("30557503", "Plaża w Agadirze")),
  "marrakesh-morocco": only(pexels("37651105", "Plac Dżamaa al-Fina w Marrakeszu")),
  "valletta-malta": only(pexels("37807535", "Panorama Valletty od strony wody")),
  "amsterdam-netherlands": only(pexels("19640269", "Kamienice nad kanałem w Amsterdamie", "png")),
  "dublin-ireland": only(pexels("13158122", "Custom House nad rzeką Liffey w Dublinie")),
  "london-uk": only(pexels("37210622", "Tower Bridge w Londynie")),
  // Wcześniej Stare Miasto na Korfu z wyszukiwania na „Rhodes Greece”.
  "rhodes-greece": only(pexels("33151488", "Średniowieczne mury starego miasta na Rodos")),
  "madrid-spain": only(pexels("1500598", "Pałac Królewski w Madrycie")),
  "dubai-united-arab-emirates": only(pexels("10967550", "Wieżowce Dubai Marina z lotu ptaka", "png")),
  "vienna-austria": only(pexels("10621015", "Pałac Hofburg w Wiedniu")),
  "milan-italy": only(pexels("27362357", "Katedra w Mediolanie i plac przed nią")),
  "venice-italy": only(pexels("38487665", "Santa Maria della Salute i gondole na Canal Grande w Wenecji")),
  "florence-italy": only(pexels("29430188", "Panorama Florencji z katedrą")),
  "seville-spain": only(pexels("5470586", "Plaza de España w Sewilli o zachodzie słońca")),
  "hurghada-egypt": only(pexels("28376565", "Słomiane parasole na plaży w Hurghadzie")),
  "split-croatia": only(pexels("28142401", "Panorama Splitu z dzwonnicą, w tle góry")),
  "dubrovnik-croatia": only(pexels("20141444", "Stare Miasto w Dubrowniku z lotu ptaka")),
  "innsbruck-austria": only(pexels("35142365", "Kolorowe domy nad rzeką Inn w Innsbrucku, w tle góry")),
  "bergen-norway": only(pexels("29755390", "Drewniane domy Bryggen nad portem w Bergen")),
  "ljubljana-slovenia": only(pexels("33275587", "Kościół franciszkanów i Potrójny Most w Lublanie")),
  "sofia-bulgaria": only(pexels("28915257", "Sobór Aleksandra Newskiego w Sofii")),
};

export function verifiedPhotosFor(slug: string): VerifiedDestinationPhotos | null {
  return VERIFIED_DESTINATION_PHOTOS[slug] ?? null;
}

/** Media kierunku z rejestru zweryfikowanych zdjęć albo `null`, gdy kierunku w nim nie ma. */
export function verifiedMediaFor(slug: string): DestinationMedia | null {
  const photos = verifiedPhotosFor(slug);
  if (!photos) return null;
  return {
    heroImage: photos.hero.url,
    heroAlt: photos.hero.alt,
    gallery: photos.gallery.map((photo) => photo.url),
    poster: photos.gallery[0]?.url ?? photos.hero.url,
    credit: "Zdjęcia z Pexels",
    verified: true,
  };
}

/** Brak wiarygodnego zdjęcia: komponenty pokazują układ bez zdjęcia. */
export function noPhotoMedia(): DestinationMedia {
  return { heroImage: null, heroAlt: null, gallery: [], poster: null, credit: null, verified: false };
}
