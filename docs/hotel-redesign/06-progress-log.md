# 06 — Dziennik postępu

> Aktualizowany **na koniec każdej sesji**. Następna sesja zaczyna od sekcji
> „Od czego zacząć" na dole najnowszego wpisu.

---

## Sesja 1 — 2026-08-06 · Audyt

**Gałąź:** `feat/hotel-experience-redesign` (odbita od `main` @ `82f9fd6`)
**Etap wg planu:** przed Etapem 0 (audyt)

### Co zrobiono

1. Utworzono gałąź `feat/hotel-experience-redesign`.
2. Naprawiono uszkodzony katalog `.next` (`ENOENT … pages-manifest.json`)
   przez `rm -rf .next` — znany błąd po ubitym serwerze deweloperskim.
3. **Zbudowano sondę kontraktu API** — `scripts/probe-hotel-contract.ts`
   (`pnpm probe:hotel-contract`). To najważniejszy artefakt tej sesji: schematy
   Zod są nie-strict, więc z kodu **nie da się** odczytać, jakich danych nie
   parsujemy. Sonda odpytuje LiteAPI i wypisuje wszystkie klucze odpowiedzi.
4. Wykonano pomiary na żywo (klucz `prod_`, hotel `lp6558036a`, Málaga)
   i udokumentowano wyniki w `02-data-contracts.md`.
5. Zmapowano architekturę sekcji hotelowej i skalę warstw (z-index).
6. Napisano dokumenty 01–08.

### Najważniejsze ustalenia

| # | Ustalenie | Dowód |
|---|---|---|
| 1 | **„wł. podatków" to nieprawda dla ~52% ofert** — 209 z 400 taryf ma `taxesAndFees[].included === false` | pomiar; `result-card.tsx:213`, `rooms-section.tsx:276` |
| 2 | **Gwiazdki nigdy nie renderują się na stronie hotelu** — `/data/hotel` zwraca `starRating`, schemat oczekuje `stars` | sonda + `[hotelId]/page.tsx:253,324,405,515` |
| 3 | **Zdjęcia pokoi ISTNIEJĄ w API** (21/21 pokoi, po ~5 zdjęć) i są wyrzucane przez Zod — schemat nie deklaruje `rooms` | sonda |
| 4 | **Uczciwej przeceny nie da się zbudować** — `initialPrice == total` na 400/400; `suggestedSellingPrice` to cena booking.com, wyższa na 100% taryf | pomiar |
| 5 | Wyrzucane też: `poi[]` (odległości), `sentiment_analysis` (kategorie ocen), `facilities[{facilityId,name}]`, `chain`, `facilityIds` | sonda + grep |
| 6 | **Kolizja czatu ze sticky CTA jest mechaniczna**: czat `z-40`, sticky CTA hotelu `z-30` | grep po `src/` |
| 7 | Duplikaty udogodnień pochodzą **ze źródła** (`facilityId 47` „WiFi dostępne" i `107` „Darmowe WiFi") — deduplikacja po tekście nie zadziała | sonda |
| 8 | `language=pl` to *best effort* — jeden pokój ma jednocześnie `"Twin bed"` i `"Łóżko podwójne"` | sonda |
| 9 | `checkinCheckoutTimes` jest w **snake_case** — godzina zameldowania jest wyrzucana | sonda |
| 10 | **Brak jakiejkolwiek biblioteki map** w projekcie | `package.json` |

### Testy — wykonane, z wynikami

| Komenda | Wynik |
|---|---|
| `pnpm test` | ✅ **526/526** (`pass 526, fail 0`) |
| `npx tsc --noEmit` | ✅ zero błędów poza generowanym `.next/dev/types/` |
| `npx eslint scripts/probe-hotel-contract.ts` | ✅ czysto |
| `pnpm lint` (całość) | ⚠️ **4 błędy, wszystkie sprzed tej sesji** — potwierdzone przez `git stash` na czystym drzewie: `save-hotel-button.tsx:54`, `cookie-consent-banner.tsx:65`, `google-analytics.tsx:67`, `consent/context.tsx:82`. Dodatkowe błędy w nieśledzonym `tmp/` też są sprzed sesji. **Moje zmiany nie dodają żadnego.** |
| `pnpm build` | ✅ przechodzi (`BUILD_EXIT=0`) — **ale dopiero po `rm -rf .next` i przy zatrzymanym serwerze deweloperskim**, patrz niżej |

#### Nowa pułapka odkryta w tej sesji

`pnpm build` uruchomiony **równolegle z działającym `pnpm dev`** wywala się na:

```
Failed to type check.
.next/dev/types/routes.d.ts:120:4
Type error: Declaration or statement expected.
>  120 | g; }
```

