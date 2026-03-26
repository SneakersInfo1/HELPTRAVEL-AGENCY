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
  city: image("https://images.unsplash.com/photo-1494526585095-c41746248156"),
  oldTown: image("https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb"),
  night: image("https://images.unsplash.com/photo-1477959858617-67f85cf4f1df"),
  food: image("https://images.unsplash.com/photo-1544025162-d76694265947"),
  seaView: image("https://images.unsplash.com/photo-1467269204594-9661b134dd2b"),
  skyline: image("https://images.unsplash.com/photo-1517411032315-54ef2cb783bb"),
  promenade: image("https://images.unsplash.com/photo-1516483638261-f4dbaf036963"),
  cafe: image("https://images.unsplash.com/photo-1495474472287-4d71bcdd2085"),
  tram: image("https://images.unsplash.com/photo-1522098543979-ffc7f79d3adf"),
};

const malagaMedia = getDestinationMediaBySlug("malaga-spain", { city: "Málaga", country: "Spain" });
const barcelonaMedia = getDestinationMediaBySlug("barcelona-spain", { city: "Barcelona", country: "Spain" });
const lisbonMedia = getDestinationMediaBySlug("lisbon-portugal", { city: "Lizbona", country: "Portugal" });
const valenciaMedia = getDestinationMediaBySlug("valencia-spain", { city: "Walencja", country: "Spain" });

function buildStory(params: Omit<DestinationStory, "slug"> & { slug: string }): DestinationStory {
  return params;
}

