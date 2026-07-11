# PROMPT: Warstwa "Pakiety Lot + Hotel" — helptravel.pl

> **Rola:** Jesteś senior fullstack architektem z 30-letnim doświadczeniem w OTA (dynamic packaging: lastminute.com, eDreams, Expedia). Budujesz warstwę pakietów Lot + Hotel dla helptravel.pl (Next.js App Router, Vercel Pro, LiteAPI/Nuitee, Stripe via LiteAPI Payment SDK, Upstash Redis, GA4 + Clarity). Kod produkcyjny, nie prototyp. Każda decyzja architektoniczna ma uzasadnienie biznesowe.

> **Zasada nadrzędna:** Pakiet to NIE jest nowy widget na stronie. To nowy produkt z własnym flow, własną orkiestracją płatności i własnym ryzykiem prawnym. Traktuj go jak osobny moduł domenowy, nie jak feature.

---

## 0. BRAMKA DECYZYJNA — STATUS PO ODPOWIEDZIACH LITEAPI

Utwórz `docs/PACKAGES_DECISIONS.md` z poniższymi rozstrzygnięciami (odpowiedzi z dokumentacji LiteAPI/Nuitee, 07.2026):

1. **[PRAWNE — PENDING, blokuje Fazę 2]** LiteAPI NIE rozstrzyga roli organizatora — dostarcza dwie niezależne usługi, model sprzedaży jest po naszej stronie. Wymagana konsultacja prawna (prawo turystyczne: impreza turystyczna vs powiązane usługi turystyczne; oba modele mają obowiązki — ułatwiający nabywanie PUT też podlega zabezpieczeniom/TFG). Do czasu rozstrzygnięcia: Faza 1 only.
2. **[PŁATNOŚĆ — ANSWERED]** Brak wspólnego PaymentIntent. Hotel prebook i flight prebook zwracają OSOBNE `transactionId`/`secretKey`. Dwie transakcje, dwa descriptory na wyciągu (NUITEE). Brak mechanizmu skoordynowanego auth-hold/2-phase commit. Jedna płatność wymagałaby własnego MoR + własnego Stripe (decyzja strategiczna sprzężona z pkt 1 — NIE implementuj w MVP).
3. **[TICKETING — ANSWERED]** Asynchroniczny możliwy zależnie od providera. Webhooki: `flight.book.pending.confirmation`, `flight.book.confirmed`, `flight.book.failed`, `flight.book.expired` + hotelowe `booking.prebook_error`, `booking.book_error`. Polling `GET /flights/bookings/{id}` jako fallback do statusu CONFIRMED.
4. **[ANCILLARIES — ANSWERED częściowo]** `POST /flights/prebooks/{prebookId}/services` — attach usług AKTUALIZUJE prebook i zwraca NOWY `transactionId`/`secretKey` zastępujący poprzedni. Konsekwencja krytyczna: payment element lotu montować dopiero PO finalnym wyborze bagaży. Dostępność ancillaries per LCC: TODO:VERIFY na sandboxie.
5. **[BLIK — ANSWERED: NIEMOŻLIWY]** Potwierdzone przez support Nuitee: BLIK nie jest dostępny w modelu Payment SDK (capture manual). Konsekwencje dla implementacji: (a) nigdzie w UI pakietowym nie pokazuj logo/wzmianki BLIK, (b) na kroku płatności komunikuj dostępne metody jawnie (karta, Apple Pay, Google Pay), (c) event GA4 `package_payment_method_shown` + pomiar dropu na kroku płatności — dane pod przyszłą decyzję o własnym MoR.
6. **[ANCILLARIES LCC — ANSWERED warunkowo]** Mechanizm jest generyczny: dostępność usług per oferta/provider sygnalizuje pole `servicesAttachable` w response prebooka. Docs NIE gwarantują bagaży/miejsc dla Wizzair/Ryanair. Implementacja: krok bagaży renderuje się DYNAMICZNIE z `servicesAttachable` — jeśli puste/ubogie, sekcja bagaży pokazuje tylko to, co jest w taryfie, z linkiem "Bagaż dokupisz na stronie przewoźnika po otrzymaniu potwierdzenia" (uczciwie, bez udawania). Faza 0: empiryczny test prebooków dla top tras WMI→BCN/FCO/ALC i spis realnych `servicesAttachable` per przewoźnik.
7. **[WALUTA — ANSWERED częściowo]** `POST /flights/rates` przyjmuje `currency: "PLN"` — wyświetleniowo PLN end-to-end jest OK. Settlement/FX i waluta obciążenia na wyciągu NIE są gwarantowane w docs (zależne od modelu płatności) — do potwierdzenia kontraktowo; do tego czasu w UI nie obiecuj "obciążenie w PLN", pisz "ceny w PLN".
8. **[KALENDARZ CEN LOTÓW — ANSWERED: BRAK ENDPOINTU]** Price Index API dotyczy tylko hoteli. Brak "cheapest dates"/"flight calendar" dla lotów. Elastyczne daty i ceny na landingach = batch `POST /flights/rates` przez cache warming (GitHub Actions), NIE on-demand: top 10 kierunków × 3 terminy (najbliższy weekend, +2 tyg., +4 tyg.), odświeżanie co 6–12h, wyniki w Redis. Zero live-batchowania przy request usera — rate limits i koszty.
9. **[DANE PASAŻERA — ANSWERED]** Flight prebook wymaga: `contact` (name/email/phone) + `passengers[]` z danymi osobowymi, `birthday` i `document` (dokument podróży). Formularz pakietowy MUSI zbierać nr dokumentu i datę urodzenia każdego pasażera. APIS dla niektórych tras możliwy — obsłuż błąd walidacyjny prebooka jako czytelny komunikat, nie crash. Diakrytyki: API NIE gwarantuje transliteracji — normalizacja po naszej stronie: pole nazwiska waliduj do A–Z, przy polskich znakach pokaż inline podpowiedź ("Michał → MICHAL — tak jak w polu 'nazwisko' w paszporcie/dowodzie") z auto-transliteracją do akceptacji jednym tapnięciem.

