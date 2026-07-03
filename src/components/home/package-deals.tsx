import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { formatPLN } from "@/lib/money";

// Sekcja „Cały wyjazd w jednej cenie" (2026-07-03, wzór eSky/lastminute
// na prośbę właściciela). KAŻDA liczba pochodzi ze snapshotu dstprice:v1
// (pola pkg*): lot RT z Warszawy + noce hotelu z TEGO SAMEGO okna dat,
// policzone w cronie z realnych wyszukań. Brak pakietu = brak karty
// (uczciwość > kompletność); sekcja znika całkiem poniżej 3 kart, żeby
// nie świecić pustką.

export interface PackageDeal {
  slug: string;
  cityLabel: string;
  countryLabel: string;
  heroImage: string;
  perPersonPln: number;
  checkin: string;
  checkout: string;
  /** Link do wyników hoteli z WYPEŁNIONYMI datami pakietu. */
  href: string;
}

const MIN_DEALS = 3;

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
  const sorted = [...deals].sort((a, b) => a.perPersonPln - b.perPersonPln).slice(0, 6);
  if (sorted.length < MIN_DEALS) return null;

  return (
    <section aria-labelledby="package-deals" className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 xl:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 id="package-deals" className="font-display text-2xl leading-tight text-emerald-950 sm:text-3xl">
          Cały wyjazd w jednej cenie
        </h2>
        <p className="text-xs leading-5 text-neutral-500 sm:text-sm">
          Lot z Warszawy w obie strony + hotel, na osobę przy 2 osobach. Realne terminy — kliknij i rezerwuj.
        </p>
      </div>

      {/* Mobile: pozioma karuzela ze snapem (kciuk > scroll pionowy);
          desktop: grid 3 kolumny. */}
      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
        {sorted.map((deal) => {
          const nights = nightsBetween(deal.checkin, deal.checkout);
          return (
            <LocalizedLink
              key={deal.slug}
              href={deal.href}
              className="group relative w-[78%] min-w-[78%] snap-start overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)] sm:w-auto sm:min-w-0"
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                <Image
                  src={deal.heroImage}
                  alt={`${deal.cityLabel}, ${deal.countryLabel}`}
                  fill
                  sizes="(max-width: 640px) 78vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.04]"
                />
              </div>
              <div className="flex items-end justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg leading-tight text-emerald-950">{deal.cityLabel}</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatRange(deal.checkin, deal.checkout)} · {nightsLabel(nights)} · lot + hotel
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold leading-tight text-emerald-700">
                    od {formatPLN(deal.perPersonPln)}
                  </p>
                  <p className="text-[11px] text-neutral-500">/os.</p>
                </div>
              </div>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
