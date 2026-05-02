// LiteAPI User Payment SDK helpers.
//
// Architecture:
//   1. Server: prebook() returns { transactionId, secretKey }.
//   2. Client: load LiteAPI Payment SDK script, render the SDK component with
//      `secretKey`. SDK collects card / BLIK details inside its own iframe
//      (zero card data ever touches helptravel.pl).
//   3. SDK calls back with success → client posts transactionId to our
//      /api/hotels/book endpoint, server calls book() with that handle.
//
// This module exposes a typed config and a `getPaymentSdkConfig()` helper.
// The SDK script + render call lives in the front-end checkout component.

export interface UserPaymentSdkConfig {
  scriptUrl: string;
  publishableEnv: "sandbox" | "production";
}

export function getPaymentSdkConfig(): UserPaymentSdkConfig {
  const env = process.env.LITEAPI_ENV?.trim() === "production" ? "production" : "sandbox";
  return {
    // LiteAPI ships the JS SDK from this CDN per their docs. URL kept as a
    // single source of truth so we update it in one place if LiteAPI changes hosts.
    scriptUrl: "https://payment-wrapper.liteapi.travel/dist/liteapi-payment.js",
    publishableEnv: env,
  };
}

// `secretKey` is short-lived and is consumed by the SDK directly. It must
// NEVER be persisted server-side or logged. Surface a helper that defines this
// expectation for callers; actual handling happens in the React component.
export interface ClientSdkInitInput {
  secretKey: string;
  transactionId: string;
  amountMinor: bigint;
  currency: string; // "PLN"
  returnUrl: string; // /rezerwacja/oczekiwanie?session=...
  cancelUrl: string; // /hotele/rezerwacja?step=2&...
  locale?: "pl" | "en";
  preferredMethods?: Array<"blik" | "card" | "apple_pay" | "google_pay">;
}
