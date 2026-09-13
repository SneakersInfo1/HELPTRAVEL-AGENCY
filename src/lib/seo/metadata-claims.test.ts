import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// Strażnik źródeł szablonów. Tytuły budują funkcje z lib/seo/page-titles.ts
// (testowane osobno), a ten test pilnuje, żeby rok i kwoty nie wróciły do
// szablonów bokiem: przez `getFullYear()`, rok wpisany w tytuł albo „od X zł"
// w nagłówku. Tak powstało „Malaga w styczniu 2026" oglądane we wrześniu 2026.

const ROOT = process.cwd();

function listTemplates(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "api") files.push(...listTemplates(full));
    } else if (/^(page|layout|opengraph-image|twitter-image)\.tsx$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const TEMPLATES = listTemplates(path.join(ROOT, "src", "app"));

function codeLines(file: string) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((text, index) => ({ text, where: `${path.relative(ROOT, file)}:${index + 1}` }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(text));
}

describe("szablony stron nie wpisują roku ani kwot do metadanych (testy C i F)", () => {
  it("szablony nie liczą roku z zegara", () => {
    const hits = TEMPLATES.flatMap((file) =>
      codeLines(file)
        .filter(({ text }) => /\.getFullYear\(\)/.test(text))
        .map(({ where }) => where),
    );
    assert.deepEqual(hits, []);
  });

  it("tytuły, nagłówki, opisy i obrazy OG nie mają wpisanego roku", () => {
    const hits = TEMPLATES.flatMap((file) => {
      const isImage = /(opengraph|twitter)-image\.tsx$/.test(file);
      return codeLines(file)
        .filter(({ text }) => /\b20[2-9]\d\b/.test(text))
        .filter(({ text }) => isImage || /\b(title|headline|description|metaTitle|alt)\b/i.test(text))
        .map(({ where, text }) => `${where} ${text.trim()}`);
    });
    assert.deepEqual(hits, []);
  });

  it("tytuły i nagłówki nie mają kwot", () => {
    const hits = TEMPLATES.flatMap((file) =>
      codeLines(file)
        // Kwota = „zł" po cyfrze albo po wstawce `${…}`; „złotówkach" to nie kwota.
        .filter(({ text }) => /\b(title|headline|metaTitle)\b/.test(text) && /(\d|\})\s*zł(?![a-ząćęłńóśźż])/i.test(text))
        .map(({ where, text }) => `${where} ${text.trim()}`),
    );
    assert.deepEqual(hits, []);
  });

  it("ręcznie wpisane tytuły porównań nie mają roku", () => {
    const source = readFileSync(path.join(ROOT, "src", "lib", "mvp", "comparisons.ts"), "utf8");
    assert.doesNotMatch(source, /\b20[2-9]\d\b/);
  });
});
