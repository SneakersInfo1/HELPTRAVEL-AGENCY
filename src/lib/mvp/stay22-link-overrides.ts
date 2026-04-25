type OverrideKind = "flights" | "stays" | "attractions" | "cars";

interface OverrideMatch {
  city: string;
  country: string;
  links: Partial<Record<OverrideKind, string>>;
}

const STAY22_OVERRIDES: OverrideMatch[] = [
  {
    city: "antalya",
    country: "turkey",
    links: {
      stays: "https://booking.stay22.com/helptravel/Z7yGSUIU2h",
      flights: "https://booking.stay22.com/helptravel/IsQslEQEFQ",
      attractions: "https://booking.stay22.com/helptravel/uxQ9-7M-yt",
      cars: "https://booking.stay22.com/helptravel/VWWq3k6OHI",
    },
  },
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getStay22OverrideLink(kind: OverrideKind, city: string, country: string): string | undefined {
  const normalizedCity = normalize(city);
  const normalizedCountry = normalize(country);
  const match = STAY22_OVERRIDES.find((entry) => entry.city === normalizedCity && entry.country === normalizedCountry);
  return match?.links[kind];
}
