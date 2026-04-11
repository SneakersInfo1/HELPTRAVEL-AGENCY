"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { LocalizedLink } from "@/components/site/localized-link";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { ActivityOffersPanel } from "@/components/mvp/activity-offers-panel";
import { DestinationAttractionsPanel } from "@/components/mvp/destination-attractions-panel";
import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { StayOffersPanel } from "@/components/mvp/stay-offers-panel";
import { TransferOffersPanel } from "@/components/mvp/transfer-offers-panel";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
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
    "Cieply kierunek na 5 dni z plaza i zwiedzaniem do 2000 zl.",
    "Krotki city break z dobrym jedzeniem i lekkim lotem z Polski.",
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
    heroEyebrow: "HelpTravel Planner",
    heroTitle: "Wybierz kierunek i przejdz od razu do konkretow.",
    heroBody: "Najpierw dopasowanie kierunku, chwile pozniej pobyt, loty i kolejne kroki wyjazdu w jednym miejscu.",
    modeStandard: "Mam kierunek",
    modeDiscovery: "Szukam pomyslu",
    describeTrip: "Opisz wyjazd",
    discoveryPlaceholder: "Np. cieply kierunek na 5 dni z plaza, zwiedzaniem i budzetem do 2000 zl.",
    budget: "Budzet",
    minDays: "Minimum dni",
    maxDays: "Maksimum dni",
    direction: "Kierunek",
    mainPath: "Sciezka glowna",
    mainPathBody: "Po wskazaniu kierunku pokazujemy najpierw pobyt, a zaraz potem loty i dalsze kroki podrozy.",
    sharedParams: "Parametry wspolne",
    sharedTitle: "Termin i sklad podrozy",
    origin: "Skad lecisz",
    travelStart: "Start podrozy",
    nights: "Powrot",
    travelers: "Podrozni",
    rooms: "Pokoje",
    quickPreview: "Szybki podglad",
    travelersShort: "os.",
    roomSingle: "pokoj",
    roomFew: "pokoje",
    roomMany: "pokoi",
    loadingPlan: "Ukladamy plan...",
    planError: "Nie udalo sie przygotowac planu.",
    showStayFlights: "Pokaz pobyt i loty",
    savedPlans: "Zapisane plany",
    savedPlansBody: "Wrocisz do nich jednym kliknieciem.",
    savedEmpty: "Po pierwszym wyniku tutaj pojawia sie zapisane scenariusze.",
    savedSearches: "Zapisane wyszukiwania",
    savedSearchesBody: "Najmocniejsze briefy i gotowe wyszukiwania wracaja bez ponownego ustawiania formularza.",
    savedSearchesEmpty: "Po pierwszym uruchomieniu planera zapisze sie tutaj najnowszy brief albo gotowe wyszukiwanie.",
    reopenSearch: "Otworz wyszukiwanie",
    recentBriefs: "Ostatnie briefy",
    recentBriefsBody: "Najmocniejsze zapytania discovery mozesz odtworzyc bez pisania od nowa.",
    continuePlanning: "Kontynuuj planowanie",
    continuePlanningBody: "Ostatnia konfiguracja planera czeka do ponownego uruchomienia.",
    restoreSettings: "Przywroc ustawienia",
    savedDestinations: "Zapisane kierunki",
    savedDestinationsBody: "Wlasna shortlista kierunkow do porownania i powrotu.",
    noSavedDestinations: "Po zapisaniu kierunku pojawi sie tutaj szybki dostep do jego strony i planera.",
    comparisonMemory: "Pamiec porownan",
    comparisonMemoryBody: "Planner zapamietuje kierunki, ktore porownywales obok glownego wyboru.",
    comparisonMemoryEmpty: "Kiedy zaczniesz przelaczac alternatywy, pojawia sie tutaj ostatnio porownywane miasta.",
    compareAgain: "Porownaj ponownie",
    saveTrip: "Zapisz plan",
    savingTrip: "Zapisywanie...",
    saveTripDone: "Plan zapisany",
    saveDestination: "Zapisz kierunek",
    savedDestination: "Kierunek zapisany",
    interpretedBrief: "Jak system odczytal brief",
    interpretedBriefBody: "Pokazujemy najwazniejsze sygnaly z briefu, zeby decyzja byla bardziej czytelna i latwiejsza do oceny.",
    methodologyTitle: "Jak budujemy rekomendacje",
    methodologyBody: "Ranking laczy klimat, budzet, latwosc dojazdu, sens trip length i dopasowanie do stylu wyjazdu. Nie pokazujemy jednego miasta przypadkiem.",
    decodedBudget: "Budzet",
    decodedClimate: "Klimat",
    decodedTransfer: "Przesiadki",
    decodedFocus: "Wskazany kierunek",
    decodedTravelStyle: "Najmocniejsze potrzeby",
    scoreWord: "score",
    selectedRoute: "Wybrana trasa",
    bestForBrief: "Najlepszy kierunek dla tego briefu",
    score: "Wynik",
    term: "Termin",
    travelParty: "Sklad podrozy",
    whyNow: "Dlaczego teraz",
    exactMatch: "Kierunek dokladnie odpowiada wskazanemu miastu.",
    openStay: "Zobacz pobyt w",
    openFlights: "Sprawdz loty w",
    openCars: "Auta w",
    bookingSettings: "Ustawienia komercyjne",
    bookingSettingsBody: "Zmien termin raz, a caly flow odswiezy sie spojnie.",
    remainingOptions: "Pozostale propozycje",
    similarDirections: "Podobne kierunki obok glownego wyboru",
    bestAlternatives: "Najlepsze alternatywy",
    remainingBody: "Szybko porownasz klimat, argumenty dopasowania i przelaczysz sie na inny kierunek bez wracania do poczatku.",
    position: "Pozycja",
    whyFits: "Dlaczego pasuje",
    watchOut: "Na co uwazac",
    noTradeoffs: "Brak wyraznych minusow przy tym briefie.",
    bookingDeckStay: "Pobyt",
    bookingDeckFlights: "Loty",
    bookingDeckCars: "Auta",
    bookingDeckActivities: "Atrakcje",
    bookingDeckStayBody: "Najwazniejszy klik po wyborze miasta. Otwiera gotowy pobyt dla tego terminu.",
    bookingDeckFlightsBody: "Przechodzisz do wynikow lotow z ustawiona trasa i data.",
    bookingDeckCarsBody: "Mobilnosc na miejscu bez ponownego wpisywania kierunku.",
    bookingDeckActivitiesBody: "Przejdz dalej do atrakcji i transferow dla tego samego pobytu.",
    showStay: "Pokaz pobyt",
    showFlights: "Pokaz loty",
    showCars: "Pokaz auta",
    showOnSite: "Pokaz na miejscu",
    openPlan: "Otworz plan",
    mobileBarEyebrow: "Gotowe do dalszego ruchu",
    mobileBarBody: "Najpierw pobyt, potem loty i zapis planu bez gubienia ustawien.",
    mobileQuickActions: "Szybkie sterowanie",
    mobileQuickBody: "Skocz do sekcji albo popraw trase bez skanowania calej strony wynikow.",
    editTrip: "Edytuj plan",
    closeTripEditor: "Schowaj edycje",
    topChoiceSummary: "Dlaczego ten kierunek wygrywa",
    topChoiceSummaryBody: "Masz juz gotowy kierunek, termin i pierwsze CTA. Najmocniejszy kolejny ruch to szybkie wejscie w pobyt i porownanie najblizszych alternatyw.",
    resultsNavigator: "Kolejne kroki",
    resultsNavigatorBody: "Przejdz od razu do najwazniejszej sekcji bez przewijania calego ekranu wynikow.",
    jumpToStays: "Do pobytu",
    jumpToFlights: "Do lotow",
    jumpToGuide: "Do przewodnika",
    jumpToOnSite: "Na miejscu",
    destinationPlaceholder: "Np. Malaga",
    destinationSearching: "Szukamy kierunkow...",
    destinationEmpty: "Brak dopasowan. Sprobuj wpisac inne miasto lub kraj.",
    refreshFlow: "Odswiez pobyt i loty",
    bookingSettingsHint: "Ten panel jest aktywny: zmien kierunek lub daty i kliknij odswiez, aby przebudowac wyniki.",
    originPlaceholder: "Warszawa",
    primaryFlow: "Sciezka glowna",
    hotelFirst: "Najpierw pobyt, potem lot i kolejne kroki.",
    selectedDatesValue: "noce",
    resultRank: "Pozycja",
    directPrompt: "Podobne kierunki obok glownego wyboru",
    discoveryPrompt: "Najlepsze alternatywy",
    whyItFits: "Dlaczego pasuje",
    watchLabel: "Na co uwazac",
    openCatalog: "Otworz katalog kierunkow",
    bookingDeckOnSite: "Na miejscu",
    decisionLenses: "Lupy decyzyjne",
    decisionLensesBody: "Zamiast jednego rankingu pokazujemy tez, ktory kierunek wygrywa wartoscia, prostota dolotu i ogolnym dopasowaniem.",
    lensBestFit: "Najlepszy fit",
    lensBestValue: "Najlepsza wartosc",
    lensEasiest: "Najlatwiejszy dolot",
    lensWarmest: "Najpewniejsza pogoda",
    lensOpen: "Ustaw ten kierunek",
    lensTagBestFit: "fit",
    lensTagBestValue: "value",
    lensTagEasiest: "easy",
    lensTagWarmest: "weather",
  },
  en: {
    heroEyebrow: "HelpTravel Planner",
    heroTitle: "Choose a destination and move straight into real options.",
    heroBody: "Start with destination fit, then move into stays, flights and the next travel steps in one place.",
    modeStandard: "I know the destination",
    modeDiscovery: "I need ideas",
    describeTrip: "Describe the trip",
    discoveryPlaceholder: "E.g. a warm 5-day trip with a beach, sightseeing and a budget under 2000 PLN.",
    budget: "Budget",
    minDays: "Minimum days",
    maxDays: "Maximum days",
    direction: "Destination",
    mainPath: "Primary flow",
    mainPathBody: "Once the destination is set, we lead with stays first and then move into flights and the rest of the trip.",
    sharedParams: "Shared settings",
    sharedTitle: "Dates and travel party",
    origin: "Flying from",
    travelStart: "Trip start",
    nights: "Return",
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
    savedPlansBody: "You can return to them in one click.",
    savedEmpty: "Saved scenarios will appear here after the first result.",
    savedSearches: "Saved searches",
    savedSearchesBody: "Strong briefs and ready searches are kept so you can reopen them without rebuilding the form.",
    savedSearchesEmpty: "Your first planner run will save the latest brief or direct search here.",
    reopenSearch: "Open search",
    recentBriefs: "Recent briefs",
    recentBriefsBody: "Replay your strongest discovery prompts without rewriting them.",
    continuePlanning: "Continue planning",
    continuePlanningBody: "Your latest planner setup is ready to reuse.",
    restoreSettings: "Restore setup",
    savedDestinations: "Saved destinations",
    savedDestinationsBody: "A short list of destinations worth revisiting and comparing.",
    noSavedDestinations: "Saved destinations will appear here once you keep a place for later.",
    comparisonMemory: "Comparison memory",
    comparisonMemoryBody: "The planner remembers destinations you compared next to the top pick.",
    comparisonMemoryEmpty: "As soon as you switch between alternatives, your recent comparisons will appear here.",
    compareAgain: "Compare again",
    saveTrip: "Save plan",
    savingTrip: "Saving...",
    saveTripDone: "Plan saved",
    saveDestination: "Save destination",
    savedDestination: "Destination saved",
    interpretedBrief: "How the brief was interpreted",
    interpretedBriefBody: "We surface the strongest intent signals so the recommendation feels easier to trust and compare.",
    methodologyTitle: "How recommendations are built",
    methodologyBody: "The ranking blends climate, budget, route effort, trip length fit and travel style. The top pick is meant to be explainable, not random.",
    decodedBudget: "Budget",
    decodedClimate: "Climate",
    decodedTransfer: "Transfers",
    decodedFocus: "Focused destination",
    decodedTravelStyle: "Strongest needs",
    scoreWord: "score",
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
    bookingSettings: "Commercial settings",
    bookingSettingsBody: "Change the dates once and the whole flow refreshes consistently.",
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
    topChoiceSummary: "Why this destination wins",
    topChoiceSummaryBody: "You already have the destination, dates and first CTAs. The strongest next move is opening the stay view and checking the closest alternatives.",
    resultsNavigator: "Next steps",
    resultsNavigatorBody: "Jump straight into the most important section without scanning the whole results screen first.",
    jumpToStays: "Go to stays",
    jumpToFlights: "Go to flights",
    jumpToGuide: "Go to guide",
    jumpToOnSite: "On site",
    destinationPlaceholder: "E.g. Malaga",
    destinationSearching: "Looking for destinations...",
    destinationEmpty: "No matches yet. Try another city or country.",
    refreshFlow: "Refresh stays and flights",
    bookingSettingsHint: "This panel is active: change the destination or dates, then refresh the flow to rebuild results.",
    originPlaceholder: "Warsaw",
    primaryFlow: "Primary route",
    hotelFirst: "Lead with stays first, then flights and the next trip steps.",
    selectedDatesValue: "nights",
    resultRank: "Position",
    directPrompt: "Similar destinations next to your main pick",
    discoveryPrompt: "Best alternatives",
    whyItFits: "Why it fits",
    watchLabel: "Watch-outs",
    openCatalog: "Open destination catalog",
    bookingDeckOnSite: "On site",
    decisionLenses: "Decision lenses",
    decisionLensesBody: "Instead of a single ranking, we also surface which destination wins on fit, value, easier routing and weather confidence.",
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
        : "Warto sprawdzic"
    : score >= 82
      ? "Very strong match"
      : score >= 70
        ? "Good match"
        : "Worth checking";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

function trackClientEvent(eventType: "planner_restored" | "destination_saved" | "comparison_selected" | "search_saved", payload: Record<string, unknown>) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, payload }),
    keepalive: true,
  }).catch(() => undefined);
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-32 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm leading-6 text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function DestinationAutocompleteField({
  label,
  value,
  onChange,
  onFocus,
  onSelect,
  suggestions,
  isLoading,
  isOpen,
  placeholder,
  loadingLabel,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onSelect: (suggestion: DestinationSuggestion) => void;
  suggestions: DestinationSuggestion[];
  isLoading: boolean;
  isOpen: boolean;
  placeholder?: string;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const showDropdown = isOpen && (isLoading || suggestions.length > 0 || value.trim().length >= 2);

  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
      {label}
      <div className="relative mt-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          autoComplete="off"
        />
        {showDropdown ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 overflow-hidden rounded-[1.3rem] border border-emerald-900/10 bg-white shadow-[0_18px_40px_rgba(16,84,48,0.12)]">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-emerald-900/70">{loadingLabel}</div>
            ) : suggestions.length > 0 ? (
              <div className="max-h-64 overflow-y-auto py-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(suggestion);
                    }}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-emerald-50"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-emerald-950">{suggestion.city}</span>
                      <span className="mt-1 block text-xs text-emerald-900/68">
                        {[suggestion.country, suggestion.region].filter(Boolean).join(" / ")}
                      </span>
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      {suggestion.source}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-emerald-900/70">{emptyLabel}</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-white/92 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{label}</p>
      <p className="mt-1 text-sm font-semibold text-emerald-950">{value}</p>
    </div>
  );
}

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
  const [savingTrip, setSavingTrip] = useState(false);
  const [destinationSuggestions, setDestinationSuggestions] = useState<DestinationSuggestion[]>([]);
  const [isSuggestingDestinations, setIsSuggestingDestinations] = useState(false);
  const [destinationSuggestionsOpen, setDestinationSuggestionsOpen] = useState(false);
  const autoSearchRef = useRef(false);
  const shouldFocusOffersRef = useRef(false);
  const stayOffersRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  const [query, setQuery] = useState(
    initialQuery ||
      (locale === "en"
        ? "I want a warm destination for 5 days with a beach, sightseeing and a budget under 2000 PLN."
        : "Chce poleciec do cieplego kraju do 2000 zl na 5 dni, bez wizy, z plaza i zwiedzaniem."),
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
      trackClientEvent("search_saved", {
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
    window.requestAnimationFrame(() => {
      stayOffersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const openMobileSettings = () => {
    setMobileSettingsOpen(true);
    window.requestAnimationFrame(() => {
      settingsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (!autoRunStandardSearch || autoSearchRef.current) return;
    if (mode !== "standard" || !destinationHint.trim()) return;
    autoSearchRef.current = true;
    triggerInitialStandardSearch();
  }, [autoRunStandardSearch, destinationHint, mode]);

  useEffect(() => {
    if (selectedOptionId) {
      setMobileSettingsOpen(false);
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
  const stayPartner = getAffiliateBrandLabel(activeAffiliateLinks?.stays, "Partner noclegowy");
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

  const strongestNeeds = [
    result?.interpreted.styleWeights.beach
      ? { label: locale === "en" ? "beach" : "plaza", score: result.interpreted.styleWeights.beach }
      : null,
    result?.interpreted.styleWeights.city
      ? { label: locale === "en" ? "city" : "miasto", score: result.interpreted.styleWeights.city }
      : null,
    result?.interpreted.styleWeights.sightseeing
      ? { label: locale === "en" ? "sightseeing" : "zwiedzanie", score: result.interpreted.styleWeights.sightseeing }
      : null,
    result?.interpreted.styleWeights.food
      ? { label: locale === "en" ? "food" : "jedzenie", score: result.interpreted.styleWeights.food }
      : null,
    result?.interpreted.styleWeights.nature
      ? { label: locale === "en" ? "nature" : "natura", score: result.interpreted.styleWeights.nature }
      : null,
  ]
    .filter((item): item is { label: string; score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.label);
  const methodologyPoints =
    locale === "en"
      ? [
          "Weather and travel season for the selected window",
          "Budget fit against the destination cost profile",
          "Flight effort from Poland and transfer comfort",
          "Match with the strongest intent signals in the brief",
        ]
      : [
          "Pogoda i sezon dla wybranego terminu",
          "Dopasowanie do budzetu i profilu kosztowego kierunku",
          "Wysilek lotu z Polski i komfort przesiadek",
          "Zgodnosc z najmocniejszymi potrzebami z briefu",
        ];

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
            : `${byScore.destination.city} wygrywa najbardziej pelnym dopasowaniem do briefu, budzetu i rytmu wyjazdu.`,
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
            : `${byEasy.destination.city} wyglada najlatwiej z Polski, gdy liczy sie prostszy dolot i mniej logistyki.`,
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
    trackClientEvent("planner_restored", {
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
    trackClientEvent("destination_saved", {
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
    trackClientEvent("comparison_selected", {
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
      // Keep the main planner flow stable even if saving fails.
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
      <section className="glass-panel rounded-[2rem] border border-emerald-900/10 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.heroEyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold text-emerald-950 sm:text-4xl">{text.heroTitle}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-900/76">{text.heroBody}</p>
          </div>

          <div className="inline-flex rounded-full border border-emerald-900/10 bg-white/84 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("standard")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === "standard" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-100"
              }`}
            >
              {text.modeStandard}
            </button>
            <button
              type="button"
              onClick={() => setMode("discovery")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === "discovery" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-100"
              }`}
            >
              {text.modeDiscovery}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(247,252,249,0.98),rgba(235,247,239,0.94))] p-4 sm:p-5">
            {mode === "discovery" ? (
              <div className="space-y-4">
                <Field label={text.describeTrip}>
                  <Textarea
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={text.discoveryPlaceholder}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {localizedDiscoveryPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setQuery(preset)}
                      className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                {recentBriefs.length > 0 ? (
                  <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white/78 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.recentBriefs}</p>
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
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={text.budget}>
                    <Input type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} />
                  </Field>
                  <Field label={text.minDays}>
                    <Input
                      type="number"
                      min={2}
                      max={14}
                      value={durationMin}
                      onChange={(event) => setDurationMin(Number(event.target.value) || 2)}
                    />
                  </Field>
                  <Field label={text.maxDays}>
                    <Input
                      type="number"
                      min={2}
                      max={14}
                      value={durationMax}
                      onChange={(event) => setDurationMax(Number(event.target.value) || 2)}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {localizedStandardPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDestinationHint(preset)}
                      className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DestinationAutocompleteField
                    label={text.direction}
                    value={destinationHint}
                    onChange={handleDestinationInputChange}
                    onFocus={handleDestinationInputFocus}
                    onSelect={handleDestinationSuggestionSelect}
                    suggestions={destinationSuggestions}
                    isLoading={isSuggestingDestinations}
                    isOpen={destinationSuggestionsOpen}
                    placeholder={text.destinationPlaceholder}
                    loadingLabel={text.destinationSearching}
                    emptyLabel={text.destinationEmpty}
                  />
                  <Field label={text.budget}>
                    <Input type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} />
                  </Field>
                  <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.primaryFlow}</p>
                    <p className="mt-2 text-sm leading-6 text-emerald-900/80">{text.hotelFirst}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.sharedParams}</p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-950">{text.sharedTitle}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={text.origin}>
                <Input value={originCity} onChange={(event) => setOriginCity(event.target.value)} placeholder={text.originPlaceholder} />
              </Field>
              <Field label={text.travelStart}>
                <Input type="date" value={travelStartDate} onChange={(event) => setTravelStartDate(event.target.value)} />
              </Field>
              <Field label={text.nights}>
                <Input
                  type="date"
                  value={checkOutDate}
                  min={travelStartDate}
                  onChange={(event) => setTravelEndDate(event.target.value)}
                />
              </Field>
              <Field label={text.travelers}>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={travelers}
                  onChange={(event) => setTravelers(Number(event.target.value) || 1)}
                />
              </Field>
              <Field label={text.rooms}>
                <Input type="number" min={1} max={5} value={rooms} onChange={(event) => setRooms(Number(event.target.value) || 1)} />
              </Field>
              <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.quickPreview}</p>
                <p className="mt-2 text-sm font-semibold text-emerald-950">
                  {formatShortDate(travelStartDate, dateLocale)} - {formatShortDate(checkOutDate, dateLocale)}
                </p>
                <p className="mt-1 text-sm text-emerald-900/76">
                  {travelers} {text.travelersShort} / {rooms} {rooms === 1 ? text.roomSingle : rooms < 5 ? text.roomFew : text.roomMany}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={runPlanner}
              disabled={loading}
              className="mt-5 w-full rounded-full bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(21,128,61,0.22)] transition hover:bg-emerald-800 disabled:opacity-70"
            >
              {loading ? text.loadingPlan : text.showStayFlights}
            </button>
            {error ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

            {lastSnapshot ? (
              <div className="mt-5 rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/72 p-4">
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
              </div>
            ) : null}

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.savedPlans}</p>
                  <p className="mt-1 text-sm text-emerald-900/70">{text.savedPlansBody}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                  {savedTrips.length}
                </span>
              </div>
              <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                {savedTrips.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-emerald-900/10 bg-emerald-50/60 px-4 py-4 text-sm text-emerald-900/70">
                    {text.savedEmpty}
                  </p>
                ) : (
                  savedTrips.map((trip) => (
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
                  ))
                )}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.savedSearches}</p>
                  <p className="mt-1 text-sm text-emerald-900/70">{text.savedSearchesBody}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                  {savedSearches.length}
                </span>
              </div>
              <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                {savedSearches.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-emerald-900/10 bg-emerald-50/60 px-4 py-4 text-sm text-emerald-900/70">
                    {text.savedSearchesEmpty}
                  </p>
                ) : (
                  savedSearches.map((search) => (
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
                        )} / {search.originCity}
                      </span>
                      <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                        {text.reopenSearch}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5">
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
                {savedDestinations.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-emerald-900/10 bg-emerald-50/60 px-4 py-4 text-sm text-emerald-900/70">
                    {text.noSavedDestinations}
                  </p>
                ) : (
                  savedDestinations.map((destination) => (
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
                  ))
                )}
              </div>
            </div>

            <div className="mt-5">
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
                {comparedDestinations.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-emerald-900/10 bg-emerald-50/60 px-4 py-4 text-sm text-emerald-900/70">
                    {text.comparisonMemoryEmpty}
                  </p>
                ) : (
                  comparedDestinations.map((destination) => (
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
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>

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
          <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_18px_55px_rgba(16,84,48,0.08)]">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative min-h-[360px]">
                <Image
                  src={selectedStory.heroImage}
                  alt={selectedStory.name}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 56vw"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.08)_0%,rgba(6,16,10,0.72)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    {isDirectRouteSearch ? text.selectedRoute : text.bestForBrief}
                  </p>
                  <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
                    {selectedOption.destination.city}, {selectedOption.destination.country}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/84">{selectedStory.tagline}</p>
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap gap-3">
                  <SummaryPill label={text.score} value={`${selectedOption.score.toFixed(0)} / ${scoreLabel(selectedOption.score, locale)}`} />
                  <SummaryPill label={text.term} value={`${formatShortDate(travelStartDate, dateLocale)} - ${formatShortDate(checkOutDate, dateLocale)}`} />
                  <SummaryPill label={text.travelParty} value={`${travelers} ${text.travelersShort} / ${travelNights} ${text.selectedDatesValue}`} />
                </div>

                <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.whyNow}</p>
                  <p className="mt-2 text-sm leading-7 text-emerald-900/82">{selectedStory.summary}</p>
                  {localFocus ? (
                    <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-emerald-950 shadow-sm">
                      {text.exactMatch}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedStory.bestFor.map((tag) => (
                    <span key={tag} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedStory.highlights.slice(0, 4).map((highlight) => (
                    <div key={highlight} className="rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-sm font-medium text-emerald-950">
                      {highlight}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={buildSelectedRedirectHref("stays", activeAffiliateLinks.stays)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
                  >
                    <PartnerLogoMark brand={stayPartner} size="sm" variant="contrast" />
                    {text.openStay} {stayPartner}
                  </a>
                  <a
                    href={buildSelectedRedirectHref("flights", activeAffiliateLinks.flights)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                  >
                    <PartnerLogoMark brand={flightPartner} size="sm" />
                    {text.openFlights} {flightPartner}
                  </a>
                  <a
                    href={buildSelectedRedirectHref("cars", activeAffiliateLinks.cars)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                  >
                    <PartnerLogoMark brand={carPartner} size="sm" />
                    {text.openCars} {carPartner}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveTrip();
                    }}
                    disabled={savingTrip}
                    className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-70"
                  >
                    {savingTrip ? text.savingTrip : text.saveTrip}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSavedDestination()}
                    className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      isSelectedDestinationSaved
                        ? "bg-emerald-950 text-white hover:bg-emerald-900"
                        : "border border-emerald-900/12 bg-white text-emerald-950 hover:bg-emerald-50"
                    }`}
                  >
                    {isSelectedDestinationSaved ? text.savedDestination : text.saveDestination}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
            <article className="rounded-[1.7rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.topChoiceSummary}</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/76">{text.topChoiceSummaryBody}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {selectedOption.reasons.slice(0, 3).map((reason) => (
                  <div key={reason} className="rounded-2xl bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-950">
                    {reason}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[1.7rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(237,250,241,0.98),rgba(229,245,234,0.94))] p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.resultsNavigator}</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/76">{text.resultsNavigatorBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="#planner-stays"
                  className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  {text.jumpToStays}
                </a>
                <a
                  href="#planner-flights"
                  className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {text.jumpToFlights}
                </a>
                <a
                  href="#planner-guide"
                  className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {text.jumpToGuide}
                </a>
                <a
                  href="#planner-on-site"
                  className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {text.jumpToOnSite}
                </a>
              </div>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[1.7rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.interpretedBrief}</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/76">{text.interpretedBriefBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {interpretedBriefChips.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.methodologyTitle}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-900/76">{text.methodologyBody}</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-900/82">
                  {methodologyPoints.map((item) => (
                    <li key={item} className="ml-5 list-disc">{item}</li>
                  ))}
                </ul>
              </div>
              {strongestNeeds.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-emerald-50/70 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.decodedTravelStyle}</p>
                  <p className="mt-2 text-sm text-emerald-950">{strongestNeeds.join(" / ")}</p>
                </div>
              ) : null}
            </article>

            <article className="rounded-[1.7rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(237,250,241,0.98),rgba(229,245,234,0.94))] p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.whyFits}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {selectedOption.reasons.slice(0, 4).map((reason) => (
                  <div key={reason} className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-emerald-950">
                    {reason}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.watchLabel}</p>
                <div className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/76">
                  {selectedOption.tradeoffs.length > 0 ? (
                    selectedOption.tradeoffs.map((tradeoff) => <p key={tradeoff}>{tradeoff}</p>)
                  ) : (
                    <p>{text.noTradeoffs}</p>
                  )}
                </div>
              </div>
            </article>
          </section>

          {decisionLenses.length > 0 ? (
            <section className="rounded-[1.9rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.decisionLenses}</p>
                  <p className="mt-2 text-sm leading-7 text-emerald-900/76">{text.decisionLensesBody}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-4">
                {decisionLenses.map((lens) => {
                  const activeLens = lens.optionId === selectedOption.itineraryResultId;
                  return (
                    <button
                      key={lens.key}
                      type="button"
                      onClick={() => handleSelectOption(lens.optionId)}
                      className={`rounded-[1.5rem] border p-4 text-left transition ${
                        activeLens
                          ? "border-emerald-500/60 bg-emerald-50 shadow-sm"
                          : "border-emerald-900/10 bg-white hover:-translate-y-0.5 hover:border-emerald-500/40"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{lens.title}</p>
                      <h3 className="mt-2 text-xl font-bold text-emerald-950">
                        {lens.city}, {lens.country}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-emerald-900/74">{lens.body}</p>
                      <span className="mt-4 inline-flex rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">
                        {text.lensOpen}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="grid gap-3 xl:grid-cols-4">
            {bookingDeck.map((card, index) => {
              const cardClassName =
                card.tone === "primary"
                  ? "border-emerald-700 bg-emerald-700 text-white shadow-[0_20px_60px_rgba(21,128,61,0.22)]"
                  : card.tone === "dark"
                    ? "border-emerald-950 bg-emerald-950 text-white shadow-[0_18px_55px_rgba(7,31,18,0.16)]"
                    : "border-emerald-900/10 bg-white text-emerald-950 shadow-[0_16px_45px_rgba(16,84,48,0.06)]";
              const eyebrowClassName = card.tone === "light" ? "text-emerald-700" : "text-emerald-200";
              const descriptionClassName = card.tone === "light" ? "text-emerald-900/72" : "text-white/72";
              const buttonClassName =
                card.tone === "primary"
                  ? "bg-white text-emerald-950 hover:bg-emerald-50"
                  : card.tone === "dark"
                    ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                    : "bg-emerald-700 text-white hover:bg-emerald-800";

              return (
                <a
                  key={card.title + index}
                  href={card.href}
                  target={card.href.startsWith("#") ? undefined : "_blank"}
                  rel={card.href.startsWith("#") ? undefined : "noreferrer"}
                  className={`animate-rise-card rounded-[1.7rem] border p-5 transition duration-300 hover:-translate-y-1 ${cardClassName}`}
                >
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${eyebrowClassName}`}>{card.eyebrow}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <PartnerLogoMark
                      brand={card.brand}
                      size="md"
                      variant={card.tone === "light" ? "brand" : "contrast"}
                    />
                    <h3 className="text-2xl font-bold">{card.title}</h3>
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${descriptionClassName}`}>{card.description}</p>
                  <span className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${buttonClassName}`}>
                    <PartnerLogoMark brand={card.brand} size="sm" variant={card.tone === "light" ? "brand" : "neutral"} />
                    {index === 0 ? text.showStay : index === 1 ? text.showFlights : index === 2 ? text.showCars : text.showOnSite}
                  </span>
                </a>
              );
            })}
          </section>

          <section className="sticky top-20 z-20 -mx-1 lg:hidden">
            <div className="rounded-[1.5rem] border border-emerald-900/12 bg-white/94 p-4 shadow-[0_18px_40px_rgba(16,84,48,0.12)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.mobileQuickActions}</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-950">
                    {selectedOption.destination.city}, {selectedOption.destination.country}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-emerald-900/68">{text.mobileQuickBody}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (mobileSettingsOpen) {
                      setMobileSettingsOpen(false);
                    } else {
                      openMobileSettings();
                    }
                  }}
                  className="rounded-full border border-emerald-900/12 bg-white px-3 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {mobileSettingsOpen ? text.closeTripEditor : text.editTrip}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href="#planner-stays"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  {text.jumpToStays}
                </a>
                <a
                  href="#planner-flights"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-900/12 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {text.jumpToFlights}
                </a>
                <a
                  href="#planner-guide"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-900/12 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {text.jumpToGuide}
                </a>
                <a
                  href="#planner-on-site"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-900/12 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                >
                  {text.jumpToOnSite}
                </a>
              </div>
            </div>
          </section>

          <section
            ref={settingsPanelRef}
            id="planner-settings"
            className="rounded-[1.9rem] border border-emerald-900/10 bg-white p-4 shadow-[0_16px_45px_rgba(16,84,48,0.06)] sm:p-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.bookingSettings}</p>
                <h3 className="mt-2 text-2xl font-bold text-emerald-950">{text.bookingSettingsBody}</h3>
                <p className="mt-2 text-sm text-emerald-900/70">{text.bookingSettingsHint}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                  {originCity} -&gt; {selectedOption.destination.city}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSettingsOpen((current) => !current)}
                  className="rounded-full border border-emerald-900/12 bg-white px-3 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-50 lg:hidden"
                >
                  {mobileSettingsOpen ? text.closeTripEditor : text.editTrip}
                </button>
              </div>
            </div>

            <div className={`${mobileSettingsOpen ? "mt-4 block" : "mt-4 hidden"} lg:block`}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <DestinationAutocompleteField
                  label={text.direction}
                  value={destinationHint}
                  onChange={handleDestinationInputChange}
                  onFocus={handleDestinationInputFocus}
                  onSelect={handleDestinationSuggestionSelect}
                  suggestions={destinationSuggestions}
                  isLoading={isSuggestingDestinations}
                  isOpen={destinationSuggestionsOpen}
                  placeholder={text.destinationPlaceholder}
                  loadingLabel={text.destinationSearching}
                  emptyLabel={text.destinationEmpty}
                />
                <Field label={text.origin}>
                  <Input value={originCity} onChange={(event) => setOriginCity(event.target.value)} />
                </Field>
                <Field label={text.travelStart}>
                  <Input type="date" value={travelStartDate} onChange={(event) => setTravelStartDate(event.target.value)} />
                </Field>
                <Field label={text.nights}>
                  <Input
                    type="date"
                    value={checkOutDate}
                    min={travelStartDate}
                    onChange={(event) => setTravelEndDate(event.target.value)}
                  />
                </Field>
                <Field label={text.travelers}>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={travelers}
                    onChange={(event) => setTravelers(Number(event.target.value) || 1)}
                  />
                </Field>
                <Field label={text.rooms}>
                  <Input type="number" min={1} max={5} value={rooms} onChange={(event) => setRooms(Number(event.target.value) || 1)} />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={runPlanner}
                  disabled={loading}
                  className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_30px_rgba(21,128,61,0.18)] transition hover:bg-emerald-800 disabled:opacity-70"
                >
                  {loading ? text.loadingPlan : text.refreshFlow}
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-5">
            <div id="planner-stays" ref={stayOffersRef} className="scroll-mt-36">
              <StayOffersPanel
                destinationCity={selectedOption.destination.city}
                destinationCountry={selectedOption.destination.country}
                checkInDate={travelStartDate}
                checkOutDate={checkOutDate}
                guests={travelers}
                rooms={rooms}
              />
            </div>
            <div id="planner-flights" className="scroll-mt-36">
              <FlightOffersPanel
                destinationCity={selectedOption.destination.city}
                destinationCountry={selectedOption.destination.country}
                originCity={originCity}
                departureDate={travelStartDate}
                returnDate={checkOutDate}
                passengers={travelers}
                partnerUrl={activeAffiliateLinks.flights}
              />
            </div>
            <div id="planner-guide" className="scroll-mt-36">
              <DestinationAttractionsPanel city={selectedOption.destination.city} country={selectedOption.destination.country} />
            </div>
            <div id="aktywnosci-na-miejscu" className="grid gap-5 xl:grid-cols-2">
              <div id="planner-on-site" className="scroll-mt-36">
                <ActivityOffersPanel
                  destinationCity={selectedOption.destination.city}
                  destinationCountry={selectedOption.destination.country}
                  fromDate={travelStartDate}
                  toDate={checkOutDate}
                  travelers={travelers}
                />
              </div>
              <div id="planner-transfers" className="scroll-mt-36">
                <TransferOffersPanel
                  destinationCity={selectedOption.destination.city}
                  destinationCountry={selectedOption.destination.country}
                  outboundDate={travelStartDate}
                  adults={travelers}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {result ? (
        <section className="grid gap-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.remainingOptions}</p>
              <h2 className="mt-1 text-2xl font-bold text-emerald-950">
                {mode === "standard" ? text.directPrompt : text.discoveryPrompt}
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-emerald-900/72">
              {text.remainingBody}
            </p>
          </div>

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

      {selectedOption && bookingDeck.length >= 2 ? (
        <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
          <div className="rounded-[1.7rem] border border-emerald-900/12 bg-emerald-950/96 p-4 text-white shadow-[0_24px_60px_rgba(7,31,18,0.3)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">{text.mobileBarEyebrow}</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {selectedOption.destination.city}, {selectedOption.destination.country}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/72">
                  {formatShortDate(travelStartDate, dateLocale)} - {formatShortDate(checkOutDate, dateLocale)} / {originCity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSaveTrip()}
                disabled={savingTrip}
                className="rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-70"
              >
                {savingTrip ? text.savingTrip : text.saveTrip}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/68">{text.mobileBarBody}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a
                href={bookingDeck[0].href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
              >
                <PartnerLogoMark brand={bookingDeck[0].brand} size="sm" variant="neutral" />
                {text.showStay}
              </a>
              <a
                href={bookingDeck[1].href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/14"
              >
                <PartnerLogoMark brand={bookingDeck[1].brand} size="sm" variant="contrast" />
                {text.showFlights}
              </a>
              <button
                type="button"
                onClick={openMobileSettings}
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/14"
              >
                {text.editTrip}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {result && !selectedOption ? (
        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900 shadow-sm">
          Nie udalo sie zbudowac pelnego rankingu kierunkow dla tego zapytania. Sprobuj zmienic termin lub kierunek i uruchomic wyszukiwanie ponownie.
        </section>
      ) : null}
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


