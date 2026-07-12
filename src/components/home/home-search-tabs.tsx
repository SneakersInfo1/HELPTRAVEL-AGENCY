"use client";

// Toggle nad paskiem wyszukiwania. Aktywny stan to „pigułka", która PŁYNNIE
// przesuwa się między przyciskami (czysty CSS transform + transition ~220ms,
// bez ciężkiej zależności jak framer-motion). Stan zapisywany w URL
// (?tab=loty / ?tab=pakiety) — chipy „Popularne trasy" mogą podlinkować tryb.
//
// Przełączenie zmienia pola paska W MIEJSCU (MiniPlannerForm mode=…), bez
// przeładowania i bez skoku layoutu (wysokość paska rezerwuje sam formularz).
//
// PAKIETY: 3. tab „Lot + Hotel" pojawia się TYLKO za flagą
// NEXT_PUBLIC_FEATURE_PACKAGES i staje się domyślny. Flaga off → zachowanie
// 1:1 jak dotąd (2 taby, Hotele domyślnie, ta sama pigułka 50%).

import { useEffect, useState } from "react";

import { MiniPlannerForm } from "./mini-planner-form";

type Tab = "packages" | "hotels" | "flights";

const PACKAGES_ON = process.env.NEXT_PUBLIC_FEATURE_PACKAGES === "true";

const TABS: { key: Tab; label: string; icon: string }[] = [
  ...(PACKAGES_ON ? [{ key: "packages" as Tab, label: "Lot + Hotel", icon: "🧳" }] : []),
  { key: "hotels", label: "Hotele", icon: "🏨" },
  { key: "flights", label: "Loty", icon: "✈" },
];

// Flaga jest build-time (NEXT_PUBLIC) → ta sama wartość na serwerze i kliencie,
// więc domyślny tab nie powoduje hydration mismatch.
const DEFAULT_TAB: Tab = PACKAGES_ON ? "packages" : "hotels";

const TAB_PARAM: Record<Tab, string | null> = { packages: "pakiety", flights: "loty", hotels: null };

export function HomeSearchTabs() {
  const [tab, setTab] = useState<Tab>(DEFAULT_TAB);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (!param) return;
    const match = TABS.find((t) => TAB_PARAM[t.key] === param);
    if (!match || match.key === DEFAULT_TAB) return;
    // Deferred (setTimeout 0) — uniknięcie kaskadowego renderu w efekcie.
    const id = window.setTimeout(() => setTab(match.key), 0);
    return () => window.clearTimeout(id);
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    const param = TAB_PARAM[next];
    if (param) url.searchParams.set("tab", param);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  };

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === tab));
  const n = TABS.length;

  return (
    <div>
      {/* Toggle */}
      <div
        role="tablist"
        aria-label="Wybierz rodzaj wyszukiwania"
        className="relative mx-auto mb-3 flex w-full rounded-full border border-white/30 bg-white/15 p-1 backdrop-blur-md"
        style={{ maxWidth: PACKAGES_ON ? "384px" : "280px" }}
      >
        {/* Pigułka tła — przesuwa się transformem o pełną szerokość slotu. */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-full bg-white shadow-[0_4px_14px_rgba(16,84,48,0.25)] transition-transform duration-[220ms] ease-out"
          style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${activeIndex * 100}%)` }}
        />
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t.key)}
              className={`relative z-10 flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors ${
                active ? "text-emerald-900" : "text-white/90 hover:text-white"
              }`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Pasek — pola zmieniają się w miejscu wg trybu. */}
      <MiniPlannerForm compact mode={tab} />
    </div>
  );
}
