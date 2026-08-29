// Sender configuration + manual-resend guard rules.
//
// INCYDENT 2026-08-28 (booking 9c-OQvmqJ): a real customer's confirmation was
// rejected by Resend with HTTP 403 because the sender fell back to the
// hardcoded `onboarding@resend.dev` testing domain, which can only deliver to
// the Resend account owner. These tests lock the production sender in and keep
// the manual recovery path from ever touching payments or the provider.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  DEV_ONLY_FALLBACK_FROM,
  getDefaultFrom,
  getReplyTo,
  __resetResendClientForTests,
} from "./client";
import { planConfirmationResend } from "./resend-confirmation-guard";
import type { CompletedRecord } from "@/lib/booking/session";

const EMAIL_KEYS = [
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "EMAIL_BCC",
  "EMAIL_DEV_FALLBACK",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "VERCEL_ENV",
  "NODE_ENV",
] as const;

function withEnv(over: Record<string, string | undefined>, fn: () => void): void {
  // `process.env` is typed with read-only well-known keys (NODE_ENV); this
  // test deliberately drives them, so go through a plain-record view.
  const env = process.env as Record<string, string | undefined>;
  const prev: Record<string, string | undefined> = {};
  for (const k of EMAIL_KEYS) prev[k] = env[k];
  for (const k of EMAIL_KEYS) delete env[k];
  for (const [k, v] of Object.entries(over)) {
    if (v !== undefined) env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of EMAIL_KEYS) {
      if (prev[k] === undefined) delete env[k];
      else env[k] = prev[k];
    }
    __resetResendClientForTests();
  }
}

const PROD_FROM = "HelpTravel.pl <rezerwacje@mail.helptravel.pl>";

// ── CASE 7: production email configuration ─────────────────────────────────

test("CASE 7: production sender is the verified branded address, never onboarding@resend.dev", () => {
  withEnv(
    {
      VERCEL_ENV: "production",
      EMAIL_FROM: PROD_FROM,
      EMAIL_REPLY_TO: "kontakt@helptravel.pl",
    },
    () => {
      const from = getDefaultFrom();
      assert.equal(from, PROD_FROM);
      assert.ok(!from!.includes("resend.dev"), "production must never send from resend.dev");
      assert.equal(getReplyTo(), "kontakt@helptravel.pl");
    },
  );
});

test("CASE 7: production WITHOUT EMAIL_FROM returns null — never a silent resend.dev fallback", () => {
  withEnv({ VERCEL_ENV: "production" }, () => {
    assert.equal(getDefaultFrom(), null, "no sender is better than a sender that 403s");
  });
});

test("CASE 7: even EMAIL_DEV_FALLBACK=1 cannot enable resend.dev on production", () => {
  withEnv({ VERCEL_ENV: "production", EMAIL_DEV_FALLBACK: "1" }, () => {
    assert.equal(getDefaultFrom(), null);
  });
  withEnv({ NODE_ENV: "production", EMAIL_DEV_FALLBACK: "1" }, () => {
    assert.equal(getDefaultFrom(), null);
  });
});

test("CASE 7: dev fallback is opt-in only, and only off-production", () => {
  // Not opted in → no sender at all.
  withEnv({ VERCEL_ENV: "development" }, () => {
    assert.equal(getDefaultFrom(), null);
  });
  // Explicitly opted in, off production → the testing sender is allowed.
  withEnv({ VERCEL_ENV: "development", EMAIL_DEV_FALLBACK: "1" }, () => {
    assert.equal(getDefaultFrom(), DEV_ONLY_FALLBACK_FROM);
  });
});

test("CASE 7: a bare EMAIL_FROM address is wrapped with the brand display name", () => {
  withEnv({ VERCEL_ENV: "production", EMAIL_FROM: "rezerwacje@mail.helptravel.pl" }, () => {
    assert.equal(getDefaultFrom(), "HelpTravel.pl <rezerwacje@mail.helptravel.pl>");
  });
});

// ── CASE 8 / 9: manual resend guard ────────────────────────────────────────

const CONFIRMED: CompletedRecord = {
  bookingId: "9c-OQvmqJ",
  confirmationCode: "",
  status: "CONFIRMED",
  hotelSummary: { name: "Globales Costa de la Calma", city: "Santa Ponsa" },
  rateSummary: {
    boardName: "Room Only",
    price: 6240.43,
    currency: "PLN",
    checkin: "2026-09-10",
    checkout: "2026-09-17",
  },
  price: 6240.43,
  currency: "PLN",
  createdAt: 1787946864307,
};

