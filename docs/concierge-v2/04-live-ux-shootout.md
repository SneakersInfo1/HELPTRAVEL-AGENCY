# LIVE UX SHOOTOUT — haiku-4.5 vs gemini-3.1-flash-lite

Data: **2026-09-05**. Pomiar przez **prawdziwy interfejs**: przeglądarka (390×844)
→ panel czatu → `POST /api/concierge/chat` → OpenRouter → **żywe LiteAPI** → render.
Narzędzie: `bench/concierge/live-ux.ts`. 14 zapytań, 15 tur, READ-ONLY.

## Gdzie dokładnie mierzono (i dlaczego nie oba modele na Preview)

`OPENROUTER_MODEL` jest w Vercelu ustawiona **na poziomie projektu**, a MCP Vercela
nie ma narzędzia do zmiennych środowiskowych. Przełączenie modelu dla Preview
ruszyłoby więc także Production — czego zakazano. Dlatego:

| Przebieg | Gdzie | Po co |
|---|---|---|
| `haiku-PREVIEW` | **Vercel Preview** | liczby autorytatywne dla produkcji |
| `haiku-LOCAL` | build produkcyjny lokalnie | **kalibracja**: czy lokalnie ≈ Preview |
| `gemini31-LOCAL` | build produkcyjny lokalnie | porównanie na identycznym stosie |

Kalibracja wypadła dobrze — lokalnie jest o ~10–13% szybciej (brak zimnego startu
i innego regionu), więc lokalne liczby gemini są **lekko optymistyczne**, co działa
na jego korzyść, a mimo to przegrywa:

| haiku | p50 | p75 | p95 | max |
|---|---|---|---|---|
| Vercel Preview | 3904 | 12594 | 16715 | 16715 |
| lokalnie | 3716 | 8387 | 14814 | 14814 |

---

## 1. Streaming — NIE MA GO

Potwierdzone w kodzie: `route.ts` zwraca `NextResponse.json(result)`, klient robi
`res.json()`, do OpenRoutera nie idzie `stream: true`. Pomiar to potwierdza:
**TTFT = total co do milisekundy** (p50 3713 vs 3716 ms).

Użytkownik widzi wskaźnik „Asystent pisze" po **31 ms** — interfejs reaguje
natychmiast — a potem **nic** aż do pełnej odpowiedzi.

## 2. Gdzie ucieka czas — i dlaczego to zmienia wniosek

|  | BEZ NARZĘDZI (9 tur) | 1 NARZĘDZIE (6 tur) |
|---|---|---|
| total p50 | 2826 ms | 8232 ms |
| **z tego MODEL** | **2826 ms (100%)** | **6148 ms (74%)** |
| z tego NARZĘDZIA | 0 ms | 2297 ms (28%) |

**Zakładałem wcześniej, że czas zjada LiteAPI. Pomiar mówi coś innego:**
dominuje **model**, nie narzędzia. Narzędzia z ciepłym cache'em to ~2,3 s.

To odwraca ocenę streamingu: **strumieniowanie realnie by pomogło**, bo skraca
oczekiwanie właśnie na części modelowej — a to 74–100% czasu.

## 3. Wyniki — 14 zapytań, oba modele, ten sam stos

| | **HAIKU 4.5** | **GEMINI 3.1 FL** |
|---|---|---|
| Jakość — ślepy sędzia parami (te 14 zapytań) | **82% wygranych (9:2)** | 18% |
| Polszczyzna — te same porównania | **91%** | 9% |
| Jakość — ślepy sędzia (40 przypadków, wcześniej) | **69%** | 62% |
| Polszczyzna (40 przypadków) | **75%** | 64% |
| Tool correctness (40 przypadków, sprawdzenia deterministyczne) | 57% | **68%** |
| Karty oferty pokazane (live) | 6/15 | 6/15 |
| Halucynacje (live) | brak | **1 fałszywy fakt o produkcie** |
| **TTFT p50** | **3716 ms** | 4734 ms |
| **TTFT p95** | **14814 ms** | 18606 ms |
| **Total p50** | **3716 ms** | 4734 ms |
| **Total p95** | **14814 ms** | 18606 ms |
| **Max** | **14814 ms** | 18606 ms |
| Error rate | **0/15** | **0/15** |
| MALFORMED_FUNCTION_CALL / ponowienia | **0** | **0** |
| Koszt / 1k tur (bez cache) | $11,76 | **$3,19** |
| Koszt / mies. przy obecnym ruchu (~240 tur) | $2,82 | **$0,76** |

Zgodność sędziego przy odwróconej kolejności na tym zestawie: **100%** (5/5).

