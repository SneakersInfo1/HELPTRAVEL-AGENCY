// Opis pokoju od dostawcy — przypadki bezpieczeństwa zapisane jako testy.
//
// Komponent renderuje `label` i `text` jako tekst Reacta. Te testy pilnują,
// żeby parser nie przekazał dalej znaczników ani fragmentów typowych dla XSS,
// także po dekodowaniu encji i dla uszkodzonego HTML.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRoomDescription, type RoomDescriptionPart } from "./room-description";

const NIEDOZWOLONE_FRAGMENTY = ["<", ">", "javascript:", "onerror", "onload", "script"];

function polaczTekst(parts: RoomDescriptionPart[]): string {
  return parts.map((part) => `${part.label ?? ""}${part.text}`).join(" ");
}

function parsujBezNiebezpiecznychFragmentow(raw: string | null | undefined): RoomDescriptionPart[] {
  const parts = parseRoomDescription(raw);
  const caly = polaczTekst(parts).toLowerCase();

  for (const fragment of NIEDOZWOLONE_FRAGMENTY) {
    assert.equal(caly.includes(fragment), false, `w treści został niedozwolony fragment „${fragment}": ${caly}`);
  }

  return parts;
}

test("opis pokoju: znacznik script nie wychodzi do tekstu", () => {
  const parts = parsujBezNiebezpiecznychFragmentow("<script>alert(1)</script>");
  assert.deepEqual(parts, [{ label: null, text: "alert(1)" }]);
});

test("opis pokoju: atrybut onerror obrazu nie wychodzi do tekstu", () => {
  assert.deepEqual(parsujBezNiebezpiecznychFragmentow("<img src=x onerror=alert(1)>"), []);
});

test("opis pokoju: adres javascript nie wychodzi do tekstu", () => {
  const parts = parsujBezNiebezpiecznychFragmentow('<a href="javascript:alert(1)">klik</a>');
  assert.deepEqual(parts, [{ label: null, text: "klik" }]);
});

test("opis pokoju: etykieta Internet i treść są rozdzielone dokładnie", () => {
  const parts = parsujBezNiebezpiecznychFragmentow("<p><b>Internet</b> - Bezplatne Wi-Fi</p>");
  assert.deepEqual(parts, [{ label: "Internet", text: "Bezplatne Wi-Fi" }]);
});

test("opis pokoju: uszkodzony HTML pozostaje zwykłym tekstem", () => {
  const wejscia = [
    "<p><b>Lozko<p>bez zamkniecia",
    "<<>>",
    '<p onclick="x">tekst</p>',
  ];

  for (const wejscie of wejscia) {
    parsujBezNiebezpiecznychFragmentow(wejscie);
  }
});

test("opis pokoju: encje są dekodowane bez odtworzenia znacznika", () => {
  const parts = parsujBezNiebezpiecznychFragmentow(
    "&amp; &lt; &gt; &quot; &#39; &nbsp; &ndash; &mdash;",
  );

  // Nawiasy z &lt; i &gt; są dekodowane przed usunięciem HTML-u, więc nie mogą
  // utworzyć znacznika; pozostałe encje zachowują swoje znaki tekstowe.
  assert.deepEqual(parts, [{ label: null, text: `& " ' – —` }]);
  assert.equal(/&(amp|lt|gt|quot|#39|nbsp|ndash|mdash);/i.test(polaczTekst(parts)), false);
});

test("opis pokoju: pusty i brakujący opis dają pustą tablicę", () => {
  assert.deepEqual(parsujBezNiebezpiecznychFragmentow(""), []);
  assert.deepEqual(parsujBezNiebezpiecznychFragmentow(null), []);
  assert.deepEqual(parsujBezNiebezpiecznychFragmentow(undefined), []);
});

test("opis pokoju: powtórzony akapit jest deduplikowany", () => {
  const parts = parsujBezNiebezpiecznychFragmentow("<p>Klimatyzacja</p><p>Klimatyzacja</p>");
  assert.deepEqual(parts, [{ label: null, text: "Klimatyzacja" }]);
});
