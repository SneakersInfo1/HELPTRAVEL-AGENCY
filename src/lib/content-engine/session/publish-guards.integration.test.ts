// Zabezpieczenia publikacji i stanu z przeglądu adwersarialnego PR #155 — na prawdziwym gicie
// (repozytorium bare + klony), z atrapą GitHuba. Każdy przypadek opisuje obejście albo utratę
// danych, którą publikacja musi zablokować.

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { fixtureScenario } from "../fixtures/scenarios";
import { FixtureInventory } from "../inventory";
import { FixtureSourceFetcher } from "../sources";
import { ContentStore } from "../store";
import { GitHubClient, type ProcessRunOptions, type ProcessRunResult, type ProcessRunner } from "./github";
import { GitState, parsePorcelainZ } from "./git-state";
import { SessionPhases } from "./phases";
import { sessionPaths } from "./work-order";
import { createGitFixture, git, type GitFixture } from "./test-git-helper";

const DAY = "2026-11-13";
const NOW = new Date(`${DAY}T00:00:00.000Z`);
const SESSION_BRANCH = `claude/seo-daily/${DAY}`;

class FakeGh implements ProcessRunner {
  readonly calls: Array<{ args: readonly string[]; options?: ProcessRunOptions }> = [];
  async run(_command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessRunResult> {
    this.calls.push({ args: [...args], options });
    if (args[1]?.endsWith("/pulls")) return { stdout: JSON.stringify({ number: 77, html_url: "https://github.com/acme/travel/pull/77" }), stderr: "" };
    return { stdout: "{}", stderr: "" };
  }
  prCalls(): number {
    return this.calls.filter((call) => call.args[1]?.endsWith("/pulls")).length;
  }
}

interface Input {
  fixture: GitFixture;
  clone: string;
  phases: SessionPhases;
  gh: FakeGh;
  paths: ReturnType<typeof sessionPaths>;
  scenario: ReturnType<typeof fixtureScenario>;
}

async function setup(t: TestContext, onSessionBranch = true): Promise<Input> {
  const fixture = await createGitFixture("seo-publish-guards-");
  t.after(fixture.cleanup);
  const clone = await fixture.clone("work");
  if (onSessionBranch) await git(clone, ["checkout", "-b", SESSION_BRANCH]);
  const scenario = fixtureScenario("refresh");
  const gh = new FakeGh();
  const root = path.join(clone, ".seo-session");
  let sequence = 0;
  const phases = new SessionPhases({
    sourceFetcher: new FixtureSourceFetcher(scenario.sources, () => new Date(NOW)),
    inventory: new FixtureInventory(scenario.inventory),
    store: new ContentStore(path.join(clone, "content", "seo")),
    git: new GitState({ cwd: clone, now: () => new Date(NOW) }),
    gh: new GitHubClient(gh, clone),
    env: {},
    now: () => new Date(NOW),
    randomUUID: () => `guard-run-${++sequence}`,
    sessionDir: root,
    stateDir: path.join(clone, ".seo-engine-state"),
    loadBacklog: async () => scenario.gsc,
  });
  return { fixture, clone, phases, gh, paths: sessionPaths(root), scenario };
}

function scripted(value: unknown): string {
  if (typeof value === "string") return value;
  return (value as { text: string }).text;
}

async function toDraftReady(input: Input): Promise<void> {
  assert.equal((await input.phases.prepare({ date: DAY, gscSource: "backlog" })).status, "TASK_READY");
  await writeFile(input.paths.candidates, scripted(input.scenario.scripts.researcher?.[0]), "utf8");
  assert.equal((await input.phases.verifyClaims()).status, "CLAIMS_VERIFIED");
  await writeFile(input.paths.draftBody, scripted(input.scenario.scripts.writer?.[0]), "utf8");
  assert.equal((await input.phases.finalize()).status, "DRAFT_READY");
}

async function resultStatus(input: Input): Promise<string> {
  return (JSON.parse(await readFile(input.paths.result, "utf8")) as { status: string }).status;
}

function commit(cwd: string, message: string): Promise<string> {
  return git(cwd, ["-c", "user.name=Sesja", "-c", "user.email=sesja@example.com", "commit", "-m", message]);
}

test("plik chroniony zatwierdzony i cofnięty w kolejnym commicie i tak blokuje publikację (historia idzie na serwer)", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  await writeFile(path.join(input.clone, "package.json"), '{"scripts":{"x":"curl evil"}}\n', "utf8");
  await git(input.clone, ["add", "package.json"]);
  await commit(input.clone, "zmiana zależności");
  await git(input.clone, ["rm", "-q", "package.json"]);
  await commit(input.clone, "cofnięcie");
  const result = await input.phases.publish({ withCode: true });
  assert.equal(result.status, "FAILED");
  assert.match(result.errors?.join(" ") ?? "", /plików chronionych.*package\.json/);
  assert.equal(input.gh.prCalls(), 0);
  assert.equal(await resultStatus(input), "DRAFT_READY");
});

