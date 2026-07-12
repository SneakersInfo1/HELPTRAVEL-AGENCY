// Landing pakietu per kierunek — /pakiety/{miasto} (np. /pakiety/barcelona).
// Natywny format pod TikTok (§1): jeden kierunek, jedna cena, jeden link.
// CACHE-FIRST (§6/§8): cena ze snapshotu cron (pickFreshPackage), NIGDY live
// flight-search na load. CTA prowadzi do żywego lejka (/pakiety/szukaj).
// Faza 1: noindex (indeks dopiero Faza 3). Za flagą NEXT_PUBLIC_FEATURE_PACKAGES.

import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { commercialCities } from "@/lib/mvp/commercial-cities";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { pickFreshPackage, readPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { formatPLN } from "@/lib/money";
import type { DestinationProfile } from "@/lib/mvp/types";

// ISR 6h (§6). Snapshot odświeża cron; landing serwuje ze statycznego cache.
export const revalidate = 21600;

const PACKAGES_ON = process.env.NEXT_PUBLIC_FEATURE_PACKAGES === "true";

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

/** Uczciwe highlighty z realnego scoringu profilu (nie zmyślone). */
function topHighlights(p: DestinationProfile): string[] {
  const scored: [number, string][] = [
    [p.beachScore, "Plaże"],
    [p.sightseeingScore, "Zabytki i kultura"],
    [p.cityScore, "City break"],
    [p.nightlifeScore, "Życie nocne"],
    [p.natureScore, "Natura i widoki"],
  ];
  return scored
    .filter(([s]) => s >= 6)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([, l]) => l);
}

async function resolve(slug: string) {
  // Ładny slug „barcelona" (commercial-cities) ALBO pełny „barcelona-spain".
  let profile = getDestinationProfileBySlug(slug);
  if (!profile) {
    const commercial = commercialCities.find((c) => c.slug === slug);
    if (commercial) profile = getDestinationProfileBySlug(commercial.destinationId);
  }
  if (!profile) return null;
  const snapshot = await readPriceSnapshot();
  const pkg = pickFreshPackage(snapshot, profile.city, profile.country);
  return { profile, pkg };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await resolve(slug);
  if (!data) return { title: "Pakiet Lot + Hotel", robots: { index: false, follow: false } };
  const city = localizeCity(data.profile.city);
  const priceStr = data.pkg ? ` od ${data.pkg.perPersonPln} zł` : "";
  return {
    title: `Lot + Hotel ${city}${priceStr} | helptravel.pl`,
    description: `Pakiet lot i hotel do ${city} w jednej cenie${priceStr ? `${priceStr}/os.` : ""}. Przelot z Warszawy w obie strony, hotel z bezpłatną anulacją, ceny w PLN.`,
    // Faza 1: landingi NIEindeksowane (indeks dopiero Faza 3).
    robots: { index: false, follow: false },
  };
}

export default async function PackageLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!PACKAGES_ON) notFound();
  const { slug } = await params;
  const data = await resolve(slug);
  if (!data) notFound();

  const { profile, pkg } = data;
  const city = localizeCity(profile.city);
  const country = localizeCountry(profile.country);
  const media = await resolveDestinationMedia(profile);
  const highlights = topHighlights(profile);
  const nights = pkg ? nightsBetween(pkg.checkin, pkg.checkout) : 3;

  const searchParams = new URLSearchParams({ destination: profile.city, adults: "2" });
  if (pkg) {
    searchParams.set("dateFrom", pkg.checkin);
    searchParams.set("dateTo", pkg.checkout);
  }
  const searchHref = `/pakiety/szukaj?${searchParams.toString()}`;

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image src={media.heroImage} alt={`${city}, ${country}`} fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/85 via-emerald-950/45 to-emerald-950/20" />
        </div>
        <div className="mx-auto flex min-h-[62vh] w-full max-w-4xl flex-col justify-end px-4 pb-8 pt-28 sm:min-h-[60vh] sm:pb-10">
          <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <span aria-hidden>✈</span> Lot + hotel w jednej cenie
          </span>
          <h1 className="text-3xl font-bold leading-tight text-white text-balance sm:text-4xl md:text-5xl">
            {city}
            {pkg ? (
              <>
                {" "}
                <span className="text-emerald-300">od {formatPLN(pkg.perPersonPln)}</span>
                <span className="text-lg font-semibold text-white/80"> /os.</span>
              </>
            ) : null}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
            Przelot z Warszawy w obie strony + {nightsLabel(nights)} w hotelu z bezpłatną anulacją.
            {pkg ? ` Cena dla terminu ${formatRange(pkg.checkin, pkg.checkout)}.` : ""}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={searchHref}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-500 px-6 text-sm font-bold text-white shadow-[0_10px_30px_rgba(16,185,129,0.4)] transition-colors hover:bg-emerald-400"
            >
              Zobacz pakiety →
            </a>
            {highlights.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {highlights.map((h) => (
                  <span key={h} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Co w cenie */}
      <section className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { t: "Lot w obie strony", d: "Przelot z Warszawy tam i z powrotem — wliczony w cenę pakietu." },
            { t: "Bezpłatna anulacja", d: "Pokazujemy tylko hotele, które anulujesz bez opłat do terminu granicznego." },
            { t: "Ceny w PLN", d: "Bez ukrytych przeliczników. Płatność jak w sklepie — kartą, Apple Pay, Google Pay." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                </svg>
                {f.t}
              </div>
              <p className="mt-1 text-sm text-neutral-600">{f.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold text-neutral-900">{city}: lot i hotel bez kombinowania</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
            {city} to jeden z kierunków, które dobieramy w pakiecie: sami łączymy przelot z Warszawy z hotelem
            na te same daty, a Ty widzisz jedną cenę za osobę. Wybierasz hotel, potem dopasowujesz lot spośród
            realnych połączeń — bez skakania między zakładkami. Ceny pochodzą z aktualnych wyszukiwań, a nie z
            sufitu, więc to, co widzisz, jest tym, co realnie zapłacisz.
          </p>
        </div>

        <div className="mt-8 text-center">
          <a
            href={searchHref}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
          >
            Zobacz pakiety — kierunek {city} →
          </a>
        </div>
      </section>
    </main>
  );
}
