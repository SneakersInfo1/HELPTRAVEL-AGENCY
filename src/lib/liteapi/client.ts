// LiteAPI HTTP client. All `/lib/liteapi/*` modules call THIS — never `fetch`
// directly. Centralizes:
//   • API key handling (X-API-Key header)
//   • base URL switching (sandbox vs production via LITEAPI_ENV)
//   • timeout via AbortController
//   • exponential-backoff retry with jitter (3 attempts on 5xx and network errors)
//   • PII-redacted request/response logging (no card data, no full email)
//   • boundary error mapping via errors.ts

import { ZodError, type ZodTypeAny, type z } from "zod";
import {
  LiteApiNetworkError,
  LiteApiTimeoutError,
  LiteApiUnknownError,
  LiteApiValidationError,
  liteApiErrorFromResponse,
} from "./errors";

const SANDBOX_BASE = "https://api.sandbox.liteapi.travel/v3.0";
const PRODUCTION_BASE = "https://api.liteapi.travel/v3.0";

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface ClientRequestOptions<TSchema extends ZodTypeAny> {
  path: string;
  method: Method;
  // Use the `private` key for booking ops (prebook/book/cancel/retrieve), the
  // `public` (sandbox or prod) key otherwise.
  keyMode?: "public" | "private";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  schema: TSchema;
  timeoutMs?: number; // default 30s, override 60s for prebook/book
  retries?: number; // default 3
  signal?: AbortSignal;
}

function getEnv(): { base: string; publicKey: string | null; privateKey: string | null } {
  const env = process.env.LITEAPI_ENV?.trim() || "sandbox";
  const isProd = env === "production";
  const publicKey =
    (isProd ? process.env.LITEAPI_PROD_KEY : process.env.LITEAPI_SANDBOX_KEY) ??
    process.env.LITEAPI_API_KEY ??
    null;
  const privateKey =
    (isProd ? process.env.LITEAPI_PROD_PRIVATE_KEY : process.env.LITEAPI_SANDBOX_PRIVATE_KEY) ??
    publicKey;
  return {
    base: isProd ? PRODUCTION_BASE : SANDBOX_BASE,
    publicKey: publicKey?.trim() || null,
    privateKey: privateKey?.trim() || null,
  };
}

function buildUrl(base: string, path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && `${v}`.length > 0) {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

function redactPii<T>(value: T): T {
  // Shallow redaction — drop guest emails/phones/cards from log lines without
  // mutating the original object.
  if (!value || typeof value !== "object") return value;
  const clone = JSON.parse(JSON.stringify(value, (key, val) => {
    if (typeof val !== "string") return val;
    const k = key.toLowerCase();
    if (k.includes("email")) {
      const at = val.indexOf("@");
      return at > 1 ? `${val[0]}***${val.slice(at)}` : "***";
    }
    if (k.includes("phone") || k === "tel") return val.length > 4 ? `***${val.slice(-4)}` : "***";
    if (k.includes("card") || k === "pan" || k === "cvv" || k === "cvc") return "***REDACTED***";
    return val;
  }));
  return clone as T;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * (ms / 2));
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function liteApiRequest<TSchema extends ZodTypeAny>(
  opts: ClientRequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const env = getEnv();
  if (!env.base) throw new LiteApiUnknownError("LiteAPI base URL not configured");
  const apiKey = (opts.keyMode === "private" ? env.privateKey : env.publicKey) ?? null;
  if (!apiKey) throw new LiteApiUnknownError(`Missing LiteAPI ${opts.keyMode ?? "public"} key in env`);

  const url = buildUrl(env.base, opts.path, opts.query);
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = opts.retries ?? 3;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(url, {
        method: opts.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Key": apiKey,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      const body = await readBody(res);

      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, jitter(2 ** attempt * 200)));
          continue;
        }
        throw liteApiErrorFromResponse(res.status, redactPii(body));
      }

      const parsed = opts.schema.safeParse(body);
      if (!parsed.success) {
        const issues = (parsed.error as ZodError).issues.slice(0, 5);
        // Boundary validation failure — fail loud in dev, soft in prod.
        if (process.env.NODE_ENV !== "production") {
          console.error("[liteapi] Zod validation failed", { url, issues });
        }
        throw new LiteApiValidationError(`LiteAPI response failed validation at ${opts.path}`, {
          status: res.status,
          body: redactPii(body),
          cause: parsed.error,
        });
      }
      return parsed.data;
    } catch (err) {
      lastError = err;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        if (opts.signal?.aborted) throw new LiteApiTimeoutError("Request aborted by caller");
        if (attempt < maxRetries) continue;
        throw new LiteApiTimeoutError(`Timed out after ${timeoutMs}ms`);
      }
      if (err instanceof TypeError) {
        // network fetch error
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, jitter(2 ** attempt * 200)));
          continue;
        }
        throw new LiteApiNetworkError(err.message, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new LiteApiUnknownError("LiteAPI request failed");
}
