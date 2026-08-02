// Snapshot sekcji „Polecane hotele" (Upstash Redis, JEDEN klucz).
//
// Pisany przez cron /api/cron/warm-featured-hotels (co 6 h), czytany serwerowo
// przy ISR przez stronę główną. Wzorzec best-effort jak dstprice:v1: KAŻDY
// błąd / brak env = miss → sekcja po prostu się nie renderuje. Sekcja
// marketingowa nigdy nie ma prawa wywrócić strony głównej.
//
// SKĄD SIĘ WZIĄŁ TEN MODUŁ
// Właściciel zobaczył sekcję „Recommended hotels" na stronie pokazowej LiteAPI
// (white-label `*.nuitee.link`) i poprosił o to samo u nas. Sonda z 2026-08-02
// pokazała, że tamten endpoint NIE istnieje w publicznym API:
//
//   GET api.liteapi.travel/v3.0/hotels/recommended      → 404
//   GET api.liteapi.travel/v3.0/hotels/search-by-name   → 404
//   GET .../data/hotels?hotelName=Chopin                → 400 „szukaj po
//       countryCode, lat/lng, placeId, lastUpdatedAt, IATA albo hotelIds"
//
// Obie funkcje żyją wyłącznie na backendzie instancji pokazowej. Podpięcie
// się pod nią oznaczałoby, że produkcja przestaje działać w dniu, w którym
// ktoś skasuje demo — więc pula jest budowana z naszych własnych wywołań
// (`/data/hotels` na metadane + `resolveSlimRates` na stawki).
//
// UCZCIWOŚĆ. Cena na karcie pochodzi z realnego wyszukania na KONKRETNE daty
// i karta linkuje dokładnie do tych dat. Hotel bez stawki nie trafia do
// snapshotu w ogóle — nie ma tu ścieżki, w której pokazujemy hotel bez ceny
// albo cenę bez pokrycia w ofercie.

import { Redis } from "@upstash/redis";

import { rotationBucket as sharedRotationBucket } from "@/lib/home/rotation";

export { rotateSlice } from "@/lib/home/rotation";

export interface FeaturedHotel {
  /** hotelId LiteAPI (`lp…`) — to samo id, którego używa /hotele/[hotelId]. */
  id: string;
  name: string;
  /** Miasto po polsku (etykieta na karcie). */
  cityLabel: string;
  /** Kraj po polsku (etykieta na karcie). */
  countryLabel: string;
  /** 1–5, gdy dostawca podał. Brak = karta bez gwiazdek. */
  stars?: number;
  /** Ocena 0–10 od dostawcy. Brak = karta bez plakietki oceny. */
  rating?: number;
  /** Liczba opinii stojąca za `rating`. */
  reviewCount?: number;
  /** Zdjęcie hotelu (LiteAPI/cupid.travel). Hotel bez zdjęcia nie wchodzi. */
  photo: string;
  /** Cena za dobę w PLN (floor) — z okna [checkin, checkout] dla 2 osób. */
  perNightPln: number;
  /** Cena całości za to okno (PLN, floor) — to jest liczba z oferty. */
  totalPln: number;
  checkin: string;
  checkout: string;
}

export interface FeaturedHotelsSnapshot {
  /** Epoch ms zapisu — świeżość liczona od tego. */
  computedAt: number;
  hotels: FeaturedHotel[];
}

const KEY = "hotfeat:v1";
/** TTL klucza — 2 doby (ochrona przed wiecznym śmieciem). */
const TTL_SECONDS = 2 * 24 * 3600;
/**
 * Świeżość do WYŚWIETLENIA: 13 h.
 *
 * Cron chodzi co 6 h, więc wpis przeżywa jeden nieudany przebieg i dopiero
 * drugi z rzędu gasi sekcję. Próg jest wyraźnie ciaśniejszy niż 48 h przy
 * cenach kierunków, bo tam „od X zł" jest orientacyjne, a tutaj liczba
 * dotyczy KONKRETNEGO hotelu na KONKRETNE daty — czyli obietnicy, którą
 * użytkownik zweryfikuje jednym kliknięciem.
 */
export const FEATURED_FRESH_MS = 13 * 3600 * 1000;

/** Ile hoteli maksymalnie trzymamy (i pokazujemy) w sekcji. */
export const FEATURED_MAX = 12;
/** Poniżej tylu kart sekcja się nie renderuje — pas z dwoma kaflami wygląda na zepsuty. */
export const FEATURED_MIN = 4;

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

let redis: RedisLike | null | undefined;
let injected: RedisLike | null | undefined;
let warnedMissingEnv = false;

function getRedis(): RedisLike | null {
  if (injected !== undefined) return injected;
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn("[featured-hotels] UPSTASH env brak — sekcja polecanych hoteli WYŁĄCZONA.");
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token }) as unknown as RedisLike;
  return redis;
}

