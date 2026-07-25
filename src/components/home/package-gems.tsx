import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { formatPLN } from "@/lib/money";

import type { PackageDeal } from "./package-deals";

// Sekcja „Perełki" (2026-07-14, właściciel): za flagą pakietów ZASTĘPUJE dwie
// sekcje — pas „Popularne kierunki" (hero) i „Cały wyjazd w jednej cenie" —
// jedną, mocniejszą (strona się SKRACA, nie wydłuża: PRODUCT.md).
//
// UCZCIWOŚĆ: każda liczba to pkg* ze snapshotu dstprice:v1 (lot RT z Warszawy
// + hotel z TEGO SAMEGO okna dat, policzone w cronie z realnych wyszukań,
// odświeżane automatycznie; wpis starszy niż 48 h znika). Zero zmyślonych cen,
// zero fałszywej presji — „perełka" = realnie najtańszy policzony pakiet.
//
// Układ: poziomy pasek ze snapem (1 rząd), pierwsza karta = wyróżniona
// (najtańsza z całej puli, szersza + badge) — kotwica wzroku jak na dużych OTA.

const MIN_GEMS = 3;
const MAX_GEMS = 12;

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

function GemCard({ deal, featured }: { deal: PackageDeal; featured: boolean }) {
  const nights = nightsBetween(deal.checkin, deal.checkout);
  return (
    <LocalizedLink
      href={deal.href}
      className={`group relative flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)] ${
        featured
          ? "w-[88%] sm:w-[54%] lg:w-[38%] xl:w-[30%]"
          : "w-[76%] sm:w-[42%] lg:w-[27%] xl:w-[21.5%]"
      }`}
    >
      {/* Stała wysokość obrazu (nie aspect): featured jest szersza, a rząd ma
          trzymać RÓWNĄ linię góry/dołu kart. */}
      <div className="relative h-44 overflow-hidden sm:h-52">
        <Image
          src={deal.heroImage}
          alt={`${deal.cityLabel}, ${deal.countryLabel}`}
          fill
          sizes={featured ? "(max-width: 640px) 88vw, (max-width: 1024px) 54vw, 30vw" : "(max-width: 640px) 76vw, (max-width: 1024px) 42vw, 22vw"}
          className="object-cover transition duration-300 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">
          <span aria-hidden>✈</span> Lot + hotel
        </span>
        {featured && (
          <span className="absolute right-3 top-3 rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-950 shadow-sm">
            Najtańszy pakiet
          </span>
        )}
        {/* Miasto na zdjęciu (dolny gradient daje kontrast) — więcej treści
            nad linią, karta czytelna zanim wzrok zejdzie niżej. */}
        <div className="absolute inset-x-3 bottom-2.5 flex items-baseline justify-between gap-2">
          <span className={`truncate font-display leading-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] ${featured ? "text-2xl" : "text-xl"}`}>
            {deal.cityLabel}
          </span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-white/85">
            {deal.countryLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-neutral-600">
          <span className="font-semibold text-neutral-900">{formatRange(deal.checkin, deal.checkout)}</span>
          {" · "}
          {nightsLabel(nights)} · przelot z Warszawy w obie strony
        </p>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-neutral-100 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] text-neutral-500">za osobę przy 2 os.</p>
            <p className={`font-bold leading-tight text-emerald-700 ${featured ? "text-2xl" : "text-xl"}`}>
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
}

export function PackageGems({ deals }: { deals: PackageDeal[] }) {
  const sorted = [...deals].sort((a, b) => a.perPersonPln - b.perPersonPln).slice(0, MAX_GEMS);
  if (sorted.length < MIN_GEMS) return null;

  return (
    <section aria-labelledby="package-gems" className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1.5">
        <div>
          <h2 id="package-gems" className="font-display text-2xl leading-tight text-emerald-950 sm:text-3xl">
            Perełki: cały wyjazd w jednej cenie
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500 sm:text-sm">
            Lot z Warszawy w obie strony + hotel, z konkretnego terminu na karcie. Najtańsze realnie
            policzone pakiety z naszych wyszukiwań.
          </p>
        </div>
        {/* Żywy sygnał — PRAWDZIWY (cron liczy pakiety na okrągło, nieświeże
            znikają). Ta sama pulsująca kropka co w hero (spójność). */}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-emerald-700">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Aktualizowane automatycznie
        </span>
      </div>

      {/* Poziomy pasek ze snapem na WSZYSTKICH szerokościach (1 rząd → strona
          krótsza mimo bogatszej sekcji). Szerokości kart dobrane tak, by zawsze
          wystawał „podgląd" kolejnej (sygnał przewijania). Ujemne marginesy:
          scroll bleeduje do krawędzi sekcji. */}
      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6 xl:-mx-8 xl:px-8 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {sorted.map((deal, i) => (
          <GemCard key={deal.slug} deal={deal} featured={i === 0} />
        ))}
      </div>
    </section>
  );
}
