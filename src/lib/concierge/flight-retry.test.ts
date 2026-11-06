// Testy ponawiania wyszukania lotu pod GLOBALNYM budżetem czasu (hotfix V2.1a).
//
// Kontekst: V2.1 zmieniło `retries` z 3 na 1 przy limicie 20 s i na produkcji
// 6 z 72 wywołań padło dokładnie na tym limicie, zamieniając ofertę VALID
// w PARTIAL — mimo że KOLEJNE żądanie tej samej trasy wracało w ~1,5 s.
// Powrót do dawnych 3 prób × 30 s jest wykluczony (teoretyczne 90 s przy
// budżecie tury 50 s), więc druga próba musi mieścić się w twardym budżecie.
//
// Zegar i funkcja szukająca są WSTRZYKNIĘTE — testy nie czekają ani sekundy,
// a asercje o czasie są dokładne, nie „mniej więcej".

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LiteApiAuthError,
  LiteApiNetworkError,
  LiteApiRateExpiredError,
  LiteApiRateLimitError,
  LiteApiTimeoutError,
  LiteApiValidationError,
} from "@/lib/liteapi/errors";
import { isTransientFlightError, searchWithDeadline } from "./flight-retry";

const GLOBAL_MS = 23_000;
const FIRST_MS = 15_000;
const MIN_MS = 2_000;

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; }, at: () => t };
}

/** Scenariusz: lista zachowań kolejnych prób (czas trwania + wynik). */
function fakeSearch(
  c: ReturnType<typeof clock>,
  steps: Array<{ takes: number; throws?: unknown; returns?: string }>,
) {
  const seen: Array<{ attempt: number; timeoutMs: number }> = [];
  const fn = async ({ timeoutMs, attempt }: { timeoutMs: number; attempt: number }) => {
    seen.push({ attempt, timeoutMs });
    const step = steps[attempt - 1];
    if (!step) throw new Error(`brak scenariusza dla proby ${attempt}`);
    // Próba nigdy nie trwa dłużej niż jej limit — tak działa AbortController.
    const took = Math.min(step.takes, timeoutMs);
    c.advance(took);
    if (step.takes > timeoutMs) throw new LiteApiTimeoutError(`Timed out after ${timeoutMs}ms`);
    if (step.throws) throw step.throws;
    return step.returns!;
  };
  return { fn, seen };
}

const opts = (c: ReturnType<typeof clock>) => ({
  deadlineAt: c.at() + GLOBAL_MS,
  firstAttemptMs: FIRST_MS,
  minAttemptMs: MIN_MS,
  now: c.now,
});

// ── A. pierwsza próba pada na limicie, druga odpowiada szybko ────────────────

test("A: 1. próba timeout po 15 s, 2. odpowiada po 1,5 s → WYNIK JEST", async () => {
  const c = clock();
  const o = opts(c);
  const { fn, seen } = fakeSearch(c, [{ takes: 60_000 }, { takes: 1_500, returns: "oferty" }]);

  const res = await searchWithDeadline(fn, o);

  assert.equal(res.value, "oferty", "druga próba musi uratować to wyszukanie");
  assert.equal(res.attempts, 2);
  assert.equal(res.outcome, "ok");
  assert.equal(seen[0].timeoutMs, 15_000, "1. próba dostaje pełne 15 s");
  assert.equal(seen[1].timeoutMs, 8_000, "2. próba dostaje TYLKO resztę globalnego budżetu");
  assert.equal(c.now() - o.deadlineAt + GLOBAL_MS, 16_500, "łącznie 15 s + 1,5 s");
});

// ── B. poprawna, ale wolna odpowiedź NIE MOŻE być ubita ─────────────────────

test("B: 1. próba odpowiada poprawnie po 12 s → ZERO ponowień", async () => {
  const c = clock();
  const { fn, seen } = fakeSearch(c, [{ takes: 12_000, returns: "oferty" }]);

  const res = await searchWithDeadline(fn, opts(c));

  assert.equal(res.value, "oferty");
  assert.equal(res.attempts, 1, "poprawnego wyniku po 12 s nie wolno ponawiać");
  assert.equal(seen.length, 1);
});

test("B2: poprawna odpowiedź po 14,9 s też przechodzi (granica limitu 1. próby)", async () => {
  const c = clock();
  const { fn } = fakeSearch(c, [{ takes: 14_900, returns: "oferty" }]);
  const res = await searchWithDeadline(fn, opts(c));
  assert.equal(res.value, "oferty");
  assert.equal(res.attempts, 1);
});

// ── C. obie próby padają ────────────────────────────────────────────────────

test("C: obie próby timeout → brak wyniku, dokładnie 2 próby", async () => {
  const c = clock();
  const { fn } = fakeSearch(c, [{ takes: 60_000 }, { takes: 60_000 }]);

  const res = await searchWithDeadline(fn, opts(c));

  assert.equal(res.value, null, "brak wyniku = oferta częściowa, nie zmyślona cena");
  assert.equal(res.attempts, 2);
  assert.equal(res.outcome, "exhausted");
  assert.ok(res.lastError instanceof LiteApiTimeoutError);
});

// ── D. globalny budżet jest TWARDY ──────────────────────────────────────────

