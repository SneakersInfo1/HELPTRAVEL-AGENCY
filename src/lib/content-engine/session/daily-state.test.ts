import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  appendJournal,
  blockedTargets,
  dailyStatePaths,
  readJournal,
  readQueue,
  setQueueStatus,
  upsertQueueItem,
} from "./daily-state";

const root = mkdtempSync(path.join(os.tmpdir(), "seo-daily-state-"));
after(() => rmSync(root, { recursive: true, force: true }));
const now = new Date("2026-11-17T10:00:00Z");

describe("kolejka tematów i dziennik SEO daily", () => {
  it("dodaje temat, aktualizuje go po celu i rodzaju, a zamkniętego nie otwiera ponownie", async () => {
    const stateDir = path.join(root, "a");
    const first = await upsertQueueItem(
      stateDir,
      { id: "porownanie-a-vs-b", kind: "content_new", target: "/porownanie/a-vs-b", title: "Dokument dla A i B", why: "Popyt w GSC bez dokumentu ze źródłami.", source: "gsc", priority: 70 },
      now,
    );
    assert.equal(first.created, true);
    assert.equal(first.item.status, "todo");

    const again = await upsertQueueItem(
      stateDir,
      { id: "inny-id", kind: "content_new", target: "/porownanie/a-vs-b", title: "Dokument dla A i B", why: "Ponownie wskazany przez plan.", source: "gsc", priority: 75 },
      now,
    );
    assert.equal(again.created, false);
    assert.equal(again.item.id, "porownanie-a-vs-b");
    assert.equal(again.item.priority, 75);

    await setQueueStatus(stateDir, "porownanie-a-vs-b", "rejected", now, { note: "PR zamknięty bez scalenia." });
    const reopened = await upsertQueueItem(
      stateDir,
      { id: "porownanie-a-vs-b", kind: "content_new", target: "/porownanie/a-vs-b", title: "Dokument dla A i B", why: "Plan znów go wskazał.", source: "gsc", priority: 80 },
      now,
    );
    assert.equal(reopened.blockedByClosed, true);
    assert.equal((await readQueue(stateDir))[0].status, "rejected");
    assert.deepEqual([...blockedTargets(await readQueue(stateDir))], ["/porownanie/a-vs-b"]);
  });

  it("nie przyjmuje surowych liczb GSC w danych publicznych", async () => {
    await assert.rejects(
      upsertQueueItem(
        path.join(root, "b"),
        { id: "temat-z-liczbami", kind: "content_new", target: "/x", title: "Temat", why: "Ma 1060 wyświetleń i 13 kliknięć.", source: "gsc", priority: 50 },
        now,
      ),
    );
  });

  it("dziennik: wpis jest idempotentny po runId i trafia do JOURNAL.md", async () => {
    const stateDir = path.join(root, "c");
    const entry = {
      date: "2026-11-17",
      runId: "run-1",
      branch: "claude/seo-daily/2026-11-17",
      base: "main",
      gsc: { dataEnd: "2026-11-14", exact: true, freshness: "fresh" as const },
      tasks: [{ queueId: null, kind: "content_new" as const, target: "/porownanie/a-vs-b", outcome: "PR otwarty", prUrl: "https://github.com/o/r/pull/1" }],
      tests: ["pnpm test zielone"],
      summary: "Dokument ze źródłami dla porównania A i B.",
      nextSteps: ["Zatwierdzić dokument w PR."],
    };
    await appendJournal(stateDir, entry);
    await appendJournal(stateDir, { ...entry, summary: "Poprawione podsumowanie wpisu." });
    const entries = await readJournal(stateDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].summary, "Poprawione podsumowanie wpisu.");
    const markdown = readFileSync(dailyStatePaths(stateDir).journalMd, "utf8");
    assert.match(markdown, /## 2026-11-17 — run-1/);
    assert.match(markdown, /https:\/\/github.com\/o\/r\/pull\/1/);
  });
});
