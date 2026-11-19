import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { fixtureScenario } from "../fixtures/scenarios";
import { FixtureInventory } from "../inventory";
import { collect } from "../pipeline";
import { Ledger } from "../ledger";
import { FixtureSourceFetcher } from "../sources";
import { ContentStore } from "../store";
import { GitHubClient, type ProcessRunOptions, type ProcessRunResult, type ProcessRunner } from "./github";
import { GitState } from "./git-state";
import { SessionPhases, taskForTarget, type SessionDependencies } from "./phases";
import { sessionPaths } from "./work-order";
import { createGitFixture, git, type GitFixture } from "./test-git-helper";

const DAY = "2026-11-13";
const NOW = new Date(`${DAY}T00:00:00.000Z`);

class FakeGhRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: readonly string[]; options?: ProcessRunOptions }> = [];
  failPullRequest = false;

  async run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessRunResult> {
    this.calls.push({ command, args: [...args], options });
    if (args[1]?.endsWith("/pulls")) {
      if (this.failPullRequest) throw new Error("GitHub REST niedostępny");
      return { stdout: JSON.stringify({ number: 42, html_url: "https://github.com/acme/travel/pull/42" }), stderr: "" };
    }
    return { stdout: "{}", stderr: "" };
  }
}

interface Harness {
  fixture: GitFixture;
  clone: string;
  scenario: ReturnType<typeof fixtureScenario>;
  store: ContentStore;
  state: GitState;
  gh: FakeGhRunner;
  phases: SessionPhases;
  paths: ReturnType<typeof sessionPaths>;
}

async function harness(t: TestContext, env: Record<string, string> = {}, overrides: Partial<SessionDependencies> = {}): Promise<Harness> {
  const fixture = await createGitFixture("seo-session-phases-");
  t.after(fixture.cleanup);
  const clone = await fixture.clone("work");
  const scenario = fixtureScenario("refresh");
  const store = new ContentStore(path.join(clone, "content", "seo"));
  const state = new GitState({ cwd: clone, now: () => new Date(NOW) });
  const gh = new FakeGhRunner();
  const root = path.join(clone, ".seo-session");
  let sequence = 0;
  const phases = new SessionPhases({
    sourceFetcher: new FixtureSourceFetcher(scenario.sources, () => new Date(NOW)),
    inventory: new FixtureInventory(scenario.inventory),
    store,
    git: state,
    gh: new GitHubClient(gh, clone),
    env,
    now: () => new Date(NOW),
    randomUUID: () => `session-run-${++sequence}`,
    sessionDir: root,
    stateDir: path.join(clone, ".seo-engine-state"),
    loadBacklog: async () => scenario.gsc,
    ...overrides,
  });
  return { fixture, clone, scenario, store, state, gh, phases, paths: sessionPaths(root) };
}

function scriptedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "text" in value && typeof (value as { text?: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  throw new Error("Fixture nie zawiera tekstowej odpowiedzi.");
}

async function writeAgentFiles(input: Harness): Promise<void> {
  await writeFile(input.paths.candidates, scriptedText(input.scenario.scripts.researcher?.[0]), "utf8");
  await writeFile(input.paths.draftBody, scriptedText(input.scenario.scripts.writer?.[0]), "utf8");
}

async function throughFinalize(input: Harness): Promise<void> {
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "TASK_READY");
  await writeAgentFiles(input);
  assert.equal((await input.phases.verifyClaims()).status, "CLAIMS_VERIFIED");
  assert.equal((await input.phases.finalize()).status, "DRAFT_READY");
}

