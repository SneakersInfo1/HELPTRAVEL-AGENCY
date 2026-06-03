// Travel "moods" — the discovery scenarios behind the homepage chips
// (Plaża / City break / Góry / Kultura / Budżet / Słońce zimą). Each mood is a
// curated, hand-picked set of destinations with honest one-line overviews,
// tags and a best-season note, plus editorial copy written for humans + SEO
// (concrete, specific, natural Polish — deliberately not generic AI filler).
//
// `slug` is set only for destinations that also have a full guide at
// /kierunki/[slug]; the rest link straight to hotel search (which resolves any
// real city via LiteAPI). This lets Góry feature genuine mountain destinations
// that aren't part of the Mediterranean-leaning curated catalogue.
//
// Pure data + types only — NO server imports here (this module is also pulled
// into the sitemap). Media + links are resolved in the server component.

export interface MoodPick {
  /** Display name on the card, e.g. "Teneryfa (Teide)". */
  name: string;
  /** City used for hotel search + image lookup (must be a real LiteAPI city). */
  searchCity: string;
  /** Full English country name for LiteAPI search. */
  country: string;
  /** Polish country label shown on the card. */
  countryPl: string;
  /** Present only when a /kierunki/[slug] guide exists. */
  slug?: string;
  /** Small eyebrow on the card, e.g. "Alpy Tyrolskie". */
  region: string;
  overview: string;
  tags: string[];
  season: string;
}

export interface MoodSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface MoodFaq {
  question: string;
  answer: string;
}

export interface TravelMood {
  /** URL segment: /wyjazdy/<slug> */
  slug: string;
  /** Matches the `key` used by the homepage MoodChips. */
  chipKey: string;
  label: string;
  icon: string;
  /** Tailwind gradient classes for the futuristic hero aura. */
  aura: string;
  eyebrow: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  /** Short trust/character chips shown under the hero. */
  highlights: string[];
  /** One-line intro above the destination grid. */
  gridIntro: string;
  picks: MoodPick[];
  sections: MoodSection[];
  faq: MoodFaq[];
}

