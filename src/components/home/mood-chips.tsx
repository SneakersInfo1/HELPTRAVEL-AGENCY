"use client";

import Link from "next/link";

interface MoodChip {
  key: string;
  icon: string;
  label: string;
  href: string;
}

// Each chip now opens a real, SEO-rich mood landing page (/wyjazdy/<typ>) that
// lists the matching destinations with a short overview and a direct path to
// hotels + flights. Previously these were buttons that scrolled to #hero and
// did nothing useful — a lot of people clicked them expecting results.
const MOODS: readonly MoodChip[] = [
  { key: "beach", icon: "🏖️", label: "Plaża", href: "/wyjazdy/plaza" },
  { key: "city", icon: "🌃", label: "City break", href: "/wyjazdy/city-break" },
  { key: "mountains", icon: "🏔️", label: "Góry", href: "/wyjazdy/gory" },
  { key: "culture", icon: "🏛️", label: "Kultura", href: "/wyjazdy/kultura" },
  { key: "budget", icon: "💰", label: "Budżet", href: "/wyjazdy/budzet" },
  { key: "sun", icon: "☀️", label: "Słońce zimą", href: "/wyjazdy/slonce-zima" },
] as const;

export function MoodChips() {
  return (
    <div
      role="group"
      aria-label="Szybki wybór nastroju wyjazdu"
      className="flex flex-wrap justify-center gap-2"
    >
      {MOODS.map((mood) => (
        <Link
          key={mood.key}
          href={mood.href}
          className="group inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.25)] backdrop-blur-md transition hover:border-amber-300/70 hover:bg-black/45 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400/60 sm:text-sm"
        >
          <span aria-hidden className="text-base transition group-hover:scale-110">
            {mood.icon}
          </span>
          {/* Kolor na spanie, NIE na <a>: globalna reguła `a { color: inherit }`
              (poza warstwami) bije utility `text-white` z warstwy utilities, więc
              tekst linku dziedziczył ciemny foreground. Span nie jest łapany przez
              tę regułę → biały trzyma się na każdym zdjęciu. */}
          <span className="text-white transition group-hover:text-amber-100">{mood.label}</span>
        </Link>
      ))}
    </div>
  );
}
