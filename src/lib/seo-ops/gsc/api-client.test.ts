import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";

import {
  GscApiError,
  createServiceAccountJwt,
  fetchAccessToken,
  fetchGscExport,
  parseServiceAccountJson,
  querySearchAnalytics,
  toGscCsvInputs,
  type GscExport,
  type GscSearchAnalyticsRow,
} from "./api-client";
import { parseGscCsv, type GscRow } from "./csv";

const CLIENT_EMAIL = "gsc-reader@example.iam.gserviceaccount.com";
const NOW = new Date("2026-11-14T16:17:18.456Z");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  client_email: CLIENT_EMAIL,
  private_key: PRIVATE_KEY_PEM,
});

interface FetchCall {
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => handler({ url: String(input), init: init ?? {} })) as typeof fetch;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function bodyText(init: RequestInit): string {
  const body = init.body;
  if (typeof body !== "string") throw new TypeError("Oczekiwano tekstowego body żądania");
  return body;
}

function bodyRecord(init: RequestInit): Record<string, unknown> {
  const value: unknown = JSON.parse(bodyText(init));
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
}

function apiRow(keys: string[], values: Partial<Omit<GscSearchAnalyticsRow, "keys">> = {}): GscSearchAnalyticsRow {
  return {
    keys,
    clicks: values.clicks ?? 1,
    impressions: values.impressions ?? 10,
    ctr: values.ctr ?? 0.1,
    position: values.position ?? 4.5,
  };
}

const QUERY_BASE = {
  siteUrl: "sc-domain:helptravel.pl",
  accessToken: "access-token-for-test",
  startDate: "2026-08-12",
  endDate: "2026-11-11",
  dimensions: ["page"] as const,
};