**Potwierdzony flow Flights API:** `POST /flights/rates` (search, może być SSE streaming) → `POST /flights/verify` (potwierdzenie ceny, może zwrócić `changes`, TTL ~5 min) → `POST /flights/prebooks` (hold taryfy u providera + utworzenie PaymentIntent, TTL ~15 min, zwraca `prebookId`, `transactionId`, `secretKey`, `servicesAttachable`) → opcjonalnie `/services` → `POST /flights/bookings` (idempotentny po `prebookId`) → `GET /flights/bookings/{id}`. TTL to guidance, nie SLA — traktuj expiration z response jako źródło prawdy, gdy dostępne.

---

## 1. KONTEKST BIZNESOWY (dlaczego to robimy)

- Obecnie hotele i loty to dwa rozłączne flow. Konkurencja (Booking × lastminute.com — patrz benchmark niżej) sprzedaje pakiety z ceną "od X zł za osobę", co jest psychologicznie tańsze i podnosi AOV.
- Marża: hotel 5% + lot 2% + ancillaries 5% w jednej transakcji. Pakiet = wyższy koszyk, jedna akwizycja.
- Ruch: 91% mobile z TikToka. Pakiet "Barcelona 3 noce + lot od 1899 zł/os." to natywny format contentu TikTok — jedna liczba, jeden kierunek, jedna grafika.
- Cel: pakiety mają być flagowym produktem strony, nie dodatkiem.

## 2. BENCHMARK (wzorzec UX do zaadaptowania, nie kopiowania 1:1)

