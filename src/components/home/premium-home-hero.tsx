"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useLanguage } from "@/components/site/language-provider";
import { LocalizedLink } from "@/components/site/localized-link";
import { defaultTravelStartDate } from "@/lib/mvp/travel-dates";
import type { DestinationSuggestion } from "@/lib/mvp/types";

interface HeroSlide {
  id: string;
  city: string;
  country: string;
  label: string;
  title: string;
  description: string;
  image: string;
  href: string;
  tags: string[];
  meta: string;
}

interface PremiumHomeHeroProps {
  slides: HeroSlide[];
  destinationCount: number;
  guideCount: number;
}

type SearchField = "origin" | "destination";

const heroCopy = {
  pl: {
    premiumBadge: "Premium travel planner",
    funnelBadge: "hotel-first funnel",
    titleTop: "Wybierz kierunek.",
    titleBottom: "Reszta uklada sie dalej.",
    description: "Jeden ekran do wybrania miasta. Jeden klik do pobytu. Jeden kolejny do lotow i reszty planu.",
    destinationCount: "kierunkow",
    guidesCount: "przewodnikow",
    inventoryBadge: "hotele, loty, atrakcje, auta",
    priority: "Priorytet",
    primaryTitle: "Wybierz miasto docelowe",
    primaryDescription: "To glowna akcja na stronie. Termin i sklad podrozy leca dalej bez zgadywania.",
    primaryTag: "glowne CTA",
    stageDirection: "Kierunek",
    stageStay: "Pobyt",
    stageNext: "Dalej",
    stagePlaceholder: "Wybierz miasto",
    stageNextValue: "Loty i dodatki",
    originLabel: "Skad lecisz",
    destinationLabel: "Dokad lecisz",
    searchOriginPlaceholder: "Warszawa, Krakow, Wroclaw...",
    searchDestinationPlaceholder: "Malaga, Rzym, Barcelona, Paryz, Bali...",
    originSearching: "Szukamy miasta wylotu...",
    destinationSearching: "Szukamy kierunkow...",
    originTag: "wylot",
    destinationTag: "kierunek",
    cityTag: "miasto",
    startDate: "Start podrozy",
    nights: "Liczba nocy",
    travelers: "Podrozni",
    button: "Pokaz pobyt i loty",
    discoveryEyebrow: "Druga sciezka",
    discoveryTitle: "Nie znasz miasta? Opisz typ wyjazdu.",
    discoveryDescription: "Ten tryb jest widoczny, ale dalej drugi. Najpierw kierunek, potem brief dla niezdecydowanych.",
    discoveryButton: "Szukaj po opisie",
    quickSuggestions: "Szybkie wybory",
    suggestionError: "Nie udalo sie pobrac podpowiedzi.",
    slideActive: "na ekranie",
    slideInactive: "pokaz",
    nextScenario: "Scenariusz po kliknieciu",
    nextScenarioBody: "Najpierw pobyt, potem loty, apartamenty i mobilnosc dla tej samej daty.",
    resultsBadge: "od razu do wynikow",
    guideLabel: "przewodnik",
    openCatalog: "Otworz katalog kierunkow",
    discoveryPlaceholder: "Np. chce cieply kierunek na 5 dni, z plaza i miastem, bez dlugiej logistyki.",
    nightsUnit: "noce",
    travelersUnit: "os.",
    discoveryFlowHint: "Najpierw ranking kierunkow, potem hotel i lot dla wybranego miasta.",
  },
  en: {
    premiumBadge: "Premium travel planner",
    funnelBadge: "hotel-first funnel",
    titleTop: "Choose a destination.",
    titleBottom: "Everything else follows.",
    description: "One screen to pick the city. One click to stays. One more to flights and the next travel step.",
    destinationCount: "destinations",
    guidesCount: "guides",
    inventoryBadge: "stays, flights, activities, cars",
    priority: "Priority",
    primaryTitle: "Choose your destination city",
    primaryDescription: "This is the main action on the homepage. Dates and traveler details move forward without extra friction.",
    primaryTag: "main CTA",
    stageDirection: "Destination",
    stageStay: "Stay",
    stageNext: "Next",
    stagePlaceholder: "Choose a city",
    stageNextValue: "Flights and extras",
    originLabel: "Flying from",
    destinationLabel: "Flying to",
    searchOriginPlaceholder: "Warsaw, Krakow, Wroclaw...",
    searchDestinationPlaceholder: "Malaga, Rome, Barcelona, Paris, Bali...",
    originSearching: "Searching departure cities...",
    destinationSearching: "Searching destinations...",
    originTag: "origin",
    destinationTag: "destination",
    cityTag: "city",
    startDate: "Start date",
    nights: "Nights",
    travelers: "Travelers",
    button: "Show stays and flights",
    discoveryEyebrow: "Secondary path",
    discoveryTitle: "Not sure where to go? Describe the trip.",
    discoveryDescription: "This mode stays visible but secondary. The homepage still leads with destination choice.",
    discoveryButton: "Search by brief",
    quickSuggestions: "Quick picks",
    suggestionError: "Could not load suggestions.",
    slideActive: "live now",
    slideInactive: "show",
    nextScenario: "What opens next",
    nextScenarioBody: "First stays, then flights, apartments and mobility for the same dates.",
    resultsBadge: "straight to results",
    guideLabel: "guide",
    openCatalog: "Open destination catalog",
    discoveryPlaceholder: "E.g. I want a warm 5-day trip with a beach, a city and easy logistics.",
    nightsUnit: "nights",
    travelersUnit: "trav.",
    discoveryFlowHint: "First destination matches, then the stay and flight flow for the selected city.",
  },
} as const;

