import { createSign } from "node:crypto";

import type { GscCsvInputs } from "@/lib/content-engine/pipeline";

import type { GscRow } from "./csv";

export const SEO_GSC_SERVICE_ACCOUNT_JSON = "SEO_GSC_SERVICE_ACCOUNT_JSON";
export const SEO_GSC_SITE_URL = "SEO_GSC_SITE_URL";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_ANALYTICS_BASE_URL = "https://www.googleapis.com/webmasters/v3/sites";
const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const API_ROW_LIMIT = 25_000;
const DEFAULT_MAX_ROWS = 100_000;
const PAGE_QUERY_MAX_ROWS = 25_000;

export type GscApiErrorCode =
  | "BLOCKED_AUTH"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "INVALID_SERVICE_ACCOUNT"
  | "INVALID_ARGUMENT"
  | "JWT_SIGNING_FAILED"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT";

export class GscApiError extends Error {
  readonly name = "GscApiError";

  constructor(
    message: string,
    readonly status: number | undefined,
    readonly code: GscApiErrorCode,
  ) {
    super(message);
  }
}

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKeyPem: string;
}

export interface ServiceAccountJwtOptions extends ServiceAccountCredentials {
  now: Date;
}

export type GscSleep = (milliseconds: number) => Promise<void>;

interface RequestRuntime {
  fetchImpl: typeof fetch;
  sleep: GscSleep;
  timeoutMs: number;
}

export interface FetchAccessTokenOptions extends ServiceAccountCredentials {
  fetchImpl?: typeof fetch;
  now?: Date;
  sleep?: GscSleep;
  timeoutMs?: number;
}

export type GscDimension = "page" | "query" | "date";

export interface GscSearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface QuerySearchAnalyticsOptions {
  siteUrl: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  dimensions: readonly GscDimension[];
  rowLimit?: number;
  startRow?: number;
  maxRows?: number;
  fetchImpl?: typeof fetch;
  sleep?: GscSleep;
  timeoutMs?: number;
}

export interface GscExport {
  range: { startDate: string; endDate: string };
  pages: GscRow[];
  queries: GscRow[];
  daily: GscRow[];
  pageQuery: Array<GscRow & { page: string; query: string }>;
}

export interface FetchGscExportOptions {
  siteUrl: string;
  serviceAccountJson: string;
  endDate?: string;
  days?: number;
  /** Pary strona × zapytanie to do 25 000 wierszy; pobieraj tylko, gdy są używane. */
  includePageQuery?: boolean;
  fetchImpl?: typeof fetch;
  now?: Date;
  sleep?: GscSleep;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runtimeOf(options: { fetchImpl?: typeof fetch; sleep?: GscSleep; timeoutMs?: number }): RequestRuntime {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new GscApiError("Limit czasu żądania musi być dodatnią liczbą.", undefined, "INVALID_ARGUMENT");
  }
  return {
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? defaultSleep,
    timeoutMs,
  };
}

