"use client";

// Pływająca szybka wyszukiwarka — „always-on" punkt wejścia do wyszukiwarki na
// stronach treści/SEO, które nie mają własnego formularza (/kierunki, /wyjazdy,
// /przewodniki, /raporty…). FAB w rogu → overlay z NASZĄ wyszukiwarką
// (HomeSearchTabs = toggle Hotele/Loty + MiniPlannerForm), która natywnie
// nawiguje do /hotele/szukaj albo /loty/wyniki (PL, PLN, nasz markup, eventy
// GA4 — wszystko już podłączone). Zero zależności od stron trzecich, zero
// cookies → to funkcja serwisu, nie tracker, więc BEZ consent-gate.
//
// Zasada #5 z PRODUCT.md: nie ruszamy dopracowanego formularza — budujemy tylko
// OTOCZKĘ. HomeSearchTabs/MiniPlannerForm renderują się 1:1 jak na homepage.
//
// UKŁAD (istotne dla popoverów formularza): autocomplete kierunku i popover
// gości otwierają się W DÓŁ (absolute z-50), więc formularz siedzi U GÓRY
// overlayu (mobile: pełny ekran; desktop: panel w górnej części), a overlay nie
// ma overflow:hidden — nic się nie przycina. Kalendarz na mobile ma własny
// pełnoekranowy sheet (z-[70]) i renderuje się nad formularzem.
//
// Widoczność: pokazujemy na stronach treści; chowamy na `/` (ma hero-search),
// całym `/hotele/*` (jest pasek albo booking + sticky bar) i lejku lotów.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { HomeSearchTabs } from "@/components/home/home-search-tabs";

// Kill-switch (domyślnie WŁĄCZONE — ustaw NEXT_PUBLIC_SHOW_QUICK_SEARCH=false, by wyłączyć).
const ENABLED = process.env.NEXT_PUBLIC_SHOW_QUICK_SEARCH?.trim().toLowerCase() !== "false";

// Trasy bez launchera: homepage (własny hero-search), cały lejek hoteli
// (wyszukiwarka/detal/rezerwacja mają swoje UI + sticky bar) i lejek lotów.
const HIDE_EXACT = new Set(["/", "/en"]);
const HIDE_PREFIXES = ["/hotele", "/loty", "/trips"];

function shouldShow(pathname: string | null): boolean {
  if (!ENABLED || !pathname) return false;
  if (HIDE_EXACT.has(pathname)) return false;
  return !HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const MOTION_MS = 220;

export function QuickSearchLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false); // stan wizualny (animacja wejścia)
  const fabRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  // Zamknij przy zmianie trasy (np. po submicie wyszukiwarki → nawigacja).
  // Wzorzec React „adjust state on prop change" na STANIE (nie ref) — dozwolony
  // w renderze, bez useEffect (brak kaskad) i bez dotykania refów w renderze.
  // Przy okazji zwalnia blokadę scrolla, gdy trafimy na trasę chowającą launcher.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
    if (entered) setEntered(false);
  }

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const openPanel = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setEntered(false);
    const done = () => {
      setOpen(false);
      fabRef.current?.focus(); // przywróć fokus na FAB (a11y)
    };
    if (prefersReduced) done();
    else closeTimer.current = window.setTimeout(done, MOTION_MS);
  }, [prefersReduced]);

  // Wejście: po zamontowaniu overlayu włącz stan „entered" w następnej klatce,
  // żeby CSS-transition ruszył. Fokus na pole „Dokąd".
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    const focusRaf = requestAnimationFrame(() => {
      const dest = overlayRef.current?.querySelector<HTMLElement>("[data-mini-planner-destination]");
      (dest ?? overlayRef.current?.querySelector<HTMLElement>("[data-qs-close]"))?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(focusRaf);
    };
  }, [open]);

  // Blokada scrolla tła gdy otwarte.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  // Esc + pułapka Tab (fokus zostaje w panelu).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== "Tab" || !overlayRef.current) return;
    const focusables = overlayRef.current.querySelectorAll<HTMLElement>(
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

  if (!shouldShow(pathname)) return null;

  return (
    <>
      {/* FAB — chowamy gdy panel otwarty (redundantny + fokus jest w panelu). */}
      {!open && (
        <button
          ref={fabRef}
          type="button"
          onClick={openPanel}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-600 py-3 pl-4 pr-5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(16,84,48,0.35)] outline-none transition hover:bg-emerald-700 hover:shadow-[0_14px_38px_rgba(16,84,48,0.45)] focus-visible:ring-4 focus-visible:ring-emerald-300/60 motion-safe:hover:-translate-y-0.5 sm:bottom-6 sm:right-6"
        >
          <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-5 w-5">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
            <path d="m14 14 3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Zaplanuj wyjazd
        </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qs-title"
            onKeyDown={onKeyDown}
            className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-start sm:py-[8vh]"
          >
            {/* Backdrop */}
            <button
              type="button"
              aria-label="Zamknij wyszukiwarkę"
              tabIndex={-1}
              onClick={closePanel}
              className={`absolute inset-0 -z-10 cursor-default bg-emerald-950/60 backdrop-blur-sm transition-opacity duration-200 ${
                entered ? "opacity-100" : "opacity-0"
              } motion-reduce:transition-none`}
            />

            {/* Panel — mobile: pełny ekran; desktop: karta w górnej części. */}
            <div
              className={`relative flex min-h-full w-full flex-col bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl transition duration-200 ease-out sm:min-h-0 sm:max-w-[760px] sm:rounded-3xl sm:px-6 sm:pb-7 sm:pt-6 motion-reduce:transition-none ${
                entered ? "opacity-100" : "opacity-0 translate-y-4"
              }`}
            >
              <header className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 id="qs-title" className="text-xl font-bold text-white sm:text-2xl">
                    Zaplanuj wyjazd
                  </h2>
                  <p className="mt-0.5 text-sm text-emerald-100/80">
                    Lot i hotel w PLN — bez rejestracji.
                  </p>
                </div>
                <button
                  type="button"
                  data-qs-close
                  onClick={closePanel}
                  aria-label="Zamknij"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                    <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </header>

              {/* Dopracowana wyszukiwarka 1:1 (toggle Hotele/Loty + MiniPlannerForm). */}
              <HomeSearchTabs />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
