// Trwałość snapshotu konsjerża: staging → walidacja → ATOMOWY promote (§30–§37).
//
// CO BYŁO NIE TAK. `dstprice:v1` jest pisany wzorcem odczyt-scal-zapis na
// JEDNYM kluczu (`mergePriceSnapshot`). Dla indeksu „od X zł" na homepage to
// wystarcza — merge z założenia ma nie kasować kierunków, których dany przebieg
// nie dotknął. Ale jako architektura publikacji ma dwie dziury:
//   • przebieg przerwany w połowie zostawia klucz z częścią kierunków
//     odświeżonych, a częścią sprzed godzin — i nikt się o tym nie dowiaduje,
//   • nie ma jak wycofać złej publikacji: poprzedni stan przestał istnieć
//     w chwili zapisu.
//
// TUTAJ publikacja jest dwufazowa. Build leci do klucza STAGING pod własnym
// `runId`, przechodzi walidację (kształt, daty, ceny, bramka pokrycia) i
// dopiero wtedy jedno `SET` przestawia ACTIVE. Czytelnik widzi albo stary,
// albo nowy snapshot — nigdy pół nowego, bo pojedynczy SET u dostawcy jest
// atomowy. Poprzedni ACTIVE ląduje w PREVIOUS, więc wycofanie to jedna
// operacja, a nie przebudowa.
//
// KONTRAKT DEGRADACJI (jak reszta warstwy cache w tym repo): każdy błąd i brak
// env to MISS, nigdy wyjątek. Konsjerż bez snapshotu działa — po prostu
// szuka na żywo.

import { gunzipSync, gzipSync } from "node:zlib";

import { Redis } from "@upstash/redis";

import { travelToday } from "@/lib/time/travel-now";
import { isBookableStart } from "@/lib/concierge/travel-dates";
import { SNAPSHOT_VERSION, type ConciergeSnapshot } from "./types";

const KEY_ACTIVE = "csnap:v1:active";
const KEY_PREVIOUS = "csnap:v1:previous";
const keyStaging = (runId: string) => `csnap:v1:build:${runId}`;

/** TTL kluczy — 7 dni. Realną świeżość wymusza polityka cen, nie TTL. */
const TTL_SECONDS = 7 * 24 * 3600;
/** Staging żyje krótko: albo zostanie awansowany, albo jest śmieciem. */
const TTL_STAGING_SECONDS = 3600;

/** Minimalna liczba rekordów, żeby build w ogóle miał sens. */
const MIN_RECORDS = 20;
/**
 * Ile pokrycia wolno stracić względem ACTIVE, zanim uznamy build za awarię
 * dostawcy, a nie za nowy stan świata (§37). 40% to dużo — celowo: chodzi
 * o złapanie zapaści (120 → 8), a nie o karanie za gorszy dzień u dostawcy.
 */
const MAX_COVERAGE_DROP = 0.4;

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

let redis: RedisLike | null | undefined;
let injected: RedisLike | null | undefined;
let warnedMissingEnv = false;

function getRedis(): RedisLike | null {
  if (injected !== undefined) return injected;
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn("[csnap] UPSTASH env brak — snapshot konsjerża WYŁĄCZONY (wyszukiwanie na żywo).");
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token }) as unknown as RedisLike;
  return redis;
}

export function __setSnapshotRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetSnapshotRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

// ── Serializacja ────────────────────────────────────────────────────────────
//
// GZIP + base64, jak cache ofert lotów. Snapshot to ~1100 rekordów × ~200 B
// ≈ 220 kB surowego JSON-a; po gzipie schodzi do kilkudziesięciu kB, więc
// mieści się z zapasem pod limitem wartości Upstash i tanieje transfer.

function encode(snapshot: ConciergeSnapshot): string {
  return gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8")).toString("base64");
}

