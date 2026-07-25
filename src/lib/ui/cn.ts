// Łączenie klas Tailwind bez konfliktów.
//
// clsx rozwiązuje warunki, tailwind-merge rozstrzyga kolizje utility (ostatnia
// wygrywa: `px-2 px-4` → `px-4`). Bez tego warianty komponentów doklejane
// z zewnątrz (className na wywołaniu) nie mogły nadpisać wariantu bazowego.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
