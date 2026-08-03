import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

// Honest destination tile (homepage, /kierunki, /o-nas, /inspiracje).
// 2026-06-11 cleanup: the previous version rendered ratings, review counts,
// "N planning now", discount badges and "od X zł" prices that were ALL
// hash-derived fiction (see deleted lib/mvp/destination-social-proof.ts).
// What remains is only what we can stand behind: photo, country, the city
// name (localised to Polish) and the typical flight time from Poland.
//
// `badge` is an OPTIONAL editorial tag (e.g. „Polecane") the caller can pass
// on curated surfaces like the homepage „Popularne kierunki" band — it is a
// truthful label about OUR selection, NOT a fabricated rating/review score.
// `size="lg"` renders a bigger card (homepage hero) with larger type.

interface DestinationTileProps {
  destination: DestinationProfile;
  heroImage: string;
  defaultNights?: number;
  defaultTravelers?: number;
  /** Optional editorial badge shown top-left (e.g. „Polecane"). */
  badge?: string;
  /** Visual scale. „lg" = bigger photo + larger heading (homepage). */
  size?: "default" | "lg";
  /** Prawdziwa cena „Hotel od X zł/noc" ze snapshotu dstprice:v1 (cron →
   *  realne wyszukanie LiteAPI). Brak = brak linii. NIE podawać tu żadnych
   *  liczb liczonych lokalnie — patrz historia 2026-06-11 (fikcyjne ceny). */
  fromPricePerNight?: number;
  /** Najtańszy lot w obie strony z Warszawy (total PLN/os., snapshot). */
  flightFromPln?: number;
  /** JEDNA cena całego wyjazdu (lot + nocleg) na osobę, ze snapshotu —
   *  `pickFreshPackage`. Gdy jest, ZASTĘPUJE rozbicie hotel/lot: dwie ceny
   *  do zsumowania w głowie były zadaniem matematycznym, a przy kierunkach
   *  z tanim hotelem i drogim lotem (Stambuł: 40 zł/noc + 1181 zł lot)
   *  tania kotwica hotelowa wprowadzała w błąd. */
  packagePerPerson?: { perPersonPln: number; checkin: string; checkout: string };
}

/** „2026-03-12" + „2026-03-19" → „12–19.03" (polski zapis, bez roku: termin
 *  jest zawsze w najbliższych tygodniach, rok tylko zaśmieca kafelek). */
