// Ostatnio wyszukiwane (Booking-style) — localStorage, czysto kliencki dodatek
// do strony głównej. KAŻDY błąd storage/parsowania → brak sekcji, nigdy wyjątek.
//
// DLACZEGO OSOBNY MODUŁ OBOK `recent-destinations.ts`
// Tamten przechowuje `DestinationSuggestion`, czyli obiekt, którym combobox
// potrafi z powrotem WYPEŁNIĆ pole „Dokąd" (miasto EN, kraj, IATA, regionId).
// Ten przechowuje ODBYTE WYSZUKANIE: adres, termin, liczbę gości i to, jak
// karta ma się nazywać. To dwa różne pytania — „co użytkownik ostatnio wybrał
// w polu" i „dokąd wraca kliknięcie" — i sklejenie ich w jeden rekord kończy
// się polem, które dla części wpisów jest puste.
//
// GDZIE NIE MA TYCH DANYCH: nigdzie poza przeglądarką użytkownika. Serwis
// świadomie nie zapisuje historii wyszukiwań na serwerze (ta sama zasada, co
// przy rozmowach z konsjerżem), więc sekcja żyje wyłącznie lokalnie i znika
// razem z wyczyszczeniem danych przeglądarki.

const STORAGE_KEY = "ht-recent-searches-v1";
/** Ile wpisów trzymamy. Sześć = dwa rzędy na desktopie, jeden przewijany na telefonie. */
export const MAX_RECENT_SEARCHES = 6;

export interface RecentSearch {
  /** Klucz deduplikacji i React key — ten sam cel + termin nadpisuje poprzedni wpis. */
  id: string;
  kind: "hotel" | "destination";
  /** Pierwsza linia karty: nazwa hotelu albo miasto po polsku. */
  title: string;
  /** Druga linia: „Málaga, Hiszpania" dla hotelu, sam kraj dla kierunku. */
  subtitle?: string;
  /** Miniatura, gdy znana (hotel z podpowiedzi). Kierunki dostają zdjęcie z serwera. */
  photo?: string;
  /** Klucz do serwerowej mapy zdjęć kierunków: foldowane „miasto|kraj" (EN). */
  imageKey?: string;
  checkin: string;
  checkout: string;
  /** Suma osób — dokładnie ta liczba, która poszła do URL jako `adults`. */
  guests: number;
  rooms: number;
  /** Adres, który wtedy otwarto. Klik wraca DOKŁADNIE tam. */
  href: string;
  savedAt: number;
}

function isRecentSearch(v: unknown): v is RecentSearch {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.title === "string" &&
    s.title.length > 0 &&
    typeof s.href === "string" &&
    // Wyłącznie ścieżka względna TEGO serwisu. Samo `startsWith("/")`
    // przepuszczało adres protocol-relative (`//obcy.przyklad`), który
    // przeglądarka rozwiązuje do CUDZEGO hosta — wpis w localStorage nie ma
    // prawa wyprowadzić kliknięcia poza serwis. Znalezione w review.
    s.href.startsWith("/") &&
    !s.href.startsWith("//") &&
    typeof s.checkin === "string" &&
    typeof s.checkout === "string" &&
    typeof s.guests === "number" &&
    typeof s.rooms === "number"
  );
}

/** Dzisiejsza data w formacie zapisanym w rekordach (lokalna strefa użytkownika). */
function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Czysta część filtrowania — bez `window`, więc testowalna.
 *
 * Wpis, którego wyjazd już się skończył, wypada: karta linkuje na TE daty,
 * więc kliknięcie prowadziłoby do wyszukania w przeszłości i pustej listy.
 * Sekcja „ostatnio wyszukiwane" ma skracać drogę powrotu, a nie odsyłać
 * użytkownika do terminu, którego nie da się już kupić.
 */
export function usableSearches(items: RecentSearch[], now: Date = new Date()): RecentSearch[] {
  const today = todayIso(now);
  return items
    .filter(isRecentSearch)
    .filter((s) => s.checkout >= today)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
    .slice(0, MAX_RECENT_SEARCHES);
}

export function readRecentSearches(): RecentSearch[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return usableSearches(parsed as RecentSearch[]);
  } catch {
    return [];
  }
}

export function saveRecentSearch(entry: Omit<RecentSearch, "savedAt">): void {
  try {
    const wpis: RecentSearch = { ...entry, savedAt: Date.now() };
    if (!isRecentSearch(wpis)) return;
    const current = readRecentSearches().filter((r) => r.id !== wpis.id);
    const next = [wpis, ...current].slice(0, MAX_RECENT_SEARCHES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage pełny / zablokowany (tryb prywatny, blokada third-party) —
    // sekcja po prostu nie urośnie. Wyszukiwarka działa dalej.
  }
}

/** Wyczyszczenie listy (przycisk w sekcji). */
export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // jw.
  }
}
