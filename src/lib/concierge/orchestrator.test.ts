// Testy pętli orkiestracji AI Concierge (Task 3.2). Wszystkie zależności
// (chat + egzekutory) są WSTRZYKNIĘTE mockami — zero sieci, zero OpenRouter.
//
// Uczciwość pod testem: orkiestrator nigdy nie rzuca na zewnątrz (błąd
// transportu/modelu → łagodny komunikat PL + error:true), a treść wiadomości
// `role:"tool"` musi wprost nieść wynik egzekutora (albo jego błąd).

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_HISTORY_MESSAGES, MAX_INPUT_CHARS, MAX_TOOL_ROUNDS } from "./openrouter";
import { SYSTEM_PROMPT } from "./system-prompt";
import { runConcierge, type OrchestratorDeps } from "./orchestrator";
import type { TripOffer } from "./types";

type ChatArgs = { messages: Record<string, unknown>[]; tools: Record<string, unknown>[] };

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    chat: async () => {
      throw new Error("chat mock not configured");
    },
    executors: {
      executeSearchTrips: async () => ({ candidates: [] }),
      executeGetTripOffer: async () => {
        throw new Error("executeGetTripOffer mock not configured");
      },
      executeListThemes: () => ({ themes: [] }),
    },
    ...overrides,
  };
}

function fakeOffer(): TripOffer {
  return {
    cityEn: "Palma de Mallorca",
    countryEn: "Spain",
    cityPl: "Palma de Mallorca",
    checkin: "2026-08-10",
    checkout: "2026-08-17",
    adults: 2,
    children: 0,
    originIata: "WAW",
    hotel: {
      hotelId: "h1",
      name: "Hotel Testowy",
      totalPln: 3000,
      mainPhotoUrl: null,
      rating: 8.5,
      url: "/hotele/h1?checkin=2026-08-10&checkout=2026-08-17&adults=2&rooms=1",
    },
    flight: {
      totalPln: 1800,
      carrierName: "Test Air",
      outboundDepartureTime: "2026-08-10T06:00:00Z",
      inboundDepartureTime: "2026-08-17T18:00:00Z",
      stops: 0,
      url: "/loty/wyniki?origin=WAW&destination=PMI&depart=2026-08-10&return=2026-08-17&adults=2&children=0&infants=0",
    },
    totalPerPersonPln: 2400,
    partial: false,
  };
}

// ── 1. Happy path z jedną rundą narzędzia ───────────────────────────────────

test("runConcierge: happy path — jedna runda tool_calls, potem tekst", async () => {
  const calls: ChatArgs[] = [];
  let searchTripsCallCount = 0;
  let searchTripsArgs: unknown = null;

  const deps = makeDeps({
    chat: async (args) => {
      calls.push(args as ChatArgs);
      if (calls.length === 1) {
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "t1",
                    type: "function",
                    function: { name: "search_trips", arguments: '{"theme":"plaza"}' },
                  },
                ],
              },
            },
          ],
        };
      }
      return { choices: [{ message: { role: "assistant", content: "Oto kierunki" } }] };
    },
    executors: {
      executeSearchTrips: async (args) => {
        searchTripsCallCount += 1;
        searchTripsArgs = args;
        return { candidates: [{ cityEn: "Palma" }] };
      },
      executeGetTripOffer: async () => {
        throw new Error("not used in this test");
      },
      executeListThemes: () => ({ themes: [] }),
    },
  });

  const result = await runConcierge([{ role: "user", content: "Szukam plaży" }], deps);

  assert.equal(result.text, "Oto kierunki");
  assert.equal(result.error, false);
  assert.equal(searchTripsCallCount, 1);
  assert.deepEqual(searchTripsArgs, { theme: "plaza" });

  assert.equal(calls.length, 2);
  // Pierwsza wiadomość w KAŻDYM wywołaniu to system prompt — jako część
  // tekstowa z breakpointem cache_control (prompt caching: statyczny prefiks
  // tools+system czytany z cache za 10% ceny wejścia u Anthropic).
  for (const call of [calls[0], calls[1]]) {
    const system = call.messages[0] as {
      role?: string;
      content?: Array<{ type?: string; text?: string; cache_control?: { type?: string } }>;
    };
    assert.equal(system.role, "system");
    assert.equal(system.content?.[0]?.text, SYSTEM_PROMPT);
    assert.equal(system.content?.[0]?.cache_control?.type, "ephemeral");
  }
  // Drugi breakpoint: OSTATNIA wiadomość historii (tu: jedyna user) też jest
  // częścią tekstową z cache_control — kolejne rundy narzędzi czytają
  // historię z cache.
  const lastHistory = calls[0].messages[1] as {
    role?: string;
    content?: Array<{ type?: string; text?: string; cache_control?: { type?: string } }>;
  };
  assert.equal(lastHistory.role, "user");
  assert.equal(lastHistory.content?.[0]?.text, "Szukam plaży");
  assert.equal(lastHistory.content?.[0]?.cache_control?.type, "ephemeral");

  const toolMsg = calls[1].messages.find(
    (m) => (m as Record<string, unknown>).role === "tool",
  ) as Record<string, unknown> | undefined;
  assert.ok(toolMsg, "druga runda musi nieść wiadomość role:tool");
  assert.equal(toolMsg!.tool_call_id, "t1");
  assert.equal(toolMsg!.content, JSON.stringify({ candidates: [{ cityEn: "Palma" }] }));
});

