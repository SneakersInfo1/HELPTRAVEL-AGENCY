import { createHash } from "node:crypto";

import type { ContentDocument } from "./schema";

type EditorialDocument = Pick<
  ContentDocument,
  "title" | "description" | "lead" | "sections" | "factClaims" | "sources" | "ctaTarget" | "relatedContent" | "imageAsset"
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/** Hash obejmuje treść widoczną; korekta niewidocznego cytatu nie zmienia daty strony. */
export function computeContentHash(doc: EditorialDocument): string {
  const editorial = {
    title: doc.title,
    description: doc.description,
    lead: doc.lead,
    sections: doc.sections,
    factClaims: doc.factClaims.map(({ id, claim, value, sourceId }) => ({
      id,
      claim,
      value,
      sourceId,
    })),
    sources: doc.sources.map(({ id, url }) => ({ id, url })),
    ctaTarget: doc.ctaTarget,
    relatedContent: doc.relatedContent,
    imageAsset: doc.imageAsset,
  };

  return createHash("sha256").update(JSON.stringify(canonicalize(editorial)), "utf8").digest("hex");
}

