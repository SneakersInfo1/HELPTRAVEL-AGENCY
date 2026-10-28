// Pomiar transferu Upstash „przed / po" — na atrapie REST API (localhost),
// bez produkcyjnego magazynu i bez LiteAPI.
//
//   pnpm exec tsx scripts/redis/bench-transfer.ts
//
// METODA. Każda „jednostka pracy" (zadanie crona, paczka stawek, render strony)
// jest wykonywana DWA razy na tej samej atrapie:
//   • PRZED — domyślny klient SDK (`new Redis({ url, token })`, jak w 59ea15c:
//     odpowiedzi w base64, auto-pipelining) i dane w STARYM kształcie
//     (wpis stawki z offerId ~1 100 zn. i rateId ~550 zn. — długości z wpisu
//     produkcyjnego z logu 2026-10-27), stare wzorce komend;
//   • PO — wspólny klient z requesterem (src/lib/redis) i PRAWDZIWE moduły
//     aplikacji (rate-cache, rates-cache, price-history).
// Atrapa liczy bajty treści żądań i odpowiedzi oraz liczbę komend — czyli to,
// co Upstash wlicza do transferu i limitu komend (nagłówki HTTP pominięte
// w obu wariantach jednakowo).
//
// Mnożniki dobowe pochodzą z PODSUMOWAŃ CRONÓW Z LOGÓW PRODUKCJI 2026-10-24
// (przed zawieszeniem): warm-rates 250 zadań / 6 720 wycenionych hoteli na
// przebieg, snapshot konsjerża 51 zadań / 14 trafień w cache lotów / 37 wyszukań,
// warm-flights 40 zadań, warm-flight-deals 48 zadań; każdy cron 48×/dobę.
// Strona główna ~650 renderów/dobę (2 588 linii logu ÷ 4 odczyty na render).

import { gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";

import { Redis } from "@upstash/redis";

import { flightRatesCacheKey, getCachedFlightSummary, setCachedFlightOffers } from "../../src/lib/flights/rates-cache";
import type { DisplayOffer } from "../../src/lib/flights/display";
import { lowestPrice30dAndRecord } from "../../src/lib/hotels/price-history";
import { getCachedRates, setCachedRates, type SlimRate } from "../../src/lib/hotels/rate-cache";
import { __getSharedBreakerForTests, __resetSharedRedisForTests, __setSharedRedisForTests } from "../../src/lib/redis/client";
import { __resetRedisMetricsForTests } from "../../src/lib/redis/metrics";
import { createResilientRequester } from "../../src/lib/redis/requester";
import { startMockUpstash, type MockUpstash } from "../../src/lib/redis/testing/mock-upstash";

const CTX = { checkin: "2026-11-20", checkout: "2026-11-22", adults: 2, children: [] as number[], rooms: 1, currency: "PLN" };
const PRICED_SHARE = 6720 / 12500; // z logu warm-rates 2026-10-24
const BATCH = 50;
const PRICED_PER_BATCH = Math.round(BATCH * PRICED_SHARE);

const randomToken = (chars: number) => randomBytes(Math.ceil((chars * 3) / 4)).toString("base64").slice(0, chars);

function slimRate(i: number): SlimRate {
  return {
    totalAmount: 1000 + i,
    currency: "PLN",
    roomName: "Room with 1 double bed or 2 singles, Basic",
    boardName: "Room Only",
    refundableTag: "NRFN",
    taxesIncluded: false,
    taxExtraAmount: 508.37,
  };
}
const legacyRate = (i: number) => ({ ...slimRate(i), offerId: randomToken(1100), rateId: randomToken(550) });

interface Measure {
  commands: number;
  bytes: number;
}

async function measure(mock: MockUpstash, fn: () => Promise<unknown>): Promise<Measure> {
  mock.resetStats();
  await fn();
  await new Promise((r) => setTimeout(r, 30)); // zapisy w tle (historia cen)
  return { commands: mock.stats.commands, bytes: mock.stats.bytesIn + mock.stats.bytesOut };
}

function legacyClient(mock: MockUpstash): Redis {
  return new Redis({ url: mock.url, token: mock.token });
}

function installNewClient(mock: MockUpstash): void {
  __resetSharedRedisForTests();
  __resetRedisMetricsForTests({ sink: () => {} });
  __setSharedRedisForTests(
    new Redis(createResilientRequester({ url: mock.url, token: mock.token, timeoutMs: 5000, breaker: __getSharedBreakerForTests() })),
  );
}

const hotelIds = Array.from({ length: BATCH }, (_, i) => `lp${(0x10000 + i).toString(16)}`);
const legacyKey = (id: string) => `htr:v4:${CTX.checkin}:${CTX.checkout}:2--1:PLN:${id}`;

async function main() {
  const mock = await startMockUpstash();
  const legacy = legacyClient(mock);
  installNewClient(mock);
  const rows: Array<{ unit: string; before: Measure; after: Measure }> = [];

  // 1) Zapis jednej paczki stawek (zadanie crona / pudło użytkownika).
  const legacyWrite = await measure(mock, async () => {
    const p = legacy.pipeline();
    hotelIds.forEach((id, i) => {
      if (i < PRICED_PER_BATCH) p.set(legacyKey(id), legacyRate(i), { ex: 3600 });
      else p.set(legacyKey(id), { unavailable: true }, { ex: 600 });
    });
    await p.exec();
  });
  const newWrite = await measure(mock, () =>
    setCachedRates(
      hotelIds.map((id, i) => ({ hotelId: id, rate: i < PRICED_PER_BATCH ? slimRate(i) : null })),
      CTX,
    ),
  );
  rows.push({ unit: "zapis paczki 50 stawek", before: legacyWrite, after: newWrite });

  // 2) Odczyt paczki 50 stawek przez listę wyników (MGET, wszystkie trafienia).
  const legacyRead = await measure(mock, () => legacy.mget(...hotelIds.map(legacyKey)));
  const newRead = await measure(mock, () => getCachedRates(hotelIds, CTX));
  rows.push({ unit: "odczyt paczki 50 stawek (lista wyników)", before: legacyRead, after: newRead });

  // 3) Lista ofert lotów: rozmiar jak w repo (search-offers.ts: 500 ofert ≈ 180 KB gzip).
  const flightKey = flightRatesCacheKey({
    legs: [
      { origin: "WAW", destination: "BCN", date: "2026-12-05", direction: "OUTBOUND" },
      { origin: "BCN", destination: "WAW", date: "2026-12-12", direction: "INBOUND" },
    ],
    adults: 2,
    children: 0,
    infants: 0,
    cabinClass: "ECONOMY",
    currency: "PLN",
    country: "PL",
  });
  const blob = randomToken(180 * 1024);
  const offersForSummary: DisplayOffer[] = [
    { offerId: "o", total: 959, currency: "PLN", legs: [], maxDurationMinutes: 150, hasCheckedBag: false, hasCarryOnBag: true, fares: [] },
  ];
  const legacyFlightGet = await measure(mock, async () => {
    await legacy.set(flightKey, blob, { ex: 2400 });
    mock.resetStats();
    await legacy.get(flightKey);
  });
  await setCachedFlightOffers(flightKey, offersForSummary, "warm"); // skrót obok listy
  const newFlightGet = await measure(mock, () => getCachedFlightSummary(flightKey));
  rows.push({ unit: "cron konsjerża: cena lotu z cache (trafienie)", before: legacyFlightGet, after: newFlightGet });
  const legacyFlightSet = await measure(mock, () => legacy.set(flightKey, blob, { ex: 2400 }));
  rows.push({ unit: "cron konsjerża: zapis listy ofert (pudło)", before: legacyFlightSet, after: { commands: 0, bytes: 0 } });

  // 4) Strona główna: 4 odczyty snapshotów na KAŻDY render (dynamiczny) vs cache danych Nexta.
  const dst = Object.fromEntries(
    Array.from({ length: 45 }, (_, i) => [
      `city${i}|country${i}`,
      {
        hotelFromPlnPerNight: 199 + i,
        checkin: "2026-12-26",
        checkout: "2027-01-02",
        computedAt: Date.now(),
        flightFromPln: 900 + i,
        flightDepart: "2026-12-26",
        flightReturn: "2027-01-02",
        flightComputedAt: Date.now(),
      },
    ]),
  );
  const hotfeat = {
    computedAt: Date.now(),
    hotels: Array.from({ length: 12 }, (_, i) => ({
      id: `lp${i}`,
      name: `Hotel ${i} Old Town Boutique`,
      cityLabel: "Barcelona",
      countryLabel: "Hiszpania",
      stars: 4,
      rating: 8.7,
      reviewCount: 1234,
      photo: `https://static.cupid.travel/hotels/${randomToken(24)}.jpg`,
      perNightPln: 350,
      totalPln: 700,
      checkin: "2026-11-24",
      checkout: "2026-11-26",
    })),
  };
  const fltdeal = Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => [
      `WAW-X${i}`,
      {
        routeKey: `WAW-X${i}`,
        originIata: "WAW",
        originCityLabel: "Warszawa",
        destinationIata: `X${i}`,
        destinationId: `city-${i}`,
        cityLabel: "Miasto",
        countryLabel: "Kraj",
        depart: "2026-12-01",
        returnDate: "2026-12-05",
        nights: 4,
        pricePln: 600,
        typicalPln: 700,
        savingPercent: 14,
        sampleCount: 6,
        airlineName: "Wizz Air",
        airlineCode: "W6",
        airlineLogo: "https://production.nuitee.flights/static/images/airlines/W6.png",
        stops: 0,
        durationMinutes: 190,
        computedAt: Date.now(),
      },
    ]),
  );
  await legacy.set("dstprice:v1", dst);
  await legacy.set("hotfeat:v1", hotfeat);
  await legacy.set("fltdeal:v1", fltdeal);
  await legacy.set("trustpilot:v1", { score: 4.2, reviewCount: 12, fetchedAt: Date.now() });
  const homeRender = await measure(mock, async () => {
    await legacy.get("dstprice:v1");
    await Promise.all([legacy.get("hotfeat:v1"), legacy.get("fltdeal:v1")]);
    await legacy.get("trustpilot:v1");
  });
  rows.push({ unit: "render strony głównej (4 snapshoty)", before: homeRender, after: { commands: 0, bytes: 0 } });

  // 4b) Snapshot konsjerża (csnap:v1): PRZED 51 rekordów (zamrożony segment 0),
  // 2 odczyty ACTIVE + 3 zapisy; PO pełna rotacja (~1 020 rekordów — naprawiony
  // segment), 1 odczyt + 3 zapisy. Rozmiar rośnie, bo snapshot wreszcie pokrywa
  // całą listę zadań — liczymy to uczciwie po stronie „po".
  const record = (i: number) => ({
    destId: `dest-${i % 140}`,
    cityEn: "Barcelona",
    cityPl: "Barcelona",
    countryEn: "Spain",
    countryPl: "Hiszpania",
    origin: ["WAW", "KRK", "GDN", "KTW", "WRO"][i % 5],
    destIata: "BCN",
    checkin: "2027-01-02",
    checkout: "2027-01-09",
    month: 1,
    year: 2027,
    nights: 7,
    flightPln: 450 + (i % 300),
    hotelPlnPerNight: 180 + (i % 400),
    perPersonPln: 1100 + (i % 900),
    currency: "PLN",
    tier: i % 3 === 0 ? "B" : "A",
    pricedAt: Date.now() - (i % 36000) * 1000,
    carriedForward: i % 2 === 0,
  });
  const encodeSnap = (n: number) =>
    gzipSync(
      Buffer.from(
        JSON.stringify({
          meta: { version: 1, runId: "r", builtAt: Date.now(), coverage: {}, segment: 0, segmentCount: 20 },
          records: Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, record(i)])),
        }),
        "utf8",
      ),
    ).toString("base64");
  const snapBefore = encodeSnap(51);
  const snapAfter = encodeSnap(1020);
  await legacy.set("csnap:v1:active", snapBefore);
  const csnapBefore = await measure(mock, async () => {
    await legacy.get("csnap:v1:active");
    await legacy.set("csnap:v1:build:r", snapBefore, { ex: 3600 });
    await legacy.get("csnap:v1:active");
    await legacy.set("csnap:v1:previous", snapBefore);
    await legacy.set("csnap:v1:active", snapBefore);
    await legacy.del("csnap:v1:build:r");
  });
  const newClient = new Redis(
    createResilientRequester({ url: mock.url, token: mock.token, timeoutMs: 5000, breaker: __getSharedBreakerForTests() }),
  );
  await newClient.set("csnap:v1:active", snapAfter);
  const csnapAfter = await measure(mock, async () => {
    await newClient.get("csnap:v1:active");
    await newClient.set("csnap:v1:build:r", snapAfter, { ex: 3600 });
    await newClient.set("csnap:v1:previous", snapAfter);
    await newClient.set("csnap:v1:active", snapAfter);
    await newClient.del("csnap:v1:build:r");
  });
  rows.push({ unit: "publikacja snapshotu konsjerża (51 → 1 020 rekordów)", before: csnapBefore, after: csnapAfter });

  // 4c) Snapshot „od X zł" (dstprice:v1): odczyt + zapis przy każdym przebiegu warm-rates.
  const dstBefore = await measure(mock, async () => {
    const v = await legacy.get("dstprice:v1");
    await legacy.set("dstprice:v1", v);
  });
  const dstAfter = await measure(mock, async () => {
    const v = await newClient.get("dstprice:v1");
    await newClient.set("dstprice:v1", v);
  });
  rows.push({ unit: "merge snapshotu „od X zł\" (warm-rates)", before: dstBefore, after: dstAfter });

  // 5) Strona hotelu: historia cen (Omnibus).
  const hist = `phist:v1:lpX:${CTX.checkin}:${CTX.checkout}:2--1:PLN`;
  const legacyHotelPage = await measure(mock, async () => {
    const obecne = await legacy.hget<number>(hist, "2026-10-27");
    if (!(typeof obecne === "number" && obecne <= 900)) {
      await legacy.hset(hist, { "2026-10-27": 900 });
      await legacy.expire(hist, 35 * 24 * 3600);
    }
    await legacy.hgetall(hist);
  });
  mock.store.delete(hist);
  const newHotelPage = await measure(mock, () => lowestPrice30dAndRecord("lpX", CTX, 900, new Date("2026-10-27T12:00:00Z")));
  rows.push({ unit: "wejście na stronę hotelu (1. wejście doby)", before: legacyHotelPage, after: newHotelPage });

  // ── Wynik jednostkowy ────────────────────────────────────────────────────
  const kb = (b: number) => (b / 1024).toFixed(1);
  console.log("\nJEDNOSTKI (zmierzone na atrapie):");
  console.log("jednostka | komendy przed → po | KB przed → po | redukcja transferu");
  for (const r of rows) {
    const red = r.before.bytes > 0 ? (100 * (1 - r.after.bytes / r.before.bytes)).toFixed(1) : "—";
    console.log(`${r.unit} | ${r.before.commands} → ${r.after.commands} | ${kb(r.before.bytes)} → ${kb(r.after.bytes)} | ${red}%`);
  }

  // ── Doba: mnożniki z logów produkcji 2026-10-24 ──────────────────────────
  const get = (unit: string) => rows.find((r) => r.unit === unit)!;
  const write = get("zapis paczki 50 stawek");
  const read = get("odczyt paczki 50 stawek (lista wyników)");
  const flHit = get("cron konsjerża: cena lotu z cache (trafienie)");
  const flSet = get("cron konsjerża: zapis listy ofert (pudło)");
  const home = get("render strony głównej (4 snapshoty)");
  const csnap = get("publikacja snapshotu konsjerża (51 → 1 020 rekordów)");
  const dstMerge = get("merge snapshotu „od X zł\" (warm-rates)");
  const RUNS = 48;
  // warm-rates: PRZED 250 zadań z zapisem; PO tylko 69 (23 kierunki × 3 bliskie okna).
  const warmRates = {
    before: 250 * write.before.bytes + dstMerge.before.bytes,
    after: 69 * write.after.bytes + dstMerge.after.bytes,
    cb: 250 * write.before.commands + dstMerge.before.commands,
    ca: 69 * write.after.commands + dstMerge.after.commands,
  };
  // snapshot konsjerża: PRZED 51 × (MGET + zapis pudeł) + 14 list z cache + 37 zapisów list
  // + publikacja; PO 51 × odczyt skrótu (bez zapisów list i bez stawek w cache) + publikacja.
  const concierge = {
    before:
      51 * (read.before.bytes + write.before.bytes * (1 - PRICED_SHARE)) +
      14 * flHit.before.bytes +
      37 * flSet.before.bytes +
      csnap.before.bytes,
    after: 51 * flHit.after.bytes + csnap.after.bytes,
    cb: 51 * (read.before.commands + Math.round(BATCH * (1 - PRICED_SHARE))) + 14 + 37 + csnap.before.commands,
    ca: 51 * flHit.after.commands + csnap.after.commands,
  };
  // crony lotów: PRZED zapis listy dla każdego wyszukania (40 + 48, gdy dostawca odpowiada);
  // PO warm-flights bez zmian (40 list + 40 skrótów), okazje tylko trasy z kartą (≤ 8).
  const flightCrons = {
    before: (40 + 48) * flSet.before.bytes,
    after: (40 + 8) * flSet.before.bytes,
    cb: 40 + 48,
    ca: (40 + 8) * 2,
  };
  const HOME_RENDERS = 650;
  // PO: odczyt raz na okno rewalidacji (dstprice/fltdeal 10 min, hotfeat 30 min, trustpilot 6 h).
  const homeAfterReadsPerDay = 144 + 144 + 48 + 4;
  const homePage = {
    before: HOME_RENDERS * home.before.bytes,
    after: (homeAfterReadsPerDay / 4) * home.before.bytes * 0.75, // bez base64 w odpowiedzi (≈ −25%)
    cb: HOME_RENDERS * 4,
    ca: homeAfterReadsPerDay,
  };
  const day = [
    ["warm-rates (stawki)", warmRates],
    ["snapshot konsjerża", concierge],
    ["crony lotów", flightCrons],
    ["strona główna", homePage],
  ] as const;
  console.log("\nDOBA (× 48 przebiegów cronów; strona główna 650 renderów):");
  let tb = 0;
  let ta = 0;
  let cbt = 0;
  let cat = 0;
  for (const [name, v] of day) {
    const perDayBefore = name === "strona główna" ? v.before : v.before * RUNS;
    const perDayAfter = name === "strona główna" ? v.after : v.after * RUNS;
    const cmdBefore = name === "strona główna" ? v.cb : v.cb * RUNS;
    const cmdAfter = name === "strona główna" ? v.ca : v.ca * RUNS;
    tb += perDayBefore;
    ta += perDayAfter;
    cbt += cmdBefore;
    cat += cmdAfter;
    console.log(
      `${name} | ${(perDayBefore / 1024 / 1024).toFixed(0)} MB → ${(perDayAfter / 1024 / 1024).toFixed(1)} MB/dobę | komendy ${cmdBefore} → ${cmdAfter}`,
    );
  }
  console.log(
    `RAZEM | ${(tb / 1024 / 1024 / 1024).toFixed(2)} GB → ${(ta / 1024 / 1024 / 1024).toFixed(3)} GB/dobę | ` +
      `${((tb * 30) / 1024 / 1024 / 1024).toFixed(1)} GB → ${((ta * 30) / 1024 / 1024 / 1024).toFixed(2)} GB/30 dni | ` +
      `komendy ${(cbt * 30 / 1e6).toFixed(1)} mln → ${(cat * 30 / 1e6).toFixed(2)} mln/30 dni | redukcja transferu ${(100 * (1 - ta / tb)).toFixed(1)}%`,
  );

  await mock.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
