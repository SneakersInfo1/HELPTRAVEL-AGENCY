import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { NODE_FS, type FsLike } from "./store";

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function normalizeTarget(target: string): string {
  let normalized: string;
  try {
    const url = new URL(target, "https://helptravel.pl");
    normalized = url.pathname;
  } catch {
    normalized = target.split("?", 1)[0];
  }
  normalized = normalized.normalize("NFKC").toLowerCase().replace(/\/+$/, "");
  return normalized || "/";
}

export interface IdempotencyInput {
  day: string;
  target: string;
  operation: string;
  policyVersion: string;
  modeClass: "trial" | "publishing";
}

export function idempotencyKey(input: IdempotencyInput): string {
  const material = `${input.day}|${normalizeTarget(input.target)}|${input.operation}|${input.policyVersion}|${input.modeClass}`;
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export interface LedgerRecord {
  key: string;
  runId: string;
  status: "started" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  outcome?: unknown;
}

export type BeginResult = { status: "started" } | { status: "duplicate"; previous: LedgerRecord };

export class LockHeldError extends Error {
  readonly name = "LockHeldError";

  constructor(readonly lockName: string, readonly owner: string, readonly expiresAt: string) {
    super(`Blokada ${lockName} jest zajęta przez ${owner} do ${expiresAt}`);
  }
}

export class LedgerError extends Error {
  readonly name = "LedgerError";

  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

export interface LedgerOptions {
  stateDir?: string;
  runId?: string;
  fs?: FsLike;
  now?: () => Date;
}

interface LockFile {
  name: string;
  owner: string;
  expiresAt: string;
  acquiredAt: string;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 160);
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/(SEO_ENGINE_ANTHROPIC_API_KEY\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/(api[_ -]?key\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function stageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "stage" in error && typeof (error as { stage?: unknown }).stage === "string") {
    return (error as { stage: string }).stage;
  }
  return "unknown";
}

export class LedgerLock {
  private released = false;

  constructor(
    private readonly fs: FsLike,
    private readonly file: string,
    private readonly owner: string,
  ) {}

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      const current = JSON.parse(await this.fs.readFile(this.file, "utf8")) as Partial<LockFile>;
      if (current.owner === this.owner) await this.fs.rm(this.file, { force: true });
    } catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
    }
  }
}

export class Ledger {
  readonly stateDir: string;
  readonly runId: string;
  readonly fs: FsLike;
  private readonly now: () => Date;

  constructor(options?: LedgerOptions | string, runId?: string, fs?: FsLike) {
    this.stateDir = typeof options === "string" ? options : (options?.stateDir ?? ".seo-engine-state");
    this.runId = runId ?? (typeof options === "object" ? options.runId : undefined) ?? randomUUID();
    this.fs = fs ?? (typeof options === "object" ? options.fs : undefined) ?? NODE_FS;
    this.now = (typeof options === "object" ? options.now : undefined) ?? (() => new Date());
  }

