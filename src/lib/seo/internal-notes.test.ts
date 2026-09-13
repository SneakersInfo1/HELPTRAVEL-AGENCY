import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  getDestinationGuideBySlug,
  getEditorialArticles,
  getEditorialCategories,
  type DestinationGuideContent,
  type EditorialArticle,
} from "@/lib/mvp/publisher-content";

// Notatki redakcyjno-marketingowe, które wyciekły do publicznych tekstów
// (audyt SEO Growth V1, pkt 31–32): „ruch SEO", „afiliacja", planer, którego
// w serwisie nie ma, „łatwo go sprzedać treściowo". Lista jest celowo
// konkretna — to strażnik znanych fraz, nie ocena stylu tekstu.
const INTERNAL_NOTE_PATTERNS: RegExp[] = [
  /\bSEO\b/,
  /afiliac/i,
  /plann?er/i,
  /tre(ś|s)ciowo/i,
  // „content" jako słowo, nie fragment nazwy modułu w imporcie (publisher-content).
  /(?<![\w-])content/i,
  /komercyjn/i,
  /startup/i,
  /serwisu travelowego/i,
  /wiarygodno(ść|sc) strony/i,
  /zaufanie do marki/i,
  /wysokiej intencji/i,
  /najmocniejszych temat(ó|o)w/i,
  /punkt wej(ś|s)cia/i,
  /link(ó|o)w partnerskich/i,
  /si(ł|l)(ę|e) serwisu/i,
  /potencja(ł|l) (na|pod) (SEO|przewodniki)/i,
];

function findNotes(where: string, texts: Array<string | undefined>): string[] {
  const hits: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const pattern of INTERNAL_NOTE_PATTERNS) {
      if (pattern.test(text)) hits.push(`${where}: ${pattern} w „${text.slice(0, 80)}"`);
    }
  }
  return hits;
}

/** Pola artykułu, które szablon /inspiracje/[slug] renderuje. */
function renderedArticleTexts(article: EditorialArticle): Array<string | undefined> {
  return [
    article.title,
    article.description,
    article.excerpt,
    article.hero,
    ...article.practicalBullets,
    ...article.sections.flatMap((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? [])]),
    ...article.faq.flatMap((item) => [item.question, item.answer]),
  ];
}

/** Pola przewodnika, które szablon /kierunki/[slug] renderuje. */
function renderedGuideTexts(guide: DestinationGuideContent): string[] {
  return [
    guide.overview,
    ...guide.whyGo,
    guide.bestTime,
    guide.budgetNote,
    ...guide.whoFor,
    ...guide.highlights,
    ...guide.districts,
    ...guide.faq.flatMap((item) => [item.question, item.answer]),
  ];
}

function report(hits: string[]): string {
  return `${hits.length} trafień, pierwsze:\n${hits.slice(0, 12).join("\n")}`;
}

/** Źródło szablonu bez komentarzy — komentarze opisują historię („SEO master plan") i nie trafiają na stronę. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("notatki wewnętrzne nie trafiają na strony (test I)", () => {
  it("opublikowane artykuły", () => {
    const hits = getEditorialArticles().flatMap((article) =>
      findNotes(`/inspiracje/${article.slug}`, renderedArticleTexts(article)),
    );
    assert.equal(hits.length, 0, report(hits));
  });

  it("przewodniki po kierunkach", () => {
    const hits = getAllDestinationProfiles().flatMap((destination) => {
      const guide = getDestinationGuideBySlug(destination.slug);
      return guide ? findNotes(`/kierunki/${destination.slug}`, renderedGuideTexts(guide)) : [];
    });
    assert.equal(hits.length, 0, report(hits));
  });

  it("opisy kategorii", () => {
    const hits = getEditorialCategories().flatMap((category) =>
      findNotes(`/${category.slug}`, [category.title, category.description]),
    );
    assert.equal(hits.length, 0, report(hits));
  });

  it("szablony artykułu i przewodnika oraz pasek redakcyjny", () => {
    for (const file of [
      "src/app/inspiracje/[slug]/page.tsx",
      "src/app/kierunki/[slug]/page.tsx",
      "src/components/publisher/editorial-meta-bar.tsx",
    ]) {
      const source = withoutComments(readFileSync(path.join(process.cwd(), file), "utf8"));
      const hits = findNotes(file, [source]);
      assert.equal(hits.length, 0, report(hits));
      // Data „aktualizacji" wpisana na sztywno — nie wynikała z żadnej zmiany treści.
      assert.doesNotMatch(source, /aktualizacja: marzec 2026/, file);
    }
  });
});
