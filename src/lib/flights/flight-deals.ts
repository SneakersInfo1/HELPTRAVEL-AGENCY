// Snapshot sekcji „Okazje lotnicze" (Upstash Redis, JEDEN klucz).
//
// Pisany przez cron /api/cron/warm-flight-deals (co 2 h), czytany serwerowo
// przy ISR przez stronę główną. Wzorzec best-effort jak hotfeat:v1 i
// dstprice:v1: KAŻDY błąd / brak env = miss → sekcja po prostu się nie
// renderuje. Pas marketingowy nigdy nie ma prawa wywrócić strony głównej.
//
// CO TU JEST SPRZEDAWANE, A CO MIERZONE
// Sekcja obiecuje „okazję", czyli twierdzenie PORÓWNAWCZE — a to jedyny
// rodzaj liczby na tej stronie, który da się podważyć nawet wtedy, gdy każda
// pojedyncza cena jest prawdziwa. Dlatego porównanie ma tu jawną definicję
// i jedno źródło:
//   • `pricePln`   — najniższa cena, jaką cron REALNIE znalazł na tej trasie,
//   • `typicalPln` — MEDIANA cen ze sprawdzonych terminów tej samej trasy
//                    (cron próbkuje sześć — patrz DEAL_SAMPLE_LEAD_DAYS —
//                    ale termin osiągalny wyłącznie kilkunastogodzinną trasą
//                    z próby wypada, więc bywa ich mniej),
//   • `sampleCount`— ile z tych terminów w ogóle dało cenę.
// Nie ma tu ceny „przed obniżką" ani ceny konkurencji, bo żadnej z nich nie
// mamy. `typicalPln` NIE jest przekreślana w interfejsie: to nigdy nie była
// cena tej oferty, tylko poziom odniesienia. Przekreślenie zrobiłoby z niej
// pozorny rabat — ryzyko z dyrektywy Omnibus i wprost zakazany wzorzec
// w PRODUCT.md.

import { Redis } from "@upstash/redis";

import { DEAL_MAX_PRICE_PLN } from "@/lib/flights/deals-config";
import { rotateSlice, rotationBucket } from "@/lib/home/rotation";

export interface FlightDeal {
  routeKey: string;
  originIata: string;
  originCityLabel: string;
  destinationIata: string;
  destinationId: string;
  cityLabel: string;
  countryLabel: string;
  depart: string;
  returnDate: string;
  nights: number;
  pricePln: number;
  typicalPln: number;
  savingPercent: number;
  sampleCount: number;
  airlineName: string;
  airlineCode: string;
  airlineLogo?: string;
  stops: number;
  durationMinutes: number;
  computedAt: number;
}

export type FlightDealsSnapshot = Record<string, FlightDeal>;

const KEY = "fltdeal:v1";
/** TTL chroni przed wiecznym wpisem; osobny próg niżej pilnuje świeżości kart. */
const TTL_SECONDS = 3 * 24 * 3600;
/**
 * Świeżość do WYŚWIETLENIA: 13 h.
 *
 * ARYTMETYKA POPRAWIONA PO REVIEW. Pierwotne 9 h opierało się na błędzie:
 * „pełny obrót 6 h plus jeden nieudany przebieg 2 h". Nieudany przebieg NIE
 * kosztuje dwóch godzin — konkretna trasa wraca dopiero po pełnym obrocie,
 * czyli po SZEŚCIU. Sukces o 00:35, awaria o 06:35, kolejna próba dopiero
 * o 12:35: przy progu 9 h karta znikała między 09:35 a 12:35 mimo JEDNEJ
 * awarii. 12 h pokrywa ten scenariusz, 13 h daje godzinę zapasu.
 *
 * To jest odporność OPERACYJNA, a nie deklaracja aktualności ceny. Aktualność
 * jest z natury krótsza (bilety zmieniają się w godzinach) i sekcja mówi o tym
 * wprost pod siatką kart, zamiast udawać, że liczba jest wiążąca.
 */
