// Ostatnio wyszukiwane kierunki (Booking-style „Ostatnie") — localStorage,
// czysto kliencki dodatek do pola „Dokąd". Zapisywane przy wyborze podpowiedzi
// (mini-planner-form), pokazywane nad popularnymi kierunkami przy pustym polu.
// KAŻDY błąd storage/parsowania → po prostu brak sekcji (nigdy nie psuje
// wyszukiwarki).

import type { DestinationSuggestion } from "./types";

const STORAGE_KEY = "ht-recent-destinations-v1";
const MAX_RECENT = 3;

function isSuggestion(v: unknown): v is DestinationSuggestion {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.city === "string" && typeof s.country === "string";
}

export function readRecentDestinations(): DestinationSuggestion[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSuggestion).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentDestination(s: DestinationSuggestion): void {
  try {
    const current = readRecentDestinations().filter((r) => r.id !== s.id);
    const next = [s, ...current].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage pełny/zablokowany — trudno, sekcja „Ostatnie" po prostu nie urośnie
  }
}
