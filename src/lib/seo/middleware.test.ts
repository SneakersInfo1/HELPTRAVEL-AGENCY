import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error -- eksportowane z pliku JS Next 16.2.9, ale nieobecne w jego .d.ts
import { getMiddlewareMatchers } from "next/dist/build/analysis/get-page-static-info";
import { NextRequest } from "next/server";

import { config, middleware } from "../../../middleware";

interface CompiledMatcher {
  regexp: string;
  has?: Array<{ type: string; key: string }>;
}

// Matcher kompilowany tą samą funkcją, której używa build Next — inaczej test
// sprawdzałby regex napisany ręcznie, a nie to, co faktycznie trafi na Vercel.
const compiledMatchers = (getMiddlewareMatchers as (matchers: unknown, nextConfig: object) => CompiledMatcher[])(
  config.matcher,
  {},
);

function middlewareRunsFor(pathname: string, search = ""): boolean {
  const query = new URLSearchParams(search);
  return compiledMatchers.some((matcher) => {
    if (!new RegExp(matcher.regexp).test(pathname)) return false;
    return (matcher.has ?? []).every((condition) => condition.type !== "query" || query.has(condition.key));
  });
}

function run(url: string) {
  return middleware(new NextRequest(url));
}

describe("middleware — ?lang i historyczne adresy (testy B i G)", () => {
  it("?lang=en przekierowuje 301 na ten sam adres bez parametru", () => {
    const response = run("https://helptravel.pl/kierunki/malaga-spain?lang=en&utm_source=tiktok");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://helptravel.pl/kierunki/malaga-spain?utm_source=tiktok");
  });

  it("/?lang=en przekierowuje 301 na stronę główną", () => {
    const response = run("https://helptravel.pl/?lang=en");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://helptravel.pl/");
  });

  it("stary slug porównania przekierowuje 301 na obecną parę", () => {
    const response = run("https://helptravel.pl/porownanie/malaga-vs-valencia");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://helptravel.pl/porownanie/malaga-spain-vs-valencia-spain");
  });

  it("literówka katalogu porównań: matcher łapie adres, middleware przekierowuje 301 na istniejącą parę", () => {
    for (const pathname of ["/por%C3%B3wnanie/athens-greece-vs-rome-italy", "/porunanie/heraklion-greece-vs-rhodes-greece", "/por%C3%B3wnanie"]) {
      assert.equal(middlewareRunsFor(pathname), true, pathname);
    }
    const response = run("https://helptravel.pl/por%C3%B3wnanie/athens-greece-vs-rome-italy");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://helptravel.pl/porownanie/athens-greece-vs-rome-italy");
    const typo = run("https://helptravel.pl/porunanie/heraklion-greece-vs-rhodes-greece");
    assert.equal(typo.headers.get("location"), "https://helptravel.pl/porownanie/heraklion-greece-vs-rhodes-greece");
  });

  it("właściwy adres porównania i nieistniejąca para pod literówką przechodzą dalej bez przekierowania", () => {
    assert.equal(run("https://helptravel.pl/porownanie/athens-greece-vs-rome-italy").headers.get("location"), null);
    assert.equal(run("https://helptravel.pl/porunanie/nie-ma-takiej-pary").headers.get("location"), null);
  });

  it("kategoria z polskimi znakami przekierowuje 301 na adres ASCII", () => {
    const response = run("https://helptravel.pl/tanie-podr%C3%B3%C5%BCe");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://helptravel.pl/tanie-podroze");
  });

  it("zwykła strona bez ?lang przechodzi dalej", () => {
    const response = run("https://helptravel.pl/tanie-podroze");
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });

  it("matcher uruchamia middleware dokładnie tam, gdzie trzeba", () => {
    assert.equal(middlewareRunsFor("/", "lang=en"), true);
    assert.equal(middlewareRunsFor("/kierunki/malaga-spain", "lang=en"), true);
    assert.equal(middlewareRunsFor("/porownanie/malaga-vs-valencia"), true);
    assert.equal(middlewareRunsFor("/tanie-podr%C3%B3%C5%BCe"), true);
    assert.equal(middlewareRunsFor("/tanie-podróże"), true);
    // Zwykłe strony i API bez ?lang nie płacą za wywołanie middleware.
    assert.equal(middlewareRunsFor("/kierunki/malaga-spain"), false);
    assert.equal(middlewareRunsFor("/porownanie/malaga-spain-vs-valencia-spain"), false);
    assert.equal(middlewareRunsFor("/porownanie"), false);
    assert.equal(middlewareRunsFor("/api/hotels/search", "lang=en"), false);
  });
});
