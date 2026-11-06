import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_CONSECUTIVE_FAILURES,
  errorStatusFromResponse,
  offersFromBody,
  runOriginFanout,
  summarizeFanout,
  type OriginStatus,
} from "./search-fanout";

const WARSAW = ["WAW", "WMI", "RDO"] as const;
const throttled: OriginStatus = { state: "error", reason: "PROVIDER_THROTTLED", message: "Wyszukiwarka lotów jest chwilowo przeciążona.", retryAt: 1_000 };

test("incydent 2026-11-03: WAW dostało 429, WMI/RDO puste → BŁĄD, nie „Brak lotów”", () => {
  const s = summarizeFanout(WARSAW, { WAW: throttled, WMI: { state: "ok", count: 0 }, RDO: { state: "ok", count: 0 } }, 0);
  assert.equal(s.outcome, "error");
  assert.deepEqual(s.failed, ["WAW"]);
  assert.equal(s.message, throttled.message);
  assert.equal(s.retryAt, 1_000);
  assert.equal(s.providerDown, false);
});

test("wszystkie lotniska odpowiedziały pustą listą → prawdziwy brak lotów", () => {
  const s = summarizeFanout(WARSAW, { WAW: { state: "ok", count: 0 }, WMI: { state: "ok", count: 0 }, RDO: { state: "ok", count: 0 } }, 0);
  assert.equal(s.outcome, "empty");
  assert.deepEqual(s.failed, []);
});

test("są oferty z WAW, WMI padło → wyniki częściowe z listą nieudanych lotnisk", () => {
  const s = summarizeFanout(WARSAW, { WAW: { state: "ok", count: 42 }, WMI: throttled, RDO: { state: "ok", count: 0 } }, 42);
  assert.equal(s.outcome, "partial");
  assert.deepEqual(s.failed, ["WMI"]);
});

test("w toku → loading, dopóki choć jedno lotnisko czeka", () => {
  assert.equal(summarizeFanout(WARSAW, { WAW: { state: "ok", count: 5 }, WMI: { state: "loading" } }, 5).outcome, "loading");
  assert.equal(summarizeFanout(WARSAW, {}, 0).settled, false);
});

test("odmowa dostępu na wszystkich lotniskach → providerDown (bez rady „spróbuj ponownie”)", () => {
  const denied: OriginStatus = { state: "error", reason: "PROVIDER_ACCESS_DENIED", message: "niedostępna" };
  const s = summarizeFanout(["WAW"], { WAW: denied }, 0);
  assert.equal(s.providerDown, true);
  assert.equal(summarizeFanout(WARSAW, { WAW: denied, WMI: throttled, RDO: denied }, 0).providerDown, false);
});

test("komunikat: pierwszy NIEpominięty błąd; pominięte lotniska tylko dziedziczą pauzę", () => {
  const skipped: OriginStatus = { ...throttled, skipped: true, message: "pominięte" };
  const s = summarizeFanout(WARSAW, { WAW: skipped, WMI: throttled, RDO: skipped }, 0);
  assert.equal(s.message, throttled.message);
});

test("odpowiedzi API → stany błędu po polsku (limiter per adres, zła data, komunikat serwera, Retry-After)", () => {
  const now = 10_000;
  const limited = errorStatusFromResponse(429, { error: "Too many requests. Please slow down and try again shortly." }, "30", now);
  assert.equal(limited.reason, "RATE_LIMITED");
  assert.equal(limited.retryAt, now + 30_000);
  assert.match(limited.message, /Za dużo wyszukiwań/);

  const invalid = errorStatusFromResponse(400, { error: "invalid_body" }, null, now);
  assert.equal(invalid.reason, "INVALID_SEARCH");
  assert.equal(invalid.retryAt, undefined);

  const paused = errorStatusFromResponse(503, { error: "PROVIDER_ERROR", reason: "PROVIDER_THROTTLED", message: "przeciążona" }, "45", now);
  assert.equal(paused.reason, "PROVIDER_THROTTLED");
  assert.equal(paused.message, "przeciążona");
  assert.equal(paused.retryAt, now + 45_000);

  assert.match(errorStatusFromResponse(502, {}, null, now).message, /Nie udało się pobrać ofert/);
});

test("ponowienie ma sens przy pauzie/awarii, nie przy złych danych ani odmowie dostępu", () => {
  const invalid: OriginStatus = { state: "error", reason: "INVALID_SEARCH", message: "zła data" };
  const denied: OriginStatus = { state: "error", reason: "PROVIDER_ACCESS_DENIED", message: "niedostępna" };
  assert.equal(summarizeFanout(["WAW"], { WAW: throttled }, 0).retryable, true);
  assert.equal(summarizeFanout(["WAW"], { WAW: invalid }, 0).retryable, false);
  assert.equal(summarizeFanout(["WAW", "KRK"], { WAW: invalid, KRK: denied }, 0).retryable, false);
  assert.equal(summarizeFanout(["WAW"], { WAW: { state: "ok", count: 3 } }, 3).retryable, false);
});

