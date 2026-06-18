// FAZA 2 — testy filtra sprzeczności facility. Przypadki sprzeczności wzięte
// z realnych danych LiteAPI/Cupid (accessibility shuttle / train station
// shuttle), które właściciel zgłosił jako widoczne na stronie.

import assert from "node:assert/strict";
import { test } from "node:test";

import { isNegativeFacility, sanitizeFacilities } from "./sanitize-facilities";

test("para X / No X — zostaje tylko pozytyw (accessible shuttle)", () => {
  assert.deepEqual(
    sanitizeFacilities(["Accessible shuttle", "No accessible shuttle"]),
    ["Accessible shuttle"],
  );
});

test("para X / No X — zostaje tylko pozytyw (train station shuttle)", () => {
  assert.deepEqual(
    sanitizeFacilities([
      "Accessible train station shuttle",
      "No accessible train station shuttle",
    ]),
    ["Accessible train station shuttle"],
  );
});

test("samotny negatyw jest usuwany (No elevators)", () => {
  assert.deepEqual(sanitizeFacilities(["No elevators"]), []);
});

test("kolejność nie ma znaczenia — negatyw przed pozytywem", () => {
  assert.deepEqual(
    sanitizeFacilities(["No accessible parking", "Accessible parking"]),
    ["Accessible parking"],
  );
});

test("dedup prawie-identycznych (WiFi: case/spacja/myślnik)", () => {
  assert.deepEqual(
    sanitizeFacilities(["Free WiFi", "Free Wi-Fi", "free wifi"]),
    ["Free WiFi"],
  );
});

test("zachowuje pozytywne 'No ...' (gwarancje bez opłat)", () => {
  assert.deepEqual(sanitizeFacilities(["No deposit required"]), ["No deposit required"]);
  assert.deepEqual(sanitizeFacilities(["No booking fees"]), ["No booking fees"]);
});

test("usuwa puste i nonsensowne, zostawia realne", () => {
  assert.deepEqual(sanitizeFacilities(["", "   ", "--", "Parking"]), ["Parking"]);
});

test("isNegativeFacility: 'Non-smoking' nie jest negatywem", () => {
  assert.equal(isNegativeFacility("Non-smoking rooms"), false);
  assert.equal(isNegativeFacility("No accessible parking"), true);
  assert.equal(isNegativeFacility("No deposit required"), false);
});
