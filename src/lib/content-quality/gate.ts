// Anti-AI-Slop Quality Gate — deterministyczna bramka jakości treści.
//
// Nie istnieje detektor, który „mierzy AI". Ta bramka nie udaje, że to robi:
// sprawdza KONKRETNE, nazwane wady, z których każda ma regułę, dowód
// (zacytowany fragment) i test. Wynik to raport odrzucenia, nie „score".
//
// Werdykt:
//   PASS                  — automaty nie mają zastrzeżeń (to NIE jest zgoda na publikację
//                           treści DYNAMIC/HIGH_RISK — o tym decyduje polityka niżej);
//   NEEDS_REVISION        — wada redakcyjna do poprawy (wata, duplikat, zły link, daty);
//   BLOCKED_FACTS         — twierdzenie bez dowodu, przeterminowane albo liczba bez źródła;
//   REVIEW_REQUIRED       — treść dynamiczna lub wysokiego ryzyka: zawsze człowiek;
//   SKIPPED_QUALITY_GATE  — nie ma materiału wartego publikacji (cron nie musi nic wydać).

import {
  ContentDocumentSchema,
  POLICY_VERSION,
  documentText,
  isClaimFresh,
  type ContentDocument,
  type GateVerdict,
  type PublishDecision,
  type Section,
} from "@/lib/content-engine/schema";
import { countWords, shingleSimilarity } from "@/lib/seo-ops/html-audit";

export type FindingSeverity = "skip" | "block_facts" | "revise" | "review" | "info";

export interface GateFinding {
  rule: string;
  severity: FindingSeverity;
  message: string;
  /** Fragment tekstu, który uruchomił regułę. */
  evidence?: string;
  /** id sekcji albo nazwa pola. */
  location?: string;
}

export interface ExistingContent {
  canonicalUrl: string;
  title: string;
  h1?: string;
  lead?: string;
}

export interface GateContext {
  now: Date;
  /** Treści już istniejące w serwisie — do kontroli duplikatów i kanibalizacji. */
  existing: readonly ExistingContent[];
  /** Czy ścieżka jest istniejącą trasą serwisu (linki wewnętrzne i CTA). */
  isKnownRoute: (path: string) => boolean;
  /** Poprzednia wersja tego samego dokumentu — do kontroli dat. */
  previous?: Pick<ContentDocument, "contentHash" | "materiallyModifiedAt" | "publishedAt"> | null;
}

export interface GateReport {
  verdict: GateVerdict;
  findings: GateFinding[];
  metrics: {
    words: number;
    claims: number;
    verifiedClaims: number;
    sources: number;
    fillerHits: number;
    repeatedShingleRatio: number;
  };
  checkedAt: string;
  policyVersion: string;
}

// ── Słowniki ─────────────────────────────────────────────────────────────

/** Wata i frazy-wypełniacze typowe dla tekstów generowanych hurtowo. */
export const FILLER_PHRASES: readonly string[] = [
  "w dzisiejszych czasach",
  "nie da się ukryć",
  "warto zauważyć",
  "warto wspomnieć",
  "warto podkreślić",
  "nie sposób nie wspomnieć",
  "jak powszechnie wiadomo",
  "podsumowując",
  "reasumując",
  "bez wątpienia",
  "bez dwóch zdań",
  "prawdziwa perełka",
  "ukryta perełka",
  "raj na ziemi",
  "dla każdego coś miłego",
  "każdy znajdzie coś dla siebie",
  "niezapomniane wrażenia",
  "niezapomniane chwile",
  "niezapomniana przygoda",
  "malownicze uliczki",
  "tętniące życiem",
  "tętni życiem",
  "bogata oferta",
  "szeroka gama",
  "idealne miejsce dla",
  "idealny wybór dla",
  "niezależnie od tego, czy",
  "zanurz się w",
  "odkryj magię",
  "odkryj uroki",
  "poczuj klimat",
  "w tym artykule",
  "w niniejszym artykule",
  "mamy nadzieję, że",
  "nie czekaj",
  "zapraszamy do",
  "to miejsce, które",
  "zachwyci nawet najbardziej wymagających",
  "uczta dla zmysłów",
  "serce miasta bije",
  "połączenie tradycji z nowoczesnością",
  "wyjątkowa atmosfera",
  "magiczne miejsce",
];