// ── 2. Przechwycenie oferty ─────────────────────────────────────────────────

test("runConcierge: get_trip_offer — offer w wyniku to DOKŁADNIE wynik egzekutora", async () => {
  const offer = fakeOffer();
  let round = 0;

  const deps = makeDeps({
    chat: async () => {
      round += 1;
      if (round === 1) {
        return {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "t1",
                    type: "function",
                    function: {
                      name: "get_trip_offer",
                      arguments: JSON.stringify({
                        cityEn: "Palma de Mallorca",
                        countryEn: "Spain",
                        checkin: "2026-08-10",
                        checkout: "2026-08-17",
                        origin: "WAW",
                        adults: 2,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        };
      }
      return { choices: [{ message: { content: "Polecam!" } }] };
    },
    executors: {
      executeSearchTrips: async () => ({ candidates: [] }),
      executeGetTripOffer: async () => offer,
      executeListThemes: () => ({ themes: [] }),
    },
  });

  const result = await runConcierge([{ role: "user", content: "Wybieram Palmę" }], deps);

  assert.equal(result.text, "Polecam!");
  assert.equal(result.error, false);
  assert.deepEqual(result.offer, offer);
});

// ── 2b. budgetFit — zapas/przekroczenie budżetu liczy SYSTEM, nie model ─────
// Realny incydent (Majorka, preview): 5474 zł łącznie przy budżecie 5000 zł
// → Haiku ogłosił „474 zł zapasu" zamiast przekroczenia (zły znak).

function depsForBudgetFit(offer: TripOffer, toolArgs: Record<string, unknown>) {
  let round = 0;
  const toolContents: string[] = [];
  const deps = makeDeps({
    chat: async (args) => {
      round += 1;
      if (round === 1) {
        return {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "t1",
                    type: "function",
                    function: { name: "get_trip_offer", arguments: JSON.stringify(toolArgs) },
                  },
                ],
              },
            },
          ],
        };
      }
      for (const m of (args as ChatArgs).messages) {
        if ((m as Record<string, unknown>).role === "tool") {
          toolContents.push(String((m as Record<string, unknown>).content));
        }
      }
      return { choices: [{ message: { content: "ok" } }] };
    },
    executors: {
      executeSearchTrips: async () => ({ candidates: [] }),
      executeGetTripOffer: async () => offer,
      executeListThemes: () => ({ themes: [] }),
    },
  });
  return { deps, toolContents };
}

test("runConcierge: budgetFit — budżet total_two nad ofertą → zapas policzony przez system", async () => {
  const offer = fakeOffer(); // totalPerPersonPln: 2400
  const { deps, toolContents } = depsForBudgetFit(offer, {
    cityEn: "Palma", countryEn: "Spain", origin: "WAW", adults: 2,
    budgetPln: 5000, budgetKind: "total_two", // 2500 zł/os. → zapas 100
  });
  const result = await runConcierge([{ role: "user", content: "Majorka do 5000 łącznie" }], deps);

  assert.equal(result.error, false);
  const fit = (JSON.parse(toolContents[0]) as { budgetFit?: { gapPln: number; note: string } }).budgetFit;
  assert.ok(fit, "wynik narzędzia musi nieść budgetFit");
  assert.equal(fit!.gapPln, 100);
  assert.ok(fit!.note.includes("MIEŚCI SIĘ"));
  // Karta (offer) zostaje CZYSTA — budgetFit tylko w treści dla modelu.
  assert.equal("budgetFit" in (result.offer as unknown as Record<string, unknown>), false);
});

