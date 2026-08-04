export interface DealRoute {
  origin: string;
  destinationIata: string;
  destinationId: string;
  /**
   * Charakter kierunku. Steruje kwotą w `pickFreshDeals`, a nie samym doborem
   * cen: bez niego sortowanie po cenie wypycha na wierzch wyłącznie krótkie
   * trasy miejskie (zmierzone na żywej sekcji: Sztokholm 164, Bruksela 204,
   * Oslo 220 zł), a kierunki wypoczynkowe — te, po które ludzie przychodzą na
   * stronę biura podróży — nie mieszczą się nigdy, bo zaczynają się od 466 zł.
   */
  kind: "leisure" | "city";
}

/**
 * Pula tras. Większa od jednego przebiegu, żeby co dwie godziny badać inne
 * trasy, a po pełnym obrocie wrócić do początku bez losowania i bez luk.
 *
 * SKŁAD PULI WYNIKA Z POMIARU, nie z listy ładnych kierunków. Właściciel
 * postawił warunek: „oferty od 200 do 800, 900 zł maksymalnie". Pierwsza
 * wersja puli (basen Morza Śródziemnego + Wyspy Kanaryjskie) dawała
 * 989–2828 zł i nie miała jak tego warunku spełnić — nie z powodu kodu,
 * tylko dlatego, że tam po prostu nie ma takich cen u tego dostawcy.
 *
 * Sonda po 30 kierunkach pokazała, gdzie one są: krótkie trasy miejskie na
 * północ i zachód. Stąd przebudowa — najpierw one, kierunki plażowe jako
 * tło. Sufit ceny (`DEAL_MAX_PRICE_PLN`) pilnuje reszty.
 *
 * Rozmiar 48 nie jest ozdobny: musi dzielić się bez reszty przez
 * `DEAL_ROUTES_PER_RUN`, bo z tego wynika czas pełnego obrotu, a z niego
 * próg świeżości kart (test pilnuje tej własności).
 */
