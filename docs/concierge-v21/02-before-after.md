# Concierge V2.1 — BEFORE vs AFTER

Dwa niezależne pomiary, bo odpowiadają na dwa różne pytania. Wnioski
o wpływie zmian opieram na **pierwszym** — drugi jest zbyt zaszumiony przez
niedeterminizm modelu, co pokazuję niżej liczbami.

| pomiar | co porównuje | wiarygodność |
|---|---|---|
| **A. benchmark narzędzi** | ten sam skrypt, te same 39 przypadków, ta sama infrastruktura, RÓŻNI SIĘ TYLKO KOD | wysoka — kontrolowany |
| **B. żywe tury czatu** | te same 21 pytań, ale model sam decyduje, czy sięgnąć po narzędzie | niska przy n=21 |

---

## A. BENCHMARK NARZĘDZI — POMIAR KONTROLOWANY

39 przypadków × 2 przebiegi = 78 pomiarów, Preview `iad1`, bez modelu.
BEFORE = `3077fcc` (sama instrumentacja), AFTER = `ae807e4`.

### Czas wywołania narzędzia (ms)

| | BEFORE p50 | AFTER p50 | | BEFORE p95 | AFTER p95 | | BEFORE max | AFTER max |
|---|---|---|---|---|---|---|---|---|
| **wszystko** | 2561 | **217** (−92%) | | 14 398 | **9 649** (−33%) | | 28 604 | **12 158** (−57%) |
| przebieg 1 (zimno) | 6404 | 4542 (−29%) | | 13 582 | 11 788 (−13%) | | 14 398 | 12 158 (−16%) |
| przebiegi 2+ (ciepło) | 1494 | **202** (−86%) | | 23 449 | **302** (−99%) | | 28 604 | **305** (−99%) |
| `search_trips` | 1733 | 295 (−83%) | | 9841 | 9830 (−0%) | | 10 295 | 12 158 (+18%) |
| `get_trip_offer` | 4776 | **202** (−96%) | | 23 449 | **9 649** (−59%) | | 28 604 | 11 788 (−59%) |

### Rozbicie na zależności (ms)

| etap | BEFORE p50 | AFTER p50 | BEFORE p95 | AFTER p95 | BEFORE max | AFTER max |
|---|---|---|---|---|---|---|
| **`liteapi.flight`** | 2365 | **117** (−95%) | 14 398 | **9 649** (−33%) | 28 603 | **11 953** (−58%) |
| `liteapi.hotel` | 195 | 193 | 3369 | 3182 | 3574 | 3245 |
| `redis.snapshot` | 200 | **97** (−52%) | 296 | 199 | 369 | 201 |
| `liteapi.gallery` | 8 | 3 | 46 | 24 | 127 | 287 |
| `rank` | 0 | 0 | 1 | 1 | 1 | 1 |

Cały przebieg benchmarku: **195,6 s → 84,7 s**. To jest też miara obciążenia
LiteAPI: ten sam zestaw zapytań kosztuje dziś o ponad połowę mniej.

### Trafienia w cache — najmocniejszy dowód

| przypadek | BEFORE | AFTER | co się zmieniło |
|---|---|---|---|
| `offer.warm.Barcelona` | 13 582 ms | **307 ms** | trasa grzana przez cron `warm-flights`, wcześniej i tak czytana na zimno |
| `offer.warm.weekend` | 9 919 ms | **321 ms** | jw. |
| `offer.warm.Malaga` | 6 645 ms | **220 ms** | jw. |
| `offer.island-alias` (przebieg 2) | 10 851 ms | **248 ms** | powtórka tego samego zapytania w jednej sesji |
| `offer.warm.cheap-window` (przebieg 2) | 23 449 ms | **197 ms** | jw. |

### Czego pomiar NIE pokazuje

Kilka przypadków jest w przebiegu 1 wolniejszych niż wcześniej —
`search.country+theme.spain-city` 2144 → 9830 ms, `search.theme.city-break`
10 295 → 12 158 ms. To **nie jest regresja kodu**, tylko zmienność zimnego
`/flights/rates` po stronie dostawcy: w przebiegu 2 te same przypadki dają
302 ms i 296 ms (wcześniej 1880 ms i 1422 ms). Porównanie „przebieg 1 do
przebiegu 1" jest z natury najbardziej zaszumionym wycinkiem tego pomiaru —
rozstrzyga agregat i przebieg 2.

### Stany wyniku — zero regresji jakościowej

`AUTO_VALID 36 · VALID 34 · EMPTY 4 · UNAVAILABLE 2 · PARTIAL 2` — **identyczne
przed i po**. Przyspieszenie nie odbyło się kosztem gorszych ofert.

Zmienił się natomiast skutek stanu `UNAVAILABLE`:

