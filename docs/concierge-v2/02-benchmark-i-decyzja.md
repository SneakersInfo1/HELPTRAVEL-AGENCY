# AI Concierge v2 — benchmark modeli i decyzja

Data: **2026-09-05**. Gałąź `feat/ai-concierge-v2`.
Cennik zamrożony: `bench/concierge/fixtures/or-models.json` (OpenRouter, 2026-09-04 18:36 UTC, 427 modeli).
Realny koszt całego benchmarku: **2,68 USD** z budżetu 4 USD.

> **UWAGA — CZYTAJ NAJPIERW SEKCJĘ „KOREKTA" NA KOŃCU.**
> Etapy 1 i 2 poniżej porównywały kandydatów z `gemini-2.5-flash-lite`, bo tak
> mówił lokalny `.env.local`. Produkcja jedzie na `claude-haiku-4.5` — wyszło to
> dopiero po deployu na Preview, z nowego logu `[concierge] turn`. Liczby w
> etapach 1–2 są prawdziwe, ale **wniosek końcowy zmieniła korekta**: model
> produkcyjny ZOSTAJE.

---

## Metoda

Dwa etapy, żeby nie płacić pełnej stawki za modele, które odpadają w pierwszej rundzie.

**Wspólne dla obu etapów — inaczej porównanie nic nie znaczy:**
- ten sam dataset (113 przypadków w 17 kategoriach, 197 tur, w tym 21 rozmów wieloturowych),
- te same **deterministyczne** dane narzędzi (`bench/concierge/fixture-deps.ts`) — ceny bazowe
  z produkcyjnego snapshotu `dstprice:v1`, jitter wyprowadzony z hasza zapytania. Bez tego
  porównywalibyśmy pogodę na LiteAPI, nie modele,
- ta sama pętla produkcyjna: benchmark wywołuje **prawdziwy** `runConcierge` i **prawdziwe**
  egzekutory narzędzi, nie atrapę logiki,
- modele rozumujące dostają rozumowanie ścięte do minimum (przy `MAX_TOKENS=700` zjadają cały
  budżet na rozumowanie i zwracają `content:null` — mierzylibyśmy naszą konfigurację, nie model).

**ETAP 1 — screening.** 6 modeli × 40 przypadków warstwowych (proporcja kategorii zachowana;
zwykłe `slice(0,40)` wzięłoby same pierwsze litery alfabetu kategorii). Sufit 1,50 USD,
koszt realny **0,41 USD**.

**ETAP 2 — rozstrzygnięcie.** Baseline + TOP 2 × pełne 113 przypadków + **ślepy sędzia parami**.
Sufit 2,50 USD, koszt realny **0,63 USD modele + 0,10 USD sędzia**.

### Ślepy sędzia parami
396 porównań, 0 nieudanych. Sędzia nigdy nie widzi nazw modeli. Kolejność w parze losowa,
ale wyprowadzona z hasza (powtarzalna). 57 par przesądzonych **dodatkowo w odwróconej
kolejności** — zgodność między nimi to bezpośredni pomiar stronniczości pozycji.
**Zmierzona zgodność: 67%.** To znaczy, że różnice rzędu kilku punktów procentowych między
dwoma czołowymi modelami są w granicach szumu; przepaść wobec baseline'u już nie.

---

## ETAP 1 — screening (40 przypadków)

| Model | przejścia | p50 | p95 | USD/1k (bez cache) |
|---|---|---|---|---|
| openai/gpt-5.6-luna | 70% | 5143 | 8026 | $4,14 |
| google/gemini-3.1-flash-lite | 68% | 3866 | 5157 | $6,49 |
| qwen/qwen3-235b-a22b-2507 | 65% | 7724 | 11671 | $1,80 |
| deepseek/deepseek-v4-flash | 55% | 21925 | 39227 | $2,01 |
| google/gemini-2.5-flash | 50% | 3504 | 5361 | $6,71 |
| **google/gemini-2.5-flash-lite (obecny)** | **45%** | 2266 | 4520 | $1,88 |

