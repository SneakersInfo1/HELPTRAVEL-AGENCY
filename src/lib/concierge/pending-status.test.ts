// Testy progresywnego wskaźnika oczekiwania. Zegar jest WSTRZYKNIĘTY, więc
// przejścia i sprzątanie da się sprawdzić deterministycznie, bez renderera
// i bez czekania 10 sekund.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PENDING_STAGES,
  schedulePendingStatus,
  statusForElapsed,
  type ScheduleDeps,
} from "./pending-status";

/** Prosty zegar-atrapa: pozwala „przewinąć" czas i widzi anulowane timeouty. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const cleared: number[] = [];
  const deps: ScheduleDeps = {
    setTimer: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      cleared.push(id);
      pending.delete(id);
    },
  };
  return {
    deps,
    cleared,
    get zaplanowane() {
      return pending.size;
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending.entries()]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

test("statusForElapsed: trzy progi wg zmierzonych czasów", () => {
  assert.equal(statusForElapsed(0), "Asystent pisze");
  assert.equal(statusForElapsed(3_999), "Asystent pisze");
  assert.equal(statusForElapsed(4_000), "Sprawdzam ceny i dostępność");
  assert.equal(statusForElapsed(9_999), "Sprawdzam ceny i dostępność");
  assert.equal(statusForElapsed(10_000), "Jeszcze chwila — porównuję najlepsze opcje");
  assert.equal(statusForElapsed(60_000), "Jeszcze chwila — porównuję najlepsze opcje");
});

test("poniżej 4 s napis się NIE zmienia (szybka odpowiedź nie mruga)", () => {
  const clock = fakeClock();
  const widziane: string[] = [];
  schedulePendingStatus((l) => widziane.push(l), clock.deps);
  clock.advance(3_900);
  assert.deepEqual(widziane, [], "napis zmienił się przed 4 s");
});

test("między 4 a 10 s pojawia się drugi napis", () => {
  const clock = fakeClock();
  const widziane: string[] = [];
  schedulePendingStatus((l) => widziane.push(l), clock.deps);
  clock.advance(4_000);
  assert.deepEqual(widziane, ["Sprawdzam ceny i dostępność"]);
  clock.advance(5_000); // 9 s łącznie
  assert.deepEqual(widziane, ["Sprawdzam ceny i dostępność"], "trzeci napis za wcześnie");
});

test("po 10 s pojawia się trzeci napis", () => {
  const clock = fakeClock();
  const widziane: string[] = [];
  schedulePendingStatus((l) => widziane.push(l), clock.deps);
  clock.advance(10_000);
  assert.deepEqual(widziane, [
    "Sprawdzam ceny i dostępność",
    "Jeszcze chwila — porównuję najlepsze opcje",
  ]);
});

test("sprzątanie (odpowiedź / błąd / zamknięcie / unmount) anuluje WSZYSTKIE timeouty", () => {
  const clock = fakeClock();
  const widziane: string[] = [];
  const stop = schedulePendingStatus((l) => widziane.push(l), clock.deps);
  assert.equal(clock.zaplanowane, PENDING_STAGES.length - 1);

  stop();
  assert.equal(clock.zaplanowane, 0, "został niezaanulowany timeout");
  assert.equal(clock.cleared.length, PENDING_STAGES.length - 1);

  clock.advance(60_000);
  assert.deepEqual(widziane, [], "timeout wystrzelił po sprzątnięciu");
});

test("nowa tura nie dziedziczy timeoutów po poprzedniej", () => {
  const clock = fakeClock();
  const pierwsza: string[] = [];
  const stop1 = schedulePendingStatus((l) => pierwsza.push(l), clock.deps);
  clock.advance(3_000);
  stop1(); // odpowiedź przyszła po 3 s

  const druga: string[] = [];
  schedulePendingStatus((l) => druga.push(l), clock.deps);
  clock.advance(4_000);

  assert.deepEqual(pierwsza, [], "stary timeout odezwał się w nowej turze");
  assert.deepEqual(druga, ["Sprawdzam ceny i dostępność"], "nowa tura liczy czas od zera");
});

test("stop() wywołany dwa razy nie wybucha", () => {
  const clock = fakeClock();
  const stop = schedulePendingStatus(() => undefined, clock.deps);
  stop();
  stop();
  assert.equal(clock.zaplanowane, 0);
});
