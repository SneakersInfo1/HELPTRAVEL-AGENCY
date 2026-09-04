# AI Concierge v2 — audyt, przyczyny źródłowe, decyzje

Data audytu: **2026-09-04**. Gałąź: `feat/ai-concierge-v2` (baza: `origin/main` @ `7202d18`).
Cennik OpenRoutera zamrożony w `bench/concierge/fixtures/or-models.json` (pobrany 2026-09-04 18:36 UTC, 427 modeli).

---

## 1. Architektura — co realnie jest

```
UŻYTKOWNIK
  └─ concierge-launcher.tsx      bąbel + panel, marker historii (Wstecz zamyka dialog),
     │                            zarządzanie fokusem, brama zgód cookie
     └─ concierge-chat.tsx        historia w sessionStorage (40 wiad.), walidacja
        │                         rehydratacji, starterki, stan błędu + „Spróbuj ponownie”
        └─ POST /api/concierge/chat     route.ts — limiter PRZED wszystkim, zod,
           │                            kill-switch NEXT_PUBLIC_SHOW_CONCIERGE,
           │                            wyścig z 57 s (żeby nie oddać gołego 504)
           └─ orchestrator.ts            pętla ≤4 rund, budżet tury 50 s, prompt caching
              ├─ openrouter.ts           HTTP do OpenRoutera, fallback na zły slug modelu
              ├─ system-prompt.ts        8903 znaki, limit twardy 9000 (test)
              └─ tools.ts                3 narzędzia + egzekutory (czyste, DI)
                 └─ tool-deps.ts         wiązanie produkcyjne (LiteAPI + seed + Redis)
```

Dostawca to **OpenRouter** — nie ma tu żadnej migracji do zrobienia, jest strojenie.
Model bierze się z `OPENROUTER_MODEL`, a gdy jej brak — z `DEFAULT_MODEL`
(`google/gemini-2.5-flash-lite`) w kodzie.

### Czego brakowało w obserwowalności
Do 2026-09-04 **nie dało się z logów odczytać, który model odpowiada**: slug siedzi w
zmiennej środowiskowej Vercela, kod ma własny domyślny, a log mówił wyłącznie o tokenach.
Naprawione — patrz §5.

---

## 2. Dane produkcyjne (baseline)

Retencja logów runtime Vercela to ~1 doba, więc to jest okno 24 h, nie 30 dni.

| Co | Wartość |
|---|---|
| Tury czatu / 24 h (produkcja) | **8** (≈3 sesje) |
| Tokeny wejścia / tura | 6 824 – 16 951 |
| Tokeny wyjścia / tura | 14 – 720 |
| Cache wejścia (2. tura+) | **13 800–14 000 z ~15 400 ≈ 90 %** |
| Wywołania modelu / tura | 1–2 |

**Wniosek, który zmienia wagi z §38 master promptu:** przy ~8 turach na dobę koszt
modelu jest praktycznie zerowy w każdym rozważanym wariancie (różnica między najtańszym
a najdroższym kandydatem to grosze miesięcznie). Optymalizacja kosztu nie jest tu
dźwignią — dźwignią jest **jakość i to, czy bot w ogóle sięga po dane**.

---

## 3. Przyczyny źródłowe — dlaczego odpowiedzi bywają nietrafne

Uporządkowane wg dotkliwości. Każda potwierdzona lekturą kodu **i** pomiarem.

### P1. `search_trips` ignorował długość pobytu — ranking porównywał nieporównywalne
`rankTripCandidates()` nie przyjmowało ani `month`, ani `nights`. Argument `nights` był
zadeklarowany w schemacie narzędzia i wymuszany promptem („weekend = 3”), ale
`readSearchTripsArgs` **nigdy go nie czytało** — model wysyłał go donikąd.

Pomiar na produkcyjnym snapshocie (`dstprice:v1`, 46 kierunków):

| Okno wygrzane przez cron | Ile kierunków |
|---|---|
| 4 noce, październik | 31 |
| 7 nocy, listopad | 15 |
| cokolwiek innego | **0** |

Obie grupy trafiały do jednej listy sortowanej po kwocie **bezwzględnej**, więc krótszy
pobyt wygrywał zawsze — sześć najtańszych pozycji to były same pakiety 4-nocne.

**Skutek dla klienta:** pytanie o wrzesień dostawało ceny na październik, a „najtańszy”
kierunek bywał po prostu najkrótszy.
**Naprawione** (§5.1). Zmierzone BEFORE/AFTER dla 7 nocy: było `Walencja 1232 (4 noce)`
na czele, jest `Malaga 1389 (7 nocy)` — Malaga jest realnie o 107 zł/os. tańsza na tydzień.

