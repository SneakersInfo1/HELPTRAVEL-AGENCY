"use client";

// Zakładki nad paskiem wyszukiwania: Hotele / Loty / Nie wiem dokąd.
//
// TRZECIA ZAKŁADKA pokazuje kafelkowy podgląd i otwiera JEDEN globalny dialog
// czatu. Na telefonie dialog zajmuje pełne 100dvh; na desktopie jest dokowany.
// Powód (redesign 2026-07): konsjerż jest unikalnym produktem, a jako dymek
// w rogu ekranu wpadał w banner blindness. Hero to miejsce o najwyższej
// uwadze na stronie, a użytkownik, który nie wie dokąd jechać, nie ma czego
// wpisać w pole „Dokąd" — więc dostaje ścieżkę, która nie wymaga decyzji.
//
// Aktywny stan to „pigułka" przesuwana transformem (czysty CSS, 200 ms).
// Stan trzymany w URL (?tab=loty / ?tab=asystent), żeby dało się podlinkować.
//
// Przełączenie Hotele↔Loty zmienia pola paska W MIEJSCU (jedna instancja
// MiniPlannerForm z mode=…) — formularz ma za sobą tygodnie tuningu i własne
// eventy GA4, więc nie jest tu przebudowywany ani remontowany.
//
// DOSTĘPNOŚĆ: poprzednia wersja miała role="tab" bez obsługi klawiatury —
// strzałki nic nie robiły, a każdy przycisk łapał Tab osobno. Teraz jest
// roving tabindex + Strzałki/Home/End, zgodnie z wzorcem WAI-ARIA Tabs.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Building2, Compass, Maximize2, Plane } from "lucide-react";

import { track } from "@/lib/analytics/track";
import {
  CONCIERGE_STATE_EVENT,
  requestConciergeOpen,
} from "@/lib/concierge/open-event";
import { cn } from "@/lib/ui/cn";
import { MiniPlannerForm } from "./mini-planner-form";

type Tab = "hotels" | "flights" | "assistant";

const TABS: ReadonlyArray<{
  key: Tab;
  label: string;
  shortLabel: string;
  icon: typeof Building2;
  /** Wartość w ?tab= — brak = zakładka domyślna (czysty URL). */
  param?: string;
}> = [
  { key: "hotels", label: "Hotele", shortLabel: "Hotele", icon: Building2 },
  { key: "flights", label: "Loty", shortLabel: "Loty", icon: Plane, param: "loty" },
  {
    key: "assistant",
    label: "Nie wiem dokąd",
    // Na 390px zakładka ma ~103 px, a „Nie wiem dokąd" z ikoną potrzebuje
    // ~145 px (zmierzone w przeglądarce). Samo „Nie wiem" nic nie znaczy,
    // więc skrót jest czasownikiem czynnym — mówi, co się stanie po kliknięciu.
    shortLabel: "Doradź",
    icon: Compass,
    param: "asystent",
  },
];

