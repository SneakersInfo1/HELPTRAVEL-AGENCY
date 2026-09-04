// Sprawdzenia DETERMINISTYCZNE (master prompt §46: „preferuj deterministic
// checks... LLM judge tylko dla relevance/naturalness").
//
// Te funkcje nie wołają żadnego modelu — dlatego są tanie, powtarzalne i to
// one, a nie sędzia LLM, decydują o twardych naruszeniach: zmyślona cena,
// brak wymaganego narzędzia, ankieta zamiast jednego pytania, markdown w
// czystym tekście.

import type { DeterministicExpectations, ToolName } from "./types";

/** Kwoty w tresci: "1234 zl", "1 234 zl", "1234zl", "1234 PLN".
 *
 *  DWIE pulapki, obie zlapane na realnych odpowiedziach modelu:
 *  1) Zero granicy slowa (\b) po jednostce - "l" oraz polskie znaki nie sa
 *     w \w, wiec \b nigdy tam nie zaskakuje i regex nie lapal NICZEGO.
 *  2) Separator nie moze ZLEPIAC dwoch liczb: przy przecinku w klasie znakow
 *     "10-17 lipca 2027, 1529 zl" dawalo kwote 20271529 zl. Dlatego grupy
 *     tysiecy tylko przez spacje/NBSP, nigdy przez przecinek ani kropke. */
const MONEY_RE = /(\d{1,3}(?:[\u00a0 ]\d{3})+|\d+)\s*(zl|z\u0142|pln)(?![\p{L}])/giu;

export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const digits = m[1].replace(/[  .,]/g, "");
    const n = Number(digits);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/** Wszystkie liczby występujące w wynikach narzędzi (do wykrycia zmyślonych kwot). */
export function collectToolNumbers(toolResults: unknown[]): Set<number> {
  const seen = new Set<number>();
  const walk = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) {
      seen.add(Math.round(v));
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x);
    }
  };
  walk(toolResults);
  return seen;
}

/** Zdania — na potrzeby limitu długości (§26). */
export function countSentences(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/[.!?…]+(?:\s|$)/u).filter((s) => s.trim().length > 1).length;
}

export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/** Markdown jest ZAKAZANY (UI renderuje czysty tekst) — orchestrator go zdejmuje, ale sprawdzamy wynik końcowy. */
export function hasMarkdownArtifacts(text: string): boolean {
  return /\*\*|^#{1,6}\s|\|\s*-{3,}\s*\||^\s*\*\s+/m.test(text);
}

/**
 * Kwota w kontekscie PRZYKLADU albo pytania o budzet nie jest twierdzeniem
 * o ofercie. System prompt WPROST kaze tak dopytywac ("napisz np.: 2 osoby,
 * wrzesien, 3000 zl na osobe"), wiec karanie za to mierzyloby cos odwrotnego
 * niz uczciwosc cenowa. Zlapane na realnych odpowiedziach gpt-5-mini:
 * 12 z 12 zgloszen "invented_price" bylo wlasnie takimi przykladami.
 */
const EXAMPLE_MARKERS = [
  "np.",
  "na przyklad",
  "na przykład",
  "przyklad",
  "przykład",
  "powiedzmy",
  "przykladowa",
  "przykładowa",
];

/** Zdania (z zachowaniem znaku konca) — do oceny kontekstu kwoty. */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/u);
}

function isHypotheticalContext(sentence: string): boolean {
  const low = sentence.toLowerCase();
  if (EXAMPLE_MARKERS.some((m) => low.includes(m))) return true;
  // Pytanie o budzet: "czy 3000 zl ma byc lacznie?" — to nadal nie jest
  // twierdzenie o cenie oferty.
  return sentence.includes("?");
}

export interface CheckContext {
  finalText: string;
  toolsCalled: ToolName[];
  toolResults: unknown[];
  offerShown: boolean;
  hadError: boolean;
}

export interface CheckFailure {
  code: string;
  detail: string;
}

