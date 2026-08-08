"use client";

// Powłoka wyników — decyduje, czy na ekranie jest sidebar filtrów.
//
// PROBLEM, KTÓRY TO ROZWIĄZUJE (brief V3 §3B i §5). Mapa renderowała się
// WEWNĄTRZ prawej kolumny siatki [filtry | wyniki], więc w trybie mapy na
// ekranie stały trzy kolumny naraz: filtry, wąska lista i mapa. Zmierzone na
// 1920 px: sidebar 320 + lista 762 + mapa 626. Karty były węższe niż
// w widoku listy, teksty się łamały, a przycisk zajmował prawie całą
// szerokość karty.
//
// Teraz w trybie mapy sidebar znika, a cała powłoka oddaje szerokość
// podziałowi lista/mapa. Pełne filtry są nadal dostępne — z paska szybkich
// filtrów nad wynikami.

import type { ReactNode } from "react";

import { HOTEL_RESULTS_GRID, HOTEL_SHELL_WIDE } from "@/lib/hotels/layout";
import { useViewMode } from "@/lib/hotels/view-mode-store";

export function ResultsLayout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const mode = useViewMode();

  return (
    <div
      className={`${HOTEL_SHELL_WIDE} py-6 ${
        mode === "map" ? "flex flex-col gap-6" : HOTEL_RESULTS_GRID
      }`}
    >
      {mode === "list" ? sidebar : null}
      <section className="min-w-0 space-y-6">{children}</section>
    </div>
  );
}
