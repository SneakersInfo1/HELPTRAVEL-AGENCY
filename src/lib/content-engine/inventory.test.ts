import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FixtureInventory, StoreBackedInventory } from "./inventory";
import { ContentStore } from "./store";
import { makeDocument } from "./test-helpers";

test("zapisany dokument nierenderowanego typu nie staje się trasą inwentarza", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seo-inventory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ContentStore(root);
  const article = makeDocument();
  await store.writeDocumentsAtomically([article]);

  const inventory = await StoreBackedInventory.create(new FixtureInventory(), store);
  assert.equal(inventory.isKnownRoute(article.canonicalUrl), false);
  assert.equal(inventory.hasEnrichment(article.canonicalUrl), false);
  assert.deepEqual(inventory.existing(), []);
});
