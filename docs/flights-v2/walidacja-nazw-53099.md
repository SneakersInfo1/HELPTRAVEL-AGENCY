# Za krótkie imię i nazwisko — kod 53099

**Stan:** wdrożone na gałęzi `claude/validation-name-length-53099-0210d1`.
**Podstawa:** pomiar sondą różnicową na produkcyjnym kluczu, 2026-08-30.

## Co się działo

Prebook z imieniem lub nazwiskiem krótszym niż 3 znaki wracał od dostawcy jako
**HTTP 500** z ciałem:

```json
{"error":{"code":53099,"description":"Contact name is too short — must be at least 3 characters; Passenger 1 name is too short — must be at least 3 characters"}}
```

Status 500 jest tu mylący: to nie jest awaria serwera, tylko odrzucenie danych
wejściowych. Skutki, wszystkie naraz:

| warstwa | zachowanie przed |
|---|---|
| formularz | `min(1)` — „x" przechodziło |
| schemat serwera | `z.string().trim().min(1)` — też przechodziło |
| klient LiteAPI | 500 jest na liście `RETRYABLE_STATUS` → **3 wywołania** na każdą próbę |
| mapowanie | `PROVIDER_ERROR` → **HTTP 502** |
| UI | „Dostawca lotów zwrócił błąd. **Spróbuj ponownie za chwilę**" |

Ostatni wiersz jest najgorszy: rada, która nie mogła zadziałać. Ten sam payload
zawsze dostawał tę samą odpowiedź, a użytkownik czekał jeszcze przez dwa
backoffy, zanim ją zobaczył.

## Co jest teraz

Próg żyje w **jednym** miejscu — `src/lib/flights/name-policy.ts` — i stamtąd
biorą go obie bramki:

- **UI:** `src/lib/flights/passenger-form.ts` (`collectPassengerFormErrors`),
  wołane przez `/loty/pasazerowie`. Zwraca mapę `pole → komunikat`; niepusta
  mapa zatrzymuje submit, więc żądanie prebooka **nie powstaje**.
- **Serwer:** `FirstNameSchema` / `LastNameSchema` w `src/lib/flights/types.ts`,
  użyte w `FlightPassengerSchema` i `FlightContactSchema`. Front nie jest jedyną
  ochroną.

Obronnie, gdyby dostawca kiedyś odrzucił nazwę mimo naszej bramki:

