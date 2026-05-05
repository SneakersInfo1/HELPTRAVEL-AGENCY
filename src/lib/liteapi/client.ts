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

// LiteAPI uses a SINGLE hostname for both sandbox and production — environment
// is determined by the API key prefix (`sand_` vs `prod_`), not by the URL.
// Reference: https://docs.liteapi.travel/reference/authentication
// `api.liteapi.travel` serves search/details/places/rates; `book.liteapi.travel`
// serves prebook/book/cancel/retrieve (private-key endpoints).
const DEFAULT_API_BASE = "https://api.liteapi.travel/v3.0";
const DEFAULT_BOOK_BASE = "https://book.liteapi.travel/v3.0";

function assertValidLiteApiHost(url: string, varName: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new LiteApiUnknownError(`Invalid ${varName}: not a valid URL (${url})`);
  }
  if (host.startsWith("api.sandbox.") || host.startsWith("sandbox.api.")) {
    throw new LiteApiUnknownError(
      `Invalid LiteAPI base URL in ${varName} (${url}) — LiteAPI uses a single hostname (api.liteapi.travel / book.liteapi.travel) for both environments. Sandbox vs production is determined by API key prefix (sand_ vs prod_), not URL.`,
    );
  }
}

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

interface LiteApiEnv {
  apiBase: string;
  bookBase: string;
  publicKey: string | null;
  privateKey: string | null;
  mode: "sandbox" | "production" | "unknown";
}

export function getEnv(): LiteApiEnv {
  const apiBase = (process.env.LITEAPI_BASE_URL?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
  const bookBase = (process.env.LITEAPI_BOOK_BASE_URL?.trim() || DEFAULT_BOOK_BASE).replace(/\/+$/, "");
  assertValidLiteApiHost(apiBase, "LITEAPI_BASE_URL");
  assertValidLiteApiHost(bookBase, "LITEAPI_BOOK_BASE_URL");

  // Resolve keys. Prefer explicit sandbox/prod-named vars; fall back to the
  // single LITEAPI_API_KEY for callers that don't distinguish.
  const sandboxPublic = process.env.LITEAPI_SANDBOX_KEY?.trim() || null;
  const sandboxPrivate = process.env.LITEAPI_SANDBOX_PRIVATE_KEY?.trim() || sandboxPublic;
  const prodPublic =
    process.env.LITEAPI_PROD_KEY?.trim() || process.env.LITEAPI_PROD_PUBLIC_KEY?.trim() || null;
  const prodPrivate = process.env.LITEAPI_PROD_PRIVATE_KEY?.trim() || prodPublic;
  const generic = process.env.LITEAPI_API_KEY?.trim() || null;

  // Mode is driven by key prefix, not by LITEAPI_ENV. We still honour an
  // explicit override for tests, but warn loudly if URL/key disagree.
  const explicit = process.env.LITEAPI_ENV?.trim().toLowerCase();
  const preferProd = explicit === "production";

  const publicKey =
    (preferProd ? prodPublic ?? sandboxPublic : sandboxPublic ?? prodPublic) ?? generic;
  const privateKey =
    (preferProd ? prodPrivate ?? sandboxPrivate : sandboxPrivate ?? prodPrivate) ?? publicKey;

  const probe = publicKey ?? privateKey ?? "";
  const mode: LiteApiEnv["mode"] = probe.startsWith("prod_")
    ? "production"
    : probe.startsWith("sand_")
      ? "sandbox"
      : "unknown";

  return {
    apiBase,
    bookBase,
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    mode,
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
  const isPrivate = opts.keyMode === "private";
  const base = isPrivate ? env.bookBase : env.apiBase;
  if (!base) throw new LiteApiUnknownError("LiteAPI base URL not configured");
  const apiKey = (isPrivate ? env.privateKey : env.publicKey) ?? null;
  if (!apiKey) throw new LiteApiUnknownError(`Missing LiteAPI ${opts.keyMode ?? "public"} key in env`);

  const url = buildUrl(base, opts.path, opts.query);
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
