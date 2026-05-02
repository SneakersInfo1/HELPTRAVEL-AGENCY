// LiteAPI webhook signature verification (HMAC-SHA256).
// Reference: https://docs.liteapi.travel/docs/webhooks
//
// FAIL CLOSED: any signature mismatch / missing secret throws
// LiteApiWebhookSignatureError. Caller MUST `await verifyWebhookSignature(...)`
// before trusting the payload.

import { createHmac, timingSafeEqual } from "node:crypto";
import { LiteApiWebhookEventSchema, type LiteApiWebhookEvent } from "./types";
import { LiteApiWebhookSignatureError, LiteApiValidationError } from "./errors";

export interface VerifyWebhookInput {
  rawBody: string; // raw request body — must NOT be parsed before verification
  signatureHeader: string | null;
  secret?: string;
}

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

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch (err) {
    throw new LiteApiValidationError("Webhook payload is not valid JSON", { cause: err });
  }
  const result = LiteApiWebhookEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new LiteApiValidationError("Webhook payload failed schema validation", { cause: result.error });
  }
  return result.data;
}
