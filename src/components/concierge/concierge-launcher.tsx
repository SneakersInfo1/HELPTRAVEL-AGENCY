"use client";

// Dokowany dymek AI Concierge (Task 4.2) — montowany raz w layout.tsx, widoczny
// na KAŻDEJ stronie (homepage, /hotele/*, /loty/* włącznie — inaczej niż
// QuickSearchLauncher, który na tych trasach jest chowany). Mechanika portalu/
// Esc/focus-trap skopiowana z quick-search-launcher.tsx (te same sprawdzone
// wzorce). Na desktopie pozostaje dokowanym widgetem; poniżej `sm` stan
// "expanded" jest pełnoekranowym dialogiem. Stany są dwa: "bubble" i "expanded".
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
// FUNKCJA czatu nadal NIE jest gate'owana zgodą (decyzja produktowa z zadania):
// ujawnienie dostawcy AI dzieje się W PANELU (stopka ConciergeChat), nie przez
// ConsentProvider. `useConsent` służy tu do czegoś innego — do POZYCJI, nie do
// uprawnień; patrz niżej.
//
// KOLIZJA Z BANEREM COOKIES (zmierzona w przeglądarce 375×812, 2026-07-25):
// baner zgód to `fixed inset-x-2 bottom-2 z-40`, a ten launcher `fixed right-4
// bottom-4 z-40`. Ten sam z-index → wygrywa późniejszy w DOM, czyli launcher.
// Prostokąty realnie nachodziły: dymek zasłaniał WSZYSTKIE TRZY przyciski zgody
// („Akceptuję wszystkie", „Tylko niezbędne", „Ustawienia"), a sam FAB — przycisk
// „Ustawienia". Skutki były dwa i oba poważne: (1) użytkownik nie mógł swobodnie
// podjąć decyzji o cookies, (2) bez zgody nie ładuje się gtag, więc te sesje nie
// istniały w GA4. Dlatego dopóki decyzja wisi (albo otwarte są ustawienia),
// launcher się NIE renderuje. Statyczna analiza tego nie widzi — baner renderuje
// się warunkowo (`needsDecision`), więc defekt wychodzi dopiero z pomiaru.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Compass, X } from "lucide-react";

import {
  announceConciergeState,
  CONCIERGE_OPEN_EVENT,
  type ConciergeOpenSource,
} from "@/lib/concierge/open-event";
import { track } from "@/lib/analytics/track";
import { useConsent } from "@/lib/consent/context";

// CZAT ŁADOWANY DOPIERO PO OTWARCIU PANELU.
//
// Zmierzone na buildzie produkcyjnym przed tą zmianą: chunk zawierający
// `concierge-chat` i `trip-offer-card` (85 kB na dysku) był pobierany przy
// KAŻDYM wejściu na stronę główną, mimo że panel powstaje dopiero po
// kliknięciu. Płacił za to każdy odwiedzający, także ten, który nigdy nie
// otworzy rozmowy — a przy 90% ruchu mobilnego to realny koszt.
//
// `ssr: false`, bo czat i tak jest wyłącznie klientowy: trzyma historię
// w `sessionStorage` i nie ma czego renderować na serwerze.
//
// Historia rozmowy NIE ginie: mieszka w `sessionStorage` wewnątrz
// `ConciergeChat`, a nie w tym module. Dynamiczny import zmienia tylko MOMENT
// pobrania kodu, nie miejsce przechowywania stanu. Podwójne montowanie też nie
// grozi — `next/dynamic` zapamiętuje raz pobrany moduł, więc kolejne otwarcia
// panelu nie wywołują następnego żądania sieciowego.
const ConciergeChat = dynamic(
  () => import("./concierge-chat").then((m) => m.ConciergeChat),
  {
    ssr: false,
    // Stan ładowania musi pojawić się NATYCHMIAST i mieć tę samą geometrię co
    // czat, inaczej panel „podskakuje" po dociągnięciu modułu.
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-brand/25 border-t-brand motion-reduce:animate-none"
        />
        <span className="text-sm text-ink-muted">Otwieram rozmowę…</span>
      </div>
    ),
  },
);

// Kill-switch (domyślnie WŁĄCZONE) — ta sama konwencja co
// NEXT_PUBLIC_SHOW_QUICK_SEARCH i /api/concierge/chat route.ts.
const ENABLED = process.env.NEXT_PUBLIC_SHOW_CONCIERGE?.trim().toLowerCase() !== "false";

