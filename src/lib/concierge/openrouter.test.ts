import assert from "node:assert/strict";
import { test } from "node:test";

test("openrouter: brak OPENROUTER_API_KEY → typowany błąd konfiguracji", async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { chatCompletion } = await import("./openrouter");
    await assert.rejects(() => chatCompletion({ messages: [], tools: [] }), /OPENROUTER_API_KEY/);
  } finally {
    if (prev) process.env.OPENROUTER_API_KEY = prev;
  }
});

// Nieaktualny slug w OPENROUTER_MODEL dwukrotnie położył czat (lokalnie i na
// Vercelu). Kontrakt: błąd „model niedostępny" (404) → JEDNA ponowna próba na
// modelu wbudowanym; zła konfiguracja degraduje się do działania.
test("openrouter: zły slug modelu z env → fallback na model domyślny (jedna ponowka)", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "google/gemma-3-27b-it:free"; // martwy slug z Vercela

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    bodies.push(body);
    const payload =
      bodies.length === 1
        ? { error: { message: "This model is unavailable for free. The paid version is available now - use this slug instead: google/gemma-3-27b-it", code: 404 } }
        : { choices: [{ message: { role: "assistant", content: "działa" } }] };
    return { body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion, DEFAULT_MODEL } = await import("./openrouter");
    const result = (await chatCompletion({ messages: [{ role: "user", content: "hej" }], tools: [] })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, "google/gemma-3-27b-it:free");
    assert.equal(bodies[1].model, DEFAULT_MODEL);
    assert.equal(result.choices?.[0]?.message?.content, "działa");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel;
    else delete process.env.OPENROUTER_MODEL;
  }
});

test("openrouter: awaria modelu domyślnego → DOKŁADNIE jedna próba zapasowa (nie pętlimy)", async () => {
  // Kontrakt zmieniony 2026-09-05 wraz z wprowadzeniem DEFAULT_FALLBACK_MODEL:
  // wcześniej awaria modelu domyślnego wracała bez żadnej próby. Teraz jest
  // wbudowany zapas, ale MUSI zostać przy jednej próbie — pętla ponowień na
  // martwym kluczu czy braku środków spaliłaby budżet tury i limit route'a.
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  delete process.env.OPENROUTER_MODEL;
  delete process.env.OPENROUTER_FALLBACK_MODEL;

  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return {
      status: 200,
      body: null,
      json: async () => ({ error: { message: "model not found", code: 404 } }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    const result = (await chatCompletion({ messages: [], tools: [] })) as { error?: unknown };
    assert.equal(calls, 2, "podstawowy + JEDEN zapas, nigdy więcej");
    assert.ok(result.error); // błąd i tak wraca do orkiestratora (łagodna ścieżka)
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb;
  }
});

// ── Model zapasowy sterowany env (§15/§41 audytu) ─────────────────────────
// Powód: na dev-serverze zaobserwowano na żywo, jak produkcyjny
// gemini-2.5-flash-lite zwraca `native_finish_reason: MALFORMED_FUNCTION_CALL`
// DWA razy z rzędu (pierwsze wywołanie + ponowienie w orkiestratorze) — i
// użytkownik dostaje „Chwilowo nie mogę odpowiedzieć". Ponowienie na TYM SAMYM
// modelu nie pomaga, bo defekt jest systematyczny dla modelu, nie losowy.
//
// Fallback siedzi WEWNĄTRZ chatCompletion, czyli w obrębie JEDNEGO wywołania
// modelu. Narzędzia wykonuje orkiestrator dopiero po powrocie — więc zmiana
// modelu nie może wykonać żadnego tool-calla drugi raz (§15: idempotencja).

test("openrouter: awaria przejściowa + OPENROUTER_FALLBACK_MODEL → druga próba na zapasowym", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
    const payload =
      bodies.length === 1
        ? { choices: [{ finish_reason: "error", native_finish_reason: "MALFORMED_FUNCTION_CALL", message: {} }] }
        : { choices: [{ message: { role: "assistant", content: "z zapasu" } }] };
    return { status: 200, body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    const result = (await chatCompletion({ messages: [], tools: [] })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, "primary/model");
    assert.equal(bodies[1].model, "zapas/model");
    assert.equal(result.choices?.[0]?.message?.content, "z zapasu");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});

test("openrouter: POPRAWNA odpowiedź NIE uruchamia modelu zapasowego", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";

  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return {
      status: 200,
      body: null,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "ok" } }] }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.equal(calls, 1, "zapas ma się włączać TYLKO przy awarii, nie zawsze");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});