test("zaindeksowany plik z katalogu roboczego blokuje publikację, a niezaindeksowany zostaje poza commitem", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  await mkdir(path.join(input.clone, ".seo-daily"), { recursive: true });
  await writeFile(path.join(input.clone, ".seo-daily", "plan.md"), "| 1 | /porownanie/x | wyświetlenia 341 |\n", "utf8");
  await git(input.clone, ["add", ".seo-daily/plan.md"]);
  const blocked = await input.phases.publish();
  assert.equal(blocked.status, "FAILED");
  assert.match(blocked.errors?.join(" ") ?? "", /Katalogi robocze sesji nie mogą trafić do gita.*\.seo-daily\/plan\.md/);
  assert.equal(input.gh.prCalls(), 0);

  await git(input.clone, ["rm", "-q", "--cached", ".seo-daily/plan.md"]);
  const published = await input.phases.publish();
  assert.equal(published.status, "PR_CREATED");
  const files = await git(input.clone, ["show", "--name-only", "--format=", "HEAD"]);
  assert.doesNotMatch(files, /\.seo-daily/);
  assert.match(files, /content\/seo\//);
});

test("plik spoza sprawdzonej listy wstawiony do indeksu nie trafia do commitu", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  const state = new GitState({ cwd: input.clone, now: () => new Date(NOW) });
  await writeFile(path.join(input.clone, "notatka.txt"), "nie do publikacji\n", "utf8");
  await git(input.clone, ["add", "notatka.txt"]);
  await assert.rejects(state.createAndPushProposalBranch(SESSION_BRANCH, "test", ["content/seo/index.generated.ts"]), /W indeksie są pliki spoza sprawdzonej publikacji: .*notatka\.txt/);
  assert.equal((await git(input.clone, ["ls-remote", "--heads", "origin", SESSION_BRANCH])).trim(), "");
});

test("nowy plik większy niż limit skanu blokuje publikację zamiast przejść bez sprawdzenia", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  await mkdir(path.join(input.clone, "src", "app"), { recursive: true });
  await writeFile(path.join(input.clone, "src", "app", "wielki.tsx"), `${"// wypełnienie\n".repeat(160_000)}export const metadata = { robots: { index: false } };\n`, "utf8");
  const result = await input.phases.publish({ withCode: true });
  assert.equal(result.status, "FAILED");
  assert.match(result.errors?.join(" ") ?? "", /zbyt duże.*src\/app\/wielki\.tsx/);
  assert.equal(input.gh.prCalls(), 0);
});

test("opis PR z liczbami GSC jest odrzucany przed wysłaniem gałęzi, stan DRAFT_READY zostaje", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  const result = await input.phases.publish({ extraBody: "Dowody: pozycja 3.8, wyświetlenia 341, kliknięcia 10" });
  assert.equal(result.status, "FAILED");
  assert.match(result.errors?.join(" ") ?? "", /surowe dane GSC/);
  assert.equal(input.gh.prCalls(), 0);
  assert.equal((await git(input.clone, ["ls-remote", "--heads", "origin", SESSION_BRANCH])).trim(), "");
  assert.equal(await resultStatus(input), "DRAFT_READY");
});

test("prepare nie nadpisuje dokumentu, który czeka na publikację", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  const order = await readFile(input.paths.workOrder, "utf8");
  const again = await input.phases.prepare({ date: DAY, gscSource: "backlog", again: true });
  assert.equal(again.status, "FAILED");
  assert.match(again.reason ?? "", /czeka na publikację \(DRAFT_READY\)/);
  assert.equal(await resultStatus(input), "DRAFT_READY");
  assert.equal(await readFile(input.paths.workOrder, "utf8"), order);
});

