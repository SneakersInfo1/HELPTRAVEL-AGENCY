"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BedDouble, Building2, Globe, Palmtree, Plane, X } from "lucide-react";
import { createPortal } from "react-dom";

import { DateRangeField } from "@/components/search/date-range-field";
import { GuestsField } from "@/components/search/guests-field";
import { exactOriginMatch } from "@/components/search/origin-combobox";
import { AirportCombobox } from "@/components/flights/airport-combobox";
import { bestAirportOption, resolveOriginFromOption } from "@/lib/flights/airports";
import { useLanguage } from "@/components/site/language-provider";
import { track } from "@/lib/analytics/track";
import { zamknijKlawiature } from "@/lib/ui/keyboard";
import { useDismissOnOutside } from "@/lib/ui/use-dismiss-on-outside";
import { localizeCity, localizeCountry, localizeRegion } from "@/lib/mvp/i18n-geo";
import { sendClientEvent } from "@/lib/mvp/client-events";
import { readRecentDestinations, saveRecentDestination } from "@/lib/mvp/recent-destinations";
import { saveRecentSearch } from "@/lib/mvp/recent-searches";
import { foldText } from "@/lib/flights/airports";
import { POPULAR_GROUP_LABELS } from "@/lib/mvp/popular-destinations";
import type { DestinationSuggestion } from "@/lib/mvp/types";

/** Podpowiedź z flagą „ostatnio szukane" (sekcja nad popularnymi). */
type SuggestionItem = DestinationSuggestion & { _recent?: boolean };

/**
 * Dzieli podpowiedzi na sekcje, ZACHOWUJĄC płaski indeks każdej pozycji.
 *
 * Indeks jest tu istotny, a nie kosmetyczny: `destHighlight` i obsługa strzałek
 * operują na płaskiej tablicy `destSuggestions`. Gdyby sekcje renderowały się
 * z własną numeracją od zera, klawiatura podświetlałaby inny wiersz niż ten,
 * który Enter faktycznie wybiera.
 *
 * Wpisany tekst → wszystkie pozycje trafiają do sekcji bez nagłówka (płaska
 * lista wyników), więc grupowanie dotyczy wyłącznie trybu „puste pole".
 */
function buildSuggestionSections(
  items: SuggestionItem[],
): Array<{ label: string | null; rows: Array<{ item: SuggestionItem; index: number }> }> {
  type Row = { item: SuggestionItem; index: number };
  const recent: Row[] = [];
  const beach: Row[] = [];
  const city: Row[] = [];
  const flat: Row[] = [];
  // Hotele w OSOBNEJ sekcji (2026-08-02): „Chopin Boutique" i „Warszawa" to
  // dwie różne rzeczy — jedna otwiera obiekt, druga listę wyników. Wrzucone
  // w jeden ciąg wyglądają jak warianty tego samego, a klikając, użytkownik
  // dostaje dwa różne zachowania bez ostrzeżenia.
  const hotels: Row[] = [];

  items.forEach((item, index) => {
    const row = { item, index };
    if (item._recent) recent.push(row);
    else if (item.kind === "hotel") hotels.push(row);
    else if (item.group === "beach") beach.push(row);
    else if (item.group === "city") city.push(row);
    else flat.push(row);
  });

  const sections: Array<{ label: string | null; rows: Row[] }> = [];
  if (recent.length) sections.push({ label: "Ostatnio szukane", rows: recent });
  if (beach.length) sections.push({ label: POPULAR_GROUP_LABELS.beach, rows: beach });
  if (city.length) sections.push({ label: POPULAR_GROUP_LABELS.city, rows: city });
  // Kierunki PRZED hotelami: kto wpisuje „Barcelona", szuka miasta.
  if (flat.length) sections.push({ label: hotels.length ? "Kierunki" : null, rows: flat });
  if (hotels.length) sections.push({ label: "Hotele", rows: hotels });
  return sections;
}

/**
 * Ikona typu podpowiedzi — jak na Bookingu.
 *
 * To nie jest dekoracja: lista miesza teraz cztery różne rzeczy (miasto,
 * wyspa, kraj, konkretny obiekt), a każda z nich zachowuje się po kliknięciu
 * inaczej. Kształt ikony jest jedyną informacją o tym, co się stanie, którą
 * da się przeczytać jednym rzutem oka — nazwa „Malta" wygląda tak samo jako
 * wyspa i jako pensjonat.
 */
function suggestionIcon(item: SuggestionItem) {
  if (item.kind === "hotel") return BedDouble;
  if (item.kind === "region") return Palmtree;
  if (item.kind === "country") return Globe;
  // Miasto z lotniskiem dostaje samolot — to jest kierunek, do którego
  // formularz potrafi dobrać lot, i jedyny sygnał tej różnicy na liście.
  if (item.airportCode) return Plane;
  return Building2;
}

interface MiniPlannerFormProps {
  // Kompakt = true ukrywa opis ponizej (gdy form jest w cinematic hero).
  compact?: boolean;
  /** Tryb wyszukiwarki (Faza 2 toggle Hotele/Loty). Domyślnie "hotels" —
   *  bez zmian dla istniejących użyć (homepage hotelowy, pasek wyników).
   *  "flights": pokazuje "Skąd" (wymagane), niemowlęta, kieruje na /loty/wyniki. */
  mode?: "hotels" | "flights";
  /** Initial values when reusing the bar on results pages. Sesja C pkt 2.
      `travelers` is the TOTAL guest count from the `adults` URL param (sum of
      adults+children — product decision); `kids` is the informational
      breakdown from the new `kids` param so "Edytuj" can restore the
      Dorośli/Dzieci split. Old links without `kids` show everyone as adults. */
  initial?: Partial<{
    origin: string;
    destination: string;
    destinationCountry: string;
    /** Zadanie 2 — slug wyspy/regionu (parametr `region` na /hotele/szukaj). */
    regionId: string;
    startDate: string;
    endDate: string;
    travelers: number;
    kids: number;
    // Pasek edycji na /loty/wyniki (tryb lotów): wstępne wypełnienie „Skąd",
    // celu (IATA) i opcji, żeby użytkownik mógł zmienić kierunek bez wracania
    // na homepage.
    /** Kody IATA wylotu (1 lotnisko, kod metra, albo lista grupy). */
    originCodes: string[];
    /** Etykieta miasta wylotu do nagłówka (np. „Warszawa"). */
    originLabel: string;
    /** Widoczny tekst pola „Skąd" (np. „Warszawa (WAW)"). */
    originInput: string;
    /** IATA celu (do zapytania o loty). */
    destIata: string;
    /** Liczba niemowląt (tryb lotów). */
    infants: number;
    /** Lot w jedną stronę. */
    oneWay: boolean;
  }>;
}

/** Wynik rozstrzygnięcia pola "Dokąd" na submit (miasto, wyspa/region albo hotel). */
interface ResolvedDestination {
  kind: "city" | "region" | "hotel";
  city: string;
  country: string;
  regionId: string | null;
  /** Google Place ID — tylko dla `kind: "hotel"`, wejście do rozwiązania hotelId. */
  placeId?: string;
  /** Nazwa obiektu, o którą pytał użytkownik (bramka „czy to na pewno TEN hotel"). */
  hotelName?: string;
}

interface AnchoredDestinationPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

/**
 * PRZEDZIAŁ DESKTOPOWY, NIE MOBILNY — nazwa ma znaczenie.
 *
 * Ta stała nazywała się `MOBILE_DESTINATION_BREAKPOINT`, a jej zapytanie to
 * `(min-width: 640px)`, czyli `.matches === true` znaczy DESKTOP. Nazwa mówiła
 * dokładnie odwrotnie niż wartość i przewróciła KAŻDĄ gałąź, która z niej
 * korzystała: picker otwierał się na telefonie przy `pointerdown` (czyli przy
 * dotknięciu, zanim wiadomo, czy to tap czy przewinięcie), a na desktopie
 * przestał się otwierać z klawiatury.
 *
 * Poprawka z 9 sierpnia (b9a1727) opisywała w komentarzu właściwe zachowanie,
 * ale wstawiła warunek po złej stronie i na telefonie nie zmieniła NIC.
 * Dlatego nazwa jest teraz zgodna z treścią, a odczyt idzie przez `czyDesktop()`.
 */
