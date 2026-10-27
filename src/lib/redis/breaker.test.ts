// Wyłącznik obwodu Upstash — przejścia stanów z wstrzykniętym zegarem.

import assert from "node:assert/strict";
import { test } from "node:test";

import { CircuitBreaker, type BreakerLease, type FailureKind } from "./breaker";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function lease(b: CircuitBreaker): BreakerLease {
  const l = b.tryAcquire();
  assert.ok(l, "oczekiwano dopuszczenia żądania");
  return l;
}

function fail(b: CircuitBreaker, kind: FailureKind): void {
  b.recordFailure(lease(b), kind);
}

test("zamknięty: przepuszcza, pojedyncze błędy przejściowe nie otwierają", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, failureThreshold: 3 });
  assert.equal(b.tryAcquire()?.kind, "allow");
  fail(b, "timeout");
  fail(b, "network");
  assert.equal(b.snapshot().state, "closed");
  b.recordSuccess(lease(b)); // sukces zeruje licznik
  fail(b, "timeout");
  fail(b, "timeout");
  assert.equal(b.snapshot().state, "closed");
});

test("3 przejściowe porażki z rzędu → otwarty; odrzuca bez sieci do końca okna", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, failureThreshold: 3, transientOpenMs: 10_000 });
  for (let i = 0; i < 3; i++) fail(b, "server");
  assert.equal(b.snapshot().state, "open");
  assert.equal(b.tryAcquire(), null);
  c.advance(9_999);
  assert.equal(b.tryAcquire(), null);
  c.advance(1);
  assert.equal(b.tryAcquire()?.kind, "probe", "po oknie dokładnie jedna próba");
  assert.equal(b.tryAcquire(), null, "druga równoległa próba odrzucona");
});

test("limit planu (quota) otwiera NATYCHMIAST i na dłużej niż błąd przejściowy; config też jest trwały", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, transientOpenMs: 10_000, persistentOpenMs: 60_000 });
  fail(b, "quota");
  const s = b.snapshot();
  assert.equal(s.state, "open");
  assert.equal(s.lastFailureKind, "quota");
  assert.equal(s.openUntil, c.now() + 60_000);

  const b2 = new CircuitBreaker({ now: c.now, persistentOpenMs: 60_000 });
  fail(b2, "config");
  assert.equal(b2.snapshot().state, "open");
});

test("nieudana próba half-open → ponownie otwarty z backoffem (2×), z sufitem", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, persistentOpenMs: 60_000, persistentMaxOpenMs: 200_000 });
  fail(b, "quota");
  c.advance(60_000);
  const p1 = lease(b);
  assert.equal(p1.kind, "probe");
  b.recordFailure(p1, "quota");
  assert.equal(b.snapshot().openUntil, c.now() + 120_000);
  c.advance(120_000);
  const p2 = lease(b);
  b.recordFailure(p2, "quota");
  assert.equal(b.snapshot().openUntil, c.now() + 200_000, "sufit persistentMaxOpenMs");
});

test("udana próba half-open zamyka obwód i zeruje backoff", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, persistentOpenMs: 60_000 });
  fail(b, "quota");
  c.advance(60_000);
  const probe = lease(b);
  assert.equal(probe.kind, "probe");
  b.recordSuccess(probe);
  assert.equal(b.snapshot().state, "closed");
  assert.equal(b.snapshot().reopenStreak, 0);
  assert.equal(b.tryAcquire()?.kind, "allow");
});

test("SPÓŹNIONY sukces żądania sprzed otwarcia NIE zamyka obwodu", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, failureThreshold: 3 });
  const slow = lease(b); // wpuszczone, gdy obwód był zamknięty
  for (let i = 0; i < 3; i++) fail(b, "server");
  assert.equal(b.snapshot().state, "open");
  b.recordSuccess(slow);
  assert.equal(b.snapshot().state, "open", "o wyjściu z awarii decyduje wyłącznie próba");
});

test("SPÓŹNIONA porażka nie udaje nieudanej próby i nie zwalnia jej miejsca", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, failureThreshold: 3, transientOpenMs: 1_000 });
  const slow = lease(b);
  for (let i = 0; i < 3; i++) fail(b, "server");
  c.advance(1_000);
  const probe = lease(b);
  assert.equal(probe.kind, "probe");
  b.recordFailure(slow, "timeout"); // stara odpowiedź dociera teraz
  assert.equal(b.snapshot().state, "half_open", "stan bez zmian");
  assert.equal(b.tryAcquire(), null, "miejsce próby nadal zajęte");
  b.recordSuccess(probe);
  assert.equal(b.snapshot().state, "closed");
});

test("releaseProbe: próba bez werdyktu nie blokuje obwodu na zawsze", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, persistentOpenMs: 1_000 });
  fail(b, "auth");
  c.advance(1_000);
  const probe = lease(b);
  assert.equal(probe.kind, "probe");
  b.releaseProbe(probe);
  assert.equal(b.tryAcquire()?.kind, "probe", "po zwolnieniu wolno spróbować ponownie");
});

test("wouldAllow nie zajmuje próby", () => {
  const c = clock();
  const b = new CircuitBreaker({ now: c.now, persistentOpenMs: 1_000 });
  assert.equal(b.wouldAllow(), true);
  fail(b, "quota");
  assert.equal(b.wouldAllow(), false);
  c.advance(1_000);
  assert.equal(b.wouldAllow(), true);
  assert.equal(b.wouldAllow(), true, "wielokrotne pytanie nie zużywa próby");
  assert.equal(b.tryAcquire()?.kind, "probe");
});

test("przejścia są zgłaszane (do logu) — otwarcie i zamknięcie", () => {
  const c = clock();
  const events: string[] = [];
  const b = new CircuitBreaker({ now: c.now, persistentOpenMs: 1_000 }, (from, to, info) =>
    events.push(`${from}->${to}:${info.kind ?? "-"}`),
  );
  fail(b, "quota");
  c.advance(1_000);
  b.recordSuccess(lease(b));
  assert.deepEqual(events, ["closed->open:quota", "open->half_open:quota", "half_open->closed:-"]);
});