Odpadli i dlaczego:
- **deepseek-v4-flash** — p50 21,9 s i p95 39,2 s. Dla czatu na telefonie to dyskwalifikacja,
  niezależnie od ceny. Do tego najwięcej zmyślonych kwot (12 na 40).
- **qwen3-235b** — najtańszy w stawce i przyzwoita jakość, ale 2× wolniejszy od gemini-3.1
  i wyraźnie częściej zmyślał kwoty. Przy naszym ruchu przewaga cenowa to ułamek złotówki
  miesięcznie, więc nie kupuje nic realnego.
- **gemini-2.5-flash** — droższy od gemini-3.1-flash-lite i słabszy. Zdominowany.

---

## ETAP 2 — rozstrzygnięcie (113 przypadków)

### Sprawdzenia deterministyczne (kod, nie sędzia)

| | **gemini-3.1-flash-lite** | gpt-5.6-luna | **gemini-2.5-flash-lite (obecny)** |
|---|---|---|---|
| przejścia | **81%** | 79% | **57%** |
| twarde błędy tury | **0** | **0** | 7 |
| brak sięgnięcia po dane | **0** | 5 | **17** |
| karta oferty pokazana | **80/113** | 77/113 | 57/113 |
| zmyślone kwoty / brak zastrzeżenia | **10 (8,8%)** | 13 (11,5%) | 14 (12,4%) |
| za długa odpowiedź | 11 | **0** | 9 |
| p50 / p95 (ms) | 4496 / 6069 | 6046 / 10009 | **2350 / 4850** |

### Ślepy sędzia parami

| Model | wygrane | przegrane | remisy | **win%** | **polszczyzna win%** |
|---|---|---|---|---|---|
| openai/gpt-5.6-luna | 162 | 43 | 21 | **79%** | **66%** |
| google/gemini-3.1-flash-lite | 103 | 93 | 30 | 53% | 64% |
| **google/gemini-2.5-flash-lite** | 38 | 167 | 21 | **19%** | **20%** |

Starcia bezpośrednie:
```
obecny  26 : 72  gemini-3.1-flash-lite   (remisy 15)
obecny  12 : 95  gpt-5.6-luna            (remisy  6)
gemini-3.1  31 : 67  gpt-5.6-luna        (remisy 15)
```

---

## Odpowiedzi na postawione pytania

1. **Najlepszy jakościowo** — remis, zależnie od miary. `gpt-5.6-luna` wygrywa u sędziego
   (79% vs 53%), `gemini-3.1-flash-lite` wygrywa w sprawdzeniach deterministycznych
   (81% vs 79%, zero braków narzędzia vs 5). Sędzia mierzy **sposób pisania**, sprawdzenia
   mierzą **trzymanie się reguł produktu**.
2. **Najlepszy quality/cost** — `gpt-5.6-luna`: wyższy wynik u sędziego przy 4,22 USD/1k
   wobec 6,49 USD/1k dla gemini-3.1.
3. **Najlepszy tool calling** — `gemini-3.1-flash-lite`: **zero** przypadków bez sięgnięcia
   po dane (luna 5, obecny 17), najwięcej pokazanych kart (80/113), zero zakazanych wywołań.
4. **Najlepszy polski** — `gpt-5.6-luna` 66% wobec `gemini-3.1` 64%. Przy 67% zgodności
   sędziego to **remis**. Obie wersje miażdżą obecny model (20%).
5. **p50/p95** — obecny 2350/4850 ms (najszybszy), gemini-3.1 4496/6069, luna 6046/10009.
   To czasy **samego modelu** — produkcja dokłada 3–16 s LiteAPI.
6. **Halucynacje** — gemini-3.1 **8,8%**, luna 11,5%, obecny 12,4%.
7. **Koszt 1k rozmów** (bez cache) — obecny **$2,02**, luna **$4,22**, gemini-3.1 **$6,49**.
8. **Koszt 10k rozmów** — **$20,2 / $42,2 / $64,9**.
9. **Czy Gemini 2.5 Flash-Lite zostaje?** **NIE.** Przegrywa 26:72 i 12:95 w starciach
   bezpośrednich, ma 17 przypadków bez sięgnięcia po dane, 7 twardych błędów tury i
   najgorszą polszczyznę (20% wygranych). To jest źródło „nietrafności", od której zaczął
   się audyt.

