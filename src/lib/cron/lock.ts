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
// KONTRAKT: blokada NIGDY nie wywraca zadania. Brak konfiguracji Redisa albo
// chwilowy błąd sieci = zgoda na wykonanie (tak jak reszta warstwy cache
// degraduje się do „miss"), bo wstrzymanie aktualizacji ofert byłoby gorsze
// niż sporadyczne podwójne wykonanie.
//
// WYJĄTEK (incydent 2026-10-25): TRWAŁA niedostępność magazynu — limit planu
// Upstash, błąd autoryzacji albo otwarty wyłącznik obwodu. Wszystkie crony
// tego projektu piszą WYŁĄCZNIE do Redisa, więc przebieg bez magazynu to
// czysta strata: `warm-rates` dalej pobierał 12 500 stawek z LiteAPI co
// 30 minut i wyrzucał je do kosza, a crony lotów dokładały wyszukiwania,
// na które dostawca odpowiadał już 429/403. Wtedy `zdobyta: false`
// z `powod: "magazyn_niedostepny"` — cron kończy się 200 bez pracy.

import { getSharedRedis, isPersistentRedisOutage, redisMayBeAvailable } from "@/lib/redis/client";

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

let wstrzyniety: RedisLike | null | undefined;

// Wspólny klient (src/lib/redis/client.ts): timeout, wyłącznik obwodu, pomiar.
function getRedis(): RedisLike | null {
  if (wstrzyniety !== undefined) return wstrzyniety;
  return getSharedRedis() as unknown as RedisLike | null;
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
  /**
   * Dlaczego NIE zdobyta: `zajeta` — trwa inny przebieg; `magazyn_niedostepny`
   * — Redis trwale niedostępny (limit planu / autoryzacja / otwarty wyłącznik),
   * więc wyniku i tak nie dałoby się zapisać.
   */
  powod?: "zajeta" | "magazyn_niedostepny";
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

  // Wyłącznik już wie, że magazyn leży — nie wysyłamy nawet próby blokady.
  if (wstrzyniety === undefined && !redisMayBeAvailable()) {
    console.warn(`[cron-lock] '${nazwa}' pominięty: magazyn Redis niedostępny (wyłącznik otwarty)`);
    return { zdobyta: false, powod: "magazyn_niedostepny", zwolnij: async () => {} };
  }

  const klucz = `lock:${nazwa}`;
  // Identyfikator przebiegu — losowy, żeby dwa równoległe przebiegi nie mogły
  // uznać cudzej blokady za własną.
  const wlasciciel = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const wynik = await redis.set(klucz, wlasciciel, { nx: true, ex: ttlSekund });
    if (wynik !== "OK") return { zdobyta: false, powod: "zajeta", zwolnij: async () => {} };
  } catch (error) {
    if (isPersistentRedisOutage(error)) {
      // Limit planu / autoryzacja: przebieg nie ma gdzie zapisać wyniku.
      console.warn(
        `[cron-lock] '${nazwa}' pominięty: magazyn Redis trwale niedostępny —`,
        error instanceof Error ? error.message : error,
      );
      return { zdobyta: false, powod: "magazyn_niedostepny", zwolnij: async () => {} };
    }
    // Chwilowa awaria Redisa nie może zablokować odświeżania ofert — patrz
    // kontrakt w nagłówku pliku.
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

/**
 * Odpowiedź crona, który NIE zdobył blokady. 200 w obu przypadkach: 5xx
 * wywołałoby ponowienie po stronie harmonogramu i pogorszyło sprawę.
 */
export function odpowiedzBezBlokady(nazwa: string, blokada: UchwytBlokady): { ok: true; status: string } {
  if (blokada.powod === "magazyn_niedostepny") {
    return { ok: true, status: "skipped_store_unavailable" };
  }
  console.info(`[cron/${nazwa}] poprzedni przebieg wciąż trwa — pomijam`);
  return { ok: true, status: "skipped_locked" };
}