### Halucynacja gemini-3.1, której haiku nie popełniło
Q12 („Ile kosztuje Hotel Bristol w Warszawie 12 marca?"):

> gemini-3.1: *„Nie sprawdzam cen pojedynczych hoteli w systemie rezerwacyjnym,
> **ponieważ nie oferujemy sprzedaży samych noclegów**."*

To **nieprawda** — HelpTravel ma całą sekcję `/hotele/*`, a narzędzia obsługują
`wantsFlight=false`. Model zaraz potem sam sobie zaprzeczył, proponując poszukanie
hotelu. Haiku odmówiło poprawnie, bez wymyślania faktu o produkcie.

### Gdzie gemini-3.1 było lepsze
Q05 („Hotel na Rodos blisko plaży") — gemini pokazało kartę (10,4 s), haiku
zapytało o szczegóły zamiast wykonać regułę „konkretne miasto → karta od razu".
Odwrotnie na Q11 (Antalya): kartę dało haiku, gemini nie. **Remis.**

---

## 4. Reguła decyzyjna — sprawdzona wprost

Zamówienie: *„Jeżeli Haiku ma p95 > 15 s, a Gemini 3.1 jest znacząco szybszy przy
małym spadku jakości: rekomenduj Gemini 3.1."*

- Haiku p95: **14,8 s lokalnie / 16,7 s na Preview** — próg faktycznie otarty.
- Ale **gemini-3.1 NIE jest szybszy**. Jest wolniejszy na każdym percentylu:
  p50 +27%, p95 +26%, max +26% — i to mimo forów lokalnego pomiaru.
- Spadek jakości nie jest „mały": 18% vs 82% u sędziego na tym samym zestawie,
  plus fałszywy fakt o produkcie.

**Warunek zamiany nie jest spełniony.** Przejście na gemini-3.1 dałoby chatbota
jednocześnie **wolniejszego i gorszego**, oszczędzając ~8 zł miesięcznie.

```
PRIMARY   anthropic/claude-haiku-4.5
FALLBACK  google/gemini-3.1-flash-lite
```

Problem opóźnienia jest **realny**, ale wybór modelu nie jest na niego dźwignią.

## 5. Fallback — zweryfikowany

| Scenariusz | Zachowanie | Dowód |
|---|---|---|
| brak treści i brak `tool_calls` (m.in. MALFORMED_FUNCTION_CALL) | jedna próba na zapasie | test |
| błąd w JSON-ie (429, 402, „model unavailable") | jedna próba na zapasie | test |
| poprawna odpowiedź | zapas **się nie odpala** | test |
| awaria także zapasu | łagodny błąd + „Spróbuj ponownie" | test |
| **narzędzia przy zejściu na zapas** | **wykonane DOKŁADNIE raz** | test |
| **rzucony wyjątek sieci (timeout/5xx bez JSON-a)** | **zapas NIE działa** — leci łagodny błąd | test |

Idempotencja jest architektoniczna, nie przypadkowa: zapas siedzi **wewnątrz**
`chatCompletion`, a egzekutory woła dopiero orkiestrator po powrocie z jednego
`deps.chat`. Ostatni wiersz to **znane ograniczenie**: zapas łapie odpowiedzi
zdeformowane i błędy w treści, ale nie zerwane połączenie.

## 6. Konfiguracja modelu

```
OPENROUTER_MODEL           → primary  (pusty ⇒ DEFAULT_MODEL)
OPENROUTER_FALLBACK_MODEL  → fallback (pusty ⇒ DEFAULT_FALLBACK_MODEL)
```

Zero hardcode'u w logice. Domyślne wartości w kodzie są **równe produkcyjnym**,
więc usunięcie zmiennej niczego nie psuje — wcześniej `DEFAULT_MODEL` wskazywał
`gemini-2.5-flash-lite`, model przegrywający z produkcyjnym **4:32**.

## 7. Streaming — czy warto i ile to pracy

**Warto**, bo model to 74–100% czasu tury. Ale **to nie jest mała zmiana**:

- `route.ts` — zamiast `NextResponse.json` strumień;
- `orchestrator.ts` — zamiast jednego `ConciergeResult` emisja progresywna
  (tylko OSTATNIE wywołanie modelu produkuje tekst dla użytkownika; rundy
  narzędziowe pozostaną nieme);
- `concierge-chat.tsx` — zamiast `res.json()` czytnik strumienia;
- nowy protokół ramek, bo obok tekstu trzeba dowieźć kartę oferty i stan błędu.

Trzy pliki i nowy kontrakt transportowy — **średni refaktor**, nie drobna zmiana.
Zgodnie z poleceniem **nie wdrożyłem go**.

**Tańszy chwyt o dużej części efektu (~10 linii, bez zmiany protokołu):**
zmieniać treść wskaźnika po czasie. Tury bez narzędzi kończą się do **3,6 s
(p95)**, więc po ~4 s można z ~95% pewnością napisać „Sprawdzam ceny…" zamiast
w kółko „Asystent pisze". Nie skraca oczekiwania, ale usuwa wrażenie martwego
spinnera przez 8–15 s. Do decyzji właściciela.

## 8. Czego ten pomiar nie obejmuje

- **n = 14 zapytań, 15 tur.** p95 stoi na pojedynczych obserwacjach — to wskazanie
  rzędu wielkości, nie estymata z wąskim przedziałem.
- **gemini-3.1 mierzone lokalnie**, nie na Vercelu (patrz wyżej). Kalibracja mówi,
  że lokalnie jest ~10–13% szybciej, więc jego wynik jest raczej zawyżony.
- **Jeden przebieg na model.** Zmienność LiteAPI i kolejek dostawcy nie została
  uśredniona wieloma powtórzeniami.
- Q02 na Preview przepadło na otwarciu panelu (flake Playwrighta), nie na modelu.