test("openrouter: bez env zapas bierze się z DEFAULT_FALLBACK_MODEL (i jest INNY niż podstawowy)", async () => {
  // Zapas ma działać „z pudełka", bez konfiguracji — bo awaria, przed którą
  // chroni (MALFORMED_FUNCTION_CALL), zdarzała się na produkcji przy pustym env.
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  delete process.env.OPENROUTER_MODEL;
  delete process.env.OPENROUTER_FALLBACK_MODEL;

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
    const payload =
      bodies.length === 1
        ? { choices: [{ finish_reason: "error", message: {} }] }
        : { choices: [{ message: { role: "assistant", content: "z zapasu" } }] };
    return { status: 200, body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion, DEFAULT_MODEL, DEFAULT_FALLBACK_MODEL } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, DEFAULT_MODEL);
    assert.equal(bodies[1].model, DEFAULT_FALLBACK_MODEL);
    assert.notEqual(
      DEFAULT_FALLBACK_MODEL,
      DEFAULT_MODEL,
      "zapas u TEGO SAMEGO dostawcy nie chroni przed jego awaria",
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb;
  }
});

// ── Idempotencja narzędzi przy zejściu na model zapasowy ──────────────────
// Gwarancja, o którą pyta audyt (§15): zmiana modelu NIE MOŻE wykonać
// tool-calla drugi raz. Ta własność jest ARCHITEKTONICZNA, nie przypadkowa:
// zapas siedzi WEWNĄTRZ chatCompletion, a egzekutory woła dopiero orkiestrator
// po powrocie z jednego `deps.chat`. Test przypina to na stałe.
test("zapas modelu NIE powtarza wywołania narzędzia (idempotencja)", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";

  let httpCalls = 0;
  let fallbackCalls = 0;
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    httpCalls++;
    const body = JSON.parse(init?.body ?? "{}") as { model?: string };
    // Podstawowy pada (brak treści i brak tool_calls) -> chatCompletion schodzi
    // na zapas. Zapas prosi o narzędzie RAZ, a po jego wyniku odpowiada tekstem
    // (bez tego orkiestrator kręciłby kolejne rundy i policzyłby narzędzie
    // wielokrotnie — co byłoby jego normalnym zachowaniem, nie duplikacją).
    if (body.model === "primary/model") {
      return { status: 200, body: null, json: async () => ({ choices: [{ finish_reason: "error", message: {} }] }) } as unknown as Response;
    }
    fallbackCalls++;
    const payload =
      fallbackCalls === 1
        ? {
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    { id: "c1", type: "function", function: { name: "list_themes", arguments: "{}" } },
                  ],
                },
              },
            ],
          }
        : { choices: [{ message: { role: "assistant", content: "Motywy: plaża, city break." } }] };
    return { status: 200, body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    const { runConcierge } = await import("./orchestrator");

    let listThemesCalls = 0;
    const deps = {
      chat: chatCompletion,
      executors: {
        executeSearchTrips: async () => ({ candidates: [] }),
        executeGetTripOffer: async () => {
          throw new Error("nieużywane");
        },
        executeListThemes: () => {
          listThemesCalls++;
          return { themes: [] };
        },
      },
    };
    await runConcierge([{ role: "user", content: "jakie motywy?" }], deps as never);

    assert.equal(httpCalls >= 2, true, "zapas w ogóle się nie odpalił");
    assert.equal(listThemesCalls, 1, "narzędzie wykonane WIĘCEJ NIŻ RAZ mimo zejścia na zapas");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});

// ── Idempotencja narzędzi przy zejściu na model zapasowy ──────────────────
// Gwarancja, o którą pyta audyt (§15): zmiana modelu NIE MOŻE wykonać
// tool-calla drugi raz. Ta własność jest ARCHITEKTONICZNA, nie przypadkowa:
// zapas siedzi WEWNĄTRZ chatCompletion, a egzekutory woła dopiero orkiestrator
// po powrocie z jednego `deps.chat`. Test przypina to na stałe.
test("zapas modelu NIE powtarza wywołania narzędzia (idempotencja)", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevModel = process.env.OPENROUTER_MODEL;
  const prevFb = process.env.OPENROUTER_FALLBACK_MODEL;
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";

  let httpCalls = 0;
  let fallbackCalls = 0;
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    httpCalls++;
    const body = JSON.parse(init?.body ?? "{}") as { model?: string };
    // Podstawowy pada (brak treści i brak tool_calls) -> chatCompletion schodzi
    // na zapas. Zapas prosi o narzędzie RAZ, a po jego wyniku odpowiada tekstem
    // (bez tego orkiestrator kręciłby kolejne rundy i policzyłby narzędzie
    // wielokrotnie — co byłoby jego normalnym zachowaniem, nie duplikacją).
    if (body.model === "primary/model") {
      return { status: 200, body: null, json: async () => ({ choices: [{ finish_reason: "error", message: {} }] }) } as unknown as Response;
    }
    fallbackCalls++;
    const payload =
      fallbackCalls === 1
        ? {
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    { id: "c1", type: "function", function: { name: "list_themes", arguments: "{}" } },
                  ],
                },
              },
            ],
          }
        : { choices: [{ message: { role: "assistant", content: "Motywy: plaża, city break." } }] };
    return { status: 200, body: null, json: async () => payload } as unknown as Response;
  }) as typeof fetch;

  try {
    const { chatCompletion } = await import("./openrouter");
    const { runConcierge } = await import("./orchestrator");

    let listThemesCalls = 0;
    const deps = {
      chat: chatCompletion,
      executors: {
        executeSearchTrips: async () => ({ candidates: [] }),
        executeGetTripOffer: async () => {
          throw new Error("nieużywane");
        },
        executeListThemes: () => {
          listThemesCalls++;
          return { themes: [] };
        },
      },
    };
    await runConcierge([{ role: "user", content: "jakie motywy?" }], deps as never);

    assert.equal(httpCalls >= 2, true, "zapas w ogóle się nie odpalił");
    assert.equal(listThemesCalls, 1, "narzędzie wykonane WIĘCEJ NIŻ RAZ mimo zejścia na zapas");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey; else delete process.env.OPENROUTER_API_KEY;
    if (prevModel) process.env.OPENROUTER_MODEL = prevModel; else delete process.env.OPENROUTER_MODEL;
    if (prevFb) process.env.OPENROUTER_FALLBACK_MODEL = prevFb; else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
});

