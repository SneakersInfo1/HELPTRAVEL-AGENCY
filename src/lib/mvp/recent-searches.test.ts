// „Ostatnio wyszukiwane" — filtr wpisów.
//
// Ta lista jest jedynym miejscem na stronie głównej, gdzie treść pochodzi
// z przeglądarki użytkownika, a nie z naszego serwera. Nie da się jej więc
// sprawdzić na produkcji ani odtworzyć z logów — jedyną siatką bezpieczeństwa
// jest test czystej funkcji filtrującej.

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_RECENT_SEARCHES, usableSearches, type RecentSearch } from "./recent-searches";

const DZIS = new Date("2026-08-02T12:00:00");

function wpis(over: Partial<RecentSearch> = {}): RecentSearch {
  return {
    id: "dest:barcelona|spain|2026-09-10|2026-09-14",
    kind: "destination",
    title: "Barcelona",
    subtitle: "Hiszpania",
    checkin: "2026-09-10",
    checkout: "2026-09-14",
    guests: 2,
    rooms: 1,
    href: "/hotele/szukaj?destination=Barcelona",
    savedAt: 1_000,
    ...over,
  };
}

test("wpis z przyszłym terminem przechodzi", () => {
  assert.equal(usableSearches([wpis()], DZIS).length, 1);
});

test("wyjazd, który się skończył, wypada — karta linkuje na TE daty", () => {
  const stary = wpis({ checkin: "2026-07-01", checkout: "2026-07-05" });
  assert.deepEqual(usableSearches([stary], DZIS), []);
});

test("trwający pobyt zostaje: wyjazd w toku to nadal aktualne wyszukanie", () => {
  const wTrakcie = wpis({ checkin: "2026-07-30", checkout: "2026-08-04" });
  assert.equal(usableSearches([wTrakcie], DZIS).length, 1);
});

test("wyjazd kończący się dzisiaj jeszcze się liczy", () => {
  assert.equal(usableSearches([wpis({ checkin: "2026-07-28", checkout: "2026-08-02" })], DZIS).length, 1);
});

test("najnowsze na górze", () => {
  const kolejnosc = usableSearches(
    [
      wpis({ id: "stary", savedAt: 100 }),
      wpis({ id: "nowy", savedAt: 900 }),
      wpis({ id: "sredni", savedAt: 500 }),
    ],
    DZIS,
  ).map((w) => w.id);
  assert.deepEqual(kolejnosc, ["nowy", "sredni", "stary"]);
});

test("lista jest przycięta do limitu", () => {
  const duzo = Array.from({ length: MAX_RECENT_SEARCHES + 5 }, (_, i) =>
    wpis({ id: `w${i}`, savedAt: i }),
  );
  assert.equal(usableSearches(duzo, DZIS).length, MAX_RECENT_SEARCHES);
});

test("śmieci ze storage są odsiewane, a nie wywracają sekcji", () => {
  const brudne = [
    wpis(),
    null,
    "tekst",
    { id: "bez-tytulu", href: "/x", checkin: "2026-09-01", checkout: "2026-09-03", guests: 2, rooms: 1 },
    // Adres absolutny mógłby być przekierowaniem poza serwis — wpis
    // z localStorage nie ma prawa wskazywać na obcy host.
    wpis({ id: "obcy", href: "https://example.com/phishing" }),
  ] as RecentSearch[];
  const wynik = usableSearches(brudne, DZIS);
  assert.equal(wynik.length, 1);
  assert.equal(wynik[0].kind, "destination");
});
