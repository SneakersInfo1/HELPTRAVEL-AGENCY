"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { sendClientEvent } from "@/lib/mvp/client-events";
import { localizeHref, localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import {
  countNightsBetweenIsoDates,
  defaultTravelEndDate,
  defaultTravelStartDate,
  normalizeTravelEndDate,
} from "@/lib/mvp/travel-dates";
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
  locale?: SiteLocale;
}

type HeroMode = "standard" | "discovery";
type SearchField = "origin" | "destination";

const heroCopy = {
  pl: {
    title: "Szybciej zaplanuj wyjazd 2-7 dni.",
    description:
      "Masz już kierunek albo dopiero szukasz pomysłu? Ustaw termin i skład podróży, a my poprowadzimy Cię do noclegów, lotów i dalszych kroków.",
    standardMode: "Mam kierunek",
    discoveryMode: "Pomóż mi wybrać",
    originLabel: "Skąd lecisz",
    destinationLabel: "Dokąd chcesz lecieć",
    discoveryLabel: "Jakiego wyjazdu szukasz",
    searchOriginPlaceholder: "Np. Warszawa",
    searchDestinationPlaceholder: "Np. Malaga, Rzym, Lizbona",
    discoveryPlaceholder: "Np. ciepły wyjazd na 5 dni, z plażą i miastem, bez długiej logistyki.",
    startDate: "Wylot",
    endDate: "Powrot",
    travelers: "Liczba osób",
    submitStandard: "Pokaż noclegi i loty",
    submitDiscovery: "Pokaż pomysły na wyjazd",
    openCatalog: "Zobacz katalog kierunków",
    quickChoices: "Popularne kierunki",
    freeUse: "Korzystanie z serwisu jest darmowe",
    partnerBooking: "Rezerwujesz u partnera",
    catalogCount: "kierunków w plannerze",
    guideCount: "pełne przewodniki",
    originSearching: "Szukamy miasta wylotu...",
    destinationSearching: "Szukamy kierunków...",
    noMatches: "Nie widzimy jeszcze dopasowan. Sprobuj inne miasto lub kraj.",
    catalogLink: "Przejdź do katalogu",
    quickStartLabel: "Szybki start",
    quickStartBody: "Jeśli chcesz wystartować od razu, wybierz jeden z prostych kierunków i przejdź dalej bez pustego formularza.",
    plannerScale: "W plannerze znajdziesz 235 kierunków. Pełne przewodniki mamy obecnie dla 22 najwazniejszych.",
  },
  en: {
    title: "Start with the destination and see the next step.",
    description:
      "Choose a place or describe the kind of trip you want. Then move into stays, flights and the next travel steps in one place.",
    standardMode: "I know the destination",
    discoveryMode: "Help me choose",
    originLabel: "Flying from",
    destinationLabel: "Where do you want to go",
    discoveryLabel: "What kind of trip do you want",
    searchOriginPlaceholder: "E.g. Warsaw",
    searchDestinationPlaceholder: "E.g. Malaga, Rome, Lisbon",
    discoveryPlaceholder: "E.g. a warm 5-day trip with a beach, a city and easy logistics.",
    startDate: "Departure",
    endDate: "Return",
    travelers: "Travelers",
    submitStandard: "Show stays and flights",
    submitDiscovery: "Show trip ideas",
    openCatalog: "Browse destinations",
    quickChoices: "Popular picks",
    freeUse: "Free to use",
    partnerBooking: "Final booking with a partner",
    catalogCount: "destinations in the planner",
    guideCount: "full guides",
    originSearching: "Searching departure cities...",
    destinationSearching: "Searching destinations...",
    noMatches: "No matches yet. Try another city or country.",
    catalogLink: "Open the catalog",
    quickStartLabel: "Quick start",
    quickStartBody: "If you want the easiest possible start, pick one of these destinations and move on without an empty form.",
    plannerScale: "235+ destinations in the planner, 22 full guides, and final booking with a partner.",
  },
} as const;

const discoveryPrompts = {
  pl: [
    "City break dla dwojga z dobrym jedzeniem i ladnym centrum.",
    "Ciepły wyjazd na 5 dni, plażą i zwiedzanie, bez drogiego lotu.",
    "Weekendowy wypad z Polski, malo logistyki i duzo slonca.",
  ],
  en: [
    "A city break for two with great food and a beautiful center.",
    "A warm 5-day trip with beach time, sightseeing and easy flight options.",
    "A weekend escape from Poland with little logistics and lots of sun.",
  ],
} as const;

