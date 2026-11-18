import assert from "node:assert/strict";
import test from "node:test";

import { isProtectedPath } from "./git-state";
import { indexPolicyHits } from "./index-guard";

test("strażnik łapie dodane w kodzie zmiany indeksowania", () => {
  const hits = indexPolicyHits([
    { file: "src/app/porownanie/[slug]/page.tsx", line: '  robots: { index: false, follow: true },' },
    { file: "src/app/x/page.tsx", line: '<meta name="robots" content="noindex" />' },
    { file: "src/app/y/page.tsx", line: "  alternates: { canonical: `/porownanie/${slug}` }," },
    { file: "src/app/z/page.tsx", line: '  if (!doc) permanentRedirect("/porownanie");' },
    { file: "src/lib/headers.ts", line: 'headers.set("X-Robots-Tag", "none");' },
    { file: "src/lib/seo/month-page-model.ts", line: "    indexable: false," },
    { file: "src/lib/seo/guide-page-model.ts", line: "  model.indexable = profile.curated;" },
  ]);
  assert.equal(hits.length, 7);
  assert.match(hits[5], /month-page-model\.ts \(indexable\)/);
  assert.match(hits[0], /page\.tsx \(index: false\)/);
  assert.match(hits[1], /\(noindex\)/);
  assert.match(hits[2], /\(canonical\)/);
  assert.match(hits[3], /\(przekierowanie\)/);
});

test("strażnik pomija treść content/seo, dokumentację i zwykłe użycie canonicalUrl", () => {
  assert.deepEqual(
    indexPolicyHits([
      { file: "content/seo/comparison/barcelona-vs-malaga.json", line: '  "canonicalUrl": "/porownanie/barcelona-spain-vs-malaga-spain",' },
      { file: "docs/seo/daily/PROCEDURE.md", line: "Nie zmieniaj tagów noindex bez właściciela." },
      { file: "src/components/RelatedLinks.tsx", line: "  <Link href={doc.canonicalUrl}>{doc.title}</Link>" },
      { file: "src/lib/seo/links.ts", line: "const indexable = pages.filter((page) => page.indexable);" },
      { file: "src/lib/seo/links.ts", line: "if (page.indexable === false) continue;" },
    ]),
    [],
  );
});

test("pliki konfiguracji przekierowań i robots są chronione", () => {
  for (const file of ["vercel.json", "public/robots.txt", "next.config.ts", "src/app/robots.ts", ".claude/settings.json"]) {
    assert.equal(isProtectedPath(file), true, file);
  }
  assert.equal(isProtectedPath("src/app/porownanie/[slug]/page.tsx"), false);
});
