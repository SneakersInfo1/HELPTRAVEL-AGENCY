// Alarm serii nieobsłużonych błędów serwera — na atrapie Upstash (prawdziwy
// klient, HTTP). Webhook alarmu przechwytujemy w fetch, nic nie wychodzi z maszyny.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { Redis } from "@upstash/redis";

import { __getSharedBreakerForTests, __resetSharedRedisForTests, __setSharedRedisForTests } from "@/lib/redis/client";
import { createResilientRequester } from "@/lib/redis/requester";
import { startMockUpstash, type MockUpstash } from "@/lib/redis/testing/mock-upstash";

import { __resetServerErrorsForTests, recordServerError, SERVER_ERROR_WINDOW_S } from "./server-errors";

const ENV: Record<string, string | undefined> = {
  ALERT_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/TEST",
  SERVER_ERROR_ALERT_THRESHOLD: undefined,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};
const saved: Record<string, string | undefined> = {};
const NOW = Date.UTC(2031, 0, 1, 12, 0, 0);
const NEXT_WINDOW = NOW + SERVER_ERROR_WINDOW_S * 1000;

let mock: MockUpstash;
const realFetch = globalThis.fetch;
let webhooks: string[] = [];

before(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  mock = await startMockUpstash();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(mock.url)) return realFetch(input, init);
    webhooks.push(String(init?.body ?? ""));
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  __resetSharedRedisForTests();
  await mock.close();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

beforeEach(() => {
  mock.mode = "ok";
  mock.store.clear();
  __resetSharedRedisForTests();
  __resetServerErrorsForTests();
  __setSharedRedisForTests(
    new Redis(createResilientRequester({ url: mock.url, token: mock.token, timeoutMs: 400, breaker: __getSharedBreakerForTests() })),
  );
  webhooks = [];
  delete process.env.SERVER_ERROR_ALERT_THRESHOLD;
});

const REQ = { path: "/hotele/lp1", method: "GET" };
const CTX = { routePath: "/hotele/[hotelId]", routeType: "render" };

test("seria: 19 błędów bez alarmu, 20. → jeden alarm; dalsze bez alarmu i bez zapisów do Redisa", async () => {
  for (let i = 0; i < 19; i++) await recordServerError(new Error("boom"), REQ, CTX, NOW);
  assert.equal(webhooks.length, 0);

  await recordServerError(new Error("boom"), REQ, CTX, NOW);
  assert.equal(webhooks.length, 1);
  assert.match(webhooks[0], /20 nieobsłużonych błędów serwera w 10 min/);
  assert.match(webhooks[0], /\/hotele\/\[hotelId\]/);

  mock.resetStats();
  for (let i = 0; i < 30; i++) await recordServerError(new Error("boom"), REQ, CTX, NOW);
  assert.equal(webhooks.length, 1);
  assert.equal(mock.stats.commands, 0, "po progu instancja nie pisze już do Redisa w tym oknie");
});

test("alarm nie niesie query ani sekretów z adresu i z treści błędu", async () => {
  process.env.SERVER_ERROR_ALERT_THRESHOLD = "2";
  const req = { path: "/loty/platnosc/return?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_abc", method: "GET" };
  const err = new Error("fetch failed https://api.example.com/v1/x?token=tok_abc");
  for (let i = 0; i < 2; i++) await recordServerError(err, req, { routeType: "render" }, NOW);

  assert.equal(webhooks.length, 1);
  assert.match(webhooks[0], /\/loty\/platnosc\/return/);
  assert.doesNotMatch(webhooks[0], /secret_abc|payment_intent=|tok_abc/);
});

test("nowe okno liczy od zera i może zaalarmować ponownie", async () => {
  process.env.SERVER_ERROR_ALERT_THRESHOLD = "2";
  for (let i = 0; i < 3; i++) await recordServerError(new Error("a"), REQ, CTX, NOW);
  assert.equal(webhooks.length, 1);

  await recordServerError(new Error("b"), REQ, CTX, NEXT_WINDOW);
  assert.equal(webhooks.length, 1);
  await recordServerError(new Error("b"), REQ, CTX, NEXT_WINDOW);
  assert.equal(webhooks.length, 2);
});

test("magazyn odmawia (limit planu): bez wyjątku i bez alarmu", async () => {
  mock.mode = "quota";
  for (let i = 0; i < 25; i++) await recordServerError(new Error("boom"), REQ, CTX, NOW);
  // Jedyne dopuszczalne wywołanie webhooka to alarm samego klienta Redis o awarii magazynu.
  assert.equal(webhooks.filter((b) => /nieobsłużonych błędów serwera/.test(b)).length, 0);
});
