"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { LocalizedLink } from "@/components/site/localized-link";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { postJson } from "@/lib/fetch-json";

const PanelSkeleton = () => (
  <div className="glass-panel rounded-[2rem] border border-emerald-900/10 p-6">
    <div className="h-4 w-32 animate-pulse rounded bg-emerald-100" />
    <div className="mt-4 h-24 animate-pulse rounded-2xl bg-emerald-50" />
  </div>
);

const ActivityOffersPanel = dynamic(
  () => import("@/components/mvp/activity-offers-panel").then((m) => m.ActivityOffersPanel),
  { loading: PanelSkeleton, ssr: false },
);
const DestinationAttractionsPanel = dynamic(
  () => import("@/components/mvp/destination-attractions-panel").then((m) => m.DestinationAttractionsPanel),
  { loading: PanelSkeleton, ssr: false },
);
const FlightOffersPanel = dynamic(
  () => import("@/components/mvp/flight-offers-panel").then((m) => m.FlightOffersPanel),
  { loading: PanelSkeleton, ssr: false },
);
const StayOffersPanel = dynamic(
  () => import("@/components/mvp/stay-offers-panel").then((m) => m.StayOffersPanel),
  { loading: PanelSkeleton, ssr: false },
);
const TransferOffersPanel = dynamic(
  () => import("@/components/mvp/transfer-offers-panel").then((m) => m.TransferOffersPanel),
  { loading: PanelSkeleton, ssr: false },
);
import { PlannerForm, type PlannerFormText } from "@/components/mvp/planner-form";
import { SettingsDrawer } from "@/components/mvp/settings-drawer";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { sendClientEvent } from "@/lib/mvp/client-events";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import {
  getPlannerSnapshot,
  getComparedDestinations,
  getSavedSearches,
  getRecentDiscoveryBriefs,
  getSavedDestinations,
  pushComparedDestination,
  pushRecentDiscoveryBrief,
  pushSavedSearch,
  savePlannerSnapshot,
  toggleSavedDestination,
  type ComparedDestinationMemory,
  type PlannerSnapshot,
  type RecentDiscoveryBrief,
  type SavedDestinationMemory,
  type SavedSearchMemory,
} from "@/lib/mvp/planner-memory";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import {
  countNightsBetweenIsoDates,
  defaultTravelStartDate,
  formatShortDate,
  isoDateToMonth,
  normalizeTravelEndDate,
} from "@/lib/mvp/travel-dates";
import type { DestinationSuggestion, DiscoveryResponse, SavedTripSnapshot, SavedTripView } from "@/lib/mvp/types";

type Mode = "discovery" | "standard";

const discoveryPresets = {
  pl: [
    "Ciepły kierunek na 5 dni z plażą i zwiedzaniem do 2000 zł.",
    "Krótki city break z dobrym jedzeniem i lekkim lotem z Polski.",
    "Romantyczny wyjazd z widokami i spokojnym rytmem.",
  ],
  en: [
    "A warm 5-day destination with beach time and sightseeing under 2000 PLN.",
    "A short city break with great food and an easy flight from Poland.",
    "A romantic trip with views and a slower pace.",
  ],
} as const;

const standardPresets = {
  pl: ["Malaga", "Barcelona", "Lizbona", "Walencja"],
  en: ["Malaga", "Barcelona", "Lisbon", "Valencia"],
} as const;

