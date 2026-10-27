// Requester Upstash: wyłącznik, timeout, sanityzacja, klasyfikacja błędów,
// pomiar bajtów — na atrapie `fetch` (bez sieci).

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { CircuitBreaker } from "./breaker";
import { __resetRedisMetricsForTests, usageMark, usageSince } from "./metrics";
import {
  classifyHttpFailure,
  createResilientRequester,
  describeCommands,
  RedisCommandError,
  RedisUnavailableError,
  sanitizeUpstashMessage,
} from "./requester";

const QUOTA =
  "ERR This database has reached current Fixed plan limits. Please upgrade manually or enable auto upgrade on Upstash Console";

beforeEach(() => __resetRedisMetricsForTests({ sink: () => {} }));

type Call = { url: string; init: RequestInit };

function fakeFetch(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return handler(call, calls.length);
  }) as typeof fetch;
  return { fn, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function make(fetchImpl: typeof fetch, breaker = new CircuitBreaker()) {
  return {
    breaker,
    requester: createResilientRequester({
      url: "https://example-redis.upstash.io/",
      token: "tok",
      timeoutMs: 200,
      breaker,
      fetchImpl,
    }),
  };
}

test("sukces: odpowiedź JSON bez base64 — brak nagłówka Upstash-Encoding, liczone bajty i komendy", async () => {
  const f = fakeFetch(() => json(200, { result: "wartość" }));
  const { requester } = make(f.fn);
  const mark = usageMark();
  const res = await requester.request({ body: ["get", "htr:v5:k"] });
  assert.deepEqual(res, { result: "wartość" });
  const headers = f.calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Upstash-Encoding"], undefined, "bez kodowania base64 odpowiedzi");
  assert.equal(headers.Authorization, "Bearer tok");
  assert.equal(f.calls[0].url, "https://example-redis.upstash.io", "bez podwójnego ukośnika");
  assert.equal(f.calls[0].init.cache, "no-store");
  const used = usageSince(mark);
  assert.equal(used.commands, 1);
  assert.equal(used.requests, 1);
  assert.equal(used.bytesOut, Buffer.byteLength(JSON.stringify(["get", "htr:v5:k"])));
  assert.equal(used.bytesIn, Buffer.byteLength(JSON.stringify({ result: "wartość" })));
});

test("potok: komendy liczone pojedynczo, ścieżka /pipeline", async () => {
  const f = fakeFetch(() => json(200, [{ result: "OK" }, { result: "OK" }, { result: "OK" }]));
  const { requester } = make(f.fn);
  const mark = usageMark();
  await requester.request({ path: ["pipeline"], body: [["set", "a", "1"], ["set", "b", "2"], ["set", "c", "3"]] });
  assert.equal(f.calls[0].url, "https://example-redis.upstash.io/pipeline");
  assert.equal(usageSince(mark).commands, 3);
});

test("limit planu: wyjątek RedisUnavailableError(quota) BEZ payloadu, obwód od razu otwarty, kolejne żądania bez sieci", async () => {
  const f = fakeFetch(() => json(400, { error: QUOTA }));
  const { requester, breaker } = make(f.fn);
  const secretPayload = ["set", "booking:v1:session:abc", JSON.stringify({ holder: { email: "jan@example.com" }, secretKey: "pi_123_secret_456" })];
  await assert.rejects(
    () => requester.request({ body: secretPayload }),
    (err: unknown) => {
      assert.ok(err instanceof RedisUnavailableError);
      assert.equal(err.reason, "quota");
      assert.match(err.message, /Fixed plan limits/);
      assert.match(err.message, /cmd: set/);
      assert.doesNotMatch(err.message, /jan@example\.com|secret|booking:v1/, "żadnych danych z payloadu");
      return true;
    },
  );
  assert.equal(breaker.snapshot().state, "open");
  const before = f.calls.length;
  await assert.rejects(() => requester.request({ body: ["get", "x"] }), (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "circuit_open");
    return true;
  });
  assert.equal(f.calls.length, before, "przy otwartym obwodzie zero zapytań HTTP");
});

test("NOSCRIPT to błąd LOGICZNY: RedisCommandError z kodem, obwód zostaje zamknięty", async () => {
  const f = fakeFetch(() => json(400, { error: "NOSCRIPT No matching script. Please use EVAL." }));
  const { requester, breaker } = make(f.fn);
  for (let i = 0; i < 5; i++) {
    await assert.rejects(
      () => requester.request({ body: ["evalsha", "abc", 1, "helptravel:ratelimit:x:1.2.3.4", "a"] }),
      (err: unknown) => {
        assert.ok(err instanceof RedisCommandError);
        assert.match(String(err), /NOSCRIPT/, "@upstash/ratelimit rozpoznaje NOSCRIPT po treści");
        return true;
      },
    );
  }
  assert.equal(breaker.snapshot().state, "closed");
});

