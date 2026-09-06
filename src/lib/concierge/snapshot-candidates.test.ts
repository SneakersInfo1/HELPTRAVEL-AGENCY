// Kandydaci z csnap:v1 — to jest warstwa, dla ktorej powstala cala V2.2.
//
// Pytanie „Grecja, listopad, 7 nocy" nie mialo jak zadzialac na starym
// snapshocie, bo ten trzymal JEDEN pakiet na kierunek. Tutaj sprawdzamy, ze
// wybor okna faktycznie odpowiada na termin uzytkownika, a gdy nie moze —
// mowi o tym wprost zamiast podstawiac cene innego terminu.

import assert from "node:assert/strict";
import { test } from "node:test";

import { pickBestRecord, rankSnapshotCandidates } from "./snapshot-candidates";
import type { SnapshotRecord } from "@/lib/snapshot/types";
import type { TripSearchCity } from "./trip-search";

const NOW = Date.UTC(2026, 8, 6, 12); // 2026-09-06

function rec(over: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    destId: "rhodes-greece",
    cityEn: "Rhodes",
    cityPl: "Rodos",
    countryEn: "Greece",
    countryPl: "Grecja",
    origin: "WAW",
    destIata: "RHO",
    checkin: "2026-10-03",
    checkout: "2026-10-10",
    month: 10,
    year: 2026,
    nights: 7,
    flightPln: 700,
    hotelPlnPerNight: 200,
    perPersonPln: 1400,
    currency: "PLN",
    tier: "A",
    pricedAt: NOW,
    carriedForward: false,
    ...over,
  };
}

const RHODES: TripSearchCity = { cityEn: "Rhodes", countryEn: "Greece", cityPl: "Rodos", popularity: 90 };
const NO_LIMIT = { budgetPln: Number.MAX_SAFE_INTEGER, budgetKind: "per_person" as const };

// ── Wybor okna ──────────────────────────────────────────────────────────────

test("EXACT: miesiac i noce zgodne z prosba uzytkownika", () => {
  const records = [
    rec({ month: 10, nights: 4, checkin: "2026-10-05", checkout: "2026-10-09", perPersonPln: 900 }),
    rec({ month: 11, nights: 7, checkin: "2026-11-07", checkout: "2026-11-14", perPersonPln: 1200 }),
  ];
  const hit = pickBestRecord(records, { month: 11, nights: 7 });
  assert.equal(hit?.matchType, "EXACT");
  assert.equal(hit?.record.checkin, "2026-11-07");
});

test("dopasowanie terminu bije CENE — tanszy inny miesiac nie jest odpowiedzia", () => {
  const records = [
    rec({ month: 10, nights: 7, perPersonPln: 800 }), // tanszy, ale nie ten miesiac
    rec({ month: 11, nights: 7, checkin: "2026-11-07", checkout: "2026-11-14", perPersonPln: 1500 }),
  ];
  const hit = pickBestRecord(records, { month: 11, nights: 7 });
  assert.equal(hit?.record.perPersonPln, 1500);
  assert.equal(hit?.matchType, "EXACT");
});

test("NEAREST gdy zadanego terminu nie ma — i jest OZNACZONY", () => {
  const records = [rec({ month: 10, nights: 7 })];
  const hit = pickBestRecord(records, { month: 12, nights: 7 });
  assert.equal(hit?.matchType, "NEAREST");
});

test("niezgodny wylot NIE degraduje do NEAREST (to preferencja, nie pytanie)", () => {
  const records = [rec({ origin: "KRK" })];
  const hit = pickBestRecord(records, { month: 10, nights: 7, origin: "WAW" });
  assert.equal(hit?.matchType, "EXACT");
});

test("przy remisie terminu wygrywa zgodny wylot", () => {
  const records = [rec({ origin: "KRK", perPersonPln: 1400 }), rec({ origin: "WAW", perPersonPln: 1400 })];
  assert.equal(pickBestRecord(records, { origin: "WAW" })?.record.origin, "WAW");
});

