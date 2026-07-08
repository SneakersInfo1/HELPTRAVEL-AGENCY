// POST /api/concierge/chat — API route AI Concierge (Task 3.3). Wiąże
// orkiestrator (Task 3.2) z produkcyjnymi zależnościami narzędzi (Task 2.2 +
// tool-deps.ts) i modelem OpenRouter (Task 1.x). Konwencje skopiowane z
// src/app/api/booking/prebook/route.ts (runtime, rate-limit-first, zod,
// nigdy nie przeciekaj szczegółów błędu do klienta).
//
// UWAGA: ten plik importuje (przez tool-deps.ts) destinations-seed, które ma
// `import "server-only"` — dlatego NIE MA route.test.ts obok (patrz commit
// message / raport zadania: import route.ts w node:test rzuca
// MODULE_NOT_FOUND na "server-only", nawet przez dynamiczny import() —
// zweryfikowane empirycznie). Jakość zapewniona przez tsc + eslint +
// scripts/concierge-smoke.ts.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { runConcierge, type OrchestratorDeps } from "@/lib/concierge/orchestrator";
import { chatCompletion } from "@/lib/concierge/openrouter";
import { createToolExecutors } from "@/lib/concierge/tools";
import { buildProductionToolDeps } from "@/lib/concierge/tool-deps";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1500),
      }),
    )
    .min(1)
    .max(20),
});

// Kill-switch (domyślnie WŁĄCZONE — ustaw NEXT_PUBLIC_SHOW_CONCIERGE=false, by
// wyłączyć). Ta sama konwencja co NEXT_PUBLIC_SHOW_QUICK_SEARCH w
// quick-search-launcher.tsx.
const CONCIERGE_ENABLED = process.env.NEXT_PUBLIC_SHOW_CONCIERGE?.trim().toLowerCase() !== "false";

const FALLBACK_ERROR_BODY = {
  text: "Chwilowo nie mogę odpowiedzieć — spróbuj za moment.",
  offer: null,
  error: true,
} as const;

// Zależności budowane RAZ per proces (moduł), nie per request: buildProductionToolDeps
// jest tanie (tylko domyka funkcje, żadnego I/O na starcie), ale singleton
// unika ponownego tworzenia obiektu executors przy każdym POST-cie.
const deps: OrchestratorDeps = {
  chat: chatCompletion,
  executors: createToolExecutors(buildProductionToolDeps()),
};

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "concierge");
  if (limited) return limited;

  if (!CONCIERGE_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    console.warn("[concierge] nieprawidłowe body:", parsed.error.issues);
    return NextResponse.json({ error: "Nieprawidłowe żądanie" }, { status: 400 });
  }

  try {
    const result = await runConcierge(parsed.data.messages, deps);
    return NextResponse.json(result);
  } catch (err) {
    // runConcierge jest zaprojektowany, by nigdy nie rzucać — to jest siatka
    // bezpieczeństwa na nieprzewidziany wyjątek. Nigdy nie przeciekaj stack trace.
    console.error("[concierge] nieoczekiwany błąd route:", err instanceof Error ? err.message : err);
    return NextResponse.json(FALLBACK_ERROR_BODY, { status: 500 });
  }
}
