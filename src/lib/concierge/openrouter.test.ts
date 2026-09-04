import assert from "node:assert/strict";
import { test } from "node:test";

test("openrouter: brak OPENROUTER_API_KEY → typowany błąd konfiguracji", async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { chatCompletion } = await import("./openrouter");
    await assert.rejects(() => chatCompletion({ messages: [], tools: [] }), /OPENROUTER_API_KEY/);
  } finally {
    if (prev) process.env.OPENROUTER_API_KEY = prev;
  }
});

// Nieaktualny slug w OPENROUTER_MODEL dwukrotnie położył czat (lokalnie i na
// Vercelu). Kontrakt: błąd „model niedostępny" (404) → JEDNA ponowna próba na
// modelu wbudowanym; zła konfiguracja degraduje się do działania.
test("openrouter: zły slug modelu z env → fallback na model domyślny (jedna ponowka)", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "google/gemma-3-27b-it:free"; // martwy slug z Vercela

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    bodies.push(body);
    const payload =
      bodies.length === 1
        ? { error: { message: "This model is unavailable for free. The paid version is available now - use this slug instead: google/gemma-3-27b-it", code: 404 } }
        : { choices: [{ message: { role: "assistant", content: "działa" } }] };
    return { body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion, DEFAULT_MODEL } = await import("./openrouter");
    const result = (await chatCompletion({ messages: [{ role: "user", content: "hej" }], tools: [] })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, "google/gemma-3-27b-it:free");
    assert.equal(bodies[1].model, DEFAULT_MODEL);
    assert.equal(result.choices?.[0]?.message?.content, "działa");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel;
    else delete process.env.OPENROUTER_MODEL;
  }
});

test("openrouter: model domyślny zwraca błąd 404 → BEZ ponowki (nie pętlimy)", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  delete process.env.OPENROUTER_MODEL; // brak env → od razu model domyślny

  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return {
      body: null,
      json: async () => ({ error: { message: "model not found", code: 404 } }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    const result = (await chatCompletion({ messages: [], tools: [] })) as { error?: unknown };
    assert.equal(calls, 1);
    assert.ok(result.error); // błąd wraca do orkiestratora (łagodna ścieżka błędu)
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel;
  }
});

// ── Model zapasowy sterowany env (§15/§41 audytu) ─────────────────────────
// Powód: na dev-serverze zaobserwowano na żywo, jak produkcyjny
// gemini-2.5-flash-lite zwraca `native_finish_reason: MALFORMED_FUNCTION_CALL`
// DWA razy z rzędu (pierwsze wywołanie + ponowienie w orkiestratorze) — i
// użytkownik dostaje „Chwilowo nie mogę odpowiedzieć". Ponowienie na TYM SAMYM
// modelu nie pomaga, bo defekt jest systematyczny dla modelu, nie losowy.
//
// Fallback siedzi WEWNĄTRZ chatCompletion, czyli w obrębie JEDNEGO wywołania
// modelu. Narzędzia wykonuje orkiestrator dopiero po powrocie — więc zmiana
// modelu nie może wykonać żadnego tool-calla drugi raz (§15: idempotencja).

test("openrouter: awaria przejściowa + OPENROUTER_FALLBACK_MODEL → druga próba na zapasowym", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
    const payload =
      bodies.length === 1
        ? { choices: [{ finish_reason: "error", native_finish_reason: "MALFORMED_FUNCTION_CALL", message: {} }] }
        : { choices: [{ message: { role: "assistant", content: "z zapasu" } }] };
    return { status: 200, body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    const result = (await chatCompletion({ messages: [], tools: [] })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, "primary/model");
    assert.equal(bodies[1].model, "zapas/model");
    assert.equal(result.choices?.[0]?.message?.content, "z zapasu");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});

test("openrouter: POPRAWNA odpowiedź NIE uruchamia modelu zapasowego", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";

  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return {
      status: 200,
      body: null,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "ok" } }] }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.equal(calls, 1, "zapas ma się włączać TYLKO przy awarii, nie zawsze");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});

test("openrouter: bez OPENROUTER_FALLBACK_MODEL awaria wraca do orkiestratora (bez drugiej próby)", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  delete process.env.OPENROUTER_FALLBACK_MODEL;

  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return {
      status: 200,
      body: null,
      json: async () => ({ choices: [{ finish_reason: "error", message: {} }] }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});
