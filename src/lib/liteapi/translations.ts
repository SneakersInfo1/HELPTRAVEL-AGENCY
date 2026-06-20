// FAZA 1 — warstwa tłumaczeń PL dla danych LiteAPI (uzupełnienie istniejącego
// słownika facility w `facilities.ts`). Tu mieszkają tłumaczenia, których
// wcześniej brakowało:
//   • BOARD_TYPE → polskie wyżywienie (wyniesione z inline `polishBoard`)
//   • ROOM_NAME  → polskie nazwy pokoi (wcześniej leciały surowym angielskim)
//   • logUntranslated — diagnostyka: wypisuje do logów stringi, których nie
//     umiemy przetłumaczyć, żeby właściciel mógł je dobrać (FAZA 6 pkt 3).
//
// Zasada (jak w całym projekcie): brak mapowania ≠ pusty ekran. Fallback to
// ZAWSZE oryginał — nigdy nie zmyślamy i nie kasujemy treści. Tłumaczenia są
// wyłącznie wiernym relabelem.
//
// Kraje tłumaczymy istniejącą funkcją `localizeCountry` z `@/lib/mvp/i18n-geo`
// (obsługuje też surowe kody ISO typu „al" → „Albania"), więc nie dublujemy
// tu słownika krajów.

// ── Diagnostyka nieprzetłumaczonych stringów ────────────────────────────────
// Dedupe per-proces (resetuje się przy każdym cold-startcie serverless — to OK,
// chodzi o sygnał, nie pełną telemetrię). Logujemy tylko stringi, które
// WYGLĄDAJĄ na obcojęzyczne (mają litery ASCII, brak polskich znaków), żeby nie
// zaśmiecać logów wartościami, które LiteAPI zwróciło już po polsku.
const _loggedMisses = new Set<string>();

function looksTranslatable(s: string): boolean {
  if (!/[a-z]/i.test(s)) return false; // brak liter łacińskich (liczby, symbole)
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s)) return false; // już po polsku
  return true;
}

export function logUntranslated(category: "facility" | "board" | "room", value: string): void {
  const v = value.trim();
  if (!v || !looksTranslatable(v)) return;
  const key = `${category}:${v.toLowerCase()}`;
  if (_loggedMisses.has(key)) return;
  _loggedMisses.add(key);
  console.warn(`[i18n-miss][${category}] ${v}`);
}

// ── Wyżywienie (board) ──────────────────────────────────────────────────────
// LiteAPI zwraca board jako swobodny string (boardName/boardType), więc
// dopasowujemy po słowach kluczowych — pewniejsze niż słownik 1:1. Zwracane
// etykiety są IDENTYCZNE jak dotychczasowy inline `polishBoard`, żeby UI się nie
// zmienił poza miejscem definicji.
export function localizeBoard(raw?: string | null): string {
  if (!raw || !raw.trim()) return "Bez wyżywienia";
  const r = raw.toLowerCase();
  if (r.includes("all-inclusive") || r.includes("all inclusive") || r.includes("all_inclusive") || r === "ai")
    return "All Inclusive";
  if (r.includes("full board") || r.includes("full-board") || r === "fb") return "Pełne wyżywienie (FB)";
  if (r.includes("half board") || r.includes("half-board") || r.includes("half") || r === "hb")
    return "Wyżywienie HB (śniadanie + obiadokolacja)";
  if (r.includes("bed and breakfast") || r.includes("bed & breakfast") || r.includes("breakfast") || r === "bb")
    return "Ze śniadaniem";
  if (r.includes("self catering") || r.includes("self-catering")) return "Z aneksem kuchennym";
  if (r.includes("room only") || r.includes("room_only") || r === "ro") return "Bez wyżywienia";
  // Nieznany board — zaloguj i pokaż oryginał (lepiej niż pusty/zmyślony).
  logUntranslated("board", raw);
  return raw;
}

