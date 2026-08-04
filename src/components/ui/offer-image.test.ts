import assert from "node:assert/strict";
import { test } from "node:test";

import { wybierzTloZastepnika } from "./offer-image-fallback";

// Zgłoszenie właściciela 2026-08-04: „w ciągu dnia pojawiały się oferty, przy
// których zdjęcie się nie ładowało". Audyt: 29 z 33 miejsc renderujących
// zdjęcia nie miało obsługi błędu.
//
// Sam render z `onError` jest kodem klienckim Reacta i nie da się go uruchomić
// w `node:test` bez DOM-u. Testowalna — i najbardziej podatna na regresję —
// jest reguła DOBORU zastępnika, bo właściciel postawił konkretny warunek:
// „fallback ma być deterministyczny i powiązany z kierunkiem, nie jedno
// przypadkowe zdjęcie do wszystkiego".

test("ten sam kierunek zawsze dostaje ten sam zastępnik", () => {
  const a = wybierzTloZastepnika("athens-greece");
  const b = wybierzTloZastepnika("athens-greece");
  assert.equal(a, b, "niedeterminizm powodowałby miganie kafla przy każdym renderze");
});

test("różne kierunki dostają różne zastępniki", () => {
  // Nie żądamy pełnej różnorodności (paleta jest skończona), tylko tego, żeby
  // funkcja realnie różnicowała — jedna wartość dla wszystkiego oznaczałaby
  // „jeden przypadkowy kafel do wszystkiego", czego właściciel zabronił.
  const kierunki = [
    "athens-greece",
    "catania-italy",
    "malaga-spain",
    "split-croatia",
    "dubrovnik-croatia",
    "larnaca-cyprus",
    "corfu-greece",
    "oslo-norway",
    "london-united-kingdom",
    "stockholm-sweden",
  ];
  const unikalne = new Set(kierunki.map(wybierzTloZastepnika));
  assert.ok(unikalne.size >= 3, `oczekiwano zróżnicowania, dostano ${unikalne.size} wariant(y)`);
});

test("pusty klucz nie wywraca doboru", () => {
  // Wpis zapisany przez starszą wersję crona może nie mieć identyfikatora.
  // Zastępnik ma się wtedy wyrenderować, a nie rzucić.
  assert.equal(typeof wybierzTloZastepnika(""), "string");
  assert.ok(wybierzTloZastepnika("").length > 0);
});

test("zwracana wartość jest klasą z palety marki", () => {
  // Zastępnik nie może wprowadzać koloru spoza systemu — to jedyne miejsce,
  // gdzie kolor powstaje z hasza, więc łatwo tu wpuścić losowy odcień.
  for (const klucz of ["a", "bb", "ccc", "athens-greece", "oslo-norway"]) {
    assert.match(
      wybierzTloZastepnika(klucz),
      /^bg-(brand-soft|surface-sunken|emerald-\d{2,3}|teal-\d{2,3}|lime-\d{2,3})$/,
      `nieoczekiwana klasa tła: ${wybierzTloZastepnika(klucz)}`,
    );
  }
});
