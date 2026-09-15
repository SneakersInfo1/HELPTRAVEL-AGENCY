import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import sitemap from "@/app/sitemap";

// Strażnicy źródeł (SEO Data Integrity, PR #1.5). Testy modeli sprawdzają
// wynik; ten plik pilnuje, żeby wzorce zastane przez audyt Faza 2.2 nie wróciły
// do kodu bokiem — nowym szablonem albo „szybką poprawką" w istniejącym.

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const SOURCES = ["app", "lib", "components"].flatMap((dir) => sourceFiles(path.join(ROOT, "src", dir)));

function relative(file: string) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

/** Linie kodu (bez komentarzy) pasujące do wzorca, jako „plik:linia treść". */
function hits(pattern: RegExp, files: string[] = SOURCES): string[] {
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((text, index) => ({ text, where: `${relative(file)}:${index + 1}` }))
      .filter(({ text }) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(text) && pattern.test(text))
      .map(({ where, text }) => `${where} ${text.trim()}`),
  );
}

// Renderery SEO stron kierunków: liczby o kierunku tylko przez lib/seo/destination-facts.ts
// (albo modele, które z niej korzystają) — nigdy wprost z profilu.
const SEO_RENDERERS = [
  "src/app/kierunki/[slug]/[miesiac]/page.tsx",
  "src/app/kierunki/[slug]/[miesiac]/opengraph-image.tsx",
  "src/app/kierunki/[slug]/page.tsx",
  "src/app/kierunki/[slug]/opengraph-image.tsx",
  "src/app/kierunki/page.tsx",
  "src/app/porownanie/[para]/page.tsx",
  "src/app/porownanie/[para]/opengraph-image.tsx",
  "src/app/hotele/w/[miasto]/page.tsx",
  "src/app/najlepsze-kierunki/[sezon]/page.tsx",
  "src/lib/seo/month-page-schema.ts",
  "src/lib/seo/city-hotels-schema.ts",
  "src/lib/seo/page-titles.ts",
].map((file) => path.join(ROOT, file));

describe("strażnicy integralności danych SEO", () => {
  it("bez daty publikacji wpisanej na sztywno", () => {
    assert.deepEqual(hits(/datePublished:\s*["'`]20\d\d-/), []);
  });

  it("bez dateModified i „Zaktualizowano” z zegara renderu", () => {
    assert.deepEqual(hits(/dateModified:\s*(new Date\(|input\.nowIso|nowIso)/), []);
    assert.deepEqual(hits(/updatedISO=\{\s*new Date\(/), []);
  });

  it("sitemap bez lastmod z zegara generowania", () => {
    for (const entry of sitemap()) {
      assert.equal(entry.lastModified, undefined, entry.url);
    }
  });

  it("bez TouristAttraction z tagów (test F)", () => {
    const builders = SOURCES.filter((file) => !relative(file).endsWith("src/lib/seo/jsonld-validate.ts"));
    assert.deepEqual(hits(/includesAttraction|["']TouristAttraction["']/, builders), []);
  });

  it("bez deklaracji „realnych danych” przy danych z szablonu", () => {
    assert.deepEqual(hits(/Oparte na realnych danych|oparty o realne dane|opieramy na realnych, sprawdzalnych/i), []);
  });

  it("bez kategorycznego claimu wizowego z heurystyki (test G)", () => {
    assert.deepEqual(hits(/bez wizy dla polskiego paszportu|visa-free for Polish passport holders/i), []);
  });

  it("renderery SEO nie czytają temperatury ani czasu lotu z profilu z pominięciem bramki", () => {
    assert.deepEqual(hits(/avgTempByMonth|typicalFlightHoursFromPL/, SEO_RENDERERS), []);
  });
});
