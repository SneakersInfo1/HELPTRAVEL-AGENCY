import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { defaultCtaPrefetch } from "./cta-prefetch";

describe("prefetch linków CTA ze stron treści", () => {
  it("wyłącza prefetch dla wyszukiwarki hoteli, rezerwacji i lotów", () => {
    for (const href of [
      "/hotele/szukaj",
      "/hotele/szukaj?destination=Rome&country=Italy",
      "/hotele/rezerwacja?offer=x",
      "/loty",
      "/loty/wyniki?from=WAW&to=BCN",
      "/en/hotele/szukaj?destination=Rome",
      "https://helptravel.pl/hotele/szukaj?destination=Rome",
    ]) {
      assert.equal(defaultCtaPrefetch(href), false, href);
    }
  });

  it("nie rusza linków do treści i do stron hoteli w mieście", () => {
    for (const href of [
      "/kierunki/barcelona-spain",
      "/kierunki/barcelona-spain/styczen",
      "/porownanie/athens-greece-vs-rome-italy",
      "/hotele/w/barcelona",
      "/wyjazdy/city-break",
      // Prefiks to za mało: „/lotyska” i „/hotele/szukajka” nie są trasami produktu.
      "/lotyska",
      "/hotele/szukajka",
    ]) {
      assert.equal(defaultCtaPrefetch(href), undefined, href);
    }
  });

  it("jawne ustawienie wygrywa w obie strony", () => {
    assert.equal(defaultCtaPrefetch("/hotele/szukaj?destination=Rome", true), true);
    assert.equal(defaultCtaPrefetch("/kierunki/barcelona-spain", false), false);
  });

  it("SeoCtaLink przekazuje wynik do znacznika linku", () => {
    // Komponent kliencki importuje next/link, więc sprawdzamy źródło, jak pozostałe testy kontraktu.
    const source = readFileSync("src/components/analytics/seo-cta-link.tsx", "utf8");
    assert.match(source, /prefetch=\{defaultCtaPrefetch\(href, prefetch\)\}/);
    // `prefetch` musi być wyjęty z `...rest`, inaczej rozpakowanie nadpisałoby wyliczoną wartość.
    assert.match(source, /localized = false,\s*prefetch,\s*children,/);
  });
});
