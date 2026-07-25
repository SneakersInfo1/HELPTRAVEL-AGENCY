# CLAUDE CODE EXECUTOR — Warstwa "Pakiety Lot + Hotel"

> **Cel:** Ten prompt jest orchestratorem dla Claude Code (desktop app, z dostępem do terminala i edytora). Jego zadaniem jest:
> 1. Wczytać i zinterpretować `PROMPT_PAKIETY_LOT_HOTEL.md` (specyfikacja techniczna),
> 2. Zbudować projektu krok po kroku (Faza 0 → 1 → 2) z checkpointami,
> 3. Komunikować się zwrotnie — czekać na decyzje przed każdym krokiem,
> 4. Produkować kod produkcyjny, nie szkielety.

---

## PRZED STARTEM

Załóż, że:
- Masz dostęp do `PROMPT_PAKIETY_LOT_HOTEL.md` w tym samym folderze (lub wklej go do tej rozmowy),
- Projekt `helptravel.pl` jest już na dysku, z historią (Git),
- Vercel Pro + Upstash Redis + Postgres (Prisma) są już skonfigurowane (weryfikacja w Fazie 0),
- Masz dostęp do LiteAPI sandboxu (account + API keys).

---

## STRUKTURA PRACY

Pracujemy w **3 fazach** opisanych w `PROMPT_PAKIETY_LOT_HOTEL.md` §10. Każda faza ma **checkpointy** — punkty, w których czekam na Twoją decyzję/input zanim ruszę dalej.

```
FAZA 0 (Weryfikacje + bramki decyzyjne)
  ├─ Checkpoint 0.1: Weryfikacja infrastruktury
  ├─ Checkpoint 0.2: Testy sandboxu LiteAPI
  └─ Checkpoint 0.3: Decyzja: idziemy dalej (Faza 1)?

FAZA 1 (Search + listing + landingi SEO, BEZ płatności, za flagą)
  ├─ Checkpoint 1.1: Struktura modułu + cache
  ├─ Checkpoint 1.2: Krok 1-2 UI (testy Storybook)
  └─ Checkpoint 1.3: Decyzja: landingi SEO + warming cache?

FAZA 2 (Płatności, saga, webhooki — TYLKO po rozstrzygnięciu prawnym)
  ├─ Checkpoint 2.1: Saga + Postgres models
  ├─ Checkpoint 2.2: Dwa checkouty + Payment SDK
  └─ Checkpoint 2.3: Webhooki + potwierdzenie (live)
```

Przed każdym checkpointem dostajesz:
- Co zrobiłem (commit list),
- Co się nauczyłem (problemy, niespodzianki),
- **Jaka decyzja potrzebna od Ciebie zanim pójdę dalej** (konkretne pytania, nie mgła).

---

## FAZA 0 — BRAMKI DECYZYJNE I WERYFIKACJE

**Cel:** Zamknąć pytania techniczne, potwierdzić infrastrukturę, stworzyć `docs/PACKAGES_DECISIONS.md`.

### Krok 0.0 — Przygotowanie

```bash
# 1. Utwórz gałąź
git checkout -b packages/phase-0

# 2. Utwórz strukturę modułu (stub'y)
mkdir -p src/modules/packages/{api,services,state,components,types}
touch src/modules/packages/types.ts
touch src/modules/packages/services/packageSearch.ts
touch src/modules/packages/services/packagePricing.ts
touch src/modules/packages/services/packageOrchestrator.ts
touch src/modules/packages/services/flightsClient.ts
touch docs/PACKAGES_DECISIONS.md

# 3. Stwórz test file dla sandboxu
touch src/modules/packages/__tests__/liteapi.sandbox.test.ts
```

### Krok 0.1 — Checkpoint: Weryfikacja infrastruktury

**Moja lista checklist:**

