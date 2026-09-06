// Testy kontekstu tury (V2.1 §21/§22). Dwie rzeczy, które musi gwarantować:
// memo NIE wycieka między turami, a budżet czasu jest przycięty do widełek.

import assert from "node:assert/strict";
import { test } from "node:test";

import { budgetFor, createToolContext, noopToolContext } from "./tool-context";

test("noopToolContext: KAŻDE wywołanie daje NOWY obiekt (memo nie wycieka)", () => {
  const a = noopToolContext();
  const b = noopToolContext();
  assert.notEqual(a, b, "wspólna stała pozwoliłaby snapshotowi przeżyć między turami");
  a.snapshot = Promise.resolve({});
  assert.equal(b.snapshot, undefined, "memo jednej tury nie może być widoczne w drugiej");
});

test("createToolContext: własny ślad i termin przechodzą bez zmian", () => {
  const ctx = createToolContext({ deadlineAt: 12_345 });
  assert.equal(ctx.deadlineAt, 12_345);
  assert.equal(ctx.snapshot, undefined);
  assert.match(ctx.trace.traceId, /^[0-9a-f]{12}$/);
});

test("budgetFor: bez terminu oddaje pełny limit", () => {
  const ctx = createToolContext({ deadlineAt: null });
  assert.equal(budgetFor(ctx, { min: 6_000, max: 20_000 }, 1_000), 20_000);
});

test("budgetFor: przy dużym zapasie i tak nie przekracza maksimum", () => {
  const ctx = createToolContext({ deadlineAt: 100_000 });
  assert.equal(budgetFor(ctx, { min: 6_000, max: 20_000 }, 0), 20_000);
});

test("budgetFor: kurczy się razem z budżetem tury", () => {
  const ctx = createToolContext({ deadlineAt: 10_000 });
  assert.equal(budgetFor(ctx, { min: 1_000, max: 20_000 }, 2_000), 8_000);
});

test("budgetFor: nigdy nie schodzi poniżej minimum — także po terminie", () => {
  const ctx = createToolContext({ deadlineAt: 1_000 });
  assert.equal(budgetFor(ctx, { min: 6_000, max: 20_000 }, 50_000), 6_000);
});
