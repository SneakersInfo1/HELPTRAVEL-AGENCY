"use client";

// Booking.com-style reservation summary card. Shown beside the form (sticky
// right column on lg) and above it on mobile, on BOTH checkout steps — the
// buyer never loses sight of what they're paying for. Replaces the old
// OrderSummaryBanner (this file also took over its date/price helpers).
//
// Client component only because the hotel photo needs an onError fallback
// (house pattern from hotel-card-image.tsx) — everything else is pure props.

import { useState } from "react";

import { ratingLabel } from "@/lib/hotels/rating";
import type { CheckoutPriceWire } from "@/lib/hotels/domain/checkout-price";

interface Props {
  hotelName: string;
  hotelCity?: string;
  photoUrl?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  adults: number;
  board?: string;
  price?: number;
  currency: string;
  /**
   * Znormalizowane rozbicie ceny z PREBOOKA — jedyne wiarygodne źródło tego,
   * co gość płaci teraz, a co na miejscu. Obecne dopiero na kroku płatności;
   * przed prebookiem znamy jedynie cenę orientacyjną z listingu.
   */
  checkoutPrice?: CheckoutPriceWire;
  cancel?: "free" | "nrf";
  cancelUntil?: string;
}

const PL_MONTHS = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
];

interface DateParts {
  day: number;
  monthIdx: number;
  year: number;
}

function parseIsoDate(iso: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), monthIdx: Number(m[2]) - 1, day: Number(m[3]) };
}

// "15–16 cze 2026" (same month) · "30 cze – 2 lip 2026" (same year) ·
// "30 gru 2026 – 2 sty 2027" (year boundary).
export function formatStayRange(checkin: string, checkout: string): string {
  const a = parseIsoDate(checkin);
  const b = parseIsoDate(checkout);
  if (!a || !b) return `${checkin} – ${checkout}`;
  const am = PL_MONTHS[a.monthIdx] ?? "";
  const bm = PL_MONTHS[b.monthIdx] ?? "";
  if (a.year === b.year && a.monthIdx === b.monthIdx) {
    return `${a.day}–${b.day} ${bm} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${am} – ${b.day} ${bm} ${b.year}`;
  }
  return `${a.day} ${am} ${a.year} – ${b.day} ${bm} ${b.year}`;
}

export function formatPlDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const month = PL_MONTHS[d.monthIdx];
  return month ? `${d.day} ${month}` : iso;
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(`${checkin.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${checkout.slice(0, 10)}T00:00:00Z`);
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(1, diff);
}

function nightNoun(n: number): string {
  if (n === 1) return "noc";
  if (n >= 2 && n <= 4) return "noce";
  return "nocy";
}

/**
 * Rozbicie „teraz vs na miejscu" — jedyne miejsce, w którym karta mówi
 * o podatkach, i mówi wyłącznie to, co wynika z danych prebooka.
 *
 * Świadomie NIE pokazujemy „łącznego kosztu pobytu", nawet gdy arytmetycznie
 * dałoby się go policzyć: nie mamy potwierdzenia dostawcy, że `taxesAndFees`
 * wyczerpuje opłaty pobierane w obiekcie. Suma, która okaże się niepełna przy
 * meldowaniu, byłaby tym samym kłamstwem co poprzednie „wł. podatków".
 * Szczegóły i warunek odblokowania: `domain/checkout-price.ts`.
 */
