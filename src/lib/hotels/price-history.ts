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

import { Redis } from "@upstash/redis";

import type { RateCacheContext } from "./rate-cache";

const KEY_VERSION = "v1";
/** 35 dni: okno 30-dniowe plus zapas na strefy czasowe i opóźniony odczyt. */
const TTL_SECONDS = 35 * 24 * 3600;
const OKNO_DNI = 30;

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
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
    // `new Redis({ url })` rzuca przy adresie niepustym, ale nieprawidłowym
    // (literówka w zmiennej na Vercelu wystarczy). Wywołanie jest tu
    // puszczone przez `void`, więc taki wyjątek stawał się nieobsłużonym
    // odrzuceniem Promise, a w `lowestPrice30d` — którego strona OCZEKUJE —
    // wywracał cały render obiektu. Deklarowana zasada „warstwa cache nigdy
    // nie może przerwać żądania" nie obejmowała samej konstrukcji klienta.
    const r = getRedis();
    if (!r) return;
    const obecne = await r.hget<number>(key, field);
    // Zapisujemy tylko, gdy to nowa doba albo cena spadła — inaczej każde
    // wejście na stronę generowałoby zbędny zapis.
    if (typeof obecne === "number" && obecne <= amount) return;
    await r.hset(key, { [field]: amount });
    await r.expire(key, TTL_SECONDS);
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
    // Wewnątrz `try` z tego samego powodu co w `recordPrice` — konstrukcja
    // klienta Redisa też potrafi rzucić, a ta funkcja jest oczekiwana przez
    // render strony hotelu.
    const r = getRedis();
    if (!r) return null;
    const wpisy = await r.hgetall<Record<string, number | string>>(keyFor(hotelId, ctx));
    if (!wpisy) return null;

    const dzis = dayKey(now);
    const granica = new Date(now);
    granica.setUTCDate(granica.getUTCDate() - OKNO_DNI);
    const od = granica.toISOString().slice(0, 10);

    let min: number | null = null;
    for (const [dzien, wartosc] of Object.entries(wpisy)) {
      if (dzien >= dzis || dzien < od) continue;
      const v = typeof wartosc === "number" ? wartosc : Number(wartosc);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (min === null || v < min) min = v;
    }
    return min;
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

/** Seam testowy — pozwala wstrzyknąć atrapę Redisa. */
export function __setRedisForTests(fake: Redis | null): void {
  redis = fake;
}
