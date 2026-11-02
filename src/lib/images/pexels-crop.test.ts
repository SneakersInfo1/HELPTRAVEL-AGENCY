import { strict as assert } from "node:assert";
import { test } from "node:test";

import { pexelsCenterCrop } from "./pexels-crop";

// Wycinek hero na telefon ma pokazywać TEN SAM fragment zdjęcia co dotąd —
// testy pilnują parametrów, od których to zależy: środek, pełna wysokość
// renditionu 3840 px, brak powiększania i powrót do oryginału przy awarii proxy.

test("Pexels: wycinek środka przez wsrv, bez powiększania, z oryginałem jako awaryjnym", () => {
  const wynik = pexelsCenterCrop("https://images.pexels.com/photos/1/a.jpeg?w=640&h=650", 2048, 2560, 70);
  assert.ok(wynik);
  const u = new URL(wynik);
  assert.equal(u.hostname, "wsrv.nl");
  assert.equal(u.searchParams.get("w"), "2048");
  assert.equal(u.searchParams.get("h"), "2560");
  assert.equal(u.searchParams.get("fit"), "cover");
  assert.equal(u.searchParams.get("a"), "center", "object-cover centruje — wycinek musi brać ten sam środek");
  assert.equal(u.searchParams.get("we"), "", "powiększanie rozciągnęłoby niższe źródła zamiast oddać pełną wysokość");
  assert.equal(u.searchParams.get("output"), "webp");
  assert.equal(u.searchParams.get("q"), "70");

  const zrodlo = new URL(u.searchParams.get("url")!);
  assert.equal(zrodlo.searchParams.get("w"), "3840", "ta sama rozdzielczość, którą telefon pobierał dotąd");
  assert.equal(zrodlo.searchParams.get("h"), null, "wbudowane h=650 dawało maleńki rendition (incydent PR #112)");
  assert.equal(u.searchParams.get("default"), zrodlo.toString());
});

test("źródła spoza Pexels i śmieci → null (hero zostaje przy zwykłym srcset)", () => {
  assert.equal(pexelsCenterCrop("https://images.unsplash.com/photo-1", 2048, 2560, 70), null);
  assert.equal(pexelsCenterCrop("/branding/hero.jpg", 2048, 2560, 70), null);
  assert.equal(pexelsCenterCrop("nie-adres", 2048, 2560, 70), null);
});
