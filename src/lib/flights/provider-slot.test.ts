// Bramka slotów wyszukiwań lotów — dwie „instancje” (osobne bramki) na
// wspólnym magazynie w pamięci. Sprawdzamy to, co zawiodło na produkcji
// 2026-11-03: trzy wyszukiwania w tej samej milisekundzie.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderSlotTimeoutError, createProviderGate, providerSlotConfig, type SlotStore } from "./provider-slot";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KEY = "flgov:v1:slot:0";

type MemoryStore = SlotStore & {
  failPttl: boolean;
  get<T = unknown>(key: string): Promise<T | null>;
  del(...keys: string[]): Promise<number>;
  m: Map<string, { v: string; exp: number }>;
  fail: boolean;
  /** Odpala się PO odczycie — między sprawdzeniem właściciela a zapisem, jeśli kod robi to dwiema komendami. */
  afterGet?: () => void;
  /** Zapis wykonany, ale odpowiedź zginęła (timeout klienta). */
  loseSetReply: boolean;
};

function memoryStore(): MemoryStore {
  const m = new Map<string, { v: string; exp: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.exp <= Date.now()) {
      m.delete(k);
      return undefined;
    }
    return e;
  };
  const s: MemoryStore = {
    m,
    fail: false,
    failPttl: false,
    loseSetReply: false,
    async set(k: string, v: string, o: { nx?: boolean; px: number }) {
      if (s.fail) throw new Error("magazyn padł");
      if (o.nx && live(k)) return null;
      m.set(k, { v, exp: Date.now() + o.px });
      if (s.loseSetReply) throw new Error("timeout: odpowiedź zginęła");
      return "OK";
    },
    async get<T = unknown>(k: string) {
      if (s.fail) throw new Error("magazyn padł");
      const v = (live(k)?.v ?? null) as T | null;
      s.afterGet?.();
      return v;
    },
    async pttl(k: string) {
      if (s.fail || s.failPttl) throw new Error("magazyn padł");
      const e = live(k);
      return e ? e.exp - Date.now() : -2;
    },
    // Semantyka skryptu zwolnienia: porównanie i zmiana w JEDNYM kroku.
    async eval(_script: string, keys: string[], args: string[]) {
      if (s.fail) throw new Error("magazyn padł");
      const [key] = keys;
      const [token, spacing] = args;
      const e = live(key);
      if (!e || e.v !== token) return 0;
      if (Number(spacing) > 0) e.exp = Date.now() + Number(spacing);
      else m.delete(key);
      return 1;
    },
    async del(...ks: string[]) {
      let n = 0;
      for (const k of ks) if (m.delete(k)) n += 1;
      return n;
    },
  };
  return s;
}

const cfg = (concurrency = 1, minIntervalMs = 0) => () => ({ concurrency, minIntervalMs });

test("konfiguracja: domyślnie 1 naraz i 65 s odstępu; wartości spoza zakresu przycięte", () => {
  assert.deepEqual(providerSlotConfig({}), { concurrency: 1, minIntervalMs: 65_000 });
  assert.deepEqual(providerSlotConfig({ FLIGHTS_PROVIDER_CONCURRENCY: "9", FLIGHTS_PROVIDER_MIN_INTERVAL_MS: "-5" }), {
    concurrency: 4,
    minIntervalMs: 0,
  });
  assert.deepEqual(providerSlotConfig({ FLIGHTS_PROVIDER_CONCURRENCY: "abc", FLIGHTS_PROVIDER_MIN_INTERVAL_MS: "" }), {
    concurrency: 1,
    minIntervalMs: 65_000,
  });
  assert.equal(providerSlotConfig({ FLIGHTS_PROVIDER_MIN_INTERVAL_MS: "999999" }).minIntervalMs, 300_000);
});

test("dwie instancje, wspólny magazyn: nigdy więcej niż jedno wyszukiwanie naraz", async () => {
  const store = memoryStore();
  const g1 = createProviderGate({ store: () => store, config: cfg() });
  const g2 = createProviderGate({ store: () => store, config: cfg() });
  let inFlight = 0;
  let maxInFlight = 0;
  let done = 0;
  const job = async (g: typeof g1) => {
    const slot = await g.acquire({ maxWaitMs: 5_000, leaseMs: 10_000 });
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await sleep(30);
    inFlight -= 1;
    done += 1;
    await g.release(slot);
  };
  // Jak fan-out WAW/WMI/RDO wysłany w tej samej milisekundzie — tylko z dwóch instancji.
  await Promise.all([job(g1), job(g2), job(g1), job(g2), job(g1)]);
  assert.equal(done, 5);
  assert.equal(maxInFlight, 1);
  assert.equal(store.m.size, 0, "po zwolnieniu bez odstępu klucz slotu znika");
});