test("Sesja przechodzi prepare → verify → finalize → publish i tworzy REST PR", async (t) => {
  const input = await harness(t);
  await throughFinalize(input);
  const documents = await input.store.listDocuments();
  assert.equal(documents.length, 1);
  assert.equal(documents[0].reviewStatus, "in_review");
  const prBody = await readFile(input.paths.prBody, "utf8");
  assert.match(prBody, /pnpm content:verify -- --approve madeira-czy-teneryfa/);
  assert.match(prBody, /visitmadeira\.com/);

  await git(input.clone, ["push", "origin", "HEAD:refs/heads/release-base"]);
  await git(input.clone, ["fetch", "origin"]);
  const published = await input.phases.publish({ base: "release-base", extraBody: "Zadanie z planu sesji; testy: pnpm -s test." });
  assert.equal(published.status, "PR_CREATED");
  assert.equal(published.prNumber, 42);
  const prCall = input.gh.calls.find((call) => call.args[1]?.endsWith("/pulls"));
  assert.ok(prCall);
  assert.deepEqual(prCall.args.slice(0, 2), ["api", "repos/acme/travel/pulls"]);
  assert.equal(prCall.args.includes("pr"), false);
  const payload = JSON.parse(prCall.options?.input ?? "{}") as { base?: string; head?: string; draft?: boolean };
  assert.equal(payload.base, "release-base");
  assert.equal(payload.head, "claude/seo-daily/2026-11-13-madeira-czy-teneryfa");
  assert.equal(payload.draft, false);
  assert.match(await git(input.clone, ["ls-remote", "--heads", "origin", `refs/heads/${payload.head}`]), /refs\/heads\/claude\/seo-daily\/2026-11-13-madeira-czy-teneryfa/);
  assert.match((payload as { body?: string }).body ?? "", /## Praca sesji\n\nZadanie z planu sesji/);
});

test("cytat spoza źródła daje BLOCKED_FACTS i nie zapisuje treści", async (t) => {
  const input = await harness(t);
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "TASK_READY");
  const candidates = JSON.parse(scriptedText(input.scenario.scripts.researcher?.[0])) as { claims: Array<Record<string, unknown>> };
  candidates.claims = [{ ...candidates.claims[0], observedEvidence: "Fragment, którego nie ma w źródle." }];
  await writeFile(input.paths.candidates, JSON.stringify(candidates), "utf8");
  assert.equal((await input.phases.verifyClaims()).status, "BLOCKED_FACTS");
  assert.deepEqual(await input.store.listDocuments(), []);
});

test("hamulec maxOpen zwraca NO_TASK przed claimem", async (t) => {
  const input = await harness(t);
  const branch = "claude/seo-daily/2026-11-12-czekajaca-propozycja";
  await git(input.clone, ["checkout", "-b", branch]);
  await git(input.clone, ["push", "origin", `HEAD:refs/heads/${branch}`]);
  await git(input.clone, ["checkout", "main"]);
  const result = await input.phases.prepare({ date: DAY, gscSource: "backlog", maxOpen: 1 });
  assert.equal(result.status, "NO_TASK");
  assert.match(result.reason ?? "", /czekają na przegląd/i);
  assert.deepEqual(await input.state.listClaims(), []);
});

test("kill switch zatrzymuje prepare przed claimem", async (t) => {
  const input = await harness(t, { SEO_ENGINE_KILL_SWITCH: "1" });
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "KILLED");
  assert.deepEqual(await input.state.listClaims(), []);
});

test("drugi prepare tego samego dnia daje DUPLICATE_SKIPPED", async (t) => {
  const input = await harness(t);
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "TASK_READY");
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "DUPLICATE_SKIPPED");
});

test("publish odmawia przy zmianie spoza content/seo", async (t) => {
  const input = await harness(t);
  await throughFinalize(input);
  await writeFile(path.join(input.clone, "outside.txt"), "nie wolno\n", "utf8");
  const result = await input.phases.publish();
  assert.equal(result.status, "FAILED");
  assert.match(result.errors?.join(" ") ?? "", /outside\.txt/);
  assert.equal(input.gh.calls.length, 0);
});

test("błąd utworzenia PR zwalnia pending i zwraca PR_FAILED", async (t) => {
  const input = await harness(t);
  await throughFinalize(input);
  input.gh.failPullRequest = true;
  const result = await input.phases.publish();
  assert.equal(result.status, "PR_FAILED");
  assert.match(result.errors?.join(" ") ?? "", /REST niedostępny/);
  const pending = await new Ledger({ stateDir: path.join(input.clone, ".seo-engine-state") }).pendingTargets(NOW, 14);
  assert.equal(pending.size, 0);
});

