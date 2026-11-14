import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { fixtureScenario, type FixtureScenarioName } from "./fixtures/scenarios";
import { FixtureInventory, StoreBackedInventory } from "./inventory";
import { Ledger } from "./ledger";
import { FakeLlm, LlmError, type FakeLlmOptions } from "./llm";
import type { EngineEnv } from "./models";
import { redactRunReport, runDaily, type RunReport } from "./pipeline";
import { FixtureSourceFetcher, type FixtureSource } from "./sources";
import { ContentStore, NODE_FS, type FsLike } from "./store";
import type { PublishMode } from "@/lib/content-quality/gate";

const SCHEDULED = "2026-11-13T04:17:00.000Z";

interface HarnessOptions {
  mode?: PublishMode;
  fakeOptions?: FakeLlmOptions;
  sources?: Readonly<Record<string, FixtureSource>>;
  storeFs?: FsLike;
  env?: EngineEnv;
  now?: () => Date;
  runId?: string;
  stateDir?: string;
  storeRoot?: string;
}

interface HarnessResult {
  report: RunReport;
  fake: FakeLlm;
  store: ContentStore;
  stateDir: string;
  storeRoot: string;
  cleanup: () => Promise<void>;
}

async function runFixture(name: FixtureScenarioName, options: HarnessOptions = {}): Promise<HarnessResult> {
  const parent = options.stateDir && options.storeRoot ? null : await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-"));
  const stateDir = options.stateDir ?? path.join(parent!, "state");
  const storeRoot = options.storeRoot ?? path.join(parent!, "store");
  const fixture = fixtureScenario(name);
  const store = new ContentStore(storeRoot, options.storeFs);
  const inventory = await StoreBackedInventory.create(new FixtureInventory(fixture.inventory), store);
  const fake = new FakeLlm(fixture.scripts, options.fakeOptions);
  const sourceFetcher = new FixtureSourceFetcher(options.sources ?? fixture.sources, () => new Date(SCHEDULED));
  const report = await runDaily(
    {
      gsc: fixture.gsc,
      inventory,
      store,
      llm: fake,
      sourceFetcher,
      env: options.env,
      now: options.now,
      sleep: async () => undefined,
      random: () => 0,
    },
    {
      mode: options.mode ?? "DRY_RUN",
      scheduledAt: SCHEDULED,
      stateDir,
      runId: options.runId,
    },
  );
  return {
    report,
    fake,
    store,
    stateDir,
    storeRoot,
    cleanup: async () => {
      if (parent) await rm(parent, { recursive: true, force: true });
    },
  };
}

test("scenariusz refresh kończy się ręcznym przeglądem z ważnym dokumentem", async (t) => {
  const result = await runFixture("refresh", { runId: "refresh-run" });
  t.after(result.cleanup);
  assert.equal(result.report.gateReport?.verdict, "REVIEW_REQUIRED");
  assert.equal(result.report.decision, "REVIEW_REQUIRED");
  assert.equal(result.report.outcome, "REVIEW_REQUIRED");
  assert.equal(result.fake.calls.length, 2);
  assert.deepEqual(await result.store.listDocuments(), []);
});

test("scenariusz new-evergreen przechodzi bramkę PASS", async (t) => {
  const result = await runFixture("new-evergreen", { runId: "evergreen-run" });
  t.after(result.cleanup);
  assert.equal(result.report.gateReport?.verdict, "PASS");
  assert.equal(result.report.outcome, "REVIEW_REQUIRED");
  assert.equal(result.fake.calls.length, 2);
});

test("nieznaleziony dowód ceny daje BLOCKED_FACTS i niczego nie zapisuje", async (t) => {
  const result = await runFixture("reject-unverified", { mode: "DRAFT_AND_PR", runId: "reject-run" });
  t.after(result.cleanup);
  assert.equal(result.report.gateReport?.verdict, "BLOCKED_FACTS");
  assert.equal(result.report.outcome, "REJECTED");
  assert.equal(result.fake.calls.length, 1);
  assert.deepEqual(await result.store.listDocuments(), []);
});