export const DEAL_ROUTES: readonly DealRoute[] = [
  // ── KIERUNKI WYPOCZYNKOWE — trzon sekcji ────────────────────────────────
  //
  // Kolejność i skład z sondy 2026-08-04 (20 kierunków × 3 okna, WAW, 1 dorosły,
  // w obie strony). Ceny minimalne, zmierzone: Ateny 466, Katania 506,
  // Malaga 555, Split 575, Dubrownik 600, Larnaka 664, Korfu 689,
  // Heraklion 757, Rodos 757, Walencja 778, Faro 867, Antalya 883, Palma 884.
  // TRZYNAŚCIE z dwudziestu zeszło pod 900 zł.
  //
  // To ODWRACA wniosek z 2026-08-02, kiedy te same trasy kosztowały 989–2828 zł
  // i pula musiała opierać się na miastach. Ceny biletów po prostu spadły.
  // Wniosek na przyszłość: skład puli wynika z POMIARU, a stary pomiar traci
  // ważność — zanim ktoś znów przepisze tę listę, niech puści sondę
  // (`tmp/sonda-plaze.ts`), a nie zaufa temu komentarzowi.
  { origin: "WAW", destinationIata: "ATH", destinationId: "athens-greece", kind: "leisure" },
  { origin: "WAW", destinationIata: "CTA", destinationId: "catania-italy", kind: "leisure" },
  { origin: "WAW", destinationIata: "AGP", destinationId: "malaga-spain", kind: "leisure" },
  { origin: "WAW", destinationIata: "SPU", destinationId: "split-croatia", kind: "leisure" },
  { origin: "WAW", destinationIata: "DBV", destinationId: "dubrovnik-croatia", kind: "leisure" },
  { origin: "WAW", destinationIata: "LCA", destinationId: "larnaca-cyprus", kind: "leisure" },
  { origin: "WAW", destinationIata: "CFU", destinationId: "corfu-greece", kind: "leisure" },
  { origin: "WAW", destinationIata: "HER", destinationId: "heraklion-greece", kind: "leisure" },
  { origin: "WAW", destinationIata: "RHO", destinationId: "rhodes-greece", kind: "leisure" },
  { origin: "WAW", destinationIata: "VLC", destinationId: "valencia-spain", kind: "leisure" },
  { origin: "WAW", destinationIata: "FAO", destinationId: "faro-portugal", kind: "leisure" },
  { origin: "WAW", destinationIata: "AYT", destinationId: "antalya-turkey", kind: "leisure" },
  { origin: "WAW", destinationIata: "PMI", destinationId: "palma-spain", kind: "leisure" },
  // Powyżej progu w tej sondzie (980–1374 zł), ale zostają: ceny się ruszają,
  // a sufit `DEAL_MAX_PRICE_PLN` i tak przepuści je dopiero, gdy realnie zejdą.
  { origin: "WAW", destinationIata: "BCN", destinationId: "barcelona-spain", kind: "leisure" },
  { origin: "WAW", destinationIata: "NAP", destinationId: "naples-italy", kind: "leisure" },
  { origin: "WAW", destinationIata: "MLA", destinationId: "valletta-malta", kind: "leisure" },
  { origin: "WAW", destinationIata: "LIS", destinationId: "lisbon-portugal", kind: "leisure" },
  { origin: "WAW", destinationIata: "SKG", destinationId: "thessaloniki-greece", kind: "leisure" },
  { origin: "WAW", destinationIata: "ALC", destinationId: "alicante-spain", kind: "leisure" },
  // ── KRÓTKIE TRASY MIEJSKIE ──────────────────────────────────────────────
  // Najtańsza część oferty (zmierzone na żywej sekcji: Sztokholm 164,
  // Bruksela 204, Oslo 220, Budapeszt 222, Sofia 232, Londyn 306 zł). Zostają,
  // bo to realnie najlepsze ceny — ale kwota w `pickFreshDeals` pilnuje, żeby
  // nie zajęły wszystkich kafli, bo wtedy sekcja przestaje wyglądać jak oferta
  // biura podróży.
  { origin: "WAW", destinationIata: "STO", destinationId: "stockholm-sweden", kind: "city" },
  { origin: "WAW", destinationIata: "BRU", destinationId: "brussels-belgium", kind: "city" },
  { origin: "WAW", destinationIata: "OSL", destinationId: "oslo-norway", kind: "city" },
  { origin: "WAW", destinationIata: "BUD", destinationId: "budapest-hungary", kind: "city" },
  { origin: "WAW", destinationIata: "SOF", destinationId: "sofia-bulgaria", kind: "city" },
  { origin: "WAW", destinationIata: "LON", destinationId: "london-united-kingdom", kind: "city" },
  { origin: "WAW", destinationIata: "PRG", destinationId: "prague-czechia", kind: "city" },
  { origin: "WAW", destinationIata: "OTP", destinationId: "bucharest-romania", kind: "city" },
  { origin: "WAW", destinationIata: "CPH", destinationId: "copenhagen-denmark", kind: "city" },
  { origin: "WAW", destinationIata: "ZAG", destinationId: "zagreb-croatia", kind: "city" },
  { origin: "WAW", destinationIata: "LJU", destinationId: "ljubljana-slovenia", kind: "city" },
  { origin: "WAW", destinationIata: "TLL", destinationId: "tallinn-estonia", kind: "city" },
  { origin: "WAW", destinationIata: "RIX", destinationId: "riga-latvia", kind: "city" },
  { origin: "WAW", destinationIata: "VNO", destinationId: "vilnius-lithuania", kind: "city" },
  { origin: "WAW", destinationIata: "BER", destinationId: "berlin-germany", kind: "city" },
  { origin: "WAW", destinationIata: "VIE", destinationId: "vienna-austria", kind: "city" },
  // ── WYLOTY SPOZA WARSZAWY ───────────────────────────────────────────────
  // Nie każdy mieszka na Mazowszu, a karta mówi wprost, skąd leci samolot.
  { origin: "KRK", destinationIata: "ATH", destinationId: "athens-greece", kind: "leisure" },
  { origin: "KRK", destinationIata: "CTA", destinationId: "catania-italy", kind: "leisure" },
  { origin: "KRK", destinationIata: "SPU", destinationId: "split-croatia", kind: "leisure" },
  { origin: "KRK", destinationIata: "BCN", destinationId: "barcelona-spain", kind: "leisure" },
  { origin: "KRK", destinationIata: "AYT", destinationId: "antalya-turkey", kind: "leisure" },
  { origin: "KRK", destinationIata: "VIE", destinationId: "vienna-austria", kind: "city" },
  { origin: "KRK", destinationIata: "LON", destinationId: "london-united-kingdom", kind: "city" },
  { origin: "KRK", destinationIata: "BUD", destinationId: "budapest-hungary", kind: "city" },
  { origin: "GDN", destinationIata: "SPU", destinationId: "split-croatia", kind: "leisure" },
  { origin: "GDN", destinationIata: "ATH", destinationId: "athens-greece", kind: "leisure" },
  { origin: "GDN", destinationIata: "CPH", destinationId: "copenhagen-denmark", kind: "city" },
  { origin: "GDN", destinationIata: "OSL", destinationId: "oslo-norway", kind: "city" },
  { origin: "WRO", destinationIata: "VIE", destinationId: "vienna-austria", kind: "city" },
];

