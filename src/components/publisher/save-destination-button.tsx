"use client";

import { useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import type { SiteLocale } from "@/lib/mvp/locale";
import { getSavedDestinations, toggleSavedDestination } from "@/lib/mvp/planner-memory";

interface SaveDestinationButtonProps {
  slug: string;
  city: string;
  country: string;
  locale?: SiteLocale;
}

export function SaveDestinationButton({ slug, city, country, locale: localeOverride }: SaveDestinationButtonProps) {
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? contextLocale;
  const [saved, setSaved] = useState(() => getSavedDestinations().some((item) => item.slug === slug));

  return (
    <button
      type="button"
      onClick={() => {
        const next = toggleSavedDestination({ slug, city, country });
        setSaved(next.some((item) => item.slug === slug));
      }}
      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
        saved
          ? "bg-emerald-950 text-white hover:bg-emerald-900"
          : "border border-white/18 bg-white/10 text-white hover:bg-white/16"
      }`}
    >
      {saved
        ? locale === "en"
          ? "Saved"
          : "Zapisany kierunek"
        : locale === "en"
          ? "Save destination"
          : "Zapisz kierunek"}
    </button>
  );
}