test("publikacja nie nadpisuje kolejki zmienionej w międzyczasie przez inną sesję", async (t) => {
  const input = await setup(t);
  const other = await input.fixture.clone("other-session");
  const otherState = new GitState({ cwd: other, now: () => new Date(NOW) });
  const otherDir = path.join(other, ".seo-engine-state");
  await mkdir(path.join(otherDir, "daily"), { recursive: true });
  await writeFile(path.join(otherDir, "daily", "queue.json"), '{"version":1,"items":["Q0"]}\n', "utf8");
  await otherState.persistState(otherDir, "kolejka Q0", ["daily"]);

  await toDraftReady(input); // prepare odtwarza Q0 lokalnie

  await otherState.restoreState(otherDir, ["daily"]);
  await writeFile(path.join(otherDir, "daily", "queue.json"), '{"version":1,"items":["Q0","Q1"]}\n', "utf8");
  await otherState.persistState(otherDir, "kolejka Q1", ["daily"]);

  assert.equal((await input.phases.publish()).status, "PR_CREATED");
  await git(other, ["fetch", "-q", "origin", "claude/seo-engine-state"]);
  assert.match(await git(other, ["show", "FETCH_HEAD:daily/queue.json"]), /"Q1"/);
  assert.match(await git(other, ["ls-tree", "-r", "--name-only", "FETCH_HEAD"]), /pending\//);
});

test("odrzucony push (gałąź na serwerze poszła dalej) zachowuje DRAFT_READY do ponowienia", async (t) => {
  const input = await setup(t);
  const other = await input.fixture.clone("ahead");
  await git(other, ["checkout", "-b", SESSION_BRANCH]);
  await writeFile(path.join(other, "README.md"), "inna zmiana\n", "utf8");
  await git(other, ["add", "README.md"]);
  await commit(other, "inna sesja");
  await git(other, ["push", "-q", "origin", `HEAD:refs/heads/${SESSION_BRANCH}`]);

  await toDraftReady(input);
  const result = await input.phases.publish();
  assert.equal(result.status, "FAILED");
  assert.equal(input.gh.prCalls(), 0);
  assert.equal(await resultStatus(input), "DRAFT_READY");
});

test("polskie znaki i spacje w ścieżce nie psują publikacji kodu", async (t) => {
  const input = await setup(t);
  await toDraftReady(input);
  await mkdir(path.join(input.clone, "src", "lib"), { recursive: true });
  await writeFile(path.join(input.clone, "src", "lib", "Łódź linki.ts"), "export const LINKI: string[] = [];\n", "utf8");
  const published = await input.phases.publish({ withCode: true });
  assert.equal(published.status, "PR_CREATED");
  assert.match(await git(input.clone, ["-c", "core.quotePath=false", "show", "--name-only", "--format=", "HEAD"]), /src\/lib\/Łódź linki\.ts/);
});

test("parsePorcelainZ czyta zmiany nazw i ścieżki bez cytowania", () => {
  assert.deepEqual(parsePorcelainZ("?? src/Łódź.ts\0R  nowy plik.ts\0stary plik.ts\0 M content/seo/a.json\0"), [
    "src/Łódź.ts",
    "nowy plik.ts",
    "stary plik.ts",
    "content/seo/a.json",
  ]);
});

test("odtwarzanie bez gałęzi stanu nie kasuje lokalnej, nieutrwalonej kolejki", async (t) => {
  const fixture = await createGitFixture("seo-restore-");
  t.after(fixture.cleanup);
  const clone = await fixture.clone("restore");
  const stateDir = path.join(clone, ".seo-engine-state");
  await mkdir(path.join(stateDir, "daily"), { recursive: true });
  await writeFile(path.join(stateDir, "daily", "queue.json"), '{"version":1,"items":["lokalny"]}\n', "utf8");
  await new GitState({ cwd: clone }).restoreState(stateDir, ["daily"]);
  assert.match(await readFile(path.join(stateDir, "daily", "queue.json"), "utf8"), /lokalny/);
});