export function parseServiceAccountJson(json: string): ServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new GscApiError("Sekret konta usługi Google nie jest poprawnym JSON-em.", undefined, "INVALID_SERVICE_ACCOUNT");
  }
  if (
    !isRecord(parsed) ||
    parsed.type !== "service_account" ||
    typeof parsed.client_email !== "string" ||
    parsed.client_email.trim() === "" ||
    typeof parsed.private_key !== "string" ||
    parsed.private_key.trim() === ""
  ) {
    throw new GscApiError(
      "Sekret konta usługi Google musi zawierać type=service_account, client_email i private_key.",
      undefined,
      "INVALID_SERVICE_ACCOUNT",
    );
  }
  return { clientEmail: parsed.client_email, privateKeyPem: parsed.private_key };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createServiceAccountJwt({ clientEmail, privateKeyPem, now }: ServiceAccountJwtOptions): string {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  if (!Number.isFinite(issuedAt)) {
    throw new GscApiError("Czas podpisania JWT jest niepoprawny.", undefined, "INVALID_ARGUMENT");
  }
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlJson({
    iss: clientEmail,
    scope: READ_ONLY_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3_600,
  });
  const signingInput = `${header}.${claims}`;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(privateKeyPem).toString("base64url")}`;
  } catch {
    // Błędy OpenSSL bywają szczegółowe; stabilny komunikat nie ryzykuje ujawnienia klucza.
    throw new GscApiError("Nie udało się podpisać JWT konta usługi Google.", undefined, "JWT_SIGNING_FAILED");
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function requestWithRetry(url: string, init: RequestInit, runtime: RequestRuntime): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
    let response: Response;
    try {
      response = await runtime.fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        throw new GscApiError("Przekroczono limit czasu żądania do Google.", undefined, "REQUEST_TIMEOUT");
      }
      // Nie przekazujemy komunikatu fetch, bo mógł zawierać body z JWT.
      throw new GscApiError("Nie udało się połączyć z API Google.", undefined, "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
    }

    if (!isRetryableStatus(response.status) || attempt === MAX_REQUEST_ATTEMPTS) return response;
    try {
      await runtime.sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    } catch {
      throw new GscApiError("Nie udało się odczekać przed ponowieniem żądania do Google.", response.status, "NETWORK_ERROR");
    }
  }
  throw new GscApiError("Nie udało się wykonać żądania do Google.", undefined, "NETWORK_ERROR");
}

// Komunikat Google („API not enabled", „insufficient permission", „Invalid JWT
// Signature") odróżnia przyczyny, których sam kod HTTP nie rozróżnia. Odpowiedzi
// błędów nie powinny zawierać sekretów, ale nie zakładamy tego: wycinamy znane
// wartości i wszystko, co wygląda jak JWT, token dostępu albo klucz PEM.
function sanitizeDetail(raw: string, secrets: readonly string[]): string | null {
  let text = raw;
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[usunięto]");
  }
  text = text
    .replace(/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, "[usunięto]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[usunięto]")
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[usunięto]")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 240) : null;
}

function googleErrorDetail(payload: unknown, secrets: readonly string[]): string | null {
  if (!isRecord(payload)) return null;
  const parts: string[] = [];
  if (isRecord(payload.error) && typeof payload.error.message === "string") parts.push(payload.error.message);
  // W odpowiedzi OAuth `error` to krótki kod („invalid_grant"); dowolny inny napis pomijamy.
  if (typeof payload.error === "string" && /^[a-z_]{3,40}$/.test(payload.error)) parts.push(payload.error);
  if (typeof payload.error_description === "string") parts.push(payload.error_description);
  return parts.length > 0 ? sanitizeDetail(parts.join(": "), secrets) : null;
}

async function failForResponse(response: Response, secrets: readonly string[]): Promise<never> {
  let detail: string | null = null;
  try {
    detail = googleErrorDetail((await response.json()) as unknown, secrets);
  } catch {
    // Odpowiedź bez JSON-u — zostaje sam kod HTTP.
  }
  const suffix = detail ? ` Odpowiedź Google: ${detail}` : "";
  if (response.status === 401 || response.status === 403) {
    throw new GscApiError(
      `Konto usługi nie ma dostępu do usługi w Search Console albo API Search Console nie jest włączone.${suffix}`,
      response.status,
      "BLOCKED_AUTH",
    );
  }
  throw new GscApiError(`API Google zwróciło błąd HTTP ${response.status}.${suffix}`, response.status, "HTTP_ERROR");
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new GscApiError("API Google zwróciło niepoprawną odpowiedź JSON.", response.status, "INVALID_RESPONSE");
  }
}

export async function fetchAccessToken(options: FetchAccessTokenOptions): Promise<string> {
  const runtime = runtimeOf(options);
  const jwt = createServiceAccountJwt({
    clientEmail: options.clientEmail,
    privateKeyPem: options.privateKeyPem,
    now: options.now ?? new Date(),
  });
  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", jwt);
  const response = await requestWithRetry(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    runtime,
  );
  if (!response.ok) await failForResponse(response, [jwt, options.privateKeyPem]);
  const payload = await responseJson(response);
  if (!isRecord(payload) || typeof payload.access_token !== "string" || payload.access_token === "") {
    throw new GscApiError("Odpowiedź OAuth nie zawiera access_token.", response.status, "INVALID_RESPONSE");
  }
  return payload.access_token;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new GscApiError(`${name} musi być dodatnią liczbą całkowitą.`, undefined, "INVALID_ARGUMENT");
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new GscApiError(`${name} musi być nieujemną liczbą całkowitą.`, undefined, "INVALID_ARGUMENT");
  }
  return value;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function searchAnalyticsRows(payload: unknown, status: number): GscSearchAnalyticsRow[] {
  if (!isRecord(payload)) {
    throw new GscApiError("Search Analytics API zwróciło niepoprawny obiekt.", status, "INVALID_RESPONSE");
  }
  if (payload.rows === undefined) return [];
  if (!Array.isArray(payload.rows)) {
    throw new GscApiError("Pole rows w odpowiedzi Search Analytics API ma niepoprawny format.", status, "INVALID_RESPONSE");
  }
  return payload.rows.map((value) => {
    if (
      !isRecord(value) ||
      !Array.isArray(value.keys) ||
      !value.keys.every((key) => typeof key === "string") ||
      !finiteNumber(value.clicks) ||
      !finiteNumber(value.impressions) ||
      !finiteNumber(value.ctr) ||
      !finiteNumber(value.position)
    ) {
      throw new GscApiError("Wiersz Search Analytics API ma niepoprawny format.", status, "INVALID_RESPONSE");
    }
    return {
      keys: value.keys,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: value.ctr,
      position: value.position,
    };
  });
}

export async function querySearchAnalytics(options: QuerySearchAnalyticsOptions): Promise<GscSearchAnalyticsRow[]> {
  const runtime = runtimeOf(options);
  const rowLimit = positiveInteger(options.rowLimit ?? API_ROW_LIMIT, "rowLimit");
  if (rowLimit > API_ROW_LIMIT) {
    throw new GscApiError(`rowLimit nie może przekraczać ${API_ROW_LIMIT}.`, undefined, "INVALID_ARGUMENT");
  }
  let startRow = nonNegativeInteger(options.startRow ?? 0, "startRow");
  const maxRows = nonNegativeInteger(options.maxRows ?? DEFAULT_MAX_ROWS, "maxRows");
  if (maxRows === 0) return [];

  const url = `${SEARCH_ANALYTICS_BASE_URL}/${encodeURIComponent(options.siteUrl)}/searchAnalytics/query`;
  const rows: GscSearchAnalyticsRow[] = [];
  while (rows.length < maxRows) {
    const currentRowLimit = Math.min(rowLimit, maxRows - rows.length);
    const response = await requestWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          startDate: options.startDate,
          endDate: options.endDate,
          dimensions: options.dimensions,
          rowLimit: currentRowLimit,
          startRow,
          dataState: "final",
          type: "web",
        }),
      },
      runtime,
    );
    if (!response.ok) await failForResponse(response, [options.accessToken]);
    const page = searchAnalyticsRows(await responseJson(response), response.status);
    if (page.length === 0) break;
    rows.push(...page.slice(0, maxRows - rows.length));
    startRow += page.length;
  }
  return rows;
}

function isoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GscApiError("Data musi mieć format YYYY-MM-DD.", undefined, "INVALID_ARGUMENT");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GscApiError("Data musi wskazywać istniejący dzień.", undefined, "INVALID_ARGUMENT");
  }
  return parsed;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function singleDimensionRow(row: GscSearchAnalyticsRow): GscRow {
  const key = row.keys[0];
  if (key === undefined) {
    throw new GscApiError("Wiersz Search Analytics API nie zawiera klucza wymiaru.", 200, "INVALID_RESPONSE");
  }
  return { key, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

function pageQueryRow(row: GscSearchAnalyticsRow): GscRow & { page: string; query: string } {
  const [page, query] = row.keys;
  if (page === undefined || query === undefined) {
    throw new GscApiError("Wiersz page/query nie zawiera obu kluczy wymiarów.", 200, "INVALID_RESPONSE");
  }
  return { ...singleDimensionRow(row), page, query };
}

export async function fetchGscExport(options: FetchGscExportOptions): Promise<GscExport> {
  const days = positiveInteger(options.days ?? 92, "days");
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new GscApiError("Bieżący czas jest niepoprawny.", undefined, "INVALID_ARGUMENT");
  }
  const end = options.endDate
    ? isoDate(options.endDate)
    : (() => {
        const delayed = new Date(now.getTime());
        delayed.setUTCDate(delayed.getUTCDate() - 3);
        return isoDate(formatIsoDate(delayed));
      })();
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const range = { startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
  const credentials = parseServiceAccountJson(options.serviceAccountJson);
  const requestOptions = {
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
    timeoutMs: options.timeoutMs,
  };
  const accessToken = await fetchAccessToken({ ...credentials, now, ...requestOptions });
  const query = (dimensions: readonly GscDimension[], maxRows = DEFAULT_MAX_ROWS) =>
    querySearchAnalytics({
      siteUrl: options.siteUrl,
      accessToken,
      ...range,
      dimensions,
      maxRows,
      ...requestOptions,
    });

  const pages = (await query(["page"])).map(singleDimensionRow);
  const queries = (await query(["query"])).map(singleDimensionRow);
  const daily = (await query(["date"])).map(singleDimensionRow);
  const pageQuery = options.includePageQuery === false ? [] : (await query(["page", "query"], PAGE_QUERY_MAX_ROWS)).map(pageQueryRow);
  return { range, pages, queries, daily, pageQuery };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsToCsv(dimension: string, rows: readonly GscRow[]): string {
  const records = rows.map((row) =>
    [csvCell(row.key), String(row.clicks), String(row.impressions), String(row.ctr), String(row.position)].join(","),
  );
  return [`${dimension},Clicks,Impressions,CTR,Position`, ...records].join("\n") + "\n";
}

export function toGscCsvInputs(gscExport: GscExport): GscCsvInputs {
  return {
    pages: rowsToCsv("Page", gscExport.pages),
    queries: rowsToCsv("Query", gscExport.queries),
    daily: rowsToCsv("Date", gscExport.daily),
  };
}