```
□ DATABASE_URL ustawiony w .env.local i .env.production (Vercel)?
  → Jeśli brak: STOP i zgłoś błąd (znany risk z audytu)
  → Test: `prisma db push --skip-generate` (jeśli OK, DB żyje)

□ Upstash Redis URL w .env?
  → Test: `redis-cli -u "$UPSTASH_REDIS_REST_URL"` (ping)

□ LiteAPI sandboxu dostęp (API key)?
  → Gdzie przechowywać: .env.local jako `LITEAPI_API_KEY`, `LITEAPI_BASE_URL` (sandbox)
  → Test: curl do POST /flights/rates z dummy search

□ Vercel CLI + możliwość uruchomienia lokalnie?
  → `vercel dev` powinien startować bez błędów
```

**Pytanie do Ciebie (Checkpoint 0.1):**

Wszystkie wyżej spełnione? Jeśli nie:
- Które nie działają?
- Mogę je naprawić, czy to wymaga Twojego dostępu (klucze, setup)?

Jeśli wszystko OK: idziemy do 0.2.

---

### Krok 0.2 — Checkpoint: Testy sandboxu LiteAPI (empiryczne)

Wykonam szereg requestów do LiteAPI sandbox i zapiszę wyniki. Cel: potwierdzić odpowiedzi z `PROMPT_PAKIETY_LOT_HOTEL.md` §0 pkt 6–9 na rzeczywistych danych.

**Plan testów:**

```
Test A: POST /flights/rates dla WMI→BCN, ±3 pax, economy
  → Sprawdzić: czy response zawiera offerId, expiration, currency ("PLN" czy coś innego?)

Test B: POST /flights/verify na tym offer'ze
  → Czy jest `expiration` w response? Jak długo (w minutach)?
  → Czy mogą pojawić się `changes`? (jaki format?)

Test C: POST /flights/prebooks (prebook bez ancillaries)
  → Response: czy mam `prebookId`, `transactionId`, `secretKey`, `servicesAttachable`?
  → Czy `servicesAttachable` zawiera coś dla Wizzaira? (sprawdzić struktura pól)

Test D: POST /flights/prebooks/{id}/services (dołączenie bagażu, jeśli jest w attachable)
  → Czy dostajemy NOWY `transactionId`/`secretKey`?
  → Czy stary transactionId jest martwy (weryfikacja)?

Test E: GET /flights/bookings/{id} na niezakończonym bookingu
  → Jaki status? (czy możliwe PENDING / CONFIRMED?)

Test F: Webhook payload ze sandboxu
  → Struktura webhook'a flight.book.confirmed — jakie pola, w jakim formacie?

Test G: Transliteracja nazwiska — czy API akceptuje "Michał" czy wymaga "MICHAL"?
  → Prebook z danymi pasażera — test na Wizzairze.
```

**Wynik testów:** dokument `docs/LITEAPI_SANDBOX_RESULTS.md` z rzeczywistymi response'ami, mapowaniem do `PROMPT_PAKIETY_LOT_HOTEL.md` i oznaczeniem:
- ✅ Potwierdzone,
- ⚠️ Różni się od spodziewanego (wyjaśnienie),
- ❌ Niedostępne / niemożliwe (plan B).

**Pytanie do Ciebie (Checkpoint 0.2):**

Po testach prezentuję raport. Czy:
- Wyniki są akceptowalne (idziemy dalej)?
- Coś trzeba zmienić w specyfikacji (krok 3)?
- Potrzebujesz dodatkowych testów?

---

### Krok 0.3 — Checkpoint: `docs/PACKAGES_DECISIONS.md` final + decyzja prawna

Wypełniam `PACKAGES_DECISIONS.md` na podstawie testów + wiedzy z `PROMPT_PAKIETY_LOT_HOTEL.md`:

```markdown
# Decyzje projektowe — Pakiety Lot + Hotel

## Potwierdzone

1. [PRAWNE — PENDING] ...
2. [PŁATNOŚĆ — ANSWERED] Dwa PaymentIntenty, ...
3. [TICKETING — ANSWERED] Async, webhooki, ...
4. [ANCILLARIES — ANSWERED] servicesAttachable: {rzeczywiste wyniki z testów}, ...
5. [BLIK — ANSWERED: NIEMOŻLIWY] ...
6. [LCC ANCILLARIES — ANSWERED] {wyniki testu D}, ...
7. [WALUTA — ANSWERED] {wynik testu A}, ...
8. [KALENDARZ CEN — ANSWERED] Brak endpointu, cache warming, ...
9. [DANE PASAŻERA — ANSWERED] {wynik testu G}, ...

## Zatwierdzone do Fazy 1

□ Dwuczęściowy checkout (Hotel → Lot),
□ Krok bagaży renderuje się z servicesAttachable,
□ Cache warming GitHub Actions dla top 10 kierunków,
□ Formularz danych: transliteracja "Michał" → "MICHAL".

## Zatwierdzone do Fazy 2 (po rozstrzygnięciu prawnym)

□ Saga z kompensat (HOTEL_BOOKED_AWAITING_FLIGHT deadline).
```

**Pytanie do Ciebie (Checkpoint 0.3):**

Czy możesz:
1. Potwierdzić, że decyzje w `PACKAGES_DECISIONS.md` są OK?
2. Rozstrzygnąć kwestię prawną pkt 1 (albo "idziemy jako powiązane usługi", albo "czeka na konsultację — zawieszamy Fazę 2")?
3. Zatwierdzić start Fazy 1?

---

## FAZA 1 — SEARCH + LISTING + LANDINGI (bez płatności)

### Krok 1.0 — Checkpoint: Struktura modułu + cache

Jeśli Checkpoint 0.3 = OK, rozpoczynam Fazę 1.

**Zrobię:**

1. **Types** (`types.ts`): `PackageOffer`, `PackageQuote`, `PackageSearchParams`, etc.,
2. **Services**: 
   - `packageSearch.ts` — orkiestracja hotel-search × flight-search (jeden flight per pakiet),
   - `packagePricing.ts` — kalkulacja ceny/os., zaokrąglenia, delty,
   - `flightsClient.ts` — wrapper na LiteAPI Flights (server-only),
3. **Cache** — rozszerzenie istniejącego Upstash cache'u o klucze `pkg-search:{origin}:{dest}:{dates}:{pax}:{cabin}`,
4. **Homepage** — nowy tab `Lot + Hotel` + SEO landing stubs (noindex).

**Branch:** `packages/phase-1-search`

**Test coverage:** unit testy `packagePricing.ts` (zaokrąglenia), integracyjne `packageSearch.ts` (mock hotel/flight).

**Output:** Sprawdzisz PR z listą zmian, PR checklist.

**Pytanie do Ciebie (Checkpoint 1.0):**

OK aby implementować? Czy są pytania do struktury?

---

### Krok 1.1 — Checkpoint: UI Kroki 1–2 (listing hoteli + wybór lotu)

**Zrobię:**

- `src/modules/packages/components/PackageListing.tsx` — grid hoteli z ceną "od X zł/os.",
- `src/modules/packages/components/FlightSelection.tsx` — loty z deltami (Najlepsze/Najtańsze/Najszybsze),
- State (React context + Redis session): `PackageSession` z kroku 1 i 2,
- Filtery: budżet/os., gwiazdki, bezpośrednie loty,
- Breadcrumb: Wybierz pobyt → Wybierz lot.

**Storybook stories** dla każdego komponentu (mobile viewport 390px).

**Test:** Playwright e2e happy path (search → krok 1 → krok 2).

**Feature flag:** `NEXT_PUBLIC_FEATURE_PACKAGES` — jeśli false, tab nie widoczny.

**Output:** PR, screenshot'y Storybook, test raport.

**Pytanie do Ciebie (Checkpoint 1.1):**

Czy UI i interakcje się podobają? Zmiany przed landinami?

---

### Krok 1.2 — Checkpoint: Landingi SEO + cache warming

**Zrobię:**

- ISR landingi `/pakiety/{miasto}` dla top 10 kierunków,
- GitHub Actions workflow do cache warmingu (`POST /flights/rates` × 3 terminy, 1× dziennie o 6 rano),
- Sitemap + canonical,
- Schema.org (Trip, Offer, BreadcrumbList),
- Minimalny, unikalny tekst 300+ słów per kierunek (nie ai-slop, konkret: "Barcelona — stolica Katalonii, plaża, Sagrada Familia, od 1899 zł").

