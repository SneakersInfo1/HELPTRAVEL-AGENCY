// Sonda ROTACJI — czy pełny obieg naprawdę domyka listę zadań (TYLKO ODCZYT).
//
// Pytanie, na które odpowiada: cron przy wolniejszym dniu u dostawcy ucina
// końcówkę segmentu (licznik `timedOut`). Mechanizm jest samonaprawialny TYLKO
// wtedy, gdy odroczone zadania faktycznie wracają. Ta sonda sprawdza to
// twardo: liczy PEŁNĄ listę zadań na dziś (tą samą funkcją co cron) i
// porównuje ją z kluczami w opublikowanym snapshocie.
//
// Braki są rozbite NA SEGMENTY, bo to rozstrzyga najważniejszą wątpliwość:
// czy braki rozkładają się losowo (przejściowe), czy skupiają w jednym
// segmencie (ten segment jest permanentnie z tyłu).
//
// Dodatkowo liczy trafienia EXACT/NEAREST dla kanonicznego zestawu zapytań —
// czyli to, co realnie widzi użytkownik, a nie samą liczbę rekordów.
//
//   pnpm probe:rotation

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { Redis } from "@upstash/redis";

import { isUsableRecord } from "@/lib/snapshot/coverage";
import { buildTaskList } from "@/lib/snapshot/rotation";
import { buildDestinationTiers, ORIGIN_TIER_A, ORIGIN_TIER_B, type TierSeedRecord } from "@/lib/snapshot/tiers";
import { SEGMENT_COUNT, TIER_B_WINDOWS } from "@/lib/snapshot/config";
import { buildWindowMatrix, WINDOW_NIGHTS } from "@/lib/snapshot/windows";
import { snapshotRecordKey, type ConciergeSnapshot } from "@/lib/snapshot/types";
import { travelToday } from "@/lib/time/travel-now";

const CSNAP_ACTIVE = "csnap:v1:active";

const SEED: TierSeedRecord[] = (
  JSON.parse(readFileSync(join(process.cwd(), "data/destinations.json"), "utf8")) as {
    destinations: TierSeedRecord[];
  }
).destinations;

