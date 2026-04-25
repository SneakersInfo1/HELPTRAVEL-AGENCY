"use client";

import { usePathname } from "next/navigation";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";

interface HomePageSectionsProps {
  featuredDirections?: unknown;
  latestArticles?: EditorialArticle[];
  locale?: SiteLocale;
}

const copy = {
  pl: {
    eyebrow: "Inaczej niż reszta",
    line1: "Booking pokaże hotel.",
    line2: "Wyszukiwarka pokaże lot.",
    line3a: "My układamy Ci ",
    line3highlight: "cały wyjazd",
    line3b: " - w kilka minut i za 0 zł.",
    bullets: [
      { icon: "✈️", title: "Lot i hotel w jednym starcie", body: "Mniej zakładek, mniej chaosu i szybsza decyzja." },
      { icon: "🗺️", title: "Plan dnia, nie sama rezerwacja", body: "Co zobaczyć, gdzie spać i jak przejść do kolejnych kroków." },
      { icon: "🌍", title: "Start z Polski i Europy", body: "Dla krótkich wyjazdów, city breaków i ciepłych kierunków." },
    ],
    cta: "Zacznij teraz",
  },
  en: {
    eyebrow: "Different from the rest",
    line1: "Booking shows a hotel.",
    line2: "A search engine shows a flight.",
    line3a: "We help arrange ",
    line3highlight: "the whole trip",
    line3b: " - in a few minutes and for 0 PLN.",
    bullets: [
      { icon: "✈️", title: "Flight and stay from one start", body: "Fewer tabs, less chaos and a faster decision." },
      { icon: "🗺️", title: "A plan, not just a booking", body: "What to see, where to stay and how to move to the next steps." },
      { icon: "🌍", title: "Start from Poland or Europe", body: "For short trips, city breaks and warm destinations." },
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">{text.eyebrow}</p>
          <h2 className="mt-3 max-w-4xl font-display text-3xl leading-[1.15] sm:text-4xl md:text-5xl">
            <span className="text-white/75">{text.line1}</span> <span className="text-white/75">{text.line2}</span>
            <br />
            {text.line3a}
            <span className="text-amber-300">{text.line3highlight}</span>
            {text.line3b}
          </h2>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {text.bullets.map((bullet) => (
              <div
                key={bullet.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-emerald-300/40 hover:bg-white/8"
              >
                <span aria-hidden className="text-2xl">
                  {bullet.icon}
                </span>
                <p className="mt-2 text-base font-bold text-white">{bullet.title}</p>
                <p className="mt-1 text-sm leading-6 text-emerald-50/75">{bullet.body}</p>
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
