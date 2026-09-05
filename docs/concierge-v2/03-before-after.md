# Chatbot V1 → V2: BEFORE vs AFTER

Gałąź `feat/ai-concierge-v2`, baza `origin/main` @ `7202d18`. **Nie zmergowana.**
Preview: `helptravel-agency-git-feat-ai-co-bb8653-sneakersinfo1s-projects.vercel.app`

---

## 1. Model

| | V1 | V2 |
|---|---|---|
| PRIMARY | `claude-haiku-4.5` (env Vercela) | **`claude-haiku-4.5` — bez zmian** |
| `DEFAULT_MODEL` w kodzie | `gemini-2.5-flash-lite` ⚠️ | `claude-haiku-4.5` |
| FALLBACK | **brak** | `gemini-3.1-flash-lite` (inny dostawca) |
| Co jedzie, gdy zniknie env | model przegrywający 4:32 z produkcyjnym | dokładnie to samo co z env |

Model **nie został zmieniony** — obronił się pomiarem (69% wygranych i najlepsza
polszczyzna 75% w ślepym sędziowaniu parami). Zmieniło się to, że przestał zależeć
od jednej zmiennej środowiskowej, i że ma zapas u innego dostawcy.

## 2. Trafność doboru kierunku

| | V1 | V2 |
|---|---|---|
| `nights` w `search_trips` | zadeklarowane w schemacie, wymuszane promptem, **nigdy nie czytane** | przelicza pakiet ze składowych snapshotu |
| Ranking | mieszał pobyty 4- i 7-nocne, sortował po kwocie bezwzględnej | porównuje pobyty tej samej długości |
| Efekt (plaża, 3000 zł/os., 7 nocy) | `Walencja 1232 (4 noce)` na czele | `Malaga 1389 (7 nocy)` — realnie o 107 zł/os. taniej na tydzień |
| Kandydat niesie | cenę bez kontekstu | cenę **+ liczbę nocy + okno dat** |
| Termin niezgodny z pytaniem | przemilczany | nota każe powiedzieć wprost |

## 3. Dopytywanie

| | V1 | V2 |
|---|---|---|
| `month` | wymagany w schemacie i `missingFields` | opcjonalny, `defaultMonth()` + nazwanie założenia |
| „Lecimy z dwójką dzieci **w wakacje**, 8000 zł" | **8 z 9 modeli** pytało „który miesiąc?" | pełna karta oferty + uczciwe „przekracza budżet o 387 zł/os." |
| Pory roku po polsku | brak wskazówki | schemat uczy: wakacje=7, ferie=2, majówka=5, święta=12 |
| „Jak zarezerwować?" | **6 z 9 modeli** oblewało — bot zaczynał zbierać kierunek i budżet | gałąź „PYTANIE O SERWIS" odpowiada z `PROCES ZAKUPU` |

## 4. Uczciwość wobec klienta

| | V1 | V2 |
|---|---|---|
| Kwoty | tekst „9546,59 zł" obok karty „9 547 zł" | jedna liczba, pełne złote, zaokrąglane w górę |
| Linki w treści | bot pisał `Zobacz hotel: /hotele/split-art-hotel?...` — **z wymyślonym identyfikatorem** | zdejmowane mechanicznie; prawdziwe linki niesie karta |
| Prompt | 8766 znaków, obsługa pustego wyniku w dwóch sekcjach | 8903 znaki, redundancja wycięta, doszła gałąź serwisowa |

## 5. Obserwowalność

| | V1 | V2 |
|---|---|---|
| Log tury | `[concierge] usage` — same tokeny | `[concierge] turn` — **model, dostawca**, wynik, czas, rundy, ponowienia, wywołania narzędzi, % cache |
| Który model odpowiada | **nie do ustalenia** | w każdej linii logu |
| Ścieżki błędu i wyczerpania budżetu | nie logowały nic | logują z polem `outcome` |
| Zdarzenia GA4 | open, message, offer_shown, offer_click, retry | **+ `concierge_error`** (model/sieć + czas), **+ `concierge_close`** (liczba wiadomości, czy padła karta) |

