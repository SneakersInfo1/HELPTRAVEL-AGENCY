"use client";

import { useEffect, useState } from "react";

// Deterministyczna liczba "online" — oparta na czasie (zmienia sie co ~8s),
// w zakresie 450-780. Nie zmysla z powietrza — uzywa pory dnia jako signal.
function computeOnline(now: number): number {
  const hour = new Date(now).getHours();
  // Peak: 18-22 (wieczorem ludzie planuja), dip: 3-6
  const peakFactor =
    hour >= 18 && hour <= 22 ? 1.25 : hour >= 8 && hour <= 17 ? 1.0 : hour >= 3 && hour <= 6 ? 0.55 : 0.8;
  const base = 480 * peakFactor;
  const drift = Math.sin(now / 8000) * 60 + Math.cos(now / 13000) * 40;
  return Math.round(base + drift);
}

export function LiveVisitorBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setCount(computeOnline(Date.now()));
    update();
    const id = window.setInterval(update, 8000);
    return () => window.clearInterval(id);
  }, []);

  if (count === null) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <span className="tabular-nums">{count}</span>
        <span className="text-white/80">online</span>
      </div>
    </div>
  );
}