**Output:** Landingi live na `staging-env` (noindex; można sprawdzić w Preview),

**Pytanie do Ciebie (Checkpoint 1.2):**

Czy treść na landingach jest OK? Czy żadne ceny są aktualne (w cache)? Idziemy do git-pushu?

---

### Krok 1.3 — Checkpoint: Merge Fazy 1 + decyzja na Fazę 2

**Branch:** `main` ← merge z `packages/phase-1-*` (squash commits).

**Feature flag:** `NEXT_PUBLIC_FEATURE_PACKAGES=false` na produkcji (ale kod jest), `true` tylko na staging.

**Commity:** atomowe, z prefixem `packages:` + linki do `PACKAGES_DECISIONS.md`.

**Pytanie do Ciebie (Checkpoint 1.3):**

1. PR merge OK?
2. Czy ankieta techniczna od Ciebie wynika, że idziemy na Fazę 2 (prawo rozstrzygnięte)?
3. Czy mam czekać na feedback z TikToka / GA4 zanim zaczynam sagę?

---

## FAZA 2 — PŁATNOŚCI, SAGA, WEBHOOKI (Faza 2 = po rozstrzygnięciu kwestii prawnej)

### Krok 2.0 — Checkpoint: Saga + Postgres models

**Warunek wejścia:** `docs/PACKAGES_DECISIONS.md` pkt 1 = rozstrzygnięty (organizator imprezy).

**Zrobię:**

- Prisma model `PackageBooking` (saga state, obydwa booking ID, failure reason, compensation log),
- `packageOrchestrator.ts` — maszyna stanów (DRAFT → CONFIRMED) z kompensacjami,
- WebSocket/SSE endpoint do live updates stanu sagi,
- Webhooki: `/api/webhooks/liteapi/flights`, `/api/webhooks/liteapi/hotels` (z weryfikacją podpisu),
- Job runner (QStash/Vercel Cron) do deadline'u `HOTEL_BOOKED_AWAITING_FLIGHT` (auto-cancel po 25 min).

**Testy:** Unit (maszyna stanów), integracyjne (sandboxowe prebooki → book na real DB), scenario'e failur'ów (failure injection).

**Output:** PR, test raport, diagram maszyny stanów (mermaid).

**Pytanie do Ciebie (Checkpoint 2.0):**

Czy saga architecture jest OK? Czy coś chcesz zmienić w kompensacjach?

---

### Krok 2.1 — Checkpoint: Dwa checkouty + Payment SDK

**Zrobię:**

