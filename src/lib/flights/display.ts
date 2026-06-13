// Normalizacja odpowiedzi /flights/rates do widoku listy ofert (Faza 3.1).
// CZYSTE, client-safe (zero I/O) — używane w komponencie wyników.
//
// Kształt zweryfikowany na próbce (docs/liteapi-flights-sample-rates.json):
// data[].journeys[] — każdy journey to jedna trasa z segmentami i ofertami
// taryf; cheapestOffer = najtańsza taryfa tej trasy. Segmenty niosą
// direction (OUTBOUND/INBOUND), więc round-trip rozdzielamy na dwa „odcinki".

export interface DisplaySegment {
  originCode: string;
  destinationCode: string;
  departureTime: string;
  arrivalTime: string;
  carrierName: string;
  carrierCode: string;
  carrierLogo?: string;
  flightNumber?: string;
}

export interface DisplayLeg {
  direction: "OUTBOUND" | "INBOUND";
  originCode: string;
  destinationCode: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  carriers: string[];
  carrierLogo?: string;
  segments: DisplaySegment[];
}

export interface DisplayOffer {
  offerId: string;
  total: number | null;
  currency: string;
  legs: DisplayLeg[];
  /** Maks. czas trwania spośród odcinków (do sortowania „najszybsze"). */
  maxDurationMinutes: number;
  hasCheckedBag: boolean;
  hasCarryOnBag: boolean;
}

interface RawSegment {
  originCode?: string;
  destinationCode?: string;
  departureTime?: string;
  arrivalTime?: string;
  direction?: string;
  duration?: { minutes?: number };
  carrier?: { marketingName?: string; marketingCode?: string; marketingLogo?: string };
  flight?: { marketingNumber?: string };
}
interface RawJourney {
  cheapestOffer?: {
    offerId?: string;
    pricing?: { display?: { total?: number; currency?: string } };
    baggage?: { hasCheckedBag?: boolean; hasCarryOnBag?: boolean };
  };
  segments?: RawSegment[];
  legDurations?: Array<{ direction?: string; duration?: { minutes?: number } }>;
}

function toSegment(s: RawSegment): DisplaySegment {
  return {
    originCode: s.originCode ?? "",
    destinationCode: s.destinationCode ?? "",
    departureTime: s.departureTime ?? "",
    arrivalTime: s.arrivalTime ?? "",
    carrierName: s.carrier?.marketingName ?? s.carrier?.marketingCode ?? "Przewoźnik",
    carrierCode: s.carrier?.marketingCode ?? "",
    carrierLogo: s.carrier?.marketingLogo,
    flightNumber: s.flight?.marketingNumber,
  };
}

function buildLeg(direction: "OUTBOUND" | "INBOUND", rawSegs: RawSegment[], legDurMin?: number): DisplayLeg | null {
  const segs = rawSegs
    .filter((s) => (s.direction ?? "OUTBOUND").toUpperCase() === direction)
    .sort((a, b) => (a.departureTime ?? "").localeCompare(b.departureTime ?? ""))
    .map(toSegment);
  if (segs.length === 0) return null;
  const first = segs[0];
  const last = segs[segs.length - 1];
  const durationMinutes =
    legDurMin ??
    rawSegs
      .filter((s) => (s.direction ?? "OUTBOUND").toUpperCase() === direction)
      .reduce((sum, s) => sum + (s.duration?.minutes ?? 0), 0);
  const carriers = [...new Set(segs.map((s) => s.carrierName))];
  return {
    direction,
    originCode: first.originCode,
    destinationCode: last.destinationCode,
    departureTime: first.departureTime,
    arrivalTime: last.arrivalTime,
    durationMinutes,
    stops: segs.length - 1,
    carriers,
    carrierLogo: first.carrierLogo,
    segments: segs,
  };
}

export function normalizeJourney(j: RawJourney): DisplayOffer | null {
  const offerId = j.cheapestOffer?.offerId;
  if (!offerId) return null;
  const segs = j.segments ?? [];
  const outDur = j.legDurations?.find((l) => (l.direction ?? "").toUpperCase() === "OUTBOUND")?.duration?.minutes;
  const inDur = j.legDurations?.find((l) => (l.direction ?? "").toUpperCase() === "INBOUND")?.duration?.minutes;
  const legs = [buildLeg("OUTBOUND", segs, outDur), buildLeg("INBOUND", segs, inDur)].filter(
    (l): l is DisplayLeg => l !== null,
  );
  if (legs.length === 0) return null;
  return {
    offerId,
    total: j.cheapestOffer?.pricing?.display?.total ?? null,
    currency: j.cheapestOffer?.pricing?.display?.currency ?? "PLN",
    legs,
    maxDurationMinutes: Math.max(...legs.map((l) => l.durationMinutes)),
    hasCheckedBag: Boolean(j.cheapestOffer?.baggage?.hasCheckedBag),
    hasCarryOnBag: Boolean(j.cheapestOffer?.baggage?.hasCarryOnBag),
  };
}

/** Spłaszcza odpowiedź /api/flights/rates → lista ofert do wyświetlenia. */
export function normalizeRatesResponse(data: unknown): DisplayOffer[] {
  const root = data as { data?: Array<{ journeys?: RawJourney[] }> };
  const journeys = (root.data ?? []).flatMap((d) => d.journeys ?? []);
  return journeys.map(normalizeJourney).filter((o): o is DisplayOffer => o !== null);
}

// ── Helpery formatowania (client) ────────────────────────────────────────────

export function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

export function stopsLabel(stops: number): string {
  if (stops === 0) return "bezpośredni";
  if (stops === 1) return "1 przesiadka";
  return `${stops} przesiadki`;
}

export function fmtMoneyPln(amount: number | null, currency = "PLN"): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