test("odstęp: zwolnienie tuż po starcie trzyma slot do końca odstępu (także dla innej instancji)", async () => {
  const store = memoryStore();
  const g1 = createProviderGate({ store: () => store, config: cfg(1, 250) });
  const g2 = createProviderGate({ store: () => store, config: cfg(1, 250) });
  const first = await g1.acquire({ maxWaitMs: 1_000, leaseMs: 10_000 });
  first.lastProviderCallAt = Date.now();
  await g1.release(first);
  const second = await g2.acquire({ maxWaitMs: 2_000, leaseMs: 10_000 });
  assert.ok(second.acquiredAt - first.acquiredAt >= 200, `odstęp ${second.acquiredAt - first.acquiredAt} ms`);
  assert.equal(second.contended, true);
  await g2.release(second);
});

test("termin czekania minął → ProviderSlotTimeoutError, kolejka instancji nie przecieka", async () => {
  const store = memoryStore();
  const g1 = createProviderGate({ store: () => store, config: cfg() });
  const g2 = createProviderGate({ store: () => store, config: cfg() });
  const held = await g1.acquire({ maxWaitMs: 1_000, leaseMs: 10_000 });
  await assert.rejects(g2.acquire({ maxWaitMs: 300, leaseMs: 10_000 }), ProviderSlotTimeoutError);
  assert.deepEqual(g2.localState, { active: 0, waiting: 0 });
  await g1.release(held);
  const next = await g2.acquire({ maxWaitMs: 1_000, leaseMs: 10_000 });
  await g2.release(next);
});

test("zwolnienie kasuje tylko WŁASNĄ dzierżawę (po wygaśnięciu slot ma już ktoś inny)", async () => {
  const store = memoryStore();
  const g1 = createProviderGate({ store: () => store, config: cfg() });
  const g2 = createProviderGate({ store: () => store, config: cfg() });
  const stale = await g1.acquire({ maxWaitMs: 1_000, leaseMs: 1_000 });
  store.m.clear(); // dzierżawa g1 wygasła
  const fresh = await g2.acquire({ maxWaitMs: 1_000, leaseMs: 10_000 });
  await g1.release(stale);
  assert.equal(store.m.get("flgov:v1:slot:0")?.v, fresh.token, "slot g2 nietknięty");
  await g2.release(fresh);
});

test("bez magazynu: bramka lokalna szereguje wyszukiwania i trzyma odstęp", async () => {
  const g = createProviderGate({ store: () => null, config: cfg(1, 150) });
  const order: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const job = async (n: number) => {
    const slot = await g.acquire({ maxWaitMs: 5_000, leaseMs: 10_000 });
    assert.equal(slot.index, null);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    order.push(n);
    slot.lastProviderCallAt = Date.now();
    inFlight -= 1;
    await g.release(slot);
    return slot.acquiredAt;
  };
  const [a, b, c] = await Promise.all([job(1), job(2), job(3)]);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(order, [1, 2, 3], "FIFO w instancji");
  assert.ok(b - a >= 120 && c - b >= 120, `odstępy ${b - a} / ${c - b} ms`);
});

test("magazyn pada, gdy wiadomo, że slot ma ktoś inny → odmowa, nie zapytanie równoległe ze znanym właścicielem", async () => {
  const store = memoryStore();
  const holder = createProviderGate({ store: () => store, config: cfg() });
  const g = createProviderGate({ store: () => store, config: cfg() });
  const held = await holder.acquire({ maxWaitMs: 1_000, leaseMs: 2_000 });
  const pending = g.acquire({ maxWaitMs: 3_000, leaseMs: 10_000 });
  await sleep(100);
  store.fail = true;
  await assert.rejects(pending, ProviderSlotTimeoutError);
  assert.deepEqual(g.localState, { active: 0, waiting: 0 });
  store.fail = false;
  await holder.release(held);
});

test("magazyn pada od razu, bez śladu właściciela → bramka lokalna: awaria Upstash nie wyłącza lotów", async () => {
  const store = memoryStore();
  store.fail = true;
  const g = createProviderGate({ store: () => store, config: cfg() });
  const slot = await g.acquire({ maxWaitMs: 300, leaseMs: 10_000 });
  assert.equal(slot.index, null);
  await g.release(slot);
});

test("PTTL pada przy odmowie: nadal odmowa, tylko bez dokładnego terminu", async () => {
  const store = memoryStore();
  store.m.set(KEY, { v: "ktos-inny", exp: Date.now() + 5_000 });
  store.failPttl = true;
  const g = createProviderGate({ store: () => store, config: cfg(1, 5_000) });
  await assert.rejects(g.acquire({ maxWaitMs: 300, leaseMs: 10_000 }), (err: unknown) => {
    assert.ok(err instanceof ProviderSlotTimeoutError);
    assert.equal(err.retryAfterMs, undefined);
    return true;
  });
  assert.deepEqual(g.localState, { active: 0, waiting: 0 });
});

