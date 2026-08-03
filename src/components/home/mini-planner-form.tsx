"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BedDouble, Building2, Globe, Palmtree, Plane } from "lucide-react";

import { DateRangeField } from "@/components/search/date-range-field";
import { GuestsField } from "@/components/search/guests-field";
import { exactOriginMatch } from "@/components/search/origin-combobox";
import { AirportCombobox } from "@/components/flights/airport-combobox";
import { bestAirportOption, resolveOriginFromOption } from "@/lib/flights/airports";
import { useLanguage } from "@/components/site/language-provider";
import { track } from "@/lib/analytics/track";
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
  const destListRef = useRef<HTMLUListElement>(null);
  // Opakowanie pola i listy — granica „wewnątrz komponentu" dla zamykania.
  const destWrapRef = useRef<HTMLDivElement>(null);
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
  // Zamknięcie listy podpowiedzi decyduje się na `pointerdown` poza polem,
  // a nie na utracie fokusu — patrz nagłówek use-dismiss-on-outside.ts
  // (naciśnięcie paska przewijania na desktopie też zabiera fokus).
  useDismissOnOutside(destWrapRef, destOpen, () => setDestOpen(false));
  const [destHighlight, setDestHighlight] = useState(-1);
  const [destFetching, setDestFetching] = useState(false);
  // Licznik fokusów pustego pola „Dokąd" — każdy fokus przy pustym polu
  // odpala pobranie popularnych kierunków (+ ostatnich z localStorage), jak
  // na Booking. 0 = jeszcze nie było fokusa → efekt niżej nic nie robi.
  const [destFocusTick, setDestFocusTick] = useState(0);
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
        setDestOpen(true);
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
    setDestOpen(false);
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
      setDestOpen(false);
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
  // Wysokosc 56 px (bylo 48) na prosbe wlasciciela — pasek ma byc wiekszy.
  const fieldCls =
    "h-14 rounded-sm border border-white/60 bg-white/95 px-3.5 font-medium text-emerald-950 shadow-inner transition focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400";
  const labelCls =
    "text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800/80";

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
      {/* `text-lg` na SIATCE, nie na polach: patrz komentarz przy `fieldCls`
          — pola dziedzicza rozmiar pisma z rodzica, bo wlasne `text-*` jest
          na nich martwe. 18 px zamiast 16 px, na prosbe wlasciciela. */}
      <div
        className={`grid gap-3 text-lg lg:items-end ${
          isFlights
            // Kolumny przeliczone po powiększeniu pisma do 18 px. Zmierzone
            // przed zmianą: „2 dorosłych" potrzebowało 114 px, a kolumna dawała
            // 90; „Wylot – Powrót" 125 wobec 122 — stąd ucięte etykiety na
            // zrzucie od właściciela. Pole „Skąd" miało za to 65 px zapasu,
            // więc oddaje je sąsiadom, zamiast rosnąć bez potrzeby.
            // Suma minimów + odstępy MUSI zmieścić się w kontenerze: max-w-4xl
            // (896 px) minus padding i obramowanie zostawia ok. 856 px, a cztery
            // przerwy `gap-3` zjadają 48. Stąd 800 px minimów, nie 818 —
            // przy poprzednich wartościach CTA wchodziło w prawy padding
            // dokładnie na progu `lg`.
            ? "lg:grid-cols-[minmax(162px,1.15fr)_minmax(186px,1.4fr)_minmax(154px,1.1fr)_minmax(146px,1fr)_minmax(152px,auto)]"
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
            onChange={(e) => {
              setDestQuery(e.target.value);
              setDestination(e.target.value);
              setDestRegionId(null);
              // Zmiana tekstu unieważnia WYBRANY obiekt — bez tego dopisanie
              // litery do nazwy hotelu dalej skakałoby do poprzedniego.
              setDestPlaceId("");
              setDestHotelName("");
              setDestConfirmed(false);
              setDestError("");
            }}
            onKeyDown={handleDestKeyDown}
            onFocus={() => {
              if (destSuggestions.length > 0) {
                setDestOpen(true);
                return;
              }
              // Puste pole → pokaż popularne + ostatnie (efekt wyżej).
              if (!destConfirmed && destQuery.trim().length < 2) {
                setDestFocusTick((t) => t + 1);
              }
            }}
            onBlur={(event) => {
              // Zamykamy WYŁĄCZNIE wtedy, gdy fokus poszedł na konkretny element
              // poza komponentem (tabulator, klik w inne pole). `relatedTarget`
              // równy null to m.in. naciśnięcie paska przewijania — tam lista
              // ma zostać otwarta, a decyzję podejmuje `useDismissOnOutside`.
              const next = event.relatedTarget as Node | null;
              if (next && !destWrapRef.current?.contains(next)) setDestOpen(false);
            }}
            // Krótsza podpowiedź: „Wpisz miasto lub kraj…" potrzebowało 184 px
            // przy 152 dostępnych i urywało się w połowie słowa. Czasownik nic
            // nie wnosił — etykieta nad polem mówi już „DOKĄD".
            placeholder="Miasto lub kraj"
            autoComplete="off"
            className={fieldCls}
          />
          {destOpen && (
            <ul
              id={listboxId}
              ref={destListRef}
              role="listbox"
              // Wysokość: na telefonie 60vh (lista 20 kierunków w oknie 256 px
              // to było pięć widocznych wierszy i trzy ekrany przewijania),
              // na desktopie sufit 24rem, żeby panel nie zjadał całej strony.
              // overscroll-contain: przewijanie listy nie ciągnie za sobą tła.
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain rounded-md border border-line bg-surface-raised py-1 shadow-[var(--shadow-lg)]"
            >
              {destFetching ? (
                // Szkielet, nie napis „Szukamy kierunków…". Odkąd zapytania
                // spoza seeda idą do LiteAPI (~250–340 ms), lista potrafi się
                // przebudować w locie — sam tekst kazał czekać na PUSTYM polu
                // i wyglądał jak brak wyników. Szkielet o wymiarach docelowych
                // wierszy pokazuje, ILE zaraz przyjdzie, i nie przesuwa układu,
                // gdy dane dojdą.
                <li role="presentation" className="space-y-1 px-3 py-2">
                  {/* aria-hidden TYLKO na kształtach — gdyby siedziało na <li>,
                      ukryłoby też komunikat dla czytnika ekranu poniżej. */}
                  <div aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex min-h-[52px] flex-col justify-center gap-1.5">
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
                    // `role="group"` z etykietą, nie „presentation": listbox
                    // dopuszcza dzieci `option` ALBO `group`, a grupa niesie
                    // czytnikowi ekranu nazwę sekcji („Na plażę"), której samo
                    // `presentation` by nie przekazało. Sekcja bez nagłówka
                    // (wyniki wpisanego tekstu) zostaje przezroczysta.
                    role={section.label ? "group" : "presentation"}
                    aria-label={section.label ?? undefined}
                  >
                    {section.label && (
                      // Sticky: przy 20 pozycjach nagłówek grupy wyjeżdża
                      // z ekranu po dwóch wierszach i użytkownik przestaje
                      // wiedzieć, na co patrzy. aria-hidden, bo tę samą nazwę
                      // niesie już aria-label grupy — inaczej czytnik przeczyta ją dwa razy.
                      <p
                        aria-hidden
                        className="sticky top-0 z-10 bg-surface-raised px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
                      >
                        {section.label}
                      </p>
                    )}
                    <ul role="presentation">
                      {section.rows.map(({ item: s, index: idx }) => {
                        // Zadanie 2 — wyspy z oznaczeniem typu ("wyspa · Hiszpania").
                        const isRegion = s.kind === "region";
                        const isHotel = s.kind === "hotel";
                        const ctry = localizeCountry(s.country);
                        const reg = isRegion ? "wyspa" : localizeRegion(s.region);
                        // Podpowiedź redakcyjna („Kreta" przy Heraklionie) bije
                        // nazwę regionu z seeda: to jest słowo, którego
                        // użytkownik realnie szuka.
                        // Hotel pokazuje ADRES — dwa obiekty o tej samej nazwie
                        // w jednym mieście to norma, a nazwa sama ich nie rozróżni.
                        const meta = isHotel
                          ? (s.secondary ?? ctry)
                          : isRegion
                            ? [reg, ctry].filter(Boolean).join(" · ")
                            : [s.hint ?? reg, ctry].filter(Boolean).join(" · ");
                        const Icon = suggestionIcon(s);
                        return (
                          <li
                            key={s.id}
                            // id zgodne z aria-activedescendant na inpucie —
                            // indeks jest PŁASKI, ten sam, którym operują strzałki.
                            id={`${listboxId}-opt-${idx}`}
                            role="option"
                            aria-selected={idx === destHighlight}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectSuggestion(s);
                            }}
                            onMouseEnter={() => setDestHighlight(idx)}
                            // min-h-[52px]: wiersz listy to cel dotykowy, a
                            // py-2 dawało ~40 px. 90% ruchu to telefon.
                            className={`flex min-h-[52px] cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors ${
                              idx === destHighlight ? "bg-brand-soft" : "hover:bg-surface-sunken"
                            }`}
                          >
                            {/* Ikona typu — jak na Bookingu. `aria-hidden`, bo
                                informację o typie niesie już tekst pod nazwą
                                („wyspa · Hiszpania", adres hotelu); dla czytnika
                                ekranu byłaby drugą, gorszą kopią tej samej rzeczy. */}
                            <span
                              aria-hidden
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted"
                            >
                              <Icon className="h-4 w-4" strokeWidth={2} />
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold text-ink">
                                {s.cityPl ?? localizeCity(s.city)}
                              </span>
                              {meta && <span className="truncate text-xs text-ink-muted">{meta}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))
              ) : (
                <li className="px-3 py-3 text-sm text-ink-muted">
                  Brak wyników dla „{destQuery}&rdquo;. Spróbuj innego miasta lub kraju.
                </li>
              )}
            </ul>
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
          className="group relative h-14 overflow-hidden whitespace-nowrap rounded-sm bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 font-bold uppercase tracking-[0.06em] text-white shadow-[0_10px_30px_rgba(234,88,12,0.45)] transition hover:shadow-[0_14px_40px_rgba(234,88,12,0.6)] focus:outline-none focus:ring-4 focus:ring-amber-300/60 disabled:cursor-progress disabled:opacity-80"
        >
          {/* Rozmiar pisma NA SPANIE, nie na <button>: reset poza warstwami CSS
              wymusza na przyciskach `font-size: inherit`, wiec klasa na samym
              przycisku jest martwa (patrz komentarz przy `fieldCls`). Etykieta
              zostaje przy 16 px — przy 18 px „Szukaj lotow" nie miescilo sie
              w kolumnie siatki w trybie lotow (zmierzone: brakowalo 7 px). */}
          <span className="relative z-10 flex items-center justify-center gap-2 text-base">
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
