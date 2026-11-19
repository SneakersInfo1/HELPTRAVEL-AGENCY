// Pamięć między sesjami „SEO daily”: kolejka tematów i dziennik wykonanej pracy.
//
// Każda sesja startuje w świeżym katalogu roboczym, a PR-y czekają na przegląd
// różnie długo, więc pamięć NIE może żyć w plikach na gałęzi PR (konflikty przy
// scalaniu kilku PR-ów, niewidoczność przed scaleniem). Żyje w gałęzi stanu
// (domyślnie `claude/seo-engine-state`) w folderze `daily/`, utrwalanej przez
// `GitState.persistState` bez force-pusha.
//
// Repozytorium jest PUBLICZNE: w kolejce i dzienniku nie ma surowych danych GSC
// (zapytań, kliknięć, wyświetleń per adres). Uzasadnienie opisujemy jakościowo,
// a liczby zostają w lokalnym `.seo-daily/plan.md`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { PUBLIC_TEXT_MESSAGE, isPublicSafe } from "./public-text";

export const DAILY_FOLDER = "daily";

export const QueueKindSchema = z.enum([
  "content_new",
  "content_refresh",
  "internal_links",
  "dedup",
  "conversion",
  "technical",
]);

export const QueueStatusSchema = z.enum([
  "todo",
  "in_progress",
  "pending_review",
  "done",
  "rejected",
  "do_not_redo",
]);

/** Każdy zapisywany tekst przechodzi ten sam walidator danych publicznych (session/public-text.ts). */
function publicString(min: number, max: number) {
  return z.string().min(min).max(max).refine(isPublicSafe, { message: PUBLIC_TEXT_MESSAGE });
}

const PublicText = publicString(3, 600);

export const QueueItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/),
  kind: QueueKindSchema,
  /** Adres na stronie (`/porownanie/...`) albo obszar techniczny (`src/...`, `szablon:...`). */
  target: publicString(1, 200),
  title: PublicText,
  why: PublicText,
  source: z.enum(["gsc", "freshness", "backlog", "audit", "owner", "session"]),
  priority: z.number().int().min(0).max(100),
  status: QueueStatusSchema,
  prUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.array(PublicText).default([]),
});

export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueFileSchema = z.object({ version: z.literal(1), items: z.array(QueueItemSchema) });

export const JournalEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,80}$/),
  branch: publicString(1, 200).nullable(),
  base: publicString(1, 200),
  gsc: z.object({
    dataEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    exact: z.boolean(),
    freshness: z.enum(["fresh", "aging", "stale", "missing"]),
  }),
  tasks: z
    .array(
      z.object({
        queueId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/).nullable(),
        kind: QueueKindSchema,
        target: publicString(1, 200),
        outcome: publicString(2, 60),
        prUrl: z.string().url().optional(),
      }),
    )
    .default([]),
  tests: z.array(PublicText).default([]),
  summary: PublicText,
  nextSteps: z.array(PublicText).default([]),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const JournalFileSchema = z.object({ version: z.literal(1), entries: z.array(JournalEntrySchema) });

export interface DailyStatePaths {
  queueJson: string;
  queueMd: string;
  journalJson: string;
  journalMd: string;
}

export function dailyStatePaths(stateDir: string): DailyStatePaths {
  const root = path.join(stateDir, DAILY_FOLDER);
  return {
    queueJson: path.join(root, "queue.json"),
    queueMd: path.join(root, "QUEUE.md"),
    journalJson: path.join(root, "journal.json"),
    journalMd: path.join(root, "JOURNAL.md"),
  };
}

async function readJson<T>(file: string, schema: z.ZodType<T>, empty: T): Promise<T> {
  try {
    return schema.parse(JSON.parse(await fs.readFile(file, "utf8")));
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT") return empty;
    throw error;
  }
}

export async function readQueue(stateDir: string): Promise<QueueItem[]> {
  return (await readJson(dailyStatePaths(stateDir).queueJson, QueueFileSchema, { version: 1, items: [] })).items;
}

export async function readJournal(stateDir: string): Promise<JournalEntry[]> {
  return (await readJson(dailyStatePaths(stateDir).journalJson, JournalFileSchema, { version: 1, entries: [] })).entries;
}

const STATUS_ORDER: Record<QueueItem["status"], number> = {
  in_progress: 0,
  pending_review: 1,
  todo: 2,
  done: 3,
  rejected: 4,
  do_not_redo: 5,
};

