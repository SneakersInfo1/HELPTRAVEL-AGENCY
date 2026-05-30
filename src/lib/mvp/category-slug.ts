// Category slugs exist in both diacritic ("tanie-podróże", "ciepłe-kierunki")
// and ASCII route forms ("tanie-podroze", "cieple-kierunki") across the data,
// route folders and sitemap. `foldCategorySlug` collapses a slug to its
// diacritic-free, lower-cased form so:
//   • lookups by the ASCII route slug still resolve the category + articles
//     (otherwise those pages render empty), and
//   • links built from diacritic category slugs point at the real ASCII route
//     instead of a 404.
// Folding is idempotent, so already-ASCII slugs are unaffected and no two
// distinct category slugs collide. Kept dependency-free so it is safe to
// import from both server modules and client components.

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
