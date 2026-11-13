export type ModelRole = "selector" | "researcher" | "writer" | "verifier_assist";
export type EngineEnv = Readonly<Record<string, string | undefined>>;

const DEFAULT_MODEL_BY_ROLE: Readonly<Record<ModelRole, string>> = {
  // Tani model tylko do wyboru i triage'u; research i redakcja na modelu
  // domyślnym — jakość cytatu i tekstu jest tu ważniejsza niż cena żądania.
  selector: "claude-haiku-5-5",
  researcher: "claude-opus-5-5",
  writer: "claude-opus-5-5",
  verifier_assist: "claude-haiku-5-5",
};

export const ESCALATION_MODEL = "claude-fable-5-2";

export function modelForRole(role: ModelRole, env: EngineEnv = process.env): string {
  return env[`SEO_ENGINE_MODEL_${role.toUpperCase()}`] || DEFAULT_MODEL_BY_ROLE[role];
}

export const MODEL_BY_ROLE: Readonly<Record<ModelRole, string>> = {
  selector: modelForRole("selector"),
  researcher: modelForRole("researcher"),
  writer: modelForRole("writer"),
  verifier_assist: modelForRole("verifier_assist"),
};

// Cennik first-party API w USD za milion tokenów (źródło: tabela modeli
// Anthropic, stan na 2026-11-03). Haiku 5.5 kosztuje 0,50 / 2,50 dla promptów
// powyżej 100 tys. tokenów — do limitu bierzemy tę wyższą stawkę, bo budżet
// ma się mylić wyłącznie w bezpieczną stronę. Przy zmianie cennika zmień
// liczby tutaj i w docs/seo/AUTOMATION_RUNBOOK.md.
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.5, output: 2.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-fable-5-2": { input: 8, output: 40 },
};

/** Modele z serwerowym przejściem na model zapasowy po odmowie klasyfikatora. */
export function supportsServerSideFallback(model: string): boolean {
  return /^claude-(opus-5|sonnet-5-5|fable-5-[12])/.test(model);
}

export function priceForModel(model: string): { input: number; output: number } {
  const known = PRICING_USD_PER_MTOK[model];
  if (known) return known;
  return Object.values(PRICING_USD_PER_MTOK).reduce(
    (highest, price) => ({ input: Math.max(highest.input, price.input), output: Math.max(highest.output, price.output) }),
    { input: 0, output: 0 },
  );
}