Flow lastminute.com, który adaptujemy:
1. **Search:** origin (domyślnie Warszawa WAW/WMI) + destination + daty + pasażerowie/pokoje + klasa lotu.
2. **Krok 1 "Wybierz pobyt":** lista hoteli, każdy z ceną **pakietu za osobę** ("1 899 zł od os.") + adnotacja "W cenie loty tam i z powrotem z: Warszawa". Filtry: budżet/os., gwiazdki, posiłki, typ obiektu, "tylko loty bezpośrednie", elastyczne anulowanie.
3. **Krok 2 "Wybierz lot":** domyślnie przypisany najlepszy lot za +0 zł; alternatywy jako **delta cenowa** (+0 zł / +532 zł), nigdy jako cena absolutna. Taby: Najlepsze / Najtańsze / Najszybsze. Filtry: bagaż, przesiadki, pora dnia, lotnisko.
4. **Krok 3 "Dostosuj pakiet":** pokój/posiłki/polityka anulowania → dane pasażerów (zgodne z dokumentem!) → bagaż podręczny i rejestrowany per pasażer per odcinek → płatność.
5. **Stały prawy sidebar:** podsumowanie pakietu (hotel, lot, daty, cena całkowita, "płatne teraz" vs "podatki/opłaty w hotelu") + **timer ważności oferty** (rzeczywisty TTL oferty lotniczej, NIE fake urgency — patrz §9).

Kluczowe wzorce cenowe do przejęcia:
- Cena **za osobę** na listingu, cena **całkowita** w koszyku — zawsze obie widoczne od kroku 3.
- Delty zamiast cen absolutnych przy zamianie lotu/pokoju.
- Jawne rozbicie: "Płatne teraz" / "Podatki i opłaty do uregulowania w hotelu: X zł".

## 3. ARCHITEKTURA

### 3.1 Moduł domenowy
```
src/modules/packages/
  api/            # route handlers (app/api/packages/*)
  services/
    packageSearch.ts        # orkiestracja: hotele × loty → oferty pakietowe
    packagePricing.ts       # kalkulacja ceny/os., delty, marże, zaokrąglenia
    packageOrchestrator.ts  # saga rezerwacji (patrz 3.4)
    flightsClient.ts        # wrapper na LiteAPI Flights (server-only, private key)
  state/          # stan wieloetapowego flow (patrz 3.3)
  components/     # UI kroków 1-4 + sidebar
  types.ts        # PackageOffer, PackageQuote, PackageBooking, sagi
```

### 3.2 Strategia wyszukiwania (hotel-first, jak benchmark)
1. Request: `POST /api/packages/search` `{origin, destinationId, dateFrom, dateTo, occupancies, cabinClass}`.
2. Serwer równolegle: (a) hotele z rate'ami przez istniejący hotel-search (reuse cache Upstash — 54 miasta już warmowane), (b) **jeden** search lotów dla pary tras/dat → wybór `bestFlight` (algorytm: bezpośredni > cena > czas > godziny cywilizowane 7:00–21:00).
3. `PackageOffer = hotelRate + bestFlight`; `pricePerPerson = ceil(total / adults)`. Cache lotu w Redis z TTL = min(offer TTL z API, 15 min), klucz `flt:{origin}:{dest}:{dates}:{pax}:{cabin}`.
4. Krok 2 (zamiana lotu) robi pełny flight-search dopiero na żądanie — nie przy wejściu na listing. To ratuje rate limits i CPU (już raz przez to zeszliśmy z Hobby na Pro).
5. **Nie licz pakietu per hotel osobnym searchem lotów.** Jeden lot bazowy dla całego listingu, delty liczone client-side od bazowego.

### 3.3 Stan flow (krytyczne — 4 kroki, mobile, TikTok-traffic z kiepską siecią)
- Stan pakietu żyje **server-side** w Redis: `pkg-session:{uuid}`, TTL 30 min, odnawiany aktywnością. Client trzyma tylko `sessionId` (cookie httpOnly + URL param jako fallback).
- Każdy krok waliduje sesję i re-weryfikuje ceny przy wejściu. Zmiana ceny → jawny banner "Cena uległa zmianie z X na Y" (wzorzec z prebooka hotelowego), nigdy cicha podmiana.
- Timer w sidebarze = rzeczywisty TTL sesji/oferty. Po wygaśnięciu → modal z jednym przyciskiem "Odśwież ceny", zachowaj wszystkie dane pasażerów (nic nie każ wpisywać drugi raz — to mordercy konwersji).

### 3.4 Orkiestracja rezerwacji — SAGA (serce projektu, flow POTWIERDZONY)

