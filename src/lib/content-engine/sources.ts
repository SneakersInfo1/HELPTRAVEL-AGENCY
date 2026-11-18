import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const SOURCE_ALLOWLIST: readonly string[] = [
  // Własne dane są dozwolone wyłącznie z publicznych tras HelpTravel; bramka
  // dodatkowo wymaga dla nich jawnego rodzaju `own_data`.
  "helptravel.pl",
  "visitmadeira.com",
  "webtenerife.com",
  "visitvalencia.com",
  "malaga.eu",
  "visitcostadelsol.com",
  "barcelonaturisme.com",
  "thisisathens.org",
  "turismoroma.it",
  "spain.info",
  "visitportugal.com",
  "visitgreece.gr",
  "italia.it",
  "whc.unesco.org",
  "gov.pl",
  "aena.es",
  "ipma.pt",
  "aemet.es",
  "wmo.int",
];

const HARD_DENY_HOST_PARTS = ["liteapi", "nuitee", "stripe", "duffel"] as const;
// Oficjalne portale turystyczne ważą 0,2–1,3 MB HTML (zmierzone 13.11.2026:
// visitgreece.gr 1,22 MB, italia.it 0,51 MB) — limit 500 kB odrzucał połowę źródeł.
const MAX_SOURCE_BYTES = 2_000_000;

export class SourcePolicyError extends Error {
  readonly name = "SourcePolicyError";
}

