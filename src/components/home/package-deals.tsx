import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { formatPLN } from "@/lib/money";

// Sekcja „Cały wyjazd w jednej cenie" (2026-07-03, wzór eSky/lastminute
// na prośbę właściciela). KAŻDA liczba pochodzi ze snapshotu dstprice:v1
// (pola pkg*): lot RT z Warszawy + noce hotelu z TEGO SAMEGO okna dat,
// policzone w cronie z realnych wyszukań. Brak pakietu = brak karty
// (uczciwość > kompletność); sekcja znika całkiem poniżej 3 kart, żeby
// nie świecić pustką.
//
// 2026-07-04 (właściciel: „rozbuduj, ale strona nie może być dłuższa"):
// POZIOMY PASEK ze snapem (1 rząd zamiast 2-rzędowej siatki → krótsza
// strona), bogatsze karty (badge „Lot + hotel", kraj, etykieta ceny,
// chip „Zobacz"), więcej kierunków (do 10 w pasku).

export interface PackageDeal {
  slug: string;
  cityLabel: string;
  countryLabel: string;
  heroImage: string;
  perPersonPln: number;
  checkin: string;
  checkout: string;
  /** Link do wyników hoteli (BEZ dat — user wybiera termin sam). */
  href: string;
}

const MIN_DEALS = 3;
const MAX_DEALS = 10;

function nightsBetween(checkin: string, checkout: string): number {
  return Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86_400_000);
}

// „18–25 paź" — zwięzły polski zakres dat (ten sam miesiąc → raz).
function formatRange(checkin: string, checkout: string): string {
  const fmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });
  const a = new Date(`${checkin}T00:00:00Z`);
  const b = new Date(`${checkout}T00:00:00Z`);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${fmt.format(b)}`;
  }
  return `${fmt.format(a)} – ${fmt.format(b)}`;
}

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n >= 2 && n <= 4) return `${n} noce`;
  return `${n} nocy`;
}

export function PackageDeals({ deals }: { deals: PackageDeal[] }) {
  const sorted = [...deals].sort((a, b) => a.perPersonPln - b.perPersonPln).slice(0, MAX_DEALS);
  if (sorted.length < MIN_DEALS) return null;

  return (
    <section aria-labelledby="package-deals" className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 id="package-deals" className="font-display text-2xl leading-tight text-emerald-950 sm:text-3xl">
          Cały wyjazd w jednej cenie
        </h2>
        {/* Cena „od" pochodzi z KONKRETNEGO terminu na karcie (uczciwość) —
            ale CTA nie narzuca dat: user wybiera je sam w formularzu
            (właściciel 2026-07-04). */}
        <p className="text-xs leading-5 text-neutral-500 sm:text-sm">
          Lot z Warszawy w obie strony + hotel, na osobę przy 2 osobach. Cena z terminu na karcie — daty wybierasz sam.
        </p>
      </div>

      {/* Poziomy pasek ze snapem na WSZYSTKICH szerokościach (1 rząd → strona
          krótsza mimo większej liczby ofert). Szerokości dobrane tak, by
          zawsze wystawał „podgląd" kolejnej karty (sygnał przewijania).
          Ujemne marginesy: scroll bleeduje do krawędzi sekcji. */}
      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 xl:-mx-8 xl:px-8 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {sorted.map((deal) => {
          const nights = nightsBetween(deal.checkin, deal.checkout);
          return (
            <LocalizedLink
              key={deal.slug}
              href={deal.href}
              className="group relative flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)] sm:w-[46%] lg:w-[31%] xl:w-[23.5%]"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={deal.heroImage}
                  alt={`${deal.cityLabel}, ${deal.countryLabel}`}
                  fill
                  sizes="(max-width: 640px) 82vw, (max-width: 1024px) 46vw, 24vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.04]"
                />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">
                  <span aria-hidden>✈</span> Lot + hotel
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate font-display text-xl leading-tight text-emerald-950">{deal.cityLabel}</h3>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-neutral-400">{deal.countryLabel}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {formatRange(deal.checkin, deal.checkout)} · {nightsLabel(nights)}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-neutral-100 pt-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-neutral-500">cena za osobę</p>
                    <p className="text-xl font-bold leading-tight text-emerald-700">
                      od {formatPLN(deal.perPersonPln)}
                      <span className="ml-0.5 text-xs font-semibold text-emerald-700/80">/os.</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition group-hover:bg-emerald-700 group-hover:text-white">
                    Zobacz <span aria-hidden>→</span>
                  </span>
                </div>
              </div>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