/** Seam testowy (wzorzec destination-price-snapshot / flights-rates-cache). */
export function __setFeaturedHotelsRedisForTests(client: RedisLike | null): void {
  injected = client;
}
export function __resetFeaturedHotelsRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

// ── Czysta logika (bez I/O — stąd testowalna) ───────────────────────────────

/** Długość jednego okna rotacji. Właściciel: „zmieniają się raz na 6 godzin". */
export const ROTATION_MS = 6 * 3600 * 1000;

export function rotationBucket(now: number = Date.now()): number {
  return sharedRotationBucket(now, ROTATION_MS);
}

/**
 * Czy kandydat nadaje się na kartę.
 *
 * Karta bez zdjęcia albo bez ceny nie jest „gorszą kartą", tylko dziurą
 * w pasie — a pas polecanych hoteli ma sprzedawać, nie tłumaczyć się z braków.
 */
export function isDisplayableHotel(h: Partial<FeaturedHotel> | null | undefined): h is FeaturedHotel {
  if (!h) return false;
  if (typeof h.id !== "string" || h.id.length === 0) return false;
  if (typeof h.name !== "string" || h.name.trim().length === 0) return false;
  if (typeof h.photo !== "string" || !/^https?:\/\//.test(h.photo)) return false;
  if (typeof h.perNightPln !== "number" || !Number.isFinite(h.perNightPln) || h.perNightPln <= 0) return false;
  if (typeof h.totalPln !== "number" || !Number.isFinite(h.totalPln) || h.totalPln <= 0) return false;
  return Boolean(h.checkin && h.checkout);
}

/**
 * Ocena z uwzględnieniem WIARYGODNOŚCI (średnia ważona przez liczbę opinii).
 *
 * DLACZEGO NIE SAMA OCENA. Pierwszy przebieg sortował po `rating` i wszystkie
 * dwanaście kart wyszło z „10,0" — bo hotel z trzema opiniami zawsze pobije
 * hotel z pięcioma tysiącami. Sekcja z kompletem dziesiątek wygląda na
 * zmyśloną, mimo że każda liczba była prawdziwa. Dokładnie ten efekt jest
 * w PRODUCT.md wpisany jako antywzorzec („gwiazdki bez źródła").
 *
 * Wzór to standardowe ściąganie do średniej (shrinkage): ocena hotelu jest
 * mieszana z oceną odniesienia, a waga tej domieszki odpowiada `PRIOR_WEIGHT`
 * opiniom. Efekt zmierzony na realnych danych:
 *   10,0 przy    3 opiniach → 8,06   (obcy pensjonat spada)
 *   10,0 przy  275 opiniach → 9,47
 *    9,5 przy 5000 opiniach → 9,49   (znany hotel wygrywa)
 * Liczba na karcie zostaje NIEZMIENIONA — to jest wyłącznie klucz sortowania.
 */
const PRIOR_RATING = 8;
const PRIOR_WEIGHT = 100;

export function credibilityScore(rating?: number, reviewCount?: number): number {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return -1;
  const n = typeof reviewCount === "number" && reviewCount > 0 ? reviewCount : 0;
  return (rating * n + PRIOR_RATING * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
}

/**
 * Kolejność w pasie: najpierw najlepiej oceniane (z wagą wiarygodności),
 * przy remisie tańsze.
 *
 * NIE sortujemy po samej cenie: sekcja nazywa się „Polecane", więc pierwsza
 * karta musi być hotelem, który ktoś realnie poleca, a nie najtańszym
 * pokojem w zestawie. Hotel bez oceny ląduje za ocenionymi — brak danych
 * nie może wyglądać jak ocena zerowa.
 */
export function sortFeatured(hotels: FeaturedHotel[]): FeaturedHotel[] {
  return [...hotels].sort((a, b) => {
    const sa = credibilityScore(a.rating, a.reviewCount);
    const sb = credibilityScore(b.rating, b.reviewCount);
    if (sb !== sa) return sb - sa;
    return a.perNightPln - b.perNightPln;
  });
}

/**
 * Wybór kart kierunku: NAJLEPIEJ OCENIANE Z TAŃSZEJ CZĘŚCI OFERT.
 *
 * DLACZEGO NIE SAM RANKING JAKOŚCI (decyzja właściciela 2026-08-02).
 * Pierwsza wersja brała po prostu dwa najlepiej oceniane obiekty kierunku —
 * a najlepiej oceniane są zwykle najdroższe. Zmierzone na realnym przebiegu:
 * cały pas mieścił się w 553–2123 zł za dobę. Dla adresata tej strony
 * (polski turysta wypoczynkowy porównujący ceny na telefonie) sekcja
 * „Polecane" złożona z hoteli po 2000 zł za noc nie jest ofertą, tylko
 * informacją „to nie dla ciebie" — i zostaje przewinięta.
 *
 * DLACZEGO PRÓG LICZONY Z DANYCH, A NIE WPISANY Z RĘKI. Sztywne „do 600 zł"
 * znaczyłoby co innego w Neapolu, co innego na Maderze i co innego w szczycie
 * sezonu — a po kilku tygodniach po prostu przestałoby pasować. Mediana cen
 * TEGO kierunku na TE daty kalibruje się sama i nie wprowadza do serwisu ani
 * jednej liczby, której nikt nie policzył.
 *
 * Kolejność operacji jest istotna: najpierw odcinamy droższą część PO CENIE,
 * dopiero potem sortujemy PO JAKOŚCI. Odwrotnie (najpierw jakość, potem
 * przycięcie po cenie) dałoby znowu ranking luksusu, tylko krótszy.
 *
 * `Math.max(take, połowa)` to podłoga dla kierunków z ubogą pulą (zmierzone:
 * Palma potrafi dać 2–5 wycenionych obiektów) — gwarantuje, że da się zapełnić
 * `take` kart, gdy połowa jest mniejsza od tej liczby.
 *
 * Podłoga jest CELOWO równa `take`, nie `take * 2`. Pierwsza wersja miała
 * `take * 2` „dla większego wyboru" i test to wyłapał: przy puli sześciu
 * ofert odcięcie rosło do czterech, czyli wracał do niego hotel z drogiej
 * połowy (1500 zł obok 300/350/400) i cała obietnica „tańszej części" padała
 * dokładnie tam, gdzie oferta i tak jest uboga.
 */
export function pickValuePicks<T extends { perNightPln: number; rating?: number; reviewCount?: number }>(
  priced: readonly T[],
  take: number,
): T[] {
  if (take <= 0 || priced.length === 0) return [];
  const cutoff = Math.max(take, Math.ceil(priced.length / 2));
  const tansza = [...priced].sort((a, b) => a.perNightPln - b.perNightPln).slice(0, cutoff);
  return tansza
    .sort((a, b) => {
      const sa = credibilityScore(a.rating, a.reviewCount);
      const sb = credibilityScore(b.rating, b.reviewCount);
      if (sb !== sa) return sb - sa;
      return a.perNightPln - b.perNightPln;
    })
    .slice(0, take);
}

/** Świeży snapshot albo null. Nieświeży traktujemy jak brak — nigdy nie pokazujemy starej ceny. */
export function pickFreshFeatured(
  snapshot: FeaturedHotelsSnapshot | null,
  now: number = Date.now(),
): FeaturedHotel[] {
  if (!snapshot || !Array.isArray(snapshot.hotels)) return [];
  if (!Number.isFinite(snapshot.computedAt)) return [];
  if (now - snapshot.computedAt > FEATURED_FRESH_MS) return [];
  const usable = snapshot.hotels.filter(isDisplayableHotel);
  // Data wyjazdu z przeszłości = wpis, który przeleżał zmianę doby. Cena jest
  // wtedy formalnie świeża, ale termin już nieosiągalny — a karta linkuje
  // WŁAŚNIE na te daty, więc użytkownik trafiłby na pusty wynik.
  const today = new Date(now).toISOString().slice(0, 10);
  const bookable = usable.filter((h) => h.checkin > today);
  return bookable.length >= FEATURED_MIN ? sortFeatured(bookable).slice(0, FEATURED_MAX) : [];
}

// ── I/O ─────────────────────────────────────────────────────────────────────

/** Odczyt snapshotu. null = brak env / błąd / brak klucza (miss). */
export async function readFeaturedHotels(): Promise<FeaturedHotelsSnapshot | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<FeaturedHotelsSnapshot>(KEY);
    return v && typeof v === "object" && Array.isArray(v.hotels) ? v : null;
  } catch (err) {
    console.warn("[featured-hotels] read miss:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Zapis snapshotu — REPLACE, nie merge (odwrotnie niż dstprice:v1).
 *
 * Powód: tam kluczem jest kierunek i częściowy przebieg crona nie może
 * skasować kierunków, których akurat nie dotknął. Tutaj snapshot JEST
 * zestawem na dane okno rotacji — domieszanie poprzedniego oznaczałoby, że
 * „zmienia się co 6 godzin" przestaje być prawdą, a stare hotele zostają
 * w pasie ze starymi datami.
 */
export async function writeFeaturedHotels(hotels: FeaturedHotel[], now: number = Date.now()): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const payload: FeaturedHotelsSnapshot = {
      computedAt: now,
      hotels: sortFeatured(hotels.filter(isDisplayableHotel)).slice(0, FEATURED_MAX),
    };
    await client.set(KEY, payload, { ex: TTL_SECONDS });
  } catch (err) {
    console.warn("[featured-hotels] write skip:", err instanceof Error ? err.message : err);
  }
}
