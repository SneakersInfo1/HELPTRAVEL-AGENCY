/**
 * Podgląd wariantu polityki indeksu stron miesięcy — BEZ jego włączania.
 *
 *   pnpm seo:index-variant            # podsumowanie
 *   pnpm seo:index-variant -- --list  # pełna lista adresów, które wariant wyłącza z indeksu
 *
 * Aktywny wariant to stała ACTIVE_MONTH_INDEX_POLICY w src/lib/mvp/month-index-policy.ts.
 * Ten skrypt niczego nie zmienia: tylko liczy różnicę między bazą a wariantem.
 */
import { getClimateNormal } from "../../src/lib/mvp/climate-normals";
import { getAllDestinationProfiles } from "../../src/lib/mvp/destinations";
import { ACTIVE_MONTH_INDEX_POLICY, monthIndexPathsUnder } from "../../src/lib/mvp/month-index-policy";
import { polishMonthSlugs, type PolishMonthSlug } from "../../src/lib/mvp/months";

const list = process.argv.includes("--list");
const baseline = monthIndexPathsUnder("baseline-1039");
const variant = new Set(monthIndexPathsUnder("baseline-without-climate-gap"));
const removed = baseline.filter((path) => !variant.has(path));
const names = new Map(getAllDestinationProfiles().map((profile) => [profile.slug, `${profile.city} (${profile.country})`]));

const bySlug = new Map<string, string[]>();
for (const path of removed) {
  const [, , slug, month] = path.split("/");
  bySlug.set(slug, [...(bySlug.get(slug) ?? []), month].sort((a, b) => polishMonthSlugs.indexOf(a as PolishMonthSlug) - polishMonthSlugs.indexOf(b as PolishMonthSlug)));
}

console.log(`Aktywny wariant: ${ACTIVE_MONTH_INDEX_POLICY}`);
console.log(`Baza: ${baseline.length} stron. Wariant „baseline-without-climate-gap”: ${variant.size} stron.`);
console.log(`Wariant wyłączyłby z indeksu i sitemapy ${removed.length} stron ${bySlug.size} kierunków bez normy WMO:`);
for (const [slug, months] of [...bySlug.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
  if (getClimateNormal(slug) !== null) throw new Error(`Kierunek z normą na liście wyłączeń: ${slug}`);
  console.log(`  ${String(months.length).padStart(2)} × ${names.get(slug) ?? slug} — ${months.join(", ")}`);
}
if (list) for (const path of removed) console.log(path);
