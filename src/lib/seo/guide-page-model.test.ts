import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDestinationStory } from "@/lib/mvp/destination-content";
import { getLocalizedDestinationGuide } from "@/lib/mvp/destination-localization";
import { curatedDestinations, getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { getCategoriesForDestination, getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";

import { ENTRY_REQUIREMENTS_NOTE } from "./destination-facts";
import { buildGuidePageModel } from "./guide-page-model";
import { collectJsonLdNodes, validateJsonLd } from "./jsonld-validate";

// Model przewodnika /kierunki/[slug] (SEO Data Integrity, PR #1.5).
//
// Do cd2aaee 212 z 235 przewodników miało w title „lot 3.1 h" ze stałej regionu,
// FAQ z lotem i miesiącami z tablicy regionu, chip „od X PLN / 2 os." ze wzoru,
// „bez wizy dla polskiego paszportu" z listy wykluczeń trzech krajów i 726
// pseudo-encji TouristAttraction z tagów. Test sprawdza wszystkie 235 stron.

const SITE = "https://helptravel.pl";
const TODAY = "2026-09-15";
const HERO = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg";
const AUTHOR = { "@type": "Person", name: "Jakub Ogrodniczuk", url: `${SITE}/redakcja` };
const HOURS = /\d[.,]\d\s?h\b/;

const profiles = getAllDestinationProfiles();
const curatedSlugs = new Set(curatedDestinations.map((destination) => destination.slug));

function build(slug: string) {
  const guide = getDestinationGuideBySlug(slug);
  assert.ok(guide, slug);
  const localizedGuide = getLocalizedDestinationGuide(guide, getDestinationStory(guide.destination), "pl");
  const model = buildGuidePageModel({ guide, localizedGuide, baseUrl: SITE, heroImage: HERO, author: AUTHOR });
  return { guide, localizedGuide, model };
}

function faqAnswers(structuredData: Record<string, unknown>): string {
  const faq = collectJsonLdNodes(structuredData).find((node) => node["@type"] === "FAQPage");
  return JSON.stringify(faq?.mainEntity ?? []);
}

describe("model przewodnika po kierunku", () => {
  it("235 przewodników: JSON-LD bez TouristAttraction, dat, Offer i uwag walidatora; FAQ niepuste (test F)", () => {
    assert.equal(profiles.length, 235);
    for (const profile of profiles) {
      const { model } = build(profile.slug);
      const ld = JSON.stringify(model.structuredData);
      assert.doesNotMatch(ld, /TouristAttraction|includesAttraction|datePublished|dateModified|"Offer"|"price"/, profile.slug);
      assert.deepEqual(validateJsonLd(model.structuredData, { todayIso: TODAY }), [], profile.slug);
      const faq = collectJsonLdNodes(model.structuredData).find((node) => node["@type"] === "FAQPage");
      assert.ok(faq && Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 2, profile.slug);
    }
  });

  it("czas lotu bez dokładnych danych: nigdy w title, opisach i FAQ; szacunek zawsze oznaczony (test C)", () => {
    for (const profile of profiles) {
      const { model } = build(profile.slug);
      const flight = model.facts.flight;
      if (flight?.kind !== "exact") {
        for (const [field, text] of Object.entries(model.text)) {
          assert.doesNotMatch(text, HOURS, `${profile.slug} ${field}: ${text}`);
        }
        assert.doesNotMatch(faqAnswers(model.structuredData), HOURS, profile.slug);
      }
      if (flight?.kind === "estimate") {
        assert.match(model.flightChip ?? "", /szacunek/, profile.slug);
        assert.match(model.flightSentence ?? "", /szacunkowo/, profile.slug);
      }
      if (model.facts.isDomestic) {
        assert.equal(model.flightChip, null, profile.slug);
        assert.equal(model.flightSentence, null, profile.slug);
        assert.ok(model.metaBarItems.every((item) => !item.includes("z Polski")), profile.slug);
      }
    }
  });

  it("temperatura spoza danych kuratorowanych: bez °C w JSON-LD i bez najlepszych miesięcy (test B)", () => {
    for (const profile of profiles) {
      if (curatedSlugs.has(profile.slug)) continue;
      const { model, localizedGuide } = build(profile.slug);
      assert.doesNotMatch(JSON.stringify(model.structuredData), /°C/, profile.slug);
      assert.deepEqual(model.bestMonths, [], profile.slug);
      assert.equal(localizedGuide.bestTime, "", profile.slug);
    }
  });

  it("budżet ze wzoru tylko z danymi kuratorowanymi", () => {
    for (const profile of profiles) {
      const { model } = build(profile.slug);
      assert.equal(model.budgetEstimate !== null, curatedSlugs.has(profile.slug), profile.slug);
    }
  });

  it("wiza: neutralna notka, bez claimu i bez kategorii „bez-wizy” z heurystyki (test G)", () => {
    for (const profile of profiles) {
      const { model, localizedGuide } = build(profile.slug);
      assert.equal(localizedGuide.visaNote, ENTRY_REQUIREMENTS_NOTE, profile.slug);
      assert.doesNotMatch(JSON.stringify(model), /bez wizy dla polskiego paszportu|visa-free/i, profile.slug);
      assert.ok(!getCategoriesForDestination(profile.slug).some((category) => category.slug === "bez-wizy"), profile.slug);
    }
  });

  it("„ciepłe kierunki” nie wynikają z temperatury szablonu", () => {
    const madrid = getCategoriesForDestination("madrid-spain").map((category) => category.slug);
    assert.ok(!madrid.includes("ciepłe-kierunki"), madrid.join(", "));
  });

  it("przewodniki generyczne mówią po polsku o nazwach kierunków", () => {
    const { guide, model } = build("seville-spain");
    assert.match(guide.overview, /^Sewilla /);
    assert.doesNotMatch(`${guide.overview} ${JSON.stringify(guide.faq)}`, /Seville/);
    assert.equal(model.name, "Sewilla");
  });

  it("dane kuratorowane zostają faktem (test D), kierunek w Polsce bez lotu", () => {
    assert.equal(build("malaga-spain").model.text.title, "Malaga: przewodnik, kiedy lecieć i gdzie spać, lot 3.4 h");
    const warsaw = build("warsaw-poland").model;
    assert.doesNotMatch(warsaw.text.title, HOURS);
    assert.equal(warsaw.flightChip, null);
  });
});