test("runConcierge: budgetFit — oferta ponad budżet → PRZEKRACZA z kwotą, nigdy „zapas”", async () => {
  const offer = fakeOffer(); // totalPerPersonPln: 2400
  const { deps, toolContents } = depsForBudgetFit(offer, {
    cityEn: "Palma", countryEn: "Spain", origin: "WAW", adults: 2,
    budgetPln: 4000, budgetKind: "total_two", // 2000 zł/os. → przekroczenie 400
  });
  await runConcierge([{ role: "user", content: "Majorka do 4000 łącznie" }], deps);

  const fit = (JSON.parse(toolContents[0]) as { budgetFit?: { gapPln: number; note: string } }).budgetFit;
  assert.ok(fit);
  assert.equal(fit!.gapPln, -400);
  assert.ok(fit!.note.includes("PRZEKRACZA"));
  assert.equal(fit!.note.includes("MIEŚCI"), false);
});

test("runConcierge: budgetFit — „łącznie” dzielone przez WSZYSTKICH podróżnych, nie sztywno 2", async () => {
  // Realny incydent: rodzina 2+1 z 6000 zł łącznie → stary /2 dał próg
  // 3000 zł/os. i „zapas 758 zł" przy ofercie realnie PONAD budżet.
  const offer = fakeOffer(); // totalPerPersonPln: 2400
  const { deps, toolContents } = depsForBudgetFit(offer, {
    cityEn: "Palma", countryEn: "Spain", origin: "WAW", adults: 2, children: 1,
    budgetPln: 6000, budgetKind: "total_two", // 6000/3 = 2000 zł/os. → przekroczenie 400
  });
  await runConcierge([{ role: "user", content: "6000 łącznie, 2+1" }], deps);

  const fit = (JSON.parse(toolContents[0]) as { budgetFit?: { gapPln: number; note: string } }).budgetFit;
  assert.ok(fit);
  assert.equal(fit!.gapPln, -400);
  assert.ok(fit!.note.includes("PRZEKRACZA"));
});

test("runConcierge: budgetFit — brak budżetu w argumentach → wynik bez budgetFit", async () => {
  const offer = fakeOffer();
  const { deps, toolContents } = depsForBudgetFit(offer, {
    cityEn: "Palma", countryEn: "Spain", origin: "WAW", adults: 2,
  });
  await runConcierge([{ role: "user", content: "Pokaż Majorkę" }], deps);
  assert.equal(toolContents[0].includes("budgetFit"), false);
});

// ── 3. Egzekutor rzuca → wynik narzędzia niesie błąd, brak crasha ──────────