// ── Awaria TRANSPORTU też schodzi na zapas (hardening 2026-09-05) ──────────
// Wcześniej zapas łapał wyłącznie odpowiedzi ZDEFORMOWANE i błędy w JSON-ie.
// Rzucony wyjątek („fetch failed”, „terminated”, ECONNRESET, przekroczony czas
// transportu) leciał wyżej i kończył się komunikatem „Chwilowo nie mogę
// odpowiedzieć” — mimo że drugi dostawca mógł odpowiedzieć bez problemu.
// Zmierzone realnie: w przebiegu baterii gemini-3.1 wyszedł ze 113/113
// „błędów” właśnie na „fetch failed”.

/** Stub fetch: primary robi `onPrimary`, zapas zawsze odpowiada tekstem. */
function stubFetch(onPrimary: () => Promise<Response>) {
  const seen: string[] = [];
  const fn = (async (_u: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as { model?: string };
    seen.push(body.model ?? "?");
    if (body.model === "primary/model") return onPrimary();
    return {
      status: 200,
      body: null,
      json: async () => ({
        provider: "TestProvider",
        choices: [{ message: { role: "assistant", content: "z zapasu" } }],
      }),
    } as unknown as Response;
  }) as typeof fetch;
  return { fn, seen };
}

async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = {
    k: process.env.OPENROUTER_API_KEY,
    m: process.env.OPENROUTER_MODEL,
    f: process.env.OPENROUTER_FALLBACK_MODEL,
  };
  const prevFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_MODEL = "primary/model";
  process.env.OPENROUTER_FALLBACK_MODEL = "zapas/model";
  try {
    return await fn();
  } finally {
    globalThis.fetch = prevFetch;
    if (prev.k) process.env.OPENROUTER_API_KEY = prev.k;
    else delete process.env.OPENROUTER_API_KEY;
    if (prev.m) process.env.OPENROUTER_MODEL = prev.m;
    else delete process.env.OPENROUTER_MODEL;
    if (prev.f) process.env.OPENROUTER_FALLBACK_MODEL = prev.f;
    else delete process.env.OPENROUTER_FALLBACK_MODEL;
  }
}

const FAKE_EXECUTORS = {
  executeSearchTrips: async () => ({ candidates: [] }),
  executeGetTripOffer: async () => {
    throw new Error("nieużywane");
  },
  executeListThemes: () => ({ themes: [] }),
};

test("A) wyjątek sieci na primary → odpowiada model zapasowy", async () => {
  await withEnv(async () => {
    const { fn, seen } = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    globalThis.fetch = fn;
    const { chatCompletion } = await import("./openrouter");
    const r = (await chatCompletion({ messages: [], tools: [] })) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    assert.deepEqual(seen, ["primary/model", "zapas/model"]);
    assert.equal(r.choices?.[0]?.message?.content, "z zapasu");
  });
});

test("A2) ECONNRESET i zerwane połączenie też schodzą na zapas", async () => {
  for (const msg of ["read ECONNRESET", "terminated"]) {
    await withEnv(async () => {
      const { fn, seen } = stubFetch(async () => {
        throw new Error(msg);
      });
      globalThis.fetch = fn;
      const { chatCompletion } = await import("./openrouter");
      await chatCompletion({ messages: [], tools: [] });
      assert.deepEqual(seen, ["primary/model", "zapas/model"], msg);
    });
  }
});