function buildStandardPlannerHref(params: {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  locale: SiteLocale;
}): string {
  const nights = countNightsBetweenIsoDates(params.startDate, params.endDate, 4);
  const searchParams = new URLSearchParams({
    mode: "standard",
    q: params.destination,
    origin: params.origin,
    destination: params.destination,
    startDate: params.startDate,
    endDate: params.endDate,
    nights: String(nights),
    travelers: String(params.travelers),
    days: String(nights),
  });

  return localizeHref(`/planner?${searchParams.toString()}`, params.locale);
}

function buildDiscoveryPlannerHref(query: string, origin: string, startDate: string, endDate: string, travelers: number, locale: SiteLocale) {
  const nights = countNightsBetweenIsoDates(startDate, endDate, 4);
  const searchParams = new URLSearchParams({
    mode: "discovery",
    q: query,
    origin,
    startDate,
    endDate,
    nights: String(nights),
    travelers: String(travelers),
  });

  return localizeHref(`/planner?${searchParams.toString()}`, locale);
}

export function PremiumHomeHero({ slides, destinationCount, guideCount, locale: localeOverride }: PremiumHomeHeroProps) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? localeFromPathname(pathname) ?? contextLocale;
  const text = heroCopy[locale];
  const localizedDiscoveryPrompts = locale === "en" ? discoveryPrompts.en : discoveryPrompts.pl;
  const destinationInputId = useId();
  const originInputId = useId();
  const heroListboxId = useId();

  const [mode, setMode] = useState<HeroMode>("standard");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [originQuery, setOriginQuery] = useState("Warszawa");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState<string>(localizedDiscoveryPrompts[0]);
  const [startDate, setStartDate] = useState(defaultTravelStartDate());
  const [endDate, setEndDate] = useState(defaultTravelEndDate());
  const [travelers, setTravelers] = useState(2);
  const [activeField, setActiveField] = useState<SearchField | null>(null);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

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
            description: "Słońce, miasto i prosty start do planera.",
            image: "/branding/helptravel-logo.png",
            href: "/planner?mode=standard&q=Malaga",
            tags: ["słońce", "city break", "plażą"],
            meta: "łatwy start",
          },
        ];

  const activeSlide = safeSlides[activeSlideIndex] ?? safeSlides[0];
  const dropdownVisible = Boolean(activeField) && (isSearching || suggestions.length > 0 || activeQuery.length >= 2);
  const normalizedEndDate = normalizeTravelEndDate(startDate, endDate, 4);

  useEffect(() => {
    setEndDate((current) => normalizeTravelEndDate(startDate, current, countNightsBetweenIsoDates(startDate, current, 4)));
  }, [startDate]);

  useEffect(() => {
    setDiscoveryQuery((current) => (current.trim() ? current : localizedDiscoveryPrompts[0]));
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

    const intervalId = window.setInterval(() => rotateSlides(), 3600);
    return () => window.clearInterval(intervalId);
  }, [safeSlides.length]);

  const handleOutsidePointer = useEffectEvent((event: PointerEvent) => {
    if (!rootRef.current) {
      return;
    }

    if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
      setActiveField(null);
      setHighlightedIndex(-1);
    }
  });

  useEffect(() => {
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, []);

  useEffect(() => {
    if (!activeField) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const queryString = deferredKnownQuery ? `?q=${encodeURIComponent(deferredKnownQuery)}` : "";
        const response = await fetch(`/api/destinations/suggest${queryString}`, { signal: controller.signal });
        const payload = (await response.json()) as { items?: DestinationSuggestion[] };
        startTransition(() => {
          const nextSuggestions = payload.items ?? [];
          setSuggestions(nextSuggestions);
          setHighlightedIndex(nextSuggestions.length > 0 ? 0 : -1);
        });
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setHighlightedIndex(-1);
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
  }, [activeField, deferredKnownQuery]);

  const applySuggestionToField = (field: SearchField, suggestion?: DestinationSuggestion | null) => {
    if (!suggestion) {
      return;
    }

    if (field === "origin") {
      setOriginQuery(suggestion.city);
    } else {
      setDestinationQuery(suggestion.queryValue);
      const matchingSlideIndex = safeSlides.findIndex(
        (item) => item.city.toLowerCase() === suggestion.city.toLowerCase() || item.label.toLowerCase() === suggestion.queryValue.toLowerCase(),
      );
      if (matchingSlideIndex >= 0) {
        setActiveSlideIndex(matchingSlideIndex);
      }
    }

    setActiveField(null);
    setHighlightedIndex(-1);
  };

  const handleKnownKeyDown = (field: SearchField, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (suggestions.length === 0 ? -1 : current < suggestions.length - 1 ? current + 1 : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (suggestions.length === 0 ? -1 : current > 0 ? current - 1 : suggestions.length - 1));
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
        applySuggestionToField(field, suggestions[highlightedIndex]);
        return;
      }

      if (field === "destination") {
        const nextDestination = destinationQuery.trim();
        if (nextDestination) {
          sendClientEvent("hero_cta_clicked", { mode: "standard", destination: nextDestination });
          router.push(
            buildStandardPlannerHref({
              origin: originQuery.trim() || "Warszawa",
              destination: nextDestination,
              startDate,
              endDate: normalizedEndDate,
              travelers,
              locale,
            }),
          );
        }
      }
    }
  };

  const submitStandardSearch = () => {
    const nextDestination = destinationQuery.trim();
    if (!nextDestination) {
      return;
    }

    sendClientEvent("hero_cta_clicked", { mode: "standard", destination: nextDestination });
    router.push(
      buildStandardPlannerHref({
        origin: originQuery.trim() || "Warszawa",
        destination: nextDestination,
        startDate,
        endDate: normalizedEndDate,
        travelers,
        locale,
      }),
    );
  };

  const submitDiscoverySearch = () => {
    const nextQuery = discoveryQuery.trim();
    if (!nextQuery) {
      return;
    }

    sendClientEvent("hero_cta_clicked", { mode: "discovery", query: nextQuery });
    router.push(buildDiscoveryPlannerHref(nextQuery, originQuery.trim() || "Warszawa", startDate, normalizedEndDate, travelers, locale));
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
            className={`absolute inset-0 transition-[opacity,transform] duration-[1400ms] ${
              index === activeSlideIndex ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[1.04]"
            }`}
          >
            <Image src={slide.image} alt={slide.label} fill priority={index === 0} sizes="100vw" className="animate-hero-pan object-cover" />
          </div>
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(108deg,rgba(2,13,8,0.88)_0%,rgba(4,23,13,0.62)_48%,rgba(7,31,18,0.24)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,222,128,0.22),transparent_22%),radial-gradient(circle_at_bottom_center,rgba(16,185,129,0.14),transparent_28%)]" />
      </div>

      <div className="relative grid min-h-[calc(100svh-2rem)] gap-8 px-5 py-6 sm:px-8 sm:py-8 xl:grid-cols-[1fr_0.95fr] xl:px-10 xl:py-10">
        <div className="flex flex-col justify-between gap-8">
          <div className="max-w-3xl">
            <h1 className="max-w-4xl text-balance font-display text-5xl leading-[0.92] sm:text-6xl xl:text-7xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg">{text.description}</p>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-emerald-100/76">{text.plannerScale}</p>

            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{text.quickStartLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {safeSlides.slice(0, 4).map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => {
                      setActiveSlideIndex(index);
                      setDestinationQuery(slide.city);
                      setMode("standard");
                      sendClientEvent("planner_mode_selected", { source: "home_hero", mode: "standard", preset: slide.city });
                    }}
                    className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                  >
                    {slide.city}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
            <article className="overflow-hidden rounded-[1.9rem] border border-white/12 bg-white/8 backdrop-blur-xl">
              <div className="relative h-72">
                <Image src={activeSlide.image} alt={activeSlide.label} fill sizes="(max-width: 1280px) 100vw, 40vw" className="object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,20,11,0.08)_0%,rgba(5,20,11,0.78)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{activeSlide.meta}</p>
                  <h2 className="mt-2 text-3xl font-bold text-white">
                    {activeSlide.city}, {activeSlide.country}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">{activeSlide.description}</p>
                </div>
              </div>
            </article>

            <div className="rounded-[1.9rem] border border-white/12 bg-white/8 p-5 backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{text.quickChoices}</p>
              <h2 className="mt-3 text-2xl font-bold text-white">{activeSlide.label}</h2>
              <p className="mt-3 text-sm leading-7 text-white/76">{text.quickStartBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeSlide.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/84">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/10 p-4">
                <p className="text-sm font-semibold text-white">{destinationCount}+ {text.catalogCount}</p>
                <p className="mt-1 text-sm text-white/68">
                  {guideCount} {text.guideCount}. {text.freeUse}. {text.partnerBooking}.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-end xl:justify-end">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,250,246,0.95))] p-5 text-emerald-950 shadow-[0_28px_90px_rgba(4,26,14,0.24)] backdrop-blur-2xl sm:p-6">
            <div className="inline-flex w-full rounded-full border border-emerald-900/10 bg-emerald-50/90 p-1 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("standard");
                  sendClientEvent("planner_mode_selected", { source: "home_hero", mode: "standard" });
                }}
                className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === "standard" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-white"
                }`}
              >
                {text.standardMode}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("discovery");
                  sendClientEvent("planner_mode_selected", { source: "home_hero", mode: "discovery" });
                }}
                className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === "discovery" ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-white"
                }`}
              >
                {text.discoveryMode}
              </button>
            </div>

            {mode === "standard" ? (
              <div className="mt-5 space-y-4">
                <div className="relative">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700" htmlFor={destinationInputId}>
                    {text.destinationLabel}
                  </label>
                  <input
                    id={destinationInputId}
                    role="combobox"
                    aria-expanded={dropdownVisible && activeField === "destination"}
                    aria-controls={dropdownVisible && activeField === "destination" ? heroListboxId : undefined}
                    aria-autocomplete="list"
                    value={destinationQuery}
                    onChange={(event) => setDestinationQuery(event.target.value)}
                    onFocus={() => setActiveField("destination")}
                    onKeyDown={(event) => handleKnownKeyDown("destination", event)}
                    placeholder={text.searchDestinationPlaceholder}
                    autoComplete="off"
                    className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-5 py-4 text-base font-medium text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />

                  {dropdownVisible && activeField === "destination" ? (
                    <div
                      id={heroListboxId}
                      role="listbox"
                      aria-label={text.destinationLabel}
                      className="absolute inset-x-0 top-[calc(100%+0.75rem)] z-20 rounded-[1.5rem] border border-emerald-900/10 bg-white p-3 shadow-[0_28px_60px_rgba(12,58,34,0.12)]"
                    >
                      {isSearching ? (
                        <div className="px-4 py-3 text-sm font-medium text-emerald-900">{text.destinationSearching}</div>
                      ) : suggestions.length > 0 ? (
                        <div className="space-y-2">
                          {suggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.id}-${suggestion.label}-destination`}
                              type="button"
                              role="option"
                              aria-selected={highlightedIndex === index}
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
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="px-4 py-3 text-sm text-emerald-900/70">{text.noMatches}</p>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.originLabel}
                  <input
                    id={originInputId}
                    role="combobox"
                    aria-expanded={dropdownVisible && activeField === "origin"}
                    aria-controls={dropdownVisible && activeField === "origin" ? heroListboxId : undefined}
                    aria-autocomplete="list"
                    value={originQuery}
                    onChange={(event) => setOriginQuery(event.target.value)}
                    onFocus={() => setActiveField("origin")}
                    onKeyDown={(event) => handleKnownKeyDown("origin", event)}
                      placeholder={text.searchOriginPlaceholder}
                      autoComplete="off"
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.travelers}
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={travelers}
                      onChange={(event) => setTravelers(Number(event.target.value) || 1)}
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.startDate}
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.endDate}
                    <input
                      type="date"
                      value={normalizedEndDate}
                      min={startDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={submitStandardSearch}
                    className="inline-flex min-h-12 items-center rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(21,128,61,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-800"
                  >
                    {text.submitStandard}
                  </button>
                </div>
                <LocalizedLink
                  href="/kierunki"
                  locale={locale}
                  className="inline-flex text-sm font-semibold text-emerald-900 transition hover:text-emerald-700"
                >
                  {text.catalogLink}
                </LocalizedLink>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {text.discoveryLabel}
                  <textarea
                    value={discoveryQuery}
                    onChange={(event) => setDiscoveryQuery(event.target.value)}
                    className="mt-2 min-h-28 w-full rounded-[1.5rem] border border-emerald-900/12 bg-white px-4 py-4 text-sm leading-7 text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    placeholder={text.discoveryPlaceholder}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {localizedDiscoveryPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDiscoveryQuery(prompt)}
                      className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:border-emerald-500/40 hover:bg-emerald-100"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.originLabel}
                  <input
                    id={originInputId}
                    role="combobox"
                    aria-expanded={dropdownVisible && activeField === "origin"}
                    aria-controls={dropdownVisible && activeField === "origin" ? heroListboxId : undefined}
                    aria-autocomplete="list"
                    value={originQuery}
                    onChange={(event) => setOriginQuery(event.target.value)}
                    onFocus={() => setActiveField("origin")}
                    onKeyDown={(event) => handleKnownKeyDown("origin", event)}
                    className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                  />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.travelers}
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={travelers}
                      onChange={(event) => setTravelers(Number(event.target.value) || 1)}
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.startDate}
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.endDate}
                    <input
                      type="date"
                      value={normalizedEndDate}
                      min={startDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-[1.4rem] border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={submitDiscoverySearch}
                    className="inline-flex min-h-12 items-center rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(21,128,61,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-800"
                  >
                    {text.submitDiscovery}
                  </button>
                </div>
                <LocalizedLink
                  href="/planner?mode=discovery"
                  locale={locale}
                  className="inline-flex text-sm font-semibold text-emerald-900 transition hover:text-emerald-700"
                >
                  {text.openCatalog}
                </LocalizedLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}