To nie jest błąd w kodzie — to **obcięty plik generowany**, który serwer
deweloperski zapisywał w trakcie budowania. Objaw myli, bo wskazuje na błąd
typów. Lekarstwo: zatrzymać `dev`, `rm -rf .next`, zbudować ponownie.

To ta sama rodzina co znany błąd „ubity serwer → HTML 404 na API routes"
i drugi raz w tej sesji kosztowała czas (patrz R-10 w rejestrze ryzyk).

### Czego NIE zrobiono (wbrew pierwszemu poleceniu briefu)

Uczciwie, żeby następna sesja nie założyła, że to jest zrobione:

1. **Zrzuty bazowe i pomiary wydajności** — panel przeglądarki nie kompletował
   klatek, zrzut kończył się błędem. To jest **Etap 0** i pierwsze zadanie
   następnej sesji.
2. **Otwarcie stron referencyjnych Nuitee w przeglądarce** —
   `03-ux-comparison.md` opiera się na zrzutach właściciela, nie na własnym
   teście interakcji.
3. **Pełna lektura** `[hotelId]/page.tsx` (663 linie) i `results-list.tsx`
   (593 linie) — czytane fragmentarycznie i przez grep.
4. Audytu dostępności i Lighthouse.

**Powód zawężenia:** równoległy audyt wielo-agentowy (7 agentów, 6 obszarów +
synteza) padł w całości na limicie sesji po ~956 tys. tokenów, nie zwracając
żadnych wyników. Audyt powstał w trybie jednoosobowym — węższy zakres, ale
każdy punkt zweryfikowany u źródła.

### Pytania do właściciela (blokują 3 etapy)

Szczegóły i rekomendacje w `07-decisions.md`.

- **D1 — dostawca mapy.** Brak biblioteki map. Rekomendacja: MapLibre GL +
  MapTiler (wymaga konta i klucza API). Blokuje Etap 7.
- **D2 — cena Booking.com.** Nie pokazywać nic (domyślne, bezpieczne) czy
  pokazać jako opisane porównanie bez przekreślenia? Przecena odpada — brak
  podstawy w danych i ryzyko UOKiK. Blokuje sposób prezentacji w Etapie 3.
- **D3 — Playwright.** Bez niego 18 scenariuszy E2E z briefu §26.3 jest
  niewykonalnych. Blokuje Etap 13.

Etapy 1–6 i 8–12 **nie są zablokowane**.

### Zmienione pliki

```
+ scripts/probe-hotel-contract.ts          (nowy, read-only sonda API)
+ docs/hotel-redesign/01..08*.md           (nowe, 8 dokumentów)
M package.json                             (+1 linia: skrypt probe:hotel-contract)
```

Zero zmian w kodzie aplikacji. Serwis działa dokładnie tak jak przed sesją.

### Od czego zacząć następną sesję

1. **Etap 0** — postawić serwer (`pnpm dev`; jeśli 500 → `rm -rf .next`),
   zrobić zrzuty bazowe i pomiary do `docs/hotel-redesign/baseline/`.
   Bez tego nie da się wykazać poprawy ani wykryć regresji.
2. **Etap 1** — rozszerzyć schematy w `src/lib/liteapi/types.ts`
   (**tylko pola opcjonalne** — moduł jest współdzielony z rezerwacją i lotami).
   Kolejność wg wartości: `starRating` → `taxesAndFees` → `rooms[]` →
   `facilities[]` → `poi[]` → `sentiment_analysis` → `chain`/`facilityIds`.
3. **Zweryfikować pozycję 2.10 z audytu** — z którego poziomu
   `lib/hotels/group-rates.ts` czyta `refundableTag`. Na drucie top-level jest
   `undefined`, prawda siedzi w `cancellationPolicies.refundableTag`. Jeśli
   czyta z top-level, oznaczenia zwrotności są dziś błędne.
4. Pamiętać: **nowy `*.test.ts` trzeba dopisać do listy w `package.json`**,
   inaczej nigdy się nie uruchomi.

### Commit

`6e40040` — `docs(hotele): audyt sekcji hotelowej + empiryczna sonda kontraktu LiteAPI`

---

## Sesja 1b — 2026-08-06 · Etap 0 + korekty po linkach właściciela

Kontynuacja tej samej sesji po odpowiedzi na bramy decyzyjne.

### Decyzje właściciela

- **D1: MapLibre GL + MapTiler** → potrzebny klucz `MAPTILER_API_KEY`
- **D2: nie pokazywać ceny Booking.com** w ogóle
- **D3: Playwright tak, ale w Etapie 13** (po ustabilizowaniu UI)

### Etap 0 — punkt odniesienia · **CZĘŚCIOWO WYKONANY**

Zmierzone Lighthouse'em na buildzie **produkcyjnym** (`pnpm start`), zapisane
w `docs/hotel-redesign/baseline/`. Do `scripts/run-lighthouse.ts` dodano trasę
strony hotelu — **dotąd nie była mierzona w ogóle**.