To ta zmiana ujawniła, że produkcja jedzie na haiku-4.5, a nie na tym, co mówił
lokalny `.env.local` — i unieważniła pierwszą wersję rekomendacji.

## 6. Odporność

| | V1 | V2 |
|---|---|---|
| `MALFORMED_FUNCTION_CALL` | ponowienie na TYM SAMYM modelu → „Chwilowo nie mogę odpowiedzieć" | jedna próba na modelu zapasowym u innego dostawcy |
| Idempotencja narzędzi | — | zapas siedzi WEWNĄTRZ `chatCompletion`, więc żaden tool-call nie wykona się dwa razy |
| Kiedy zapas NIE działa | — | gdy odpowiedź się „nie podoba" — tylko awaria go uruchamia |

## 7. Mobile (90% ruchu)

| | V1 | V2 |
|---|---|---|
| Pole wpisu | **14 px** → iOS zoomuje przy tapnięciu i nie cofa | 16 px (`text-base!`, bo globalny `font: inherit` unieważnia zwykłe klasy) |
| Klawiatura | domyślny „enter" | `enterKeyHint="send"` |
| Cele dotykowe | ≥44 px ✓ | bez zmian, teraz pilnowane testem |

## 8. Testy

| | V1 | V2 |
|---|---|---|
| Testy jednostkowe repo | 924 | **928** |
| Testy modułu concierge | 57 | **82** |
| E2E czatu | **brak** | 7 (6 układu bez kosztu + 1 pełnej pętli, `@model`) |
| Harness benchmarkowy | **brak** | `bench/concierge` — 113 przypadków, 17 kategorii, ślepy sędzia parami |

## 9. Co ZMIERZONE, a nie naprawione

1. **`country` wypiera `theme`** — „góry we Włoszech" zwróci 6 najpopularniejszych
   miast Włoch, ignorując motyw. Lista jest ucinana do 6 **przed** rankingiem, więc
   tańsza grecka wyspa spoza pierwszej szóstki nigdy nie zostanie rozważona.
2. **Pusta auto-oferta uchodzi za sukces** — przy `hotel:null` i `flight:null` model
   dostaje notatkę „karta z linkami została JUŻ pokazana”, co bywa nieprawdą.
3. **Snapshot grzeje tylko dwa okna** (4 noce/październik, 7 nocy/listopad). Pytanie
   o marzec dostanie ceny orientacyjne z października. To zadanie dla crona, nie dla czatu.
4. **Dwa pływające CTA na telefonie** — „Zaplanuj wyjazd" i „Dobierz wyjazd" stoją 7 px
   od siebie, razem zajmując dolne 120 px z 812. Stos jest **celowy** (komentarz w kodzie),
   ale dwa niemal identyczne zielone przyciski rozmywają się nawzajem.
5. **Globalny `font: inherit`** unieważnia klasy rozmiaru tekstu na WSZYSTKICH polach
   i przyciskach w serwisie. Naprawione lokalnie w czacie; reset globalny nietknięty.
6. **Brak pułapu dobowego** dla czatu (jest 10/min/IP).
7. **Nieufne wyjście narzędzia** — nazwy hoteli z LiteAPI trafiają do wiadomości
   `role:"tool"` bez sanityzacji pod kątem instrukcji. Wektor mało prawdopodobny.

## 10. Czego NIE wiadomo

- **Czy V2 sprzeda więcej wyjazdów.** Nikt tego nie zmierzył. Przy 8 rozmowach na dobę
  test A/B zbierałby istotność miesiącami.
- **Realne p50/p95 produkcji.** Zmierzone pojedynczo na Preview: 13,2 s i 28,4 s
  z żywym LiteAPI. Liczby z benchmarku (4–6 s) dotyczą samego modelu.
- **Czy sędzia LLM ma rację.** Jego zgodność przy odwróconej kolejności to 67–70%,
  a kolejność dwóch czołowych modeli odwróciła się między przebiegami.