// ── Nazwy pokoi ─────────────────────────────────────────────────────────────
// WAŻNE: to jest TYLKO etykieta wyświetlana. Grupowanie pokoi (group-rates.ts)
// dalej działa na ORYGINALNEJ angielskiej nazwie — tłumaczymy dopiero przy
// renderze, więc kontrakt grupowania/checkoutu jest nietknięty.
//
// Strategia: kuratorska mapa najczęstszych pełnych nazw (dostawcy używają
// w kółko tych samych) + bezpieczny fallback do oryginału z logowaniem. Świadomie
// NIE robimy generatywnego sklejania tokenów — daje koślawą polszczyznę
// („Ekonomiczny lub z dwoma łóżkami pokój"). Braki zbieramy z logów i dosypujemy
// tutaj (FAZA 6).
const ROOM_NAME_PL: Record<string, string> = {
  // bazowe typy
  room: "Pokój",
  "double room": "Pokój dwuosobowy",
  "twin room": "Pokój z dwoma łóżkami",
  "double or twin room": "Pokój dwuosobowy lub z dwoma łóżkami",
  "twin or double room": "Pokój dwuosobowy lub z dwoma łóżkami",
  "single room": "Pokój jednoosobowy",
  "triple room": "Pokój trzyosobowy",
  "quadruple room": "Pokój czteroosobowy",
  "family room": "Pokój rodzinny",
  "double room for single use": "Pokój dwuosobowy do pojedynczego wykorzystania",
  // standard
  "standard room": "Pokój standardowy",
  "standard double room": "Standardowy pokój dwuosobowy",
  "standard twin room": "Standardowy pokój z dwoma łóżkami",
  "standard double or twin room": "Standardowy pokój dwuosobowy lub z dwoma łóżkami",
  "standard single room": "Standardowy pokój jednoosobowy",
  "standard triple room": "Standardowy pokój trzyosobowy",
  // budget / economy / comfort / classic
  "budget room": "Pokój ekonomiczny",
  "budget double room": "Ekonomiczny pokój dwuosobowy",
  "budget twin room": "Ekonomiczny pokój z dwoma łóżkami",
  "budget double or twin room": "Ekonomiczny pokój dwuosobowy lub z dwoma łóżkami",
  "economy room": "Pokój ekonomiczny",
  "economy double room": "Ekonomiczny pokój dwuosobowy",
  "comfort room": "Pokój komfortowy",
  "comfort double room": "Komfortowy pokój dwuosobowy",
  "classic room": "Pokój klasyczny",
  "classic double room": "Klasyczny pokój dwuosobowy",
  // superior
  "superior room": "Pokój Superior",
  "superior double room": "Pokój Superior dwuosobowy",
  "superior twin room": "Pokój Superior z dwoma łóżkami",
  "superior double or twin room": "Pokój Superior dwuosobowy lub z dwoma łóżkami",
  // deluxe / luxury
  "deluxe room": "Pokój Deluxe",
  "deluxe double room": "Pokój Deluxe dwuosobowy",
  "deluxe twin room": "Pokój Deluxe z dwoma łóżkami",
  "luxury room": "Pokój Luksusowy",
  // executive / premium / grand
  "executive room": "Pokój Executive",
  "executive double room": "Pokój Executive dwuosobowy",
  "premium room": "Pokój Premium",
  "premium double room": "Pokój Premium dwuosobowy",
  // łóżka king/queen
  "king room": "Pokój z łóżkiem King",
  "queen room": "Pokój z łóżkiem Queen",
  "double room with king bed": "Pokój dwuosobowy z łóżkiem King",
  // suity / studia / apartamenty
  suite: "Apartament typu Suite",
  "junior suite": "Junior Suite",
  "executive suite": "Apartament Executive",
  "deluxe suite": "Apartament Deluxe",
  studio: "Studio",
  apartment: "Apartament",
  "one-bedroom apartment": "Apartament z 1 sypialnią",
  "two-bedroom apartment": "Apartament z 2 sypialniami",
  // inne formy
  bungalow: "Bungalow",
  villa: "Willa",
  penthouse: "Penthouse",
  "dormitory room": "Pokój wieloosobowy",
  "bed in dormitory": "Łóżko w pokoju wieloosobowym",
};

