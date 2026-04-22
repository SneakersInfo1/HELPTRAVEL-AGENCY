"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import type { EditorialArticle, EditorialCategory } from "@/lib/mvp/publisher-content";

interface HomePageSectionsProps {
  latestArticles: EditorialArticle[];
  editorialCategories: EditorialCategory[];
  locale?: SiteLocale;
}

const copy = {
  pl: {
    howEyebrow: "Jak to dziala",
    howTitle: "Jedna decyzja na raz. Zero chaosu.",
    openPlanner: "Otworz planner",
    processSteps: [
      { step: "01", title: "Wybierasz miasto", text: "Autocomplete i szybkie pickery prowadza od razu do konkretnej trasy." },
      { step: "02", title: "Ustawiasz termin", text: "Ten sam termin przechodzi dalej do pobytu, lotow i dodatkow." },
      { step: "03", title: "Klikasz w oferty", text: "Najpierw pobyt, potem lot, apartamenty, atrakcje i auta." },
    ],
    faqEyebrow: "Najczesciej pytane",
    faqTitle: "To warto wiedziec zanim zaczniesz.",
    faqItems: [
      {
        q: "Czy korzystanie z HelpTravel jest platne?",
        a: "Nie. Plan wyjazdu, porownanie lotow i hoteli sa w 100% darmowe. Zarabiamy tylko na prowizji od partnerow, gdy zarezerwujesz — cena dla Ciebie jest taka sama jak u nich.",
      },
      {
        q: "Czy musze zakladac konto?",
        a: "Nie. Caly planner dziala bez rejestracji. Wystarczy podac kierunek, daty i liczbe osob.",
      },
      {
        q: "Skad porownujecie loty i hotele?",
        a: "Wspolpracujemy ze sprawdzonymi partnerami (m.in. Booking, Hotels.com, Aviasales, Kiwi). Ceny sa aktualizowane w czasie rzeczywistym.",
      },
      {
        q: "Czy moge lataj z innego miasta niz Warszawa?",
        a: "Tak. Obslugujemy 8 miast w Polsce (Warszawa, Krakow, Gdansk, Wroclaw, Katowice, Poznan, Rzeszow, Lublin) i 14 lotnisk w Europie — praktyczne dla osob pracujacych za granica.",
      },
      {
        q: "Czy ceny sie zmieniaja?",
        a: "Tak, dynamiczne ceny zmieniaja sie nawet kilka razy dziennie. Jesli znajdziesz dobra oferte, warto rezerwowac od razu.",
      },
    ],
    trustLabel: "Bezpieczne platnosci u partnerow",
    categoriesEyebrow: "Kategorie contentowe",
    categoriesTitle: "Inspiracje, ktore od razu prowadza do ruchu i klikniec.",
    articlesEyebrow: "Nowe przewodniki",
    articlesTitle: "Tresci, ktore pomagaja wybrac miasto szybciej.",
    libraryCta: "Cala biblioteka",
    readArticle: "Czytaj artykul",
  },
  en: {
    howEyebrow: "How it works",
    howTitle: "One decision at a time. Zero clutter.",
    openPlanner: "Open planner",
    processSteps: [
      { step: "01", title: "Pick a city", text: "Autocomplete and quick picks move you straight into a real route." },
      { step: "02", title: "Set dates", text: "The same dates flow into stays, flights and useful extras." },
      { step: "03", title: "Open offers", text: "Start with stays, then flights, apartments, attractions and cars." },
    ],
    faqEyebrow: "Frequently asked",
    faqTitle: "What to know before you start.",
    faqItems: [
      {
        q: "Is HelpTravel free to use?",
        a: "Yes. Planning, flight and hotel comparison are 100% free. We only earn a commission from partners when you book — the price you pay is the same as on their sites.",
      },
      {
        q: "Do I need to create an account?",
        a: "No. The whole planner works without registration. Just provide destination, dates and number of travelers.",
      },
      {
        q: "Where do flights and hotels come from?",
        a: "We work with trusted partners (Booking, Hotels.com, Aviasales, Kiwi and more). Prices are updated in real time.",
      },
      {
        q: "Can I fly from a city other than Warsaw?",
        a: "Yes. We support 8 Polish cities (Warsaw, Krakow, Gdansk, Wroclaw, Katowice, Poznan, Rzeszow, Lublin) and 14 airports across Europe — useful if you work abroad.",
      },
      {
        q: "Do prices change?",
        a: "Yes, dynamic prices can change several times per day. If you find a good offer, booking right away is usually worth it.",
      },
    ],
    trustLabel: "Secure payments via partners",
    categoriesEyebrow: "Discovery categories",
    categoriesTitle: "Inspiration routes that can turn into real travel clicks.",
    articlesEyebrow: "Latest guides",
    articlesTitle: "Editorial content that helps people pick a destination faster.",
    libraryCta: "View all guides",
    readArticle: "Read article",
  },
} as const;

