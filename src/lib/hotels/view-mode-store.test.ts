// N2/N3 — semantyka store'ów przeżywających nawigację klienta.
//
// Oba store'y żyją w module, czyli PRZEŻYWAJĄ odmontowanie komponentu. To jest
// celowe, ale było źle pilnowane:
//
//   N2: reset trybu widoku był strzeżony `useRef`-em w `ResultsList`, a ref
//       powstaje od nowa przy każdym montowaniu. Powrót z hotelu na ten sam
//       listing wyglądał więc jak nowe wyszukiwanie i kasował tryb mapy.
//   N3: `resetFilterOptions()` nie było wołane z żadnego miejsca w repo, więc
//       opcje filtrów poprzedniego kierunku wisiały w module.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __resetViewModeStoreForTests,
  getViewMode,
  setViewMode,
  syncViewModeToSearch,
} from "./view-mode-store";
import {
  getFilterOptions,
  publishFilterOptions,
  resetFilterOptions,
} from "./filter-options-store";

const SZUKANIE_A = "2026-09-15|2026-09-17|2||1|PLN";
const SZUKANIE_B = "2026-10-01|2026-10-05|2||1|PLN";

test("N2: powrót na TO SAMO wyszukiwanie zachowuje tryb mapy", () => {
  __resetViewModeStoreForTests();

  // Gość wchodzi na listing i przełącza się na mapę.
  syncViewModeToSearch(SZUKANIE_A);
  setViewMode("map");
  assert.equal(getViewMode(), "map");

  // Wchodzi w hotel i wraca — komponent montuje się od nowa, ale wyszukiwanie
  // jest to samo. PRZED POPRAWKĄ w tym miejscu było bezwarunkowe
  // `resetViewMode()` i gość lądował na liście.
  syncViewModeToSearch(SZUKANIE_A);
  assert.equal(getViewMode(), "map", "powrót z hotelu wyrzucił gościa z mapy");
});

test("N2: zmiana wyszukiwania KASUJE tryb mapy", () => {
  __resetViewModeStoreForTests();

  syncViewModeToSearch(SZUKANIE_A);
  setViewMode("map");

  // Nowe daty = nowe wyszukiwanie. Lądowanie od razu w mapie nieznanego
  // kierunku byłoby dla gościa niezrozumiałe.
  syncViewModeToSearch(SZUKANIE_B);
  assert.equal(getViewMode(), "list");
});

test("N2: wielokrotna synchronizacja tym samym wyszukiwaniem nic nie zmienia", () => {
  __resetViewModeStoreForTests();

  syncViewModeToSearch(SZUKANIE_A);
  setViewMode("map");
  for (let i = 0; i < 10; i++) syncViewModeToSearch(SZUKANIE_A);
  assert.equal(getViewMode(), "map");
});

test("N3: reset czyści opcje filtrów poprzedniego kierunku", () => {
  resetFilterOptions();

  publishFilterOptions([
    { facilityIds: [1, 2], chain: "Hilton", latitude: 35.3, longitude: 25.1 },
    { facilityIds: [1], chain: "Hilton", latitude: 35.4, longitude: 25.2 },
  ]);
  assert.ok(getFilterOptions().poolSize > 0, "opcje kierunku A nie zostały opublikowane");
  assert.ok(getFilterOptions().chains.length > 0);

  // Gość przechodzi na inny kierunek. Zanim lista zdąży opublikować nową pulę,
  // panel filtrów NIE MOŻE pokazywać sieci z poprzedniego miasta.
  resetFilterOptions();
  assert.equal(getFilterOptions().poolSize, 0);
  assert.equal(getFilterOptions().chains.length, 0);
  assert.equal(getFilterOptions().facilities.length, 0);
  assert.equal(getFilterOptions().center, null);
});