| przypadek | BEFORE | AFTER |
|---|---|---|
| `offer.unavailable.nonsense-city` | `hasOffer=true` → **pusta karta w czacie** | `hasOffer=false` → brak karty, model dostaje jawną notę |
| `offer.partial.no-airport` | `hasOffer=true` | `hasOffer=true` (słusznie — jest realny lot do pokazania) |

---

## B. ŻYWE TURY CZATU — I DLACZEGO NIE WYCIĄGAM Z NICH WNIOSKÓW O CZASIE

21 tych samych pytań, ten sam dzień, ten sam model (`anthropic/claude-haiku-4.5`),
ten sam Upstash i ten sam LiteAPI. BEFORE = produkcja (kod sprzed V2.1),
AFTER = Preview.

| | BEFORE | AFTER |
|---|---|---|
| wszystkie tury p50 | 7055 | 5447 |
| p75 | 8627 | 10 901 |
| p95 | 16 103 | 17 329 |
| max | 24 650 | 20 912 |
| kart oferty | 13/21 | 11/21 |

**Ten pomiar niczego nie dowodzi i nie należy go tak czytać.** Powód jest
w danych: model sam decyduje, czy sięgnąć po narzędzie, i przy tych samych
pytaniach zdecydował INACZEJ w obu przebiegach.

| pytanie | BEFORE | AFTER | narzędzia w AFTER |
|---|---|---|---|
| „City break na 3 noce…" | 15 455 ms, karta | 1817 ms, bez karty | **0** — model zadał pytanie zamiast szukać |
| „Portugalia, 7 nocy…" | 16 103 ms, karta | 1733 ms, bez karty | **0** — jw. |
| „Najtaniej jak się da…" | 8627 ms, karta | 4491 ms, bez karty | 1, ale bez motywu → wynik z `reason` |
| „Chcę wyjazd do Sliemy…" | 1719 ms, bez karty | 13 000 ms, **karta** | 1 |

Trzy z czterech różnic w liczbie kart to tury, w których model AFTER **w ogóle
nie wywołał `search_trips`**. Kodu narzędzi to nie dotyczy. Przy n=21 i takiej
zmienności czas ściany mierzy losowość modelu, nie zmianę.

### Rozbicie serwerowe PROD vs PREVIEW — apples-to-apples

Produkcja też loguje `modelMs`/`toolMs` (commit `0fbbb27` jest na `main`), więc
rozbicie dla strony BEFORE dało się dociągnąć z logów runtime BEZ ponownego
płatnego przebiegu. Dwadzieścia jeden linii `[concierge] turn` z 14:51:37–
14:56:30 UTC odpowiada **1:1** dwudziestu jeden pomiarom klienta (elapsed
serwera vs czas ściany różnią się wyłącznie o narzut sieci, 0–2,5 s, 21/21).

| | PROD V2 | PREVIEW V2.1 | delta |
|---|---|---|---|
| **cała tura — wszystkie** | | | |
| n | 21 | 21 | — |
| p50 | 7055 | 5447 | −23% |
| p75 | 8627 | 10 901 | +26% |
| p95 | 16 103 | 17 329 | +8% |
| max | 24 650 | 20 912 | −15% |
| **cała tura — z narzędziem** | | | |
| n | 14 | 13 | — |
| p50 | 7812 | 10 635 | +36% |
| p75 | 11 816 | 13 000 | +10% |
| p95 | 24 650 | 20 912 | −15% |
| max | 24 650 | 20 912 | −15% |
| **model** | | | |
| MODEL p50 (wszystkie) | 5380 | 4161 | −23% |
| MODEL p95 (wszystkie) | 7233 | 6353 | −12% |
| MODEL p50 (z narzędziem) | 5787 | 5447 | −6% |
| MODEL p95 (z narzędziem) | 7449 | 8914 | +20% |
| **narzędzia** | | | |
| TOOL p50 (wszystkie) | 1038 | 222 | −79% |
| TOOL p95 (wszystkie) | 9613 | 11 470 | +19% |
| TOOL p50 (z narzędziem) | 1607 | 3798 | +136% |
| TOOL p95 (z narzędziem) | 16 790 | 11 762 | −30% |
| TOOL max | 16 790 | 11 762 | −30% |
| **jakość** | | | |
| error rate | **0/21** | **0/21** | bez zmian |
| zapas modelu odpalony | 1 (Haiku → Gemini) | 0 | lepiej |
| outcome | ok 8 · ok+offer 13 | ok 10 · ok+offer 11 | patrz niżej |
| karta oferty | 13/21 | 11/21 | patrz niżej |
| tury bez narzędzia | 7 | 8 | patrz niżej |

### TA TABELA NIE POKAZUJE POPRAWY CZASU NARZĘDZI — I NIE POWINNA

`TOOL p50 (z narzędziem)` rośnie z 1607 do 3798 ms. Nie jest to regresja
kodu; są dwa powody, oba widoczne w danych per pytanie.

