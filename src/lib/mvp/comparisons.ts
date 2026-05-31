// Wyselekcjonowane pary porownawcze pod realne intencje wyszukiwania.
// Slugi sa znormalizowane alfabetycznie, żeby uniknac duplikowanych URL-i.

export interface ComparisonPair {
  slug: string; // np. "barcelona-spain-vs-valencia-spain"
  a: string; // slug kierunku
  b: string;
  intent: string; // krótki opis intencji
  // Opcjonalna nazwa wyświetlana — gdy slug kierunku to miasto-lotnisko
  // ("santa-cruz-de-tenerife-spain"), a użytkownik szuka nazwy wyspy
  // ("Teneryfa"). Funkcjonalne linki (LiteAPI, /kierunki) nadal używają
  // profilu; te pola podmieniają tylko tekst widoczny + meta/H1/schema.
  labelA?: string;
  labelB?: string;
}

// `labels` jest kluczowane slugiem kierunku (nie pozycją), bo makePair sortuje
// a/b alfabetycznie — dzięki temu etykieta zawsze trafia do właściwej strony.
function makePair(a: string, b: string, intent: string, labels?: Record<string, string>): ComparisonPair {
  const [first, second] = [a, b].sort();
  return {
    slug: `${first}-vs-${second}`,
    a: first,
    b: second,
    intent,
    labelA: labels?.[first],
    labelB: labels?.[second],
  };
}

export const comparisonPairs: ComparisonPair[] = [
  // Hiszpania - city break
  makePair("barcelona-spain", "valencia-spain", "Drugie miasto Hiszpanii — porównańie pod city break"),
makePair("barcelona-spain", "malaga-spain", "Plaża i miasto: kierunki katalońskie kontra Andaluzja"),
makePair("malaga-spain", "valencia-spain", "Andaluzja kontra Walencja — klimat plażowo-miejski"),

  // Iberia: Portugalia + Hiszpania
  makePair("lisbon-portugal", "barcelona-spain", "Dwie ikony Iberii — co lepiej pod 4 dni"),
  makePair("lisbon-portugal", "malaga-spain", "Cieplo i atmosfera: Lizbona kontra Malaga"),
  makePair("lisbon-portugal", "valencia-spain", "Atlantyk kontra Morze Srodziemne na city break"),

  // Wlochy
  makePair("rome-italy", "naples-italy", "Klasyk kontra wloskie poludnie"),
  makePair("rome-italy", "barcelona-spain", "Dwie kultowe stolice na city break"),

  // Wschodnie srodziemnomorze
  makePair("athens-greece", "istanbul-turkey", "Antyk kontra metropolia — Grecja vs Turcja"),
  makePair("antalya-turkey", "larnaca-cyprus", "Wakacje all-inclusive: Turcja vs Cypr"),
  makePair("larnaca-cyprus", "valletta-malta", "Wyspy południa: Cypr kontra Malta"),
  makePair("athens-greece", "valletta-malta", "Krotki wyjazd nad ciepłym morzem"),

  // Tanie city breaki Europy Srodkowej
  makePair("budapest-hungary", "prague-czechia", "Klasyczny duet city breaku Europy Srodkowej"),
  makePair("berlin-germany", "prague-czechia", "Berlin kontra Praga — weekend miejski"),
  makePair("budapest-hungary", "berlin-germany", "Atmosfera kontra design — Budapeszt vs Berlin"),

  // Balkany / niedrogie
  makePair("athens-greece", "tirana-albania", "Bliska Grecja kontra wschodzaca Albania"),

  // Pln Europa
  makePair("amsterdam-netherlands", "berlin-germany", "Dwa rowne city breaki w Europie Zachodniej"),
  makePair("dublin-ireland", "london-uk", "Wyspy Brytyjskie — gdzie krótki wypad"),
  makePair("amsterdam-netherlands", "london-uk", "Krotki lot, mocny city break"),

  // Maroko
  makePair("agadir-morocco", "marrakesh-morocco", "Maroko: plaża Atlantyku kontra Medyna"),
  makePair("istanbul-turkey", "marrakesh-morocco", "Bizancjum kontra Maghreb — egzotyczny city break"),

  // Cieplo zima — wyspy
  makePair("funchal-portugal", "las-palmas-spain", "Madera kontra Wyspy Kanaryjskie zima"),
  makePair("agadir-morocco", "las-palmas-spain", "Cieplo zimowe: Maroko kontra Kanary"),

// Plaża południa
makePair("antalya-turkey", "malaga-spain", "Dwa pewne kierunki plażowe lata"),

  // Wyspy — najwyższy wolumen pakietów wakacyjnych z Polski. Slug kierunku to
  // miasto-lotnisko, więc etykiety pokazują nazwę wyspy (intencja wyszukiwania).
  makePair(
    "santa-cruz-de-tenerife-spain",
    "las-palmas-spain",
    "Dwie Wyspy Kanaryjskie na ciepły wyjazd przez cały rok — którą wybrać",
    { "santa-cruz-de-tenerife-spain": "Teneryfa", "las-palmas-spain": "Gran Canaria" },
  ),
  makePair(
    "heraklion-greece",
    "rhodes-greece",
    "Dwie greckie wyspy na wakacje nad ciepłym morzem — co lepsze pod plażę i zwiedzanie",
    { "heraklion-greece": "Kreta", "rhodes-greece": "Rodos" },
  ),
  makePair(
    "palma-spain",
    "heraklion-greece",
    "Baleary kontra Grecja — Majorka czy Kreta na wakacje nad morzem",
    { "palma-spain": "Majorka", "heraklion-greece": "Kreta" },
  ),
];

export function getComparisonPairBySlug(slug: string): ComparisonPair | undefined {
  return comparisonPairs.find((pair) => pair.slug === slug);
}

export function getComparisonsForDestination(destinationSlug: string): ComparisonPair[] {
  return comparisonPairs.filter((pair) => pair.a === destinationSlug || pair.b === destinationSlug);
}
