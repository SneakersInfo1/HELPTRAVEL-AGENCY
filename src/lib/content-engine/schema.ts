// Kontrakt danych silnika treści HelpTravel (evidence-first).
//
// Treści żyją w repo jako pliki JSON w `content/seo/**` — serwis nie ma CMS-a
// ani bazy treści (DATABASE_URL jest zaślepką), a strony są generowane kodem
// z modułów TS. Plik w gicie daje historię, review w PR i rollback jednym
// revertem, bez nowej infrastruktury.
//
// Każde twierdzenie o świecie (liczba, nazwa, fakt) jest osobnym `FactClaim`
// z adresem źródła, zacytowanym fragmentem i datą pobrania. Tekst sekcji
// odwołuje się do twierdzeń po `claimIds`. Model językowy NIE zatwierdza
// własnych faktów — robi to weryfikator mechaniczny (verify.ts) i człowiek.

import { z } from "zod";

export const POLICY_VERSION = "2026-11-13.1";

// ── Klasy ryzyka i statusy ───────────────────────────────────────────────

/** EVERGREEN — rzadko się zmienia; DYNAMIC — ma termin ważności; HIGH_RISK — zawsze człowiek. */
export const RiskClassSchema = z.enum(["EVERGREEN", "DYNAMIC", "HIGH_RISK"]);
export type RiskClass = z.infer<typeof RiskClassSchema>;

/** Wynik bramki jakości (automaty). */
export const GateVerdictSchema = z.enum(["PASS", "NEEDS_REVISION", "BLOCKED_FACTS", "REVIEW_REQUIRED", "SKIPPED_QUALITY_GATE"]);
export type GateVerdict = z.infer<typeof GateVerdictSchema>;

/** Decyzja publikacyjna po bramce i polityce. */
export const PublishDecisionSchema = z.enum(["APPROVED_AUTOMATION", "REVIEW_REQUIRED", "REJECTED", "SKIPPED_QUALITY_GATE"]);
export type PublishDecision = z.infer<typeof PublishDecisionSchema>;

/**
 * Stan dokumentu w repo.
 *  draft      — robocza wersja z pipeline'u, nie renderowana nigdzie;
 *  in_review  — w PR do przeglądu, renderowana tylko z SEO_PREVIEW_DRAFTS=1;
 *  approved   — zatwierdzona przez człowieka (merge PR-a), renderowana;
 *  rejected   — odrzucona, zostaje w historii jako dowód decyzji.
 */
