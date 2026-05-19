import { getEnv } from "./client";

/**
 * Returns the LiteAPI Payment SDK environment flag ("live" | "sandbox").
 *
 * Per LiteAPI support (B4): the widget `publicKey` is an ENVIRONMENT FLAG,
 * not an API key.
 *
 * CRITICAL (B6): this flag MUST match the environment the server `prebook`
 * created the Stripe PaymentIntent in. The widget sends this flag to
 * `payment-wrapper.liteapi.travel/config`, which returns the matching Stripe
 * PUBLISHABLE key. The prebook returns the Stripe CLIENT SECRET
 * (`pi_..._secret_...`). Stripe rejects a publishable-key / client-secret
 * pair from different modes — `api.stripe.com/v1/elements?...type=payment_intent`
 * → HTTP 400, the Payment Element never mounts, and `confirmPayment()` throws
 * `IntegrationError`.
 *
 * Earlier this read `NEXT_PUBLIC_LITEAPI_ENV` — a SEPARATE client var from the
 * server's key resolution, so the two could silently drift apart (the B6 bug).
 * We now derive it from the SAME source the prebook uses: the resolved LiteAPI
 * key mode (`getEnv().mode`, decided by the `prod_`/`sand_` key prefix and
 * `LITEAPI_ENV`). Widget env and prebook env are now structurally locked
 * together. An `"unknown"` key mode falls back to `"sandbox"` (fail-safe —
 * never tell the widget "live" when the real booking mode is uncertain).
 *
 * Server-only: reads server LiteAPI key env via `getEnv()`. Called from the
 * `/hotele/rezerwacja` server component (never shipped to the browser).
 */
export function getLiteApiWidgetEnv(): "live" | "sandbox" {
  return getEnv().mode === "production" ? "live" : "sandbox";
}
