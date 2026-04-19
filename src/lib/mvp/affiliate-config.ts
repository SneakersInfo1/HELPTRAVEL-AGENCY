// Centralna konfiguracja affiliate ID-kow.
// Wszystkie te zmienne ustawiamy w .env.local (lokalnie) i w Vercel Environment Variables (produkcja).
// Komponenty czytajace ID na kliencie wymagaja prefixu NEXT_PUBLIC_.

export interface AffiliateConfig {
  travelpayoutsMarker: string | null; // jeden marker dla calego portfolio Travelpayouts (Aviasales, Tiqets, Klook, Yesim, Kiwitaxi, Localrent, GetRentacar, WeGoTrip, CheapOair, Kiwi.com)
  stay22Aid: string | null; // affiliate id Stay22 (osobny program)
  defaultOriginIata: string; // domyslne lotnisko wylotowe — Polska
  defaultOriginCity: string;
}

export function getAffiliateConfig(): AffiliateConfig {
  return {
    travelpayoutsMarker: process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim() || null,
    stay22Aid: process.env.NEXT_PUBLIC_STAY22_AID?.trim() || null,
    defaultOriginIata: process.env.NEXT_PUBLIC_DEFAULT_ORIGIN_IATA?.trim() || "WAW",
    defaultOriginCity: process.env.NEXT_PUBLIC_DEFAULT_ORIGIN_CITY?.trim() || "Warszawa",
  };
}

// Programy z portfolio Travelpayouts — bazowe URL-e search.
// Kazdy URL przyjmuje marker jako parametr identyfikujacy waszego partnera.
export const travelpayoutsUrls = {
  aviasales: "https://www.aviasales.com",
  kiwicom: "https://www.kiwi.com",
  cheapoair: "https://www.cheapoair.com",
  klook: "https://www.klook.com",
  tiqets: "https://www.tiqets.com",
  wegotrip: "https://wegotrip.com",
  yesim: "https://yesim.app",
  kiwitaxi: "https://kiwitaxi.com",
  localrent: "https://localrent.com",
  getrentacar: "https://getrentacar.com",
} as const;

export type TravelpayoutsProgram = keyof typeof travelpayoutsUrls;

interface BuildLinkOptions {
  destination?: { city: string; country: string };
  origin?: { city?: string; iata?: string };
  campaign?: string; // do tagowania zrodla w Travelpayouts
}

// Buduje URL z markerem. Travelpayouts traktuje query `marker=XXX` jako klucz partnera.
// `sub_id` pozwala potem w panelu zobaczyc, ktora strona daje konwersje.
export function buildTravelpayoutsLink(program: TravelpayoutsProgram, opts: BuildLinkOptions = {}): string {
  const config = getAffiliateConfig();
  const base = travelpayoutsUrls[program];
  if (!config.travelpayoutsMarker) {
    return base; // bez markera daj sam link, zeby nie zwracac pustki
  }

  const url = new URL(base);
  url.searchParams.set("marker", config.travelpayoutsMarker);
  if (opts.campaign) {
    url.searchParams.set("sub_id", opts.campaign);
  }

  // Aviasales akceptuje `origin_iata` i `destination_iata` na URL search.
  // Bez IATA destynacji zostawiamy tylko origin — uzytkownik dokaczy reszte.
  if (program === "aviasales") {
    if (opts.origin?.iata) {
      url.searchParams.set("origin_iata", opts.origin.iata);
    } else {
      url.searchParams.set("origin_iata", config.defaultOriginIata);
    }
  }

  return url.toString();
}

// Stay22 nie nalezy do Travelpayouts — osobny program z wlasnym AID.
// Building link do strony Stay22 z preselected city.
export function buildStay22Link(city: string, country: string, campaign?: string): string {
  const config = getAffiliateConfig();
  if (!config.stay22Aid) {
    return `https://www.booking.com/searchresults.pl.html?ss=${encodeURIComponent(`${city}, ${country}`)}`;
  }
  const url = new URL("https://www.stay22.com/allroad/widget");
  url.searchParams.set("aid", config.stay22Aid);
  url.searchParams.set("address", `${city}, ${country}`);
  if (campaign) {
    url.searchParams.set("campaign", campaign);
  }
  return url.toString();
}
