// Alarm przy SERII nieobsłużonych błędów serwera — 5xx, których nie złapał
// żaden nasz kod (rzut z renderu RSC, route handlera albo server action).
//
// DLACZEGO: incydenty „null na /data/hotel” i „400 na /data/hotel” było widać
// dopiero w logach Vercela, po fakcie i po ręcznym szukaniu. Moduł woła
// `instrumentation.ts` z haka `onRequestError` Nexta — notFound(), redirect()
// i przerwane połączenia Next odfiltrowuje sam, zanim hak zostanie wywołany.
//
// KOSZT: licznik w Redisie zmienia się TYLKO przy błędzie, więc zdrowy serwis
// nie płaci za niego ani jednego polecenia Upstash. Przy burzy błędów instancja
// przestaje pisać, gdy tylko zobaczy przekroczony próg: zapisów na okno jest
// tyle, ile wynosi próg plus po jednym na instancję, a nie tyle, ile błędów.
//
// PRYWATNOŚĆ: do alarmu idzie wzorzec trasy albo ścieżka BEZ query — strona
// powrotu z płatności niesie w adresie sekret PaymentIntentu.

import { notify } from "@/lib/alerting/notify";
import { getSharedRedis, redisMayBeAvailable } from "@/lib/redis/client";

const PREFIX = "srverr:v1";
export const SERVER_ERROR_WINDOW_S = 600;

/** Próg na okno 10 min, wspólny dla wszystkich instancji (`SERVER_ERROR_ALERT_THRESHOLD`, domyślnie 20). */
export function serverErrorThreshold(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SERVER_ERROR_ALERT_THRESHOLD);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

/** Okna, w których ta instancja już widziała próg — dalej do nich nie pisze. */
const saturated = new Set<number>();

export interface ServerErrorRequest {
  path: string;
  method: string;
}
export interface ServerErrorContext {
  routePath?: string;
  routeType?: string;
}

export async function recordServerError(
  err: unknown,
  request: ServerErrorRequest,
  context: ServerErrorContext,
  now: number = Date.now(),
): Promise<void> {
  const window = Math.floor(now / (SERVER_ERROR_WINDOW_S * 1000));
  if (saturated.has(window)) return;
  // Bez wspólnego licznika nie odróżnimy serii od pojedynczego błędu; sam błąd i tak jest w logu Vercela.
  const r = redisMayBeAvailable() ? getSharedRedis() : null;
  if (!r) return;

  const key = `${PREFIX}:${window}`;
  let count: number;
  try {
    count = await r.incr(key);
    if (count === 1) await r.expire(key, SERVER_ERROR_WINDOW_S * 2);
  } catch {
    return;
  }

  const threshold = serverErrorThreshold();
  if (count < threshold) return;
  saturated.add(window);
  for (const w of saturated) if (w < window - 1) saturated.delete(w);
  // INCR jest atomowy: dokładnie jedno żądanie w całym serwisie widzi wartość progu → jeden alarm na okno.
  if (count !== threshold) return;

  await notify({
    level: "critical",
    source: "server",
    title: `${threshold} nieobsłużonych błędów serwera w ${SERVER_ERROR_WINDOW_S / 60} min`,
    body: "Stosy i pełna lista są w logach Vercela (poziom error). Poniżej błąd, który przekroczył próg.",
    fields: {
      route: context.routePath ?? withoutQuery(request.path),
      type: context.routeType,
      method: request.method,
      error: describeError(err),
    },
  }).catch(() => {});
}

function withoutQuery(path: string): string {
  return path.split(/[?#]/)[0];
}

/** Nazwa i treść błędu, przycięte, z adresami pozbawionymi query (mogą nieść sekrety). */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw.replace(/\?[^\s"'<>)]*/g, "?…").slice(0, 200);
}

export function __resetServerErrorsForTests(): void {
  saturated.clear();
}
