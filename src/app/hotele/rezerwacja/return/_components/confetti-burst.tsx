"use client";

import { useEffect } from "react";

// Booking-confirmation celebration. Fires on mount, then unmounts. Multi-burst
// pattern (initial pop → side cannons → finale) tuned to ~2 seconds — long
// enough to feel earned, short enough not to outstay its welcome.
//
// LAZY-LOADED: canvas-confetti is ~28KB minified+gz. Importing it statically
// shipped that weight in every render of the return page, including the
// failure / recovery branches that never use it. Audit 2026-05-26 — switched
// to dynamic import inside the effect so only the success path pays the cost.
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
    let cancelled = false;

    // Dynamic import — the ~28KB library only loads when celebration is
    // about to fire. If the user navigates away before import resolves
    // (cancelled=true), we skip firing.
    void import("canvas-confetti").then((mod) => {
      if (cancelled) return;
      const confetti = mod.default;

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
    });

    return () => {
      cancelled = true;
      for (const t of timeouts) clearTimeout(t);
    };
  }, []);

  return null;
}