export const ReviewStatusSchema = z.enum(["draft", "in_review", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ContentTypeSchema = z.enum([
  "comparison_enrichment", // rozszerzenie istniejącego /porownanie/[para]
  "month_enrichment", // rozszerzenie istniejącego /kierunki/[slug]/[miesiac]
  "hub_enrichment", // rozszerzenie istniejącego /wyjazdy/[typ]
  "article", // nowy tekst pod /inspiracje/[slug]
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

// ── Klasy danych i świeżość ──────────────────────────────────────────────

export const DataClassSchema = z.enum([
  "geography", // położenie, odległości, charakter miejsca
  "attraction", // istnienie i charakter atrakcji, plaż, dzielnic
  "transport", // lotnisko, połączenia lokalne, czasy dojazdu
  "climate_normal", // średnia wieloletnia (NIE prognoza)
  "opening_hours", // godziny, sezonowość działania
  "price", // ceny, opłaty, bilety
  "entry_requirements", // wizy, dokumenty, zdrowie, bezpieczeństwo, komunikaty MSZ
  "own_inventory", // dane własne HelpTravel (np. liczba hoteli w bazie) z datą
]);
export type DataClass = z.infer<typeof DataClassSchema>;

/** Ile dni twierdzenie danej klasy jest ważne od `retrievedAt`. */
export const FRESHNESS_TTL_DAYS: Readonly<Record<DataClass, number>> = {
  geography: 1825,
  attraction: 365,
  transport: 180,
  climate_normal: 1825,
  opening_hours: 90,
  price: 2,
  entry_requirements: 30,
  own_inventory: 7,
};

/** Minimalna klasa ryzyka wynikająca z klasy danych — dokument nie może jej zaniżyć. */
export const DATA_CLASS_RISK: Readonly<Record<DataClass, RiskClass>> = {
  geography: "EVERGREEN",
  attraction: "EVERGREEN",
  transport: "DYNAMIC",
  climate_normal: "EVERGREEN",
  opening_hours: "DYNAMIC",
  price: "DYNAMIC",
  entry_requirements: "HIGH_RISK",
  own_inventory: "DYNAMIC",
};

const RISK_ORDER: Readonly<Record<RiskClass, number>> = { EVERGREEN: 0, DYNAMIC: 1, HIGH_RISK: 2 };

export function maxRisk(...classes: RiskClass[]): RiskClass {
  return classes.reduce<RiskClass>((acc, value) => (RISK_ORDER[value] > RISK_ORDER[acc] ? value : acc), "EVERGREEN");
}

// ── Źródła i twierdzenia ─────────────────────────────────────────────────

const IsoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, "oczekiwany czas UTC w ISO 8601");
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug tylko ASCII, małe litery i myślniki");

export const SourceKindSchema = z.enum([
  "official_tourism", // biuro turystyki miasta/regionu/kraju
  "airport_or_carrier",
  "public_transport_operator",
  "government", // w tym MSZ
  "climate_dataset",
  "heritage_or_museum", // UNESCO, muzea, zarządcy obiektów
  "own_data",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceSchema = z.object({
  id: Slug,
  url: z.string().url(),
  title: z.string().min(3),
  publisher: z.string().min(2),
  kind: SourceKindSchema,
  /** Licencja albo podstawa użycia („fakt, cytat w granicach prawa cytatu", „CC BY 4.0", „dane własne"). */
  licence: z.string().min(3),
  retrievedAt: IsoDateTime,
});
export type Source = z.infer<typeof SourceSchema>;

export const FactClaimSchema = z.object({
  id: Slug,
  /** Twierdzenie po polsku, tak jak może paść w tekście. */
  claim: z.string().min(8),
  /** Wartość do kontroli mechanicznej (liczba z jednostką, nazwa własna). Pusta dla opisowych. */
  value: z.string().default(""),
  dataClass: DataClassSchema,
  riskClass: RiskClassSchema,
  sourceId: Slug,
  /** Dosłowny fragment źródła, który potwierdza twierdzenie (krótki cytat w języku źródła). */
  observedEvidence: z.string().min(8).max(400),
  retrievedAt: IsoDateTime,
  /** Koniec ważności; liczony z FRESHNESS_TTL_DAYS, gdy nie podano. */
  expiresAt: IsoDateTime.optional(),
  /**
   * source_verified — weryfikator znalazł `observedEvidence` w pobranej treści źródła;
   * human_verified  — potwierdził człowiek (z podpisem w `verifiedBy`);
   * unverified      — nikt nie potwierdził; takie twierdzenie NIE może być w tekście.
   */
  verification: z.enum(["source_verified", "human_verified", "unverified"]),
  verifiedBy: z.string().optional(),
});
export type FactClaim = z.infer<typeof FactClaimSchema>;

// ── Sekcje ───────────────────────────────────────────────────────────────

const SectionBase = { id: Slug, heading: z.string().min(3).max(90), claimIds: z.array(Slug).default([]) };

export const SectionSchema = z.discriminatedUnion("kind", [
  z.object({ ...SectionBase, kind: z.literal("prose"), paragraphs: z.array(z.string().min(40)).min(1) }),
  z.object({ ...SectionBase, kind: z.literal("list"), intro: z.string().optional(), items: z.array(z.string().min(8)).min(2) }),
  z.object({
    ...SectionBase,
    kind: z.literal("table"),
    intro: z.string().optional(),
    columns: z.array(z.string().min(1)).min(2).max(4),
    rows: z.array(z.object({ label: z.string().min(2), cells: z.array(z.string().min(1)).min(1).max(3) })).min(2),
    note: z.string().optional(),
  }),
  z.object({
    ...SectionBase,
    kind: z.literal("verdict"),
    /** „Wybierz X, jeśli…" — po jednej pozycji na opcję. */
    options: z.array(z.object({ label: z.string().min(2), chooseIf: z.array(z.string().min(8)).min(1), skipIf: z.array(z.string().min(8)).default([]) })).min(2).max(3),
    /** Jawna podstawa rekomendacji: z czego wynika werdykt. */
    basis: z.string().min(20),
  }),
  z.object({ ...SectionBase, kind: z.literal("faq"), items: z.array(z.object({ question: z.string().min(8), answer: z.string().min(20) })).min(1) }),
]);
export type Section = z.infer<typeof SectionSchema>;

// ── Dokument ─────────────────────────────────────────────────────────────

export const ImageAssetSchema = z.object({
  /** Skąd pochodzi obraz: istniejąca integracja (Pexels przez resolveDestinationMedia) albo plik w repo. */
  provider: z.enum(["pexels_integration", "repo_asset", "none"]),
  licence: z.string().min(3),
  alt: z.string().default(""),
  credit: z.string().default(""),
});

export const ContentDocumentSchema = z
  .object({
    id: Slug,
    /** Ścieżka kanoniczna zaczynająca się od „/" — bez hosta. */
    canonicalUrl: z.string().regex(/^\/[a-z0-9\-/]*$/, "ścieżka ASCII zaczynająca się od /"),
    primaryQueryIntent: z.string().min(3),
    contentType: ContentTypeSchema,
    topicCluster: z.string().min(2),
    locale: z.literal("pl-PL"),
    title: z.string().min(10).max(70),
    description: z.string().min(50).max(170),
    /** Lead odpowiadający na intencję w pierwszych dwóch zdaniach. */
    lead: z.string().min(60).max(600),
    sections: z.array(SectionSchema).min(1),
    factClaims: z.array(FactClaimSchema),
    sources: z.array(SourceSchema),
    imageAsset: ImageAssetSchema,
    /** Ścieżki wewnętrzne powiązanych treści (prawdziwe linki HTML). */
    relatedContent: z.array(z.string().regex(/^\//)).default([]),
    /** Ścieżka docelowa CTA w produkcie (istniejąca trasa). */
    ctaTarget: z.string().regex(/^\//),
    riskClass: RiskClassSchema,
    /** sha256 treści redakcyjnej (bez pól stanu) — wykrywanie materialnej zmiany. */
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: IsoDateTime,
    /** Data faktycznej publikacji; null dopóki treść nie jest w `main`. */
    publishedAt: IsoDateTime.nullable(),
    /** Zmienia się TYLKO przy materialnej zmianie treści (inny contentHash). */
    materiallyModifiedAt: IsoDateTime,
    /** Kiedy ostatnio sprawdzono źródła wszystkich twierdzeń. */
    verifiedAt: IsoDateTime,
    owner: z.string().min(2),
    reviewStatus: ReviewStatusSchema,
    /** Kto zatwierdził (człowiek). Wymagane przy `approved`. */
    reviewedBy: z.string().optional(),
    generationRunId: z.string().min(3),
    /** Jawna informacja o udziale AI — pokazywana na stronie. */
    aiDisclosure: z.string().min(10),
    policyVersion: z.string().min(3),
  })
  .superRefine((doc, ctx) => {
    const sourceIds = new Set(doc.sources.map((s) => s.id));
    const claimIds = new Set(doc.factClaims.map((c) => c.id));
    if (sourceIds.size !== doc.sources.length) ctx.addIssue({ code: "custom", message: "zdublowane id źródła" });
    if (claimIds.size !== doc.factClaims.length) ctx.addIssue({ code: "custom", message: "zdublowane id twierdzenia" });
    for (const claim of doc.factClaims) {
      if (!sourceIds.has(claim.sourceId)) {
        ctx.addIssue({ code: "custom", message: `twierdzenie ${claim.id} wskazuje nieistniejące źródło ${claim.sourceId}` });
      }
      if (RISK_ORDER[claim.riskClass] < RISK_ORDER[DATA_CLASS_RISK[claim.dataClass]]) {
        ctx.addIssue({ code: "custom", message: `twierdzenie ${claim.id}: klasa ryzyka zaniżona dla danych ${claim.dataClass}` });
      }
    }
    for (const section of doc.sections) {
      for (const id of section.claimIds) {
        if (!claimIds.has(id)) ctx.addIssue({ code: "custom", message: `sekcja ${section.id} wskazuje nieistniejące twierdzenie ${id}` });
      }
    }
    const required = maxRisk(...doc.factClaims.map((c) => c.riskClass));
    if (RISK_ORDER[doc.riskClass] < RISK_ORDER[required]) {
      ctx.addIssue({ code: "custom", message: `klasa ryzyka dokumentu (${doc.riskClass}) niższa niż jego twierdzeń (${required})` });
    }
    if (doc.reviewStatus === "approved" && !doc.reviewedBy) {
      ctx.addIssue({ code: "custom", message: "status approved wymaga pola reviewedBy" });
    }
  });
export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

// ── Pomocnicze ───────────────────────────────────────────────────────────

export function claimExpiresAt(claim: Pick<FactClaim, "retrievedAt" | "expiresAt" | "dataClass">): Date {
  if (claim.expiresAt) return new Date(claim.expiresAt);
  const retrieved = new Date(claim.retrievedAt);
  return new Date(retrieved.getTime() + FRESHNESS_TTL_DAYS[claim.dataClass] * 86_400_000);
}

export function isClaimFresh(claim: Pick<FactClaim, "retrievedAt" | "expiresAt" | "dataClass">, now: Date): boolean {
  return claimExpiresAt(claim).getTime() > now.getTime();
}

/** Cała treść tekstowa dokumentu — do kontroli jakości i hasha. */
export function documentText(doc: Pick<ContentDocument, "title" | "description" | "lead" | "sections">): string {
  const parts: string[] = [doc.title, doc.description, doc.lead];
  for (const section of doc.sections) {
    parts.push(section.heading);
    switch (section.kind) {
      case "prose":
        parts.push(...section.paragraphs);
        break;
      case "list":
        if (section.intro) parts.push(section.intro);
        parts.push(...section.items);
        break;
      case "table":
        if (section.intro) parts.push(section.intro);
        parts.push(...section.columns);
        for (const row of section.rows) parts.push(row.label, ...row.cells);
        if (section.note) parts.push(section.note);
        break;
      case "verdict":
        for (const option of section.options) parts.push(option.label, ...option.chooseIf, ...option.skipIf);
        parts.push(section.basis);
        break;
      case "faq":
        for (const item of section.items) parts.push(item.question, item.answer);
        break;
    }
  }
  return parts.join("\n");
}