function decode(raw: unknown): ConciergeSnapshot | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as ConciergeSnapshot;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error("Brak UPSTASH env — uruchom z --env-file=.env.local");
    process.exitCode = 1;
    return;
  }
  const redis = new Redis({ url, token });
  const snapshot = decode(await redis.get<string>(CSNAP_ACTIVE));
  if (!snapshot) {
    console.log("Brak ACTIVE snapshotu.");
    return;
  }

  const nowMs = Date.now();
  const todayIso = travelToday(nowMs);
  const tiered = buildDestinationTiers(SEED);
  const windows = buildWindowMatrix(todayIso);
  const tasks = buildTaskList(tiered, windows, { tierA: ORIGIN_TIER_A, tierB: ORIGIN_TIER_B }, {
    tierBWindows: TIER_B_WINDOWS,
  });

  console.log(`=== SONDA ROTACJI · dziś ${todayIso} · snapshot ${snapshot.meta.runId} ===\n`);

  // ── Domknięcie listy zadań ────────────────────────────────────────────────
  const recordKeys = new Set(Object.keys(snapshot.records));
  const missingBySegment = new Map<number, number>();
  const missingExamples: string[] = [];
  let present = 0;
  tasks.forEach((t, i) => {
    const key = snapshotRecordKey(t.dest.id, t.origin, t.window.checkin, t.window.nights);
    const segment = i % SEGMENT_COUNT;
    if (recordKeys.has(key)) {
      present += 1;
      return;
    }
    missingBySegment.set(segment, (missingBySegment.get(segment) ?? 0) + 1);
    if (missingExamples.length < 12) missingExamples.push(`seg ${String(segment).padStart(2)} · ${key}`);
  });

  console.log("── DOMKNIĘCIE LISTY ZADAŃ ──");
  console.log(`  zadań w pełnym obiegu:        ${tasks.length}`);
  console.log(`  rekordów w snapshocie:        ${recordKeys.size}`);
  console.log(`  zadań POKRYTYCH rekordem:     ${present}  (${((present / tasks.length) * 100).toFixed(1)}%)`);
  console.log(`  zadań BEZ rekordu:            ${tasks.length - present}`);

  if (missingBySegment.size > 0) {
    console.log("\n  braki wg SEGMENTU (skupienie = segment permanentnie z tyłu):");
    const rows = [...missingBySegment].sort((a, b) => b[1] - a[1]);
    for (const [segment, count] of rows) {
      const segSize = tasks.filter((_, i) => i % SEGMENT_COUNT === segment).length;
      console.log(`    segment ${String(segment).padStart(2)}: ${String(count).padStart(3)} / ${segSize}`);
    }
    console.log("\n  przykłady brakujących zadań:");
    for (const e of missingExamples) console.log(`    ${e}`);
  } else {
    console.log("\n  ZERO braków — pełny obieg domknął całą listę. ✓");
  }

  // ── Trafienia EXACT / NEAREST dla kanonicznych zapytań ────────────────────
  // Kanoniczne zapytanie = (miesiąc z macierzy × liczba nocy). Dla każdego
  // kierunku sprawdzamy, czy MA rekord dokładnie na ten termin.
  const usable = Object.values(snapshot.records).filter((r) => isUsableRecord(r, todayIso, nowMs));
  const byDest = new Map<string, Set<string>>();
  for (const r of usable) {
    const set = byDest.get(r.destId) ?? new Set<string>();
    set.add(`${r.year}-${r.month}|${r.nights}`);
    byDest.set(r.destId, set);
  }
  const queries: Array<{ label: string; key: string }> = [];
  for (const w of windows) queries.push({ label: w.label, key: `${w.year}-${w.month}|${w.nights}` });
  const uniqueQueries = [...new Map(queries.map((q) => [q.key, q])).values()];

  console.log("\n── TRAFIENIA EXACT vs NEAREST (kierunki z jakimkolwiek rekordem) ──");
  let exactTotal = 0;
  let nearestTotal = 0;
  for (const q of uniqueQueries) {
    let exact = 0;
    for (const set of byDest.values()) if (set.has(q.key)) exact += 1;
    const nearest = byDest.size - exact;
    exactTotal += exact;
    nearestTotal += nearest;
    console.log(
      `  ${q.label.padEnd(14)} EXACT ${String(exact).padStart(3)} / ${byDest.size}` +
        `  (${((exact / Math.max(1, byDest.size)) * 100).toFixed(0)}%)   NEAREST ${nearest}`,
    );
  }
  const denom = Math.max(1, exactTotal + nearestTotal);
  console.log(
    `\n  RAZEM: EXACT ${exactTotal} (${((exactTotal / denom) * 100).toFixed(1)}%) · ` +
      `NEAREST ${nearestTotal} (${((nearestTotal / denom) * 100).toFixed(1)}%)`,
  );

  // ── Ile OKIEN ma przeciętny kierunek ──────────────────────────────────────
  const perDest = [...byDest.values()].map((s) => s.size).sort((a, b) => a - b);
  const maxWindows = windows.length;
  const full = perDest.filter((n) => n === maxWindows).length;
  console.log("\n── GŁĘBOKOŚĆ POKRYCIA KIERUNKU ──");
  console.log(`  kierunków z rekordem:         ${byDest.size}`);
  console.log(`  okien na kierunek: min ${perDest[0] ?? 0} · mediana ${perDest[Math.floor(perDest.length / 2)] ?? 0} · max ${perDest[perDest.length - 1] ?? 0} (z ${maxWindows})`);
  console.log(`  kierunków z KOMPLETEM okien:  ${full}`);
  console.log(`  długości pobytu w macierzy:   ${WINDOW_NIGHTS.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
