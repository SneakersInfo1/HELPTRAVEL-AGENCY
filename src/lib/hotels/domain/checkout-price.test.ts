// Testy modelu ceny checkoutu.
//
// Regresja, której pilnują: checkout pisał bezwarunkowe „wł. podatków i opłat"
// dla taryf, w których dostawca jawnie oznaczał opłaty jako NIEwliczone.
// Pomiar na żywym LiteAPI (2026-08-08): 14 315 z 17 776 taryf (80,5%),
// średnio 352,38 PLN nieujawnionej dopłaty.
//
// Fixture w `SUROWY_PREBOOK` to KSZTAŁT prawdziwej odpowiedzi
// `POST /rates/prebook` zarejestrowanej podczas audytu (hotel lp88f00, Rzym,
// 2 noce). Uchwyty transakcyjne zastąpione atrapami — nie ma powodu trzymać
// prawdziwych w repo. Liczby są autentyczne, bo to one są przedmiotem testu.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LiteApiPrebookResponseSchema } from "@/lib/liteapi/types";
import type { LiteApiRate } from "@/lib/liteapi";

import { buildCheckoutPrice, wymagaUwagiPrzedPlatnoscia } from "./checkout-price";

// ────────────────────────────────────────────────────────────────────────────
// Fixture: surowa odpowiedź prebooka

