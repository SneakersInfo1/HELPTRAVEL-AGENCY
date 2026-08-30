// Testy KONTRAKTU NAZW z dostawcą lotów.
//
// Kontrakt zmierzony empirycznie na produkcyjnym kluczu (sonda różnicowa
// `probe:flight-name-gate`, 2026-08-30): prebook z imieniem/nazwiskiem
// krótszym niż 3 znaki wraca jako HTTP 500 z ciałem
//   {"error":{"code":53099,"description":"Contact name is too short — must be
//    at least 3 characters; Passenger 1 name is too short — must be at least
//    3 characters"}}
//
// To jest walidacja DETERMINISTYCZNA: ten sam payload zawsze da ten sam błąd.
// Testy tutaj pilnują trzech rzeczy naraz:
//   1. że rozpoznajemy ten kształt (i NIE bierzemy go za awarię dostawcy),
//   2. że umiemy wskazać, KTÓREGO pola dotyczy,
//   3. że opis od dostawcy trafia do logu OCZYSZCZONY (bez PII, bez sekretów).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NAME_TOO_SHORT_FIRST,
  NAME_TOO_SHORT_GENERIC,
  NAME_TOO_SHORT_HELP,
  NAME_TOO_SHORT_LAST,
  PROVIDER_MIN_NAME_CHARS,
  formFieldKey,
  isDeterministicProviderValidation,
  isProviderNameTooShort,
  isNameLongEnough,
  nameLength,
  nameTooShortIssues,
  sanitizeProviderDescription,
} from "./name-policy";

// ── Reguła długości ──────────────────────────────────────────────────────────

test("próg dostawcy to 3 znaki", () => {
  assert.equal(PROVIDER_MIN_NAME_CHARS, 3);
});

test("imię o 1 i 2 znakach nie przechodzi, o 3 przechodzi", () => {
  assert.equal(isNameLongEnough("J"), false);
  assert.equal(isNameLongEnough("Ja"), false);
  assert.equal(isNameLongEnough("Jan"), true);
});

test("liczy się długość PO trim — spacje nie są znakami imienia", () => {
  assert.equal(isNameLongEnough("  Ja  "), false);
  assert.equal(isNameLongEnough("Li "), false);
  assert.equal(isNameLongEnough(" Jan "), true);
  assert.equal(isNameLongEnough("   "), false);
  assert.equal(isNameLongEnough(""), false);
});

test("polskie znaki to jeden znak, nie dwa", () => {
  // „Żak” ma 3 znaki. Gdyby liczyć bajty albo formę rozłożoną (NFD), wyszłoby
  // 4 i nazwisko przeszłoby próg, którego dostawca mu nie policzy.
  assert.equal(nameLength("Żak"), 3);
  assert.equal(isNameLongEnough("Łoś"), true);
  // Forma ROZŁOŻONA (NFD) — tak wpisuje część klawiatur i tak przychodzi tekst
  // wklejony z niektórych źródeł. „Zo” + łączący akcent to nadal DWA znaki dla
  // człowieka i dla dostawcy; bez normalizacji policzylibyśmy trzy i wpuścili
  // payload, który dostawca odrzuci.
  const nfd = "Zó"; // Z + o + łączący akcent = 3 jednostki, 2 znaki
  assert.equal(nfd.length, 3, "test nie konstruuje formy NFD");
  assert.equal(nameLength(nfd), 2);
  assert.equal(isNameLongEnough(nfd), false);
  assert.equal(isNameLongEnough(nfd + "e"), true);
});

test("dwuznakowe nazwisko zostaje dwuznakowe — reguła NICZEGO nie dopisuje", () => {
  // Punkt 3 zlecenia: nigdy nie „naprawiamy” prawdziwych nazwisk. Ten test
  // istnieje po to, żeby ewentualny „pomocny” normalizator (dopisanie spacji,
  // dublowanie liter) wywalił suitę.
  for (const legalne of ["Li", "Ng", "Ho"]) {
    assert.equal(isNameLongEnough(legalne), false);
    assert.equal(nameLength(legalne), 2, `nameLength zmienił „${legalne}”`);
  }
});

test("komunikaty są po polsku, per pole, bez kodu dostawcy", () => {
  assert.equal(NAME_TOO_SHORT_FIRST, "Imię musi mieć co najmniej 3 znaki.");
  assert.equal(NAME_TOO_SHORT_LAST, "Nazwisko musi mieć co najmniej 3 znaki.");
  assert.equal(NAME_TOO_SHORT_GENERIC, "Imię i nazwisko muszą mieć co najmniej 3 znaki.");
  for (const tekst of [NAME_TOO_SHORT_FIRST, NAME_TOO_SHORT_LAST, NAME_TOO_SHORT_HELP, NAME_TOO_SHORT_GENERIC]) {
    assert.equal(/53099/.test(tekst), false, "komunikat zdradza kod dostawcy");
    assert.equal(/liteapi/i.test(tekst), false, "komunikat zdradza nazwę dostawcy");
  }
  assert.match(NAME_TOO_SHORT_HELP, /skontaktuj się z HelpTravel/i);
});

