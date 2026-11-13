// Rejestr oficjalnych źródeł per kierunek.
//
// Model językowy nie zna dosłownej treści stron, więc sam z siebie nie poda
// cytatu, który przejdzie mechaniczną kontrolę `evidenceFoundIn`. Researcher
// dostaje więc w prompcie tekst pobrany z adresów z tego rejestru i ma z niego
// PRZEPISAĆ fragmenty. Każdy adres poniżej został pobrany i przeczytany
// 13.11.2026 (status 200); rejestr rozszerza człowiek, nie model.

export interface RegisteredSource {
  url: string;
  publisher: string;
  /** Czego dotyczy strona — podpowiedź dla researchera. */
  covers: string;
}

const SPAIN_INFO = "Turespaña (spain.info)";
const UNESCO = "UNESCO World Heritage Centre";
const GNTO = "Greek National Tourism Organisation (visitgreece.gr)";

export const SOURCE_REGISTRY: Readonly<Record<string, readonly RegisteredSource[]>> = {
  "athens-greece": [
    { url: "https://whc.unesco.org/en/list/404", publisher: UNESCO, covers: "Akropol — wpis na listę światowego dziedzictwa" },
    { url: "https://www.visitgreece.gr/mainland/attica/athens/", publisher: GNTO, covers: "Ateny — dzielnice, lotnisko" },
    { url: "https://www.visitgreece.gr/mainland/attica/", publisher: GNTO, covers: "Attyka — Pireus, Riwiera Ateńska, Sunio" },
  ],
  "rome-italy": [
    { url: "https://whc.unesco.org/en/list/91", publisher: UNESCO, covers: "Historyczne centrum Rzymu" },
    { url: "https://www.italia.it/en/lazio/rome", publisher: "ENIT (italia.it)", covers: "Rzym — główne zabytki, Watykan" },
  ],
  "funchal-portugal": [
    { url: "https://whc.unesco.org/en/list/934", publisher: UNESCO, covers: "Las laurowy Madery" },
    { url: "https://visitmadeira.com/en/what-to-do/nature-seekers/activities/hiking/", publisher: "Visit Madeira", covers: "Szlaki PR i lewady, zasady rezerwacji" },
  ],
  "santa-cruz-de-tenerife-spain": [
    { url: "https://whc.unesco.org/en/list/1258", publisher: UNESCO, covers: "Park Narodowy Teide" },
    { url: "https://www.spain.info/en/region/tenerife-island/", publisher: SPAIN_INFO, covers: "Teneryfa — plaże, Teide, przyroda" },
  ],
  "malaga-spain": [{ url: "https://www.spain.info/en/destination/malaga/", publisher: SPAIN_INFO, covers: "Malaga — plaże, muzea, zabytki" }],
  "valencia-spain": [
    { url: "https://www.spain.info/en/destination/valencia/", publisher: SPAIN_INFO, covers: "Walencja — plaże, Turia, kuchnia, Fallas" },
    { url: "https://whc.unesco.org/en/list/782", publisher: UNESCO, covers: "La Lonja de la Seda" },
  ],
  "barcelona-spain": [
    { url: "https://www.spain.info/en/destination/barcelona/", publisher: SPAIN_INFO, covers: "Barcelona — charakter miasta, zabytki" },
    { url: "https://whc.unesco.org/en/list/320", publisher: UNESCO, covers: "Dzieła Antoniego Gaudíego" },
  ],
};

/** Źródła dla adresu treści: dopasowanie slugów kierunków występujących w ścieżce. */
export function registeredSourcesForTarget(target: string): RegisteredSource[] {
  const path = target.toLowerCase();
  const seen = new Set<string>();
  const result: RegisteredSource[] = [];
  for (const [slug, sources] of Object.entries(SOURCE_REGISTRY)) {
    if (!path.includes(slug)) continue;
    for (const source of sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      result.push(source);
    }
  }
  return result;
}
