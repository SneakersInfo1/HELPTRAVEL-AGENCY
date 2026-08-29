"use client";

// Karta oferty lotu (Flights V2). Wyjęta z `flight-results.tsx`, bo była tam
// zrośnięta z pobieraniem danych i filtrami — a to jest element, który trzeba
// móc oglądać i mierzyć osobno.
//
// ── CO SIĘ ZMIENIŁO I DLACZEGO ───────────────────────────────────────────────
//
// GĘSTOŚĆ (mobile). Zmierzone przed: karta 402 px wysokości przy viewport
// 390×844, czyli JEDNA oferta na ekran, a cała lista 9 165 px. Człowiek
// wybierający lot porównuje warianty — przy jednej ofercie na ekran nie
// porównuje, tylko przewija. Cena i CTA siedzą teraz w JEDNYM wierszu zamiast
// w kolumnie, odznaki są w linii nagłówka, a metadane (linia, bagaż) w jednym
// pasku. Cel: ≤ 320 px.
//
// SZEROKOŚĆ (desktop). Zmierzone przed: karta 463 px na monitorze 1920 px.
// Teraz układ jest trzystrefowy i skaluje się do ~1360 px:
//   [ oś czasu rejsów — rośnie ] [ linia + bagaż — 200 px ] [ cena + CTA — 224 px ]
// Kolumna ceny ma STAŁĄ szerokość, żeby przyciski w całej liście stały w jednej
// pionowej linii; rośnie wyłącznie oś czasu, bo to ona niesie informację.
//
// KOLORY. Karta stoi teraz na tokenach z `globals.css` (`ink`, `ink-muted`,
// `line`, `surface-raised`, `brand`, `accent`), a nie na surowej palecie
// Tailwinda (`neutral-900`, `emerald-600`). To nie jest kosmetyka: tokeny są
// tintowane w stronę marki (chroma 0.002–0.018 przy hue 164), a `neutral-*`
// jest czysto szare. Sekcja lotów była jedynym miejscem w serwisie, które
// malowało szarością Tailwinda — stąd wrażenie „innego produktu" po wyjściu
// z homepage.
//
// CENA dostaje `--accent`, bo w tym systemie akcent JEST zarezerwowany dla
// pieniędzy. Wcześniej cena była `emerald-700`, czyli kolorem CTA — cena
// i przycisk krzyczały tym samym głosem i nic nie prowadziło.

import { useState } from "react";
import { Briefcase, ChevronDown, Luggage } from "lucide-react";

import { AirlineLogo } from "@/components/flights/airline-logo";
import { isDirectOffer } from "@/lib/flights/badges";
import { fmtDuration, fmtTime, stopsLabel, type DisplayLeg, type DisplayOffer } from "@/lib/flights/display";
import { averagePerTraveller, formatFlightPrice, formatFlightPriceExact } from "@/lib/flights/money";

interface Props {
  offer: DisplayOffer;
  /** Łączna liczba podróżnych — do średniej na osobę. */
  travellers: number;
  cheapestId: string | null;
  fastestId: string | null;
  bestId: string | null;
  onSelect: () => void;
}