test("timeout: zawieszona odpowiedź kończy się po limicie czasu jako RedisUnavailableError(timeout)", async () => {
  const f = fakeFetch(
    (call) =>
      new Promise<Response>((_, reject) => {
        call.init.signal?.addEventListener("abort", () => reject(call.init.signal?.reason));
      }),
  );
  const { requester } = make(f.fn);
  const t0 = Date.now();
  await assert.rejects(() => requester.request({ body: ["get", "k"] }), (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "timeout");
    return true;
  });
  const took = Date.now() - t0;
  assert.ok(took >= 150 && took < 2_000, `zakończone w okolicy limitu (${took} ms)`);
  assert.equal(f.calls.length, 1, "timeout NIE jest ponawiany");
});

test("błąd połączenia: jedno ponowienie, potem RedisUnavailableError(network)", async () => {
  const f = fakeFetch(() => {
    throw new TypeError("fetch failed");
  });
  const { requester } = make(f.fn);
  await assert.rejects(() => requester.request({ body: ["get", "k"] }), (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "network");
    return true;
  });
  assert.equal(f.calls.length, 2, "dokładnie jedno ponowienie, nie 5 jak w SDK");
});

test("błąd połączenia, potem sukces → wynik z drugiej próby", async () => {
  const f = fakeFetch((_, n) => {
    if (n === 1) throw new TypeError("fetch failed");
    return json(200, { result: "PONG" });
  });
  const { requester, breaker } = make(f.fn);
  assert.deepEqual(await requester.request({ body: ["ping"] }), { result: "PONG" });
  assert.equal(breaker.snapshot().state, "closed");
});

test("HTTP 5xx trzy razy z rzędu → obwód otwarty (błąd przejściowy)", async () => {
  const f = fakeFetch(() => json(503, { error: "Service Unavailable" }));
  const { requester, breaker } = make(f.fn);
  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => requester.request({ body: ["get", "k"] }), RedisUnavailableError);
  }
  assert.equal(breaker.snapshot().state, "open");
  assert.equal(breaker.snapshot().lastFailureKind, "server");
});

test("401 = auth (trwałe), otwiera od razu", async () => {
  const f = fakeFetch(() => json(401, { error: "Unauthorized" }));
  const { requester, breaker } = make(f.fn);
  await assert.rejects(() => requester.request({ body: ["get", "k"] }), (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "auth");
    return true;
  });
  assert.equal(breaker.snapshot().state, "open");
});

test("próba half-open, która padła na serializacji, zwalnia obwód (bez zawieszenia)", async () => {
  let t = 0;
  const breaker = new CircuitBreaker({ now: () => t, persistentOpenMs: 10 });
  breaker.recordFailure(breaker.tryAcquire()!, "quota");
  t = 10;
  const f = fakeFetch(() => json(200, { result: "OK" }));
  const { requester } = make(f.fn, breaker);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  await assert.rejects(() => requester.request({ body: ["set", "k", cyclic] }));
  assert.equal(breaker.wouldAllow(), true, "kolejna próba możliwa");
  assert.deepEqual(await requester.request({ body: ["set", "k", "v"] }), { result: "OK" });
  assert.equal(breaker.snapshot().state, "closed");
});

test("klasyfikacja komunikatów Upstash", () => {
  assert.equal(classifyHttpFailure(400, QUOTA), "quota");
  assert.equal(classifyHttpFailure(400, "ERR max requests limit exceeded. Limit: 10000, Usage: 10000"), "quota");
  assert.equal(classifyHttpFailure(400, "ERR max daily request limit exceeded"), "quota");
  assert.equal(classifyHttpFailure(429, "ERR max requests limit exceeded"), "quota", "429 Z treścią o limicie planu");
  assert.equal(classifyHttpFailure(429, "Too Many Requests"), "server", "goły 429 = chwilowy throttling, nie limit planu");
  assert.equal(classifyHttpFailure(401, "Unauthorized"), "auth");
  assert.equal(classifyHttpFailure(404, "Not Found"), "config", "zły adres bazy to nie błąd komendy");
  assert.equal(classifyHttpFailure(405, "Method Not Allowed"), "config");
  assert.equal(classifyHttpFailure(408, "Request Timeout"), "timeout");
  assert.equal(classifyHttpFailure(400, "WRONGTYPE Operation against a key holding the wrong kind of value"), "command");
  assert.equal(classifyHttpFailure(400, "ERR max request size exceeded"), "command");
  assert.equal(classifyHttpFailure(502, "Bad Gateway"), "server");
});