**1. V2.1 celowo zmienia, KTÓRY kierunek jest wyszukiwany.** To jest poprawka
§12/§13, a koszt `/flights/rates` różni się o rząd wielkości między trasami.

| pytanie | PROD: narzędzia | PREVIEW: narzędzia | co wybrał ranking |
|---|---|---|---|
| „Hiszpania, ale w góry" | 1956 ms | 7532 ms | PREVIEW wybrał **Teneryfę** (ręczny pick motywu `gory`) zamiast bliskiego taniego miasta — czyli poprawną odpowiedź na pytanie o góry, ale drozszą w wyszukaniu |
| „Pokaż ofertę do Barcelony" | 1504 ms | 11 762 ms | inne daty listopadowe, trasa zimna |
| „Cypr na tydzień" | 1354 ms | 5704 ms | jw. |

**2. Model wywołał narzędzia na INNYM podzbiorze pytań** (14 vs 13 tur):

| pytanie | PROD | PREVIEW |
|---|---|---|
| „City break na 3 noce…" | narzędzia 7793 ms, karta | **0 narzędzi** — model zadał pytanie |
| „Portugalia, 7 nocy…" | narzędzia 9613 ms, karta | **0 narzędzi** — jw. |
| „Najtaniej jak się da…" | narzędzia 1791 ms, karta | narzędzie bez I/O (brak motywu → `reason`) |
| „Chcę wyjazd do Sliemy…" | **0 narzędzi**, bez karty | narzędzia 6284 ms, **karta** |

Dwa najdroższe wywołania produkcji (7793 i 9613 ms) wypadły z próby PREVIEW,
bo model tam po prostu nie sięgnął po `search_trips`. Przy n=13/14 to
przesuwa medianę bardziej niż cokolwiek, co zrobił kod.

**Wniosek: różnica 13 kart vs 11 to w 3 z 4 przypadków decyzja modelu, a nie
zmiana narzędzi. Czasu narzędzi z tego przebiegu NIE da się przypisać
zmianie i tego nie robię.** Wniosek o czasie opieram wyłącznie na pomiarze
kontrolowanym z sekcji A, gdzie wejście jest identyczne, a modelu nie ma.

### Dlaczego pomiar kontrolowany NIE jest tak samo skażony

Naturalny zarzut: BEFORE biegł pierwszy (16:12), AFTER drugi (16:44) — może
AFTER korzystał z rozgrzanego LiteAPI, a nie z naszego cache'a. Dane to
obalają. Gdyby chodziło o rozgrzanie po stronie dostawcy, POWTÓRKA tego
samego zapytania w przebiegu BEFORE byłaby tania. Nie jest:

| przypadek (czas `liteapi.flight`) | BEFORE 1. | BEFORE 2. | AFTER 1. | AFTER 2. |
|---|---|---|---|---|
| `offer.warm.Barcelona` | 13 582 | 3572 | 195 | 197 |
| `offer.warm.Malaga` | 6644 | 1250 | 199 | 196 |
| `offer.island-alias` | 10 850 | **28 603** | 102 | 106 |
| `offer.warm.cheap-window` | 6738 | **23 449** | 7824 | 103 |
| `offer.cold.window` | 14 398 | 1489 | 11 788 | 116 |

Mediana całego wywołania w przebiegu 2: **BEFORE 1494 ms · AFTER 202 ms**.
Powyżej 2 s: **BEFORE 14/39 · AFTER 0/39**. Powtórka po stronie BEFORE
potrafiła być WOLNIEJSZA od pierwszego strzału (island-alias 10 850 →
28 603 ms), czego rozgrzewaniem wytłumaczyć się nie da. Płaskie 100–200 ms
po stronie AFTER to czas round-tripu do Upstasha — jedyne, co może go dać,
to odczyt `flrt:v2`, którego stary kod nie wykonywał.

---

## C. CEL Z §43 — NIEOSIĄGNIĘTY, I DLACZEGO

Cel: tura z narzędziem p50 < 9 s, p95 < 15 s.
Zmierzone na PREVIEW: **p50 10 635 ms, p95 20 912 ms.** Cel nie został
osiągnięty (na produkcji te same pytania dały p50 7812 / p95 24 650 ms —
przy zastrzeżeniach z sekcji B).

Co go blokuje — rozbicie z `?diag=1`, nie domysł:

1. **Model: p50 5447 ms, p95 8914 ms.** Tura z narzędziem to dwa okrążenia
   do OpenRoutera (wywołanie narzędzia + odpowiedź końcowa). Sam model zjada
   ponad połowę p50. Model i streaming są w tym zleceniu zamknięte, więc tej
   części V2.1 nie mogło ruszyć. To jest największa pozostała dźwignia.
