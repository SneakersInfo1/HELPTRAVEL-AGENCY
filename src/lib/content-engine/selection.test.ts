import assert from "node:assert/strict";
import test from "node:test";

import { fixtureScenario } from "./fixtures/scenarios";
import { FixtureInventory } from "./inventory";
import { collect, select } from "./pipeline";
import type { ContentType } from "./schema";
import { makeClaim } from "./test-helpers";

const NOW = new Date("2026-11-13T04:17:00.000Z");
const ALL_RENDERABLE: ReadonlySet<ContentType> = new Set(["comparison_enrichment", "month_enrichment", "hub_enrichment", "article"]);

test("selektor wybiera najpierw odświeżenie adresu z potencjałem", () => {
  const fixture = fixtureScenario("refresh");
  const inventory = new FixtureInventory(fixture.inventory);
  const result = select(collect(fixture.gsc, inventory), inventory, NOW, new Set(), ALL_RENDERABLE);
  assert.equal(result.tasks[0]?.operation, "refresh");
  assert.equal(result.tasks[0]?.target, "/porownanie/madeira-czy-teneryfa");
});

test("selektor tworzy najwyżej jeden nowy artykuł z trzema linkami", () => {
  const fixture = fixtureScenario("new-evergreen");
  const inventory = new FixtureInventory(fixture.inventory);
  const result = select(collect(fixture.gsc, inventory), inventory, NOW, new Set(), ALL_RENDERABLE);
  const articles = result.tasks.filter((task) => task.operation === "new_article" && !task.decision);
  assert.equal(articles.length, 1);
  assert.ok((articles[0].evidence.internalLinkTargets?.length ?? 0) >= 3);
});

test("zapytanie wysokiego ryzyka trafia tylko do ręcznego przeglądu, a marka jest ignorowana", () => {
  const fixture = fixtureScenario("new-evergreen");
  const inventory = new FixtureInventory(fixture.inventory);
  const gsc = {
    ...fixture.gsc,
    queries: `Najpopularniejsze zapytania,Clicks,Impressions,CTR,Position
wiza do grecji,4,800,0.005,12
helptravel wiza,20,900,0.022,2
`,
  };
  const result = select(collect(gsc, inventory), inventory, NOW, new Set(), ALL_RENDERABLE);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].decision, "REVIEW_REQUIRED");
  assert.equal(result.tasks[0].primaryQuery, "wiza do grecji");
});

test("domyślnie selektor pomija zadanie typu, którego żadna strona nie renderuje", () => {
  const fixture = fixtureScenario("new-evergreen");
  const inventory = new FixtureInventory(fixture.inventory);
  const result = select(collect(fixture.gsc, inventory), inventory, NOW);
  assert.deepEqual(result.tasks, []);
  assert.ok(result.skipped.some((item) => item.contentType === "article" && item.reason === "content_type_not_rendered"));
  assert.match(result.reason, /nie mają renderera/);
});

test("brak kwalifikującego zadania daje jawny skip", () => {
  const inventory = new FixtureInventory();
  const input = collect(
    {
      pages: "Najpopularniejsze strony,Clicks,Impressions,CTR,Position\n",
      queries: "Najpopularniejsze zapytania,Clicks,Impressions,CTR,Position\nhelptravel,4,100,0.04,1\n",
      daily: "Data,Clicks,Impressions,CTR,Position\n2026-11-13,4,100,0.04,1\n",
    },
    inventory,
  );
  const result = select(input, inventory, NOW);
  assert.deepEqual(result.tasks, []);
  assert.match(result.reason, /Brak kwalifikującego/);
});

test("wygaśnięcie TTL twierdzenia ponownie uruchamia odświeżenie", () => {
  const fixture = fixtureScenario("refresh");
  const target = "/porownanie/madeira-czy-teneryfa";
  const inventory = new FixtureInventory({
    ...fixture.inventory,
    enrichments: [
      {
        canonicalUrl: target,
        verifiedAt: "2026-11-10T00:00:00.000Z",
        claims: [
          makeClaim({
            dataClass: "price",
            riskClass: "DYNAMIC",
            retrievedAt: "2026-11-10T00:00:00.000Z",
          }),
        ],
      },
    ],
  });
  const result = select(collect(fixture.gsc, inventory), inventory, NOW);
  assert.equal(result.tasks[0]?.operation, "refresh");
  assert.match(result.tasks[0]?.rationale ?? "", /utraciły świeżość/);
});

