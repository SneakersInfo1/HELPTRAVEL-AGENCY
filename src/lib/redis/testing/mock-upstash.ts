// Atrapa REST API Upstash na localhost — do testów integracyjnych i pomiaru
// transferu „przed/po". NIE jest używana w kodzie produkcyjnym.
//
// Obsługuje podzbiór komend używany przez aplikację (GET/SET/MGET/DEL/HGET/
// HSET/HGETALL/EXPIRE/PING), potoki (`/pipeline`, `/multi-exec`) oraz nagłówek
// `Upstash-Encoding: base64`, którego używa domyślny klient SDK — dzięki temu
// pomiar bajtów odpowiedzi odzwierciedla realny narzut kodowania.
//
// Tryby awarii: `quota` (dokładny komunikat z produkcji 2026-10-25), `http500`,
// `hang` (brak odpowiedzi do zamknięcia serwera) i `delayMs`.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const QUOTA_MESSAGE =
  "ERR This database has reached current Fixed plan limits. Please upgrade manually or enable auto upgrade on Upstash Console";

type Entry = { kind: "string"; value: string; expireAt?: number } | { kind: "hash"; value: Map<string, string>; expireAt?: number };

export interface MockUpstashStats {
  requests: number;
  commands: number;
  /** Bajty treści żądań (to, co klient wysłał). */
  bytesIn: number;
  /** Bajty treści odpowiedzi (to, co klient pobrał). */
  bytesOut: number;
  base64Requests: number;
  commandNames: Record<string, number>;
}

export interface MockUpstash {
  url: string;
  token: string;
  mode: "ok" | "quota" | "http500" | "hang";
  delayMs: number;
  stats: MockUpstashStats;
  store: Map<string, Entry>;
  resetStats(): void;
  close(): Promise<void>;
}

function emptyStats(): MockUpstashStats {
  return { requests: 0, commands: 0, bytesIn: 0, bytesOut: 0, base64Requests: 0, commandNames: {} };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function encodeResult(value: unknown, base64: boolean): unknown {
  if (!base64) return value;
  if (typeof value === "string") return value === "OK" ? value : Buffer.from(value, "utf8").toString("base64");
  if (Array.isArray(value)) return value.map((v) => encodeResult(v, base64));
  return value;
}

export async function startMockUpstash(opts: { port?: number } = {}): Promise<MockUpstash> {
  const store = new Map<string, Entry>();
  const pending = new Set<ServerResponse>();
  const state: MockUpstash = {
    url: "",
    token: "mock-token",
    mode: "ok",
    delayMs: 0,
    stats: emptyStats(),
    store,
    resetStats() {
      state.stats = emptyStats();
    },
    close: async () => {},
  };

  const live = (key: string): Entry | undefined => {
    const e = store.get(key);
    if (e?.expireAt !== undefined && e.expireAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  };

  function exec(cmd: unknown[]): { result?: unknown; error?: string } {
    const name = String(cmd[0]).toLowerCase();
    state.stats.commandNames[name] = (state.stats.commandNames[name] ?? 0) + 1;
    const key = String(cmd[1] ?? "");
    switch (name) {
      case "ping":
        return { result: "PONG" };
      case "get": {
        const e = live(key);
        return { result: e && e.kind === "string" ? e.value : null };
      }
      case "set": {
        const opts = cmd.slice(3).map((x) => String(x).toLowerCase());
        const nx = opts.includes("nx");
        if (nx && live(key)) return { result: null };
        const exIdx = opts.indexOf("ex");
        const expireAt = exIdx >= 0 ? Date.now() + Number(cmd[3 + exIdx + 1]) * 1000 : undefined;
        store.set(key, { kind: "string", value: String(cmd[2]), expireAt });
        return { result: "OK" };
      }
      case "mget":
        return {
          result: cmd.slice(1).map((k) => {
            const e = live(String(k));
            return e && e.kind === "string" ? e.value : null;
          }),
        };
      case "del": {
        let n = 0;
        for (const k of cmd.slice(1)) if (store.delete(String(k))) n += 1;
        return { result: n };
      }
      case "expire": {
        const e = live(key);
        if (!e) return { result: 0 };
        e.expireAt = Date.now() + Number(cmd[2]) * 1000;
        return { result: 1 };
      }
      case "hset": {
        let e = live(key);
        if (!e || e.kind !== "hash") {
          e = { kind: "hash", value: new Map() };
          store.set(key, e);
        }
        let added = 0;
        for (let i = 2; i + 1 < cmd.length; i += 2) {
          if (!e.value.has(String(cmd[i]))) added += 1;
          e.value.set(String(cmd[i]), String(cmd[i + 1]));
        }
        return { result: added };
      }
      case "hget": {
        const e = live(key);
        return { result: e && e.kind === "hash" ? (e.value.get(String(cmd[2])) ?? null) : null };
      }
      case "hgetall": {
        const e = live(key);
        if (!e || e.kind !== "hash") return { result: [] };
        return { result: [...e.value].flat() };
      }
      case "evalsha":
        return { error: "NOSCRIPT No matching script. Please use EVAL." };
      default:
        return { error: `ERR unknown command '${name}' (mock)` };
    }
  }

  const server: Server = createServer(async (req, res) => {
    // Sterowanie atrapą (poza API Upstash) — dla testów ręcznych i E2E:
    //   GET /__mock/mode?m=ok|quota|http500|hang   GET /__mock/stats   GET /__mock/reset
    if (req.method === "GET" && req.url?.startsWith("/__mock/")) {
      const u = new URL(req.url, "http://mock");
      if (u.pathname === "/__mock/mode") {
        const m = u.searchParams.get("m");
        if (m === "ok" || m === "quota" || m === "http500" || m === "hang") state.mode = m;
      } else if (u.pathname === "/__mock/reset") {
        state.resetStats();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ mode: state.mode, stats: state.stats, keys: store.size }));
      return;
    }
    const body = await readBody(req);
    state.stats.requests += 1;
    state.stats.bytesIn += Buffer.byteLength(body, "utf8");
    const base64 = String(req.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
    if (base64) state.stats.base64Requests += 1;

    const send = (status: number, payload: unknown) => {
      const text = JSON.stringify(payload);
      state.stats.bytesOut += Buffer.byteLength(text, "utf8");
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(text);
    };

    if (state.mode === "hang") {
      pending.add(res);
      return;
    }
    if (state.delayMs > 0) await new Promise((r) => setTimeout(r, state.delayMs));
    if (req.headers.authorization !== `Bearer ${state.token}`) return send(401, { error: "Unauthorized" });

    const parsed = JSON.parse(body) as unknown[];
    const pipeline = req.url?.includes("pipeline") || req.url?.includes("multi-exec");
    const commands = (pipeline ? parsed : [parsed]) as unknown[][];
    state.stats.commands += commands.length;

    if (state.mode === "quota") return send(400, { error: QUOTA_MESSAGE });
    if (state.mode === "http500") return send(500, { error: "ERR internal" });

    if (pipeline) {
      return send(
        200,
        commands.map((c) => {
          const r = exec(c);
          return r.error ? { error: r.error } : { result: encodeResult(r.result, base64) };
        }),
      );
    }
    const r = exec(commands[0]);
    if (r.error) return send(400, { error: r.error });
    return send(200, { result: encodeResult(r.result, base64) });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  state.url = `http://127.0.0.1:${port}`;
  state.close = () =>
    new Promise<void>((resolve) => {
      for (const res of pending) res.destroy();
      pending.clear();
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  return state;
}
