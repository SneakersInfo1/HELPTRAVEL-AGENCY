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
//
// 2026-10-27 (incydent limitu transferu Upstash): ping idzie przez WSPÓLNY
// klient (timeout, wyłącznik obwodu, pomiar). Przy otwartym wyłączniku NIE
// odpytujemy Redisa w ogóle — zwracamy stan wyłącznika (`circuit`) i rodzaj
// ostatniej awarii (`lastFailure`, np. `quota` = limit planu). Wcześniejszy
// „timeout 1 s" był martwy: AbortController nie był podpięty do zapytania.

import { NextResponse } from "next/server";

import {
  getSharedRedis,
  isRedisConfigured,
  redisBreakerSnapshot,
  redisCircuitAllows,
} from "@/lib/redis/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

type DependencyStatus = "ok" | "degraded" | "down" | "unconfigured";

async function checkRedis(): Promise<DependencyStatus> {
  if (!isRedisConfigured()) return "unconfigured";
  // Otwarty wyłącznik = wiemy już, że magazyn nie odpowiada. Nie płacimy za
  // kolejny ping (każdy health check co minutę to 1 440 komend na dobę).
  if (!redisCircuitAllows()) return "down";
  const redis = getSharedRedis();
  if (!redis) return "unconfigured";
  try {
    // Cheapest possible Redis call. `ping` is intentional — it's a no-op
    // server-side and confirms the round-trip works end-to-end.
    const result = (await redis.ping()) as string | null;
    return result === "PONG" ? "ok" : "degraded";
  } catch {
    return redisCircuitAllows() ? "degraded" : "down";
  }
}

export async function GET() {
  const startedAt = Date.now();
  const redisStatus = await checkRedis();
  const breaker = redisBreakerSnapshot();

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
      // Stan wyłącznika TEJ instancji — bez kluczy i bez treści błędów.
      redisCircuit: {
        state: breaker.state,
        lastFailure: breaker.lastFailureKind,
        openForMs: breaker.openUntil ? Math.max(0, breaker.openUntil - Date.now()) : 0,
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