/** Zmyślone doświadczenie autora — serwis nie ma reporterów w terenie. */
const FAKE_EXPERIENCE: readonly RegExp[] = [
  /\b(byłem|byłam|byliśmy|byłyśmy)\b/i,
  /\b(odwiedziłem|odwiedziłam|odwiedziliśmy|zwiedziłem|zwiedziłam|zwiedziliśmy)\b/i,
  /\b(sprawdziłem|sprawdziłam|sprawdziliśmy)\s+(osobiście|na miejscu)/i,
  /\b(testowałem|testowałam|testowaliśmy)\b/i,
  /podczas (mojej|naszej) (wizyty|podróży|wycieczki)/i,
  /z (własnego|naszego) doświadczenia/i,
  /(nasz|nasza) (redaktor|redaktorka|reporter|reporterka) (odwiedził|odwiedziła|sprawdził|sprawdziła)/i,
  /(mój|nasz) ulubiony (hotel|lokal|bar|plaż)/i,
  /\bpolecam z (czystym )?serca\b/i,
];

/** Fałszywa presja i obietnice dostępności — zakazane w PRODUCT.md. */
const FAKE_URGENCY: readonly RegExp[] = [
  /ostatni(e|a|ch)? (miejsc|pokoj|pokoi|sztuk|bilet)/i,
  /tylko (dziś|dzisiaj|teraz)/i,
  /oferta (kończy się|wygasa)/i,
  /zostało (już )?tylko \d+/i,
  /\b(gwarantujemy|gwarancja) (najniższ|najlepsz)/i,
  /najniższa cena (na rynku|w sieci|gwarantowana)/i,
  /\b(promocja|wyprzedaż|rabat|zniżka) (-|–)?\s?\d+ ?%/i,
  /rezerwuj (teraz|natychmiast), (zanim|bo)/i,
];

const HIGH_RISK_TOPIC = /\b(wiz[aąyęo]|wizow\w*|paszport\w*|dow[oó]d\w* osobist\w*|msz|szczepi\w*|covid|kwarantann\w*|ostrzeżeni\w* dla podróżujących|zamach\w*|stan wyjątkowy|ubezpieczeni\w* obowiązkow\w*)\b/i;

const PRICE_MENTION = /\d[\d\s.,]*\s?(zł|pln|eur|euro|€|usd|\$|gbp|£|dirham\w*|lir\w*)(?![\p{L}])/iu;

const UNSOURCED_SUPERLATIVE = /\b(najlepsz\w+|najpiękniejsz\w+|najtańsz\w+|najpopularniejsz\w+|numer(em)? 1|nr 1|bezkonkurencyjn\w+|gwarantowan\w+)\b/giu;

/** Liczba z jednostką, która jest twierdzeniem o świecie i wymaga pokrycia. */
const FACTUAL_NUMBER = /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s?(°c|°|stopni\w*|km|mm|m n\.p\.m\.|%|proc\.|godzin\w*|godz\.|h(?![\p{L}])|min(?:ut\w*)?(?![\p{L}])|zł|pln|eur|euro|€)/giu;

const YEAR = /(?<![\d.,])((?:19|20)\d{2})(?![\d.,]|\s?(zł|pln|eur|€|km|m\b))/g;

// ── Narzędzia ────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function sectionText(section: Section): string {
  return documentText({ title: "", description: "", lead: "", sections: [section] });
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) >= 5);
}

function excerpt(text: string, index: number, length = 80): string {
  const start = Math.max(0, index - 20);
  return text.slice(start, start + length).replace(/\s+/g, " ").trim();
}

