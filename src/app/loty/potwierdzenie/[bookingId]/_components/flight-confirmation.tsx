"use client";

// Potwierdzenie rezerwacji lotu. Pobiera GET /api/flights/booking/[bookingId]
// (źródło prawdy: status + ticketing odświeżane live GET-em u dostawcy).
//
// ── ZMIANY Flights V2 (2026-08-29) ───────────────────────────────────────────
//
// TRASA NA POTWIERDZENIU. Do tej pory ekran pokazywał numer rezerwacji, status,
// PNR, listę nazwisk i kwotę — i ANI JEDNEJ informacji o locie, który klient
// właśnie kupił. Żadnej daty, godziny, lotniska, przewoźnika. Teraz trasa
// przychodzi z sesji (`itinerary`) i jest pierwszą rzeczą pod statusem.
//
// KWOTA. `formatFlightPriceExact` — „Zapłacono" musi zgadzać się co do grosza
// z wyciągiem z karty, a `maximumFractionDigits: 0` gubiło grosze.
//
// STATUS `pending_confirmation` dostał własny, uczciwy opis: „potwierdzana"
// bez dopisku brzmiało jak awaria, a to normalny stan części taryf GDS.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Info, RefreshCw, XCircle } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { clearFlightFlow } from "@/lib/flights/flow-storage";
import { fmtDuration, fmtTime, stopsLabel } from "@/lib/flights/display";
import { formatFlightPriceExact } from "@/lib/flights/money";
import { FLIGHT_SHELL_NARROW } from "@/lib/flights/layout";

interface ItineraryLeg {
  direction: "OUTBOUND" | "INBOUND";
  originCode: string;
  destinationCode: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  carrier: string;
}

interface BookingData {
  bookingId: string;
  bookingStatus: string;
  /** `paid` | `processing` | `failed` | `pending` — co WIEMY o pieniądzach. */
  paymentStatus: string | null;
  ticketingStatus: string;
  pnr: string | null;
  eTicketNumbers: string[];
  price: number | null;
  currency: string | null;
  passengers: Array<{ firstName: string; lastName: string; type: string }>;
  itinerary: { legs: ItineraryLeg[]; fareName?: string; hasCarryOnBag?: boolean; hasCheckedBag?: boolean } | null;
}

const STATUS: Record<string, { text: string; note: string; tone: "ok" | "wait" | "bad" }> = {
  confirmed: {
    text: "Rezerwacja potwierdzona",
    note: "Przewoźnik potwierdził miejsca. Szczegóły lotu znajdziesz poniżej i w mailu.",
    tone: "ok",
  },
  pending_confirmation: {
    text: "Rezerwacja w trakcie potwierdzania",
    note: "Przewoźnik jeszcze nie odesłał potwierdzenia. To normalne przy części taryf — damy znać mailem, gdy tylko spłynie.",
    tone: "wait",
  },
  // `manual_review` NIE MA stałej treści: rozstrzyga ją `paymentStatus`.
  // Do 2026-08-29 stało tu „Płatność została odnotowana" niezależnie od tego,
  // czy cokolwiek pobraliśmy — czyli obietnica zwrotu nieistniejącego
  // obciążenia. Wypełnia to `noteForManualReview` niżej.
  manual_review: {
    text: "Rezerwacja w weryfikacji",
    note: "",
    tone: "wait",
  },
  cancelled: {
    text: "Rezerwacja anulowana",
    note: "Ta rezerwacja została anulowana. Jeśli to nie Ty o to prosiłeś — napisz do nas.",
    tone: "bad",
  },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long" }).format(d);
}

/**
 * Treść dla `manual_review` — zależna od tego, co wiemy o pieniądzach.
 *
 * `paid` = LiteAPI przyjęło booking albo Stripe potwierdził obciążenie.
 * Wszystko inne (`processing`, `failed`, brak) znaczy NIE WIEMY — i tak trzeba
 * to napisać, zamiast obiecywać zwrot czegoś, czego może nie być.
 */
function noteForManualReview(paymentStatus: string | null): string {
  return paymentStatus === "paid"
    ? "Płatność została potwierdzona, ale rezerwacja wymaga ręcznej weryfikacji. Skontaktujemy się z Tobą jak najszybciej."
    : "Sprawdzamy status Twojej płatności i rezerwacji. Skontaktujemy się z Tobą jak najszybciej — prosimy nie ponawiać płatności.";
}

