// Sonda POKRYCIA snapshotu cen widzianego oczami AI Concierge (TYLKO ODCZYT).
//
// `search_trips` potrafi zacytować cenę WYŁĄCZNIE dla kierunku, który ma
// ŚWIEŻY (≤48 h) pakiet `pkg*` w snapshocie `dstprice:v1`. Ta sonda odpowiada
// na pytania z audytu V2.1 §8 twardymi liczbami zamiast szacunków:
//   • ile kierunków ma świeży pakiet (a więc ile realnie widzi concierge),
//   • jakie OKNA DAT (miesiąc + liczba nocy) da się w ogóle zaproponować,
//   • ile kierunków przepada, bo cron zdążył policzyć hotel, ale nie lot,
//   • ile kierunków seedu jest nieosiągalnych ścieżką konkretny kraj.
//
// UWAGA: czyta PRODUKCYJNY Upstash z .env.local. Zero zapisów — żadnego
// mergePriceSnapshot, żadnego crona. Uruchomienie nic nie kosztuje w LiteAPI.
//
//   pnpm probe:concierge-snapshot

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Redis } from "@upstash/redis";

import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import { destinationPriceKey, PRICE_FRESH_MS, type DestinationPriceSnapshot } from "@/lib/prices/destination-price-snapshot";

const SNAPSHOT_KEY = "dstprice:v1";

/**
 * Seed czytamy z pliku, nie przez `@/lib/mvp/destinations-seed` — ten moduł ma
 * `import "server-only"`, ktore nie rozwiazuje sie poza Nextem (ten sam powod,
 * dla ktorego bench/concierge/fixture-deps.ts robi to samo).
 */
interface SeedRecord {
  id: string;
  city: { en: string; pl: string };
  country: { en: string; pl: string; code?: string };
}
const SEED: SeedRecord[] = (
  JSON.parse(readFileSync(join(process.cwd(), "data/destinations.json"), "utf8")) as {
    destinations: SeedRecord[];
  }
).destinations;
/** Ile pierwszych kierunków kraju widzi dziś ścieżka `country` w search_trips. */
const COUNTRY_SLICE = 6;

function nightsBetween(checkin: string, checkout: string): number {
  return Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86_400_000);
}