const destinationStories: Record<string, DestinationStory> = {
  "malaga-spain": buildStory({
    slug: "malaga-spain",
    name: "Málaga",
    tagline: "Słoneczny city break z plażą, kuchnią i śródziemnomorskim tempem.",
    summary:
      "Málaga łączy klimat nadmorskiego wypoczynku z bardzo przyjemnym centrum, muzeami i dobrym jedzeniem. To jeden z najlepszych kierunków, gdy chcesz mieć plażę, zwiedzanie i premium odczucie w jednym wyjeździe.",
    vibe: "lekko, słonecznie, nowocześnie i bez pośpiechu",
    heroImage: malagaMedia.heroImage,
    gallery: malagaMedia.gallery,
    heroVideoPoster: malagaMedia.poster,
    highlights: [
      "plaża La Malagueta i spacer nad wodą",
      "Alcazaba i widok z Gibralfaro",
      "Calle Larios i centrum na wieczorny spacer",
      "Muzeum Picassa i lokalna kultura",
    ],
    attractions: [
      "Alcazaba",
      "Castillo de Gibralfaro",
      "Muelle Uno",
      "Museo Picasso",
      "Mercado Atarazanas",
      "Playa de la Malagueta",
    ],
    foodSpots: [
      "chiringuitos z sardynkami i owocami morza",
      "tapas bary przy centrum",
      "lokalne kawiarnie przy Calle Larios",
    ],
    districts: ["Centro Histórico", "La Malagueta", "Muelle Uno", "El Palo"],
    miniPlan: [
      {
        day: 1,
        title: "Przylot i spacer przy morzu",
        description: "Lekki start: check-in, plaża, promenada i kolacja z widokiem na port.",
      },
      {
        day: 2,
        title: "Centrum i historia",
        description: "Alcazaba, Gibralfaro, stare miasto i wieczór w tapas barach.",
      },
      {
        day: 3,
        title: "Sztuka i lokalny vibe",
        description: "Muzeum Picassa, Mercado Atarazanas i spokojne odkrywanie dzielnic nadmorskich.",
      },
    ],
    bestFor: ["plaża + zwiedzanie", "city break premium", "krótki wyjazd bez stresu", "dobre jedzenie"],
  }),
  "barcelona-spain": buildStory({
    slug: "barcelona-spain",
    name: "Barcelona",
    tagline: "Mocny city break nad morzem, z architekturą, która robi efekt wow.",
    summary:
      "Barcelona daje wszystko, czego szuka premium city break: plażę, tętniące życie uliczne, świetne jedzenie i architekturę Gaudiego. To bardzo dobry wybór, gdy chcesz poczuć duże miasto, ale bez rezygnacji z nadmorskiego klimatu.",
    vibe: "dynamicznie, stylowo i z dużą dawką miejskiej energii",
    heroImage: barcelonaMedia.heroImage,
    gallery: barcelonaMedia.gallery,
    heroVideoPoster: barcelonaMedia.poster,
    highlights: [
      "Sagrada Família i najważniejsze ikony miasta",
      "Barceloneta oraz spacer nad morzem",
      "Gotycka dzielnica i El Born wieczorem",
      "widoki z Bunkers del Carmel",
    ],
    attractions: ["Sagrada Família", "Park Güell", "Barceloneta", "El Born", "Bunkers del Carmel", "La Boqueria"],
    foodSpots: [
      "tapas bary w El Born",
      "lokalne śniadania z pa amb tomàquet",
      "bary z vermutem i owocami morza",
    ],
    districts: ["Eixample", "Barceloneta", "El Born", "Gràcia"],
    miniPlan: [
      {
        day: 1,
        title: "Pierwsze miasto i zachód słońca",
        description: "Spacer po centrum, wieczór w El Born i kolacja z tapas.",
      },
      {
        day: 2,
        title: "Gaudí i najważniejsze ikony",
        description: "Sagrada Família, Passeig de Gràcia i Park Güell w jednym, wygodnym planie.",
      },
      {
        day: 3,
        title: "Plaża i widoki",
        description: "Barceloneta, kawiarnie nad wodą i punkt widokowy na całe miasto.",
      },
    ],
    bestFor: ["plaża + miasto", "architektura i design", "intensywny city break", "jedzenie i wieczorne wyjścia"],
  }),
  "lisbon-portugal": buildStory({
    slug: "lisbon-portugal",
    name: "Lizbona",
    tagline: "Klimatyczne wzgórza, tramwaje i bardzo przyjemny miejski rytm.",
    summary:
      "Lizbona ma wyjątkowy charakter: jest bardziej nastrojowa niż wiele europejskich stolic, ale nadal bardzo wygodna na krótki wyjazd. Daje świetny balans między widokami, jedzeniem, spacerami i lokalnym klimatem.",
    vibe: "widokowo, stylowo i spokojniej niż w typowym wielkim mieście",
    heroImage: lisbonMedia.heroImage,
    gallery: lisbonMedia.gallery,
    heroVideoPoster: lisbonMedia.poster,
    highlights: [
      "tramwaj 28 i pocztówkowe wzgórza",
      "Alfama z lokalnym klimatem",
      "Belém i spacer nad Tagiem",
      "LX Factory oraz modne miejscówki na wieczór",
    ],
    attractions: ["Alfama", "Belém", "Miradouro de Santa Catarina", "LX Factory", "Time Out Market", "Tram 28"],
    foodSpots: [
      "pastéis de nata w klasycznych cukierniach",
      "seafoodowe knajpki przy nabrzeżu",
      "kawiarnie i markety z lokalnymi przystawkami",
    ],
    districts: ["Alfama", "Baixa", "Bairro Alto", "Belém"],
    miniPlan: [
      {
        day: 1,
        title: "Spacer i punkty widokowe",
        description: "Przejazd tramwajem, miradouros i pierwszy kontakt z atmosferą miasta.",
      },
      {
        day: 2,
        title: "Historyczna Lizbona",
        description: "Alfama, Baixa i najważniejsze miejsca na spokojne odkrywanie miasta.",
      },
      {
        day: 3,
        title: "Jedzenie i zachód słońca",
        description: "Belém, Time Out Market i wieczór przy rzece w dobrym stylu.",
      },
    ],
    bestFor: ["widoki i spacery", "dobry city break", "jedzenie", "kierunek z charakterem"],
  }),
  "valencia-spain": buildStory({
    slug: "valencia-spain",
    name: "Walencja",
    tagline: "Najbardziej zbalansowany kierunek: plaża, design i świetny stosunek ceny do jakości.",
    summary:
      "Walencja to bardzo mocny kompromis między plażą, miastem i budżetem. Jest mniej oczywista niż Barcelona, ale często daje równie dobre wrażenia przy lepszym stosunku ceny do jakości.",
    vibe: "jasno, wygodnie i bez przesadnego tłoku",
    heroImage: valenciaMedia.heroImage,
    gallery: valenciaMedia.gallery,
    heroVideoPoster: valenciaMedia.poster,
    highlights: [
      "Miasto Sztuki i Nauki",
      "Plaża Malvarrosa i promenada",
      "stary rynek i lokalna gastronomia",
      "park Turia idealny na spacer",
    ],
    attractions: [
      "Ciudad de las Artes y las Ciencias",
      "Playa de la Malvarrosa",
      "Mercado Central",
      "Jardín del Turia",
      "La Lonja de la Seda",
      "El Carmen",
    ],
    foodSpots: ["paella w lokalnych restauracjach", "tapas bary w centrum", "kawiarnie i miejsca na spokojny lunch"],
    districts: ["Ciutat Vella", "Eixample", "Ruzafa", "Cabanyal"],
    miniPlan: [
      {
        day: 1,
        title: "Miasto i pierwsze spacery",
        description: "Stare miasto, kawa i lekki wieczór na Ruzafie.",
      },
      {
        day: 2,
        title: "Architektura i park",
        description: "Miasto Sztuki i Nauki, Turia i najlepsze miejskie przestrzenie.",
      },
      {
        day: 3,
        title: "Plaża i lunch",
        description: "Malvarrosa, promenada i paella w spokojniejszym, nadmorskim rytmie.",
      },
    ],
    bestFor: ["plaża + design", "opłacalny city break", "spokojny rytm", "bardzo dobre jedzenie"],
  }),
};

