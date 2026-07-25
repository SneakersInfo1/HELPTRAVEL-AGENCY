"use client";

// Dokowany dymek AI Concierge (Task 4.2) — montowany raz w layout.tsx, widoczny
// na KAŻDEJ stronie (homepage, /hotele/*, /loty/* włącznie — inaczej niż
// QuickSearchLauncher, który na tych trasach jest chowany). Mechanika portalu/
// Esc/focus-trap skopiowana z quick-search-launcher.tsx (te same sprawdzone
// wzorce), ale to NIE jest modal-overlay wyszukiwarki: to trwały widget czatu
// z trzema stanami: "bubble" (zwinięty) i "expanded" (panel/pełny ekran).
// "Zminimalizowany" to POWRÓT do stanu "bubble" — historia czatu nie ginie,
// bo żyje w sessionStorage wewnątrz ConciergeChat (patrz ten plik), więc
// odmontowanie ConciergeChat przy zwinięciu jest poprawne i najprostsze:
// przy ponownym otwarciu komponent po prostu odczyta tę samą sesję.
//
// Coexistence z QuickSearchLauncher: concierge jest widgetem GŁÓWNYM w rogu
// (ten sam slot bottom-4/right-4 co miał quick-search), więc to quick-search
// przesunięto WYŻEJ (patrz komentarz w quick-search-launcher.tsx) — jedyna
// zmiana w tamtym pliku to offset pozycji, nic więcej.
//
// Zero gate'owania zgodą (decyzja produktowa z zadania): ujawnienie
// dostawcy AI dzieje się W PANELU (stopka ConciergeChat), nie przez
// ConsentProvider — dlatego ten plik świadomie NIE importuje consent/context.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { ConciergeChat } from "./concierge-chat";
import { CONCIERGE_OPEN_EVENT } from "@/lib/concierge/open-event";
import { track } from "@/lib/analytics/track";

// Kill-switch (domyślnie WŁĄCZONE) — ta sama konwencja co
// NEXT_PUBLIC_SHOW_QUICK_SEARCH i /api/concierge/chat route.ts.
const ENABLED = process.env.NEXT_PUBLIC_SHOW_CONCIERGE?.trim().toLowerCase() !== "false";

const TEASER_DISMISSED_KEY = "helptravel-concierge-teaser-dismissed-v1";
const MOTION_MS = 200;

// Teaser jako mini-„external store" (localStorage) czytany przez
// useSyncExternalStore — jedyny wzorzec, który NARAZ: (a) nie daje
// hydration-mismatch (server snapshot = ukryty; React po hydracji sam
// przechodzi na snapshot klienta), (b) przechodzi lint React Compilera
// (zakaz setState w efekcie), (c) aktualizuje się po dismissie.
let teaserListeners: ReadonlyArray<() => void> = [];

function subscribeTeaser(listener: () => void): () => void {
  teaserListeners = [...teaserListeners, listener];
  return () => {
    teaserListeners = teaserListeners.filter((l) => l !== listener);
  };
}

