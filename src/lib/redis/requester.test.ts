// Requester Upstash: wyłącznik, timeout, sanityzacja, klasyfikacja błędów,
// pomiar bajtów — na atrapie `fetch` (bez sieci).

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { Redis } from "@upstash/redis";

import { CircuitBreaker } from "./breaker";
import { isPersistentRedisOutage } from "./client";
import { __resetRedisMetricsForTests, usageMark, usageSince } from "./metrics";
import {
  classifyHttpFailure,
  createResilientRequester,
  describeCommands,
  isQuotaMessage,
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
  assert.equal(classifyHttpFailure(400, "ERR max monthly bandwidth limit exceeded"), "quota");
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

// Codex, przegląd 2: gołe „limit exceeded" otwierało wyłącznik jako awarię
// TRWAŁĄ (60–600 s bez magazynu) przy zwykłym dławieniu.
test("dławienie i limity rozmiaru NIE są limitem planu (nie otwierają obwodu na minuty)", () => {
  const throttles = [
    "ERR rate limit exceeded",
    "Rate limit exceeded, retry later",
    "ERR max requests per second limit exceeded",
    "ERR max commands per second limit exceeded",
    "ERR max concurrent connections exceeded",
    "limit exceeded",
    "ERR request limit exceeded: 1000/s",
  ];
  for (const m of throttles) {
    assert.equal(isQuotaMessage(m), false, m);
    assert.equal(classifyHttpFailure(429, m), "server", `429 „${m}" = chwilowe`);
    assert.equal(classifyHttpFailure(400, m), "command", `400 „${m}" = błąd komendy, serwer działa`);
  }
  for (const m of ["ERR max request size exceeded. Limit: 1048576 bytes", "ERR max data size limit exceeded", "ERR max entry size limit exceeded"]) {
    assert.equal(isQuotaMessage(m), false, m);
  }
  for (const m of [QUOTA, "ERR max requests limit exceeded. Limit: 10000, Usage: 10000", "ERR max daily request limit exceeded", "ERR monthly bandwidth limit reached", "quota exceeded"]) {
    assert.equal(isQuotaMessage(m), true, m);
  }
});

test("429 „rate limit exceeded” liczy się jak porażka CHWILOWA: obwód zamknięty po pierwszej, otwarty po trzech na krótko", async () => {
  const t = 0;
  const breaker = new CircuitBreaker({ now: () => t });
  const f = fakeFetch(() => json(429, { error: "ERR rate limit exceeded" }));
  const { requester } = make(f.fn, breaker);
  await assert.rejects(() => requester.request({ body: ["get", "k"] }), (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "server");
    return true;
  });
  assert.equal(breaker.snapshot().state, "closed", "jedna odmowa nie wyłącza magazynu");
  await assert.rejects(() => requester.request({ body: ["get", "k"] }));
  await assert.rejects(() => requester.request({ body: ["get", "k"] }));
  const s = breaker.snapshot();
  assert.equal(s.state, "open");
  assert.equal(s.lastFailureKind, "server");
  assert.equal(s.openUntil, 10_000, "okno chwilowe (10 s), nie trwałe (60 s)");
});

