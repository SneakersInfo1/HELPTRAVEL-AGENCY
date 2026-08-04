import { strict as assert } from "node:assert";
import { test } from "node:test";

import cdnLoader from "./cdn-loader";

// Ten plik istnieje, bo loader zawiódł po cichu DWA RAZY z tego samego powodu:
// zmiana dotyczyła jednej gałęzi, a zdjęcia, o które chodziło właścicielowi,
// przechodziły inną. Testy pilnują więc nie „czy funkcja zwraca string", tylko
// KTÓRY host dostaje jakie przetwarzanie.

function parametry(wynik: string): URLSearchParams {
  return new URL(wynik).searchParams;
}

test("Pexels idzie przez wsrv.nl i wychodzi jako WebP", () => {
  const wynik = cdnLoader({
    src: "https://images.pexels.com/photos/123/pexels-photo-123.jpeg",
    width: 1920,
  });
  const u = new URL(wynik);
  assert.equal(u.hostname, "wsrv.nl", "Pexels musi iść przez proxy — sam Pexels nie oddaje WebP ani AVIF");
  assert.equal(u.searchParams.get("output"), "webp");
  assert.equal(u.searchParams.get("w"), "1920");
});

test("jakość dociera do Pexels — regresja: ta gałąź ignorowała `q`", () => {
  // Poprzednia poprawka podniosła DEFAULT_QUALITY z 75 na 82 i nie zmieniła
  // NIC na stronie głównej, bo gałąź Pexels w ogóle nie wysyłała `q`.
  const domyslna = parametry(
    cdnLoader({ src: "https://images.pexels.com/photos/1/a.jpeg", width: 800 }),
  );
  assert.equal(domyslna.get("q"), "82");

  const jawna = parametry(
    cdnLoader({ src: "https://images.pexels.com/photos/1/a.jpeg", width: 800, quality: 95 }),
  );
  assert.equal(jawna.get("q"), "95");
});

test("adres źródłowy Pexels zachowuje szerokość i gubi `h`", () => {
  // `h` w źródłowym URL-u kazało Pexelsowi oddać malutki rendition.
  const wynik = cdnLoader({
    src: "https://images.pexels.com/photos/1/a.jpeg?h=650&w=200",
    width: 1600,
  });
  const zrodlo = new URL(parametry(wynik).get("url") ?? "");
  assert.equal(zrodlo.hostname, "images.pexels.com");
  assert.equal(zrodlo.searchParams.get("w"), "1600");
  assert.equal(zrodlo.searchParams.get("h"), null, "`h` musi zniknąć, inaczej Pexels tnie rozdzielczość");
});

test("awaria proxy przekierowuje na oryginał zamiast psuć obrazek", () => {
  const wynik = cdnLoader({ src: "https://images.pexels.com/photos/1/a.jpeg", width: 640 });
  const p = parametry(wynik);
  assert.equal(p.get("default"), p.get("url"), "`default` to bezpiecznik — bez niego awaria wsrv daje pustą kartę");
});

test("Cupid/LiteAPI dalej idą przez wsrv", () => {
  for (const src of [
    "https://static.cupid.travel/hotels/abc.jpg",
    "https://cdn.liteapi.travel/img/x.jpg",
  ]) {
    const u = new URL(cdnLoader({ src, width: 384 }));
    assert.equal(u.hostname, "wsrv.nl", `${src} miało iść przez proxy`);
    assert.equal(u.searchParams.get("output"), "webp");
  }
});

test("pliki lokalne i data: zostają nietknięte", () => {
  assert.equal(cdnLoader({ src: "/branding/logo.png", width: 200 }), "/branding/logo.png");
  assert.equal(cdnLoader({ src: "data:image/svg+xml,<svg/>", width: 10 }), "data:image/svg+xml,<svg/>");
});

test("Geoapify zostaje przepuszczone bez zmian — URL niesie klucz API", () => {
  const src = "https://maps.geoapify.com/v1/staticmap?apiKey=tajne";
  assert.equal(cdnLoader({ src, width: 600 }), src);
});

test("nieznany host i niepoprawny URL nie wywracają renderu", () => {
  assert.equal(cdnLoader({ src: "https://example.com/a.jpg", width: 100 }), "https://example.com/a.jpg");
  assert.equal(cdnLoader({ src: "nie-jest-urlem", width: 100 }), "nie-jest-urlem");
});

test("jakość jest przycinana do zakresu 1-100", () => {
  const niska = parametry(cdnLoader({ src: "https://images.pexels.com/photos/1/a.jpeg", width: 100, quality: 0 }));
  assert.equal(niska.get("q"), "1");
  const wysoka = parametry(cdnLoader({ src: "https://images.pexels.com/photos/1/a.jpeg", width: 100, quality: 500 }));
  assert.equal(wysoka.get("q"), "100");
});
