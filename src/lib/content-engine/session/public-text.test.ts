import assert from "node:assert/strict";
import test from "node:test";

import { JournalEntrySchema, QueueItemSchema } from "./daily-state";
import { assertPublicPrText, gscDataHits, isPublicSafe } from "./public-text";

test("walidator łapie dane GSC w obu szykach, skrótach planu i fragmentach eksportu", () => {
  for (const text of [
    "Ma 120 kliknięć i 4000 wyświetleń.",
    "clicks: 13, impressions: 1060",
    "Kliknięcia 13",
    "CTR 2.93% wobec odniesienia 7.6%",
    "2,93% CTR",
    "341 wyśw. na poz. 3.8",
    "średnia pozycja 3,8",
    "pozycja 3.8, wyświetlenia 341",
    "Najpopularniejsze strony,Kliknięcia,Wyświetlenia,CTR,Pozycja",
    "Top queries;Clicks;Impressions",
  ]) {
    assert.equal(isPublicSafe(text), false, text);
  }
});

test("walidator przepuszcza opis jakościowy, daty, wyniki testów i liczby bez metryk GSC", () => {
  for (const text of [
    "Porównanie ma popyt w GSC i pozycję w pierwszej piątce, ale CTR poniżej oczekiwanego.",
    "Eksport z danymi do 10.11.2026, świeży.",
    "pnpm -s test: 1722 + 242 testy zielone; smoke 268/268, Playwright 16/16",
    "17 twierdzeń z 2 źródeł; 2 pozycje w kolejce",
    "Lotnisko leży 8 km od miasta, autobus jedzie około 15 minut.",
  ]) {
    assert.equal(isPublicSafe(text), true, text);
  }
});

test("każde zapisywane pole kolejki i dziennika przechodzi walidator", () => {
  const now = "2026-11-18T08:00:00.000Z";
  const item = { id: "content-new-x", kind: "content_new", target: "/porownanie/x", title: "Temat", why: "Brak dokumentu ze źródłami.", source: "gsc", priority: 50, status: "todo", createdAt: now, updatedAt: now, notes: [] };
  assert.equal(QueueItemSchema.safeParse(item).success, true);
  assert.equal(QueueItemSchema.safeParse({ ...item, why: "clicks: 13, impressions: 1060" }).success, false);
  assert.equal(QueueItemSchema.safeParse({ ...item, target: "/porownanie/x 341 wyświetleń" }).success, false);
  const entry = {
    date: "2026-11-18",
    runId: "daily-2026-11-18-abcd1234",
    branch: "claude/seo-daily/2026-11-18",
    base: "main",
    gsc: { dataEnd: "2026-11-10", exact: true, freshness: "fresh" },
    tasks: [{ queueId: "content-new-x", kind: "content_new", target: "/porownanie/x", outcome: "PR z dokumentem" }],
    tests: ["pnpm -s test: zielone"],
    summary: "Dokument ze źródłami dla porównania.",
    nextSteps: [],
  };
  assert.equal(JournalEntrySchema.safeParse(entry).success, true);
  assert.equal(JournalEntrySchema.safeParse({ ...entry, tasks: [{ ...entry.tasks[0], outcome: "CTR 2.9%, 10 kliknięć" }] }).success, false);
  assert.equal(JournalEntrySchema.safeParse({ ...entry, tasks: [{ ...entry.tasks[0], target: "/x poz. 3.8" }] }).success, false);
  assert.equal(JournalEntrySchema.safeParse({ ...entry, gsc: { ...entry.gsc, dataEnd: "dane z 341 wyświetleniami" } }).success, false);
});

test("opis PR: limit długości i zakaz danych GSC", () => {
  assert.doesNotThrow(() => assertPublicPrText("Zadanie z planu sesji, testy zielone.", "Opis"));
  assert.throws(() => assertPublicPrText("Dowody: 341 wyśw. na poz. 3.8", "Opis PR"), /Opis PR zawiera surowe dane GSC/);
  assert.throws(() => assertPublicPrText("x".repeat(10_001), "Opis PR"), /limit 10000/);
  assert.equal(gscDataHits("ok\nclicks: 5").length, 1);
});
