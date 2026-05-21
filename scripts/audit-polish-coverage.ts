import { promises as fs } from "node:fs";
import path from "node:path";

import { CITY_PL } from "../src/lib/mvp/i18n-geo";

interface SeedRecord {
  id: string;
  city: { en: string; pl: string };
  country: { en: string; pl: string };
  popularity: number;
}

interface SeedFile {
  destinations: SeedRecord[];
}

const ROOT = path.resolve(__dirname, "..");
const SEED_PATH = path.join(ROOT, "data", "destinations.json");

function hasVerifiedPolishName(record: SeedRecord): boolean {
  return record.city.pl !== record.city.en || CITY_PL[record.city.en] !== undefined;
}

async function main() {
  const raw = await fs.readFile(SEED_PATH, "utf8");
  const seed = JSON.parse(raw) as SeedFile;
  const total = seed.destinations.length;
  const exonymDifferent = seed.destinations.filter((record) => record.city.pl !== record.city.en).length;
  const verified = seed.destinations.filter(hasVerifiedPolishName).length;
  const missing = seed.destinations
    .filter((record) => record.city.pl === record.city.en && CITY_PL[record.city.en] === undefined)
    .sort((a, b) => b.popularity - a.popularity || a.city.en.localeCompare(b.city.en));

  console.error(`total=${total}`);
  console.error(`exonym_different=${exonymDifferent}/${total} (${Math.round((exonymDifferent / total) * 100)}%)`);
  console.error(`verified_polish_name=${verified}/${total} (${Math.round((verified / total) * 100)}%)`);
  console.error(`missing_verified=${missing.length}`);

  for (const record of missing) {
    console.log(`${record.id}\t${record.city.en}\t${record.country.en}\t${record.popularity}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
