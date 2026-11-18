import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { GitState } from "./git-state";
import { createGitFixture } from "./test-git-helper";

test("pierwszy claim dnia wygrywa, a kolejny jest duplikatem", async (t) => {
  const fixture = await createGitFixture();
  t.after(fixture.cleanup);
  const clone = await fixture.clone("claim-clone");
  const state = new GitState({ cwd: clone, now: () => new Date("2026-11-17T04:00:00Z") });
  const first = await state.claimDay("2026-11-17", "run-first");
  const second = await state.claimDay("2026-11-17", "run-second");
  assert.equal(first.status, "claimed");
  assert.equal(second.status, "duplicate");
  if (second.status === "duplicate") assert.equal(second.previous.runId, "run-first");
});

test("dwa klony ze wspólnego stanu mają dokładnie jednego zwycięzcę claim", async (t) => {
  const fixture = await createGitFixture();
  t.after(fixture.cleanup);
  const [cloneA, cloneB] = await Promise.all([fixture.clone("race-a"), fixture.clone("race-b")]);
  const a = new GitState({ cwd: cloneA });
  const b = new GitState({ cwd: cloneB });
  const results = await Promise.all([a.claimDay("2026-11-18", "run-a"), b.claimDay("2026-11-18", "run-b")]);
  assert.equal(results.filter((result) => result.status === "claimed").length, 1);
  assert.equal(results.filter((result) => result.status === "duplicate").length, 1);
});

test("persistState scala rozłączne pliki z dwóch przebiegów", async (t) => {
  const fixture = await createGitFixture();
  t.after(fixture.cleanup);
  const [cloneA, cloneB] = await Promise.all([fixture.clone("persist-a"), fixture.clone("persist-b")]);
  const a = new GitState({ cwd: cloneA });
  const b = new GitState({ cwd: cloneB });
  await a.claimDay("2026-11-19", "seed-claim");

  const stateA = path.join(cloneA, ".seo-engine-state");
  const stateB = path.join(cloneB, ".seo-engine-state");
  await Promise.all([a.restoreState(stateA), b.restoreState(stateB)]);
  await mkdir(path.join(stateA, "idempotency"), { recursive: true });
  await mkdir(path.join(stateB, "idempotency"), { recursive: true });
  await writeFile(path.join(stateA, "idempotency", "a.json"), '{"run":"a"}\n', "utf8");
  await writeFile(path.join(stateB, "idempotency", "b.json"), '{"run":"b"}\n', "utf8");
  await Promise.all([a.persistState(stateA, "persist a"), b.persistState(stateB, "persist b")]);

  const cloneC = await fixture.clone("persist-check");
  const c = new GitState({ cwd: cloneC });
  const restored = path.join(cloneC, ".seo-engine-state");
  await c.restoreState(restored);
  assert.match(await readFile(path.join(restored, "idempotency", "a.json"), "utf8"), /"a"/);
  assert.match(await readFile(path.join(restored, "idempotency", "b.json"), "utf8"), /"b"/);

  await rm(path.join(restored, "idempotency", "a.json"));
  await c.persistState(restored, "remove a");
  const cloneD = await fixture.clone("persist-delete-check");
  const d = new GitState({ cwd: cloneD });
  const finalState = path.join(cloneD, ".seo-engine-state");
  await d.restoreState(finalState);
  await assert.rejects(readFile(path.join(finalState, "idempotency", "a.json"), "utf8"), /ENOENT/);
  assert.match(await readFile(path.join(finalState, "idempotency", "b.json"), "utf8"), /"b"/);
});

test("gałąź stanu bez prefiksu claude/ jest odrzucana", async () => {
  assert.throws(() => new GitState({ stateBranch: "seo-engine-state" }), /claude\//);
});
