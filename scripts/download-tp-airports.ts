// scripts/download-tp-airports.ts
//
// CLI wrapper. The actual download logic lives in
// src/lib/mvp/tp-airport-downloader.ts so the test suite can call it inline
// (cross-platform, no `pnpm.cmd` spawn).
//
// Run:
//   pnpm tsx scripts/download-tp-airports.ts
//
// Re-run weekly to pick up new airports/cities — Travelpayouts updates the
// datasets as new routes launch. Cache files are git-ignored (data/.cache/).

import { downloadTpAirports } from "../src/lib/mvp/tp-airport-downloader";

downloadTpAirports().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
