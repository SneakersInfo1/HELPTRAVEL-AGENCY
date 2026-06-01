import type { DestinationProfile } from "./types";

import { getDestinationMedia, getDestinationMediaBySlug } from "./commercial-assets";

export interface DestinationStory {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  vibe: string;
  // Optional: getDestinationStory() always overrides these with the
  // destination's resolved media, so curated entries may omit them.
  heroImage?: string;
  gallery?: string[];
  heroVideoPoster?: string;
  highlights: string[];
  attractions: string[];
  foodSpots: string[];
  districts: string[];
  miniPlan: Array<{
    day: number;
    title: string;
    description: string;
  }>;
  bestFor: string[];
}

const image = (url: string) => `${url}?auto=format&fit=crop&w=1600&q=82`;

const commonImages = {
  coast: image("https://images.unsplash.com/photo-1507525428034-b723cf961d3e"),
};

const malagaMedia = getDestinationMediaBySlug("malaga-spain", { city: "Malaga", country: "Spain" });
const barcelonaMedia = getDestinationMediaBySlug("barcelona-spain", { city: "Barcelona", country: "Spain" });
const lisbonMedia = getDestinationMediaBySlug("lisbon-portugal", { city: "Lizbona", country: "Portugal" });
const valenciaMedia = getDestinationMediaBySlug("valencia-spain", { city: "Walencja", country: "Spain" });
const athensMedia = getDestinationMediaBySlug("athens-greece", { city: "Ateny", country: "Greece" });

function buildStory(params: Omit<DestinationStory, "slug"> & { slug: string }): DestinationStory {
  return params;
}