test("po drugiej nieudanej poprawce draft jest trwale REJECTED", async (t) => {
  const input = await harness(t);
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "TASK_READY");
  await writeFile(input.paths.candidates, scriptedText(input.scenario.scripts.researcher?.[0]), "utf8");
  assert.equal((await input.phases.verifyClaims()).status, "CLAIMS_VERIFIED");
  await writeFile(input.paths.draftBody, "{}", "utf8");
  const first = await input.phases.finalize();
  assert.equal(first.status, "REJECTED");
  assert.equal(first.retryAllowed, true);
  await writeFile(input.paths.draftBody, '{"title":"nadal źle"}', "utf8");
  const second = await input.phases.finalize();
  assert.equal(second.status, "REJECTED");
  assert.equal(second.retryAllowed, false);
  assert.equal(second.finalizeAttempts, 2);
});

test("taskForTarget: istniejący adres z renderowanym typem, bez adresów spoza serwisu i w przeglądzie", () => {
  const scenario = fixtureScenario("refresh");
  const inventory = new FixtureInventory(scenario.inventory);
  const collected = collect(scenario.gsc, inventory);
  const chosen = taskForTarget("https://helptravel.pl/porownanie/madeira-czy-teneryfa/", collected, inventory, new Set());
  assert.ok("task" in chosen);
  assert.equal(chosen.task.target, "/porownanie/madeira-czy-teneryfa");
  assert.equal(chosen.task.evidence.impressions, 3000);
  const missing = taskForTarget("/porownanie/nie-ma-takiej", collected, inventory, new Set());
  assert.ok("reason" in missing && /nie istnieje/.test(missing.reason));
  const pending = taskForTarget("/porownanie/madeira-czy-teneryfa", collected, inventory, new Set(["/porownanie/madeira-czy-teneryfa"]));
  assert.ok("reason" in pending && /czeka na przegląd/.test(pending.reason));
  const notRendered = taskForTarget("/kierunki/madeira", collected, inventory, new Set());
  assert.ok("reason" in notRendered && /nie jest renderowany/.test(notRendered.reason));
});

test("prepare z celem z planu: odrzucony cel nie zużywa dnia, poprawny dostaje zlecenie", async (t) => {
  const input = await harness(t);
  const missing = await input.phases.prepare({ date: DAY, gscSource: "backlog", target: "/porownanie/nie-ma-takiej" });
  assert.equal(missing.status, "NO_TASK");
  assert.deepEqual(await input.state.listClaims(), []);
  const ready = await input.phases.prepare({ date: DAY, gscSource: "backlog", target: "/porownanie/madeira-czy-teneryfa" });
  assert.equal(ready.status, "TASK_READY");
  const order = JSON.parse(await readFile(input.paths.workOrder, "utf8")) as { task: { target: string } };
  assert.equal(order.task.target, "/porownanie/madeira-czy-teneryfa");
  assert.equal((await input.state.listClaims()).length, 1);
});

test("prepare bierze lokalny eksport GSC i zapisuje tylko jego wiek, a bez eksportu źródło export zawodzi", async (t) => {
  const input = await harness(t, {}, {
    loadGscExport: () => ({ inputs: fixtureScenario("refresh").gsc, dataEnd: "2026-11-10", exact: true, freshness: "fresh" }),
  });
  const result = await input.phases.prepare({ date: DAY });
  assert.equal(result.status, "TASK_READY");
  assert.deepEqual(result.gsc, { source: "export", dataEnd: "2026-11-10", exact: true, freshness: "fresh" });
  const noExport = await harness(t, {}, { loadGscExport: () => null });
  const failed = await noExport.phases.prepare({ date: DAY, gscSource: "export" });
  assert.equal(failed.status, "FAILED");
  assert.match(failed.errors?.join(" ") ?? "", /Nie znaleziono eksportu GSC/);
});

test("--again pomija rezerwację dnia: drugie zadanie tego samego dnia bez drugiego claimu", async (t) => {
  const input = await harness(t);
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "TASK_READY");
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "DUPLICATE_SKIPPED");
  const again = await input.phases.prepare({ date: DAY, gscSource: "backlog", again: true });
  assert.equal(again.status, "TASK_READY");
  assert.equal((await input.state.listClaims()).length, 1);
});