test("ponawianie TYLKO odczytów: zapisy (także SET EX, DEL, HSET), skrypty i transakcje — nigdy", async () => {
  const f = fakeFetch(() => {
    throw new TypeError("fetch failed");
  });
  const { requester } = make(f.fn);
  const cases: Array<{ req: Parameters<typeof requester.request>[0]; calls: number }> = [
    { req: { body: ["set", "lock:job", "owner", "nx", "ex", 360] }, calls: 1 },
    { req: { body: ["evalsha", "sha", 1, "helptravel:ratelimit:x:1.2.3.4", "1"] }, calls: 1 },
    { req: { path: ["multi-exec"], body: [["set", "a", "1"], ["set", "b", "2"]] }, calls: 1 },
    { req: { path: ["pipeline"], body: [["set", "a", "1"], ["incr", "n"]] }, calls: 1 },
    { req: { path: ["pipeline"], body: [["set", "a", "1", "ex", 60], ["expire", "a", 60]] }, calls: 1 },
    { req: { body: ["set", "booking:v1:session:x", "{}", "ex", 3600] }, calls: 1 },
    { req: { body: ["del", "a"] }, calls: 1 },
    { req: { body: ["hset", "h", "f", "1"] }, calls: 1 },
    { req: { body: ["expire", "a", 60] }, calls: 1 },
    { req: { body: ["mget", "a", "b"] }, calls: 2 },
    { req: { body: ["get", "a"] }, calls: 2 },
    { req: { path: ["pipeline"], body: [["get", "a"], ["hgetall", "h"]] }, calls: 2 },
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

// Codex, przegląd 2 (#7): błąd SERWERA osadzony w pozycji potoku nie może
// „leczyć" wyłącznika jak sukces. Błąd LOGICZNY (wyżej) — dalej może.
test("potok z błędem SERWERA w pozycji (ERR internal) → porażka chwilowa, nie sukces", async () => {
  const f = fakeFetch(() => json(200, [{ result: "OK" }, { error: "ERR internal error, please try again" }]));
  const { requester, breaker } = make(f.fn);
  for (let i = 0; i < 3; i++) {
    await assert.rejects(
      () => requester.request({ path: ["pipeline"], body: [["get", "a"], ["get", "b"]] }),
      (err: unknown) => {
        assert.ok(err instanceof RedisUnavailableError);
        assert.equal(err.reason, "server");
        return true;
      },
    );
    if (i < 2) assert.equal(breaker.snapshot().state, "closed", "chwilowa: próg 3 z rzędu");
  }
  assert.equal(breaker.snapshot().state, "open");
});

test("osadzone błędy: stan serwera = porażka, błąd ARGUMENTU (choć ze słowem „timeout”) = odpowiedź serwera", async () => {
  const serverErrors = [
    "LOADING Redis is loading the dataset in memory",
    "BUSY Redis is busy running a script",
    "ERR internal server error",
    "TRYAGAIN Multiple keys request during rehashing of slot",
  ];
  for (const error of serverErrors) {
    const f = fakeFetch(() => json(200, [{ result: "OK" }, { error }]));
    const { requester } = make(f.fn);
    await assert.rejects(
      () => requester.request({ path: ["pipeline"], body: [["get", "a"], ["get", "b"]] }),
      (err: unknown) => {
        assert.ok(err instanceof RedisUnavailableError, error);
        assert.equal(err.reason, "server", error);
        return true;
      },
    );
  }
  const logical = [
    "ERR timeout is not a float or out of range",
    "ERR value is not an integer or out of range",
    "WRONGTYPE Operation against a key",
  ];
  for (const error of logical) {
    const f = fakeFetch(() => json(200, [{ result: "OK" }, { error }]));
    const { requester, breaker } = make(f.fn);
    const res = await requester.request({ path: ["pipeline"], body: [["get", "a"], ["get", "b"]] });
    assert.ok(Array.isArray(res), error);
    assert.equal(breaker.snapshot().consecutiveFailures, 0, `${error}: nie liczy się jako awaria`);
  }
});

test("błąd LOGICZNY w potoku dociera do wołającego przez SDK (nie jest połykany)", async () => {
  const f = fakeFetch(() => json(200, [{ result: "OK" }, { error: "WRONGTYPE Operation against a key holding the wrong kind of value" }]));
  const breaker = new CircuitBreaker();
  const redis = new Redis(
    createResilientRequester({ url: "https://example-redis.upstash.io", token: "tok", timeoutMs: 200, breaker, fetchImpl: f.fn }),
  );
  const p = redis.pipeline();
  p.set("a", "1");
  p.hget("a", "f");
  await assert.rejects(() => p.exec(), /WRONGTYPE/);
  assert.equal(breaker.snapshot().state, "closed", "serwer odpowiedział — magazyn działa");
});

// Codex, przegląd 2 (B2): żądanie czekające na ponowienie nie może iść do
// sieci, gdy w czasie przerwy inne żądanie otworzyło obwód.
test("ponowienie sprawdza dzierżawę: obwód otwarty w czasie przerwy → druga próba NIE idzie do sieci", async () => {
  const breaker = new CircuitBreaker();
  const f = fakeFetch((call) => {
    const body = String(call.init.body);
    if (body.includes("odczyt-a")) throw new TypeError("fetch failed");
    return json(400, { error: QUOTA });
  });
  const { requester } = make(f.fn, breaker);
  const a = requester.request({ body: ["get", "odczyt-a"] });
  // B startuje, gdy A śpi przed ponowieniem; limit planu B otwiera obwód.
  await new Promise((r) => setTimeout(r, 10));
  await assert.rejects(() => requester.request({ body: ["get", "odczyt-b"] }), RedisUnavailableError);
  assert.equal(breaker.snapshot().state, "open");
  await assert.rejects(a, (err: unknown) => {
    assert.ok(err instanceof RedisUnavailableError);
    assert.equal(err.reason, "network");
    return true;
  });
  const callsA = f.calls.filter((c) => String(c.init.body).includes("odczyt-a")).length;
  assert.equal(callsA, 1, "A wysłane raz — bez ponowienia do otwartego obwodu");
});

test("ponowienie przy zamkniętym obwodzie nadal działa (dzierżawa aktualna)", async () => {
  const breaker = new CircuitBreaker();
  const f = fakeFetch((_, n) => {
    if (n === 1) throw new TypeError("fetch failed");
    return json(200, { result: "v" });
  });
  const { requester } = make(f.fn, breaker);
  assert.deepEqual(await requester.request({ body: ["get", "k"] }), { result: "v" });
  assert.equal(f.calls.length, 2);
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
  assert.equal(used.requests, 2, "każda fizyczna próba to osobne żądanie HTTP (Codex #14)");
  assert.equal(used.bytesOut, 2 * Buffer.byteLength(JSON.stringify(["get", "k"])));
});

test("sanityzacja: odcina „command was: …”, skraca, jedna linia", () => {
  const raw = `${QUOTA}, command was: [["set","booking:v1:session:x","{\\"email\\":\\"a@b.pl\\"}"]]`;
  const s = sanitizeUpstashMessage(raw);
  assert.equal(s, QUOTA);
  assert.ok(sanitizeUpstashMessage("x".repeat(500)).length <= 201);
});

// Codex, przegląd 2 (B3): `config` (404/405) jest trwały dla wyłącznika, więc
// też dla decyzji „nie zaczynaj pracy zależnej od zapisu" (blokada crona).
test("isPersistentRedisOutage: limit planu, autoryzacja, ZŁY ADRES i otwarty obwód — tak; chwilowe — nie", () => {
  for (const reason of ["quota", "auth", "config", "circuit_open"] as const) {
    assert.equal(isPersistentRedisOutage(new RedisUnavailableError(reason)), true, reason);
  }
  for (const reason of ["timeout", "network", "server"] as const) {
    assert.equal(isPersistentRedisOutage(new RedisUnavailableError(reason)), false, reason);
  }
  assert.equal(isPersistentRedisOutage(new RedisCommandError("WRONGTYPE")), false);
  assert.equal(isPersistentRedisOutage(new Error("x")), false);
});

test("opis komend: wyłącznie nazwy, nigdy argumenty", () => {
  assert.equal(describeCommands([["get", "tajny-klucz"]], false), "cmd: get");
  assert.equal(
    describeCommands([["set", "a", "1"], ["set", "b", "2"], ["expire", "a", 1]], true),
    "pipeline: set×2, expire",
  );
});