- `toFlightApiError` mapuje 53099 (oraz sam opis „name is too short") na
  `VALIDATION` / **HTTP 422**, `reason: "NAME_TOO_SHORT"`;
- `prebookFlight` przekazuje `noRetryWhen: isDeterministicProviderValidation` —
  **zero ponowień** dla tej odmowy. Awarie przejściowe, timeouty i błędy sieci
  zachowują dotychczasowe trzy próby;
- route zwraca `issues[]` ze ścieżkami pól (`["passengers",1,"lastName"]`),
  a formularz mapuje je na swoje identyfikatory i przewija do właściwego pola.
  Wpisane dane zostają nietknięte.

### Czego NIE robimy

„Li", „Ng", „Ho" to prawdziwe nazwiska. Nie dopisujemy spacji, nie dublujemy
liter, nie zmieniamy niczego, co ma się zgadzać z dokumentem podróży — błędne
dane na bilecie kończą się odmową odprawy i nie da się ich potem zmienić.
Zamiast tego mówimy wprost, że to ograniczenie techniczne po naszej stronie,
i podajemy adres kontaktowy. Test `dwuznakowe nazwisko zostaje dwuznakowe`
istnieje po to, żeby ewentualny „pomocny" normalizator wywalił suitę.

Użytkownik nie widzi ani kodu `53099`, ani nazwy dostawcy. Pole `debug`
(`liteApiStatus` / `liteApiCode`) zniknęło z odpowiedzi `/api/flights/prebook` —
nikt go nie czytał, a wysyłało kod dostawcy prosto do przeglądarki.

## Dziennik błędów

`saveFlightErrorLog` istniało od Fazy 1.1, ale **nie było wpięte nigdzie**.
Teraz zapisuje każdy błąd prebooka pod `flight:v1:errlog:{uuid}` (TTL 30 dni):

- `stage`, `sessionId`, `httpStatus`, `liteApiCode`,
- `classification` (`VALIDATION` / `PROVIDER_ERROR` / …), `reason`, `retryable`,
- `description` po `sanitizeProviderDescription` (usuwa wartości w cudzysłowie,
  client secret Stripe'a, klucze API, adresy e-mail; przycina do 300 znaków),
- `requestRedacted` — **wyłącznie długości** odrzuconych pól, nigdy ich treść,
- `elapsedMs` — czas od utworzenia intencji do błędu.

Wieku OFERTY nie da się zapisać: front nie wysyła jej znacznika czasu, a
`FlightPrebookInputSchema` nie ma takiego pola. `elapsedMs` jest najbliższym
uczciwym zamiennikiem.

## PII w Redisie — ocena (bez zmian w tym fixie)

`flight:v1:session:{id}`, **TTL 24 h**, trzyma `contactData` (imię, nazwisko,
e-mail, telefon — jawnie) i `passengerData` (imię, nazwisko, data urodzenia,
płeć, obywatelstwo, typ i daty dokumentu jawnie; **numer dokumentu
zamaskowany** do trzech ostatnich znaków).

Rekordy 90-dniowe **nie duplikują** PII: `FlightCompletedRecord` i
`FlightFailedRecord` niosą wyłącznie identyfikatory, status, PNR i kwotę;
indeksy `bybooking` / `byprebook` to same stringi z `sessionId`. PII żyje więc
dobę, nie kwartał.

Czytelnicy: mail potwierdzający i alerty (`contactData.email`, imiona/nazwiska),
strona potwierdzenia przez `GET /api/flights/booking/[id]` (imię, nazwisko,
typ), alert `manual_review` (adres e-mail). To jest uzasadnione: bez tego nie ma
jak dostarczyć potwierdzenia ani odzyskać rezerwacji opłaconej, a niezabookowanej
(RULE 6). **Do samego bookingu u dostawcy dane pasażera nie są potrzebne** —
`POST /flights/bookings` bierze tylko `prebookId` i `transactionId`.

Do rozważenia osobno (nie tutaj — to migracja, nie poprawka):

1. `contactData.phoneNumber` / `phoneCountryCode`, a w `passengerData`
   `birthday`, `gender`, `nationality`, `documentType`, `documentExpiry`,
   `documentIssueCountry`, `documentNumberMasked` — **nikt ich nie odczytuje**
   z rekordu sesji. Kandydaci do usunięcia z zapisu.
2. `GET /api/flights/booking/[bookingId]` oddaje imiona i nazwiska każdemu, kto
   zna `bookingId`. Warto sprawdzić entropię identyfikatora dostawcy.

## Sondy diagnostyczne

`probe:flight-intent-diff` i `probe:flight-name-gate` **nie wchodzą do repo**:

- `intent-diff` wypisuje na konsolę imiona i nazwiska prawdziwych klientów
  wczytane z produkcyjnego Redisa,
- `name-gate` wykonuje realny prebook na produkcyjnym kluczu (przy poprawnych
  nazwach zostawia lock taryfy).

Były narzędziem jednorazowym; ich ustalenia są dziś zapisane w
`name-policy.ts` i w testach. Zostały niezacommitowane w worktree
`flight-prebook-request-diff-cebd24` — do skasowania tam.

## Testy

- `src/lib/flights/name-policy.test.ts` — 18 testów: próg, NFD, rozpoznanie
  53099 vs zwykłej awarii, wskazanie pola („Passenger 2" → drugi pasażer),
  sanityzacja opisu.
- `src/lib/flights/passenger-form.test.ts` — 15 testów: A („J"), B („Ja"),
  C („Jan"), D („Li"), kontakt, dwóch dorosłych, czystość funkcji.
- `src/app/api/flights/flight-routes.test.ts` — 7 nowych: serwer odrzuca bez
  dotykania dostawcy, 422 + zero ponowień, awaria przejściowa nadal 502 + 3
  próby, dziennik bez PII.
- `e2e/loty-bledy.spec.ts` — 3 nowe: „J"/„Ja" nie tworzą żądania, „Li" dostaje
  drogę wyjścia, 422 ląduje przy polu i nie kasuje wpisanych danych.
