// Historia cen 30 dni (Upstash Redis) — zgodność z dyrektywą Omnibus.
//
// PO CO TO ISTNIEJE. Dyrektywa Omnibus (w Polsce egzekwowana przez UOKiK)
// wymaga, żeby przy OGŁOSZENIU OBNIŻKI podać najniższą cenę z 30 dni przed
// obniżką. Przekreślona cena z plakietką „−22%" jest takim ogłoszeniem.
//
// `initialPrice` od dostawcy mówi tylko tyle, że ON obniżył tę taryfę —
// nie jest naszą najniższą ceną z 30 dni. Bez własnej historii nie da się
// spełnić przepisu. Teraz się da: zapisujemy dobowe minimum ceny dla
// KONKRETNEGO produktu (hotel + daty + obłożenie + waluta) i pokazujemy
// przy przecenie zdanie „Najniższa cena z 30 dni: X zł".
//
// ZASADA NADRZĘDNA (jak w całej warstwie cache): NIGDY nie wywalamy żądania.
// Brak env, błąd Redisa, uszkodzony wpis — wszystko degraduje do „nie wiemy",
// a strona renderuje się bez tego zdania.
//
// KOSZT. Klucz to hash `data → minimalna cena`, jeden wpis na dobę, TTL 35 dni.
// Zapisujemy WYŁĄCZNIE dla taryf, które faktycznie pokazujemy gościowi na
// stronie obiektu, oraz z crona prewarmingu. Zapisywanie 2000 hoteli × wszystkie
// kombinacje dat przy każdym wyszukiwaniu wysadziłoby zarówno limit Upstasha,
// jak i sens tych danych.
//
// Od 2026-10-27 strona obiektu woła `lowestPrice30dAndRecord` — JEDEN odczyt
// (HGETALL) zamiast dwóch (HGET w zapisie + HGETALL w odczycie), a ewentualny
// zapis dzisiejszego minimum idzie w tle jednym potokiem (HSET + EXPIRE).

import type { Redis } from "@upstash/redis";

import { getSharedRedis } from "@/lib/redis/client";

import type { RateCacheContext } from "./rate-cache";

const KEY_VERSION = "v1";
/** 35 dni: okno 30-dniowe plus zapas na strefy czasowe i opóźniony odczyt. */
const TTL_SECONDS = 35 * 24 * 3600;
const OKNO_DNI = 30;

let injected: Redis | null | undefined;

function getRedis(): Redis | null {
  if (injected !== undefined) return injected;
  return getSharedRedis();
}

/**
 * Klucz produktu.
 *
 * Zawiera DATY POBYTU, i to jest istotne prawnie: pobyt 15-17 września to
 * inny produkt niż 20-22 września, więc ich historii cen nie wolno mieszać.
 */
function keyFor(hotelId: string, ctx: RateCacheContext): string {
  const occ = `${ctx.adults}-${[...ctx.children].sort((a, b) => a - b).join(".")}-${ctx.rooms}`;
  return `phist:${KEY_VERSION}:${hotelId}:${ctx.checkin}:${ctx.checkout}:${occ}:${ctx.currency}`;
}