function significantTokens(text: string): string[] {
  const stop = new Set(["czy", "albo", "lub", "oraz", "dla", "pod", "nad", "jak", "gdzie", "kiedy", "ile", "the", "vs", "na", "do", "we", "ze", "po", "od", "za", "to", "co", "się", "jest"]);
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

/** Rdzeń tokenu — bardzo zgrubna stemizacja dla polskiej fleksji. */
function stem(token: string): string {
  return token.length > 5 ? token.slice(0, Math.max(4, token.length - 3)) : token;
}

function repeatedShingleRatio(text: string, size = 5): number {
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length < size * 4) return 0;
  const seen = new Map<string, number>();
  for (let i = 0; i + size <= words.length; i += 1) {
    const key = words.slice(i, i + size).join(" ");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let repeated = 0;
  for (const count of seen.values()) if (count > 1) repeated += count - 1;
  return repeated / Math.max(1, words.length - size + 1);
}

// ── Bramka ───────────────────────────────────────────────────────────────

const MIN_WORDS: Readonly<Record<ContentDocument["contentType"], number>> = {
  article: 450,
  comparison_enrichment: 220,
  month_enrichment: 150,
  hub_enrichment: 180,
};

const PURCHASE_FLOW = /^\/(hotele\/rezerwacja|loty\/(pasazerowie|platnosc|dodatki|potwierdzenie)|api\/)/;

export function runQualityGate(input: unknown, ctx: GateContext): GateReport {
  const findings: GateFinding[] = [];
  const add = (finding: GateFinding) => findings.push(finding);
  const checkedAt = ctx.now.toISOString();
  const emptyMetrics = { words: 0, claims: 0, verifiedClaims: 0, sources: 0, fillerHits: 0, repeatedShingleRatio: 0 };

  const parsed = ContentDocumentSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 12)) {
      add({ rule: "schema_invalid", severity: "revise", message: issue.message, location: issue.path.join(".") });
    }
    return { verdict: "NEEDS_REVISION", findings, metrics: emptyMetrics, checkedAt, policyVersion: POLICY_VERSION };
  }
  const doc = parsed.data;
  const text = documentText(doc);
  const normalized = normalize(text);
  const words = countWords(text);
  const claimsById = new Map(doc.factClaims.map((claim) => [claim.id, claim]));
  const verifiedClaims = doc.factClaims.filter((claim) => claim.verification !== "unverified");

  // 1. Materiał. Bez zweryfikowanych twierdzeń i bez własnej wartości nie ma czego publikować.
  const hasDecisionValue = doc.sections.some((s) => s.kind === "table" || s.kind === "verdict");
  if (verifiedClaims.length === 0 || doc.sources.length === 0) {
    add({
      rule: "no_verified_material",
      severity: "skip",
      message: "Brak zweryfikowanych twierdzeń albo źródeł — nie ma materiału, który wnosi coś ponad to, co już jest w serwisie.",
    });
  } else if (verifiedClaims.length < 3 && !hasDecisionValue) {
    add({
      rule: "no_unique_value",
      severity: "skip",
      message: "Mniej niż 3 zweryfikowane twierdzenia i brak tabeli albo werdyktu — treść nie ma własnej wartości decyzyjnej.",
    });
  }

  // 2. Twierdzenia: weryfikacja i świeżość.
  for (const claim of doc.factClaims) {
    const used = doc.sections.some((s) => s.claimIds.includes(claim.id));
    if (claim.verification === "unverified" && used) {
      add({ rule: "claim_unverified", severity: "block_facts", message: `Twierdzenie użyte w tekście nie ma potwierdzenia w źródle: „${claim.claim}"`, location: claim.id });
    }
    if (claim.verification === "human_verified" && !claim.verifiedBy) {
      add({ rule: "claim_unverified", severity: "block_facts", message: "human_verified bez podpisu w verifiedBy", location: claim.id });
    }
    if (!isClaimFresh(claim, ctx.now)) {
      add({ rule: "claim_expired", severity: "block_facts", message: `Twierdzenie klasy ${claim.dataClass} po terminie ważności — wymaga ponownego sprawdzenia źródła`, location: claim.id });
    }
    if (new Date(claim.retrievedAt).getTime() > ctx.now.getTime() + 60_000) {
      add({ rule: "date_integrity", severity: "revise", message: "retrievedAt w przyszłości", location: claim.id });
    }
  }
  for (const source of doc.sources) {
    if (!source.url.startsWith("https://")) {
      add({ rule: "source_not_https", severity: "revise", message: "Źródło bez HTTPS", evidence: source.url, location: source.id });
    }
  }

  // 3. Liczby z jednostką muszą mieć pokrycie w twierdzeniu przypisanym do sekcji.
  for (const section of doc.sections) {
    const body = sectionText(section);
    const sectionClaims = section.claimIds.map((id) => claimsById.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
    const haystack = normalize(sectionClaims.map((c) => `${c.value} ${c.claim}`).join(" | "));
    for (const match of body.matchAll(FACTUAL_NUMBER)) {
      const number = match[1].replace(",", ".");
      const covered = haystack.includes(number) || haystack.includes(match[1]);
      if (!covered) {
        add({
          rule: "number_without_claim",
          severity: "block_facts",
          message: `Liczba „${match[0].trim()}" nie ma pokrycia w żadnym twierdzeniu przypisanym do sekcji`,
          evidence: excerpt(body, match.index ?? 0),
          location: section.id,
        });
      }
    }
  }
  for (const match of `${doc.title}\n${doc.description}\n${doc.lead}`.matchAll(FACTUAL_NUMBER)) {
    const number = match[1].replace(",", ".");
    const all = normalize(doc.factClaims.map((c) => `${c.value} ${c.claim}`).join(" | "));
    if (!all.includes(number) && !all.includes(match[1])) {
      add({ rule: "number_without_claim", severity: "block_facts", message: `Liczba „${match[0].trim()}" w tytule, opisie albo leadzie bez pokrycia`, location: "lead" });
    }
  }

  // 4. Ceny: zawsze dane dynamiczne.
  const price = PRICE_MENTION.exec(text);
  if (price) {
    const priceClaims = doc.factClaims.filter((c) => c.dataClass === "price" && c.verification !== "unverified");
    if (priceClaims.length === 0) {
      add({ rule: "price_without_source", severity: "block_facts", message: "Kwota w tekście bez zweryfikowanego twierdzenia klasy price", evidence: excerpt(text, price.index) });
    } else {
      add({ rule: "price_requires_review", severity: "review", message: "Tekst podaje ceny — dane dynamiczne, publikacja tylko po przeglądzie człowieka", evidence: excerpt(text, price.index) });
    }
  }

  // 5. Tematy wysokiego ryzyka.
  const risky = HIGH_RISK_TOPIC.exec(text);
  if (risky) {
    const covered = doc.factClaims.some((c) => c.dataClass === "entry_requirements" && c.verification !== "unverified");
    add(
      covered
        ? { rule: "high_risk_topic", severity: "review", message: "Dokumenty wjazdowe, zdrowie albo bezpieczeństwo — wymagane zatwierdzenie człowieka", evidence: excerpt(text, risky.index) }
        : { rule: "high_risk_without_source", severity: "block_facts", message: "Temat wysokiego ryzyka bez zweryfikowanego źródła urzędowego", evidence: excerpt(text, risky.index) },
    );
  }
  if (doc.riskClass !== "EVERGREEN") {
    add({ rule: "risk_class_requires_review", severity: "review", message: `Klasa ryzyka ${doc.riskClass} — publikacja wyłącznie po przeglądzie człowieka` });
  }

  // 6. Zmyślone doświadczenie i fałszywa presja.
  for (const pattern of FAKE_EXPERIENCE) {
    const hit = pattern.exec(text);
    if (hit) add({ rule: "fake_experience", severity: "revise", message: "Sformułowanie sugeruje osobistą wizytę albo test autora — serwis ich nie przeprowadza", evidence: excerpt(text, hit.index) });
  }
  for (const pattern of FAKE_URGENCY) {
    const hit = pattern.exec(text);
    if (hit) add({ rule: "fake_urgency", severity: "revise", message: "Presja albo obietnica dostępności/ceny bez pokrycia", evidence: excerpt(text, hit.index) });
  }

  // 7. Wata.
  const fillerHits: string[] = FILLER_PHRASES.filter((phrase) => normalized.includes(phrase));
  if (fillerHits.length >= 2 || (fillerHits.length === 1 && words < 400)) {
    add({ rule: "filler_phrases", severity: "revise", message: `Frazy-wypełniacze (${fillerHits.length}): ${fillerHits.slice(0, 6).join("; ")}`, evidence: fillerHits[0] });
  } else if (fillerHits.length === 1) {
    add({ rule: "filler_phrases", severity: "info", message: `Jedna fraza-wypełniacz: ${fillerHits[0]}`, evidence: fillerHits[0] });
  }

  // 8. Superlatywy bez pokrycia.
  const superlatives = [...text.matchAll(UNSOURCED_SUPERLATIVE)].map((m) => m[0].toLowerCase());
  if (superlatives.length > Math.max(2, Math.floor(words / 250))) {
    add({ rule: "superlatives", severity: "revise", message: `Za dużo superlatywów bez dowodu (${superlatives.length}): ${[...new Set(superlatives)].slice(0, 6).join(", ")}` });
  }

  // 9. Lata: przeszły jako bieżący albo przyszły bez źródła.
  const currentYear = ctx.now.getUTCFullYear();
  const claimText = doc.factClaims.map((c) => `${c.value} ${c.claim}`).join(" ");
  for (const match of text.matchAll(YEAR)) {
    const year = Number(match[1]);
    if (year > currentYear && !claimText.includes(match[1])) {
      add({ rule: "future_year_without_source", severity: "block_facts", message: `Rok ${year} bez twierdzenia ze źródłem`, evidence: excerpt(text, match.index ?? 0) });
    }
    if (year >= 2015 && year < currentYear && /(aktualn|najnowsz|w tym roku|obecnie|na dziś)/i.test(excerpt(text, Math.max(0, (match.index ?? 0) - 40), 120))) {
      add({ rule: "stale_year_as_current", severity: "revise", message: `Miniony rok ${year} opisany jako bieżący`, evidence: excerpt(text, match.index ?? 0) });
    }
  }

  // 10. Lead odpowiada na intencję.
  const intentTokens = [...new Set(significantTokens(doc.primaryQueryIntent).map(stem))];
  const leadStems = new Set(significantTokens(`${doc.title} ${doc.lead}`).map(stem));
  const matched = intentTokens.filter((token) => leadStems.has(token)).length;
  if (intentTokens.length > 0 && matched / intentTokens.length < 0.6) {
    add({ rule: "lead_misses_intent", severity: "revise", message: `Tytuł i lead pokrywają ${matched}/${intentTokens.length} słów intencji „${doc.primaryQueryIntent}"`, location: "lead" });
  }
  if (FILLER_PHRASES.some((phrase) => normalize(doc.lead).startsWith(phrase))) {
    add({ rule: "lead_starts_with_filler", severity: "revise", message: "Lead zaczyna się od frazy-wypełniacza zamiast od odpowiedzi", location: "lead" });
  }

  // 11. Duplikaty i kanibalizacja względem istniejących treści.
  const others = ctx.existing.filter((item) => item.canonicalUrl !== doc.canonicalUrl);
  const self = ctx.existing.find((item) => item.canonicalUrl === doc.canonicalUrl);
  for (const other of others) {
    const titleSimilarity = shingleSimilarity(normalize(doc.title), normalize(other.title), 2);
    if (normalize(other.title) === normalize(doc.title) || titleSimilarity >= 0.7) {
      add({ rule: "duplicate_title", severity: "revise", message: `Tytuł zbyt podobny do ${other.canonicalUrl}`, evidence: other.title });
      break;
    }
  }
  for (const other of others) {
    if (other.lead && shingleSimilarity(normalize(doc.lead), normalize(other.lead), 3) >= 0.45) {
      add({ rule: "duplicate_intro", severity: "revise", message: `Lead zbyt podobny do ${other.canonicalUrl}`, evidence: other.lead.slice(0, 80) });
      break;
    }
  }
  if (doc.contentType === "article" && self) {
    add({ rule: "url_collision", severity: "revise", message: `Adres ${doc.canonicalUrl} już istnieje — nowy artykuł nie może go nadpisać` });
  }
  if (doc.contentType !== "article" && !self && !ctx.isKnownRoute(doc.canonicalUrl)) {
    add({ rule: "enrichment_target_missing", severity: "revise", message: `Rozszerzenie wskazuje nieistniejący adres ${doc.canonicalUrl}` });
  }

  // 12. Powtórzenia wewnątrz dokumentu.
  const ratio = repeatedShingleRatio(text);
  if (ratio > 0.08) {
    add({ rule: "internal_repetition", severity: "revise", message: `Powtarzające się ciągi 5 słów: ${(ratio * 100).toFixed(1)}% (próg 8%)` });
  }
  const seenSentences = new Map<string, number>();
  for (const sentence of sentences(text)) {
    const key = normalize(sentence);
    seenSentences.set(key, (seenSentences.get(key) ?? 0) + 1);
  }
  const repeatedSentence = [...seenSentences.entries()].find(([, count]) => count > 1);
  if (repeatedSentence) {
    add({ rule: "repeated_sentence", severity: "revise", message: "To samo zdanie pada więcej niż raz", evidence: repeatedSentence[0].slice(0, 100) });
  }

  // 13. Linki wewnętrzne i CTA.
  if (!ctx.isKnownRoute(doc.ctaTarget)) {
    add({ rule: "cta_invalid", severity: "revise", message: `CTA prowadzi do nieistniejącej trasy ${doc.ctaTarget}`, location: "ctaTarget" });
  }
  if (PURCHASE_FLOW.test(doc.ctaTarget)) {
    add({ rule: "cta_invalid", severity: "revise", message: "CTA nie może prowadzić wprost do kroku zakupu ani API", location: "ctaTarget" });
  }
  for (const path of doc.relatedContent) {
    if (!ctx.isKnownRoute(path)) add({ rule: "related_link_invalid", severity: "revise", message: `Link wewnętrzny do nieistniejącej trasy ${path}`, location: "relatedContent" });
  }
  if (doc.contentType === "article" && doc.relatedContent.length < 3) {
    add({ rule: "internal_links_plan", severity: "revise", message: "Nowy artykuł wymaga co najmniej 3 trafnych linków wewnętrznych", location: "relatedContent" });
  }

  // 14. Sekcje z faktami muszą wskazywać twierdzenia.
  for (const section of doc.sections) {
    if ((section.kind === "table" || section.kind === "verdict") && section.claimIds.length === 0) {
      add({ rule: "section_without_claims", severity: "block_facts", message: "Tabela albo werdykt bez przypisanych twierdzeń — brak jawnej podstawy", location: section.id });
    }
  }

  // 15. Daty.
  if (new Date(doc.materiallyModifiedAt).getTime() < new Date(doc.createdAt).getTime()) {
    add({ rule: "date_integrity", severity: "revise", message: "materiallyModifiedAt wcześniejsze niż createdAt" });
  }
  for (const [field, value] of [["publishedAt", doc.publishedAt], ["verifiedAt", doc.verifiedAt], ["materiallyModifiedAt", doc.materiallyModifiedAt]] as const) {
    if (value && new Date(value).getTime() > ctx.now.getTime() + 60_000) {
      add({ rule: "date_integrity", severity: "revise", message: `${field} w przyszłości`, location: field });
    }
  }
  if (ctx.previous) {
    if (ctx.previous.contentHash === doc.contentHash && ctx.previous.materiallyModifiedAt !== doc.materiallyModifiedAt) {
      add({ rule: "date_modified_without_change", severity: "revise", message: "materiallyModifiedAt zmienione bez zmiany treści (ten sam contentHash)" });
    }
    if (ctx.previous.publishedAt && ctx.previous.publishedAt !== doc.publishedAt) {
      add({ rule: "published_date_changed", severity: "revise", message: "publishedAt jest datą pierwszej publikacji i nie może się zmieniać" });
    }
  }

  // 16. Obraz.
  if (doc.imageAsset.provider !== "none" && doc.imageAsset.alt.trim().length < 5) {
    add({ rule: "image_alt_missing", severity: "revise", message: "Obraz bez opisu alternatywnego", location: "imageAsset" });
  }

  // 17. Długość wynikająca z typu treści.
  if (words < MIN_WORDS[doc.contentType]) {
    add({ rule: "too_short_for_type", severity: "revise", message: `${words} słów — poniżej minimum ${MIN_WORDS[doc.contentType]} dla typu ${doc.contentType}` });
  }

  const has = (severity: FindingSeverity) => findings.some((finding) => finding.severity === severity);
  const verdict: GateVerdict = has("skip")
    ? "SKIPPED_QUALITY_GATE"
    : has("block_facts")
      ? "BLOCKED_FACTS"
      : has("revise")
        ? "NEEDS_REVISION"
        : has("review")
          ? "REVIEW_REQUIRED"
          : "PASS";

  return {
    verdict,
    findings,
    metrics: {
      words,
      claims: doc.factClaims.length,
      verifiedClaims: verifiedClaims.length,
      sources: doc.sources.length,
      fillerHits: fillerHits.length,
      repeatedShingleRatio: Math.round(ratio * 1000) / 1000,
    },
    checkedAt,
    policyVersion: POLICY_VERSION,
  };
}

// ── Polityka publikacji ──────────────────────────────────────────────────

export type PublishMode = "DRY_RUN" | "DRAFT_AND_PR" | "AUTO_EVERGREEN";

/**
 * Decyzja po bramce. `AUTO_EVERGREEN` to osobna, świadoma decyzja właściciela;
 * nawet wtedy automatycznie przechodzi wyłącznie PASS + EVERGREEN.
 */
export function publishDecision(report: GateReport, doc: Pick<ContentDocument, "riskClass">, mode: PublishMode): PublishDecision {
  switch (report.verdict) {
    case "SKIPPED_QUALITY_GATE":
      return "SKIPPED_QUALITY_GATE";
    case "BLOCKED_FACTS":
    case "NEEDS_REVISION":
      return "REJECTED";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED";
    case "PASS":
      return mode === "AUTO_EVERGREEN" && doc.riskClass === "EVERGREEN" ? "APPROVED_AUTOMATION" : "REVIEW_REQUIRED";
  }
}