const destinationStories: Record<string, DestinationStory> = {
  "malaga-spain": buildStory({
    slug: "malaga-spain",
    name: "Malaga",
    tagline: "Słoneczny city break z plażą, jedzeniem i łatwym rytmem wyjazdu.",
    summary:
      "Malaga łączy nadmorski odpoczynek z wygodnym centrum, kultura i bardzo prostym planowaniem. To jeden z najmocniejszych kierunków, gdy chcesz mieć plażę, zwiedzanie i dobry standard wyjazdu bez zbędnej logistyki.",
    vibe: "słonecznie, lekko i bez pośpiechu",
    heroImage: malagaMedia.heroImage,
    gallery: malagaMedia.gallery,
    heroVideoPoster: malagaMedia.poster,
    highlights: [
      "La Malagueta i spacery nad morzem",
      "Alcazaba oraz punkt widokowy Gibralfaro",
      "centrum z tapas i wieczornym rytmem miasta",
      "dobra baza wypadowa na 3-5 dni",
    ],
    attractions: ["Alcazaba", "Castillo de Gibralfaro", "Muelle Uno", "Museo Picasso", "Mercado Atarazanas", "La Malagueta"],
    foodSpots: ["chiringuitos z rybami i owocami morza", "tapas bary przy centrum", "kawiarnie przy Calle Larios"],
    districts: ["Centro Historico", "La Malagueta", "Muelle Uno", "El Palo"],
    miniPlan: [
      {
        day: 1,
        title: "Przylot i lekki start",
        description: "Check-in, spacer promenada, plażą i spokojna kolacja z widokiem na port.",
      },
      {
        day: 2,
        title: "Historia i najlepsze widoki",
        description: "Alcazaba, Gibralfaro i stare miasto z przerwami na tapas i kawiarnie.",
      },
      {
        day: 3,
        title: "Kultura i lokalny rytm",
        description: "Picasso, targ, spokojniejsze dzielnice i bardziej lokalna Malaga poza główną trasą.",
      },
    ],
    bestFor: ["plażą + zwiedzanie", "wygodniejszy city break", "krótki urlop z Polski", "dobre jedzenie"],
  }),
  "barcelona-spain": buildStory({
    slug: "barcelona-spain",
    name: "Barcelona",
    tagline: "Miasto, architektura i morze w jednym mocnym city breaku.",
    summary:
      "Barcelona daje bardzo silny miks architektury, energii dużego miasta i nadmorskiego klimatu. To dobry wybór, gdy chcesz mieć mocne first impression, więcej tempa i dużo opcji na wieczór.",
    vibe: "dynamicznie, stylowo i bardzo miejsko",
    heroImage: barcelonaMedia.heroImage,
    gallery: barcelonaMedia.gallery,
    heroVideoPoster: barcelonaMedia.poster,
    highlights: [
      "ikony Gaudiego i rozpoznawalna architektura",
      "Barceloneta oraz nadmorski reset po mieście",
      "El Born i gotyckie uliczki na wieczór",
      "silny klimat dla par i grup",
    ],
    attractions: ["Sagrada Familia", "Park Guell", "Barceloneta", "El Born", "Bunkers del Carmel", "La Boqueria"],
    foodSpots: ["tapas bary w El Born", "miejsca z vermutem", "lokalne śniadania i seafood przy morzu"],
    districts: ["Eixample", "Barceloneta", "El Born", "Gracia"],
    miniPlan: [
      {
        day: 1,
        title: "Wejście w rytm miasta",
        description: "Spacer po centrum, wieczór w El Born i pierwszy kontakt z energią Barcelony.",
      },
      {
        day: 2,
        title: "Architektura i główna trasa",
        description: "Gaudi, Passeig de Gracia i najmocniejsze miejsca, które budują efekt wow.",
      },
      {
        day: 3,
        title: "Morze i miejski reset",
        description: "Barceloneta, promenada i punkt widokowy domykający plan na 3-4 dni.",
      },
    ],
    bestFor: ["miasto + morze", "architektura", "wieczorne wyjścia", "intensywny city break"],
  }),
  "lisbon-portugal": buildStory({
    slug: "lisbon-portugal",
    name: "Lizbona",
    tagline: "Wzgórza, widoki i miejski rytm z charakterem.",
    summary:
      "Lizbona wypada mocno, gdy szukasz klimatu, spacerów, punktów widokowych i spokojniejszego rytmu niż w najbardziej intensywnych stolicach. To kierunek, który zostaje w pamięci i dobrze działa na 4-5 dni.",
    vibe: "widokowo, klimatycznie i z oddechem",
    heroImage: lisbonMedia.heroImage,
    gallery: lisbonMedia.gallery,
    heroVideoPoster: lisbonMedia.poster,
    highlights: [
      "tramwaj 28 i pocztówkowe wzgórza",
      "Alfama z lokalnym klimatem",
      "Belém i spacer nad Tagiem",
      "mocny food + city break mix",
    ],
    attractions: ["Alfama", "Belém", "LX Factory", "Time Out Market", "miradouros", "tramwaj 28"],
    foodSpots: ["pastéis de nata", "seafoodowe knajpki", "lokalne markety i kawiarnie"],
    districts: ["Alfama", "Baixa", "Bairro Alto", "Belém"],
    miniPlan: [
      {
        day: 1,
        title: "Wzgórza i punkty widokowe",
        description: "Pierwszy spacer po mieście, miradouros i wejście w rytm Lizbony bez pośpiechu.",
      },
      {
        day: 2,
        title: "Historyczna warstwa miasta",
        description: "Alfama, Baixa i klasyczne miejsca, ale w spokojnym planie z miejscem na jedzenie.",
      },
      {
        day: 3,
        title: "Belém i dobry finał",
        description: "Rzeka, lokalne smaki i wieczór, który zamyka wyjazd bardziej klimatem niż odhaczaniem punktów.",
      },
    ],
    bestFor: ["widoki", "spacery", "kierunek z charakterem", "dobre jedzenie"],
  }),
  "valencia-spain": buildStory({
    slug: "valencia-spain",
    name: "Walencja",
    tagline: "Najbardziej zbalansowany miks plaży, miasta i opłacalności.",
    summary:
      "Walencja jest mocna, gdy chcesz mieć plażę, dobre jedzenie, miasto i sensowny koszt wyjazdu bez takiego tłoku jak w Barcelonie. To jeden z najlepszych kierunków dla osób szukających bardzo dobrego balansu.",
    vibe: "jasno, wygodnie i bez przesadnego tłoku",
    heroImage: valenciaMedia.heroImage,
    gallery: valenciaMedia.gallery,
    heroVideoPoster: valenciaMedia.poster,
    highlights: [
      "Miasto Sztuki i Nauki",
      "Malvarrosa i promenada",
      "park Turia jako naturalna os miasta",
      "bardzo dobry stosunek ceny do jakości",
    ],
    attractions: ["Ciudad de las Artes y las Ciencias", "Malvarrosa", "Mercado Central", "Jardin del Turia", "La Lonja", "El Carmen"],
    foodSpots: ["paella w lokalnych restauracjach", "tapas w centrum", "spokojne lunche przy plaży"],
    districts: ["Ciutat Vella", "Eixample", "Ruzafa", "Cabanyal"],
    miniPlan: [
      {
        day: 1,
        title: "Centrum i pierwszy rytm miasta",
        description: "Stare miasto, kawa, spokojny wieczór i wejście w bardziej lokalną Walencję.",
      },
      {
        day: 2,
        title: "Architektura i park",
        description: "Mocna warstwa nowoczesna, Turia i najbardziej charakterystyczne przestrzenie miasta.",
      },
      {
        day: 3,
        title: "Morze i oddech",
        description: "Promenada, plażę i plan, który nie meczy nawet przy krótkim wyjeździe.",
      },
    ],
    bestFor: ["plażą + miasto", "optymalny city break", "spokojny rytm", "bardzo dobra relacja ceny do jakości"],
  }),
  "athens-greece": buildStory({
    slug: "athens-greece",
    name: "Ateny",
    tagline: "Kolebka Europy, w której antyk sąsiaduje z żywym, nocnym miastem — i z bramą na greckie wyspy.",
    summary:
      "Ateny to rzadki przypadek miasta, w którym z dachowego baru patrzysz na oświetlony Partenon, a kwadrans później jesz świeże souvlaki w gwarnej Monastiraki. To kierunek na 3-4 dni z konkretem: Akropol i światowej klasy Muzeum Akropolu rano, leniwe popołudnia w cieniu uliczek Plaki, a jeśli masz dzień więcej — port w Pireusie i prom na Eginę lub Saronik. Tanio, słonecznie niemal przez cały rok i bez znużenia.",
    vibe: "antyk, słońce i miejska energia w jednym",
    heroImage: athensMedia.heroImage,
    gallery: athensMedia.gallery,
    heroVideoPoster: athensMedia.poster,
    highlights: [
      "Akropol i Partenon — najważniejszy zabytek antycznej Europy",
      "Muzeum Akropolu ze szklaną podłogą nad wykopaliskami",
      "Plaka i Monastiraki — uliczki, tawerny i nocne życie u stóp wzgórza",
      "dachowe bary z widokiem na podświetlony Akropol o zachodzie słońca",
      "Pireus jako brama na promy do wysp Zatoki Sarońskiej",
    ],
    attractions: [
      "Akropol i Partenon",
      "Muzeum Akropolu",
      "Agora Antyczna i Świątynia Hefajstosa",
      "wzgórze Likawitos (najlepsza panorama miasta)",
      "Plaka i Anafiotika",
      "targ Varvakios i bazar Monastiraki",
    ],
    foodSpots: [
      "souvlaki i gyros w Monastiraki",
      "rodzinne tawerny w Place i Psyri",
      "dachowe bary z mezze i widokiem na Akropol",
      "kawa frappé i loukoumades na deser",
    ],
    districts: [
      "Koukaki — modne, spokojne i tuż pod Akropolem; najlepszy wybór na pierwszy nocleg",
      "Plaka / Monastiraki — w samym sercu starówki, blisko wszystkiego, gwarnie do późna",
      "Syntagma — centrum komunikacyjne z metrem z/na lotnisko",
      "Kolonaki — elegancka dzielnica z kawiarniami u stóp Likawitu",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Akropol i starówka",
        description:
          "Wejdź na Akropol tuż po otwarciu (mniejszy tłum i upał), potem Muzeum Akropolu, a wieczór spędź w uliczkach Plaki i na dachowym barze z widokiem na podświetlony Partenon.",
      },
      {
        day: 2,
        title: "Antyczne miasto i panorama",
        description:
          "Agora Antyczna i Świątynia Hefajstosa, lunch w Psyri, a o zachodzie słońca podejście na Likawitos po najlepszą panoramę Aten.",
      },
      {
        day: 3,
        title: "Morze albo wyspy",
        description:
          "Z Pireusu prom na Eginę lub do Zatoki Sarońskiej, albo riwiera ateńska (Glyfada) na plażowe popołudnie — domyka wyjazd morzem.",
      },
    ],
    bestFor: ["antyk i historia", "city break z charakterem", "brama na greckie wyspy", "słońce poza sezonem"],
  }),
  "rome-italy": buildStory({
    slug: "rome-italy",
    name: "Rzym",
    tagline: "Antyczna stolica świata, w której każda uliczka i każda fontanna ma dwa tysiące lat historii.",
    summary:
      "Rzym to miasto, w którym z porannego espresso przy barze idziesz prosto pod Koloseum, a wieczorem rzucasz monetę do fontanny di Trevi w tłumie, który nie cichnie do północy. To kierunek na 3-4 dni z mocnym konkretem: antyczne Forum Romanum i Palatyn jednego dnia, Watykan z Bazyliką św. Piotra i Kaplicą Sykstyńską drugiego, a wieczory w Trastevere przy carbonarze i kieliszku frascati. Słonecznie niemal cały rok, łatwy dolot z Polski i tyle warstw historii, że nie sposób się znudzić.",
    vibe: "antyk, barok i wielkomiejski gwar",
    highlights: [
      "Koloseum i Forum Romanum — serce antycznego Rzymu",
      "Watykan z Bazyliką św. Piotra i Kaplicą Sykstyńską Michała Anioła",
      "fontanna di Trevi i Schody Hiszpańskie — barokowe ikony",
      "Panteon — najlepiej zachowana antyczna świątynia świata",
      "Trastevere — wieczorne tawerny i prawdziwy rzymski klimat",
    ],
    attractions: [
      "Koloseum",
      "Forum Romanum i Palatyn",
      "Watykan (Bazylika św. Piotra i Muzea Watykańskie)",
      "Panteon",
      "fontanna di Trevi",
      "Schody Hiszpańskie i Piazza Navona",
    ],
    foodSpots: [
      "carbonara i cacio e pepe w tawernach Trastevere",
      "rzymska pizza al taglio na kawałki",
      "supplì i prawdziwe gelato z rzemieślniczych lodziarni",
      "espresso na stojąco przy barze w centrum",
    ],
    districts: [
      "Centro Storico — w sercu zabytków, blisko Panteonu i Piazza Navona; idealny na pierwszy nocleg",
      "Trastevere — klimatyczna, gwarna wieczorami dzielnica z najlepszymi tawernami",
      "Monti — modna, spokojniejsza okolica tuż przy Koloseum",
      "Prati — elegancko i wygodnie, kilka kroków od Watykanu",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Antyczny Rzym",
        description:
          "Koloseum tuż po otwarciu (mniejszy tłum i upał), potem Forum Romanum i Palatyn, a wieczór w Monti przy kieliszku wina i rzymskiej kuchni.",
      },
      {
        day: 2,
        title: "Watykan i barokowe centrum",
        description:
          "Rano Muzea Watykańskie i Kaplica Sykstyńska, potem Bazylika św. Piotra, a popołudniem Panteon, Piazza Navona i fontanna di Trevi po drodze.",
      },
      {
        day: 3,
        title: "Trastevere i lokalny rytm",
        description:
          "Spacer po Zatybrzu, lunch w lokalnej tawernie, Schody Hiszpańskie i wieczór, który domyka wyjazd prawdziwym rzymskim klimatem.",
      },
    ],
    bestFor: ["antyk i historia", "sztuka i architektura", "city break z charakterem", "dobre jedzenie"],
  }),
  "milan-italy": buildStory({
    slug: "milan-italy",
    name: "Mediolan",
    tagline: "Stolica włoskiej mody i designu, gdzie gotycka katedra sąsiaduje z witrynami domów mody.",
    summary:
      "Mediolan to najbardziej europejskie z włoskich miast: poranek pod marmurowymi iglicami Duomo, popołudnie w szklanej Galleria Vittorio Emanuele II i wieczorny aperitivo nad kanałami Navigli. To kierunek na 2-3 dni dla tych, którzy chcą połączyć modę, design i sztukę najwyższej próby — z Ostatnią Wieczerzą Leonarda na czele. Świetnie dolatuje się tu z Polski, a samo miasto jest też doskonałą bazą wypadową nad jezioro Como.",
    vibe: "elegancko, modnie i wielkomiejsko",
    highlights: [
      "Duomo — gotycka katedra z tarasem na dachu wśród iglic",
      "Galleria Vittorio Emanuele II — najpiękniejszy pasaż handlowy Europy",
      "Ostatnia Wieczerza Leonarda da Vinci",
      "Quadrilatero della Moda — kwartał najważniejszych domów mody",
      "kanały Navigli — wieczorny aperitivo nad wodą",
    ],
    attractions: [
      "Duomo i taras na dachu katedry",
      "Galleria Vittorio Emanuele II",
      "Ostatnia Wieczerza w kościele Santa Maria delle Grazie",
      "Zamek Sforzów (Castello Sforzesco)",
      "Quadrilatero della Moda",
      "dzielnica Navigli",
    ],
    foodSpots: [
      "aperitivo z cicchetti nad kanałami Navigli",
      "risotto alla milanese i cotoletta w tradycyjnych trattoriach",
      "panettone i kawa w historycznych cukierniach",
      "modne bistra w dzielnicy Brera",
    ],
    districts: [
      "Centro / Duomo — w samym sercu, blisko katedry i pasażu; najwygodniejszy pierwszy nocleg",
      "Brera — artystyczna, klimatyczna dzielnica z galeriami i bistrami",
      "Navigli — wieczorne życie nad kanałami, bary i restauracje",
      "Porta Nuova — nowoczesna część miasta z drapaczami chmur",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Duomo i serce miasta",
        description:
          "Wejście na dach Duomo wśród iglic, potem Galleria Vittorio Emanuele II, plac przy La Scali i spacer przez modny Quadrilatero della Moda.",
      },
      {
        day: 2,
        title: "Leonardo i Brera",
        description:
          "Rezerwowana wcześniej Ostatnia Wieczerza, Zamek Sforzów i park Sempione, a popołudnie i wieczór w artystycznej dzielnicy Brera.",
      },
      {
        day: 3,
        title: "Navigli i aperitivo",
        description:
          "Lokalny rytm, zakupy lub wypad nad jezioro Como, a na koniec klasyczny mediolański aperitivo nad kanałami Navigli.",
      },
    ],
    bestFor: ["moda i design", "sztuka", "miejski city break", "baza nad jezioro Como"],
  }),
  "venice-italy": buildStory({
    slug: "venice-italy",
    name: "Wenecja",
    tagline: "Miasto na wodzie bez jednego samochodu, gdzie ulicami są kanały, a taksówkami — gondole.",
    summary:
      "Wenecja to miejsce, którego nie da się porównać z niczym innym: ze stopni mostu Rialto patrzysz na ruch łodzi na Canal Grande, a chwilę później gubisz się w plątaninie cichych zaułków i mostków. To kierunek na 2-3 dni, najlepszy poza szczytem lata — Plac św. Marka o poranku, łódź na wyspy Murano i Burano, wieczorne cicchetti przy kieliszku prosecco z dala od tłumów. Magiczny zwłaszcza wczesną wiosną i jesienią, gdy miasto zwalnia.",
    vibe: "romantycznie, bajkowo i bez samochodów",
    highlights: [
      "Plac św. Marka z Bazyliką i Pałacem Dożów",
      "Canal Grande i przejazd vaporetto głównym kanałem",
      "most Rialto — najsłynniejszy most miasta",
      "Murano i Burano — szkło i kolorowe domki rybaków",
      "przejażdżka gondolą cichymi kanałami",
    ],
    attractions: [
      "Plac św. Marka i Bazylika św. Marka",
      "Pałac Dożów i Most Westchnień",
      "most Rialto i Canal Grande",
      "wyspy Murano i Burano",
      "Galeria Accademia",
      "Punta della Dogana i Santa Maria della Salute",
    ],
    foodSpots: [
      "cicchetti i kieliszek prosecco w lokalnych bacari",
      "świeże owoce morza i risotto z mątwą",
      "sarde in saor — wenecka przekąska z sardynek",
      "lody i kawa przy mniej zatłoczonych campo",
    ],
    districts: [
      "San Marco — w sercu zabytków, najwygodniej, ale najdrożej i najgwarniej",
      "Cannaregio — bardziej lokalna dzielnica z autentycznymi bacari i Ghetto",
      "Dorsoduro — artystyczna, spokojniejsza okolica z muzeami i widokami",
      "Castello — najcichsza część miasta, blisko centrum, a bez tłoku",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Serce Wenecji",
        description:
          "Plac św. Marka tuż po otwarciu (przed wycieczkami), Bazylika i Pałac Dożów, potem most Rialto i przejazd vaporetto wzdłuż Canal Grande.",
      },
      {
        day: 2,
        title: "Wyspy laguny",
        description:
          "Łodzią na Murano (huty szkła) i Burano (kolorowe domki rybaków), a wieczorem cicchetti w lokalnych bacari w Cannaregio.",
      },
      {
        day: 3,
        title: "Ciche zaułki i sztuka",
        description:
          "Spokojny spacer po Dorsoduro, Galeria Accademia, gubienie się w bocznych kanałach i przejażdżka gondolą na finał.",
      },
    ],
    bestFor: ["romantyczny wyjazd", "miejsce wyjątkowe", "sztuka i historia", "spokojny sezon"],
  }),
  "florence-italy": buildStory({
    slug: "florence-italy",
    name: "Florencja",
    tagline: "Kolebka renesansu, gdzie kopuła Brunelleschiego góruje nad miastem-muzeum pełnym arcydzieł.",
    summary:
      "Florencja to renesans, którego dotyka się na każdym kroku: poranek pod marmurową katedrą i kopułą Brunelleschiego, Dawid Michała Anioła w Galleria dell'Accademia, a popołudnie wśród Botticellich w Uffizi. To kierunek na 2-3 dni dla miłośników sztuki i klimatu — spacer przez obstawiony złotniczymi sklepikami Ponte Vecchio, zachód słońca z Piazzale Michelangelo i kolacja w rzemieślniczym Oltrarno. Kompaktowe, piesze i piękne o każdej porze roku.",
    vibe: "renesansowo, artystycznie i kameralnie",
    highlights: [
      "Duomo i kopuła Brunelleschiego — symbol renesansu",
      "Galeria Uffizi — Botticelli, Leonardo i włoscy mistrzowie",
      "Dawid Michała Anioła w Galleria dell'Accademia",
      "Ponte Vecchio — średniowieczny most ze złotniczymi sklepikami",
      "Piazzale Michelangelo — najlepsza panorama miasta o zachodzie słońca",
    ],
    attractions: [
      "Katedra (Duomo) i kopuła Brunelleschiego",
      "Galeria Uffizi",
      "Dawid Michała Anioła (Galleria dell'Accademia)",
      "Ponte Vecchio",
      "Palazzo Pitti i Ogrody Boboli",
      "Piazzale Michelangelo",
    ],
    foodSpots: [
      "bistecca alla fiorentina — flagowy stek na grillu",
      "panino z lampredotto z ulicznych budek",
      "trattorie i enoteki w dzielnicy Oltrarno",
      "rzemieślnicze gelato z dala od głównej trasy",
    ],
    districts: [
      "Centro Storico (Duomo) — w sercu zabytków, wszystko na piechotę; najwygodniejszy nocleg",
      "Oltrarno — rzemieślnicza, klimatyczna dzielnica za rzeką z lokalnymi trattoriami",
      "Santa Croce — żywa okolica z bazyliką i restauracjami",
      "San Lorenzo — przy targu, praktycznie i blisko dworca",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Renesansowe centrum",
        description:
          "Duomo i wejście na kopułę Brunelleschiego po otwarciu, Baptysterium, a popołudniem rezerwowana wcześniej Galeria Uffizi.",
      },
      {
        day: 2,
        title: "Michał Anioł i Oltrarno",
        description:
          "Dawid w Galleria dell'Accademia, przejście przez Ponte Vecchio i popołudnie w rzemieślniczym Oltrarno z lokalną kolacją.",
      },
      {
        day: 3,
        title: "Panorama i ogrody",
        description:
          "Palazzo Pitti i Ogrody Boboli, a o zachodzie słońca podejście na Piazzale Michelangelo po najlepszy widok na miasto.",
      },
    ],
    bestFor: ["sztuka i renesans", "kameralny city break", "kierunek dla par", "dobre jedzenie i wino"],
  }),
  "naples-italy": buildStory({
    slug: "naples-italy",
    name: "Neapol",
    tagline: "Surowy, gorący i autentyczny — ojczyzna prawdziwej pizzy u stóp Wezuwiusza.",
    summary:
      "Neapol to najbardziej żywiołowe miasto Włoch: wąska, tętniąca życiem Spaccanapoli, zapach pieca z pizzą margheritą na każdym rogu i Wezuwiusz górujący nad zatoką. To kierunek na 3-4 dni z konkretem dla odważnych — dzień na ruiny Pompejów i wejście na krater wulkanu, a stąd tylko krok do bramy na Capri i Wybrzeże Amalfi. Surowo, tanio i prawdziwie, z najlepszą pizzą, jaką zjesz w życiu.",
    vibe: "żywiołowo, surowo i bardzo autentycznie",
    highlights: [
      "Spaccanapoli — tętniąca życiem oś starego miasta",
      "prawdziwa pizza neapolitańska prosto z pieca",
      "Pompeje — antyczne miasto zasypane przez Wezuwiusz",
      "wejście na krater Wezuwiusza z widokiem na zatokę",
      "brama na Capri i Wybrzeże Amalfi promem z portu",
    ],
    attractions: [
      "Spaccanapoli i centrum historyczne",
      "Pompeje (ruiny antycznego miasta)",
      "Wezuwiusz",
      "Narodowe Muzeum Archeologiczne",
      "Kaplica Sansevero (Chrystus pod całunem)",
      "zamek Castel dell'Ovo nad zatoką",
    ],
    foodSpots: [
      "pizza neapolitańska w historycznych pizzeriach na Spaccanapoli",
      "sfogliatella i babà — flagowe neapolitańskie ciastka",
      "smażone uliczne przekąski (cuoppo) z budek",
      "świeże owoce morza nad zatoką w Borgo Marinari",
    ],
    districts: [
      "Centro Storico — w sercu Spaccanapoli, gwarno i autentycznie; najlepszy na pierwszy nocleg",
      "Chiaia — elegantsza, spokojniejsza nadmorska dzielnica z kawiarniami",
      "Lungomare / Santa Lucia — nadmorska promenada z widokiem na Wezuwiusz",
      "Vomero — wyżej położona, spokojna okolica z panoramą i fortem",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Serce starego Neapolu",
        description:
          "Spacer Spaccanapoli, Kaplica Sansevero, prawdziwa pizza neapolitańska na lunch, a wieczorem promenada Lungomare z widokiem na zatokę.",
      },
      {
        day: 2,
        title: "Pompeje i Wezuwiusz",
        description:
          "Pociągiem do ruin Pompejów, potem wejście na krater Wezuwiusza, a po powrocie Narodowe Muzeum Archeologiczne ze skarbami z wykopalisk.",
      },
      {
        day: 3,
        title: "Wyspa albo wybrzeże",
        description:
          "Z portu prom na Capri lub wypad na Wybrzeże Amalfi (Sorrento, Positano) — morski finał intensywnego wyjazdu.",
      },
    ],
    bestFor: ["autentyczne Włochy", "jedzenie i pizza", "brama na Capri i Amalfi", "antyk i historia"],
  }),
  "madrid-spain": buildStory({
    slug: "madrid-spain",
    name: "Madryt",
    tagline: "Tętniąca życiem stolica Hiszpanii ze światowej klasy muzeami i kulturą tapas do późnej nocy.",
    summary:
      "Madryt to miasto, które naprawdę budzi się po zmroku: poranek wśród arcydzieł w Prado, popołudniowy spacer i wiosłowanie po stawie w parku Retiro, a wieczór na tapas w gwarnej La Latina, gdzie życie trwa do białego rana. To kierunek na 3-4 dni dla miłośników sztuki i miejskiej energii — od Guerniki Picassa w Reina Sofía po szeroką Gran Vía. Słonecznie, żywo i z łatwym dolotem z Polski.",
    vibe: "energicznie, kulturalnie i do późna",
    highlights: [
      "Muzeum Prado — Velázquez, Goya i Bosch w jednym miejscu",
      "Reina Sofía z Guerniką Picassa",
      "park Retiro — zielone serce miasta z Pałacem Kryształowym",
      "Gran Vía — bulwar teatrów, kin i wielkomiejskiego gwaru",
      "La Latina — kultura tapas i wieczorne życie",
    ],
    attractions: [
      "Muzeum Prado",
      "Muzeum Reina Sofía (Guernica)",
      "park Retiro",
      "Pałac Królewski (Palacio Real)",
      "Puerta del Sol i Plaza Mayor",
      "Gran Vía",
    ],
    foodSpots: [
      "tapas i wino w barach La Latina (Calle Cava Baja)",
      "bocadillo de calamares na Plaza Mayor",
      "churros z gorącą czekoladą w historycznej chocolaterii",
      "targ Mercado de San Miguel z przekąskami",
    ],
    districts: [
      "Centro (Sol) — w sercu miasta, blisko wszystkiego; najwygodniejszy pierwszy nocleg",
      "La Latina — klimatyczna dzielnica tapas, najlepsza na wieczory",
      "Malasaña — modna, młoda okolica z barami i sklepami vintage",
      "Salamanca — elegancko i spokojnie, blisko Prado i Retiro",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Centrum i klimat miasta",
        description:
          "Puerta del Sol, Plaza Mayor i targ San Miguel, spacer przez Gran Vía, a wieczór na tapas w gwarnej La Latina.",
      },
      {
        day: 2,
        title: "Wielka sztuka i park",
        description:
          "Rano Muzeum Prado, potem Reina Sofía z Guerniką, a popołudnie na relaks i wiosłowanie po stawie w parku Retiro.",
      },
      {
        day: 3,
        title: "Pałac i lokalny rytm",
        description:
          "Pałac Królewski i katedra Almudena, spacer po modnej Malasañie i pożegnalne tapas z lampką wina.",
      },
    ],
    bestFor: ["sztuka i muzea", "miejska energia", "kultura tapas", "wieczorne życie"],
  }),
  "seville-spain": buildStory({
    slug: "seville-spain",
    name: "Sewilla",
    tagline: "Gorące serce Andaluzji — flamenco, mauretańskie pałace i pomarańczowe drzewa nad Gwadalkiwirem.",
    summary:
      "Sewilla to esencja południowej Hiszpanii: poranek pod największą gotycką katedrą świata i wieżą Giralda, popołudnie w bajkowych ogrodach mauretańskiego Alcázaru, a wieczór na żarliwym pokazie flamenco w robotniczej Trianie. To kierunek na 3-4 dni pełen słońca, zapachu kwitnących pomarańczy i andaluzyjskiego klimatu — z monumentalną Plaza de España na czele. Najlepiej wiosną lub jesienią, gdy upał odpuszcza.",
    vibe: "gorąco, andaluzyjsko i z duszą flamenco",
    highlights: [
      "Katedra i wieża Giralda — największa gotycka katedra świata",
      "Real Alcázar — mauretański pałac z bajkowymi ogrodami",
      "Plaza de España — monumentalny półokrąg z azulejos",
      "Triana — dzielnica flamenco i ceramiki za rzeką",
      "wieczorny pokaz flamenco w kameralnym tablao",
    ],
    attractions: [
      "Katedra i Giralda",
      "Real Alcázar i jego ogrody",
      "Plaza de España i park Marii Ludwiki",
      "dzielnica Triana",
      "Metropol Parasol (Las Setas)",
      "Torre del Oro nad Gwadalkiwirem",
    ],
    foodSpots: [
      "tapas i sherry w barach dzielnicy Triana",
      "espinacas con garbanzos i pescaíto frito",
      "gazpacho i salmorejo na upalne dni",
      "naleśniki i kawa w cieniu pomarańczowych drzew",
    ],
    districts: [
      "Santa Cruz — dawna dzielnica żydowska, klimatyczna plątanina uliczek przy katedrze; najlepszy nocleg",
      "Triana — autentyczna dzielnica flamenco i ceramiki za rzeką",
      "Alfalfa / Centro — żywe centrum z tapas i nocnym życiem",
      "Arenal — przy rzece i Torre del Oro, blisko wszystkiego",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Katedra i Alcázar",
        description:
          "Wejście na Giraldę i zwiedzanie katedry po otwarciu, potem bajkowy Real Alcázar z ogrodami, a wieczorem spacer po dzielnicy Santa Cruz.",
      },
      {
        day: 2,
        title: "Plaza de España i flamenco",
        description:
          "Monumentalna Plaza de España i park Marii Ludwiki, popołudnie z tarasem Metropol Parasol, a wieczorem żarliwy pokaz flamenco w tablao.",
      },
      {
        day: 3,
        title: "Triana i rzeka",
        description:
          "Spacer przez Trianę z warsztatami ceramiki, lokalne tapas nad Gwadalkiwirem i rejs lub spacer wzdłuż rzeki na finał.",
      },
    ],
    bestFor: ["andaluzyjski klimat", "flamenco i kultura", "zabytki i pałace", "słońce poza sezonem"],
  }),
  "porto-portugal": buildStory({
    slug: "porto-portugal",
    name: "Porto",
    tagline: "Malownicze miasto nad Douro, gdzie z piwnic dojrzewa porto, a domy mienią się błękitem azulejos.",
    summary:
      "Porto to portugalski klimat w najlepszym wydaniu: spacer po brukowanej, schodzącej do rzeki dzielnicy Ribeira, degustacja w wiekowych piwnicach porto w Vila Nova de Gaia i widok z dwupoziomowego mostu Dom Luís I. To kierunek na 3-4 dni z charakterem — od bajkowej księgarni Livraria Lello po ściany pokryte błękitnymi azulejos. Tanio, klimatycznie i z dobrym jedzeniem, a do tego coraz łatwiej tu dolecieć z Polski.",
    vibe: "klimatycznie, kameralnie i z kieliszkiem porto",
    highlights: [
      "Ribeira — kolorowa, brukowana dzielnica nad rzeką Douro",
      "piwnice porto w Vila Nova de Gaia z degustacjami",
      "most Dom Luís I — dwupoziomowa konstrukcja z widokiem na rzekę",
      "Livraria Lello — jedna z najpiękniejszych księgarni świata",
      "azulejos — błękitne kafle na dworcu São Bento i fasadach kościołów",
    ],
    attractions: [
      "dzielnica Ribeira i bulwar nad Douro",
      "most Dom Luís I",
      "piwnice porto w Vila Nova de Gaia",
      "Livraria Lello",
      "dworzec São Bento z azulejos",
      "wieża Clérigos i kościół São Francisco",
    ],
    foodSpots: [
      "francesinha — flagowa kanapka Porto w sosie i serze",
      "degustacja porto w piwnicach Vila Nova de Gaia",
      "świeże ryby i owoce morza nad rzeką",
      "pastéis de nata i kawa w lokalnych cukierniach",
    ],
    districts: [
      "Ribeira / Baixa — w sercu starego miasta nad rzeką, najbardziej klimatycznie; idealny nocleg",
      "Cedofeita / Bonfim — modne, artystyczne dzielnice z lokalnym życiem",
      "Vila Nova de Gaia — drugi brzeg z piwnicami porto i widokiem na starówkę",
      "Foz do Douro — nadmorska, spokojna okolica tam, gdzie rzeka wpada do oceanu",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Stare miasto i azulejos",
        description:
          "Dworzec São Bento z azulejos, wieża Clérigos i Livraria Lello, a popołudnie na spacerze po schodzącej do rzeki dzielnicy Ribeira.",
      },
      {
        day: 2,
        title: "Most i piwnice porto",
        description:
          "Przejście górnym poziomem mostu Dom Luís I do Vila Nova de Gaia, degustacja w wiekowych piwnicach porto i zachód słońca nad Douro.",
      },
      {
        day: 3,
        title: "Rzeka i ocean",
        description:
          "Rejs po Douro pod sześcioma mostami albo wypad tramwajem do nadmorskiego Foz do Douro — spokojny finał wyjazdu nad wodą.",
      },
    ],
    bestFor: ["klimat i charakter", "wino porto i jedzenie", "kameralny city break", "dobra relacja ceny do jakości"],
  }),
  "paris-france": buildStory({
    slug: "paris-france",
    name: "Paryż",
    tagline: "Wieża Eiffla o zmierzchu, Luwr nad ranem i spacer Sekwaną — stolica, która onieśmiela i uwodzi naraz.",
    summary:
      "Paryż to kierunek, w którym pierwszy widok rozświetlonej wieży Eiffla zostaje na lata, a kolejnego ranka stoisz oko w oko z Moną Lisą w Luwrze. To miasto na 3-4 dni z jasnym rytmem: Pola Elizejskie i Łuk Triumfalny, leniwe popołudnie w kawiarniach Dzielnicy Łacińskiej, wieczór wśród artystów na Montmartrze pod bazyliką Sacré-Cœur. Loty z Polski są częste i tanie, a zimą miasto jest tańsze i mniej zatłoczone.",
    vibe: "elegancko, romantycznie i wielkomiejsko",
    highlights: [
      "wieża Eiffla — najlepiej o zmierzchu, gdy o pełnej godzinie iskrzy światłami",
      "Luwr z Moną Lisą i Wenus z Milo — bilet warto kupić online z wyprzedzeniem",
      "Montmartre i bazylika Sacré-Cœur z panoramą całego miasta",
      "spacer Sekwaną obok katedry Notre-Dame i wyspy Île de la Cité",
      "Pola Elizejskie i Łuk Triumfalny — klasyczna oś miasta",
    ],
    attractions: [
      "wieża Eiffla",
      "Luwr",
      "Montmartre i bazylika Sacré-Cœur",
      "katedra Notre-Dame i Île de la Cité",
      "Pola Elizejskie i Łuk Triumfalny",
      "Musée d'Orsay z impresjonistami",
    ],
    foodSpots: [
      "świeże croissanty i pain au chocolat z lokalnej boulangerie",
      "klasyczne bistra z confit z kaczki i onion soup",
      "macarons od Ladurée i sery z targowych straganów",
    ],
    districts: [
      "Le Marais — modny, klimatyczny, świetny na kawiarnie i wieczór",
      "Quartier Latin — studencki i gwarny, blisko Sorbony i Panteonu",
      "Saint-Germain-des-Prés — elegancko, kameralnie, legendarne kawiarnie literackie",
      "Montmartre — artystyczny klimat i widok, choć dalej od centrum",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Klasyczny Paryż",
        description:
          "Wieża Eiffla i ogrody Trocadéro, potem spacer Sekwaną do Île de la Cité i Notre-Dame, a wieczorem Pola Elizejskie aż po rozświetlony Łuk Triumfalny.",
      },
      {
        day: 2,
        title: "Sztuka i kawiarnie",
        description:
          "Luwr tuż po otwarciu (mniejsze kolejki), lunch w Dzielnicy Łacińskiej, popołudnie z impresjonistami w Musée d'Orsay i leniwa kawa w Saint-Germain.",
      },
      {
        day: 3,
        title: "Montmartre i klimat",
        description:
          "Podejście na Montmartre, bazylika Sacré-Cœur z panoramą, uliczki artystów na Place du Tertre, a na koniec spacer przez klimatyczny Marais.",
      },
    ],
    bestFor: ["romantyczny wyjazd", "sztuka i muzea", "klasyczny city break", "zakupy i moda"],
  }),
  "london-uk": buildStory({
    slug: "london-uk",
    name: "Londyn",
    tagline: "Big Ben nad Tamizą, klejnoty koronne w Tower i nocne życie Soho — światowa metropolia bez znudzenia.",
    summary:
      "Londyn działa wtedy, gdy chcesz mieć wszystko naraz: koronne klejnoty i krukami strzeżony Tower, darmowe arcydzieła British Museum z Kamieniem z Rosetty, panoramę z London Eye i wieczorne pubowe życie Soho. To kierunek na 3-4 dni, w którym czerwone autobusy i metro dowiozą cię wszędzie. Loty z Polski są bardzo częste, a większość wielkich muzeów jest darmowa — co realnie ratuje budżet w drogim mieście.",
    vibe: "wielkomiejsko, różnorodnie i z energią",
    highlights: [
      "Tower of London z klejnotami koronnymi i strażnikami Beefeaters",
      "British Museum z Kamieniem z Rosetty i marmurami z Partenonu — wstęp darmowy",
      "Pałac Westminsterski z Big Benem i Opactwo Westminsterskie",
      "panorama z koła London Eye nad Tamizą",
      "targ i kanały Camden oraz nocne życie Soho",
    ],
    attractions: [
      "Tower of London i Tower Bridge",
      "British Museum",
      "Pałac Westminsterski z Big Benem",
      "London Eye",
      "Camden Market",
      "Buckingham Palace i zmiana warty",
    ],
    foodSpots: [
      "fish and chips w klasycznym pubie",
      "street food w Borough Market i Camden Market",
      "popołudniowa herbata (afternoon tea) z babeczkami",
    ],
    districts: [
      "Soho — w sercu miasta, teatry, bary i życie do późna",
      "Covent Garden — uliczni artyści, sklepy, blisko wszystkiego",
      "South Bank — nad Tamizą, przy London Eye i muzeach",
      "Camden — alternatywny klimat, targ i muzyka",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Korona i rzeka",
        description:
          "Tower of London z klejnotami koronnymi, przejście przez Tower Bridge, a po południu spacer South Bankiem do London Eye po panoramę nad Tamizą.",
      },
      {
        day: 2,
        title: "Władza i muzea",
        description:
          "Westminster z Big Benem i Opactwem, zmiana warty pod Buckingham Palace, a potem darmowe godziny w British Museum z Kamieniem z Rosetty.",
      },
      {
        day: 3,
        title: "Targi i klimat dzielnic",
        description:
          "Poranek na targu Camden, street food nad kanałem, a wieczór w gwarnym Soho lub Covent Garden z teatrem albo pubem.",
      },
    ],
    bestFor: ["muzea za darmo", "city break z rozmachem", "zakupy i teatr", "wyjazd z nastolatkami"],
  }),
  "prague-czechia": buildStory({
    slug: "prague-czechia",
    name: "Praga",
    tagline: "Most Karola o świcie, zegar Orloj wybijający godzinę i kufel piwa taniej niż w Polsce — bajka tuż za miedzą.",
    summary:
      "Praga to jeden z najłatwiejszych i najtańszych kierunków z Polski — dojedziesz autem, autokarem albo pociągiem, a klimat dostajesz iście bajkowy. Spacer Mostem Karola o poranku, gdy nie ma jeszcze tłumów, wspinaczka na Zamek na Hradczanach z panoramą czerwonych dachów i wybijający co godzinę zegar Orloj na Staromiejskim Rynku to żelazny zestaw. Do tego świetne, tanie piwo w Małej Stranie — idealnie na weekend lub 3 dni.",
    vibe: "bajkowo, klimatycznie i blisko Polski",
    highlights: [
      "Most Karola o świcie, zanim wejdą tłumy i tłoczą się portreciści",
      "Zamek na Hradczanach z katedrą św. Wita i panoramą miasta",
      "średniowieczny zegar Orloj na Staromiejskim Rynku co pełną godzinę",
      "klimatyczne uliczki Małej Strany i Ściana Lennona",
      "czeskie piwo i knajpki taniej niż w wielu polskich miastach",
    ],
    attractions: [
      "Most Karola",
      "Zamek na Hradczanach i katedra św. Wita",
      "Staromiejski Rynek i zegar Orloj",
      "Mala Strana i Ściana Lennona",
      "Wzgórze Petřín z wieżą widokową",
      "dzielnica żydowska Josefov",
    ],
    foodSpots: [
      "vepřo knedlo zelo i gulasz w lokalnej hospodzie",
      "trdelník prosto z rożna na starówce",
      "lane piwo Pilsner i Kozel w klasycznych piwiarniach",
    ],
    districts: [
      "Stare Miasto (Staré Město) — w sercu zabytków, blisko wszystkiego",
      "Mala Strana — bajkowe uliczki pod zamkiem, najbardziej klimatycznie",
      "Nowe Miasto (Nové Město) — Plac Wacława, hotele i wygodna baza",
      "Vinohrady — spokojniej, lokalnie, modne kawiarnie z dala od tłumów",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Starówka i Orloj",
        description:
          "Staromiejski Rynek i zegar Orloj na pełną godzinę, spacer wąskimi uliczkami, a wieczór przy kuflu piwa w klimatycznej hospodzie.",
      },
      {
        day: 2,
        title: "Most i zamek",
        description:
          "Most Karola wcześnie rano dla pustych kadrów, podejście na Zamek na Hradczanach i katedrę św. Wita, a po południu uliczki Małej Strany i Ściana Lennona.",
      },
      {
        day: 3,
        title: "Widoki i smaki",
        description:
          "Wjazd kolejką na wzgórze Petřín po panoramę, spacer wśród zieleni, a na koniec ostatni gulasz i piwo przed powrotem.",
      },
    ],
    bestFor: ["weekend blisko Polski", "tani wyjazd", "bajkowy klimat", "piwo i smaki"],
  }),
  "vienna-austria": buildStory({
    slug: "vienna-austria",
    name: "Wiedeń",
    tagline: "Pałac Schönbrunn, kawa z tortem Sachera i walc nad Dunajem — cesarska stolica w wielkim stylu.",
    summary:
      "Wiedeń to kierunek dla tych, którzy lubią styl, klasę i porządek: cesarski przepych pałacu Schönbrunn z ogrodami, dawna rezydencja Habsburgów Hofburg i strzelista katedra św. Szczepana w samym sercu miasta. Nieodłączny element to wiedeńskie kawiarnie, gdzie nad filiżanką melange podają oryginalny tort Sachera. Blisko z Polski (autem, pociągiem lub tanim lotem), świetnie na 2-3 dni — zwłaszcza zimą, gdy działają jarmarki bożonarodzeniowe.",
    vibe: "elegancko, cesarsko i z klasą",
    highlights: [
      "pałac Schönbrunn z ogrodami i Gloriette na wzgórzu",
      "kawiarnie z oryginalnym tortem Sachera i kawą melange",
      "katedra św. Szczepana i wejście na wieżę po panoramę",
      "Hofburg — zimowa rezydencja Habsburgów ze skarbcem cesarskim",
      "reprezentacyjna Ringstrasse z Operą i ratuszem",
    ],
    attractions: [
      "pałac Schönbrunn",
      "katedra św. Szczepana",
      "Hofburg i skarbiec cesarski",
      "Belweder z Pocałunkiem Klimta",
      "Ringstrasse z Operą Wiedeńską",
      "dzielnica muzeów MuseumsQuartier",
    ],
    foodSpots: [
      "Wiener Schnitzel — klasyczny sznycel wiedeński",
      "tort Sachera i Apfelstrudel w tradycyjnej kawiarni",
      "kiełbaski z budki Würstelstand i targ Naschmarkt",
    ],
    districts: [
      "Innere Stadt — historyczne centrum, blisko katedry i Hofburga",
      "Leopoldstadt — przy parku Prater i Dunaju, spokojniej",
      "Mariahilf — zakupowa ulica i modne knajpki przy Naschmarkcie",
      "Neubau — artystyczny klimat przy dzielnicy muzeów",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Cesarskie centrum",
        description:
          "Katedra św. Szczepana i wejście na wieżę, spacer wzdłuż Hofburga i Ringstrasse, a na koniec dnia kawa z tortem Sachera w tradycyjnej kawiarni.",
      },
      {
        day: 2,
        title: "Schönbrunn i sztuka",
        description:
          "Poranek w pałacu Schönbrunn i jego ogrodach z widokiem z Gloriette, a po południu Pocałunek Klimta w Belwederze i odpoczynek w parku.",
      },
      {
        day: 3,
        title: "Targi i lokalny smak",
        description:
          "Spacer po targu Naschmarkt, sznycel na lunch, a popołudnie w dzielnicy muzeów MuseumsQuartier lub na kole widokowym w parku Prater.",
      },
    ],
    bestFor: ["elegancki city break", "kawiarnie i desery", "jarmarki zimą", "kultura i sztuka"],
  }),
  "istanbul-turkey": buildStory({
    slug: "istanbul-turkey",
    name: "Stambuł",
    tagline: "Hagia Sophia, śpiew muezina znad Bosforu i tysiąc straganów Wielkiego Bazaru — miasto na styku dwóch kontynentów.",
    summary:
      "Stambuł to jedyne miasto leżące na dwóch kontynentach i jeden z najbardziej intensywnych kierunków, jakie da się odwiedzić w 3-4 dni. W dzielnicy Sultanahmet naprzeciw siebie stoją Hagia Sophia i Błękitny Meczet, obok wznosi się sułtański Pałac Topkapı, a w labiryncie Wielkiego Bazaru targujesz się o dywany i przyprawy. Rejs po Bosforze między Europą a Azją domyka obraz. Tanie loty z Polski i korzystne ceny czynią go bardzo opłacalnym.",
    vibe: "orientalnie, intensywnie i na styku kultur",
    highlights: [
      "Hagia Sophia — bizantyjska bazylika, potem meczet, dziś znów świątynia",
      "Błękitny Meczet z sześcioma minaretami i kaflami z İzniku",
      "Wielki Bazar — tysiące straganów z dywanami, złotem i przyprawami",
      "Pałac Topkapı z haremem i skarbcem sułtanów",
      "rejs po Bosforze między europejskim a azjatyckim brzegiem",
    ],
    attractions: [
      "Hagia Sophia",
      "Błękitny Meczet",
      "Pałac Topkapı",
      "Wielki Bazar i Bazar Egipski (Korzenny)",
      "Cysterna Bazyliki (podziemny zbiornik)",
      "wieża Galata z panoramą miasta",
    ],
    foodSpots: [
      "kebab i köfte w lokalnych lokantach",
      "świeże ryby z grilla na moście Galata",
      "baklawa, lokum i mocna turecka kawa lub herbata çay",
    ],
    districts: [
      "Sultanahmet — serce zabytków, naprzeciw Hagia Sophia i Błękitnego Meczetu",
      "Beyoğlu / Galata — modniej, ulica İstiklal i wieczorne życie",
      "Karaköy — nadbrzeżnie, kawiarnie i klimat z widokiem na wodę",
      "Kadıköy — azjatycki brzeg, lokalnie i bez tłumów turystów",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Serce Sultanahmet",
        description:
          "Hagia Sophia tuż po otwarciu, naprzeciwko Błękitny Meczet, a po południu chłodna Cysterna Bazyliki i spacer po starym mieście o zachodzie słońca.",
      },
      {
        day: 2,
        title: "Pałac i bazary",
        description:
          "Poranek w Pałacu Topkapı z haremem i skarbcem, a potem targowanie się w Wielkim Bazarze i aromaty Bazaru Egipskiego z przyprawami.",
      },
      {
        day: 3,
        title: "Bosfor i druga strona",
        description:
          "Rejs po Bosforze między kontynentami, wejście na wieżę Galata po panoramę, a wieczór wśród kawiarni Beyoğlu przy ulicy İstiklal.",
      },
    ],
    bestFor: ["orient i kultura", "intensywny city break", "tani wyjazd", "jedzenie i bazary"],
  }),
  "heraklion-greece": buildStory({
    slug: "heraklion-greece",
    name: "Kreta",
    tagline: "Pałac w Knossos, różowy piasek Elafonisi i wąwóz Samaria — największa grecka wyspa, która ma wszystko.",
    summary:
      "Kreta to największa i najbardziej różnorodna grecka wyspa — kierunek, na który Polacy latają chętnie na tydzień all inclusive, bo łączy gwarantowane słońce, baśniowe plaże i prawdziwą historię. Z Heraklionu blisko do pałacu w Knossos, kolebki cywilizacji minojskiej, a zachodnia część kusi laguną Balos i różowym piaskiem Elafonisi. Aktywni ruszają przez 16-kilometrowy wąwóz Samaria. Sezon trwa od maja do października, a wieczory spędza się w tawernach.",
    vibe: "plażowo, słonecznie i z historią",
    highlights: [
      "pałac w Knossos — kolebka cywilizacji minojskiej i mit o Minotaurze",
      "plaża Elafonisi z różowym piaskiem i płytką, ciepłą laguną",
      "laguna Balos z turkusową wodą — jedna z najpiękniejszych w Grecji",
      "wąwóz Samaria — 16 km trekkingu przez Białe Góry",
      "weneckie miasteczko Chania z malowniczym starym portem",
    ],
    attractions: [
      "pałac w Knossos",
      "plaża Elafonisi",
      "laguna Balos",
      "wąwóz Samaria",
      "stare miasto i port w Chanii",
      "twierdza Koules i stare miasto Heraklionu",
    ],
    foodSpots: [
      "dakos, ślimaki i sery w wiejskich tawernach",
      "świeże ryby i owoce morza w porcie Chanii",
      "raki i miód z greckim jogurtem na deser",
    ],
    districts: [
      "Chania — najpiękniejsze stare miasto, klimat na pobyt i wieczory",
      "Heraklion — stolica i lotnisko, blisko Knossos, wygodna baza",
      "Rethymno — wenecka starówka i długa plaża, rodzinnie",
      "Agios Nikolaos — kameralny kurort nad zatoką Mirabello",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Plaża i aklimatyzacja",
        description:
          "Pierwszy dzień na odpoczynek przy hotelu i kąpiele w morzu, a na wieczór spacer i kolacja w nadmorskiej tawernie z widokiem na zachód słońca.",
      },
      {
        day: 2,
        title: "Knossos i Heraklion",
        description:
          "Poranek w pałacu w Knossos śladem cywilizacji minojskiej, a po południu stare miasto Heraklionu, twierdza Koules i lokalny lunch.",
      },
      {
        day: 3,
        title: "Zachód wyspy",
        description:
          "Wycieczka na różową Elafonisi lub do laguny Balos, kąpiel w turkusowej wodzie, a w drodze powrotnej wenecki port w Chanii.",
      },
    ],
    bestFor: ["wakacje all inclusive", "plaże i słońce", "wyjazd rodzinny", "historia i natura"],
  }),
  "rhodes-greece": buildStory({
    slug: "rhodes-greece",
    name: "Rodos",
    tagline: "Średniowieczne mury Starego Miasta, akropol w Lindos i motyle w dolinie — słoneczna wyspa joannitów.",
    summary:
      "Rodos to wyspa, która łączy beztroskie wakacje all inclusive z naprawdę mocną dawką historii — idealnie na tydzień z Polski. Otoczone murami Stare Miasto Rodos to jeden z najlepiej zachowanych średniowiecznych zespołów w Europie i obiekt UNESCO, a na południu nad wsią Lindos góruje antyczny akropol z widokiem na lazurową zatokę. Latem w Dolinie Motyli zlatują się tysiące motyli. Słońce świeci tu wyjątkowo długo, niemal do października.",
    vibe: "słonecznie, historycznie i wakacyjnie",
    highlights: [
      "Stare Miasto Rodos w obrębie murów — obiekt UNESCO i Pałac Wielkich Mistrzów",
      "Lindos z antycznym akropolem nad białą wsią i zatoką",
      "Dolina Motyli, gdzie latem osiadają tysiące motyli",
      "kurort i plaże z bogatą ofertą hoteli all inclusive",
      "wyjątkowo długi sezon — słońce niemal do października",
    ],
    attractions: [
      "Stare Miasto Rodos i Pałac Wielkich Mistrzów",
      "akropol w Lindos",
      "Dolina Motyli (Petaloudes)",
      "zatoka Anthony Quinn",
      "termy w Kallithei",
      "góra Filerimos z klasztorem",
    ],
    foodSpots: [
      "souvlaki i gyros w tawernach starego miasta",
      "świeże ryby i ośmiornica w portowych knajpkach",
      "grecka sałatka i melon na tarasie z widokiem na morze",
    ],
    districts: [
      "Stare Miasto Rodos — w murach, klimatycznie, blisko zabytków",
      "Lindos — biała wieś pod akropolem, malowniczo i wakacyjnie",
      "Faliraki — kurort z plażami i hotelami all inclusive, rodziny i grupy",
      "Kolymbia — spokojniej, zielono, dobre na rodzinny relaks",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Plaża i powitanie wyspy",
        description:
          "Odpoczynek przy hotelu i pierwsze kąpiele, a wieczorem spacer po okolicy i kolacja przy świeżych rybach z greckim winem.",
      },
      {
        day: 2,
        title: "Średniowieczne miasto",
        description:
          "Spacer w murach Starego Miasta Rodos, Pałac Wielkich Mistrzów i Ulica Rycerzy, a po południu plażowanie albo termy w Kallithei.",
      },
      {
        day: 3,
        title: "Lindos i motyle",
        description:
          "Wyjazd do Lindos i podejście na akropol nad białą wsią, kąpiel w zatoce, a w drodze powrotnej latem przystanek w Dolinie Motyli.",
      },
    ],
    bestFor: ["wakacje all inclusive", "plaże i słońce", "historia w tle", "rodziny i pary"],
  }),
  "santa-cruz-de-tenerife-spain": buildStory({
    slug: "santa-cruz-de-tenerife-spain",
    name: "Teneryfa",
    tagline: "Wulkan Teide ponad chmurami, czarne i złote plaże i wieczne słońce — największa z Wysp Kanaryjskich.",
    summary:
      "Teneryfa to kanaryjski kierunek na całoroczne wakacje — leci się tu z Polski nawet zimą po pewne słońce i 20 stopni, gdy w kraju pada śnieg. Nad wyspą góruje wulkan Teide, najwyższy szczyt Hiszpanii, na który wjeżdża się kolejką ponad chmury. Na południu czekają nasłonecznione kurorty Los Cristianos i Costa Adeje z plażami i hotelami all inclusive, a rodziny pokochały park Loro Parque. Dziki masyw Anaga to raj dla miłośników natury.",
    vibe: "wulkanicznie, słonecznie i całorocznie",
    highlights: [
      "wulkan Teide — najwyższy szczyt Hiszpanii, wjazd kolejką ponad chmury",
      "Loro Parque — jeden z najlepszych parków zwierząt w Europie",
      "nasłonecznione kurorty Los Cristianos i Costa Adeje z plażami",
      "dziki, zielony masyw Anaga z laurowymi lasami i szlakami",
      "wieczne słońce — kierunek na wakacje także zimą",
    ],
    attractions: [
      "Park Narodowy Teide i kolejka linowa",
      "Loro Parque",
      "Costa Adeje i Playa de las Américas",
      "masyw i lasy Anaga",
      "stare miasto La Laguna (UNESCO)",
      "klify Los Gigantes",
    ],
    foodSpots: [
      "papas arrugadas z pikantnym sosem mojo",
      "świeże ryby i owoce morza w nadmorskich guachinches",
      "lokalne banany i wino z winnic u stóp Teide",
    ],
    districts: [
      "Costa Adeje — elegancki kurort, najlepsze plaże i hotele dla rodzin",
      "Los Cristianos / Playa de las Américas — tętniący życiem kurort all inclusive",
      "Puerto de la Cruz — klimat północy, przy Loro Parque, spokojniej",
      "Santa Cruz de Tenerife — stolica i lotnisko, miejski klimat i zakupy",
    ],
    miniPlan: [
      {
        day: 1,
        title: "Plaża i kurort",
        description:
          "Relaks na plaży w Costa Adeje lub Los Cristianos, kąpiele w Atlantyku, a wieczorem spacer promenadą i kolacja z widokiem na ocean.",
      },
      {
        day: 2,
        title: "Wulkan ponad chmurami",
        description:
          "Wyprawa do Parku Narodowego Teide, wjazd kolejką w stronę szczytu i księżycowe krajobrazy kaldery, a w drodze powrotnej winnice i punkty widokowe.",
      },
      {
        day: 3,
        title: "Zwierzęta albo dzika natura",
        description:
          "Dzień w Loro Parque z rodziną albo szlaki w zielonym masywie Anaga, a na koniec stare miasto La Laguna lub klify Los Gigantes.",
      },
    ],
    bestFor: ["wakacje także zimą", "plaże i słońce", "wyjazd rodzinny", "natura i wulkan"],
  }),
};

