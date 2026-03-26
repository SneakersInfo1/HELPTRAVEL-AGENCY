import type { DestinationProfile } from "./types";
import type { DestinationMedia } from "./visuals";

const image = (url: string) => `${url}?auto=format&fit=crop&w=1600&q=82`;

export type TravelProviderKey = "flights" | "stays" | "attractions";

const mediaBySlug: Record<string, DestinationMedia> = {
  "malaga-spain": {
    heroImage: image("https://images.unsplash.com/photo-1511818966892-d7d671e672a2"),
    gallery: [
      image("https://images.unsplash.com/photo-1511988617509-a57c8a288659"),
      image("https://images.unsplash.com/photo-1507525428034-b723cf961d3e"),
      image("https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb"),
    ],
    poster: image("https://images.unsplash.com/photo-1499591934245-40b55745b905"),
    credit: "Málaga i Morze Śródziemne",
  },
  "barcelona-spain": {
    heroImage: image("https://images.unsplash.com/photo-1502602898657-3e91760cbb34"),
    gallery: [
      image("https://images.unsplash.com/photo-1503177119275-0aa32b3a9368"),
      image("https://images.unsplash.com/photo-1464790719320-516ecd75af6c"),
      image("https://images.unsplash.com/photo-1504711434969-e33886168f5c"),
    ],
    poster: image("https://images.unsplash.com/photo-1520975916090-3105956dac38"),
    credit: "Barcelona z architekturą i morzem",
  },
  "lisbon-portugal": {
    heroImage: image("https://images.unsplash.com/photo-1513735492246-483525079686"),
    gallery: [
      image("https://images.unsplash.com/photo-1513735492246-483525079686"),
      image("https://images.unsplash.com/photo-1516815231560-8f41ec531527"),
      image("https://images.unsplash.com/photo-1505761671935-60b3a7427bad"),
    ],
    poster: image("https://images.unsplash.com/photo-1499591934245-40b55745b905"),
    credit: "Lizbona i charakterystyczne wzgórza",
  },
  "valencia-spain": {
    heroImage: image("https://images.unsplash.com/photo-1500375592092-40eb2168fd21"),
    gallery: [
      image("https://images.unsplash.com/photo-1516483638261-f4dbaf036963"),
      image("https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d"),
      image("https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b"),
    ],
    poster: image("https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d"),
    credit: "Walencja, plaża i nowoczesna architektura",
  },
  "rome-italy": {
    heroImage: image("https://images.unsplash.com/photo-1552832230-c0197dd311b5"),
    gallery: [
      image("https://images.unsplash.com/photo-1555597673-b21d5c935865"),
      image("https://images.unsplash.com/photo-1541423408854-5df732b3f6f9"),
      image("https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b"),
    ],
    poster: image("https://images.unsplash.com/photo-1542820229-081e0c12af0b"),
    credit: "Rzym, klasyka i wielkie ikony",
  },
  "prague-czechia": {
    heroImage: image("https://images.unsplash.com/photo-1519677100203-a0e668c92439"),
    gallery: [
      image("https://images.unsplash.com/photo-1541849546-216549ae216d"),
      image("https://images.unsplash.com/photo-1493246507139-91e8fad9978e"),
      image("https://images.unsplash.com/photo-1501785888041-af3ef285b470"),
    ],
    poster: image("https://images.unsplash.com/photo-1519999482648-25049ddd37b1"),
    credit: "Praga, mosty i stare miasto",
  },
  "budapest-hungary": {
    heroImage: image("https://images.unsplash.com/photo-1554072675-66db59dba46f"),
    gallery: [
      image("https://images.unsplash.com/photo-1544989164-31dc3c645987"),
      image("https://images.unsplash.com/photo-1512453979798-5ea266f8880c"),
      image("https://images.unsplash.com/photo-1516550893885-4f8be0d5328b"),
    ],
    poster: image("https://images.unsplash.com/photo-1557825835-70d97c4aa567"),
    credit: "Budapeszt, termy i szerokie panoramy",
  },
  "marrakesh-morocco": {
    heroImage: image("https://images.unsplash.com/photo-1539020140153-e479b8c22e70"),
    gallery: [
      image("https://images.unsplash.com/photo-1512453979798-5ea266f8880c"),
      image("https://images.unsplash.com/photo-1516321318423-f06f85e504b3"),
      image("https://images.unsplash.com/photo-1520045892732-304bc2ac0a4f"),
    ],
    poster: image("https://images.unsplash.com/photo-1518732714860-b62714ce0c59"),
    credit: "Marrakesz, kolor i rytm medyny",
  },
  "athens-greece": {
    heroImage: image("https://images.unsplash.com/photo-1486718448742-163732cd1544"),
    gallery: [
      image("https://images.unsplash.com/photo-1507525428034-b723cf961d3e"),
      image("https://images.unsplash.com/photo-1503177119275-0aa32b3a9368"),
      image("https://images.unsplash.com/photo-1505672678657-cc7037095e7e"),
    ],
    poster: image("https://images.unsplash.com/photo-1506806732259-39c2d0268443"),
    credit: "Ateny, akropol i śródziemnomorski klimat",
  },
};

function fallbackMedia(destination: DestinationProfile): DestinationMedia {
  const city = destination.city.toLowerCase().replace(/\s+/g, "-");
  const country = destination.country.toLowerCase().replace(/\s+/g, "-");

  return {
    heroImage: image("https://images.unsplash.com/photo-1504893524553-b855bce32c67"),
    gallery: [
      image(`https://images.unsplash.com/photo-1493246507139-91e8fad9978e?${city}-${country}`),
      image(`https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?${city}-${country}`),
      image(`https://images.unsplash.com/photo-1493558103817-58b2924bce98?${city}-${country}`),
    ],
    poster: image("https://images.unsplash.com/photo-1500375592092-40eb2168fd21"),
    credit: `${destination.city}, ${destination.country}`,
  };
}

export function getDestinationMedia(destination: DestinationProfile): DestinationMedia {
  return destination.media ?? mediaBySlug[destination.slug] ?? fallbackMedia(destination);
}

export function getDestinationMediaBySlug(slug: string, destination?: Pick<DestinationProfile, "city" | "country">): DestinationMedia {
  return mediaBySlug[slug] ?? fallbackMedia({
    id: slug,
    slug,
    city: destination?.city ?? slug,
    country: destination?.country ?? "",
    visaForPL: true,
    avgTempByMonth: [],
    costIndex: 1,
    beachScore: 0.5,
    cityScore: 0.5,
    sightseeingScore: 0.5,
    nightlifeScore: 0.5,
    natureScore: 0.5,
    safetyScore: 0.5,
    accessScore: 0.5,
    typicalFlightHoursFromPL: 0,
    affiliateLinks: {
      flights: "https://www.google.com",
      stays: "https://www.booking.com",
      attractions: "https://www.google.com",
    },
  });
}
