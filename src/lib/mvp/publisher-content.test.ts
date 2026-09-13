import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAllDestinationProfiles } from "./destinations";
import {
  getArticlesForCategory,
  getArticlesForDestination,
  getEditorialArticleBySlug,
  getEditorialArticles,
  getEditorialCategories,
  getLatestEditorialArticles,
  getRelatedArticles,
} from "./publisher-content";

// Cztery artykuły mają slugi z polskimi znakami. Pod takim adresem strona
// zwracała 404, a mimo to wisiały w sitemapie i w 139 linkach wewnętrznych
// (audyt SEO Growth V1). Zostają w danych jako szkice do czasu przepisania:
// nie publikujemy ich w obecnej, szablonowej formie i nie kasujemy treści.
const DRAFT_SLUGS = [
  "najlepsze-kierunki-na-krótki-urlop",
  "kierunki-z-plaża-i-zwiedzaniem",
  "pomysły-na-city-break-w-europie",
  "krótkie-wakacje-w-europie",
];

const ASCII_SLUG = /^[a-z0-9-]+$/;

describe("artykuły-szkice nie są publikowane", () => {
  it("lista artykułów zawiera wyłącznie slugi ASCII", () => {
    for (const article of getEditorialArticles()) {
      assert.match(article.slug, ASCII_SLUG);
    }
  });

  it("szkic nie otwiera się pod swoim slugiem", () => {
    for (const slug of DRAFT_SLUGS) {
      assert.equal(getEditorialArticleBySlug(slug), undefined, slug);
    }
  });

  it("szkic nie trafia do list: najnowsze, kategorie, kierunki, powiązane", () => {
    const listed = [
      ...getLatestEditorialArticles(50),
      ...getEditorialCategories().flatMap((category) => getArticlesForCategory(category.slug)),
      ...getAllDestinationProfiles().flatMap((destination) => getArticlesForDestination(destination.slug)),
      ...getEditorialArticles().flatMap((article) => getRelatedArticles(article, 50)),
    ];
    for (const article of listed) {
      assert.match(article.slug, ASCII_SLUG);
    }
  });
});