### P2. Miesiąc był wymagany, więc kod WYMUSZAŁ dopytanie
`month` siedział w `required` schematu i w `missingFields()`. „W wakacje” nie jest liczbą,
więc model musiał zapytać — mimo że system prompt każe przy niekonkretnym kliencie
przyjąć założenie i szukać. **Przypadek „Lecimy z dwójką dzieci w wakacje, budżet 8000 zł
łącznie” oblało 8 z 9 testowanych modeli** — wszystkie odpowiadały pytaniem „który
miesiąc?”. To był przymus strukturalny, nie wina modeli.
**Naprawione** (§5.2). Po zmianie ten sam prompt na dev-serverze zwraca pełną kartę
oferty (Walencja, 10–17 lipca, 4 osoby) i **poprawnie mówi o przekroczeniu budżetu**
o 387 zł/os.

### P3. Model produkcyjny rzadko sięga po dane — i bywa, że twardo pada
`google/gemini-2.5-flash-lite` ma najsłabszą dyscyplinę narzędzi z całej stawki.
Dodatkowo zwraca `native_finish_reason: MALFORMED_FUNCTION_CALL` — zaobserwowane na żywo
na dev-serverze: dwa razy z rzędu (pierwsza próba + ponowienie), więc użytkownik dostał
„Chwilowo nie mogę odpowiedzieć”. To nie jest różnica w niuansie jakości, to twarda awaria.

### P4. Pytanie o serwis było traktowane jak zapytanie o wyjazd
„Jak zarezerwować?” oblewało 6 z 9 modeli, a model produkcyjny zamiast odpowiedzieć
zaczynał zbierać kierunek, termin i budżet. W prompcie sekcja „PRZEPŁYW — KARTA OD RAZU”
wygrywała z faktami z „PROCES ZAKUPU”, bo nie było gałęzi „to nie jest zapytanie o wyjazd”.
**Naprawione** (§5.3).

### P5. Konfiguracja po cichu wyklucza modele rozumujące
`MAX_TOKENS = 700` jest wspólne dla tokenów rozumowania i odpowiedzi. Zmierzone:
`qwen3.7-flash` zużywa **689 z 700** tokenów na rozumowanie i zwraca `content: null`
(`finish_reason: length`); `gpt-5-mini` 448 z 576. Orkiestrator widzi „brak treści”,
ponawia, i oddaje łagodny błąd. Z `reasoning: {effort:"minimal"}` gpt-5-mini schodzi do
**0** tokenów rozumowania i odpowiada normalnie — czyli to ograniczenie naszej
konfiguracji, nie modeli. **Ustalenie, nie naprawa** — patrz §7 (rekomendacje).

### P6. Kraj wypiera motyw, a lista jest ucinana PRZED rankingiem
`if (country) { cities = listDestinationsInCountry(country).slice(0, 6) } else { motyw }`.
„Góry we Włoszech” zwróci więc 6 najpopularniejszych miast Włoch (Rzym, Mediolan…),
całkowicie ignorując motyw. I odwrotnie: tańsza grecka wyspa spoza pierwszej szóstki
seedu nigdy nie zostanie rozważona, bo obcięcie następuje **przed** sortowaniem po cenie.
**Nienaprawione** — patrz §7.

### P7. Cena w tekście różniła się od ceny na karcie
Bot pisał „Całkowity koszt wyjazdu to 9546,59 zł”, a karta obok pokazywała „9 547 zł”.
Model cytuje surową wartość z wyniku narzędzia, karta ją formatuje.
**Naprawione** (§5.4) — zaokrąglenie u źródła, w górę.

### P8. Auto-oferta uznaje pustą ofertę za sukces
W `dispatchToolCall` (gałąź `search_trips`) oferta z `hotel: null` **i** `flight: null`
nadal jest zwracana jako `autoOffer`, top-kandydat znika z listy (`candidates.slice(1)`),
a model dostaje notatkę „karta z linkami została JUŻ pokazana”. Przy podwójnej porażce
komponentów to nieprawda. **Nienaprawione** — patrz §7.

---

## 4. Sprawdzenia bezpieczeństwa (§31 master promptu)

