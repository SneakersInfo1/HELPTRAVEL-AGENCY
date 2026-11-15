import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { serializeJsonLd } from "./jsonld-serialize";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

describe("zapis JSON-LD do znacznika script", () => {
  it("nie pozwala zamknąć znacznika wartością z danych", () => {
    const html = serializeJsonLd({ headline: "</script><script>globalThis.pwned=1</script>" });
    assert.equal(html.includes("</script>"), false);
    assert.equal(html.includes("<"), false);
    assert.equal(html.includes(">"), false);
  });

  it("po sparsowaniu daje dokładnie te same dane", () => {
    const data = { name: "Ateny & Rzym <3", list: ["a>b", `linia${String.fromCharCode(0x2028)}nowa`], n: 1.5, nested: { ok: true } };
    assert.deepEqual(JSON.parse(serializeJsonLd(data)), data);
  });

  it("żaden komponent nie wstawia surowego JSON.stringify do JSON-LD", () => {
    const offenders = sourceFiles("src").filter((file) => {
      const source = readFileSync(file, "utf8");
      return /application\/ld\+json/.test(source) && /__html:\s*JSON\.stringify\(/.test(source);
    });
    assert.deepEqual(offenders, []);
  });
});
