// Kontrakt treści sekcji ofertowych.
//
// Ten plik istnieje dla WARIANTÓW, nie dla obecnego copy. Wariant testu A/B,
// który przepełnia przycisk albo rozbija nagłówek na cztery linie na 375 px,
// przegra z powodu układu, a nie treści — i wniosek z takiego testu będzie
// fałszywy. Limity są więc sprawdzane mechanicznie, a nie „na oko przy
// wdrożeniu".

import { test } from "node:test";
import assert from "node:assert/strict";

import { COPY_LIMITS, COPY_VARIANT, HOME_COPY, type SectionCopy } from "./copy";

const SEKCJE = Object.entries(HOME_COPY) as Array<[string, SectionCopy]>;

test("każda sekcja ma nagłówek — niepusty i bez zbędnych spacji", () => {
  for (const [nazwa, copy] of SEKCJE) {
    assert.ok(copy.heading.length > 0, `${nazwa}: pusty nagłówek`);
    assert.equal(copy.heading, copy.heading.trim(), `${nazwa}: nagłówek ze spacją na brzegu`);
  }
});

test("limity długości: nagłówek, zdanie pod nim, etykieta przycisku", () => {
  for (const [nazwa, copy] of SEKCJE) {
    assert.ok(
      copy.heading.length <= COPY_LIMITS.heading,
      `${nazwa}: nagłówek ${copy.heading.length} zn. > ${COPY_LIMITS.heading} — złamie się na 375 px`,
    );
    if (copy.subheading !== undefined) {
      assert.ok(
        copy.subheading.length <= COPY_LIMITS.subheading,
        `${nazwa}: zdanie ${copy.subheading.length} zn. > ${COPY_LIMITS.subheading}`,
      );
    }
    if (copy.cta !== undefined) {
      assert.ok(copy.cta.length > 0, `${nazwa}: pusta etykieta przycisku`);
      assert.ok(
        copy.cta.length <= COPY_LIMITS.cta,
        `${nazwa}: etykieta ${copy.cta.length} zn. > ${COPY_LIMITS.cta} — nie zmieści się w przycisku`,
      );
    }
  }
});

test("polska typografia: półpauza i „cudzysłowy”, nigdy dywiz jako myślnik", () => {
  for (const [nazwa, copy] of SEKCJE) {
    for (const [pole, tekst] of Object.entries(copy)) {
      // Dywiz otoczony spacjami to myślnik zapisany błędnie — w polskim
      // składzie wtrącenie bierze półpauzę (–), nie „-”.
      assert.ok(!/ - /.test(tekst), `${nazwa}.${pole}: dywiz zamiast półpauzy`);
      assert.ok(!/["']/.test(tekst), `${nazwa}.${pole}: proste cudzysłowy zamiast „ ”`);
    }
  }
});

test("wariant treści jest zadeklarowany — bez niego pomiaru nie da się rozdzielić", () => {
  assert.ok(COPY_VARIANT.length > 0);
  // Trafia do GA4 jako wartość parametru — bez spacji, żeby dało się nim
  // filtrować i segmentować bez cudzysłowów w każdym zapytaniu.
  assert.match(COPY_VARIANT, /^[a-z0-9_-]+$/);
});

test("CTA nie jest etykietą nawigacyjną", () => {
  // „Więcej", „Zobacz", „Kliknij tutaj" nie mówią, co się stanie po kliknięciu.
  // Karta pakietu miała kiedyś „Zobacz →" i to była dokładnie ta pułapka.
  const PUSTE = ["więcej", "zobacz", "kliknij", "kliknij tutaj", "dalej", "sprawdź"];
  for (const [nazwa, copy] of SEKCJE) {
    if (!copy.cta) continue;
    assert.ok(
      !PUSTE.includes(copy.cta.trim().toLowerCase()),
      `${nazwa}: „${copy.cta}" nie mówi, co się stanie po kliknięciu`,
    );
  }
});
