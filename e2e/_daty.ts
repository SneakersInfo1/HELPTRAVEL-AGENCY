// Daty testów liczone od dziś.
//
// Twarde daty się starzeją: dostawca nie wycenia minionych wylotów, więc spec
// z datą z przeszłości pada na pustej liście (szkielet bez ofert), a nie na
// regresji, którą miał łapać. Tak było z terminem 20–27.09.2026 po wrześniu.

export const isoZaDni = (dni: number): string => new Date(Date.now() + dni * 86_400_000).toISOString().slice(0, 10);

/**
 * Termin wspólny dla spec-ów lotów. TO SAMO zapytanie w każdym teście = jedno
 * wyszukiwanie u dostawcy, reszta przebiegu dostaje odpowiedź z cache serwera
 * (`flrt:v2`, 10 min) — testy nie mnożą ruchu do produkcyjnego LiteAPI.
 */
export const WYLOT = isoZaDni(45);
export const POWROT = isoZaDni(52);
