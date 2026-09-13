import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inMonthPhrase, polishMonthInflected, polishMonthLabels, polishMonthSlugs, seasonInflected } from "./months";

describe("miesiące i sezony po polsku", () => {
  it("slugi zostają ASCII, bo są adresami stron", () => {
    for (const slug of polishMonthSlugs) {
      assert.match(slug, /^[a-z]+$/);
    }
  });

  it("nazwy miesięcy mają polskie znaki", () => {
    assert.equal(polishMonthLabels.styczen, "styczeń");
    assert.equal(polishMonthLabels.kwiecien, "kwiecień");
    assert.equal(polishMonthLabels.sierpien, "sierpień");
    assert.equal(polishMonthLabels.wrzesien, "wrzesień");
    assert.equal(polishMonthLabels.pazdziernik, "październik");
    assert.equal(polishMonthLabels.grudzien, "grudzień");
  });

  it("miejscownik ma polskie znaki", () => {
    assert.equal(polishMonthInflected.wrzesien, "wrześniu");
    assert.equal(polishMonthInflected.pazdziernik, "październiku");
  });

  it("przyimek zgadza się z formą miesiąca", () => {
    assert.equal(inMonthPhrase("wrzesien"), "we wrześniu");
    assert.equal(inMonthPhrase("pazdziernik"), "w październiku");
    assert.equal(inMonthPhrase("luty"), "w lutym");
    assert.equal(inMonthPhrase("listopad"), "w listopadzie");
  });

  it("sezon po przyimku na stoi w bierniku", () => {
    assert.deepEqual(seasonInflected, { wiosna: "wiosnę", lato: "lato", jesien: "jesień", zima: "zimę" });
  });
});