- `Checkout1_Hotel.tsx` + `Checkout2_Flight.tsx` (dwa widoki),
- Krok 3 UI (dostosowanie: pokój, bagaże, polityka, dane pasażerów),
- Payment element dla hotelowego PaymentIntent (secretKey A),
- Payment element dla lotniczego PaymentIntent (secretKey B', po attach services),
- Flow: Checkout 1 → POST /rates/book → Checkout 2 → POST /flights/bookings,
- Komunikat "Płatność w dwóch transakcjach — NUITEE TRAVEL" + progress bar.

**UX:** Jedno kliknięcie "Zapłać" na każdym checkoucie, dane karty mogą się reuse'ować (if supported by SDK).

**Porzucenie:** User płaci Checkout 1, znika → e-mail wznawiający + deadline 25 min → auto-cancel.

**Output:** PR, test e2e dwóch checkoutów (Playwright), screenshot'y kroku 3 + 4.

**Pytanie do Ciebie (Checkpoint 2.1):**

Czy dwa checkouty i komunikat się podobają? Zmiany?

---

### Krok 2.2 — Checkpoint: Webhooki + potwierdzenie

**Zrobię:**

- Webhook handlers z weryfikacją podpisu (HMAC czy jwt zależnie od LiteAPI),
- Logika: `flight.book.confirmed` → check saga, zmień stan na CONFIRMED, wyślij e-mail,
- Fallback polling (GET /flights/bookings/{id}) co 60s, max 30 min,
- Email templates (Resend/Nodemailer): potwierdzenie pakietu (dwa numery rezerwacji).
- Confirmation page: `/booking/{packageId}` — hotelu numerek, PNR lotu, daty, status ticketingu.

**Output:** PR, webhook test (ngrok/webhook.cool), e-mail preview.

**Pytanie do Ciebie (Checkpoint 2.2):**

E-mail + potwierdzenie OK? Coś chcesz zmienić w treści?

---

### Krok 2.3 — Checkpoint: Merge Fazy 2 + live launch

**Feature flag:** `NEXT_PUBLIC_FEATURE_PACKAGES=true` na staging (testujemy pełne flow).

**Jeśli OK:** merge na main + toggle flag na produkcji.

**Monitoring:** GA4 (package_* eventy), error tracking (Sentry), dashboard admina do zarządzania failur'ami sagi (NEEDS_MANUAL_ACTION list).

**Pytanie do Ciebie (Checkpoint 2.3):**

1. Staging fully tested?
2. Ready do live launch?
3. Plan backupowy (rollback) na wypadek?

---

## MÓJ WORKFLOW — CO ROBIĘ POMIĘDZY CHECKPOINTAMI

```
[Checkpoint N] ← Ty dajesz input
    ↓
[Implementacja — robię all-in bez pytań]
    ├─ Code (atomowe commity)
    ├─ Tests (unit/integracyjne)
    ├─ PR (ze screenshots, testów, wyjaśnień)
    └─ Dokumentacja (co się nauczyłem, gotchas)
    ↓
[Checkpoint N+1] ← Czekam na Twoją decyzję
```

Każdy checkpoint ma listę KONKRETNYCH pytań — nie "co myślisz", ale "czy A i B są OK, czy zmienić C?".

---

## INSTRUKCJA URUCHOMIENIA

1. Skopiuj `PROMPT_PAKIETY_LOT_HOTEL.md` do folderu projektu.
2. Otwórz Claude Code (desktop app).
3. W terminalu:
   ```bash
   cd /ścieżka/do/helptravel.pl
   ```
4. Wklej poniższy prompt do Claude Code (w osobnej rozmowie, z dostępem do plików/terminalu):

```
Jesteś senior fullstack architektem budującym warstwę "Pakiety Lot + Hotel" dla helptravel.pl.
Twoja rola: wykonać PROMPT_PAKIETY_LOT_HOTEL.md krok po kroku, czekając na checkpointy.

Przygotuj się do FAZY 0 — stwórz checklist'ę weryfikacji infrastruktury i testy sandboxu LiteAPI.
Po każdym kroku pokaż mi:
- Commity (lista zmian),
- Raport z testów (LITEAPI_SANDBOX_RESULTS.md),
- Konkretne pytanie/checkpoint (NIE abstrakcyjne).

Zanim ruszysz, potwierdź, że masz dostęp do:
- Projektu (Git),
- .env (LITEAPI_API_KEY, DATABASE_URL, UPSTASH_REDIS_REST_URL),
- Vercel i CLI,
- Stash workspace.

Zaczynamy?
```

5. Postępuj krok po kroku, odpowiadając na checkpointy.

---

## SZACUNKOWY HARMONOGRAM

```
Faza 0 (infrastruktura + testy sandboxu):          3–5 godzin (w jednym siataniu)
Faza 1 (search + listing + landingi):              8–12 godzin (rozłożyć na 2–3 dni)
Faza 2 (saga + płatności + webhooki):              16–20 godzin (rozłożyć na 4–5 dni)

Łącznie MVP: ~4 tygodnie pracy dla seniora.
Z testami, PR review, poprawianiem bugi: +1–2 tygodnie.
```

---

## OSTATNIA RZECZ

Ten prompt (**CLAUDE_CODE_EXECUTOR.md**) to Twój GPS. Jeśli coś pójdzie nie tak lub będziesz potrzebować pivot:

1. Wróć do `PROMPT_PAKIETY_LOT_HOTEL.md` — tam są decyzje,
2. Wróć do `docs/PACKAGES_DECISIONS.md` — tam są potwierdzenia,
3. Wróć tutaj do checkpointu i powiedz "Czekaj, w punkcie X się nie zgadzam" — zmienię plan.

Powodzenia. 🚀

