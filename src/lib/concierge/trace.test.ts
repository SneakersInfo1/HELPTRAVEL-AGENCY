// Testy sladu tury (V2.1 §5/§6). Zegar wstrzykiwany — zero zaleznosci od
// realnego czasu, wiec asercje sa dokladne, nie „mniej wiecej".

import assert from "node:assert/strict";
import { test } from "node:test";

import { createTurnTrace, newTraceId, NOOP_TRACE } from "./trace";

function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test("trace: measure zapisuje czas etapu i przepuszcza wynik", async () => {
  const clock = fakeClock();
  const trace = createTurnTrace({ traceId: "abc", now: clock.now });

  const value = await trace.measure("liteapi.flight", async () => {
    clock.advance(1_234);
    return 42;
  });

  assert.equal(value, 42);
  const s = trace.summary();
  assert.equal(s.traceId, "abc");
  assert.deepEqual(s.spans, [{ name: "liteapi.flight", ms: 1_234 }]);
  assert.equal(s.totals["liteapi.flight"], 1_234);
  assert.equal(s.counts["liteapi.flight"], 1);
});

test("trace: etap zapisuje sie takze gdy funkcja rzuci (meta.failed)", async () => {
  const clock = fakeClock();
  const trace = createTurnTrace({ now: clock.now });

  await assert.rejects(
    trace.measure("liteapi.hotel", async () => {
      clock.advance(700);
      throw new Error("boom");
    }),
    /boom/,
  );

  const s = trace.summary();
  assert.equal(s.spans.length, 1);
  assert.equal(s.spans[0].ms, 700);
  assert.equal(s.spans[0].meta?.failed, true);
});

test("trace: ten sam etap wiele razy sumuje sie i liczy wystapienia", async () => {
  const clock = fakeClock();
  const trace = createTurnTrace({ now: clock.now });

  await trace.measure("redis.snapshot", async () => clock.advance(100));
  await trace.measure("redis.snapshot", async () => clock.advance(250));

  const s = trace.summary();
  assert.equal(s.totals["redis.snapshot"], 350);
  assert.equal(s.counts["redis.snapshot"], 2);
});

test("trace: start/stop zamyka etap raz, powtorne wywolanie nic nie dopisuje", () => {
  const clock = fakeClock();
  const trace = createTurnTrace({ now: clock.now });

  const stop = trace.start("tool.search_trips", { cacheHit: false });
  clock.advance(500);
  assert.equal(stop({ candidates: 3 }), 500);
  clock.advance(500);
  stop();

  const s = trace.summary();
  assert.equal(s.spans.length, 1);
  assert.equal(s.spans[0].ms, 500);
  assert.deepEqual(s.spans[0].meta, { cacheHit: false, candidates: 3 });
});

test("trace: traceId jest krotki i bez separatorow (nadaje sie do logu i naglowka)", () => {
  const id = newTraceId();
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.notEqual(newTraceId(), id);
});

test("trace: NOOP niczego nie zbiera i nie przeszkadza wolajacemu", async () => {
  assert.equal(await NOOP_TRACE.measure("x", async () => 7), 7);
  NOOP_TRACE.record("y", 100);
  NOOP_TRACE.start("z")();
  assert.deepEqual(NOOP_TRACE.summary().spans, []);
});
