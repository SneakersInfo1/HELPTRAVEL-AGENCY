# Kontrolowany test płatności lotu — plan (NIE WYKONANY)

**Status: przygotowany, czeka na jawną zgodę właściciela.**
Nic z tego dokumentu nie zostało uruchomione. Żaden prebook, żadna płatność,
żadna rezerwacja nie powstała w ramach hardeningu.

---

## 1. Dlaczego nie da się tego zrobić bez pieniędzy

Pomiar z `pnpm probe:flight-env` (2026-08-29, wyłącznie odczyt):

```
LITEAPI_ENV                 = production
rozwiązany tryb (prefiks)   = production      (klucz prod_0a5b…610)
LITEAPI_SANDBOX_KEY         = BRAK
LITEAPI_SANDBOX_PRIVATE_KEY = BRAK
widget publicKey (Stripe)   = live  → Stripe LIVE (PRAWDZIWE PIENIĄDZE)
```

| Komponent | Środowisko | Tryb testowy dostępny? | Prawdziwe pieniądze? | Prawdziwa rezerwacja? | Bezpieczne do E2E? |
|---|---|---|---|---|---|
| Stripe (przez LiteAPI Payment SDK) | **LIVE** | nie u nas — konto należy do Nuitee Travel | **TAK** | — | **NIE** |
| LiteAPI Flights `/rates` (szukanie) | production | — | nie | nie | **TAK** (czysty odczyt) |
| LiteAPI Flights `/verify` | production | — | nie | nie | **TAK** (odczyt oferty) |
| LiteAPI Flights `/prebooks` | production | brak klucza `sand_` | nie | nie, ale **lockuje taryfę + otwiera PaymentIntent** | ograniczone |
| LiteAPI Flights `/bookings` | production | brak klucza `sand_` | **TAK (obciążenie)** | **TAK (bilet)** | **NIE** |
| Inwentarz przewoźnika | produkcyjny (GDS/Travelport, Wizz Air) | nie | — | **TAK** | **NIE** |
| Upstash Redis | **PRODUKCYJNY** (lokalny `.env.local` wskazuje na prod) | nie | nie | nie | uwaga: testy piszą do prod-store'u |
| Resend (mail) | produkcyjny | brak klucza lokalnie → wysyłka pomijana | nie | nie | TAK |

**Wniosek: pełne E2E bez prawdziwych pieniędzy NIE JEST MOŻLIWE** tym zestawem
kluczy. Karty testowe Stripe (`4242…`) zostaną odrzucone w trybie LIVE.

Jedyna droga do bezkosztowego E2E to klucz `sand_` dla lotów — do wzięcia
u LiteAPI (support), nie do obejścia po naszej stronie.

---

## 2. Co dokładnie kosztuje najtańszy test

Pomiar z tej samej sondy (WAW→BCN, wylot +30 dni, powrót +37 dni, 1 dorosły):

```
384 oferty; najtańsza 485,49 PLN; mediana 1578,35; najdroższa 2278,72
najtańsza: WAW→BCN Wizz Air, bezpośredni, 485,49 PLN
```

**Maksymalne ryzyko jednego przebiegu: ok. 490 zł** (jedna osoba, najtańsza
taryfa, trasa bezpośrednia). Kwotę trzeba potwierdzić w dniu testu — ceny
lotów zmieniają się w godzinach, nie dniach.

### Czy da się anulować bez kosztu?

**Nie zakładaj, że tak.** Trzy rzeczy do sprawdzenia PRZED testem, nie po:

1. **Taryfa Basic Wizz Air jest bezzwrotna** (`terms.refundable:false` w próbce
   `/flights/rates`). Anulacja nie zwraca pieniędzy.
2. **Prawo odstąpienia (14 dni) NIE OBEJMUJE przewozu pasażerskiego** —
   art. 38 pkt 12 ustawy o prawach konsumenta. Nie ma tu automatycznego zwrotu.
3. **Doba na rozmyślenie (24 h)** to reguła amerykańska (DOT) i dotyczy lotów
   do/z USA. Na trasie WAW→BCN nie działa.

Realistyczne założenie: **wydane pieniądze są wydane.** Kupując bilet
bezzwrotny, kupujemy test za jego cenę.

**Tańsza alternatywa, którą warto rozważyć przed jakimkolwiek zakupem:**
znaleźć w wynikach ofertę z `terms.refundable:true` (są takie — to zwykle
taryfy Flex u przewoźników sieciowych) i przyjąć wyższą cenę biletu w zamian
za realną możliwość zwrotu. Filtr po `refundable` nie istnieje w UI, ale
`/flights/rates` zwraca to pole i da się je sprawdzić sondą.

---

## 3. Przebieg testu — punkty zatrzymania

Każdy krok ma jawne „STOP", w którym można się wycofać BEZ KOSZTU.

