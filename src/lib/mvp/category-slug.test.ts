import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { categoryPath } from "./category-slug";
import { getEditorialCategories } from "./publisher-content";

describe("categoryPath — adres strony kategorii", () => {
  it("zwija polskie znaki do adresu ASCII", () => {
    assert.equal(categoryPath("tanie-podróże"), "/tanie-podroze");
    assert.equal(categoryPath("ciepłe-kierunki"), "/cieple-kierunki");
  });

  it("slug ASCII zostaje bez zmian", () => {
    assert.equal(categoryPath("city-breaki"), "/city-breaki");
  });

  it("każda kategoria z danych ma stronę pod swoim adresem", () => {
    for (const category of getEditorialCategories()) {
      const page = path.join(process.cwd(), "src", "app", categoryPath(category.slug).slice(1), "page.tsx");
      assert.ok(existsSync(page), `${category.slug} → ${categoryPath(category.slug)}`);
    }
  });
});