function BreakdownPodatkowy({ price }: { price: CheckoutPriceWire }) {
  if (price.taxSummary === "unknown") {
    // Dostawca nie podał rozbicia — nie zmyślamy ani w jedną, ani w drugą stronę.
    return <p className="mt-0.5 text-right text-[11px] text-neutral-400">płatność w {price.currency}</p>;
  }

  if (price.taxSummary === "all-included") {
    return (
      <p className="mt-0.5 text-right text-[11px] text-neutral-500">
        w tym podatki i opłaty · płatność w {price.currency}
      </p>
    );
  }

  // some-at-property — gość MUSI zobaczyć, że to nie jest całość kosztu.
  const kwota =
    price.payableAtProperty !== null && price.atPropertyCurrency
      ? formatPrice(price.payableAtProperty, price.atPropertyCurrency)
      : null;

  return (
    <div className="mt-3 rounded-lg bg-amber-50 p-2.5 ring-1 ring-amber-200/70">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-amber-900">Dodatkowo na miejscu</span>
        <span className="text-sm font-bold text-amber-900">
          {kwota ?? "kwota wg cennika obiektu"}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {price.atPropertyItems.map((t, i) => (
          <li key={`${t.description ?? "poz"}-${i}`} className="flex justify-between gap-2 text-[11px] text-amber-800">
            <span className="min-w-0 truncate">{t.description ?? "opłata"}</span>
            <span className="shrink-0 tabular-nums">
              {t.amount !== null && t.currency ? formatPrice(t.amount, t.currency) : "wg obiektu"}
            </span>
          </li>
        ))}
      </ul>
      {price.includedItems.length > 0 && (
        // Miks included/excluded — nie wolno napisać ogólnego „wliczone",
        // ale trzeba powiedzieć, że część JEST w cenie.
        <p className="mt-1.5 border-t border-amber-200/70 pt-1.5 text-[11px] text-amber-800">
          Pozostałe podatki i opłaty są już w kwocie powyżej.
        </p>
      )}
      {price.atPropertyHasUncountable && (
        <p className="mt-1 text-[11px] text-amber-800">
          Dostawca nie podał kwoty wszystkich opłat — obiekt poda ją przy meldowaniu.
        </p>
      )}
    </div>
  );
}

/**
 * Co dostawca zmienił między wyborem oferty a prebookiem.
 *
 * Prebook potrafi wrócić z inną ceną, innym wyżywieniem albo innymi zasadami
 * anulacji niż to, co gość widział na liście — zmierzone: ta sama oferta
 * potrafi zmienić cenę o 64 zł w kilka sekund. Gość musi to zobaczyć PRZED
 * płatnością, a nie na wyciągu.
 */
function ZmianyPoPrebooku({ price }: { price: CheckoutPriceWire }) {
  const zmiany: string[] = [];
  const pct = price.priceChangePercent ?? 0;
  if (pct > 0) zmiany.push(`cena wzrosła o ${Math.abs(pct).toFixed(1).replace(".", ",")}%`);
  if (pct < 0) zmiany.push(`cena spadła o ${Math.abs(pct).toFixed(1).replace(".", ",")}%`);
  if (price.boardChanged) zmiany.push("zmieniło się wyżywienie");
  if (price.cancellationChanged) zmiany.push("zmieniły się zasady anulowania");
  if (zmiany.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-3 rounded-lg bg-sky-50 p-2.5 text-[11px] leading-4 text-sky-900 ring-1 ring-sky-200"
    >
      <span className="font-semibold">Oferta została zaktualizowana:</span>{" "}
      {zmiany.join(", ")}. Poniżej jest aktualna kwota — to ona zostanie pobrana.
    </div>
  );
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function reviewsNoun(n: number): string {
  if (n === 1) return "opinia";
  const d = n % 10;
  const dd = n % 100;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "opinie";
  return "opinii";
}

// Minimal board localisation (mirror of the hotel-page labels).
function polishBoard(raw?: string): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes("breakfast")) return "Ze śniadaniem";
  if (r.includes("all-inclusive") || r.includes("all_inclusive") || r === "ai") return "All Inclusive";
  if (r.includes("half")) return "Śniadanie i obiadokolacja (HB)";
  if (r.includes("full")) return "Pełne wyżywienie (FB)";
  if (r.includes("room only") || r === "ro" || r.includes("room_only")) return "Bez wyżywienia";
  return raw;
}

function adultsLabel(n: number): string {
  return n === 1 ? "1 dorosły" : `${n} dorosłych`;
}

