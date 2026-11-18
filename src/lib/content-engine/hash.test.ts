import assert from "node:assert/strict";
import test from "node:test";

import { computeContentHash } from "./hash";
import { makeDocument } from "./test-helpers";

test("hash nie zmienia się po zmianie pól stanu", () => {
  const document = makeDocument();
  const changed = {
    ...document,
    reviewStatus: "in_review" as const,
    createdAt: "2026-11-10T00:00:00.000Z",
    materiallyModifiedAt: "2026-11-14T00:00:00.000Z",
    verifiedAt: "2026-11-14T00:00:00.000Z",
    generationRunId: "inny-przebieg",
  };
  assert.equal(computeContentHash(changed), computeContentHash(document));
});

test("hash zmienia się po zmianie redakcyjnej", () => {
  const document = makeDocument();
  assert.notEqual(computeContentHash({ ...document, title: `${document.title} dziś` }), computeContentHash(document));
});

test("hash widocznej treści nie zmienia się po korekcie samego cytatu dowodu", () => {
  const document = makeDocument();
  const changed = structuredClone(document);
  changed.factClaims[0].observedEvidence = "The corrected source excerpt still supports the same visible claim.";
  assert.equal(computeContentHash(changed), computeContentHash(document));
});

