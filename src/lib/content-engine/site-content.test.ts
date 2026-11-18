import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTENT_DOCUMENTS } from "../../../content/seo/index.generated";

import { claimExpiresAt, ContentDocumentSchema } from "./schema";
import { contentLastModified, getEnrichment, RENDERED_CONTENT_TYPES, toRenderable } from "./site-content";

const docs = CONTENT_DOCUMENTS.map((raw) => ContentDocumentSchema.parse(raw));
const athens = docs.find((doc) => doc.id === "athens-greece-vs-rome-italy")!;
const NOW = new Date("2026-11-20T12:00:00Z");

describe("treść dla stron (site-content)", () => {
  it("pokazuje tylko dokumenty approved; in_review wyłącznie w podglądzie", () => {
    const draft = { ...athens, reviewStatus: "in_review" as const };
    assert.equal(getEnrichment(athens.canonicalUrl, { documents: [draft], now: NOW, previewDrafts: false }), null);
    assert.ok(getEnrichment(athens.canonicalUrl, { documents: [draft], now: NOW, previewDrafts: true }));
    assert.ok(getEnrichment(athens.canonicalUrl, { documents: [athens], now: NOW, previewDrafts: false }));
  });

  it("całość albo nic: po wygaśnięciu jednego twierdzenia strona wraca do szablonu", () => {
    const latestExpiry = Math.min(...athens.factClaims.map((claim) => claimExpiresAt(claim).getTime()));
    const afterExpiry = new Date(latestExpiry + 86_400_000);
    assert.ok(toRenderable(athens, NOW));
    assert.equal(toRenderable(athens, afterExpiry), null);
    // A razem z treścią znika data zmiany w sitemapie.
    assert.equal(contentLastModified({ documents: [athens], now: afterExpiry, previewDrafts: false }).size, 0);
  });

  it("niezweryfikowane twierdzenie w dowolnej sekcji ukrywa cały dokument", () => {
    const tampered = structuredClone(athens);
    tampered.factClaims[0].verification = "unverified";
    assert.equal(toRenderable(tampered, NOW), null);
  });

  it("jawna sekcja-opinia bez twierdzeń jest renderowana", () => {
    const withOpinion = structuredClone(athens);
    withOpinion.sections.push({
      id: "opinia-redakcyjna",
      kind: "prose",
      opinion: true,
      heading: "Jak czytać to porównanie",
      claimIds: [],
      paragraphs: ["Wybór zależy od rytmu podróży i tego, czy ważniejszy jest spokojny spacer, czy intensywny plan zwiedzania miasta."],
    });
    const rendered = toRenderable(withOpinion, NOW);
    assert.ok(rendered?.sections.some((section) => section.id === "opinia-redakcyjna"));
  });

  it("lastmod tylko dla typów, które jakaś strona renderuje", () => {
    assert.deepEqual([...RENDERED_CONTENT_TYPES], ["comparison_enrichment"]);
    const monthDoc = { ...athens, id: "barcelona-styczen", canonicalUrl: "/kierunki/barcelona-spain/styczen", contentType: "month_enrichment" as const };
    const dates = contentLastModified({ documents: [athens, monthDoc], now: NOW, previewDrafts: false });
    assert.deepEqual([...dates.keys()], [athens.canonicalUrl]);
    assert.equal(getEnrichment(monthDoc.canonicalUrl, { documents: [monthDoc], now: NOW, previewDrafts: false }), null);
  });

  it("dokument niezgodny ze schematem nie istnieje dla strony", () => {
    assert.equal(getEnrichment(athens.canonicalUrl, { documents: [{ ...athens, title: "x" }], now: NOW, previewDrafts: false }), null);
  });
});