export const DEAL_FRESH_MS = 13 * 3600 * 1000;
export const DEAL_ROTATION_MS = 2 * 3600 * 1000;
/**
 * Ile kart pokazuje sekcja. Sześć, bo tyle dzieli się bez reszty przez każdą
 * liczbę kolumn siatki (1 na telefonie, 2 od `sm`, 3 od `xl`) — przy ośmiu
 * ostatni wiersz na desktopie zostawał z dwiema kartami i wyglądał jak
 * urwane dane. Zmierzony realny urobek to ok. 6 okazji na 12 zbadanych tras,
 * więc przy puli 36 ten limit jest realnie osiągalny.
 */
export const DEAL_MAX = 6;
/** Poniżej tylu kart sekcja się nie renderuje — dwa wiersze pod nagłówkiem
 *  „Okazje lotnicze" czytają się jak awaria zbierania danych, nie jak wybór. */
export const DEAL_MIN = 3;
/** Poniżej czterech wycenionych terminów nie wolno mówić o „typowej cenie":
 *  mediana z dwóch próbek to po prostu ich średnia. */
export const DEAL_MIN_SAMPLES = 4;
export const DEAL_MAX_RATIO = 0.8;
export const DEAL_MIN_ABS_PLN = 120;

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
      console.warn("[flight-deals] UPSTASH env brak — sekcja okazji lotniczych WYŁĄCZONA.");
      warnedMissingEnv = true;
    }
    redis = null;
    return null;
  }
  redis = new Redis({ url, token }) as unknown as RedisLike;
  return redis;
}

/** Seam testowy zgodny z pozostałymi snapshotami Upstash. */
export function __setFlightDealsRedisForTests(client: RedisLike | null): void {
  injected = client;
}

export function __resetFlightDealsRedisForTests(): void {
  injected = undefined;
  redis = undefined;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Math.round(value);
}

export function savingPercent(pricePln: number, typicalPln: number): number {
  // Nonsens na wejściu ma dawać 0, a nie NaN: NaN przeszedłby przez każde
  // porównanie jako `false` i wylądował na karcie jako „−NaN%".
  if (!Number.isFinite(pricePln) || !Number.isFinite(typicalPln)) return 0;
  if (typicalPln <= 0 || pricePln >= typicalPln) return 0;
  return Math.round(((typicalPln - pricePln) / typicalPln) * 100);
}

/**
 * Czy lot nadaje się na kartę.
 *
 * ZMIANA REGUŁY (2026-08-02, po obejrzeniu sekcji przez właściciela).
 * Wcześniej decydowała WIELKOŚĆ RÓŻNICY między najtańszym a typowym terminem.
 * Efekt był poprawny formalnie i bezużyteczny w praktyce: karty pokazywały
 * −34% na locie za 2 828 zł. Właściciel postawił sprawę wprost — „zależy mi na
 * ofertach od 200 do 800, 900 zł maksymalnie".
 *
 * Więc kryterium jest teraz CENA, nie rabat: lot musi zmieścić się pod
 * `DEAL_MAX_PRICE_PLN`. Różnica wobec pozostałych terminów nie znika — dalej
 * ją liczymy i pokazujemy tam, gdzie jest realna (patrz `hasMeaningfulSpread`)
 * — ale przestała być przepustką do sekcji.
 *
 * Wymóg `DEAL_MIN_SAMPLES` zostaje: bez kilku wycen nie wiemy, czy trafiliśmy
 * na realną cenę, czy na jednorazowy artefakt wyszukiwarki.
 */
export function qualifiesAsDeal(pricePln: number, typicalPln: number, sampleCount: number): boolean {
  if (!Number.isFinite(sampleCount) || sampleCount < DEAL_MIN_SAMPLES) return false;
  if (!Number.isFinite(pricePln) || pricePln <= 0) return false;
  if (!Number.isFinite(typicalPln) || typicalPln <= 0) return false;
  return pricePln <= DEAL_MAX_PRICE_PLN;
}

/**
 * Czy różnica wobec pozostałych terminów jest na tyle duża, żeby w ogóle
 * o niej wspominać na karcie.
 *
 * Oba progi naraz, bo każdy sam kłamie inaczej: 8% mieści się w zwykłym szumie
 * cen biletów, a 25% z 300 zł to 75 zł, czyli kwota, dla której nikt nie
 * przestawia terminu wyjazdu. Poniżej progu karta pokazuje samą cenę —
 * to uczciwsze niż dopisywanie odniesienia, które niczego nie zmienia.
 */