export function FlightConfirmation({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const purchaseFiredRef = useRef(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/flights/booking/${encodeURIComponent(bookingId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === "not_found" ? "Nie znaleźliśmy tej rezerwacji." : "Nie udało się pobrać statusu.");
        setData(null);
      } else {
        setData(json as BookingData);
        setError(null);
        if (!purchaseFiredRef.current && json.bookingStatus === "confirmed") {
          purchaseFiredRef.current = true;
          track("purchase", { booking_id: bookingId, value: json.price ?? undefined, currency: json.currency ?? undefined, item_category: "flight" });
          clearFlightFlow(); // sprzątanie kontekstu po sukcesie
        }
      }
    } catch {
      setError("Problem z połączeniem.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const base = data ? (STATUS[data.bookingStatus] ?? { text: "Status rezerwacji", note: "", tone: "wait" as const }) : null;
  const s =
    base && data?.bookingStatus === "manual_review"
      ? { ...base, note: noteForManualReview(data.paymentStatus) }
      : base;
  const toneCls =
    s?.tone === "ok"
      ? "border-brand/30 bg-brand-soft"
      : s?.tone === "bad"
        ? "border-error/30 bg-error/5"
        : "border-warning/40 bg-warning/10";
  const StatusIcon = s?.tone === "ok" ? CheckCircle2 : s?.tone === "bad" ? XCircle : Clock;
  const bags = data?.itinerary
    ? [data.itinerary.hasCarryOnBag ? "podręczny" : null, data.itinerary.hasCheckedBag ? "rejestrowany" : null]
        .filter(Boolean)
        .join(" + ")
    : "";

  return (
    <main className={`${FLIGHT_SHELL_NARROW} py-8 sm:py-10`}>
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Twoja rezerwacja lotu</h1>

      {loading && !data && <p className="mt-4 text-sm text-ink-muted">Wczytywanie statusu…</p>}
      {error && <p className="mt-4 rounded-md bg-error/5 px-4 py-3 text-sm font-medium text-error">{error}</p>}

      {data && s && (
        <div className="mt-4 space-y-4">
          <div className={`rounded-lg border p-5 ${toneCls}`}>
            <p className="flex items-center gap-2 text-lg font-bold text-ink">
              <StatusIcon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={2} />
              {s.text}
            </p>
            {s.note && <p className="mt-1.5 text-sm text-ink">{s.note}</p>}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink">
              <span>
                Numer rezerwacji: <span className="font-mono font-semibold">{data.bookingId}</span>
              </span>
              {data.pnr && (
                <span>
                  PNR: <span className="font-mono font-semibold">{data.pnr}</span>
                </span>
              )}
            </div>
          </div>

          {/* Trasa — pierwsza rzecz, której szuka człowiek na potwierdzeniu. */}
          {data.itinerary && data.itinerary.legs.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <h2 className="text-sm font-bold text-ink">Twój lot</h2>
              <div className="mt-2 divide-y divide-line">
                {data.itinerary.legs.map((l) => (
                  <div key={l.direction} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-brand">
                      {l.direction === "OUTBOUND" ? "Wylot" : "Powrót"}
                      <span className="ml-1.5 font-medium normal-case tracking-normal text-ink-muted">
                        · {fmtDateTime(l.departureTime)}
                      </span>
                    </p>
                    <p className="mt-1 text-base font-bold tabular-nums text-ink">
                      {fmtTime(l.departureTime)} {l.originCode} → {fmtTime(l.arrivalTime)} {l.destinationCode}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {fmtDuration(l.durationMinutes)} · {stopsLabel(l.stops)}
                      {l.carrier ? ` · ${l.carrier}` : ""}
                    </p>
                  </div>
                ))}
              </div>
              {(data.itinerary.fareName || bags) && (
                <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
                  {data.itinerary.fareName ? `Taryfa: ${data.itinerary.fareName}` : ""}
                  {data.itinerary.fareName && bags ? " · " : ""}
                  {bags ? `Bagaż w cenie: ${bags}` : ""}
                </p>
              )}
            </div>
          )}

          {/* Ticketing pending — uczciwy komunikat. */}
          {data.bookingStatus === "confirmed" && data.ticketingStatus !== "ticketed" && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              Numer biletu (e-ticket) prześlemy mailem, gdy przewoźnik go wystawi — zwykle w ciągu kilku godzin.
            </p>
          )}

          {data.eTicketNumbers.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <h2 className="text-sm font-bold text-ink">E-bilety</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {data.eTicketNumbers.map((t) => (
                  <li key={t} className="font-mono">{t}</li>
                ))}
              </ul>
            </div>
          )}

          {data.passengers.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <h2 className="text-sm font-bold text-ink">Podróżni</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {data.passengers.map((p, i) => (
                  <li key={i}>
                    {p.firstName} {p.lastName} <span className="text-ink-muted">· {p.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.price !== null && (
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">Zapłacono</span>
                <span className="text-xl font-bold text-accent">
                  {formatFlightPriceExact(data.price, data.currency ?? "PLN")}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Cena zawiera podatki i opłaty lotniskowe.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => load()}
              disabled={loading}
              className="inline-flex h-11 items-center gap-1.5 rounded-md border border-line px-4 font-semibold text-ink transition hover:bg-surface-sunken active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <RefreshCw aria-hidden className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={2} />
              <span className="text-sm">{loading ? "Odświeżam…" : "Odśwież status"}</span>
            </button>
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-md bg-brand px-5 font-semibold transition hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {/* Kolor etykiety na SPANIE: globalne `a { color: inherit }` bije
                  `text-white` postawione na samym <a>. */}
              <span className="text-sm text-white">Strona główna</span>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
