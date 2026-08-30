// LiteAPI HTTP client. All `/lib/liteapi/*` modules call THIS — never `fetch`
// directly. Centralizes:
//   • API key handling (X-API-Key header)
//   • base URL switching (sandbox vs production via LITEAPI_ENV)
//   • timeout via AbortController
//   • exponential-backoff retry with jitter (3 attempts on 5xx and network errors)
//   • PII-redacted request/response logging (no card data, no full email)
//   • boundary error mapping via errors.ts

import { ZodError, type ZodTypeAny, type z } from "zod";
import { assertNoProviderWriteInTests } from "@/lib/testing/production-guard";
import {
  LiteApiError,
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
  // Sesja C2 — opt-in Next.js Data Cache. When set, the underlying
  // fetch() is called with `cache: "force-cache"` + `next: {revalidate, tags}`
  // so repeated calls with the same path+query+body hit the on-disk /
  // edge cache. Booking endpoints MUST NOT set this — rates and avails
  // change with real-time inventory. Outside Next runtime (test runner,
  // tsx scripts) the option is silently ignored — fetch falls back to
  // default behavior.
  nextCache?: { revalidate: number; tags?: string[] };
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
  //
  // Important LiteAPI naming nuance (cost us a session to debug):
  //   Their dashboard exposes TWO key types per environment:
  //     • "Private API Key" (prefix `prod_0a…`, `sand_…`) — used in the
  //       `X-API-Key` header for STANDARD authentication. This is what
  //       every read AND write endpoint accepts.
  //     • "Public Key" (prefix `prod_pu…`) — only valid as part of
  //       SECURE authentication (HMAC-signed requests). Sending it in
  //       `X-API-Key` returns 401.
  //   We use Standard auth everywhere, so for our purposes the LiteAPI
  //   "Private API Key" is the authoritative key — we use it for both
  //   read-side (search/rates/places) AND booking-side calls.
  //   `LITEAPI_PROD_PUBLIC_KEY` env var, despite its name, is the HMAC
  //   key — we deliberately do NOT consume it as a fallback for X-API-Key
  //   because that produces a silent 401-loop.
  const sandboxPublic = process.env.LITEAPI_SANDBOX_KEY?.trim() || null;
  const sandboxPrivate = process.env.LITEAPI_SANDBOX_PRIVATE_KEY?.trim() || sandboxPublic;
  const prodStandardKey =
    process.env.LITEAPI_PROD_KEY?.trim() || process.env.LITEAPI_PROD_PRIVATE_KEY?.trim() || null;
  // Same key feeds both read and write paths — LiteAPI's standard auth
  // is identical across endpoints. `prodPrivate` keeps the booking-path
  // variable name for clarity at call sites.
  const prodPublic = prodStandardKey;
  const prodPrivate = prodStandardKey;
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

  // buildUrl can throw on malformed URL components (defensive — `path` is
  // hard-coded by our wrappers, but `opts.query` values come from callers and
  // could in theory be coerced badly). Wrap to keep ALL pre-fetch errors
  // typed; otherwise a TypeError from `new URL(...)` would escape unwrapped.
  let url: string;
  try {
    url = buildUrl(base, opts.path, opts.query);
  } catch (err) {
    throw new LiteApiUnknownError(
      `Failed to build LiteAPI URL for ${opts.path}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
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
      // Sesja C2 — opt-in Next.js Data Cache. Callers (search.ts, rates.ts)
      // pass nextCache for cacheable read endpoints. Booking endpoints
      // omit it → cache: "no-store" enforced.
      const fetchInit: Parameters<typeof fetch>[1] = {
        method: opts.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Key": apiKey,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      };
      if (opts.nextCache) {
        fetchInit.cache = "force-cache";
        (fetchInit as { next?: { revalidate: number; tags?: string[] } }).next = {
          revalidate: opts.nextCache.revalidate,
          tags: opts.nextCache.tags,
        };
      } else {
        fetchInit.cache = "no-store";
      }
      // Bezpiecznik testowy: pod runnerem testów nie wolno REALNIE utworzyć
      // prebooka ani rezerwacji. Przepuszcza wszystko, co ma podmieniony
      // `fetch` (czyli każdy istniejący test) i wszystkie odczyty.
      assertNoProviderWriteInTests(url);
      const res = await fetch(url, fetchInit);

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
      // Broader AbortError detection. Node 22 + undici's fetch sometimes throws
      // AbortError as a plain `Error` (name === "AbortError"), not as a
      // DOMException — happens under Vercel's serverless runtime and other
      // wrapper layers. The narrow check that only matched DOMException would
      // let the abort escape as a bare Error → bookHotel sees underlying_code=
      // UNKNOWN with no liteApiStatus/Code/Body. Caused diagnostic-blind
      // booking failure on 2026-05-24 (sid d9eaa09e).
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (isAbort) {
        if (opts.signal?.aborted) throw new LiteApiTimeoutError("Request aborted by caller");
        if (attempt < maxRetries) continue;
        throw new LiteApiTimeoutError(`Timed out after ${timeoutMs}ms`);
      }
      if (err instanceof TypeError) {
        // network fetch error (undici wraps ECONNRESET/ENOTFOUND/etc. as
        // TypeError("fetch failed") with cause set to the underlying error).
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, jitter(2 ** attempt * 200)));
          continue;
        }
        throw new LiteApiNetworkError(err.message, { cause: err });
      }
      // Pass our typed errors through unchanged (already correctly classified).
      if (err instanceof LiteApiError) throw err;
      // Catch-all: ANY other thrown value gets wrapped as LiteApiUnknownError
      // so downstream `liteApiDiag()` always has structured info to log. Before
      // this branch a non-LiteApiError / non-TypeError / non-AbortError would
      // escape as a raw Error and degenerate the [CRITICAL] log to
      // `underlying_code=UNKNOWN` with no liteApiStatus / liteApiCode /
      // liteApiBody — operator-blind. We keep the cause + original class name
      // so the next failure is fully self-diagnosable in Vercel logs.
      const errClass = err instanceof Error ? err.constructor.name : typeof err;
      const errMessage = err instanceof Error ? err.message : String(err);
      throw new LiteApiUnknownError(
        `Unhandled error from fetch (${errClass}): ${errMessage}`,
        { cause: err },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new LiteApiUnknownError("LiteAPI request failed");
}
