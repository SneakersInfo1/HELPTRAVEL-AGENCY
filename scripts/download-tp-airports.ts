// scripts/download-tp-airports.ts
//
// One-time fetch of Travelpayouts' open cities + airports datasets into
// data/.cache/. The harvest script reads these to resolve IATA codes for
// LiteAPI cities that aren't in our hand-curated `airportCodesByKey` map.
//
// Endpoints (no auth required, published openly by Travelpayouts):
//   https://api.travelpayouts.com/data/en/cities.json    (~2 MB, 9641 rows)
//   https://api.travelpayouts.com/data/en/airports.json  (~2.5 MB, 10354 rows)
//
// Run:
//   pnpm tsx scripts/download-tp-airports.ts
//
// The files are git-ignored (data/.cache/). Re-run weekly to pick up new
// airports/cities — Travelpayouts updates the datasets as new routes
// launch.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", ".cache");
const SOURCES = [
  { url: "https://api.travelpayouts.com/data/en/cities.json",   file: "tp-cities.json" },
  { url: "https://api.travelpayouts.com/data/en/airports.json", file: "tp-airports.json" },
];

async function main(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  for (const src of SOURCES) {
    process.stdout.write(`fetching ${src.url} ... `);
    const res = await fetch(src.url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error(`FAIL HTTP ${res.status}`);
      process.exit(1);
    }
    const body = await res.text();
    const out = path.join(CACHE_DIR, src.file);
    await fs.writeFile(out, body, "utf8");
    const parsed = JSON.parse(body);
    console.log(`${parsed.length} rows → ${path.relative(ROOT, out)}`);
  }
  console.log("done");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