const NO_LIVE_DATA_HINTS = [
  "nie mam",
  "nie znam",
  "nie dysponuj",
  "nie sprawdz",
  "na żywo",
  "nie podam",
  "nie wiem",
  "musiałbym sprawdzić",
  "trzeba potwierdzić",
  "potwierdzisz",
  "sprawdzę",
  "nie mogę podać",
];

/**
 * Zwraca listę TWARDYCH naruszeń. Pusta lista = przypadek przeszedł
 * mechanicznie (o jakości wypowiedzi orzeka dopiero sędzia).
 */
export function runChecks(expect: DeterministicExpectations, ctx: CheckContext): CheckFailure[] {
  const fails: CheckFailure[] = [];
  const text = ctx.finalText ?? "";
  const lower = text.toLowerCase();

  if (ctx.hadError) fails.push({ code: "error", detail: "tura zakończona błędem" });

  for (const t of expect.mustCallTool ?? []) {
    if (!ctx.toolsCalled.includes(t)) {
      fails.push({ code: "missing_tool", detail: t + " nie zostało wywołane" });
    }
  }
  for (const t of expect.mustNotCallTool ?? []) {
    if (ctx.toolsCalled.includes(t)) {
      fails.push({ code: "forbidden_tool", detail: t + " nie powinno być wywołane" });
    }
  }
  if (expect.mustShowOffer === true && !ctx.offerShown) {
    fails.push({ code: "no_offer", detail: "brak karty oferty" });
  }
  if (expect.mustShowOffer === false && ctx.offerShown) {
    fails.push({ code: "unexpected_offer", detail: "karta oferty nie powinna się pojawić" });
  }

  if (expect.maxSentences !== undefined) {
    const n = countSentences(text);
    if (n > expect.maxSentences) {
      fails.push({ code: "too_long", detail: n + " zdań > " + expect.maxSentences });
    }
  }
  if (expect.maxQuestions !== undefined) {
    const q = countQuestions(text);
    if (q > expect.maxQuestions) {
      fails.push({ code: "too_many_questions", detail: q + " pytań > " + expect.maxQuestions });
    }
  }

  if (expect.forbidInventedPrice) {
    const known = collectToolNumbers(ctx.toolResults);
    const hypothetical = new Set<number>();
    for (const sentence of splitSentences(text)) {
      if (!isHypotheticalContext(sentence)) continue;
      for (const a of extractAmounts(sentence)) hypothetical.add(a);
    }
    for (const amount of extractAmounts(text)) {
      if (hypothetical.has(amount)) continue;
      // Tolerancja: model bywa cytuje zaokrągloną kwotę (1453 -> 1450).
      const ok =
        known.has(amount) ||
        known.has(Math.round(amount / 10) * 10) ||
        [...known].some((k) => Math.abs(k - amount) <= 2);
      if (!ok) {
        fails.push({ code: "invented_price", detail: amount + " zł nie ma w wynikach narzędzi" });
      }
    }
  }

  if (expect.mustAdmitNoLiveData) {
    if (!NO_LIVE_DATA_HINTS.some((h) => lower.includes(h))) {
      fails.push({ code: "no_disclaimer", detail: "brak przyznania, że nie ma danych na żywo" });
    }
  }

  for (const phrase of expect.mustNotContain ?? []) {
    if (lower.includes(phrase.toLowerCase())) {
      fails.push({ code: "forbidden_phrase", detail: phrase });
    }
  }
  if (expect.mustContainAny && expect.mustContainAny.length > 0) {
    const hit = expect.mustContainAny.some((p) => lower.includes(p.toLowerCase()));
    if (!hit) {
      fails.push({ code: "missing_phrase", detail: expect.mustContainAny.join(" | ") });
    }
  }

  if (hasMarkdownArtifacts(text)) {
    fails.push({ code: "markdown", detail: "markdown w odpowiedzi (UI renderuje czysty tekst)" });
  }
  if (text.trim().length === 0) {
    fails.push({ code: "empty", detail: "pusta odpowiedź" });
  }

  return fails;
}
