import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  getEditorialArticles,
  getEditorialCategories,
  type EditorialArticle,
} from "@/lib/mvp/publisher-content";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

const RELATIVE_COST_CLAIM = /taniej|drożej|tanio|budżet|opłacaln|cheaper|pricier/i;
const LEGACY_COST_FIELD = ["cost", "Index"].join("");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function renderedArticleText(article: EditorialArticle): string {
  return JSON.stringify({
    title: article.title,
    description: article.description,
    excerpt: article.excerpt,
    hero: article.hero,
    practicalBullets: article.practicalBullets,
    sections: article.sections,
    faq: article.faq,
  });
}

describe("strażnik niezmierzonych porównań cen", () => {
  it("opublikowane artykuły i kategorie nie przypisują kierunkom względnego poziomu cen", () => {
    for (const article of getEditorialArticles()) {
      assert.doesNotMatch(renderedArticleText(article), RELATIVE_COST_CLAIM, article.slug);
    }
    for (const category of getEditorialCategories()) {
      assert.doesNotMatch(
        JSON.stringify({ title: category.title, description: category.description, hero: category.hero }),
        RELATIVE_COST_CLAIM,
        category.slug,
      );
    }
  });

  it("hub cenowy opiera temat na świeżych migawkach, a pozostałe huby nie porównują kosztów", () => {
    for (const mood of TRAVEL_MOODS) {
      if (mood.slug === "budzet") {
        const text = JSON.stringify(mood);
        assert.match(text, /świeże migawki cen|świeżych migawek cen/i);
        assert.match(text, /konkretnego terminu|dla tych samych dat/i);
        assert.doesNotMatch(text, /najlepszy stosunek ceny|najbardziej opłacaln/i);
      } else {
        assert.doesNotMatch(JSON.stringify(mood), RELATIVE_COST_CLAIM, mood.slug);
      }
    }
  });

  it("stare pole oceny nie występuje w modelach SEO ani renderze kart kierunków", () => {
    const files = [
      ...sourceFiles(path.join(process.cwd(), "src/lib/seo")),
      path.join(process.cwd(), "src/components/publisher/destination-guide-card.tsx"),
      path.join(process.cwd(), "src/components/publisher/mood-destination-card.tsx"),
    ];
    const hits = files.filter((file) => readFileSync(file, "utf8").includes(LEGACY_COST_FIELD));
    assert.deepEqual(hits.map((file) => path.relative(process.cwd(), file)), []);
  });
});
