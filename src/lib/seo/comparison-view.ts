// Model widoku strony /porownanie/[para] — wszystko, co szablon pokazuje,
// policzone w jednym miejscu i bez JSX, żeby dało się to przetestować dla
// wszystkich par naraz.
//
// Dwa źródła treści:
//  • model liczbowy (comparison-model.ts) — tabela, FAQ i normy WMO;
//    liczby wyłącznie z bramki faktów;
//  • rozszerzenie redakcyjne (content/seo) — werdykt, sekcje i tabela faktów
//    z twierdzeniami sprawdzonymi w źródłach. Gdy go nie ma, strona nie udaje,
//    że je ma: werdykt powstaje tylko z ocen kuratorowanych albo wcale.

import type { RenderableContent } from "@/lib/content-engine/site-content";
import type { Section, Source } from "@/lib/content-engine/schema";
import type { ComparisonPair } from "@/lib/mvp/comparisons";

import type { ComparisonModel } from "./comparison-model";

export interface ComparisonVerdictOption {
  label: string;
  chooseIf: string[];
  skipIf: string[];
}

export interface ComparisonLink {
  href: string;
  label: string;
}

export interface ComparisonView {
  slug: string;
  nameA: string;
  nameB: string;
  /** Tytuł bez sufiksu marki — mieści się w wyniku wyszukiwania. */
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Jedno zdanie pod nagłówkiem: czego dotyczy porównanie; null, gdy tylko powtarzałoby nagłówek. */
  standfirst: string | null;
  /** Bezpośrednia odpowiedź na „X czy Y". */
  answer: string;
  verdict: { heading: string; options: ComparisonVerdictOption[]; basis: string } | null;
  /** Sekcje redakcyjne bez werdyktu, w kolejności dokumentu. */
  editorial: Array<Exclude<Section, { kind: "verdict" }>>;
  sources: Source[];
  /** Data ostatniego sprawdzenia źródeł (ISO) — tylko gdy jest rozszerzenie. */
  verifiedAt: string | null;
  modifiedAt: string | null;
  aiDisclosure: string | null;
  /** Kontekst pomiaru GA4 — tylko gdy strona ma dokument treści. */
  content: { id: string; version: string; topicCluster: string } | null;
  relatedComparisons: ComparisonLink[];
  breadcrumbs: Array<{ label: string; href?: string }>;
  structuredData: Record<string, unknown>;
}

export interface ComparisonViewInput {
  pair: ComparisonPair;
  model: ComparisonModel;
  enrichment: RenderableContent | null;
  /** Wszystkie pary z etykietami — do linków powiązanych. */
  allPairs: ReadonlyArray<{ slug: string; a: string; b: string; label: string }>;
  baseUrl: string;
  coverage: { climate: boolean };
}

const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

