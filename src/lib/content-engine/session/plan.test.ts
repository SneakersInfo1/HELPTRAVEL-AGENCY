import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FixtureInventory } from "../inventory";
import type { ContentDocument } from "../schema";
import type { QueueItem } from "./daily-state";
import { buildPlan } from "./plan";

const today = new Date("2026-11-17T08:00:00Z");
const pages = [
  "Najpopularniejsze strony,Kliknięcia,Wyświetlenia,CTR,Pozycja",
  "https://helptravel.pl/porownanie/a-vs-b,10,2000,0.5%,5.2",
  "https://helptravel.pl/porownanie/c-vs-d,8,1500,0.53%,6.1",
  "https://helptravel.pl/porownanie/g-vs-h,9,1800,0.5%,5.5",
  "https://helptravel.pl/kierunki/x/styczen,4,900,0.44%,7.0",
].join("\n");
const empty = "Najpopularniejsze zapytania,Kliknięcia,Wyświetlenia,CTR,Pozycja";

const inventory = new FixtureInventory({
  existing: [
    { canonicalUrl: "/porownanie/a-vs-b", title: "A czy B" },
    { canonicalUrl: "/porownanie/c-vs-d", title: "C czy D" },
    { canonicalUrl: "/porownanie/g-vs-h", title: "G czy H" },
    { canonicalUrl: "/kierunki/x/styczen", title: "X w styczniu" },
  ],
  enrichments: [{ canonicalUrl: "/porownanie/c-vs-d", verifiedAt: "2026-11-01T00:00:00Z" }],
});

function queueItem(overrides: Partial<QueueItem>): QueueItem {
  return {
    id: "temat-z-kolejki",
    kind: "internal_links",
    target: "/porownanie",
    title: "Linki z hubu porównań",
    why: "Hub nie linkuje do nowych porównań.",
    source: "session",
    priority: 40,
    status: "todo",
    createdAt: "2026-11-16T10:00:00.000Z",
    updatedAt: "2026-11-16T10:00:00.000Z",
    notes: [],
    ...overrides,
  };
}

const expiringDoc = {
  canonicalUrl: "/porownanie/c-vs-d",
  title: "C czy D: porównanie",
  reviewStatus: "approved",
  factClaims: [
    { id: "claim-1", dataClass: "transport", retrievedAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-11-25T00:00:00.000Z" },
    { id: "claim-2", dataClass: "geography", retrievedAt: "2026-11-01T00:00:00.000Z" },
  ],
} as unknown as ContentDocument;

describe("plan sesji SEO daily", () => {
  it("szereguje według dowodów: najpierw wygasające fakty, potem popyt GSC, potem kolejka", () => {
    const result = buildPlan({
      today,
      inventory,
      documents: [expiringDoc],
      gsc: { inputs: { pages, queries: empty, daily: "Data,Kliknięcia,Wyświetlenia,CTR,Pozycja" }, freshness: "fresh" },
      queue: [queueItem({})],
      pending: new Set(),
    });
    const targets = result.candidates.map((candidate) => `${candidate.kind}:${candidate.target}`);
    assert.equal(targets[0], "content_refresh:/porownanie/c-vs-d");
    assert.ok(targets.includes("content_new:/porownanie/a-vs-b"));
    assert.ok(targets.includes("content_new:/porownanie/g-vs-h"));
    assert.ok(targets.includes("internal_links:/porownanie"));
    // Strony miesięcy nie mają dziś szablonu dla dokumentów ze źródłami.
    assert.ok(!targets.some((target) => target.includes("/kierunki/x/styczen")));
    // Publiczny opis nie zawiera liczb GSC; liczby są tylko w lokalnych dowodach.
    for (const candidate of result.candidates) assert.doesNotMatch(candidate.why, /\d{3,}/);
    assert.match(result.candidates.find((candidate) => candidate.target === "/porownanie/a-vs-b")!.evidence, /wyświetlenia 2000/);
    // Kolejność wśród adresów z GSC wynika z wyniku możliwości, a nie z nazwy adresu.
    const gscPriorities = result.candidates.filter((candidate) => candidate.source === "gsc").map((candidate) => candidate.priority);
    assert.equal(new Set(gscPriorities).size, gscPriorities.length, `priorytety: ${gscPriorities.join(", ")}`);
  });

  it("wyklucza tematy w przeglądzie i zamknięte, a stare dane GSC obniżają priorytet", () => {
    const fresh = buildPlan({
      today,
      inventory,
      documents: [],
      gsc: { inputs: { pages, queries: empty, daily: "Data" }, freshness: "fresh" },
      queue: [queueItem({ id: "odrzucony", kind: "content_new", target: "/porownanie/g-vs-h", status: "rejected" })],
      pending: new Set(["/porownanie/a-vs-b"]),
    });
    assert.deepEqual(fresh.candidates.map((candidate) => candidate.target), []);
    assert.deepEqual(
      fresh.excluded.map((item) => item.target).sort(),
      ["/porownanie/a-vs-b", "/porownanie/g-vs-h"],
    );

    const freshPriority = buildPlan({ today, inventory, documents: [], gsc: { inputs: { pages, queries: empty, daily: "Data" }, freshness: "fresh" }, queue: [], pending: new Set() })
      .candidates.find((candidate) => candidate.target === "/porownanie/a-vs-b")!.priority;
    const stalePriority = buildPlan({ today, inventory, documents: [], gsc: { inputs: { pages, queries: empty, daily: "Data" }, freshness: "stale" }, queue: [], pending: new Set() })
      .candidates.find((candidate) => candidate.target === "/porownanie/a-vs-b")!.priority;
    assert.ok(stalePriority < freshPriority, `${stalePriority} < ${freshPriority}`);
  });

  it("bez danych GSC plan nadal działa na świeżości faktów i kolejce", () => {
    const result = buildPlan({ today, inventory, documents: [expiringDoc], gsc: null, queue: [queueItem({})], pending: new Set() });
    assert.deepEqual(result.candidates.map((candidate) => candidate.kind), ["content_refresh", "internal_links"]);
  });
});