export function HomePageSections({
  latestArticles,
  editorialCategories,
  locale: localeOverride,
}: HomePageSectionsProps) {
  const pathname = usePathname();
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? localeFromPathname(pathname) ?? contextLocale;
  const text = copy[locale];
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 sm:px-6 xl:px-8">
      {/* How it works */}
      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.howEyebrow}</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.howTitle}</h2>
          </div>
          <LocalizedLink
            href="/planner"
            locale={locale}
            className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            {text.openPlanner}
          </LocalizedLink>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {text.processSteps.map((item) => (
            <article
              key={item.step}
              className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(245,252,247,0.98),rgba(234,247,239,0.92))] p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_52px_rgba(16,84,48,0.1)]"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-extrabold text-emerald-950 shadow-sm">
                {item.step}
              </span>
              <h3 className="mt-4 text-2xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/72">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ + trust strip */}
      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.faqEyebrow}</p>
        <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">{text.faqTitle}</h2>

        <div className="mt-5 divide-y divide-emerald-900/10 rounded-2xl border border-emerald-900/10 bg-emerald-50/40">
          {text.faqItems.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <button
                key={item.q}
                type="button"
                onClick={() => setOpenFaq(isOpen ? null : idx)}
                aria-expanded={isOpen}
                className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-emerald-50/70"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-950 sm:text-base">{item.q}</p>
                  {isOpen && (
                    <p className="mt-2 text-sm leading-6 text-emerald-900/78">{item.a}</p>
                  )}
                </div>
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border border-emerald-900/15 bg-white text-xs font-bold text-emerald-800 transition ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
            );
          })}
        </div>

        {/* Trust strip — payment partners */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-900/10 bg-emerald-50/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
            <span aria-hidden className="mr-1.5">🔒</span>
            {text.trustLabel}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-emerald-950/70">
            {["Visa", "Mastercard", "BLIK", "PayU", "PayPal", "Apple Pay"].map((m) => (
              <span
                key={m}
                className="rounded-md border border-emerald-900/10 bg-white px-2.5 py-1 tabular-nums"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Categories + articles */}
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(235,248,239,0.98),rgba(225,242,232,0.92))] p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.categoriesEyebrow}</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.categoriesTitle}</h2>
          <div className="mt-6 grid gap-3">
            {editorialCategories.map((category) => (
              <LocalizedLink
                key={category.slug}
                href={`/${category.slug}`}
                locale={locale}
                className="rounded-[1.6rem] border border-emerald-900/10 bg-white px-4 py-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{category.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-bold text-emerald-950">{category.title}</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900/72">{category.description}</p>
              </LocalizedLink>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.articlesEyebrow}</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.articlesTitle}</h2>
            </div>
            <LocalizedLink
              href="/inspiracje"
              locale={locale}
              className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
            >
              {text.libraryCta}
            </LocalizedLink>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {latestArticles.map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact readLabel={text.readArticle} locale={locale} />
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
