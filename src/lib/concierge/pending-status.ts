// Progresywna treść wskaźnika oczekiwania.
//
// DLACZEGO: czat NIE strumieniuje (route oddaje jeden JSON), więc przez cały
// czas tury użytkownik widzi ten sam napis. Zmierzone na żywo (14 zapytań,
// żywe LiteAPI): tury BEZ narzędzi kończą się do 3,6 s (p95), tury z
// narzędziem mają p50 8,2 s i sięgają 16,7 s. Statyczny napis przez kilkanaście
// sekund czyta się jak zawieszenie.
//
// Progi dobrane z tego pomiaru, nie z sufitu: 4 s to bezpiecznie POWYŻEJ p95
// tur bez narzędzi, więc przy szybkiej odpowiedzi napis NIE ZDĄŻY mrugnąć —
// zmienia się dopiero wtedy, gdy niemal na pewno trwa wyszukiwanie.
//
// Świadomie BEZ zmiany protokołu: to czysta warstwa widoku, serwer nie wysyła
// żadnych zdarzeń postępu. Napis jest więc oparty na CZASIE, nie na wiedzy o
// tym, co dzieje się na serwerze — i dlatego jest sformułowany ostrożnie.

export interface PendingStage {
  /** Od ilu ms trwania tury obowiązuje ten napis. */
  afterMs: number;
  label: string;
}

/**
 * Kolejne napisy. Bez wielokropka w treści — obok stoją trzy animowane kropki,
 * które pełnią tę rolę; dopisanie „…" dałoby sześć kropek pod rząd.
 */
export const PENDING_STAGES: readonly PendingStage[] = [
  { afterMs: 0, label: "Asystent pisze" },
  { afterMs: 4_000, label: "Sprawdzam ceny i dostępność" },
  { afterMs: 10_000, label: "Jeszcze chwila — porównuję najlepsze opcje" },
];

/** Napis obowiązujący po `elapsedMs` trwania tury. */
export function statusForElapsed(elapsedMs: number): string {
  let label = PENDING_STAGES[0].label;
  for (const stage of PENDING_STAGES) {
    if (elapsedMs >= stage.afterMs) label = stage.label;
  }
  return label;
}

export interface ScheduleDeps {
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}

/**
 * Planuje przejścia między napisami i zwraca funkcję sprzątającą.
 *
 * Celowo bez Reacta — dzięki temu testuje się to zegarem wstrzykniętym, a nie
 * rendererem, i widać wprost, że KAŻDY zaplanowany timeout zostaje anulowany.
 * Wołający (hook) odpala to na starcie tury i sprząta przy odpowiedzi, błędzie,
 * zamknięciu panelu i odmontowaniu.
 */
export function schedulePendingStatus(
  onStage: (label: string) => void,
  deps: ScheduleDeps,
): () => void {
  const ids: number[] = [];
  for (const stage of PENDING_STAGES) {
    if (stage.afterMs === 0) continue;
    ids.push(deps.setTimer(() => onStage(stage.label), stage.afterMs));
  }
  return () => {
    for (const id of ids) deps.clearTimer(id);
    ids.length = 0;
  };
}
