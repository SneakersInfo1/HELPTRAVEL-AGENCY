import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isFactGrade, provenanceOf } from "@/lib/mvp/data-provenance";
import { curatedDestinations, getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import { collectJsonLdNodes, validateJsonLd } from "./jsonld-validate";
import { buildMonthPageModel } from "./month-page-model";

const SITE = "https://helptravel.pl";
const TODAY = "2026-09-15";
const AUTHOR = { "@type": "Person", name: "Autor testowy", url: `${SITE}/redakcja` };
const OVERVIEW = "Przegląd testowy kierunku.";
const profiles = getAllDestinationProfiles();
const bySlug = new Map(profiles.map((profile) => [profile.slug, profile]));
const curatedSlugs = new Set(curatedDestinations.map((profile) => profile.slug));

function modelFor(profile: DestinationProfile, month: PolishMonthSlug) {
  return buildMonthPageModel({ profile, overview: OVERVIEW, month, baseUrl: SITE, author: AUTHOR });
}

function modelForSlug(slug: string, month: PolishMonthSlug) {
  const profile = bySlug.get(slug);
  assert.ok(profile, slug);
  return modelFor(profile, month);
}

describe("model strony kierunku w miesiącu", () => {
  it("dla wszystkich 2820 stron przepuszcza wyłącznie fakty o właściwej proweniencji", () => {
    let count = 0;

    for (const profile of profiles) {
      for (const month of polishMonthSlugs) {
        count += 1;
        const model = modelFor(profile, month);
        const jsonLd = JSON.stringify(model.structuredData);
        const claimTexts = [
          model.text.title,
          model.text.description,
          model.text.ogTitle,
          model.text.h1,
          model.text.lead,
        ];

        if (!isFactGrade(provenanceOf(profile, "temperature"))) {
          assert.equal(model.weather, null, `${profile.slug}/${month}`);
          for (const text of claimTexts) assert.doesNotMatch(text, /°C/, `${profile.slug}/${month}: ${text}`);
          assert.doesNotMatch(jsonLd, /°C/, `${profile.slug}/${month}`);
        }

        if (model.facts.flight?.kind !== "exact") {
          for (const text of claimTexts.slice(0, 4)) {
            assert.doesNotMatch(text, /\d[.,]\d\s?h\b/, `${profile.slug}/${month}: ${text}`);
          }
          assert.doesNotMatch(jsonLd, /\d[.,]\d\s?h\b/, `${profile.slug}/${month}`);
        }

        if (model.facts.flight?.kind === "estimate") {
          assert.match(model.flightText ?? "", /szacunkowo/, `${profile.slug}/${month}`);
          assert.match(model.flightText ?? "", /liczone z odległości/, `${profile.slug}/${month}`);
        }
        if (model.facts.isDomestic) assert.equal(model.flightText, null, `${profile.slug}/${month}`);

        assert.doesNotMatch(jsonLd, /datePublished|dateModified/, `${profile.slug}/${month}`);
        assert.doesNotMatch(jsonLd, /"Offer"|"price"|zł/i, `${profile.slug}/${month}`);
        assert.doesNotMatch(jsonLd, /\d(?:[\d\s.,]*\d)?\s*PLN/i, `${profile.slug}/${month}`);
        assert.doesNotMatch(jsonLd, /morza/i, `${profile.slug}/${month}`);
        // Sezon, tłumy i ceny z heurystyki temperatury nie mają źródła (Teneryfa: styczeń to szczyt sezonu).
        assert.doesNotMatch(
          `${jsonLd} ${model.text.lead}`,
          /najtaniej|najdrożej|ceny najniższe|najwyższe ceny|ceny w szczycie|ceny umiarkowane|turystów|najspokojniej|wysoki sezon|sezon przejściowy|poza sezonem|szczyt sezonu/i,
          `${profile.slug}/${month}`,
        );

        const faq = collectJsonLdNodes(model.structuredData).find((node) => node["@type"] === "FAQPage");
        if (faq) {
          assert.ok(Array.isArray(faq.mainEntity), `${profile.slug}/${month}`);
          assert.ok(faq.mainEntity.length >= 1, `${profile.slug}/${month}`);
        }

        assert.deepEqual(validateJsonLd(model.structuredData, { todayIso: TODAY }), [], `${profile.slug}/${month}`);
        assert.equal(model.budgetEstimate !== null, curatedSlugs.has(profile.slug), `${profile.slug}/${month}`);
        assert.equal(model.indexable, isMonthIndexable(profile, getMonthIndex(month)), `${profile.slug}/${month}`);
      }
    }

    assert.equal(profiles.length, 235);
    assert.equal(count, 2820);
  });

  it("zachowuje kuratorowane dane i używa polskich nazw (test D)", () => {
    const malaga = modelForSlug("malaga-spain", "wrzesien");
    assert.equal(malaga.text.title, "Malaga we wrześniu: pogoda 27°C, hotele i kiedy lecieć");
    assert.match(JSON.stringify(malaga.structuredData), /27°C/);

    const rome = modelForSlug("rome-italy", "lipiec");
    assert.match(rome.text.title, /^Rzym w lipcu/);
    assert.doesNotMatch(rome.text.title, /Rome/);
    assert.doesNotMatch(JSON.stringify(rome.structuredData), /Rome/);

    const heraklion = modelForSlug("heraklion-greece", "lipiec");
    assert.match(heraklion.text.title, /^Kreta w lipcu/);
  });

  it("usuwa regionalną pogodę z Miami i nie tworzy pustego FAQ (testy A i B)", () => {
    const miami = modelForSlug("miami-united-states-of-america", "grudzien");
    assert.equal(miami.text.title, "Miami w grudniu: hotele i kiedy lecieć");
    assert.equal(miami.weather, null);
    assert.doesNotMatch(JSON.stringify(miami), /°C/);
    assert.equal(
      collectJsonLdNodes(miami.structuredData).some((node) => node["@type"] === "FAQPage"),
      false,
    );
  });
});
