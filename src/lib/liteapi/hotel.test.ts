// getHotelDetail — hotel-name localization guard. Fetch-mocked (no network),
// withEnv + URL-routed mock in the house style of booking.test.ts.
//
// Regression for "Siedemdziesiąt Barcelona" (2026-06-10): LiteAPI /data/hotel
// with language=pl machine-translates the hotel's PROPER NAME. getHotelDetail
// must therefore serve PL content (description/amenities/policies) with the
// EN name overlaid — and degrade to the PL payload untouched when the EN call
// fails.

import assert from "node:assert/strict";
import { test } from "node:test";

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const BASE_ENV = {
  LITEAPI_BASE_URL: "https://api.liteapi.travel/v3.0",
  LITEAPI_BOOK_BASE_URL: "https://book.liteapi.travel/v3.0",
  LITEAPI_SANDBOX_KEY: undefined,
  LITEAPI_SANDBOX_PRIVATE_KEY: undefined,
  LITEAPI_PROD_KEY: undefined,
  LITEAPI_PROD_PRIVATE_KEY: "prod_test_private",
  LITEAPI_PROD_PUBLIC_KEY: undefined,
  LITEAPI_API_KEY: undefined,
  LITEAPI_ENV: "production",
} as const;

const PL_DETAIL = {
  data: {
    id: "lp27a0d8",
    name: "Siedemdziesiąt Barcelona", // machine-translated proper noun (the bug)
    city: "Barcelona",
    country: "ES",
    hotelDescription: "Polski opis hotelu.",
    amenities: ["Basen", "Parking"],
  },
};

const EN_DETAIL = {
  data: {
    id: "lp27a0d8",
    name: "Seventy Barcelona", // authentic property name
    city: "Barcelona",
    country: "ES",
    hotelDescription: "English description.",
    amenities: ["Pool", "Parking"],
  },
};

// Routes the mock by the `language` query param so one fetch stub can serve
// both parallel calls getHotelDetail now makes.
function mockFetchByLanguage(opts?: { failEn?: boolean }): {
  calls: string[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const lang = new URL(url).searchParams.get("language");
    if (lang === "en") {
      if (opts?.failEn) {
        return new Response(JSON.stringify({ error: { code: 500, message: "boom" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(EN_DETAIL), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(PL_DETAIL), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("getHotelDetail: PL content with the EN (untranslated) hotel name overlaid", async () => {
  const { getHotelDetail } = await import("./hotel");
  await withEnv({ ...BASE_ENV }, async () => {
    const mock = mockFetchByLanguage();
    try {
      const detail = await getHotelDetail("lp27a0d8");
      assert.equal(detail.name, "Seventy Barcelona"); // EN name wins
      assert.equal(detail.hotelDescription, "Polski opis hotelu."); // PL content kept
      assert.deepEqual(detail.amenities, ["Basen", "Parking"]);
      // Both language variants were actually requested.
      assert.ok(mock.calls.some((u) => u.includes("language=pl")));
      assert.ok(mock.calls.some((u) => u.includes("language=en")));
    } finally {
      mock.restore();
    }
  });
});

test("getHotelDetail: EN-name fetch failure degrades to the PL payload (no throw)", async () => {
  const { getHotelDetail } = await import("./hotel");
  await withEnv({ ...BASE_ENV }, async () => {
    const mock = mockFetchByLanguage({ failEn: true });
    try {
      const detail = await getHotelDetail("lp27a0d8");
      assert.equal(detail.name, "Siedemdziesiąt Barcelona"); // degraded, but page renders
      assert.equal(detail.hotelDescription, "Polski opis hotelu.");
    } finally {
      mock.restore();
    }
  });
});

test("getHotelDetail: explicit language=en stays a single direct fetch", async () => {
  const { getHotelDetail } = await import("./hotel");
  await withEnv({ ...BASE_ENV }, async () => {
    const mock = mockFetchByLanguage();
    try {
      const detail = await getHotelDetail("lp27a0d8", { language: "en" });
      assert.equal(detail.name, "Seventy Barcelona");
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});
