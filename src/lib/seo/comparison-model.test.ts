import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { comparisonPairs } from "@/lib/mvp/comparisons";
import { curatedDestinations, getDestinationProfileBySlug } from "@/lib/mvp/destinations";

import { buildComparisonModel, PROFILE_SCORE_NOTE } from "./comparison-model";
import { collectJsonLdNodes, validateJsonLd } from "./jsonld-validate";

// Porównania kierunków bez faktów z fallbacku (PR #1.5, brief §17).
//
// Kreta–Rodos i Kreta–Majorka pokazywały po obu stronach te same liczby
// z szablonu regionu (3.1 h, 20/29/12°C, ~2895 PLN). Po usunięciu fallbacku
// strona nie może mieć pustej tabeli ani udawać zwycięzcy przy remisie.

const SITE = "https://helptravel.pl";
const TODAY = "2026-09-15";
const AUTHOR = { "@type": "Person", name: "Jakub Ogrodniczuk", url: `${SITE}/redakcja` };
const curated = new Set(curatedDestinations.map((destination) => destination.slug));

function modelFor(slug: string) {
  const pair = comparisonPairs.find((item) => item.slug === slug);
  assert.ok(pair, slug);
  const a = getDestinationProfileBySlug(pair.a);
  const b = getDestinationProfileBySlug(pair.b);
  assert.ok(a && b, slug);
  return buildComparisonModel({
    pair,
    a,
    b,
    baseUrl: SITE,
    images: ["https://images.pexels.com/photos/1/pexels-photo-1.jpeg"],
    author: AUTHOR,
  });
}

describe("porównania kierunków bez faktów z fallbacku", () => {
  it("54 porównania: JSON-LD bez kwot, Offer i uwag walidatora; tabela i FAQ niepuste", () => {
    assert.equal(comparisonPairs.length, 54);
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      const ld = JSON.stringify(model.structuredData);
      assert.deepEqual(validateJsonLd(model.structuredData, { todayIso: TODAY }), [], pair.slug);
      assert.doesNotMatch(ld, /zł|PLN|"Offer"|"price"|datePublished|dateModified/, pair.slug);
      assert.ok(model.rows.length >= 4, `${pair.slug}: ${model.rows.length} wierszy`);
      const faqPage = collectJsonLdNodes(model.structuredData).find((node) => node["@type"] === "FAQPage");
      assert.ok(faqPage && Array.isArray(faqPage.mainEntity) && faqPage.mainEntity.length >= 3, pair.slug);
      assert.equal(model.scoreNote, PROFILE_SCORE_NOTE);
    }
  });

  it("temperatura w tabeli, FAQ i szybkiej odpowiedzi tylko przy danych kuratorowanych po obu stronach", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      const bothCurated = curated.has(model.a.profile.slug) && curated.has(model.b.profile.slug);
      const text = JSON.stringify({ rows: model.rows, faq: model.faq, quick: model.quickAnswer, ld: model.structuredData });
      if (bothCurated) {
        assert.ok(model.rows.some((row) => row.label === "Średnia roczna temperatura"), pair.slug);
      } else {
        assert.doesNotMatch(text, /°C/, pair.slug);
        assert.ok(!model.faq.some((item) => item.question === "Kiedy najlepiej jechać?"), pair.slug);
      }
      for (const entry of model.whenToGo) {
        assert.ok(curated.has(entry.side.profile.slug), `${pair.slug}: ${entry.side.profile.slug}`);
      }
    }
  });

  it("czas lotu: fakt tylko z danych kuratorowanych, szacunek zawsze oznaczony, nigdy w FAQ i JSON-LD", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      assert.doesNotMatch(JSON.stringify({ faq: model.faq, ld: model.structuredData }), /\d[.,]\d\s?h\b/, pair.slug);
      const flightRow = model.rows.find((row) => row.label === "Lot z Polski (h)");
      if (!flightRow) continue;
      for (const [side, cell] of [
        [model.a, flightRow.av],
        [model.b, flightRow.bv],
      ] as const) {
        if (side.facts.flight?.kind === "estimate") assert.match(cell, /\(szacunek\)$/, `${pair.slug} ${cell}`);
        else assert.equal(side.facts.flight?.kind, "exact", pair.slug);
      }
      for (const sentence of model.flightSentences) {
        if (sentence && !/szacunkowo/.test(sentence)) assert.match(sentence, /^Lot ok\. \d+\.\d h\.$/, pair.slug);
      }
    }
  });

  it("budżet ze wzoru tylko przy obu stronach kuratorowanych i nigdy jako kwota w FAQ", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      const bothCurated = curated.has(model.a.profile.slug) && curated.has(model.b.profile.slug);
      assert.equal(model.budget !== null, bothCurated, pair.slug);
      assert.equal(model.rows.some((row) => row.label.startsWith("Budżet")), bothCurated, pair.slug);
      assert.doesNotMatch(JSON.stringify(model.faq), /\d\s?(zł|PLN)/, pair.slug);
    }
  });

  it("Kreta–Rodos i Kreta–Majorka: niepusta tabela bez liczb z szablonu i bez zwycięzcy wybranego przy remisie", () => {
    for (const slug of ["heraklion-greece-vs-rhodes-greece", "heraklion-greece-vs-palma-spain"]) {
      const model = modelFor(slug);
      const text = JSON.stringify(model);
      assert.doesNotMatch(text, /°C/, slug);
      assert.doesNotMatch(text, /\d\s?(zł|PLN)/, slug);
      assert.equal(model.budget, null, slug);
      assert.equal(model.whenToGo.length, 0, slug);
      assert.ok(model.rows.length >= 4, slug);
      assert.doesNotMatch(model.quickAnswer, /lepszy jest|najprostszy dolot z Polski ma/, slug);
    }
  });

  it("Malaga–Walencja: dane kuratorowane nadal w tabeli, FAQ i sekcji terminów (test D)", () => {
    const model = modelFor("malaga-spain-vs-valencia-spain");
    const labels = model.rows.map((row) => row.label);
    for (const label of ["Lot z Polski (h)", "Średnia roczna temperatura", "Lato (cze-sie)", "Zima (gru-lut)", "Budżet 2 os. / 4 dni"]) {
      assert.ok(labels.includes(label), label);
    }
    assert.ok(model.budget);
    assert.equal(model.whenToGo.length, 2);
    assert.ok(model.faq.some((item) => item.question === "Kiedy najlepiej jechać?"));
    assert.match(model.rows.find((row) => row.label === "Lot z Polski (h)")?.av ?? "", /^~\d\.\d h$/);
  });
});