function readTeaserDismissed(): boolean {
  try {
    return window.localStorage.getItem(TEASER_DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

function markTeaserDismissed(): void {
  try {
    window.localStorage.setItem(TEASER_DISMISSED_KEY, "1");
  } catch {
    // localStorage niedostępny — teaser po prostu wróci przy kolejnej wizycie.
  }
  for (const listener of teaserListeners) listener();
}

type PanelState = "bubble" | "expanded";

export function ConciergeLauncher() {
  const [panel, setPanel] = useState<PanelState>("bubble");
  const [entered, setEntered] = useState(false);
  // Na trasach wyników i lejków (/hotele/*, /loty/*) dymek zwija się do samej
  // ikony: pełna pigułka „Dobierz wyjazd" nachodziła na „Filtry i sortowanie"
  // (wyniki hoteli) i pasek ceny (karta hotelu) — zgłoszenie właściciela
  // 2026-07-11. Na homepage i stronach treści zostaje pełna pigułka. Teaser
  // też tylko poza wynikami — nad listą hoteli zasłaniał karty.
  const pathname = usePathname();
  const pathNoLocale = pathname?.replace(/^\/en(?=\/|$)/, "") ?? "";
  const compact = pathNoLocale.startsWith("/hotele") || pathNoLocale.startsWith("/loty");
  // Karta hotelu i kroki lejka mają WŁASNY sticky pasek przy dolnej krawędzi
  // (cena + „Wybierz pokój" / podsumowanie) — FAB w rogu zasłaniałby to CTA.
  // Na tych trasach dymek jedzie NAD pasek (~84px). Strony wyników zostają
  // przy dole: tam pasek filtrów jest wyśrodkowany i kolizji nie ma
  // (zweryfikowane 375px, 2026-07-11). Pasek znika na lg → wracamy do bottom-6.
  const isResultsRoute = pathNoLocale.startsWith("/hotele/szukaj") || pathNoLocale.startsWith("/loty/wyniki");
  const lifted = compact && !isResultsRoute;
  // Server snapshot = true (ukryty): SSR nigdy nie renderuje teasera, więc
  // hydracja jest spójna; klientowy snapshot wchodzi zaraz po niej.
  const teaserDismissed = useSyncExternalStore(subscribeTeaser, readTeaserDismissed, () => true);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const openPanel = useCallback(
    (source: "launcher" | "category_tile" | "proactive" = "launcher") => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      setPanel("expanded");
      track("concierge_open", { page_path: window.location.pathname, source });
    },
    [],
  );

  // Kontrakt dla wejść SPOZA tego drzewa (redesign 2026-07: czat ma trzy
  // wejścia, nie jeden dymek). Kafel „Powiedz budżet…" w sekcji kategorii
  // wysyła zdarzenie okna zamiast przeciągać stan przez pół aplikacji —
  // launcher jest montowany globalnie w layoucie, więc zawsze słucha.
  useEffect(() => {
    const onExternalOpen = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      openPanel(source === "category_tile" ? "category_tile" : "launcher");
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, onExternalOpen);
    return () => window.removeEventListener(CONCIERGE_OPEN_EVENT, onExternalOpen);
  }, [openPanel]);

  const closePanel = useCallback(() => {
    setEntered(false);
    const done = () => {
      setPanel("bubble");
      bubbleRef.current?.focus();
    };
    if (prefersReduced) done();
    else closeTimer.current = window.setTimeout(done, MOTION_MS);
  }, [prefersReduced]);

  const dismissTeaser = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    markTeaserDismissed();
  }, []);

  // Klik w link oferty (Zobacz hotel/lot) na MOBILE minimalizuje panel —
  // pełnoekranowy czat zasłaniałby stronę, na którą użytkownik właśnie
  // nawiguje (feedback właściciela z testu na telefonie). Na desktopie panel
  // jest dokowany i nie przeszkadza — zostaje otwarty. Ten sam breakpoint
  // (sm = 640px) co blokada scrolla tła niżej.
  const onOfferNavigate = useCallback(() => {
    if (window.matchMedia("(max-width: 639px)").matches) closePanel();
  }, [closePanel]);

  // Wejście: po zamontowaniu panelu włącz "entered" w kolejnej klatce, żeby
  // CSS-transition (opacity, nie transform w stanie spoczynku) ruszyła; fokus
  // na przycisk zamknięcia panelu.
  useEffect(() => {
    if (panel !== "expanded") return;
    const raf = requestAnimationFrame(() => setEntered(true));
    const focusRaf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-concierge-close]")?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(focusRaf);
    };
  }, [panel]);

  // Blokada scrolla tła TYLKO na mobile pełnoekranowym (desktop panel jest
  // dokowany, nie zasłania strony — scroll tła zostaje włączony).
  useEffect(() => {
    if (panel !== "expanded") return;
    const mql = window.matchMedia("(max-width: 639px)");
    if (!mql.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [panel]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!ENABLED) return null;

  return (
    <>
      {panel === "bubble" && (
        <div
          className={`fixed right-4 z-40 flex flex-col items-end gap-2 sm:right-6 ${
            lifted
              ? "bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+5.25rem))] lg:bottom-6"
              : "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6"
          }`}
        >
          {/* Teaser jednorazowy — dismiss trwały w localStorage, bez liczników/scarcity. */}
          {!teaserDismissed && !compact && (
            <div className="animate-fade-in-up relative max-w-[240px] rounded-2xl rounded-br-md border border-emerald-900/10 bg-white px-4 py-3 text-sm font-medium text-neutral-800 shadow-[0_12px_32px_rgba(16,84,48,0.16)]">
              <button
                type="button"
                onClick={dismissTeaser}
                aria-label="Zamknij podpowiedź"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-900/10 bg-white text-neutral-500 shadow-sm transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-3 w-3">
                  <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              Nie wiesz, dokąd polecieć? Podaj budżet — znajdę Ci konkretny lot i hotel.
            </div>
          )}

          <button
            ref={bubbleRef}
            type="button"
            onClick={() => openPanel("launcher")}
            aria-haspopup="dialog"
            // Statycznie false: ten przycisk istnieje TYLKO w stanie "bubble"
            // (odmontowany, gdy panel otwarty), więc dynamiczne wiązanie ze
            // stanem to zawsze-false, które TS słusznie flaguje (TS2367).
            aria-expanded={false}
            aria-label={compact ? "Dobierz wyjazd — asystent AI" : undefined}
            title={compact ? "Dobierz wyjazd" : undefined}
            className={`animate-bubble-pulse group inline-flex items-center rounded-full bg-emerald-600 text-sm font-bold text-white outline-none transition-colors hover:bg-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-300/60 motion-reduce:animate-none ${
              compact ? "h-13 w-13 justify-center p-3.5" : "gap-2 py-3.5 pl-4 pr-5"
            }`}
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0">
              <path
                d="M3 9.5C3 5.9 6.13 3 10 3s7 2.9 7 6.5S13.87 16 10 16c-.8 0-1.57-.12-2.28-.35L4 17l1.1-3.3A6.24 6.24 0 0 1 3 9.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {!compact && "Dobierz wyjazd"}
          </button>
        </div>
      )}

      {panel === "expanded" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="concierge-title"
            onKeyDown={onKeyDown}
            className="fixed inset-0 z-[60] flex sm:inset-auto sm:bottom-6 sm:right-6 sm:block"
          >
            {/* Panel — mobile: pełny ekran; desktop: karta dokowana w rogu. */}
            <div
              className={`flex h-full w-full min-h-0 flex-col overflow-hidden bg-white shadow-2xl transition-opacity duration-200 ease-out sm:h-[70vh] sm:max-h-[640px] sm:w-[400px] sm:rounded-2xl sm:border sm:border-emerald-900/10 motion-reduce:transition-none ${
                entered ? "opacity-100" : "opacity-0"
              }`}
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-900/10 bg-emerald-50/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
                <div className="min-w-0">
                  <h2 id="concierge-title" className="truncate text-sm font-bold text-neutral-900">
                    Asystent wyjazdowy
                  </h2>
                  <p className="truncate text-xs font-medium text-emerald-700">HelpTravel</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={closePanel}
                    aria-label="Zminimalizuj"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800/70 outline-none transition-colors hover:bg-emerald-900/10 hover:text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span aria-hidden className="text-base font-bold leading-none">
                      —
                    </span>
                  </button>
                  <button
                    type="button"
                    data-concierge-close
                    onClick={closePanel}
                    aria-label="Zamknij"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800/70 outline-none transition-colors hover:bg-emerald-900/10 hover:text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1">
                <ConciergeChat onOfferNavigate={onOfferNavigate} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
