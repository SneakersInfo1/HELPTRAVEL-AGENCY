import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteRoutes } from "@/lib/content-engine/site-inventory";
import { comparisonPairs } from "@/lib/mvp/comparisons";

import { comparisonViewFor } from "./comparison-view-data";
import { defaultComparisonMeta } from "./comparison-view";

const views = comparisonPairs.map((pair) => {
  const found = comparisonViewFor(pair.slug);
  assert.ok(found, pair.slug);
  return found.view;
});
const routes = new Set(siteRoutes());

describe("model widoku porównania — wszystkie pary", () => {
  it("tytuł mieści się w 60 znakach i nie ma sufiksu marki, roku ani kwoty", () => {
    for (const view of views) {
      assert.ok(view.metaTitle.length <= 60, `${view.slug}: ${view.metaTitle.length} — ${view.metaTitle}`);
      assert.doesNotMatch(view.metaTitle, /HelpTravel|\b20\d\d\b|\d\s*zł/, view.slug);
      assert.ok(view.metaTitle.startsWith(`${view.nameA} czy ${view.nameB}?`), view.slug);
    }
  });

  it("opis ma 70–170 znaków i kończy się pełnym zdaniem", () => {
    for (const view of views) {
      assert.ok(
        view.metaDescription.length >= 70 && view.metaDescription.length <= 170,
        `${view.slug}: ${view.metaDescription.length} — ${view.metaDescription}`,
      );
      assert.match(view.metaDescription, /[.?!]$/, `${view.slug}: ${view.metaDescription}`);
    }
  });

  it("tytuły i opisy są unikalne w całym zestawie", () => {
    assert.equal(new Set(views.map((view) => view.metaTitle)).size, views.length);
    assert.equal(new Set(views.map((view) => view.metaDescription)).size, views.length);
  });

  it("H1 to dokładnie pytanie z nazwami kierunków; zdanie pod nim nie powtarza nagłówka", () => {
    for (const view of views) {
      assert.equal(view.h1, `${view.nameA} czy ${view.nameB}?`);
      if (view.standfirst) {
        assert.ok(!view.standfirst.toLowerCase().startsWith(`${view.nameA} czy ${view.nameB}`.toLowerCase()), `${view.slug}: ${view.standfirst}`);
        assert.match(view.standfirst, /^\p{Lu}/u, view.slug);
      }
    }
  });

  it("opisy par nie mają słów pozbawionych polskich znaków", () => {
    const stripped = /\b(Cieplo|Srodziemne|Srodkowej|wloskie|poludnie|rowne|wschodzaca|Krotki|porownanie)\b/;
    for (const pair of comparisonPairs) assert.doesNotMatch(pair.intent, stripped, pair.slug);
  });

  it("okruszki prowadzą przez hub porównań, także w JSON-LD", () => {
    for (const view of views) {
      assert.deepEqual(
        view.breadcrumbs.map((item) => item.href),
        ["/", "/porownanie", undefined],
      );
      const graph = view.structuredData["@graph"] as Array<Record<string, unknown>>;
      const crumbs = graph.find((node) => node["@type"] === "BreadcrumbList") as { itemListElement: Array<{ item: string }> };
      assert.ok(crumbs.itemListElement[1].item.endsWith("/porownanie"));
      assert.ok(crumbs.itemListElement[2].item.endsWith(`/porownanie/${view.slug}`));
    }
  });

  it("powiązane porównania: istniejące adresy, bez samej siebie, najpierw pary ze wspólnym kierunkiem", () => {
    for (const view of views) {
      assert.ok(view.relatedComparisons.length >= 4, view.slug);
      for (const link of view.relatedComparisons) {
        assert.ok(routes.has(link.href), `${view.slug} → ${link.href}`);
        assert.notEqual(link.href, `/porownanie/${view.slug}`);
      }
      const pair = comparisonPairs.find((item) => item.slug === view.slug)!;
      const sharing = comparisonPairs.filter(
        (item) => item.slug !== pair.slug && [item.a, item.b].some((slug) => slug === pair.a || slug === pair.b),
      );
      const leading = view.relatedComparisons.slice(0, Math.min(sharing.length, view.relatedComparisons.length));
      for (const link of leading) {
        assert.ok(
          sharing.some((item) => link.href === `/porownanie/${item.slug}`),
          `${view.slug}: ${link.href} stoi przed parami ze wspólnym kierunkiem`,
        );
      }
    }
  });

  it("strona z rozszerzeniem redakcyjnym: werdykt z podstawą, tabela faktów, źródła i data w JSON-LD", () => {
    const enriched = views.filter((view) => view.sources.length > 0);
    assert.ok(enriched.length >= 4);
    for (const view of enriched) {
      assert.ok(view.verdict && view.verdict.options.length === 2 && view.verdict.basis.length > 20, view.slug);
      assert.ok(view.editorial.some((section) => section.kind === "table"), view.slug);
      assert.ok(view.verifiedAt && view.modifiedAt && view.aiDisclosure, view.slug);
      assert.equal(view.standfirst, null, view.slug);
      const article = (view.structuredData["@graph"] as Array<Record<string, unknown>>).find((node) => node["@type"] === "Article")!;
      assert.equal(article.dateModified, view.modifiedAt);
      assert.deepEqual(
        article.citation,
        view.sources.map((source) => source.url),
      );
      assert.equal(article.datePublished, undefined);
    }
  });

  it("strona bez rozszerzenia nie ma źródeł, dat ani dateModified — brak pokrycia to brak twierdzenia", () => {
    const plain = views.filter((view) => view.sources.length === 0);
    assert.ok(plain.length > 40);
    for (const view of plain) {
      assert.equal(view.verifiedAt, null);
      const article = (view.structuredData["@graph"] as Array<Record<string, unknown>>).find((node) => node["@type"] === "Article")!;
      assert.equal(article.dateModified, undefined);
      assert.equal(article.citation, undefined);
    }
  });
});

describe("defaultComparisonMeta", () => {
  it("obiecuje pogodę i budżet tylko wtedy, gdy strona je pokaże", () => {
    const none = defaultComparisonMeta("Kreta", "Rodos", "Dwie greckie wyspy", { climate: false, budget: false });
    assert.doesNotMatch(`${none.title} ${none.description}`, /pogod|temperatur|budżet/i);
    const full = defaultComparisonMeta("Ateny", "Rzym", "Antyczne stolice", { climate: true, budget: true });
    assert.match(full.title, /pogoda, budżet/);
    assert.match(full.description, /temperatury/);
  });

  it("długie nazwy dostają krótszy wariant tytułu zamiast ucięcia", () => {
    const meta = defaultComparisonMeta("Gran Canaria", "Wyspy Zielonego Przylądka", "x", { climate: true, budget: true });
    assert.ok(meta.title.length <= 60, meta.title);
  });
});
