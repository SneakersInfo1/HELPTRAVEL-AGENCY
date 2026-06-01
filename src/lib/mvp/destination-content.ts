import type { DestinationProfile } from "./types";

import { getDestinationMedia, getDestinationMediaBySlug } from "./commercial-assets";

export interface DestinationStory {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  vibe: string;
  heroImage: string;
  gallery: string[];
  heroVideoPoster: string;
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
        title: "Wejscie w rytm miasta",
        description: "Spacer po centrum, wieczór w El Born i pierwszy kontakt z energią Barcelony.",
      },
      {
        day: 2,
        title: "Architektura i główną trasą",
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
    tagline: "Wzgorza, widoki i miejski rytm z charakterem.",
    summary:
      "Lizbona wypada mocno, gdy szukasz klimatu, spacerów, punktów widokowych i spokojniejszego rytmu niż w najbardziej intensywnych stolicach. To kierunek, który zostaje w pamięci i dobrze działa na 4-5 dni.",
    vibe: "widokówo, klimatycznie i z oddechem",
    heroImage: lisbonMedia.heroImage,
    gallery: lisbonMedia.gallery,
    heroVideoPoster: lisbonMedia.poster,
    highlights: [
      "tramwaj 28 i pocztowkowe wzgorza",
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
        title: "Wzgorza i punkty widokowe",
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








