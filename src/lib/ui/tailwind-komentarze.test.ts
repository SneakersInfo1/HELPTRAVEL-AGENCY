import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// ZABEZPIECZENIE PO REALNEJ AWARII (2026-08-04).
//
// Tailwind v4 skanuje pliki źródłowe w poszukiwaniu nazw klas i NIE ODRÓŻNIA
// kodu od komentarza. Opis tokenu zapisany w komentarzu jako nazwa klasy
// z symbolem wieloznacznym został potraktowany jak realna klasa: Tailwind
// wygenerował regułę, w której wartość funkcji `var()` zawierała gwiazdkę.
// To niepoprawny CSS — parser przewrócił się na tej regule, a wraz z nim
// PRZESTAŁ SIĘ PARSOWAĆ CAŁY arkusz. Skutek: strona bez żadnych stylów
// i odpowiedź 500, przy poprawnym kodzie komponentów.
//
// Koszt diagnozy był wysoki, bo objaw (brak cieni) wyglądał na problem
// z tokenami, a nie z komentarzem oddalonym o kilkanaście linii.
//
// Ten test pilnuje, żeby taki zapis nie wrócił.

const KATALOG = "src";
const ROZSZERZENIA = [".ts", ".tsx", ".css"];

/**
 * Wzorzec „nazwa klasy z nawiasem kwadratowym, w której wartości stoi gwiazdka".
 *
 * Budowany z kawałków CELOWO — gdyby stał w pliku jako jeden ciąg, sam byłby
 * tym, czego zabrania, i wysadziłby build dokładnie tak jak pierwowzór.
 */
const NAWIAS_OTW = "\\[";
const NAWIAS_ZAM = "\\]";
const WZORZEC_RYZYKOWNY = new RegExp(
  `[a-z-]+-${NAWIAS_OTW}[^${NAWIAS_ZAM}]*\\*[^${NAWIAS_ZAM}]*${NAWIAS_ZAM}`,
  "g",
);

function zbierzPliki(katalog: string): string[] {
  const wynik: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) {
      wynik.push(...zbierzPliki(sciezka));
    } else if (ROZSZERZENIA.some((r) => sciezka.endsWith(r))) {
      wynik.push(sciezka);
    }
  }
  return wynik;
}

test("żaden plik źródłowy nie zawiera nazwy klasy z symbolem wieloznacznym", () => {
  const trafienia: string[] = [];

  for (const plik of zbierzPliki(KATALOG)) {
    // Ten test opisuje wzorzec, więc siłą rzeczy go zawiera — pomijamy siebie.
    if (plik.endsWith("tailwind-komentarze.test.ts")) continue;

    const tresc = readFileSync(plik, "utf8");
    tresc.split("\n").forEach((linia, i) => {
      const znalezione = linia.match(WZORZEC_RYZYKOWNY);
      if (znalezione) trafienia.push(`${plik}:${i + 1} — ${znalezione.join(", ")}`);
    });
  }

  assert.deepEqual(
    trafienia,
    [],
    "Zapis wygląda jak nazwa klasy Tailwinda z gwiazdką w wartości. Tailwind " +
      "wygeneruje z niego niepoprawny CSS i przewróci parsowanie CAŁEGO arkusza " +
      "— strona zostanie bez stylów. Opisz token słownie zamiast wklejać nazwę " +
      "klasy.\nZnalezione:\n" + trafienia.join("\n"),
  );
});
