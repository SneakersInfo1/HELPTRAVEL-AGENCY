// Strażnik polityki indeksowania dla publikacji z sesji „SEO daily”.
//
// Właściciel zastrzegł: sesja nie zmienia polityki indeksowania bez jego zgody. Pliki,
// które ją definiują wprost (polityka indeksu miesięcy, robots, sitemap, middleware,
// next.config), są na liście chronionych w git-state.ts. Ten moduł łapie resztę: dodane
// w kodzie linie, które zmieniają indeksowanie strony (`noindex`, `robots`, `canonical`,
// przekierowania). Taka zmiana nie trafia do PR z sesji — sesja zapisuje ją w kolejce
// jako decyzję do podjęcia przez właściciela.

import type { AddedLine } from "./git-state";

const SCANNED_EXTENSIONS = /\.(?:[cm]?[jt]sx?|json|html?|txt)$/i;

const INDEX_POLICY_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "noindex", pattern: /\bnoindex\b/i },
  { label: "nofollow", pattern: /\bnofollow\b/i },
  { label: "index: false", pattern: /\bindex\s*:\s*false\b/ },
  { label: "follow: false", pattern: /\bfollow\s*:\s*false\b/ },
  { label: "metadata robots", pattern: /\brobots\s*[:=]/i },
  { label: "X-Robots-Tag", pattern: /x-robots-tag/i },
  { label: "canonical", pattern: /\b(?:alternates|canonical)\s*:|rel\s*=\s*["']canonical/i },
  { label: "przekierowanie", pattern: /\b(?:permanentRedirect|redirect)\s*\(/ },
  // Modele stron (np. src/lib/seo/month-page-model.ts) liczą `indexable`, z którego szablon
  // wystawia `noindex`. Definicja albo przypisanie pola to zmiana polityki; odczyt
  // (`page.indexable`, `const indexable = …`) nie.
  { label: "indexable", pattern: /\b(?:indexable|isIndexable|shouldIndex)\s*:|\.(?:indexable|isIndexable|shouldIndex)\s*=(?!=)/ },
];

/** Zwraca opisy dodanych linii, które zmieniają indeksowanie (pusta lista = brak zmian polityki). */
export function indexPolicyHits(added: readonly AddedLine[]): string[] {
  const hits: string[] = [];
  for (const { file, line } of added) {
    const normalized = file.replace(/\\/g, "/");
    if (normalized.startsWith("content/seo/") || !SCANNED_EXTENSIONS.test(normalized)) continue;
    const found = INDEX_POLICY_PATTERNS.find(({ pattern }) => pattern.test(line));
    if (found) hits.push(`${normalized} (${found.label}): ${line.trim().slice(0, 120)}`);
  }
  return hits;
}
