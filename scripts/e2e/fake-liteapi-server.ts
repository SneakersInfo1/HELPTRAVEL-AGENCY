// Atrapa LiteAPI do E2E „odmowa prebooku → powrót do hotelu”
// (playwright.odmowa.config.ts) i lotów (playwright.loty.config.ts). Serwer Nexta
// rozmawia tylko z nią: żadnych prawdziwych stawek, prebooków ani płatności.
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
//   GET /__e2e/reset?flights=ok|empty|429|500&flightsFor=WMI:500,RDO:empty&flightsDelayMs=150&flightsMinGapMs=3500
//     loty: tryb domyślny i wyjątki per lotnisko wylotu. Bez wyjątków WMI i RDO
//     są puste, jak w GDS na produkcji.
//
// Loty zachowują się jak konto po przywróceniu dostępu (zmierzone 2026-11-03..06):
// zapytanie za blisko startu poprzedniego dostaje HTTP 429 z kodem 4290, także gdy
// tamto już się skończyło. Na produkcji 9,46 s to za mało, a 63,8 s wystarcza; tu
// odstępy są krótsze, ale proporcje te same: bramka musi trzymać odstęp dłuższy niż
// wolno czekać w funkcji. Atrapa sama liczy równoległość i odstępy, więc to jej
// liczniki, a nie deklaracje kodu, mówią, co naprawdę doszło „do dostawcy”.

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

type FlightMode = "ok" | "empty" | "429" | "500";

const emptyStats = () => ({
  ratesAvailability: 0,
  ratesMapped: 0,
  prebook: 0,
  flightRates: 0,
  flightOrigins: [] as string[],
  flightMaxInFlight: 0,
  flightThrottled: 0,
  flightStartGapsMs: [] as number[],
  unknown: [] as string[],
});

const state = {
  stats: emptyStats(),
  afterRefusal: "reoffer" as "reoffer" | "gone",
  prebook: "sold" as "sold" | "expired",
  delayMs: 0,
  refused: false,
  seq: 0,
  flights: "ok" as FlightMode,
  flightsFor: {} as Record<string, FlightMode>,
  flightsDelayMs: 150,
  flightsMinGapMs: 0,
  flightsInFlight: 0,
  flightsLastStart: 0,
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

const CARRIERS = [
  { code: "LO", name: "LOT Polish Airlines" },
  { code: "TP", name: "TAP Air Portugal" },
  { code: "LH", name: "Lufthansa" },
];
const FARES = [
  { family: "Basic", extra: 0, carryOn: false, checked: false },
  { family: "Smart", extra: 180.5, carryOn: true, checked: false },
  { family: "Flex", extra: 420.9, carryOn: true, checked: true },
];

interface FlightLeg {
  origin: string;
  destination: string;
  date: string;
  direction: string;
}

function flightSegments(leg: FlightLeg, i: number) {
  const carrier = CARRIERS[i % CARRIERS.length]!;
  const stops = i % 2;
  const hub = "MUC";
  const hops = stops === 0 ? [[leg.origin, leg.destination]] : [[leg.origin, hub], [hub, leg.destination]];
  return hops.map(([from, to], hop) => ({
    originCode: from,
    destinationCode: to,
    originName: from,
    destinationName: to,
    direction: leg.direction,
    departureTime: `${leg.date}T${String(6 + i + hop * 4).padStart(2, "0")}:15:00`,
    arrivalTime: `${leg.date}T${String(8 + i + hop * 4).padStart(2, "0")}:40:00`,
    duration: { minutes: 145 },
    carrier: { marketingCode: carrier.code, marketingName: carrier.name, operatingCode: carrier.code, operatingName: carrier.name },
    flight: { marketingNumber: String(300 + i), operatingNumber: String(300 + i) },
    segmentKey: `${leg.direction}-${i}-${hop}`,
  }));
}

function flightJourney(legs: FlightLeg[], i: number) {
  state.seq += 1;
  const route = legs.map((l) => `${l.origin}${l.destination}${l.date}`).join("-");
  const offers = FARES.map((fare, f) => {
    const total = Number((690.9 + i * 118 + fare.extra).toFixed(2));
    return {
      offerId: `e2e-lot-${route}-${state.seq}-${i}-${f}-${"x".repeat(16)}`,
      expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
      pricing: { display: { total, currency: "PLN", base: total - 100, fees: 0, taxes: 100 }, converted: true },
      provider: { code: "ATRAPA" },
      baggage: { hasCarryOnBag: fare.carryOn, hasCheckedBag: fare.checked, included: [] },
      fare: { family: fare.family, mixedCabin: false, seatsRemaining: 5 },
    };
  });
  const segments = legs.flatMap((leg) => flightSegments(leg, i));
  return {
    cheapestOffer: offers[0],
    offers,
    isCheapest: i === 0,
    journeyKey: `${route}-${i}`,
    segments,
    legDurations: legs.map((leg) => ({
      direction: leg.direction,
      duration: { minutes: 145 * segments.filter((s) => s.direction === leg.direction).length + 40 * (i % 2) },
    })),
    totalDuration: { minutes: 145 * segments.length },
  };
}

function flightMode(origin: string): FlightMode {
  const fixed = state.flightsFor[origin];
  if (fixed) return fixed;
  if (state.flights === "ok" && (origin === "WMI" || origin === "RDO")) return "empty";
  return state.flights;
}

async function flightRates(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const legs = (body.legs ?? []) as FlightLeg[];
  const origin = legs[0]?.origin ?? "?";
  const { stats } = state;
  const startedAt = Date.now();
  stats.flightRates += 1;
  stats.flightOrigins.push(origin);
  const gap = state.flightsLastStart > 0 ? startedAt - state.flightsLastStart : null;
  if (gap !== null) stats.flightStartGapsMs.push(gap);
  state.flightsLastStart = startedAt;
  state.flightsInFlight += 1;
  stats.flightMaxInFlight = Math.max(stats.flightMaxInFlight, state.flightsInFlight);
  const concurrent = state.flightsInFlight > 1;
  const tooSoon = concurrent || (gap !== null && gap < state.flightsMinGapMs);
  await new Promise((resolve) => setTimeout(resolve, state.flightsDelayMs));
  state.flightsInFlight -= 1;

  const mode: FlightMode = tooSoon ? "429" : flightMode(origin);
  if (mode === "429") {
    stats.flightThrottled += 1;
    return send(
      res,
      429,
      { error: { code: 4290, message: "You have exceeded the allowed request limit", description: "Too many requests, please try again later" } },
      tooSoon ? {} : { "Retry-After": "15" },
    );
  }
  if (mode === "500") return send(res, 500, { error: { code: 5000, message: "unable to process request" } });
  const journeys = mode === "empty" ? [] : Array.from({ length: 12 }, (_, i) => flightJourney(legs, i));
  return send(res, 200, { data: [{ journeys, sortMetadata: {} }] });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

const send = (res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
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
    state.flights = (url.searchParams.get("flights") ?? "ok") as FlightMode;
    state.flightsFor = Object.fromEntries(
      (url.searchParams.get("flightsFor") ?? "")
        .split(",")
        .filter(Boolean)
        .map((pair) => pair.split(":") as [string, FlightMode]),
    );
    state.flightsDelayMs = Number(url.searchParams.get("flightsDelayMs") ?? 150);
    state.flightsMinGapMs = Number(url.searchParams.get("flightsMinGapMs") ?? 0);
    state.flightsLastStart = 0;
    return send(res, 200, { ok: true });
  }

  if (url.pathname.endsWith("/flights/rates")) return flightRates(req, res);

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
