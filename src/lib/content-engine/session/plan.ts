// Plan sesji „SEO daily”: lista zadań uszeregowana według DOWODÓW, nie losowo.
//
// Źródła dowodów (od najmocniejszego):
//  1. twierdzenia w opublikowanych dokumentach, które tracą świeżość — poprawność ma
//     pierwszeństwo przed nową treścią;
//  2. dane GSC z eksportu właściciela: adresy z potencjałem (wysokie wyświetlenia,
//     pozycja w zasięgu, CTR poniżej oczekiwanego) bez dokumentu ze źródłami;
//  3. tematy z kolejki (dopisane przez właściciela albo poprzednie sesje);
//  4. kolejka możliwości z repo (`docs/seo/OPPORTUNITY_BACKLOG.csv`) — dane historyczne,
//     więc o niższej wadze.
// Wagę danych GSC obniża ich wiek (świeże / starzejące się / przestarzałe).
//
// Wykluczenia: temat w przeglądzie (otwarty PR, oczekujący w rejestrze), zamknięty
// w kolejce (`done`, `rejected`, `do_not_redo`), adres z aktualnym dokumentem.
// Plan z liczbami GSC zapisujemy wyłącznie lokalnie (`.seo-daily/`, poza gitem).

import { rankOpportunities } from "@/lib/seo-ops/gsc/analysis";
import { classifyUrl } from "@/lib/seo-ops/gsc/segments";
import { parseGscCsv } from "@/lib/seo-ops/gsc/csv";

import type { SiteInventory } from "../inventory";
import type { GscCsvInputs } from "../pipeline";
import { claimExpiresAt, type ContentDocument } from "../schema";
import { RENDERED_CONTENT_TYPES } from "../site-content";
import { registeredSourcesForTarget } from "../source-registry";
import type { QueueItem } from "./daily-state";
import type { FreshnessVerdict } from "./gsc-export";

export interface PlanCandidate {
  kind: QueueItem["kind"];
  target: string;
  /** Opis publiczny (bez liczb GSC) — trafia do kolejki i PR. */
  title: string;
  why: string;
  /** Dowody lokalne (mogą zawierać liczby GSC) — tylko do `.seo-daily/plan.md`. */
  evidence: string;
  source: QueueItem["source"];
  priority: number;
  queueId: string | null;
}

export interface PlanInput {
  today: Date;
  inventory: SiteInventory;
  documents: readonly ContentDocument[];
  gsc: { inputs: GscCsvInputs; freshness: FreshnessVerdict | "backlog" } | null;
  queue: readonly QueueItem[];
  /** Adresy z otwartymi propozycjami (rejestr + gałęzie PR). */
  pending: ReadonlySet<string>;
  /** Dni do wygaśnięcia twierdzenia, od których planujemy odświeżenie. */
  refreshWindowDays?: number;
}

export interface PlanResult {
  candidates: PlanCandidate[];
  excluded: Array<{ target: string; reason: string }>;
}

/** Waga dowodu z GSC według wieku danych; kolejka z repo to dane historyczne. */
const GSC_WEIGHT: Record<FreshnessVerdict | "backlog", number> = {
  fresh: 1,
  aging: 0.6,
  stale: 0.3,
  backlog: 0.3,
};

function routeOf(raw: string): string {
  try {
    return new URL(raw, "https://helptravel.pl").pathname.replace(/\/$/, "") || "/";
  } catch {
    return raw;
  }
}

function contentTypeForRoute(route: string): ContentDocument["contentType"] | null {
  const segment = classifyUrl(route).segment;
  if (segment === "comparison") return "comparison_enrichment";
  if (segment === "month") return "month_enrichment";
  if (segment === "mood_hub") return "hub_enrichment";
  return null;
}