function normRoom(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Tłumacz tokenowy (hybryda „pełne rozpoznanie") ──────────────────────────
// Odpala TYLKO gdy rozumie WSZYSTKIE znaczące człony nazwy. Jeśli trafi na
// cokolwiek nieznanego (brand „Seventy", liczbę, dziwny token) — zwraca null,
// a `localizeRoomName` spada do oryginału + logu. Dzięki temu nigdy nie sklei
// koślawej polszczyzny typu „Dwuosobowy lub z dwoma łóżkami Seventy".
const CAT_PRE: Record<string, string> = {
  standard: "standardowy", budget: "ekonomiczny", economy: "ekonomiczny",
  comfort: "komfortowy", classic: "klasyczny", luxury: "luksusowy",
  basic: "podstawowy", traditional: "tradycyjny",
};
const CAT_POST: Record<string, string> = {
  superior: "Superior", deluxe: "Deluxe", executive: "Executive",
  premium: "Premium", grand: "Grand",
};
const BED_TOK: Record<string, string> = {
  single: "jednoosobowy", double: "dwuosobowy", twin: "z dwoma łóżkami",
  triple: "trzyosobowy", quadruple: "czteroosobowy", family: "rodzinny",
  king: "z łóżkiem typu King", queen: "z łóżkiem typu Queen",
};
const BASE_TOK: Record<string, string> = {
  room: "pokój", studio: "studio", apartment: "apartament",
  bungalow: "bungalow", villa: "willa", penthouse: "penthouse",
};
const VIEW_PL: Record<string, string> = {
  sea: "z widokiem na morze", ocean: "z widokiem na morze",
  city: "z widokiem na miasto", garden: "z widokiem na ogród",
  pool: "z widokiem na basen", mountain: "z widokiem na góry",
  patio: "z widokiem na patio", courtyard: "z widokiem na dziedziniec",
  landmark: "z widokiem na zabytki", river: "z widokiem na rzekę",
  lake: "z widokiem na jezioro", park: "z widokiem na park",
};
const ROOM_FILLER = new Set(["with", "and", "the", "a", "an", "bed", "beds", "&"]);

function translateRoomTokens(raw: string): string | null {
  let s = ` ${raw.toLowerCase()} `;
  // wielowyrazowe „double or twin" (i warianty ze slashem) → jeden token
  s = s.replace(/\b(double or twin|twin or double|double\/twin|twin\/double)\b/g, " §DT§ ");
  // widoki „X view(s)" (także w nawiasach) → token §V:klucz§, ale tylko znane klucze
  s = s.replace(/\(?\b([a-z]+)\s+views?\b\)?/g, (m, key: string) => (VIEW_PL[key] ? ` §V:${key}§ ` : m));
  s = s.replace(/\bspa access\b/g, " §SPA§ ");
  // zostały nawiasy = jest tam coś, czego nie rozumiemy (brand/uwaga) → bail
  if (/[()[\]]/.test(s)) return null;
  s = s.replace(/[/,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;

  let catPre = "", catPost = "", bed = "", base = "", view = "", suffix = "";
  let core = false; // czy rozpoznaliśmy choć jeden znaczący człon
  for (const t of s.split(" ")) {
    if (!t) continue;
    if (/\d/.test(t)) return null; // liczby = złożony opis łóżek → bail
    if (t.startsWith("§V:")) { view = VIEW_PL[t.slice(3, -1)] ?? ""; if (!view) return null; core = true; continue; }
    if (t === "§DT§") { bed = "dwuosobowy lub z dwoma łóżkami"; core = true; continue; }
    if (t === "§SPA§") { suffix = "z dostępem do spa"; continue; }
    if (CAT_PRE[t]) { catPre = CAT_PRE[t]; core = true; continue; }
    if (CAT_POST[t]) { catPost = CAT_POST[t]; core = true; continue; }
    if (BED_TOK[t]) { bed = BED_TOK[t]; core = true; continue; }
    if (BASE_TOK[t]) { base = BASE_TOK[t]; core = true; continue; }
    if (ROOM_FILLER.has(t)) continue;
    return null; // nieznany znaczący token → bail do oryginału
  }
  if (!core) return null;
  if (!base) base = "pokój";
  const out = [catPre, base, catPost, bed, view, suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function localizeRoomName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "Pokój";
  const exact = ROOM_NAME_PL[normRoom(raw)];
  if (exact) return exact;
  // Tłumacz tokenowy — tylko gdy rozumie wszystko; inaczej null.
  const tok = translateRoomTokens(raw);
  if (tok) return tok;
  // Nie umiemy bezpiecznie przetłumaczyć — zaloguj i zwróć oryginał. NIGDY pusto.
  logUntranslated("room", raw);
  return raw;
}
