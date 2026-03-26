export interface SeoInspirationPage {
  slug: string;
  title: string;
  description: string;
  hero: string;
  sampleQuery: string;
  bullets: string[];
  destinationSlug?: string;
}

export const seoInspirationPages: SeoInspirationPage[] = [
  {
    slug: "weekend-w-rzymie-do-2000-zl",
    title: "Weekend w Rzymie do 2000 zl",
    description:
      "Sprawdz jak zaplanowac 3-4 dni w Rzymie w rozsadnym budzecie i przejsc do ofert partnerow afiliacyjnych.",
    hero: "Rzym na szybki city break laczy zwiedzanie, jedzenie i wygodne loty z Polski.",
    sampleQuery: "Weekend w Rzymie do 2000 zl dla 2 osob, duzo zwiedzania i dobre jedzenie.",
    destinationSlug: "rome-italy",
    bullets: [
      "Najlepsze okresy na lot i pogode.",
      "Orientacyjny koszt lot + nocleg + atrakcje.",
      "Gotowy plan dnia 2-4 dni z podzialem na strefy miasta.",
    ],
  },
  {
    slug: "4-dni-w-barcelonie",
    title: "4 dni w Barcelonie",
    description:
      "Gotowy szablon wyjazdu do Barcelony: budget, plan dnia, atrakcje i linki do partnerow rezerwacyjnych.",
    hero: "Barcelona to mocny balans plazy i miasta przy krotkim wyjezdzie 4-5 dni.",
    sampleQuery: "4 dni w Barcelonie, plaża + zwiedzanie, budzet do 2500 zl.",
    destinationSlug: "barcelona-spain",
    bullets: [
      "Podzial na dzielnice i realne tempo zwiedzania.",
      "Trade-offy: budzet vs lokalizacja noclegu.",
      "Szybkie przejscie do ofert lotow i hoteli.",
    ],
  },
  {
    slug: "cieple-kraje-bez-wizy-do-2500-zl",
    title: "Cieple kraje bez wizy do 2500 zl",
    description:
      "Porownanie kierunkow dla osob niezdecydowanych: cieplo, bez wizy, z Polski i z czytelnym rankingiem.",
    hero: "To glowny scenariusz produktu: wpisujesz potrzebe, dostajesz ranking kierunkow i gotowy plan.",
    sampleQuery:
      "Chce do cieplego kraju bez wizy, najlepiej z Polski, 5 dni, budzet do 2500 zl, plaze i cos do zwiedzania.",
    destinationSlug: "marrakesh-morocco",
    bullets: [
      "Ranking 3-5 opcji z uzasadnieniem.",
      "Szacunkowy koszt i styl wyjazdu.",
      "Przyciski afiliacyjne do finalnej rezerwacji.",
    ],
  },
  {
    slug: "gdzie-poleciec-zima-tanio-z-polski",
    title: "Gdzie poleciec zima tanio z Polski",
    description:
      "Inspiracje na tani zimowy city break lub cieply wyjazd z Polski, przygotowane pod szybkie decyzje.",
    hero: "Dla zimowych wyjazdow najwazniejsza jest relacja kosztu do pogody i wygody lotu.",
    sampleQuery: "Gdzie poleciec zima tanio z Polski na 4 dni, najlepiej cieplo.",
    destinationSlug: "malaga-spain",
    bullets: [
      "Kierunki z dobra pogoda zimowa.",
      "Koszty orientacyjne i potencjalne oszczednosci.",
      "Mini itineraries gotowe do uzycia.",
    ],
  },
];

export function getSeoPageBySlug(slug: string): SeoInspirationPage | undefined {
  return seoInspirationPages.find((page) => page.slug === slug);
}
