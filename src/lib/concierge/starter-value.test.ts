// Starter NIE MOZE byc slepa uliczka (P0 ze zgloszenia 2026-09-07).
//
// Zgloszenie: klikniecie „Plaza do 3000 zl w pazdzierniku" dalo odpowiedz
// „nie mamy swiezych cen — system wlasnie sie aktualizuje, sprobuj za chwile".
// Dwa osobne bledy: (1) produkt sam proponuje starter, wiec klikniecie go
// musi prowadzic do wartosci, (2) backend NIE MA sygnalu o trwajacym
// odswiezaniu, wiec takie zdanie jest wymyslone.
//
// Pomiar, ktory to wyjasnil: sciezka motywu pytala o 6 recznych pickow, a
// snapshot mial 133 kierunki. Przy 3000 zl/os. na pazdziernik z calego
// snapshotu kwalifikowalo sie 121 kierunkow — z szesciu pickow 5, a przy
// chudszym snapshocie zero.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createToolExecutors, type ToolDeps } from "./tools";
import { createToolContext } from "./tool-context";
import type { SnapshotRecord, ConciergeSnapshot } from "@/lib/snapshot/types";
import seedJson from "../../../data/destinations.json";

const NOW = Date.UTC(2026, 8, 7, 12); // 2026-09-07

interface SeedRec {
  id: string;
  city: { en: string; pl: string };
  country: { code: string | null; en: string; pl: string };
  vibeTagsEn?: string[];
  popularity?: number;
}
const SEED = (seedJson as { destinations: SeedRec[] }).destinations;
function seedLookup(city: string, country?: string) {
  const c = city.trim().toLowerCase();
  const k = country?.trim().toLowerCase();
  return SEED.find(
    (d) =>
      (d.city.en.toLowerCase() === c || d.city.pl.toLowerCase() === c) &&
      (!k || d.country.en.toLowerCase() === k || d.country.pl.toLowerCase() === k),
  );
}