  async begin(key: string, runId = this.runId): Promise<BeginResult> {
    const directory = path.join(this.stateDir, "idempotency");
    const file = path.join(directory, `${safeName(key)}.json`);
    await this.fs.mkdir(directory, { recursive: true });
    const record: LedgerRecord = { key, runId, status: "started", startedAt: this.now().toISOString() };
    try {
      await this.fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
      return { status: "started" };
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw new LedgerError("Nie można rozpocząć wpisu idempotencji", error);
      try {
        const previous = JSON.parse(await this.fs.readFile(file, "utf8")) as LedgerRecord;
        if (previous.status === "failed") {
          await this.fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { flag: "w" });
          return { status: "started" };
        }
        return { status: "duplicate", previous };
      } catch (readError) {
        throw new LedgerError("Istniejący wpis idempotencji jest nieczytelny", readError);
      }
    }
  }

  async complete(key: string, outcome: unknown): Promise<void> {
    await this.update(key, { status: "completed", finishedAt: this.now().toISOString(), outcome });
  }

  async fail(key: string, error: unknown): Promise<void> {
    const rootError =
      error instanceof Error && "cause" in error && (error as Error & { cause?: unknown }).cause instanceof Error
        ? (error as Error & { cause: Error }).cause
        : error;
    const errorName = rootError instanceof Error ? rootError.name : "UnknownError";
    const message = sanitizeMessage(rootError instanceof Error ? rootError.message : String(rootError));
    const stage = stageOf(error);
    await this.update(key, { status: "failed", finishedAt: this.now().toISOString(), outcome: { errorClass: errorName, message, stage } });
    const directory = path.join(this.stateDir, "dead-letter");
    await this.fs.mkdir(directory, { recursive: true });
    const deadLetter = {
      runId: this.runId,
      key,
      failedAt: this.now().toISOString(),
      stage,
      error: { class: errorName, message },
    };
    await this.fs.writeFile(path.join(directory, `${safeName(this.runId)}.json`), `${JSON.stringify(deadLetter, null, 2)}\n`, { flag: "w" });
  }

  async acquireLock(name: string, options: { ttlMs: number; now?: Date | (() => Date) }): Promise<LedgerLock> {
    const directory = path.join(this.stateDir, "locks");
    const file = path.join(directory, `${safeName(name)}.lock.json`);
    await this.fs.mkdir(directory, { recursive: true });
    const currentNow = typeof options.now === "function" ? options.now() : (options.now ?? this.now());
    const lock: LockFile = {
      name,
      owner: this.runId,
      acquiredAt: currentNow.toISOString(),
      expiresAt: new Date(currentNow.getTime() + options.ttlMs).toISOString(),
    };
    const write = () => this.fs.writeFile(file, `${JSON.stringify(lock, null, 2)}\n`, { flag: "wx" });
    try {
      await write();
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw new LedgerError(`Nie można utworzyć blokady ${name}`, error);
      let previous: LockFile;
      try {
        previous = JSON.parse(await this.fs.readFile(file, "utf8")) as LockFile;
      } catch (readError) {
        throw new LedgerError(`Nie można odczytać blokady ${name}`, readError);
      }
      if (new Date(previous.expiresAt).getTime() > currentNow.getTime()) {
        throw new LockHeldError(name, previous.owner, previous.expiresAt);
      }
      // Przejęcie wygasłej blokady; ponowny zapis `wx` nadal chroni przed wyścigiem.
      await this.fs.rm(file, { force: true });
      try {
        await write();
      } catch (takeoverError) {
        if (isCode(takeoverError, "EEXIST")) {
          const winner = JSON.parse(await this.fs.readFile(file, "utf8")) as LockFile;
          throw new LockHeldError(name, winner.owner, winner.expiresAt);
        }
        throw new LedgerError(`Nie można przejąć wygasłej blokady ${name}`, takeoverError);
      }
    }
    return new LedgerLock(this.fs, file, this.runId);
  }

  /** Zapisuje, że dla adresu powstała propozycja (PR) — selekcja pominie go przez kilka dni. */
  async markPending(target: string, runId: string, now: Date): Promise<void> {
    const directory = path.join(this.stateDir, "pending");
    await this.fs.mkdir(directory, { recursive: true });
    const record = { target, runId, createdAt: now.toISOString() };
    await this.fs.writeFile(path.join(directory, `${safeName(target)}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "w" });
  }

  /** Adresy z propozycją młodszą niż `days` dni. */
  async pendingTargets(now: Date, days: number): Promise<Set<string>> {
    const directory = path.join(this.stateDir, "pending");
    let names: string[];
    try {
      names = await this.fs.readdir(directory);
    } catch {
      return new Set();
    }
    const result = new Set<string>();
    for (const name of names.filter((entry) => entry.endsWith(".json"))) {
      try {
        const record = JSON.parse(await this.fs.readFile(path.join(directory, name), "utf8")) as { target?: string; createdAt?: string };
        if (!record.target || !record.createdAt) continue;
        if (now.getTime() - new Date(record.createdAt).getTime() < days * 86_400_000) result.add(record.target);
      } catch {
        // Uszkodzony wpis nie blokuje przebiegu — w najgorszym razie powstanie druga propozycja.
      }
    }
    return result;
  }

  /** Usuwa propozycje utworzone przez wycofany albo ręcznie sprzątany przebieg. */
  async releasePending(runId: string): Promise<number> {
    const directory = path.join(this.stateDir, "pending");
    let names: string[];
    try {
      names = await this.fs.readdir(directory);
    } catch (error) {
      if (isCode(error, "ENOENT")) return 0;
      throw new LedgerError("Nie można odczytać wpisów pending", error);
    }
    let removed = 0;
    for (const name of names.filter((entry) => entry.endsWith(".json"))) {
      const file = path.join(directory, name);
      let record: { runId?: string };
      try {
        record = JSON.parse(await this.fs.readFile(file, "utf8")) as { runId?: string };
      } catch {
        // Nieczytelnego wpisu nie przypisujemy do przebiegu bez dowodu.
        continue;
      }
      if (record.runId !== runId) continue;
      try {
        await this.fs.rm(file, { force: true });
        removed += 1;
      } catch (error) {
        throw new LedgerError(`Nie można zwolnić wpisu pending ${name}`, error);
      }
    }
    return removed;
  }

  async writeReport(report: { runId: string } & Record<string, unknown>): Promise<string> {
    const directory = path.join(this.stateDir, "reports");
    await this.fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, `${safeName(report.runId)}.json`);
    await this.fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: "w" });
    return file;
  }

  private async update(key: string, change: Partial<LedgerRecord>): Promise<void> {
    const file = path.join(this.stateDir, "idempotency", `${safeName(key)}.json`);
    let current: LedgerRecord;
    try {
      current = JSON.parse(await this.fs.readFile(file, "utf8")) as LedgerRecord;
    } catch (error) {
      if (isCode(error, "ENOENT")) {
        current = { key, runId: this.runId, status: "started", startedAt: this.now().toISOString() };
        await this.fs.mkdir(path.dirname(file), { recursive: true });
      } else {
        throw new LedgerError("Nie można zaktualizować wpisu idempotencji", error);
      }
    }
    await this.fs.writeFile(file, `${JSON.stringify({ ...current, ...change }, null, 2)}\n`, { flag: "w" });
  }
}

