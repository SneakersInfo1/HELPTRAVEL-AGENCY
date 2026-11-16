import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getClimateNormal } from "@/lib/mvp/climate-normals";
import { comparisonPairs } from "@/lib/mvp/comparisons";
import { curatedDestinations, getDestinationProfileBySlug } from "@/lib/mvp/destinations";

import {
  buildComparisonModel,
  comparisonCoverage,
  PROFILE_SCORE_NOTE,
  PROFILE_SCORE_NOTE_WITH_ACCESS,
} from "./comparison-model";
import { collectJsonLdNodes, validateJsonLd } from "./jsonld-validate";

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

describe("model porównania kierunków", () => {
  it("54 porównania: bez kwot ze wzoru, Offer i błędów JSON-LD", () => {
    assert.equal(comparisonPairs.length, 54);
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      const serialized = JSON.stringify(model);
      const ld = JSON.stringify(model.structuredData);
      assert.equal(Object.hasOwn(model, "budget"), false, pair.slug);
      assert.doesNotMatch(serialized, /\d(?:[\d\s.,]*\d)?\s*(?:zł|PLN)/i, pair.slug);
      assert.doesNotMatch(ld, /"Offer"|"price"|datePublished|dateModified/, pair.slug);
      assert.deepEqual(validateJsonLd(model.structuredData, { todayIso: TODAY }), [], pair.slug);
      assert.ok(model.rows.length >= 3, `${pair.slug}: ${model.rows.length} wierszy`);
      assert.ok(!model.rows.some((row) => /budżet/i.test(row.label)), pair.slug);

      const faqPage = collectJsonLdNodes(model.structuredData).find((node) => node["@type"] === "FAQPage");
      if (model.faq.length > 0) {
        assert.ok(faqPage && Array.isArray(faqPage.mainEntity), pair.slug);
        assert.equal(faqPage.mainEntity.length, model.faq.length, pair.slug);
      } else {
        assert.equal(faqPage, undefined, pair.slug);
      }
      const hasAccessRow = model.rows.some((row) => row.label === "Dolot/dostępność");
      assert.equal(model.scoreNote, hasAccessRow ? PROFILE_SCORE_NOTE_WITH_ACCESS : PROFILE_SCORE_NOTE, pair.slug);
    }
  });

  it("temperatury i źródła pochodzą wyłącznie z norm WMO", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      const normalA = getClimateNormal(model.a.profile.slug);
      const normalB = getClimateNormal(model.b.profile.slug);
      const coverage = comparisonCoverage(model.a.profile, model.b.profile);
      assert.equal(coverage.climate, Boolean(normalA && normalB), pair.slug);
      assert.equal(model.rows.some((row) => row.label === "Średnia maks. w dzień — styczeń"), coverage.climate, pair.slug);
      assert.equal(model.rows.some((row) => row.label === "Okres normy WMO"), coverage.climate, pair.slug);
      assert.equal(model.climate.length, Number(Boolean(normalA)) + Number(Boolean(normalB)), pair.slug);

      for (const entry of model.climate) {
        const normal = getClimateNormal(entry.side.profile.slug);
        assert.ok(normal, entry.side.profile.slug);
        assert.equal(entry.lowestDaytimeMaxC, Math.min(...normal.maxTempC), entry.side.profile.slug);
        assert.equal(entry.highestDaytimeMaxC, Math.max(...normal.maxTempC), entry.side.profile.slug);
        assert.equal(entry.source.url, normal.sourceUrl, entry.side.profile.slug);
        assert.equal(entry.source.name, "WMO World Weather Information Service", entry.side.profile.slug);
      }

      if (coverage.climate) {
        const climateCells = model.rows
          .filter((row) => /Średnia (?:maks|max|min)/.test(row.label))
          .flatMap((row) => [row.av, row.bv]);
        assert.ok(climateCells.length > 0, pair.slug);
        for (const cell of climateCells) assert.match(cell, /^-?\d+,\d°C$/, `${pair.slug}: ${cell}`);
        assert.match(JSON.stringify(model.structuredData), /worldweather\.wmo\.int/, pair.slug);
      }
    }
  });

  it("Malaga–Walencja odtwarza styczniowe i lipcowe wartości z pliku norm", () => {
    const model = modelFor("malaga-spain-vs-valencia-spain");
    const malaga = getClimateNormal("malaga-spain");
    const valencia = getClimateNormal("valencia-spain");
    assert.ok(malaga && valencia);
    assert.deepEqual(
      model.rows.filter((row) => row.label.includes("maks. w dzień")),
      [
        { label: "Średnia maks. w dzień — styczeń", av: "16,8°C", bv: "16,4°C" },
        { label: "Średnia maks. w dzień — lipiec", av: "30,5°C", bv: "29,7°C" },
      ],
    );
    assert.equal(model.a.facts.temperature?.byMonth[0], malaga.maxTempC[0]);
    assert.equal(model.b.facts.temperature?.byMonth[6], valencia.maxTempC[6]);
  });

  it("identyczny okres daje dokładne porównanie lipca bez noty o nieporównywalności", () => {
    const model = modelFor("barcelona-spain-vs-valencia-spain");
    assert.equal(model.climatePeriodNote, null);
    assert.deepEqual(model.rows.find((row) => row.label === "Okres normy WMO"), {
      label: "Okres normy WMO",
      av: "norma 1981–2010",
      bv: "norma 1981–2010",
    });
    const julyFaq = model.faq.find((item) => /lipcu/.test(item.question));
    assert.ok(julyFaq);
    assert.doesNotMatch(julyFaq.answer, /orientacyjne|ok\. \d+°C/);
    assert.match(model.quickAnswer, /W lipcu wyższa średnia maksymalna/);
  });

  it("sąsiednie okresy opisują lipiec orientacyjnie z obiema normami", () => {
    const model = modelFor("barcelona-spain-vs-rome-italy");
    assert.match(model.climatePeriodNote ?? "", /1981–2010 i 1971–2000/);
    const julyFaq = model.faq.find((item) => /lipcu/.test(item.question));
    assert.ok(julyFaq);
    assert.match(julyFaq.answer, /Barcelona: \d+,\d°C, Rzym: \d+,\d°C/);
    assert.match(julyFaq.answer, /różnica ok\. \d+°C/);
    assert.match(julyFaq.answer, /normy z lat 1981–2010 i 1971–2000, porównanie orientacyjne/);
    assert.match(model.quickAnswer, /porównanie orientacyjne/);
  });

  it("różne okresy usuwają pytanie i zdanie o lipcu, ale zostawiają notę", () => {
    const model = modelFor("barcelona-spain-vs-lisbon-portugal");
    assert.match(model.climatePeriodNote ?? "", /Normy pochodzą z różnych okresów \(1981–2010 i 1961–1990\)/);
    assert.ok(!model.faq.some((item) => /lipcu/.test(item.question)));
    assert.doesNotMatch(model.quickAnswer, /[Ww] lipcu/);
  });

  it("kierunek bez normy nie dostaje liczb pogodowych ani źródła", () => {
    const model = modelFor("athens-greece-vs-tirana-albania");
    assert.equal(getClimateNormal("tirana-albania"), null);
    assert.ok(model.missingClimate.some((side) => side.profile.slug === "tirana-albania"));
    assert.ok(!model.climate.some((entry) => entry.side.profile.slug === "tirana-albania"));
    assert.ok(!model.rows.some((row) => /temperatur|maks\. w dzień|min\. w nocy/i.test(row.label)));
  });

  it("czas lotu: szacunek jest oznaczony, a wewnętrzna ocena dolotu wymaga dokładnych danych", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      assert.doesNotMatch(JSON.stringify({ faq: model.faq, ld: model.structuredData }), /\d[.,]\d\s?h\b/, pair.slug);
      const flightRow = model.rows.find((row) => row.label === "Lot z Polski (h)");
      if (flightRow) {
        for (const [side, cell] of [
          [model.a, flightRow.av],
          [model.b, flightRow.bv],
        ] as const) {
          if (side.facts.flight?.kind === "estimate") assert.match(cell, /\(szacunek\)$/, `${pair.slug} ${cell}`);
          else assert.equal(side.facts.flight?.kind, "exact", pair.slug);
        }
      }
      const bothExact = model.a.facts.flight?.kind === "exact" && model.b.facts.flight?.kind === "exact";
      assert.equal(model.rows.some((row) => row.label === "Dolot/dostępność"), bothExact, pair.slug);
    }
  });

  it("nie zawiera twierdzeń o relatywnych kosztach", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      assert.doesNotMatch(
        JSON.stringify({ verdicts: model.verdicts, faq: model.faq, quick: model.quickAnswer, audience: model.audience }),
        /taniej|drożej|tanio|budżet|opłacaln|cheaper|pricier/i,
        pair.slug,
      );
    }
  });

  it("oceny profilu z szablonu nie tworzą werdyktu ani odbiorców", () => {
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      const bothCurated = curated.has(model.a.profile.slug) && curated.has(model.b.profile.slug);
      model.audience.forEach((tags, index) => {
        const side = index === 0 ? model.a : model.b;
        if (!curated.has(side.profile.slug)) assert.deepEqual(tags, [], `${pair.slug}: ${side.profile.slug}`);
      });
      if (!bothCurated) {
        assert.ok(!model.verdicts.some((verdict) => verdict.title === "Plaża i klimat morski" || verdict.title === "City break i tło miejskie"), pair.slug);
      }
    }
  });
});

describe("język generatora porównań", () => {
  it("nazwa kierunku nie stoi w konstrukcji wymagającej odmiany rodzaju", () => {
    const agreement = /(lepszy jest|lepszy będzie|wypada zwykle taniej|ma mocniejszy|jest mocniejszy|mocniej wypada|dolot z Polski ma) /i;
    for (const pair of comparisonPairs) {
      const model = modelFor(pair.slug);
      assert.doesNotMatch(JSON.stringify({ quick: model.quickAnswer, faq: model.faq, verdicts: model.verdicts }), agreement, pair.slug);
    }
  });
});
