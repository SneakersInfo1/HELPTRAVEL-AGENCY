import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { Ledger } from "./ledger";
import type { ContentDocument } from "./schema";
import { makeDocument } from "./test-helpers";

const execFileAsync = promisify(execFile);
const VERIFY_SCRIPT = path.join(process.cwd(), "scripts", "content-engine", "verify-docs.ts");
const RUN_SCRIPT = path.join(process.cwd(), "scripts", "content-engine", "run.ts");

async function writeDocument(root: string, document: ContentDocument): Promise<string> {
  const directory = path.join(root, "articles");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${document.id}.json`);
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return file;
}

test("verify-docs bez --write odrzuca rozjazd contentHash z instrukcją naprawy", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seo-verify-hash-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const document = makeDocument();
  document.title = "Zmieniony tytuł bez przeliczonego hasha treści";
  await writeDocument(root, document);

  await assert.rejects(
    execFileAsync(process.execPath, ["--import", "tsx", VERIFY_SCRIPT, "--offline", "--store-dir", root], {
      cwd: process.cwd(),
      maxBuffer: 2_000_000,
    }),
    (error) => {
      const result = error as { code?: number; stdout?: string; stderr?: string };
      assert.equal(result.code, 1);
      assert.match(`${result.stdout ?? ""}\n${result.stderr ?? ""}`, /contentHash nie odpowiada treści[\s\S]*--offline --write/);
      return true;
    },
  );
});

test("zapis z migawki zachowuje daty, chyba że podano --verified-at", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "seo-verify-snapshot-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "store");
  const snapshots = path.join(parent, "snapshots");
  await mkdir(snapshots, { recursive: true });

  const document = makeDocument();
  const originalVerifiedAt = document.verifiedAt;
  const originalModifiedAt = document.materiallyModifiedAt;
  document.factClaims[0].observedEvidence = "The corrected source excerpt still supports the same visible claim.";
  const file = await writeDocument(root, document);
  const snapshot = path.join(snapshots, "visitvalencia.com_test.html");
  await writeFile(snapshot, "<p>The corrected source excerpt still supports the same visible claim.</p>", "utf8");
  const snapshotTime = new Date("2026-11-14T08:00:00Z");
  await utimes(snapshot, snapshotTime, snapshotTime);

  await execFileAsync(process.execPath, ["--import", "tsx", VERIFY_SCRIPT, "--snapshots", snapshots, "--write", "--store-dir", root], {
    cwd: process.cwd(),
    maxBuffer: 2_000_000,
  });
  const afterSnapshot = JSON.parse(await readFile(file, "utf8")) as ContentDocument;
  assert.equal(afterSnapshot.verifiedAt, originalVerifiedAt);
  assert.equal(afterSnapshot.materiallyModifiedAt, originalModifiedAt);
  assert.equal(afterSnapshot.contentHash, document.contentHash);

  const explicit = "2026-11-14T09:30:00Z";
  await execFileAsync(
    process.execPath,
    ["--import", "tsx", VERIFY_SCRIPT, "--snapshots", snapshots, "--verified-at", explicit, "--write", "--store-dir", root],
    { cwd: process.cwd(), maxBuffer: 2_000_000 },
  );
  const afterExplicit = JSON.parse(await readFile(file, "utf8")) as ContentDocument;
  assert.equal(afterExplicit.verifiedAt, explicit);
  assert.equal(afterExplicit.materiallyModifiedAt, originalModifiedAt);
});

test("CLI --release-pending sprząta wpisy przebiegu bez uruchamiania potoku", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "seo-release-pending-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const ledger = new Ledger({ stateDir, runId: "setup" });
  const now = new Date("2026-11-13T00:00:00Z");
  await ledger.markPending("/porownanie/a", "run-a", now);
  await ledger.markPending("/porownanie/b", "run-b", now);

  const result = await execFileAsync(process.execPath, ["--import", "tsx", RUN_SCRIPT, "--state-dir", stateDir, "--release-pending", "run-a"], {
    cwd: process.cwd(),
    maxBuffer: 2_000_000,
  });
  assert.match(result.stdout, /Zwolniono 1 wpisów pending/);
  assert.deepEqual(await ledger.pendingTargets(now, 14), new Set(["/porownanie/b"]));
});
