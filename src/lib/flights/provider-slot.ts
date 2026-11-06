// Globalna bramka wyszukiwań lotów u dostawcy (LiteAPI `/flights/rates`).
//
// ZMIERZONE NA PRODUKCJI 2026-11-03 (logi żądań Vercela + liczniki `flgov:v1`).
// Po przywróceniu dostępu konto ma limit, którego dostawca nie publikuje
// (publiczna dokumentacja mówi o setkach zapytań na sekundę — nas to nie
// dotyczy). Wyszukiwanie „Warszawa — wszystkie lotniska → Madera” wysyłało
// TRZY zapytania w tej samej milisekundzie (WAW, WMI, RDO). Dwa razy z rzędu
// (10:30:22 i 10:31:26 UTC) wynik był identyczny: 1 × 200 i 2 × HTTP 429
// `{code: 4290, "You have exceeded the allowed request limit"}`. W całej
// dobie było 6 zapytań do dostawcy (dzień wcześniej 8 z 8 udanych), więc to
// nie jest limit dobowy, tylko limit zapytań równoczesnych albo zbyt gęstych.
// Każde 429 włączało pauzę gubernatora (60 s) dla WSZYSTKICH użytkowników.
//
// Bramka pilnuje, żeby z naszej strony nigdy nie wyszło więcej niż
// `FLIGHTS_PROVIDER_CONCURRENCY` (domyślnie 1) wyszukiwań naraz — na
// wszystkich instancjach — i żeby dwa kolejne zapytania w tym samym slocie
// dzielił odstęp co najmniej `FLIGHTS_PROVIDER_MIN_INTERVAL_MS` (domyślnie 65 s).
//
// SKĄD 65 s. Sama równoczesność to za mało: 2026-11-06 zapytanie po kolei,
// 9,46 s od startu poprzedniego i tuż po jego końcu, też dostało 429. Wszystkie
// pary zapytań do dostawcy od przywrócenia dostępu (1–6.11):
//   0 s → 429, 9,46 s → 429, 63,8 s → 200, 108–150 s → 200.
// Limit leży więc gdzieś między 9,5 a 64 s, a 65 s to najkrótszy odstęp, który
// na tym koncie NA PEWNO działa. To nie jest limit podany przez LiteAPI. Nie
// skracać go „na próbę” na produkcji — 429 zatrzymuje wyszukiwania wszystkim
// (gubernator). Po odpowiedzi supportu wystarczy zmienić zmienną środowiskową.
//
//   • slot to klucz `flgov:v1:slot:<n>` z dzierżawą (SET NX PX): przydział
//     jest atomowy, a funkcja, która padła w trakcie, nie blokuje slotu
//     dłużej niż dzierżawa;
//   • zwolnienie to jeden skrypt Lua: „jeśli token nadal mój, skróć dzierżawę
//     albo skasuj”. Dwie osobne komendy (GET, potem SET/DEL) mogłyby nadpisać
//     slot, który po wygaśnięciu dzierżawy przejął już ktoś inny;
//   • w obrębie instancji kolejka FIFO — czeka tylko jej czoło i tylko ono
//     odpytuje magazyn (kilka małych komend na sekundę czekania);
//   • odstęp liczy się od OSTATNIEGO zapytania do dostawcy
//     (`lastProviderCallAt`): zwolnienie krótko po nim skraca dzierżawę do
//     końca odstępu. Kto dostał wynik z cache i dostawcy nie pytał, oddaje
//     slot od razu — inaczej czekający na tę samą trasę szliby gęsiego po
//     1,5 s każdy i kończyli odmową, mając odpowiedź w cache;
//   • po niepewnym wyniku (timeout, zerwane połączenie) dostawca może jeszcze
//     pracować nad porzuconym zapytaniem, więc slot zostaje zajęty dłużej
//     (`holdAfterMs`, ustawia client.ts);
//   • bez magazynu (brak konfiguracji, awaria, otwarty wyłącznik) bramka
//     działa lokalnie. To ŚWIADOMY wybór: Upstash miał już dobową awarię, a
//     pełne zablokowanie lotów kosztowałoby więcej niż ryzyko, które zostaje.
//     Jeden gość nie zrobi równoległości nawet wtedy (przeglądarka idzie po
//     kolei), a do 429 potrzeba dwóch gości w tej samej chwili na dwóch
//     instancjach. Wyjątek: gdy magazyn pada, a przed chwilą widzieliśmy
//     cudzą dzierżawę, odmawiamy — wiemy, że ktoś właśnie pyta dostawcę, a
//     ponowienie za kilka sekund i tak przejdzie lokalnie.
//     Crony bez magazynu stoją (search-governor.ts).
//
// Klucze są malutkie (UUID), a przy kilku wyszukiwaniach dziennie transfer
// Upstash jest pomijalny.

import { randomUUID } from "node:crypto";

import { getSharedRedis, redisMayBeAvailable } from "@/lib/redis/client";

