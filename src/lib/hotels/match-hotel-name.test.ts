// Bramka „czy to na pewno TEN hotel". Próbki to REALNE pary zmierzone sondą
// 2026-08-02: nazwa z Google Places (`/data/places`) kontra nazwa pierwszego
// hotelu z `/data/hotels?placeId=…`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isSameHotel, nameOverlap, nameTokens, pickMatchingHotel } from "./match-hotel-name";

test("różnica w diakrytykach nie ma znaczenia", () => {
  // Google: „Hotel Larios Malaga" · LiteAPI: „Hotel Larios Málaga"
  assert.equal(isSameHotel("Hotel Larios Malaga", "Hotel Larios Málaga"), true);
});

test("ta sama nazwa w pełnym brzmieniu przechodzi", () => {
  assert.equal(
    isSameHotel(
      "Hotel Bristol, a Luxury Collection Hotel, Warsaw",
      "Hotel Bristol, a Luxury Collection Hotel, Warsaw",
    ),
    true,
  );
  assert.equal(
    isSameHotel("Courtyard by Marriott Warsaw Airport", "Courtyard by Marriott Warsaw Airport"),
    true,
  );
});

test("dłuższa nazwa u dostawcy nie psuje trafienia", () => {
  // To jest najczęstszy realny kształt różnicy między Google a LiteAPI.
  assert.equal(isSameHotel("Chopin Boutique", "Chopin Boutique Hotel Warsaw"), true);
});

test("PODMIANA OBIEKTU jest odrzucana — to jest powód istnienia tej funkcji", () => {
  // Google na „Burj Al Arab" zwrócił PLAŻĘ o tej nazwie, a pierwszym hotelem
  // przy niej wyszedł zupełnie inny obiekt.
  assert.equal(isSameHotel("BURJ AL ARAB BEACH", "Jumeirah Marsa Al Arab Dubai"), false);
  assert.ok(nameOverlap("BURJ AL ARAB BEACH", "Jumeirah Marsa Al Arab Dubai") < 0.7);
});

test("wspólne słowo ogólne to nie jest podobieństwo", () => {
  assert.equal(isSameHotel("Hotel Bristol", "Hotel Splendide Royal"), false);
  assert.equal(isSameHotel("Boutique Hotel", "Boutique Apartments"), false);
});

test("tokeny odsiewają słowa bez tożsamości", () => {
  assert.deepEqual([...nameTokens("The Grand Hotel de la Paix")], ["grand", "paix"]);
  // Sama nazwa ogólna nie zostawia żadnego tokenu — a zbiór pusty nigdy nie
  // może dać trafienia (inaczej „Hotel" pasowałby do wszystkiego).
  assert.equal(nameTokens("Hotel").size, 0);
  assert.equal(nameOverlap("Hotel", "Hotel Bristol"), 0);
});

test("wybór z listy bierze najlepszego, nie pierwszego", () => {
  const lista = [
    { id: "lp1", name: "Sava Boutique Hotel" },
    { id: "lp2", name: "Chopin Boutique" },
    { id: "lp3", name: "SleepWell Boutique Apartments" },
  ];
  assert.equal(pickMatchingHotel("Chopin Boutique", lista)?.id, "lp2");
});

test("brak wystarczająco dobrego kandydata zwraca null, a nie „prawie ten”", () => {
  const lista = [
    { id: "lp1", name: "Jumeirah Marsa Al Arab Dubai" },
    { id: "lp2", name: "Beach Walk Hotel" },
  ];
  assert.equal(pickMatchingHotel("BURJ AL ARAB BEACH", lista), null);
  assert.equal(pickMatchingHotel("Cokolwiek", []), null);
});