function formatDateRange(checkin: string, checkout: string): string | null {
  const from = new Date(`${checkin}T00:00:00Z`);
  const to = new Date(`${checkout}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const d = (x: Date) => x.getUTCDate();
  const m = (x: Date) => String(x.getUTCMonth() + 1).padStart(2, "0");
  return m(from) === m(to)
    ? `${d(from)}–${d(to)}.${m(to)}`
    : `${d(from)}.${m(from)}–${d(to)}.${m(to)}`;
}

function nightsBetween(checkin: string, checkout: string): number | null {
  const from = Date.parse(`${checkin}T00:00:00Z`);
  const to = Date.parse(`${checkout}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  return Math.round((to - from) / 86_400_000);
}

/** „7 nocy" / „3 noce" / „1 noc" — polska odmiana. */
function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} noce`;
  return `${n} nocy`;
}

export function DestinationTile({
  destination,
  heroImage,
  defaultNights = 4,
  defaultTravelers = 2,
  badge,
  size = "default",
  fromPricePerNight,
  flightFromPln,
  packagePerPerson,
}: DestinationTileProps) {
  const isLarge = size === "lg";
  // Sesja C1 FIX 7: chips link directly to the unified results page with
  // destination + country pre-filled. No dates → page renders the empty
  // prompt with the sticky search form ready for the user to pick dates.
  // (Old `/planner?mode=standard&...` shape was bouncing through middleware
  // 308 to /hotele/szukaj which didn't understand mode/nights, leaving the
  // user on a 404-feeling empty page.)
  void defaultNights; // dates intentionally not pre-filled — user picks them
  const params = new URLSearchParams({
    destination: destination.city,
    country: destination.country,
    origin: DEFAULT_ORIGIN_CITY,
    adults: String(defaultTravelers),
    rooms: "1",
  });
  const href = `/hotele/szukaj?${params.toString()}`;
  const flightHoursLabel = `~${destination.typicalFlightHoursFromPL.toFixed(1)} h z PL`;
  const cityLabel = localizeCity(destination.city);

  return (
    <LocalizedLink
      href={href}
      // isLarge mobile 3/4 (nie 4/5): przy 2 kolumnach na ≤360px kafelek ma
      // ~130px szerokości — 5 linii tekstu kolidowało z badge „Polecane".
      className={`group relative flex ${isLarge ? "aspect-[3/4] sm:aspect-[4/5]" : "aspect-[4/3]"} overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-50 shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)]`}
    >
      <Image
        src={heroImage}
        alt={`${cityLabel}, ${localizeCountry(destination.country)}`}
        fill
        sizes={isLarge ? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"}
        className="object-cover transition duration-300 group-hover:scale-[1.04]"
      />

      {/* Editorial badge (np. „Polecane") — prawdziwa etykieta o NASZYM
          wyborze, nie zmyślona ocena/recenzja. */}
      {/* hidden sm:inline-flex: na ≤sm (2 kolumny, kafelek ~120-160px) badge
          kolidował z blokiem cen; 12 identycznych badge'y i tak nie niesie
          informacji na małym ekranie. */}
      {badge ? (
        <span className="absolute left-2.5 top-2.5 z-20 hidden items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm sm:inline-flex">
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-amber-300">
            <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.95 2.6.94-5.5-4-3.9 5.53-.8z" />
          </svg>
          {badge}
        </span>
      ) : null}

      {/* Bottom gradient + copy */}
      <div className="relative z-10 mt-auto w-full bg-[linear-gradient(180deg,rgba(5,18,11,0)_0%,rgba(5,18,11,0.9)_55%,rgba(5,18,11,0.95)_100%)] p-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {localizeCountry(destination.country)}
        </p>
        <h3 className={`mt-1 font-semibold leading-tight tracking-[-0.01em] ${isLarge ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"}`}>{cityLabel}</h3>
        {/* CENA — jedna, na osobę, za cały wyjazd (signature element).
            Jednostka jest JEDNYM niełamliwym tokenem: na 375px łamanie
            w środku ceny dawało sieroty „zł" w osobnej linii. */}
        {packagePerPerson ? (
          (() => {
            const n = nightsBetween(packagePerPerson.checkin, packagePerPerson.checkout);
            const range = formatDateRange(packagePerPerson.checkin, packagePerPerson.checkout);
            return (
              <>
                <p className="mt-1.5 text-[15px] font-bold leading-snug text-accent-bright sm:text-base">
                  <span className="whitespace-nowrap">
                    od {packagePerPerson.perPersonPln} zł
                    <span className="text-[10px] font-medium text-white/75">/os.</span>
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/80">
                  lot + {n ? nightsLabel(n) : "nocleg"}
                  {/* Termin, z którego wynika cena: cena bez terminu jest
                      niesprawdzalna, a niesprawdzalna cena wygląda podejrzanie. */}
                  {range ? <span className="whitespace-nowrap"> · {range}</span> : null}
                </p>
              </>
            );
          })()
        ) : (
          <>
            {/* Brak świeżego pakietu → pokazujemy TYLKO to, co realnie mamy.
                Nigdy nie sumujemy hotelu i lotu sami — składniki pochodzą
                z różnych okien dat, więc suma byłaby zmyślona. */}
            {typeof flightFromPln !== "number" && (
              <p className="mt-1.5 text-[11px] text-white/80">{flightHoursLabel}</p>
            )}
            {typeof fromPricePerNight === "number" && (
              <p className="mt-1 text-[13px] font-bold leading-snug text-accent-bright sm:text-sm">
                Hotel{" "}
                <span className="whitespace-nowrap">
                  od {fromPricePerNight} zł
                  <span className="text-[10px] font-medium text-white/75">/noc</span>
                </span>
              </p>
            )}
            {typeof flightFromPln === "number" && (
              <p className="mt-0.5 text-[11px] font-medium leading-snug text-white/85">
                Lot<span className="hidden sm:inline"> z Warszawy</span>{" "}
                <span className="whitespace-nowrap">od {flightFromPln} zł</span>
              </p>
            )}
          </>
        )}
      </div>
    </LocalizedLink>
  );
}
