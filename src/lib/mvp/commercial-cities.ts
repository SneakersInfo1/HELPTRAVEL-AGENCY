// Commercial-intent landing pages for /hotele/w/[miasto].
//
// Targets high-volume Polish search queries like "hotele barcelona",
// "wakacje madryt", "tanie hotele rzym", "hotele antalya all inclusive".
// This is the revenue spine of the SEO funnel: we rank informational
// content well, but historically ZERO on commercial head terms — these
// pages exist to capture the buyers.
//
// Each entry maps a URL-safe slug (kebab-case PL nominative) to:
//   • destinationId — the slug used by `getAllDestinationProfiles()` /
//     `/kierunki/[slug]` (NOT always city-country: a few curated profiles
//     use legacy slugs, e.g. London is "london-uk"). This MUST match the
//     resolved profile slug or the page degrades (no hero/climate/flight).
//   • Polish declensions (locative/genitive) for natural H1s — "Hotele w
//     Barcelonie", not "Hotele w Barcelona".
//   • preposition — "w" (mainland) vs "na" (islands: "na Teneryfie"). All
//     current entries are "w"; the field is threaded through every
//     locative heading so an islands batch can be added without breaking
//     grammar.
//   • intro — 2-3 sentence UNIQUE editorial hook. This is the single most
//     important field: it differentiates each page from a templated
//     doorway page (and from its siblings), which is what keeps Google
//     from flagging "scanned, not indexed".
//   • neighborhoods — best areas to stay. Answers the high-intent "hotele
//     {miasto} centrum" / "gdzie się zatrzymać" query with genuinely
//     useful, unique-per-city content.
//   • aliasQueries — extra search-intent surface embedded in body copy.
//
// Adding a city: append here and ensure `destinationId` resolves via
// `getAllDestinationProfiles().find(d => d.slug === destinationId)`. The
// route at /src/app/hotele/w/[miasto] handles all slugs dynamically and
// `generateStaticParams` reads this list, so no route file changes needed.
// Approx. monthly PL search volumes (May 2026 keyword research) are noted
// per entry in `monthlySearchVolumePL` (used for analytics segmentation).

export interface CommercialNeighborhood {
  /** Local / official area name, e.g. "Eixample". */
  name: string;
  /** One-sentence Polish description: who it suits / what's nearby. */
  blurb: string;
}

export interface CommercialCity {
  slug: string; // url segment, e.g., "barcelona"
  destinationId: string; // resolved profile slug (see note above)
  cityNominative: string; // "Barcelona"
  cityLocative: string; // "Barcelonie" — after the preposition
  cityGenitive: string; // "Barcelony" — after "do" / "z"
  /** Accusative — used after "na" for island direction phrases ("na Kretę").
   *  Only needed when preposition === "na"; mainland uses cityGenitive after
   *  "do". */
  cityAccusative?: string;
  /** Preposition before the locative ("w Barcelonie" / "na Teneryfie"). */
  preposition: "w" | "na";
  countryNominative: string;
  countryLocative: string; // after "w" / "we"
  countryGenitive: string;
  /** 2-3 sentence unique editorial hook (anti-doorway, anti-duplicate). */
  intro: string;
  /** Best areas to stay — unique, high-intent "gdzie się zatrzymać" copy. */
  neighborhoods: CommercialNeighborhood[];
  /** Extra search queries this page should rank for. Embedded into body. */
  aliasQueries: string[];
  /** Approximate monthly Polish search volume for the head query. */
  monthlySearchVolumePL: number;
}

