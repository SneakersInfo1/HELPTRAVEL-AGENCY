"use client";

import { useEffect, useState } from "react";

// Urgency strip nad hero: pokazuje kiedy ostatnio aktualizowano ceny
// + mini-countdown do pelnej godziny (psychologiczny trigger "czas konczy sie").
export function UrgencyStrip() {
  const [mins, setMins] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      const diffMs = nextHour.getTime() - now.getTime();
      setMins(Math.floor(diffMs / 60000));
      setSecs(Math.floor((diffMs % 60000) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="w-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] sm:text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="animate-pulse">⚡</span>
          Ceny aktualizowane co godzine
        </span>
        <span className="hidden h-3 w-px bg-white/40 sm:block" />
        <span>
          Nastepna aktualizacja za{" "}
          <span className="rounded-md bg-white/20 px-1.5 py-0.5 tabular-nums">
            {pad(mins)}:{pad(secs)}
          </span>
        </span>
        <span className="hidden h-3 w-px bg-white/40 sm:block" />
        <span className="hidden items-center gap-1 sm:inline-flex">
          <span aria-hidden>🎁</span>
          100% DARMOWE · BEZ REJESTRACJI
        </span>
      </div>
    </div>
  );
}