function genericStory(destination: DestinationProfile): DestinationStory {
  const isCoastal = destination.beachScore >= 0.8;
  const isNature = destination.natureScore >= 0.8;
  const media = getDestinationMedia(destination);
  const heroImage = media.heroImage;
  const gallery = media.gallery;

  return {
    slug: destination.slug,
    name: destination.city,
    tagline: `Kierunek dopasowany do ${destination.city} i stylu city break.`,
    summary: `${destination.city} w ${destination.country} to dobry wybór, gdy chcesz połączyć wygodny dojazd, atrakcyjne ceny i konkretne miejsca do zobaczenia.`,
    vibe: isCoastal ? "morski i relaksujący" : isNature ? "spokojny i krajobrazowy" : "miejski i intensywny",
    heroImage,
    gallery,
    heroVideoPoster: media.poster,
    highlights: [
      destination.beachScore > 0.7 ? "dobre warunki na plażę i spacer nad wodą" : "mocne punkty w centrum miasta",
      destination.sightseeingScore > 0.8 ? "dużo miejsc do zwiedzania" : "krótkie, wygodne city breaki",
      destination.accessScore > 0.8 ? "bardzo wygodny dojazd z Polski" : "bardziej spokojne tempo podróży",
    ],
    attractions: [
      `${destination.city} centrum`,
      destination.beachScore > 0.6 ? "lokalne plaże" : "punkty widokowe",
      destination.sightseeingScore > 0.8 ? "główne muzea i zabytki" : "lokalne dzielnice i kawiarnie",
    ],
    foodSpots: ["lokalne restauracje w centrum", "kawiarnie ze śniadaniami i deserami", "miejsca z regionalną kuchnią"],
    districts: ["centrum", "strefa spacerowa", "dzielnice z lokalnym klimatem"],
    miniPlan: [
      {
        day: 1,
        title: "Przyjazd i orientacja",
        description: `Spacer po ${destination.city}, kawa, pierwszy punkt widokowy i wieczór w centrum.`,
      },
      {
        day: 2,
        title: "Najważniejsze atrakcje",
        description: "Zwiedzanie topowych miejsc, przerwa na lunch i spokojne zakończenie dnia.",
      },
      {
        day: 3,
        title: "Lokalny rytm",
        description: "Dzielnice, jedzenie i kilka mniej oczywistych miejsc, które pokazują klimat miasta.",
      },
    ],
    bestFor: [
      destination.beachScore > 0.7 ? "plaża" : "zwiedzanie",
      destination.cityScore > 0.8 ? "city break" : "relaks",
      destination.safetyScore > 0.8 ? "komfortowy wyjazd" : "budget-friendly weekend",
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