### Dlaczego koszt nie rozstrzyga
Produkcja robi **~8 tur czatu na dobę** (logi runtime, 2026-09-04). To około 240 rozmów
miesięcznie. Cała rozpiętość stawki to **0,49 zł – 1,56 zł miesięcznie**. Różnice cenowe
między kandydatami są przy tym ruchu nieistotne — dlatego wagę przesunąłem na jakość,
dyscyplinę narzędzi i opóźnienie. Gdyby ruch urósł 100×, rachunek wyglądałby inaczej
i wtedy `luna` (tańsza, lepsza u sędziego) byłaby naturalnym wyborem.

---

## Decyzja

```
PRIMARY   google/gemini-3.1-flash-lite     (DEFAULT_MODEL)
FALLBACK  openai/gpt-5.6-luna              (DEFAULT_FALLBACK_MODEL)
```

**Dlaczego gemini-3.1 na PRIMARY, skoro luna wygrała u sędziego.** Produkt nie łamie się na
stylu wypowiedzi — łamie się na trzech rzeczach, i gemini-3.1 wygrywa wszystkie trzy:
nie sięgnął po dane **0 razy** (luna 5, obecny 17), zmyślił kwotę najrzadziej (8,8%),
a p95 ma 6,1 s zamiast 10,0 s. To ostatnie liczy się podwójnie, bo czat nie strumieniuje
odpowiedzi, 90% ruchu to telefon, a produkcja dokłada do tego czas LiteAPI.

**Dlaczego luna na FALLBACK.** Inny dostawca niż podstawowy (awaria Google nie może zabrać
obu naraz) i jednocześnie najlepszy model w stawce u sędziego — zejście na zapas nie jest
degradacją treści, płaci się za nie tylko wolniejszym p95.

**Zamiana miejscami to jedna zmienna środowiskowa** (`OPENROUTER_MODEL`,
`OPENROUTER_FALLBACK_MODEL`) — jeśli właściciel ceni styl wypowiedzi wyżej niż dyscyplinę
narzędzi, przełączenie nie wymaga zmiany kodu.

### Routing dwóch modeli — ODRZUCONY
Rozważony i **niewdrożony**. Przy 240 rozmowach miesięcznie oszczędność z kierowania prostych
pytań do tańszego modelu wynosi ułamek złotówki, a kosztuje: drugi tor konfiguracji, drugi
zestaw trybów awarii i klasyfikator, który sam może się mylić. `Nie implementuj routingu tylko
dlatego, że brzmi nowocześnie` — dane nie pokazują korzyści.

---

## Czego ten benchmark NIE mierzy

Uczciwe granice, żeby nikt nie wyciągnął z tych liczb więcej, niż w nich jest:

1. **Opóźnienie to czas MODELU, nie produkcji.** Narzędzia są odtwarzane z fixture'ów
   (natychmiastowe). Realna tura na produkcji dokłada 3,3 s podłogi na hotele i 10–16 s na
   loty — zmierzone na dev-serverze: 16,0 s dla pełnej oferty z żywym LiteAPI.
2. **Ceny narzędzi są częściowo syntetyczne.** Poziomy pochodzą z produkcyjnego snapshotu,
   ale jitter per zapytanie jest wyprowadzony z hasza. Identyczny dla każdego modelu, więc
   porównanie jest uczciwe — ale to nie są ceny, które zobaczy klient.
3. **Sędzia jest jednym modelem** (`gemini-2.5-flash`) i w tym przebiegu miał 67% zgodności
   przy odwróconej kolejności. Różnice kilku punktów między luną a gemini-3.1 są w szumie.
4. **113 przypadków to nie ruch produkcyjny.** Dataset pisany pod hipotezy o słabościach
   bota, więc jest trudniejszy niż średnia rozmowa.
5. **Nie mierzono konwersji.** Żaden z tych wyników nie mówi, czy nowy model sprzeda więcej
   wyjazdów. To wymaga A/B na realnym ruchu — a przy 8 rozmowach dziennie taki test
   zbierałby istotność miesiącami.

