// Co gość widzi po nieudanym prebooku i dokąd może pójść dalej.
//
// Incydent 2026-11-03: LiteAPI odpowiadało `400 "2001: no prebook
// availability"`, a formularz pokazywał ogólny komunikat o problemie dostawcy.
// Teraz trasa zwraca RATE_UNAVAILABLE i formularz mówi wprost, że pokój się
// wyprzedał, a jedyną drogą dalej jest lista pokoi tego hotelu (te same daty
// i goście). Pozostałe kody muszą zachować dotychczasowe zachowanie.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBackToRoomsHref, classifyPrebookError } from "./prebook-recovery";

test("RATE_UNAVAILABLE (m.in. prebook 2001) → „pokój się wyprzedał”, tylko powrót do listy pokoi", () => {
  const e = classifyPrebookError("RATE_UNAVAILABLE", 410, undefined);
  assert.equal(e.soldOut, true);
  assert.equal(e.repick, true);
  assert.match(e.message, /wyprzedał/);
  assert.match(e.message, /inną ofertę/);
});

test("RATE_UNAVAILABLE: komunikat z serwera ma pierwszeństwo przed zapasowym", () => {
  const e = classifyPrebookError("RATE_UNAVAILABLE", 410, "Komunikat z API");
  assert.equal(e.message, "Komunikat z API");
  assert.equal(e.soldOut, true);
});

test("pozostałe kody zachowują dotychczasowe zachowanie (żaden nie jest „wyprzedany”)", () => {
  const cases: Array<{ code: string | undefined; status: number; repick: boolean }> = [
    // Wygasła cena / nieprawidłowa oferta — wybór świeżej oferty.
    { code: "PREBOOK_EXPIRED", status: 409, repick: true },
    // Odmowa dostawcy dla tej oferty (prod 2026-06-09) — wybór innej oferty.
    { code: "LITEAPI_DOWN", status: 503, repick: true },
    { code: "prebook_no_payment_session", status: 502, repick: true },
    // Przerwa po naszej stronie — inna oferta skończyłaby się tak samo.
    { code: "TEMPORARILY_UNAVAILABLE", status: 503, repick: false },
    { code: "RATE_LIMIT_EXCEEDED", status: 429, repick: false },
    { code: undefined, status: 500, repick: true },
    { code: undefined, status: 400, repick: false },
  ];
  for (const c of cases) {
    const e = classifyPrebookError(c.code, c.status, undefined);
    assert.equal(e.repick, c.repick, `${c.code ?? "brak kodu"} / ${c.status}: repick`);
    assert.ok(!e.soldOut, `${c.code ?? "brak kodu"} / ${c.status}: nie jest „wyprzedany”`);
    assert.ok(e.message.length > 0);
  }
});

test("buildBackToRoomsHref: te same daty i goście, ląduje na liście pokoi (#rooms)", () => {
  assert.equal(
    buildBackToRoomsHref("lp1a2b", {
      checkin: "2026-12-01",
      checkout: "2026-12-05",
      adults: "2",
      rooms: "1",
      children: "5,9",
    }),
    "/hotele/lp1a2b?checkin=2026-12-01&checkout=2026-12-05&adults=2&rooms=1&children=5%2C9#rooms",
  );
});

test("buildBackToRoomsHref: bez opcjonalnych parametrów — tylko daty; hotelId zakodowany", () => {
  assert.equal(
    buildBackToRoomsHref("a/b", { checkin: "2026-12-01", checkout: "2026-12-05" }),
    "/hotele/a%2Fb?checkin=2026-12-01&checkout=2026-12-05#rooms",
  );
});
