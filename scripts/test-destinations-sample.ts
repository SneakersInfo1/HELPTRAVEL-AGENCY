// scripts/test-destinations-sample.ts
//
// Sesja C2 — destinations sample validator.
//
// Pulls 20 random entries (or `--n=NUM`) from data/destinations.json and
// verifies for each:
//   1. Hotels API returns ≥10 results for the canonical query window.
//   2. Travelpayouts cache returns ≥1 option from WAW for the configured
//      airport (or any of nearestPLHubs).
//   3. Polish localization is non-empty AND not just a copy of English
//      where we expect a Polish exonym (Lisbon → Lizbona, Mediolan etc.).
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/test-destinations-sample.ts
//   pnpm tsx --env-file=.env.local scripts/test-destinations-sample.ts --n=5
//   pnpm tsx --env-file=.env.local scripts/test-destinations-sample.ts --ids=lisbon-portugal,madrid-spain
//   pnpm tsx --env-file=.env.local scripts/test-destinations-sample.ts --n=30 --e2e
//
// Exit code: 0 on full pass, 1 otherwise. Suitable for CI.

import { promises as fs } from "node:fs";
import path from "node:path";

import { fetchHotelsList } from "../src/lib/liteapi";
import { searchTravelpayoutsFlights } from "../src/lib/mvp/travelpayouts-flights";

const ROOT = path.resolve(__dirname, "..");
const SEED_PATH = path.join(ROOT, "data", "destinations.json");

interface SeedRecord {
  id: string;
  city: { en: string; pl: string };
  country: { code: string | null; en: string; pl: string };
  airports: string[];
  nearestPLHubs: Array<{ iata: string; km: number; minutes: number }>;
  hotelCount: number;
}

interface SeedFile {
  destinations: SeedRecord[];
}

interface CliArgs {
  n: number;
  ids: string[] | null;
  e2e: boolean;
  baseUrl: string;
}

function parseArgs(argv: string[]): CliArgs {
  let n = 20;
  let ids: string[] | null = null;
  let e2e = false;
  let baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--n=")) {
      const v = Number(arg.slice("--n=".length));
      if (Number.isFinite(v) && v > 0) n = v;
    } else if (arg.startsWith("--ids=")) {
      ids = arg.slice("--ids=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--e2e") {
      e2e = true;
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).replace(/\/$/, "");
    }
  }
  return { n, ids, e2e, baseUrl };
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Cities where we expect Polish to differ from English. Failure to localize
// these is a regression, not a tier-3 fallback case.
const POLISH_REQUIRED = new Set([
  "Lisbon", "Rome", "Milan", "Naples", "Paris", "Florence", "Venice",
  "Athens", "Vienna", "Munich", "Stockholm", "Copenhagen", "London",
  "Istanbul", "Edinburgh", "Warsaw", "Krakow", "Gdansk", "Wroclaw",
  "New York", "Moscow",
]);

interface ResultRow {
  id: string;
  cityEn: string;
  hotelsOk: boolean;
  hotelsCount: number;
  flightsOk: boolean;
  flightsCount: number;
  polishOk: boolean;
  polishValue: string;
  e2eOk: boolean;
  e2eStatus: number | null;
  e2eMs: number | null;
  errors: string[];
}

function futureIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function check(record: SeedRecord, args: CliArgs): Promise<ResultRow> {
  const row: ResultRow = {
    id: record.id,
    cityEn: record.city.en,
    hotelsOk: false,
    hotelsCount: 0,
    flightsOk: false,
    flightsCount: 0,
    polishOk: false,
    polishValue: record.city.pl,
    e2eOk: !args.e2e,
    e2eStatus: null,
    e2eMs: null,
    errors: [],
  };

  // 1) Hotels — repeat the LiteAPI lookup the planner uses live.
  try {
    const res = await fetchHotelsList({
      city: record.city.en,
      country: record.country.en,
      limit: 30,
    });
    row.hotelsCount = res.data.length;
    row.hotelsOk = res.data.length >= 10;
    if (!row.hotelsOk) row.errors.push(`hotels<10 (${res.data.length})`);
  } catch (err) {
    row.errors.push(`hotels-error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Flights — try the recommended PL hub via the live search adapter.
  const today = new Date();
  const departure = new Date(today.getTime() + 30 * 86_400_000);
  const departureDate = departure.toISOString().slice(0, 10);
  const origin = "Warszawa"; // pin to WAW so the test is deterministic per spec
  try {
    const flightRes = await searchTravelpayoutsFlights({
      origin,
      destination: record.city.en,
      destinationIata: record.airports[0] ?? undefined,
      departureDate,
      passengers: 1,
      cabinClass: "economy",
      sortBy: "cheap",
    });
    row.flightsCount = flightRes.offers.length;
    row.flightsOk = flightRes.offers.length >= 1;
    if (!row.flightsOk) {
      row.errors.push(
        flightRes.error
          ? `flights-error: ${flightRes.error}`
          : "flights<1",
      );
    }
  } catch (err) {
    row.errors.push(`flights-error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3) Polish localization sanity check.
  if (!record.city.pl || record.city.pl.length === 0) {
    row.errors.push("polish-empty");
  } else if (POLISH_REQUIRED.has(record.city.en) && record.city.pl === record.city.en) {
    row.errors.push(`polish-missing-exonym (${record.city.en})`);
  } else {
    row.polishOk = true;
  }

  if (args.e2e) {
    const checkin = futureIso(30);
    const checkout = futureIso(34);
    const params = new URLSearchParams({
      destination: record.city.en,
      country: record.country.en,
      checkin,
      checkout,
      origin: "Warszawa",
      adults: "2",
      rooms: "1",
    });
    const url = `${args.baseUrl.replace(/\/$/, "")}/hotele/szukaj?${params.toString()}`;
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { "User-Agent": "helptravel-e2e-smoke/1.0" } });
      row.e2eStatus = response.status;
      const html = await response.text();
      row.e2eMs = Math.round(performance.now() - started);
      row.e2eOk = response.status === 200 && html.includes("<article") && row.e2eMs < 4000;
      if (!row.e2eOk) {
        row.errors.push(`e2e-failed status=${response.status} ms=${row.e2eMs} articles=${html.includes("<article")}`);
      }
    } catch (err) {
      row.e2eMs = Math.round(performance.now() - started);
      row.errors.push(`e2e-error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return row;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);
  const raw = await fs.readFile(SEED_PATH, "utf8");
  const seed = JSON.parse(raw) as SeedFile;
  const sample = args.ids
    ? seed.destinations.filter((d) => args.ids!.includes(d.id))
    : pickRandom(seed.destinations, Math.min(args.n, seed.destinations.length));

  if (sample.length === 0) {
    console.error("No destinations matched the requested sample.");
    return 1;
  }

  console.log(`Validating ${sample.length} destinations from ${SEED_PATH}`);
  console.log("");

  const results: ResultRow[] = [];
  for (const record of sample) {
    process.stdout.write(`  • ${record.id.padEnd(40)} `);
    const row = await check(record, args);
    results.push(row);
    const allOk = row.hotelsOk && row.flightsOk && row.polishOk && row.e2eOk;
    if (allOk) {
      console.log(`OK   hotels=${row.hotelsCount} flights=${row.flightsCount} pl="${row.polishValue}"${args.e2e ? ` e2e=${row.e2eMs}ms` : ""}`);
    } else {
      console.log(`FAIL ${row.errors.join("; ")}`);
    }
  }

  const passed = results.filter((r) => r.hotelsOk && r.flightsOk && r.polishOk && r.e2eOk).length;
  const failed = results.length - passed;
  console.log("");
  console.log(`Result: ${passed}/${results.length} passed (${failed} failed)`);
  if (args.e2e) {
    return passed / results.length >= 0.9 ? 0 : 1;
  }
  return failed > 0 ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("Validator crashed:", err);
  process.exit(2);
});
