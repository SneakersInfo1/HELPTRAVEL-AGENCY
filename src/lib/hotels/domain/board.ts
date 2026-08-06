// Wyżywienie — KATEGORIA (typowana) obok istniejącej etykiety PL.
//
// Etykiet nie duplikujemy: `localizeBoard` z `lib/liteapi/translations.ts`
// jest sprawdzony i zostaje jedynym źródłem tekstu. Tutaj powstaje wyłącznie
// kategoria, bo filtrowanie i porównywanie ofert po swobodnym stringu
// („Room Only" vs „RO" vs „room_only") jest kruche.
//
// Różnica wobec `localizeBoard`, która ma znaczenie: przy BRAKU danych ta
// funkcja zwraca `"unknown"`, a nie `"room-only"`. Brak informacji o
// wyżywieniu to nie to samo co potwierdzone „bez wyżywienia" — i tylko
// warstwa widoku może zdecydować, czy w takiej sytuacji milczeć.

import type { BoardCategory } from "./types";

export function boardCategoryOf(
  boardType?: string | null,
  boardName?: string | null,
): BoardCategory {
  const raw = `${boardType ?? ""} ${boardName ?? ""}`.trim().toLowerCase();
  if (!raw) return "unknown";

  // Kolejność ma znaczenie: „all inclusive" zawiera słowo „inclusive",
  // a „half board" zawiera „board" — od najbardziej szczegółowego.
  if (/all[-\s_]?inclusive|\bai\b/.test(raw)) return "all-inclusive";
  if (/full[-\s_]?board|\bfb\b/.test(raw)) return "full-board";
  if (/half[-\s_]?board|\bhb\b/.test(raw)) return "half-board";
  if (/breakfast|\bbb\b/.test(raw)) return "breakfast";
  if (/room[-\s_]?only|\bro\b/.test(raw)) return "room-only";
  return "unknown";
}

/** Czy w cenie jest jakikolwiek posiłek — do filtra „z wyżywieniem". */
export function includesMeals(category: BoardCategory): boolean {
  return category === "breakfast" || category === "half-board" || category === "full-board" || category === "all-inclusive";
}