---

## KOREKTA (2026-09-05, po deployu na Preview) — benchmark mierzyl ZLY baseline

Nowy log `[concierge] turn` na Preview pokazal cos, czego nie dalo sie ustalic
przed jego wprowadzeniem:

```
[concierge] turn { model: 'anthropic/claude-haiku-4.5', provider: 'Amazon Bedrock', ... }
```

**Produkcja NIE jedzie na `gemini-2.5-flash-lite`.** Jedzie na
`anthropic/claude-haiku-4.5`, ustawionym w `OPENROUTER_MODEL` na poziomie
projektu w Vercelu. Lokalny `.env.local` mial `gemini-2.5-flash-lite` i to
wprowadzilo mnie w blad — caly benchmark powyzej porownywal kandydatow z
modelem, ktorego na produkcji nie ma. To jest dokladnie ta niewiedza, ktora
mial usunac §34 audytu; usunela ja dopiero wlasna zmiana.

### Domiar prawdziwego baseline'u (40 przypadkow warstwowych, ten sam zestaw)

| Model | przejścia | p50 | p95 | USD/1k | sędzia win% | **polszczyzna** |
|---|---|---|---|---|---|---|
| **anthropic/claude-haiku-4.5 (PRODUKCJA)** | 57% | 4690 | 7423 | **$21,61** | **69%** | **75%** |
| google/gemini-3.1-flash-lite | **68%** | **3866** | **5157** | $6,49 | 62% | 64% |
| openai/gpt-5.6-luna | **70%** | 5143 | 8026 | $4,14 | 56% | 46% |
| google/gemini-2.5-flash-lite | 45% | 2266 | 4520 | $1,88 | 13% | 15% |

Starcia bezposrednie (40 przypadkow):
```
haiku-4.5        32 :  4  gemini-2.5-flash-lite
haiku-4.5        25 : 13  gemini-3.1-flash-lite
haiku-4.5        17 : 16  gpt-5.6-luna            (remis)
gemini-3.1       26 : 12  gpt-5.6-luna
```

### Zmieniona decyzja: PRODUKCYJNY MODEL ZOSTAJE

`haiku-4.5` wygrywa slepe sedziowanie (69%) i ma **najlepsza polszczyzne w
calej stawce (75%)** — a to jest produkt sprzedazowy po polsku. Jest za to
najdrozszy i slabszy w sprawdzeniach deterministycznych (57% vs 68%), glownie
przez zbyt dlugie odpowiedzi (8 przypadkow) i zmyslone kwoty (6).

Argument kosztowy nie wystarcza, zeby go zdjac: przy ~240 rozmowach miesiecznie
(8 tur/dobe z logow) roznica haiku vs gemini-3.1 to okolo **14 zl/mies.**
Kupowanie za to spadku o 7 pkt proc. u sedziego i 11 pkt proc. na polszczyznie
byloby zla transakcja.

```
PRIMARY   anthropic/claude-haiku-4.5      (bez zmian — potwierdzony pomiarem)
FALLBACK  google/gemini-3.1-flash-lite    (nowy)
```

`DEFAULT_MODEL` w kodzie zostal zrownany z produkcja. Wczesniej mowil
`gemini-2.5-flash-lite`, czyli model, ktory przegrywa z haiku **4:32** —
usuniecie zmiennej srodowiskowej po cichu zdegradowaloby czat do najgorszego
modelu w stawce. Teraz brak zmiennej niczego nie psuje.

### Uwaga o wiarygodnosci sedziego
Kolejnosc `luna` i `gemini-3.1` ODWROCILA sie miedzy przebiegiem na 113
przypadkach (luna 67:31) a tym na 40 (gemini-3.1 26:12). Zgodnosc sedziego
przy odwroconej kolejnosci wynosila 67% i 70%. Wniosek: te dwa modele sa
w granicach szumu i nie nalezy ich rozstrzygac tym narzedziem. Przewaga
haiku nad `gemini-2.5-flash-lite` (32:4) i obu kandydatow nad nim sa
jednoznaczne.
