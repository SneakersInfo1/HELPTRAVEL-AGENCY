"use client";

// Toggle Hotele / Loty nad paskiem wyszukiwania (Faza 2.1). Aktywny stan to
// "pigułka", która PŁYNNIE przesuwa się między przyciskami (czysty CSS
// transform + transition ~220ms, bez ciężkiej zależności jak framer-motion).
// Domyślnie aktywne: Hotele. Stan zapisywany w URL (?tab=loty) — żeby chipy
// „Popularne trasy" mogły podlinkować od razu tryb Loty.
//
// Przełączenie zmienia pola paska W MIEJSCU (MiniPlannerForm mode=…), bez
// przeładowania i bez skoku layoutu (wysokość paska rezerwuje sam formularz).

import { useEffect, useState } from "react";

import { MiniPlannerForm } from "./mini-planner-form";

type Tab = "hotels" | "flights";

export function HomeSearchTabs() {
  // SSR i pierwszy render klienta = "hotels" (brak hydration mismatch).
  // ?tab=loty z URL doczytujemy po zamontowaniu.
  const [tab, setTab] = useState<Tab>("hotels");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== "loty") return;
    // Deferred (setTimeout 0) — uniknięcie kaskadowego renderu w efekcie
    // (react-hooks/set-state-in-effect), wzorzec użyty już w webview-hint.
    const id = window.setTimeout(() => setTab("flights"), 0);
    return () => window.clearTimeout(id);
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    // Zapis do URL bez nawigacji/przeładowania (history.replaceState).
    const url = new URL(window.location.href);
    if (next === "flights") url.searchParams.set("tab", "loty");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  };

  const tabBtn = (key: Tab, label: string, icon: string) => {
    const active = tab === key;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => selectTab(key)}
        className={`relative z-10 flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors ${
          active ? "text-emerald-900" : "text-white/90 hover:text-white"
        }`}
      >
        <span aria-hidden>{icon}</span>
        {label}
      </button>
    );
  };

  return (
    <div>
      {/* Toggle */}
      <div
        role="tablist"
        aria-label="Wybierz: hotele albo loty"
        className="relative mx-auto mb-3 flex w-full max-w-[280px] rounded-full border border-white/30 bg-white/15 p-1 backdrop-blur-md"
      >
        {/* Pigułka tła — przesuwa się transformem (Hotele=0%, Loty=100%). */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-[0_4px_14px_rgba(16,84,48,0.25)] transition-transform duration-[220ms] ease-out"
          style={{ transform: tab === "flights" ? "translateX(100%)" : "translateX(0)" }}
        />
        {tabBtn("hotels", "Hotele", "🏨")}
        {tabBtn("flights", "Loty", "✈")}
      </div>

      {/* Pasek — pola zmieniają się w miejscu wg trybu. */}
      <MiniPlannerForm compact mode={tab} />
    </div>
  );
}