function renderQueue(items: readonly QueueItem[]): string {
  const sorted = [...items].sort(
    (left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || right.priority - left.priority || left.id.localeCompare(right.id),
  );
  const lines = [
    "# Kolejka tematów SEO",
    "",
    "Plik generowany przez `pnpm seo:daily queue` — nie edytuj ręcznie, zmiany przez CLI.",
    "Statusy `done`, `rejected` i `do_not_redo` oznaczają tematy, których nie opracowujemy ponownie.",
    "",
    "| Status | Priorytet | Rodzaj | Cel | Temat | Dlaczego | PR |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const item of sorted) {
    lines.push(
      `| ${item.status} | ${item.priority} | ${item.kind} | \`${item.target}\` | ${item.title.replace(/\|/g, "/")} | ${item.why.replace(/\|/g, "/")} | ${item.prUrl ?? ""} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderJournal(entries: readonly JournalEntry[]): string {
  const lines = ["# Dziennik pracy SEO", "", "Najnowsze wpisy na górze. Generowany przez `pnpm seo:daily journal`.", ""];
  for (const entry of [...entries].sort((left, right) => right.date.localeCompare(left.date) || right.runId.localeCompare(left.runId))) {
    lines.push(`## ${entry.date} — ${entry.runId}`, "");
    lines.push(`- Gałąź: ${entry.branch ?? "brak (bez zmian)"}; baza: \`${entry.base}\``);
    lines.push(`- Dane GSC: ${entry.gsc.dataEnd ? `do ${entry.gsc.dataEnd}${entry.gsc.exact ? "" : " (szacunek)"}` : "brak"} — ${entry.gsc.freshness}`);
    for (const task of entry.tasks) {
      lines.push(`- ${task.kind} \`${task.target}\`: ${task.outcome}${task.prUrl ? ` — ${task.prUrl}` : ""}`);
    }
    if (entry.tests.length > 0) lines.push(`- Testy: ${entry.tests.join("; ")}`);
    lines.push(`- Podsumowanie: ${entry.summary}`);
    for (const step of entry.nextSteps) lines.push(`- Dalej: ${step}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeAll(stateDir: string, items: readonly QueueItem[] | null, entries: readonly JournalEntry[] | null): Promise<void> {
  const paths = dailyStatePaths(stateDir);
  await fs.mkdir(path.dirname(paths.queueJson), { recursive: true });
  if (items) {
    const validated = QueueFileSchema.parse({ version: 1, items });
    await fs.writeFile(paths.queueJson, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await fs.writeFile(paths.queueMd, renderQueue(validated.items), "utf8");
  }
  if (entries) {
    const validated = JournalFileSchema.parse({ version: 1, entries });
    await fs.writeFile(paths.journalJson, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await fs.writeFile(paths.journalMd, renderJournal(validated.entries), "utf8");
  }
}

export type QueueItemInput = Omit<QueueItem, "createdAt" | "updatedAt" | "notes" | "status"> &
  Partial<Pick<QueueItem, "status" | "notes">>;

/**
 * Dodaje temat albo aktualizuje istniejący o tym samym `id` lub tym samym celu i rodzaju.
 * Tematów zamkniętych (`done`, `rejected`, `do_not_redo`) nie otwiera ponownie — zwraca
 * `{ reopened: false }` z istniejącym wpisem, żeby sesja nie wróciła do odrzuconego tematu.
 */
export async function upsertQueueItem(
  stateDir: string,
  input: QueueItemInput,
  now: Date,
): Promise<{ item: QueueItem; created: boolean; blockedByClosed: boolean }> {
  const items = await readQueue(stateDir);
  const timestamp = now.toISOString();
  const index = items.findIndex((item) => item.id === input.id || (item.target === input.target && item.kind === input.kind));
  if (index >= 0) {
    const existing = items[index];
    if (["done", "rejected", "do_not_redo"].includes(existing.status) && (input.status ?? "todo") === "todo") {
      return { item: existing, created: false, blockedByClosed: true };
    }
    const updated = QueueItemSchema.parse({
      ...existing,
      ...input,
      id: existing.id,
      status: input.status ?? existing.status,
      notes: [...existing.notes, ...(input.notes ?? [])],
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    });
    items[index] = updated;
    await writeAll(stateDir, items, null);
    return { item: updated, created: false, blockedByClosed: false };
  }
  const created = QueueItemSchema.parse({ ...input, status: input.status ?? "todo", notes: input.notes ?? [], createdAt: timestamp, updatedAt: timestamp });
  await writeAll(stateDir, [...items, created], null);
  return { item: created, created: true, blockedByClosed: false };
}

export async function setQueueStatus(
  stateDir: string,
  id: string,
  status: QueueItem["status"],
  now: Date,
  extra: { prUrl?: string; note?: string } = {},
): Promise<QueueItem> {
  const items = await readQueue(stateDir);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`Brak tematu ${id} w kolejce`);
  const updated = QueueItemSchema.parse({
    ...items[index],
    status,
    ...(extra.prUrl ? { prUrl: extra.prUrl } : {}),
    notes: extra.note ? [...items[index].notes, extra.note] : items[index].notes,
    updatedAt: now.toISOString(),
  });
  items[index] = updated;
  await writeAll(stateDir, items, null);
  return updated;
}

/** Usuwa błędny wpis (np. z pomyłką w celu). Zamknięcie tematu to `setQueueStatus`, nie usunięcie. */
export async function removeQueueItem(stateDir: string, id: string): Promise<QueueItem> {
  const items = await readQueue(stateDir);
  const removed = items.find((item) => item.id === id);
  if (!removed) throw new Error(`Brak tematu ${id} w kolejce`);
  await writeAll(stateDir, items.filter((item) => item.id !== id), null);
  return removed;
}

export async function appendJournal(stateDir: string, entry: JournalEntry): Promise<void> {
  const entries = await readJournal(stateDir);
  const validated = JournalEntrySchema.parse(entry);
  await writeAll(stateDir, null, [...entries.filter((existing) => existing.runId !== validated.runId), validated]);
}

/** Cele, których sesja nie powinna opracowywać ponownie (zamknięte albo w przeglądzie). */
export function blockedTargets(items: readonly QueueItem[]): Set<string> {
  return new Set(items.filter((item) => item.status !== "todo").map((item) => item.target));
}