test("LLM 401 kończy przebieg FAILED, zapisuje dead-letter i nie pisze treści", async (t) => {
  const result = await runFixture("refresh", {
    mode: "DRAFT_AND_PR",
    runId: "unauthorized-run",
    fakeOptions: { failures: { researcher: [{ status: 401 }] } },
  });
  t.after(result.cleanup);
  assert.equal(result.report.outcome, "FAILED");
  assert.equal(result.fake.calls.length, 1);
  assert.deepEqual(await result.store.listDocuments(), []);
  const deadLetter = JSON.parse(await readFile(path.join(result.stateDir, "dead-letter", "unauthorized-run.json"), "utf8")) as { error: { message: string } };
  assert.match(deadLetter.error.message, /HTTP 401/);
});

test("LLM 429 jest ponowiony i przebieg dochodzi do bramki", async (t) => {
  const result = await runFixture("refresh", {
    runId: "rate-limit-run",
    fakeOptions: { failures: { researcher: [{ status: 429 }] } },
  });
  t.after(result.cleanup);
  assert.equal(result.report.outcome, "REVIEW_REQUIRED");
  assert.equal(result.fake.calls.filter((call) => call.role === "researcher").length, 2);
});

test("ciągłe 5xx kończy się FAILED po wszystkich retry", async (t) => {
  const result = await runFixture("refresh", {
    runId: "server-errors-run",
    fakeOptions: { failures: { researcher: [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }] } },
  });
  t.after(result.cleanup);
  assert.equal(result.report.outcome, "FAILED");
  assert.equal(result.fake.calls.length, 4);
});

test("wolny LLM przekraczający runtime kończy się błędem budżetu", async (t) => {
  let time = new Date(SCHEDULED).getTime();
  const result = await runFixture("refresh", {
    runId: "slow-run",
    env: { SEO_ENGINE_MAX_RUNTIME_SECONDS: "1" },
    now: () => new Date(time),
    fakeOptions: {
      latencyMs: { researcher: 2_000 },
      sleep: async (milliseconds) => {
        time += milliseconds;
      },
    },
  });
  t.after(result.cleanup);
  assert.equal(result.report.outcome, "FAILED");
  assert.match(result.report.error?.message ?? "", /runtime/);
});

test("brak osiągalnych źródeł daje zero twierdzeń i niczego nie zapisuje", async (t) => {
  const result = await runFixture("refresh", { mode: "DRAFT_AND_PR", runId: "no-sources-run", sources: {} });
  t.after(result.cleanup);
  assert.ok(["REJECTED", "SKIPPED_QUALITY_GATE"].includes(result.report.outcome));
  assert.equal(result.report.stages.research?.verifiedClaims, 0);
  assert.deepEqual(await result.store.listDocuments(), []);
});

test("EACCES sklepu daje FAILED bez częściowych plików", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-eacces-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const storeRoot = path.join(parent, "store");
  const stateDir = path.join(parent, "state");
  const failingFs: FsLike = {
    ...NODE_FS,
    writeFile: async (target, data, options) => {
      if (target.endsWith(".tmp")) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      await NODE_FS.writeFile(target, data, options);
    },
  };
  const result = await runFixture("refresh", { mode: "DRAFT_AND_PR", runId: "store-eacces-run", storeFs: failingFs, storeRoot, stateDir });
  assert.equal(result.report.outcome, "FAILED");
  assert.deepEqual(await result.store.listDocuments(), []);
});

test("awaria indeksu po zapisie dokumentu wycofuje sklep bajt w bajt", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-index-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const storeRoot = path.join(parent, "store");
  const stateDir = path.join(parent, "state");
  await NODE_FS.mkdir(storeRoot, { recursive: true });
  const originalIndex = "// poprzedni indeks\nexport const CONTENT_DOCUMENTS: unknown[] = [];\n";
  await writeFile(path.join(storeRoot, "index.generated.ts"), originalIndex, "utf8");
  const failingFs: FsLike = {
    ...NODE_FS,
    writeFile: async (target, data, options) => {
      if (path.basename(target).startsWith(".index.generated.")) throw Object.assign(new Error("index write failed"), { code: "EIO" });
      await NODE_FS.writeFile(target, data, options);
    },
  };
  const result = await runFixture("refresh", { mode: "DRAFT_AND_PR", runId: "index-failure-run", storeFs: failingFs, storeRoot, stateDir });
  assert.equal(result.report.outcome, "FAILED");
  assert.deepEqual(await result.store.listDocuments(), []);
  assert.equal(await readFile(path.join(storeRoot, "index.generated.ts"), "utf8"), originalIndex);
});