export function buildPlan(input: PlanInput): PlanResult {
  const refreshWindow = (input.refreshWindowDays ?? 21) * 86_400_000;
  const closed = new Map(input.queue.filter((item) => item.status !== "todo").map((item) => [item.target, item.status]));
  const candidates: PlanCandidate[] = [];
  const excluded: PlanResult["excluded"] = [];
  const taken = new Set<string>();
  const blocked = (target: string): string | null => {
    if (input.pending.has(target)) return "propozycja czeka na przegląd";
    const status = closed.get(target);
    if (status) return `temat w kolejce ma status ${status}`;
    return null;
  };

  // 1. Świeżość twierdzeń w opublikowanych dokumentach.
  for (const document of input.documents) {
    if (document.reviewStatus !== "approved") continue;
    const expiring = document.factClaims.filter((claim) => claimExpiresAt(claim).getTime() - input.today.getTime() <= refreshWindow);
    if (expiring.length === 0) continue;
    const reason = input.pending.has(document.canonicalUrl) ? "propozycja czeka na przegląd" : null;
    if (reason) {
      excluded.push({ target: document.canonicalUrl, reason });
      continue;
    }
    taken.add(document.canonicalUrl);
    candidates.push({
      kind: "content_refresh",
      target: document.canonicalUrl,
      title: `Odświeżenie faktów: ${document.title}`,
      why: `${expiring.length} z ${document.factClaims.length} zweryfikowanych twierdzeń traci świeżość w ciągu ${input.refreshWindowDays ?? 21} dni.`,
      evidence: expiring.map((claim) => `${claim.id}: wygasa ${claimExpiresAt(claim).toISOString().slice(0, 10)}`).join("; "),
      source: "freshness",
      priority: 90,
      queueId: null,
    });
  }

  // 2. GSC: adresy z potencjałem bez dokumentu ze źródłami.
  if (input.gsc) {
    const weight = GSC_WEIGHT[input.gsc.freshness];
    const pages = parseGscCsv(input.gsc.inputs.pages).rows;
    const eligible = rankOpportunities(pages, 200).flatMap((opportunity) => {
      const target = routeOf(opportunity.url);
      if (taken.has(target)) return [];
      const contentType = contentTypeForRoute(target);
      if (!contentType || !RENDERED_CONTENT_TYPES.has(contentType)) return [];
      if (!input.inventory.existing().some((item) => item.canonicalUrl === target)) return [];
      if (input.inventory.hasEnrichment(target)) return [];
      const reason = blocked(target);
      if (reason) {
        excluded.push({ target, reason });
        return [];
      }
      return [{ opportunity, target }];
    });
    // Priorytet proporcjonalny do wyniku możliwości (szacowane utracone kliknięcia) względem
    // najlepszego KWALIFIKUJĄCEGO SIĘ adresu — kolejność wyznaczają dowody, nie alfabet.
    const topScore = Math.max(...eligible.map(({ opportunity }) => opportunity.score), Number.EPSILON);
    for (const { opportunity, target } of eligible.slice(0, 30)) {
      const row = pages.find((candidate) => routeOf(candidate.key) === target);
      // Wykonalność: bez źródeł w rejestrze research musi sam znaleźć oficjalne strony
      // z dozwolonych domen, co często się nie udaje — taki kandydat ma niższą wagę.
      const registered = registeredSourcesForTarget(target).length;
      const feasibility = registered > 0 ? 1 : 0.6;
      taken.add(target);
      candidates.push({
        kind: "content_new",
        target,
        title: `Dokument ze źródłami dla ${target}`,
        why:
          input.gsc.freshness === "fresh"
            ? "Adres ma popyt w GSC i pozycję w zasięgu, a nie ma dokumentu ze zweryfikowanymi faktami."
            : "Adres miał popyt w GSC (dane nieświeże) i nie ma dokumentu ze zweryfikowanymi faktami.",
        evidence: `${
          row
            ? `pozycja ${row.position.toFixed(1)}, wyświetlenia ${row.impressions}, kliknięcia ${row.clicks}, CTR ${(row.ctr * 100).toFixed(2)}%; ${opportunity.rationale}`
            : opportunity.rationale
        }; źródła w rejestrze: ${registered}`,
        source: input.gsc.freshness === "backlog" ? "backlog" : "gsc",
        priority: Math.round((35 + 50 * (opportunity.score / topScore)) * weight * feasibility),
        queueId: null,
      });
    }
  }

  // 3. Tematy z kolejki (otwarte).
  for (const item of input.queue) {
    if (item.status !== "todo" || taken.has(item.target)) continue;
    if (input.pending.has(item.target)) {
      excluded.push({ target: item.target, reason: "propozycja czeka na przegląd" });
      continue;
    }
    taken.add(item.target);
    candidates.push({
      kind: item.kind,
      target: item.target,
      title: item.title,
      why: item.why,
      evidence: `kolejka (${item.source}), dodano ${item.createdAt.slice(0, 10)}`,
      source: item.source,
      priority: item.priority,
      queueId: item.id,
    });
  }

  return {
    candidates: candidates.sort((left, right) => right.priority - left.priority || left.target.localeCompare(right.target)),
    excluded,
  };
}

export function renderPlanMarkdown(result: PlanResult, header: string[]): string {
  const lines = ["# Plan sesji SEO", "", ...header, "", "| # | Priorytet | Rodzaj | Cel | Dlaczego | Dowody (lokalnie) |", "|---|---|---|---|---|---|"];
  result.candidates.forEach((candidate, index) => {
    lines.push(`| ${index + 1} | ${candidate.priority} | ${candidate.kind} | \`${candidate.target}\` | ${candidate.why} | ${candidate.evidence.replace(/\|/g, "/")} |`);
  });
  if (result.excluded.length > 0) {
    lines.push("", "## Pominięte", "");
    for (const item of result.excluded) lines.push(`- \`${item.target}\`: ${item.reason}`);
  }
  return `${lines.join("\n")}\n`;
}