test("A3) przekroczony czas transportu (AbortError) → zapas", async () => {
  await withEnv(async () => {
    const { fn, seen } = stubFetch(async () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      throw e;
    });
    globalThis.fetch = fn;
    const { chatCompletion } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.deepEqual(seen, ["primary/model", "zapas/model"]);
  });
});

test("B) 429 na primary → zapas", async () => {
  await withEnv(async () => {
    const { fn, seen } = stubFetch(
      async () =>
        ({
          status: 429,
          body: null,
          json: async () => ({ error: { code: 429, message: "rate limited" } }),
        }) as unknown as Response,
    );
    globalThis.fetch = fn;
    const { chatCompletion } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.deepEqual(seen, ["primary/model", "zapas/model"]);
  });
});

test("C) 500 z ciałem HTML (json rzuca SyntaxError) → zapas", async () => {
  await withEnv(async () => {
    const { fn, seen } = stubFetch(
      async () =>
        ({
          status: 500,
          body: null,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON at position 0");
          },
        }) as unknown as Response,
    );
    globalThis.fetch = fn;
    const { chatCompletion } = await import("./openrouter");
    await chatCompletion({ messages: [], tools: [] });
    assert.deepEqual(seen, ["primary/model", "zapas/model"]);
  });
});

test("D) błąd KONFIGURACJI (brak klucza) NIE uruchamia zapasu — rzuca od razu", async () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevFetch = globalThis.fetch;
  delete process.env.OPENROUTER_API_KEY;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return { status: 200, body: null, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
  try {
    const { chatCompletion } = await import("./openrouter");
    await assert.rejects(() => chatCompletion({ messages: [], tools: [] }), /OPENROUTER_API_KEY/);
    assert.equal(calls, 0, "błąd deterministyczny nie ma prawa wywołać ŻADNEGO modelu");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
  }
});

test("E) wyjątek sieci na primary NIE powtarza wywołania narzędzia", async () => {
  await withEnv(async () => {
    let httpCalls = 0;
    let fallbackCalls = 0;
    globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
      httpCalls++;
      const body = JSON.parse(init?.body ?? "{}") as { model?: string };
      if (body.model === "primary/model") throw new TypeError("fetch failed");
      fallbackCalls++;
      const payload =
        fallbackCalls === 1
          ? {
              choices: [
                {
                  message: {
                    role: "assistant",
                    tool_calls: [
                      {
                        id: "c1",
                        type: "function",
                        function: { name: "list_themes", arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
            }
          : { choices: [{ message: { role: "assistant", content: "Motywy: plaża." } }] };
      return { status: 200, body: null, json: async () => payload } as unknown as Response;
    }) as typeof fetch;

    const { chatCompletion } = await import("./openrouter");
    const { runConcierge } = await import("./orchestrator");
    let listThemesCalls = 0;
    await runConcierge([{ role: "user", content: "motywy?" }], {
      chat: chatCompletion,
      executors: {
        ...FAKE_EXECUTORS,
        executeListThemes: () => {
          listThemesCalls++;
          return { themes: [] };
        },
      },
    } as never);
    assert.ok(httpCalls >= 2, "zapas się nie odpalił");
    assert.equal(listThemesCalls, 1, "narzędzie wykonane więcej niż raz");
  });
});

test("F) primary i zapas padają → łagodny błąd, bez wyjątku na zewnątrz", async () => {
  await withEnv(async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const { chatCompletion } = await import("./openrouter");
    const { runConcierge } = await import("./orchestrator");
    const out = await runConcierge([{ role: "user", content: "cześć" }], {
      chat: chatCompletion,
      executors: FAKE_EXECUTORS,
    } as never);
    assert.equal(out.error, true);
    assert.match(out.text, /Chwilowo nie mogę odpowiedzieć/);
  });
});

test("G) log zejścia na zapas: primary, fallback i KLASA błędu, zero sekretów", async () => {
  await withEnv(async () => {
    const lines: string[] = [];
    const prevWarn = console.warn;
    console.warn = (...a: unknown[]) => lines.push(a.map(String).join(" "));
    try {
      const { fn } = stubFetch(async () => {
        throw new TypeError("fetch failed");
      });
      globalThis.fetch = fn;
      const { chatCompletion } = await import("./openrouter");
      await chatCompletion({
        messages: [{ role: "user", content: "Jan Kowalski, jan@example.com" }],
        tools: [],
      });
    } finally {
      console.warn = prevWarn;
    }
    const log = lines.join("\n");
    assert.match(log, /primary\/model/);
    assert.match(log, /zapas\/model/);
    assert.match(log, /TypeError/, "brak klasy błędu w logu");
    assert.equal(log.includes("sk-or-test"), false, "KLUCZ API w logu");
    assert.equal(log.includes("Kowalski"), false, "treść rozmowy w logu");
    assert.equal(log.includes("example.com"), false, "dane kontaktowe w logu");
  });
});
