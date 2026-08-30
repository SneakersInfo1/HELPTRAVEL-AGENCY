// STRAŻ NAD LOGAMI ŚCIEŻKI LOTNICZEJ.
//
// Test statyczny: czyta źródła i pilnuje, żeby do `console.*` nie trafiła
// wartość, której nie wolno zapisać w logach Vercela.
//
// ── PO CO TO ISTNIEJE ────────────────────────────────────────────────────────
//
// Logi z tej ścieżki są jedynym narzędziem diagnostycznym przy incydencie
// płatniczym, więc jest naturalna pokusa, żeby „na chwilę" dorzucić do nich
// więcej kontekstu. Ta chwila zostaje na produkcji. Zapis `secretKey` albo
// `transactionId` w logu to poświadczenie płatności w systemie, który nie jest
// do tego przeznaczony i którego retencji nie kontrolujemy.
//
// Test jest CELOWO gruby: patrzy na tekst źródła, nie na typy. Fałszywy alarm
// naprawia się przez zmianę nazwy zmiennej albo świadome zamaskowanie wartości
// — jedno i drugie jest lepsze niż cichy wyciek.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const KATALOGI = [
  "src/lib/flights",
  "src/app/api/flights",
  "src/app/api/liteapi/flights-webhook",
  "src/app/loty",
];

/**
 * Nazwy, których wartości NIE WOLNO wstawić do logu.
 *
 * `documentNumberMasked` jest dozwolone (już zamaskowane), więc wzorzec dla
 * dokumentu wyklucza wariant z sufiksem. `paymentIntentId` też jest dozwolone
 * — to identyfikator, nie sekret, i bez niego incydent płatniczy jest nie do
 * odtworzenia.
 */
const ZAKAZANE: Array<{ wzorzec: RegExp; opis: string }> = [
  { wzorzec: /\bsecretKey\b/, opis: "secretKey (Stripe client secret)" },
  { wzorzec: /_secret_/, opis: "client secret" },
  { wzorzec: /\btransactionId\b/, opis: "transactionId (uchwyt płatności)" },
  { wzorzec: /\bdocumentNumber\b(?!Masked)/, opis: "numer dokumentu" },
  { wzorzec: /\b(firstName|lastName)\b/, opis: "imię/nazwisko" },
  { wzorzec: /\bphoneNumber\b/, opis: "telefon" },
  { wzorzec: /\bbirthday\b/, opis: "data urodzenia" },
  { wzorzec: /\b(apiKey|API_KEY|privateKey|publicKey)\b/, opis: "klucz API" },
  { wzorzec: /\b(cardNumber|cvv|cvc)\b/, opis: "dane karty" },
  { wzorzec: /\b(passengerData|passengers)\b/, opis: "komplet danych pasażerów" },
  { wzorzec: /\bcontactData\b/, opis: "komplet danych kontaktowych" },
];

function pliki(dir: string): string[] {
  const out: string[] = [];
  let wpisy: string[];
  try {
    wpisy = readdirSync(dir);
  } catch {
    return out;
  }
  for (const w of wpisy) {
    const pelna = join(dir, w);
    if (statSync(pelna).isDirectory()) out.push(...pliki(pelna));
    else if (/\.(ts|tsx)$/.test(w) && !/\.test\.tsx?$/.test(w)) out.push(pelna);
  }
  return out;
}

/** Wyciąga treść wyrażeń `${…}` z wywołań `console.*` w danym źródle. */
function interpolacjeWLogach(src: string): Array<{ linia: number; wyrazenie: string }> {
  const out: Array<{ linia: number; wyrazenie: string }> = [];
  const linie = src.split("\n");
  let wKonsoli = false;
  let nawiasy = 0;
  for (let i = 0; i < linie.length; i++) {
    const l = linie[i]!;
    if (!wKonsoli && /console\.(log|warn|error|info|debug)\s*\(/.test(l)) {
      wKonsoli = true;
      nawiasy = 0;
    }
    if (!wKonsoli) continue;
    for (const m of l.matchAll(/\$\{([^}]*)\}/g)) {
      out.push({ linia: i + 1, wyrazenie: m[1] ?? "" });
    }
    for (const ch of l) {
      if (ch === "(") nawiasy += 1;
      else if (ch === ")") nawiasy -= 1;
    }
    if (nawiasy <= 0) wKonsoli = false;
  }
  return out;
}

test("żaden log lotów nie wstawia sekretu ani PII", () => {
  const naruszenia: string[] = [];
  for (const dir of KATALOGI) {
    for (const plik of pliki(dir)) {
      const src = readFileSync(plik, "utf8");
      for (const { linia, wyrazenie } of interpolacjeWLogach(src)) {
        for (const { wzorzec, opis } of ZAKAZANE) {
          if (wzorzec.test(wyrazenie)) {
            naruszenia.push(`${plik}:${linia} — ${opis} w \`\${${wyrazenie}}\``);
          }
        }
      }
    }
  }
  assert.deepEqual(naruszenia, [], `logi zawierają wartości, których nie wolno zapisywać:\n${naruszenia.join("\n")}`);
});

test("straż faktycznie łapie wyciek (test testu)", () => {
  // Bez tego cała powyższa suita mogłaby przechodzić dlatego, że parser nic
  // nie znajduje — a nie dlatego, że kod jest czysty.
  const zly = 'console.warn(`[flights] sid=${sessionId} klucz=${pre.secretKey}`);';
  const trafienia = interpolacjeWLogach(zly);
  assert.equal(trafienia.length, 2);
  assert.equal(
    trafienia.some((t) => ZAKAZANE.some((z) => z.wzorzec.test(t.wyrazenie))),
    true,
  );
});

test("straż przepuszcza to, co MA być w logu", () => {
  const dobry =
    "console.warn(`[flights][prebook] ${e.code} sid=${sessionId} liteApiStatus=${e.liteApiStatus} pi=${session.paymentIntentId} doc=${p.documentNumberMasked}`);";
  const trafienia = interpolacjeWLogach(dobry);
  assert.equal(trafienia.length, 5);
  for (const t of trafienia) {
    for (const z of ZAKAZANE) {
      assert.equal(z.wzorzec.test(t.wyrazenie), false, `fałszywy alarm na \`${t.wyrazenie}\` (${z.opis})`);
    }
  }
});
