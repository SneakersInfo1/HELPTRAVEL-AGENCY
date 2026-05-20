// Travelpayouts open city/airport dataset downloader.
//
// Used by:
//   • scripts/download-tp-airports.ts (CLI: `pnpm tsx scripts/...`)
//   • src/lib/mvp/tp-airport-directory.test.ts (test setup)
//
// Replaces the previous test-setup pattern that spawned a `pnpm.cmd` child
// process — that failed on Windows + Node 22.12+ (CVE-2024-27980 changed
// .cmd spawn rules: `spawnSync pnpm.cmd EINVAL`). Calling the downloader
// in-process is cross-platform, faster, and gives real stack traces.
//
// Endpoints are public, unauthenticated, and stable (Travelpayouts open data):
//   https://api.travelpayouts.com/data/en/cities.json    (~2 MB,  9 641 rows)
//   https://api.travelpayouts.com/data/en/airports.json  (~2.5 MB, 10 354 rows)

import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCES = [
  {
    url: "https://api.travelpayouts.com/data/en/cities.json",
    file: "tp-cities.json",
  },
  {
    url: "https://api.travelpayouts.com/data/en/airports.json",
    file: "tp-airports.json",
  },
] as const;

const REQUIRED_FILES = SOURCES.map((s) => s.file);

export interface DownloadOptions {
  /** Defaults to `<cwd>/data/.cache`. */
  cacheDir?: string;
  /** Suppress progress lines (use in tests). */
  quiet?: boolean;
}

function resolveCacheDir(cacheDir?: string): string {
  return cacheDir ?? path.resolve(process.cwd(), "data", ".cache");
}

/** Always downloads (overwrites). Throws on HTTP error or write failure. */
export async function downloadTpAirports(
  opts: DownloadOptions = {},
): Promise<void> {
  const cacheDir = resolveCacheDir(opts.cacheDir);
  const quiet = opts.quiet ?? false;
  await fs.mkdir(cacheDir, { recursive: true });
  for (const src of SOURCES) {
    if (!quiet) process.stdout.write(`fetching ${src.url} ... `);
    const res = await fetch(src.url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Travelpayouts ${src.url}: HTTP ${res.status}`);
    }
    const body = await res.text();
    const out = path.join(cacheDir, src.file);
    await fs.writeFile(out, body, "utf8");
    if (!quiet) {
      const parsed = JSON.parse(body) as unknown[];
      console.log(
        `${parsed.length} rows → ${path.relative(process.cwd(), out)}`,
      );
    }
  }
  if (!quiet) console.log("done");
}

/** Idempotent — downloads only if any required cache file is missing. */
export async function ensureTpAirportsCache(
  opts: DownloadOptions = {},
): Promise<void> {
  const cacheDir = resolveCacheDir(opts.cacheDir);
  const checks = await Promise.all(
    REQUIRED_FILES.map(async (f) => {
      try {
        await fs.access(path.join(cacheDir, f));
        return true;
      } catch {
        return false;
      }
    }),
  );
  if (checks.every(Boolean)) return;
  await downloadTpAirports(opts);
}
