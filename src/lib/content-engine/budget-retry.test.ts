import assert from "node:assert/strict";
import test from "node:test";

import { BudgetExceededError, RunBudget } from "./budget";
import { LlmError } from "./llm";
import { withRetry } from "./retry";

test("budżet liczy koszt wyłącznie z rzeczywistych tokenów", () => {
  const budget = new RunBudget({ env: {}, now: () => 0, startedAtMs: 0 });
  budget.assertCanSpend();
  // Nieznany model liczony po najwyższej stawce z tabeli (Fable 5.2: 8 / 40 USD za MTok).
  budget.charge({ inputTokens: 1_000, outputTokens: 100 }, "nieznany-model");
  assert.equal(budget.summary().costUsd, 0.012);
  const opus = new RunBudget({ env: {}, now: () => 0, startedAtMs: 0 });
  opus.charge({ inputTokens: 10_000, outputTokens: 2_000 }, "claude-opus-5-5");
  assert.equal(opus.summary().costUsd, 0.08);
  assert.equal(budget.summary().inputTokens, 1_000);
  assert.equal(budget.summary().outputTokens, 100);
});

test("budżet blokuje USD, liczbę żądań i tokeny przed kolejnym żądaniem", () => {
  const usd = new RunBudget({ env: { SEO_ENGINE_MAX_USD_PER_RUN: "0.002" }, now: () => 0, startedAtMs: 0 });
  usd.assertCanSpend();
  usd.charge({ inputTokens: 1_000, outputTokens: 100 }, "claude-sonnet-5-5");
  assert.throws(() => usd.assertCanSpend(), (error) => error instanceof BudgetExceededError && error.dimension === "usd");

  const requests = new RunBudget({ env: { SEO_ENGINE_MAX_REQUESTS_PER_RUN: "1" }, now: () => 0, startedAtMs: 0 });
  requests.assertCanSpend();
  assert.throws(() => requests.assertCanSpend(), (error) => error instanceof BudgetExceededError && error.dimension === "requests");

  const tokens = new RunBudget({ env: { SEO_ENGINE_MAX_OUTPUT_TOKENS_PER_RUN: "100" }, now: () => 0, startedAtMs: 0 });
  tokens.assertCanSpend();
  tokens.charge({ inputTokens: 0, outputTokens: 100 }, "claude-haiku-5-5");
  assert.throws(() => tokens.assertCanSpend(), (error) => error instanceof BudgetExceededError && error.dimension === "output_tokens");
});

test("retry ponawia 429 i 500 z pełnym jitterem", async () => {
  const errors = [new LlmError("rate", 429, true), new LlmError("server", 500, true)];
  const waits: number[] = [];
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      const error = errors.shift();
      if (error) throw error;
      return "ok";
    },
    { retries: 3, baseMs: 100, maxMs: 1_000, random: () => 0.5, sleep: async (milliseconds) => void waits.push(milliseconds) },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [50, 100]);
});

test("retry nie ponawia 401", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new LlmError("unauthorized", 401, false);
    }),
    (error) => error instanceof LlmError && error.status === 401,
  );
  assert.equal(calls, 1);
});

test("retry rezygnuje po zadanej liczbie ponowień", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new LlmError("server", 529, true);
      },
      { retries: 2, sleep: async () => undefined },
    ),
  );
  assert.equal(calls, 3);
});

