import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type LimiterKey =
  | "discovery"
  | "stays-search"
  | "flights-search"
  | "activities-search";

const LIMIT_PER_MINUTE = 20;

let warnedMissingEnv = false;
let redis: Redis | null | undefined;
const limiters = new Map<LimiterKey, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting is DISABLED.",
      );
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(key: LimiterKey): Ratelimit | null {
  const cached = limiters.get(key);
  if (cached) return cached;

  const client = getRedis();
  if (!client) return null;

  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(LIMIT_PER_MINUTE, "1 m"),
    analytics: false,
    prefix: `helptravel:ratelimit:${key}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function enforceRateLimit(
  request: NextRequest,
  key: LimiterKey,
): Promise<NextResponse | null> {
  const limiter = getLimiter(key);
  if (!limiter) return null;

  const ip = getClientIp(request);
  const result = await limiter.limit(ip);

  if (result.success) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );

  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again shortly.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}
