// FAZA 9 — prawdziwe opinie gości z LiteAPI (/data/reviews). Najsilniejszy
// społeczny dowód słuszności — jak Booking. ZASADA: nigdy nie zmyślamy. Wiele
// opinii ma sam wynik bez tekstu albo jest w językach, których polski gość nie
// przeczyta (ja/ru/hu) — takie odfiltrowujemy. Brak nadających się do pokazania
// = sekcji NIE renderujemy (patrz selectReviews → [] i komponent zwraca null).

import { z } from "zod";

import { liteApiRequest } from "./client";

const LiteApiReviewSchema = z
  .object({
    averageScore: z.number().nullish(),
    country: z.string().nullish(),
    type: z.string().nullish(),
    name: z.string().nullish(),
    date: z.string().nullish(),
    headline: z.string().nullish(),
    language: z.string().nullish(),
    pros: z.string().nullish(),
    cons: z.string().nullish(),
    source: z.string().nullish(),
  })
  .passthrough();
export type LiteApiReview = z.infer<typeof LiteApiReviewSchema>;

const LiteApiReviewsResponseSchema = z
  .object({
    data: z.array(LiteApiReviewSchema).optional(),
    total: z.number().nullish(),
  })
  .passthrough();

/** Pobierz opinie hotelu (cache 24h — NIE wołamy na każde wejście). */
export async function getHotelReviews(hotelId: string, limit = 12): Promise<LiteApiReview[]> {
  const res = await liteApiRequest({
    path: "/data/reviews",
    method: "GET",
    keyMode: "public",
    schema: LiteApiReviewsResponseSchema,
    query: { hotelId, limit },
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-reviews", `hotel:${hotelId}`] },
  });
  return res.data ?? [];
}

export interface DisplayReview {
  score: number | null;
  name: string;
  dateIso: string | null;
  /** Treść pozytywna (`pros`). Nazwa `text` zostaje — czyta ją istniejący UI. */
  text: string;
  /**
   * Treść krytyczna (`cons`). Dostawca rozdziela opinię na dwa pola, a my do
   * tej pory pokazywaliśmy TYLKO plusy — czyli selektywnie korzystniejszy
   * obraz obiektu, niż napisał gość. `null`, gdy gość nic nie wpisał
   * (pusty `cons` NIE może renderować pustej karty — brief §13).
   */
  cons: string | null;
  /** false → oznaczamy „opinia w języku angielskim". */
  isPolish: boolean;
  typePl: string | null;
  /** Serwis, z którego pochodzi opinia (np. „tripadvisor") — do atrybucji. */
  source: string | null;
}

const TYPE_PL: Record<string, string> = {
  couple: "para",
  family: "rodzina",
  family_with_young_children: "rodzina z dziećmi",
  family_with_older_children: "rodzina z dziećmi",
  solo: "podróż w pojedynkę",
  solo_traveler: "podróż w pojedynkę",
  business: "podróż służbowa",
  friends: "znajomi",
  group_of_friends: "znajomi",
  group: "grupa",
};

export function reviewerTypePl(type: string | null | undefined): string | null {
  if (!type) return null;
  return TYPE_PL[type.toLowerCase().trim()] ?? null;
}

// Czytelne dla polskiego gościa: polski lub angielski. Resztę (ja/ru/hu…)
// pomijamy — obcy tekst, którego użytkownik nie przeczyta, to szum „scrapera".
function isReadable(lang: string | null | undefined): boolean {
  const l = (lang ?? "").toLowerCase();
  return l.startsWith("pl") || l.startsWith("en");
}

/**
 * Wybierz do `max` opinii DO POKAZANIA: realny tekst (pros), język czytelny
 * (pl/en), polskie najpierw, potem najnowsze. Pusty wynik = sekcja się nie
 * pokazuje. NIGDY nie zmyślamy ani nie tłumaczymy „na siłę".
 */
export function selectReviews(reviews: LiteApiReview[], max = 3): DisplayReview[] {
  const candidates = reviews
    .map((r) => ({ r, text: (r.pros ?? "").trim() }))
    .filter(({ r, text }) => text.length >= 12 && isReadable(r.language));

  candidates.sort((a, b) => {
    const aPl = (a.r.language ?? "").toLowerCase().startsWith("pl") ? 0 : 1;
    const bPl = (b.r.language ?? "").toLowerCase().startsWith("pl") ? 0 : 1;
    if (aPl !== bPl) return aPl - bPl; // polskie najpierw
    return (b.r.date ?? "").localeCompare(a.r.date ?? ""); // potem najnowsze
  });

  const trim = (s: string) => (s.length > 280 ? `${s.slice(0, 277).trimEnd()}…` : s);

  return candidates.slice(0, max).map(({ r, text }) => {
    // Krótkie „cons" typu „-" albo „brak" to wypełniacze formularza, nie treść.
    // Próg 3 znaków odsiewa je, żeby nie renderować pustej krytyki.
    const cons = (r.cons ?? "").trim();
    return {
      score: typeof r.averageScore === "number" ? r.averageScore : null,
      name: (r.name ?? "").trim() || "Gość",
      dateIso: r.date ?? null,
      text: trim(text),
      cons: cons.length >= 3 ? trim(cons) : null,
      isPolish: (r.language ?? "").toLowerCase().startsWith("pl"),
      typePl: reviewerTypePl(r.type),
      source: (r.source ?? "").trim() || null,
    };
  });
}

export function formatReviewDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(d);
}