/** Dzień w UTC — jedno pole hasha na dobę. */
function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function asPrice(value: unknown): number | null {
  const v = typeof value === "number" ? value : Number(value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Minimum z okna 30 dni PRZED dniem `now` (dzisiejszy wpis pomijany). */
function lowestFrom(wpisy: Record<string, unknown> | null, now: Date): number | null {
  if (!wpisy) return null;
  const dzis = dayKey(now);
  const granica = new Date(now);
  granica.setUTCDate(granica.getUTCDate() - OKNO_DNI);
  const od = granica.toISOString().slice(0, 10);

  let min: number | null = null;
  for (const [dzien, wartosc] of Object.entries(wpisy)) {
    if (dzien >= dzis || dzien < od) continue;
    const v = asPrice(wartosc);
    if (v === null) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}

/**
 * Zapis dobowego minimum. Potokiem (HSET + EXPIRE = jeden round-trip), gdy
 * klient go ma; atrapa w testach bez `pipeline` dostaje dwa zwykłe wywołania.
 */
async function writeDayMin(r: Redis, key: string, field: string, amount: number): Promise<void> {
  if (typeof (r as Partial<Redis>).pipeline === "function") {
    const p = r.pipeline();
    p.hset(key, { [field]: amount });
    p.expire(key, TTL_SECONDS);
    await p.exec();
    return;
  }
  await r.hset(key, { [field]: amount });
  await r.expire(key, TTL_SECONDS);
}

/**
 * Zapisuje dobowe MINIMUM ceny.
 *
 * Minimum, nie ostatnia wartość: w ciągu doby cena potrafi się zmienić kilka
 * razy, a przepis mówi o najniższej. Zapis jest best-effort — porażka nie
 * może dotknąć gościa, który właśnie ogląda stronę.
 */
export async function recordPrice(
  hotelId: string,
  ctx: RateCacheContext,
  amount: number,
  now = new Date(),
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;

  const key = keyFor(hotelId, ctx);
  const field = dayKey(now);
  try {
    // `getRedis()` MUSI być wewnątrz `try`. Stało wyżej, poza nim — a
    // konstrukcja klienta potrafi rzucić (np. bezpiecznik testów), a wywołanie
    // jest tu puszczone przez `void`, więc taki wyjątek stawał się
    // nieobsłużonym odrzuceniem Promise. Deklarowana zasada „warstwa cache
    // nigdy nie może przerwać żądania" obejmuje też samą konstrukcję klienta.
    const r = getRedis();
    if (!r) return;
    const obecne = await r.hget<number>(key, field);
    // Zapisujemy tylko, gdy to nowa doba albo cena spadła — inaczej każde
    // wejście na stronę generowałoby zbędny zapis.
    if (typeof obecne === "number" && obecne <= amount) return;
    await writeDayMin(r, key, field, amount);
  } catch {
    // Cisza. Historia cen jest dodatkiem, nie warunkiem działania strony.
  }
}

/**
 * Najniższa cena z ostatnich 30 dni albo `null`.
 *
 * `null` znaczy „NIE WIEMY" i musi być tak traktowane przez UI: brak historii
 * (nowy produkt, świeże wdrożenie, Redis niedostępny) to nie to samo, co
 * „nie było taniej". W obu przypadkach po prostu nie piszemy nic.
 *
 * Dzisiejszy wpis jest CELOWO pomijany: przepis mówi o cenie z 30 dni PRZED
 * obniżką, a nie o cenie bieżącej. Bez tego pominięcia zdanie brzmiałoby
 * „najniższa cena z 30 dni" równa dokładnie cenie na ekranie — czyli bez sensu.
 */
export async function lowestPrice30d(
  hotelId: string,
  ctx: RateCacheContext,
  now = new Date(),
): Promise<number | null> {
  try {
    // Wewnątrz `try` z tego samego powodu co w `recordPrice`.
    const r = getRedis();
    if (!r) return null;
    const wpisy = await r.hgetall<Record<string, number | string>>(keyFor(hotelId, ctx));
    return lowestFrom(wpisy, now);
  } catch {
    return null;
  }
}

/**
 * Odczyt historii I zapis dzisiejszej ceny — dla strony obiektu.
 *
 * Wcześniej strona robiła `recordPrice` (HGET, potem HSET, potem EXPIRE)
 * i `lowestPrice30d` (HGETALL) na TYM SAMYM kluczu: 2–4 komendy i do czterech
 * round-tripów na każde wejście, także botów. Tutaj jeden HGETALL daje i
 * historię, i dzisiejszy wpis; zapis (gdy cena jest nowa albo niższa) idzie
 * w tle jednym potokiem i nie opóźnia renderu.
 *
 * Zwracana wartość jest liczona z historii SPRZED tego wejścia — zapis
 * dzisiejszej ceny i tak nie wchodzi do okna (dzisiejszy wpis jest pomijany).
 *
 * `defer` — jak dokończyć zapis po odpowiedzi. Strona przekazuje `after()`
 * z Nexta (na Vercelu: waitUntil), bo zwykłe `void` może zostać przerwane
 * zamrożeniem instancji tuż po wysłaniu HTML. Bez `defer` (testy, skrypty)
 * zapis idzie w tle jak dotąd.
 */
export async function lowestPrice30dAndRecord(
  hotelId: string,
  ctx: RateCacheContext,
  amount: number,
  now = new Date(),
  defer?: (task: () => Promise<void>) => void,
): Promise<number | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    const key = keyFor(hotelId, ctx);
    const wpisy = await r.hgetall<Record<string, number | string>>(key);
    const lowest = lowestFrom(wpisy, now);

    if (Number.isFinite(amount) && amount > 0) {
      const field = dayKey(now);
      const obecne = asPrice(wpisy?.[field]);
      if (obecne === null || obecne > amount) {
        // Cisza przy błędzie — patrz `recordPrice`.
        const write = () => writeDayMin(r, key, field, amount).catch(() => {});
        if (defer) defer(write);
        else void write();
      }
    }
    return lowest;
  } catch {
    return null;
  }
}

/**
 * Zdanie do pokazania przy przecenie — albo `null`.
 *
 * Pokazujemy je TYLKO wtedy, gdy historyczne minimum faktycznie różni się od
 * ceny bieżącej. Zdanie „najniższa cena z 30 dni: 829 zł" obok ceny 829 zł
 * jest szumem, nie informacją.
 */
export function lowest30dNotice(lowest: number | null, current: number): number | null {
  if (lowest === null || !Number.isFinite(lowest)) return null;
  if (Math.abs(lowest - current) < 0.5) return null;
  return lowest;
}

/** Seam testowy — pozwala wstrzyknąć atrapę Redisa. `undefined` = wspólny klient. */
export function __setRedisForTests(fake: Redis | null | undefined): void {
  injected = fake;
}