Zasada nadrzędna: **pieniądze za lot ruszają dopiero, gdy hotel jest potwierdzony.** Lot ma hold taryfy (prebook ~15 min) bez płatności — wykorzystujemy to okno.

```
Sekwencja (DWA odrębne checkouty w UI — patrz krok 4):

 1. POST /flights/verify                      → cena aktualna? (changes → pokaż i potwierdź)
 2. POST /flights/prebooks                    → HOLD taryfy + PI-lot (transactionId B, secretKey B)
 3. [bagaże wybrane wcześniej] POST /flights/prebooks/{id}/services
                                              → NOWY transactionId B'/secretKey B' (B jest martwy!)
 4. POST /rates/prebook (hotel)               → PI-hotel (transactionId A, secretKey A)
 5. CHECKOUT 1: confirm płatności A           → sukces
 6. POST /rates/book (hotel)                  → HOTEL_BOOKED_AWAITING_FLIGHT (start deadline!)
 7. CHECKOUT 2: confirm płatności B'          → sukces
 8. POST /flights/bookings (idempotent po prebookId) → FLIGHT_BOOKED
 9. Webhook flight.book.confirmed / polling GET /flights/bookings/{id} → CONFIRMED

Stany sagi: DRAFT → FLIGHT_HELD → HOTEL_PREBOOKED → HOTEL_PAID
            → HOTEL_BOOKED_AWAITING_FLIGHT → FLIGHT_PAID → FLIGHT_BOOKED → CONFIRMED

Kompensacje:
- fail w 5 (płatność hotelu)   → nic nie zaksięgowane, hold lotu wygaśnie sam. Zero zwrotów.
- fail w 6 (book hotelu; webhook booking.book_error) → refund płatności A, koniec. Lot nieopłacony.
- PORZUCENIE po 6 (user nie przechodzi Checkout 2) → deadline min(TTL prebooka, 25 min);
  e-mail wznawiający natychmiast po 6; po deadline: cron/QStash → cancel hotelu (darmowa
  anulacja) + refund A + e-mail o zwrocie + GA4 package_abandoned_between_checkouts.
- fail w 7 (płatność lotu odrzucona) → user może ponowić w oknie deadline; po deadline jak wyżej.
- fail w 8 (book lotu po płatności; per docs: retry idempotentny → permanent fail: refund B',
  cancel hotelu + refund A, reconciliacja webhookami Stripe) → NEEDS_MANUAL_ACTION
  + alert (email/Telegram) do admina; klient widzi "Finalizujemy rezerwację, e-mail w 30 min",
  NIGDY error 500.
- flight.book.expired / timeout ticketingu → jak fail w 8.
```

- **Warunek dopuszczenia do pakietu w MVP: wyłącznie hotelowe rate'y z darmową anulacją** (bufor ≥24h od momentu rezerwacji) — to jest bezpiecznik całej kompensacji. Rate bezzwrotny → hotel nie pojawia się w listingu pakietów (filtr na etapie packageSearch).
- Stan sagi w **Postgres (Prisma)**, nie in-memory i nie tylko Redis. `PackageBooking`: `sagaState`, `flightPrebookId`, `hotelBookingId`, `flightBookingId`, `txnHotel`, `txnFlight` (z historią podmian po attach services!), `failureReason`, `compensationLog` (jsonb), timestamps per przejście stanu. **Sprawdź na starcie, że `DATABASE_URL` jest ustawiony w produkcji Vercel — znany, niedomknięty risk; jeśli brak, przerwij i zgłoś.**
- **Payment element lotu montuj wyłącznie z aktualnym secretKey B'** — po każdym attach services stary intent jest nieważny. Zmiana bagażu po zamontowaniu elementu → obowiązkowy remount z nowym kluczem.
- Idempotency: book lotu jest idempotentny po `prebookId` (potwierdzone w docs) — retry z backoffem na błędach sieciowych bezpieczny; hotel book — idempotency key własny (`sessionId+step`), nigdy retry na 4xx.
- Webhook endpoint `/api/webhooks/liteapi/flights` (+ hotelowy) z weryfikacją podpisu; polling `GET /flights/bookings/{id}` co 60 s max 30 min jako fallback; oba źródła piszą do sagi przez jeden serializowany handler (unikaj race webhook vs polling — optimistic lock na `sagaState`).
- TTL-y: verify ~5 min, prebook ~15 min (guidance, nie SLA). Krok 4–8 musi wykonać się w oknie holdu — jeśli klient siedzi na checkoucie >10 min od prebooku, odśwież verify+prebook PRZED confirm płatności, nie po.
- **Payment SDK race condition na `#payment-element` (znany bug z hotelowego flow) — w pakietowym checkoucie montuj SDK dopiero po potwierdzonym mount DOM (ref callback + retry), nie w useEffect z pustym depsem.**

