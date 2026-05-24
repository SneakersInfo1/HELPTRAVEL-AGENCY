// LiteAPI webhook verification.
//
// Canonical scheme (per LiteAPI support 2026-05-24): the dashboard's
// "Authentication Token" feature sends the shared secret as the literal
// value of the `Authorization` header. NOT HMAC-SHA256.
//
// Configure in: LiteAPI dashboard → Developer tools → Webhooks →
//                "Authentication Token" field. Mirror the value into
//                LITEAPI_WEBHOOK_AUTH_TOKEN on Vercel.
//
// FAIL CLOSED: missing token, missing header, or mismatch → throw.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  LiteApiWebhookEventSchema,
  parseWebhookEmbeddedJson,
  type LiteApiWebhookEvent,
} from "./types";
import { LiteApiWebhookSignatureError, LiteApiValidationError } from "./errors";

export interface VerifyWebhookInput {
  rawBody: string; // raw request body — must NOT be parsed before verification
  // Either Authorization (canonical, per LiteAPI 2026-05-24) or a legacy HMAC
  // signature header. We accept both for forward/back compat; LITEAPI_WEBHOOK_AUTH_TOKEN
  // takes priority and is the only one currently supported by LiteAPI.
  authorizationHeader?: string | null;
  signatureHeader?: string | null;
  // Override the env-derived token (test seam).
  authToken?: string;
  secret?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical: Authorization header == shared token

export function verifyWebhookAuthToken(input: VerifyWebhookInput): LiteApiWebhookEvent {
  const expected = (input.authToken ?? process.env.LITEAPI_WEBHOOK_AUTH_TOKEN ?? "").trim();
  if (!expected) {
    throw new LiteApiWebhookSignatureError("LITEAPI_WEBHOOK_AUTH_TOKEN not configured");
  }
  const provided = (input.authorizationHeader ?? "").trim();
  if (!provided) {
    throw new LiteApiWebhookSignatureError("Missing Authorization header");
  }
  // Timing-safe string compare. We compare the literal token bytes; LiteAPI
  // does not document a "Bearer " prefix, but tolerate it just in case the
  // dashboard auto-formats one in.
  const normalizedProvided = provided.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(normalizedProvided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new LiteApiWebhookSignatureError("Authorization token mismatch");
  }
  return parseWebhookBody(input.rawBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy / parallel: HMAC-SHA256 signature
//
// Kept for any non-LiteAPI source that may use HMAC. NOT used by LiteAPI
// directly (their dashboard webhooks use the Authorization token above).
// Marked deprecated to discourage new callers.

/**
 * @deprecated LiteAPI uses Authorization-token verification, not HMAC.
 *             Prefer `verifyWebhookAuthToken`. Kept for any custom sender
 *             that still signs with HMAC.
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): LiteApiWebhookEvent {
  const secret = input.secret ?? process.env.LITEAPI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new LiteApiWebhookSignatureError("LITEAPI_WEBHOOK_SECRET not configured");
  }
  if (!input.signatureHeader) {
    throw new LiteApiWebhookSignatureError("Missing signature header");
  }
  const expected = createHmac("sha256", secret).update(input.rawBody).digest("hex");
  const provided = input.signatureHeader.trim();
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new LiteApiWebhookSignatureError("Webhook signature mismatch");
  }
  return parseWebhookBody(input.rawBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Shared envelope parsing

function parseWebhookBody(rawBody: string): LiteApiWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    throw new LiteApiValidationError("Webhook payload is not valid JSON", { cause: err });
  }
  const result = LiteApiWebhookEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new LiteApiValidationError("Webhook payload failed schema validation", {
      cause: result.error,
    });
  }
  return result.data;
}

export { parseWebhookEmbeddedJson };
