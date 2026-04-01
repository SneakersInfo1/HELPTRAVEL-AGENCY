"use client";

import Image from "next/image";
import Link from "next/link";
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
  articleCount: number;
}

const discoveryPrompts = [
  "Cieply kierunek na 5 dni, budzet do 2000 zl, plaza i zwiedzanie, wylot z Polski.",
  "Romantyczny wyjazd na 4 dni, dobre jedzenie, malo logistyki i ladne centrum.",
  "Krotki city break z dobrym klimatem, fajnymi widokami i sensownym budzetem.",
];

const servicePills = ["Loty", "Noclegi", "Atrakcje", "Auta", "eSIM i dodatki"];

function plannerHref(mode: "standard" | "discovery", query: string): string {
  return `/planner?mode=${mode}&q=${encodeURIComponent(query)}`;
}

export function PremiumHomeHero({ slides, destinationCount, articleCount }: PremiumHomeHeroProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [knownQuery, setKnownQuery] = useState("");
  const [knownFocused, setKnownFocused] = useState(false);
  const [discoveryQuery, setDiscoveryQuery] = useState(discoveryPrompts[0]);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const deferredKnownQuery = useDeferredValue(knownQuery.trim());
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
            description: "Slonce, plaza i bardzo prosty start do planowania wyjazdu.",
            image: "/branding/helptravel-logo.png",
            href: "/planner?mode=standard&q=Malaga",
            tags: ["plaza", "city break", "latwy start"],
            meta: "loty, noclegi i atrakcje",
          },
        ];

  const activeSlide = safeSlides[activeSlideIndex] ?? safeSlides[0];

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
    }, 3800);

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
      setKnownFocused(false);
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
    if (!knownFocused) {
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
          throw new Error("Nie udalo sie pobrac podpowiedzi.");
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
          setSearchError(error instanceof Error ? error.message : "Nie udalo sie pobrac podpowiedzi.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, deferredKnownQuery ? 160 : 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [deferredKnownQuery, knownFocused]);

  const submitKnownSearch = (suggestion?: DestinationSuggestion | null) => {
    const fallbackValue = knownQuery.trim();
    const nextValue = suggestion?.queryValue ?? fallbackValue;
    if (!nextValue) {
      return;
    }

    router.push(plannerHref("standard", nextValue));
  };

  const submitDiscoverySearch = () => {
    const nextValue = discoveryQuery.trim();
    if (!nextValue) {
      return;
    }

    router.push(plannerHref("discovery", nextValue));
  };

  const handleKnownKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
      setKnownFocused(false);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (knownFocused && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        submitKnownSearch(suggestions[highlightedIndex]);
        return;
      }

      submitKnownSearch();
    }
  };

  const quickDestinations = safeSlides.slice(0, 5);
  const dropdownVisible = knownFocused && (isSearching || searchError || suggestions.length > 0);

  return (
    <section
      ref={rootRef}
      className="relative isolate overflow-hidden rounded-[2.5rem] border border-emerald-900/10 bg-emerald-950 text-white shadow-[0_36px_120px_rgba(7,31,18,0.24)]"
    >
      <div className="absolute inset-0">
        {safeSlides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-[1400ms] ${index === activeSlideIndex ? "opacity-100" : "opacity-0"}`}
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
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(3,17,10,0.9)_0%,rgba(4,24,13,0.72)_44%,rgba(6,32,18,0.48)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.32),transparent_28%),radial-gradient(circle_at_top_right,rgba(190,242,100,0.16),transparent_20%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.2),transparent_28%)]" />
      </div>

      <div className="relative grid min-h-[46rem] gap-8 px-5 py-6 sm:px-6 sm:py-7 lg:min-h-[48rem] lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-10">
        <div className="flex flex-col justify-between gap-7">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-white/16 bg-white/8 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/92">
              Premium planner podrozy
            </span>
            <h1 className="mt-5 max-w-4xl text-balance font-display text-5xl leading-[0.92] sm:text-6xl lg:text-7xl">
              Wpisz kierunek i rusz dalej. Albo opisz wyjazd, ktorego szukasz.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-emerald-50/82 sm:text-lg">
              HelpTravel prowadzi od pierwszego wyboru do lotow, noclegow, atrakcji i wygodnych dodatkow. Strona glowna
              ma od razu uruchamiac planowanie, nie tylko wygladac dobrze.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {servicePills.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/92"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-[1.5rem] border border-white/12 bg-white/8 px-4 py-4 backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Kierunki</p>
              <p className="mt-2 text-3xl font-bold text-white">{destinationCount}+</p>
              <p className="mt-2 text-sm leading-6 text-white/72">stron i scenariuszy, od city breakow po cieple kierunki.</p>
            </article>
            <article className="rounded-[1.5rem] border border-white/12 bg-white/8 px-4 py-4 backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Przewodniki</p>
              <p className="mt-2 text-3xl font-bold text-white">{articleCount}+</p>
              <p className="mt-2 text-sm leading-6 text-white/72">tresci, ktore pomagaja wybrac miasto i szybciej kliknac dalej.</p>
            </article>
            <article className="rounded-[1.5rem] border border-white/12 bg-white/8 px-4 py-4 backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Funnel</p>
              <p className="mt-2 text-3xl font-bold text-white">1 start</p>
              <p className="mt-2 text-sm leading-6 text-white/72">jedna sciezka od wyboru kierunku do lotow, hoteli i uslug wyjazdowych.</p>
            </article>
          </div>

          <div className="rounded-[1.75rem] border border-white/12 bg-black/18 p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Aktualny klimat hero</p>
                <h2 className="mt-2 text-3xl font-bold text-white">
                  {activeSlide.title}, {activeSlide.country}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/78">{activeSlide.description}</p>
              </div>
              <Link
                href={activeSlide.href}
                className="rounded-full border border-white/14 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/16"
              >
                Otworz przewodnik
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeSlide.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/88">
                  {tag}
                </span>
              ))}
              <span className="rounded-full bg-emerald-400/16 px-3 py-1 text-xs font-semibold text-emerald-100">
                {activeSlide.meta}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {safeSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveSlideIndex(index)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    index === activeSlideIndex
                      ? "bg-white text-emerald-950"
                      : "border border-white/14 bg-white/8 text-white/88 hover:bg-white/12"
                  }`}
                >
                  {slide.city}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-start lg:justify-end">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/12 bg-white/10 p-4 shadow-[0_24px_80px_rgba(4,26,14,0.24)] backdrop-blur-2xl sm:p-5">
            <article className="rounded-[1.75rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(245,251,247,0.94))] p-5 text-emerald-950 shadow-[0_18px_50px_rgba(7,33,18,0.16)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Sciezka 1</p>
                  <h2 className="mt-2 text-3xl font-bold text-emerald-950">Mam kierunek</h2>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-emerald-900/74">
                    Wpisujesz miasto lub kraj, dostajesz eleganckie podpowiedzi i przechodzisz prosto do planowania wyjazdu.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900">
                  Dominujaca akcja
                </span>
              </div>

              <div className="relative mt-5">
                <label className="sr-only" htmlFor="hero-destination-search">
                  Wyszukaj kierunek
                </label>
                <input
                  id="hero-destination-search"
                  value={knownQuery}
                  onChange={(event) => setKnownQuery(event.target.value)}
                  onFocus={() => setKnownFocused(true)}
                  onKeyDown={handleKnownKeyDown}
                  placeholder="Dokad chcesz poleciec? Malaga, Rzym, Barcelona, Paryz, Bali..."
                  className="w-full rounded-[1.6rem] border border-emerald-900/12 bg-white px-5 py-4 text-base font-medium text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
                />

                {dropdownVisible ? (
                  <div className="absolute inset-x-0 top-[calc(100%+0.75rem)] z-20 rounded-[1.5rem] border border-emerald-900/10 bg-white p-3 shadow-[0_28px_60px_rgba(12,58,34,0.12)]">
                    {isSearching ? (
                      <div className="flex items-center gap-3 rounded-[1.2rem] bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-900">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />
                        Szukamy miast i kierunkow...
                      </div>
                    ) : null}

                    {!isSearching && suggestions.length > 0 ? (
                      <div className="space-y-2">
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={`${suggestion.id}-${suggestion.label}`}
                            type="button"
                            onMouseEnter={() => setHighlightedIndex(index)}
                            onClick={() => submitKnownSearch(suggestion)}
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
                                suggestion.destinationSlug
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {suggestion.destinationSlug ? "przewodnik + planner" : "miasto"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {!isSearching && searchError ? (
                      <p className="rounded-[1.2rem] bg-red-50 px-4 py-3 text-sm text-red-700">{searchError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {quickDestinations.map((slide) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => {
                      setKnownQuery(slide.label);
                      router.push(plannerHref("standard", slide.label));
                    }}
                    className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-100"
                  >
                    {slide.city}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => submitKnownSearch()}
                  className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_32px_rgba(21,128,61,0.22)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-800"
                >
                  Szukaj kierunku
                </button>
                <p className="text-sm text-emerald-900/66">
                  Po wyborze prowadzimy dalej do lotow, hoteli, atrakcji i wygodnych dodatkow.
                </p>
              </div>
            </article>

            <article className="mt-4 rounded-[1.75rem] border border-white/12 bg-white/8 p-5 text-white backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Sciezka 2</p>
                  <h3 className="mt-2 text-3xl font-bold">Nie wiem, dokad leciec</h3>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-white/76">
                    Opisz budzet, liczbe dni, klimat wyjazdu i to, czy chcesz bardziej plaze, zwiedzanie czy spokoj.
                  </p>
                </div>
                <span className="rounded-full border border-white/14 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/92">
                  discovery mode
                </span>
              </div>

              <textarea
                value={discoveryQuery}
                onChange={(event) => setDiscoveryQuery(event.target.value)}
                className="mt-5 min-h-32 w-full rounded-[1.6rem] border border-white/12 bg-white/10 px-4 py-4 text-sm leading-7 text-white outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-300/25"
                placeholder="Np. chce cieply wyjazd na 5 dni, do 2000 zl, plaza + zwiedzanie, wylot z Polski."
              />

              <div className="mt-4 flex flex-wrap gap-2">
                {discoveryPrompts.map((prompt) => (
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
                  Pokaz propozycje wyjazdu
                </button>
                <p className="text-sm text-white/68">Dobre dla osob, ktore chca, zeby platforma najpierw podpowiedziala kierunki.</p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
