"use client";

// Zakładki nad paskiem wyszukiwania: Hotele / Loty / Nie wiem dokąd.
//
// TRZECIA ZAKŁADKA to nie link do czatu — to CZAT osadzony w tej samej ramce.
// Powód (redesign 2026-07): konsjerż jest unikalnym produktem, a jako dymek
// w rogu ekranu wpadał w banner blindness. Hero to miejsce o najwyższej
// uwadze na stronie, a użytkownik, który nie wie dokąd jechać, nie ma czego
// wpisać w pole „Dokąd" — więc dostaje ścieżkę, która nie wymaga decyzji.
//
// Aktywny stan to „pigułka" przesuwana transformem (czysty CSS, ~220 ms).
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
import { Building2, Plane, Compass } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/ui/cn";
import { ConciergeChat } from "@/components/concierge/concierge-chat";
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

  const selectTab = useCallback((next: Tab) => {
    setTab(next);

    const url = new URL(window.location.href);
    const param = TABS.find((t) => t.key === next)?.param;
    if (param) url.searchParams.set("tab", param);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());

    track("hero_tab_changed", { to: next });
    // Otwarcie czatu z hero liczymy tym samym eventem co launcher, tylko z
    // innym `source` — inaczej mielibyśmy dwa równoległe pomiary tego samego.
    if (next === "assistant") {
      track("concierge_open", { page_path: window.location.pathname, source: "hero_tab" });
    }
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
        className="relative mx-auto mb-3 flex w-full max-w-[420px] rounded-full border border-white/25 bg-white/15 p-1 backdrop-blur-md"
      >
        {/* Pigułka tła — przesuwa się transformem między trzema pozycjami. */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(33.333%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-[220ms] ease-out"
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
              onClick={() => selectTab(key)}
              className={cn(
                "relative z-10 flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold transition-colors sm:px-4",
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

/** Czat osadzony w ramce hero — ta sama rozmowa co w launcherze (historia
 *  żyje w sessionStorage wewnątrz ConciergeChat), więc użytkownik może zacząć
 *  tutaj i kontynuować w rogu ekranu po przejściu na inną stronę. */
function AssistantPanel() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised text-left shadow-lg">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Compass aria-hidden className="h-4 w-4 text-brand" strokeWidth={2} />
        <p className="text-sm font-semibold text-ink">
          Opisz wyjazd — dobiorę kierunek, lot i hotel
        </p>
      </div>
      {/* Stała wysokość: czat sam się przewija (h-full min-h-0), a hero nie
          może skakać przy każdej nowej wiadomości. */}
      <div className="h-[380px] sm:h-[420px]">
        <ConciergeChat />
      </div>
    </div>
  );
}