function genericStory(destination: DestinationProfile): DestinationStory {
  const isCoastal = destination.beachScore >= 0.8;
  const isNature = destination.natureScore >= 0.8;
  const media = getDestinationMedia(destination);

  return {
    slug: destination.slug,
    name: destination.city,
    tagline: `Kierunek przygotowany pod krótki lub średni wyjazd do ${destination.city}.`,
    summary: `${destination.city} w ${destination.country} dobrze sprawdza się wtedy, gdy chcesz połączyć wygodny dojazd, sensowny budżet i jasny plan wyjazdu bez przeciazenia logistyka.`,
    vibe: isCoastal ? "nadmorski i relaksujący" : isNature ? "spokojny i krajobrazowy" : "miejski i zdecydowany",
    heroImage: media.heroImage,
    gallery: media.gallery,
    heroVideoPoster: media.poster,
    highlights: [
      isCoastal ? "dobre warunki na pobyt blisko wody" : "główna strefa zwiedzania i spacerów",
      destination.sightseeingScore > 0.8 ? "dużo miejsc do zwiedzania" : "czytelny city break bez nadmiaru logistyki",
      destination.accessScore > 0.8 ? "łatwy dojazd z Polski" : "trochę spokojniejszy rytm podróży",
    ],
    attractions: [
      destination.sightseeingScore > 0.8 ? "stare miasto i główna dzielnica spacerówa" : "centralna część miasta i okolice na pierwszy spacer",
      destination.beachScore > 0.6 ? "plażą i promenada" : "punkty widokowe",
      destination.sightseeingScore > 0.8 ? "najmocniejsze zabytki i muzea" : "lokalne dzielnice i spokojniejsze trasy",
    ],
    foodSpots: ["lokalne restauracje", "kawiarnie na sniadanie lub lunch", "miejsca z regionalna kuchnia"],
    districts: [],
    miniPlan: [
      {
        day: 1,
        title: "Przyjazd i orientacja",
        description: `Pierwszy spacer po ${destination.city}, lekki plan na wieczór i poznanie głównej osi miasta.`,
      },
      {
        day: 2,
        title: "Najmocniejsze miejsca",
        description: "Zwiedzanie kluczowych punktów, dobra przerwa na lunch i bardziej swiadomy wybór kolejnych kroków.",
      },
      {
        day: 3,
        title: "Lokalny rytm",
        description: "Dzielnice, jedzenie i mniej oczywiste miejsca, które buduja pelniejszy obraz kierunku.",
      },
    ],
    bestFor: [
      destination.beachScore > 0.7 ? "plażą" : "zwiedzanie",
      destination.cityScore > 0.8 ? "city break" : "spokojniejszy pobyt",
      destination.safetyScore > 0.8 ? "komfortowy wyjazd" : "bardziej budżetowy scenariusz",
    ],
  };
}

export function getDestinationStory(destination: DestinationProfile): DestinationStory {
  const knownStory = destinationStories[destination.slug];
  if (!knownStory) {
    return genericStory(destination);
  }

  const media = getDestinationMedia(destination);
  return {
    ...knownStory,
    heroImage: media.heroImage,
    gallery: media.gallery,
    heroVideoPoster: media.poster,
  };
}

export function getStoryBySlug(slug: string): DestinationStory | undefined {
  return destinationStories[slug];
}

export function getVideoHeroSource(): {
  src: string;
  poster: string;
} {
  return {
    src: "https://videos.pexels.com/video-files/10070712/10070712-hd_1920_1080_24fps.mp4",
    poster: commonImages.coast,
  };
}

export function getFeaturedStorySlugs(): string[] {
  return ["malaga-spain", "barcelona-spain", "lisbon-portugal", "valencia-spain"];
}








