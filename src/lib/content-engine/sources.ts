export const SOURCE_ALLOWLIST: readonly string[] = [
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

export function assertAllowedSource(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourcePolicyError(`Nieprawidłowy adres źródła: ${rawUrl}`);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = url.pathname.toLowerCase();
  if (url.protocol !== "https:") throw new SourcePolicyError("Źródło musi używać HTTPS");
  if (HARD_DENY_HOST_PARTS.some((part) => host.includes(part))) {
    throw new SourcePolicyError(`Host jest bezwarunkowo zablokowany: ${host}`);
  }
  if (hostMatches(host, "helptravel.pl")) {
    const forbiddenPath =
      path === "/api" ||
      path.startsWith("/api/") ||
      path === "/hotele/szukaj" ||
      path.startsWith("/hotele/szukaj/") ||
      path === "/hotele/rezerwacja" ||
      path.startsWith("/hotele/rezerwacja/") ||
      path === "/loty" ||
      path.startsWith("/loty/");
    if (forbiddenPath) throw new SourcePolicyError("Silnik treści nie może wywoływać wyszukiwania ani rezerwacji HelpTravel");
  }
  if (!SOURCE_ALLOWLIST.some((allowed) => hostMatches(host, allowed))) {
    throw new SourcePolicyError(`Host źródła nie znajduje się na liście dozwolonych: ${host}`);
  }
  return url;
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
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
}

export class HttpSourceFetcher implements SourceFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(options: HttpSourceFetcherOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  }

  async fetchText(rawUrl: string): Promise<SourceFetchResult> {
    const url = assertAllowedSource(rawUrl).href;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // Redirect jest ręczny: inaczej dozwolony host mógłby przekierować do API rezerwacyjnego.
      const response = await this.fetchImpl(url, {
        headers: { "user-agent": "HelpTravelContentEngine/1.0" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.url) assertAllowedSource(response.url);
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

