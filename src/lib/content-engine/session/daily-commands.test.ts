import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { fixtureScenario } from "../fixtures/scenarios";
import { FixtureInventory } from "../inventory";
import type { ContentStore } from "../store";
import {
  dailyGsc,
  dailyJournal,
  dailyPlan,
  dailyQueueAdd,
  dailyQueueSet,
  dailyStatus,
  gscSearchDirs,
  queueIdFor,
  type DailyContext,
} from "./daily-commands";
import { readJournal, readQueue, upsertQueueItem } from "./daily-state";
import type { StateFolder } from "./git-state";
import type { PullRequestState } from "./github";

const NOW = new Date("2026-11-17T09:00:00.000Z");

class FakeDailyGit {
  readonly restores: Array<readonly StateFolder[] | undefined> = [];
  readonly persists: Array<{ message: string; folders: readonly StateFolder[] | undefined }> = [];
  async restoreState(_stateDir: string, folders?: readonly StateFolder[]): Promise<void> {
    this.restores.push(folders);
  }
  async persistState(_stateDir: string, message: string, folders?: readonly StateFolder[]): Promise<void> {
    this.persists.push({ message, folders });
  }
  async listProposalBranches() {
    return [];
  }
  async remoteUrl(): Promise<string> {
    return "https://github.com/acme/travel.git";
  }
}

async function context(t: TestContext, prs: Record<number, PullRequestState> = {}): Promise<{ ctx: DailyContext; git: FakeDailyGit; root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "seo-daily-commands-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = new FakeDailyGit();
  const ctx: DailyContext = {
    git,
    gh: {
      getPullRequest: async ({ number }) => {
        const pr = prs[number];
        if (!pr) throw new Error(`brak PR ${number}`);
        return pr;
      },
    },
    now: () => new Date(NOW),
    stateDir: path.join(root, "state"),
    sessionDir: path.join(root, "session"),
    outDir: path.join(root, "out"),
  };
  return { ctx, git, root };
}

async function seed(stateDir: string, id: string, status: "pending_review" | "todo", prUrl?: string): Promise<void> {
  await upsertQueueItem(
    stateDir,
    { id, kind: "content_new", target: `/porownanie/${id}`, title: `Dokument dla ${id}`, why: "Popyt w GSC bez dokumentu ze źródłami.", source: "gsc", priority: 60, status, ...(prUrl ? { prUrl } : {}) },
    NOW,
  );
}

test("status --sync: scalony PR → done, zamknięty → rejected, otwarty bez zmian; utrwala tylko daily/", async (t) => {
  const { ctx, git } = await context(t, {
    8: { number: 8, url: "https://github.com/acme/travel/pull/8", state: "closed", merged: true },
    9: { number: 9, url: "https://github.com/acme/travel/pull/9", state: "closed", merged: false },
    10: { number: 10, url: "https://github.com/acme/travel/pull/10", state: "open", merged: false },
  });
  await seed(ctx.stateDir!, "scalony", "pending_review", "https://github.com/acme/travel/pull/8");
  await seed(ctx.stateDir!, "zamkniety", "pending_review", "https://github.com/acme/travel/pull/9");
  await seed(ctx.stateDir!, "otwarty", "pending_review", "https://github.com/acme/travel/pull/10");
  const output = await dailyStatus(ctx, { sync: true });
  const byId = new Map((await readQueue(ctx.stateDir!)).map((item) => [item.id, item.status]));
  assert.equal(byId.get("scalony"), "done");
  assert.equal(byId.get("zamkniety"), "rejected");
  assert.equal(byId.get("otwarty"), "pending_review");
  assert.deepEqual(git.persists.map((call) => call.folders), [["daily"]]);
  assert.equal(git.restores[0], undefined, "bez zadania w toku odtwarzamy cały stan");
  assert.match(output.report, /Synchronizacja PR: scalony: done/);
  assert.equal(output.result.status, "OK");
});

test("zadanie treści w toku: status odtwarza wyłącznie daily/, żeby nie skasować lokalnego rejestru", async (t) => {
  const { ctx, git } = await context(t);
  await mkdir(ctx.sessionDir!, { recursive: true });
  await writeFile(path.join(ctx.sessionDir!, "result.json"), JSON.stringify({ status: "DRAFT_READY", runId: "r1", day: "2026-11-17" }), "utf8");
  await dailyStatus(ctx);
  assert.deepEqual(git.restores, [["daily"]]);
  assert.equal(git.persists.length, 0);
});

test("kolejka: dodanie z identyfikatorem z celu, bez liczb GSC i bez ponownego otwierania zamkniętych", async (t) => {
  const { ctx, git } = await context(t);
  const added = await dailyQueueAdd(ctx, {
    kind: "internal_links",
    target: "/porownanie/barcelona-spain-vs-malaga-spain",
    title: "Linki między porównaniami Hiszpanii",
    why: "Porównania tej samej intencji nie linkują do siebie.",
    priority: 40,
  });
  assert.equal(added.result.status, "OK");
  const [item] = await readQueue(ctx.stateDir!);
  assert.equal(item.id, "internal-links-porownanie-barcelona-spain-vs-malaga-spain");
  assert.equal(item.source, "session");
  await assert.rejects(
    dailyQueueAdd(ctx, { kind: "content_new", target: "/porownanie/x", title: "Temat z liczbami", why: "Ma 120 kliknięć i 4000 wyświetleń." }),
    /Bez surowych liczb GSC/,
  );
  await dailyQueueSet(ctx, item.id, { status: "rejected", note: "Właściciel odrzucił temat." });
  const persistsBefore = git.persists.length;
  const again = await dailyQueueAdd(ctx, { kind: "internal_links", target: item.target, title: "Linki raz jeszcze", why: "Ponowna próba tego samego tematu." });
  assert.match(again.result.reason ?? "", /zamknięty \(rejected\)/);
  assert.equal(git.persists.length, persistsBefore);
  assert.ok(git.persists.every((call) => JSON.stringify(call.folders) === '["daily"]'));
});