const PREFIX = "flgov:v1:slot";
/** Co ile czoło kolejki ponawia próbę zajęcia slotu (plus losowy rozrzut). */
const POLL_MS = 250;
const POLL_JITTER_MS = 250;
const DEFAULT_MIN_INTERVAL_MS = 65_000;
const MAX_MIN_INTERVAL_MS = 300_000;
/** Termin ponowienia po odmowie, gdy dzierżawa nic nie mówi: odstęp jest krótki, a slot zajęty zapytaniem w toku. */
const SHORT_INTERVAL_RETRY_MS = 5_000;
// Pierwsza linia to znacznik: rozpoznaje skrypt atrapa Upstash w testach, bo
// nie ma interpretera Lua. Wartość ARGV[2] = 0 kasuje slot, > 0 skraca dzierżawę.
const RELEASE_SCRIPT = `-- provider-slot-release
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
local spacing = tonumber(ARGV[2])
if spacing > 0 then return redis.call("PEXPIRE", KEYS[1], spacing) end
return redis.call("DEL", KEYS[1])`;

export interface ProviderSlotConfig {
  /** Ile wyszukiwań naraz na wszystkich instancjach. */
  concurrency: number;
  /** Minimalny odstęp między startami wyszukiwań w jednym slocie. */
  minIntervalMs: number;
}

