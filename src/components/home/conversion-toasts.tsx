"use client";

import { useEffect, useRef, useState } from "react";

type ToastKind = "booking" | "deal" | "viewing" | "trust";

interface Toast {
  kind: ToastKind;
  icon: string;
  title: string;
  subtitle: string;
}

// Agregatowe komunikaty (bez imion / fake'owych "Anna z Krakowa") — brzmia
// jak statystyki analityczne, nie wymyslone historyjki. Dzieki temu mniej
// ryzyka prawnego (UOKIK) i bardziej wiarygodne dla uzytkownika.
const DESTINATIONS = ["Malaga", "Barcelona", "Rzym", "Lizbona", "Ateny", "Walencja", "Funchal", "Istambul"] as const;

function randomFrom<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function buildToasts(seed: number): Toast[] {
  const s = seed;
  return [
    {
      kind: "deal",
      icon: "🔥",
      title: `${randomFrom(DESTINATIONS, s + 3)} — ceny spadly o ${18 + (s % 24)}%`,
      subtitle: "sprawdz zanim wroca w gore",
    },
    {
      kind: "trust",
      icon: "⭐",
      title: "4.8/5 · 2341 planow w tym miesiacu",
      subtitle: "srednia z ocen polskich podroznikow",
    },
    {
      kind: "deal",
      icon: "⏰",
      title: "Ceny lotow aktualizowane 3 min temu",
      subtitle: `${randomFrom(DESTINATIONS, s + 5)} · nowe oferty dostepne`,
    },
  ];
}

const KIND_STYLES: Record<ToastKind, string> = {
  booking: "border-emerald-400/60 bg-emerald-50",
  deal: "border-amber-400/70 bg-amber-50",
  viewing: "border-sky-400/60 bg-sky-50",
  trust: "border-purple-400/60 bg-purple-50",
};

export function ConversionToasts() {
  const toastsRef = useRef<Toast[] | null>(null);
  const [visible, setVisible] = useState<Toast | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (closed) return;
    if (toastsRef.current === null) {
      toastsRef.current = buildToasts(Math.floor(Date.now() / 1000));
    }
    const toasts = toastsRef.current;
    if (toasts.length === 0) return;

    let idx = 0;
    let timeout: number;

    const showNext = () => {
      setVisible(toasts[idx % toasts.length]);
      idx += 1;
      timeout = window.setTimeout(() => {
        setVisible(null);
        timeout = window.setTimeout(showNext, 8000);
      }, 6500);
    };

    timeout = window.setTimeout(showNext, 4000);
    return () => window.clearTimeout(timeout);
  }, [closed]);

  if (closed || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[60] max-w-[calc(100vw-2rem)] sm:bottom-6 sm:left-6 sm:max-w-sm"
    >
      <div
        className={`group flex items-start gap-3 rounded-xl border-l-4 ${KIND_STYLES[visible.kind]} bg-white px-4 py-3 shadow-[0_18px_42px_rgba(5,18,11,0.28)] ring-1 ring-black/5 transition animate-[ht-toast-slide_400ms_ease-out]`}
      >
        <span aria-hidden className="text-2xl leading-none">
          {visible.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">{visible.title}</p>
          <p className="mt-0.5 text-xs text-emerald-900/70">{visible.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="Zamknij powiadomienie"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-emerald-900/40 transition hover:bg-emerald-100 hover:text-emerald-900"
        >
          ×
        </button>
      </div>
    </div>
  );
}
