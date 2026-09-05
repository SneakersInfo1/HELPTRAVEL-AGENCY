// Category slugs are canonically ASCII ("tanie-podroze", "cieple-kierunki"),
// matching the route folders under src/app/<category>/ and the sitemap. All
// category data now uses that ASCII form: editorialCategories[].slug, every
// article's categorySlugs, inferDestinationCategorySlugs, the locale title map
// and the inspiracje image map. Lookups therefore resolve by exact match.
//
// `foldCategorySlug` is kept as defense-in-depth: it collapses a slug to its
// diacritic-free, lower-cased form so any stray diacritic slug (a future
// content edit, or external/user input) still resolves to the right category
// and links never point at a 404. Folding is idempotent, so already-ASCII
// slugs are unaffected and no two distinct category slugs collide. Kept
// dependency-free so it is safe to import from both server modules and client
// components.

const SLUG_DIACRITICS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function foldCategorySlug(slug: string): string {
  return slug.toLowerCase().replace(/[ąćęłńóśźż]/g, (ch) => SLUG_DIACRITICS[ch] ?? ch);
}

// Polskie nazwy kategorii, kluczowane po ZWINIĘTYM slugu, żeby obie formy
// ("tanie-podróże" i "tanie-podroze") trafiały w ten sam wpis.
//
// Powód istnienia: karty artykułów budowały etykietę chipa przez
// `slug.replace(/-/g, " ")`, co dawało „tanie podróże" i „cieple kierunki" —
// małą literą i bez diakrytyków. Nazwy są tu, a nie w komponencie, bo karta
// jest kliencka: import `publisher-content` wciągnąłby do bundla przeglądarki
// całą treść redakcyjną. Ten moduł jest bezzależnościowy i celowo taki zostaje.
//
// Wartości pochodzą z `editorialCategories` w `publisher-content.ts`. Gdy
// dojdzie nowa kategoria, brak wpisu nie psuje UI — fallback kapitalizuje slug.
const CATEGORY_LABELS_PL: Record<string, string> = {
  przewodniki: "Przewodniki",
  "city-breaki": "City breaki",
  "cieple-kierunki": "Ciepłe kierunki",
  "bez-wizy": "Bez wizy",
  "tanie-podroze": "Tanie podróże",
  "weekendowe-wyjazdy": "Weekendowe wyjazdy",
};

export function categoryLabelPl(slug: string): string {
  const folded = foldCategorySlug(slug);
  const known = CATEGORY_LABELS_PL[folded];
  if (known) return known;
  const spaced = slug.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
