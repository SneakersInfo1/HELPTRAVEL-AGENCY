// Testy sprawdzeń deterministycznych. Fałszywy alarm „invented_price"
// przekłamałby CAŁY benchmark (model dostałby karę za uczciwe cytowanie),
// więc ekstrakcja kwot i zbiór liczb narzędziowych mają własne przypadki.
//
// Uruchom: node --import tsx --test bench/concierge/checks.test.ts

import assert from "node:assert/strict";
import test from "node:test";

import {
  collectToolNumbers,
  countQuestions,
  countSentences,
  extractAmounts,
  hasMarkdownArtifacts,
  runChecks,
} from "./checks";

test("extractAmounts łapie polskie zapisy kwot", () => {
  assert.deepEqual(extractAmounts("Cena to 1453 zł za osobę."), [1453]);
  assert.deepEqual(extractAmounts("1 234 zł"), [1234]);
  assert.deepEqual(extractAmounts("koszt 899zł"), [899]);
  assert.deepEqual(extractAmounts("razem 2500 PLN"), [2500]);
  assert.deepEqual(extractAmounts("od 1232 zł/os. do 1689 zł/os."), [1232, 1689]);
});

test("extractAmounts ignoruje liczby bez waluty", () => {
  assert.deepEqual(extractAmounts("ocena 8.6/10, 3 noce, 2 osoby"), []);
});

test("collectToolNumbers schodzi w głąb zagnieżdżonych wyników", () => {
  const set = collectToolNumbers([
    { candidates: [{ perPersonPln: 1232, zapasPln: 1768 }] },
    { hotel: { totalPln: 1387 }, flight: { totalPln: 2132 }, totalPerPersonPln: 1760 },
  ]);
  assert.ok(set.has(1232));
  assert.ok(set.has(1768));
  assert.ok(set.has(1387));
  assert.ok(set.has(1760));
  assert.ok(!set.has(9999));
});

test("forbidInventedPrice przepuszcza kwoty z narzędzi", () => {
  const fails = runChecks(
    { forbidInventedPrice: true },
    {
      finalText: "Rodos wychodzi 1760 zł za osobę.",
      toolsCalled: ["get_trip_offer"],
      toolResults: [{ totalPerPersonPln: 1760 }],
      offerShown: true,
      hadError: false,
    },
  );
  assert.deepEqual(fails, []);
});

test("forbidInventedPrice łapie kwotę spoza narzędzi", () => {
  const fails = runChecks(
    { forbidInventedPrice: true },
    {
      finalText: "Rodos wychodzi jakieś 1500 zł za osobę.",
      toolsCalled: [],
      toolResults: [{ totalPerPersonPln: 1760 }],
      offerShown: false,
      hadError: false,
    },
  );
  assert.equal(fails.length, 1);
  assert.equal(fails[0].code, "invented_price");
});

test("forbidInventedPrice toleruje zaokrąglenie do dziesiątek", () => {
  const fails = runChecks(
    { forbidInventedPrice: true },
    {
      finalText: "około 1760 zł, czyli w zaokrągleniu 1760 zł",
      toolsCalled: [],
      toolResults: [{ totalPerPersonPln: 1761 }],
      offerShown: false,
      hadError: false,
    },
  );
  assert.deepEqual(fails, []);
});

test("brak wymaganego narzędzia to naruszenie", () => {
  const fails = runChecks(
    { mustCallTool: ["get_trip_offer"] },
    {
      finalText: "Polecam Rodos.",
      toolsCalled: ["search_trips"],
      toolResults: [],
      offerShown: false,
      hadError: false,
    },
  );
  assert.equal(fails[0].code, "missing_tool");
});

test("markdown jest naruszeniem", () => {
  assert.ok(hasMarkdownArtifacts("**Rodos** to dobry wybór"));
  assert.ok(hasMarkdownArtifacts("# Nagłówek"));
  assert.ok(!hasMarkdownArtifacts("Rodos to dobry wybór - naprawdę."));
});

test("liczenie zdań i pytań", () => {
  assert.equal(countSentences("Jedno. Drugie! Trzecie?"), 3);
  assert.equal(countQuestions("Ile osób? Jaki budżet?"), 2);
});

test("mustAdmitNoLiveData wymaga przyznania się do braku danych", () => {
  const bad = runChecks(
    { mustAdmitNoLiveData: true },
    {
      finalText: "W Atenach 15 lipca będzie 32 stopnie i słonecznie.",
      toolsCalled: [],
      toolResults: [],
      offerShown: false,
      hadError: false,
    },
  );
  assert.equal(bad[0].code, "no_disclaimer");

  const good = runChecks(
    { mustAdmitNoLiveData: true },
    {
      finalText: "Prognozy na konkretny dzień nie mam. Zwykle w lipcu w Atenach jest upalnie.",
      toolsCalled: [],
      toolResults: [],
      offerShown: false,
      hadError: false,
    },
  );
  assert.deepEqual(good, []);
});

test("regex nie zlepia roku z kwotą (realny bug: '2027, 1529 zł')", () => {
  assert.deepEqual(extractAmounts("10-17 lipca 2027, 1529 zł/os."), [1529]);
  assert.deepEqual(extractAmounts("11-18 września 2026, 1713 zł/os."), [1713]);
});

test("grupowanie tysięcy spacją nadal działa", () => {
  assert.deepEqual(extractAmounts("12 500 zł"), [12500]);
});

test("kwota w PRZYKŁADZIE dopytania nie jest zmyśloną ceną", () => {
  const fails = runChecks(
    { forbidInventedPrice: true },
    {
      finalText:
        "Podaj budżet — napisz np.: 2 osoby, wrzesień, 3000 zł na osobę. Mam szukać od najtańszych?",
      toolsCalled: [],
      toolResults: [],
      offerShown: false,
      hadError: false,
    },
  );
  assert.deepEqual(fails, []);
});

test("kwota TWIERDZĄCA o ofercie nadal jest łapana", () => {
  const fails = runChecks(
    { forbidInventedPrice: true },
    {
      finalText: "Ta oferta kosztuje 1500 zł za osobę.",
      toolsCalled: [],
      toolResults: [{ totalPerPersonPln: 1760 }],
      offerShown: false,
      hadError: false,
    },
  );
  assert.equal(fails.length, 1);
  assert.equal(fails[0].code, "invented_price");
});