const SUROWY_PREBOOK = {
  data: {
    prebookId: "atrapa-prebook-id",
    offerId: "atrapa-offer-id",
    hotelId: "lp88f00",
    currency: "PLN",
    termsAndConditions: "…",
    roomTypes: [
      {
        offerId: "atrapa-offer-id",
        rates: [
          {
            rateId: "atrapa-rate-id",
            boardName: "Breakfast Included",
            retailRate: {
              total: [{ amount: 3966.4, currency: "PLN" }],
              suggestedSellingPrice: [{ amount: 5314.26, currency: "PLN", source: "booking.com" }],
              initialPrice: null,
              taxesAndFees: [
                { included: false, description: "City tax", amount: 171.38, currency: "PLN" },
                { included: false, description: "VAT", amount: 367.26, currency: "PLN" },
              ],
            },
            priceType: "commission",
            commission: [{ amount: 293.8, currency: "PLN" }],
          },
        ],
      },
    ],
    suggestedSellingPrice: 5314.26,
    isPackageRate: false,
    commission: 293.8,
    price: 3966.4,
    priceType: "commission",
    priceDifferencePercent: 0,
    cancellationChanged: false,
    boardChanged: false,
    supplier: "atrapa",
    supplierId: 1,
    transactionId: "atrapa-transaction-id",
    secretKey: "atrapa-secret-key",
    paymentTypes: ["CC"],
    checkin: "2026-09-15",
    checkout: "2026-09-17",
    sellingPriceToUser: 3966.4,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// §16 — Zod NIE MOŻE kasować danych podatkowych

test("Zod: parse surowego prebooka ZACHOWUJE taxesAndFees (regresja: kasował je po cichu)", () => {
  const parsed = LiteApiPrebookResponseSchema.parse(SUROWY_PREBOOK);
  const taxes = parsed.data.roomTypes?.[0]?.rates?.[0]?.retailRate?.taxesAndFees;
  assert.ok(taxes, "taxesAndFees zniknęły przy parsowaniu — to jest ten bug");
  assert.equal(taxes!.length, 2);
  assert.equal(taxes![0].description, "City tax");
  assert.equal(taxes![0].amount, 171.38);
  assert.equal(taxes![0].included, false);
  assert.equal(taxes![1].description, "VAT");
  assert.equal(taxes![1].amount, 367.26);
});

test("Zod: parse zachowuje sygnały live-verify (priceDifferencePercent/cancellationChanged/boardChanged)", () => {
  const parsed = LiteApiPrebookResponseSchema.parse(SUROWY_PREBOOK);
  assert.equal(parsed.data.priceDifferencePercent, 0);
  assert.equal(parsed.data.cancellationChanged, false);
  assert.equal(parsed.data.boardChanged, false);
  assert.equal(parsed.data.sellingPriceToUser, 3966.4);
});

test("Zod: zepsute taxesAndFees NIE wywracają parsowania prebooka (dana pomocnicza)", () => {
  const zepsuty = structuredClone(SUROWY_PREBOOK) as Record<string, never> & typeof SUROWY_PREBOOK;
  // @ts-expect-error — celowo zły kształt, tego właśnie broni `.catch(undefined)`
  zepsuty.data.roomTypes = "nie-tablica";
  const parsed = LiteApiPrebookResponseSchema.parse(zepsuty);
  assert.equal(parsed.data.prebookId, "atrapa-prebook-id");
  assert.equal(parsed.data.price, 3966.4, "cena musi przeżyć zły kształt podatków");
});

// ────────────────────────────────────────────────────────────────────────────
// Pomocnik: taryfa z zadanymi podatkami

function taryfa(taxesAndFees: unknown[] | null): LiteApiRate {
  return {
    rateId: "r",
    retailRate: {
      total: [{ amount: 3966.4, currency: "PLN" }],
      taxesAndFees,
    },
  } as unknown as LiteApiRate;
}

function model(taxesAndFees: unknown[] | null, extra: Record<string, unknown> = {}) {
  return buildCheckoutPrice({
    price: 3966.4,
    currency: "PLN",
    roomTypes: [{ rates: [taryfa(taxesAndFees)] }],
    ...extra,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// PRZYPADEK RZECZYWISTY — ten, który był na produkcji nieprawdziwy

test("REGRESJA: 3966,40 zł + 171,38 + 367,26 na miejscu → NIE wolno mówić „wliczone”", () => {
  const parsed = LiteApiPrebookResponseSchema.parse(SUROWY_PREBOOK);
  const p = buildCheckoutPrice(parsed.data)!;
  assert.ok(p, "model nie powstał");
  assert.equal(p.taxSummary, "some-at-property");
  assert.notEqual(p.taxSummary, "all-included", "to jest dokładnie to kłamstwo, które naprawiamy");
  assert.equal(p.payableNowMinor, BigInt(396640));
  assert.equal(p.payableAtPropertyMinor, BigInt(53864)); // 171,38 + 367,26
  assert.equal(p.atPropertyCurrency, "PLN");
  assert.equal(p.atPropertyItems.length, 2);
  assert.equal(p.includedItems.length, 0);
});

// ────────────────────────────────────────────────────────────────────────────
// A–K z briefu

test("A: brak taxesAndFees → 'unknown', UI nie mówi o podatkach NIC", () => {
  const p = model(null)!;
  assert.equal(p.taxSummary, "unknown");
  assert.equal(p.atPropertyItems.length, 0);
  assert.equal(p.payableAtPropertyMinor, null);
});

test("B: wszystkie included=true → 'all-included'", () => {
  const p = model([
    { included: true, description: "VAT", amount: 100, currency: "PLN" },
    { included: true, description: "Service", amount: 50, currency: "PLN" },
  ])!;
  assert.equal(p.taxSummary, "all-included");
  assert.equal(p.includedItems.length, 2);
  assert.equal(p.atPropertyItems.length, 0);
  assert.equal(p.payableAtPropertyMinor, null);
});

test("C: wszystkie included=false → 'some-at-property' i pełna suma dopłaty", () => {
  const p = model([
    { included: false, description: "City tax", amount: 171.38, currency: "PLN" },
    { included: false, description: "VAT", amount: 367.26, currency: "PLN" },
  ])!;
  assert.equal(p.taxSummary, "some-at-property");
  assert.equal(p.payableAtPropertyMinor, BigInt(53864));
  assert.equal(p.includedItems.length, 0);
});

test("D: mix included true/false → OBIE grupy, bez ogólnego „wliczone”", () => {
  const p = model([
    { included: true, description: "VAT", amount: 300, currency: "PLN" },
    { included: false, description: "City tax", amount: 171.38, currency: "PLN" },
  ])!;
  assert.equal(p.taxSummary, "some-at-property");
  assert.equal(p.includedItems.length, 1);
  assert.equal(p.atPropertyItems.length, 1);
  assert.equal(p.payableAtPropertyMinor, BigInt(17138));
});

test("E: kilka różnych podatków na miejscu → suma wszystkich policzalnych", () => {
  const p = model([
    { included: false, description: "City tax", amount: 10.5, currency: "PLN" },
    { included: false, description: "VAT", amount: 20.25, currency: "PLN" },
    { included: false, description: "Resort fee", amount: 5, currency: "PLN" },
  ])!;
  assert.equal(p.payableAtPropertyMinor, BigInt(3575)); // 10,50+20,25+5,00
  assert.equal(p.atPropertyItems.length, 3);
});

test("F: dopłaty w RÓŻNYCH walutach → nie sumujemy (suma byłaby bez sensu)", () => {
  const p = model([
    { included: false, description: "City tax", amount: 10, currency: "PLN" },
    { included: false, description: "Resort fee", amount: 20, currency: "EUR" },
  ])!;
  assert.equal(p.payableAtPropertyMinor, null);
  assert.equal(p.atPropertyCurrency, null);
  assert.equal(p.taxSummary, "some-at-property", "nadal MUSIMY ostrzec o dopłacie");
});

test("F2: dopłata bez kwoty (dostawca podał sam opis) → wiemy ŻE, nie wiemy ILE", () => {
  const p = model([
    { included: false, description: "$163.02 USD per room per stay", amount: null, currency: null },
  ])!;
  assert.equal(p.payableAtPropertyMinor, null);
  assert.equal(p.atPropertyHasUncountable, true);
  assert.equal(p.taxSummary, "some-at-property");
});

test("G: brak ceny z prebooka → FAIL CLOSED (null, nie cena z URL-a)", () => {
  assert.equal(buildCheckoutPrice({ price: undefined, currency: "PLN" }), null);
  assert.equal(buildCheckoutPrice({ price: null, currency: "PLN" }), null);
  assert.equal(buildCheckoutPrice({ price: 0, currency: "PLN" }), null);
  assert.equal(buildCheckoutPrice({ price: -5, currency: "PLN" }), null);
  assert.equal(buildCheckoutPrice({ price: Number.NaN, currency: "PLN" }), null);
  assert.equal(buildCheckoutPrice({ price: 100, currency: null }), null, "brak waluty też blokuje");
});

test("H: priceDifferencePercent > 0 (podrożało) → gość musi zobaczyć przed płatnością", () => {
  const p = model(null, { priceDifferencePercent: 4.2 })!;
  assert.equal(p.priceChangePercent, 4.2);
  assert.equal(wymagaUwagiPrzedPlatnoscia(p), true);
});

test("I: priceDifferencePercent < 0 (staniało) → też pokazujemy, ale nie blokujemy", () => {
  const p = model(null, { priceDifferencePercent: -1.6 })!;
  assert.equal(p.priceChangePercent, -1.6);
  assert.equal(wymagaUwagiPrzedPlatnoscia(p), true);
});

test("I2: priceDifferencePercent = 0 → nic się nie zmieniło, brak ostrzeżenia", () => {
  const p = model(null, { priceDifferencePercent: 0 })!;
  assert.equal(p.priceChangePercent, 0);
  assert.equal(wymagaUwagiPrzedPlatnoscia(p), false);
});

test("J: cancellationChanged=true → wymaga uwagi", () => {
  const p = model(null, { cancellationChanged: true })!;
  assert.equal(p.cancellationChanged, true);
  assert.equal(wymagaUwagiPrzedPlatnoscia(p), true);
});

test("K: boardChanged=true → wymaga uwagi", () => {
  const p = model(null, { boardChanged: true })!;
  assert.equal(p.boardChanged, true);
  assert.equal(wymagaUwagiPrzedPlatnoscia(p), true);
});

// ────────────────────────────────────────────────────────────────────────────
// Suma całkowita — świadomie zablokowana

test("łączny koszt NIE jest pokazywany, dopóki dostawca nie potwierdzi semantyki", () => {
  const p = model([
    { included: false, description: "City tax", amount: 171.38, currency: "PLN" },
    { included: false, description: "VAT", amount: 367.26, currency: "PLN" },
  ])!;
  // Arytmetyka się zgadza…
  assert.equal(p.grandTotalMinor, BigInt(396640 + 53864));
  // …ale UI ma tego NIE pokazywać, bo nie wiemy, czy to KOMPLET opłat.
  assert.equal(p.grandTotalKnown, false);
});

test("brak policzalnej dopłaty → brak sumy całkowitej w ogóle", () => {
  const p = model([{ included: false, description: "opis bez kwoty", amount: null, currency: null }])!;
  assert.equal(p.grandTotalMinor, null);
  assert.equal(p.grandTotalKnown, false);
});
