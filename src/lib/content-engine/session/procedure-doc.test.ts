// Procedura sesji jest instrukcją dla Claude: każde polecenie `pnpm seo:daily …` z bloków kodu
// musi istnieć w CLI z dokładnie tymi opcjami. Inaczej sesja utknie na literówce w dokumentacji.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { normalizeTargetArg, parseDailyCliArgs } from "../../../../scripts/content-engine/daily";

const DOCS = ["docs/seo/daily/PROCEDURE.md", "docs/seo/daily/README.md"];

function commandsIn(markdown: string): string[] {
  const commands: string[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence && trimmed.startsWith("pnpm seo:daily ")) commands.push(trimmed);
  }
  return commands;
}

function tokens(command: string): string[] {
  return (command.slice("pnpm seo:daily ".length).match(/"[^"]*"|\S+/g) ?? []).map((token) =>
    token
      .replace(/^\[(.*)\]$/, "$1")
      .replace(/^"(.*)"$/, "$1")
      .replace(/^<[^>]+>$/, "x"),
  );
}

test("polecenia seo:daily z procedury i instrukcji są poprawne dla CLI", async () => {
  let checked = 0;
  for (const doc of DOCS) {
    const markdown = await readFile(path.resolve(process.cwd(), doc), "utf8");
    for (const command of commandsIn(markdown)) {
      assert.doesNotThrow(() => parseDailyCliArgs(tokens(command)), `${doc}: ${command}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, `za mało poleceń w dokumentacji (${checked})`);
});

test("parser odrzuca literówki i opcje spoza polecenia", () => {
  assert.throws(() => parseDailyCliArgs(["publish", "--with-kod"]), /Nieznana opcja --with-kod/);
  assert.throws(() => parseDailyCliArgs(["status", "--target", "/x"]), /Nieznana opcja --target dla polecenia status/);
  assert.throws(() => parseDailyCliArgs(["queue", "usun"]), /queue wymaga/);
  assert.throws(() => parseDailyCliArgs(["prepare", "--gsc-source", "chmura"]), /Nieznane źródło GSC/);
  const parsed = parseDailyCliArgs(["--", "queue", "set", "abc-temat", "--status", "done", "--pr", "https://github.com/a/b/pull/1"]);
  assert.deepEqual(parsed.positional, ["set", "abc-temat"]);
  assert.equal(parsed.options.get("--status"), "done");
});

test("cel zadania: pełny adres, ścieżka, obszar kodu i ścieżka zniekształcona przez Git Bash", () => {
  const route = "/porownanie/barcelona-spain-vs-malaga-spain";
  assert.equal(normalizeTargetArg(`https://helptravel.pl${route}/`), route);
  assert.equal(normalizeTargetArg(route), route);
  assert.equal(normalizeTargetArg("src/lib/seo/links.ts"), "src/lib/seo/links.ts");
  // Git Bash (MSYS) zamienia „/porownanie/…” na ścieżkę w katalogu instalacji Gita.
  assert.equal(normalizeTargetArg(`C:/Program Files/Git${route}`, { EXEPATH: String.raw`C:\Program Files\Git\bin` }), route);
  assert.equal(normalizeTargetArg(`C:/Program Files/Git${route}`, { EXEPATH: String.raw`C:\Program Files\Git` }), route);
  assert.equal(normalizeTargetArg(String.raw`D:\Narzedzia\Git\porownanie\barcelona-spain-vs-malaga-spain`, {}), route);
  // Korzeń bez katalogu (sam dysk) nie może „odciąć” dowolnej ścieżki.
  assert.throws(() => normalizeTargetArg("C:/Users/ktos/porownanie/x", { EXEPATH: "C:" }), /wygląda na ścieżkę Windows/);
  assert.throws(() => normalizeTargetArg("C:/Users/ktos/porownanie/x", {}), /wygląda na ścieżkę Windows/);
});
