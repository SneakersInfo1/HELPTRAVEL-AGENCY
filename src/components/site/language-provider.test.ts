import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_SITE_LOCALE, localizeHref } from "@/lib/mvp/locale";

// Test A. Źródło providera czytane jako tekst, bo regresja, której pilnujemy,
// to ponowne dopisanie wykrywania języka po stronie przeglądarki. Renderer
// Google działa w en-US: taka detekcja przełączała mu cały serwis na angielski
// (`lang="en"`, linki `/en/*` i `?lang=en`, błąd hydratacji #418). Zachowanie
// w prawdziwej przeglądarce sprawdza `e2e/seo-foundation.spec.ts`.
const PROVIDER_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "components", "site", "language-provider.tsx"),
  "utf8",
);

describe("język serwisu nie zależy od klienta (test A)", () => {
  it("provider nie czyta języka przeglądarki", () => {
    assert.doesNotMatch(PROVIDER_SOURCE, /navigator\.language/);
  });

  it("provider nie czyta zapisanej preferencji ani parametru ?lang", () => {
    assert.doesNotMatch(PROVIDER_SOURCE, /localStorage/);
    assert.doesNotMatch(PROVIDER_SOURCE, /get\(["']lang["']\)/);
  });

  it("jedynym językiem serwisu jest polski", () => {
    assert.equal(DEFAULT_SITE_LOCALE, "pl");
  });

  it("linki budowane w języku serwisu nie mają /en ani lang=", () => {
    const hrefs = [
      "/",
      "/kierunki",
      "/kierunki/malaga-spain",
      "/hotele/w/barcelona",
      "/faq",
      "/inspiracje/europa-na-5-dni?utm_source=x&lang=en",
    ];
    for (const href of hrefs) {
      const localized = localizeHref(href, DEFAULT_SITE_LOCALE);
      assert.ok(!localized.startsWith("/en"), `${href} → ${localized}`);
      assert.ok(!localized.includes("lang="), `${href} → ${localized}`);
    }
  });
});
