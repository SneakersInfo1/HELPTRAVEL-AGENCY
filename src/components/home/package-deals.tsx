import Image from "next/image";
import { Plane } from "lucide-react";

import { LocalizedLink } from "@/components/site/localized-link";
import { DestinationCarousel } from "./destination-carousel";
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
      {/* Ta sama karuzela (Embla) co pas „Popularne kierunki" nad nią.
          Wcześniej ta sekcja jechała na natywnym `overflow-x-auto`, więc dwa
          sąsiadujące pasy kart wyglądały jak z dwóch różnych produktów: jeden
          ze strzałkami i snapem, drugi z szarym paskiem przewijania systemu.
          Pasek pod kartami czyta się jak niedokończony interfejs — a to jest
          sekcja z najmocniejszą ofertą na stronie. */}
      <DestinationCarousel
        tone="light"
        ariaLabel={{ prev: "Poprzednie pakiety", next: "Następne pakiety" }}
        slideClassName="min-w-0 shrink-0 basis-[82%] pl-3 sm:basis-[46%] sm:pl-4 lg:basis-[31%] xl:basis-[23.5%]"
        header={
          <h2 id="package-deals" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
            Cały wyjazd w jednej cenie
          </h2>
        }
        aside={
          /* Cena „od" pochodzi z KONKRETNEGO terminu na karcie (uczciwość) —
             ale CTA nie narzuca dat: user wybiera je sam w formularzu
             (właściciel 2026-07-04). */
          <p className="max-w-[42ch] text-right text-xs leading-5 text-ink-muted sm:text-sm">
            Lot z Warszawy w obie strony + hotel, na osobę przy 2 osobach. Cena z terminu na karcie
            — daty wybierasz sam.
          </p>
        }
        items={sorted.map((deal) => {
          const nights = nightsBetween(deal.checkin, deal.checkout);
          return {
            slug: deal.slug,
            pricePerPerson: deal.perPersonPln,
            kind: "package" as const,
            node: (
              <LocalizedLink
                href={deal.href}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[var(--shadow-md)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={deal.heroImage}
                    alt={`${deal.cityLabel}, ${deal.countryLabel}`}
                    fill
                    sizes="(max-width: 640px) 82vw, (max-width: 1024px) 46vw, 24vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">
                    <Plane aria-hidden strokeWidth={2} className="h-3.5 w-3.5" /> Lot + hotel
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-display text-xl leading-tight text-ink">
                      {deal.cityLabel}
                    </h3>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-muted">
                      {deal.countryLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatRange(deal.checkin, deal.checkout)} · {nightsLabel(nights)}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-ink-muted">cena za osobę</p>
                      <p className="text-xl font-bold leading-tight text-brand">
                        od {formatPLN(deal.perPersonPln)}
                        <span className="ml-0.5 text-xs font-semibold text-brand/80">/os.</span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand transition group-hover:bg-brand group-hover:text-white">
                      Zobacz <span aria-hidden>→</span>
                    </span>
                  </div>
                </div>
              </LocalizedLink>
            ),
          };
        })}
      />
    </section>
  );
}
