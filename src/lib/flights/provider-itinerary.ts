// Trasa ODCZYTANA OD DOSTAWCY — dla maila i strony potwierdzenia.
//
// ── PROBLEM ──────────────────────────────────────────────────────────────────
//
// `FlightItinerarySnapshot` w rekordzie sesji przychodzi z `sessionStorage`
// przeglądarki (front wysyła go w body prebooka). Do wyceny i do rezerwacji nie
// jest używany — ale mail potwierdzający i strona potwierdzenia mówią z niego
// klientowi, JAKI LOT KUPIŁ. Zdanie „to tylko prezentacja" przestaje być
// niewinne, gdy jest jedynym dokumentem, jaki człowiek dostaje po zapłacie.
//
// ── SKĄD BIERZEMY LEPSZE DANE ────────────────────────────────────────────────
//
// LiteAPI oddaje własną wersję trasy w co najmniej dwóch miejscach:
//   • `POST /flights/prebooks` → `data[0].booking` (klucze zmierzone w
//     `docs/liteapi-flights-sample-prebook.json`: journey, passengers, order,
//     contact, pricing),
//   • `POST /flights/bookings` i `GET /flights/bookings/{id}` → rekord
//     rezerwacji.
//
// Kształt SAMEGO obiektu trasy jest zmierzony — to ten sam `journey` co w
// `/flights/rates` (`docs/liteapi-flights-sample-rates.json`, znormalizowany w
// `display.ts`): `segments[]` z `originCode`/`destinationCode`/`departureTime`/
// `arrivalTime`/`direction`/`carrier.marketingName`/`duration.minutes`, obok
// `baggage.hasCarryOnBag` i `fare.family`. Niezmierzone jest tylko, na jakiej
// GŁĘBOKOŚCI ten obiekt siedzi w odpowiedzi prebooka i bookingu.
//
// Dlatego nie zakładamy ścieżki: schodzimy w dół i bierzemy PIERWSZY węzeł,
// który wygląda jak trasa (ma `segments[]` z kodami lotnisk). Gdy nie ma
// takiego węzła, zwracamy `null` i wołający zostaje przy migawce od klienta —
// czyli dokładnie przy dzisiejszym zachowaniu. Ta funkcja może tylko poprawić
// dane w mailu, nigdy ich nie pogorszyć.

import type { FlightItinerarySnapshot } from "./types";

const MAX_DEPTH = 6;
const MAX_NODES = 400;

interface RawSegment {
  originCode?: unknown;
  destinationCode?: unknown;
  departureTime?: unknown;
  arrivalTime?: unknown;
  direction?: unknown;
  duration?: { minutes?: unknown };
  carrier?: { marketingName?: unknown; marketingCode?: unknown };
}

interface RawItineraryNode {
  segments?: RawSegment[];
  legDurations?: Array<{ direction?: unknown; duration?: { minutes?: unknown } }>;
  baggage?: { hasCarryOnBag?: unknown; hasCheckedBag?: unknown };
  fare?: { family?: unknown };
  cheapestOffer?: { baggage?: RawItineraryNode["baggage"]; fare?: RawItineraryNode["fare"] };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function isIata(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim());
}

/** Węzeł „wygląda jak trasa”: ma segmenty z kodami lotnisk. */
function looksLikeItinerary(node: Record<string, unknown>): node is Record<string, unknown> & RawItineraryNode {
  const segs = node.segments;
  if (!Array.isArray(segs) || segs.length === 0) return false;
  const first = segs[0];
  if (!first || typeof first !== "object") return false;
  const s = first as RawSegment;
  return isIata(s.originCode) && isIata(s.destinationCode);
}

/** Przeszukanie wszerz z twardymi limitami — payload dostawcy bywa gruby. */
function findItineraryNode(payload: unknown): (Record<string, unknown> & RawItineraryNode) | null {
  const queue: Array<{ node: unknown; depth: number }> = [{ node: payload, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_NODES) {
    const { node, depth } = queue.shift()!;
    visited++;
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) continue;
    if (Array.isArray(node)) {
      for (const child of node.slice(0, 20)) queue.push({ node: child, depth: depth + 1 });
      continue;
    }
    const rec = node as Record<string, unknown>;
    if (looksLikeItinerary(rec)) return rec;
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") queue.push({ node: value, depth: depth + 1 });
    }
  }
  return null;
}