/** Kierunki wypoczynkowe po kodzie IATA — wejście dla kwoty w `pickFreshDeals`. */
export const LEISURE_DESTINATIONS: ReadonlySet<string> = new Set(
  DEAL_ROUTES.filter((r) => r.kind === "leisure").map((r) => r.destinationIata),
);

/**
 * Ile tras bada jeden przebieg. Szesnaście z czterdziestu ośmiu = pełny obrót
 * puli w trzy przebiegi, czyli SZEŚĆ GODZIN.
 *
 * Pula urosła z 36 do 48 (więcej kierunków wypoczynkowych — prośba właściciela),
 * więc liczba tras na przebieg musiała urosnąć razem z nią, inaczej pełny obrót
 * wydłużyłby się do ośmiu godzin i trzeba by było poluzować `DEAL_FRESH_MS`.
 * Zmierzony przebieg 12 tras zajmował ~110 s przy budżecie 185 s, więc 16 tras
 * (~147 s) mieści się z zapasem — ale to jest właśnie ta liczba, którą trzeba
 * sprawdzić w logach po zmianie puli, a nie założyć.
 *
 * To nie jest dobór „na oko": karta z ceną lotu jest ważna tak długo, jak
 * długo ta cena jeszcze istnieje, a bilety zmieniają się szybciej niż stawki
 * hotelowe. Im krótszy pełny obrót, tym świeższa najstarsza pokazywana okazja
 * (patrz `DEAL_FRESH_MS`).
 *
 * Zmierzony koszt: 12 tras × 6 terminów = 72 wyszukania na przebieg, ~2,2 s
 * na wyszukanie przy współbieżności 6, czyli ok. 155 s wobec budżetu 250 s.
 * Dwanaście przebiegów na dobę daje 864 wyszukania — mniej niż połowa tego,
 * co robi istniejący prewarming lotów (~1900/dobę).
 */
export const DEAL_ROUTES_PER_RUN = 16;
/**
 * Terminy próbek, liczone w dniach od dziś.
 *
 * Reszty z dzielenia przez 7 to KOMPLET 0–5, więc wewnątrz jednego przebiegu
 * każda próbka wypada w INNYM dniu tygodnia — niezależnie od tego, w jaki
 * dzień akurat wystartował cron. To jest cały sens tej listy: bilety są
 * najdroższe w piątek i niedzielę, a najtańsze w środku tygodnia, więc sześć
 * próbek z tego samego dnia tygodnia dałoby medianę „typowej ceny piątkowej"
 * podpisaną jako typowa cena trasy.
 *
 * Pierwsza wersja miała [18, 25, 33, 46, 60, 81] i wyglądała poprawnie, bo
 * żadna z tych liczb nie jest wielokrotnością siedmiu. Zmierzone: reszty to
 * 4, 4, 5, 4, 4, 4 — pięć z sześciu próbek lądowało w ten sam dzień tygodnia.
 * Warunek „nie wielokrotność 7" jest bezużyteczny; liczy się rozrzut RESZT.
 *
 * Rozpiętość (3 tygodnie → ~12 tygodni) jest dobrana pod deklarację z sekcji:
 * mediana ma opisywać najbliższe miesiące, a nie jeden weekend.
 */
export const DEAL_SAMPLE_LEAD_DAYS: readonly number[] = [21, 29, 37, 45, 60, 82];
export const DEAL_NIGHTS = 7;
// Jedna osoba daje cenę na osobę i ten sam wynik da się odtworzyć linkiem.
export const DEAL_ADULTS = 1;
/**
 * Ile razy dłużej od NAJSZYBSZEJ oferty tego samego wyszukania może trwać
 * podróż, żeby wciąż nadawała się na kartę „okazji".
 *
 * DLACZEGO TO ISTNIEJE. Pierwszy przebieg na realnych danych (2026-08-02)
 * wystawił dwie karty, które formalnie spełniały wszystkie progi cenowe:
 * Teneryfa za 1448 zł z przelotem 20 h 15 min i Hurghada za 1680 zł z 14 h
 * 35 min — jedna i druga przez Zurych. To nie są okazje, tylko najtańsze
 * bilety: sortowanie po samej cenie zawsze wypycha na wierzch trasy z
 * wielogodzinną przesiadką. Użytkownik, który kliknie „−21%" i zobaczy dobę
 * w podróży, nie uzna tego za oszczędność.
 *
 * Próg jest WZGLĘDNY, a nie sztywną liczbą godzin, bo 8 h to katastrofa na
 * trasie do Aten i normalna podróż na Wyspy Kanaryjskie. Punkt odniesienia
 * bierzemy z tego samego wyszukania, więc kalibruje się sam dla każdej trasy
 * i każdego terminu.
 *
 * Skutek uboczny jest pożądany: mediana liczy się z ofert po tym samym
 * filtrze, więc porównanie „ta cena vs typowa" dalej zestawia porównywalne
 * podróże, a nie okazyjny bilet z całonocną przesiadką wobec zwykłych lotów.
 */