function rec(over: Partial<SnapshotRecord> & { destId: string }): SnapshotRecord {
  const seed = SEED.find((d) => d.id === over.destId);
  return {
    cityEn: seed?.city.en ?? over.destId,
    cityPl: seed?.city.pl ?? over.destId,
    countryEn: seed?.country.en ?? "Spain",
    countryPl: seed?.country.pl ?? "Hiszpania",
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

function snapshotOf(records: SnapshotRecord[]): ConciergeSnapshot {
  const map: Record<string, SnapshotRecord> = {};
  records.forEach((r, i) => (map[`${r.destId}|${r.origin}|${r.checkin}|${r.nights}|${i}`] = r));
  return { meta: {} as ConciergeSnapshot["meta"], records: map };
}

function deps(over: Partial<ToolDeps> = {}): ToolDeps {
  return {
    readSnapshot: async () => null,
    readConciergeSnapshot: async () => null,
    resolveDest: seedLookup as ToolDeps["resolveDest"],
    listDestinationsInCountry: () => [],
    findCheapestHotel: async () => null,
    findCheapestFlight: async () => null,
    fetchHotelPhotoUrls: async () => [],
    now: () => NOW,
    ...over,
  };
}

const STARTER = { theme: "plaza", budgetPln: 3000, budgetKind: "per_person", month: 10, adults: 2, children: 0 };

// ── §8: ZERO wymyslonych komunikatow operacyjnych ───────────────────────────

const ZAKAZANE = [
  "spróbuj później",
  "spróbuj za chwilę",
  "aktualizuje",
  "za chwilę",
  "chwilowo niedostępn",
  "zaraz się pojawi",
];

function assertBezOperacyjnychObietnic(tekst: string, gdzie: string): void {
  for (const fraza of ZAKAZANE) {
    assert.ok(
      !tekst.toLowerCase().includes(fraza.toLowerCase()),
      `${gdzie} zawiera wymyslona obietnice operacyjna „${fraza}": ${tekst}`,
    );
  }
}

test("§8: PUSTY snapshot nie generuje obietnicy, ze system sie aktualizuje", async () => {
  const exec = createToolExecutors(deps());
  const res = await exec.executeSearchTrips(STARTER, createToolContext());
  assertBezOperacyjnychObietnic(`${res.reason ?? ""} ${res.note ?? ""}`, "wynik search_trips");
});

test("§8: brak kandydatow w budzecie tez nie obiecuje odswiezania", async () => {
  const snap = snapshotOf([rec({ destId: "malaga-spain", perPersonPln: 9000 })]);
  const exec = createToolExecutors(deps({ readConciergeSnapshot: async () => snap }));
  const res = await exec.executeSearchTrips({ ...STARTER, budgetPln: 500 }, createToolContext());
  assertBezOperacyjnychObietnic(`${res.reason ?? ""} ${res.note ?? ""}`, "wynik przy przekroczonym budzecie");
});

// ── §2: starter musi prowadzic do wartosci ──────────────────────────────────

test("§2/§7: PRZYPADEK ZE ZGLOSZENIA — plaza 3000 zl pazdziernik daje realne opcje", () => {
  // Snapshot BEZ ani jednego picka motywu „plaza" — dokladnie sytuacja, w
  // ktorej stara sciezka (6 pickow) zwracala pustke, choc dane istnialy.
  const records = [
    rec({ destId: "sofia-bulgaria", perPersonPln: 552 }),
    rec({ destId: "split-croatia", perPersonPln: 913 }),
    rec({ destId: "rhodes-greece", perPersonPln: 1107 }),
    rec({ destId: "corfu-greece", perPersonPln: 1741 }),
  ];
  const snap = snapshotOf(records);
  const exec = createToolExecutors(deps({ readConciergeSnapshot: async () => snap }));
  return exec.executeSearchTrips(STARTER, createToolContext()).then((res) => {
    assert.ok(res.candidates.length > 0, `brak kandydatow — slepa uliczka: ${res.reason}`);
    for (const c of res.candidates) {
      assert.ok(typeof c.perPersonPln === "number" && c.perPersonPln > 0, "kandydat bez realnej ceny");
      assert.ok((c.checkin ?? "") > "2026-09-07", `kandydat z przeszla data: ${c.checkin}`);
    }
  });
});

test("§2: RECZNY PICK motywu bije tanszy kierunek spoza picków", async () => {
  // UWAGA na dane: tagi `vibeTagsEn` w seedzie sa slabe — `beach` ma 292 z 796
  // kierunkow, w tym SOFIE, ktora lezy w gorach. Dlatego „plazowosci" nie da
  // sie z nich wiarygodnie odczytac i test tego NIE zaklada. Sygnal, ktory
  // dane realnie niosa, to reczny pick motywu (TRAVEL_MOODS) — i to on musi
  // wygrywac z tansza pozycja spoza listy.
  const snap = snapshotOf([
    rec({ destId: "sofia-bulgaria", perPersonPln: 552 }),
    rec({ destId: "malaga-spain", perPersonPln: 1061 }),
  ]);
  const exec = createToolExecutors(deps({ readConciergeSnapshot: async () => snap }));
  const res = await exec.executeSearchTrips(STARTER, createToolContext());
  assert.ok(res.candidates.length >= 2);
  assert.equal(
    res.candidates[0].cityEn,
    "Malaga",
    `pick motywu nie jest pierwszy: ${JSON.stringify(res.candidates.map((c) => c.cityEn))}`,
  );
});

// ── §3: budzet miekki w fallbacku ───────────────────────────────────────────

test("§3: nic w budzecie → pokazuje NAJBLIZSZE realne opcje z uczciwa cena", async () => {
  const snap = snapshotOf([
    rec({ destId: "rhodes-greece", perPersonPln: 3180 }),
    rec({ destId: "corfu-greece", perPersonPln: 3400 }),
  ]);
  const exec = createToolExecutors(deps({ readConciergeSnapshot: async () => snap }));
  const res = await exec.executeSearchTrips(STARTER, createToolContext());
  assert.ok(res.candidates.length > 0, `brak alternatyw ponad budzet: ${res.reason}`);
  assert.equal(res.candidates[0].perPersonPln, 3180);
  // Model MUSI wiedziec, ze to jest PONAD budzet — inaczej sklamie.
  assert.match(`${res.note ?? ""}${res.reason ?? ""}`, /ponad budżet|przekracz/iu);
  // I nie wolno udawac, ze sie miesci.
  assert.ok((res.candidates[0].zapasPln ?? 0) <= 0, "zapas nie moze byc dodatni ponad budzetem");
});
