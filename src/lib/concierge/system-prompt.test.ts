import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_PROMPT } from "./system-prompt";

test("SYSTEM_PROMPT: zakaz zmyślania cen — wyłącznie wyniki narzędzi", () => {
  assert.equal(SYSTEM_PROMPT.includes("nie wymyślaj cen"), true);
  assert.equal(SYSTEM_PROMPT.includes("wyłącznie wyników narzędzi"), true);
});

test("SYSTEM_PROMPT: dopytywanie o brakujące informacje", () => {
  assert.equal(SYSTEM_PROMPT.includes("dopytaj"), true);
});

test("SYSTEM_PROMPT: ceny w PLN, odpowiedzi po polsku", () => {
  assert.equal(SYSTEM_PROMPT.includes("PLN"), true);
  assert.equal(SYSTEM_PROMPT.includes("po polsku"), true);
});

test("SYSTEM_PROMPT: jedno pytanie na raz", () => {
  assert.equal(SYSTEM_PROMPT.includes("jedno pytanie"), true);
});

test("SYSTEM_PROMPT: zakaz fałszywej presji/sztucznej rzadkości", () => {
  assert.equal(SYSTEM_PROMPT.includes("nie używaj fałszywej presji"), true);
  assert.equal(SYSTEM_PROMPT.includes("ostatnie"), true);
});

test("SYSTEM_PROMPT: koszt — długość promptu pod kontrolą (wysyłany z KAŻDYM requestem)", () => {
  assert.equal(SYSTEM_PROMPT.length < 6000, true);
});