export function HomeSearchTabs() {
  // SSR i pierwszy render klienta = "hotels" (brak hydration mismatch).
  // ?tab= z URL doczytujemy po zamontowaniu.
  const [tab, setTab] = useState<Tab>("hotels");
  const tablistRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    const match = TABS.find((t) => t.param && t.param === param);
    if (!match) return;
    // Deferred (setTimeout 0) — uniknięcie kaskadowego renderu w efekcie
    // (react-hooks/set-state-in-effect), wzorzec użyty już w webview-hint.
    const id = window.setTimeout(() => setTab(match.key), 0);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * @param otworzCzat Czy wybór zakładki „Doradź" ma OD RAZU otworzyć rozmowę.
   *
   * Zgłoszenie właściciela: „po kliknięciu Doradź chatbot ma od razu otwierać
   * się na pełnym ekranie, bez dodatkowego przycisku Opisz swój wyjazd".
   * Kliknięcie zakładki jest jednoznaczną deklaracją zamiaru, więc otwiera.
   *
   * `false` przy nawigacji strzałkami: zakładki działają we wzorcu „automatic
   * activation", więc przejechanie strzałką przez trzecią zakładkę otwierałoby
   * modal osobie, która chciała tylko dojść do następnej pozycji — a z modala
   * musiałaby się potem wydostać. Klawiatura aktywuje czat Enterem/spacją,
   * czyli przez zdarzenie kliknięcia.
   */
  const selectTab = useCallback((next: Tab, otworzCzat = false) => {
    setTab(next);

    const url = new URL(window.location.href);
    const param = TABS.find((t) => t.key === next)?.param;
    if (param) url.searchParams.set("tab", param);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());

    track("hero_tab_changed", { to: next });

    if (next === "assistant" && otworzCzat) requestConciergeOpen("hero");
  }, []);

  // Strzałki przesuwają fokus i aktywują zakładkę (wzorzec „automatic
  // activation" — przy 3 zakładkach bez kosztownego ładowania jest szybszy).
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = TABS.findIndex((t) => t.key === tab);
      let nextIndex: number | null = null;

      if (event.key === "ArrowRight") nextIndex = (current + 1) % TABS.length;
      else if (event.key === "ArrowLeft") nextIndex = (current - 1 + TABS.length) % TABS.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = TABS.length - 1;
      if (nextIndex === null) return;

      event.preventDefault();
      selectTab(TABS[nextIndex].key);
      tablistRef.current
        ?.querySelectorAll<HTMLButtonElement>("[role='tab']")
        [nextIndex]?.focus();
    },
    [tab, selectTab],
  );

  const activeIndex = TABS.findIndex((t) => t.key === tab);

  return (
    <div>
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Jak chcesz szukać wyjazdu"
        onKeyDown={onKeyDown}
        className="relative mx-auto mb-3 flex w-full max-w-[420px] rounded-full border border-white/25 bg-white/15 p-1 text-sm backdrop-blur-md"
      >
        {/* Pigułka tła — przesuwa się transformem między trzema pozycjami. */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(33.333%-0.25rem)] rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {TABS.map(({ key, label, shortLabel, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${key}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${key}`}
              // Roving tabindex: tylko aktywna zakładka jest w kolejności Tab.
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(key, true)}
              className={cn(
                // h-11 = 44 px. Zmierzone w przeglądarce przy 375 px: `h-9`
                // dawało 36 px, czyli poniżej progu dotykowego — a to jest
                // GŁÓWNY przełącznik całej strony na telefonie (90% ruchu).
                "relative z-10 flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold transition-[color,transform] duration-200 ease-out active:scale-[0.98] sm:px-4 motion-reduce:transform-none motion-reduce:transition-none",
                active ? "text-brand-strong" : "text-white/90 hover:text-white",
              )}
            >
              <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Panele. Hotele i Loty dzielą JEDNĄ instancję formularza (pola zmieniają
          się w miejscu), więc renderujemy go raz dla obu zakładek. */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab === "assistant" ? "assistant" : tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === "assistant" ? (
          <AssistantPanel />
        ) : (
          <MiniPlannerForm compact mode={tab} />
        )}
      </div>
    </div>
  );
}

/**
 * Kafelkowy podgląd zamiast drugiej instancji rozmowy. Wybraliśmy jawne wejście
 * w pełny ekran (zamiast otwarcia natychmiast po zmianie zakładki), bo samo
 * przełączanie zakładek nie powinno kraść fokusu ani przykrywać treści. Kliknięcie
 * pola otwiera jedyny ConciergeChat w globalnym portalu launchera, więc historia,
 * trwający request i szkic wiadomości nie rozjeżdżają się między dwoma drzewami.
 */
function AssistantPanel() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<{ expanded?: boolean }>).detail;
      setExpanded(detail?.expanded === true);
    };
    window.addEventListener(CONCIERGE_STATE_EVENT, onState);
    return () => window.removeEventListener(CONCIERGE_STATE_EVENT, onState);
  }, []);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface-raised text-left shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface-sunken px-4 py-3">
        <Compass aria-hidden className="h-5 w-5 text-brand" strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Asystent wyjazdowy</p>
          <p className="text-xs text-ink-muted">Kierunek, lot i hotel w jednej rozmowie</p>
        </div>
      </div>
      {/* To NIE jest ekran pośredni: kliknięcie zakładki „Doradź" otwiera
          rozmowę od razu (patrz `selectTab`). Panel zostaje jako powrót do
          rozmowy dla kogoś, kto ją zamknął, a nadal stoi na tej zakładce —
          bez niego zakładka byłaby wtedy pusta i wyglądała na zepsutą. */}
      <div className="space-y-3 p-4">
        <p className="text-sm leading-6 text-ink-muted">
          Podaj budżet, termin i liczbę osób. Asystent sprawdzi dostępne oferty i pokaże
          konkretne ceny z wyszukiwarki HelpTravel.
        </p>
        <button
          type="button"
          onClick={() => requestConciergeOpen("hero")}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          className="group flex min-h-14 w-full items-center gap-3 rounded-md border border-line bg-surface px-3 text-left shadow-[var(--shadow-sm)] transition-[background-color,border-color,transform] duration-200 ease-out hover:border-brand/40 hover:bg-brand-soft active:scale-[0.99] active:bg-brand-soft motion-reduce:transform-none motion-reduce:transition-none"
        >
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-white [--focus-ring:#fff]"
          >
            <Compass className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Wróć do rozmowy</span>
            <span className="block text-xs text-ink-muted">Asystent pamięta, co już ustaliliście</span>
          </span>
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center text-brand transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <Maximize2 className="h-5 w-5" strokeWidth={2} />
          </span>
        </button>
      </div>
    </div>
  );
}
