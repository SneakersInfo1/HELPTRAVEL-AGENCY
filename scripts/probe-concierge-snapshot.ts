// Sonda POKRYCIA snapshotu widzianego oczami AI Concierge (TYLKO ODCZYT).
//
// V2.2 (§15, §16, §47). Sonda mierzy OBA snapshoty i pokazuje je obok siebie:
//   • `csnap:v1` — nowy indeks discovery (rekord na kierunek × wylot × okno),
//   • `dstprice:v1` — stary indeks „od X zł" (jeden wpis na kierunek), wciąż
//     używany przez homepage i jako fallback konsjerża.
//
// GŁÓWNY KPI to FUTURE USABLE COVERAGE, nie „ile kierunków ma cenę". Poprzednia
// wersja tej sondy raportowała „46 kluczy, 100% ze świeżym pakietem" i wyglądało
// to zdrowo — a mierzyła wiek CENY, nie to, czy termin da się jeszcze kupić,
// i nie widziała, że każdy kierunek ma dokładnie jedno okno.
//
// UWAGA: czyta PRODUKCYJNY Upstash z .env.local. Zero zapisów, zero kosztów
// w LiteAPI.
//
//   pnpm probe:concierge-snapshot

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { Redis } from "@upstash/redis";

import { computeCoverage, isUsableRecord, priceFreshness } from "@/lib/snapshot/coverage";
import { buildDestinationTiers, type TierSeedRecord } from "@/lib/snapshot/tiers";
import { buildTaskList } from "@/lib/snapshot/rotation";
import { ORIGIN_TIER_A, ORIGIN_TIER_B } from "@/lib/snapshot/tiers";
import { buildWindowMatrix } from "@/lib/snapshot/windows";
import type { ConciergeSnapshot, SnapshotRecord } from "@/lib/snapshot/types";
import { isBookableStart } from "@/lib/concierge/travel-dates";
import { travelToday } from "@/lib/time/travel-now";
import {
  PRICE_FRESH_MS,
  destinationPriceKey,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";

const CSNAP_ACTIVE = "csnap:v1:active";
const CSNAP_PREVIOUS = "csnap:v1:previous";
const DSTPRICE_KEY = "dstprice:v1";

/**
 * Seed czytamy z pliku, nie przez `@/lib/mvp/destinations-seed` — ten moduł ma
 * `import "server-only"`, które nie rozwiązuje się poza Nextem.
 */
const SEED: TierSeedRecord[] = (
  JSON.parse(readFileSync(join(process.cwd(), "data/destinations.json"), "utf8")) as {
    destinations: TierSeedRecord[];
  }
).destinations;

function hours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function decodeSnapshot(raw: unknown): ConciergeSnapshot | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as ConciergeSnapshot;
  } catch {
    return null;
  }
}

