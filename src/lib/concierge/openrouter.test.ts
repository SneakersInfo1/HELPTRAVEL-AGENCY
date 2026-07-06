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
