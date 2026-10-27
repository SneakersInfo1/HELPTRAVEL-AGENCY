import assert from "node:assert/strict";
import { test } from "node:test";

import { createProviderGate, isProviderRefusal } from "./provider-gate";

const refusal = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

test("odmowa dostawcy = 403 albo 429 (także w `cause` i jako liteApiStatus)", () => {
  assert.equal(isProviderRefusal(refusal(403)), true);
  assert.equal(isProviderRefusal(refusal(429)), true);
  assert.equal(isProviderRefusal({ liteApiStatus: 429 }), true);
  assert.equal(isProviderRefusal(new Error("wrap", { cause: refusal(403) })), true);
  assert.equal(isProviderRefusal(refusal(500)), false);
  assert.equal(isProviderRefusal(new Error("timeout")), false);
});

test("bramka zamyka się po 3 odmowach Z RZĘDU (stan z produkcji: 40/40 × HTTP 403)", () => {
  const gate = createProviderGate(3);
  gate.onFailure(refusal(403));
  gate.onFailure(refusal(403));
  assert.equal(gate.open, true);
  gate.onFailure(refusal(403));
  assert.equal(gate.open, false);
  assert.equal(gate.lastRefusalStatus, 403);
  gate.noteSkip();
  gate.noteSkip();
  assert.equal(gate.skipped, 2);
});

test("sukces albo inny błąd przerywa serię — pojedyncze 429 nie wyłącza crona", () => {
  const gate = createProviderGate(3);
  gate.onFailure(refusal(429));
  gate.onFailure(refusal(429));
  gate.onSuccess();
  gate.onFailure(refusal(429));
  gate.onFailure(new Error("timeout"));
  gate.onFailure(refusal(429));
  assert.equal(gate.open, true);
});
