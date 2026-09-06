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

### Co z tego pomiaru jest użyteczne: rozbicie serwerowe (tylko AFTER)

`?diag=1` daje rozbicie prosto z odpowiedzi. Dla 13 tur Z NARZĘDZIEM:

| | p50 | p75 | p95 | max |
|---|---|---|---|---|
| cała tura (ściana) | 10 635 | 13 000 | 20 912 | 20 912 |
| czas MODELU | 5447 | 6112 | 8914 | 8914 |
| czas NARZĘDZI | 3798 | 6284 | 11 762 | 11 762 |

Porównanie z bazą produkcyjną podaną w zleceniu (23 tury, inny zestaw pytań —
więc orientacyjnie, nie jako dowód):

| | baza produkcyjna | AFTER (Preview) |
|---|---|---|
| tura z 1 narzędziem p50 | 14 826 | 10 635 |
| tura z 1 narzędziem p95 | 25 318 | 20 912 |
| MODEL p50 (tury z narzędziem) | 5776 | 5447 |
| **NARZĘDZIA p50** | **7760** | **3798** |

---

## C. CEL Z §43 — NIEOSIĄGNIĘTY, I DLACZEGO

Cel: tura z narzędziem p50 < 9 s, p95 < 15 s.
Zmierzone: **p50 10,6 s, p95 20,9 s.** Cel nie został osiągnięty.

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
| tura z narzędziem p50 (żywa) | 14 826 ms (baza prod.) | 10 635 ms | −28% (orientacyjnie) |
| tura z narzędziem p95 (żywa) | 25 318 ms (baza prod.) | 20 912 ms | −17% (orientacyjnie) |