### 3.5 Dane pasażerów (wymogi potwierdzone w docs)
- Prebook wymaga per pasażer: dane osobowe, `birthday`, `document` (dokument podróży) — formularz zbiera imię, nazwisko, datę urodzenia, typ+numer dokumentu, płeć/tytuł. Kontakt (`contact`: name/email/phone) raz dla rezerwacji, prefiks +48 domyślnie.
- Diakrytyki: API nie transliteruje — normalizacja po naszej stronie. Pole nazwiska: walidacja A–Z; przy polskich znakach inline podpowiedź z auto-transliteracją ("Michał → MICHAL") do akceptacji jednym tapnięciem. Komunikat nad formularzem: "Dane muszą być identyczne jak w dowodzie/paszporcie".
- APIS/dodatkowe wymogi tras: błąd walidacyjny prebooka mapuj na czytelny komunikat przy właściwym polu, nie generyczny toast.

## 4. UI/UX — 4 KROKI

Breadcrumb stały: **Wybierz pobyt → Wybierz lot → Dostosuj pakiet → Płatność**. Mobile-first (91% ruchu!): sidebar jako sticky bottom-sheet z ceną i CTA, rozwijany tapnięciem.

**Krok 1 — listing hoteli z ceną pakietową:**
- Karta: zdjęcie, nazwa (przez istniejący translation layer!), ocena, dystans od centrum z labelką ("0,4 km od centrum"), "3-noc pobytu", badge "✈ W cenie loty w obie strony z Warszawy", cena `od X zł /os.` + drobne "+ Y zł podatków/opłat płatnych w hotelu".
- Filtry (reuse istniejących hotelowych + nowe): budżet/os. (slider z histogramem), tylko loty bezpośrednie, elastyczne anulowanie, posiłki, gwiazdki.
- Sortowanie: Polecane (default) / Cena / Ocena.

**Krok 2 — wybór lotu:**
- Nagłówek przypomina wybrany hotel + cenę pakietu.
- Domyślny lot oznaczony "+0 zł od os."; alternatywy z deltami. Taby Najlepsze/Najtańsze/Najszybsze z deltą w tabie.
- Rząd ikon bagażu przy każdej ofercie (co w cenie: mała torba ✓, kabinowy ✗, rejestrowany ✗) — to była jedna z głównych przyczyn nieufności w hotelowym flow (surowe dane), tu ma być czytelnie od razu.
- Filtry: bezpośrednie, lotnisko (WAW vs WMI z cenami "od"), pora dnia, bagaż wliczony.

**Krok 3 — dostosowanie:**
- Pokój (reuse room-grouping z hotelowego flow: jedna karta per typ pokoju), posiłki, polityka anulowania z deltami.
- Bagaż per pasażer per kierunek: renderowany DYNAMICZNIE z `servicesAttachable` prebooka (nie hardkoduj listy!). Jeśli dostępne — karty radio jak w benchmarku (mała torba 0 zł / kabinowy+priority +X zł; rejestrowany: 10/20/26 kg z cenami). Jeśli `servicesAttachable` puste dla danego przewoźnika (możliwe dla LCC) — pokaż co jest w taryfie + uczciwy komunikat "Dodatkowy bagaż dokupisz bezpośrednio u przewoźnika po otrzymaniu potwierdzenia". Ancillaries = 5% marży — UI zachęca, ale bez dark patterns: żadnego pre-selecta płatnych opcji. Każda zmiana bagażu po tym kroku = nowy transactionId/secretKey (patrz saga).
- Sekcja "Zasady rezygnacji" z **asymetrią wyjaśnioną wprost**: "Lot: bezzwrotny po zakupie. Hotel: darmowa anulacja do {data}." Ukrywanie tego = chargebacki.