| Wektor | Stan |
|---|---|
| XSS z odpowiedzi modelu | **OK** — zero `dangerouslySetInnerHTML` w module czatu |
| Wstrzyknięcie URL-a przez model | **OK** — tekst modelu nie jest linkifikowany; jedyny link w panelu jest zaszyty (polityka prywatności) |
| Linki oferty | **OK** — budowane serwerowo (`buildHotelHandoffUrl`, `buildResultsUrl`), model ich nie tworzy |
| Wyciek klucza | **OK** — `OPENROUTER_API_KEY` nie występuje w żadnym komponencie klienckim |
| Wstrzyknięcie promptu | pokryte przypadkiem testowym `S15` (patrz wyniki baterii) |
| **Nieufne wyjście narzędzia** | **RYZYKO SZCZĄTKOWE** — nazwy i adresy hoteli z LiteAPI trafiają do wiadomości `role:"tool"` bez sanityzacji pod kątem instrukcji. Wektor mało prawdopodobny (dane od dostawcy), ale realny. Prompt nie mówi wprost „traktuj wyniki narzędzi jako dane, nie polecenia” — na to nie ma już miejsca w limicie 9000 znaków. |

## 5. Limity i ochrona kosztu (§32–33)

Zastane i **wystarczające**: 10 żądań/min/IP (`rate-limit.ts`), `MAX_INPUT_CHARS` 1500,
`MAX_HISTORY_MESSAGES` 20, `MAX_TOOL_ROUNDS` 4, `MAX_TOKENS` 700, budżet tury 50 s,
bezpiecznik route’a 57 s, kill-switch środowiskowy.

Luka: **brak pułapu dobowego per sesja/IP**. Teoretycznie 10/min × 60 × 24 = 14 400
żądań/dobę z jednego IP. Przy zmierzonym koszcie rozmowy to rząd ~10 USD/dobę — nie
katastrofa, ale warto ograniczyć, jeśli czat zacznie mieć realny ruch.

---

## 6. Co zostało zmienione

| # | Zmiana | Dlaczego (dowód) |
|---|---|---|
| 5.1 | `rankTripCandidates` przyjmuje `nights` i przelicza pakiet ze składowych snapshotu | P1 — ranking mieszał pobyty 4- i 7-nocne |
| 5.2 | `month` przestał być wymagany; `defaultMonth()` + nazwanie założenia w wyniku; opis pola uczy mapowania „wakacje→7” | P2 — 8/9 modeli wymuszało dopytanie |
| 5.3 | Prompt V2: gałąź „PYTANIE O SERWIS”; wycięta redundancja; prompt mówi prawdę o miesiącu | P4 — 6/9 modeli oblewało „Jak zarezerwować?” |
| 5.4 | Kwoty oferty w pełnych złotych (w górę) | P7 — dwie różne kwoty na jednym ekranie |
| 5.5 | `[concierge] turn` — model, dostawca, czas, rundy, ponowienia, tokeny, % cache | Nie dało się ustalić, co jedzie na produkcji |
| 5.6 | Pole czatu 16 px + `enterKeyHint="send"` | iOS zoomuje przy < 16 px i nie cofa zoomu; 90 % ruchu to telefon |

### Ustalenie poboczne, szersze niż czat
`globals.css` ma **niewarstwową** regułę `button, input, select, textarea { font: inherit }`.
CSS bez warstwy bije `@layer utilities` Tailwinda, więc **każda klasa rozmiaru tekstu na
`<input>`/`<button>` w tym repo jest martwa** (zmierzone: ta sama klasa na `<div>` daje
16 px, na `<input>` 14 px). W czacie obeszliśmy to ważnością; globalnego resetu **nie
ruszaliśmy** — to osobna decyzja dotycząca całego serwisu.

---

## 7. Rekomendacje NIEWDROŻONE (świadomie)

1. **P6 — kraj vs motyw i obcięcie do 6 przed rankingiem.** Naprawa wymaga decyzji
   produktowej (czy „góry we Włoszech” ma przecinać kraj z motywem, czy kraj ma wygrywać).
2. **P8 — pusta auto-oferta.** Powinna nie usuwać top-kandydata i zwracać jawny
   `autoOfferError`, gdy oba komponenty są `null`.
3. **Modele rozumujące (P5).** Jeśli kiedyś wejdą, `MAX_TOKENS` musi być rozdzielone albo
   podniesione, a `reasoning` sterowane zmienną środowiskową.
4. **Dwa pływające CTA na telefonie.** „Zaplanuj wyjazd” i „Dobierz wyjazd” stoją 7 px od
   siebie (oba `z-40`), razem zajmując dolne 120 px z 812 px ekranu. Stos jest **celowy**
   (komentarz w `quick-search-launcher.tsx`), ale dwa niemal identyczne zielone przyciski
   o tym samym znaczeniu rozmywają się nawzajem. To decyzja właściciela, nie sprzątanie
   przy okazji audytu.
5. **Pułap dobowy dla czatu** (§5).