test("D: łączny czas NIGDY nie przekracza globalnego budżetu", async () => {
  for (const scenario of [
    [{ takes: 60_000 }, { takes: 60_000 }],
    [{ takes: 60_000 }, { takes: 7_000, returns: "x" }],
    [{ takes: 14_000, throws: new LiteApiRateLimitError("429") }, { takes: 60_000 }],
  ] as Array<Array<{ takes: number; throws?: unknown; returns?: string }>>) {
    const c = clock();
    const start = c.at();
    const { fn } = fakeSearch(c, scenario);
    await searchWithDeadline(fn, opts(c));
    const spent = c.now() - start;
    assert.ok(spent <= GLOBAL_MS, `zużyto ${spent} ms przy budżecie ${GLOBAL_MS} ms`);
  }
});

test("D2: gdy z budżetu zostało mniej niż minimum, druga próba w ogóle nie startuje", async () => {
  const c = clock();
  const { fn, seen } = fakeSearch(c, [{ takes: 60_000 }, { takes: 100, returns: "x" }]);
  // Budżet globalny ledwie większy od pierwszej próby: zostaje 1 s < minAttemptMs.
  const res = await searchWithDeadline(fn, {
    deadlineAt: c.at() + 16_000,
    firstAttemptMs: FIRST_MS,
    minAttemptMs: MIN_MS,
    now: c.now,
  });
  assert.equal(res.attempts, 1, "nie ma sensu startować próby, która i tak nie zdąży");
  assert.equal(res.outcome, "no-budget");
  assert.equal(seen.length, 1);
});

test("D3: budżet mniejszy niż limit 1. próby przycina TĘ próbę", async () => {
  const c = clock();
  const { fn, seen } = fakeSearch(c, [{ takes: 60_000 }]);
  await searchWithDeadline(fn, {
    deadlineAt: c.at() + 9_000,
    firstAttemptMs: FIRST_MS,
    minAttemptMs: MIN_MS,
    now: c.now,
  });
  assert.equal(seen[0].timeoutMs, 9_000, "1. próba nie może przekroczyć globalnego budżetu");
});

// ── E/F. ponawiamy TYLKO błędy przejściowe ──────────────────────────────────

test("E: 429 → druga próba", async () => {
  const c = clock();
  const { fn } = fakeSearch(c, [
    { takes: 800, throws: new LiteApiRateLimitError("429") },
    { takes: 1_200, returns: "oferty" },
  ]);
  const res = await searchWithDeadline(fn, opts(c));
  assert.equal(res.value, "oferty");
  assert.equal(res.attempts, 2);
});

test("F: 5xx (błąd sieci/serwera) → druga próba", async () => {
  const c = clock();
  const { fn } = fakeSearch(c, [
    { takes: 900, throws: new LiteApiNetworkError("HTTP 500") },
    { takes: 1_100, returns: "oferty" },
  ]);
  const res = await searchWithDeadline(fn, opts(c));
  assert.equal(res.value, "oferty");
  assert.equal(res.attempts, 2);
});

// ── G. błędy deterministyczne — dokładnie jedna próba ───────────────────────

test("G: walidacja → DOKŁADNIE jedna próba (ponowienie nic nie da)", async () => {
  const c = clock();
  const { fn, seen } = fakeSearch(c, [
    { takes: 300, throws: new LiteApiValidationError("HTTP 422") },
    { takes: 100, returns: "nigdy" },
  ]);
  const res = await searchWithDeadline(fn, opts(c));
  assert.equal(res.value, null);
  assert.equal(res.attempts, 1);
  assert.equal(res.outcome, "deterministic");
  assert.equal(seen.length, 1);
});

test("G2: odmowa deterministyczna dostawcy i błąd autoryzacji też bez ponowienia", async () => {
  for (const err of [new LiteApiRateExpiredError("4002"), new LiteApiAuthError("HTTP 401")]) {
    const c = clock();
    const { fn, seen } = fakeSearch(c, [{ takes: 200, throws: err }, { takes: 100, returns: "nigdy" }]);
    const res = await searchWithDeadline(fn, opts(c));
    assert.equal(res.attempts, 1, `${err.constructor.name} nie jest przejściowy`);
    assert.equal(seen.length, 1);
  }
});

// ── klasyfikator ────────────────────────────────────────────────────────────

test("isTransientFlightError: timeout, sieć/5xx i 429 są przejściowe", () => {
  assert.equal(isTransientFlightError(new LiteApiTimeoutError("t")), true);
  assert.equal(isTransientFlightError(new LiteApiNetworkError("n")), true);
  assert.equal(isTransientFlightError(new LiteApiRateLimitError("429")), true);
});

test("isTransientFlightError: walidacja, wygasła oferta, autoryzacja i śmieci — NIE", () => {
  assert.equal(isTransientFlightError(new LiteApiValidationError("v")), false);
  assert.equal(isTransientFlightError(new LiteApiRateExpiredError("4002")), false);
  assert.equal(isTransientFlightError(new LiteApiAuthError("401")), false);
  assert.equal(isTransientFlightError(new Error("cokolwiek")), false);
  assert.equal(isTransientFlightError(null), false);
});