test("runConcierge: executeGetTripOffer odrzuca obietnicę → tool-result z błędem, brak crasha", async () => {
  let round = 0;
  let toolMessageContent = "";

  const deps = makeDeps({
    chat: async (args) => {
      round += 1;
      if (round === 1) {
        return {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "t1",
                    type: "function",
                    function: {
                      name: "get_trip_offer",
                      arguments: JSON.stringify({
                        cityEn: "Palma",
                        countryEn: "Spain",
                        checkin: "2026-08-10",
                        checkout: "2026-08-17",
                        origin: "WAW",
                        adults: 2,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        };
      }
      const toolMsg = (args as ChatArgs).messages.find(
        (m) => (m as Record<string, unknown>).role === "tool",
      ) as Record<string, unknown> | undefined;
      toolMessageContent = String(toolMsg?.content ?? "");
      return { choices: [{ message: { content: "Niestety coś poszło nie tak." } }] };
    },
    executors: {
      executeSearchTrips: async () => ({ candidates: [] }),
      executeGetTripOffer: async () => {
        throw new Error("bad dates");
      },
      executeListThemes: () => ({ themes: [] }),
    },
  });

  const result = await runConcierge([{ role: "user", content: "Wybieram Palmę" }], deps);

  assert.equal(result.error, false);
  assert.equal(result.offer, null);
  assert.match(toolMessageContent, /bad dates/);
  assert.equal(result.text, "Niestety coś poszło nie tak.");
});

// ── 3b. Nadmiar tool_calls (>3) — zero wiszących tool_call_id ────────────────

test("runConcierge: >3 tool_calls — wykonane 3, tool_calls asystenta przycięte 1:1 do odpowiedzi role:tool", async () => {
  const calls: ChatArgs[] = [];
  let executorCallCount = 0;

  const fiveCalls = ["t1", "t2", "t3", "t4", "t5"].map((id) => ({
    id,
    type: "function",
    function: { name: "search_trips", arguments: '{"theme":"plaza"}' },
  }));

  const deps = makeDeps({
    chat: async (args) => {
      calls.push(args as ChatArgs);
      if (calls.length === 1) {
        return { choices: [{ message: { tool_calls: fiveCalls } }] };
      }
      return { choices: [{ message: { content: "Gotowe" } }] };
    },
    executors: {
      executeSearchTrips: async () => {
        executorCallCount += 1;
        return { candidates: [] };
      },
      executeGetTripOffer: async () => {
        throw new Error("not used in this test");
      },
      executeListThemes: () => ({ themes: [] }),
    },
  });

  const result = await runConcierge([{ role: "user", content: "test" }], deps);

  assert.equal(executorCallCount, 3);
  assert.equal(result.text, "Gotowe");
  assert.equal(result.error, false);

  const secondCallMessages = calls[1].messages;
  const assistantMsg = secondCallMessages.find(
    (m) => m.role === "assistant" && Array.isArray(m.tool_calls),
  );
  assert.ok(assistantMsg, "druga runda musi nieść wiadomość asystenta z tool_calls");
  const assistantToolCalls = assistantMsg!.tool_calls as { id: string }[];
  // KAŻDY tool_call_id w wiadomości asystenta MUSI mieć odpowiedź role:"tool" —
  // wiszący id (bez odpowiedzi) = provider w formacie OpenAI odrzuca request (400).
  assert.equal(assistantToolCalls.length, 3);
  assert.deepEqual(
    assistantToolCalls.map((c) => c.id),
    ["t1", "t2", "t3"],
  );

  const toolMsgs = secondCallMessages.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 3);
  assert.deepEqual(
    toolMsgs.map((m) => m.tool_call_id),
    ["t1", "t2", "t3"],
  );
});

// ── 3c. Nieznana nazwa narzędzia ─────────────────────────────────────────────

test("runConcierge: nieznana nazwa narzędzia → tool-result „Nieznane narzędzie”, brak crasha", async () => {
  let round = 0;
  let toolMessageContent = "";

  const deps = makeDeps({
    chat: async (args) => {
      round += 1;
      if (round === 1) {
        return {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "t1",
                    type: "function",
                    function: { name: "hack_the_planet", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        };
      }
      const toolMsg = (args as ChatArgs).messages.find(
        (m) => (m as Record<string, unknown>).role === "tool",
      ) as Record<string, unknown> | undefined;
      toolMessageContent = String(toolMsg?.content ?? "");
      return { choices: [{ message: { content: "Wróćmy do wyjazdu." } }] };
    },
  });

  const result = await runConcierge([{ role: "user", content: "test" }], deps);

  assert.equal(result.error, false);
  assert.match(toolMessageContent, /Nieznane narzędzie/);
  assert.equal(result.text, "Wróćmy do wyjazdu.");
});

// ── 4. Limit rund ────────────────────────────────────────────────────────────

test("runConcierge: limit rund — finalne wywołanie BEZ narzędzi, wynik z ostatniej treści", async () => {
  let chatCallCount = 0;
  const receivedTools: Record<string, unknown>[][] = [];

  const deps = makeDeps({
    chat: async (args) => {
      chatCallCount += 1;
      receivedTools.push((args as ChatArgs).tools);
      if (chatCallCount <= MAX_TOOL_ROUNDS) {
        return {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: `t${chatCallCount}`,
                    type: "function",
                    function: { name: "search_trips", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        };
      }
      return { choices: [{ message: { content: "Finalna odpowiedź po limicie" } }] };
    },
  });

  const result = await runConcierge([{ role: "user", content: "test" }], deps);

  assert.equal(chatCallCount, MAX_TOOL_ROUNDS + 1);
  assert.deepEqual(receivedTools[receivedTools.length - 1], []);
  assert.equal(result.text, "Finalna odpowiedź po limicie");
  assert.equal(result.error, false);
});

// ── 5. Błąd payloadu OpenRouter ──────────────────────────────────────────────

test("runConcierge: błędny payload OpenRouter → łagodny komunikat PL, error:true, brak crasha", async () => {
  const deps = makeDeps({
    chat: async () => ({ error: { message: "invalid key" } }),
  });

  const result = await runConcierge([{ role: "user", content: "test" }], deps);

  assert.equal(result.error, true);
  assert.equal(result.text, "Chwilowo nie mogę odpowiedzieć — spróbuj za moment.");
  assert.equal(result.offer, null);
});

// ── 6. Przycinanie historii ─────────────────────────────────────────────────

test("runConcierge: przycina historię do MAX_HISTORY_MESSAGES i treść do MAX_INPUT_CHARS", async () => {
  const longContent = "a".repeat(MAX_INPUT_CHARS + 500);
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i < MAX_HISTORY_MESSAGES + 5; i++) {
    history.push({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` });
  }
  // Nadpisz ostatnią wiadomość zbyt długą treścią.
  history[history.length - 1] = { role: "user", content: longContent };

  let capturedMessages: Record<string, unknown>[] = [];
  const deps = makeDeps({
    chat: async (args) => {
      capturedMessages = (args as ChatArgs).messages;
      return { choices: [{ message: { content: "ok" } }] };
    },
  });

  await runConcierge(history, deps);

  // system + MAX_HISTORY_MESSAGES ostatnich wiadomości
  assert.equal(capturedMessages.length, MAX_HISTORY_MESSAGES + 1);
  // Ostatnia wiadomość historii jest częścią tekstową (breakpoint cache) —
  // przycięcie do MAX_INPUT_CHARS musi zadziałać PRZED opakowaniem.
  const lastMsg = capturedMessages[capturedMessages.length - 1] as {
    content: Array<{ text: string }>;
  };
  assert.equal(lastMsg.content[0].text.length, MAX_INPUT_CHARS);
});

// ── 9. Retry na miękko zdeformowaną odpowiedź modelu ────────────────────────
// Gemini potrafi stochastycznie zwrócić MALFORMED_FUNCTION_CALL (choices bez
// treści i bez tool_calls). Jedna ponowna próba ratuje turę; twardych błędów
// API ({error}) NIE ponawiamy (osobny test 5 pilnuje pojedynczego wywołania).

test("runConcierge: pusta wiadomość (soft-malformed) → jedna ponowna próba, sukces", async () => {
  let chatCalls = 0;
  const deps = makeDeps({
    chat: async () => {
      chatCalls++;
      if (chatCalls === 1) {
        // finish_reason:"error" u Gemini = message bez content i bez tool_calls
        return { choices: [{ message: { role: "assistant" } }] };
      }
      return { choices: [{ message: { role: "assistant", content: "Po ponowieniu działa" } }] };
    },
  });

  const result = await runConcierge([{ role: "user", content: "test" }], deps);
  assert.equal(chatCalls, 2);
  assert.equal(result.error, false);
  assert.equal(result.text, "Po ponowieniu działa");
});

test("runConcierge: soft-malformed dwa razy z rzędu → error:true (tylko jedna ponowka)", async () => {
  let chatCalls = 0;
  const deps = makeDeps({
    chat: async () => {
      chatCalls++;
      return { choices: [{ message: { role: "assistant" } }] };
    },
  });

  const result = await runConcierge([{ role: "user", content: "test" }], deps);
  assert.equal(chatCalls, 2);
  assert.equal(result.error, true);
});

// ── Auto-oferta po search_trips (karta bez łaski modelu) ────────────────────
// Tani model nie łańcuchuje niezawodnie get_trip_offer po search_trips
// (realny incydent na preview: user utknął bez karty). Kontrakt: po udanym
// search_trips z kandydatami ORKIESTRATOR sam pobiera ofertę top-1 (przekazując
// month/nights z argumentów wyszukiwania) i dokleja ją do wyniku narzędzia.

test("runConcierge: search_trips z kandydatami → auto get_trip_offer top-1 (offer w wyniku tury)", async () => {
  const offer = fakeOffer();
  const offerCalls: Array<Record<string, unknown>> = [];
  const calls: ChatArgs[] = [];
  const deps = makeDeps({
    chat: async (args) => {
      calls.push(args as ChatArgs);
      if (calls.length === 1) {
        return {
          choices: [{
            message: {
              role: "assistant",
              tool_calls: [{
                id: "t1", type: "function",
                function: {
                  name: "search_trips",
                  arguments: JSON.stringify({
                    theme: "plaza", budgetPln: 5000, budgetKind: "total_two",
                    month: 12, nights: 3, adults: 2, origin: "WAW",
                    wantsFlight: true, wantsHotel: true,
                  }),
                },
              }],
            },
          }],
        };
      }
      return { choices: [{ message: { role: "assistant", content: "Karta czeka!" } }] };
    },
    executors: {
      executeSearchTrips: async () => ({
        candidates: [
          { cityEn: "Larnaca", countryEn: "Cyprus", cityPl: "Larnaka", perPersonPln: 1948, checkin: "2026-08-24", checkout: "2026-08-28" },
        ],
      }),
      executeGetTripOffer: async (args: unknown) => {
        offerCalls.push(args as Record<string, unknown>);
        return offer;
      },
      executeListThemes: () => ({ themes: [] }),
    },
  });

  const result = await runConcierge([{ role: "user", content: "słońce zimą" }], deps);
  // Oferta trafiła do wyniku tury mimo że MODEL nie wywołał get_trip_offer.
  assert.deepEqual(result.offer, offer);
  assert.equal(result.error, false);
  // Auto-wywołanie dostało kierunek top-1 + month/nights z argumentów wyszukiwania.
  assert.equal(offerCalls.length, 1);
  assert.equal(offerCalls[0].cityEn, "Larnaca");
  assert.equal(offerCalls[0].month, 12);
  assert.equal(offerCalls[0].nights, 3);
  assert.equal(offerCalls[0].origin, "WAW");
  // Wynik narzędzia widziany przez model niesie autoOffer + notę.
  const toolMsg = calls[1].messages.find((m) => m.role === "tool") as { content: string };
  assert.ok(toolMsg.content.includes("autoOffer"));
  assert.ok(toolMsg.content.includes("JUŻ pokazana"));
});

test("runConcierge: auto-oferta pada → wynik search_trips bez autoOffer, zero crasha", async () => {
  const calls: ChatArgs[] = [];
  const deps = makeDeps({
    chat: async (args) => {
      calls.push(args as ChatArgs);
      if (calls.length === 1) {
        return {
          choices: [{
            message: {
              role: "assistant",
              tool_calls: [{
                id: "t1", type: "function",
                function: { name: "search_trips", arguments: JSON.stringify({ theme: "plaza" }) },
              }],
            },
          }],
        };
      }
      return { choices: [{ message: { role: "assistant", content: "Sama lista" } }] };
    },
    executors: {
      executeSearchTrips: async () => ({
        candidates: [{ cityEn: "Larnaca", countryEn: "Cyprus", cityPl: "Larnaka", perPersonPln: 1948, checkin: "2026-08-24", checkout: "2026-08-28" }],
      }),
      executeGetTripOffer: async () => { throw new Error("LiteAPI down"); },
      executeListThemes: () => ({ themes: [] }),
    },
  });

  const result = await runConcierge([{ role: "user", content: "x" }], deps);
  assert.equal(result.error, false);
  assert.equal(result.offer, null);
  const toolMsg = calls[1].messages.find((m) => m.role === "tool") as { content: string };
  assert.ok(toolMsg.content.includes("candidates"));
  assert.equal(toolMsg.content.includes("autoOffer"), false);
});

test("runConcierge: markdown z modelu (** # * ) zdejmowany mechanicznie z finalnego tekstu", async () => {
  const deps = makeDeps({
    chat: async () => ({
      choices: [{ message: { role: "assistant", content: "## Oferta\n**Ateny** — super!\n* punkt jeden\n* punkt dwa" } }],
    }),
  });
  const result = await runConcierge([{ role: "user", content: "x" }], deps);
  assert.equal(result.text.includes("**"), false);
  assert.equal(result.text.includes("#"), false);
  assert.ok(result.text.includes("Ateny — super!"));
  assert.ok(result.text.includes("- punkt jeden"));
});