function intIn(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function providerSlotConfig(env: Record<string, string | undefined> = process.env): ProviderSlotConfig {
  return {
    concurrency: intIn(env.FLIGHTS_PROVIDER_CONCURRENCY, 1, 1, 4),
    minIntervalMs: intIn(env.FLIGHTS_PROVIDER_MIN_INTERVAL_MS, DEFAULT_MIN_INTERVAL_MS, 0, MAX_MIN_INTERVAL_MS),
  };
}

export interface ProviderSlot {
  /** Numer slotu w magazynie; `null` = tylko bramka lokalna (magazyn niedostępny). */
  readonly index: number | null;
  readonly token: string;
  readonly acquiredAt: number;
  readonly waitedMs: number;
  /** Czy trzeba było czekać (kolejka w instancji albo slot zajęty gdzie indziej). */
  readonly contended: boolean;
  /** Klucz, którego zajęcia nie potwierdzono (zginęła odpowiedź magazynu) — sprzątany dopiero przy zwolnieniu. */
  readonly unconfirmedKey: string | null;
  /** Ostatnie zapytanie do dostawcy pod tym slotem; `null` = nie było (np. wynik z cache), więc bez odstępu. */
  lastProviderCallAt: number | null;
  /** Ile trzymać slot po zwolnieniu mimo minionego odstępu, gdy nie wiadomo, czy dostawca skończył pracę. */
  holdAfterMs: number;
}

/** Nie udało się zająć slotu przed terminem — dostawca jest właśnie odpytywany przez kogoś innego. */
export class ProviderSlotTimeoutError extends Error {
  readonly waitedMs: number;
  /** Za ile slot najpewniej będzie wolny, jeśli to wiadomo. */
  readonly retryAfterMs?: number;
  constructor(waitedMs: number, retryAfterMs?: number) {
    super(`Brak wolnego slotu wyszukiwania lotów po ${waitedMs} ms`);
    this.name = "ProviderSlotTimeoutError";
    this.waitedMs = waitedMs;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Podzbiór klienta Upstash, którego używa bramka (atrapy w testach). */
export interface SlotStore {
  set(key: string, value: string, opts: { nx: true; px: number }): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  /** Ile ms dzierżawy zostało; ujemne = klucza nie ma. */
  pttl(key: string): Promise<number>;
}

export interface ProviderGate {
  acquire(opts: { maxWaitMs: number; leaseMs: number }): Promise<ProviderSlot>;
  release(slot: ProviderSlot): Promise<void>;
  /** Do testów i monitoringu: ile wyszukiwań trzyma slot w tej instancji, ile czeka. */
  readonly localState: { active: number; waiting: number };
}

export interface ProviderGateDeps {
  store: () => SlotStore | null;
  config?: () => ProviderSlotConfig;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Za ile najbliższy slot się zwolni; `undefined` = nie wiadomo. Tylko do podania terminu, nie do decyzji. */
async function nearestRelease(store: SlotStore, concurrency: number): Promise<number | undefined> {
  try {
    const leases = await Promise.all(Array.from({ length: concurrency }, (_, i) => store.pttl(`${PREFIX}:${i}`)));
    const soonest = Math.min(...leases);
    return soonest > 0 ? soonest : undefined;
  } catch {
    return undefined;
  }
}

export function createProviderGate(deps: ProviderGateDeps): ProviderGate {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const config = deps.config ?? (() => providerSlotConfig());

  // Kolejka w obrębie instancji (FIFO) — pojemność = `concurrency`.
  let active = 0;
  const waiters: Array<() => void> = [];
  /** Kiedy skończy się odstęp bramki lokalnej (działa bez magazynu). */
  let localFreeAt = 0;

  function takeLocal(deadline: number): Promise<boolean> {
    if (active < config().concurrency && waiters.length === 0) {
      active += 1;
      return Promise.resolve(true);
    }
    if (localFreeAt > deadline) return Promise.resolve(false);
    return new Promise((resolve) => {
      const grant = () => {
        clearTimeout(timer);
        active += 1;
        resolve(true);
      };
      const timer = setTimeout(() => {
        const i = waiters.indexOf(grant);
        if (i >= 0) waiters.splice(i, 1);
        resolve(false);
      }, Math.max(0, deadline - now()));
      waiters.push(grant);
    });
  }

  function giveLocal(delayMs: number): void {
    const run = () => {
      active = Math.max(0, active - 1);
      const next = waiters.shift();
      if (next) next();
    };
    if (delayMs <= 0) {
      run();
      return;
    }
    localFreeAt = now() + delayMs;
    const t = setTimeout(run, delayMs);
    (t as { unref?: () => void }).unref?.();
  }

  async function acquire({ maxWaitMs, leaseMs }: { maxWaitMs: number; leaseMs: number }): Promise<ProviderSlot> {
    const start = now();
    const deadline = start + Math.max(0, maxWaitMs);
    const token = randomUUID();
    const queuedLocally = active >= config().concurrency || waiters.length > 0;
    if (!(await takeLocal(deadline))) {
      throw new ProviderSlotTimeoutError(now() - start, localFreeAt > now() ? localFreeAt - now() : undefined);
    }

    let polled = false;
    const slot = (index: number | null, unconfirmedKey: string | null = null): ProviderSlot => {
      const at = now();
      return {
        index,
        token,
        acquiredAt: at,
        waitedMs: at - start,
        contended: queuedLocally || polled,
        unconfirmedKey,
        lastProviderCallAt: null,
        holdAfterMs: 0,
      };
    };

    let store: SlotStore | null = null;
    let attempted: string | null = null;
    let heldByOther = false;
    try {
      store = deps.store();
      if (!store) return slot(null);
      for (;;) {
        const { concurrency, minIntervalMs } = config();
        for (let i = 0; i < concurrency; i += 1) {
          attempted = `${PREFIX}:${i}`;
          const res = await store.set(attempted, token, { nx: true, px: Math.max(1_000, leaseMs) });
          if (res === "OK") return slot(i);
          heldByOther = true;
        }
        attempted = null;
        const left = deadline - now();
        if (left <= 0) {
          giveLocal(0);
          const freeIn = await nearestRelease(store, concurrency);
          // Dzierżawa zapytania w toku bywa dłuższa niż prawdziwe czekanie: nigdy
          // nie więcej niż odstęp, bo tyle najdłużej trwa przerwa między zapytaniami.
          throw new ProviderSlotTimeoutError(
            now() - start,
            freeIn === undefined ? undefined : Math.min(freeIn, Math.max(minIntervalMs, SHORT_INTERVAL_RETRY_MS)),
          );
        }
        polled = true;
        await sleep(Math.min(left, POLL_MS + Math.floor(Math.random() * POLL_JITTER_MS)));
      }
    } catch (err) {
      if (err instanceof ProviderSlotTimeoutError) throw err;
      if (heldByOther) {
        // Ktoś właśnie pyta dostawcę, a magazyn przestał odpowiadać: odmowa. Tu
        // zapytania nie będzie, więc ewentualny nasz zapis można sprzątnąć od razu.
        if (store && attempted) void store.eval(RELEASE_SCRIPT, [attempted], [token, "0"]).catch(() => {});
        giveLocal(0);
        throw new ProviderSlotTimeoutError(now() - start);
      }
      // Magazyn padł — zostaje bramka lokalna (już ją trzymamy). Zapis mógł
      // dojść mimo błędu (zginęła tylko odpowiedź), więc klucz sprząta dopiero
      // zwolnienie: skasowany teraz wpuściłby inną instancję w trakcie zapytania.
      return slot(null, attempted);
    }
  }

  async function release(slot: ProviderSlot): Promise<void> {
    const interval = slot.lastProviderCallAt === null ? 0 : config().minIntervalMs - (now() - slot.lastProviderCallAt);
    const spacing = Math.max(0, interval, slot.holdAfterMs);
    const key = slot.index === null ? slot.unconfirmedKey : `${PREFIX}:${slot.index}`;
    try {
      if (key) await deps.store()?.eval(RELEASE_SCRIPT, [key], [slot.token, String(spacing)]);
    } catch {
      // dzierżawa i tak wygaśnie sama
    }
    // Tylko bramka lokalna: odstęp pilnuje opóźnione zwolnienie kolejki.
    giveLocal(slot.index === null ? spacing : 0);
  }

  return {
    acquire,
    release,
    get localState() {
      return { active, waiting: waiters.length };
    },
  };
}

function sharedStore(): SlotStore | null {
  return redisMayBeAvailable() ? (getSharedRedis() as unknown as SlotStore | null) : null;
}

let gate = createProviderGate({ store: sharedStore });

export function acquireProviderSlot(opts: { maxWaitMs: number; leaseMs: number }): Promise<ProviderSlot> {
  return gate.acquire(opts);
}

export function releaseProviderSlot(slot: ProviderSlot): Promise<void> {
  return gate.release(slot);
}

export function __resetProviderGateForTests(deps?: Partial<ProviderGateDeps>): void {
  gate = createProviderGate({ store: sharedStore, ...deps });
}
