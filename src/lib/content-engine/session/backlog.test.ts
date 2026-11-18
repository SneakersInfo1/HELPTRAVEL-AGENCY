import assert from "node:assert/strict";
import test from "node:test";

import { FixtureInventory } from "../inventory";
import { collect, select } from "../pipeline";
import { RENDERED_CONTENT_TYPES } from "../site-content";
import { backlogCsvToGscInputs } from "./backlog";

const BACKLOG = `priority,url,note,gsc_clicks_92d,gsc_impressions_92d,gsc_ctr_92d,gsc_position_92d
1,/porownanie/malaga-spain-vs-valencia-spain,"pole, z przecinkiem",0,1000,0.00,5.2
2,,brak adresu,0,400,0.00,8
3,/porownanie/brak-metryk,brak,,400,0.00,8
`;

test("backlog wybiera odświeżenie porównania bez rozszerzenia", () => {
  const inventory = new FixtureInventory({
    existing: [{ canonicalUrl: "/porownanie/malaga-spain-vs-valencia-spain", title: "Malaga czy Walencja" }],
    knownRoutes: ["/porownanie"],
  });
  const result = select(collect(backlogCsvToGscInputs(BACKLOG), inventory), inventory, new Date("2026-11-17T00:00:00Z"), new Set(), RENDERED_CONTENT_TYPES);
  assert.equal(result.tasks[0]?.target, "/porownanie/malaga-spain-vs-valencia-spain");
  assert.equal(result.tasks[0]?.operation, "refresh");
});

test("backlog nie wybiera porównania z aktualnym rozszerzeniem", () => {
  const target = "/porownanie/malaga-spain-vs-valencia-spain";
  const inventory = new FixtureInventory({
    existing: [{ canonicalUrl: target, title: "Malaga czy Walencja" }],
    knownRoutes: ["/porownanie"],
    enrichments: [{ canonicalUrl: target, verifiedAt: "2026-11-16T00:00:00.000Z" }],
  });
  const result = select(collect(backlogCsvToGscInputs(BACKLOG), inventory), inventory, new Date("2026-11-17T00:00:00Z"), new Set(), RENDERED_CONTENT_TYPES);
  assert.deepEqual(result.tasks, []);
});