const plannerCopy = {
  pl: {
    heroEyebrow: "Planner",
    heroTitle: "Zaplanuj wyjazd w kilku prostych krokach.",
    heroBody: "Wybierz kierunek albo opisz, jakiego wyjazdu szukasz. Potem ustaw termin i przejdź do noclegów, lotów oraz dalszych kroków.",
    modeStandard: "Mam kierunek",
    modeDiscovery: "Pomóż mi wybrać",
    describeTrip: "Powiedz, jakiego wyjazdu szukasz",
    discoveryPlaceholder: "Np. ciepły kierunek na 5 dni z plażą, zwiedzaniem i budżetem do 2000 zł.",
    budget: "Budżet",
    minDays: "Minimum dni",
    maxDays: "Maksimum dni",
    direction: "Kierunek",
    mainPath: "Co zobaczysz dalej",
    mainPathBody: "Po wybraniu kierunku pokazujemy najpierw noclegi, a potem loty i rzeczy do ogarnięcia na miejscu.",
    sharedParams: "Dane wyjazdu",
    sharedTitle: "Termin i skład",
    origin: "Skąd lecisz",
    travelStart: "Data wyjazdu",
    nights: "Data powrotu",
    travelers: "Podróżni",
    rooms: "Pokoje",
    quickPreview: "Szybki podglad",
    travelersShort: "os.",
    roomSingle: "pokoj",
    roomFew: "pokoje",
    roomMany: "pokoi",
    loadingPlan: "Ukladamy plan...",
    planError: "Nie udalo sie przygotowac planu.",
    showStayFlights: "Pokaż noclegi i loty",
    savedPlans: "Twoje plany",
    savedPlansBody: "Zapisane wyjazdy, do których możesz wróćic.",
    savedEmpty: "Po pierwszym wyniku tutaj pojawia sie zapisane scenariusze.",
    savedSearches: "Ostatnie wyszukiwania",
    savedSearchesBody: "Wrócisz do poprzednich ustawień bez wpisywania wszystkiego od nowa.",
    savedSearchesEmpty: "Po pierwszym uruchomieniu planera zapisze sie tutaj najnowszy brief albo gotowe wyszukiwanie.",
    reopenSearch: "Otwórz wyszukiwanie",
    recentBriefs: "Ostatnie opisy wyjazdu",
    recentBriefsBody: "Możesz szybko wrzucic znowu jeden z ostatnich opisow.",
    continuePlanning: "Ostatni plan",
    continuePlanningBody: "Masz już zapisane ostatnie ustawienia planera.",
    restoreSettings: "Przywróć ustawienia",
    savedDestinations: "Zapisane kierunki",
    savedDestinationsBody: "Własna shortlista kierunków do porównania i powrotu.",
    noSavedDestinations: "Po zapisaniu kierunku pojawi sie tutaj szybki dostęp do jego strony i planera.",
    comparisonMemory: "Ostatnio porównywane",
    comparisonMemoryBody: "Tutaj wracaja kierunki, które porównywałeś obok głównej propozycji.",
  comparisonMemoryEmpty: "Kiedy zaczniesz przełączać alternatywy, pojawi się tutaj ostatnio porównywane miasta.",
    compareAgain: "Porównaj ponownie",
    saveTrip: "Zapisz plan",
    savingTrip: "Zapisywanie...",
    bookNow: "Zarezerwuj",
    saveTripDone: "Plan zapisany",
    saveDestination: "Zapisz kierunek",
    savedDestination: "Kierunek zapisany",
    interpretedBrief: "Jak zrozumielismy ten opis",
    interpretedBriefBody: "Pokazujemy, co wzięliśmy pod uwage przy wyborze kierunków.",
    methodologyTitle: "Co bierzemy pod uwage",
    methodologyBody: "Patrzymy na pogode, budżet, wygodę dolotu i to, czy kierunek pasuje do stylu wyjazdu.",
    decodedBudget: "Budżet",
    decodedClimate: "Klimat",
    decodedTransfer: "Przesiadki",
    decodedFocus: "Wskazany kierunek",
    decodedTravelStyle: "Najmocniejsze potrzeby",
    scoreWord: "dopasowanie",
    selectedRoute: "Wybrana trasa",
    bestForBrief: "Najlepszy kierunek dla tego briefu",
    score: "Wynik",
    term: "Termin",
    travelParty: "Sklad podróży",
    whyNow: "Dlaczego teraz",
    exactMatch: "Kierunek dokładnie odpowiada wskazanemu miastu.",
    openStay: "Zobacz pobyt w",
    openFlights: "Sprawdź loty w",
    openCars: "Auta w",
    bookingSettings: "Zmień trasę lub daty",
    bookingSettingsBody: "Ten panel odświeża cały plan.",
    remainingOptions: "Pozostałe propozycje",
    similarDirections: "Podobne kierunki obok głównego wybóru",
    bestAlternatives: "Najlepsze alternatywy",
  remainingBody: "Szybko porównasz klimat, argumenty dopasowania i przełączysz się na inny kierunek bez wracania do początku.",
    position: "Pozycja",
    whyFits: "Dlaczego pasuje",
    watchOut: "Na co uważać",
    noTradeoffs: "Brak wyraźnych minusów przy tym opisie.",
    bookingDeckStay: "Pobyt",
    bookingDeckFlights: "Loty",
    bookingDeckCars: "Auta",
    bookingDeckActivities: "Atrakcje",
    bookingDeckStayBody: "Zacznij od noclegów dla tego samego terminu i liczby osób.",
    bookingDeckFlightsBody: "Masz już ustawioną trasę i termin, więc nie wracasz do pustego startu.",
    bookingDeckCarsBody: "Mobilnosc na miejscu bez ponownego wpisywania kierunku.",
    bookingDeckActivitiesBody: "Przejdź dalej do atrakcji i transferów dla tego samego pobytu.",
    showStay: "Pokaż pobyt",
    showFlights: "Pokaż loty",
    showCars: "Pokaż auta",
    showOnSite: "Pokaż na miejscu",
    openPlan: "Otwórz plan",
    mobileBarEyebrow: "Gotowe do dalszego ruchu",
    mobileBarBody: "Najpierw pobyt, potem loty i zapis planu bez gubienia ustawień.",
    mobileQuickActions: "Szybkie sterowanie",
    mobileQuickBody: "Skocz do sekcji albo popraw trasę bez skanowania całej strony wyników.",
    editTrip: "Edytuj plan",
    closeTripEditor: "Schowaj edycje",
    closeLabel: "Zamknij",
    withChildren: "Z dziecmi",
    childrenCount: "Dzieci (2-11 lat)",
    infants: "Niemowleta (0-1 rok)",
    detailsLabel: "Szczegoly",
    tabStays: "Pobyt",
    tabFlights: "Loty",
    tabAttractions: "Atrakcje",
    tabCars: "Auta",
    carsTabTitle: "Wynajem aut w",
    carsTabBody: "Otworz porownywarke aut u naszego partnera. Mobilnosc na miejscu bez ponownego wpisywania kierunku.",
    carsTabCta: "Otworz porownywarke aut",
    topChoiceSummary: "Dlaczego to dobry wybór",
    topChoiceSummaryBody: "Najpierw sprawdź noclegi, potem loty i najblizsze alternatywy.",
    resultsNavigator: "Przejdź dalej",
    resultsNavigatorBody: "Skocz od razu do najważniejszej sekcji bez skanowania całej strony wyników.",
    jumpToStays: "Do pobytu",
    jumpToFlights: "Do lotów",
    jumpToGuide: "Do przewodnika",
    jumpToOnSite: "Na miejscu",
    destinationPlaceholder: "Np. Malaga",
    destinationSearching: "Szukamy kierunków...",
    destinationEmpty: "Brak dopasowań. Spróbuj wpisać inne miasto lub kraj.",
    refreshFlow: "Odśwież pobyt i loty",
    bookingSettingsHint: "Zmień kierunek albo daty i odśwież wyniki.",
    originPlaceholder: "Warszawa",
    primaryFlow: "Po kliknięciu",
    hotelFirst: "Najpierw zobaczysz noclegi, potem loty i dalsze kroki.",
    selectedDatesValue: "noce",
    resultRank: "Pozycja",
    directPrompt: "Podobne kierunki obok głównego wybóru",
    discoveryPrompt: "Najlepsze alternatywy",
    whyItFits: "Dlaczego pasuje",
    watchLabel: "Na co uwazac",
    openCatalog: "Otwórz katalog kierunków",
    bookingDeckOnSite: "Na miejscu",
    decisionLenses: "Szybkie porównańie",
    decisionLensesBody: "Obok głównego rankingu pokazujemy tez, który kierunek wygrywa wartoscia, prostota dolotu i pewniejsza pogoda.",
    lensBestFit: "Najlepszy fit",
    lensBestValue: "Najlepsza wartosc",
    lensEasiest: "Najłatwiejszy dolot",
    lensWarmest: "Najpewniejsza pogoda",
    lensOpen: "Ustaw ten kierunek",
    lensTagBestFit: "fit",
    lensTagBestValue: "value",
    lensTagEasiest: "easy",
    lensTagWarmest: "weather",
  },
  en: {
    heroEyebrow: "Planner",
    heroTitle: "Plan the trip in a few simple steps.",
    heroBody: "Choose a destination or describe the kind of trip you want. Then set the dates and move into stays, flights and the next steps.",
    modeStandard: "I know the destination",
    modeDiscovery: "Help me choose",
    describeTrip: "Describe the trip",
    discoveryPlaceholder: "E.g. a warm 5-day trip with a beach, sightseeing and a budget under 2000 PLN.",
    budget: "Budget",
    minDays: "Minimum days",
    maxDays: "Maximum days",
    direction: "Destination",
    mainPath: "What happens next",
    mainPathBody: "After you choose the destination, we start with stays and then move into flights and the next trip steps.",
    sharedParams: "Trip details",
    sharedTitle: "Dates and travelers",
    origin: "Flying from",
    travelStart: "Trip start",
    nights: "Return date",
    travelers: "Travelers",
    rooms: "Rooms",
    quickPreview: "Quick preview",
    travelersShort: "trav.",
    roomSingle: "room",
    roomFew: "rooms",
    roomMany: "rooms",
    loadingPlan: "Building your plan...",
    planError: "Could not build the trip plan.",
    showStayFlights: "Show stays and flights",
    savedPlans: "Saved plans",
    savedPlansBody: "Saved trips you can reopen quickly.",
    savedEmpty: "Saved scenarios will appear here after the first result.",
    savedSearches: "Recent searches",
    savedSearchesBody: "Go back to previous settings without rebuilding the form.",
    savedSearchesEmpty: "Your first planner run will save the latest brief or direct search here.",
    reopenSearch: "Open search",
    recentBriefs: "Recent trip descriptions",
    recentBriefsBody: "Reuse one of your latest descriptions in a click.",
    continuePlanning: "Latest plan",
    continuePlanningBody: "Your latest planner setup is saved here.",
    restoreSettings: "Restore setup",
    savedDestinations: "Saved destinations",
    savedDestinationsBody: "A short list of destinations worth revisiting and comparing.",
    noSavedDestinations: "Saved destinations will appear here once you keep a place for later.",
    comparisonMemory: "Recently compared",
    comparisonMemoryBody: "Destinations you compared next to the main pick come back here.",
    comparisonMemoryEmpty: "As soon as you switch between alternatives, your recent comparisons will appear here.",
    compareAgain: "Compare again",
    saveTrip: "Save plan",
    savingTrip: "Saving...",
    bookNow: "Book now",
    saveTripDone: "Plan saved",
    saveDestination: "Save destination",
    savedDestination: "Destination saved",
    interpretedBrief: "How we understood your trip description",
    interpretedBriefBody: "We show the signals that mattered most in the ranking.",
    methodologyTitle: "What we take into account",
    methodologyBody: "We look at weather, budget, route effort and how well the place fits the style of trip you want.",
    decodedBudget: "Budget",
    decodedClimate: "Climate",
    decodedTransfer: "Transfers",
    decodedFocus: "Focused destination",
    decodedTravelStyle: "Strongest needs",
    scoreWord: "fit",
    selectedRoute: "Selected route",
    bestForBrief: "Best destination for this brief",
    score: "Score",
    term: "Dates",
    travelParty: "Travel party",
    whyNow: "Why now",
    exactMatch: "This destination exactly matches the selected city.",
    openStay: "Open stay on",
    openFlights: "Check flights on",
    openCars: "Cars on",
    bookingSettings: "Change route or dates",
    bookingSettingsBody: "This panel refreshes the whole plan.",
    remainingOptions: "More options",
    similarDirections: "Similar destinations next to the main pick",
    bestAlternatives: "Best alternatives",
    remainingBody: "Quickly compare the vibe, fit arguments and switch to another destination without starting over.",
    position: "Position",
    whyFits: "Why it fits",
    watchOut: "What to watch",
    noTradeoffs: "No clear downsides for this brief.",
    bookingDeckStay: "Stays",
    bookingDeckFlights: "Flights",
    bookingDeckCars: "Cars",
    bookingDeckActivities: "Activities",
    bookingDeckStayBody: "The most important click after picking the city. Opens ready stay results for these dates.",
    bookingDeckFlightsBody: "You move straight to flight results with the route and dates already set.",
    bookingDeckCarsBody: "On-the-ground mobility without re-entering the destination.",
    bookingDeckActivitiesBody: "Continue into activities and transfers for the same stay window.",
    showStay: "Show stays",
    showFlights: "Show flights",
    showCars: "Show cars",
    showOnSite: "Show on-site",
    openPlan: "Open plan",
    mobileBarEyebrow: "Ready for the next move",
    mobileBarBody: "Lead with stays, then flights, and keep the plan saved without losing the setup.",
    mobileQuickActions: "Quick controls",
    mobileQuickBody: "Jump between sections or reopen the route editor without scanning the whole results page.",
    editTrip: "Edit plan",
    closeTripEditor: "Hide editor",
    closeLabel: "Close",
    withChildren: "With children",
    childrenCount: "Children (2-11 yrs)",
    infants: "Infants (0-1 yr)",
    detailsLabel: "Details",
    tabStays: "Stays",
    tabFlights: "Flights",
    tabAttractions: "Activities",
    tabCars: "Cars",
    carsTabTitle: "Car rental in",
    carsTabBody: "Open the car rental comparison with our partner — local mobility without retyping the destination.",
    carsTabCta: "Open car rental comparison",
    topChoiceSummary: "Why this is a good choice",
    topChoiceSummaryBody: "Start with stays, then check flights and the closest alternatives.",
    resultsNavigator: "Go to the next step",
    resultsNavigatorBody: "Jump straight into the section you need most.",
    jumpToStays: "Go to stays",
    jumpToFlights: "Go to flights",
    jumpToGuide: "Go to guide",
    jumpToOnSite: "On site",
    destinationPlaceholder: "E.g. Malaga",
    destinationSearching: "Looking for destinations...",
    destinationEmpty: "No matches yet. Try another city or country.",
    refreshFlow: "Refresh stays and flights",
    bookingSettingsHint: "Change the destination or dates, then refresh the results.",
    originPlaceholder: "Warsaw",
    primaryFlow: "After you click",
    hotelFirst: "You will see stays first, then flights and the next trip steps.",
    selectedDatesValue: "nights",
    resultRank: "Position",
    directPrompt: "Similar destinations next to your main pick",
    discoveryPrompt: "Best alternatives",
    whyItFits: "Why it fits",
    watchLabel: "Watch-outs",
    openCatalog: "Open destination catalog",
    bookingDeckOnSite: "On site",
    decisionLenses: "Quick comparison",
    decisionLensesBody: "Alongside the main ranking, we show which destination wins on fit, value, easier routing and weather confidence.",
    lensBestFit: "Best fit",
    lensBestValue: "Best value",
    lensEasiest: "Easiest route",
    lensWarmest: "Best weather",
    lensOpen: "Set this destination",
    lensTagBestFit: "fit",
    lensTagBestValue: "value",
    lensTagEasiest: "easy",
    lensTagWarmest: "weather",
  },
} as const;

