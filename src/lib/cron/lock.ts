// Blokada rozproszona dla zadań cyklicznych.
//
// BEZ `import "server-only"` — świadomie. Ta dyrektywa wywraca `node:test`
// (udokumentowana pułapka repo), a moduł jest importowany wyłącznie przez
// handlery `src/app/api/cron/**`, które i tak biegną na serwerze. Testowalność
// blokady jest tu ważniejsza niż druga bariera importu: to kod, który ma
// chronić przed podwójnym naliczeniem kosztów u dostawcy, więc musi mieć
// testy dla ścieżek „zajęte", „awaria Redisa" i „cudza blokada".
//
// PO CO — audyt 2026-08-04 wykazał, że żaden z czterech cronów nie miał
// zabezpieczenia przed równoległym przebiegiem. Dwa nakładające się wywołania
// tego samego joba (ponowienie po timeoucie, ręczne uruchomienie w trakcie
// harmonogramowego, wolny przebieg wchodzący na następny slot) potrafią:
//   - podwoić koszt zapytań do LiteAPI,
//   - zgubić aktualizację przy wzorcu odczyt-scal-zapis, na którym stoją
//     snapshoty ofert (nowszy wynik nadpisany starszym, bo obie strony
//     wczytały ten sam stan wyjściowy).
//
// Ryzyko rośnie po skróceniu harmonogramu lotów do 30 minut: przebieg, który
// wcześniej miał dwie godziny luzu, ma teraz pół godziny.
//
// KONTRAKT: blokada NIGDY nie wywraca zadania. Brak Redisa albo błąd sieci =
// zgoda na wykonanie (tak jak reszta warstwy cache w tym projekcie degraduje
// się do „miss"), bo wstrzymanie aktualizacji ofert byłoby gorsze niż
// sporadyczne podwójne wykonanie.

import { Redis } from "@upstash/redis";

/** Czas życia blokady. Musi przekraczać najdłuższy realny przebieg joba. */
const DOMYSLNY_TTL_S = 15 * 60;

interface RedisLike {
  set(
    key: string,
    value: unknown,
    opts?: { nx?: true; ex?: number },
  ): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

let klient: RedisLike | null | undefined;
let wstrzyniety: RedisLike | null | undefined;
let ostrzezonoOBrakuEnv = false;

function getRedis(): RedisLike | null {
  if (wstrzyniety !== undefined) return wstrzyniety;
  if (klient !== undefined) return klient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!ostrzezonoOBrakuEnv) {
      console.warn("[cron-lock] brak konfiguracji Upstash — blokady wyłączone");
      ostrzezonoOBrakuEnv = true;
    }
    klient = null;
    return null;
  }
  klient = new Redis({ url, token }) as unknown as RedisLike;
  return klient;
}

/** Zwolnienie blokady TYLKO gdy nadal należy do tego przebiegu. */
const SKRYPT_ZWOLNIJ = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export interface UchwytBlokady {
  /** Czy ten przebieg faktycznie zdobył blokadę. */
  zdobyta: boolean;
  /** Zwalnia blokadę. Bezpieczne do wywołania także gdy `zdobyta === false`. */
  zwolnij: () => Promise<void>;
}

/**
 * Próbuje zająć blokadę dla zadania `nazwa`.
 *
 * Zwolnienie jest typu compare-and-delete (skrypt Lua): przebieg, który
 * przekroczył TTL i którego blokadę przejął ktoś inny, NIE skasuje cudzej
 * blokady przy swoim `finally`. Bez tego warunku wolny job kasowałby blokadę
 * następnego i cała ochrona byłaby pozorna.
 */
export async function zajmijBlokade(
  nazwa: string,
  ttlSekund: number = DOMYSLNY_TTL_S,
): Promise<UchwytBlokady> {
  const redis = getRedis();
  if (!redis) return { zdobyta: true, zwolnij: async () => {} };

  const klucz = `lock:${nazwa}`;
  // Identyfikator przebiegu — losowy, żeby dwa równoległe przebiegi nie mogły
  // uznać cudzej blokady za własną.
  const wlasciciel = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const wynik = await redis.set(klucz, wlasciciel, { nx: true, ex: ttlSekund });
    if (wynik !== "OK") return { zdobyta: false, zwolnij: async () => {} };
  } catch (error) {
    // Awaria Redisa nie może zablokować odświeżania ofert — patrz kontrakt
    // w nagłówku pliku.
    console.warn(
      `[cron-lock] '${nazwa}' nie udało się sprawdzić blokady, przepuszczam:`,
      error instanceof Error ? error.message : error,
    );
    return { zdobyta: true, zwolnij: async () => {} };
  }

  return {
    zdobyta: true,
    zwolnij: async () => {
      try {
        await redis.eval(SKRYPT_ZWOLNIJ, [klucz], [wlasciciel]);
      } catch (error) {
        // Blokada i tak wygaśnie po TTL.
        console.warn(
          `[cron-lock] '${nazwa}' nie udało się zwolnić blokady:`,
          error instanceof Error ? error.message : error,
        );
      }
    },
  };
}

/** Szew testowy — pozwala sprawdzić logikę bez sieci. */
export function __setCronLockRedisForTests(fake: RedisLike | null): void {
  wstrzyniety = fake;
}
export function __resetCronLockRedisForTests(): void {
  wstrzyniety = undefined;
}
