import assert from "node:assert/strict";
import test from "node:test";

import { buildStaticMapUrl } from "./static-map-url";

const WEJSCIE = { lat: 36.2, lng: 28.0, w: 600, h: 352, zoom: 11 };

test("kolor znacznika idzie na drut jako %23, nigdy %2523", () => {
  const url = buildStaticMapUrl(WEJSCIE);
  // To JEST ten błąd: podwójne kodowanie dawało Geoapify 400, a nam 502.
  assert.ok(!url.includes("%2523"), `podwójnie zakodowany hash w: ${url}`);
  assert.ok(url.includes("color%3A%23047857"), `brak poprawnie zakodowanego koloru w: ${url}`);
});

test("dekodowany parametr marker ma dokładnie taki kształt, jakiego chce dostawca", () => {
  const marker = new URL(buildStaticMapUrl(WEJSCIE)).searchParams.get("marker");
  assert.equal(marker, "lonlat:28,36.2;type:material;color:#047857;size:medium");
});

test("środek i rozmiar trafiają do adresu bez zniekształceń", () => {
  const sp = new URL(buildStaticMapUrl({ lat: -33.85, lng: 151.21, w: 480, h: 270, zoom: 9 })).searchParams;
  assert.equal(sp.get("center"), "lonlat:151.21,-33.85");
  assert.equal(sp.get("width"), "480");
  assert.equal(sp.get("height"), "270");
  assert.equal(sp.get("zoom"), "9");
});

test("adres nie zawiera klucza — ten dokłada dopiero trasa", () => {
  const url = buildStaticMapUrl(WEJSCIE);
  assert.ok(!url.includes("apiKey"), "klucz nie ma prawa wejść do czystej funkcji");
});