test("odrzucenie przez dostawcę (422) to złe dane, nie awaria: bez przycisku ponowienia i bez tekstu o pasażerach", () => {
  const s = errorStatusFromResponse(422, { message: "Dane oferty lub pasażera zostały odrzucone przez dostawcę.", reason: "PROVIDER_REJECTED_INPUT" }, null);
  assert.equal(s.reason, "INVALID_SEARCH");
  assert.ok(!s.message.includes("pasażera"));
  const summary = summarizeFanout(["WAW"], { WAW: s }, 0);
  assert.equal(summary.outcome, "error");
  assert.equal(summary.retryable, false);
});

// ── runOriginFanout: jeden przebieg po lotniskach ───────────────────────────

function fanout(script: Record<string, OriginStatus>, opts: { active?: () => boolean } = {}) {
  const calls: string[] = [];
  const statuses: Record<string, OriginStatus> = {};
  let inFlight = 0;
  let maxInFlight = 0;
  const run = (targets: readonly string[]) =>
    runOriginFanout(targets, {
      isActive: opts.active ?? (() => true),
      onStatuses: (patch) => Object.assign(statuses, patch),
      search: async (o) => {
        calls.push(o);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return script[o] ?? { state: "ok", count: 0 };
      },
    });
  return { run, calls, statuses, maxInFlight: () => maxInFlight };
}

const POLAND = ["WAW", "KRK", "KTW", "GDN", "WRO", "POZ"] as const;
const outage: OriginStatus = { state: "error", message: "Dostawca lotów zwrócił błąd." };

test("lotniska idą PO KOLEI, w kolejności grupy, i każde kończy ze stanem", async () => {
  const f = fanout({ WAW: { state: "ok", count: 120 } });
  const { anyOk } = await f.run(WARSAW);
  assert.deepEqual(f.calls, ["WAW", "WMI", "RDO"]);
  assert.equal(f.maxInFlight(), 1);
  assert.equal(anyOk, true);
  assert.equal(summarizeFanout(WARSAW, f.statuses, 120).outcome, "results");
});

test("pauza dostawcy na pierwszym lotnisku: reszta oznaczona bez ani jednego zapytania, z tym samym terminem", async () => {
  const f = fanout({ WAW: throttled });
  const { anyOk } = await f.run(WARSAW);
  assert.deepEqual(f.calls, ["WAW"]);
  assert.equal(anyOk, false);
  const s = summarizeFanout(WARSAW, f.statuses, 0);
  assert.equal(s.outcome, "error");
  assert.deepEqual(s.failed, ["WAW", "WMI", "RDO"]);
  assert.equal(s.retryAt, 1_000);
});

test("awaria bez pauzy: po dwóch błędach z rzędu przerywamy — ruch i czekanie nie rosną z liczbą lotnisk", async () => {
  const f = fanout(Object.fromEntries(POLAND.map((o) => [o, outage])));
  await f.run(POLAND);
  assert.equal(MAX_CONSECUTIVE_FAILURES, 2);
  assert.deepEqual(f.calls, ["WAW", "KRK"]);
  const s = summarizeFanout(POLAND, f.statuses, 0);
  assert.equal(s.outcome, "error");
  assert.equal(s.failed.length, POLAND.length);
  assert.equal(s.retryable, true);
});

test("pojedynczy błąd nie przerywa przebiegu, a sukces zeruje licznik błędów z rzędu", async () => {
  const f = fanout({ WAW: outage, KTW: outage, WRO: outage });
  await f.run(POLAND);
  assert.deepEqual(f.calls, [...POLAND]);
});

test("wyjście ze strony zatrzymuje kolejkę: bez kolejnych zapytań i bez zapisu stanu", async () => {
  let active = true;
  const f = fanout({}, { active: () => active });
  const p = f.run(WARSAW);
  active = false;
  await p;
  assert.deepEqual(f.calls, ["WAW"]);
  assert.equal(f.statuses.WAW?.state, "loading");
});

test("ponowienie: przebieg tylko po podanych (nieudanych) lotniskach", async () => {
  const f = fanout({});
  await f.run(["WMI", "RDO"]);
  assert.deepEqual(f.calls, ["WMI", "RDO"]);
});

test("błąd z terminem Retry-After przerywa przebieg od razu, także bez znanego powodu", async () => {
  const f = fanout({ WAW: { state: "error", message: "Dostawca lotów zwrócił błąd.", retryAt: 30_000 } });
  await f.run(WARSAW);
  assert.deepEqual(f.calls, ["WAW"]);
  assert.equal(summarizeFanout(WARSAW, f.statuses, 0).retryAt, 30_000);
});

test("odpowiedź 200 bez listy ofert to awaria, nie „Brak lotów”", () => {
  assert.equal(offersFromBody(null), null, "treść nie była JSON-em");
  assert.equal(offersFromBody({}), null);
  assert.equal(offersFromBody({ offers: "x" }), null);
  assert.deepEqual(offersFromBody({ offers: [] }), []);
  assert.deepEqual(offersFromBody({ offers: [{ offerId: "a" }] }), [{ offerId: "a" }]);
});