// ── Rozpoznanie błędu dostawcy ───────────────────────────────────────────────

const BODY_53099 = {
  error: {
    code: 53099,
    description:
      "Contact name is too short — must be at least 3 characters; Passenger 1 name is too short — must be at least 3 characters",
  },
};

test("53099 to walidacja deterministyczna, nie awaria dostawcy", () => {
  assert.equal(isDeterministicProviderValidation(BODY_53099), true);
  assert.equal(isProviderNameTooShort(BODY_53099), true);
});

test("53099 z INNYM opisem nadal jest walidacją, ale NIE „za krótkie imię”", () => {
  // Ten sam kod dostawca zwraca też dla nazwisk wyglądających na testowe.
  // Wtedy komunikat „musi mieć 3 znaki” byłby po prostu nieprawdą.
  const inny = { error: { code: 53099, description: "Passenger name cannot contain numbers" } };
  assert.equal(isDeterministicProviderValidation(inny), true);
  assert.equal(isProviderNameTooShort(inny), false);
});

test("sam opis „name is too short” wystarczy, nawet gdy kod się zmieni", () => {
  const bezKodu = { error: { code: 59999, description: "Passenger 1 name is too short" } };
  assert.equal(isProviderNameTooShort(bezKodu), true);
  assert.equal(isDeterministicProviderValidation(bezKodu), true);
});

test("zwykła awaria 500 NIE jest walidacją — nie wolno zabrać jej retry", () => {
  assert.equal(isDeterministicProviderValidation({ error: { code: 50000, description: "Internal server error" } }), false);
  assert.equal(isDeterministicProviderValidation({ error: { code: 52099, description: "failed to verify flight offer" } }), false);
  assert.equal(isDeterministicProviderValidation("Bad Gateway"), false);
  assert.equal(isDeterministicProviderValidation(null), false);
  assert.equal(isDeterministicProviderValidation({}), false);
});

// ── Wskazanie pola ───────────────────────────────────────────────────────────

test("opis wskazuje pasażera 1 i kontakt → cztery pola do podświetlenia", () => {
  const issues = nameTooShortIssues(BODY_53099.error.description);
  const klucze = issues.map((i) => formFieldKey(i.path));
  assert.deepEqual(klucze, ["c.firstName", "c.lastName", "p0.firstName", "p0.lastName"]);
  assert.equal(issues.find((i) => formFieldKey(i.path) === "c.firstName")?.message, NAME_TOO_SHORT_FIRST);
  assert.equal(issues.find((i) => formFieldKey(i.path) === "p0.lastName")?.message, NAME_TOO_SHORT_LAST);
});

test("„Passenger 2” celuje w DRUGIEGO pasażera, nie w pierwszego", () => {
  // Punkt H zlecenia: przy dwóch dorosłych błąd musi wskazać właściwą osobę.
  const issues = nameTooShortIssues("Passenger 2 name is too short — must be at least 3 characters");
  assert.deepEqual(
    issues.map((i) => formFieldKey(i.path)),
    ["p1.firstName", "p1.lastName"],
  );
});

test("opis bez rozpoznawalnego celu nie zmyśla pola", () => {
  assert.deepEqual(nameTooShortIssues("name is too short"), []);
  assert.deepEqual(nameTooShortIssues(""), []);
});

test("klucz pola formularza z ścieżki issue", () => {
  assert.equal(formFieldKey(["passengers", 0, "firstName"]), "p0.firstName");
  assert.equal(formFieldKey(["passengers", 3, "lastName"]), "p3.lastName");
  assert.equal(formFieldKey(["contact", "email"]), "c.email");
  assert.equal(formFieldKey(["contact", "phoneNumber"]), "c.phoneNumber");
  assert.equal(formFieldKey(["offerId"]), null);
  assert.equal(formFieldKey([]), null);
});

// ── Sanityzacja opisu do logu ────────────────────────────────────────────────

test("opis do logu gubi wartości w cudzysłowie — tam dostawcy echują dane", () => {
  const czysty = sanitizeProviderDescription('Passenger name "Li" is too short for traveller "Kowalski"');
  assert.equal(czysty.includes("Li"), false);
  assert.equal(czysty.includes("Kowalski"), false);
  assert.match(czysty, /is too short/);
});

test("opis do logu gubi client secret Stripe’a", () => {
  const czysty = sanitizeProviderDescription("payment failed for pi_3UA9xyZ000001_secret_kLmNoPqRsTu");
  assert.equal(/secret_/.test(czysty), false);
  assert.equal(czysty.includes("kLmNoPqRsTu"), false);
});

test("opis do logu gubi e-mail i jest przycięty", () => {
  const czysty = sanitizeProviderDescription("rejected for jan.kowalski@example.com");
  assert.equal(czysty.includes("jan.kowalski@example.com"), false);
  assert.equal(sanitizeProviderDescription("x".repeat(1000)).length <= 300, true);
});

test("sanityzacja przyjmuje śmieci bez wywrotki", () => {
  assert.equal(sanitizeProviderDescription(undefined), "");
  assert.equal(sanitizeProviderDescription(null), "");
  assert.equal(sanitizeProviderDescription(12345), "");
});
