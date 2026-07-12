// Listing pakietów (krok 1 „Wybierz pobyt"). Server component. Wypełniony
// kontekstem: nagłówek + rekap wyszukiwania (kierunek/daty/osoby) + pasek
// zaufania + sortowana lista bogatych kart. Cena „od" z ofert (nigdy zmyślona —
// PRODUCT.md). Mobile-first (90% ruchu to telefon).

import { formatPLN } from "@/lib/money";

import type { PackageOffer } from "../types";
import { PackageResultsList } from "./PackageResultsList";

function offersLabel(n: number): string {
  if (n === 1) return "1 pakiet";
  if (n >= 2 && n <= 4) return `${n} pakiety`;
  return `${n} pakietów`;
}

function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n >= 2 && n <= 4) return `${n} noce`;
  return `${n} nocy`;
}

function formatRange(from: string, to: string): string {
  const fmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${fmt.format(b)}`;
  return `${fmt.format(a)} – ${fmt.format(b)}`;
}

function paxLabel(adults: number, childrenCount: number): string {
  const a = `${adults} ${adults === 1 ? "dorosły" : "dorosłych"}`;
  if (!childrenCount) return a;
  const c = childrenCount === 1 ? "1 dziecko" : childrenCount >= 2 && childrenCount <= 4 ? `${childrenCount} dzieci` : `${childrenCount} dzieci`;
  return `${a} · ${c}`;
}

const TRUST = ["Ceny w PLN", "Przelot w obie strony w cenie", "Bezpłatna anulacja hotelu", "Płatność jak w sklepie"];

export interface PackageListingContext {
  dateFrom: string;
  dateTo: string;
  adults: number;
  childrenCount?: number;
  /** „Zmień" → powrót do wyszukiwarki (opcjonalnie). */
  changeHref?: string;
}

export function PackageListing({
  offers,
  originLabel,
  destinationCity,
  destinationCountry,
  hrefForOffer,
  context,
}: {
  offers: PackageOffer[];
  originLabel: string;
  destinationCity: string;
  destinationCountry?: string;
  hrefForOffer?: (offer: PackageOffer) => string;
  context?: PackageListingContext;
}) {
  const fromPrice = offers.length
    ? formatPLN(Math.min(...offers.map((o) => o.pricing.pricePerPerson.amount)), "PLN")
    : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
          Lot + hotel: {destinationCity}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
          <span>{offersLabel(offers.length)} z przelotem z {originLabel}</span>
          {fromPrice && (
            <>
              <span aria-hidden className="text-neutral-300">|</span>
              <span className="font-medium text-emerald-700">od {fromPrice} / os.</span>
            </>
          )}
        </p>
      </header>

      {/* Rekap wyszukiwania */}
      {context && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-emerald-900/10 bg-white/70 px-3 py-2 text-sm">
          <span className="font-semibold text-neutral-900">{destinationCity}</span>
          <span aria-hidden className="text-neutral-300">|</span>
          <span className="text-neutral-600">
            {formatRange(context.dateFrom, context.dateTo)} · {nightsLabel(nightsBetween(context.dateFrom, context.dateTo))}
          </span>
          <span aria-hidden className="text-neutral-300">|</span>
          <span className="text-neutral-600">{paxLabel(context.adults, context.childrenCount ?? 0)}</span>
          {context.changeHref && (
            <a
              href={context.changeHref}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <span>Zmień</span>
            </a>
          )}
        </div>
      )}

      {/* Pasek zaufania */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {TRUST.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-emerald-600">
              <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
            </svg>
            {t}
          </span>
        ))}
      </div>

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-emerald-900/10 bg-white p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">Brak pakietów dla tych dat</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">
            Spróbuj innego terminu albo pobliskiego lotniska — pokazujemy tylko hotele z bezpłatną
            anulacją i realnym lotem w cenie.
          </p>
        </div>
      ) : (
        <PackageResultsList
          offers={offers}
          originLabel={originLabel}
          destinationCity={destinationCity}
          destinationCountry={destinationCountry}
          hrefForOffer={hrefForOffer}
        />
      )}
    </section>
  );
}
