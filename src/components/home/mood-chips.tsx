"use client";

import { useRouter } from "next/navigation";

import { useLanguage } from "@/components/site/language-provider";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";

interface MoodChip {
  key: string;
  icon: string;
  label: string;
  q: string;
}

const MOODS: readonly MoodChip[] = [
  { key: "beach", icon: "🏖️", label: "Plaza", q: "plaza cieply kierunek morze" },
  { key: "city", icon: "🌃", label: "City break", q: "city break kultura zwiedzanie" },
  { key: "mountains", icon: "🏔️", label: "Gory", q: "gory trekking natura" },
  { key: "culture", icon: "🏛️", label: "Kultura", q: "kultura zabytki historia" },
  { key: "budget", icon: "💰", label: "Budzet", q: "tanio budzet najtaniej" },
  { key: "sun", icon: "☀️", label: "Slonce zima", q: "cieply kierunek zima slonce" },
] as const;

export function MoodChips() {
  const router = useRouter();
  const { locale } = useLanguage();
  const prefix = locale === "en" ? "/en" : "";

  function go(q: string) {
    const params = new URLSearchParams({
      mode: "standard",
      origin: DEFAULT_ORIGIN_CITY,
      nights: "4",
      travelers: "2",
      q,
    });
    router.push(`${prefix}/planner?${params.toString()}`);
  }

  return (
    <div
      role="group"
      aria-label="Szybki wybor nastroju wyjazdu"
      className="flex flex-wrap justify-center gap-2"
    >
      {MOODS.map((mood) => (
        <button
          key={mood.key}
          type="button"
          onClick={() => go(mood.q)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:border-amber-300/70 hover:bg-white/25 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400/60 sm:text-sm"
        >
          <span aria-hidden className="text-base transition group-hover:scale-110">
            {mood.icon}
          </span>
          <span>{mood.label}</span>
        </button>
      ))}
    </div>
  );
}
