# HelpTravel — stan bieżący

Zaktualizowane: 2026-08-09, po sesji „final pre-production hardening".

## Co naprawiono w tej sesji

**Integralność cen (bloker produkcyjny — zdjęty).**
Checkout pisał bezwarunkowe „wł. podatków i opłat". Pomiar na żywym LiteAPI
(17 776 taryf, 4 miasta): **14 315 taryf (80,5%)** miało opłaty oznaczone
`included: false`, średnio **352,38 PLN** nieujawnionej dopłaty.
Przyczyną nie był tekst — `LiteApiPrebookResponseSchema` deklarował 9 pól,
a schematy są nie-strict, więc Zod po cichu kasował `taxesAndFees` oraz
`priceDifferencePercent` / `cancellationChanged` / `boardChanged`.
Pełne dowody i forensyka prebooka: `docs/hotel-redesign/price-integrity-audit.md`.

- nowy model `src/lib/hotels/domain/checkout-price.ts` (rozdzielone „teraz"
  vs „na miejscu"); `BookingSummaryCard` dostaje model, nie `price: number`
- cena checkoutu **wyłącznie z prebooka**; usunięty fallback do `?price=`
  z URL-a; brak ceny = fail closed (502), płatność się nie otwiera
- `initialPrice` zmienione z `.optional()` na `.nullish()` — dostawca przysyła
  `null`, co wywalało parsowanie całego `retailRate`
- „łączny koszt pobytu" **świadomie niepokazywany** — brak potwierdzenia
  dostawcy, że `taxesAndFees` wyczerpuje opłaty pobierane w obiekcie
- `/cennik` i `/trips/[id]` przestały powtarzać to samo nieprawdziwe założenie

**Nawigacja i filtry.**
- N1: szybkie filtry robiły `router.push` (panel boczny `replace`) — każdy chip
  dokładał wpis do historii, więc „Wstecz" cicho zdejmował filtry
- N2: tryb mapy ginął po Hotel → Wstecz (reset strzeżony `useRef`-em, który
  powstaje od nowa przy montowaniu); pamięć przeniesiona do modułu store'a,
  mutacja usunięta z fazy renderu
- N3: `resetFilterOptions()` nie było wołane — opcje filtrów przeciekały
  między kierunkami

**CSP.** Clarity miało zgodę w `script-src`/`connect-src`, ale nie w `img-src`
— `c.clarity.ms/c.gif` i `c.bing.com/c.gif` odrzucane (18 błędów na sesję).

**Zakładki strony hotelu.** Były `sticky top-[72px]`, teraz **statyczne**:
jedna kopia w DOM, znikają przy przewijaniu, ikony Lucide 5/5, zaokrąglona
obudowa z ramką i cieniem, cel dotyku ≥ 44 px, przewijanie poziome zamknięte
w pasku. Pilnuje tego `e2e/hotel-tabs.spec.ts` (12/12, desktop + 390 px).

## Testy

`pnpm test` — **663** (było 640). Nowe: `domain/checkout-price.test.ts`,
`hotels/view-mode-store.test.ts`. E2E: `hotel-tabs.spec.ts`.
Pułapka bez zmian: nowy plik testowy trzeba DOPISAĆ do jawnej listy
w `package.json`, inaczej nigdy się nie uruchamia.

## KNOWN ISSUE — do naprawy w osobnej sesji

**Mobilny wybór kierunku na homepage.** Rozpoczęcie pionowego przewijania
dokładnie na polu „Miasto lub kraj" może otworzyć picker.

- **Nie blokuje** świadomego tapnięcia ani wyszukiwania — tap działa.
- Przyczyna jest znana: `onPointerDown` otwiera listę na telefonie
  (`mini-planner-form.tsx`), a `pointerdown` odpala się w chwili dotknięcia,
  zanim wiadomo, czy gest będzie tapem, czy przewinięciem.
- **PUŁAPKA przy naprawie:** stała `MOBILE_DESTINATION_BREAKPOINT` to
  `(min-width: 640px)`, czyli warunek prawdziwy na **DESKTOPIE**, mimo nazwy.
  Linia 330 nazywa tę samą wartość `desktop`. Odwrócenie tej bramki już raz
  zmarnowało dwie próby naprawy.
- Próba przeniesienia otwierania na `onClick` dała: scroll 3/3 nie otwiera,
  ale **tap 0/3 nie otwiera** — cofnięta, nie weszła na produkcję. Nie
  rozstrzygnięto, czy to wada kodu, czy artefakt emulacji dotyku w Playwright.
  Wymaga sprawdzenia na prawdziwym telefonie.

## Pozostałe drobiazgi

- ostrzeżenie Next/Image: `sizes="100vw"` przy obrazie niepełnej szerokości
- `preview-smoke.spec.ts` punkt 37 potrafi paść na `next dev` pod obciążeniem
  (chunk mapy nie zdąży się skompilować); na buildzie produkcyjnym 10/10
- preview Vercela jest za ochroną SSO (302) — testy automatyczne tam nie wejdą
