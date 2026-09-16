import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { commercialCities } from "@/lib/mvp/commercial-cities";
import { comparisonPairs } from "@/lib/mvp/comparisons";
import { polishMonthSlugs, seasonSlugs } from "@/lib/mvp/months";

import {
  cityHotelsPageText,
  comparisonPageText,
  guidePageText,
  monthPageText,
  seasonPageHeading,
} from "./page-titles";
import { verifyTitlePrice } from "./price-claim";

const YEAR = /\b20\d{2}\b/;
const AMOUNT = /\d\s*(zł|PLN)/i;

function assertNoYearNoAmount(label: string, texts: Record<string, string | undefined>) {
  for (const [field, text] of Object.entries(texts)) {
    if (!text) continue;
    assert.doesNotMatch(text, YEAR, `${label} / ${field}: ${text}`);
    assert.doesNotMatch(text, AMOUNT, `${label} / ${field}: ${text}`);
  }
}

describe("tytuły i opisy bez roku i bez ceny modelowanej (testy C i F)", () => {
  it("przewodnik po kierunku", () => {
    const text = guidePageText({ cityPl: "Malaga", flightHours: 4.1, tripLength: "4-5 dni" });
    assertNoYearNoAmount("przewodnik", text);
    assert.match(text.title, /^Malaga: /);
  });

  it("przewodnik bez dokładnego czasu lotu nie podaje godzin (test C)", () => {
    const text = guidePageText({ cityPl: "Alicante", flightHours: null, tripLength: "3-4 dni" });
    assertNoYearNoAmount("przewodnik bez lotu", text);
    assert.equal(text.title, "Alicante: przewodnik po kierunku, hotele i loty");
    assert.doesNotMatch(JSON.stringify(text), /\d[.,]\d\s?h\b/);
  });

  it("porównanie bez danych klimatu i budżetu nie obiecuje pogody ani budżetu", () => {
    const pair = comparisonPairs.find((item) => item.slug === "heraklion-greece-vs-rhodes-greece");
    assert.ok(pair);
    const bare = comparisonPageText({ pair, nameA: "Kreta", nameB: "Rodos" });
    assert.equal(bare.title, "Kreta czy Rodos? Porównanie: plaże, zwiedzanie i dolot");
    assert.doesNotMatch(`${bare.title} ${bare.description}`, /pogod|budżet/);
    const full = comparisonPageText({ pair, nameA: "Kreta", nameB: "Rodos", hasClimate: true, hasBudget: true });
    assert.equal(full.title, "Kreta czy Rodos? Porównanie: pogoda, budżet i dolot");
    assert.match(full.description, /pogoda w sezonie, orientacyjny budżet na 4 dni/);
  });

  it("strona kierunku w miesiącu, dla każdego miesiąca", () => {
    for (const month of polishMonthSlugs) {
      assertNoYearNoAmount(`miesiąc ${month}`, monthPageText({ name: "Malaga", month, tempC: 23 }));
    }
    assert.equal(
      monthPageText({ name: "Malaga", month: "wrzesien", tempC: 27 }).title,
      "Malaga we wrześniu: pogoda 27°C, hotele i kiedy lecieć",
    );
  });

  it("strona miesiąca bez temperatury nie sugeruje danych pogodowych", () => {
    const text = monthPageText({ name: "Miami", month: "grudzien", tempC: null });
    assert.equal(text.title, "Miami w grudniu: hotele i kiedy lecieć");
    assert.equal(
      text.description,
      "Miami w grudniu: hotele z cenami w PLN i loty na ten termin. Sprawdź dostępność w wyszukiwarce.",
    );
    assert.equal(text.ogTitle, "Miami w grudniu — hotele i loty");
    assert.equal(text.headline, "Miami w grudniu — hotele i kiedy lecieć");
    assert.doesNotMatch(JSON.stringify(text), /°C/);
  });

  it("hotele w mieście, dla każdego miasta", () => {
    for (const city of commercialCities) {
      assertNoYearNoAmount(city.slug, cityHotelsPageText({ city }));
    }
  });

  it("ranking sezonu: biernik po przyimku na i bez roku", () => {
    for (const season of seasonSlugs) {
      assert.doesNotMatch(seasonPageHeading(season), YEAR);
    }
    assert.match(seasonPageHeading("zima"), /^Najlepsze kierunki na zimę /);
    assert.match(seasonPageHeading("wiosna"), /^Najlepsze kierunki na wiosnę /);
  });

  it("porównania, także z ręcznie wpisanym tytułem", () => {
    for (const pair of comparisonPairs) {
      assertNoYearNoAmount(pair.slug, comparisonPageText({ pair, nameA: "Malaga", nameB: "Walencja" }));
    }
  });

  it("kwota pojawia się tylko ze zweryfikowanej, świeżej ceny", () => {
    const now = Date.UTC(2026, 8, 13, 10, 0, 0);
    const price = verifyTitlePrice({ amountPln: 312, pricedAt: now - 3_600_000, startIso: "2026-10-09" }, now);
    assert.ok(price);

    assert.equal(
      monthPageText({ name: "Malaga", month: "pazdziernik", tempC: 23, price }).title,
      "Malaga w październiku: pogoda 23°C, hotele od 312 zł/noc",
    );
    assert.match(guidePageText({ cityPl: "Malaga", flightHours: 4.1, tripLength: "4-5 dni", price }).title, /hotele od 312 zł\/noc/);
    assert.match(cityHotelsPageText({ city: commercialCities[0], price }).title, /od 312 zł\/noc/);
  });
});
