// Odcisk oferty: ten sam pokój pod nowym `offerId` ma ten sam odcisk (zmierzone:
// LiteAPI wydaje `offerId` jednorazowo), a każda różnica dla gościa daje inny.
// Liczy serwer na pełnych danych, a przeglądarka dostaje gotową wartość.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LiteApiRate, LiteApiRoomType } from "@/lib/liteapi/types";

import { groupRates, slimRoomTypesForClient } from "./group-rates";
import {
  MAX_REFUSED_OFFERS,
  OFFER_FINGERPRINT_RE,
  dropRefusedOffers,
  offerFingerprint,
  parseRefusedOffers,
} from "./offer-fingerprint";

let seq = 0;
function rate(over: Partial<LiteApiRate> & { amount?: number } = {}): LiteApiRate {
  seq += 1;
  const { amount, ...fields } = over;
  return {
    rateId: `RATE_${seq}`,
    name: "Double Room",
    occupancyNumber: 1,
    adultCount: 2,
    childCount: 0,
    maxOccupancy: 2,
    boardType: "RO",
    boardName: "Room Only",
    retailRate: { total: [{ amount: amount ?? 1200, currency: "PLN" }] },
    cancellationPolicies: { refundableTag: "NRFN" },
    ...fields,
  };
}
function offer(rates: LiteApiRate[] = [rate()], supplier = "nuitee"): LiteApiRoomType {
  seq += 1;
  return { offerId: `OFFER_${seq}`, supplier, rates };
}

test("offerId i rateId nie wchodzą do odcisku: ten sam pokój pod nowym identyfikatorem to ta sama oferta", () => {
  const a = offer();
  const b = offer();
  assert.notEqual(a.offerId, b.offerId);
  assert.notEqual(a.rates[0]!.rateId, b.rates[0]!.rateId);
  assert.equal(offerFingerprint(a), offerFingerprint(b));
  assert.match(offerFingerprint(a), OFFER_FINGERPRINT_RE);
});

test("każda różnica widoczna dla gościa to inna oferta", () => {
  const base = offerFingerprint(offer());
  const variants: Array<[string, LiteApiRoomType]> = [
    ["cena", offer([rate({ amount: 1201 })])],
    ["wyżywienie", offer([rate({ boardType: "BB" })])],
    ["opis wyżywienia", offer([rate({ boardName: "Room Only, Late Checkout" })])],
    ["zwrotność na poziomie taryfy", offer([rate({ refundableTag: "RFN" })])],
    ["pokój", offer([rate({ name: "Twin Room" })])],
    ["dostawca", offer([rate()], "inny")],
    ["obsada", offer([rate({ adultCount: 1 })])],
    ["maks. osób", offer([rate({ maxOccupancy: 3 })])],
    ["anulacja", offer([rate({ cancellationPolicies: { refundableTag: "RFN" } })])],
    [
      "podatki",
      offer([
        rate({
          retailRate: {
            total: [{ amount: 1200, currency: "PLN" }],
            taxesAndFees: [{ included: false, amount: 40, currency: "PLN" }],
          },
        }),
      ]),
    ],
  ];
  for (const [what, variant] of variants) assert.notEqual(offerFingerprint(variant), base, what);
});

test("różny termin bezpłatnej anulacji przy tej samej cenie to dwie oferty", () => {
  const until = (cancelTime: string) =>
    offer([
      rate({
        cancellationPolicies: {
          refundableTag: "RFN",
          cancelPolicyInfos: [{ cancelTime, amount: 400, currency: "PLN", type: "amount" }],
        },
      }),
    ]);
  assert.notEqual(offerFingerprint(until("2026-11-10 12:00:00")), offerFingerprint(until("2026-11-20 12:00:00")));
});

test("wielkość liter i spacje w nazwie pokoju nie tworzą nowej oferty", () => {
  assert.equal(
    offerFingerprint(offer([rate({ name: "Double  Room " })])),
    offerFingerprint(offer([rate({ name: "double room" })])),
  );
});

test("kilka pokoi: liczy się cała oferta, kolejność taryf nie ma znaczenia", () => {
  const standard = rate({ name: "Standard", occupancyNumber: 1 });
  const deluxe = rate({ name: "Deluxe", occupancyNumber: 2 });
  const suite = rate({ name: "Suite", occupancyNumber: 2 });
  assert.equal(offerFingerprint(offer([standard, deluxe])), offerFingerprint(offer([deluxe, standard])));
  assert.notEqual(
    offerFingerprint(offer([standard, deluxe])),
    offerFingerprint(offer([standard, suite])),
    "wspólna taryfa nie czyni dwóch ofert tą samą ofertą",
  );
});

test("oferta bez ceny i bez nazwy też ma poprawny odcisk (nie wywraca listy)", () => {
  assert.match(offerFingerprint({ rates: [{ rateId: "R" }] }), OFFER_FINGERPRINT_RE);
});

test("przeglądarka dostaje odcisk całej oferty, także gdy odchudzanie odcięło jej część taryf", () => {
  const cheaper = rate({ name: "Standard", amount: 1000 });
  const duplicate = rate({ name: "Standard", amount: 1100 });
  const raw = offer([cheaper, duplicate]);
  const fullFingerprint = offerFingerprint(raw);

  const slim = slimRoomTypesForClient([raw]);
  assert.equal(slim[0]!.rates.length, 1, "warunek testu: droższy duplikat odpada");
  assert.equal(slim[0]!.fingerprint, fullFingerprint);
  assert.equal(groupRates(slim).groups[0]!.options[0]!.fingerprint, fullFingerprint);
});

test("wszystkie wiersze jednej oferty mają ten sam odcisk", () => {
  const multi = offer([rate({ name: "Standard" }), rate({ name: "Deluxe", amount: 2000 })]);
  const options = groupRates([multi]).groups.flatMap((group) => group.options);
  assert.equal(options.length, 2);
  assert.equal(new Set(options.map((option) => option.fingerprint)).size, 1);
});

test("parseRefusedOffers: przepuszcza tylko poprawne odciski, z limitem", () => {
  const good = "0123456789abcdef";
  assert.deepEqual([...parseRefusedOffers(`${good},nie-hex,<script>,`)], [good]);
  assert.equal(parseRefusedOffers(undefined).size, 0);
  assert.equal(parseRefusedOffers(["a", "b"]).size, 0, "powtórzony parametr w adresie to tablica");

  const many = Array.from({ length: MAX_REFUSED_OFFERS + 5 }, (_, i) => i.toString(16).padStart(16, "0"));
  assert.equal(parseRefusedOffers(many.join(",")).size, MAX_REFUSED_OFFERS);
});

test("dropRefusedOffers: znika tylko odrzucona oferta, także gdy wróciła pod nowym offerId", () => {
  const refused = offer();
  const same = offer();
  const other = offer([rate({ name: "Twin Room" })]);
  assert.deepEqual(
    dropRefusedOffers([same, other], new Set([offerFingerprint(refused)])).map((rt) => rt.offerId),
    [other.offerId],
  );
});

test("dropRefusedOffers: pusty zbiór nie liczy odcisków i zwraca tę samą listę", () => {
  const list = [offer()];
  assert.equal(dropRefusedOffers(list, new Set()), list);
});
