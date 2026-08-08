// Opis pokoju od dostawcy — z HTML-a na czytelną treść.
//
// BŁĄD, KTÓRY TO NAPRAWIA. `rooms[].description` z `/data/hotel` przychodzi
// jako HTML i trafiał do modalu jako zwykły tekst, więc gość widział
// dosłownie:
//
//   <p><strong>Łóżko podwójne lub 2 łóżka pojedyncze</strong></p><p>Pokój
//   o powierzchni 194 stóp kw. …</p><p><b>Internet</b> — Bezpłatne Wi-Fi</p>
//
// Zmierzone na żywym API (Rodos, 2026-08-08): 100% sprawdzonych opisów ma
// znaczniki HTML.
//
// DLACZEGO PARSUJEMY, A NIE WSTAWIAMY `dangerouslySetInnerHTML`.
// Opis dostawcy ma stałą, rozpoznawalną budowę:
//
//   <p><b>ETYKIETA</b> - treść</p>
//
// Rozbicie tego na pary etykieta/treść daje czytelną sekcję („Internet:
// Bezpłatne Wi-Fi") zamiast ściany akapitów, a przy okazji **całkowicie**
// usuwa powierzchnię ataku: do widoku idzie wyłącznie zwykły tekst, nigdy
// znaczniki. Sanitizer jest tu drugą warstwą, nie jedyną.

/** Fragment opisu: nagłówek + treść, albo sam akapit (label === null). */
export interface RoomDescriptionPart {
  label: string | null;
  text: string;
}

/** Encje, które realnie występują w opisach dostawcy. */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
};

function decode(s: string): string {
  return s.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

/**
 * Etykiety, które dostawca powtarza, a my mamy je już jako dane strukturalne
 * (metraż, pojemność, łóżka). Brief §33: nie dublujemy tego, co i tak stoi
 * wyżej w postaci ikon i liczb.
 */
const POMIJANE = /^(room size|size|occupancy|max occupancy|bed|beds|bedding)$/i;

/**
 * Rozbija opis dostawcy na czytelne części.
 *
 * Zwraca PUSTĄ tablicę, gdy nie ma czego pokazać — komponent nie renderuje
 * wtedy nagłówka sekcji, zamiast zostawiać pustą ramkę.
 */
export function parseRoomDescription(raw: string | null | undefined): RoomDescriptionPart[] {
  if (!raw) return [];

  // Blokowe znaczniki → separator akapitu. Reszta znaczników znika.
  const zTekstem = decode(
    String(raw)
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<\s*(li)\b[^>]*>/gi, "\n• ")
      // Pogrubienie zamieniamy na jawny znacznik etykiety, żeby nie zgubić
      // podziału na „nazwa działu" i „treść" po usunięciu znaczników.
      .replace(/<\s*(strong|b)\b[^>]*>/gi, "")
      .replace(/<\s*\/\s*(strong|b)\s*>/gi, "")
      .replace(/<[^>]*>/g, ""),
  );

  const parts: RoomDescriptionPart[] = [];
  for (const linia of zTekstem.split("\n")) {
    const s = linia.replace(/\s+/g, " ").trim();
    if (!s) continue;

    // „<b>Internet</b> - Bezpłatne Wi-Fi" → label „Internet", text „Bezpłatne…"
    const m = /^([^]{1,40})\s*[-–—:]?\s*(.*)$/.exec(s);
    if (m) {
      const label = m[1].replace(/[:\-–—\s]+$/, "").trim();
      const text = m[2].replace(/[]/g, "").trim();
      if (POMIJANE.test(label)) continue;
      // Sam pogrubiony nagłówek bez treści (np. „4 Twin Beds") to zdanie,
      // nie etykieta działu — zostaje akapitem.
      if (!text) {
        parts.push({ label: null, text: label });
        continue;
      }
      parts.push({ label, text });
      continue;
    }

    const czysty = s.replace(/[]/g, "").trim();
    if (czysty) parts.push({ label: null, text: czysty });
  }

  // Deduplikacja: dostawca potrafi powtórzyć ten sam akapit dwa razy.
  const widziane = new Set<string>();
  return parts.filter((p) => {
    const key = `${p.label ?? ""}|${p.text}`.toLowerCase();
    if (widziane.has(key)) return false;
    widziane.add(key);
    return true;
  });
}

/**
 * Priorytet udogodnień pokoju do PODGLĄDU na karcie (brief §24).
 *
 * Bez tego karta pokazywała cztery pierwsze pozycje z API — a dostawca
 * potrafi zacząć listę od „papieru toaletowego", podczas gdy „prywatna
 * łazienka" i „klimatyzacja" leżą dalej. Kolejność niżej to kolejność
 * WAŻNOŚCI DLA DECYZJI, nie kolejność alfabetyczna.
 *
 * Tier 1 — to, co realnie przesądza o wyborze pokoju.
 * Tier 2 — miłe dodatki.
 * Wszystko poza listą trafia na koniec, ale nie znika: pełny spis jest
 * w szczegółach pokoju.
 */
const TIER_1 = [
  /klimatyzacj|air condition/i,
  /prywatna łazienk|private bathroom|ensuite/i,
  /balkon|taras|balcony|terrace/i,
  /widok|view/i,
  /wi-?fi|internet/i,
  /aneks kuchenn|kuchni|kitchen/i,
];

const TIER_2 = [
  /minibar/i,
  /ekspres|czajnik|coffee|tea maker/i,
  /telewizor|tv\b|television/i,
  /sejf|safe/i,
  /suszark|hair dryer/i,
  /prysznic|wanna|shower|bathtub/i,
];

/** Wpisy bez wartości informacyjnej na PODGLĄDZIE (w pełnej liście zostają). */
const SZUM = [
  /papier toaletow|toilet paper/i,
  /mydł|soap|szampon|shampoo/i,
  /ręczni|towel/i,
  /pościel|bed sheet|linen/i,
  /wieszak|hanger/i,
  /kosz na śmieci|waste/i,
];

/**
 * Wybiera udogodnienia do pokazania na karcie pokoju — najpierw Tier 1,
 * potem Tier 2, na końcu reszta. Szum odsiewamy.
 */
export function topRoomAmenities(amenities: string[], max = 6): string[] {
  const czyste = amenities.map((a) => a.trim()).filter(Boolean);
  const bezSzumu = czyste.filter((a) => !SZUM.some((r) => r.test(a)));
  const zrodlo = bezSzumu.length >= max ? bezSzumu : czyste;

  const ranga = (a: string): number => {
    const t1 = TIER_1.findIndex((r) => r.test(a));
    if (t1 !== -1) return t1;
    const t2 = TIER_2.findIndex((r) => r.test(a));
    if (t2 !== -1) return TIER_1.length + t2;
    return TIER_1.length + TIER_2.length;
  };

  // `map` z indeksem + sort po parze (ranga, pozycja) — sort w JS jest
  // stabilny, ale jawny indeks czyni kolejność niezależną od silnika.
  return zrodlo
    .map((a, i) => ({ a, i, r: ranga(a) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .slice(0, max)
    .map((x) => x.a);
}
