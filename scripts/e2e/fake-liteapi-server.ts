// Atrapa LiteAPI do E2E „odmowa prebooku → powrót do hotelu”
// (playwright.odmowa.config.ts). Serwer Nexta rozmawia tylko z nią: żadnych
// prawdziwych stawek, prebooków ani płatności.
//
// Zachowuje się jak dostawca tam, gdzie ma to znaczenie: każde zapytanie o stawki
// wydaje NOWE `offerId` (zmierzone 2026-11-06: 0 ze 186 wspólnych), a odpowiedź
// zajmuje chwilę, więc na ekranie zdąży pojawić się szkielet z loading.tsx.
//
// Sterowanie:
//   GET /__e2e/stats
//   GET /__e2e/reset?afterRefusal=reoffer|gone&prebook=sold|expired&delayMs=1500
//     reoffer: odrzucony pokój wraca pod nowym offerId (najgorszy przypadek)
//     gone:    po odmowie świeże zapytania już go nie zwracają

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Opis i ocena po to, by lista pokoi leżała pod zgięciem jak na prawdziwym hotelu.
// Na krótkiej stronie `#rooms` widać od razu i test przewijania nic by nie mierzył.
const HOTEL_DESCRIPTION = Array.from(
  { length: 40 },
  (_, i) => `Akapit ${i + 1}: hotel testowy z pokojami, śniadaniem i widokiem na miasto.`,
).join(" ");

const REFUSED_ROOM = "wyprzedany";
const ROOMS = [
  { key: REFUSED_ROOM, name: "Standard Double Room", amount: 1200 },
  { key: "dostepny", name: "Deluxe Double Room", amount: 1500 },
];

const emptyStats = () => ({
  ratesAvailability: 0,
  ratesMapped: 0,
  prebook: 0,
  unknown: [] as string[],
});

const state = {
  stats: emptyStats(),
  afterRefusal: "reoffer" as "reoffer" | "gone",
  prebook: "sold" as "sold" | "expired",
  delayMs: 0,
  refused: false,
  seq: 0,
};

function roomType(hotelId: string, room: (typeof ROOMS)[number]) {
  state.seq += 1;
  return {
    offerId: `e2e-${room.key}-${hotelId}-${state.seq}-${"x".repeat(24)}`,
    supplier: "atrapa",
    rates: [
      {
        rateId: `rate-${state.seq}`,
        occupancyNumber: 1,
        name: room.name,
        maxOccupancy: 2,
        adultCount: 2,
        childCount: 0,
        boardType: "RO",
        boardName: "Room Only",
        retailRate: { total: [{ amount: room.amount, currency: "PLN" }] },
        cancellationPolicies: { refundableTag: "NRFN" },
      },
    ],
  };
}

function ratesResponse(body: { hotelIds?: string[] }) {
  const hotelId = body.hotelIds?.[0] ?? "lpe2e01";
  const rooms = ROOMS.filter(
    (room) => !(room.key === REFUSED_ROOM && state.refused && state.afterRefusal === "gone"),
  );
  return { data: [{ hotelId, roomTypes: rooms.map((room) => roomType(hotelId, room)) }] };
}

function prebookResponse(body: { offerId?: string }): { status: number; body: unknown } {
  if (!body.offerId?.startsWith(`e2e-${REFUSED_ROOM}-`)) {
    return { status: 400, body: { error: { code: 4000, message: "atrapa: tej oferty test nie rezerwuje" } } };
  }
  state.refused = true;
  return state.prebook === "sold"
    ? {
        status: 400,
        body: { error: { code: 2001, message: "no availability found", description: "no prebook availability" } },
      }
    : { status: 409, body: { error: { message: "rate expired" } } };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

const send = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://atrapa");

  if (url.pathname === "/__e2e/stats") return send(res, 200, state.stats);
  if (url.pathname === "/__e2e/reset") {
    state.stats = emptyStats();
    state.refused = false;
    state.afterRefusal = url.searchParams.get("afterRefusal") === "gone" ? "gone" : "reoffer";
    state.prebook = url.searchParams.get("prebook") === "expired" ? "expired" : "sold";
    state.delayMs = Number(url.searchParams.get("delayMs") ?? 0);
    return send(res, 200, { ok: true });
  }

  if (url.pathname.endsWith("/hotels/rates")) {
    const body = await readJson(req);
    if (body.roomMapping) state.stats.ratesMapped += 1;
    else state.stats.ratesAvailability += 1;
    await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    return send(res, 200, ratesResponse(body));
  }
  if (url.pathname.endsWith("/rates/prebook")) {
    state.stats.prebook += 1;
    const { status, body } = prebookResponse(await readJson(req));
    return send(res, status, body);
  }
  if (url.pathname.endsWith("/data/hotel")) {
    const id = url.searchParams.get("hotelId") ?? "lpe2e01";
    return send(res, 200, {
      data: {
        id,
        name: "Hotel Atrapa",
        city: "Testowo",
        country: "PL",
        address: "ul. Testowa 1",
        rating: 8.4,
        reviewCount: 120,
        stars: 4,
        hotelDescription: HOTEL_DESCRIPTION,
      },
    });
  }
  if (url.pathname.endsWith("/data/reviews")) return send(res, 200, { data: [] });

  state.stats.unknown.push(`${req.method} ${url.pathname}`);
  return send(res, 404, { error: { message: "atrapa: nieznana ścieżka" } });
});

const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8798;
server.listen(port, "127.0.0.1", () => console.log(`[fake-liteapi] http://127.0.0.1:${port}`));
