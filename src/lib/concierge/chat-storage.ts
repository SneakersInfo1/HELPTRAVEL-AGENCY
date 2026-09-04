// Klucz i odczyt historii rozmowy — WSPÓLNE dla czatu i launchera.
//
// Dlaczego osobny moduł, a nie eksport z concierge-chat.tsx: launcher ładuje
// czat przez `next/dynamic` właśnie po to, żeby jego kod NIE wchodził do
// pierwszego bundle'a. Statyczny import stałej z tamtego pliku skasowałby
// całą korzyść z leniwego ładowania. A zduplikowany string cicho rozjechałby
// się przy pierwszej zmianie wersji klucza i zepsułby metrykę zamknięć.

export const CHAT_STORAGE_KEY = "helptravel-concierge-chat-v1";

export interface ChatCloseStats {
  /** Ile wiadomości napisał UŻYTKOWNIK w tej sesji czatu. */
  userMessages: number;
  /** Czy w rozmowie pojawiła się choć jedna karta oferty. */
  sawOffer: boolean;
}

/**
 * Statystyka rozmowy do zdarzenia zamknięcia. Każdy błąd (brak
 * sessionStorage w trybie prywatnym, uszkodzony JSON) degraduje się do zer —
 * metryka nie ma prawa wywalić zamykania panelu.
 */
export function readChatCloseStats(): ChatCloseStats {
  if (typeof window === "undefined") return { userMessages: 0, sawOffer: false };
  try {
    const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return { userMessages: 0, sawOffer: false };
    const list = parsed as Array<Record<string, unknown>>;
    return {
      userMessages: list.filter((m) => m?.role === "user").length,
      sawOffer: list.some((m) => Boolean(m?.offer)),
    };
  } catch {
    return { userMessages: 0, sawOffer: false };
  }
}