test("slot zwolniony tuż po odczycie dzierżawy: czekanie go łapie, zamiast odsyłać gościa na minutę", async () => {
  const store = memoryStore();
  // Ktoś zajął slot, trafił w cache i oddał go po 100 ms, choć dzierżawa mówi 60 s.
  store.m.set(KEY, { v: "ktos-inny", exp: Date.now() + 60_000 });
  setTimeout(() => store.m.delete(KEY), 100);
  const g = createProviderGate({ store: () => store, config: cfg(1, 65_000) });
  await g.release(await g.acquire({ maxWaitMs: 2_000, leaseMs: 10_000 }));
});

test("zwolnienie to JEDNA atomowa komenda: bez odczytu, po którym ktoś mógłby przejąć slot przed zapisem", async () => {
  const store = memoryStore();
  const g = createProviderGate({ store: () => store, config: cfg(1, 5_000) });
  const slot = await g.acquire({ maxWaitMs: 1_000, leaseMs: 10_000 });
  slot.lastProviderCallAt = Date.now();
  let reads = 0;
  store.afterGet = () => (reads += 1);
  await g.release(slot);
  assert.equal(reads, 0);
  assert.equal(store.m.get(KEY)?.v, slot.token, "własna dzierżawa skrócona do końca odstępu");
});

test("slot przejęty po wygaśnięciu dzierżawy: spóźnione zwolnienie nie skraca cudzej dzierżawy", async () => {
  const store = memoryStore();
  const g = createProviderGate({ store: () => store, config: cfg(1, 5_000) });
  const stale = await g.acquire({ maxWaitMs: 1_000, leaseMs: 1_000 });
  stale.lastProviderCallAt = Date.now();
  const exp = Date.now() + 60_000;
  store.m.set(KEY, { v: "inny-wlasciciel", exp });
  await g.release(stale);
  assert.deepEqual(store.m.get(KEY), { v: "inny-wlasciciel", exp });
});

test("slot oddany BEZ zapytania do dostawcy (wynik z cache) nie trzyma odstępu", async () => {
  const store = memoryStore();
  const g1 = createProviderGate({ store: () => store, config: cfg(1, 5_000) });
  const g2 = createProviderGate({ store: () => store, config: cfg(1, 5_000) });
  await g1.release(await g1.acquire({ maxWaitMs: 500, leaseMs: 10_000 }));
  assert.equal(store.m.size, 0, "klucz zwolniony od razu");
  await g2.release(await g2.acquire({ maxWaitMs: 300, leaseMs: 10_000 }));
});

test("bez magazynu: slot oddany bez zapytania też nie trzyma odstępu", async () => {
  const g = createProviderGate({ store: () => null, config: cfg(1, 5_000) });
  await g.release(await g.acquire({ maxWaitMs: 300, leaseMs: 10_000 }));
  await g.release(await g.acquire({ maxWaitMs: 300, leaseMs: 10_000 }));
});

test("stampede: piątka czeka na tę samą trasę, jedno zapytanie u dostawcy, reszta z cache schodzi bez czekania na odstęp", async () => {
  const store = memoryStore();
  const gates = Array.from({ length: 5 }, () => createProviderGate({ store: () => store, config: cfg(1, 400) }));
  let providerCalls = 0;
  let cached = false;
  const instance = async (g: (typeof gates)[number]) => {
    const slot = await g.acquire({ maxWaitMs: 5_000, leaseMs: 10_000 });
    if (!cached) {
      providerCalls += 1;
      slot.lastProviderCallAt = Date.now();
      await sleep(450);
      cached = true;
    }
    await g.release(slot);
  };
  const t0 = Date.now();
  await Promise.all(gates.map(instance));
  assert.equal(providerCalls, 1);
  // Gęsiego po odstępie to co najmniej 450 + 4 × 400 ms. Bez odstępu: dostawca
  // plus jeden obrót odpytywania (do 500 ms) i chwila na magazyn.
  assert.ok(Date.now() - t0 < 1_700, `stampede trwało ${Date.now() - t0} ms`);
});

test("odstęp liczy się od OSTATNIEGO zapytania, nie od zajęcia slotu (ponowienie pod slotem)", async () => {
  const store = memoryStore();
  const g = createProviderGate({ store: () => store, config: cfg(1, 300) });
  const slot = await g.acquire({ maxWaitMs: 500, leaseMs: 10_000 });
  await sleep(350); // pierwsza próba trwała dłużej niż odstęp…
  slot.lastProviderCallAt = Date.now(); // …a ponowienie właśnie wyszło
  await g.release(slot);
  const t0 = Date.now();
  await g.release(await g.acquire({ maxWaitMs: 2_000, leaseMs: 10_000 }));
  assert.ok(Date.now() - t0 >= 200, `następne po ${Date.now() - t0} ms`);
});

