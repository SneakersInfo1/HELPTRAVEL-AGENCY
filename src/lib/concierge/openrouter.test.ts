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
