import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateJsonLd } from "./jsonld-validate";

const SITE = "https://helptravel.pl";
const TODAY = "2026-09-13";

function graph(...nodes: Array<Record<string, unknown>>) {
  return { "@context": "https://schema.org", "@graph": nodes };
}

const organization = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "HelpTravel",
  url: SITE,
  logo: { "@type": "ImageObject", url: `${SITE}/branding/helptravel-mark.png` },
};

const hotelOffer = (offer: Record<string, unknown>) => ({
  "@type": "Hotel",
  name: "Hotel testowy",
  offers: {
    "@type": "Offer",
    price: 1234.5,
    priceCurrency: "PLN",
    availability: "https://schema.org/InStock",
    validFrom: "2026-10-01",
    url: `${SITE}/hotele/lp1?checkin=2026-10-01`,
    ...offer,
  },
});

function messages(data: unknown): string[] {
  return validateJsonLd(data, { todayIso: TODAY }).map((issue) => `${issue.type}: ${issue.message}`);
}

describe("validateJsonLd — Organization, WebSite, BreadcrumbList, Article, ItemList, Offer", () => {
  it("poprawny graf przechodzi bez uwag", () => {
    const data = graph(
      organization,
      { "@type": "WebSite", name: "HelpTravel", url: SITE, inLanguage: "pl-PL" },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${SITE}/kierunki` },
        ],
      },
      {
        "@type": "Article",
        headline: "Malaga w październiku — pogoda, hotele i kiedy lecieć",
        author: { "@type": "Person", name: "Jakub Ogrodniczuk" },
        publisher: { "@id": `${SITE}/#organization` },
        datePublished: "2026-01-01T00:00:00.000Z",
      },
      { "@type": "ItemList", itemListElement: [{ "@type": "ListItem", position: 1, url: `${SITE}/kierunki/malaga-spain` }] },
      hotelOffer({}),
    );
    assert.deepEqual(messages(data), []);
  });

  it("odwołanie do organizacji po @id nie jest sprawdzane jak pełny węzeł", () => {
    assert.deepEqual(messages(graph({ "@type": "Organization", "@id": `${SITE}/#organization`, name: "HelpTravel" })), []);
  });

  it("Organization bez logo albo z adresem względnym jest błędem", () => {
    assert.equal(messages(graph({ ...organization, logo: undefined })).length, 1);
    assert.equal(messages(graph({ ...organization, url: "/" })).length, 1);
  });

  it("WebSite z listą języków zamiast pl-PL jest błędem", () => {
    const issues = messages(graph({ "@type": "WebSite", name: "HelpTravel", url: SITE, inLanguage: ["pl-PL", "en-US"] }));
    assert.equal(issues.length, 1);
  });

  it("okruszki z dziurą w numeracji albo adresem względnym są błędem", () => {
    const issues = messages(
      graph({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${SITE}/` },
          { "@type": "ListItem", position: 3, name: "Kierunki", item: "/kierunki" },
        ],
      }),
    );
    assert.equal(issues.length, 2);
  });

  it("artykuł bez nagłówka albo z minionym rokiem w nagłówku jest błędem", () => {
    const base = { "@type": "Article", author: { name: "X" }, publisher: { "@id": "x" } };
    assert.equal(messages(graph({ ...base, headline: "" })).length, 1);
    assert.equal(messages(graph({ ...base, headline: "Malaga w styczniu 2025: pogoda" })).length, 1);
  });

  it("pusta ItemList jest błędem", () => {
    assert.equal(messages(graph({ "@type": "ItemList", itemListElement: [] })).length, 1);
  });

  it("FAQPage bez pytań albo z pustą odpowiedzią jest błędem", () => {
    assert.equal(messages(graph({ "@type": "FAQPage", mainEntity: [] })).length, 1);
    assert.equal(
      messages(
        graph({
          "@type": "FAQPage",
          mainEntity: [{ "@type": "Question", name: "Czy warto?", acceptedAnswer: { "@type": "Answer", text: "" } }],
        }),
      ).length,
      1,
    );
    assert.deepEqual(
      messages(
        graph({
          "@type": "FAQPage",
          mainEntity: [{ "@type": "Question", name: "Czy warto?", acceptedAnswer: { "@type": "Answer", text: "Tak." } }],
        }),
      ),
      [],
    );
  });

  it("TouristAttraction z samego tagu jest błędem, konkretne miejsce przechodzi (test F)", () => {
    const fromTag = graph({
      "@type": "TouristDestination",
      name: "Alicante",
      includesAttraction: [{ "@type": "TouristAttraction", name: "spokojniejszy pobyt" }],
    });
    assert.equal(messages(fromTag).length, 1);
    assert.deepEqual(
      messages(
        graph({
          "@type": "TouristAttraction",
          name: "Alcazaba",
          address: { "@type": "PostalAddress", addressLocality: "Malaga", addressCountry: "ES" },
        }),
      ),
      [],
    );
  });

  it("Offer bez ceny, waluty, dostępności albo adresu jest błędem", () => {
    assert.equal(messages(graph(hotelOffer({ price: undefined }))).length, 1);
    assert.equal(messages(graph(hotelOffer({ price: 0 }))).length, 1);
    assert.equal(messages(graph(hotelOffer({ priceCurrency: "zł" }))).length, 1);
    assert.equal(messages(graph(hotelOffer({ availability: "InStock" }))).length, 1);
    assert.equal(messages(graph(hotelOffer({ url: "/hotele/lp1" }))).length, 1);
  });

  it("Offer na miniony termin albo po terminie ważności ceny jest błędem (test E)", () => {
    assert.equal(messages(graph(hotelOffer({ validFrom: "2026-09-01" }))).length, 1);
    assert.equal(messages(graph(hotelOffer({ priceValidUntil: "2026-08-31" }))).length, 1);
  });
});