function buildLeg(
  direction: "OUTBOUND" | "INBOUND",
  segments: RawSegment[],
  legDurationMinutes?: number,
): FlightItinerarySnapshot["legs"][number] | null {
  const mine = segments
    .filter((s) => (str(s.direction) ?? "OUTBOUND").toUpperCase() === direction)
    .sort((a, b) => (str(a.departureTime) ?? "").localeCompare(str(b.departureTime) ?? ""));
  if (mine.length === 0) return null;

  const first = mine[0];
  const last = mine[mine.length - 1];
  const originCode = str(first.originCode)?.toUpperCase();
  const destinationCode = str(last.destinationCode)?.toUpperCase();
  const departureTime = str(first.departureTime);
  const arrivalTime = str(last.arrivalTime);
  // Odcinek bez kodów lotnisk albo bez godzin nie jest lepszy od migawki
  // klienta — odpuszczamy go w całości zamiast pokazywać puste pola w mailu.
  if (!originCode || !destinationCode || !departureTime || !arrivalTime) return null;

  const summed = mine.reduce((sum, s) => sum + (num(s.duration?.minutes) ?? 0), 0);
  const durationMinutes = legDurationMinutes ?? summed;

  return {
    direction,
    originCode,
    destinationCode,
    departureTime: departureTime.slice(0, 40),
    arrivalTime: arrivalTime.slice(0, 40),
    durationMinutes: Math.max(0, Math.min(10_000, Math.round(durationMinutes))),
    stops: Math.max(0, Math.min(5, mine.length - 1)),
    carrier: (str(first.carrier?.marketingName) ?? str(first.carrier?.marketingCode) ?? "Przewoźnik").slice(0, 80),
  };
}

/**
 * Wyciąga trasę z dowolnej odpowiedzi lotniczej LiteAPI (prebook / book /
 * getBooking). `null`, gdy w payloadzie nie ma nic, co przypomina trasę.
 */
export function extractProviderItinerary(payload: unknown): FlightItinerarySnapshot | null {
  const node = findItineraryNode(payload);
  if (!node) return null;

  const segments = (node.segments ?? []).filter((s): s is RawSegment => Boolean(s) && typeof s === "object");
  const durationOf = (dir: string) =>
    num(node.legDurations?.find((l) => (str(l.direction) ?? "").toUpperCase() === dir)?.duration?.minutes);

  const legs = [buildLeg("OUTBOUND", segments, durationOf("OUTBOUND")), buildLeg("INBOUND", segments, durationOf("INBOUND"))].filter(
    (l): l is FlightItinerarySnapshot["legs"][number] => l !== null,
  );
  if (legs.length === 0) return null;

  const baggage = node.baggage ?? node.cheapestOffer?.baggage;
  const family = str(node.fare?.family) ?? str(node.cheapestOffer?.fare?.family);

  return {
    legs,
    ...(family ? { fareName: family.slice(0, 80) } : {}),
    ...(typeof baggage?.hasCarryOnBag === "boolean" ? { hasCarryOnBag: baggage.hasCarryOnBag } : {}),
    ...(typeof baggage?.hasCheckedBag === "boolean" ? { hasCheckedBag: baggage.hasCheckedBag } : {}),
  };
}

/**
 * Scala trasę od dostawcy z migawką od klienta.
 *
 * Dostawca WYGRYWA polami, które faktycznie przyniósł. Migawka klienta
 * uzupełnia to, czego dostawca nie zwrócił (typowo taryfa i bagaż — one żyją
 * w ofercie, nie w rekordzie rezerwacji). Zwraca też etykietę źródła, żeby
 * mail i strona potwierdzenia dały się rozróżnić w audycie.
 */
export function mergeItineraries(
  provider: FlightItinerarySnapshot | null | undefined,
  client: FlightItinerarySnapshot | null | undefined,
): { itinerary: FlightItinerarySnapshot | undefined; source: "provider" | "provider+client" | "client" | "none" } {
  if (!provider) return { itinerary: client ?? undefined, source: client ? "client" : "none" };
  const filledFromClient =
    provider.fareName === undefined ||
    provider.hasCarryOnBag === undefined ||
    provider.hasCheckedBag === undefined;
  const merged: FlightItinerarySnapshot = {
    legs: provider.legs,
    fareName: provider.fareName ?? client?.fareName,
    hasCarryOnBag: provider.hasCarryOnBag ?? client?.hasCarryOnBag,
    hasCheckedBag: provider.hasCheckedBag ?? client?.hasCheckedBag,
  };
  return { itinerary: merged, source: client && filledFromClient ? "provider+client" : "provider" };
}