const DESKTOP_DESTINATION_BREAKPOINT = "(min-width: 640px)";

/** `true` = desktop/tablet (≥640 px). Jedyne miejsce, gdzie czytamy ten próg. */
function czyDesktop(): boolean {
  return window.matchMedia(DESKTOP_DESTINATION_BREAKPOINT).matches;
}
const DESTINATION_LIST_HEIGHT = 384;
/**
 * Minimalna szerokość rozwiniętej listy podpowiedzi na desktopie.
 *
 * 360 px, bo najdłuższa realna pozycja słownika to „Warszawa — wszystkie
 * lotniska" z podpisem „Polska”: przy 15 px półgrubym to ~300 px samego
 * tekstu, plus 32 px ikony, 10 px odstępu i 2 × 14 px paddingu.
 * Poniżej tej wartości nazwy zaczynają się łamać — dokładnie tak, jak na
 * zrzucie od właściciela.
 */
const DESTINATION_LIST_MIN_WIDTH = 360;
const DESTINATION_SHEET_HISTORY_KEY = "__helptravelDestinationSheet";

function getDestinationListPosition(anchor: HTMLElement): AnchoredDestinationPosition {
  const rect = anchor.getBoundingClientRect();
  const gap = 6;
  const viewportPadding = 16;
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
  const spaceAbove = rect.top - gap - viewportPadding;
  const openAbove = spaceBelow < DESTINATION_LIST_HEIGHT && spaceAbove > spaceBelow;
  const available = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(DESTINATION_LIST_HEIGHT, Math.max(200, available));

  // SZEROKOŚĆ LISTY NIE JEST JUŻ SZEROKOŚCIĄ POLA.
  //
  // Zgłoszenie właściciela ze zrzutu: nazwy lotnisk łamały się po jednym-dwóch
  // słowach („Polska — dowolne lotnisko" w czterech wierszach). Przyczyna:
  // lista dziedziczyła `rect.width`, a kolumna „Skąd" ma ~172 px, z czego po
  // odjęciu ikony i paddingu na tekst zostawało ~100 px.
  //
  // Lista wychodzi teraz poza obrys pola do `DESTINATION_LIST_MIN_WIDTH`,
  // ale nie dalej niż pozwala okno — inaczej przy polu przy prawej krawędzi
  // wystawałaby poza ekran.
  const maxWidth = window.innerWidth - 2 * viewportPadding;
  const width = Math.min(Math.max(rect.width, DESTINATION_LIST_MIN_WIDTH), maxWidth);
  // Przy poszerzeniu w prawo lista mogłaby wyjść za krawędź — wtedy dosuwamy
  // ją w lewo, zamiast pozwolić jej wystawać.
  const left = Math.max(
    viewportPadding,
    Math.min(rect.left, window.innerWidth - viewportPadding - width),
  );

  return openAbove
    ? {
        left,
        bottom: window.innerHeight - rect.top + gap,
        width,
        maxHeight,
      }
    : { left, top: rect.bottom + gap, width, maxHeight };
}

function diffNights(start: string, end: string): number {
  if (!start || !end) return 4;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : 4;
}

