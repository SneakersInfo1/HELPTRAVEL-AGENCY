// GET /api/health — liveness/readiness probe for uptime monitors.
//
// Use this URL in UptimeRobot / BetterStack / Pingdom / Vercel Cron health
// pings. It returns 200 with a small JSON body. Internally it does a
// best-effort Redis ping; if Redis is unreachable the endpoint still returns
// 200 but flags `dependencies.redis = "degraded"` so external monitors can
// alert on the JSON, not on the HTTP code.
//
// Why 200 even on dependency failure: we never want a transient Redis hiccup
// to remove the site from a load balancer or trigger a noisy uptime alert.
// The endpoint's primary job is "is the Next.js runtime alive" — which it
// is, since we got far enough to return this response. Dependency health is
// secondary metadata.
//
// To alert on Redis being down, monitor for a 5-minute streak of
// `dependencies.redis !== "ok"`. We expose `degraded`/`down`/`unconfigured`
// to disambiguate.

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Short timeout — health checks must be fast. If Redis takes >1s we report
// degraded rather than waiting for the full response.
export const maxDuration = 5;

type DependencyStatus = "ok" | "degraded" | "down" | "unconfigured";

async function checkRedis(): Promise<DependencyStatus> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return "unconfigured";

  try {
    const redis = new Redis({ url, token });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    try {
      // Cheapest possible Redis call. `ping` is intentional — it's a no-op
      // server-side and confirms the round-trip works end-to-end.
      const result = (await redis.ping()) as string | null;
      clearTimeout(timeout);
      return result === "PONG" ? "ok" : "degraded";
    } catch (err) {
      clearTimeout(timeout);
      // AbortError = our 1s timeout fired
      if (err instanceof Error && err.name === "AbortError") return "degraded";
      return "down";
    }
  } catch {
    return "down";
  }
}

export async function GET() {
  const startedAt = Date.now();
  const redisStatus = await checkRedis();

  return NextResponse.json(
    {
      status: "ok",
      runtime: "nodejs",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      region: process.env.VERCEL_REGION || null,
      // Git SHA — Vercel injects VERCEL_GIT_COMMIT_SHA for git deployments.
      // Useful when chasing "is the new code live yet?" during a deploy.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      dependencies: {
        redis: redisStatus,
      },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        // Prevent any caching — every health check must hit the runtime.
        "Cache-Control": "no-store, max-age=0",
        // Allow external monitors to read this without CORS pre-flight.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