export const TRAVEL_MOODS: TravelMood[] = [
  {
    slug: "plaza",
    chipKey: "beach",
    label: "Plaża",
    icon: "🏖️",
    aura: "from-sky-400/30 via-emerald-300/20 to-amber-200/30",
    eyebrow: "Morze i słońce",
    h1: "Kierunki na plażę — gdzie polecieć po morze i słońce",
    metaTitle: "Wyjazd na plażę — najlepsze kierunki nad morze z Polski | HelpTravel",
    metaDescription:
      "Kierunki plażowe z bezpośrednim lotem z Polski: ciepłe morze, dobre plaże i hotele blisko wody. Sprawdź ceny hoteli i lotów dla każdego kierunku.",
    lead:
      "Jeśli celem wyjazdu jest morze, plaża i ciepła woda, liczy się kilka konkretów: jakość plaż, temperatura w danym miesiącu i to, jak blisko wody da się zatrzymać. Poniżej kierunki, które najlepiej spinają ten scenariusz dla osób lecących z Polski.",
    highlights: ["Plaże w zasięgu krótkiego lotu", "Ceny hoteli i lotów w PLN", "Kierunki na 4–7 dni"],
    gridIntro: "Sześć kierunków, w których plaża jest blisko bazy noclegowej, a sezon trwa długo:",
    picks: [
      {
        name: "Malaga", searchCity: "Malaga", country: "Spain", countryPl: "Hiszpania", slug: "malaga-spain",
        region: "Costa del Sol",
        overview: "Szerokie plaże miejskie i stare miasto w jednym — można rano leżeć nad wodą, a po południu zwiedzać.",
        tags: ["plaża miejska", "stare miasto", "tapas"], season: "maj–wrzesień",
      },
      {
        name: "Larnaka", searchCity: "Larnaca", country: "Cyprus", countryPl: "Cypr", slug: "larnaca-cyprus",
        region: "Cypr południowy",
        overview: "Ciepłe morze utrzymuje się długo w sezonie, a wyjazd jest prosty logistycznie i spokojny.",
        tags: ["ciepłe morze", "spokojnie", "rodzinnie"], season: "maj–październik",
      },
      {
        name: "Antalya", searchCity: "Antalya", country: "Turkey", countryPl: "Turcja", slug: "antalya-turkey",
        region: "Riwiera Turecka",
        overview: "Najmocniejszy kierunek pod wypoczynek hotelowy: długi sezon i szeroki wybór ofert all-inclusive.",
        tags: ["all-inclusive", "długi sezon", "wypoczynek"], season: "maj–październik",
      },
      {
        name: "Walencja", searchCity: "Valencia", country: "Spain", countryPl: "Hiszpania", slug: "valencia-spain",
        region: "Costa de Valencia",
        overview: "Plaża Malvarrosa i miasto z charakterem — dobry kompromis między leżeniem nad wodą a zwiedzaniem.",
        tags: ["plaża + miasto", "paella", "rodziny"], season: "maj–wrzesień",
      },
      {
        name: "Faro / Algarve", searchCity: "Faro", country: "Portugal", countryPl: "Portugalia",
        region: "Algarve",
        overview: "Klify, zatoczki i jedne z najładniejszych plaż Europy na południu Portugalii.",
        tags: ["klify", "zatoczki", "surfing"], season: "czerwiec–wrzesień",
      },
      {
        name: "Palma de Mallorca", searchCity: "Palma de Mallorca", country: "Spain", countryPl: "Hiszpania",
        region: "Baleary",
        overview: "Wyspa z dużym wyborem plaż i zatok, od rodzinnych po kameralne — łatwa do ogarnięcia na tydzień.",
        tags: ["wyspa", "zatoki", "rodzinnie"], season: "maj–wrzesień",
      },
    ],
    sections: [
      {
        title: "Po czym poznać dobry kierunek plażowy",
        paragraphs: [
          "Sama obecność plaży to za mało. Najlepiej wypadają miejsca, w których plaża jest blisko bazy noclegowej, woda jest ciepła w wybranym miesiącu, a dojazd z lotniska nie zjada pół dnia.",
        ],
        bullets: [
          "temperatura wody i powietrza w konkretnym miesiącu, nie średnia roczna",
          "odległość hotelu od plaży i charakter wybrzeża",
          "czy chcesz samą plażę, czy plażę z opcją zwiedzania",
        ],
      },
      {
        title: "Jak zaplanować wyjazd nad morze",
        paragraphs: [
          "Dla wypoczynku plażowego zwykle najlepiej działa 5–7 dni — wtedy dojazd i aklimatyzacja nie zjadają całego urlopu. Wybierz kierunek z listy powyżej, sprawdź ceny hoteli blisko plaży i od razu zobacz, ile kosztuje lot w tym samym terminie.",
        ],
      },
    ],
    faq: [
      {
        question: "Który kierunek na plażę jest najlepszy na lato?",
        answer:
          "Latem dobrze sprawdzają się hiszpańskie wybrzeża (Costa del Sol, Walencja, Baleary) i Turcja — woda jest ciepła, a wybór hoteli największy. Poza szczytem sezonu warto patrzeć na Cypr i Algarve.",
      },
      {
        question: "Czy da się połączyć plażę ze zwiedzaniem?",
        answer:
          "Tak. Kierunki takie jak Malaga, Walencja czy Larnaka pozwalają rano być na plaży, a po południu zwiedzać miasto. To dobry wybór, gdy nie chcesz wyłącznie leżeć nad wodą.",
      },
      {
        question: "Kiedy rezerwować, żeby było taniej?",
        answer:
          "Najlepsze ceny hoteli i lotów łapie się zwykle 1,5–3 miesiące przed wyjazdem, a poza lipcem i sierpniem jest wyraźnie taniej przy podobnej pogodzie.",
      },
    ],
  },
  {
    slug: "city-break",
    chipKey: "city",
    label: "City break",
    icon: "🌃",
    aura: "from-indigo-400/30 via-fuchsia-300/20 to-emerald-300/25",
    eyebrow: "Miasto na krótko",
    h1: "City break — najlepsze miasta na krótki wyjazd z Polski",
    metaTitle: "City break — najlepsze miasta na weekend i 3–5 dni | HelpTravel",
    metaDescription:
      "Najlepsze city breaki z Polski: czytelne miasta na 2–5 dni z dobrym dojazdem. Porównaj kierunki, sprawdź ceny hoteli i lotów w PLN.",
    lead:
      "City break powinien być prosty: krótki lot, czytelny układ miasta i tyle do zrobienia, żeby 3–5 dni miało sens. Poniżej miasta, które najlepiej znoszą krótki wyjazd i nie wymagają skomplikowanej logistyki.",
    highlights: ["Idealne na 2–5 dni", "Dobry dojazd z lotniska", "Architektura, kuchnia, klimat"],
    gridIntro: "Miasta, w których w 2–5 dni zobaczysz dużo bez biegania od atrakcji do atrakcji:",
    picks: [
      {
        name: "Praga", searchCity: "Prague", country: "Czechia", countryPl: "Czechy", slug: "prague-czechia",
        region: "Czechy",
        overview: "Blisko, klimatycznie i bez wielkiej logistyki — jeden z najpewniejszych weekendów w Europie.",
        tags: ["blisko", "weekend", "stare miasto"], season: "kwiecień–czerwiec, wrzesień–październik",
      },
      {
        name: "Budapeszt", searchCity: "Budapest", country: "Hungary", countryPl: "Węgry", slug: "budapest-hungary",
        region: "Węgry",
        overview: "Najlepsza relacja ceny do jakości wśród stolic regionu, do tego termy i panorama Dunaju.",
        tags: ["termy", "cena/jakość", "wieczory"], season: "cały rok",
      },
      {
        name: "Barcelona", searchCity: "Barcelona", country: "Spain", countryPl: "Hiszpania", slug: "barcelona-spain",
        region: "Katalonia",
        overview: "Architektura Gaudiego, gastronomia i plaża w jednym mieście — intensywnie, ale bardzo atrakcyjnie.",
        tags: ["Gaudí", "design", "plaża"], season: "kwiecień–czerwiec, wrzesień",
      },
      {
        name: "Lizbona", searchCity: "Lisbon", country: "Portugal", countryPl: "Portugalia", slug: "lisbon-portugal",
        region: "Portugalia",
        overview: "Wzgórza, tramwaje i punkty widokowe — miasto o mocnym klimacie, które dobrze się pamięta.",
        tags: ["klimat", "widoki", "jedzenie"], season: "wiosna i jesień",
      },
      {
        name: "Wiedeń", searchCity: "Vienna", country: "Austria", countryPl: "Austria",
        region: "Austria",
        overview: "Eleganckie muzea, pałace i kawiarnie — uporządkowany city break, który działa o każdej porze roku.",
        tags: ["muzea", "kawiarnie", "elegancko"], season: "cały rok",
      },
      {
        name: "Porto", searchCity: "Porto", country: "Portugal", countryPl: "Portugalia",
        region: "Dolina Douro",
        overview: "Wino, mosty nad Douro i klimatyczne uliczki — kameralna alternatywa dla Lizbony.",
        tags: ["wino", "klimat", "niedrogo"], season: "wiosna–jesień",
      },
    ],
    sections: [
      {
        title: "Co sprawia, że city break naprawdę działa",
        paragraphs: [
          "Najmocniejsze kierunki na krótki wyjazd to te, w których najwięcej zobaczysz pieszo, a baza noclegowa w centrum nie kosztuje fortuny. Im mniej czasu tracisz na dojazdy, tym więcej zostaje na samo miasto.",
        ],
        bullets: [
          "zwarte centrum, w którym da się chodzić pieszo",
          "krótki transfer z lotniska do centrum",
          "miks zabytków, gastronomii i klimatu dzielnic",
        ],
      },
      {
        title: "Ile dni zaplanować",
        paragraphs: [
          "Na weekend dobrze działają Praga i Budapeszt — blisko i czytelnie. Przy 4–5 dniach warto pomyśleć o większych miastach jak Barcelona czy Lizbona, gdzie jest co robić bez pośpiechu.",
        ],
      },
    ],
    faq: [
      {
        question: "Jaki city break jest dobry na pierwszy raz?",
        answer:
          "Budapeszt i Praga są bezpiecznym wyborem: blisko, tanio i prosto logistycznie. Dają mocny efekt już przy 2–3 dniach.",
      },
      {
        question: "Czy na city break trzeba wynajmować samochód?",
        answer:
          "Najczęściej nie. W dobrym mieście na city break wszystko najważniejsze obejdziesz pieszo lub transportem miejskim.",
      },
      {
        question: "Weekend czy 4–5 dni?",
        answer:
          "Praga, Budapeszt i Wiedeń sprawdzają się już na 2–3 dni. Barcelona, Lizbona i Porto wynagradzają dłuższy pobyt, bo mają więcej do zaoferowania.",
      },
    ],
  },
  {
    slug: "gory",
    chipKey: "mountains",
    label: "Góry i natura",
    icon: "🏔️",
    aura: "from-emerald-500/30 via-teal-300/20 to-sky-300/25",
    eyebrow: "Góry, szlaki i krajobraz",
    h1: "Góry i natura — kierunki na aktywny wyjazd z Polski",
    metaTitle: "Wyjazd w góry — kierunki na narty, szlaki i krajobraz | HelpTravel",
    metaDescription:
      "Kierunki w góry i naturę z Polski: Alpy, fiordy, wulkany i szlaki. Narty zimą, trekking latem. Sprawdź ceny hoteli i lotów w PLN dla każdego kierunku.",
    lead:
      "Nie każdy wyjazd musi być o plaży albo mieście. Jeśli wolisz góry, szlaki, fiordy i punkty widokowe, poniżej znajdziesz prawdziwie górskie i przyrodnicze kierunki w zasięgu krótkiego lotu z Polski — od Alp po wulkany i fiordy.",
    highlights: ["Alpy, fiordy i wulkany", "Narty zimą / trekking latem", "Krajobraz zamiast tłumów"],
    gridIntro: "Kierunki dla osób, które w górach i naturze czują się lepiej niż na leżaku:",
    picks: [
      {
        name: "Innsbruck", searchCity: "Innsbruck", country: "Austria", countryPl: "Austria",
        region: "Alpy Tyrolskie",
        overview: "Miasto w sercu Alp z wyciągami tuż za rogatkami: zimą narty, latem szlaki i kolejki na granie.",
        tags: ["Alpy", "narty", "szlaki"], season: "zima (narty) / lato (trekking)",
      },
      {
        name: "Teneryfa (Teide)", searchCity: "Santa Cruz de Tenerife", country: "Spain", countryPl: "Hiszpania",
        region: "Wyspy Kanaryjskie",
        overview: "Najwyższy szczyt Hiszpanii — wulkan Teide — i krajobrazy jak z innej planety, dostępne cały rok.",
        tags: ["wulkan Teide", "park narodowy", "całoroczne"], season: "cały rok",
      },
      {
        name: "Madera (Funchal)", searchCity: "Funchal", country: "Portugal", countryPl: "Portugalia", slug: "funchal-portugal",
        region: "Madera",
        overview: "Wulkaniczne szczyty, szlaki wzdłuż lewad i wieczna wiosna — raj dla chodzenia po górach nad oceanem.",
        tags: ["lewady", "szczyty", "natura"], season: "cały rok",
      },
      {
        name: "Tirana", searchCity: "Tirana", country: "Albania", countryPl: "Albania", slug: "tirana-albania",
        region: "Alpy Albańskie",
        overview: "Brama w dzikie Alpy Albańskie i kanion Osumi — tanio, surowo i wciąż mało oblegane.",
        tags: ["Alpy Albańskie", "tanio", "dziko"], season: "maj–październik",
      },
      {
        name: "Bergen", searchCity: "Bergen", country: "Norway", countryPl: "Norwegia",
        region: "Fiordy Norwegii",
        overview: "Najlepszy punkt startowy do norweskich fiordów: rejsy, kolejki widokowe i krótkie szlaki nad miastem.",
        tags: ["fiordy", "rejsy", "widoki"], season: "maj–wrzesień",
      },
      {
        name: "Lublana", searchCity: "Ljubljana", country: "Slovenia", countryPl: "Słowenia",
        region: "Alpy Julijskie",
        overview: "Kompaktowa stolica u stóp Alp Julijskich — jezioro Bled i park Triglav są w zasięgu wycieczki.",
        tags: ["Alpy Julijskie", "Bled", "jeziora"], season: "maj–wrzesień / zima (narty)",
      },
    ],
    sections: [
      {
        title: "Czego szukać w wyjeździe w góry",
        paragraphs: [
          "Liczy się dostęp do gór bez wielkiej logistyki: baza, z której blisko do szlaków lub wyciągów, dobra pogoda w danym miesiącu i to, czy zależy Ci na nartach, trekkingu, czy spokojnych spacerach z widokami.",
        ],
        bullets: [
          "sezon: zima pod narty, lato i wczesna jesień pod szlaki",
          "czy potrzebujesz auta, żeby dojechać do tras",
          "wysokość i trudność szlaków vs. Twoja kondycja",
        ],
      },
      {
        title: "Jak zaplanować taki wyjazd",
        paragraphs: [
          "Dla aktywnego wypoczynku zwykle warto dać sobie 5–6 dni i — przy Alpach czy fiordach — rozważyć wynajem auta. Wybierz kierunek z listy, sprawdź ceny noclegów blisko interesujących Cię tras i porównaj loty w wybranym terminie.",
        ],
      },
    ],
    faq: [
      {
        question: "Gdzie polecieć z Polski na narty?",
        answer:
          "Najwygodniej w Alpy przez Innsbruck (Tyrol) albo w stronę Alp Julijskich przez Lublanę. Oba kierunki mają bezpośrednie lub krótkie połączenia i ośrodki blisko lotniska.",
      },
      {
        question: "A jeśli wolę góry latem, bez nart?",
        answer:
          "Wtedy mocno wygrywają Madera i Teneryfa (szlaki i wulkany dostępne cały rok), norweskie fiordy z Bergen oraz dzikie Alpy Albańskie z bazą w Tiranie.",
      },
      {
        question: "Czy taki wyjazd jest drogi?",
        answer:
          "Różnie. Alpy i Norwegia są droższe, ale Albania, Madera czy Teneryfa potrafią być bardzo rozsądne — szczególnie poza szczytem sezonu i przy wcześniejszej rezerwacji.",
      },
    ],
  },
  {
    slug: "kultura",
    chipKey: "culture",
    label: "Kultura",
    icon: "🏛️",
    aura: "from-amber-400/30 via-rose-300/20 to-indigo-300/25",
    eyebrow: "Zabytki i historia",
    h1: "Kultura i zabytki — kierunki dla miłośników historii",
    metaTitle: "Wyjazd kulturalny — miasta pełne zabytków i historii | HelpTravel",
    metaDescription:
      "Kierunki dla osób, które chcą zabytków, muzeów i historii: miasta z najmocniejszym profilem kulturalnym. Sprawdź ceny hoteli i lotów w PLN.",
    lead:
      "Jeśli wyjazd ma być przede wszystkim o zabytkach, muzeach i historii, poniżej znajdziesz kierunki z najmocniejszym profilem kulturalnym — miejsca, w których sam spacer po mieście jest już zwiedzaniem.",
    highlights: ["Zabytki i muzea", "Historyczne centra", "Idealne na 3–5 dni"],
    gridIntro: "Miasta, w których historia jest na każdym kroku, a najważniejsze miejsca leżą blisko siebie:",
    picks: [
      {
        name: "Rzym", searchCity: "Rome", country: "Italy", countryPl: "Włochy", slug: "rome-italy",
        region: "Lacjum",
        overview: "Koloseum, Watykan i Forum — najgęstsze nagromadzenie ikon w Europie, mocne już przy pierwszym wyjeździe.",
        tags: ["antyk", "Watykan", "ikony"], season: "marzec–maj, październik–listopad",
      },
      {
        name: "Ateny", searchCity: "Athens", country: "Greece", countryPl: "Grecja", slug: "athens-greece",
        region: "Attyka",
        overview: "Akropol i kolebka cywilizacji, do tego ciepło i lokalna kuchnia — historia z południowym klimatem.",
        tags: ["Akropol", "antyk", "ciepło"], season: "wiosna i jesień",
      },
      {
        name: "Stambuł", searchCity: "Istanbul", country: "Turkey", countryPl: "Turcja", slug: "istanbul-turkey",
        region: "Bosfor",
        overview: "Hagia Sophia, bazary i dwa kontynenty — intensywny kierunek dla osób, które lubią historię z energią.",
        tags: ["Bosfor", "bazary", "dwa kontynenty"], season: "kwiecień–czerwiec, wrzesień–listopad",
      },
      {
        name: "Berlin", searchCity: "Berlin", country: "Germany", countryPl: "Niemcy", slug: "berlin-germany",
        region: "Niemcy",
        overview: "Wyspa Muzeów i historia XX wieku w warstwach — kultura miejska bardziej niż klasyczne odhaczanie zabytków.",
        tags: ["muzea", "historia XX w.", "dzielnice"], season: "kwiecień–czerwiec, wrzesień–październik",
      },
      {
        name: "Neapol", searchCity: "Naples", country: "Italy", countryPl: "Włochy", slug: "naples-italy",
        region: "Kampania",
        overview: "Surowe, autentyczne miasto i baza pod Pompeje oraz Wezuwiusz — historia podana bez filtra.",
        tags: ["Pompeje", "pizza", "autentyczne"], season: "wiosna i jesień",
      },
      {
        name: "Lizbona", searchCity: "Lisbon", country: "Portugal", countryPl: "Portugalia", slug: "lisbon-portugal",
        region: "Portugalia",
        overview: "Klimatyczne dzielnice, klasztory i epoka wielkich odkryć — kultura w spokojniejszym, nastrojowym wydaniu.",
        tags: ["Belém", "klimat", "odkrycia"], season: "wiosna i jesień",
      },
    ],
    sections: [
      {
        title: "Jak wybrać kierunek pod zwiedzanie",
        paragraphs: [
          "Najlepiej wypadają miasta o gęstej, dobrze zachowanej tkance historycznej, gdzie najważniejsze miejsca leżą blisko siebie. Wtedy w 3–4 dni zobaczysz dużo bez biegania od atrakcji do atrakcji.",
        ],
        bullets: [
          "gęstość zabytków w obrębie centrum",
          "godziny otwarcia i konieczność rezerwacji wejść",
          "tempo, które zostawia czas na kawę i oddech",
        ],
      },
      {
        title: "Jak nie przesadzić z planem",
        paragraphs: [
          "Najczęstszy błąd przy wyjeździe kulturalnym to upchnięcie zbyt wielu atrakcji w jeden dzień. Lepiej wybrać 2–3 najważniejsze miejsca dziennie i zostawić przestrzeń na lokalny klimat.",
        ],
      },
    ],
    faq: [
      {
        question: "Które miasto ma najwięcej do zwiedzania?",
        answer:
          "Rzym, Stambuł i Ateny to klasyka pod zwiedzanie — gęsto upakowane ikony i historia. Na spokojniejszy klimat dobrze działają Lizbona i Neapol.",
      },
      {
        question: "Ile dni na wyjazd kulturalny?",
        answer:
          "Zwykle 3–5 dni. Krótszy wyjazd wystarczy na najważniejsze miejsca, dłuższy pozwala wejść głębiej bez pośpiechu.",
      },
      {
        question: "Czy warto kupować bilety do atrakcji z wyprzedzeniem?",
        answer:
          "Przy największych ikonach (Watykan, Akropol, Hagia Sophia) zdecydowanie tak — rezerwacja online oszczędza godziny w kolejkach, zwłaszcza w sezonie.",
      },
    ],
  },
  {
    slug: "budzet",
    chipKey: "budget",
    label: "Budżet",
    icon: "💰",
    aura: "from-emerald-400/30 via-lime-300/20 to-amber-200/25",
    eyebrow: "Dobra cena",
    h1: "Tanie kierunki z Polski — wyjazd w dobrym budżecie",
    metaTitle: "Tanie kierunki z Polski — najlepszy stosunek ceny do jakości | HelpTravel",
    metaDescription:
      "Kierunki z najlepszym stosunkiem ceny do jakości: niższe koszty noclegu i życia na miejscu bez schodzenia do najniższego standardu. Ceny hoteli i lotów w PLN.",
    lead:
      "Dobry budżetowy wyjazd to nie najniższa możliwa cyfra za wszelką cenę, tylko najlepszy stosunek ceny do jakości. Poniżej kierunki, w których za rozsądne pieniądze nadal dostaniesz sensowny standard i prosty plan.",
    highlights: ["Najlepszy stosunek ceny do jakości", "Niższe koszty na miejscu", "Krótkie loty z Polski"],
    gridIntro: "Kierunki, w których budżet idzie najdalej — bez schodzenia do najniższego standardu:",
    picks: [
      {
        name: "Budapeszt", searchCity: "Budapest", country: "Hungary", countryPl: "Węgry", slug: "budapest-hungary",
        region: "Węgry",
        overview: "Niski koszt życia, termy i panorama Dunaju — chyba najlepsza relacja ceny do jakości wśród stolic.",
        tags: ["tanio", "termy", "blisko"], season: "cały rok",
      },
      {
        name: "Tirana", searchCity: "Tirana", country: "Albania", countryPl: "Albania", slug: "tirana-albania",
        region: "Albania",
        overview: "Jeden z najtańszych kierunków w zasięgu lotu — mało oblegany i z poczuciem odkrywania nowego.",
        tags: ["najtaniej", "mniej tłumów", "nowe"], season: "kwiecień–październik",
      },
      {
        name: "Praga", searchCity: "Prague", country: "Czechia", countryPl: "Czechy", slug: "prague-czechia",
        region: "Czechy",
        overview: "Blisko i tanio na krótki wyjazd — większość atrakcji obejdziesz pieszo, co dodatkowo ogranicza koszty.",
        tags: ["blisko", "weekend", "pieszo"], season: "kwiecień–czerwiec, wrzesień–październik",
      },
      {
        name: "Ateny", searchCity: "Athens", country: "Greece", countryPl: "Grecja", slug: "athens-greece",
        region: "Grecja",
        overview: "Historia i ciepło w rozsądnej cenie — przy dobrym terminie wychodzi taniej niż większość stolic Zachodu.",
        tags: ["historia", "ciepło", "rozsądnie"], season: "wiosna i jesień",
      },
      {
        name: "Sofia", searchCity: "Sofia", country: "Bulgaria", countryPl: "Bułgaria",
        region: "Bułgaria",
        overview: "Niedrogo, blisko gór Witosza i z lokalnym klimatem — niedoceniana, tania stolica regionu.",
        tags: ["tanio", "góry obok", "lokalnie"], season: "maj–październik",
      },
      {
        name: "Porto", searchCity: "Porto", country: "Portugal", countryPl: "Portugalia",
        region: "Portugalia",
        overview: "Najbardziej opłacalne duże miasto Portugalii — wino, klimat i dobre jedzenie bez cen Lizbony.",
        tags: ["wino", "klimat", "opłacalnie"], season: "wiosna–jesień",
      },
    ],
    sections: [
      {
        title: "Jak dobrze wydać budżet",
        paragraphs: [
          "Najwięcej oszczędza dobrze dobrany termin i lokalizacja noclegu, a nie sam tani lot. Kierunki o niższym koszcie życia pozwalają jeść na mieście i korzystać z atrakcji bez nerwowego liczenia każdej złotówki.",
        ],
        bullets: [
          "koszt życia na miejscu, nie tylko cena lotu",
          "lokalizacja noclegu blisko tego, co Cię interesuje",
          "termin poza szczytem sezonu",
        ],
      },
      {
        title: "Na co uważać",
        paragraphs: [
          "Nie warto łączyć bardzo taniego lotu z bardzo słabym noclegiem daleko od centrum tylko po to, by zmieścić się w kwocie. Często lepszy jest prosty hotel blisko wszystkiego niż pozornie tańszy nocleg na obrzeżach.",
        ],
      },
    ],
    faq: [
      {
        question: "Jakie kierunki są najtańsze z Polski?",
        answer:
          "Budapeszt, Praga, Tirana, Sofia i Ateny zwykle dają najlepszą relację ceny do jakości — niski koszt życia i krótki lot.",
      },
      {
        question: "Czy tani wyjazd musi oznaczać niski standard?",
        answer:
          "Nie. Przy dobrym terminie i lokalizacji da się mieć rozsądny standard w niskim budżecie. Kluczowy jest wybór kierunku, w którym pieniądze idą dalej.",
      },
      {
        question: "Jak najbardziej obniżyć koszt wyjazdu?",
        answer:
          "Lecąc poza weekendem i poza szczytem sezonu, rezerwując z wyprzedzeniem i wybierając nocleg w dobrze skomunikowanej, ale nie najdroższej dzielnicy.",
      },
    ],
  },
  {
    slug: "slonce-zima",
    chipKey: "sun",
    label: "Słońce zimą",
    icon: "☀️",
    aura: "from-amber-400/35 via-orange-300/20 to-sky-300/25",
    eyebrow: "Ucieczka od zimy",
    h1: "Słońce zimą — gdzie polecieć z Polski po ciepło",
    metaTitle: "Słońce zimą — ciepłe kierunki na zimową ucieczkę z Polski | HelpTravel",
    metaDescription:
      "Gdzie polecieć zimą po słońce: najcieplejsze kierunki w grudniu, styczniu i lutym w zasięgu lotu z Polski. Sprawdź ceny hoteli i lotów w PLN.",
    lead:
      "Gdy w Polsce jest szaro i zimno, najmocniejszym powodem wyjazdu jest po prostu słońce i wyższa temperatura. Poniżej kierunki, które w grudniu, styczniu i lutym są najcieplejsze i najłatwiejsze do ogarnięcia z Polski.",
    highlights: ["Najcieplej w grudniu–lutym", "Ucieczka od polskiej zimy", "Bezpośrednie loty"],
    gridIntro: "Sześć kierunków, w których zimą realnie świeci słońce i da się chodzić bez kurtki:",
    picks: [
      {
        name: "Las Palmas", searchCity: "Las Palmas", country: "Spain", countryPl: "Hiszpania", slug: "las-palmas-spain",
        region: "Wyspy Kanaryjskie",
        overview: "Gran Canaria z najbardziej stabilną zimową pogodą — ok. 22°C w styczniu i plaża w centrum miasta.",
        tags: ["Kanary", "22°C w styczniu", "plaża"], season: "cały rok (mocna zima)",
      },
      {
        name: "Teneryfa", searchCity: "Santa Cruz de Tenerife", country: "Spain", countryPl: "Hiszpania",
        region: "Wyspy Kanaryjskie",
        overview: "Łagodna zima, plaże i wulkan Teide — można łączyć słońce nad morzem z górską wycieczką tego samego dnia.",
        tags: ["Kanary", "łagodna zima", "Teide"], season: "cały rok",
      },
      {
        name: "Agadir", searchCity: "Agadir", country: "Morocco", countryPl: "Maroko", slug: "agadir-morocco",
        region: "Maroko",
        overview: "Słoneczne wybrzeże Atlantyku z długą plażą — ciepło i tanio właśnie w sezonie polskiej zimy.",
        tags: ["plaża", "słońce", "tanio"], season: "październik–kwiecień",
      },
      {
        name: "Marrakesz", searchCity: "Marrakesh", country: "Morocco", countryPl: "Maroko", slug: "marrakesh-morocco",
        region: "Maroko",
        overview: "Egzotyczny kontrast wobec szarej Europy: ciepłe dnie, kolory medyny i bezwizowy wjazd.",
        tags: ["egzotyka", "medyna", "bez wizy"], season: "październik–kwiecień",
      },
      {
        name: "Larnaka", searchCity: "Larnaca", country: "Cyprus", countryPl: "Cypr", slug: "larnaca-cyprus",
        region: "Cypr",
        overview: "Najłagodniejsza zima we wschodniej części Morza Śródziemnego — słońce i spacery bez kurtki.",
        tags: ["łagodna zima", "słońce", "spokojnie"], season: "cały rok",
      },
      {
        name: "Valletta", searchCity: "Valletta", country: "Malta", countryPl: "Malta", slug: "valletta-malta",
        region: "Malta",
        overview: "Kompaktowa wyspa z łagodną zimą i mnóstwem słońca — idealna na krótką ucieczkę od chłodu.",
        tags: ["wyspa", "słońce zimą", "kompaktowo"], season: "cały rok",
      },
    ],
    sections: [
      {
        title: "Czego oczekiwać od zimowego słońca",
        paragraphs: [
          "Zimą nie chodzi o pełny sezon plażowy, tylko o łagodną pogodę, słońce i temperaturę, przy której da się chodzić bez kurtki. Najlepiej wypadają Wyspy Kanaryjskie i kierunki Afryki Północnej oraz wschodniej części Morza Śródziemnego.",
        ],
        bullets: [
          "średnia temperatura w grudniu, styczniu i lutym",
          "długość lotu — zimą warto zaakceptować nieco dłuższy",
          "czy zależy Ci na plaży, czy raczej na cieple i słońcu",
        ],
      },
      {
        title: "Jak zaplanować zimowy wyjazd po słońce",
        paragraphs: [
          "Na zimową ucieczkę zwykle dobrze działa 5–7 dni — wtedy dłuższy lot ma sens. Wybierz najcieplejszy kierunek z listy, sprawdź ceny hoteli i od razu porównaj loty w wybranym terminie.",
        ],
      },
    ],
    faq: [
      {
        question: "Gdzie jest najcieplej zimą w zasięgu lotu z Polski?",
        answer:
          "Najcieplejsze zimą są Wyspy Kanaryjskie (Las Palmas, Teneryfa) i Maroko (Agadir, Marrakesz), a w Europie — Cypr i Malta.",
      },
      {
        question: "Czy zimą da się tam jeszcze pływać?",
        answer:
          "Zależnie od kierunku. Na Kanarach i w Maroku często tak, choć woda bywa chłodna. Zwykle to bardziej wyjazd po słońce i ciepło niż klasyczne plażowanie.",
      },
      {
        question: "Jak długi jest lot na te kierunki?",
        answer:
          "Cypr i Malta to około 3 godziny, Maroko 3,5–4, a Wyspy Kanaryjskie 5–6 godzin. Zimą wiele osób akceptuje dłuższy lot w zamian za pewną, ciepłą pogodę.",
      },
    ],
  },
];

export function getMoodBySlug(slug: string): TravelMood | undefined {
  return TRAVEL_MOODS.find((m) => m.slug === slug);
}

export function getMoodSlugForChip(chipKey: string): string | undefined {
  return TRAVEL_MOODS.find((m) => m.chipKey === chipKey)?.slug;
}