export function MiniPlannerForm({ compact = false, initial, mode = "hotels" }: MiniPlannerFormProps) {
  const router = useRouter();
  const { locale } = useLanguage();
  const isFlights = mode === "flights";
  const listboxId = useId();
  const destInputRef = useRef<HTMLInputElement>(null);
  const destMobileInputRef = useRef<HTMLInputElement>(null);
  const destListRef = useRef<HTMLUListElement>(null);
  // Opakowanie pola i listy — granica „wewnątrz komponentu" dla zamykania.
  const destWrapRef = useRef<HTMLDivElement>(null);
  // Lista/dialog żyje w portalu pod <body>, więc stanowi drugą granicę klików
  // wewnętrznych dla useDismissOnOutside.
  const destPortalRef = useRef<HTMLDivElement>(null);
  const suppressDestTriggerFocusRef = useRef(false);
  const destHistoryBackPendingRef = useRef(false);
  // "Skąd" is OPTIONAL now (zadanie 1): no default airport. `origin` holds a
  // CONFIRMED city from the list (or ""), `originQuery` the visible text —
  // same confirmed/query split the destination combobox uses.
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [originQuery, setOriginQuery] = useState(initial?.originInput ?? initial?.origin ?? "");
  // Tryb lotów (zadanie 1): rozstrzygnięty wybór „Skąd" — kody do zapytania
  // (1 lotnisko, kod metra, albo fan-out grupy „wszystkie lotniska") + etykieta
  // miasta do nagłówka wyników. Wstępnie wypełnione na pasku edycji wyników.
  const [originCodes, setOriginCodes] = useState<string[]>(initial?.originCodes ?? []);
  const [originLabel, setOriginLabel] = useState(initial?.originLabel ?? "");
  const [originError, setOriginError] = useState("");
  // Faza 2 (loty): IATA celu (z s.airportCode), liczba niemowląt, one-way.
  const [destIata, setDestIata] = useState(initial?.destIata ?? "");
  const [infants, setInfants] = useState(Math.max(0, Math.min(4, initial?.infants ?? 0)));
  const [oneWay, setOneWay] = useState(Boolean(initial?.oneWay));
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [destinationCountry, setDestinationCountry] = useState(initial?.destinationCountry ?? "");
  // Zadanie 2 — wybrana wyspa/region (null = zwykłe miasto). Wpisywanie
  // czegokolwiek w pole zeruje wybór, jak destConfirmed.
  const [destRegionId, setDestRegionId] = useState<string | null>(initial?.regionId ?? null);
  // Wybrany KONKRETNY obiekt (2026-08-02). Pusty placeId = użytkownik wybrał
  // kierunek, nie hotel — czyli dotychczasowe zachowanie formularza.
  const [destPlaceId, setDestPlaceId] = useState("");
  const [destHotelName, setDestHotelName] = useState("");
  // Rozwiązanie hotelu (jedno wywołanie API po kliknięciu „Zaplanuj") potrafi
  // zająć chwilę — bez tego przycisk nie dawał żadnego sygnału i użytkownik
  // klikał drugi raz.
  const [resolving, setResolving] = useState(false);
  // Visible input gets the Polish exonym (e.g. "Lizbona") so collapsing back
  // from /hotele/szukaj?destination=Lisbon shows what the user picked, not
  // the canonical English key.
  const [destQuery, setDestQuery] = useState(initial?.destination ? localizeCity(initial.destination) : "");
  const [destSuggestions, setDestSuggestions] = useState<SuggestionItem[]>([]);
  const [destOpen, setDestOpen] = useState(false);
  const [isDestDesktop, setIsDestDesktop] = useState(true);
  const [destListPosition, setDestListPosition] = useState<AnchoredDestinationPosition | null>(null);
  // Zamknięcie listy podpowiedzi decyduje się na `pointerdown` poza polem,
  // a nie na utracie fokusu — patrz nagłówek use-dismiss-on-outside.ts
  // (naciśnięcie paska przewijania na desktopie też zabiera fokus).
  useDismissOnOutside(destWrapRef, destOpen, closeDestinationSuggestions, [destPortalRef]);
  const [destHighlight, setDestHighlight] = useState(-1);
  const [destFetching, setDestFetching] = useState(false);
  // Licznik fokusów pustego pola „Dokąd" — każdy fokus przy pustym polu
  // odpala pobranie popularnych kierunków (+ ostatnich z localStorage), jak
  // na Booking. 0 = jeszcze nie było fokusa → efekt niżej nic nie robi.
  const [destFocusTick, setDestFocusTick] = useState(0);
  /**
   * Czy listę podpowiedzi otworzył UŻYTKOWNIK (dotknięcie pola albo pisanie).
   *
   * Zgłoszenie właściciela: „gdy przełączam na homepage między lotami
   * i hotelami, od razu wyświetla mi się wybór kierunku". Przyczyna była
   * w efekcie pobierającym podpowiedzi: ma on `isFlights` w zależnościach
   * (i słusznie — w trybie lotów trzeba odfiltrować hotele, bo hotel nie ma
   * kodu IATA), a na końcu wołał bezwarunkowo `setDestOpen(true)`.
   *
   * Dopóki `destFocusTick` wynosił 0, strażnik na górze efektu zamykał listę
   * i wychodził. Ale wystarczyło raz dotknąć pola „Dokąd", żeby licznik urósł —
   * i od tej chwili KAŻDE przełączenie zakładki przeładowywało podpowiedzi
   * i otwierało panel bez żadnego kliknięcia.
   *
   * Ten ref rozdziela dwie różne rzeczy, które wcześniej były zlepione:
   * „odśwież dane" (ma się dziać przy zmianie trybu) od „pokaż panel"
   * (ma się dziać wyłącznie na życzenie użytkownika).
   */
  const listaNaZyczenieRef = useRef(false);
  const [destConfirmed, setDestConfirmed] = useState(Boolean(initial?.destination));
  const [destError, setDestError] = useState("");
  // No default dates — the user must pick them (homepage + results bar).
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  // Adults/children split. URL `adults` carries the SUM (initial.travelers);
  // `kids` (informational param) restores the split on the results bar.
  const initialKids = Math.max(0, Math.min(6, initial?.kids ?? 0));
  const [childCount, setChildCount] = useState(initialKids);
  const [adults, setAdults] = useState(
    Math.max(1, Math.min(9, (initial?.travelers ?? 2) - initialKids)),
  );
  const [dateError, setDateError] = useState("");

  function closeDestinationSuggestions() {
    // Zamkniecie kasuje zyczenie: kolejne przeladowanie danych (np. po zmianie
    // zakladki) nie ma prawa samo otworzyc panelu.
    listaNaZyczenieRef.current = false;
    if (
      !isDestDesktop &&
      !destHistoryBackPendingRef.current &&
      (window.history.state as Record<string, unknown> | null)?.[
        DESTINATION_SHEET_HISTORY_KEY
      ] === listboxId
    ) {
      destHistoryBackPendingRef.current = true;
      window.history.back();
    }
    setDestOpen(false);
  }

  function openDestinationSuggestions() {
    // Otwarcie na ZYCZENIE: dotkniecie pola albo pisanie. Tylko po tym efekt
    // pobierajacy podpowiedzi ma prawo pokazac panel — patrz listaNaZyczenieRef.
    listaNaZyczenieRef.current = true;
    const desktop = czyDesktop();
    setIsDestDesktop(desktop);
    if (desktop && destInputRef.current) {
      setDestListPosition(getDestinationListPosition(destInputRef.current));
    }
    if (!desktop || destSuggestions.length > 0 || !destConfirmed) setDestOpen(true);
    if (destSuggestions.length === 0 && !destConfirmed && destQuery.trim().length < 2) {
      setDestFocusTick((tick) => tick + 1);
    }
  }

  function changeDestinationQuery(value: string) {
    setDestQuery(value);
    setDestination(value);
    setDestRegionId(null);
    // Zmiana tekstu unieważnia WYBRANY obiekt — bez tego dopisanie litery do
    // nazwy hotelu dalej skakałoby do poprzedniego.
    setDestPlaceId("");
    setDestHotelName("");
    setDestConfirmed(false);
    setDestError("");
  }

  function changeMobileDestinationQuery(value: string) {
    changeDestinationQuery(value);
    // Po otwarciu arkusza z wcześniej potwierdzonym kierunkiem licznik może
    // nadal wynosić 0. Wyczyszczenie pola musi wtedy pokazać popularne pozycje,
    // a nie wejść w gałąź efektu, która zamyka listę przed pierwszym fokusem.
    if (value.trim().length < 2) setDestFocusTick((tick) => tick + 1);
  }

  useEffect(() => {
    if (!destOpen || !isDestDesktop) return;
    const updatePosition = () => {
      if (destInputRef.current) {
        setDestListPosition(getDestinationListPosition(destInputRef.current));
      }
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [destOpen, isDestDesktop]);

  useEffect(() => {
    if (!destOpen || isDestDesktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    destHistoryBackPendingRef.current = false;
    const currentState = window.history.state as Record<string, unknown> | null;
    if (currentState?.[DESTINATION_SHEET_HISTORY_KEY] !== listboxId) {
      window.history.pushState(
        { ...(currentState ?? {}), [DESTINATION_SHEET_HISTORY_KEY]: listboxId },
        "",
      );
    }
    const handlePopState = () => setDestOpen(false);
    window.addEventListener("popstate", handlePopState);
    const frame = window.requestAnimationFrame(() => {
      destMobileInputRef.current?.focus();
      destMobileInputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", handlePopState);
      document.body.style.overflow = previousOverflow;
      suppressDestTriggerFocusRef.current = true;
      // NIE ODDAJEMY FOKUSU POLU TEKSTOWEMU — to była przyczyna zgłoszenia
      // „klawiatura zostaje po kliknięciu ✕".
      //
      // Ten efekt to wyłącznie ścieżka mobilna (`!isDestDesktop`), a
      // `triggerInput.focus()` w sprzątaniu ustawiał fokus z powrotem na
      // <input>. Dla iOS i Androida sfokusowane pole tekstowe = otwarta
      // klawiatura systemowa, więc warstwa znikała, a klawiatura zostawała
      // — zasłaniając pół ekranu i psując układ strony pod spodem.
      //
      // Zwrot fokusu ma sens dla nawigacji klawiaturą, ale ta jest na
      // desktopie, gdzie ten efekt w ogóle nie działa. Tutaj fokus po prostu
      // schodzi z pola; `blur()` na aktywnym elemencie jest konieczny, bo w
      // WebKicie samo odmontowanie pola arkusza potrafi zostawić klawiaturę.
      zamknijKlawiature();
    };
  }, [destOpen, isDestDesktop, listboxId]);

  useEffect(() => {
    // After user picks a suggestion (destConfirmed=true), don't refetch with
    // the now-confirmed city name — that's what reopens the dropdown after
    // the click. onChange resets destConfirmed=false so typing still works.
    if (destConfirmed) {
      return;
    }
    const trimmed = destQuery.trim();
    if (trimmed.length < 2 && destFocusTick === 0) {
      setDestSuggestions([]);
      setDestOpen(false);
      setDestFetching(false);
      return;
    }
    // Puste pole PO fokusie → popularne kierunki (q="" zwraca top wg
    // popularności, edge-cache 1h) + „ostatnio szukane" z localStorage nad
    // nimi. Wpisany tekst → dotychczasowe podpowiedzi fuzzy.
    const popularMode = trimmed.length < 2;
    setDestFetching(true);
    const controller = new AbortController();
    // Znacznik pokolenia efektu. `finally` NIE może gasić wskaźnika ładowania
    // bezwarunkowo: przy szybkim pisaniu („ban" → „bang") stare, przerwane
    // żądanie kończyło się PO starcie nowego i ustawiało destFetching=false,
    // przez co w trakcie trwającego zapytania odsłaniały się poprzednie wyniki
    // albo „Brak wyników" — i dało się je kliknąć. Znalezione w review.
    // `cancelled` ustawia dopiero cleanup tego konkretnego przebiegu efektu.
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        // limit=20 (było 6): właściciel 2026-07-26 — po kliknięciu w puste pole
        // ma być pełna lista 20 kierunków popularnych w Polsce. Sześć pozycji
        // to była lista „do przewinięcia i zapomnienia"; dwadzieścia
        // pogrupowanych (plaża / miasto) to realna ścieżka dla kogoś, kto nie
        // wie, dokąd chce jechać — czyli dla głównego adresata tej strony.
        const url = popularMode
          ? "/api/destinations/suggest?q=&limit=20"
          : `/api/destinations/suggest?q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(url, { signal: controller.signal });
        const payload = (await res.json().catch(() => ({ items: [] }))) as { items?: DestinationSuggestion[] };
        let items: SuggestionItem[] = payload.items ?? [];
        if (popularMode) {
          const recent = readRecentDestinations();
          const recentIds = new Set(recent.map((r) => r.id));
          // Bez .slice(): lista jest pogrupowana i przewijalna, więc obcinanie
          // do 8 tylko ucinałoby grupę „Miasto na weekend" w połowie. Serwer
          // i tak oddaje maksymalnie 20 + ostatnio szukane.
          items = [
            ...recent.map((r): SuggestionItem => ({ ...r, _recent: true })),
            ...items.filter((i) => !recentIds.has(i.id)),
          ];
        }
        // Tryb LOTÓW nie przyjmuje hoteli: celem lotu jest lotnisko, a obiekt
        // noclegowy nie ma kodu IATA. Filtr stoi PO scaleniu „ostatnio
        // szukanych" — hotel wybrany wcześniej w zakładce Hotele wraca przez
        // localStorage z zachowanym `kind`, więc filtr wyłącznie na wynikach
        // serwera przepuszczał go w tryb lotów, gdzie klik kończył się błędem
        // „wybierz miasto z lotniskiem". Znalezione w review.
        if (isFlights) items = items.filter((i) => i.kind !== "hotel");
        if (cancelled) return;
        setDestSuggestions(items);
        // Panel otwieramy WYLACZNIE wtedy, gdy poprosil o to uzytkownik.
        // Ten efekt biegnie takze przy zmianie trybu (hotele<->loty), a wtedy ma
        // tylko odswiezyc dane — nie wyskakiwac na ekran.
        if (listaNaZyczenieRef.current) setDestOpen(true);
        setDestHighlight(-1);
      } catch {
        // aborted or network error
      } finally {
        // Tylko przebieg, który NIE został zastąpiony, gasi wskaźnik.
        if (!cancelled) setDestFetching(false);
      }
    }, popularMode ? 50 : 150);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [destQuery, destConfirmed, destFocusTick, isFlights]);

  function selectSuggestion(s: SuggestionItem) {
    // „Ostatnie" (localStorage) — bez wewnętrznej flagi _recent.
    const { _recent, ...plain } = s;
    void _recent;
    saveRecentDestination(plain);
    // Backend key (URL param, LiteAPI/IATA lookups) stays English.
    setDestination(s.city);
    setDestinationCountry(s.country);
    // Zadanie 2 — wyspa/region niesie regionId; miasto je zeruje.
    setDestRegionId(s.kind === "region" ? (s.regionId ?? null) : null);
    // Hotel niesie placeId i własną nazwę; każdy inny wybór je czyści —
    // inaczej wybór miasta PO hotelu dalej skakałby do obiektu.
    setDestPlaceId(s.kind === "hotel" ? (s.placeId ?? "") : "");
    setDestHotelName(s.kind === "hotel" ? s.label : "");
    // Faza 2 (loty): zapamiętaj IATA celu (z autocomplete: airportCode).
    setDestIata(s.airportCode ?? "");
    // Visible input gets the Polish exonym so the user sees what they picked.
    setDestQuery(s.cityPl ?? localizeCity(s.city));
    setDestSuggestions([]);
    setDestFetching(false);
    closeDestinationSuggestions();
    setDestHighlight(-1);
    setDestConfirmed(true);
    setDestError("");
    destInputRef.current?.blur();
  }

  /**
   * Przewinięcie podświetlonej pozycji do widoku.
   *
   * Konieczne, odkąd puste pole pokazuje 20 kierunków w panelu na ~6 wierszy:
   * strzałka w dół przesuwała podświetlenie POZA widoczny obszar, `scrollTop`
   * listy się nie zmieniał, a Enter wybierał pozycję, której użytkownik nie
   * widział. Znalezione w review. `block: "nearest"` przewija minimalnie —
   * lista nie skacze, gdy pozycja i tak jest widoczna.
   */
  function scrollHighlightIntoView(index: number) {
    const list = destListRef.current;
    if (!list || index < 0) return;
    list.querySelectorAll<HTMLElement>('[role="option"]')[index]?.scrollIntoView({ block: "nearest" });
  }

  function handleDestKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!destOpen || destSuggestions.length === 0) return;
    // Indeks liczony z `destHighlight` (domknięcie), NIE w funkcyjnym updaterze:
    // React 19 w trybie Strict celowo odpala updatery dwukrotnie, żeby wykryć
    // nieczystość — przewijanie w środku updatera byłoby side effectem
    // wykonywanym podwójnie. Ten sam wzorzec opisuje komentarz w concierge-chat.
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(destHighlight + 1, destSuggestions.length - 1);
      setDestHighlight(next);
      scrollHighlightIntoView(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(destHighlight - 1, 0);
      setDestHighlight(next);
      scrollHighlightIntoView(next);
    } else if (e.key === "Enter" && destHighlight >= 0) {
      e.preventDefault();
      selectSuggestion(destSuggestions[destHighlight]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeDestinationSuggestions();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Jak na Booking: wpisany tekst bez wyboru z listy NIE blokuje submitu.
    // Bierzemy najlepszą podpowiedź serwera ("warszaw"/"warszawa" →
    // Warszawa, "majorka" → wyspa Majorka). Błąd dopiero gdy podpowiedzi
    // nie ma wcale (czyli tekst nie przypomina żadnego kierunku).
    let resolvedDest: ResolvedDestination = {
      kind: destPlaceId ? "hotel" : destRegionId ? "region" : "city",
      city: destination,
      country: destinationCountry,
      regionId: destRegionId,
      placeId: destPlaceId || undefined,
      hotelName: destHotelName || undefined,
    };
    let resolvedDestIata = destIata; // IATA celu (tryb lotów)
    if (destQuery.trim().length > 0 && !destConfirmed) {
      let top: DestinationSuggestion | undefined;
      try {
        const res = await fetch(
          `/api/destinations/suggest?q=${encodeURIComponent(destQuery.trim())}&limit=1`,
        );
        const payload = (await res.json().catch(() => ({ items: [] }))) as {
          items?: DestinationSuggestion[];
        };
        top = payload.items?.[0];
      } catch {
        top = undefined;
      }
      if (!top) {
        // Tryb lotów NIE blokuje tutaj: indeks kierunków może nie znać miasta
        // („Bergamo"), które zna słownik lotnisk — rozstrzygamy niżej po IATA.
        if (!isFlights) {
          setDestError("Nie znaleziono takiego kierunku. Wybierz miasto z listy podpowiedzi.");
          setDestOpen(true);
          return;
        }
      } else {
        resolvedDest = {
          kind: top.kind === "region" ? "region" : top.kind === "hotel" ? "hotel" : "city",
          city: top.city,
          country: top.country,
          regionId: top.kind === "region" ? (top.regionId ?? null) : null,
          // Wpisana nazwa obiektu bez kliknięcia w listę też ma prowadzić do
          // hotelu — inaczej „Chopin Boutique" + Enter zachowywałoby się
          // inaczej niż „Chopin Boutique" + klik, a to ta sama intencja.
          placeId: top.kind === "hotel" ? top.placeId : undefined,
          hotelName: top.kind === "hotel" ? top.label : undefined,
        };
        resolvedDestIata = top.airportCode ?? "";
        // Dosynchronizuj UI, żeby po nawigacji wstecz pole pokazywało wybór.
        selectSuggestion(top);
      }
    }
    setDestError("");

    // ── TRYB LOTÓW (Faza 2) ──────────────────────────────────────────────
    if (isFlights) {
      // Cel musi mieć lotnisko (IATA). Gdy indeks kierunków go nie dał
      // (miasto spoza indeksu albo wpis bez IATA), ostatnia szansa: słownik
      // lotnisk (PL/EN aliasy + tolerancja literówek) — „Bergamo" → BGY.
      if (!resolvedDestIata && destQuery.trim()) {
        const best = bestAirportOption(destQuery);
        if (best) {
          if (best.kind === "airport") {
            resolvedDestIata = best.airport.code;
            if (!resolvedDest.city) {
              resolvedDest = { ...resolvedDest, city: best.airport.city };
            }
          } else {
            resolvedDestIata = best.group.metroCode ?? best.group.airportCodes[0];
            if (!resolvedDest.city) {
              resolvedDest = { ...resolvedDest, city: best.group.city };
            }
          }
        }
      }
      if (!resolvedDestIata) {
        setDestError("Wybierz miasto z lotniskiem z listy podpowiedzi.");
        setDestOpen(true);
        return;
      }
      // "Skąd" WYMAGANE w trybie lotów. Wybór z listy → originCodes/originLabel;
      // wpisany-niewybrany tekst → najlepsza podpowiedź ze słownika (jak na
      // Booking: „warszaw" → grupa Warszawa, „modlin" → WMI).
      let resolvedCodes = originCodes;
      let resolvedOriginLabel = originLabel;
      if (resolvedCodes.length === 0) {
        const best = originQuery.trim() ? bestAirportOption(originQuery) : null;
        if (best) {
          const sel = resolveOriginFromOption(best);
          resolvedCodes = sel.codes;
          resolvedOriginLabel = sel.label;
          setOriginCodes(sel.codes);
          setOriginLabel(sel.label);
          setOriginQuery(sel.inputLabel);
        } else {
          setOriginError("Wybierz lotnisko wylotu z listy.");
          return;
        }
      }
      setOriginError("");
      // Data wylotu wymagana; powrót wymagany, chyba że "w jedną stronę".
      if (!startDate) {
        setDateError("Wybierz datę wylotu.");
        return;
      }
      if (!oneWay && !endDate) {
        setDateError("Wybierz datę powrotu albo zaznacz „w jedną stronę”.");
        return;
      }
      setDateError("");
      const flightParams = new URLSearchParams({
        origin: resolvedCodes.join(","),
        destination: resolvedDestIata,
        depart: startDate,
        adults: String(adults),
      });
      if (resolvedOriginLabel) flightParams.set("originLabel", resolvedOriginLabel);
      // Nazwa miasta celu (do nagłówka + paska edycji na wynikach lotów).
      if (resolvedDest.city) flightParams.set("destLabel", resolvedDest.city);
      if (!oneWay && endDate) flightParams.set("return", endDate);
      if (childCount > 0) flightParams.set("children", String(childCount));
      if (infants > 0) flightParams.set("infants", String(infants));
      track("flight_search", {
        origin: resolvedCodes.join(","),
        destination: resolvedDestIata,
        depart: startDate,
        return: oneWay ? undefined : endDate,
        passengers: adults + childCount + infants,
        round_trip: !oneWay,
        cabin_class: "ECONOMY",
      });
      // Wspólny event startu wyszukiwania (obok istniejących, szczegółowych):
      // pozwala porównać zakładki JEDNĄ metryką i zobaczyć, czy niezdecydowani
      // (bez konkretnego kierunku) w ogóle ruszają dalej.
      track("search_started", {
        tab: "flights",
        destination_type: resolvedDestIata ? "specific" : "anywhere",
        date_mode: "fixed",
      });
      const flightPrefix = locale === "en" ? "/en" : "";
      router.push(`${flightPrefix}/loty/wyniki?${flightParams.toString()}`);
      return;
    }
    // ── TRYB HOTELI (dotychczasowy) ──────────────────────────────────────
    // "Skąd" is optional — but typed-and-unmatched text must not silently
    // turn into "no flights". Exact single match auto-confirms ("krakow" →
    // Kraków); anything else asks the user to pick or clear.
    let resolvedOrigin = origin;
    if (originQuery.trim() && !resolvedOrigin) {
      const match = exactOriginMatch(originQuery);
      if (match) {
        resolvedOrigin = match.city;
        setOrigin(match.city);
        setOriginQuery(match.city);
      } else {
        setOriginError("Wybierz lotnisko z listy albo zostaw pole puste.");
        return;
      }
    }
    setOriginError("");
    // Daty są wymagane — użytkownik musi je wybrać (brak domyślnych).
    if (!startDate || !endDate) {
      setDateError("Wybierz datę wyjazdu i powrotu.");
      return;
    }
    setDateError("");
    const nights = diffNights(startDate, endDate);
    const trimmedDestination = resolvedDest.city.trim();
    const totalGuestsForJump = adults + childCount;

    // ── SKOK DO KONKRETNEGO HOTELU (2026-08-02) ─────────────────────────────
    // Wpisanie nazwy obiektu + termin ma otworzyć TEN obiekt, a nie listę
    // wyników — dokładnie jak na Bookingu. Publiczne LiteAPI nie wyszukuje
    // hoteli po nazwie, więc drogę robią dwa kroki: Google Place ID
    // z podpowiedzi → `/data/hotels?placeId=…` → hotelId (patrz
    // /api/hotels/resolve-place).
    //
    // NIEUDANE ROZWIĄZANIE NIE JEST BŁĘDEM. Endpoint zwraca `null`, gdy nazwa
    // znalezionego hotelu nie zgadza się z tym, o co pytał użytkownik (Google
    // na „Burj Al Arab" zwraca plażę o tej nazwie). Wtedy po prostu lecimy
    // dalej wyszukiwaniem w mieście obiektu — zero ślepych uliczek.
    if (resolvedDest.kind === "hotel" && resolvedDest.placeId) {
      setResolving(true);
      let hotelId: string | null = null;
      try {
        const res = await fetch(
          `/api/hotels/resolve-place?placeId=${encodeURIComponent(resolvedDest.placeId)}&name=${encodeURIComponent(resolvedDest.hotelName ?? destQuery)}`,
          // Twardy limit czasu: bez niego zawieszony endpoint trzymał przycisk
          // w „Szukam hotelu…" do timeoutu przeglądarki. Po 6 s przerywamy
          // i lecimy ścieżką awaryjną (wyszukiwanie w mieście) — użytkownik
          // dostaje wynik, tylko o jeden krok dalszy. Znalezione w review.
          { signal: AbortSignal.timeout(6000) },
        );
        const payload = (await res.json().catch(() => ({}))) as { hotelId?: string | null };
        hotelId = payload.hotelId ?? null;
      } catch {
        hotelId = null;
      }
      setResolving(false);

      if (hotelId) {
        // BEZ parametru `children`. Strona hotelu parsuje go jako listę WIEKÓW
        // („5,9"), a formularz zna tylko LICZBĘ dzieci — wysłane `children=2`
        // dokładałoby do obsady zmyślonego dwulatka OBOK dzieci już wliczonych
        // w sumę `adults`, więc cena na stronie hotelu byłaby policzona dla
        // złej liczby osób. To jest dokładnie klasa incydentu occupancy
        // z 2026-07-10. Znalezione w review.
        const hotelParams = new URLSearchParams({
          checkin: startDate,
          checkout: endDate,
          adults: String(totalGuestsForJump),
          rooms: "1",
        });
        const hotelHref = `/hotele/${hotelId}?${hotelParams.toString()}`;
        saveRecentSearch({
          id: `hotel:${hotelId}|${startDate}|${endDate}`,
          kind: "hotel",
          title: resolvedDest.hotelName ?? destQuery.trim(),
          // Miasto po polsku + kraj po polsku — surowy segment adresu Google
          // bywał angielski („Warsaw"), a druga linia karty ma czytać się jak
          // reszta serwisu.
          subtitle:
            [
              resolvedDest.city ? localizeCity(resolvedDest.city) : null,
              resolvedDest.country ? localizeCountry(resolvedDest.country) : null,
            ]
              .filter(Boolean)
              .join(", ") || undefined,
          checkin: startDate,
          checkout: endDate,
          guests: totalGuestsForJump,
          rooms: 1,
          href: hotelHref,
        });
        track("hotel_search_submit", {
          destination: resolvedDest.hotelName ?? destQuery.trim(),
          country: resolvedDest.country || undefined,
          checkin: startDate,
          checkout: endDate,
          adults: totalGuestsForJump,
          rooms: 1,
          // Osobne źródło: to jest inna intencja niż szukanie kierunku i musi
          // dać się odróżnić w lejku, inaczej nie wiadomo, czy ta ścieżka
          // w ogóle jest używana.
          source: "search_bar_hotel",
          children_count: childCount,
          origin_provided: Boolean(resolvedOrigin),
        });
        // Wspólna metryka startu wyszukiwania — skok do hotelu to nadal
        // wyszukanie w zakładce Hotele; bez tego eventu lejek per-zakładka
        // niedoliczałby właśnie najbardziej zdecydowanych użytkowników.
        track("search_started", {
          tab: "hotels",
          destination_type: "specific",
          date_mode: "fixed",
        });
        const hotelPrefix = locale === "en" ? "/en" : "";
        router.push(`${hotelPrefix}${hotelHref}`);
        return;
      }
    }
    // PRODUCT DECISION (zadanie 1): children count as adults downstream —
    // LiteAPI occupancies and the flights search both read the summed
    // `adults` param. `kids` is informational only (restores the UI split).
    const totalGuests = adults + childCount;
    // Sesja C pkt 2: route directly to /hotele/szukaj — the unified results
    // page that composes hotels (LiteAPI).
    const params = new URLSearchParams({
      destination: trimmedDestination,
      country: resolvedDest.country,
      checkin: startDate,
      checkout: endDate,
      adults: String(totalGuests),
      rooms: "1",
    });
    // Zadanie 2 — wyspa/region: dodatkowy parametr `region` (slug ze
    // słownika). `destination` zostaje (EN nazwa regionu) dla spójności
    // metadanych i starych konsumentów; strona wyników preferuje `region`.
    if (resolvedDest.kind === "region" && resolvedDest.regionId) {
      params.set("region", resolvedDest.regionId);
    }
    if (childCount > 0) params.set("kids", String(childCount));
    // Empty "Skąd" → no origin param at all; the results page already hides
    // the flights section when sp.origin is absent.
    if (resolvedOrigin) params.set("origin", resolvedOrigin);
    sendClientEvent("mini_planner_submitted", {
      origin: resolvedOrigin || null,
      destination: trimmedDestination || null,
      country: resolvedDest.country || null,
      region: resolvedDest.regionId,
      nights,
      travelers: totalGuests,
      hasDestination: trimmedDestination.length > 0,
    });
    // GA4 funnel event — hotel_search_submit was defined in the catalogue but
    // never fired anywhere (faza 0 finding); wired here with the two new
    // params from the brief.
    track("hotel_search_submit", {
      destination: trimmedDestination,
      country: resolvedDest.country || undefined,
      checkin: startDate,
      checkout: endDate,
      adults: totalGuests,
      rooms: 1,
      source: "search_bar",
      children_count: childCount,
      origin_provided: Boolean(resolvedOrigin),
    });
    // Wspólny event startu wyszukiwania — jedna metryka dla wszystkich
    // zakładek hero (patrz bliźniacze wywołanie w gałęzi lotów).
    track("search_started", {
      tab: "hotels",
      destination_type: trimmedDestination.length > 0 ? "specific" : "anywhere",
      date_mode: "fixed",
    });
    const href = `/hotele/szukaj?${params.toString()}`;
    // Sekcja „Ostatnio wyszukiwane" na stronie głównej. Zapis jest lokalny
    // (localStorage) i celowo NIE obejmuje trybu lotów: karta ma kształt
    // hotelowy (noce, goście, pokoje), a trasa lotu opisana tymi polami
    // znaczyłaby coś innego niż to, co na niej pisze.
    saveRecentSearch({
      id: `dest:${foldText(trimmedDestination)}|${foldText(resolvedDest.country)}|${startDate}|${endDate}`,
      kind: "destination",
      title: localizeCity(trimmedDestination),
      subtitle: localizeCountry(resolvedDest.country),
      // Ten sam klucz co po stronie serwera (foldowane „miasto|kraj" po
      // angielsku) — dzięki temu strona główna dokłada do karty zdjęcie,
      // które i tak rozwiązała dla kafelków.
      imageKey: foldText(`${trimmedDestination}|${resolvedDest.country}`),
      checkin: startDate,
      checkout: endDate,
      guests: totalGuests,
      rooms: 1,
      href,
    });
    const prefix = locale === "en" ? "/en" : "";
    router.push(`${prefix}${href}`);
  }

  // PULAPKA REPO: `text-*` na <input>/<button> NIE DZIALA. Reset
  // `button, input, select, textarea { font-size: inherit }` stoi POZA
  // warstwami CSS, a utility Tailwinda siedza w `@layer utilities` — styl
  // bez warstwy zawsze bije styl z warstwy. Zmierzone: pole z klasa
  // `text-sm` renderowalo sie jako 16 px (dziedziczone z body), nie 14 px.
  // Dlatego rozmiar pisma pol ustawia KONTENER (`text-lg` na siatce nizej),
  // a tutaj zostaje tylko to, co na inpucie faktycznie dziala.
  //
  // Mobile zostaje przy 56 px; desktop rośnie do 64 px zgodnie z briefem.
  const fieldCls =
    "h-14 rounded-sm border border-white/60 bg-white/95 px-3.5 font-medium text-emerald-950 shadow-inner transition duration-150 ease-out focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60 motion-reduce:transition-none lg:h-16";
  const labelCls =
    "text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800/80 lg:text-xs";

  function renderDestinationList(mobile: boolean) {
    return (
      <ul
        id={listboxId}
        ref={destListRef}
        role="listbox"
        aria-label="Kierunki"
        className={
          mobile
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
            : "w-full overflow-y-auto overscroll-contain rounded-md border border-line bg-surface-raised py-1 shadow-[var(--shadow-lg)]"
        }
        style={mobile ? undefined : { maxHeight: destListPosition?.maxHeight }}
      >
        {destFetching ? (
          <li role="presentation" className="space-y-1 px-3 py-2">
            <div aria-hidden>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`flex flex-col justify-center gap-1.5 ${
                    mobile ? "min-h-[56px]" : "min-h-[52px]"
                  }`}
                >
                  <div
                    className="h-3.5 animate-pulse rounded bg-surface-sunken motion-reduce:animate-none"
                    style={{ width: `${58 - i * 9}%` }}
                  />
                  <div
                    className="h-2.5 animate-pulse rounded bg-surface-sunken motion-reduce:animate-none"
                    style={{ width: `${40 - i * 6}%` }}
                  />
                </div>
              ))}
            </div>
            <span className="sr-only" role="status">
              Szukamy kierunków
            </span>
          </li>
        ) : destSuggestions.length > 0 ? (
          buildSuggestionSections(destSuggestions).map((section) => (
            <li
              key={section.label ?? "_flat"}
              role={section.label ? "group" : "presentation"}
              aria-label={section.label ?? undefined}
            >
              {section.label && (
                <p
                  aria-hidden
                  className="sticky top-0 z-10 bg-surface-raised px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
                >
                  {section.label}
                </p>
              )}
              <ul role="presentation">
                {section.rows.map(({ item: suggestion, index }) => {
                  const isRegion = suggestion.kind === "region";
                  const isHotel = suggestion.kind === "hotel";
                  const country = localizeCountry(suggestion.country);
                  const region = isRegion ? "wyspa" : localizeRegion(suggestion.region);
                  const meta = isHotel
                    ? (suggestion.secondary ?? country)
                    : isRegion
                      ? [region, country].filter(Boolean).join(" · ")
                      : [suggestion.hint ?? region, country].filter(Boolean).join(" · ");
                  const Icon = suggestionIcon(suggestion);
                  return (
                    <li
                      key={suggestion.id}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={index === destHighlight}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(suggestion);
                      }}
                      onMouseEnter={() => setDestHighlight(index)}
                      className={`flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 ease-out active:bg-brand-soft motion-reduce:transition-none ${
                        mobile ? "min-h-[60px]" : "min-h-[56px]"
                      } ${index === destHighlight ? "bg-brand-soft" : "hover:bg-surface-sunken"}`}
                    >
                      {/* Ikona 28 px zamiast 32: na zrzucie zabierała miejsce
                          nazwie, a jest tylko sygnałem typu pozycji. */}
                      <span
                        aria-hidden
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted"
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        {/* `truncate` zamiast zawijania: nazwa ma się urwać
                            wielokropkiem, a nie rozlewać na cztery wiersze —
                            lista musi mieć przewidywalną wysokość wiersza. */}
                        <span className="truncate text-[15px] font-semibold leading-snug text-ink">
                          {suggestion.cityPl ?? localizeCity(suggestion.city)}
                        </span>
                        {meta && (
                          <span className="truncate text-xs leading-snug text-ink-muted">{meta}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        ) : (
          <li className="px-3 py-3 text-sm text-ink-muted">
            Brak wyników dla „{destQuery}”. Spróbuj innego miasta lub kraju.
          </li>
        )}
      </ul>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      // `text-left` JAWNIE: hero wysrodkowuje tekst, a wyrownanie dziedziczy
      // sie w dol — przez to etykiety pol i CALA lista podpowiedzi renderowaly
      // sie wysrodkowane, wiec nazwy miast nie mialy wspolnej krawedzi
      // (zgloszenie wlasciciela: „zeby napisane byly rowniutko"). Formularz
      // nie ma prawa dziedziczyc wyrownania naglowka.
      className="rounded-md border border-white/40 bg-white/80 p-4 text-left shadow-[0_24px_60px_rgba(16,84,48,0.24)] backdrop-blur-xl sm:p-5"
    >
      {/* `text-lg` na SIATCE, nie na polach: patrz komentarz przy `fieldCls`.
          Próba 20 px nie mieści się w pięciu kolumnach trybu lotów bez ucięć:
          po powiększeniu CTA do 18 px minima + 4×gap-3 wykorzystują całe 854 px
          wnętrza formularza. Zgodnie ze specyfikacją pola zostają więc przy
          bezpiecznych 18 px. */}
      <div
        className={`grid gap-3 text-lg lg:items-end ${
          isFlights
            // Minima przeliczone po poszerzeniu kontenera do `lg:max-w-5xl`.
            //
            // Poprzedni komplet (160/186/154/146/160) sumował się do 806 px
            // i wypełniał co do piksela wnętrze `max-w-4xl` — dlatego CTA
            // dostawało 160 px, a potrzebuje ~232 px na „SZUKAJ LOTÓW →"
            // (18 px, wersaliki, tracking 0.06em) i napis był ucinany.
            //
            // Nowy budżet: `max-w-5xl` (1024 px) minus 40 px paddingu i 2 px
            // obramowania = 982 px wnętrza, minus cztery przerwy `gap-3`
            // (48 px) = 934 px na kolumny. Minima sumują się do 932 px.
            //
            // Rozdział między kolumnami wynika z POMIARU, nie z proporcji:
            // „Wylot – Powrót" potrzebuje 124 px samego tekstu, a kolumna
            // zjada 52 px na ikonę, odstęp i padding — stąd 184 px dla
            // „Terminu”. „Dokąd" oddało mu 16 px, bo jego placeholder
            // („Miasto lub kraj", ~130 px) zostawiał 30 px niewykorzystane.
            //
            // ZASADA: zmieniasz którekolwiek minimum → przelicz sumę. Suma
            // większa niż wnętrze kontenera nie daje przewijania, tylko po
            // cichu ucina zawartość ostatnich kolumn.
            ? "lg:grid-cols-[minmax(172px,1.1fr)_minmax(188px,1.35fr)_minmax(184px,1.05fr)_minmax(156px,1fr)_minmax(232px,auto)]"
            : "lg:grid-cols-[1.4fr_1.3fr_1fr_auto]"
        }`}
      >
        {/* SKAD — tylko w trybie LOTY (Faza 2.2: znika z widoku hotelowego).
            Pojawia się z subtelną animacją fade/slide przy wejściu w loty. */}
        {isFlights && (
          <div className="animate-fade-in">
            <AirportCombobox
              query={originQuery}
              onQueryChange={(value) => {
                setOriginQuery(value);
                setOriginCodes([]);
                setOriginLabel("");
                setOriginError("");
              }}
              onSelect={(option) => {
                const sel = resolveOriginFromOption(option);
                setOriginCodes(sel.codes);
                setOriginLabel(sel.label);
                setOriginQuery(sel.inputLabel);
                setOriginError("");
              }}
              onClear={() => {
                setOriginCodes([]);
                setOriginLabel("");
                setOriginQuery("");
                setOriginError("");
              }}
              error={originError}
              fieldClassName={fieldCls}
              labelClassName={labelCls}
              placeholder="Skąd lecisz?"
              inputAriaLabel="Skąd (lotnisko wylotu)"
            />
          </div>
        )}

        {/* DOKAD — autocomplete combobox */}
        <div ref={destWrapRef} className="relative flex flex-col gap-1.5">
            <span className={labelCls}>Dokąd</span>
          <input
            ref={destInputRef}
            data-mini-planner-destination
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={destOpen}
            aria-controls={listboxId}
            // Bez tego czytnik ekranu wiedział tylko, że fokus jest w polu —
            // strzałki przesuwały podświetlenie, o którym nic nie mówił.
            aria-activedescendant={
              destOpen && destHighlight >= 0 ? `${listboxId}-opt-${destHighlight}` : undefined
            }
            value={destQuery}
            onChange={(event) => changeDestinationQuery(event.target.value)}
            onKeyDown={handleDestKeyDown}
            // OTWARCIE IDZIE PRZEZ `click` — NA OBU PLATFORMACH.
            //
            // `click` to jedyne zdarzenie wskaźnika, które przeglądarka wysyła
            // DOPIERO PO ROZSTRZYGNIĘCIU, czy gest był dotknięciem, czy
            // przewinięciem. Gdy palec ruszy w bok, Chrome wysyła
            // `pointercancel` i `click` NIE PRZYCHODZI. To ta sama natywna
            // heurystyka tap-vs-scroll, którą inaczej musielibyśmy odtwarzać
            // progiem ruchu — tylko dokładniejsza i zgodna z systemem.
            //
            // POPRZEDNIO otwierał to `pointerdown` (czyli moment dotknięcia),
            // ograniczony warunkiem, który przez mylącą nazwę stałej celował
            // w telefon zamiast w desktop. Stąd zgłoszenie: przewijanie strony
            // zaczęte palcem na tym polu otwierało picker.
            onClick={() => {
              if (!destOpen) openDestinationSuggestions();
            }}
            onFocus={() => {
              if (suppressDestTriggerFocusRef.current) {
                suppressDestTriggerFocusRef.current = false;
                return;
              }
              // NA TELEFONIE FOKUS NIE OTWIERA WYBORU KIERUNKU.
              //
              // Dotknięcie pola tekstowego nadaje mu fokus, zanim wiadomo, czy
              // palec pojedzie w bok. Otwieranie na fokusie znaczyłoby więc
              // otwieranie na przewinięciu — czyli ten sam błąd, tylko innym
              // kanałem. Na telefonie zostaje wyłącznie `click` powyżej.
              //
              // NA DESKTOPIE FOKUS OTWIERA i to jest konieczne, nie ozdobne:
              // klawiatura dochodzi tu tabulatorem, bez żadnego kliknięcia,
              // a lista podpowiedzi jest jedyną drogą do wyboru kierunku.
              // Poprzednia wersja tego warunku wyłączała otwieranie właśnie
              // na desktopie i odcinała nawigację klawiaturą.
              if (!czyDesktop()) return;
              openDestinationSuggestions();
            }}
            onBlur={(event) => {
              // NA TELEFONIE UTRATA FOKUSU NIE ZAMYKA ARKUSZA.
              //
              // To jest przyczyna, przez którą poprzednia próba naprawy „tapu"
              // została cofnięta: przewijanie przestawało otwierać picker, ale
              // dotknięcie też przestawało go otwierać.
              //
              // Zmierzona sekwencja (Chromium, 390 px, prawdziwy gest):
              // `pointerdown → focus → click → arkusz się montuje → autoFocus
              // arkusza zabiera fokus polu-wyzwalaczowi → onBlur`. W tym
              // `onBlur` `relatedTarget` to pole ARKUSZA, ale `destPortalRef`
              // nie ma jeszcze przypisanego węzła (ref dostaje wartość w tym
              // samym commicie), więc warunek uznawał arkusz za „element poza
              // komponentem" i natychmiast go zamykał.
              //
              // Wcześniej nie było tego widać, bo `preventDefault()` na
              // `pointerdown` w ogóle nie dopuszczał fokusu do wyzwalacza.
              //
              // Arkusz mobilny jest modalny (`aria-modal`) i ma własne wyjścia:
              // ✕, przycisk Wstecz i `useDismissOnOutside`. Ten handler jest
              // wyłącznie od DESKTOPOWEGO wyjścia tabulatorem — i tak też jest
              // opisany poniżej.
              if (!czyDesktop()) return;
              // Zamykamy WYŁĄCZNIE wtedy, gdy fokus poszedł na konkretny element
              // poza komponentem (tabulator, klik w inne pole). `relatedTarget`
              // równy null to m.in. naciśnięcie paska przewijania — tam lista
              // ma zostać otwarta, a decyzję podejmuje `useDismissOnOutside`.
              const next = event.relatedTarget as Node | null;
              if (
                next &&
                !destWrapRef.current?.contains(next) &&
                !destPortalRef.current?.contains(next)
              ) closeDestinationSuggestions();
            }}
            // Krótsza podpowiedź: „Wpisz miasto lub kraj…" potrzebowało 184 px
            // przy 152 dostępnych i urywało się w połowie słowa. Czasownik nic
            // nie wnosił — etykieta nad polem mówi już „DOKĄD".
            placeholder="Miasto lub kraj"
            autoComplete="off"
            className={fieldCls}
          />
          {destOpen && isDestDesktop && destListPosition && typeof document !== "undefined" &&
            createPortal(
              <div
                ref={destPortalRef}
                className="fixed z-[60]"
                style={{
                  left: destListPosition.left,
                  top: destListPosition.top,
                  bottom: destListPosition.bottom,
                  width: destListPosition.width,
                }}
              >
                {renderDestinationList(false)}
              </div>,
              document.body,
            )}

          {destOpen && !isDestDesktop && typeof document !== "undefined" &&
            createPortal(
              <div
                ref={destPortalRef}
                role="dialog"
                aria-modal="true"
                aria-label="Wyszukiwanie kierunku"
                className="fixed inset-0 z-[70] flex flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
              >
                <div className="flex min-h-14 items-center gap-2 border-b border-line px-2">
                  <button
                    type="button"
                    onClick={closeDestinationSuggestions}
                    aria-label="Zamknij"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-surface-sunken active:bg-brand-soft motion-reduce:transition-none"
                  >
                    <X aria-hidden className="h-5 w-5" strokeWidth={2} />
                  </button>
                  <h2 className="text-lg font-bold text-ink">Dokąd?</h2>
                </div>
                <div className="border-b border-line p-3 text-lg">
                  <div className="relative">
                    <input
                      ref={destMobileInputRef}
                      // `autoFocus`, a NIE samo `focus()` w requestAnimationFrame:
                      // zmierzone na 375 px — po otwarciu arkusza fokus zostawał
                      // na polu hero POD nakładką. Na telefonie znaczy to, że
                      // klawiatura podnosi się dla pola, którego nie widać: kursor
                      // nie miga w widocznym polu, a `aria-modal` z fokusem na
                      // zewnątrz to też błąd dostępności. React ustawia `autoFocus`
                      // przy montowaniu węzła, więc działa też w portalu i nie
                      // ściga się z cyklem klatek.
                      autoFocus
                      type="text"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded="true"
                      aria-controls={listboxId}
                      aria-activedescendant={
                        destHighlight >= 0 ? `${listboxId}-opt-${destHighlight}` : undefined
                      }
                      aria-label="Dokąd"
                      value={destQuery}
                      onChange={(event) => changeMobileDestinationQuery(event.target.value)}
                      onKeyDown={handleDestKeyDown}
                      placeholder="Miasto lub kraj"
                      autoComplete="off"
                      className={`h-14 w-full rounded-sm border border-line bg-white px-4 font-medium text-ink shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 ${
                        destQuery ? "pr-12" : ""
                      }`}
                    />
                    {destQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          changeMobileDestinationQuery("");
                          setDestHighlight(-1);
                          destMobileInputRef.current?.focus();
                        }}
                        aria-label="Wyczyść kierunek"
                        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-sunken active:bg-brand-soft motion-reduce:transition-none"
                      >
                        <X aria-hidden className="h-5 w-5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
                {renderDestinationList(true)}
              </div>,
              document.body,
            )}
          {destError && (
            <p className="mt-1 rounded-sm bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
              {destError}
            </p>
          )}
        </div>

        {/* TERMIN — single field, Booking-style range calendar */}
        <DateRangeField
          checkin={startDate}
          checkout={endDate}
          // Lot w jedną stronę → kalendarz wybiera tylko jedną datę (wylot).
          singleDate={isFlights && oneWay}
          onChange={(nextStart, nextEnd) => {
            setStartDate(nextStart);
            setEndDate(nextEnd);
            setDateError("");
          }}
          fieldClassName={fieldCls}
          labelClassName={labelCls}
        />

        {/* GOŚCIE / PASAŻEROWIE — popover; w trybie lotów dochodzą niemowlęta */}
        <GuestsField
          adults={adults}
          childCount={childCount}
          infants={infants}
          showInfants={isFlights}
          fieldLabel={isFlights ? "Pasażerowie" : "Goście"}
          onChange={(nextAdults, nextChildren, nextInfants) => {
            setAdults(nextAdults);
            setChildCount(nextChildren);
            if (typeof nextInfants === "number") setInfants(nextInfants);
          }}
          fieldClassName={fieldCls}
          labelClassName={labelCls}
        />

        {/* CTA */}
        <button
          type="submit"
          // Blokada na czas rozwiązywania hotelu: jedno wywołanie API dzieli
          // kliknięcie od nawigacji, a bez sygnału użytkownik klika drugi raz
          // i wysyła formularz dwa razy.
          disabled={resolving}
          aria-busy={resolving}
          // Bez `text-*`: <button> ma nielayerowany `font-size: inherit`, wiec i tak
          // wziolby rozmiar z siatki (18 px). Klasa tutaj bylaby martwa i mylaca.
          className="group relative h-14 overflow-hidden whitespace-nowrap rounded-sm bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 font-bold uppercase tracking-[0.06em] text-white shadow-[0_10px_30px_rgba(234,88,12,0.45)] transition duration-150 ease-out hover:shadow-[0_14px_40px_rgba(234,88,12,0.6)] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-amber-300/60 disabled:cursor-progress disabled:opacity-80 motion-reduce:transform-none motion-reduce:transition-none lg:h-16"
        >
          {/* Rozmiar pisma NA SPANIE, nie na <button>: reset poza warstwami CSS
              wymusza na przyciskach `font-size: inherit`. Desktopowe 18 px
              mieści się dzięki przeliczonej minimalnej szerokości CTA. */}
          <span className="relative z-10 flex items-center justify-center gap-2 text-base lg:text-lg">
            {resolving ? "Szukam hotelu…" : isFlights ? "Szukaj lotów" : "Zaplanuj"}
            <span aria-hidden className="transition group-hover:translate-x-1">→</span>
          </span>
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-rose-500 to-amber-500 opacity-0 transition group-hover:opacity-100"
          />
        </button>
      </div>

      {/* Loty: opcja „w jedną stronę" (pojedyncza data = one-way). */}
      {isFlights && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-emerald-900/80">
          <input
            type="checkbox"
            checked={oneWay}
            onChange={(e) => {
              setOneWay(e.target.checked);
              // Włączenie „w jedną stronę" czyści wybraną datę powrotu (inaczej
              // zostałaby ukryta, ale dalej wysyłana). Kalendarz przełącza się
              // wtedy w tryb jednej daty (singleDate).
              if (e.target.checked) setEndDate("");
              setDateError("");
            }}
            className="h-3.5 w-3.5 rounded border-emerald-900/30 text-emerald-600 focus:ring-emerald-500"
          />
          Lot w jedną stronę
        </label>
      )}

      {dateError && (
        <p className="mt-2 rounded-sm bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          {dateError}
        </p>
      )}

      {!compact && !isFlights && (
        <p className="mt-3 text-[11px] text-emerald-900/70">
              Dokąd możesz zostawić puste — pomożemy wybrać kierunek po Twoich preferencjach.
        </p>
      )}
    </form>
  );
}
