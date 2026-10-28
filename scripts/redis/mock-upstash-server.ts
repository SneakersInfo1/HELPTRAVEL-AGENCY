// Samodzielna atrapa Upstash na localhost — do lokalnego buildu i testów E2E
// w trybie awarii, BEZ dotykania produkcyjnego magazynu.
//
//   pnpm exec tsx scripts/redis/mock-upstash-server.ts --port 8799 --mode quota
//
// Potem uruchom aplikację z:
//   UPSTASH_REDIS_REST_URL=http://127.0.0.1:8799  UPSTASH_REDIS_REST_TOKEN=mock-token
// Tryb zmienisz w locie: GET http://127.0.0.1:8799/__mock/mode?m=ok|quota|http500|hang
// Statystyki (żądania, komendy, bajty):   GET http://127.0.0.1:8799/__mock/stats

import { startMockUpstash } from "../../src/lib/redis/testing/mock-upstash";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const port = Number(arg("port", "8799"));
  const mode = arg("mode", "ok");
  const mock = await startMockUpstash({ port });
  if (mode === "quota" || mode === "http500" || mode === "hang" || mode === "ok") mock.mode = mode;
  console.log(`[mock-upstash] ${mock.url} token=${mock.token} mode=${mock.mode}`);
  const stop = async () => {
    console.log(`[mock-upstash] stats ${JSON.stringify(mock.stats)}`);
    await mock.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