**Krok 4 — DWA ODRĘBNE CHECKOUTY (decyzja produktowa, wzorzec Booking/lastminute):**

Płatność za pakiet to dwie świadomie oddzielne transakcje, prezentowane jako "Checkout 1/2: Hotel" i "Checkout 2/2: Lot". NIE jeden przycisk "Zapłać total". Uzasadnienie: zgodność z rzeczywistością płatniczą (dwa PaymentIntenty), lżejsza pozycja prawna (odrębne transakcje z odrębnymi potwierdzeniami), user nigdy nie płaci za lot przed potwierdzeniem hotelu.

- **Checkout 1 — Hotel:** podsumowanie hotelu (pokój, daty, polityka anulacji), kwota X zł, payment element (secretKey A), przycisk "Zapłać za hotel X zł". Po sukcesie + book: ekran przejściowy "Hotel potwierdzony ✓ — teraz lot" z automatycznym przejściem (2 s) do Checkout 2. Nad przyciskiem: "To pierwsza z dwóch płatności. Za chwilę osobno opłacisz lot (Y zł)."
- **Checkout 2 — Lot:** podsumowanie lotu + bagaży, kwota Y zł, payment element (AKTUALNY secretKey B' — po attach services), przycisk "Zapłać za lot Y zł". Progress bar u góry obu checkoutów: "Hotel ✓ → Lot".
- Dane karty: jeśli Payment SDK pozwala na reuse metody między intentami — użyj; jeśli nie — user wpisuje kartę drugi raz, ale WSZYSTKIE pozostałe dane (pasażerowie, kontakt) przenoszą się automatycznie. Zweryfikuj możliwość reuse na sandboxie w Fazie 0 (`TODO:VERIFY`).
- Descriptor: przy obu checkoutach "Na wyciągu zobaczysz NUITEE TRAVEL — operatora płatności helptravel.pl."
- Metody płatności: karta / Apple Pay / Google Pay — jawnie pokazane już na kroku 3 w sidebarze, żeby user oczekujący BLIK-a nie odpadał z wpisanymi danymi pasażerów. BLIK potwierdzone jako niedostępne — zero wzmianek w UI.

**Porzucenie między checkoutami (krytyczny scenariusz — patrz też saga):** user opłacił hotel, nie opłacił lotu.
- Stan sagi: `HOTEL_BOOKED_AWAITING_FLIGHT` z deadline = min(TTL flight prebooka, 25 min).
- Natychmiast po Checkout 1: e-mail "Hotel potwierdzony — dokończ rezerwację lotu" z linkiem wznawiającym sesję (link żyje do deadline).
- Po deadline: automatyczna anulacja hotelu (darmowa anulacja — warunek pakietowy) + refund A + e-mail "Rezerwacja anulowana, pełny zwrot w drodze" + event GA4 `package_abandoned_between_checkouts`. Cron/QStash job, nie poleganie na tym, że user wróci.
- Wznowienie w oknie: flight prebook mógł wygasnąć → cichy re-verify + re-prebook z tą samą taryfą; jeśli cena wzrosła → jawny banner z deltą i wyborem "Akceptuję / Anuluj wszystko (pełny zwrot za hotel)".

**Confirmation:** jedna strona, dwa numery rezerwacji (hotel + PNR lotu) wyraźnie oddzielone, e-mail z oboma potwierdzeniami. Jeśli ticketing async — stan "Wystawiamy bilety, e-mail w ciągu 30 min" z realnym statusem na `/booking/{id}`.

## 5. HOMEPAGE — REPOZYCJONOWANIE POD PAKIETY

Cel: pakiety mają być pierwszą rzeczą, którą widzi user. Zmiany w `app/page.tsx` + hero:

1. **Search box:** trzeci tab **"✈+🏨 Lot + Hotel"** jako **domyślnie aktywny** (przed "Hotele" i "Loty"). Pola: Skąd (default Warszawa — wszystkie lotniska), Dokąd, Termin, Goście.
2. **Hero copy:** H1 zmień na wariant pakietowy, np. "Lot i hotel w jednej cenie. Od {dynamiczna_najniższa_cena} zł za osobę." Podtytuł zachowuje obecne trust-elementy (Ceny w PLN, płatność jak w sklepie). Cena w H1 z cache (najtańszy aktualny pakiet), fallback na statyczną, jeśli cache pusty.
3. **Sekcja "Pakiety Lot + Hotel" nad foldem po scrollu:** grid 6 kart kierunków (Barcelona, Rzym, Paryż, Lizbona, Malaga, Ateny) z realnymi cenami "od X zł/os." z cache warmowanego GitHub Actions (rozszerz istniejący warming o pakiety dla top 10 kierunków × najbliższy weekend + weekend za 2 tyg.). Karta = zdjęcie, kierunek, "3 noce • lot wliczony • od X zł/os.".
4. **Chipy pomysłów** ("Plaża", "City break"...) mają linkować do pakietowych landingów, nie hotelowych.
5. **Nawigacja:** pozycja "Pakiety" w menu głównym.
6. Sekcja "Jak to działa" — dodaj wariant 3-krokowy dla pakietu (Wybierz kierunek → Dopasuj lot i hotel → Zapłać raz w PLN).

## 6. SEO / LANDING PAGES (pozycjonowanie warstwy)

- Statycznie generowane (ISR, revalidate 6h) landingi: `/pakiety/{miasto}` (np. `/pakiety/barcelona`) dla top 20 kierunków z cache'u.
- **Ceny na landingach:** brak endpointu kalendarza cen lotów (potwierdzone w docs — Price Index jest tylko hotelowy) — ceny "od" pochodzą WYŁĄCZNIE z cache warmowanego GitHub Actions: top kierunki × 3 terminy (najbliższy weekend, +2 tyg., +4 tyg.), `POST /flights/rates` z `currency: "PLN"`, odświeżanie co 6–12h. Landing nigdy nie odpala live flight-search. Data ważności ceny drobnym drukiem ("cena znaleziona {data}") — wzorzec benchmarku, uczciwy i zdejmuje reklamacje. Zawartość: H1 "Lot + hotel Barcelona od X zł", 6–9 kart hoteli z cenami pakietowymi, FAQ (schema.org FAQPage), treść 300+ słów unikalna per miasto (wygeneruj sensowną, konkretną — bez lania wody), linkowanie wewnętrzne między kierunkami.
- Schema.org: `Trip`/`Offer` z `priceCurrency: PLN`, `lowPrice` — plus `BreadcrumbList`.
- Metadane PL: title "Lot + Hotel {Miasto} od {cena} zł | helptravel.pl", opis z realnymi datami.
- Sitemap: dodaj landingi, priorytet 0.8.
- Canonical i brak indeksowania stron krokowych flow (kroki 1–4 = `noindex`).

## 7. ANALITYKA

Eventy GA4 (spójne z istniejącą konwencją): `package_search`, `package_listing_view`, `package_hotel_select`, `package_flight_view`, `package_flight_change`, `package_customize_view`, `package_baggage_add` (z wartością), `package_passenger_form_start/complete`, `package_payment_start`, `package_purchase` (z rozbiciem hotel/lot/ancillaries w items), `package_saga_failed` (z sagaState). Funnel eksploracyjny w GA4 skonfiguruj po wdrożeniu. Clarity: tagi na kroki flow.

## 8. WYDAJNOŚĆ I KOSZTY

- Flight search jest drogi: debounce, cache agresywnie (klucz jak w 3.2), nigdy nie odpalaj search przy każdym filtrze client-side — filtruj po pobranym zbiorze.
- Listing: paginacja/infinite scroll po 20, obrazy `next/image` z sizes pod mobile.
- Route handlers pakietowe z `maxDuration` świadomie ustawionym; ciężka orkiestracja sagi NIE w request/response — book zwraca `202 + bookingId`, klient polluje `/api/packages/booking/{id}/status` (SSE jeśli proste do dodania).

## 9. ZASADY UCZCIWOŚCI (nienegocjowalne — spójne z audytem trust)

- Timer = wyłącznie realny TTL oferty/sesji. Zero fake countdownów.
- "Flash sale" / "Został 1 pokój" tylko jeśli dane z API to potwierdzają (pole availability), inaczej nie renderuj.
- Żadnego pre-selecta płatnych dodatków, żadnych ukrytych opłat — wszystkie składniki ceny widoczne przed płatnością.
- Asymetria anulacji lot/hotel komunikowana wprost (patrz krok 3).
- Wszystkie treści po polsku przez istniejący translation layer; nazwy hoteli NIE tłumaczone maszynowo (lekcja "Siedemdziesiąt Barcelona").

## 10. PLAN FAZOWY

**Faza 0 (przed kodem):** utwórz `docs/PACKAGES_DECISIONS.md` z treścią z §0 (statusy: 1 PENDING-LEGAL, 2–4 ANSWERED, 5 PENDING); sprawdź `DATABASE_URL` na prod; zweryfikuj rzeczywiste kontrakty response/request endpointów `/flights/rates`, `/flights/verify`, `/flights/prebooks`, `/flights/prebooks/{id}/services`, `/flights/bookings` na sandboxie (w tym: dostępność ancillaries dla Wizzair/Ryanair, format expiration, pola changes z verify, schema webhooków) — **nie zgaduj pól; czego nie potwierdzisz, oznacz `TODO:VERIFY` i zapytaj mnie**.

**Faza 1 (bez płatności, za flagą `NEXT_PUBLIC_FEATURE_PACKAGES`):** search + krok 1 + krok 2 + landingi SEO (noindex do czasu Fazy 3) + homepage tab (widoczny tylko z flagą) + cache warming. CTA na końcu kroku 2: rozdzielone linki "Zarezerwuj hotel" / "Zarezerwuj lot" (legalnie bezpieczne, mierzy intencję). Równolegle: pełna implementacja i testy sagi na SANDBOXIE (kod gotowy, wyłączony flagą) — architektura płatności jest już potwierdzona, nie ma na co czekać technicznie.

**Faza 2 (odblokowana WYŁĄCZNIE rozstrzygnięciem prawnym pkt 1):** włączenie sagi na produkcji, krok 3–4 z płatnością, webhooki prod, confirmation, e-maile.

**Faza 3 (launch):** flaga on dla 100%, homepage default na tab pakietowy, landingi index, warming top 20, kampania TikTok z cenami z cache.

**Testy:** unit dla packagePricing (zaokrąglenia, delty, dzielenie per osoba przy nieparzystych kwotach); integracyjne sagi na sandboxie z wymuszonymi failure'ami (price change po prebook, flight book fail po hotel book, ticketing timeout); e2e happy path Playwright mobile viewport 390px.

**Definition of done każdej fazy:** build przechodzi, brak regresji w istniejącym hotelowym i lotniczym flow (uruchom istniejące testy), eventy GA4 widoczne w DebugView, PR-opis z listą decyzji i TODO:VERIFY.

---

## INSTRUKCJA STARTOWA DLA CIEBIE (Claude Code)

1. Przeczytaj `HELPTRAVEL_MASTER_SPEC.md`, `PROMPT_LITEAPI_FLIGHTS.md` i strukturę istniejących modułów hotel/flights — **reuse, nie duplikuj** (translation layer, room grouping, cache, payment mount fix).
2. Wykonaj Fazę 0 w całości i pokaż mi `PACKAGES_DECISIONS.md` + listę `TODO:VERIFY` zanim ruszysz dalej.
3. Pracuj fazami, po każdej fazie: podsumowanie zmian, co wymaga mojej decyzji, co zweryfikować manualnie.
4. Commituj atomowo z prefiksem `packages:`.