const discoveryPrompts = {
  pl: [
    "Cieply kierunek na 5 dni, plaza i zwiedzanie, budzet do 2500 zl.",
    "Krotki city break dla dwojga z dobrym jedzeniem i ladnym centrum.",
    "Spokojny wyjazd z Polski, malo logistyki, duzo slonca i widokow.",
  ],
  en: [
    "A warm 5-day trip with beach time, sightseeing and a budget up to 2500 PLN.",
    "A short city break for two with great food and a beautiful center.",
    "An easy trip from Poland with sun, views and very little logistics.",
  ],
} as const;

function buildStandardPlannerHref(params: {
  origin: string;
  destination: string;
  startDate: string;
  nights: number;
  travelers: number;
}): string {
  const searchParams = new URLSearchParams({
    mode: "standard",
    q: params.destination,
    origin: params.origin,
    destination: params.destination,
    startDate: params.startDate,
    nights: String(params.nights),
    travelers: String(params.travelers),
    days: String(params.nights),
  });

  return `/planner?${searchParams.toString()}`;
}

function buildDiscoveryPlannerHref(query: string): string {
  return `/planner?mode=discovery&q=${encodeURIComponent(query)}`;
}

export function PremiumHomeHero({ slides, destinationCount, guideCount }: PremiumHomeHeroProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { locale } = useLanguage();
  const text = heroCopy[locale];
  const localizedDiscoveryPrompts = locale === "en" ? discoveryPrompts.en : discoveryPrompts.pl;
  const suggestionErrorText = text.suggestionError;

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [originQuery, setOriginQuery] = useState("Warszawa");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [startDate, setStartDate] = useState(defaultTravelStartDate());
  const [nights, setNights] = useState(4);
  const [travelers, setTravelers] = useState(2);
  const [activeField, setActiveField] = useState<SearchField | null>(null);
  const [discoveryQuery, setDiscoveryQuery] = useState<string>(localizedDiscoveryPrompts[0]);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const activeQuery = activeField === "origin" ? originQuery.trim() : destinationQuery.trim();
  const deferredKnownQuery = useDeferredValue(activeQuery);
  const safeSlides =
    slides.length > 0
      ? slides
      : [
          {
            id: "fallback-home-slide",
            city: "Malaga",
            country: "Spain",
            label: "Malaga, Spain",
            title: "Malaga",
            description: "Plaza, stare miasto i szybki start do pelnego planu wyjazdu.",
            image: "/branding/helptravel-logo.png",
            href: "/planner?mode=standard&q=Malaga",
            tags: ["slonce", "city break", "plaza"],
            meta: "loty, hotele i dodatki",
          },
        ];

  const activeSlide = safeSlides[activeSlideIndex] ?? safeSlides[0];
  const quickDestinations = safeSlides.slice(0, 6);
  const dropdownVisible = Boolean(activeField) && (isSearching || searchError || suggestions.length > 0);
  const routePreview = destinationQuery.trim() || activeSlide.city;
  const previewOrigin = originQuery.trim() || text.searchOriginPlaceholder.split(",")[0];
  const previewSummary = `${previewOrigin} → ${routePreview} · ${nights} ${text.nightsUnit} · ${travelers} ${text.travelersUnit}`;
  const stageCards = [
    { step: "01", label: text.stageDirection, value: routePreview || text.stagePlaceholder },
    { step: "02", label: text.stageStay, value: `${nights} ${text.nightsUnit}` },
    { step: "03", label: text.stageNext, value: text.stageNextValue },
  ];

  useEffect(() => {
    const allPresetValues: string[] = [...discoveryPrompts.pl, ...discoveryPrompts.en];
    setDiscoveryQuery((current) => {
      if (!current.trim() || allPresetValues.includes(current)) {
        return localizedDiscoveryPrompts[0];
      }

      return current;
    });
  }, [localizedDiscoveryPrompts]);

  const rotateSlides = useEffectEvent(() => {
    startTransition(() => {
      setActiveSlideIndex((current) => (current + 1) % safeSlides.length);
    });
  });

  useEffect(() => {
    if (safeSlides.length < 2) {
      return;
    }

    const intervalId = window.setInterval(() => {
      rotateSlides();
    }, 3200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [safeSlides.length]);

  const handleOutsidePointer = useEffectEvent((event: PointerEvent) => {
    if (!rootRef.current) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && !rootRef.current.contains(target)) {
      setActiveField(null);
      setHighlightedIndex(-1);
    }
  });

  useEffect(() => {
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, []);

  useEffect(() => {
    if (!activeField) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");

      try {
        const queryString = deferredKnownQuery ? `?q=${encodeURIComponent(deferredKnownQuery)}` : "";
        const response = await fetch(`/api/destinations/suggest${queryString}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(suggestionErrorText);
        }

        const payload = (await response.json()) as { items?: DestinationSuggestion[] };
        startTransition(() => {
          const nextSuggestions = payload.items ?? [];
          setSuggestions(nextSuggestions);
          setHighlightedIndex(nextSuggestions.length > 0 ? 0 : -1);
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setHighlightedIndex(-1);
          setSearchError(error instanceof Error ? error.message : suggestionErrorText);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, deferredKnownQuery ? 140 : 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeField, deferredKnownQuery, suggestionErrorText]);

  const submitKnownSearch = (suggestion?: DestinationSuggestion | null) => {
    const nextDestination = suggestion?.queryValue ?? destinationQuery.trim();
    const nextOrigin = originQuery.trim() || "Warszawa";
    if (!nextDestination) {
      return;
    }

    router.push(
      buildStandardPlannerHref({
        origin: nextOrigin,
        destination: nextDestination,
        startDate,
        nights,
        travelers,
      }),
    );
  };

  const submitDiscoverySearch = () => {
    const nextValue = discoveryQuery.trim();
    if (!nextValue) {
      return;
    }

    router.push(buildDiscoveryPlannerHref(nextValue));
  };

  const applySuggestionToField = (field: SearchField, suggestion?: DestinationSuggestion | null) => {
    if (!suggestion) {
      return;
    }

    if (field === "origin") {
      setOriginQuery(suggestion.city);
      setActiveField(null);
      setHighlightedIndex(-1);
      return;
    }

    setDestinationQuery(suggestion.queryValue);
    setActiveField(null);
    setHighlightedIndex(-1);
  };

  const handleKnownKeyDown = (field: SearchField, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (suggestions.length === 0) {
          return -1;
        }

        return current < suggestions.length - 1 ? current + 1 : 0;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (suggestions.length === 0) {
          return -1;
        }

        return current > 0 ? current - 1 : suggestions.length - 1;
      });
      return;
    }

    if (event.key === "Escape") {
      setActiveField(null);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeField === field && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        if (field === "origin") {
          applySuggestionToField(field, suggestions[highlightedIndex]);
        } else {
          applySuggestionToField(field, suggestions[highlightedIndex]);
        }
        return;
      }

      if (field === "destination") {
        submitKnownSearch();
      }
    }
  };

  return (
    <section
      ref={rootRef}
      className="relative isolate overflow-hidden rounded-[2.5rem] border border-emerald-900/10 bg-emerald-950 text-white shadow-[0_42px_140px_rgba(7,31,18,0.3)]"
    >
      <div className="absolute inset-0">
        {safeSlides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-[opacity,transform] duration-[1400ms] ${index === activeSlideIndex ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[1.04]"}`}
          >
            <Image
              src={slide.image}
              alt={slide.label}
              fill
              priority={index === 0}
              sizes="100vw"
              className="animate-hero-pan object-cover"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(108deg,rgba(2,13,8,0.88)_0%,rgba(4,23,13,0.62)_48%,rgba(7,31,18,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,222,128,0.28),transparent_22%),radial-gradient(circle_at_top_right,rgba(187,247,208,0.18),transparent_20%),radial-gradient(circle_at_bottom_center,rgba(16,185,129,0.18),transparent_28%)]" />
      </div>

      <div className="relative grid min-h-[calc(100svh-2rem)] gap-8 px-5 py-6 sm:px-8 sm:py-8 xl:grid-cols-[1.08fr_0.92fr] xl:px-10 xl:py-10">
        <div className="flex flex-col justify-between gap-8">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex rounded-full border border-white/14 bg-white/8 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-100/90">
                {text.premiumBadge}
              </span>
              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                {text.funnelBadge}
              </span>
            </div>
            <h1 className="mt-5 max-w-4xl text-balance font-display text-5xl leading-[0.9] sm:text-6xl xl:text-7xl">
              {text.titleTop}
              <br />
              {text.titleBottom}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/76 sm:text-lg">
              {text.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88">
                {destinationCount}+ {text.destinationCount}
              </span>
              <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88">
                {guideCount}+ {text.guidesCount}
              </span>
              <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88">
                {text.inventoryBadge}
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="overflow-hidden rounded-[1.9rem] border border-white/12 bg-white/8 backdrop-blur-xl">
              <div className="relative h-72">
                <Image src={activeSlide.image} alt={activeSlide.label} fill sizes="(max-width: 1280px) 100vw, 40vw" className="object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,20,11,0.05)_0%,rgba(5,20,11,0.75)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">{activeSlide.meta}</p>
                  <h2 className="mt-2 text-3xl font-bold text-white">
                    {activeSlide.city}, {activeSlide.country}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">{activeSlide.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeSlide.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/88">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <div className="grid gap-3">
              {safeSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveSlideIndex(index)}
                  className={`group flex items-center justify-between rounded-[1.4rem] border px-4 py-3 text-left transition duration-300 ${
                    index === activeSlideIndex
                      ? "border-white/18 bg-white/12 shadow-[0_18px_40px_rgba(4,19,10,0.18)]"
                      : "border-white/10 bg-white/[0.06] hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.09]"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{slide.city}</p>
                    <p className="mt-1 text-xs text-white/64">{slide.country}</p>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                    {index === activeSlideIndex ? text.slideActive : text.slideInactive}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-end xl:justify-end">
          <div className="w-full max-w-2xl space-y-4">
            <article className="animate-glow-pulse rounded-[2rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,250,246,0.95))] p-5 text-emerald-950 shadow-[0_28px_90px_rgba(4,26,14,0.24)] backdrop-blur-2xl sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.priority}</p>
                  <h2 className="mt-2 text-3xl font-bold text-emerald-950 sm:text-[2.1rem]">{text.primaryTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/72">{text.primaryDescription}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900">
                  {text.primaryTag}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {stageCards.map((card) => (
                  <div key={card.step} className="rounded-[1.4rem] border border-emerald-900/8 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {card.step} · {card.label}
                    </p>
                    <p className="mt-2 text-sm font-bold text-emerald-950">{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700" htmlFor="hero-origin-search">
                    {text.originLabel}
                  </label>
                  <input
                    id="hero-origin-search"
                    value={originQuery}
                    onChange={(event) => setOriginQuery(event.target.value)}
                    onFocus={() => setActiveField("origin")}
                    onKeyDown={(event) => handleKnownKeyDown("origin", event)}
                    placeholder={text.searchOriginPlaceholder}
                    className="mt-2 w-full rounded-[1.6rem] border border-emerald-900/12 bg-white px-5 py-4 text-base font-medium text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />

                  {dropdownVisible && activeField === "origin" ? (
                    <div className="absolute inset-x-0 top-[calc(100%+0.75rem)] z-20 rounded-[1.5rem] border border-emerald-900/10 bg-white p-3 shadow-[0_28px_60px_rgba(12,58,34,0.12)]">
                      {isSearching ? (
                        <div className="flex items-center gap-3 rounded-[1.2rem] bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-900">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />
                          {text.originSearching}
                        </div>
                      ) : null}

                      {!isSearching && suggestions.length > 0 ? (
                        <div className="space-y-2">
                          {suggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.id}-${suggestion.label}-origin`}
                              type="button"
                              onMouseEnter={() => setHighlightedIndex(index)}
                              onClick={() => applySuggestionToField("origin", suggestion)}
                              className={`flex w-full items-start justify-between gap-3 rounded-[1.2rem] px-4 py-3 text-left transition ${
                                highlightedIndex === index ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-emerald-50/70"
                              }`}
                            >
                              <div>
                                <p className="text-sm font-bold text-emerald-950">{suggestion.city}</p>
                                <p className="mt-1 text-xs leading-5 text-emerald-900/66">
                                  {suggestion.country}
                                  {suggestion.region ? `, ${suggestion.region}` : ""}
                                </p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                                {text.originTag}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {!isSearching && searchError ? <p className="rounded-[1.2rem] bg-red-50 px-4 py-3 text-sm text-red-700">{searchError}</p> : null}
                    </div>
                  ) : null}
                </div>

                <div className="relative">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700" htmlFor="hero-destination-search">
                    {text.destinationLabel}
                  </label>
                  <input
                    id="hero-destination-search"
                    value={destinationQuery}
                    onChange={(event) => setDestinationQuery(event.target.value)}
                    onFocus={() => setActiveField("destination")}
                    onKeyDown={(event) => handleKnownKeyDown("destination", event)}
                    placeholder={text.searchDestinationPlaceholder}
                    className="mt-2 w-full rounded-[1.6rem] border border-emerald-900/12 bg-white px-5 py-4 text-base font-medium text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />

                  {dropdownVisible && activeField === "destination" ? (
                    <div className="absolute inset-x-0 top-[calc(100%+0.75rem)] z-20 rounded-[1.5rem] border border-emerald-900/10 bg-white p-3 shadow-[0_28px_60px_rgba(12,58,34,0.12)]">
                      {isSearching ? (
                        <div className="flex items-center gap-3 rounded-[1.2rem] bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-900">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />
                          {text.destinationSearching}
                        </div>
                      ) : null}

                      {!isSearching && suggestions.length > 0 ? (
                        <div className="space-y-2">
                          {suggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.id}-${suggestion.label}-destination`}
                              type="button"
                              onMouseEnter={() => setHighlightedIndex(index)}
                              onClick={() => applySuggestionToField("destination", suggestion)}
                              className={`flex w-full items-start justify-between gap-3 rounded-[1.2rem] px-4 py-3 text-left transition ${
                                highlightedIndex === index ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-emerald-50/70"
                              }`}
                            >
                              <div>
                                <p className="text-sm font-bold text-emerald-950">{suggestion.city}</p>
                                <p className="mt-1 text-xs leading-5 text-emerald-900/66">
                                  {suggestion.country}
                                  {suggestion.region ? `, ${suggestion.region}` : ""}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                  suggestion.destinationSlug ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {suggestion.destinationSlug ? text.destinationTag : text.cityTag}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {!isSearching && searchError ? <p className="rounded-[1.2rem] bg-red-50 px-4 py-3 text-sm text-red-700">{searchError}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {text.startDate}
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="mt-2 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />
                </label>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {text.nights}
                  <input
                    type="number"
                    min={2}
                    max={21}
                    value={nights}
                    onChange={(event) => setNights(Number(event.target.value))}
                    className="mt-2 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />
                </label>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {text.travelers}
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={travelers}
                    onChange={(event) => setTravelers(Number(event.target.value))}
                    className="mt-2 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                  {quickDestinations.map((slide) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => {
                        setDestinationQuery(slide.label);
                        setActiveField(null);
                        setHighlightedIndex(-1);
                        const matchingSlideIndex = safeSlides.findIndex((item) => item.id === slide.id);
                        if (matchingSlideIndex >= 0) {
                          setActiveSlideIndex(matchingSlideIndex);
                        }
                      }}
                      className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-100"
                    >
                    {slide.city}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-emerald-900/8 bg-emerald-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.nextScenario}</p>
                    <p className="mt-2 text-sm font-semibold text-emerald-950">{previewSummary}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">{text.nextScenarioBody}</p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm">{text.resultsBadge}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => submitKnownSearch()}
                  className="inline-flex items-center rounded-full bg-emerald-700 px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_34px_rgba(21,128,61,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-800"
                >
                  {text.button}
                </button>
                <LocalizedLink
                  href="/kierunki"
                  className="inline-flex items-center rounded-full border border-emerald-900/10 bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-50"
                >
                  {text.openCatalog}
                </LocalizedLink>
              </div>
            </article>

            <article className="animate-float-gentle rounded-[1.8rem] border border-white/12 bg-white/8 p-5 text-white backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">{text.discoveryEyebrow}</p>
                  <h3 className="mt-2 text-2xl font-bold">{text.discoveryTitle}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/72">{text.discoveryDescription}</p>
                </div>
                <LocalizedLink
                  href={activeSlide.href}
                  className="rounded-full border border-white/14 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/90 transition hover:bg-white/14"
                >
                  {text.guideLabel} {activeSlide.city}
                </LocalizedLink>
              </div>

              <textarea
                value={discoveryQuery}
                onChange={(event) => setDiscoveryQuery(event.target.value)}
                className="mt-4 min-h-28 w-full rounded-[1.5rem] border border-white/12 bg-white/10 px-4 py-4 text-sm leading-7 text-white outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-300/25"
                placeholder={text.discoveryPlaceholder}
              />

              <div className="mt-4 flex flex-wrap gap-2">
                {localizedDiscoveryPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDiscoveryQuery(prompt)}
                    className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/92 transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={submitDiscoverySearch}
                  className="rounded-full bg-white px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-50"
                >
                  {text.discoveryButton}
                </button>
                <p className="text-sm text-white/66">
                  {text.discoveryFlowHint}
                </p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
