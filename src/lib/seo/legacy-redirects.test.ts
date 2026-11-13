import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { getComparisonPairBySlug } from "@/lib/mvp/comparisons";

import { LEGACY_REDIRECTS, legacyRedirectTarget } from "./legacy-redirects";

describe("przekierowania historycznych adresów (test G)", () => {
  it("stary slug porównania Malaga–Walencja prowadzi na tę samą parę, nie na stronę główną", () => {
    assert.equal(
      legacyRedirectTarget("/porownanie/malaga-vs-valencia"),
      "/porownanie/malaga-spain-vs-valencia-spain",
    );
  });

  it("kategoria z polskimi znakami prowadzi na adres ASCII w obu zapisach", () => {
    assert.equal(legacyRedirectTarget("/tanie-podróże"), "/tanie-podroze");
    assert.equal(legacyRedirectTarget("/tanie-podr%C3%B3%C5%BCe"), "/tanie-podroze");
  });

  it("zapis NFD (litera plus znak łączący) też trafia", () => {
    const nfd = "/tanie-podróże".normalize("NFD");
    assert.equal(legacyRedirectTarget(nfd), "/tanie-podroze");
    assert.equal(legacyRedirectTarget(encodeURI(nfd)), "/tanie-podroze");
  });

  it("nie przekierowuje adresów spoza listy ani zepsutego kodowania", () => {
    for (const pathname of [
      "/",
      "/tanie-podroze",
      "/porownanie/malaga-spain-vs-valencia-spain",
      "/porownanie/malaga-vs-valencia/x",
      "/tanie-podr%C3",
    ]) {
      assert.equal(legacyRedirectTarget(pathname), null, pathname);
    }
  });

  it("literówki katalogu porównań prowadzą 1:1 na istniejącą parę albo hub", () => {
    assert.equal(
      legacyRedirectTarget("/por%C3%B3wnanie/athens-greece-vs-rome-italy"),
      "/porownanie/athens-greece-vs-rome-italy",
    );
    assert.equal(
      legacyRedirectTarget("/porównanie/budapest-hungary-vs-prague-czechia"),
      "/porownanie/budapest-hungary-vs-prague-czechia",
    );
    assert.equal(
      legacyRedirectTarget("/porunanie/heraklion-greece-vs-rhodes-greece"),
      "/porownanie/heraklion-greece-vs-rhodes-greece",
    );
    assert.equal(legacyRedirectTarget("/porównanie"), "/porownanie");
    assert.equal(legacyRedirectTarget("/porównanie".normalize("NFD")), "/porownanie");
  });

  it("literówka katalogu z nieistniejącą parą zostaje 404 — bez przekierowania na hub", () => {
    for (const pathname of [
      "/porównanie/nie-ma-takiej-pary",
      "/porunanie/antalya-turkey-vs-heraklion-heraklion",
      "/porównanie/athens-greece-vs-rome-italy/extra",
      "/porownanie/athens-greece-vs-rome-italy",
      "/porownanie",
    ]) {
      assert.equal(legacyRedirectTarget(pathname), null, pathname);
    }
  });

  it("każdy cel istnieje — przekierowanie nie może kończyć się na 404", () => {
    for (const target of Object.values(LEGACY_REDIRECTS)) {
      const [head, slug] = target.split("/").filter(Boolean);
      if (head === "porownanie") {
        assert.ok(getComparisonPairBySlug(slug), target);
      } else {
        assert.ok(existsSync(path.join(process.cwd(), "src", "app", head, "page.tsx")), target);
      }
    }
  });
});