export const DEAL_MAX_DURATION_RATIO = 1.5;
/**
 * Bezwzględny sufit czasu podróży (dłuższy z dwóch odcinków), w minutach.
 *
 * Sam próg względny nie wystarcza i widać to w danych: dla Pafos wszystkie
 * oferty w oknie 31.08 były długie, więc „półtora raza od najszybszej"
 * dopuszczało 20 h, a dla Lanzarote i Szarm el-Szejk 14 h. Kiedy CAŁY wynik
 * wyszukiwania jest zły, próg względny mierzy się do złego punktu odniesienia
 * i przepuszcza wszystko.
 *
 * Dwanaście godzin jest hojne dla TEJ puli: najdalszy kierunek to Dubaj
 * (zmierzone 6–9 h z jedną przesiadką), a Wyspy Kanaryjskie realnie 8–9 h.
 * Sufit odcina więc wyłącznie podróże z wielogodzinnym postojem, których
 * nikt nie kupuje dla oszczędności 300 zł. Jeżeli pula kiedyś sięgnie Azji
 * albo obu Ameryk, tę liczbę trzeba podnieść razem z nią.
 */
export const DEAL_MAX_DURATION_MINUTES = 720;
/**
 * SUFIT CENY karty, w złotych za osobę w obie strony.
 *
 * Wprost z wymagania właściciela: „zależy mi na ofertach od 200 do 800, 900 zł
 * maksymalnie". To jest twarda granica sekcji, a nie preferencja sortowania —
 * lot za 1 900 zł nie wejdzie tu nawet wtedy, gdy jest o połowę tańszy od
 * pozostałych terminów, bo adresat tej strony i tak go nie kupi.
 *
 * UCZCIWA UWAGA DO DOLNEJ GRANICY: 200–400 zł jest u tego dostawcy
 * NIEOSIĄGALNE. Zmierzone minimum globalne z 90 wycen to 627 zł (Oslo) —
 * LiteAPI Flights sprzedaje przez GDS, więc nie ma tu Ryanaira ani Wizza,
 * którzy takie ceny robią. Sufit da się obniżyć jedną liczbą; podłogi nie da
 * się wyczarować bez drugiego źródła ofert.
 */
export const DEAL_MAX_PRICE_PLN = 900;
export const DEAL_CONCURRENCY = 6;
/**
 * Budżet czasu przebiegu. 185 s, a nie 250 s — poprawka po review.
 *
 * Budżet jest sprawdzany PRZED startem zadania, a pojedyncze wyszukanie potrafi
 * trwać wielokrotnie dłużej niż średni pomiar: klient LiteAPI ma 30 s timeoutu
 * i do trzech prób z backoffem (`lib/liteapi/client.ts`), czyli w najgorszym
 * razie ok. 100 s. Zadanie wystartowane tuż przed 250. sekundą kończyłoby się
 * więc po ~350 s, a `maxDuration` to 300 s — funkcja zostaje ubita PRZED
 * zapisem i CAŁY przebieg przepada, razem z każdą zebraną ceną.
 *
 * 185 s + 100 s najgorszego ogona mieści się w limicie razem z zapisem do
 * Redisa. Zmierzony realny przebieg to ~110 s, więc niższy budżet nie kosztuje
 * w praktyce ani jednej trasy.
 */
export const DEAL_TIME_BUDGET_MS = 185_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export interface DealDateWindow {
  checkin: string;
  checkout: string;
  label: string;
}

/** Okna są liczone wyłącznie w UTC, więc zmiana czasu lokalnego nie przesuwa dat. */
export function computeDealDateWindows(
  now: Date = new Date(),
): DealDateWindow[] {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return DEAL_SAMPLE_LEAD_DAYS.map((lead) => {
    const checkin = addDays(base, lead);
    return {
      checkin: iso(checkin),
      checkout: iso(addDays(checkin, DEAL_NIGHTS)),
      label: `lead-${lead}`,
    };
  });
}
