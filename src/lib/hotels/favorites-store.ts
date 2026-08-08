"use client";

import { useSyncExternalStore } from "react";

// Polubione hotele (brief V3 §14-§17).
//
// STAN ZASTANY: `SaveHotelButton` na stronie hotelu trzymał zapisy
// w localStorage pod kluczem `ht_saved_hotels`, ale nic ich nie czytało —
// nie było ani wpisu w nawigacji, ani strony z listą, ani serca na kartach
// wyników. Zapis istniał, powrót do zapisanych obiektów — nie.
//
// DLACZEGO localStorage, A NIE KONTO. Projekt nie ma logowania ani modelu
// użytkownika (Prisma obsługuje analitykę i rezerwacje, nie konta). Budowanie
// całego systemu kont pod funkcję „zapisz na później" byłoby nieproporcjonalne
// — brief §16 wprost na to nie pozwala. Gdy konta powstaną, wystarczy podmienić
// warstwę zapisu pod tym samym interfejsem.
//
// CZEGO TU NIE MA: CENY. Cena zależy od terminu, liczby osób, taryfy
// i dostępności — zapisana dziś, jutro jest nieprawdą. Strona polubionych
// pokazuje obiekt i wysyła gościa po AKTUALNĄ cenę (brief §16).

const STORAGE_KEY = "ht_saved_hotels";
const MAX_SAVED = 100;

export interface FavoriteHotel {
  id: string;
  name: string;
  city?: string;
  country?: string;
  /** Miniatura do listy polubionych. Brak = kafel zastępczy, nie pusta ramka. */
  image?: string;
  /** Ocena gości w chwili zapisu — informacyjnie, nie jako obietnica. */
  rating?: number;
  stars?: number;
  /** Link z parametrami wyszukiwania z chwili zapisu (mogą być nieaktualne). */
  href: string;
  savedAt: number;
}

let cache: FavoriteHotel[] | null = null;
const listeners = new Set<() => void>();

function read(): FavoriteHotel[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed)
      ? (parsed as FavoriteHotel[]).filter((h) => h && typeof h.id === "string" && typeof h.name === "string")
      : [];
  } catch {
    // Zepsuty wpis, wyłączony storage, tryb prywatny — nigdy nie wywalamy
    // strony z powodu funkcji „zapisz na później".
    cache = [];
  }
  return cache;
}

function write(next: FavoriteHotel[]): void {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Brak miejsca albo zablokowany storage — stan w pamięci zostaje spójny
    // do końca sesji, a strona działa dalej.
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Zapis w INNEJ karcie ma odświeżyć tę. Bez tego gość dodaje hotel w jednej
  // zakładce, przełącza się na drugą i widzi stary licznik.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const PUSTE: FavoriteHotel[] = [];

/**
 * Lista polubionych.
 *
 * Snapshot serwerowy to STAŁA pusta tablica — nie `[]` tworzone za każdym
 * wywołaniem, bo `useSyncExternalStore` porównuje referencje i nowa tablica
 * przy każdym renderze dawałaby nieskończoną pętlę.
 */
export function useFavorites(): FavoriteHotel[] {
  return useSyncExternalStore(subscribe, read, () => PUSTE);
}

/** Czy dany obiekt jest zapisany. Osobny hook, żeby karta nie re-renderowała się od cudzych zmian. */
export function useIsFavorite(hotelId: string): boolean {
  const all = useFavorites();
  return all.some((h) => h.id === hotelId);
}

/** Dodaje albo usuwa. Zwraca stan PO zmianie — do zdarzeń analitycznych. */
export function toggleFavorite(hotel: Omit<FavoriteHotel, "savedAt">): boolean {
  const current = read();
  const exists = current.some((h) => h.id === hotel.id);
  write(
    exists
      ? current.filter((h) => h.id !== hotel.id)
      : [{ ...hotel, savedAt: Date.now() }, ...current].slice(0, MAX_SAVED),
  );
  return !exists;
}

export function removeFavorite(hotelId: string): void {
  const current = read();
  if (!current.some((h) => h.id === hotelId)) return;
  write(current.filter((h) => h.id !== hotelId));
}