export const commercialCities: CommercialCity[] = [
  {
    slug: "barcelona",
    destinationId: "barcelona-spain",
    cityNominative: "Barcelona",
    cityLocative: "Barcelonie",
    cityGenitive: "Barcelony",
    preposition: "w",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Barcelona łączy plażę, architekturę Gaudíego i jedną z najlepszych scen kulinarnych w Europie. Hotele znajdziesz od tętniącego życiem centrum po spokojniejsze dzielnice nad morzem, a większość atrakcji obejdziesz pieszo lub metrem.",
    neighborhoods: [
      { name: "Eixample", blurb: "Szerokie aleje, modernistyczna architektura i Sagrada Família w spacerowym zasięgu; najwięcej hoteli 4* w dobrej cenie." },
      { name: "Barri Gòtic (Gotyk)", blurb: "Średniowieczne uliczki i klimat starego miasta tuż przy La Rambli — idealne na pierwszy pobyt." },
      { name: "Barceloneta", blurb: "Dzielnica przy plaży z owocami morza i promenadą — wybór, jeśli zależy Ci na kąpielach." },
      { name: "Gràcia", blurb: "Kameralne, lokalne place i niższe ceny, kwadrans od centrum." },
    ],
    aliasQueries: [
      "tanie hotele Barcelona",
      "noclegi Barcelona",
      "hotele Barcelona centrum",
      "wakacje Barcelona 2026",
      "tanie loty Barcelona",
    ],
    monthlySearchVolumePL: 33000,
  },
  {
    slug: "madryt",
    destinationId: "madrid-spain",
    cityNominative: "Madryt",
    cityLocative: "Madrycie",
    cityGenitive: "Madrytu",
    preposition: "w",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Madryt to hiszpańska stolica sztuki (Prado, Reina Sofía), tarasów i nocnego życia, które nie zwalnia do świtu. Hotele w centrum stawiają Cię w spacerowym zasięgu większości muzeów i placów.",
    neighborhoods: [
      { name: "Sol / Centro", blurb: "Geograficzne serce miasta, blisko Puerta del Sol i Gran Vía — najwygodniej na zwiedzanie." },
      { name: "Salamanca", blurb: "Eleganckie, bezpieczne i butikowe; ekskluzywne sklepy i spokojne wieczory." },
      { name: "Malasaña", blurb: "Modna, młoda dzielnica z barami i muzyką — dla szukających klimatu." },
      { name: "La Latina", blurb: "Tapas i niedzielny targ El Rastro — najbardziej autentyczny Madryt." },
    ],
    aliasQueries: [
      "hotele Madryt centrum",
      "noclegi w Madrycie",
      "tanie hotele Madryt",
      "wakacje Madryt 2026",
    ],
    monthlySearchVolumePL: 14000,
  },
  {
    slug: "rzym",
    destinationId: "rome-italy",
    cityNominative: "Rzym",
    cityLocative: "Rzymie",
    cityGenitive: "Rzymu",
    preposition: "w",
    countryNominative: "Włochy",
    countryLocative: "we Włoszech",
    countryGenitive: "Włoch",
    intro:
      "Rzym to muzeum pod gołym niebem — Koloseum, Watykan i fontanny w odległości spaceru. Hotel blisko centrum historycznego pozwala zwiedzać bez tracenia czasu na dojazdy.",
    neighborhoods: [
      { name: "Centro Storico", blurb: "Panteon, Piazza Navona i Fontanna di Trevi za rogiem — najlepszy wybór na krótki pobyt." },
      { name: "Trastevere", blurb: "Brukowane uliczki, trattorie i wieczorny gwar — romantycznie i klimatycznie." },
      { name: "Monti", blurb: "Modna dzielnica tuż przy Koloseum, z winiarniami i butikami." },
      { name: "Prati / Watykan", blurb: "Spokojnie i blisko Muzeów Watykańskich, dobre ceny jak na centrum." },
    ],
    aliasQueries: [
      "hotele Rzym centrum",
      "noclegi Rzym",
      "tanie hotele Rzym",
      "wakacje Rzym 2026",
      "tanie loty Rzym",
    ],
    monthlySearchVolumePL: 28000,
  },
  {
    slug: "paryz",
    destinationId: "paris-france",
    cityNominative: "Paryż",
    cityLocative: "Paryżu",
    cityGenitive: "Paryża",
    preposition: "w",
    countryNominative: "Francja",
    countryLocative: "Francji",
    countryGenitive: "Francji",
    intro:
      "Paryż to bulwary, muzea światowej klasy i kawiarniany rytm dnia. Hotele od Marais po Saint-Germain stawiają Cię w sercu miasta, z metrem do każdej atrakcji.",
    neighborhoods: [
      { name: "Le Marais", blurb: "Modny, historyczny i pełen galerii — centralnie, blisko Centre Pompidou." },
      { name: "Saint-Germain-des-Prés", blurb: "Literackie kawiarnie i eleganckie uliczki lewego brzegu Sekwany." },
      { name: "Montmartre", blurb: "Bazylika Sacré-Cœur i artystyczny klimat z widokiem na całe miasto." },
      { name: "Quartier Latin", blurb: "Studencka energia, blisko Notre-Dame i Ogrodu Luksemburskiego." },
    ],
    aliasQueries: [
      "hotele Paryż centrum",
      "noclegi w Paryżu",
      "tanie hotele Paryż",
      "wakacje Paryż 2026",
    ],
    monthlySearchVolumePL: 25000,
  },
  {
    slug: "londyn",
    destinationId: "london-uk",
    cityNominative: "Londyn",
    cityLocative: "Londynie",
    cityGenitive: "Londynu",
    preposition: "w",
    countryNominative: "Wielka Brytania",
    countryLocative: "Wielkiej Brytanii",
    countryGenitive: "Wielkiej Brytanii",
    intro:
      "Londyn to bezpłatne muzea światowej klasy, zielone parki i dzielnice o własnym charakterze. Hotel blisko centrum i stacji metra wyraźnie skraca dojazdy w tym ogromnym mieście.",
    neighborhoods: [
      { name: "Westminster / South Bank", blurb: "Big Ben, London Eye i Tamiza za oknem — turystyczne serce miasta." },
      { name: "Soho / Covent Garden", blurb: "Teatry, restauracje i nocne życie w centrum West Endu." },
      { name: "Kensington", blurb: "Spokojnie i elegancko, blisko muzeów i Hyde Parku." },
      { name: "Shoreditch", blurb: "Modny wschód miasta: street art, markety i bary." },
    ],
    aliasQueries: [
      "hotele Londyn centrum",
      "noclegi Londyn",
      "tanie hotele Londyn",
      "wakacje Londyn 2026",
    ],
    monthlySearchVolumePL: 19000,
  },
  {
    slug: "dubaj",
    destinationId: "dubai-united-arab-emirates",
    cityNominative: "Dubaj",
    cityLocative: "Dubaju",
    cityGenitive: "Dubaju",
    preposition: "w",
    countryNominative: "Zjednoczone Emiraty Arabskie",
    countryLocative: "Zjednoczonych Emiratach Arabskich",
    countryGenitive: "Zjednoczonych Emiratów Arabskich",
    intro:
      "Dubaj łączy plaże nad Zatoką Perską, najwyższe wieżowce świata i całoroczne słońce. Hotele od luksusowych kurortów przy plaży po centrum miasta — niemal wszystkie z wysokim standardem.",
    neighborhoods: [
      { name: "Dubai Marina", blurb: "Wieżowce, mariny i restauracje nad wodą; blisko plaży JBR." },
      { name: "Downtown Dubai", blurb: "Burj Khalifa i Dubai Mall w zasięgu spaceru." },
      { name: "Jumeirah / JBR", blurb: "Hotele przy plaży, idealne na wypoczynek nad morzem." },
      { name: "Deira / Bur Dubai", blurb: "Stary Dubaj, tradycyjne souki i niższe ceny noclegów." },
    ],
    aliasQueries: [
      "hotele Dubaj all inclusive",
      "wakacje Dubaj 2026",
      "tanie loty Dubaj",
      "noclegi Dubaj",
    ],
    monthlySearchVolumePL: 22000,
  },
  {
    slug: "stambul",
    destinationId: "istanbul-turkey",
    cityNominative: "Stambuł",
    cityLocative: "Stambule",
    cityGenitive: "Stambułu",
    preposition: "w",
    countryNominative: "Turcja",
    countryLocative: "Turcji",
    countryGenitive: "Turcji",
    intro:
      "Stambuł rozpięty między Europą a Azją to meczety, bazary i Bosfor. Hotele w Sultanahmet i Beyoğlu stawiają Cię w środku tej tysiącletniej historii.",
    neighborhoods: [
      { name: "Sultanahmet", blurb: "Hagia Sophia, Błękitny Meczet i Topkapı na wyciągnięcie ręki — turystyczne serce." },
      { name: "Beyoğlu / Taksim", blurb: "Nowoczesna część miasta, ulica İstiklal, kawiarnie i nocne życie." },
      { name: "Karaköy", blurb: "Modna dzielnica nad Bosforem z galeriami i dobrą kawą." },
      { name: "Kadıköy", blurb: "Azjatycka strona, lokalny klimat i niższe ceny." },
    ],
    aliasQueries: [
      "hotele Stambuł centrum",
      "noclegi Stambuł",
      "tanie hotele Stambuł",
      "wakacje Stambuł 2026",
    ],
    monthlySearchVolumePL: 16000,
  },
  {
    slug: "lizbona",
    destinationId: "lisbon-portugal",
    cityNominative: "Lizbona",
    cityLocative: "Lizbonie",
    cityGenitive: "Lizbony",
    preposition: "w",
    countryNominative: "Portugalia",
    countryLocative: "Portugalii",
    countryGenitive: "Portugalii",
    intro:
      "Lizbona to siedem wzgórz, żółte tramwaje i światło, w którym łatwo się zakochać. Hotele od Baixy po Alfamę pozwalają zwiedzać miasto pieszo, z przerwą na pastéis de nata.",
    neighborhoods: [
      { name: "Baixa / Chiado", blurb: "Centralnie, eleganckie place i sklepy, blisko wszystkiego." },
      { name: "Alfama", blurb: "Najstarsza dzielnica, fado i wąskie uliczki z widokiem na rzekę." },
      { name: "Bairro Alto", blurb: "Nocne życie i bary — klimatyczne, ale głośniejsze wieczory." },
      { name: "Belém", blurb: "Spokojnie, nad rzeką Tag i blisko najsłynniejszych zabytków." },
    ],
    aliasQueries: [
      "hotele Lizbona centrum",
      "noclegi Lizbona",
      "tanie hotele Lizbona",
      "wakacje Lizbona 2026",
    ],
    monthlySearchVolumePL: 11000,
  },
  {
    slug: "ateny",
    destinationId: "athens-greece",
    cityNominative: "Ateny",
    cityLocative: "Atenach",
    cityGenitive: "Aten",
    preposition: "w",
    countryNominative: "Grecja",
    countryLocative: "Grecji",
    countryGenitive: "Grecji",
    intro:
      "Ateny to kolebka cywilizacji — Akropol góruje nad miastem pełnym tawern i targów. Hotele w Plaka i Monastiraki stawiają antyczne zabytki w spacerowym zasięgu.",
    neighborhoods: [
      { name: "Plaka", blurb: "Najstarsza dzielnica pod Akropolem — malownicza, choć turystyczna." },
      { name: "Monastiraki", blurb: "Targi staroci, tawerny i widok na Akropol z dachów." },
      { name: "Koukaki", blurb: "Modna, lokalna okolica tuż przy Muzeum Akropolu." },
      { name: "Syntagma", blurb: "Centralnie, blisko metra i parlamentu — najwygodniejsze dojazdy." },
    ],
    aliasQueries: [
      "hotele Ateny centrum",
      "noclegi Ateny",
      "tanie hotele Ateny",
      "wakacje Ateny 2026",
    ],
    monthlySearchVolumePL: 12000,
  },
  {
    slug: "praga",
    destinationId: "prague-czechia",
    cityNominative: "Praga",
    cityLocative: "Pradze",
    cityGenitive: "Pragi",
    preposition: "w",
    countryNominative: "Czechy",
    countryLocative: "Czechach",
    countryGenitive: "Czech",
    intro:
      "Praga to bajkowe stare miasto, most Karola i jedne z najlepszych piw na świecie — wszystko w zasięgu spaceru. Hotel blisko Rynku Starego Miasta pozwala zwiedzać bez dojazdów.",
    neighborhoods: [
      { name: "Staré Město (Stare Miasto)", blurb: "Rynek, zegar astronomiczny i most Karola za rogiem." },
      { name: "Malá Strana", blurb: "Pod Zamkiem Praskim — barokowe uliczki i ogrody." },
      { name: "Nové Město (Nowe Miasto)", blurb: "Plac Wacława, sklepy i dobre ceny noclegów." },
      { name: "Vinohrady", blurb: "Eleganckie, lokalne kawiarnie, 10 minut od centrum." },
    ],
    aliasQueries: [
      "hotele Praga centrum",
      "noclegi Praga",
      "tanie hotele Praga",
      "wakacje Praga 2026",
    ],
    monthlySearchVolumePL: 21000,
  },
  {
    slug: "wieden",
    destinationId: "vienna-austria",
    cityNominative: "Wiedeń",
    cityLocative: "Wiedniu",
    cityGenitive: "Wiednia",
    preposition: "w",
    countryNominative: "Austria",
    countryLocative: "Austrii",
    countryGenitive: "Austrii",
    intro:
      "Wiedeń to cesarska architektura, kawiarniana tradycja i muzyka klasyczna na każdym kroku. Hotele w centrum stawiają pałace i opery w spacerowym zasięgu.",
    neighborhoods: [
      { name: "Innere Stadt (Centrum)", blurb: "Katedra św. Szczepana, opera i pałace — turystyczne serce." },
      { name: "Leopoldstadt", blurb: "Blisko centrum przez kanał, park Prater i dobre ceny." },
      { name: "Mariahilf", blurb: "Zakupowa ulica Mariahilfer Straße i modne kawiarnie." },
      { name: "Neubau", blurb: "Artystyczna dzielnica muzeów (MuseumsQuartier) i butików." },
    ],
    aliasQueries: [
      "hotele Wiedeń centrum",
      "noclegi Wiedeń",
      "tanie hotele Wiedeń",
      "wakacje Wiedeń 2026",
    ],
    monthlySearchVolumePL: 14000,
  },
  {
    slug: "mediolan",
    destinationId: "milan-italy",
    cityNominative: "Mediolan",
    cityLocative: "Mediolanie",
    cityGenitive: "Mediolanu",
    preposition: "w",
    countryNominative: "Włochy",
    countryLocative: "we Włoszech",
    countryGenitive: "Włoch",
    intro:
      "Mediolan to stolica włoskiej mody, gotycka katedra Duomo i „Ostatnia Wieczerza” da Vinci. Hotel blisko centrum daje szybki dostęp do zakupów, sztuki i dworca.",
    neighborhoods: [
      { name: "Centro / Duomo", blurb: "Katedra, Galeria Vittorio Emanuele i La Scala — w sercu miasta." },
      { name: "Brera", blurb: "Artystyczna dzielnica z galeriami i klimatycznymi restauracjami." },
      { name: "Navigli", blurb: "Kanały, aperitivo i nocne życie nad wodą." },
      { name: "Porta Nuova", blurb: "Nowoczesne wieżowce, blisko dworca Garibaldi." },
    ],
    aliasQueries: [
      "hotele Mediolan centrum",
      "noclegi Mediolan",
      "tanie hotele Mediolan",
      "wakacje Mediolan 2026",
    ],
    monthlySearchVolumePL: 13000,
  },
  {
    slug: "wenecja",
    destinationId: "venice-italy",
    cityNominative: "Wenecja",
    cityLocative: "Wenecji",
    cityGenitive: "Wenecji",
    preposition: "w",
    countryNominative: "Włochy",
    countryLocative: "we Włoszech",
    countryGenitive: "Włoch",
    intro:
      "Wenecja to miasto na wodzie — kanały zamiast ulic, gondole i plac św. Marka. Hotel na głównej wyspie pozwala poczuć miasto wieczorem, gdy znikają jednodniowi turyści.",
    neighborhoods: [
      { name: "San Marco", blurb: "Plac św. Marka i Pałac Dożów — najbardziej prestiżowo i centralnie." },
      { name: "Cannaregio", blurb: "Lokalny klimat, mniej tłoczno, dobre ceny i bary „bacari”." },
      { name: "Dorsoduro", blurb: "Galerie sztuki, studencki gwar i piękne kanały." },
      { name: "San Polo", blurb: "Most Rialto i targ rybny w samym sercu miasta." },
    ],
    aliasQueries: [
      "hotele Wenecja centrum",
      "noclegi Wenecja",
      "tanie hotele Wenecja",
      "wakacje Wenecja 2026",
    ],
    monthlySearchVolumePL: 15000,
  },
  {
    slug: "florencja",
    destinationId: "florence-italy",
    cityNominative: "Florencja",
    cityLocative: "Florencji",
    cityGenitive: "Florencji",
    preposition: "w",
    countryNominative: "Włochy",
    countryLocative: "we Włoszech",
    countryGenitive: "Włoch",
    intro:
      "Florencja to kolebka renesansu — Galeria Uffizi, Dawid Michała Anioła i kopuła katedry. Zwartą starówkę obejdziesz pieszo, dlatego hotel w centrum to oczywisty wybór.",
    neighborhoods: [
      { name: "Centro Storico", blurb: "Katedra, Ponte Vecchio i Uffizi w spacerowym zasięgu." },
      { name: "Oltrarno", blurb: "Drugi brzeg Arno, warsztaty rzemieślnicze i Pałac Pitti." },
      { name: "Santa Croce", blurb: "Klimatyczne place i życie nocne, blisko zabytków." },
      { name: "San Marco", blurb: "Spokojniej, tuż przy Galerii Akademii (Dawid)." },
    ],
    aliasQueries: [
      "hotele Florencja centrum",
      "noclegi Florencja",
      "tanie hotele Florencja",
      "wakacje Florencja 2026",
    ],
    monthlySearchVolumePL: 10000,
  },
  {
    slug: "neapol",
    destinationId: "naples-italy",
    cityNominative: "Neapol",
    cityLocative: "Neapolu",
    cityGenitive: "Neapolu",
    preposition: "w",
    countryNominative: "Włochy",
    countryLocative: "we Włoszech",
    countryGenitive: "Włoch",
    intro:
      "Neapol to żywiołowe miasto u stóp Wezuwiusza — ojczyzna pizzy i brama do Pompejów oraz Capri. Hotel blisko centrum i nabrzeża łączy zwiedzanie z wypadami nad morze.",
    neighborhoods: [
      { name: "Centro Storico", blurb: "Tętniące życiem stare miasto, pizzerie i zabytki UNESCO." },
      { name: "Lungomare / Chiaia", blurb: "Elegancka promenada nad morzem z widokiem na Wezuwiusz." },
      { name: "Vomero", blurb: "Spokojna dzielnica na wzgórzu z widokami i fortem." },
      { name: "Mergellina", blurb: "Port i restauracje rybne, blisko promów na wyspy." },
    ],
    aliasQueries: [
      "hotele Neapol centrum",
      "noclegi Neapol",
      "tanie hotele Neapol",
      "wakacje Neapol 2026",
    ],
    monthlySearchVolumePL: 8000,
  },
  {
    slug: "amsterdam",
    destinationId: "amsterdam-netherlands",
    cityNominative: "Amsterdam",
    cityLocative: "Amsterdamie",
    cityGenitive: "Amsterdamu",
    preposition: "w",
    countryNominative: "Holandia",
    countryLocative: "Holandii",
    countryGenitive: "Holandii",
    intro:
      "Amsterdam to kanały wpisane na listę UNESCO, rowery i muzea światowej klasy. Hotel w obrębie kanałów daje najkrótszą drogę do muzeów i klimatycznych uliczek.",
    neighborhoods: [
      { name: "Centrum / Grachtengordel", blurb: "Pas kanałów, blisko dworca i głównych atrakcji." },
      { name: "Jordaan", blurb: "Klimatyczna, butikowa dzielnica z kawiarniami i galeriami." },
      { name: "De Pijp", blurb: "Modna okolica, targ Albert Cuyp i restauracje." },
      { name: "Museumkwartier", blurb: "Rijksmuseum i Van Gogh Museum za rogiem, spokojnie." },
    ],
    aliasQueries: [
      "hotele Amsterdam centrum",
      "noclegi Amsterdam",
      "tanie hotele Amsterdam",
      "wakacje Amsterdam 2026",
    ],
    monthlySearchVolumePL: 16000,
  },
  {
    slug: "porto",
    destinationId: "porto-portugal",
    cityNominative: "Porto",
    cityLocative: "Porto",
    cityGenitive: "Porto",
    preposition: "w",
    countryNominative: "Portugalia",
    countryLocative: "Portugalii",
    countryGenitive: "Portugalii",
    intro:
      "Porto to malownicze nabrzeże Ribeira, piwnice z winem porto i mosty nad Douro. Zwartą starówkę zwiedzisz pieszo, a hotele nad rzeką oferują najlepsze widoki.",
    neighborhoods: [
      { name: "Ribeira", blurb: "Kolorowe nabrzeże nad Douro, wpisane na listę UNESCO." },
      { name: "Baixa / Centrum", blurb: "Dworzec São Bento, sklepy i blisko wszystkiego." },
      { name: "Vila Nova de Gaia", blurb: "Piwnice z winem porto i panorama miasta z drugiego brzegu." },
      { name: "Cedofeita", blurb: "Artystyczna, modna dzielnica z galeriami." },
    ],
    aliasQueries: [
      "hotele Porto centrum",
      "noclegi Porto",
      "tanie hotele Porto",
      "wakacje Porto 2026",
    ],
    monthlySearchVolumePL: 9000,
  },
  {
    slug: "malaga",
    destinationId: "malaga-spain",
    cityNominative: "Malaga",
    cityLocative: "Maladze",
    cityGenitive: "Malagi",
    preposition: "w",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Malaga to słoneczna brama Costa del Sol — plaże, starówka i muzeum Picassa w jednym. Hotele blisko centrum i nadmorskiej promenady łączą zwiedzanie z plażowaniem.",
    neighborhoods: [
      { name: "Centro Histórico", blurb: "Katedra, muzeum Picassa i tarasy w sercu miasta." },
      { name: "La Malagueta", blurb: "Miejska plaża i promenada tuż przy centrum." },
      { name: "Soho", blurb: "Artystyczna dzielnica z muralami i restauracjami." },
      { name: "Pedregalejo", blurb: "Klimatyczna, nadmorska okolica z barami rybnymi (chiringuito)." },
    ],
    aliasQueries: [
      "hotele Malaga centrum",
      "hotele Costa del Sol",
      "noclegi Malaga",
      "tanie hotele Malaga",
      "wakacje Malaga 2026",
    ],
    monthlySearchVolumePL: 10000,
  },
  {
    slug: "walencja",
    destinationId: "valencia-spain",
    cityNominative: "Walencja",
    cityLocative: "Walencji",
    cityGenitive: "Walencji",
    preposition: "w",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Walencja łączy futurystyczne Miasto Sztuki i Nauki, piaszczyste plaże i ojczyznę paelli. Hotele od starówki po dzielnicę przy plaży dopasujesz do stylu wyjazdu.",
    neighborhoods: [
      { name: "Ciutat Vella (Stare Miasto)", blurb: "Katedra, targ Mercado Central i wąskie uliczki." },
      { name: "Ruzafa", blurb: "Modna dzielnica z tapas, barami i klimatem." },
      { name: "El Cabanyal / Playa", blurb: "Przy plaży Malvarrosa, dawna dzielnica rybacka." },
      { name: "L'Eixample", blurb: "Eleganckie kamienice, spokojnie i centralnie." },
    ],
    aliasQueries: [
      "hotele Walencja centrum",
      "noclegi Walencja",
      "tanie hotele Walencja",
      "wakacje Walencja 2026",
    ],
    monthlySearchVolumePL: 8000,
  },
  {
    slug: "sewilla",
    destinationId: "seville-spain",
    cityNominative: "Sewilla",
    cityLocative: "Sewilli",
    cityGenitive: "Sewilli",
    preposition: "w",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Sewilla to dusza Andaluzji — flamenco, Alkazar i największa gotycka katedra świata. Zwartą starówkę zwiedzisz pieszo, dlatego hotel w centrum to najlepszy wybór.",
    neighborhoods: [
      { name: "Santa Cruz", blurb: "Dawna dzielnica żydowska, klimatyczne patia tuż przy katedrze." },
      { name: "Centro / Alfalfa", blurb: "Sercem miasta, blisko zabytków i barów tapas." },
      { name: "Triana", blurb: "Dzielnica flamenco i ceramiki za rzeką Gwadalkiwir." },
      { name: "Alameda", blurb: "Modna, młoda okolica z barami i muzyką." },
    ],
    aliasQueries: [
      "hotele Sewilla centrum",
      "noclegi Sewilla",
      "tanie hotele Sewilla",
      "wakacje Sewilla 2026",
    ],
    monthlySearchVolumePL: 7000,
  },
  {
    slug: "antalya",
    destinationId: "antalya-turkey",
    cityNominative: "Antalya",
    cityLocative: "Antalyi",
    cityGenitive: "Antalyi",
    preposition: "w",
    countryNominative: "Turcja",
    countryLocative: "Turcji",
    countryGenitive: "Turcji",
    intro:
      "Antalya to stolica tureckiej riwiery — szerokie plaże, oferty all inclusive i zabytkowe stare miasto Kaleiçi. Hotele od kurortów przy plaży po centrum dopasujesz do budżetu i stylu.",
    neighborhoods: [
      { name: "Kaleiçi (Stare Miasto)", blurb: "Klimatyczne uliczki, port jachtowy i butikowe hotele." },
      { name: "Lara", blurb: "Pas luksusowych kurortów all inclusive przy długiej plaży." },
      { name: "Konyaaltı", blurb: "Plaża pod górami, bliżej centrum i lokalnego życia." },
      { name: "Belek", blurb: "Resorty i pola golfowe na wschód od miasta." },
    ],
    aliasQueries: [
      "hotele Antalya all inclusive",
      "wakacje Antalya 2026",
      "tanie loty Antalya",
      "noclegi Antalya",
    ],
    monthlySearchVolumePL: 18000,
  },
  {
    slug: "hurghada",
    destinationId: "hurghada-egypt",
    cityNominative: "Hurghada",
    cityLocative: "Hurghadzie",
    cityGenitive: "Hurghady",
    preposition: "w",
    countryNominative: "Egipt",
    countryLocative: "Egipcie",
    countryGenitive: "Egiptu",
    intro:
      "Hurghada to całoroczne słońce nad Morzem Czerwonym, rafy koralowe i resorty all inclusive w dobrej cenie. Hotele od centrum po ciche zatoki dopasujesz do snorkelingu i wypoczynku.",
    neighborhoods: [
      { name: "Sakkala", blurb: "Centrum z restauracjami, blisko mariny i życia nocnego." },
      { name: "El Dahar", blurb: "Stare miasto, lokalny bazar i niższe ceny." },
      { name: "Sahl Hasheesh", blurb: "Spokojna, elegancka zatoka z dużymi resortami." },
      { name: "Makadi Bay", blurb: "Rodzinne kurorty all inclusive nad piękną rafą." },
    ],
    aliasQueries: [
      "hotele Hurghada all inclusive",
      "wakacje Hurghada 2026",
      "tanie loty Hurghada",
      "Egipt all inclusive",
    ],
    monthlySearchVolumePL: 22000,
  },
  {
    slug: "split",
    destinationId: "split-croatia",
    cityNominative: "Split",
    cityLocative: "Splicie",
    cityGenitive: "Splitu",
    preposition: "w",
    countryNominative: "Chorwacja",
    countryLocative: "Chorwacji",
    countryGenitive: "Chorwacji",
    intro:
      "Split to antyczny Pałac Dioklecjana wprost nad Adriatykiem i brama do dalmatyńskich wysp. Hotele blisko nabrzeża (Riva) łączą zwiedzanie z plażowaniem i rejsami.",
    neighborhoods: [
      { name: "Stare Miasto (Pałac Dioklecjana)", blurb: "Życie toczy się wewnątrz rzymskiego pałacu, przy nabrzeżu Riva." },
      { name: "Bačvice", blurb: "Miejska plaża i nocne życie tuż przy centrum." },
      { name: "Varoš", blurb: "Klimatyczna, kamienna dzielnica na wzgórzu przy starówce." },
      { name: "Meje", blurb: "Spokojnie, blisko parku leśnego Marjan i zatoczek." },
    ],
    aliasQueries: [
      "hotele Split centrum",
      "noclegi Split",
      "wakacje Chorwacja 2026",
      "tanie hotele Split",
    ],
    monthlySearchVolumePL: 9000,
  },
  {
    slug: "dubrownik",
    destinationId: "dubrovnik-croatia",
    cityNominative: "Dubrownik",
    cityLocative: "Dubrowniku",
    cityGenitive: "Dubrownika",
    preposition: "w",
    countryNominative: "Chorwacja",
    countryLocative: "Chorwacji",
    countryGenitive: "Chorwacji",
    intro:
      "Dubrownik to „perła Adriatyku” — średniowieczne mury miejskie, marmurowe uliczki i lazurowe morze. Hotele blisko starego miasta lub przy plażach Lapadu dopasujesz do stylu wyjazdu.",
    neighborhoods: [
      { name: "Stare Miasto", blurb: "Wewnątrz murów obronnych, w sercu zabytków — kameralnie, ale drożej." },
      { name: "Ploče", blurb: "Tuż za murami, z widokiem na starówkę i blisko plaży Banje." },
      { name: "Lapad", blurb: "Półwysep z plażami i promenadą — rodzinnie i spokojnie." },
      { name: "Gruž", blurb: "Port i lokalny targ — najlepsze ceny noclegów." },
    ],
    aliasQueries: [
      "hotele Dubrownik centrum",
      "noclegi Dubrownik",
      "wakacje Chorwacja 2026",
      "tanie hotele Dubrownik",
    ],
    monthlySearchVolumePL: 11000,
  },
  {
    slug: "marrakesz",
    destinationId: "marrakesh-morocco",
    cityNominative: "Marrakesz",
    cityLocative: "Marrakeszu",
    cityGenitive: "Marrakeszu",
    preposition: "w",
    countryNominative: "Maroko",
    countryLocative: "Maroku",
    countryGenitive: "Maroka",
    intro:
      "Marrakesz to medyna pełna barw, plac Dżamaa el-Fna tętniący życiem i tradycyjne riady ukryte za murami. Hotele od riadów w starym mieście po kurorty w Hivernage dają zupełnie różne doświadczenia.",
    neighborhoods: [
      { name: "Medyna", blurb: "Stare miasto z souk, blisko placu Dżamaa el-Fna; klasyczne riady." },
      { name: "Gueliz", blurb: "Nowoczesna dzielnica z restauracjami, sklepami i hotelami sieciowymi." },
      { name: "Hivernage", blurb: "Eleganckie kurorty, spa i spokój blisko centrum." },
      { name: "Palmeraie", blurb: "Gaj palmowy z resortami i basenami poza zgiełkiem miasta." },
    ],
    aliasQueries: [
      "hotele Marrakesz medyna",
      "riad Marrakesz",
      "wakacje Maroko 2026",
      "tanie loty Marrakesz",
    ],
    monthlySearchVolumePL: 9000,
  },

  // ── Wyspy (przyimek "na") — najwyższy wolumen pakietów wakacyjnych PL ──
  {
    slug: "teneryfa",
    destinationId: "santa-cruz-de-tenerife-spain",
    cityNominative: "Teneryfa",
    cityLocative: "Teneryfie",
    cityGenitive: "Teneryfy",
    cityAccusative: "Teneryfę",
    preposition: "na",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Teneryfa to wieczna wiosna — największa z Wysp Kanaryjskich kusi plażami, wulkanem Teide i ciepłem przez cały rok. Hotele od kurortów all inclusive na południu po spokojniejszą, zieloną północ dopasujesz do stylu wyjazdu.",
    neighborhoods: [
      { name: "Costa Adeje", blurb: "Eleganckie kurorty i najlepsze plaże południa — najwięcej hoteli 4-5*." },
      { name: "Playa de las Américas", blurb: "Tętniące centrum turystyczne: plaże, restauracje i nocne życie." },
      { name: "Los Cristianos", blurb: "Spokojniej i rodzinnie, port z promami na sąsiednie wyspy." },
      { name: "Puerto de la Cruz", blurb: "Zielona północ z basenami Martiánez i lokalnym klimatem." },
    ],
    aliasQueries: [
      "wakacje Teneryfa 2026",
      "Teneryfa all inclusive",
      "tanie loty Teneryfa",
      "wczasy Teneryfa",
    ],
    monthlySearchVolumePL: 27000,
  },
  {
    slug: "kreta",
    destinationId: "heraklion-greece",
    cityNominative: "Kreta",
    cityLocative: "Krecie",
    cityGenitive: "Krety",
    cityAccusative: "Kretę",
    preposition: "na",
    countryNominative: "Grecja",
    countryLocative: "Grecji",
    countryGenitive: "Grecji",
    intro:
      "Kreta to największa grecka wyspa — długie plaże, ruiny minojskie i tawerny z dala od pośpiechu. Hotele od Heraklionu po zachodnią Chanię łączą wypoczynek z odkrywaniem wyspy.",
    neighborhoods: [
      { name: "Heraklion", blurb: "Stolica wyspy z lotniskiem i pałacem w Knossos w pobliżu." },
      { name: "Chania", blurb: "Wenecki port i klimatyczna starówka na zachodzie — najpiękniejsza." },
      { name: "Rethymno", blurb: "Złoty środek wyspy: starówka, długa plaża i kurorty." },
      { name: "Agios Nikolaos", blurb: "Eleganckie kurorty nad zatoką Mirabello na wschodzie." },
    ],
    aliasQueries: [
      "wakacje Kreta 2026",
      "Kreta all inclusive",
      "tanie loty Kreta",
      "wczasy Kreta",
    ],
    monthlySearchVolumePL: 30000,
  },
  {
    slug: "rodos",
    destinationId: "rhodes-greece",
    cityNominative: "Rodos",
    cityLocative: "Rodos",
    cityGenitive: "Rodos",
    cityAccusative: "Rodos",
    preposition: "na",
    countryNominative: "Grecja",
    countryLocative: "Grecji",
    countryGenitive: "Grecji",
    intro:
      "Rodos to słoneczna wyspa Dodekanezu — średniowieczne stare miasto, szerokie plaże i ciepło od maja do października. Hotele od kurortów w Faliraki po klimatyczne stare miasto dopasujesz do stylu.",
    neighborhoods: [
      { name: "Rodos (miasto)", blurb: "Średniowieczne stare miasto UNESCO i plaże tuż obok." },
      { name: "Faliraki", blurb: "Najpopularniejszy kurort z szerokimi plażami i życiem nocnym." },
      { name: "Lindos", blurb: "Malownicze białe miasteczko z akropolem nad zatoką." },
      { name: "Ixia / Ialyssos", blurb: "Hotele 4-5* i raj dla windsurferów na zachodnim wybrzeżu." },
    ],
    aliasQueries: [
      "wakacje Rodos 2026",
      "Rodos all inclusive",
      "tanie loty Rodos",
      "wczasy Rodos",
    ],
    monthlySearchVolumePL: 22000,
  },
  {
    slug: "majorka",
    destinationId: "palma-spain",
    cityNominative: "Majorka",
    cityLocative: "Majorce",
    cityGenitive: "Majorki",
    cityAccusative: "Majorkę",
    preposition: "na",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    intro:
      "Majorka łączy turkusowe zatoczki, góry Tramuntana i tętniącą Palmę. Największa z Balearów oferuje hotele od miejskich w Palmie po kurorty all inclusive nad zatokami.",
    neighborhoods: [
      { name: "Palma", blurb: "Stolica wyspy: katedra, starówka i miejskie plaże." },
      { name: "Alcúdia", blurb: "Długa piaszczysta plaża i rodzinne kurorty na północy." },
      { name: "Magaluf / Palmanova", blurb: "Kurorty z życiem nocnym blisko Palmy." },
      { name: "Cala d'Or", blurb: "Malownicze zatoczki i spokojniejszy wschód wyspy." },
    ],
    aliasQueries: [
      "wakacje Majorka 2026",
      "Majorka all inclusive",
      "tanie loty Majorka",
      "wczasy Majorka",
    ],
    monthlySearchVolumePL: 18000,
  },
  {
    slug: "malta",
    destinationId: "valletta-malta",
    cityNominative: "Malta",
    cityLocative: "Malcie",
    cityGenitive: "Malty",
    cityAccusative: "Maltę",
    preposition: "na",
    countryNominative: "Malta",
    countryLocative: "Malcie",
    countryGenitive: "Malty",
    intro:
      "Malta to skąpana w słońcu wyspa na Morzu Śródziemnym — barokowa Valletta, lazurowe zatoki i historia na każdym kroku. Hotele od tętniącego Sliema i St. Julian's po spokojniejszą północ dopasujesz do stylu.",
    neighborhoods: [
      { name: "Sliema / St. Julian's", blurb: "Główne centrum turystyczne: hotele, restauracje i nocne życie." },
      { name: "Valletta", blurb: "Barokowa stolica UNESCO z klimatem i widokiem na port." },
      { name: "Mellieħa", blurb: "Najlepsze piaszczyste plaże wyspy na północy." },
      { name: "Buġibba / Qawra", blurb: "Budżetowe kurorty nad zatoką św. Pawła." },
    ],
    aliasQueries: [
      "wakacje Malta 2026",
      "Malta all inclusive",
      "tanie loty Malta",
      "wczasy Malta",
    ],
    monthlySearchVolumePL: 14000,
  },
  {
    slug: "cypr",
    destinationId: "larnaca-cyprus",
    cityNominative: "Cypr",
    cityLocative: "Cyprze",
    cityGenitive: "Cypru",
    cityAccusative: "Cypr",
    preposition: "na",
    countryNominative: "Cypr",
    countryLocative: "Cyprze",
    countryGenitive: "Cypru",
    intro:
      "Cypr to słońce niemal przez cały rok, ciepłe morze i plaże nagradzane Błękitną Flagą. Hotele od tętniącej Ajia Napa po spokojniejszą Pafos i Larnakę dopasujesz do stylu wyjazdu.",
    neighborhoods: [
      { name: "Larnaka", blurb: "Lotnisko, palmowa promenada i plaże w zasięgu spaceru." },
      { name: "Ajia Napa / Protaras", blurb: "Najpiękniejsze plaże i życie nocne na wschodzie." },
      { name: "Pafos", blurb: "Zabytki UNESCO, klimatyczny port i kurorty na zachodzie." },
      { name: "Limassol", blurb: "Największy kurort z mariną, hotelami i rozrywką." },
    ],
    aliasQueries: [
      "wakacje Cypr 2026",
      "Cypr all inclusive",
      "tanie loty Cypr",
      "wczasy Cypr",
    ],
    monthlySearchVolumePL: 20000,
  },
];

export function findCommercialCityBySlug(slug: string): CommercialCity | undefined {
  return commercialCities.find((c) => c.slug === slug);
}

// Reverse lookup by the resolved profile slug (e.g. "barcelona-spain",
// "london-uk"). Used by the destination guide page (/kierunki/[slug]) to
// surface an internal link to the matching commercial landing page —
// passing link equity from ~235 guide pages into the high-intent money
// pages. The arg is `guide.destination.slug`, i.e. the SAME identifier as
// `destinationId` here, so these must stay in sync.
export function findCommercialCityByDestinationId(
  destinationId: string,
): CommercialCity | undefined {
  return commercialCities.find((c) => c.destinationId === destinationId);
}

export function commercialCitySlugs(): string[] {
  return commercialCities.map((c) => c.slug);
}