describe("konto usługi i JWT", () => {
  it("waliduje JSON konta usługi bez ujawniania klucza", () => {
    assert.deepEqual(parseServiceAccountJson(SERVICE_ACCOUNT_JSON), {
      clientEmail: CLIENT_EMAIL,
      privateKeyPem: PRIVATE_KEY_PEM,
    });

    const invalid = JSON.stringify({ type: "user", client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY_PEM });
    assert.throws(
      () => parseServiceAccountJson(invalid),
      (error: unknown) => {
        assert.ok(error instanceof GscApiError);
        assert.equal(error.code, "INVALID_SERVICE_ACCOUNT");
        assert.equal(error.message.includes(PRIVATE_KEY_PEM), false);
        return true;
      },
    );
  });

  it("podpisuje JWT algorytmem RS256 i ustawia wymagane claims", () => {
    const jwt = createServiceAccountJwt({ clientEmail: CLIENT_EMAIL, privateKeyPem: PRIVATE_KEY_PEM, now: NOW });
    const parts = jwt.split(".");
    assert.equal(parts.length, 3);
    assert.deepEqual(decodeJwtPart(parts[0]), { alg: "RS256", typ: "JWT" });
    const issuedAt = Math.floor(NOW.getTime() / 1_000);
    assert.deepEqual(decodeJwtPart(parts[1]), {
      iss: CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: issuedAt,
      exp: issuedAt + 3_600,
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    assert.equal(verifier.verify(publicKey, Buffer.from(parts[2], "base64url")), true);
  });
});

describe("OAuth", () => {
  it("wymienia assertion na token przez formularz POST", async () => {
    const calls: FetchCall[] = [];
    const token = await fetchAccessToken({
      clientEmail: CLIENT_EMAIL,
      privateKeyPem: PRIVATE_KEY_PEM,
      now: NOW,
      fetchImpl: mockFetch((call) => {
        calls.push(call);
        return jsonResponse({ access_token: "token-from-google" });
      }),
    });

    assert.equal(token, "token-from-google");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(new Headers(calls[0].init.headers).get("content-type"), "application/x-www-form-urlencoded");
    const form = new URLSearchParams(bodyText(calls[0].init));
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(form.get("assertion")?.split(".").length, 3);
  });

  it("nie przenosi JWT ani klucza do błędu transportowego", async () => {
    let assertion = "";
    await assert.rejects(
      fetchAccessToken({
        clientEmail: CLIENT_EMAIL,
        privateKeyPem: PRIVATE_KEY_PEM,
        now: NOW,
        fetchImpl: mockFetch((call) => {
          assertion = new URLSearchParams(bodyText(call.init)).get("assertion") ?? "";
          throw new Error(`niskopoziomowy błąd: ${assertion}`);
        }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GscApiError);
        assert.equal(error.code, "NETWORK_ERROR");
        assert.notEqual(assertion, "");
        assert.equal(error.message.includes(assertion), false);
        assert.equal(error.message.includes(PRIVATE_KEY_PEM), false);
        return true;
      },
    );
  });
});

describe("Search Analytics API", () => {
  it("stronicuje dwie strony aż do pustej odpowiedzi", async () => {
    const pages = [
      { rows: [apiRow(["https://helptravel.pl/a"]), apiRow(["https://helptravel.pl/b"])] },
      { rows: [apiRow(["https://helptravel.pl/c"]), apiRow(["https://helptravel.pl/d"])] },
      { rows: [] },
    ];
    const calls: FetchCall[] = [];
    const rows = await querySearchAnalytics({
      ...QUERY_BASE,
      rowLimit: 2,
      maxRows: 10,
      fetchImpl: mockFetch((call) => {
        calls.push(call);
        return jsonResponse(pages[calls.length - 1]);
      }),
    });

    assert.deepEqual(
      rows.map((row) => row.keys[0]),
      ["https://helptravel.pl/a", "https://helptravel.pl/b", "https://helptravel.pl/c", "https://helptravel.pl/d"],
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map((call) => bodyRecord(call.init).startRow), [0, 2, 4]);
    assert.equal(calls[0].url, "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Ahelptravel.pl/searchAnalytics/query");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(new Headers(calls[0].init.headers).get("authorization"), `Bearer ${QUERY_BASE.accessToken}`);
    assert.deepEqual(bodyRecord(calls[0].init), {
      startDate: QUERY_BASE.startDate,
      endDate: QUERY_BASE.endDate,
      dimensions: ["page"],
      rowLimit: 2,
      startRow: 0,
      dataState: "final",
      type: "web",
    });
  });

  it("traktuje odpowiedź bez rows jako pustą listę", async () => {
    const rows = await querySearchAnalytics({
      ...QUERY_BASE,
      fetchImpl: mockFetch(() => jsonResponse({ responseAggregationType: "byPage" })),
    });
    assert.deepEqual(rows, []);
  });

  it("ponawia żądanie po 429 bez rzeczywistego czekania", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const rows = await querySearchAnalytics({
      ...QUERY_BASE,
      maxRows: 1,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      fetchImpl: mockFetch(() => {
        attempts += 1;
        return attempts === 1 ? jsonResponse({ error: "rate limit" }, 429) : jsonResponse({ rows: [apiRow(["/po-429"])] });
      }),
    });
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [250]);
    assert.equal(rows[0].keys[0], "/po-429");
  });

  it("ponawia żądanie po 500 z wykładniczym odstępem i limitem trzech prób", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const rows = await querySearchAnalytics({
      ...QUERY_BASE,
      maxRows: 1,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      fetchImpl: mockFetch(() => {
        attempts += 1;
        return attempts < 3 ? jsonResponse({ error: "temporary" }, 500) : jsonResponse({ rows: [apiRow(["/po-500"])] });
      }),
    });
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [250, 500]);
    assert.equal(rows[0].keys[0], "/po-500");
  });

  it("mapuje 403 na BLOCKED_AUTH i nie ujawnia tokenu", async () => {
    await assert.rejects(
      querySearchAnalytics({
        ...QUERY_BASE,
        fetchImpl: mockFetch(() => jsonResponse({ error: QUERY_BASE.accessToken }, 403)),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GscApiError);
        assert.equal(error.status, 403);
        assert.equal(error.code, "BLOCKED_AUTH");
        assert.match(error.message, /konto usługi nie ma dostępu/i);
        assert.equal(error.message.includes(QUERY_BASE.accessToken), false);
        return true;
      },
    );
  });

  it("dołącza komunikat Google do błędu 403, bo sam kod nie rozróżnia przyczyn", async () => {
    await assert.rejects(
      querySearchAnalytics({
        ...QUERY_BASE,
        fetchImpl: mockFetch(() =>
          jsonResponse({ error: { code: 403, message: "User does not have sufficient permission for site 'sc-domain:helptravel.pl'." } }, 403),
        ),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GscApiError);
        assert.equal(error.code, "BLOCKED_AUTH");
        assert.match(error.message, /Odpowiedź Google: User does not have sufficient permission/);
        return true;
      },
    );
  });

  it("wycina z komunikatu Google token, JWT i klucz, gdyby odpowiedź je powtórzyła", async () => {
    const jwtLike = `${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`;
    await assert.rejects(
      querySearchAnalytics({
        ...QUERY_BASE,
        fetchImpl: mockFetch(() =>
          jsonResponse({ error: { message: `Bad token ${QUERY_BASE.accessToken} / ${jwtLike} / ya29.abc-DEF_123 / ${PRIVATE_KEY_PEM}` } }, 400),
        ),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GscApiError);
        assert.equal(error.code, "HTTP_ERROR");
        assert.equal(error.message.includes(QUERY_BASE.accessToken), false);
        assert.equal(error.message.includes(jwtLike), false);
        assert.equal(error.message.includes("ya29."), false);
        assert.equal(error.message.includes("PRIVATE KEY"), false);
        assert.match(error.message, /\[usunięto\]/);
        return true;
      },
    );
  });

  it("podaje kod i opis błędu OAuth przy odrzuconym podpisie", async () => {
    await assert.rejects(
      fetchAccessToken({
        clientEmail: CLIENT_EMAIL,
        privateKeyPem: PRIVATE_KEY_PEM,
        now: NOW,
        fetchImpl: mockFetch(() => jsonResponse({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400)),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GscApiError);
        assert.equal(error.status, 400);
        assert.match(error.message, /Odpowiedź Google: invalid_grant: Invalid JWT Signature\./);
        return true;
      },
    );
  });
});