function decode(raw: unknown): ConciergeSnapshot | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) as ConciergeSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.meta || !parsed.records) return null;
    if (parsed.meta.version !== SNAPSHOT_VERSION) {
      console.warn(`[csnap] snapshot w wersji ${parsed.meta.version}, oczekiwano ${SNAPSHOT_VERSION} — ignoruję`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("[csnap] dekodowanie nieudane:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function readKey(key: string): Promise<ConciergeSnapshot | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return decode(await client.get<string>(key));
  } catch (err) {
    console.warn(`[csnap] odczyt '${key}' nieudany:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Aktualnie opublikowany snapshot. null = brak / błąd / zła wersja (miss). */
export function readActiveSnapshot(): Promise<ConciergeSnapshot | null> {
  return readKey(KEY_ACTIVE);
}

/** Poprzednia opublikowana wersja — do natychmiastowego wycofania (§32). */
export function readPreviousSnapshot(): Promise<ConciergeSnapshot | null> {
  return readKey(KEY_PREVIOUS);
}

// ── Walidacja (§36, §37, §38) ───────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

/**
 * Bramka przed publikacją. Sprawdza to, co da się sprawdzić MECHANICZNIE —
 * i celowo NIE próbuje oceniać, czy cena jest „rozsądna": odrzucanie drogich,
 * ale prawdziwych ofert arbitralnym limitem byłoby kłamstwem o rynku (§38).
 * Odsiewamy wyłącznie korupcję techniczną: NaN, nieskończoności, wartości
 * ujemne, złą walutę, bezsensowną liczbę nocy, datę z przeszłości.
 */
export function validateSnapshot(
  candidate: ConciergeSnapshot,
  active: ConciergeSnapshot | null,
  nowMs: number,
): ValidationResult {
  const problems: string[] = [];
  const todayIso = travelToday(nowMs);
  const entries = Object.entries(candidate.records ?? {});

  if (candidate.meta?.version !== SNAPSHOT_VERSION) {
    problems.push(`zła wersja formatu: ${candidate.meta?.version}`);
  }
  if (entries.length < MIN_RECORDS) {
    problems.push(`za mało rekordów: ${entries.length} < ${MIN_RECORDS}`);
  }

  let pastDates = 0;
  let badPrices = 0;
  let badShape = 0;
  for (const [key, r] of entries) {
    if (!r || typeof r !== "object") {
      badShape += 1;
      continue;
    }
    if (!isBookableStart(r.checkin, todayIso) || !(r.checkout > r.checkin)) {
      pastDates += 1;
      if (pastDates === 1) problems.push(`rekord z przeszłą/niepoprawną datą wyjazdu: ${key} (${r.checkin})`);
      continue;
    }
    if (r.currency !== "PLN") {
      badShape += 1;
      if (badShape === 1) problems.push(`zła waluta w ${key}: ${String(r.currency)}`);
      continue;
    }
    if (!Number.isInteger(r.nights) || r.nights < 1 || r.nights > 30) {
      badShape += 1;
      if (badShape === 1) problems.push(`zła liczba nocy w ${key}: ${String(r.nights)}`);
      continue;
    }
    for (const [field, value] of [
      ["flightPln", r.flightPln],
      ["hotelPlnPerNight", r.hotelPlnPerNight],
      ["perPersonPln", r.perPersonPln],
    ] as const) {
      if (value === null) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        badPrices += 1;
        if (badPrices === 1) problems.push(`nonsensowna cena ${field} w ${key}: ${String(value)}`);
      }
    }
  }
  if (pastDates > 1) problems.push(`łącznie rekordów z przeszłą datą: ${pastDates}`);
  if (badPrices > 1) problems.push(`łącznie nonsensownych cen: ${badPrices}`);
  if (badShape > 1) problems.push(`łącznie rekordów o złym kształcie: ${badShape}`);

  // §37: zapaść pokrycia względem tego, co już działa.
  const activeCount = Object.keys(active?.records ?? {}).length;
  if (activeCount > 0 && entries.length < activeCount * (1 - MAX_COVERAGE_DROP)) {
    problems.push(
      `pokrycie spadło zbyt mocno: ${entries.length} rekordów vs ${activeCount} w ACTIVE ` +
        `(próg: ${Math.ceil(activeCount * (1 - MAX_COVERAGE_DROP))})`,
    );
  }

  return { ok: problems.length === 0, problems };
}

// ── Publikacja ──────────────────────────────────────────────────────────────

/** Zapis do stagingu — build zawsze ląduje tu NAJPIERW (§30). */
export async function writeStaging(snapshot: ConciergeSnapshot): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.set(keyStaging(snapshot.meta.runId), encode(snapshot), { ex: TTL_STAGING_SECONDS });
    return true;
  } catch (err) {
    console.warn("[csnap] zapis stagingu nieudany:", err instanceof Error ? err.message : err);
    return false;
  }
}

export interface PublishResult {
  published: boolean;
  problems: string[];
}

/**
 * Walidacja + atomowy promote.
 *
 * KOLEJNOŚĆ ZAPISÓW jest istotna: najpierw PREVIOUS (kopia obecnego ACTIVE),
 * dopiero potem ACTIVE. Przerwanie po pierwszym zapisie zostawia PREVIOUS
 * równe ACTIVE — stan nadmiarowy, ale spójny. Odwrotna kolejność mogłaby
 * zostawić PREVIOUS wskazujące na to samo, co świeżo nadpisany ACTIVE, czyli
 * wycofanie donikąd.
 */
export async function publishSnapshot(
  snapshot: ConciergeSnapshot,
  nowMs: number,
): Promise<PublishResult> {
  const client = getRedis();
  if (!client) return { published: false, problems: ["brak Redisa"] };

  const active = await readActiveSnapshot();
  const validation = validateSnapshot(snapshot, active, nowMs);
  if (!validation.ok) {
    console.warn(`[csnap] publikacja ODRZUCONA (${snapshot.meta.runId}):`, validation.problems.join(" | "));
    return { published: false, problems: validation.problems };
  }

  try {
    if (active) {
      await client.set(KEY_PREVIOUS, encode(active), { ex: TTL_SECONDS });
    }
    await client.set(KEY_ACTIVE, encode(snapshot), { ex: TTL_SECONDS });
    await client.del(keyStaging(snapshot.meta.runId));
    return { published: true, problems: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[csnap] promote nieudany:", message);
    return { published: false, problems: [`promote nieudany: ${message}`] };
  }
}

/**
 * Wycofanie do poprzedniej wersji BEZ przebudowy (§33). Operacja świadomie
 * nie jest wystawiona jako publiczny endpoint — woła ją narzędzie
 * operatorskie z sekretem crona.
 */
export async function rollbackToPrevious(): Promise<{ ok: boolean; runId?: string }> {
  const client = getRedis();
  if (!client) return { ok: false };
  const previous = await readPreviousSnapshot();
  if (!previous) {
    console.warn("[csnap] rollback: brak PREVIOUS — nie ma do czego wracać");
    return { ok: false };
  }
  try {
    await client.set(KEY_ACTIVE, encode(previous), { ex: TTL_SECONDS });
    console.info(`[csnap] rollback: ACTIVE ← ${previous.meta.runId}`);
    return { ok: true, runId: previous.meta.runId };
  } catch (err) {
    console.warn("[csnap] rollback nieudany:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
