// Odczyt dokumentów treści po stronie stron serwisu.
//
// Strona dostaje WYŁĄCZNIE treść, którą wolno pokazać:
//  • status `approved` (zatwierdzona przez człowieka — merge PR-a);
//    `in_review` tylko z SEO_PREVIEW_DRAFTS=1 (podgląd lokalny, nigdy produkcja);
//  • sekcja znika, gdy którekolwiek z jej twierdzeń jest niezweryfikowane albo
//    po terminie ważności — wymuszone ponowne sprawdzenie zamiast nieświeżego faktu;
//  • dokument niezgodny ze schematem nie istnieje dla strony (i wywala `pnpm content:check`).
//
// Moduł jest czysty (bez sieci i bez systemu plików): dokumenty przychodzą
// statycznym importem z content/seo/index.generated.ts, więc trafiają do
// bundla serwera na Vercelu bez dodatkowej konfiguracji.

import { CONTENT_DOCUMENTS } from "../../../content/seo/index.generated";

import { ContentDocumentSchema, isClaimFresh, type ContentDocument, type FactClaim, type Section, type Source } from "./schema";

export interface RenderableContent {
  id: string;
  canonicalUrl: string;
  title: string;
  description: string;
  lead: string;
  sections: Section[];
  /** Źródła, na które powołują się POKAZANE sekcje — w kolejności dokumentu. */
  sources: Source[];
  /** Twierdzenia pokazanych sekcji — do przypisów. */
  claims: FactClaim[];
  relatedContent: string[];
  ctaTarget: string;
  /** Kiedy ostatnio sprawdzono źródła. */
  verifiedAt: string;
  /** Kiedy treść zmieniła się materialnie — to jest `dateModified` strony. */
  materiallyModifiedAt: string;
  createdAt: string;
  aiDisclosure: string;
  topicCluster: string;
  contentHash: string;
  /** Sekcje ukryte przez wygaśnięcie twierdzeń — do monitoringu, nie do UI. */
  hiddenSectionIds: string[];
}

function parseAll(raw: readonly unknown[]): ContentDocument[] {
  const documents: ContentDocument[] = [];
  for (const item of raw) {
    const parsed = ContentDocumentSchema.safeParse(item);
    if (parsed.success) documents.push(parsed.data);
  }
  return documents;
}

function isVisibleStatus(doc: ContentDocument, previewDrafts: boolean): boolean {
  return doc.reviewStatus === "approved" || (previewDrafts && doc.reviewStatus === "in_review");
}

/**
 * Typy dokumentów, które renderuje jakaś strona. `lastmod` w sitemapie i treść
 * na stronie biorą się WYŁĄCZNIE z tych typów — dokument innego typu (np. miesiąca,
 * dopóki strona miesiąca go nie pokazuje) nie może zmieniać daty strony, której
 * treść się nie zmieniła. Nowy renderer = nowy wpis tutaj.
 */
export const RENDERED_CONTENT_TYPES: ReadonlySet<ContentDocument["contentType"]> = new Set(["comparison_enrichment"]);

export function toRenderable(doc: ContentDocument, now: Date): RenderableContent | null {
  const claimsById = new Map(doc.factClaims.map((claim) => [claim.id, claim]));
  const usable = (id: string) => {
    const claim = claimsById.get(id);
    return Boolean(claim && claim.verification !== "unverified" && isClaimFresh(claim, now));
  };

  const sections: Section[] = [];
  const hiddenSectionIds: string[] = [];
  for (const section of doc.sections) {
    if (section.claimIds.every(usable)) sections.push(section);
    else hiddenSectionIds.push(section.id);
  }
  // Całość albo nic: lead, opis i dateModified opierają się na wszystkich sekcjach.
  // Gdy którekolwiek twierdzenie wygasło, strona wraca do szablonu do czasu
  // ponownej weryfikacji, zamiast pokazywać wstęp bez sekcji, które go uzasadniają.
  if (sections.length === 0 || hiddenSectionIds.length > 0) return null;

  const shownClaimIds = new Set(sections.flatMap((section) => section.claimIds));
  const claims = doc.factClaims.filter((claim) => shownClaimIds.has(claim.id));
  const shownSourceIds = new Set(claims.map((claim) => claim.sourceId));

  return {
    id: doc.id,
    canonicalUrl: doc.canonicalUrl,
    title: doc.title,
    description: doc.description,
    lead: doc.lead,
    sections,
    sources: doc.sources.filter((source) => shownSourceIds.has(source.id)),
    claims,
    relatedContent: doc.relatedContent,
    ctaTarget: doc.ctaTarget,
    verifiedAt: doc.verifiedAt,
    materiallyModifiedAt: doc.materiallyModifiedAt,
    createdAt: doc.createdAt,
    aiDisclosure: doc.aiDisclosure,
    topicCluster: doc.topicCluster,
    contentHash: doc.contentHash,
    hiddenSectionIds,
  };
}

export interface ContentLookupOptions {
  now?: Date;
  previewDrafts?: boolean;
  /** Wstrzykiwane w testach zamiast realnego indeksu. */
  documents?: readonly unknown[];
}

function resolveOptions(options: ContentLookupOptions) {
  return {
    now: options.now ?? new Date(),
    previewDrafts: options.previewDrafts ?? process.env.SEO_PREVIEW_DRAFTS === "1",
    documents: parseAll(options.documents ?? CONTENT_DOCUMENTS),
  };
}

/** Rozszerzenie redakcyjne dla istniejącego adresu albo null. */
export function getEnrichment(canonicalUrl: string, options: ContentLookupOptions = {}): RenderableContent | null {
  const { now, previewDrafts, documents } = resolveOptions(options);
  const doc = documents.find(
    (item) => item.canonicalUrl === canonicalUrl && RENDERED_CONTENT_TYPES.has(item.contentType) && isVisibleStatus(item, previewDrafts),
  );
  return doc ? toRenderable(doc, now) : null;
}

/** Daty zmian treści per adres — realne `lastmod` dla sitemapy. */
export function contentLastModified(options: ContentLookupOptions = {}): Map<string, string> {
  const { now, previewDrafts, documents } = resolveOptions(options);
  const result = new Map<string, string>();
  for (const doc of documents) {
    if (!isVisibleStatus(doc, previewDrafts) || !RENDERED_CONTENT_TYPES.has(doc.contentType)) continue;
    if (!toRenderable(doc, now)) continue;
    result.set(doc.canonicalUrl, doc.materiallyModifiedAt);
  }
  return result;
}
