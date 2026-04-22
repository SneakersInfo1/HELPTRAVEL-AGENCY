"use client";

import { usePathname } from "next/navigation";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import type { EditorialArticle, EditorialCategory } from "@/lib/mvp/publisher-content";

interface HomePageSectionsProps {
  // Zostawiamy propsy dla kompatybilnosci z page.tsx, ale nie uzywamy ich
  // — homepage jest minimalistyczny (hero + jeden differentiator).
  latestArticles?: EditorialArticle[];
  editorialCategories?: EditorialCategory[];
  locale?: SiteLocale;
}

const copy = {
  pl: {
    eyebrow: "Inaczej niz reszta",
    line1: "Booking pokaze hotel.",
    line2: "Skyscanner pokaze lot.",
    line3a: "My ulozymy Ci ",
    line3highlight: "caly wyjazd",
    line3b: " — w 3 minuty. Za 0 zl.",
    bullets: [
      { icon: "✈️", title: "Lot + hotel w jednym kliku", body: "Bez 40 zakladek w przegladarce." },
      { icon: "🗺️", title: "Gotowy plan dnia, nie sama rezerwacja", body: "Co zobaczyc, gdzie zjesc, jak sie przemieszczac." },
      { icon: "🌍", title: "22 lotniska PL i EU", body: "Dla osob pracujacych w Londynie, Berlinie, Dublinie." },
    ],
    cta: "Zacznij teraz",
  },
  en: {
    eyebrow: "Different from the rest",
    line1: "Booking shows a hotel.",
    line2: "Skyscanner shows a flight.",
    line3a: "We plan ",
    line3highlight: "the whole trip",
    line3b: " — in 3 minutes. For 0 zl.",
    bullets: [
      { icon: "✈️", title: "Flight + hotel in one click", body: "No more 40 browser tabs." },
      { icon: "🗺️", title: "A real day-by-day plan, not just a booking", body: "What to see, where to eat, how to get around." },
      { icon: "🌍", title: "22 airports across PL and EU", body: "Great if you work in London, Berlin or Dublin." },
    ],
    cta: "Start now",
  },
} as const;

export function HomePageSections({ locale: localeOverride }: HomePageSectionsProps) {
  const pathname = usePathname();
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? localeFromPathname(pathname) ?? contextLocale;
  const text = copy[locale];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 sm:px-6 xl:px-8">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-emerald-900/20 bg-emerald-950 px-6 py-8 text-white shadow-[0_28px_80px_rgba(6,29,16,0.22)] sm:px-10 sm:py-10">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.22),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.16),transparent_30%)]"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">
            {text.eyebrow}
          </p>
          <h2 className="mt-3 max-w-4xl font-display text-3xl leading-[1.15] sm:text-4xl md:text-5xl">
            <span className="text-white/75">{text.line1}</span>{" "}
            <span className="text-white/75">{text.line2}</span>
            <br />
            {text.line3a}
            <span className="text-amber-300">{text.line3highlight}</span>
            {text.line3b}
          </h2>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {text.bullets.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-emerald-300/40 hover:bg-white/8"
              >
                <span aria-hidden className="text-2xl">
                  {b.icon}
                </span>
                <p className="mt-2 text-base font-bold text-white">{b.title}</p>
                <p className="mt-1 text-sm leading-6 text-emerald-50/75">{b.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <LocalizedLink
              href="/planner?mode=standard"
              locale={locale}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-6 py-3 text-sm font-bold uppercase tracking-[0.1em] text-emerald-950 shadow-[0_12px_40px_rgba(234,88,12,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(234,88,12,0.6)]"
            >
              {text.cta}
              <span aria-hidden>→</span>
            </LocalizedLink>
          </div>
        </div>
      </section>
    </div>
  );
}