export class SourceFetchError extends Error {
  readonly name = "SourceFetchError";

  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

function hostMatches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`);
}

function isForbiddenHelpTravelPath(path: string): boolean {
  return (
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/hotele/szukaj" ||
    path.startsWith("/hotele/szukaj/") ||
    path === "/hotele/rezerwacja" ||
    path.startsWith("/hotele/rezerwacja/") ||
    path === "/loty" ||
    path.startsWith("/loty/")
  );
}

function parseSourceUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourcePolicyError(`Nieprawidłowy adres źródła: ${rawUrl}`);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = url.pathname.toLowerCase();
  if (url.protocol !== "https:") throw new SourcePolicyError("Źródło musi używać HTTPS");
  if (url.username !== "" || url.password !== "") throw new SourcePolicyError("Źródło nie może zawierać danych logowania");
  if (url.port !== "" && url.port !== "443") throw new SourcePolicyError("Źródło może używać wyłącznie domyślnego portu HTTPS 443");
  if (HARD_DENY_HOST_PARTS.some((part) => host.includes(part))) {
    throw new SourcePolicyError(`Host jest bezwarunkowo zablokowany: ${host}`);
  }
  if (hostMatches(host, "helptravel.pl") && isForbiddenHelpTravelPath(path)) {
    throw new SourcePolicyError("Silnik treści nie może wywoływać wyszukiwania ani rezerwacji HelpTravel");
  }
  return url;
}

export function assertAllowedSource(rawUrl: string): URL {
  const url = parseSourceUrl(rawUrl);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!SOURCE_ALLOWLIST.some((allowed) => hostMatches(host, allowed))) {
    throw new SourcePolicyError(`Host źródła nie znajduje się na liście dozwolonych: ${host}`);
  }
  return url;
}

export function isOwnDataSourceUrl(rawUrl: string): boolean {
  try {
    const url = assertAllowedSource(rawUrl);
    return hostMatches(url.hostname.toLowerCase().replace(/\.$/, ""), "helptravel.pl");
  } catch {
    return false;
  }
}

export interface SourceFetchResult {
  url: string;
  status: number;
  text: string;
  retrievedAt: string;
}

export interface SourceFetcher {
  fetchText(url: string): Promise<SourceFetchResult>;
}

export type FixtureSource = string | Omit<SourceFetchResult, "url"> | Error;

export class FixtureSourceFetcher implements SourceFetcher {
  private readonly fixtures: ReadonlyMap<string, FixtureSource>;

  constructor(fixtures: ReadonlyMap<string, FixtureSource> | Readonly<Record<string, FixtureSource>>, private readonly now: () => Date = () => new Date()) {
    this.fixtures = fixtures instanceof Map ? fixtures : new Map(Object.entries(fixtures));
  }

  async fetchText(rawUrl: string): Promise<SourceFetchResult> {
    const url = assertAllowedSource(rawUrl).href;
    const fixture = this.fixtures.get(rawUrl) ?? this.fixtures.get(url);
    if (fixture === undefined) throw new SourceFetchError(`Brak fixture źródła: ${url}`, 404);
    if (fixture instanceof Error) throw fixture;
    if (typeof fixture === "string") return { url, status: 200, text: fixture, retrievedAt: this.now().toISOString() };
    return { url, ...fixture };
  }
}

function decodeEntities(text: string): string {
  const named: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function readLimitedBody(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new SourceFetchError(`Źródło przekracza limit ${limit} B`, response.status);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new SourceFetchError(`Źródło przekracza limit ${limit} B`, response.status);
      output += decoder.decode(chunk.value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export interface HttpSourceFetcherOptions {
  fetch?: typeof fetch;
  resolver?: SourceHostResolver;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface ResolvedSourceAddress {
  address: string;
  family: number;
}

export type SourceHostResolver = (hostname: string) => Promise<readonly ResolvedSourceAddress[]>;

function forbiddenIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function ipv6Bytes(rawAddress: string): number[] | null {
  let address = rawAddress.toLowerCase().split("%", 1)[0];
  const ipv4 = address.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4) {
    const octets = ipv4.split(".").map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
    address = `${address.slice(0, -ipv4.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

export function isForbiddenSourceAddress(address: string): boolean {
  const family = isIP(address.split("%", 1)[0]);
  if (family === 4) return forbiddenIpv4(address);
  if (family !== 6) return true;
  const bytes = ipv6Bytes(address);
  if (!bytes) return true;
  const unspecified = bytes.every((value) => value === 0);
  const loopback = bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1;
  const ula = (bytes[0] & 0xfe) === 0xfc;
  const linkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  const mappedIpv4 = bytes.slice(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  return unspecified || loopback || ula || linkLocal || (mappedIpv4 && forbiddenIpv4(bytes.slice(12).join(".")));
}

async function defaultResolver(hostname: string): Promise<readonly ResolvedSourceAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

async function assertPublicResolution(hostname: string, resolver: SourceHostResolver): Promise<void> {
  let addresses: readonly ResolvedSourceAddress[];
  try {
    addresses = await resolver(hostname);
  } catch (error) {
    throw new SourceFetchError(`Nie udało się rozwiązać hosta źródła: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (addresses.length === 0) throw new SourcePolicyError("Host źródła nie ma żadnego adresu IP");
  const forbidden = addresses.find((entry) => isForbiddenSourceAddress(entry.address));
  if (forbidden) throw new SourcePolicyError(`Host źródła wskazuje niedozwolony adres IP: ${forbidden.address}`);
}

export class HttpSourceFetcher implements SourceFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly resolver: SourceHostResolver;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(options: HttpSourceFetcherOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.resolver = options.resolver ?? defaultResolver;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  }

  async fetchText(rawUrl: string): Promise<SourceFetchResult> {
    const parsedUrl = assertAllowedSource(rawUrl);
    await assertPublicResolution(parsedUrl.hostname, this.resolver);
    const url = parsedUrl.href;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // Redirect jest ręczny: inaczej dozwolony host mógłby przekierować do API rezerwacyjnego.
      const response = await this.fetchImpl(url, {
        headers: { "user-agent": "HelpTravelContentEngine/1.0" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.url) {
        const responseUrl = assertAllowedSource(response.url);
        if (responseUrl.hostname !== parsedUrl.hostname) await assertPublicResolution(responseUrl.hostname, this.resolver);
      }
      const body = await readLimitedBody(response, this.maxBytes);
      return {
        url,
        status: response.status,
        text: htmlToText(body),
        retrievedAt: this.now().toISOString(),
      };
    } catch (error) {
      if (error instanceof SourcePolicyError || error instanceof SourceFetchError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new SourceFetchError(`Źródło nie odpowiedziało w ${this.timeoutMs} ms`);
      }
      throw new SourceFetchError(error instanceof Error ? error.message : "Nieznany błąd pobierania źródła");
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeEvidence(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("pl-PL").replace(/\s+/g, " ").trim();
}

/** Decyzja jest czysto mechaniczna: po normalizacji musi istnieć dosłowny fragment. */
export function evidenceFoundIn(text: string, evidence: string): boolean {
  const needle = normalizeEvidence(evidence);
  return needle.length > 0 && normalizeEvidence(text).includes(needle);
}