function hours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function main(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error("Brak UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — uruchom z --env-file=.env.local");
    process.exitCode = 1;
    return;
  }
  const redis = new Redis({ url, token });
  const snapshot = await redis.get<DestinationPriceSnapshot>(SNAPSHOT_KEY);
  if (!snapshot) {
    console.log("SNAPSHOT PUSTY — concierge nie ma ŻADNYCH cen orientacyjnych.");
    return;
  }

  const now = Date.now();
  const keys = Object.keys(snapshot);
  const ages: number[] = [];
  let freshHotel = 0;
  let hasFlight = 0;
  let freshPkg = 0;
  const windows = new Map<string, number>();
  const usable: Array<{ key: string; pkg: number; checkin: string; checkout: string }> = [];
  const hotelOnly: string[] = [];

  for (const key of keys) {
    const entry = snapshot[key];
    if (Number.isFinite(entry.computedAt)) {
      ages.push(now - entry.computedAt);
      if (now - entry.computedAt <= PRICE_FRESH_MS) freshHotel += 1;
    }
    if (typeof entry.flightFromPln === "number") hasFlight += 1;
    const pkgFresh =
      typeof entry.pkgPerPersonPln === "number" &&
      Boolean(entry.pkgCheckin) &&
      Boolean(entry.pkgCheckout) &&
      Number.isFinite(entry.pkgComputedAt) &&
      now - (entry.pkgComputedAt as number) <= PRICE_FRESH_MS;
    if (pkgFresh) {
      freshPkg += 1;
      const checkin = entry.pkgCheckin!;
      const checkout = entry.pkgCheckout!;
      const label = `${checkin} → ${checkout}  (${nightsBetween(checkin, checkout)} nocy, miesiąc ${checkin.slice(5, 7)})`;
      windows.set(label, (windows.get(label) ?? 0) + 1);
      usable.push({ key, pkg: entry.pkgPerPersonPln as number, checkin, checkout });
    } else {
      hotelOnly.push(key);
    }
  }
  ages.sort((a, b) => a - b);

  console.log("=== SNAPSHOT dstprice:v1 — POKRYCIE DLA CONCIERGE ===");
  console.log(`kluczy w snapshocie:            ${keys.length}`);
  console.log(`świeża cena hotelu (≤48 h):     ${freshHotel}`);
  console.log(`ma cenę lotu:                   ${hasFlight}`);
  console.log(`ŚWIEŻY PAKIET = widzi concierge: ${freshPkg}  (${((freshPkg / keys.length) * 100).toFixed(0)}% kluczy)`);
  console.log(`wiek wpisu p50 ${hours(percentile(ages, 0.5))} · p95 ${hours(percentile(ages, 0.95))} · max ${hours(ages[ages.length - 1] ?? 0)}`);

  console.log("\n=== OKNA DAT, które search_trips może w ogóle zaproponować ===");
  for (const [label, count] of [...windows].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)} × ${label}`);
  }

  console.log("\n=== KIERUNKI Z CENĄ (posortowane od najtańszego) ===");
  for (const row of usable.sort((a, b) => a.pkg - b.pkg)) {
    console.log(`  ${row.key.padEnd(36)} ${String(row.pkg).padStart(6)} zł/os.  ${row.checkin} → ${row.checkout}`);
  }

  console.log("\n=== KLUCZE BEZ ŚWIEŻEGO PAKIETU (cron policzył hotel, brakuje lotu/świeżości) ===");
  for (const key of hotelOnly) {
    const e = snapshot[key];
    console.log(`  ${key.padEnd(36)} hotel=${e.hotelFromPlnPerNight} lot=${e.flightFromPln ?? "—"} pkg=${e.pkgPerPersonPln ?? "—"}`);
  }

  // ── Ścieżka konkretny kraj: ile realnych cen jest poza oknem slice(0,6) ──
  const all = SEED;
  const byCountry = new Map<string, typeof all>();
  for (const d of all) {
    const list = byCountry.get(d.country.en) ?? [];
    list.push(d);
    byCountry.set(d.country.en, list);
  }
  console.log(`\n=== ŚCIEŻKA KONKRETNY KRAJ — co przepada przez slice(0,${COUNTRY_SLICE}) PRZED rankingiem ===`);
  let reachable = 0;
  let lostTotal = 0;
  for (const [country, list] of [...byCountry].sort()) {
    const priced = list.filter((d) => {
      const entry = snapshot[destinationPriceKey(d.city.en, d.country.en)];
      return (
        typeof entry?.pkgPerPersonPln === "number" &&
        Number.isFinite(entry.pkgComputedAt) &&
        now - (entry.pkgComputedAt as number) <= PRICE_FRESH_MS
      );
    });
    if (priced.length === 0) continue;
    const inSlice = priced.filter((d) => list.indexOf(d) < COUNTRY_SLICE);
    const lost = priced.filter((d) => list.indexOf(d) >= COUNTRY_SLICE);
    reachable += inSlice.length;
    lostTotal += lost.length;
    if (lost.length > 0) {
      console.log(
        `  ${country}: z cenami ${priced.length}, osiągalne ${inSlice.length}, NIEOSIĄGALNE ${lost.length} → ${lost
          .map((d) => `${d.city.en} (idx ${list.indexOf(d)})`)
          .join(", ")}`,
      );
    }
  }
  console.log(`  RAZEM: osiągalne ${reachable}, nieosiągalne ${lostTotal}`);

  // ── Ścieżka motyw: ile picków w ogóle trafia w klucz snapshotu ──
  console.log("\n=== ŚCIEŻKA MOTYW — pokrycie picków TRAVEL_MOODS ===");
  for (const mood of TRAVEL_MOODS) {
    const withPrice = mood.picks.filter((p) => {
      const seed = all.find(
        (d) =>
          (d.city.en.toLowerCase() === p.searchCity.toLowerCase() || d.city.pl.toLowerCase() === p.searchCity.toLowerCase()) &&
          d.country.en.toLowerCase() === p.country.toLowerCase(),
      );
      const key = destinationPriceKey(seed?.city.en ?? p.searchCity, seed?.country.en ?? p.country);
      const entry = snapshot[key];
      return (
        typeof entry?.pkgPerPersonPln === "number" &&
        Number.isFinite(entry.pkgComputedAt) &&
        now - (entry.pkgComputedAt as number) <= PRICE_FRESH_MS
      );
    });
    console.log(`  ${mood.slug.padEnd(14)} ${withPrice.length}/${mood.picks.length} picków z ceną`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