describe("fetchGscExport", () => {
  it("ustawia 92 dni włącznie do dziś UTC minus 3 dni i mapuje wszystkie wymiary", async () => {
    const queryCalls: FetchCall[] = [];
    const fetchImpl = mockFetch((call) => {
      if (call.url === "https://oauth2.googleapis.com/token") return jsonResponse({ access_token: "export-token" });
      queryCalls.push(call);
      const body = bodyRecord(call.init);
      if (body.startRow !== 0) return jsonResponse({});
      const dimensions = Array.isArray(body.dimensions) ? body.dimensions.join("|") : "";
      if (dimensions === "page") {
        return jsonResponse({ rows: [apiRow(["https://helptravel.pl/madera"], { clicks: 3, impressions: 20, ctr: 0.15, position: 2.4 })] });
      }
      if (dimensions === "query") {
        return jsonResponse({ rows: [apiRow(['wakacje, "tanio"'], { clicks: 2, impressions: 25, ctr: 0.08, position: 5.5 })] });
      }
      if (dimensions === "date") {
        return jsonResponse({ rows: [apiRow(["2026-11-11"], { clicks: 5, impressions: 45, ctr: 5 / 45, position: 4 })] });
      }
      return jsonResponse({
        rows: [apiRow(["https://helptravel.pl/madera", "madera pogoda"], { clicks: 1, impressions: 8, ctr: 0.125, position: 3 })],
      });
    });

    const result = await fetchGscExport({
      siteUrl: "sc-domain:helptravel.pl",
      serviceAccountJson: SERVICE_ACCOUNT_JSON,
      now: NOW,
      fetchImpl,
    });

    assert.deepEqual(result.range, { startDate: "2026-08-12", endDate: "2026-11-11" });
    assert.deepEqual(result.pages, [{ key: "https://helptravel.pl/madera", clicks: 3, impressions: 20, ctr: 0.15, position: 2.4 }]);
    assert.deepEqual(result.queries, [{ key: 'wakacje, "tanio"', clicks: 2, impressions: 25, ctr: 0.08, position: 5.5 }]);
    assert.deepEqual(result.daily, [{ key: "2026-11-11", clicks: 5, impressions: 45, ctr: 5 / 45, position: 4 }]);
    assert.deepEqual(result.pageQuery, [
      {
        key: "https://helptravel.pl/madera",
        page: "https://helptravel.pl/madera",
        query: "madera pogoda",
        clicks: 1,
        impressions: 8,
        ctr: 0.125,
        position: 3,
      },
    ]);
    assert.equal(queryCalls.length, 8);
    for (const call of queryCalls) {
      const body = bodyRecord(call.init);
      assert.equal(body.startDate, "2026-08-12");
      assert.equal(body.endDate, "2026-11-11");
      assert.equal(body.dataState, "final");
      assert.equal(body.type, "web");
    }
    const pageQueryCalls = queryCalls.filter((call) => {
      const dimensions = bodyRecord(call.init).dimensions;
      return Array.isArray(dimensions) && dimensions.join("|") === "page|query";
    });
    assert.equal(bodyRecord(pageQueryCalls[0].init).rowLimit, 25_000);
    assert.equal(bodyRecord(pageQueryCalls[1].init).rowLimit, 24_999);
  });
});

