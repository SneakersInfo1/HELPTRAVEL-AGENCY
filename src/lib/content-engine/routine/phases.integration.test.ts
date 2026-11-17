import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { fixtureScenario } from "../fixtures/scenarios";
import { FixtureInventory } from "../inventory";
import { Ledger } from "../ledger";
import { FixtureSourceFetcher } from "../sources";
import { ContentStore } from "../store";
import { GitHubClient, type ProcessRunOptions, type ProcessRunResult, type ProcessRunner } from "./github";
import { GitState } from "./git-state";
import { RoutinePhases } from "./phases";
import { routinePaths } from "./work-order";
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
  phases: RoutinePhases;
  paths: ReturnType<typeof routinePaths>;
}

async function harness(t: TestContext, env: Record<string, string> = {}): Promise<Harness> {
  const fixture = await createGitFixture("seo-routine-phases-");
  t.after(fixture.cleanup);
  const clone = await fixture.clone("work");
  const scenario = fixtureScenario("refresh");
  const store = new ContentStore(path.join(clone, "content", "seo"));
  const state = new GitState({ cwd: clone, now: () => new Date(NOW) });
  const gh = new FakeGhRunner();
  const root = path.join(clone, ".seo-routine");
  let sequence = 0;
  const phases = new RoutinePhases({
    sourceFetcher: new FixtureSourceFetcher(scenario.sources, () => new Date(NOW)),
    inventory: new FixtureInventory(scenario.inventory),
    store,
    git: state,
    gh: new GitHubClient(gh, clone),
    env,
    now: () => new Date(NOW),
    randomUUID: () => `routine-run-${++sequence}`,
    routineDir: root,
    stateDir: path.join(clone, ".seo-engine-state"),
    loadBacklog: async () => scenario.gsc,
  });
  return { fixture, clone, scenario, store, state, gh, phases, paths: routinePaths(root) };
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

test("Routine przechodzi prepare → verify → finalize → publish i tworzy REST PR", async (t) => {
  const input = await harness(t);
  await throughFinalize(input);
  const documents = await input.store.listDocuments();
  assert.equal(documents.length, 1);
  assert.equal(documents[0].reviewStatus, "in_review");
  const prBody = await readFile(input.paths.prBody, "utf8");
  assert.match(prBody, /pnpm content:verify -- --approve madeira-czy-teneryfa/);
  assert.match(prBody, /visitmadeira\.com/);

  const published = await input.phases.publish({ base: "release-base" });
  assert.equal(published.status, "PR_CREATED");
  assert.equal(published.prNumber, 42);
  const prCall = input.gh.calls.find((call) => call.args[1]?.endsWith("/pulls"));
  assert.ok(prCall);
  assert.deepEqual(prCall.args.slice(0, 2), ["api", "repos/acme/travel/pulls"]);
  assert.equal(prCall.args.includes("pr"), false);
  const payload = JSON.parse(prCall.options?.input ?? "{}") as { base?: string; head?: string; draft?: boolean };
  assert.equal(payload.base, "release-base");
  assert.equal(payload.head, "claude/seo-content/2026-11-13-madeira-czy-teneryfa");
  assert.equal(payload.draft, false);
  assert.match(await git(input.clone, ["ls-remote", "--heads", "origin", `refs/heads/${payload.head}`]), /refs\/heads\/claude\/seo-content/);
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
  const branch = "claude/seo-content/2026-11-12-czekajaca-propozycja";
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
