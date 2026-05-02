// Phase 1 unit tests for /lib/liteapi/* — pure helpers (no network).
// Network-bound contract tests against the LiteAPI sandbox are deferred to
// scripts/smoke-liteapi.ts (Phase 1 deliverable) and a Phase 8 vitest+msw
// suite that gates on PR. This file covers the boundary helpers we ship now.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LiteApiAuthError,
  LiteApiNetworkError,
  LiteApiRateExpiredError,
  LiteApiRateLimitError,
  LiteApiSoldOutError,
  LiteApiValidationError,
  liteApiErrorFromResponse,
} from "./errors";
import { resolveCountryCode } from "./search";
import { LiteApiHotelsListResponseSchema, LiteApiPrebookResponseSchema } from "./types";
import { addMinor, fromMinor, mulMinor, subMinor, toMinor } from "../money";
import { verifyWebhookSignature } from "./webhook";
import { createHmac } from "node:crypto";

test("liteApiErrorFromResponse maps statuses", () => {
  assert.ok(liteApiErrorFromResponse(401, null) instanceof LiteApiAuthError);
  assert.ok(liteApiErrorFromResponse(403, null) instanceof LiteApiAuthError);
  assert.ok(liteApiErrorFromResponse(409, null) instanceof LiteApiRateExpiredError);
  assert.ok(liteApiErrorFromResponse(410, null) instanceof LiteApiSoldOutError);
  assert.ok(liteApiErrorFromResponse(422, null) instanceof LiteApiValidationError);
  assert.ok(liteApiErrorFromResponse(429, null) instanceof LiteApiRateLimitError);
  assert.ok(liteApiErrorFromResponse(503, null) instanceof LiteApiNetworkError);
});

test("liteApiErrorFromResponse exposes Polish user-facing message", () => {
  const e = liteApiErrorFromResponse(409, { foo: 1 });
  assert.match(e.userMessagePl, /Cena.*wygasła/);
  assert.equal(e.status, 409);
  assert.equal(e.internalCode, "LITEAPI_RATE_EXPIRED");
});

test("resolveCountryCode handles common variants", () => {
  assert.equal(resolveCountryCode("Spain"), "ES");
  assert.equal(resolveCountryCode("United Kingdom"), "GB");
  assert.equal(resolveCountryCode("UK"), "GB");
  assert.equal(resolveCountryCode("PL"), "PL");
  assert.equal(resolveCountryCode("Republic of Italy"), "IT");
  assert.equal(resolveCountryCode("Atlantis"), null);
});

test("LiteApiHotelsListResponseSchema accepts the documented shape", () => {
  const ok = LiteApiHotelsListResponseSchema.safeParse({
    data: [
      {
        id: "lp101",
        name: "Sample Hotel",
        city: "Malaga",
        country: "Spain",
        latitude: 36.7,
        longitude: -4.4,
        stars: 4,
        main_photo: "https://static.cupid.travel/hotels/abc.jpg",
      },
    ],
    total: 1,
  });
  assert.ok(ok.success, ok.success ? "" : JSON.stringify(ok.error.issues));
});

test("LiteApiPrebookResponseSchema accepts SDK handle (Payments activated)", () => {
  const ok = LiteApiPrebookResponseSchema.safeParse({
    data: {
      prebookId: "pb_123",
      transactionId: "tx_abc",
      secretKey: "sk_xyz",
      hotelId: "lp101",
      rateId: "rt_1",
      price: 1234.56,
      currency: "PLN",
    },
  });
  assert.ok(ok.success);
});

test("LiteApiPrebookResponseSchema accepts response without SDK handle (Payments NOT activated)", () => {
  const ok = LiteApiPrebookResponseSchema.safeParse({
    data: { prebookId: "pb_123", price: 100, currency: "PLN" },
  });
  // Schema must NOT reject — but caller (smoke test) treats this as failure.
  assert.ok(ok.success);
});

test("money.toMinor rounds half-away-from-zero", () => {
  assert.equal(toMinor(1234.56), BigInt(123456));
  assert.equal(toMinor(0), BigInt(0));
  assert.equal(toMinor(0.005), BigInt(1));
  assert.equal(toMinor(-12.34), BigInt(-1234));
});

test("money.fromMinor produces display-only number", () => {
  assert.equal(fromMinor(BigInt(123456)), 1234.56);
  assert.equal(fromMinor(BigInt(-1234)), -12.34);
  assert.equal(fromMinor(BigInt(0)), 0);
});

test("money arithmetic stays in bigint", () => {
  const a = toMinor(100.5);
  const b = toMinor(50.25);
  assert.equal(addMinor(a, b), BigInt(15075));
  assert.equal(subMinor(a, b), BigInt(5025));
  assert.equal(mulMinor(a, 23), toMinor(23.115));
});

test("verifyWebhookSignature rejects bad signature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ type: "payment_success", timestamp: "2026-01-01T00:00:00Z", data: {} });
  assert.throws(() =>
    verifyWebhookSignature({ rawBody: body, signatureHeader: "deadbeef", secret }),
  );
  assert.throws(() =>
    verifyWebhookSignature({ rawBody: body, signatureHeader: null, secret }),
  );
});

test("verifyWebhookSignature accepts a correct signature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ type: "payment_success", timestamp: "2026-01-01T00:00:00Z", data: { ok: true } });
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  const event = verifyWebhookSignature({ rawBody: body, signatureHeader: sig, secret });
  assert.equal(event.type, "payment_success");
});
