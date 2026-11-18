import assert from "node:assert/strict";
import test from "node:test";

import { PaidLlmCallBlockedError, assertNoPaidLlmCredentials, installNoPaidLlmGuard } from "./guard";

test("strażnik blokuje wszystkie hosty płatnych modeli i liczy próby", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });
  t.after(() => {
    globalThis.fetch = original;
  });
  const guard = installNoPaidLlmGuard({ ANTHROPIC_BASE_URL: "https://claude-proxy.example.test/v1" });
  t.after(() => guard.uninstall());

  const blocked = [
    "https://api.anthropic.com/v1/messages",
    "https://claude-proxy.example.test/v1/messages",
    "https://openrouter.ai/api/v1/chat",
    "https://api.openai.com/v1/responses",
    "https://generativelanguage.googleapis.com/v1/models",
    "https://aiplatform.googleapis.com/v1/projects",
    "https://bedrock-runtime.eu-central-1.amazonaws.com/model/x/invoke",
    "https://team.openai.azure.com/openai/deployments/x",
  ];
  for (const url of blocked) await assert.rejects(fetch(url), PaidLlmCallBlockedError);
  assert.equal(guard.blockedCount(), blocked.length);
  assert.equal(await (await fetch("https://example.com/allowed")).text(), "ok");
  assert.equal(guard.blockedCount(), blocked.length);
});

test("assertNoPaidLlmCredentials działa fail closed dla klucza aplikacji", () => {
  assert.throws(() => assertNoPaidLlmCredentials({ SEO_ENGINE_ANTHROPIC_API_KEY: "secret" }), /nie może działać/);
  assert.doesNotThrow(() => assertNoPaidLlmCredentials({}));
});
