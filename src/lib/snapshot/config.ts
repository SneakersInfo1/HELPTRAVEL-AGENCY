// Parametry przebiegu budowy snapshotu — jedno miejsce, w którym stoi
// arytmetyka kosztu i czasu (§25, §26).
//
// SKĄD TE LICZBY. Pełna lista zadań to 1020 pozycji (53 kierunki tieru A ×
// 8 okien × 1–2 wyloty + 86 kierunków tieru B × 2 okna). Jedno zadanie to
// zapytanie o lot (~6 s zimno) i o stawki hotelowe (~3,3 s), puszczane
// równolegle, więc realnie ~6,5 s na zadanie.
//
// Budżet czasu 170 s przy współbieżności 5 daje ~130 zadań na przebieg:
//   170 s / 6,5 s × 5 ≈ 130
// Bierzemy 110 z zapasem na wolniejszy dzień u dostawcy — i to jest właśnie
// ten margines, którego `warm-rates` nie ma (mierzone 178–280 s przy limicie
// 300 s, czyli do 93% budżetu; §25 chce ≤70%).
//
// 1020 zadań / 110 na przebieg ≈ 10 segmentów. Cron co godzinę → pełny obieg
// zamyka się w ~10 h, co zgadza się z progiem FRESH (12 h) w coverage.ts.
//
// KOSZT: ~110 lotów + ~110 stawek + ~40 metadanych = ~260 zapytań na przebieg,
// × 24 przebiegi = ~6 200 zapytań na dobę. Obecna baza (`warm-rates` co 30 min
// + trzy pozostałe crony) to ~16 000/dobę, więc wzrost to ~38% — wyraźnie
// poniżej progu „2× baseline", przy którym §57 każe się zatrzymać i pytać.

/** Ile zadań maksymalnie bierze jeden przebieg. */
export const TASK_BUDGET = 110;
/** Na ile segmentów dzielimy pełną listę zadań (= długość obiegu w przebiegach). */
export const SEGMENT_COUNT = 10;
/** Odstęp crona — wchodzi do deterministycznego wyboru segmentu z zegara. */
export const RUN_INTERVAL_MS = 3600 * 1000;
/**
 * Współbieżność zapytań do dostawcy. 5, nie 10: pomiar V2.1 pokazał, że seria
 * zimnych wyszukań POGARSZA czasy LiteAPI, a limiter odpowiada 429 z
 * `Retry-After: 59` (zmierzone przy 325 zapytaniach). Tempo dobieramy tak,
 * żeby nigdy się o ten próg nie otrzeć.
 */
export const CONCURRENCY = 5;
/** Twardy budżet czasu przebiegu — z dużym zapasem do maxDuration 300 s. */
export const TIME_BUDGET_MS = 170_000;
/** Ile hoteli skanujemy na kierunek szukając najtańszej stawki. */
export const HOTELS_PER_DEST = 50;
/** Pax, dla którego pytamy o lot. Para to najczęstszy wariant leisure — ten
 *  sam, którym grzeje `warm-flights`, więc wpis trafia w cache użytkownika. */
export const FLIGHT_ADULTS = 2;
/** Ile okien z macierzy dostaje tier B. */
export const TIER_B_WINDOWS = 2;
/** TTL blokady crona — musi przekraczać najdłuższy realny przebieg. */
export const LOCK_TTL_SECONDS = 420;
