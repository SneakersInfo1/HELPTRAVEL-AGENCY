"use client";

// Banner "trwa wyszukiwanie" — wspólny dla ekranów ładowania ofert (loty
// /loty/wyniki + hotele /hotele/szukaj). Zamiast pustego/martwego ekranu
// (raport właściciela: "wygląda jakby strona padła") pokazuje aktywny,
// markowy stan: pulsujący samolot, rotujące komunikaty i nieokreślony pasek
// postępu. To NIE jest fałszywy progres — komunikaty informują, co realnie
// dzieje się po stronie API (LiteAPI), które potrafi liczyć ~2–3 s.
//
// Pasek postępu jest czysto-CSS (.ht-indeterminate-bar), więc komponent
// działa też wewnątrz server-renderowanego fallbacku <Suspense>; rotacja
// komunikatów to mały klient.

import { useEffect, useState } from "react";

interface Props {
  /** Nagłówek, np. „Szukamy najlepszych lotów Warszawa → Barcelona…". */
  title: string;
  /** Rotujące komunikaty (zmiana co ~2,2 s). 1 element = brak rotacji. */
  messages: string[];
}

export function SearchProgressBanner({ title, messages }: Props) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % messages.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [messages.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-300/50" />
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="relative h-5 w-5 text-emerald-700"
            fill="currentColor"
          >
            <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-emerald-900">{title}</p>
          {/* key={i} re-odpala animate-fade-in przy każdej zmianie komunikatu */}
          <p key={i} className="mt-0.5 animate-fade-in text-xs text-emerald-700/80">
            {messages[Math.min(i, messages.length - 1)]}
          </p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
        <div className="ht-indeterminate-bar h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" />
      </div>
    </div>
  );
}
