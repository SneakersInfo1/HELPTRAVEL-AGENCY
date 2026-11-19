// Zabezpieczenia przed płatnymi wywołaniami API modeli i automatycznym generowaniem treści.
// Dzienna praca SEO odbywa się w sesji Claude Code (abonament), nie przez API ani harmonogram.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const WORKFLOWS = path.resolve(process.cwd(), ".github", "workflows");

test("workflow treści SEO nie mają harmonogramu, a żaden workflow nie dostaje klucza API modelu", async () => {
  const files = (await readdir(WORKFLOWS)).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(files.includes("seo-content-daily.yml"));
  for (const name of files) {
    const source = await readFile(path.join(WORKFLOWS, name), "utf8");
    const code = source
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    if (name.startsWith("seo-")) assert.doesNotMatch(code, /^\s*schedule\s*:/m, `${name}: harmonogram w workflow treści SEO`);
    assert.doesNotMatch(code, /ANTHROPIC_API_KEY|OPENROUTER_API_KEY|OPENAI_API_KEY/, `${name}: klucz API modelu w workflow`);
  }
});

function runCli(args: readonly string[], env: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", ...args],
      // Adres modelu wskazuje na zamknięty port: nawet regresja nie mogłaby wysłać płatnego żądania.
      { cwd: process.cwd(), env: { ...process.env, ANTHROPIC_BASE_URL: "http://127.0.0.1:9", SEO_ENGINE_KILL_SWITCH: "1", ...env }, encoding: "utf8", windowsHide: true },
      (error, stdout, stderr) => resolve({ code: error ? Number((error as { code?: unknown }).code ?? 1) : 0, output: `${stdout}\n${stderr}` }),
    );
  });
}

test("content:run w trybie na żywo jest wyłączony bez jawnej flagi --allow-paid-api, nawet z kluczem", async () => {
  const result = await runCli(["scripts/content-engine/run.ts", "--mode", "dry-run"], { SEO_ENGINE_ANTHROPIC_API_KEY: "sk-ant-test-not-a-real-key" });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Tryb na żywo jest wyłączony/);
});

test("seo:daily kończy się błędem, gdy w środowisku jest klucz silnika (fail closed)", async () => {
  const result = await runCli(["scripts/content-engine/daily.ts", "status"], { SEO_ENGINE_ANTHROPIC_API_KEY: "sk-ant-test-not-a-real-key" });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /SEO_DAILY_STATUS=FAILED/);
  assert.match(result.output, /SEO_DAILY_PAID_LLM_CALLS_BLOCKED=0/);
});

/** Reguła `Bash(wzorzec)` z `.claude/settings.json`: `*` pasuje do dowolnego ciągu (jak w Claude Code). */
function ruleMatches(rule: string, command: string): boolean {
  const pattern = rule.match(/^Bash\((.*)\)$/)?.[1];
  if (!pattern) return false;
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`^${escaped.join(".*")}$`);
  return regex.test(command);
}

test("reguły deny blokują push do main, wymuszony push w każdej postaci i curl do API modeli", async () => {
  const settings = JSON.parse(await readFile(path.resolve(process.cwd(), ".claude", "settings.json"), "utf8")) as { permissions: { deny: string[] } };
  const denied = (command: string) => settings.permissions.deny.some((rule) => ruleMatches(rule, command));
  for (const command of [
    "git push origin main",
    "git push -u origin main",
    "git push origin HEAD:main",
    "git push origin HEAD:refs/heads/main",
    "git push origin --delete main",
    "git push origin +HEAD:claude/seo-daily/2026-11-17",
    "git push --force origin claude/seo-daily/2026-11-17",
    "git push origin claude/seo-daily/2026-11-17 --force-with-lease",
    "git push -f origin claude/seo-daily/2026-11-17",
    "git push --mirror origin",
    "git -C . push origin claude/seo-daily/2026-11-17",
    "git --git-dir=.git push origin x",
    "git -c core.hooksPath=/dev/null push origin x",
    "curl -s https://api.anthropic.com/v1/messages",
  ]) {
    assert.equal(denied(command), true, command);
  }
  for (const command of [
    "git push -u origin claude/seo-daily/2026-11-17",
    "git push origin HEAD:refs/heads/claude/seo-daily-workflow",
    "git push origin feature-fix",
  ]) {
    assert.equal(denied(command), false, command);
  }
});
