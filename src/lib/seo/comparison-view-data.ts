// Model widoku porównania bez sieci i bez modułów „server-only" — używany
// przez metadane strony i przez testy (node:test nie ładuje `server-only`).

import { getEnrichment } from "@/lib/content-engine/site-content";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { comparisonPairs, getComparisonPairBySlug, type ComparisonPair } from "@/lib/mvp/comparisons";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

import { buildComparisonModel, comparisonCoverage } from "./comparison-model";
import { buildComparisonView, type ComparisonView } from "./comparison-view";
import { destinationDisplayName } from "./destination-facts";

function pairLabel(pair: ComparisonPair): string | null {
  const a = getDestinationGuideBySlug(pair.a);
  const b = getDestinationGuideBySlug(pair.b);
  if (!a || !b) return null;
  return `${pair.labelA ?? destinationDisplayName(a.destination)} czy ${pair.labelB ?? destinationDisplayName(b.destination)}`;
}

/** Etykiety wszystkich par — liczone raz na proces. */
let allPairLabels: Array<{ slug: string; a: string; b: string; label: string }> | null = null;
export function pairsWithLabels() {
  if (!allPairLabels) {
    allPairLabels = comparisonPairs.flatMap((pair) => {
      const label = pairLabel(pair);
      return label ? [{ slug: pair.slug, a: pair.a, b: pair.b, label }] : [];
    });
  }
  return allPairLabels;
}

/** Sam model widoku — bez sieci; do metadanych i testów. */
export function comparisonViewFor(slug: string): { pair: ComparisonPair; view: ComparisonView } | null {
  const pair = getComparisonPairBySlug(slug);
  if (!pair) return null;
  const ga = getDestinationGuideBySlug(pair.a);
  const gb = getDestinationGuideBySlug(pair.b);
  if (!ga || !gb) return null;
  const baseUrl = getSiteUrl();
  const model = buildComparisonModel({ pair, a: ga.destination, b: gb.destination, baseUrl, images: [], author: personSchema(EDITOR_IN_CHIEF) });
  const view = buildComparisonView({
    pair,
    model,
    enrichment: getEnrichment(`/porownanie/${pair.slug}`),
    allPairs: pairsWithLabels(),
    baseUrl,
    coverage: comparisonCoverage(ga.destination, gb.destination),
  });
  return { pair, view };
}