export function BookingSummaryCard({
  hotelName,
  hotelCity,
  photoUrl,
  stars,
  rating,
  reviewCount,
  checkin,
  checkout,
  adults,
  board,
  price,
  currency,
  checkoutPrice,
  cancel,
  cancelUntil,
}: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const nights = nightsBetween(checkin, checkout);
  const hasPrice = typeof price === "number" && Number.isFinite(price);
  const perNight = hasPrice ? Math.round(price / nights) : null;
  const perNightExact = perNight !== null && hasPrice && perNight * nights === Math.round(price);
  const boardLabel = polishBoard(board);
  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const starsCount =
    typeof stars === "number" && Number.isFinite(stars)
      ? Math.max(0, Math.min(5, Math.round(stars)))
      : 0;

  return (
    <aside
      aria-label="Podsumowanie rezerwacji"
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      {showPhoto && (
        /* LiteAPI photo hosts are arbitrary supplier CDNs; plain <img> +
           onError fallback is the house pattern (hotel-card-image.tsx). */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={hotelName}
          loading="lazy"
          onError={() => setPhotoFailed(true)}
          className="h-36 w-full object-cover"
        />
      )}

      <div className="p-4">
        {starsCount > 0 && (
          <div aria-label={`Kategoria: ${starsCount} gwiazdek`} className="text-xs leading-none text-amber-500">
            {"★".repeat(starsCount)}
          </div>
        )}
        <h2 className="mt-1 text-base font-bold leading-snug text-neutral-900">{hotelName}</h2>
        {hotelCity && <p className="mt-0.5 text-xs text-neutral-500">{hotelCity}</p>}

        {typeof rating === "number" && rating > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md rounded-bl-none bg-emerald-700 px-1.5 text-xs font-bold text-white">
              {rating.toFixed(1).replace(".", ",")}
            </span>
            <span className="text-xs text-neutral-700">
              <strong>{ratingLabel(rating)}</strong>
              {typeof reviewCount === "number" && reviewCount > 0
                ? ` · ${reviewCount} ${reviewsNoun(reviewCount)}`
                : ""}
            </span>
          </div>
        )}

        <dl className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">Termin</dt>
            <dd className="text-right font-medium text-neutral-900">
              {formatStayRange(checkin, checkout)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">Długość</dt>
            <dd className="font-medium text-neutral-900">
              {nights} {nightNoun(nights)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">Goście</dt>
            <dd className="font-medium text-neutral-900">{adultsLabel(adults)}</dd>
          </div>
          {boardLabel && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">Wyżywienie</dt>
              <dd className="text-right font-medium text-neutral-900">{boardLabel}</dd>
            </div>
          )}
        </dl>

        {cancel === "free" && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <span aria-hidden>✓</span>
            Bezpłatne anulowanie{cancelUntil ? ` do ${formatPlDay(cancelUntil)}` : ""}
          </div>
        )}
        {cancel === "nrf" && (
          <div className="mt-3 inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            Oferta bezzwrotna — najniższa cena za ten pokój
          </div>
        )}

        {hasPrice && perNight !== null && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {nights} {nightNoun(nights)} × {perNightExact ? "" : "ok. "}
                {formatPrice(perNight, currency)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-neutral-900">
                {checkoutPrice ? "Do zapłaty teraz" : "Razem"}
              </span>
              <span className="text-xl font-bold text-neutral-900">
                {formatPrice(price, currency)}
              </span>
            </div>

            {/* ── ETYKIETA PODATKOWA WYNIKA Z DANYCH, NIE Z NADZIEI ──────────
                Do 2026-08-08 stało tu bezwarunkowe „wł. podatków i opłat".
                Pomiar na żywym LiteAPI: nieprawdziwe dla 14 315 z 17 776
                taryf (80,5%), średnio 352 zł nieujawnionej dopłaty — podczas
                gdy strona pokoju mówiła prawdę. Ten sam błąd naprawiono
                wcześniej w `result-card.tsx`; tutaj przetrwał, bo karta
                w ogóle nie dostawała rozbicia podatkowego.
                Pomiar: docs/hotel-redesign/price-integrity-audit.md */}
            {checkoutPrice ? (
              <>
                <BreakdownPodatkowy price={checkoutPrice} />
                <ZmianyPoPrebooku price={checkoutPrice} />
              </>
            ) : (
              // Przed prebookiem znamy tylko cenę orientacyjną z listingu i NIE
              // wiemy, co jest w niej zawarte. Milczenie jest tu jedyną uczciwą
              // opcją — dowiemy się przy potwierdzaniu oferty.
              <p className="mt-0.5 text-right text-[11px] text-neutral-400">
                cena orientacyjna · potwierdzimy ją przed płatnością
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
