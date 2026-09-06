// Operatorskie wycofanie snapshotu konsjerża do POPRZEDNIEJ wersji (§33).
//
// Świadomie NIE jest to endpoint HTTP. Publiczna trasa, która jednym GET-em
// podmienia aktywny snapshot, byłaby albo dziurą (bez sekretu), albo kolejnym
// sekretem do pilnowania — a ta operacja zdarza się raz na ruski rok i zawsze
// robi ją człowiek. Skrypt czyta te same zmienne środowiskowe co produkcja.
//
//   pnpm snapshot:rollback           — pokazuje, co by się stało (dry run)
//   pnpm snapshot:rollback -- --yes  — faktycznie przestawia ACTIVE
//
// UWAGA: działa na tym Upstash, który wskazuje .env.local. Po wycofaniu
// pierwszy kolejny przebieg crona i tak zbuduje nowy snapshot — rollback jest
// po to, żeby przeżyć te kilkadziesiąt minut z danymi, o których wiadomo,
// że były dobre.

import { gunzipSync } from "node:zlib";

import { Redis } from "@upstash/redis";

import type { ConciergeSnapshot } from "@/lib/snapshot/types";

const KEY_ACTIVE = "csnap:v1:active";
const KEY_PREVIOUS = "csnap:v1:previous";
const TTL_SECONDS = 7 * 24 * 3600;

function decode(raw: unknown): ConciergeSnapshot | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as ConciergeSnapshot;
  } catch {
    return null;
  }
}

function describe(label: string, snapshot: ConciergeSnapshot | null): void {
  if (!snapshot) {
    console.log(`${label}: BRAK`);
    return;
  }
  const { meta } = snapshot;
  const ageH = ((Date.now() - meta.builtAt) / 3_600_000).toFixed(1);
  console.log(
    `${label}: runId=${meta.runId}  zbudowany ${ageH} h temu  ` +
      `rekordów=${Object.keys(snapshot.records).length}  ` +
      `future-usable=${meta.coverage.futureUsableDestinations} (${meta.coverage.futureUsableCoveragePct}%)`,
  );
}

async function main(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error("Brak UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — uruchom z --env-file=.env.local");
    process.exitCode = 1;
    return;
  }
  const confirmed = process.argv.includes("--yes");
  const redis = new Redis({ url, token });

  const [activeRaw, previousRaw] = await Promise.all([
    redis.get<string>(KEY_ACTIVE),
    redis.get<string>(KEY_PREVIOUS),
  ]);
  const active = decode(activeRaw);
  const previous = decode(previousRaw);

  console.log("=== SNAPSHOT KONSJERŻA — STAN PRZED ===");
  describe("ACTIVE  ", active);
  describe("PREVIOUS", previous);

  if (!previous) {
    console.error("\nNie ma do czego wracać — PREVIOUS jest pusty. Nic nie robię.");
    process.exitCode = 1;
    return;
  }
  if (typeof previousRaw !== "string") {
    console.error("\nPREVIOUS jest w nieoczekiwanym formacie. Nic nie robię.");
    process.exitCode = 1;
    return;
  }

  if (!confirmed) {
    console.log(
      `\nDRY RUN. Z flagą --yes ACTIVE zostałby zastąpiony wersją ${previous.meta.runId}.` +
        "\nUruchom: pnpm snapshot:rollback -- --yes",
    );
    return;
  }

  // Zapisujemy DOKŁADNIE tę samą zakodowaną wartość, którą przeczytaliśmy —
  // żadnego ponownego kodowania, więc nie ma jak przy okazji zmienić danych.
  await redis.set(KEY_ACTIVE, previousRaw, { ex: TTL_SECONDS });
  console.log(`\nGOTOWE. ACTIVE ← ${previous.meta.runId}`);
  console.log("PREVIOUS zostaje bez zmian — kolejny przebieg crona i tak go nadpisze.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