test("dziennik: wpis z pliku z uzupełnionym runId trafia do journal.json i JOURNAL.md", async (t) => {
  const { ctx, root } = await context(t);
  const file = path.join(root, "wpis.json");
  await writeFile(
    file,
    JSON.stringify({
      branch: "claude/seo-daily/2026-11-17",
      base: "main",
      gsc: { dataEnd: "2026-11-10", exact: false, freshness: "fresh" },
      tasks: [{ queueId: null, kind: "content_new", target: "/porownanie/barcelona-spain-vs-malaga-spain", outcome: "PR z dokumentem" }],
      tests: ["pnpm -s test: zielone"],
      summary: "Dokument ze źródłami dla porównania Barcelona–Malaga.",
      nextSteps: ["Po scaleniu: odświeżyć plan na nowym eksporcie GSC."],
    }),
    "utf8",
  );
  const output = await dailyJournal(ctx, file);
  assert.equal(output.result.status, "OK");
  const [entry] = await readJournal(ctx.stateDir!);
  assert.equal(entry.date, "2026-11-17");
  assert.match(entry.runId, /^daily-2026-11-17-[0-9a-f]{8}$/);
  assert.ok(existsSync(path.join(ctx.stateDir!, "daily", "JOURNAL.md")));
});

test("gsc: brak eksportu daje instrukcję dla właściciela, a eksport z Daty.csv — dokładny wiek danych", async (t) => {
  const { ctx, root } = await context(t);
  const empty = await dailyGsc(ctx, [path.join(root, "nie-ma")]);
  assert.match(empty.report, /Nie znaleziono eksportu GSC/);
  const folder = path.join(root, "inbox", "eksport");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "Strony.csv"), "Najpopularniejsze strony,Kliknięcia,Wyświetlenia,CTR,Pozycja\nhttps://helptravel.pl/porownanie/a-vs-b,3,900,0.33%,7.1\n", "utf8");
  await writeFile(path.join(folder, "Zapytania.csv"), "Najpopularniejsze zapytania,Kliknięcia,Wyświetlenia,CTR,Pozycja\na czy b,1,50,2%,6\n", "utf8");
  await writeFile(path.join(folder, "Daty.csv"), "Data,Kliknięcia,Wyświetlenia,CTR,Pozycja\n2026-10-01,1,10,10%,5\n", "utf8");
  const found = await dailyGsc(ctx, [path.join(root, "inbox")]);
  assert.deepEqual(found.result.gsc, { source: "export", dataEnd: "2026-10-01", exact: true, freshness: "stale" });
  assert.match(found.report, /wiek: 47 dni → stale/);
  const saved = JSON.parse(await readFile(path.join(ctx.outDir!, "gsc.json"), "utf8")) as { dataEnd: string };
  assert.equal(saved.dataEnd, "2026-10-01");
});

test("plan: kandydat z GSC trafia do lokalnego planu, temat w przeglądzie jest pominięty", async (t) => {
  const { ctx } = await context(t);
  const scenario = fixtureScenario("refresh");
  const store = { listDocuments: async () => [] } as unknown as ContentStore;
  const loaded = { inputs: scenario.gsc, dataEnd: "2026-11-15", exact: true, freshness: "fresh" as const };
  const output = await dailyPlan(ctx, { inventory: new FixtureInventory(scenario.inventory), store, gsc: { loaded, label: "test" }, loadBacklog: async () => scenario.gsc });
  assert.match(output.report, /content_new `\/porownanie\/madeira-czy-teneryfa`/);
  const markdown = await readFile(path.join(ctx.outDir!, "plan.md"), "utf8");
  assert.match(markdown, /dane do 2026-11-15 — fresh/);
  await seed(ctx.stateDir!, "madeira-czy-teneryfa", "pending_review", "https://github.com/acme/travel/pull/11");
  const blocked = await dailyPlan(ctx, { inventory: new FixtureInventory(scenario.inventory), store, gsc: { loaded, label: "test" }, loadBacklog: async () => scenario.gsc });
  assert.doesNotMatch(blocked.report, /madeira-czy-teneryfa`/);
});

test("katalogi eksportów GSC: wskazany wygrywa, potem inbox, seo-private i Pobrane", () => {
  assert.deepEqual(gscSearchDirs({ explicitDir: "C:/eksport" }), [path.resolve("C:/eksport")]);
  const dirs = gscSearchDirs({ env: { SEO_GSC_INBOX: "/inbox" }, cwd: "/wt", mainCheckout: "/main", home: "/home/u" });
  assert.deepEqual(
    dirs,
    ["/inbox", "/main/seo-private/gsc-inbox", "/main/seo-private/gsc", "/wt/seo-private/gsc-inbox", "/wt/seo-private/gsc", "/home/u/Downloads", "/home/u/Pobrane"].map((entry) => path.resolve(entry)),
  );
  assert.equal(queueIdFor("content_refresh", "/porównanie/Łódź-czy-Kraków"), "content-refresh-porownanie-lodz-czy-krakow");
});
