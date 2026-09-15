import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { commercialCities } from "@/lib/mvp/commercial-cities";

import { buildCityHotelsFaq, buildCityHotelsStructuredData } from "./city-hotels-schema";
import { collectJsonLdNodes, validateJsonLd } from "./jsonld-validate";
import { buildMonthPageStructuredData } from "./month-page-schema";
import { buildSiteStructuredData } from "./site-schema";

const SITE = "https://helptravel.pl";
const TODAY = "2026-09-13";
const AUTHOR = { "@type": "Person", name: "Jakub Ogrodniczuk", url: `${SITE}/redakcja` };

function nodeTypes(data: unknown): unknown[] {
  return collectJsonLdNodes(data).map((node) => node["@type"]);
}

function nodesWithPrice(data: unknown) {
  return collectJsonLdNodes(data).filter((node) => "price" in node || "priceCurrency" in node || "priceRange" in node);
}

const monthInput = {
  baseUrl: SITE,
  destinationSlug: "malaga-spain",
  month: "wrzesien" as const,
  name: "Malaga",
  countryName: "Hiszpania",
  weather: {
    tempC: 27,
    description: "ciepło, komfortowo na zwiedzanie i plażę",
    verdict: "Tak — to jeden z lepszych terminów na ten kierunek.",
    warmestMonth: "sierpien" as const,
    coldestMonth: "styczen" as const,
    season: { label: "Sezon przejściowy", crowd: "umiarkowany ruch", price: "ceny umiarkowane" },
  },
  exactFlightHours: 4.1,
  author: AUTHOR,
};

describe("dane strukturalne szablonów (test E i walidacja JSON-LD)", () => {
  it("layout: WebSite po polsku, Organization z logo, usługa bez oferty", () => {
    const data = buildSiteStructuredData(SITE);
    assert.deepEqual(validateJsonLd(data, { todayIso: TODAY }), []);
    const website = collectJsonLdNodes(data).find((node) => node["@type"] === "WebSite");
    assert.equal(website?.inLanguage, "pl-PL");
    assert.ok(nodeTypes(data).includes("Organization"));
    assert.deepEqual(nodesWithPrice(data), []);
  });

  it("strona miesiąca: bez Offer, kwot i dat, nagłówek bez roku", () => {
    const data = buildMonthPageStructuredData(monthInput);
    assert.deepEqual(validateJsonLd(data, { todayIso: TODAY }), []);
    assert.equal(nodeTypes(data).includes("Offer"), false);
    assert.deepEqual(nodesWithPrice(data), []);
    assert.doesNotMatch(JSON.stringify(data), /zł/);
    assert.doesNotMatch(JSON.stringify(data), /\b20\d{2}\b(?!-)/);
    assert.doesNotMatch(JSON.stringify(data), /datePublished|dateModified/);
    assert.doesNotMatch(JSON.stringify(data), /morza/i);
    assert.match(JSON.stringify(data), /Malaga we wrześniu/);
  });

  it("strona miesiąca bez pogody i dokładnego lotu nie emituje FAQPage", () => {
    const data = buildMonthPageStructuredData({ ...monthInput, weather: null, exactFlightHours: null });
    assert.deepEqual(validateJsonLd(data, { todayIso: TODAY }), []);
    assert.equal(nodeTypes(data).includes("FAQPage"), false);
    assert.doesNotMatch(JSON.stringify(data), /°C/);
    assert.doesNotMatch(JSON.stringify(data), /datePublished|dateModified/);
  });

  it("hotele w mieście: bez Offer i bez kwot, dla każdego miasta", () => {
    for (const city of commercialCities) {
      const data = buildCityHotelsStructuredData({
        baseUrl: SITE,
        city,
        flightHours: 3.2,
        bestMonths: ["maj", "czerwiec"],
        featuredHotels: [{ id: "lp1", name: "Hotel testowy", city: city.cityNominative, stars: 4 }],
        heroImage: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg",
        author: AUTHOR,
      });
      assert.doesNotMatch(JSON.stringify(data), /datePublished|dateModified/, city.slug);
      assert.deepEqual(validateJsonLd(data, { todayIso: TODAY }), [], city.slug);
      assert.equal(nodeTypes(data).includes("Offer"), false, city.slug);
      assert.deepEqual(nodesWithPrice(data), [], city.slug);
      assert.doesNotMatch(JSON.stringify(data), /zł/, city.slug);
    }
  });

  it("widoczne FAQ hoteli w mieście nie podaje ceny modelowanej", () => {
    for (const city of commercialCities) {
      const faq = buildCityHotelsFaq({ city, flightHours: 3.2, bestMonths: ["maj"] });
      assert.ok(faq.length >= 4, city.slug);
      for (const item of faq) {
        assert.doesNotMatch(`${item.question} ${item.answer}`, /\d\s*zł/, city.slug);
      }
    }
  });
});
