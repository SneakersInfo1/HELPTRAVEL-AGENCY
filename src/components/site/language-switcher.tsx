"use client";

import { usePathname } from "next/navigation";

import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";

const options: { value: SiteLocale; label: string }[] = [
  { value: "pl", label: "PL" },
  { value: "en", label: "EN" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const pathname = usePathname();
  const effectiveLocale = localeFromPathname(pathname) ?? locale;

  return (
    <div
      className="inline-flex items-center rounded-full border border-emerald-900/10 bg-white/84 p-1 shadow-sm"
      role="group"
      aria-label={effectiveLocale === "pl" ? "Przelacz jezyk" : "Switch language"}
    >
      {options.map((option) => {
        const active = option.value === effectiveLocale;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLocale(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold tracking-[0.18em] transition ${
              active ? "bg-emerald-700 text-white" : "text-emerald-900 hover:bg-emerald-50"
            }`}
            aria-pressed={active}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