test("ponawianie TYLKO komend idempotentnych: SET NX, skrypty i transakcje — nigdy", async () => {
  const f = fakeFetch(() => {
    throw new TypeError("fetch failed");
  });
  const { requester } = make(f.fn);
  const cases: Array<{ req: Parameters<typeof requester.request>[0]; calls: number }> = [
    { req: { body: ["set", "lock:job", "owner", "nx", "ex", 360] }, calls: 1 },
    { req: { body: ["evalsha", "sha", 1, "helptravel:ratelimit:x:1.2.3.4", "1"] }, calls: 1 },
    { req: { path: ["multi-exec"], body: [["set", "a", "1"], ["set", "b", "2"]] }, calls: 1 },
    { req: { path: ["pipeline"], body: [["set", "a", "1"], ["incr", "n"]] }, calls: 1 },
    { req: { body: ["mget", "a", "b"] }, calls: 2 },
    { req: { path: ["pipeline"], body: [["set", "a", "1", "ex", 60], ["expire", "a", 60]] }, calls: 2 },
  ];
  for (const c of cases) {
    const before = f.calls.length;
    // Nowy wyłącznik na każdy przypadek — trzy porażki z rzędu otworzyłyby obwód.
    const { requester: r } = make(f.fn);
    await assert.rejects(() => r.request(c.req), RedisUnavailableError);
    assert.equal(f.calls.length - before, c.calls, `${JSON.stringify(c.req.body).slice(0, 40)}…`);
  }
  void requester;
});

test("potok z limitem planu W ŚRODKU odpowiedzi 200 → awaria magazynu (obwód otwarty), nie sukces", async () => {
  const f = fakeFetch(() => json(200, [{ result: "OK" }, { error: QUOTA }]));
  const { requester, breaker } = make(f.fn);
  await assert.rejects(
    () => requester.request({ path: ["pipeline"], body: [["set", "a", "1"], ["set", "b", "2"]] }),
    (err: unknown) => {
      assert.ok(err instanceof RedisUnavailableError);
      assert.equal(err.reason, "quota");
      return true;
    },
  );
  assert.equal(breaker.snapshot().state, "open");
});

test("potok z błędem LOGICZNYM pozycji → odpowiedź przekazana do SDK, obwód zamknięty", async () => {
  const f = fakeFetch(() => json(200, [{ result: "OK" }, { error: "WRONGTYPE Operation against a key" }]));
  const { requester, breaker } = make(f.fn);
  const res = await requester.request({ path: ["pipeline"], body: [["set", "a", "1"], ["hget", "a", "f"]] });
  assert.ok(Array.isArray(res));
  assert.equal(breaker.snapshot().state, "closed");
});

test("read-your-writes: token z odpowiedzi wraca w kolejnym żądaniu", async () => {
  const f = fakeFetch(
    () => new Response(JSON.stringify({ result: "OK" }), { status: 200, headers: { "upstash-sync-token": "sync-123" } }),
  );
  const { requester } = make(f.fn);
  await requester.request({ body: ["set", "booking:v1:session:x", "{}"] });
  await requester.request({ body: ["get", "booking:v1:session:x"] });
  const first = f.calls[0].init.headers as Record<string, string>;
  const second = f.calls[1].init.headers as Record<string, string>;
  assert.equal(first["upstash-sync-token"], undefined);
  assert.equal(second["upstash-sync-token"], "sync-123");
  assert.equal(f.calls[0].init.keepalive, undefined, "bez keepalive (limit 64 KiB w zgodnych środowiskach)");
});

test("pomiar liczy KAŻDĄ fizyczną próbę (ponowienie = podwójny payload)", async () => {
  const f = fakeFetch((_, n) => {
    if (n === 1) throw new TypeError("fetch failed");
    return json(200, { result: null });
  });
  const { requester } = make(f.fn);
  const mark = usageMark();
  await requester.request({ body: ["get", "k"] });
  const used = usageSince(mark);
  assert.equal(used.commands, 2);
  assert.equal(used.bytesOut, 2 * Buffer.byteLength(JSON.stringify(["get", "k"])));
});

test("sanityzacja: odcina „command was: …”, skraca, jedna linia", () => {
  const raw = `${QUOTA}, command was: [["set","booking:v1:session:x","{\\"email\\":\\"a@b.pl\\"}"]]`;
  const s = sanitizeUpstashMessage(raw);
  assert.equal(s, QUOTA);
  assert.ok(sanitizeUpstashMessage("x".repeat(500)).length <= 201);
});

test("opis komend: wyłącznie nazwy, nigdy argumenty", () => {
  assert.equal(describeCommands([["get", "tajny-klucz"]], false), "cmd: get");
  assert.equal(
    describeCommands([["set", "a", "1"], ["set", "b", "2"], ["expire", "a", 1]], true),
    "pipeline: set×2, expire",
  );
});