function row(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(38)} ${value}`);
}

function reportCsnap(snapshot: ConciergeSnapshot | null, nowMs: number, tiered: ReturnType<typeof buildDestinationTiers>): void {
  console.log("\n=== csnap:v1 (ACTIVE) — SNAPSHOT KONSJERŻA V2.2 ===");
  if (!snapshot) {
    console.log("  BRAK — konsjerż korzysta z fallbacku dstprice:v1.");
    return;
  }
  const records = Object.values(snapshot.records);
  const todayIso = travelToday(nowMs);
  const coverage = computeCoverage(records, tiered, nowMs);

  row("wersja / runId", `${snapshot.meta.version} / ${snapshot.meta.runId}`);
  row("zbudowany", `${hours(nowMs - snapshot.meta.builtAt)} temu`);
  row("segment rotacji", `${snapshot.meta.segment + 1}/${snapshot.meta.segmentCount}`);
  console.log("");
  row("kierunków w seedzie (unikalnych)", coverage.seedDestinations);
  row("kierunków z JAKĄKOLWIEK ceną", `${coverage.destinationsWithPrice}  (${coverage.destinationCoveragePct}%)`);
  console.log("");
  row("FUTURE USABLE kierunków  ← KPI", `${coverage.futureUsableDestinations}  (${coverage.futureUsableCoveragePct}%)`);
  row("pokrycie WAŻONE tierami", `${coverage.weightedCoveragePct}%`);
  row("pokrycie tieru A (HOT)", `${coverage.tierACoveragePct}%`);
  row("pokrycie tieru B", `${coverage.tierBCoveragePct}%`);
  console.log("");
  row("rekordów łącznie", coverage.records);
  row("  przyszłych / przeterminowanych", `${coverage.futureRecords} / ${coverage.expiredRecords}`);
  row("  FRESH / STALE_USABLE / EXPIRED", `${coverage.fresh} / ${coverage.staleButUsable} / ${coverage.expiredPrice}`);
  console.log("");
  row("miesięcy pokrytych", coverage.monthsCovered);
  row("długości pobytu pokrytych", coverage.nightsCovered);
  row("lotnisk wylotu pokrytych", coverage.originsCovered);
  row("krajów pokrytych", coverage.countriesCovered);

  const ages = records.map((r) => nowMs - r.pricedAt).sort((a, b) => a - b);
  row(
    "wiek ceny p50 / p95 / max",
    `${hours(percentile(ages, 0.5))} / ${hours(percentile(ages, 0.95))} / ${hours(ages[ages.length - 1] ?? 0)}`,
  );
  row("przeniesionych z poprzedniego", records.filter((r) => r.carriedForward).length);

  // ── Rozbicia (§15) ────────────────────────────────────────────────────────
  const usable = records.filter((r) => isUsableRecord(r, todayIso, nowMs));
  const by = (fn: (r: SnapshotRecord) => string) => {
    const m = new Map<string, number>();
    for (const r of usable) m.set(fn(r), (m.get(fn(r)) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  };
  console.log("\n  ── wg MIESIĄCA ──");
  for (const [k, n] of by((r) => `${r.year}-${String(r.month).padStart(2, "0")}`)) console.log(`     ${k}  ${n}`);
  console.log("  ── wg DŁUGOŚCI POBYTU ──");
  for (const [k, n] of by((r) => `${r.nights} nocy`)) console.log(`     ${k}  ${n}`);
  console.log("  ── wg LOTNISKA WYLOTU ──");
  for (const [k, n] of by((r) => r.origin)) console.log(`     ${k}  ${n}`);
  console.log("  ── wg TIERU ──");
  for (const [k, n] of by((r) => `tier ${r.tier}`)) console.log(`     ${k}  ${n}`);
  console.log("  ── wg KRAJU (top 12) ──");
  for (const [k, n] of by((r) => r.countryPl).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`     ${k}  ${n}`);

  // §64: nic z przeszłości nie ma prawa tu być.
  const past = records.filter((r) => !isBookableStart(r.checkin, todayIso));
  console.log(`\n  BRAMKA §64 — rekordów z przeszłym terminem: ${past.length} ${past.length === 0 ? "✓" : "✗"}`);
  for (const r of past.slice(0, 5)) console.log(`     ${r.destId} ${r.checkin} → ${r.checkout}`);
}

function reportDstprice(snapshot: DestinationPriceSnapshot | null, nowMs: number): void {
  console.log("\n=== dstprice:v1 — STARY INDEKS (homepage + fallback konsjerża) ===");
  if (!snapshot) {
    console.log("  PUSTY.");
    return;
  }
  const keys = Object.keys(snapshot);
  const todayIso = travelToday(nowMs);
  const windows = new Map<string, number>();
  let freshPkg = 0;
  let pastWindow = 0;
  for (const key of keys) {
    const e = snapshot[key];
    const pkgFresh =
      typeof e.pkgPerPersonPln === "number" &&
      Boolean(e.pkgCheckin) &&
      Number.isFinite(e.pkgComputedAt) &&
      nowMs - (e.pkgComputedAt as number) <= PRICE_FRESH_MS;
    if (!pkgFresh) continue;
    freshPkg += 1;
    if (!isBookableStart(e.pkgCheckin!, todayIso)) pastWindow += 1;
    const label = `${e.pkgCheckin} → ${e.pkgCheckout}`;
    windows.set(label, (windows.get(label) ?? 0) + 1);
  }
  row("kluczy", keys.length);
  row("ze świeżym pakietem", freshPkg);
  row("z PRZESZŁYM oknem", `${pastWindow} ${pastWindow === 0 ? "✓" : "✗"}`);
  row("różnych okien dat", windows.size);
  for (const [label, n] of [...windows].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(3)} × ${label}`);
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
  const nowMs = Date.now();
  const todayIso = travelToday(nowMs);
  const tiered = buildDestinationTiers(SEED);

  console.log(`=== SONDA SNAPSHOTU KONSJERŻA · dziś ${todayIso} (Europe/Warsaw) ===`);

  // ── Plan pracy crona: ile w ogóle DA SIĘ pokryć obecną konfiguracją ────────
  const windows = buildWindowMatrix(todayIso);
  const tasks = buildTaskList(tiered, windows, { tierA: ORIGIN_TIER_A, tierB: ORIGIN_TIER_B });
  const counts = tiered.reduce(
    (acc, t) => {
      acc[t.tier] += 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 } as Record<"A" | "B" | "C", number>,
  );
  console.log("\n=== KONFIGURACJA (co cron MOŻE pokryć) ===");
  row("tiery A / B / C", `${counts.A} / ${counts.B} / ${counts.C}`);
  row("okien w macierzy", `${windows.length}  (${windows.map((w) => w.label).join(", ")})`);
  row("zadań w pełnym obiegu", tasks.length);
  row("SUFIT pokrycia (A+B)", `${(((counts.A + counts.B) / tiered.length) * 100).toFixed(1)}%`);

  const [activeRaw, previousRaw, dstRaw] = await Promise.all([
    redis.get<string>(CSNAP_ACTIVE),
    redis.get<string>(CSNAP_PREVIOUS),
    redis.get<DestinationPriceSnapshot>(DSTPRICE_KEY),
  ]);

  reportCsnap(decodeSnapshot(activeRaw), nowMs, tiered);
  const previous = decodeSnapshot(previousRaw);
  console.log(`\n  PREVIOUS (rollback): ${previous ? `${previous.meta.runId}, ${Object.keys(previous.records).length} rekordów` : "brak"}`);
  reportDstprice(dstRaw && typeof dstRaw === "object" ? dstRaw : null, nowMs);

  // Świeżość jako rozkład — żeby było widać, czy rotacja nadąża.
  const active = decodeSnapshot(activeRaw);
  if (active) {
    const dist = { FRESH: 0, STALE_BUT_USABLE: 0, EXPIRED_PRICE: 0 };
    for (const r of Object.values(active.records)) dist[priceFreshness(r.pricedAt, nowMs)] += 1;
    console.log(`\n=== ŚWIEŻOŚĆ CEN ===\n  ${JSON.stringify(dist)}`);
  }

  // Kontrola spójności kluczy: czy klucz dstprice pasuje do rekordu seedu.
  const sample = tiered.find((t) => t.tier === "A");
  if (sample) {
    console.log(`\n  (kontrola klucza dstprice dla ${sample.cityEn}: ${destinationPriceKey(sample.cityEn, sample.countryEn)})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
