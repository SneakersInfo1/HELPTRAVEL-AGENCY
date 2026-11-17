import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const IMPORT = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

async function resolveModule(from: string, specifier: string): Promise<string | null> {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? path.resolve(process.cwd(), "src", specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Następny wariant rozszerzenia.
    }
  }
  return null;
}

test("graf importów Routine nie zawiera klienta Anthropic ani SDK", async () => {
  const queue = [path.resolve(process.cwd(), "scripts", "content-engine", "routine.ts")];
  const visited = new Set<string>();
  let source = "";
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const text = await readFile(file, "utf8");
    source += `\n${text}`;
    for (const match of text.matchAll(IMPORT)) {
      const resolved = await resolveModule(file, match[1] ?? match[2]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  assert.equal([...visited].some((file) => file.endsWith(`${path.sep}anthropic-llm.ts`)), false);
  assert.doesNotMatch(source, /["']@anthropic-ai\/sdk["']/);
});
