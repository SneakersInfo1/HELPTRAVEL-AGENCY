import assert from "node:assert/strict";
import test from "node:test";

import { parseDiscoveryInput } from "./parser";

test("parseDiscoveryInput extracts budget, duration and visa preference", () => {
  const parsed = parseDiscoveryInput({
    query: "Chce poleciec do cieplego kraju do 2000 zl na 5 dni, bez wizy, z Polski, plaza i zwiedzanie.",
    originCity: "Warszawa",
    travelers: 2,
  });

  assert.equal(parsed.budgetMaxPln, 2000);
  assert.equal(parsed.durationMinDays, 5);
  assert.equal(parsed.durationMaxDays, 5);
  assert.equal(parsed.visaPreference, "visa_free");
  assert.equal(parsed.temperaturePreference, "warm");
  assert.equal(parsed.originCity, "Warszawa");
});
