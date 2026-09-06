// Pomiar pokrycia (§15, §46, §47). Najwazniejsza rzecz do przybicia:
// oferta z przeszlosci NIE POPRAWIA pokrycia, choc jest rekordem z cena.

import assert from "node:assert/strict";
import { test } from "node:test";

import { computeCoverage, isUsableRecord, priceFreshness } from "./coverage";
import type { TieredDestination } from "./tiers";
import type { SnapshotRecord } from "./types";

const NOW = Date.UTC(2026, 8, 6, 12); // 2026-09-06
const TODAY = "2026-09-06";
const H = 3600 * 1000;

function tier(id: string, t: "A" | "B" | "C"): TieredDestination {
  return {
    id,
    cityEn: id,
    cityPl: id,
    countryEn: "Spain",
    countryPl: "Hiszpania",
    iata: "AGP",
    tier: t,
    popularity: 80,
    countryCode: "ES",
    lat: 36.7,
    lng: -4.4,
  };
}

function rec(over: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    destId: "a1",
    cityEn: "a1",
    cityPl: "a1",
    countryEn: "Spain",
    countryPl: "Hiszpania",
    origin: "WAW",
    destIata: "AGP",
    checkin: "2026-10-05",
    checkout: "2026-10-09",
    month: 10,
    year: 2026,
    nights: 4,
    flightPln: 600,
    hotelPlnPerNight: 200,
    perPersonPln: 1000,
    currency: "PLN",
    tier: "A",
    pricedAt: NOW,
    carriedForward: false,
    ...over,
  };
}

// ── Swiezosc ceny ───────────────────────────────────────────────────────────

test("swiezosc ceny ma trzy stany, nie dwa", () => {
  assert.equal(priceFreshness(NOW - 2 * H, NOW), "FRESH");
  assert.equal(priceFreshness(NOW - 24 * H, NOW), "STALE_BUT_USABLE");
  assert.equal(priceFreshness(NOW - 100 * H, NOW), "EXPIRED_PRICE");
  assert.equal(priceFreshness(Number.NaN, NOW), "EXPIRED_PRICE");
});

test("stan czasowy terminu i swiezosc ceny to DWIE ROZNE osie", () => {
  // Termin przyszly + cena stara = wciaz uzywalne (orientacyjnie).
  assert.equal(isUsableRecord(rec({ pricedAt: NOW - 24 * H }), TODAY, NOW), true);
  // Termin przeszly + cena swieza = NIEuzywalne. To jest cala rzecz.
  assert.equal(isUsableRecord(rec({ checkin: "2026-08-10", checkout: "2026-08-17" }), TODAY, NOW), false);
});

test("rekord bez policzonego pakietu nie jest uzywalny", () => {
  assert.equal(isUsableRecord(rec({ perPersonPln: null }), TODAY, NOW), false);
  assert.equal(isUsableRecord(rec({ perPersonPln: 0 }), TODAY, NOW), false);
});

// ── §47: FUTURE USABLE COVERAGE ─────────────────────────────────────────────

test("§47: przeszle rekordy NIE podnosza pokrycia, choc maja cene", () => {
  const tiers = [tier("a1", "A"), tier("a2", "A")];
  const past = computeCoverage(
    [rec({ destId: "a1", checkin: "2026-08-10", checkout: "2026-08-17" }), rec({ destId: "a2", checkin: "2026-08-10", checkout: "2026-08-17" })],
    tiers,
    NOW,
  );
  assert.equal(past.futureUsableDestinations, 0);
  assert.equal(past.futureUsableCoveragePct, 0);
  // ...ale „ma jakakolwiek cene" widzi je, wiec stary KPI wygladalby dobrze.
  assert.equal(past.destinationsWithPrice, 2);
  assert.equal(past.expiredRecords, 2);
});

test("§47: przyszle rekordy podnosza pokrycie", () => {
  const tiers = [tier("a1", "A"), tier("a2", "A"), tier("b1", "B"), tier("c1", "C")];
  const cov = computeCoverage([rec({ destId: "a1" }), rec({ destId: "b1", tier: "B" })], tiers, NOW);
  assert.equal(cov.futureUsableDestinations, 2);
  assert.equal(cov.futureUsableCoveragePct, 50);
  assert.equal(cov.futureRecords, 2);
  assert.equal(cov.expiredRecords, 0);
});

test("§46: pokrycie wazone premiuje tier A", () => {
  const tiers = [tier("a1", "A"), tier("c1", "C")];
  const onlyHot = computeCoverage([rec({ destId: "a1" })], tiers, NOW);
  const onlyTail = computeCoverage([rec({ destId: "c1", tier: "C" })], tiers, NOW);
  assert.ok(
    onlyHot.weightedCoveragePct > onlyTail.weightedCoveragePct,
    `hot ${onlyHot.weightedCoveragePct}% nie bije ogona ${onlyTail.weightedCoveragePct}%`,
  );
  // Przy tej samej LICZBIE kierunkow pokrycie surowe jest identyczne — to
  // wlasnie roznica, ktora ma pokazac metryka wazona.
  assert.equal(onlyHot.futureUsableCoveragePct, onlyTail.futureUsableCoveragePct);
});

test("pokrycie tieru A i B liczone osobno", () => {
  const tiers = [tier("a1", "A"), tier("a2", "A"), tier("b1", "B"), tier("b2", "B")];
  const cov = computeCoverage([rec({ destId: "a1" }), rec({ destId: "a2" }), rec({ destId: "b1", tier: "B" })], tiers, NOW);
  assert.equal(cov.tierACoveragePct, 100);
  assert.equal(cov.tierBCoveragePct, 50);
});

// ── §16: pokrycie okien / wylotow ───────────────────────────────────────────

test("§16: jedna cena na kierunek to NIE jest pelne pokrycie okien", () => {
  const tiers = [tier("a1", "A")];
  const single = computeCoverage([rec({ destId: "a1" })], tiers, NOW);
  assert.equal(single.monthsCovered, 1);
  assert.equal(single.nightsCovered, 1);
  assert.equal(single.originsCovered, 1);

  const wide = computeCoverage(
    [
      rec({ destId: "a1", month: 10, nights: 4 }),
      rec({ destId: "a1", month: 10, nights: 7, checkin: "2026-10-03", checkout: "2026-10-10" }),
      rec({ destId: "a1", month: 11, nights: 7, checkin: "2026-11-07", checkout: "2026-11-14" }),
      rec({ destId: "a1", origin: "KRK" }),
    ],
    tiers,
    NOW,
  );
  // Ten sam JEDEN kierunek, ale realne pokrycie zapytan jest inne.
  assert.equal(wide.futureUsableDestinations, 1);
  assert.equal(wide.monthsCovered, 2);
  assert.equal(wide.nightsCovered, 2);
  assert.equal(wide.originsCovered, 2);
});

test("pusty snapshot daje zera, nie NaN", () => {
  const cov = computeCoverage([], [tier("a1", "A")], NOW);
  assert.equal(cov.futureUsableCoveragePct, 0);
  assert.equal(cov.weightedCoveragePct, 0);
  assert.equal(cov.tierACoveragePct, 0);
  assert.ok(Number.isFinite(cov.tierBCoveragePct));
});