| trasa | perf | LCP | TBT | seo |
|---|---|---|---|---|
| `/` | 43 | **7816 ms** | 1644 ms | 100 |
| `/hotele/szukaj` (3 kierunki) | 79–85 | 4189–4476 ms | 104–273 ms | **69** |
| `/hotele/lp6558036a` | 82 | 4101 ms | 115 ms | 92 |

**Nadal brakuje zrzutów ekranu** — panel przeglądarki nie kompletuje klatek
(`the Browser pane is not displayed`), więc zrzut kończy się timeoutem. To
ustawienie po stronie aplikacji. Etap 0 domknąć, gdy panel będzie widoczny.

### Trzy ustalenia z pomiaru (uwaga na dwa pozorne)

1. **`bp = 0` na stronie hotelu to artefakt raportowania**, nie defekt.
   Kategoria ma wynik `null` (audyt `charset` padł), a `score()` w skrypcie
   robi `?? 0`. Wszystkie wykonane audyty mają 1. Poprawka do zrobienia
   w skrypcie: `null` → `n/a`.
2. **`seo = 69` to prawdziwa sprzeczność.** `robots.txt` linia 6 ma
   `Disallow: /hotele/szukaj`, a strona wysyła `<meta name="robots" content="index, follow">`.
   Decyzja SEO dla właściciela, poza zakresem przebudowy UI. Osobno: lokalny
   `robots.txt` pokazuje `Host: https://example.com` — **sprawdzić na produkcji**.
3. **`meta-description = 0` na stronie hotelu — niepotwierdzone.** `curl` na tej
   samej trasie zwraca poprawny opis. Nie naprawiać przed powtórzeniem pomiaru.

### Korekta audytu po linkach właściciela

Właściciel podesłał dokumentację LiteAPI. **Jedna z moich diagnoz była błędna.**

`02-data-contracts.md` §5 twierdził, że powiązania taryfy z pokojem „nie da się
zrobić", bo `roomTypeId` (base32) nie pasuje do `rooms[].id` (liczba), i planował
dopasowywanie po nazwach przez barierę językową z `fuse.js`.

**Istnieje klucz obcy:** `POST /hotels/rates` przyjmuje `roomMapping: true`
i dokłada `mappedRoomId` wskazujący wprost na `rooms[].id`.

Pułapka, przez którą pierwsza sonda dała „0/9": `mappedRoomId` jest na poziomie
**`rates[]`**, nie `roomTypes[]`.

Pomiar pokrycia:

| hotel | taryf | mappedRoomId | trafia w rooms[] | ma zdjęcie |
|---|---|---|---|---|
| lp6558036a | 8 | 8 | 8 | 8 |
| lp6556ead9 | 14 | 14 | 14 | 14 |
| lp1ff62 | 3 | 3 | 3 | 3 |
| lp27a0d8 | 6 | 6 | 6 | 6 |
| **razem** | **31** | **31** | **31** | **31 (100%)** |

Skutki: **ryzyko R-03 (najwyżej oceniane w rejestrze) znika**, `fuse.js` nie jest
potrzebny, Etap 9 jest prostszy. Nowe ryzyko **R-03b**: dodanie `roomMapping`
zmienia treść zapytania → trzeba podbić `KEY_VERSION` w `rate-cache.ts`.

Dokumentacja ujawniła też **filtry po stronie serwera** w `/hotels/rates`
(`starRating`, `facilities`, `chainIds`, `boardType`, `refundableRatesOnly`,
`sort`, `limit`) — istotne dla Etapu 6.

### Widget mapy LiteAPI — rozważony i odrzucony

Nie wymaga własnego klucza kafelków (realna zaleta), ale to hostowany komponent
z UI dostawcy, bez udokumentowanego polskiego, z własnym wyszukiwaniem — nie da
się go zsynchronizować z naszą listą i filtrami (brief §10). Ta sama ściana,
o którą rozbił się gotowy chatbot LiteAPI. Uzasadnienie: `07-decisions.md` D1a.

### Od czego zacząć następną sesję

1. **Domknąć Etap 0** — zrzuty ekranu, gdy panel przeglądarki będzie widoczny.
2. **Etap 1** — schematy w `src/lib/liteapi/types.ts`, kolejność:
   `starRating` → `taxesAndFees` → `rooms[]` → `mappedRoomId` (rate level!) →
   `facilities[]` → `poi[]` → `sentiment_analysis` → `chain`/`facilityIds`.
   **Tylko pola opcjonalne.**
3. Przy `roomMapping` — **w tym samym commicie** podbić `KEY_VERSION`
   w `lib/hotels/rate-cache.ts` (R-03b).
4. Zweryfikować, z którego poziomu `group-rates.ts` czyta `refundableTag`
   (pozycja 2.10 audytu — na drucie top-level jest `undefined`).
