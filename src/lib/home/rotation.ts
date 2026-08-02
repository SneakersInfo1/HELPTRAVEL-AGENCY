/**
 * Numer okna rotacji. Wspólny dla crona (który dobiera kierunki) i testów.
 * Liczony od epoki, więc kolejne okna następują po sobie bez dziur także
 * przy zmianie czasu — cron chodzi w UTC.
 */
export function rotationBucket(now: number, windowMs: number): number {
  return Math.floor(now / windowMs);
}

/**
 * Wycinek puli na dane okno, przesuwany o `size` pozycji co okno.
 *
 * Zawijanie jest celowe: przy puli 30 i wycinku 6 pełny obrót zajmuje pięć
 * okien, czyli 30 h — użytkownik wracający następnego dnia widzi inny zestaw,
 * a po dwóch dobach wraca do początku. Bez zawijania koniec puli oznaczałby
 * okno z jednym kierunkiem albo puste.
 */
export function rotateSlice<T>(pool: readonly T[], size: number, bucket: number): T[] {
  if (pool.length === 0 || size <= 0) return [];
  const take = Math.min(size, pool.length);
  // `%` w JS zwraca ujemne dla ujemnych — bucket zawsze ≥ 0 dla realnych dat,
  // ale normalizacja kosztuje jedną operację i zdejmuje całą klasę pomyłek.
  const start = ((bucket * take) % pool.length + pool.length) % pool.length;
  return Array.from({ length: take }, (_, i) => pool[(start + i) % pool.length]);
}