2. **Zimne `/flights/rates`: p50 5604 ms, p95 11 758 ms** na trasach i datach,
   których nikt nie wygrzał. Cache zamienia drugie i każde kolejne zapytanie
   na ~100–300 ms, ale pierwszego nie skróci — to czas po stronie dostawcy.
   Widać to wprost: w benchmarku ten sam przypadek daje 9830 ms na zimno
   i 302 ms na ciepło.

Wniosek: **narzędzia mieszczą się dziś w celu (p95 9,6 s przy budżecie 10–12 s
z §25), a całej tury nie domyka czas modelu.** Dalsze skracanie tury wymaga
albo streamingu (odroczony), albo szerszego prewarmingu lotów (patrz §8
audytu — dziś nie ma na to budżetu czasu w cronie).

---

## D. JAKOŚĆ — ODPOWIEDZI Z ŻYWEGO PREVIEW

Sześć tur zapisanych z pełną treścią (`bench/out/turns-quality.json`).
Sprawdzane: czy każda kwota pochodzi z narzędzia, czy stan oferty jest
opisany zgodnie z prawdą, czy motyw i miesiąc są uwzględnione.

| sprawdzenie | wynik |
|---|---|
| każda kwota z wyniku narzędzia | **6/6** — sprawdzone rachunkiem, np. hotel 3613 + lot 2036 = 5649, /2 = 2825, dokładnie tak jak w odpowiedzi |
| przekroczenie budżetu nazwane przekroczeniem | **tak** — „3351 zł na osobę, czyli o 351 zł ponad budżet" (3351 − 3000 = 351) |
| inny miesiąc nazwany wprost | **tak** — „tańsze alternatywy (orientacyjnie na październik)" |
| motyw nie ginie przy podanym kraju | **tak** — „Hiszpania, ale w góry" dało Teneryfę (ręczny pick motywu `gory`) PRZED tańszym Bilbao; przed V2.1 kraj wyparłby motyw i wróciłaby lista wg popularności seedu |
| brak wyniku nazwany brakiem | **tak** — „Niestety Teneryfa nie pojawiła się w wynikach do tego budżetu i terminu" |
| lipiec → realny termin przyszłoroczny | **tak** — karta 2027-07-10 → 2027-07-17 z żywymi cenami |

### Residuals jakościowe (model, nie narzędzia)

* Zapas do budżetu bywa podawany **za parę**, nie za osobę („zostaje Wam 594 zł"
  przy `zapasPln` = 297/os.). Rachunek jest poprawny (297 × 2) i etykieta mówi
  „Wam", ale prompt każe cytować `zapasPln` wprost. Prompt jest zamknięty —
  do rozważenia w V2.2.
* Przy „Hiszpania w góry" model napisał „zakładam październik", a karta była
  na 7–14 listopada. Karta jest źródłem prawdy i jest poprawna; narracja nie.
* „A coś na Teneryfie…" — model poszedł w `search_trips` po kraju zamiast
  `get_trip_offer` na wskazaną wyspę. Alias wysp działa (test + benchmark),
  model po prostu nie sięgnął po to narzędzie.

Wszystkie trzy to kwestie promptu/modelu, obu zamkniętych w tym zleceniu.

---

## E. PODSUMOWANIE LICZBOWE

| | BEFORE | AFTER | zmiana |
|---|---|---|---|
| narzędzie p50 | 2561 ms | 217 ms | **−92%** |
| narzędzie p75 | 6522 ms | 4542 ms | −30% |
| narzędzie p95 | 14 398 ms | 9649 ms | **−33%** |
| narzędzie max | 28 604 ms | 12 158 ms | **−57%** |
| `liteapi.flight` p50 | 2365 ms | 117 ms | **−95%** |
| `liteapi.flight` max | 28 603 ms | 11 953 ms | −58% |
| `redis.snapshot` p50 | 200 ms | 97 ms | −52% |
| pełny przebieg benchmarku | 195,6 s | 84,7 s | −57% |
| stany wyniku | 36/34/4/2/2 | 36/34/4/2/2 | bez zmian |
| pusta karta przy braku oferty | tak | **nie** | naprawione |
| **żywa tura z narzędziem, ten sam zestaw pytań** | | | |
| p50 | 7812 ms | 10 635 ms | +36% — patrz zastrzeżenie w B |
| p95 | 24 650 ms | 20 912 ms | −15% |
| max | 24 650 ms | 20 912 ms | −15% |
| error rate | 0/21 | 0/21 | bez zmian |
| zapas modelu | 1× | 0× | lepiej |

Baza produkcyjna podana w zleceniu (p50 14 826 / p95 25 318 ms) dotyczyła
INNEGO zestawu pytań i nie jest z tym porównaniem zestawialna — wiersze wyżej
pochodzą z jednego przebiegu tych samych 21 pytań.