const TEASER_DISMISSED_KEY = "helptravel-concierge-teaser-dismissed-v1";
/** Raz na sesję — inaczej dymek wracałby przy każdej nawigacji po serwisie. */
const TEASER_SHOWN_SESSION_KEY = "helptravel-concierge-teaser-shown-session";
/** Bezczynność, po której teaser ma sens (ms). */
const TEASER_IDLE_MS = 30_000;
const MOTION_MS = 200;
const HISTORY_MARKER = "__helptravelConcierge";

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

function hasConciergeHistoryMarker(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[HISTORY_MARKER] === true
  );
}

export function ConciergeLauncher() {
  const [panel, setPanel] = useState<PanelState>("bubble");
  const [entered, setEntered] = useState(false);
  const router = useRouter();
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

  // ── LEJEK LOTÓW: dymka NIE MA (Flights V2, 2026-08-29) ────────────────────
  //
  // Zmierzone na 390 px, `/loty/dodatki`: dymek (fixed, 52×52 w prawym dolnym
  // rogu, z-40) siedział dokładnie na dopłacie „+862,00 zł" przy taryfie Smart.
  // To nie jest przypadek tej jednej trasy — w lejku lotów PRAWY DOLNY RÓG jest
  // zajęty przez ceny i akcje na każdym kroku: kolumna cen taryf, przycisk
  // „Wybierz" na karcie oferty, sticky pasek „kwota + Dalej". Element pływający
  // w tym rogu MUSI coś z tego zasłonić.
  //
  // Podnoszenie go wyżej tylko przesuwa problem na inny wiersz listy, więc
  // rozstrzygamy to na poziomie produktu, a nie pikseli: konsjerż jest
  // narzędziem DOBORU wyjazdu, a lejek lotów jest ścieżką ZAKUPU. Kto tu jest,
  // już wybrał trasę i termin. Dokładnie z tego powodu `QuickSearchLauncher`
  // jest wyłączony na `/loty/*` od początku — to jest ta sama decyzja,
  // domknięta dla drugiego pływającego elementu.
  //
  // Poza lotami NIC się nie zmienia: homepage, hotele i strony treści mają
  // dymek jak dotąd.
  const isFlightFunnel = pathNoLocale === "/loty" || pathNoLocale.startsWith("/loty/");
  // Server snapshot = true (ukryty): SSR nigdy nie renderuje teasera, więc
  // hydracja jest spójna; klientowy snapshot wchodzi zaraz po niej.
  const teaserDismissed = useSyncExternalStore(subscribeTeaser, readTeaserDismissed, () => true);

  // Patrz nagłówek pliku: to jest o POZYCJI (nie zasłaniać przycisków zgody),
  // nie o uprawnieniach. `isSettingsOpen` dochodzi, bo modal ustawień cookies
  // wraca do tego samego dolnego rogu.
  const { needsDecision, isSettingsOpen } = useConsent();
  const consentBlocking = needsDecision || isSettingsOpen;

  // Teaser dopiero po realnym sygnale: 30 s BEZ interakcji. Każdy scroll,
  // klik i klawisz przesuwa termin — użytkownik, który czyta i klika, nie
  // dostaje zaczepki. Raz na sesję: `sessionStorage` pilnuje, żeby po powrocie
  // na stronę dymek nie wyskakiwał od nowa przy każdej nawigacji.
  const [teaserReady, setTeaserReady] = useState(false);
  useEffect(() => {
    // `consentBlocking` w warunku, nie tylko w renderze: inaczej 30 s odliczałoby
    // się PODCZAS czytania banera cookies i dymek wyskakiwałby w tej samej chwili,
    // w której użytkownik klika „Akceptuję". Licznik bezczynności ma mierzyć czas
    // na STRONIE, a nie czas spędzony w oknie zgód.
    if (teaserDismissed || consentBlocking) return;
    try {
      if (window.sessionStorage.getItem(TEASER_SHOWN_SESSION_KEY) === "1") return;
    } catch {
      // sessionStorage niedostępny (tryb prywatny) — trudno, licznik po prostu
      // wystartuje ponownie. Nic się nie psuje.
    }

    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setTeaserReady(true);
        try {
          window.sessionStorage.setItem(TEASER_SHOWN_SESSION_KEY, "1");
        } catch {}
      }, TEASER_IDLE_MS);
    };

    const events = ["scroll", "pointerdown", "keydown"] as const;
    for (const event of events) window.addEventListener(event, arm, { passive: true });
    arm();

    return () => {
      window.clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, arm);
    };
  }, [teaserDismissed, consentBlocking]);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const historyPushedRef = useRef(false);
  const historyClosingRef = useRef(false);
  const pendingNavigationRef = useRef<string | null>(null);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const finishClose = useCallback(
    (immediate = false) => {
      setEntered(false);
      const done = () => {
        closeTimer.current = null;
        setPanel("bubble");
        const destination = pendingNavigationRef.current;
        pendingNavigationRef.current = null;
        if (destination) {
          router.push(destination);
          return;
        }
        const returnTarget = returnFocusRef.current;
        requestAnimationFrame(() => {
          if (returnTarget?.isConnected) returnTarget.focus();
          else bubbleRef.current?.focus();
        });
      };
      if (immediate || prefersReduced) done();
      else closeTimer.current = window.setTimeout(done, MOTION_MS);
    },
    [prefersReduced, router],
  );

  const requestClose = useCallback(() => {
    if (
      historyPushedRef.current &&
      hasConciergeHistoryMarker(window.history.state) &&
      !historyClosingRef.current
    ) {
      historyClosingRef.current = true;
      window.history.back();
      return;
    }
    historyPushedRef.current = false;
    historyClosingRef.current = false;
    finishClose();
  }, [finishClose]);

  const openPanel = useCallback(
    (source: ConciergeOpenSource = "launcher") => {
      if (consentBlocking || panel === "expanded") return;
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      returnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : bubbleRef.current;
      if (window.matchMedia("(max-width: 639px)").matches) {
        if (!hasConciergeHistoryMarker(window.history.state)) {
          const currentState =
            typeof window.history.state === "object" && window.history.state !== null
              ? (window.history.state as Record<string, unknown>)
              : {};
          window.history.pushState(
            { ...currentState, [HISTORY_MARKER]: true },
            "",
            window.location.href,
          );
        }
        historyPushedRef.current = true;
      }
      setPanel("expanded");
      track("concierge_open", {
        page_path: window.location.pathname,
        source: source === "hero" ? "hero_tab" : source,
      });
    },
    [consentBlocking, panel],
  );

  // Kontrakt dla wejść SPOZA tego drzewa (redesign 2026-07: czat ma trzy
  // wejścia, nie jeden dymek). Kafel „Powiedz budżet…" w sekcji kategorii
  // wysyła zdarzenie okna zamiast przeciągać stan przez pół aplikacji —
  // launcher jest montowany globalnie w layoucie, więc zawsze słucha.
  useEffect(() => {
    const onExternalOpen = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      openPanel(source === "category_tile" || source === "hero" ? source : "launcher");
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, onExternalOpen);
    return () => window.removeEventListener(CONCIERGE_OPEN_EVENT, onExternalOpen);
  }, [openPanel]);

  useEffect(() => {
    announceConciergeState(panel === "expanded" && !consentBlocking);
  }, [panel, consentBlocking]);

  // Mobilny wpis historii sprawia, że systemowy gest/przycisk Wstecz najpierw
  // zamyka dialog, zamiast od razu opuszczać stronę.
  useEffect(() => {
    if (panel !== "expanded" || !historyPushedRef.current) return;
    const onPopState = () => {
      if (!historyPushedRef.current) return;
      historyPushedRef.current = false;
      historyClosingRef.current = false;
      finishClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [panel, finishClose]);

  // Portal nie może przykryć banera ani modalu zgód. Samo `z-[70]` jest celowe
  // po podjęciu decyzji, ale przy ponownym otwarciu ustawień dialog znika od razu.
  useEffect(() => {
    if (!consentBlocking || panel !== "expanded") return;
    if (historyPushedRef.current && hasConciergeHistoryMarker(window.history.state)) {
      window.history.back();
    }
    historyPushedRef.current = false;
    historyClosingRef.current = false;
    pendingNavigationRef.current = null;
    const id = window.setTimeout(() => finishClose(true), 0);
    return () => window.clearTimeout(id);
  }, [consentBlocking, panel, finishClose]);

  const dismissTeaser = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    markTeaserDismissed();
  }, []);

  // Klik w link oferty (Zobacz hotel/lot) na MOBILE minimalizuje panel —
  // pełnoekranowy czat zasłaniałby stronę, na którą użytkownik właśnie
  // nawiguje (feedback właściciela z testu na telefonie). Na desktopie panel
  // jest dokowany i nie przeszkadza — zostaje otwarty. Ten sam breakpoint
  // (sm = 640px) co blokada scrolla tła niżej.
  const onOfferNavigate = useCallback(
    (href: string): boolean => {
      if (!window.matchMedia("(max-width: 639px)").matches) return false;
      pendingNavigationRef.current = href;
      requestClose();
      return true;
    },
    [requestClose],
  );

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
      requestClose();
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

  if (!ENABLED || isFlightFunnel) return null;

  return (
    <>
      {panel === "bubble" && !consentBlocking && (
        <div
          className={`fixed right-4 z-40 flex flex-col items-end gap-2 sm:right-6 ${
            lifted
              ? "bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+5.25rem))] lg:bottom-6"
              : "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6"
          }`}
        >
          {/* Teaser: jednorazowy, dismiss trwały w localStorage, bez liczników
              i scarcity. Pokazywany DOPIERO po realnym sygnale (30 s bez
              interakcji) — wcześniej wyskakiwał natychmiast po wejściu,
              zasłaniał treść i był odruchowo zamykany, zanim ktokolwiek go
              przeczytał. Każda interakcja (scroll, klik, klawisz) resetuje
              odliczanie: kto korzysta ze strony, nie jest zaczepiany. */}
          {!teaserDismissed && teaserReady && !compact && (
            <div className="relative max-w-[240px] rounded-2xl rounded-br-md border border-line bg-surface-raised px-4 py-3 text-sm font-medium text-ink shadow-[var(--shadow-md)]">
              <button
                type="button"
                onClick={dismissTeaser}
                aria-label="Zamknij podpowiedź"
                // Kółko zostaje wizualnie 24 px (większe wyglądałoby jak drugi
                // przycisk obok dymka), ale `before:-inset-[10px]` rozszerza
                // OBSZAR KLIKU do 44×44 — próg dotykowy bez zmiany wyglądu.
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-raised text-ink-muted shadow-[var(--shadow-sm)] transition-colors duration-200 ease-out before:absolute before:-inset-[10px] before:content-[''] hover:text-ink active:bg-surface-sunken motion-reduce:transition-none"
              >
                <X aria-hidden className="h-3 w-3" strokeWidth={2} />
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
            // Bez `animate-bubble-pulse`: stała pulsacja niczego nie
            // komunikowała (dekoracyjny ruch jest zakazany w registerze
            // `product`) i upodabniała launcher do widgetu supportu.
            className={`group inline-flex items-center rounded-full bg-brand text-sm font-bold text-white shadow-[var(--shadow-lg)] [--focus-ring:#fff] transition-[filter,transform] duration-200 ease-out hover:brightness-95 active:scale-[0.98] active:brightness-90 motion-reduce:transform-none motion-reduce:transition-none ${
              compact ? "h-13 w-13 justify-center p-3.5" : "gap-2 py-3.5 pl-4 pr-5"
            }`}
          >
            {/* Ta sama ikona co zakładka „Nie wiem dokąd" w hero i kafel
                w kategoriach — trzy wejścia do JEDNEGO produktu mają wyglądać
                jak jeden produkt, a nie jak generyczny czat supportu. */}
            <Compass aria-hidden strokeWidth={2} className="h-5 w-5 shrink-0" />
            {!compact ? <span className="text-sm">Dobierz wyjazd</span> : null}
          </button>
        </div>
      )}

      {panel === "expanded" &&
        !consentBlocking &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Asystent wyjazdowy HelpTravel"
            aria-labelledby="concierge-title"
            onKeyDown={onKeyDown}
            className="fixed inset-0 z-[70] flex h-[100dvh] w-screen sm:inset-auto sm:bottom-6 sm:right-6 sm:block sm:h-auto sm:w-auto"
          >
            {/* Panel — mobile: pełny ekran; desktop: karta dokowana w rogu. */}
            <div
              className={`flex h-[100dvh] w-full min-h-0 flex-col overflow-hidden bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-lg)] transition-opacity duration-200 ease-out sm:h-[70dvh] sm:max-h-[640px] sm:w-[400px] sm:rounded-lg sm:border sm:border-line sm:pb-0 motion-reduce:transition-none ${
                entered ? "opacity-100" : "opacity-0"
              }`}
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-sunken px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
                <div className="min-w-0">
                  <h2 id="concierge-title" className="truncate text-sm font-bold text-ink">
                    Asystent wyjazdowy
                  </h2>
                  <p className="truncate text-xs font-medium text-brand">HelpTravel</p>
                </div>
                <button
                  type="button"
                  data-concierge-close
                  onClick={requestClose}
                  aria-label="Zamknij asystenta"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand-strong transition-colors duration-200 ease-out hover:bg-brand-soft active:bg-line motion-reduce:transition-none"
                >
                  <X aria-hidden className="h-5 w-5" strokeWidth={2} />
                </button>
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