/** Jeden odcinek: godzina → oś → godzina. Wysokość jest tu walutą. */
function LegRow({ leg }: { leg: DisplayLeg }) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <AirlineLogo logoUrl={leg.carrierLogo} code={leg.carrierCode} name={leg.carriers[0]} size={24} />
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <div className="w-[3.25rem] shrink-0 text-right">
          <div className="text-base font-bold leading-tight tabular-nums text-ink">{fmtTime(leg.departureTime)}</div>
          <div className="text-xs leading-tight text-ink-muted">{leg.originCode}</div>
        </div>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-xs leading-tight text-ink-muted">{fmtDuration(leg.durationMinutes)}</div>
          {/* Oś rejsu: kreska z kropką na końcu. Bez emoji — w tym repo ikony
              robi wyłącznie Lucide, a znak ✈ z fontu systemowego wyglądał
              inaczej na każdej platformie. */}
          <div className="relative my-1 h-px bg-line">
            <span className="absolute -top-[3px] right-0 block h-[7px] w-[7px] rounded-full bg-brand" aria-hidden />
          </div>
          <div
            className={`text-xs leading-tight ${leg.stops === 0 ? "font-semibold text-brand" : "text-ink-muted"}`}
          >
            {stopsLabel(leg.stops)}
          </div>
        </div>
        <div className="w-[3.25rem] shrink-0">
          <div className="text-base font-bold leading-tight tabular-nums text-ink">{fmtTime(leg.arrivalTime)}</div>
          <div className="text-xs leading-tight text-ink-muted">{leg.destinationCode}</div>
        </div>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "best" | "cheap" | "fast" | "direct"; children: React.ReactNode }) {
  // Tylko „Najlepszy" jest wypełniony marką. Trzy równie mocne plamy koloru
  // na jednej karcie znoszą się nawzajem i przestają cokolwiek prowadzić.
  const cls =
    tone === "best"
      ? "bg-brand text-white"
      : tone === "cheap"
        ? "bg-brand-soft text-brand-strong ring-1 ring-inset ring-brand/25"
        : "bg-surface-sunken text-ink-muted ring-1 ring-inset ring-line";
  return (
    <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold leading-5 ${cls}`}>{children}</span>
  );
}

/** Pastylka bagażu — ikona niesie znaczenie szybciej niż samo słowo. */
function BagChip({ kind }: { kind: "carry" | "checked" }) {
  const Icon = kind === "carry" ? Briefcase : Luggage;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-muted">
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
      {kind === "carry" ? "podręczny" : "rejestrowany"}
    </span>
  );
}

export function FlightOfferCard({ offer, travellers, cheapestId, fastestId, bestId, onSelect }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  const carrierNames = [...new Set(offer.legs.flatMap((l) => l.carriers))].join(", ");
  const perPerson = averagePerTraveller(offer.total, travellers);
  const direct = isDirectOffer(offer);
  const isCheapest = offer.offerId === cheapestId;
  const isFastest = offer.offerId === fastestId;
  // „Najlepszy wybór" pokazujemy TYLKO wtedy, gdy nie jest to jednocześnie
  // najtańsza oferta. Przy tanich trasach ranking cena/czas prawie zawsze
  // wskazuje najtańszy lot i karta dostawała cztery plakietki naraz
  // („Najlepszy wybór · Najtańszy · Najszybszy · Bezpośredni"), co jest
  // dokładnie tym, przed czym ostrzega brief §13: odznaka bez funkcji
  // informacyjnej. Cztery etykiety o tej samej wadze nie prowadzą oka —
  // rozmywają je.
  const isBest = offer.offerId === bestId && offer.offerId !== cheapestId;
  const hasBadges = isBest || isCheapest || isFastest || direct;

  return (
    <article className="rounded-lg border border-line bg-surface-raised shadow-sm transition hover:shadow-md motion-reduce:transition-none">
      <div className="flex flex-col gap-3 p-4 sm:p-5 xl:flex-row xl:items-stretch xl:gap-6">
        {/* ── Strefa 1: rejsy (rośnie) ── */}
        <div className="min-w-0 flex-1 space-y-2.5">
          {hasBadges && (
            <div className="flex flex-wrap items-center gap-1.5">
              {isBest && <Badge tone="best">Najlepszy wybór</Badge>}
              {isCheapest && <Badge tone="cheap">Najtańszy</Badge>}
              {isFastest && <Badge tone="fast">Najszybszy</Badge>}
              {direct && <Badge tone="direct">Bezpośredni</Badge>}
            </div>
          )}
          {offer.legs.map((leg) => (
            <LegRow key={leg.direction} leg={leg} />
          ))}
        </div>

        {/* ── Strefa 2: przewoźnik + bagaż (stała, chowa się na wąskim) ── */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line pt-3 xl:w-52 xl:shrink-0 xl:flex-col xl:items-start xl:justify-center xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <span className="text-xs font-semibold text-ink">{carrierNames}</span>
          {offer.hasCarryOnBag && <BagChip kind="carry" />}
          {offer.hasCheckedBag && <BagChip kind="checked" />}
          {!offer.hasCarryOnBag && !offer.hasCheckedBag && (
            <span className="text-xs text-ink-muted">Bagaż wg taryfy</span>
          )}
          {offer.fares.length > 1 && (
            <span className="text-xs text-brand">{offer.fares.length} taryfy z bagażem</span>
          )}
        </div>

        {/* ── Strefa 3: cena + CTA (stała szerokość — przyciski w jednej linii) ── */}
        <div className="flex items-end justify-between gap-3 border-t border-line pt-3 xl:w-56 xl:shrink-0 xl:flex-col xl:items-stretch xl:justify-center xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="xl:text-right">
            <div className="text-xl font-bold leading-tight text-accent">
              {formatFlightPriceExact(offer.total, offer.currency)}
            </div>
            <div className="text-xs text-ink-muted">
              {travellers > 1 && perPerson !== null
                ? `śr. ${formatFlightPrice(perPerson, offer.currency)}/os. · wł. opłat`
                : "wł. podatków i opłat"}
            </div>
          </div>
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-brand px-6 font-semibold text-white transition hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 xl:w-full"
          >
            {/* Rozmiar pisma na SPANIE, nie na przycisku: reset
                `button { font-size: inherit }` stoi poza warstwami CSS i bije
                utility Tailwinda — `text-sm` na <button> w tym repo nic nie robi. */}
            <span className="text-sm">Wybierz</span>
          </button>
        </div>
      </div>

      {/* ── Szczegóły: osobny pas, nie przycisk wciśnięty między treść ── */}
      <div className="border-t border-line px-4 sm:px-5">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="flex w-full items-center gap-1 py-2.5 text-left font-semibold text-brand transition hover:opacity-80 active:opacity-60 motion-reduce:transition-none"
        >
          <span className="text-xs">{showDetails ? "Ukryj szczegóły lotu" : "Szczegóły lotu"}</span>
          <ChevronDown
            aria-hidden
            strokeWidth={2.5}
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${showDetails ? "rotate-180" : ""}`}
          />
        </button>
        {showDetails && (
          <div className="space-y-3 pb-4">
            {offer.legs.map((leg) => (
              <div key={leg.direction}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {leg.direction === "OUTBOUND" ? "Wylot" : "Powrót"} · {leg.originCode} → {leg.destinationCode} ·{" "}
                  {fmtDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {leg.segments.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-ink-muted">
                      <AirlineLogo logoUrl={s.carrierLogo} code={s.carrierCode} name={s.carrierName} size={18} />
                      <span className="font-medium text-ink">{s.carrierName}</span>
                      {(s.carrierCode || s.flightNumber) && (
                        <span className="font-mono">{[s.carrierCode, s.flightNumber].filter(Boolean).join(" ")}</span>
                      )}
                      <span className="ml-auto whitespace-nowrap tabular-nums">
                        {fmtTime(s.departureTime)} {s.originCode} → {fmtTime(s.arrivalTime)} {s.destinationCode}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