| # | Krok | Co powstaje | Koszt | Da się przerwać? |
|---|---|---|---|---|
| 1 | Wyszukanie na Preview | nic | 0 | tak |
| 2 | Wybór oferty + taryfy | nic | 0 | tak |
| 3 | Dane pasażera (prawdziwe — bilet jest imienny) | nic | 0 | tak |
| 4 | „Przejdź do płatności" → **prebook** | lock taryfy + PaymentIntent u LiteAPI | 0 | **tak — STOP 1** |
| 5 | Widok „Do zapłaty" | nic | 0 | **tak — STOP 2** |
| 6 | Wpisanie karty | nic | 0 | **tak — STOP 3** |
| 7 | **Klik „Zapłać"** | **obciążenie karty** | **~490 zł** | **NIE — punkt bez odwrotu** |
| 8 | Powrót → finalizacja → booking | bilet u przewoźnika | — | nie |
| 9 | Mail + strona potwierdzenia | — | 0 | nie |

**STOP 1–3 są darmowe.** Porzucony prebook wygasa sam (lock taryfy u dostawcy),
PaymentIntent bez potwierdzenia wygasa po stronie Stripe'a. Żaden z nich nie
generuje obciążenia.

**Krok 7 jest jedynym nieodwracalnym.** Po nim nie ma „cofnij".

---

## 4. Co ten test naprawdę zweryfikuje (a czego nie da się inaczej)

Rzeczy pokryte testami z mockiem i NIEwymagające prawdziwej karty:
bramka ceny, dowód płatności, maszyna stanów, idempotencja, semantyka maila,
inwarianty kwoty. To wszystko jest już zielone (821 testów jednostkowych).

Rzeczy, których **nie da się sprawdzić inaczej niż realnym zakupem**:

1. Czy widget LiteAPI w trybie `live` faktycznie montuje się na naszej domenie
   Preview i czy `returnUrl` wraca z `payment_intent` + `redirect_status`
   (całe rozwiązanie ryzyka A stoi na tym, że Stripe te parametry dokleja —
   zmierzone dla hoteli, dla lotów **założone przez analogię**).
2. Czy `pi_…` wyliczone z `secretKey` prebooka lotu ZGADZA SIĘ z `payment_intent`
   w adresie powrotu (jeśli LiteAPI opakowuje transakcję inaczej niż przy
   hotelach, bramka odrzuci PRAWDZIWĄ płatność — to jest ryzyko wprowadzone
   przez ten hardening i największy powód, żeby go zmierzyć).
3. Czy `POST /flights/bookings` z `TRANSACTION_ID` faktycznie kończy się
   `status: CONFIRMED` i PNR-em.
4. Jaki jest realny kształt `prebook.booking.journey` i rekordu bookingu —
   czyli czy `extractProviderItinerary` cokolwiek znajduje, czy zawsze spada
   na migawkę od klienta.
5. Czy mail dochodzi z produkcyjnym `EMAIL_FROM`.

**Punkt 2 jest krytyczny.** Bramka `payment_intent_mismatch` może zablokować
prawdziwą płatność, jeśli LiteAPI oddaje w `secretKey` coś innego niż Stripe
client secret tej samej transakcji, którą Stripe zwraca w adresie powrotu.
Kod jest napisany fail-safe (brak parametru = przepuszczamy), ale
NIEZGODNY parametr = twarda odmowa.

### Jak zmierzyć punkt 2 BEZ płacenia

Można dojść do STOP 2 i odczytać z logów Vercela linię
`[flights][prebook] secretKey bez rozpoznawalnego pi_…`.
- Linia **jest** → `secretKey` nie jest client secretem → bramka mismatch nigdy
  się nie odpali (degradacja do `unverified`) → ryzyko zerowe, ale i wiązanie
  nie działa.
- Linii **nie ma** → mamy `pi_…` i pozostaje sprawdzić, czy zgadza się
  z adresem powrotu — a tego bez płatności nie zobaczymy.

To kosztuje 0 zł i zamyka połowę pytania. **Warto zrobić to najpierw.**

---

## 5. Warunki przed uruchomieniem

- [ ] Właściciel jawnie potwierdza zakup biletu za ~490 zł.
- [ ] Cena sprawdzona w dniu testu (`pnpm probe:flight-env`).
- [ ] Sprawdzone, czy istnieje sensownie tania oferta `refundable:true`.
- [ ] Dane pasażera PRAWDZIWE (bilet imienny — fałszywe = bilet nie do użycia).
- [ ] `EMAIL_FROM` ustawione na Preview, inaczej mail nie wyjdzie i test nie
      sprawdzi §11.
- [ ] `ALERT_WEBHOOK_URL` ustawione — inaczej ścieżka alertów nie zostanie
      przetestowana.
- [ ] Test na **Preview**, nie na produkcji.
- [ ] Zaplanowane, co zrobić z biletem (polecieć / odsprzedać / spisać na straty).

## 6. Po teście — co zebrać

1. `sessionId`, `prebookId`, `bookingId`, PNR.
2. Pełny adres powrotu (z `payment_intent` i `redirect_status`).
3. Rekord sesji z Redisa — w szczególności `paymentEvidence`, `paymentStatus`,
   `providerItinerary`, `confirmationEmail`.
4. Zrzut maila.
5. Logi runtime Vercela z okna testu.
6. Zapis odpowiedzi `POST /flights/bookings` do
   `docs/liteapi-flights-sample-booking.json` (bez danych wrażliwych) —
   to domknie punkt 26.4 specyfikacji (kontrakt `servicesAttachable`).