function sentence(text: string): string {
  const trimmed = text.trim().replace(/\.+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

/** Pierwszy wariant, który mieści się w limicie; warianty są ułożone od najpełniejszego. */
function firstFitting(candidates: string[], limit: number): string {
  return candidates.find((candidate) => candidate.length <= limit) ?? candidates[candidates.length - 1];
}

/** Opis pary bez nazw kierunków na początku („Lizbona czy Rzym na city break" → „Na city break"). */
function intentWithoutNames(intent: string, nameA: string, nameB: string): string {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = `(?:${escape(nameA)}|${escape(nameB)})`;
  const rest = intent.replace(new RegExp(String.raw`^\s*${names}\s+czy\s+${names}\s*(?:[—–-]\s*)?`, "i"), "").trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}

/** Tytuł i opis dla pary bez rozszerzenia: obiecują tylko sekcje, które strona pokaże. */
export function defaultComparisonMeta(nameA: string, nameB: string, intent: string, coverage: { climate: boolean }) {
  const question = `${nameA} czy ${nameB}?`;
  const topics = coverage.climate ? "pogoda, plaże, dolot" : "plaże, zwiedzanie, dolot";
  const details = [coverage.climate ? "temperatury" : null, "dolot z Polski"]
    .filter((item): item is string => item !== null)
    .join(", ")
    .replace(/, ([^,]*)$/, " i $1");
  const compare = `Porównujemy ${details} oraz profil obu kierunków.`;
  const context = sentence(intentWithoutNames(intent, nameA, nameB));
  return {
    title: firstFitting([`${question} Porównanie: ${topics}`, `${question} Porównanie kierunków`, question], TITLE_LIMIT),
    description: firstFitting(
      [
        `${question} ${context} ${compare} Sprawdź, co wybrać.`,
        `${question} ${context} ${compare}`,
        `${question} ${compare} Sprawdź, co wybrać.`,
        `${question} ${compare}`,
      ].map((text) => text.replace(/\s+/g, " ").trim()),
      DESCRIPTION_LIMIT,
    ),
  };
}

/**
 * Zdanie pod nagłówkiem. Nazwy kierunków z początku opisu pary znikają, bo
 * stoją już w nagłówku; gdy strona ma rozszerzenie redakcyjne, pod nagłówkiem
 * jest od razu odpowiedź, więc dodatkowe zdanie byłoby powtórzeniem.
 */
function standfirstFor(intent: string, nameA: string, nameB: string, hasEnrichment: boolean): string | null {
  if (hasEnrichment) return null;
  return sentence(intentWithoutNames(intent, nameA, nameB)) || null;
}

function relatedComparisons(pair: ComparisonPair, allPairs: ComparisonViewInput["allPairs"], limit = 8): ComparisonLink[] {
  const others = allPairs.filter((item) => item.slug !== pair.slug);
  const shared = others.filter((item) => item.a === pair.a || item.b === pair.a || item.a === pair.b || item.b === pair.b);
  const rest = others.filter((item) => !shared.includes(item));
  // Najpierw pary z tym samym kierunkiem (realnie pokrewna decyzja), dopiero potem reszta.
  return [...shared, ...rest].slice(0, limit).map((item) => ({ href: `/porownanie/${item.slug}`, label: item.label }));
}

/** Tag profilu („napiętego budżetu") jako pełne zdanie po „wybierz, jeśli". */
const AUDIENCE_CLAUSES: Readonly<Record<string, string>> = {
  "napiętego budżetu": "masz napięty budżet",
  "krótkiego wypadu (bliski lot)": "planujesz krótki wypad i zależy Ci na bliskim locie",
  "uniwersalnego wyjazdu na 3-5 dni": "planujesz uniwersalny wyjazd na 3–5 dni",
};

export function audienceClause(tag: string): string {
  return AUDIENCE_CLAUSES[tag] ?? `szukasz ${tag}`;
}

function verdictFromModel(model: ComparisonModel): ComparisonView["verdict"] {
  const [audienceA, audienceB] = model.audience;
  if (audienceA.length === 0 || audienceB.length === 0) return null;
  return {
    heading: `Dla kogo ${model.a.name}, a dla kogo ${model.b.name}`,
    options: [
      { label: model.a.name, chooseIf: audienceA.map(audienceClause), skipIf: [] },
      { label: model.b.name, chooseIf: audienceB.map(audienceClause), skipIf: [] },
    ],
    basis: "Wskazania wynikają z ocen profilu kierunku w danych redakcyjnych HelpTravel (skala 0–100). To ocena, nie pomiar.",
  };
}

export function buildComparisonView(input: ComparisonViewInput): ComparisonView {
  const { pair, model, enrichment, baseUrl, coverage } = input;
  const nameA = model.a.name;
  const nameB = model.b.name;
  const fallbackMeta = defaultComparisonMeta(nameA, nameB, pair.intent, coverage);
  const pageUrl = `${baseUrl}/porownanie/${pair.slug}`;

  const verdictSection = enrichment?.sections.find((section): section is Extract<Section, { kind: "verdict" }> => section.kind === "verdict");
  const verdict: ComparisonView["verdict"] = verdictSection
    ? {
        heading: verdictSection.heading,
        options: verdictSection.options.map((option) => ({ label: option.label, chooseIf: option.chooseIf, skipIf: option.skipIf })),
        basis: verdictSection.basis,
      }
    : verdictFromModel(model);

  const editorial = (enrichment?.sections ?? []).filter(
    (section): section is Exclude<Section, { kind: "verdict" }> => section.kind !== "verdict",
  );

  const baseGraph = (model.structuredData["@graph"] as Array<Record<string, unknown>>).map((node) => {
    if (node["@type"] === "Article") {
      const modelCitations = Array.isArray(node.citation)
        ? node.citation.filter((value): value is string => typeof value === "string")
        : typeof node.citation === "string"
          ? [node.citation]
          : [];
      const citations = [...new Set([...modelCitations, ...(enrichment?.sources.map((source) => source.url) ?? [])])];
      return {
        ...node,
        headline: enrichment?.title ?? `${nameA} czy ${nameB}? Porównanie kierunków`,
        description: enrichment?.description ?? fallbackMeta.description,
        // Data tylko wtedy, gdy ma źródło prawdy: materialna zmiana treści redakcyjnej.
        ...(enrichment ? { dateModified: enrichment.materiallyModifiedAt } : {}),
        ...(citations.length > 0 ? { citation: citations } : {}),
      };
    }
    if (node["@type"] === "BreadcrumbList") {
      return {
        ...node,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Porównania", item: `${baseUrl}/porownanie` },
          { "@type": "ListItem", position: 3, name: `${nameA} czy ${nameB}`, item: pageUrl },
        ],
      };
    }
    return node;
  });

  return {
    slug: pair.slug,
    nameA,
    nameB,
    metaTitle: enrichment?.title ?? pair.metaTitle ?? fallbackMeta.title,
    metaDescription: enrichment?.description ?? fallbackMeta.description,
    h1: `${nameA} czy ${nameB}?`,
    standfirst: standfirstFor(pair.intent, nameA, nameB, Boolean(enrichment)),
    answer: enrichment?.lead ?? model.quickAnswer,
    verdict,
    editorial,
    sources: enrichment?.sources ?? [],
    verifiedAt: enrichment?.verifiedAt ?? null,
    modifiedAt: enrichment?.materiallyModifiedAt ?? null,
    aiDisclosure: enrichment?.aiDisclosure ?? null,
    content: enrichment ? { id: enrichment.id, version: enrichment.contentHash.slice(0, 8), topicCluster: enrichment.topicCluster } : null,
    relatedComparisons: relatedComparisons(pair, input.allPairs),
    breadcrumbs: [{ label: "Start", href: "/" }, { label: "Porównania", href: "/porownanie" }, { label: `${nameA} czy ${nameB}` }],
    structuredData: { ...model.structuredData, "@graph": baseGraph },
  };
}
