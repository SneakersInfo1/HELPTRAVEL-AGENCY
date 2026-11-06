// Serwerowa część obsługi odmowy prebooku: znacznik martwej oferty i celowane
// odświeżenie stawek. Ukrywanie oferty przed gościem z odmową odbywa się osobno,
// przez odcisk w jego linku (offer-fingerprint.ts, refused-offers-session.ts).
//
// PROBLEM: strona hotelu czyta stawki z Next Data Cache (rates.ts, 900 s). Po
// `2001: no prebook availability` gość wracał na stronę i widział tę samą
// martwą ofertę, a inni goście mogli klikać ją przez kolejne minuty.
//
// CO SIĘ DZIEJE PO ODMOWIE (trasa /api/booking/prebook):
//   1. `rememberRefusal`: znacznik `offerref:v1:o:<skrót offerId>` z TTL 30 min.
//      Klucz zależy wyłącznie od oferty, więc pola z body go nie obejdą, a zapisany
//      w nim termin odświeżamy przy powtórkach zamiast tego z body.
//   2. `refreshStayRates`: unieważnienie wpisu stawek TYLKO tego hotelu i tych dat,
//      najwyżej raz na 60 s. Nigdy wspólnego tagu `liteapi-rates`.
//
// Strona hotelu w ogóle nie czyta Redisa. Zwykłe wejście: zero nowych zapytań do
// Redisa i do LiteAPI. Trasa prebooku robi jeden GET.
//
// KOSZT LITEAPI: odświeżenie to najwyżej jedno zapytanie o dostępność na każdy
// skład gości tego hotelu i terminu, i tylko gdy ktoś realnie wejdzie (zapytanie
// o zdjęcia pokoi nie ma tagu). Szerszy zakres niż jeden skład jest celowy: pokój
// wyprzedany dla dwóch osób jest wyprzedany też dla jednej. Podrobiony `hotelId`
// działa tylko przy pierwszej odmowie, więc każda próba wymaga prawdziwej odmowy
// dostawcy i miejsca w limiterze prebooku. To mniej, niż każdy może wywołać,
// wchodząc na hotel z datami spoza cache. Równoległych wejść na świeżo
// unieważniony wpis nie scalamy: wymagałoby to blokady na normalnej ścieżce.
//
// SPÓŹNIONY ZAPIS: zapytanie, które wystartowało przed odmową i skończy się po
// niej, może odłożyć starą listę do cache. Dlatego kolejne kliknięcie martwej
// oferty znów woła `refreshStayRates`, a cooldown pilnuje częstotliwości.
//
// Ta warstwa nigdy nie może wywrócić rezerwacji: każdy błąd kończy się brakiem
// wiedzy („nic nie wiemy o odmowach”), a nie błędem żądania.

import { createHash } from "node:crypto";

import { revalidateTag } from "next/cache";

import { getSharedRedis, warnRedisFallback } from "@/lib/redis/client";

export interface StayScope {
  hotelId: string;
  checkin: string;
  checkout: string;
}

export type RefusalCode = "RATE_UNAVAILABLE" | "PREBOOK_EXPIRED";

export interface KnownRefusal {
  code: RefusalCode;
  /** Termin z pierwszej odmowy; `null`, gdy stary klient nie podał hotelu. */
  scope: StayScope | null;
}

export const REFUSAL_TTL_SECONDS = 30 * 60;
export const INVALIDATION_COOLDOWN_SECONDS = 60;

const KEY_PREFIX = "offerref:v1";
const stayPart = ({ hotelId, checkin, checkout }: StayScope) => `${hotelId}:${checkin}:${checkout}`;
const offerKey = (offerId: string) =>
  `${KEY_PREFIX}:o:${createHash("sha256").update(offerId).digest("hex").slice(0, 32)}`;
const cooldownKey = (scope: StayScope) => `${KEY_PREFIX}:cd:${stayPart(scope)}`;

/** Tag wpisu stawek jednego hotelu w jednym terminie (dla każdego składu gości). */
export function ratesStayTag(scope: StayScope): string {
  return `rates-stay:${stayPart(scope)}`;
}

// `expire: 0`: następne wejście czeka na świeże dane. Profil „max” to
// stale-while-revalidate, czyli gość wracający po odmowie dostałby starą listę.
const invalidateImmediately = (tag: string) => revalidateTag(tag, { expire: 0 });
let invalidateTag: (tag: string) => void = invalidateImmediately;

export function __setRatesInvalidatorForTests(fn: ((tag: string) => void) | null): void {
  invalidateTag = fn ?? invalidateImmediately;
}

export async function rememberRefusal(
  offerId: string,
  code: RefusalCode,
  scope: StayScope | null,
): Promise<void> {
  const client = getSharedRedis();
  if (!client) return;
  try {
    const refusal: KnownRefusal = { code, scope };
    await client.set(offerKey(offerId), refusal, { ex: REFUSAL_TTL_SECONDS });
  } catch (err) {
    warnRedisFallback("refused-offers:remember", err);
  }
}

/** Czy dostawca już odrzucił DOKŁADNIE tę ofertę? Odczyt tylko przy prebooku. */
export async function knownRefusal(offerId: string): Promise<KnownRefusal | null> {
  const client = getSharedRedis();
  if (!client) return null;
  try {
    const refusal = await client.get<KnownRefusal>(offerKey(offerId));
    return refusal?.code === "RATE_UNAVAILABLE" || refusal?.code === "PREBOOK_EXPIRED" ? refusal : null;
  } catch (err) {
    warnRedisFallback("refused-offers:known", err);
    return null;
  }
}

export async function refreshStayRates(scope: StayScope): Promise<void> {
  const client = getSharedRedis();
  if (!client) return;

  let firstInWindow = false;
  try {
    const lock = await client.set(cooldownKey(scope), "1", {
      nx: true,
      ex: INVALIDATION_COOLDOWN_SECONDS,
    });
    firstInWindow = lock === "OK";
  } catch (err) {
    warnRedisFallback("refused-offers:refresh", err);
    return;
  }
  if (!firstInWindow) return;

  try {
    invalidateTag(ratesStayTag(scope));
  } catch (err) {
    console.warn("[refused-offers] nie udało się unieważnić stawek", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