test("zapis slotu doszedł, ale odpowiedź zginęła → dzierżawa chroni zapytanie do końca i dopiero wtedy jest sprzątana", async () => {
  const store = memoryStore();
  const g = createProviderGate({ store: () => store, config: cfg() });
  store.loseSetReply = true;
  const slot = await g.acquire({ maxWaitMs: 300, leaseMs: 60_000 });
  store.loseSetReply = false;
  assert.equal(slot.index, null, "nie mamy potwierdzenia, więc bramka lokalna");
  await sleep(20);
  assert.equal(store.m.get(KEY)?.v, slot.token, "w trakcie zapytania inna instancja nie może wejść");
  await g.release(slot);
  assert.equal(store.m.size, 0, "po zapytaniu osierocona dzierżawa nie blokuje innych na 60 s");
});

test("niepewny wynik zapytania (timeout): slot zostaje zajęty przez wskazany czas, choć odstęp dawno minął", async () => {
  const store = memoryStore();
  const g = createProviderGate({ store: () => store, config: cfg(1, 50) });
  const slot = await g.acquire({ maxWaitMs: 500, leaseMs: 10_000 });
  slot.lastProviderCallAt = Date.now() - 1_000;
  slot.holdAfterMs = 350;
  await g.release(slot);
  const t0 = Date.now();
  await g.release(await g.acquire({ maxWaitMs: 2_000, leaseMs: 10_000 }));
  assert.ok(Date.now() - t0 >= 250, `następne po ${Date.now() - t0} ms`);
});

test("niepewny wynik bez magazynu: bramka lokalna też trzyma slot przez wskazany czas", async () => {
  const g = createProviderGate({ store: () => null, config: cfg(1, 0) });
  const slot = await g.acquire({ maxWaitMs: 500, leaseMs: 10_000 });
  slot.holdAfterMs = 300;
  await g.release(slot);
  const t0 = Date.now();
  await g.release(await g.acquire({ maxWaitMs: 2_000, leaseMs: 10_000 }));
  assert.ok(Date.now() - t0 >= 220, `następne po ${Date.now() - t0} ms`);
});

test("magazyn rzuca już przy pobraniu klienta → bramka lokalna, kolejka nie przecieka", async () => {
  let throwing = true;
  const g = createProviderGate({
    store: () => {
      if (throwing) throw new Error("brak klienta");
      return null;
    },
    config: cfg(),
  });
  const slot = await g.acquire({ maxWaitMs: 300, leaseMs: 10_000 });
  assert.equal(slot.index, null);
  await g.release(slot);
  throwing = false;
  assert.deepEqual(g.localState, { active: 0, waiting: 0 });
});

test("slot wolny dopiero za długo: po krótkim czekaniu odmowa z czasem do zwolnienia", async () => {
  const store = memoryStore();
  store.m.set(KEY, { v: "ktos-inny", exp: Date.now() + 5_000 });
  const g = createProviderGate({ store: () => store, config: cfg(1, 5_000) });
  await assert.rejects(g.acquire({ maxWaitMs: 300, leaseMs: 10_000 }), (err: unknown) => {
    assert.ok(err instanceof ProviderSlotTimeoutError);
    assert.ok((err.retryAfterMs ?? 0) > 4_000 && (err.retryAfterMs ?? 0) <= 5_000, `retryAfterMs=${err.retryAfterMs}`);
    return true;
  });
  assert.deepEqual(g.localState, { active: 0, waiting: 0 });
});

test("slot zwolni się w czasie czekania: czekamy zamiast odmawiać", async () => {
  const store = memoryStore();
  store.m.set(KEY, { v: "ktos-inny", exp: Date.now() + 200 });
  const g = createProviderGate({ store: () => store, config: cfg() });
  await g.release(await g.acquire({ maxWaitMs: 2_000, leaseMs: 10_000 }));
});

test("bez magazynu: odstęp dłuższy niż czekanie → odmowa od razu, z czasem do końca odstępu", async () => {
  const g = createProviderGate({ store: () => null, config: cfg(1, 5_000) });
  const slot = await g.acquire({ maxWaitMs: 300, leaseMs: 10_000 });
  slot.lastProviderCallAt = Date.now();
  await g.release(slot);
  const t0 = Date.now();
  await assert.rejects(g.acquire({ maxWaitMs: 300, leaseMs: 10_000 }), (err: unknown) => {
    assert.ok(err instanceof ProviderSlotTimeoutError);
    assert.ok((err.retryAfterMs ?? 0) > 4_000, `retryAfterMs=${err.retryAfterMs}`);
    return true;
  });
  assert.ok(Date.now() - t0 < 100, `odmowa po ${Date.now() - t0} ms`);
});
