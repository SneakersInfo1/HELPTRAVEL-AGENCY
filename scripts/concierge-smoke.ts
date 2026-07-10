// scripts/concierge-smoke.ts
//
// Manual end-to-end smoke test for AI Concierge (Task 3.3), runnable with:
//   npm run concierge:smoke
// (requires OPENROUTER_API_KEY in .env.local — real OpenRouter call, real
// LiteAPI reads via buildProductionToolDeps; no writes, no bookings).
//
// Pipeline: builds PRODUCTION tool deps + executors (same wiring as the
// route), then calls runConcierge with a single realistic user turn and
// prints the full ConciergeResult JSON (text, offer, error) so a human can
// eyeball whether the model picked a theme, called search_trips/get_trip_offer
// correctly, and returned an honest (never-invented) price.
//
// KNOWN LIMITATION (verified empirically): buildProductionToolDeps() imports
// (transitively, via destinations-seed.ts) the `server-only` marker package,
// which Next.js resolves specially at build/runtime but which does NOT exist
// as a real npm package in node_modules. Plain `tsx` (no Next runtime) will
// therefore crash with `Cannot find module 'server-only'` when this script
// runs standalone — this is the same constraint documented at the top of
// tool-deps.ts (its only sanctioned consumer is the Next.js API route). Until
// that's resolved, prefer smoke-testing via the real route on a running dev
// server instead, e.g.:
//   curl -X POST http://localhost:3000/api/concierge/chat \
//     -H "Content-Type: application/json" \
//     -d '{"messages":[{"role":"user","content":"..."}]}'
// This script is kept (per task spec) for the day tool-deps.ts's server-only
// dependency is removed or shimmed for Node scripts — at that point it will
// run as written.

import { runConcierge, type OrchestratorDeps } from "../src/lib/concierge/orchestrator";
import { chatCompletion } from "../src/lib/concierge/openrouter";
import { createToolExecutors } from "../src/lib/concierge/tools";
import { buildProductionToolDeps } from "../src/lib/concierge/tool-deps";

const USER_MESSAGE =
  "Szukam kierunku z plażą do 3000 zł na osobę w sierpniu, lot i hotel, 2 osoby z Warszawy";

async function main(): Promise<number> {
  const deps: OrchestratorDeps = {
    chat: chatCompletion,
    executors: createToolExecutors(buildProductionToolDeps()),
  };

  console.log(`→ user: ${USER_MESSAGE}`);
  const result = await runConcierge([{ role: "user", content: USER_MESSAGE }], deps);

  console.log("\nConciergeResult:");
  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    console.error("\n❌ error:true — sprawdź komunikat/logi powyżej");
    return 1;
  }
  console.log("\n✅ odpowiedź otrzymana bez błędu transportu/modelu");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("smoke crashed:", err);
    process.exit(99);
  });
