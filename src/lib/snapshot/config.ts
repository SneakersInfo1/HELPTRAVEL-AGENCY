// Parametry przebiegu budowy snapshotu — jedno miejsce, w którym stoi
// arytmetyka kosztu i czasu (§25, §26).
//
// LICZBY POCHODZĄ Z POMIARU NA PREVIEW (2026-09-06), nie z szacunku.
// Benchmark współbieżności: 8 zimnych zadań na segment, każdy poziom na innym
// (równie zimnym) segmencie, wszystko jako dry run:
//
//   współbieżność │ czas 8 zadań │ na zadanie │ błędy │ 429/5xx
//   ──────────────┼──────────────┼────────────┼───────┼────────
//        1        │   111,2 s    │   13,9 s   │   0   │   0
//        2        │    56,2 s    │    7,0 s   │   0   │   0
//        3        │    48,6 s    │    6,1 s   │   0   │   0
//        4        │    20,3 s    │    2,5 s   │   0   │   0
//        5        │    19,2 s    │    2,4 s   │   0   │   0
//        6        │    57,2 s    │    7,2 s   │   0   │   0
//
// Wnioski, które z tego biorę:
//   • skalowanie jest ~liniowe do 4–5, powyżej nie ma zysku → SWEET SPOT 5;
//   • na ŻADNYM poziomie nie było błędu, timeoutu ani 429 — nie ocieramy się
//     o limiter (V2.1 zmierzył go dopiero przy 325 zapytaniach);
//   • rozrzut czasu POJEDYNCZEGO zadania jest ogromny (2,4–13,9 s) i zależy od
//     trasy, nie od współbieżności — dlatego budżet zadań liczę z gorszego,
//     a nie ze średniego przypadku.
//
// BUDŻET ZADAŃ. Przy współbieżności 5 fala 5 zadań schodziła ~9,6 s
// (19,2 s / 2 fale). 170 s / 9,6 s ≈ 17 fal ≈ 85 zadań. Biorę 70, żeby
// wolniejszy dzień u dostawcy nie ucinał końcówki planu — to jest ten
// margines, którego `warm-rates` nie ma (mierzone 178–280 s przy limicie
// 300 s, czyli do 93%; §25 chce ≤70%).
//
// ROTACJA. Pełna lista to 1020 zadań (53 kierunki tieru A × 8 okien × 1–2
// wyloty + 86 kierunków tieru B × 2 okna).
//
// SEGMENT_COUNT = 20, a nie 15 — i to jest wniosek Z POMIARU, nie z ostrożności.
// Pełny obieg 15/15 na Preview zamknął się czysto (segmenty 6–14: 68/68 zadań,
// zero timeoutów, 95–174 s), ALE segment 3 przekroczył budżet czasu na OBU
// zimnych przebiegach: 54/68 i 59/68. To nie był szum — ten sam segment,
// dwa razy, przy dwóch różnych stanach cache'u.
//
// Dlaczego to groźne: `planRun` zwraca zadania w STAŁEJ kolejności priorytetu,
// a budżet czasu ucina KONIEC listy. Segment, który regularnie się nie mieści,
// gubi więc ZA KAŻDYM RAZEM ten sam ogon — a nie losowe zadania. Samonaprawa
// istnieje, ale tylko w oknie cache'u lotów: powtórka segmentu 3 zaraz po
// nieudanej zrobiła 68/68 w 33 s przy 61 trafieniach w `flrt:v2` (TTL 40 min).
// Produkcyjny harmonogram wraca do segmentu dopiero po pełnym obiegu, czyli
// z zimnym cache'em — więc w praktyce ten ogon nigdy by się nie odświeżył.
//
// Arytmetyka doboru: najgorsze zmierzone tempo startu zadań (segment 3, zimno)
// to 54 zadania w 170 s = 3,15 s/zadanie. 1020 / 20 = 51 zadań na segment,
// czyli 51 × 3,15 ≈ 161 s — mieści się w budżecie 170 s z zapasem. Podniesienie
// samego deadline'u byłoby leczeniem objawu: zjadłoby margines do maxDuration,
// którego brak jest właśnie chorobą `warm-rates` (178–280 s przy limicie 300 s).
//
// Koszt: pełny obieg to 20 przebiegów × 30 min = 10 h, wciąż WEWNĄTRZ progu
// FRESH (12 h) z coverage.ts. Suma zadań w obiegu się nie zmienia — zmienia się
// tylko ich rozłożenie w czasie, więc pokrycie po pełnym obiegu jest identyczne.
//
// KOSZT: ~51 lotów + ~51 stawek + ~35 metadanych ≈ 140 zapytań na przebieg,
// × 48 przebiegów = ~6 700 na dobę. Obecna baza (`warm-rates` co 30 min +
// trzy pozostałe crony) to ~16 000/dobę, więc wzrost to ~+53% — poniżej progu
// „2× baseline", przy którym §57 każe się zatrzymać i pytać. Część zapytań
// lotniczych trafia w istniejący `flrt:v2` (benchmark widział 0–3 trafienia
// na 8 zadań), więc realny wzrost jest niższy.

/** Ile zadań maksymalnie bierze jeden przebieg. */
export const TASK_BUDGET = 70;
/** Na ile segmentów dzielimy pełną listę zadań (= długość obiegu w przebiegach). */
export const SEGMENT_COUNT = 20;
/** Odstęp crona — wchodzi do deterministycznego wyboru segmentu z zegara. */
export const RUN_INTERVAL_MS = 30 * 60 * 1000;
/** Współbieżność zapytań do dostawcy — sweet spot z tabeli w nagłówku. */
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