const scoreLabel = (score: number, locale: "pl" | "en") =>
  locale === "pl"
    ? score >= 82
      ? "Bardzo mocne dopasowanie"
      : score >= 70
        ? "Dobre dopasowanie"
        : "Warto sprawdzić"
    : score >= 82
      ? "Very strong match"
      : score >= 70
        ? "Good match"
        : "Worth checking";

interface PlannerClientProps {
  initialMode?: Mode;
  initialQuery?: string;
  initialOriginCity?: string;
  initialDestinationHint?: string;
  initialTravelers?: number;
  initialBudget?: number;
  initialStandardDays?: number;
  initialStyle?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialNights?: number;
  autoRunStandardSearch?: boolean;
  locale?: SiteLocale;
}

export function PlannerClient({
  initialMode = "discovery",
  initialQuery = "",
  initialOriginCity = "",
  initialDestinationHint = "",
  initialTravelers = 2,
  initialBudget = 2500,
  initialStandardDays = 4,
  initialStyle = "city break",
  initialStartDate,
  initialEndDate,
  initialNights,
  autoRunStandardSearch = false,
  locale: localeOverride,
}: PlannerClientProps) {
  const pathname = usePathname();
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? localeFromPathname(pathname) ?? contextLocale;
  const text = plannerCopy[locale];
  const dateLocale = locale === "en" ? "en-GB" : "pl-PL";
  const localizedDiscoveryPresets = locale === "en" ? discoveryPresets.en : discoveryPresets.pl;
  const localizedStandardPresets = locale === "en" ? standardPresets.en : standardPresets.pl;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [savedTrips, setSavedTrips] = useState<SavedTripView[]>([]);
  const [recentBriefs, setRecentBriefs] = useState<RecentDiscoveryBrief[]>([]);
  const [savedDestinations, setSavedDestinations] = useState<SavedDestinationMemory[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchMemory[]>([]);
  const [comparedDestinations, setComparedDestinations] = useState<ComparedDestinationMemory[]>([]);
  const [lastSnapshot, setLastSnapshot] = useState<PlannerSnapshot | null>(null);
  const [showPlanningMemory, setShowPlanningMemory] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [destinationSuggestions, setDestinationSuggestions] = useState<DestinationSuggestion[]>([]);
  const [isSuggestingDestinations, setIsSuggestingDestinations] = useState(false);
  const [destinationSuggestionsOpen, setDestinationSuggestionsOpen] = useState(false);
  const autoSearchRef = useRef(false);
  const shouldFocusOffersRef = useRef(false);
  const stayOffersRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [withChildren, setWithChildren] = useState(false);
  const [childrenCount, setChildrenCount] = useState(0);
  const [infants, setInfants] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"stays" | "flights" | "attractions" | "cars">("stays");

  const [query, setQuery] = useState(
    initialQuery ||
      (locale === "en"
        ? "I want a warm destination for 5 days with a beach, sightseeing and a budget under 2000 PLN."
    : "Chcę polecieć do ciepłego kraju do 2000 zł na 5 dni, bez wizy, z plażą i zwiedzaniem."),
  );
  const [budget, setBudget] = useState(initialBudget);
  const [travelers, setTravelers] = useState(initialTravelers);
  const [rooms, setRooms] = useState(1);
  const [durationMin, setDurationMin] = useState(4);
  const [durationMax, setDurationMax] = useState(5);
  const [originCity, setOriginCity] = useState(initialOriginCity || "Warszawa");
  const [destinationHint, setDestinationHint] = useState(
    initialDestinationHint || (initialMode === "standard" && initialQuery ? initialQuery : "Malaga"),
  );
  const [travelStartDate, setTravelStartDate] = useState(initialStartDate || defaultTravelStartDate());
  const [travelEndDate, setTravelEndDate] = useState(
    normalizeTravelEndDate(
      initialStartDate || defaultTravelStartDate(),
      initialEndDate,
      initialNights ?? initialStandardDays,
    ),
  );
  const [travelNights, setTravelNights] = useState(initialNights ?? initialStandardDays);
  const [standardStyle] = useState(initialStyle);

  useEffect(() => {
    setTravelEndDate((current) => normalizeTravelEndDate(travelStartDate, current, travelNights));
  }, [travelStartDate, travelNights]);

  useEffect(() => {
    const nextNights = countNightsBetweenIsoDates(travelStartDate, travelEndDate, travelNights);
    setTravelNights((current) => (current === nextNights ? current : nextNights));
  }, [travelEndDate, travelStartDate, travelNights]);

  useEffect(() => {
    fetch("/api/trips/history")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSavedTrips(data?.items ?? []))
      .catch(() => setSavedTrips([]));

    setRecentBriefs(getRecentDiscoveryBriefs());
    setSavedDestinations(getSavedDestinations());
    setSavedSearches(getSavedSearches());
    setComparedDestinations(getComparedDestinations());
    setLastSnapshot(getPlannerSnapshot());
  }, []);

  useEffect(() => {
    if (mode !== "standard" || destinationHint.trim().length < 2) {
      setDestinationSuggestions([]);
      setIsSuggestingDestinations(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsSuggestingDestinations(true);
        const response = await fetch(`/api/destinations/suggest?q=${encodeURIComponent(destinationHint.trim())}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({ items: [] }))) as { items?: DestinationSuggestion[] };
        setDestinationSuggestions(payload.items ?? []);
      } catch {
        setDestinationSuggestions([]);
      } finally {
        setIsSuggestingDestinations(false);
      }
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [destinationHint, mode]);

  const executePlanner = async (input: {
    mode: Mode;
    query: string;
    destinationHint: string;
    originCity: string;
    budget: number;
    travelers: number;
    rooms: number;
    durationMin: number;
    durationMax: number;
    travelStartDate: string;
    travelEndDate: string;
    travelNights: number;
  }) => {
    setLoading(true);
    setError("");

    try {
      const departureMonth = isoDateToMonth(input.travelStartDate);
      const data =
        input.mode === "discovery"
          ? await postJson<DiscoveryResponse>("/api/discovery", {
              query: input.query,
              originCity: input.originCity,
              travelers: input.travelers,
              budgetMaxPln: input.budget,
              durationMinDays: input.durationMin,
              durationMaxDays: input.durationMax,
              departureMonth,
            })
          : await postJson<DiscoveryResponse>("/api/standard", {
              originCity: input.originCity,
              destinationHint: input.destinationHint,
              travelers: input.travelers,
              budgetMaxPln: input.budget,
              durationDays: input.travelNights,
              departureMonth,
              style: standardStyle,
            });

      startTransition(() => {
        setResult(data);
        setSelectedOptionId(data.options[0]?.itineraryResultId ?? "");
      });

      const nextSnapshot: PlannerSnapshot = {
        mode: input.mode,
        query: input.query,
        destinationHint: input.destinationHint,
        originCity: input.originCity,
        budget: input.budget,
        travelers: input.travelers,
        rooms: input.rooms,
        durationMin: input.durationMin,
        durationMax: input.durationMax,
        travelStartDate: input.travelStartDate,
        travelEndDate: input.travelEndDate,
        travelNights: input.travelNights,
        selectedDestinationSlug: data.options[0]?.destination.slug,
        selectedDestinationLabel: data.options[0]
          ? `${data.options[0].destination.city}, ${data.options[0].destination.country}`
          : undefined,
        savedAt: new Date().toISOString(),
      };

      savePlannerSnapshot(nextSnapshot);
      setLastSnapshot(nextSnapshot);

      const nextSavedSearches = pushSavedSearch({
        mode: input.mode,
        label:
          input.mode === "discovery"
            ? input.query.slice(0, 82)
            : `${input.originCity} - ${input.destinationHint}`,
        query: input.query,
        destinationHint: input.destinationHint,
        originCity: input.originCity,
        budget: input.budget,
        travelers: input.travelers,
        rooms: input.rooms,
        travelStartDate: input.travelStartDate,
        travelEndDate: input.travelEndDate,
        travelNights: input.travelNights,
        topDestinationSlug: data.options[0]?.destination.slug,
        topDestinationLabel: data.options[0]
          ? `${data.options[0].destination.city}, ${data.options[0].destination.country}`
          : undefined,
      });
      setSavedSearches(nextSavedSearches);
      sendClientEvent("search_saved", {
        mode: input.mode,
        destinationHint: input.destinationHint,
        query: input.mode === "discovery" ? input.query : input.destinationHint,
        topDestinationSlug: data.options[0]?.destination.slug,
      });

      if (data.options[0]) {
        setComparedDestinations(
          pushComparedDestination({
            slug: data.options[0].destination.slug,
            city: data.options[0].destination.city,
            country: data.options[0].destination.country,
            score: data.options[0].score,
            rationale: data.options[0].reasons[0],
          }),
        );
      }

      if (input.mode === "discovery" && input.query.trim().length >= 16) {
        setRecentBriefs(pushRecentDiscoveryBrief(input.query));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : text.planError);
    } finally {
      setLoading(false);
    }
  };

  const runPlanner = async () => {
    shouldFocusOffersRef.current = true;
    setDestinationSuggestionsOpen(false);
    sendClientEvent("planner_submitted", {
      mode,
      destinationHint,
      query: mode === "discovery" ? query : destinationHint,
      originCity,
      travelers,
      travelStartDate,
      travelEndDate: checkOutDate,
    });
    await executePlanner({
      mode,
      query,
      destinationHint,
      originCity,
      budget,
      travelers,
      rooms,
      durationMin,
      durationMax,
      travelStartDate,
      travelEndDate: checkOutDate,
      travelNights,
    });
  };

  const triggerInitialStandardSearch = useEffectEvent(() => {
    void runPlanner();
  });

  const revealOffers = useEffectEvent(() => {
    setActiveTab("stays");
    window.requestAnimationFrame(() => {
      stayOffersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const openMobileSettings = () => {
    setSettingsOpen(true);
  };

  useEffect(() => {
    if (!autoRunStandardSearch || autoSearchRef.current) return;
    if (mode !== "standard" || !destinationHint.trim()) return;
    autoSearchRef.current = true;
    triggerInitialStandardSearch();
  }, [autoRunStandardSearch, destinationHint, mode]);

  useEffect(() => {
    if (selectedOptionId) {
      setSettingsOpen(false);
    }
  }, [selectedOptionId]);

  const selectedOption =
    result?.options.find((option) => option.itineraryResultId === selectedOptionId) ?? result?.options[0] ?? null;
  const selectedStory = selectedOption ? getDestinationStory(selectedOption.destination) : null;
  const destinationFocus = result?.interpreted.destinationFocus;
  const localFocus = Boolean(destinationFocus && selectedOption && selectedOption.destination.slug === destinationFocus);
  const checkOutDate = normalizeTravelEndDate(travelStartDate, travelEndDate, travelNights);
  const activeAffiliateLinks = selectedOption
    ? buildAffiliateLinksWithContext({
        city: selectedOption.destination.city,
        country: selectedOption.destination.country,
        originCity,
        departureDate: travelStartDate,
        checkInDate: travelStartDate,
        checkOutDate,
        passengers: travelers,
        rooms,
      })
    : null;
  const flightPartner = getAffiliateBrandLabel(activeAffiliateLinks?.flights, "Partner lotniczy");
  const stayPartner = getAffiliateBrandLabel(activeAffiliateLinks?.stays, "Partner noclegówy");
  const carPartner = getAffiliateBrandLabel(activeAffiliateLinks?.cars, "Partner mobilnosci");
  const isDirectRouteSearch = mode === "standard" && Boolean(originCity.trim()) && Boolean(destinationHint.trim());
  const savedDestinationSet = new Set(savedDestinations.map((item) => item.slug));
  const isSelectedDestinationSaved = selectedOption ? savedDestinationSet.has(selectedOption.destination.slug) : false;
  const interpretedBriefChips = [
    `${text.decodedBudget}: ${result?.interpreted.budgetMaxPln ?? budget} PLN`,
    `${text.term}: ${
      result
        ? `${result.interpreted.durationMinDays}-${result.interpreted.durationMaxDays} ${locale === "en" ? "days" : "dni"}`
        : `${travelNights} ${locale === "en" ? "days" : "dni"}`
    }`,
    `${text.decodedClimate}: ${
      result?.interpreted.temperaturePreference === "hot"
        ? locale === "en"
          ? "hot"
          : "goraco"
        : result?.interpreted.temperaturePreference === "warm"
          ? locale === "en"
            ? "warm"
            : "cieplo"
          : locale === "en"
            ? "flexible"
            : "elastycznie"
    }`,
    `${text.decodedTransfer}: ${
      result?.interpreted.maxTransfers === 0
        ? locale === "en"
          ? "direct only"
          : "bez przesiadek"
        : locale === "en"
          ? `up to ${result?.interpreted.maxTransfers ?? 1}`
          : `do ${result?.interpreted.maxTransfers ?? 1}`
    }`,
  ];

  if (result?.interpreted.destinationFocus && selectedOption) {
    interpretedBriefChips.push(`${text.decodedFocus}: ${selectedOption.destination.city}`);
  }

  const handleDestinationInputFocus = () => {
    if (mode === "standard") {
      setDestinationSuggestionsOpen(true);
    }
  };

  const handleDestinationInputChange = (value: string) => {
    setDestinationHint(value);
    setDestinationSuggestionsOpen(true);
  };

  const handleDestinationSuggestionSelect = (suggestion: DestinationSuggestion) => {
    setDestinationHint(suggestion.queryValue);
    setDestinationSuggestionsOpen(false);
  };

  const decisionLenses = useMemo<DecisionLensCard[]>(() => {
    if (!result?.options.length) {
      return [];
    }

    const byScore = [...result.options].sort((left, right) => right.score - left.score)[0];
    const byValue = [...result.options].sort(
      (left, right) =>
        right.breakdown.valueFit + right.breakdown.budgetFit * 0.6 - right.breakdown.penalties * 0.4 -
        (left.breakdown.valueFit + left.breakdown.budgetFit * 0.6 - left.breakdown.penalties * 0.4),
    )[0];
    const byEasy = [...result.options].sort(
      (left, right) =>
        right.breakdown.logisticsFit + right.breakdown.travelEase * 0.5 - right.breakdown.penalties * 0.5 -
        (left.breakdown.logisticsFit + left.breakdown.travelEase * 0.5 - left.breakdown.penalties * 0.5),
    )[0];
    const byWeather = [...result.options].sort(
      (left, right) => right.breakdown.weatherFit - left.breakdown.weatherFit,
    )[0];

    const lensCandidates: DecisionLensCard[] = [
      {
        key: "fit",
        title: text.lensBestFit,
        body:
          locale === "en"
            ? `${byScore.destination.city} wins the broadest match across budget, intent and trip shape.`
            : `${byScore.destination.city} wygrywa najbardziej pełnym dopasowaniem do briefu, budżetu i rytmu wyjazdu.`,
        optionId: byScore.itineraryResultId,
        city: byScore.destination.city,
        country: byScore.destination.country,
      },
      {
        key: "value",
        title: text.lensBestValue,
        body:
          locale === "en"
            ? `${byValue.destination.city} keeps the strongest price-to-fit ratio in the current shortlist.`
            : `${byValue.destination.city} ma najmocniejsza relacje kosztu do sensu wyjazdu w tej shortliscie.`,
        optionId: byValue.itineraryResultId,
        city: byValue.destination.city,
        country: byValue.destination.country,
      },
      {
        key: "easy",
        title: text.lensEasiest,
        body:
          locale === "en"
            ? `${byEasy.destination.city} looks easiest from Poland when route comfort matters more than pure inspiration.`
            : `${byEasy.destination.city} wygląda najłatwiej z Polski, gdy liczy się prostszy dolot i mniej logistyki.`,
        optionId: byEasy.itineraryResultId,
        city: byEasy.destination.city,
        country: byEasy.destination.country,
      },
      {
        key: "weather",
        title: text.lensWarmest,
        body:
          locale === "en"
            ? `${byWeather.destination.city} gives the strongest weather confidence for the selected window.`
            : `${byWeather.destination.city} daje najpewniejszy klimat pogodowy dla wybranego terminu.`,
        optionId: byWeather.itineraryResultId,
        city: byWeather.destination.city,
        country: byWeather.destination.country,
      },
    ];

    const used = new Set<string>();
    return lensCandidates.filter((item) => {
      if (used.has(item.optionId)) {
        return false;
      }
      used.add(item.optionId);
      return true;
    });
  }, [locale, result?.options, text.lensBestFit, text.lensBestValue, text.lensEasiest, text.lensWarmest]);

  const optionLensBadges = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const lens of decisionLenses) {
      const label =
        lens.key === "fit"
          ? text.lensTagBestFit
          : lens.key === "value"
            ? text.lensTagBestValue
            : lens.key === "easy"
              ? text.lensTagEasiest
              : text.lensTagWarmest;
      map.set(lens.optionId, [...(map.get(lens.optionId) ?? []), label]);
    }

    return map;
  }, [decisionLenses, text.lensTagBestFit, text.lensTagBestValue, text.lensTagEasiest, text.lensTagWarmest]);

  const applySnapshot = (snapshot: PlannerSnapshot) => {
    setMode(snapshot.mode);
    setQuery(snapshot.query);
    setDestinationHint(snapshot.destinationHint);
    setOriginCity(snapshot.originCity);
    setBudget(snapshot.budget);
    setTravelers(snapshot.travelers);
    setRooms(snapshot.rooms);
    setDurationMin(snapshot.durationMin);
    setDurationMax(snapshot.durationMax);
    setTravelStartDate(snapshot.travelStartDate);
    setTravelEndDate(normalizeTravelEndDate(snapshot.travelStartDate, snapshot.travelEndDate, snapshot.travelNights));
    setTravelNights(snapshot.travelNights);
  };

  const buildCurrentTripSnapshot = (): SavedTripSnapshot => ({
    mode,
    query,
    destinationHint,
    originCity,
    budget,
    travelers,
    rooms,
    durationMin,
    durationMax,
    travelStartDate,
    travelEndDate: checkOutDate,
    travelNights,
    selectedDestinationSlug: selectedOption?.destination.slug,
    selectedDestinationLabel: selectedOption
      ? `${selectedOption.destination.city}, ${selectedOption.destination.country}`
      : undefined,
  });

  const toPlannerSnapshot = (snapshot: SavedTripSnapshot, savedAt?: string): PlannerSnapshot => ({
    ...snapshot,
    savedAt: savedAt ?? new Date().toISOString(),
  });

  const handleRestoreSnapshot = (snapshot: PlannerSnapshot) => {
    applySnapshot(snapshot);
    shouldFocusOffersRef.current = true;
    sendClientEvent("planner_restored", {
      mode: snapshot.mode,
      destinationHint: snapshot.destinationHint,
      query: snapshot.query,
      selectedDestinationSlug: snapshot.selectedDestinationSlug,
    });
    void executePlanner({
      mode: snapshot.mode,
      query: snapshot.query,
      destinationHint: snapshot.destinationHint,
      originCity: snapshot.originCity,
      budget: snapshot.budget,
      travelers: snapshot.travelers,
      rooms: snapshot.rooms,
      durationMin: snapshot.durationMin,
      durationMax: snapshot.durationMax,
      travelStartDate: snapshot.travelStartDate,
      travelEndDate: normalizeTravelEndDate(snapshot.travelStartDate, snapshot.travelEndDate, snapshot.travelNights),
      travelNights: snapshot.travelNights,
    });
  };

  const handleRestoreSavedTrip = (trip: SavedTripView) => {
    if (!trip.snapshot) {
      return;
    }

    handleRestoreSnapshot(toPlannerSnapshot(trip.snapshot, trip.createdAt));
  };

  const handleToggleSavedDestination = () => {
    if (!selectedOption) {
      return;
    }

    const nextSavedDestinations = toggleSavedDestination({
        slug: selectedOption.destination.slug,
        city: selectedOption.destination.city,
        country: selectedOption.destination.country,
      });
    setSavedDestinations(nextSavedDestinations);
    sendClientEvent("destination_saved", {
      slug: selectedOption.destination.slug,
      city: selectedOption.destination.city,
      country: selectedOption.destination.country,
      saved: nextSavedDestinations.some((item) => item.slug === selectedOption.destination.slug),
    });
  };

  const handleSelectOption = (optionId: string) => {
    const chosenOption = result?.options.find((option) => option.itineraryResultId === optionId);
    setSelectedOptionId(optionId);

    if (!chosenOption) {
      return;
    }

    setComparedDestinations(
      pushComparedDestination({
        slug: chosenOption.destination.slug,
        city: chosenOption.destination.city,
        country: chosenOption.destination.country,
        score: chosenOption.score,
        rationale: chosenOption.reasons[0],
      }),
    );
    sendClientEvent("comparison_selected", {
      slug: chosenOption.destination.slug,
      city: chosenOption.destination.city,
      rank: chosenOption.rank,
      score: chosenOption.score,
      mode,
    });
  };

  const refreshSavedTrips = () => {
    return fetch("/api/trips/history")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSavedTrips(data?.items ?? []))
      .catch(() => setSavedTrips([]));
  };

  const handleSaveTrip = async () => {
    if (!selectedOption || savingTrip) {
      return;
    }

    setSavingTrip(true);
    try {
      await postJson("/api/trips/save", {
        itineraryResultId: selectedOption.itineraryResultId,
        snapshot: buildCurrentTripSnapshot(),
      });
      await refreshSavedTrips();
    } catch {
      // Keep the planner usable even if saving fails.
    } finally {
      setSavingTrip(false);
    }
  };

  const buildSelectedRedirectHref = (
    providerKey: "flights" | "stays" | "attractions" | "cars",
    targetUrl: string | undefined,
  ) =>
    buildRedirectHref({
      providerKey,
      targetUrl: targetUrl ?? "",
      itineraryResultId: selectedOption?.itineraryResultId,
      destinationSlug: selectedOption?.destination.slug,
      requestId: result?.requestId,
      city: selectedOption?.destination.city,
      country: selectedOption?.destination.country,
      source: "planner",
      rank: selectedOption?.rank,
      query: result?.rawQuery,
    });

  const bookingDeck =
    selectedOption && activeAffiliateLinks
      ? [
          {
            eyebrow: text.bookingDeckStay,
            title: stayPartner,
            brand: stayPartner,
            description: text.bookingDeckStayBody,
            href: buildSelectedRedirectHref("stays", activeAffiliateLinks.stays),
            tone: "primary" as const,
          },
          {
            eyebrow: text.bookingDeckFlights,
            title: flightPartner,
            brand: flightPartner,
            description: text.bookingDeckFlightsBody,
            href: buildSelectedRedirectHref("flights", activeAffiliateLinks.flights),
            tone: "dark" as const,
          },
          {
            eyebrow: text.bookingDeckCars,
            title: carPartner,
            brand: carPartner,
            description: text.bookingDeckCarsBody,
            href: buildSelectedRedirectHref("cars", activeAffiliateLinks.cars),
            tone: "light" as const,
          },
          {
            eyebrow: text.bookingDeckActivities,
            title: text.bookingDeckOnSite,
            brand: locale === "en" ? "Activity partner" : "Partner atrakcji",
            description: text.bookingDeckActivitiesBody,
            href: "#aktywnosci-na-miejscu",
            tone: "light" as const,
          },
        ]
      : [];
  const hasPlanningMemory =
    Boolean(lastSnapshot) ||
    savedTrips.length > 0 ||
    savedSearches.length > 0 ||
    savedDestinations.length > 0 ||
    comparedDestinations.length > 0 ||
    recentBriefs.length > 0;
  const shouldShowExpandedPlanningMemory = hasPlanningMemory && (showPlanningMemory || Boolean(result));

  useEffect(() => {
    if (result) {
      setShowPlanningMemory(true);
    }
  }, [result]);

  useEffect(() => {
    if (!result || !selectedOption || !shouldFocusOffersRef.current) {
      return;
    }

    shouldFocusOffersRef.current = false;
    revealOffers();
  }, [result, selectedOption]);

  return (
    <div
      className={`mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 ${
        bookingDeck.length > 0 ? "pb-32 lg:pb-8" : ""
      }`}
    >
      <PlannerForm
        mode={mode}
        setMode={setMode}
        onModeSelect={(next) => sendClientEvent("planner_mode_selected", { source: "planner", mode: next })}
        query={query}
        setQuery={setQuery}
        destinationHint={destinationHint}
        setDestinationHint={setDestinationHint}
        originCity={originCity}
        setOriginCity={setOriginCity}
        travelStartDate={travelStartDate}
        setTravelStartDate={setTravelStartDate}
        checkOutDate={checkOutDate}
        setTravelEndDate={setTravelEndDate}
        travelers={travelers}
        setTravelers={setTravelers}
        rooms={rooms}
        setRooms={setRooms}
        budget={budget}
        setBudget={setBudget}
        durationMin={durationMin}
        setDurationMin={setDurationMin}
        durationMax={durationMax}
        setDurationMax={setDurationMax}
        withChildren={withChildren}
        setWithChildren={setWithChildren}
        childrenCount={childrenCount}
        setChildrenCount={setChildrenCount}
        infants={infants}
        setInfants={setInfants}
        destinationSuggestions={destinationSuggestions}
        isSuggestingDestinations={isSuggestingDestinations}
        destinationSuggestionsOpen={destinationSuggestionsOpen}
        onDestinationLookup={handleDestinationInputChange}
        onDestinationFocus={handleDestinationInputFocus}
        onDestinationSelect={handleDestinationSuggestionSelect}
        onSubmit={runPlanner}
        loading={loading}
        error={error}
        text={text as unknown as PlannerFormText}
        dateLocale={dateLocale}
        discoveryPresets={localizedDiscoveryPresets}
        standardPresets={localizedStandardPresets}
      />

      {hasPlanningMemory && !shouldShowExpandedPlanningMemory ? (
        <section className="rounded-[1.7rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {locale === "en" ? "Your plans" : "Twoje plany"}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-emerald-950">
                {locale === "en" ? "Saved items stay here when you need them." : "Zapisane rzeczy czekaja tutaj, kiedy ich potrzebujesz."}
              </h2>
              <p className="mt-2 text-sm leading-7 text-emerald-900/72">
                {locale === "en"
                  ? "We keep the first screen simple. Open this section when you want to restore an earlier setup or compare with something you saved."
                  : "Zostawiamy prosty start planera. Otwórz te sekcje wtedy, gdy chcesz wrócić do poprzednich ustawień albo porównać coś z zapisanych rzeczy."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPlanningMemory(true)}
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
            >
              {locale === "en" ? "Show your plans" : "Pokaż Twoje plany"}
            </button>
          </div>
        </section>
      ) : null}

      {shouldShowExpandedPlanningMemory ? (
        <section className="rounded-[1.85rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {locale === "en" ? "Your plans" : "Twoje plany"}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-emerald-950">
                {locale === "en" ? "Return to saved searches and previous choices." : "Wróć do zapisanych wyszukiwan i poprzednich wybórow."}
              </h2>
              <p className="mt-2 text-sm leading-7 text-emerald-900/72">
                {locale === "en"
                  ? "This part stays secondary. It appears after you start using the planner, so the first screen stays simple."
                  : "Ta sekcja zostaje pomocnicza. Pokazuje sie dopiero po pierwszym użyciu, dzięki czemu start planera pozostaje prosty."}
              </p>
            </div>
            {!result ? (
              <button
                type="button"
                onClick={() => setShowPlanningMemory(false)}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                {locale === "en" ? "Hide" : "Ukryj"}
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {lastSnapshot ? (
              <article className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/72 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.continuePlanning}</p>
                <p className="mt-2 text-sm text-emerald-900/72">{text.continuePlanningBody}</p>
                <p className="mt-2 text-sm font-semibold text-emerald-950">
                  {lastSnapshot.selectedDestinationLabel ?? (lastSnapshot.mode === "discovery" ? lastSnapshot.query : lastSnapshot.destinationHint)}
                </p>
                <button
                  type="button"
                  onClick={() => handleRestoreSnapshot(lastSnapshot)}
                  className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
                >
                  {text.restoreSettings}
                </button>
              </article>
            ) : null}

            {savedTrips.length > 0 ? (
              <article className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.savedPlans}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">{text.savedPlansBody}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                    {savedTrips.length}
                  </span>
                </div>
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {savedTrips.map((trip) => (
                    <div
                      key={trip.itineraryResultId}
                      className="rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-950 transition hover:border-emerald-500/50 hover:bg-emerald-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block">
                            {trip.city}, {trip.country}
                          </span>
                          {trip.snapshot ? (
                            <span className="mt-1 block text-xs text-emerald-700">
                              {formatShortDate(trip.snapshot.travelStartDate, dateLocale)} - {formatShortDate(
                                normalizeTravelEndDate(
                                  trip.snapshot.travelStartDate,
                                  trip.snapshot.travelEndDate,
                                  trip.snapshot.travelNights,
                                ),
                                dateLocale,
                              )}{" "}
                              / {trip.snapshot.originCity}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-emerald-700">
                          {text.scoreWord} {trip.score.toFixed(0)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <LocalizedLink
                          href={`/trips/${trip.itineraryResultId}`}
                          locale={locale}
                          onClick={() =>
                            sendClientEvent("saved_plan_clicked", {
                              itineraryResultId: trip.itineraryResultId,
                              city: trip.city,
                              source: "planner_saved_trips",
                            })
                          }
                          className="rounded-full border border-emerald-900/10 bg-white px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100"
                        >
                          {text.openPlan}
                        </LocalizedLink>
                        {trip.snapshot ? (
                          <button
                            type="button"
                            onClick={() => handleRestoreSavedTrip(trip)}
                            className="rounded-full bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                          >
                            {text.restoreSettings}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {savedSearches.length > 0 ? (
              <article className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.savedSearches}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">{text.savedSearchesBody}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                    {savedSearches.length}
                  </span>
                </div>
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {savedSearches.map((search) => (
                    <button
                      key={search.id}
                      type="button"
                      onClick={() =>
                        handleRestoreSnapshot({
                          mode: search.mode,
                          query: search.query,
                          destinationHint: search.destinationHint,
                          originCity: search.originCity,
                          budget: search.budget,
                          travelers: search.travelers,
                          rooms: search.rooms,
                          durationMin: search.travelNights,
                          durationMax: search.travelNights,
                          travelStartDate: search.travelStartDate,
                          travelEndDate: search.travelEndDate,
                          travelNights: search.travelNights,
                          selectedDestinationSlug: search.topDestinationSlug,
                          selectedDestinationLabel: search.topDestinationLabel,
                          savedAt: search.savedAt,
                        })
                      }
                      className="w-full rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-left text-sm font-medium text-emerald-950 transition hover:border-emerald-500/50 hover:bg-emerald-50"
                    >
                      <span className="block font-semibold">{search.topDestinationLabel ?? search.label}</span>
                      <span className="mt-1 block text-xs text-emerald-700">
                        {formatShortDate(search.travelStartDate, dateLocale)} - {formatShortDate(
                          normalizeTravelEndDate(search.travelStartDate, search.travelEndDate, search.travelNights),
                          dateLocale,
                        )}{" "}
                        / {search.originCity}
                      </span>
                      <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                        {text.reopenSearch}
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            ) : null}

            {recentBriefs.length > 0 ? (
              <article className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.recentBriefs}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">{text.recentBriefsBody}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentBriefs.map((brief) => (
                    <button
                      key={brief.id}
                      type="button"
                      onClick={() => setQuery(brief.text)}
                      className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:border-emerald-500/40 hover:bg-emerald-100"
                    >
                      {brief.text}
                    </button>
                  ))}
                </div>
              </article>
            ) : null}

            {savedDestinations.length > 0 ? (
              <article className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.savedDestinations}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">{text.savedDestinationsBody}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                    {savedDestinations.length}
                  </span>
                </div>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {savedDestinations.map((destination) => (
                    <LocalizedLink
                      key={destination.slug}
                      href={`/kierunki/${destination.slug}`}
                      locale={locale}
                      className="flex items-center justify-between rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-950 transition hover:border-emerald-500/50 hover:bg-emerald-50"
                    >
                      <span>
                        {destination.city}, {destination.country}
                      </span>
                      <span className="text-xs text-emerald-700">{locale === "en" ? "guide" : "przewodnik"}</span>
                    </LocalizedLink>
                  ))}
                </div>
              </article>
            ) : null}

            {comparedDestinations.length > 0 ? (
              <article className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.comparisonMemory}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">{text.comparisonMemoryBody}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                    {comparedDestinations.length}
                  </span>
                </div>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {comparedDestinations.map((destination) => (
                    <LocalizedLink
                      key={`${destination.slug}-${destination.savedAt}`}
                      href={`/kierunki/${destination.slug}`}
                      locale={locale}
                      className="flex items-center justify-between rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-950 transition hover:border-emerald-500/50 hover:bg-emerald-50"
                    >
                      <span>
                        {destination.city}, {destination.country}
                      </span>
                      <span className="text-xs text-emerald-700">{text.compareAgain}</span>
                    </LocalizedLink>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="grid gap-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="animate-pulse rounded-[1.75rem] border border-emerald-900/10 bg-white/80 p-4">
              <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <div className="h-44 rounded-[1.25rem] bg-emerald-100/80" />
                <div className="space-y-3">
                  <div className="h-5 w-40 rounded-full bg-emerald-100/80" />
                  <div className="h-7 w-2/3 rounded-full bg-emerald-100/80" />
                  <div className="h-4 w-full rounded-full bg-emerald-100/80" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="h-10 rounded-2xl bg-emerald-100/80" />
                    <div className="h-10 rounded-2xl bg-emerald-100/80" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {selectedOption && selectedStory && activeAffiliateLinks ? (
        <>
          <section className="relative overflow-hidden rounded-[2.2rem] bg-emerald-950 p-6 text-white shadow-[0_28px_80px_rgba(6,29,16,0.22)] sm:p-10">
            <Image
              src={selectedStory.heroImage}
              alt=""
              fill
              priority
              aria-hidden="true"
              className="object-cover opacity-25"
              sizes="(max-width: 1024px) 100vw, 1024px"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,29,16,0.55)_0%,rgba(6,29,16,0.92)_100%)]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                {isDirectRouteSearch ? text.selectedRoute : text.bestForBrief}
              </p>
              <h1 className="mt-3 font-display text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
                {selectedOption.destination.city}, {selectedOption.destination.country}
              </h1>
              <p className="mt-3 max-w-2xl text-base text-emerald-100/85 sm:text-lg">
                {selectedStory.tagline}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-emerald-100/80">
                <span>
                  {formatShortDate(travelStartDate, dateLocale)} - {formatShortDate(checkOutDate, dateLocale)}
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {travelNights} {text.selectedDatesValue}
                </span>
                <span aria-hidden="true">•</span>
                <span>
                  {travelers} {text.travelersShort}
                </span>
                <span aria-hidden="true">•</span>
                <span>{scoreLabel(selectedOption.score, locale)}</span>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {bookingDeck[0] ? (
                  <a
                    href={bookingDeck[0].href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      sendClientEvent("affiliate_clicked", {
                        type: "stays",
                        partner: stayPartner,
                        source: "planner_hero",
                        city: selectedOption.destination.city,
                      })
                    }
                    className="inline-flex items-center gap-3 rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-7 py-3.5 text-base font-bold text-emerald-950 shadow-[0_18px_40px_rgba(244,114,82,0.35)] transition hover:brightness-105"
                  >
                    <PartnerLogoMark brand={stayPartner} size="sm" variant="neutral" />
                    {text.bookNow} →
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleToggleSavedDestination()}
                  aria-pressed={isSelectedDestinationSaved}
                  aria-label={isSelectedDestinationSaved ? text.savedDestination : text.saveDestination}
                  title={isSelectedDestinationSaved ? text.savedDestination : text.saveDestination}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={isSelectedDestinationSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailsOpen((current) => !current)}
                  aria-expanded={detailsOpen}
                  aria-label={text.detailsLabel}
                  title={text.detailsLabel}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleSaveTrip();
                  }}
                  disabled={savingTrip}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
                >
                  {savingTrip ? text.savingTrip : text.saveTrip}
                </button>
              </div>

              {detailsOpen ? (
                <div className="mt-6 grid gap-5 rounded-[1.5rem] bg-white/8 p-5 backdrop-blur-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">{text.whyNow}</p>
                    <p className="mt-2 text-sm leading-7 text-white/85">{selectedStory.summary}</p>
                    {localFocus ? (
                      <p className="mt-3 text-xs font-semibold text-emerald-200">{text.exactMatch}</p>
                    ) : null}
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {selectedStory.bestFor.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <ul className="mt-3 grid gap-2 text-sm text-white/85">
                      {selectedStory.highlights.slice(0, 4).map((highlight) => (
                        <li key={highlight} className="rounded-2xl bg-white/8 px-3 py-2">
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section
            ref={settingsPanelRef}
            id="planner-settings"
            className="rounded-[1.9rem] border border-emerald-900/10 bg-white p-4 shadow-[0_16px_45px_rgba(16,84,48,0.06)] sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-emerald-950">{text.bookingSettings}</h3>
                <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                  {originCity} -&gt; {selectedOption.destination.city}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-50"
              >
                {text.editTrip}
              </button>
            </div>
          </section>

          <section ref={stayOffersRef} id="planner-tabs" className="rounded-[2rem] border border-emerald-900/10 bg-white p-4 shadow-[0_18px_56px_rgba(16,84,48,0.06)] sm:p-6">
            <div role="tablist" aria-label="Planner sections" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {(
                [
                  { key: "stays", label: text.tabStays },
                  { key: "flights", label: text.tabFlights },
                  { key: "attractions", label: text.tabAttractions },
                  { key: "cars", label: text.tabCars },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.key)}
                    className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                      active
                        ? "bg-emerald-950 text-white shadow-[0_12px_28px_rgba(7,31,18,0.18)]"
                        : "border border-emerald-900/15 bg-white text-emerald-900 hover:bg-emerald-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              {activeTab === "stays" ? (
                <StayOffersPanel
                  destinationCity={selectedOption.destination.city}
                  destinationCountry={selectedOption.destination.country}
                  checkInDate={travelStartDate}
                  checkOutDate={checkOutDate}
                  guests={travelers}
                  rooms={rooms}
                />
              ) : null}

              {activeTab === "flights" ? (
                <FlightOffersPanel
                  destinationCity={selectedOption.destination.city}
                  destinationCountry={selectedOption.destination.country}
                  originCity={originCity}
                  departureDate={travelStartDate}
                  returnDate={checkOutDate}
                  passengers={travelers}
                  partnerUrl={activeAffiliateLinks.flights}
                />
              ) : null}

              {activeTab === "attractions" ? (
                <div className="grid gap-5">
                  <ActivityOffersPanel
                    destinationCity={selectedOption.destination.city}
                    destinationCountry={selectedOption.destination.country}
                    fromDate={travelStartDate}
                    toDate={checkOutDate}
                    travelers={travelers}
                  />
                  <DestinationAttractionsPanel
                    city={selectedOption.destination.city}
                    country={selectedOption.destination.country}
                  />
                  <TransferOffersPanel
                    destinationCity={selectedOption.destination.city}
                    destinationCountry={selectedOption.destination.country}
                    outboundDate={travelStartDate}
                    adults={travelers}
                  />
                </div>
              ) : null}

              {activeTab === "cars" ? (
                <div className="rounded-3xl border border-emerald-900/10 bg-emerald-50/30 p-6">
                  <h3 className="text-xl font-bold text-emerald-950">
                    {text.carsTabTitle} {selectedOption.destination.city}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/72">{text.carsTabBody}</p>
                  <a
                    href={buildSelectedRedirectHref("cars", activeAffiliateLinks.cars)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      sendClientEvent("affiliate_clicked", {
                        type: "cars",
                        partner: carPartner,
                        source: "planner_tab",
                        city: selectedOption.destination.city,
                      })
                    }
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-6 py-3 text-sm font-bold text-emerald-950 shadow-[0_14px_30px_rgba(244,114,82,0.3)] transition hover:brightness-105"
                  >
                    <PartnerLogoMark brand={carPartner} size="sm" variant="neutral" />
                    {text.carsTabCta} →
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {result ? (
        <section className="grid gap-4">
          <h2 className="text-xl font-bold text-emerald-950">
            {mode === "standard" ? text.directPrompt : text.discoveryPrompt}
          </h2>

          <div className="grid gap-4">
            {result.options.map((option) => {
              const story = getDestinationStory(option.destination);
              const active = option.itineraryResultId === selectedOptionId;
              return (
                <article
                  key={option.itineraryResultId}
                  onClick={() => handleSelectOption(option.itineraryResultId)}
                  className={`group cursor-pointer overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_16px_40px_rgba(16,84,48,0.07)] transition-all duration-300 ${
                    active
                      ? "border-emerald-500/70 ring-1 ring-emerald-300"
                      : "border-emerald-900/10 hover:-translate-y-1 hover:border-emerald-500/45 hover:shadow-[0_20px_48px_rgba(16,84,48,0.12)]"
                  }`}
                >
                  <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
                    <div className="relative h-56 lg:h-full">
                      <Image
                        src={story.heroImage}
                        alt={story.name}
                        fill
                        sizes="(max-width: 1024px) 100vw, 320px"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.02)_0%,rgba(6,16,10,0.52)_100%)]" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">{story.tagline}</p>
                        <h3 className="mt-2 text-2xl font-bold">
                          {option.destination.city}, {option.destination.country}
                        </h3>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.resultRank} #{option.rank}</p>
                        <p className="mt-2 text-2xl font-bold text-emerald-950">{scoreLabel(option.score, locale)}</p>
                        {optionLensBadges.get(option.itineraryResultId)?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {optionLensBadges.get(option.itineraryResultId)?.map((badge) => (
                              <span
                                key={`${option.itineraryResultId}-${badge}`}
                                className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                        <div className="rounded-2xl bg-emerald-700 px-4 py-2 text-right text-white">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-100">{text.score}</p>
                          <p className="text-2xl font-bold">{option.score.toFixed(0)}</p>
                        </div>
                      </div>

                      <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-900/80">{option.aiSummary}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {story.bestFor.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {story.gallery.map((imageUrl, index) => (
                          <div key={`${option.itineraryResultId}-${imageUrl}`} className="relative h-20 overflow-hidden rounded-2xl border border-emerald-900/10">
                            <Image
                              src={imageUrl}
                              alt={`${story.name} image ${index + 1}`}
                              fill
                              sizes="(max-width: 640px) 100vw, 11vw"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-[1.25rem] bg-emerald-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.whyItFits}</p>
                          <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/82">
                            {option.reasons.slice(0, 3).map((reason) => (
                              <li key={reason} className="ml-5 list-disc">{reason}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-[1.25rem] bg-emerald-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.watchLabel}</p>
                          <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/82">
                            {(option.tradeoffs.length > 0 ? option.tradeoffs : [text.noTradeoffs]).map((tradeoff) => (
                              <li key={tradeoff} className="ml-5 list-disc">{tradeoff}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedOption && bookingDeck.length >= 1 ? (
        <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
          <div className="flex items-center gap-2 rounded-full border border-emerald-900/12 bg-emerald-950/96 p-2 text-white shadow-[0_24px_60px_rgba(7,31,18,0.3)] backdrop-blur">
            <a
              href={bookingDeck[0].href}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:brightness-105"
            >
              <PartnerLogoMark brand={bookingDeck[0].brand} size="sm" variant="neutral" />
              {text.bookNow}
            </a>
            <button
              type="button"
              onClick={openMobileSettings}
              aria-label={text.editTrip}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/10 text-white transition hover:bg-white/16"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {result && !selectedOption ? (
        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900 shadow-sm">
          Nie udalo sie zbudowac pełnego rankingu kierunków dla tego zapytania. Sprobuj zmienic termin lub kierunek i uruchomic wyszukiwanie ponownie.
        </section>
      ) : null}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={text.editTrip}
        closeLabel={text.closeLabel}
      >
        <PlannerForm
          compact
          mode={mode}
          setMode={setMode}
          query={query}
          setQuery={setQuery}
          destinationHint={destinationHint}
          setDestinationHint={setDestinationHint}
          originCity={originCity}
          setOriginCity={setOriginCity}
          travelStartDate={travelStartDate}
          setTravelStartDate={setTravelStartDate}
          checkOutDate={checkOutDate}
          setTravelEndDate={setTravelEndDate}
          travelers={travelers}
          setTravelers={setTravelers}
          rooms={rooms}
          setRooms={setRooms}
          budget={budget}
          setBudget={setBudget}
          durationMin={durationMin}
          setDurationMin={setDurationMin}
          durationMax={durationMax}
          setDurationMax={setDurationMax}
          withChildren={withChildren}
          setWithChildren={setWithChildren}
          childrenCount={childrenCount}
          setChildrenCount={setChildrenCount}
          infants={infants}
          setInfants={setInfants}
          destinationSuggestions={destinationSuggestions}
          isSuggestingDestinations={isSuggestingDestinations}
          destinationSuggestionsOpen={destinationSuggestionsOpen}
          onDestinationLookup={handleDestinationInputChange}
          onDestinationFocus={handleDestinationInputFocus}
          onDestinationSelect={handleDestinationSuggestionSelect}
          onSubmit={() => {
            void runPlanner();
            setSettingsOpen(false);
          }}
          loading={loading}
          error={error}
          text={text as unknown as PlannerFormText}
          dateLocale={dateLocale}
          discoveryPresets={localizedDiscoveryPresets}
          standardPresets={localizedStandardPresets}
        />
      </SettingsDrawer>
    </div>
  );
}

type DecisionLensCard = {
  key: "fit" | "value" | "easy" | "weather";
  title: string;
  body: string;
  optionId: string;
  city: string;
  country: string;
};