export function hasMeaningfulSpread(pricePln: number, typicalPln: number): boolean {
  if (!Number.isFinite(pricePln) || !Number.isFinite(typicalPln)) return false;
  if (pricePln <= 0 || typicalPln <= 0) return false;
  return pricePln <= typicalPln * DEAL_MAX_RATIO && typicalPln - pricePln >= DEAL_MIN_ABS_PLN;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Redis jest granicą zewnętrzną, więc nie ufamy nawet wpisowi zgodnemu z typem TS. */
export function isDisplayableDeal(value: unknown): value is FlightDeal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const deal = value as Partial<FlightDeal>;
  if (!isNonEmptyString(deal.routeKey)) return false;
  if (!isNonEmptyString(deal.originIata) || !isNonEmptyString(deal.originCityLabel)) return false;
  if (!isNonEmptyString(deal.destinationIata) || !isNonEmptyString(deal.destinationId)) return false;
  if (!isNonEmptyString(deal.cityLabel) || !isNonEmptyString(deal.countryLabel)) return false;
  if (!isNonEmptyString(deal.airlineName) || !isNonEmptyString(deal.airlineCode)) return false;
  if (typeof deal.depart !== "string" || !ISO_DATE.test(deal.depart)) return false;
  if (typeof deal.returnDate !== "string" || !ISO_DATE.test(deal.returnDate)) return false;
  if (!isFiniteNumber(deal.pricePln) || deal.pricePln <= 0) return false;
  // `pricePln <= typicalPln`, a NIE `<`. To nie jest drobiazg: `pricePln` jest
  // minimum z tych samych próbek, z których liczona jest mediana, więc gdy
  // trasa ma wszędzie tę samą cenę (zmierzone: Oslo 627/627/781 → mediana 627,
  // minimum 627), obie liczby są równe. Poprzedni warunek `>=` odrzucał wtedy
  // wpis — czyli najtańszą trasę z całej sondy sekcja nigdy by nie pokazała.
  if (!isFiniteNumber(deal.typicalPln) || deal.typicalPln <= 0) return false;
  if (deal.pricePln > deal.typicalPln) return false;
  // Zero jest poprawną wartością: brak różnicy między terminami nie unieważnia
  // taniego lotu, tylko sprawia, że karta nie pokazuje wiersza odniesienia.
  if (!isFiniteNumber(deal.savingPercent) || deal.savingPercent < 0) return false;
  if (!isFiniteNumber(deal.nights) || deal.nights <= 0) return false;
  if (!isFiniteNumber(deal.stops) || deal.stops < 0) return false;
  if (!isFiniteNumber(deal.durationMinutes) || deal.durationMinutes <= 0) return false;
  if (!isFiniteNumber(deal.sampleCount) || deal.sampleCount < DEAL_MIN_SAMPLES) return false;
  if (!isFiniteNumber(deal.computedAt)) return false;
  if (deal.airlineLogo !== undefined && typeof deal.airlineLogo !== "string") return false;
  return true;
}

/**
 * Kolejność w sekcji: NAJTANIEJ NA GÓRZE, przy remisie większa różnica wobec
 * pozostałych terminów.
 *
 * Odwrotnie niż w pierwszej wersji, gdzie rządził procent — przez co pierwszą
 * kartą bywał lot za 2 828 zł z efektownym „−34%". Sekcja nazywa się „tanie
 * loty", więc pierwsze co widać, ma być najniższą kwotą.
 */
function sortDeals(deals: FlightDeal[]): FlightDeal[] {
  return [...deals].sort((a, b) => {
    if (a.pricePln !== b.pricePln) return a.pricePln - b.pricePln;
    return b.savingPercent - a.savingPercent;
  });
}

