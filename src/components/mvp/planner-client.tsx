"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { ActivityOffersPanel } from "@/components/mvp/activity-offers-panel";
import { DestinationAttractionsPanel } from "@/components/mvp/destination-attractions-panel";
import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { StayOffersPanel } from "@/components/mvp/stay-offers-panel";
import { TransferOffersPanel } from "@/components/mvp/transfer-offers-panel";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { addDaysToIsoDate, defaultTravelStartDate, formatShortDate, isoDateToMonth } from "@/lib/mvp/travel-dates";
import type { DiscoveryResponse, SavedTripView } from "@/lib/mvp/types";

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
    nights: "Liczba nocy",
    travelers: "Podrozni",
    rooms: "Pokoje",
    quickPreview: "Szybki podglad",
    travelersShort: "os.",
    roomSingle: "pokoj",
    roomFew: "pokoje",
    roomMany: "pokoi",
    loadingPlan: "Ukladamy plan...",
    showStayFlights: "Pokaz pobyt i loty",
    savedPlans: "Zapisane plany",
    savedPlansBody: "Wrocisz do nich jednym kliknieciem.",
    savedEmpty: "Po pierwszym wyniku tutaj pojawia sie zapisane scenariusze.",
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
    destinationPlaceholder: "Np. Malaga",
    originPlaceholder: "Warszawa",
    primaryFlow: "Sciezka glowna",
    hotelFirst: "Najpierw pobyt, potem lot i kolejne kroki.",
    selectedDatesValue: "noce",
    resultRank: "Pozycja",
    directPrompt: "Podobne kierunki obok glownego wyboru",
    discoveryPrompt: "Najlepsze alternatywy",
    whyItFits: "Dlaczego pasuje",
    watchLabel: "Na co uwazac",
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
    nights: "Nights",
    travelers: "Travelers",
    rooms: "Rooms",
    quickPreview: "Quick preview",
    travelersShort: "trav.",
    roomSingle: "room",
    roomFew: "rooms",
    roomMany: "rooms",
    loadingPlan: "Building your plan...",
    showStayFlights: "Show stays and flights",
    savedPlans: "Saved plans",
    savedPlansBody: "You can return to them in one click.",
    savedEmpty: "Saved scenarios will appear here after the first result.",
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
    destinationPlaceholder: "E.g. Malaga",
    originPlaceholder: "Warsaw",
    primaryFlow: "Primary route",
    hotelFirst: "Lead with stays first, then flights and the next trip steps.",
    selectedDatesValue: "nights",
    resultRank: "Position",
    directPrompt: "Similar destinations next to your main pick",
    discoveryPrompt: "Best alternatives",
    whyItFits: "Why it fits",
    watchLabel: "Watch-outs",
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
    throw new Error(`Zapytanie nie powiodło się (${response.status}).`);
  }
  return (await response.json()) as T;
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
  initialNights?: number;
  autoRunStandardSearch?: boolean;
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
  initialNights,
  autoRunStandardSearch = false,
}: PlannerClientProps) {
  const { locale } = useLanguage();
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
  const autoSearchRef = useRef(false);
  const shouldFocusOffersRef = useRef(false);
  const stayOffersRef = useRef<HTMLDivElement | null>(null);

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
  const [travelNights, setTravelNights] = useState(initialNights ?? initialStandardDays);
  const [standardStyle] = useState(initialStyle);

  useEffect(() => {
    fetch("/api/trips/history")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSavedTrips(data?.items ?? []))
      .catch(() => setSavedTrips([]));
  }, []);

  const runPlanner = async () => {
    shouldFocusOffersRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const departureMonth = isoDateToMonth(travelStartDate);
      const data =
        mode === "discovery"
          ? await postJson<DiscoveryResponse>("/api/discovery", {
              query,
              originCity,
              travelers,
              budgetMaxPln: budget,
              durationMinDays: durationMin,
              durationMaxDays: durationMax,
              departureMonth,
            })
          : await postJson<DiscoveryResponse>("/api/standard", {
              originCity,
              destinationHint,
              travelers,
              budgetMaxPln: budget,
              durationDays: travelNights,
              departureMonth,
              style: standardStyle,
            });

      startTransition(() => {
        setResult(data);
        setSelectedOptionId(data.options[0]?.itineraryResultId ?? "");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się przygotować planu.");
    } finally {
      setLoading(false);
    }
  };

  const triggerInitialStandardSearch = useEffectEvent(() => {
    void runPlanner();
  });

  const revealOffers = useEffectEvent(() => {
    window.requestAnimationFrame(() => {
      stayOffersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  useEffect(() => {
    if (!autoRunStandardSearch || autoSearchRef.current) return;
    if (mode !== "standard" || !destinationHint.trim()) return;
    autoSearchRef.current = true;
    triggerInitialStandardSearch();
  }, [autoRunStandardSearch, destinationHint, mode]);

  const selectedOption =
    result?.options.find((option) => option.itineraryResultId === selectedOptionId) ?? result?.options[0] ?? null;
  const selectedStory = selectedOption ? getDestinationStory(selectedOption.destination) : null;
  const destinationFocus = result?.interpreted.destinationFocus;
  const localFocus = Boolean(destinationFocus && selectedOption && selectedOption.destination.slug === destinationFocus);
  const checkOutDate = addDaysToIsoDate(travelStartDate, travelNights);
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
  const carPartner = getAffiliateBrandLabel(activeAffiliateLinks?.cars, "Partner mobilności");
  const isDirectRouteSearch = mode === "standard" && Boolean(originCity.trim()) && Boolean(destinationHint.trim());

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
            description: text.bookingDeckStayBody,
            href: buildSelectedRedirectHref("stays", activeAffiliateLinks.stays),
            tone: "primary" as const,
          },
          {
            eyebrow: text.bookingDeckFlights,
            title: flightPartner,
            description: text.bookingDeckFlightsBody,
            href: buildSelectedRedirectHref("flights", activeAffiliateLinks.flights),
            tone: "dark" as const,
          },
          {
            eyebrow: text.bookingDeckCars,
            title: carPartner,
            description: text.bookingDeckCarsBody,
            href: buildSelectedRedirectHref("cars", activeAffiliateLinks.cars),
            tone: "light" as const,
          },
          {
            eyebrow: text.bookingDeckActivities,
            title: locale === "en" ? "On site" : "Na miejscu",
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel rounded-[2rem] border border-emerald-900/10 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.heroEyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold text-emerald-950 sm:text-4xl">Wybierz kierunek i przejdź od razu do konkretów.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-900/76">
              Najpierw dopasowanie kierunku, chwilę później pobyt, loty i kolejne kroki wyjazdu w jednym miejscu.
            </p>
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
              Szukam pomysłu
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(247,252,249,0.98),rgba(235,247,239,0.94))] p-4 sm:p-5">
            {mode === "discovery" ? (
              <div className="space-y-4">
                <Field label="Opisz wyjazd">
                  <Textarea
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Np. ciepły kierunek na 5 dni z plażą, zwiedzaniem i budżetem do 2000 zł."
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Budżet">
                    <Input type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} />
                  </Field>
                  <Field label="Minimum dni">
                    <Input
                      type="number"
                      min={2}
                      max={14}
                      value={durationMin}
                      onChange={(event) => setDurationMin(Number(event.target.value) || 2)}
                    />
                  </Field>
                  <Field label="Maksimum dni">
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
                  <Field label={text.direction}>
                    <Input
                      value={destinationHint}
                      onChange={(event) => setDestinationHint(event.target.value)}
                      placeholder={text.destinationPlaceholder}
                    />
                  </Field>
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
                  type="number"
                  min={1}
                  max={21}
                  value={travelNights}
                  onChange={(event) => setTravelNights(Number(event.target.value) || 1)}
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
                  {travelers} {text.travelersShort} · {rooms} {rooms === 1 ? text.roomSingle : rooms < 5 ? text.roomFew : text.roomMany}
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
                    <Link
                      key={trip.itineraryResultId}
                      href={`/trips/${trip.itineraryResultId}`}
                      className="flex items-center justify-between rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-950 transition hover:border-emerald-500/50 hover:bg-emerald-50"
                    >
                      <span>
                        {trip.city}, {trip.country}
                      </span>
                      <span className="text-xs text-emerald-700">{text.scoreWord} {trip.score.toFixed(0)}</span>
                    </Link>
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

      {result && selectedOption && selectedStory && activeAffiliateLinks ? (
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
                  <SummaryPill label={text.score} value={`${selectedOption.score.toFixed(0)} · ${scoreLabel(selectedOption.score, locale)}`} />
                  <SummaryPill label={text.term} value={`${formatShortDate(travelStartDate, dateLocale)} - ${formatShortDate(checkOutDate, dateLocale)}`} />
                  <SummaryPill label={text.travelParty} value={`${travelers} ${text.travelersShort} · ${travelNights} ${text.selectedDatesValue}`} />
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
                    className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
                  >
                    {text.openStay} {stayPartner}
                  </a>
                  <a
                    href={buildSelectedRedirectHref("flights", activeAffiliateLinks.flights)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                  >
                    {text.openFlights} {flightPartner}
                  </a>
                  <a
                    href={buildSelectedRedirectHref("cars", activeAffiliateLinks.cars)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-emerald-900/12 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                  >
                    {text.openCars} {carPartner}
                  </a>
                </div>
              </div>
            </div>
          </section>

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
                  <h3 className="mt-3 text-2xl font-bold">{card.title}</h3>
                  <p className={`mt-3 text-sm leading-6 ${descriptionClassName}`}>{card.description}</p>
                  <span className={`mt-5 inline-flex rounded-full px-4 py-2 text-sm font-bold transition ${buttonClassName}`}>
                    {index === 0 ? text.showStay : index === 1 ? text.showFlights : index === 2 ? text.showCars : text.showOnSite}
                  </span>
                </a>
              );
            })}
          </section>

          <section className="rounded-[1.9rem] border border-emerald-900/10 bg-white p-4 shadow-[0_16px_45px_rgba(16,84,48,0.06)] sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.bookingSettings}</p>
                <h3 className="mt-2 text-2xl font-bold text-emerald-950">{text.bookingSettingsBody}</h3>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                {originCity} → {selectedOption.destination.city}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Field label={text.origin}>
                <Input value={originCity} onChange={(event) => setOriginCity(event.target.value)} />
              </Field>
              <Field label={text.travelStart}>
                <Input type="date" value={travelStartDate} onChange={(event) => setTravelStartDate(event.target.value)} />
              </Field>
              <Field label={text.nights}>
                <Input
                  type="number"
                  min={1}
                  max={21}
                  value={travelNights}
                  onChange={(event) => setTravelNights(Number(event.target.value) || 1)}
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
          </section>

          <div className="grid gap-5">
            <div ref={stayOffersRef} className="scroll-mt-24">
              <StayOffersPanel
                destinationCity={selectedOption.destination.city}
                destinationCountry={selectedOption.destination.country}
                checkInDate={travelStartDate}
                nights={travelNights}
                guests={travelers}
                rooms={rooms}
              />
            </div>
            <FlightOffersPanel
              destinationCity={selectedOption.destination.city}
              destinationCountry={selectedOption.destination.country}
              originCity={originCity}
              departureDate={travelStartDate}
              passengers={travelers}
              partnerUrl={activeAffiliateLinks.flights}
            />
            <DestinationAttractionsPanel city={selectedOption.destination.city} country={selectedOption.destination.country} />
            <div id="aktywnosci-na-miejscu" className="grid gap-5 xl:grid-cols-2">
              <ActivityOffersPanel
                destinationCity={selectedOption.destination.city}
                destinationCountry={selectedOption.destination.country}
                fromDate={travelStartDate}
                toDate={checkOutDate}
                travelers={travelers}
              />
              <TransferOffersPanel
                destinationCity={selectedOption.destination.city}
                destinationCountry={selectedOption.destination.country}
                outboundDate={travelStartDate}
                adults={travelers}
              />
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
                  onClick={() => setSelectedOptionId(option.itineraryResultId)}
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
                              alt={`${story.name} zdjęcie ${index + 1}`}
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
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-[1.25rem] bg-emerald-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.watchLabel}</p>
                          <ul className="mt-2 space-y-2 text-sm leading-6 text-emerald-900/82">
                            {(option.tradeoffs.length > 0 ? option.tradeoffs : [text.noTradeoffs]).map((tradeoff) => (
                              <li key={tradeoff}>• {tradeoff}</li>
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
    </div>
  );
}