test("publish --with-code dołącza kod, odmawia plików chronionych i zachowuje stan do ponowienia", async (t) => {
  const input = await harness(t);
  await git(input.clone, ["checkout", "-b", "claude/seo-daily/2026-11-13"]);
  await throughFinalize(input);
  await mkdir(path.join(input.clone, "src", "lib"), { recursive: true });
  await writeFile(path.join(input.clone, "src", "lib", "links.ts"), "export const RELATED = [\"/porownanie/madeira-czy-teneryfa\"];\n", "utf8");
  await writeFile(path.join(input.clone, "package.json"), "{}\n", "utf8");
  const refused = await input.phases.publish({ withCode: true });
  assert.equal(refused.status, "FAILED");
  assert.match(refused.errors?.join(" ") ?? "", /plików chronionych.*package\.json/);
  assert.equal(input.gh.calls.length, 0);
  await rm(path.join(input.clone, "package.json"));
  const published = await input.phases.publish({ withCode: true });
  assert.equal(published.status, "PR_CREATED");
  assert.equal(published.branch, "claude/seo-daily/2026-11-13");
  const files = await git(input.clone, ["show", "--name-only", "--format=", "HEAD"]);
  assert.match(files, /src\/lib\/links\.ts/);
  assert.match(files, /content\/seo\//);
});

test("publish sprawdza też commity zrobione w sesji i odmawia zmian polityki indeksowania", async (t) => {
  const input = await harness(t);
  await git(input.clone, ["checkout", "-b", "claude/seo-daily/2026-11-13"]);
  await throughFinalize(input);
  await mkdir(path.join(input.clone, ".github"), { recursive: true });
  await writeFile(path.join(input.clone, ".github", "ci.yml"), "on: push\n", "utf8");
  await git(input.clone, ["add", ".github/ci.yml"]);
  await git(input.clone, ["-c", "user.name=Sesja", "-c", "user.email=sesja@example.com", "commit", "-m", "obejście"]);
  const protectedCommit = await input.phases.publish({ withCode: true });
  assert.equal(protectedCommit.status, "FAILED");
  assert.match(protectedCommit.errors?.join(" ") ?? "", /\.github\/ci\.yml/);
  await git(input.clone, ["reset", "--hard", "HEAD~1"]);
  await mkdir(path.join(input.clone, "src", "app"), { recursive: true });
  await writeFile(path.join(input.clone, "src", "app", "page.tsx"), "export const metadata = { robots: { index: false } };\n", "utf8");
  const indexChange = await input.phases.publish({ withCode: true });
  assert.equal(indexChange.status, "FAILED");
  assert.match(indexChange.errors?.join(" ") ?? "", /polityki indeksowania.*src\/app\/page\.tsx/);
  assert.equal(input.gh.calls.length, 0);
});

test("publishCode tworzy PR z samym kodem tylko z gałęzi sesji", async (t) => {
  const input = await harness(t);
  await mkdir(path.join(input.clone, "src", "lib"), { recursive: true });
  await writeFile(path.join(input.clone, "src", "lib", "links.ts"), "export const RELATED: string[] = [];\n", "utf8");
  const body = "Linkowanie wewnętrzne między porównaniami tej samej intencji. Testy: pnpm -s test.";
  const wrongBranch = await input.phases.publishCode({ base: "main", title: "linki między porównaniami", body });
  assert.equal(wrongBranch.status, "FAILED");
  assert.match(wrongBranch.errors?.join(" ") ?? "", /gałęzi sesji/);
  await git(input.clone, ["checkout", "-b", "claude/seo-daily/2026-11-13"]);
  const created = await input.phases.publishCode({ base: "main", title: "linki między porównaniami", body });
  assert.equal(created.status, "PR_CREATED");
  const prCall = input.gh.calls.find((call) => call.args[1]?.endsWith("/pulls"));
  const payload = JSON.parse(prCall?.options?.input ?? "{}") as { head?: string; title?: string };
  assert.equal(payload.head, "claude/seo-daily/2026-11-13");
  assert.equal(payload.title, "SEO: linki między porównaniami");
});
