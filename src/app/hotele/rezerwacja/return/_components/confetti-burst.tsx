"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";

// Booking-confirmation celebration. Fires on mount, then unmounts. Multi-burst
// pattern (initial pop → side cannons → finale) tuned to ~2 seconds — long
// enough to feel earned, short enough not to outstay its welcome.
//
// Respects `prefers-reduced-motion` (a11y) and is a no-op on SSR.

const COLORS = [
  // emerald (brand primary)
  "#10b981",
  "#34d399",
  // amber (warmth)
  "#f59e0b",
  "#fbbf24",
  // sky (coolness)
  "#0ea5e9",
  // violet (punch)
  "#8b5cf6",
  // rose (final pop)
  "#f43f5e",
];

export function ConfettiBurst(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Initial big pop from bottom-center upward.
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.5, y: 0.7 },
      colors: COLORS,
      zIndex: 50,
    });

    // Left cannon, angled up-and-right into the middle.
    timeouts.push(
      setTimeout(() => {
        confetti({
          particleCount: 60,
          spread: 60,
          angle: 70,
          origin: { x: 0.05, y: 0.7 },
          colors: COLORS,
          zIndex: 50,
        });
      }, 400),
    );

    // Right cannon, angled up-and-left into the middle.
    timeouts.push(
      setTimeout(() => {
        confetti({
          particleCount: 60,
          spread: 60,
          angle: 110,
          origin: { x: 0.95, y: 0.7 },
          colors: COLORS,
          zIndex: 50,
        });
      }, 700),
    );

    // Finale: big spread from center, larger particles.
    timeouts.push(
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { x: 0.5, y: 0.5 },
          colors: COLORS,
          zIndex: 50,
          scalar: 1.2,
        });
      }, 1500),
    );

    return () => {
      for (const t of timeouts) clearTimeout(t);
    };
  }, []);

  return null;
}