test("CASE 8: manual resend for an existing CONFIRMED booking is allowed", () => {
  const plan = planConfirmationResend({
    bookingId: CONFIRMED.bookingId,
    completed: CONFIRMED,
    recipient: "marcinkubina9@gmail.com",
    from: PROD_FROM,
  });
  assert.equal(plan.allowed, true);
  assert.ok(plan.allowed);
  assert.equal(plan.recipient, "marcinkubina9@gmail.com");
  assert.equal(plan.from, PROD_FROM);
  assert.equal(plan.booking.bookingId, "9c-OQvmqJ");
  // Price and booking identity are passed through untouched.
  assert.equal(plan.booking.price, 6240.43);
  assert.equal(plan.booking.status, "CONFIRMED");
});

// Both manual-resend surfaces: the local script and the admin-only route the
// operator calls on production (where the real RESEND_API_KEY lives).
const RESEND_SURFACES = [
  ["scripts", "resend-booking-confirmation.ts"],
  ["src", "app", "api", "admin", "resend-confirmation", "route.ts"],
];

for (const parts of RESEND_SURFACES) {
  const label = parts[parts.length - 1] === "route.ts" ? "admin route" : "local script";
  test(`CASE 8: the resend ${label} can never book or charge — no such imports exist`, () => {
    // Static guarantee, not a mock: if someone later imports the booking or
    // payment machinery into this surface, this test fails.
    const src = fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
    assertCannotBookOrCharge(src);
  });
}

function assertCannotBookOrCharge(src: string): void {
  const importLines = src
    .split("\n")
    .filter((l) => l.trimStart().startsWith("import "))
    .join("\n");
  // The script has no HTTP client of its own, so whatever it cannot import it
  // cannot call. `liteapi/retrieve` (GET /bookings/{id}) is the only provider
  // module allowed in.
  for (const forbidden of [
    "bookHotel",
    "liteapi/book",
    "liteapi/prebook",
    "liteapi/payments",
    "stripe",
    "Stripe",
    "saveFailed",
    "saveCompleted",
  ]) {
    assert.ok(
      !importLines.includes(forbidden),
      `resend surface must not import anything referencing "${forbidden}"`,
    );
  }
  // ...and it must not hand-roll a request either.
  const code = src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
  for (const forbidden of ["fetch(", "bookHotel(", "saveCompleted(", "saveFailed("]) {
    assert.ok(!code.includes(forbidden), `resend surface must never call "${forbidden}"`);
  }
}

test("CASE 9: manual resend for an UNKNOWN booking is refused, nothing is sent", () => {
  const plan = planConfirmationResend({
    bookingId: "does-not-exist",
    completed: null,
    recipient: "marcinkubina9@gmail.com",
    from: PROD_FROM,
  });
  assert.equal(plan.allowed, false);
  assert.ok(!plan.allowed);
  assert.match(plan.reason, /nie znaleziono rezerwacji does-not-exist/);
});

test("CASE 9: manual resend for an UNCONFIRMED booking is refused", () => {
  for (const status of ["FAILED", "CANCELLED", "PENDING", ""]) {
    const plan = planConfirmationResend({
      bookingId: "bk_x",
      completed: { ...CONFIRMED, bookingId: "bk_x", status },
      recipient: "someone@example.com",
      from: PROD_FROM,
    });
    assert.equal(plan.allowed, false, `status "${status}" must be refused`);
  }
});

test("CASE 9: refuses without a valid recipient, and refuses to send from resend.dev", () => {
  const noRecipient = planConfirmationResend({
    bookingId: CONFIRMED.bookingId,
    completed: CONFIRMED,
    recipient: "   ",
    from: PROD_FROM,
  });
  assert.equal(noRecipient.allowed, false);

  const badRecipient = planConfirmationResend({
    bookingId: CONFIRMED.bookingId,
    completed: CONFIRMED,
    recipient: "not-an-email",
    from: PROD_FROM,
  });
  assert.equal(badRecipient.allowed, false);

  const devSender = planConfirmationResend({
    bookingId: CONFIRMED.bookingId,
    completed: CONFIRMED,
    recipient: "marcinkubina9@gmail.com",
    from: DEV_ONLY_FALLBACK_FROM,
  });
  assert.equal(devSender.allowed, false);
  assert.ok(!devSender.allowed);
  assert.match(devSender.reason, /domena testowa/);

  const noSender = planConfirmationResend({
    bookingId: CONFIRMED.bookingId,
    completed: CONFIRMED,
    recipient: "marcinkubina9@gmail.com",
    from: null,
  });
  assert.equal(noSender.allowed, false);
});
