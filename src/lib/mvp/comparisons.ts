// Wyselekcjonowane pary porownawcze pod realne intencje wyszukiwania.
// Slugi sa znormalizowane alfabetycznie, zeby uniknac duplikowanych URL-i.

export interface ComparisonPair {
  slug: string; // np. "barcelona-spain-vs-valencia-spain"
  a: string; // slug kierunku
  b: string;
  intent: string; // krotki opis intencji
}

function makePair(a: string, b: string, intent: string): ComparisonPair {
  const [first, second] = [a, b].sort();
  return { slug: `${first}-vs-${second}`, a: first, b: second, intent };
}

export const comparisonPairs: ComparisonPair[] = [
  // Hiszpania - city break
  makePair("barcelona-spain", "valencia-spain", "Drugie miasto Hiszpanii — porownanie pod city break"),
  makePair("barcelona-spain", "malaga-spain", "Plaza i miasto: kierunki katalonskie kontra Andaluzja"),
  makePair("malaga-spain", "valencia-spain", "Andaluzja kontra Walencja — klimat plazowo-miejski"),

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
  makePair("larnaca-cyprus", "valletta-malta", "Wyspy poludnia: Cypr kontra Malta"),
  makePair("athens-greece", "valletta-malta", "Krotki wyjazd nad cieplym morzem"),

  // Tanie city breaki Europy Srodkowej
  makePair("budapest-hungary", "prague-czechia", "Klasyczny duet city breaku Europy Srodkowej"),
  makePair("berlin-germany", "prague-czechia", "Berlin kontra Praga — weekend miejski"),
  makePair("budapest-hungary", "berlin-germany", "Atmosfera kontra design — Budapeszt vs Berlin"),

  // Balkany / niedrogie
  makePair("athens-greece", "tirana-albania", "Bliska Grecja kontra wschodzaca Albania"),

  // Pln Europa
  makePair("amsterdam-netherlands", "berlin-germany", "Dwa rowne city breaki w Europie Zachodniej"),
  makePair("dublin-ireland", "london-uk", "Wyspy Brytyjskie — gdzie krotki wypad"),
  makePair("amsterdam-netherlands", "london-uk", "Krotki lot, mocny city break"),

  // Maroko
  makePair("agadir-morocco", "marrakesh-morocco", "Maroko: plaza Atlantyku kontra Medyna"),
  makePair("istanbul-turkey", "marrakesh-morocco", "Bizancjum kontra Maghreb — egzotyczny city break"),

  // Cieplo zima — wyspy
  makePair("funchal-portugal", "las-palmas-spain", "Madera kontra Wyspy Kanaryjskie zima"),
  makePair("agadir-morocco", "las-palmas-spain", "Cieplo zimowe: Maroko kontra Kanary"),

  // Plaza poludnia
  makePair("antalya-turkey", "malaga-spain", "Dwa pewne kierunki plazowe lata"),
];

export function getComparisonPairBySlug(slug: string): ComparisonPair | undefined {
  return comparisonPairs.find((pair) => pair.slug === slug);
}

export function getComparisonsForDestination(destinationSlug: string): ComparisonPair[] {
  return comparisonPairs.filter((pair) => pair.a === destinationSlug || pair.b === destinationSlug);
}