test("ważna blokada odrzuca drugi przebieg bez wywołania LLM", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-lock-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const stateDir = path.join(parent, "state");
  const storeRoot = path.join(parent, "store");
  const owner = new Ledger({ stateDir, runId: "lock-owner" });
  const lock = await owner.acquireLock("daily-2026-11-13", { ttlMs: 60_000, now: new Date(SCHEDULED) });
  const result = await runFixture("refresh", { runId: "blocked-run", stateDir, storeRoot, now: () => new Date(SCHEDULED) });
  assert.equal(result.report.outcome, "FAILED");
  assert.equal(result.fake.calls.length, 0);
  await lock.release();
});

test("wygasła blokada jest odzyskiwana przez następny przebieg", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-stale-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const stateDir = path.join(parent, "state");
  const storeRoot = path.join(parent, "store");
  const owner = new Ledger({ stateDir, runId: "stale-owner" });
  await owner.acquireLock("daily-2026-11-13", { ttlMs: 1_000, now: new Date("2026-11-13T04:00:00.000Z") });
  const result = await runFixture("refresh", { runId: "recovered-run", stateDir, storeRoot, now: () => new Date(SCHEDULED) });
  assert.equal(result.report.outcome, "REVIEW_REQUIRED");
});

test("ten sam dzień i zadanie drugi raz daje DUPLICATE_SKIPPED bez LLM", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-duplicate-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const stateDir = path.join(parent, "state");
  const storeRoot = path.join(parent, "store");
  const first = await runFixture("refresh", { runId: "first-run", stateDir, storeRoot });
  assert.equal(first.report.outcome, "REVIEW_REQUIRED");
  const second = await runFixture("refresh", { runId: "second-run", stateDir, storeRoot });
  assert.equal(second.report.outcome, "DUPLICATE_SKIPPED");
  assert.equal(second.fake.calls.length, 0);
  assert.deepEqual(await second.store.listDocuments(), []);
});

test("kill switch zatrzymuje przebieg przed LLM", async (t) => {
  const result = await runFixture("refresh", { runId: "killed-run", env: { SEO_ENGINE_KILL_SWITCH: "true" } });
  t.after(result.cleanup);
  assert.equal(result.report.outcome, "KILLED");
  assert.equal(result.fake.calls.length, 0);
});

test("DRY_RUN nie zapisuje sklepu", async (t) => {
  const result = await runFixture("new-evergreen", { runId: "dry-run" });
  t.after(result.cleanup);
  assert.deepEqual(await result.store.listDocuments(), []);
  await assert.rejects(readdir(path.join(result.storeRoot, "articles")), (error) => (error as NodeJS.ErrnoException).code === "ENOENT");
});

test("DRAFT_AND_PR zapisuje wyłącznie in_review", async (t) => {
  const result = await runFixture("new-evergreen", { mode: "DRAFT_AND_PR", runId: "draft-run" });
  t.after(result.cleanup);
  assert.equal(result.report.outcome, "DRAFT_CREATED");
  const documents = await result.store.listDocuments();
  assert.equal(documents.length, 1);
  assert.equal(documents[0].reviewStatus, "in_review");
  assert.equal(documents[0].reviewedBy, undefined);
});

test("AUTO_EVERGREEN zatwierdza tylko PASS plus EVERGREEN", async (t) => {
  const evergreen = await runFixture("new-evergreen", { mode: "AUTO_EVERGREEN", runId: "auto-evergreen-run" });
  t.after(evergreen.cleanup);
  assert.equal(evergreen.report.outcome, "PUBLISHED_AUTOMATION");
  assert.equal((await evergreen.store.listDocuments())[0].reviewStatus, "approved");

  const dynamic = await runFixture("refresh", { mode: "AUTO_EVERGREEN", runId: "auto-dynamic-run" });
  t.after(dynamic.cleanup);
  assert.notEqual(dynamic.report.gateReport?.verdict, "PASS");
  assert.equal((await dynamic.store.listDocuments())[0].reviewStatus, "in_review");
});