test("pusta lista rekordow daje null", () => {
  assert.equal(pickBestRecord([], { month: 10 }), null);
});

// ── Filtr twardy czasu ──────────────────────────────────────────────────────

test("§11: rekord z PRZESZLYM terminem nie tworzy kandydata, choc jest najtanszy", () => {
  const records = [
    rec({ checkin: "2026-08-08", checkout: "2026-08-15", month: 8, perPersonPln: 300 }),
    rec({ perPersonPln: 1400 }),
  ];
  const out = rankSnapshotCandidates([RHODES], records, NO_LIMIT, NOW, { month: 8, nights: 7 });
  assert.equal(out.length, 1);
  assert.equal(out[0].perPersonPln, 1400);
  assert.equal(out[0].checkin, "2026-10-03");
  assert.equal(out[0].travelDateState, "FUTURE");
  // Uzytkownik pytal o sierpien, dostal pazdziernik — to MUSI byc oznaczone.
  assert.equal(out[0].matchType, "NEAREST");
});

test("§11: same przeszle rekordy = brak kandydata (nie podstawiamy przeszlosci)", () => {
  const records = [rec({ checkin: "2026-08-08", checkout: "2026-08-15", month: 8 })];
  assert.equal(rankSnapshotCandidates([RHODES], records, NO_LIMIT, NOW).length, 0);
});

test("rekord z wygasla cena jest pomijany", () => {
  const stale = rec({ pricedAt: NOW - 100 * 3600 * 1000 });
  assert.equal(rankSnapshotCandidates([RHODES], [stale], NO_LIMIT, NOW).length, 0);
});

test("rekord bez policzonego pakietu jest pomijany (nie zgadujemy ceny)", () => {
  assert.equal(rankSnapshotCandidates([RHODES], [rec({ perPersonPln: null })], NO_LIMIT, NOW).length, 0);
});

// ── Budzet i kolejnosc ──────────────────────────────────────────────────────

test("budzet jest filtrem twardym, liczonym na osobe", () => {
  const out = rankSnapshotCandidates([RHODES], [rec({ perPersonPln: 1400 })], { budgetPln: 2000, budgetKind: "total_two" }, NOW);
  assert.equal(out.length, 0, "1400/os. nie miesci sie w 2000 za dwoje (=1000/os.)");
});

test("EXACT stoi przed NEAREST, a w grupie decyduje cena", () => {
  const cities: TripSearchCity[] = [
    RHODES,
    { cityEn: "Kos", countryEn: "Greece", cityPl: "Kos", popularity: 80 },
  ];
  const records = [
    // Rodos ma listopad (EXACT), ale drozszy.
    rec({ month: 11, nights: 7, checkin: "2026-11-07", checkout: "2026-11-14", perPersonPln: 1500 }),
    // Kos ma tylko pazdziernik (NEAREST), tanszy.
    rec({ destId: "kos-greece", cityEn: "Kos", cityPl: "Kos", month: 10, nights: 7, perPersonPln: 900 }),
  ];
  const out = rankSnapshotCandidates(cities, records, NO_LIMIT, NOW, { month: 11, nights: 7 });
  assert.deepEqual(out.map((c) => c.cityEn), ["Rhodes", "Kos"]);
  assert.equal(out[0].matchType, "EXACT");
  assert.equal(out[1].matchType, "NEAREST");
});

test("kierunek spoza puli miast nie wchodzi do wyniku", () => {
  const out = rankSnapshotCandidates([{ cityEn: "Kos", countryEn: "Greece", cityPl: "Kos" }], [rec()], NO_LIMIT, NOW);
  assert.equal(out.length, 0);
});

test("nightsMatch odzwierciedla prosbe uzytkownika", () => {
  const four = rankSnapshotCandidates([RHODES], [rec({ nights: 4, checkout: "2026-10-07" })], NO_LIMIT, NOW, { nights: 7 });
  assert.equal(four[0].nightsMatch, false);
  const none = rankSnapshotCandidates([RHODES], [rec()], NO_LIMIT, NOW);
  assert.equal(none[0].nightsMatch, null);
});
