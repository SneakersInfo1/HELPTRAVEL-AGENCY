// Kierunki pokazywane PO KLIKNIĘCIU w puste pole „Dokąd" (hotele i loty).
//
// DLACZEGO OSOBNA LISTA, A NIE `popularity` Z SEEDU
// `popularity` w data/destinations.json nie jest miarą polskiego popytu —
// posortowane po niej pierwsze 25 pozycji to cała Hiszpania, potem cała
// Portugalia (Kordoba i Braga wyżej niż Rzym). Pole działa jak proxy zasięgu
// geograficznego, nie sprzedaży. Efekt był taki, że Polak klikał „Dokąd"
// i dostawał sześć hiszpańskich miast — zero Turcji, Egiptu i Grecji, czyli
// trzech kierunków, na które ten rynek realnie lata.
//
// Lista jest więc REDAKCYJNA — dokładnie tak jak `HOME_TILE_DESTINATION_IDS`
// w warm-config. Dobór: polska turystyka wyjazdowa, mieszanka czarter-plaża
// i city break, limit na kraj, żeby lista czytała się jak oferta, a nie jak
// wypis z jednego katalogu.
//
// CZY TE KIERUNKI SĄ W BAZIE LiteAPI
// Tak, i to jest sprawdzane MECHANICZNIE, nie deklaratywnie: seed
// `data/destinations.json` jest generowany z LiteAPI, a test
// `popular-destinations.test.ts` przechodzi po każdym `id` i wywala się, gdy
// choć jedno nie ma odpowiednika w seedzie. Literówka albo kierunek wycofany
// przez dostawcę zatrzymuje `pnpm test`, a nie ląduje jako pusta lista
// wyników u użytkownika.
//
// Moduł jest CZYSTY (bez `server-only`, bez importu seeda) — inaczej nie dałby
// się przetestować pod `node:test`, patrz CLAUDE.md → „import server-only
// breaks node:test". Rozwiązanie nazw i etykiet dzieje się po stronie serwera.

/** Grupa w podpowiedziach — 20 pozycji bez podziału jest nie do przejrzenia na telefonie. */
export type PopularGroup = "beach" | "city";

export interface PopularDestination {
  /** `id` z data/destinations.json (== slug profilu kierunku). */
  id: string;
  group: PopularGroup;
  /**
   * Nazwa, której użytkownik SZUKA, gdy różni się od nazwy miasta z lotniskiem.
   * Polak szuka „Kreta", nie „Heraklion"; „Gran Canaria", nie „Las Palmas".
   * Bez tego lista jest formalnie poprawna i praktycznie bezużyteczna.
   *
   * WYŁĄCZNIE region/wyspa — BEZ nazwy kraju. UI składa wiersz jako
   * „miasto / hint · kraj", więc kraj w podpowiedzi dawał „Cypr · Cypr"
   * i „Turcja, Riwiera Turecka · Turcja". Pilnuje tego test.
   */
  hint?: string;
}

export const POPULAR_GROUP_LABELS: Record<PopularGroup, string> = {
  beach: "Na plażę",
  city: "Miasto na weekend",
};

/**
 * 20 kierunków. Kolejność = kolejność wyświetlania w grupie (najpierw to, co
 * Polacy kupują najczęściej). Limit 5 na kraj, żeby lista nie zamieniła się
 * w katalog jednego rynku.
 */
export const POPULAR_DESTINATIONS: readonly PopularDestination[] = [
  // ── Czarter / plaża — trzon polskiego rynku wyjazdowego ──
  { id: "antalya-turkey", group: "beach", hint: "Riwiera Turecka" },
  { id: "hurghada-egypt", group: "beach", hint: "Morze Czerwone" },
  { id: "heraklion-greece", group: "beach", hint: "Kreta" },
  // Bez podpowiedzi: nazwa miasta w seedzie to już „Rodos" — czyli dokładnie
  // to, czego Polak szuka. Powtórzenie byłoby szumem (pilnuje tego test).
  { id: "rhodes-greece", group: "beach" },
  { id: "sharm-el-sheikh-egypt", group: "beach", hint: "Synaj" },
  { id: "palma-spain", group: "beach", hint: "Majorka" },
  // Miasto w seedzie to już „Teneryfa"; podpowiedź dokłada archipelag.
  { id: "santa-cruz-de-tenerife-spain", group: "beach", hint: "Wyspy Kanaryjskie" },
  { id: "malaga-spain", group: "beach", hint: "Costa del Sol" },
  { id: "las-palmas-spain", group: "beach", hint: "Gran Canaria" },
  // Larnaka i Dubaj bez podpowiedzi: kraj (Cypr / ZEA) niesie już całą
  // informację, a wiersz i tak go pokazuje.
  { id: "larnaca-cyprus", group: "beach" },
  { id: "split-croatia", group: "beach", hint: "Dalmacja" },
  { id: "tirana-albania", group: "beach", hint: "Riwiera Albańska" },
  { id: "funchal-portugal", group: "beach", hint: "Madera" },

  // ── City break ──
  { id: "rome-italy", group: "city" },
  { id: "barcelona-spain", group: "city" },
  { id: "istanbul-turkey", group: "city" },
  { id: "paris-france", group: "city" },
  { id: "lisbon-portugal", group: "city" },
  { id: "athens-greece", group: "city" },
  { id: "dubai-united-arab-emirates", group: "city" },
];

/** Kolejność `id` — używana do posortowania wyników rozwiązanych z seeda. */
export const POPULAR_DESTINATION_IDS: readonly string[] = POPULAR_DESTINATIONS.map((d) => d.id);