// ── Regresje z przeglądu 2026-11-14 ─────────────────────────────────────

test("propozycja dla strony blokuje kolejne przebiegi przez PENDING_PROPOSAL_DAYS — bez nowego PR co dzień", async (t) => {
  const first = await runFixture("new-evergreen", { mode: "DRAFT_AND_PR", runId: "pending-first" });
  t.after(first.cleanup);
  assert.equal(first.report.outcome, "DRAFT_CREATED");
  const target = first.report.selectedTasks.find((task) => task.decision !== "REVIEW_REQUIRED")!.target;

  // Następny dzień, ten sam stan: idempotencja per dzień już nie chroni, blokada propozycji tak.
  const next = await runDaily(
    {
      gsc: fixtureScenario("new-evergreen").gsc,
      inventory: await StoreBackedInventory.create(new FixtureInventory(fixtureScenario("new-evergreen").inventory), first.store),
      store: first.store,
      llm: new FakeLlm(fixtureScenario("new-evergreen").scripts),
      sourceFetcher: new FixtureSourceFetcher(fixtureScenario("new-evergreen").sources, () => new Date("2026-11-14T04:17:00.000Z")),
      sleep: async () => undefined,
      random: () => 0,
    },
    { mode: "DRAFT_AND_PR", scheduledAt: "2026-11-14T04:17:00.000Z", stateDir: first.stateDir, runId: "pending-next" },
  );
  assert.ok(!next.selectedTasks.some((task) => task.target === target), "ta sama strona wybrana ponownie mimo otwartej propozycji");
});

test("ucięta odpowiedź (max_tokens) jest doliczana do budżetu, a nie gubiona", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-pipeline-cut-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const fixture = fixtureScenario("refresh");
  const store = new ContentStore(path.join(parent, "store"));
  const cut = new LlmError("Odpowiedź ucięta limitem max_tokens", null, false, "invalid_response", {
    inputTokens: 2_000,
    outputTokens: 8_000,
    model: "claude-opus-5-5",
  });
  const report = await runDaily(
    {
      gsc: fixture.gsc,
      inventory: await StoreBackedInventory.create(new FixtureInventory(fixture.inventory), store),
      store,
      llm: new FakeLlm({ researcher: [cut] }),
      sourceFetcher: new FixtureSourceFetcher(fixture.sources, () => new Date(SCHEDULED)),
      sleep: async () => undefined,
      random: () => 0,
    },
    { mode: "DRY_RUN", scheduledAt: SCHEDULED, stateDir: path.join(parent, "state"), runId: "cut-run" },
  );
  assert.equal(report.outcome, "FAILED");
  // 2000 × 4 + 8000 × 20 USD za MTok (claude-opus-5-5) = 0,168 USD.
  assert.equal(report.usage.costUsd, 0.168);
  assert.equal(report.usage.outputTokens, 8_000);
});

test("budżet odmawia żądania, którego najgorszy koszt przekroczyłby limit", async (t) => {
  const result = await runFixture("refresh", { runId: "reserve-run", env: { SEO_ENGINE_MAX_USD_PER_RUN: "0.05" } });
  t.after(result.cleanup);
  // Researcher (8000 tokenów wyjścia × 20 USD/MTok = 0,16 USD) nie zmieści się w 0,05 USD.
  assert.equal(result.report.outcome, "FAILED");
  assert.equal(result.fake.calls.length, 0);
  assert.match(result.report.error?.message ?? "", /usd/i);
});

test("raport publiczny nie zawiera danych z Search Console", async (t) => {
  const result = await runFixture("new-evergreen", { runId: "redact-run" });
  t.after(result.cleanup);
  const full = JSON.stringify(result.report);
  const publicReport = JSON.stringify(redactRunReport(result.report));
  const task = result.report.selectedTasks.find((item) => item.operation === "new_article")!;
  assert.ok(full.includes(task.primaryQuery));
  assert.ok(!publicReport.includes(task.primaryQuery), "zapytanie z GSC w raporcie publicznym");
  assert.ok(!publicReport.includes(`"impressions":${task.evidence.impressions}`) || task.evidence.impressions === 0);
  assert.ok(publicReport.includes(task.target));
});