describe("toGscCsvInputs", () => {
  it("zachowuje wiersze w przejściu API → CSV → istniejący parser", () => {
    const pages: GscRow[] = [{ key: "https://helptravel.pl/a,b", clicks: 4, impressions: 20, ctr: 0.2, position: 3.25 }];
    const queries: GscRow[] = [{ key: 'madera, "czy teneryfa"', clicks: 2, impressions: 40, ctr: 0.05, position: 6.5 }];
    const daily: GscRow[] = [{ key: "2026-11-11", clicks: 6, impressions: 60, ctr: 0.1, position: 5 }];
    const gscExport: GscExport = {
      range: { startDate: "2026-11-11", endDate: "2026-11-11" },
      pages,
      queries,
      daily,
      pageQuery: [],
    };

    const csv = toGscCsvInputs(gscExport);
    assert.match(csv.queries, /"madera, ""czy teneryfa"""/);
    assert.deepEqual(parseGscCsv(csv.pages).rows, pages);
    assert.deepEqual(parseGscCsv(csv.queries).rows, queries);
    assert.deepEqual(parseGscCsv(csv.daily).rows, daily);
  });

  it("cytuje pole ze znakiem nowej linii jako jeden rekord", () => {
    const gscExport: GscExport = {
      range: { startDate: "2026-11-11", endDate: "2026-11-11" },
      pages: [],
      queries: [{ key: 'pierwsza,\n"druga"', clicks: 0, impressions: 4, ctr: 0, position: 8 }],
      daily: [],
      pageQuery: [],
    };
    const csv = toGscCsvInputs(gscExport);
    assert.match(csv.queries, /"pierwsza,\n""druga"""/);
    const parsed = parseGscCsv(csv.queries);
    assert.equal(parsed.rows.length, 1);
    // Parser celowo normalizuje białe znaki w wymiarze; istotne, że rekord nie został rozcięty.
    assert.equal(parsed.rows[0].key, 'pierwsza, "druga"');
  });
});