export function pickFreshDeals(snapshot: FlightDealsSnapshot | null, now: number = Date.now()): FlightDeal[] {
  if (!snapshot) return [];
  const today = new Date(now).toISOString().slice(0, 10);
  const fresh = Object.values(snapshot)
    .filter(isDisplayableDeal)
    // SUFIT CENY EGZEKWOWANY TAKŻE PRZY ODCZYCIE, nie tylko przy zapisie.
    // Bez tego obietnica z podtytułu („wszystkie poniżej 900 zł") zależałaby
    // od tego, która wersja crona zapisała wpis: klucz Redis przeżywa
    // wdrożenie, więc karta za 2 828 zł zapisana przez poprzednią regułę
    // renderowałaby się jeszcze kilkanaście godzin po zmianie. Warunek
    // wyświetlania musi wynikać z tego, co strona OBIECUJE, a nie z tego,
    // co akurat leży w bazie.
    .filter((deal) => deal.pricePln <= DEAL_MAX_PRICE_PLN)
    .filter((deal) => now - deal.computedAt <= DEAL_FRESH_MS)
    .filter((deal) => deal.depart > today);

  let selected = sortDeals(fresh);
  if (selected.length > DEAL_MAX) {
    const candidates = selected.slice(0, DEAL_MAX * 2);
    selected = sortDeals(
      rotateSlice(candidates, DEAL_MAX, rotationBucket(now, DEAL_ROTATION_MS)),
    );
  }
  return selected.length < DEAL_MIN ? [] : selected.slice(0, DEAL_MAX);
}

/** Odczyt best-effort: awaria sekcji marketingowej nie może wywrócić strony. */
export async function readFlightDeals(): Promise<FlightDealsSnapshot | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get<FlightDealsSnapshot>(KEY);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (error) {
    console.warn("[flight-deals] read miss:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Zapis: MERGE dla tras z okazją + JAWNE USUNIĘCIE tras sprawdzonych bez niej.
 *
 * Sam merge (jak w dstprice:v1) jest tu za mało, i to nie kosmetycznie.
 * Jeden przebieg dotyka ośmiu z dwudziestu czterech tras, więc replace
 * kasowałby dwie trzecie puli — ale sam merge zostawiałby w kluczu trasę,
 * która OKAZJĄ JUŻ NIE JEST. Scenariusz jest zwyczajny: rano WAW→BCN kosztuje
 * 380 zł przy medianie 700, po południu przewoźnik podnosi do 690 i przestaje
 * spełniać próg. Cron ją sprawdza i nic nie zapisuje, a stary wpis wisi na
 * stronie do wygaśnięcia świeżości — czyli serwis dalej pokazuje „380 zł,
 * −46%" na ofertę, której nie ma.
 *
 * Dlatego cron przekazuje `checkedWithoutDeal`: klucze tras, które w TYM
 * przebiegu sprawdził i które progu nie przeszły. Wpis w snapshocie znaczy
 * wtedy dokładnie tyle: „ostatnim razem, gdy patrzyliśmy, to wciąż była
 * okazja". Trasy nietknięte w tym przebiegu zostają bez zmian — o ich
 * wygaśnięciu decyduje `DEAL_FRESH_MS` przy odczycie.
 */
export async function mergeFlightDeals(
  entries: FlightDealsSnapshot,
  checkedWithoutDeal: readonly string[] = [],
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const validEntries = Object.fromEntries(
      Object.entries(entries).filter(([, deal]) => isDisplayableDeal(deal)),
    ) as FlightDealsSnapshot;
    const current = await client.get<FlightDealsSnapshot>(KEY);
    const existing = current && typeof current === "object" && !Array.isArray(current) ? current : {};
    const merged: FlightDealsSnapshot = { ...existing, ...validEntries };
    // Wpisy tak stare, że żaden odczyt już ich nie pokaże, a merge w kółko
    // odnawia im TTL — np. trasa kiedyś wykreślona z puli, do której cron już
    // nigdy nie zajrzy. Zapas dwukrotny wobec progu świeżości, żeby nie
    // skasować niczego, co jeszcze może wrócić do gry.
    const nieodwracalnieStare = Date.now() - DEAL_FRESH_MS * 2;
    for (const [key, deal] of Object.entries(merged)) {
      if (!Number.isFinite(deal?.computedAt) || deal.computedAt < nieodwracalnieStare) {
        delete merged[key];
      }
    }
    for (const key of checkedWithoutDeal) {
      // Trasa, dla której w tym samym przebiegu powstał świeży wpis, nie może
      // zostać skasowana przez pomyłkę w liście „bez okazji".
      if (!(key in validEntries)) delete merged[key];
    }
    await client.set(KEY, merged, { ex: TTL_SECONDS });
  } catch (error) {
    console.warn("[flight-deals] merge skip:", error instanceof Error ? error.message : error);
  }
}
