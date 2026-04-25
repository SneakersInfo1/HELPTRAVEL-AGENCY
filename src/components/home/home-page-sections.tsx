"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { PartnerPlacementSection } from "@/components/site/partner-placement-section";
import { sendClientEvent } from "@/lib/mvp/client-events";
import { buildPartnerPlacementCards } from "@/lib/mvp/partner-placements";
import {
  getPlannerSnapshot,
  getSavedDestinations,
  type PlannerSnapshot,
  type SavedDestinationMemory,
} from "@/lib/mvp/planner-memory";
import { localeFromPathname, type SiteLocale } from "@/lib/mvp/locale";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";
import { addDaysToIsoDate, formatShortDate, normalizeTravelEndDate } from "@/lib/mvp/travel-dates";
import { TRUSTED_TRAVEL_RESOURCES } from "@/lib/mvp/trusted-resources";

interface FeaturedDirection {
  slug: string;
  city: string;
  country: string;
  heroImage: string;
  vibe: string;
  tagline: string;
  bestFor: string[];
}

interface HomePageSectionsProps {
  featuredDirections: FeaturedDirection[];
  latestArticles: EditorialArticle[];
  locale?: SiteLocale;
}

function buildPlannerHref(destination: string, origin = "Warszawa") {
  const params = new URLSearchParams({
    mode: "standard",
    q: destination,
    origin,
    destination,
  });

  return `/planner?${params.toString()}`;
}

function buildSnapshotPlannerHref(snapshot: PlannerSnapshot) {
  const params = new URLSearchParams({
    mode: snapshot.mode,
    q: snapshot.mode === "discovery" ? snapshot.query : snapshot.destinationHint || snapshot.query,
    origin: snapshot.originCity,
    travelers: String(snapshot.travelers),
    budget: String(snapshot.budget),
    days: String(snapshot.travelNights),
    nights: String(snapshot.travelNights),
    startDate: snapshot.travelStartDate,
    endDate: snapshot.travelEndDate ?? addDaysToIsoDate(snapshot.travelStartDate, snapshot.travelNights),
  });

  if (snapshot.mode === "standard") {
    params.set("destination", snapshot.destinationHint || snapshot.query);
  }

  return `/planner?${params.toString()}`;
}

const copy = {
  pl: {
    howEyebrow: "Jak to działa",
    howTitle: "Jedna decyzja na raz.",
    howBody: "Najpierw wybierasz kierunek albo opisujesz potrzebę. Potem ustawiasz termin i przechodzisz do noclegów, lotów i dalszych kroków.",
    steps: [
      { step: "01", title: "Wybierasz kierunek lub potrzebę", text: "Możesz podać miasto albo opisać, jakiego wyjazdu szukasz." },
      { step: "02", title: "Ustawiasz termin i liczbę osób", text: "Te same dane przechodzą dalej do noclegów, lotów i dodatków." },
      { step: "03", title: "Przechodzisz do kolejnych kroków", text: "Najpierw noclegi, potem loty i rzeczy do ogarnięcia na miejscu." },
    ],
    scenariosEyebrow: "Popularne scenariusze",
    scenariosTitle: "Zacznij od tego, co chcesz zyskać z wyjazdu.",
    scenarios: [
      { title: "City break", description: "3-4 dni w miescie z dobrym planem zwiedzania.", href: "/city-breaki" },
      { title: "Ciepły wyjazd", description: "Słońce, morze albo spokojniejszy reset poza Polską.", href: "/cieple-kierunki" },
      { title: "Weekend we dwoje", description: "Krótki wyjazd dla pary, bez przeciążania logistyką.", href: "/weekendowe-wyjazdy" },
      { title: "Budżet pod kontrolą", description: "Kierunki, które łatwiej obronić przy konkretnym budżecie.", href: "/tanie-podroze" },
    ],
    articlesTitle: "Pomysły na wyjazd",
    articlesCta: "Więcej pomysłów",
    directionsEyebrow: "Mocne kierunki na start",
    directionsTitle: "Kilka miejsc, od których najłatwiej zacząć.",
    openGuide: "Zobacz kierunek",
    openPlanner: "Planner",
    scaleEyebrow: "Skala serwisu",
    scaleTitle: "W plannerze znajdziesz 235 kierunków. Pełne przewodniki mamy obecnie dla 22 najważniejszych.",
    scaleBody:
      "Reszta jest dostępna w katalogu i plannerze. Nie udajemy, że każda strona ma ten sam poziom rozbudowania.",
    trustEyebrow: "Zaufanie i przejrzystość",
    trustTitle: "Pomagamy wybrać wyjazd. Finalna rezerwacja zawsze należy do partnera.",
    trustItems: [
      "Korzystanie z serwisu jest darmowe.",
      "Linki partnerskie opisujemy wprost.",
      "Finalne ceny i warunki sprawdzasz u partnera.",
      "Do informacji praktycznych linkujemy tez do oficjalnych zrodel.",
    ],
    partnersEyebrow: "Partnerzy na start",
    partnersTitle: "Wiesz już, gdzie klikniesz dalej.",
    partnersBody:
      "Na tej stronie pokazujemy prosto, które marki wspierają noclegi, loty, atrakcje i transfery. Najpierw wybierasz kierunek, potem przechodzisz do odpowiedniego partnera.",
    partnersFooterNote:
      "Na homepage pokazujemy układ partnerów i ścieżkę dalej. Konkretne wyniki otwierasz już na kierunku albo w plannerze.",
    returnEyebrow: "Wróć do planu",
    returnTitle: "Masz już zaczęty plan albo zapisane kierunki.",
    returnBody: "Możesz wracać do ostatniego planu i ulubionych miejsc bez wpisywania wszystkiego od nowa.",
    resumePlan: "Wróć do planu",
    savedDirections: "Zapisane kierunki",
    finalEyebrow: "Gotowy start",
    finalTitle: "Najprościej zacząć od kierunku albo od opisu wyjazdu.",
    finalBody: "Jeśli znasz miasto, przejdź od razu do planera. Jeśli nie, opisz wyjazd i porównaj pomysły.",
    finalPrimary: "Mam kierunek",
    finalSecondary: "Pomóż mi wybrać",
  },
  en: {
    howEyebrow: "How it works",
    howTitle: "One decision at a time.",
    howBody: "Start with a destination or with the kind of trip you want. Then set the dates and move into stays, flights and the next steps.",
    steps: [
      { step: "01", title: "Choose a destination or a travel need", text: "You can enter a city or describe the kind of trip you want." },
      { step: "02", title: "Set dates and travelers", text: "The same details move into stays, flights and useful extras." },
      { step: "03", title: "Open the next steps", text: "Start with stays, then flights and the things to arrange on the ground." },
    ],
    scenariosEyebrow: "Popular trip types",
    scenariosTitle: "Start with the trip you want.",
    scenarios: [
      { title: "City break", description: "A short city trip with a clear sightseeing plan.", href: "/city-breaki" },
      { title: "Warm escape", description: "Sun, coast or a lighter reset outside Poland.", href: "/cieple-kierunki" },
      { title: "Weekend for two", description: "A shorter trip with simpler logistics.", href: "/weekendowe-wyjazdy" },
      { title: "Budżet pod kontrolą", description: "Kierunki, które łatwiej obronić przy konkretnym budżecie.", href: "/tanie-podroze" },
    ],
    articlesTitle: "Trip ideas",
    articlesCta: "More ideas",
    directionsEyebrow: "Strong starting points",
    directionsTitle: "A few destinations that are easiest to start with.",
    openGuide: "Open guide",
    openPlanner: "Planner",
    scaleEyebrow: "Service scale",
    scaleTitle: "The planner covers 235 destinations. Full public guides are currently available for 22 core ones.",
    scaleBody: "The rest is still searchable in the catalog and planner. We do not pretend every destination has the same editorial depth.",
    trustEyebrow: "Trust and transparency",
    trustTitle: "We help people choose the trip. Final booking always belongs to the partner.",
    trustItems: [
      "The service is free to use.",
      "Affiliate links are clearly explained.",
      "Final prices and conditions are checked with the partner.",
      "We also link to official travel resources when needed.",
    ],
    partnersEyebrow: "Partner setup",
    partnersTitle: "You already know where the next click goes.",
    partnersBody:
      "This page shows which brands support stays, flights, activities and transfers. You first choose the destination and then open the right partner.",
    partnersFooterNote:
      "On the homepage we show the partner layout and the next step. The concrete results open on the destination or inside the planner.",
    returnEyebrow: "Continue planning",
    returnTitle: "You already have a saved plan or destination shortlist.",
    returnBody: "Come back to your last plan or saved destinations without rebuilding the whole search.",
    resumePlan: "Resume plan",
    savedDirections: "Saved destinations",
    finalEyebrow: "Simple start",
    finalTitle: "The easiest way to start is with a destination or with a trip idea.",
    finalBody: "If you know the city, jump into the planner. If not, describe the trip and compare ideas first.",
    finalPrimary: "I know the destination",
    finalSecondary: "Help me choose",
  },
} as const;

export function HomePageSections({
  featuredDirections,
  latestArticles,
  locale: localeOverride,
}: HomePageSectionsProps) {
  const pathname = usePathname();
  const { locale: contextLocale } = useLanguage();
  const locale = localeOverride ?? localeFromPathname(pathname) ?? contextLocale;
  const text = copy[locale];
  const [lastSnapshot, setLastSnapshot] = useState<PlannerSnapshot | null>(null);
  const [savedDestinations, setSavedDestinations] = useState<SavedDestinationMemory[]>([]);
  const dateLocale = locale === "en" ? "en-GB" : "pl-PL";
  const partnerPlacementCards = buildPartnerPlacementCards({
    city: "Warszawa",
    country: "Polska",
    locale,
    originCity: "Warszawa",
    checkInDate: lastSnapshot?.travelStartDate,
    checkOutDate: lastSnapshot?.travelEndDate,
    passengers: lastSnapshot?.travelers,
    rooms: lastSnapshot?.rooms,
  }).map((card, index) =>
    index === 0
      ? { ...card, href: "/kierunki", sourceLabel: "CJ", partnerLabels: ["Hotels.com", "Expedia", "Vrbo"] }
      : index === 1
        ? { ...card, href: "/planner?mode=standard", sourceLabel: "CJ / Travelpayouts", partnerLabels: ["Aviasales", "LOT Global", "Kiwi.com"] }
        : index === 2
          ? { ...card, href: "/inspiracje", sourceLabel: "Travelpayouts", partnerLabels: ["Tiqets", "Klook", "WeGoTrip"] }
          : { ...card, href: "/jak-pracujemy", sourceLabel: "Travelpayouts", partnerLabels: ["Kiwitaxi", "Localrent", "GetRentacar"] },
  );

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setLastSnapshot(getPlannerSnapshot());
      setSavedDestinations(getSavedDestinations().slice(0, 3));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-4 sm:px-6 xl:px-8">
      {lastSnapshot || savedDestinations.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.returnEyebrow}</p>
              <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.returnTitle}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-900/74">{text.returnBody}</p>
              {lastSnapshot ? (
                <LocalizedLink
                  href={buildSnapshotPlannerHref(lastSnapshot)}
                  locale={locale}
                  className="mt-5 inline-flex rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  {text.resumePlan}
                </LocalizedLink>
              ) : null}
            </div>

            {savedDestinations.length > 0 ? (
              <div className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.savedDirections}</p>
                <div className="mt-4 grid gap-3">
                  {savedDestinations.map((destination) => (
                    <LocalizedLink
                      key={destination.slug}
                      href={`/kierunki/${destination.slug}`}
                      locale={locale}
                      className="rounded-[1.25rem] border border-emerald-900/10 bg-white px-4 py-4 text-sm font-semibold text-emerald-950 transition hover:border-emerald-500/40 hover:bg-emerald-100"
                    >
                      {destination.city}, {destination.country}
                    </LocalizedLink>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.howEyebrow}</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.howTitle}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/74">{text.howBody}</p>
          </div>
          <LocalizedLink href="/planner?mode=standard" locale={locale} className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
            Planner
          </LocalizedLink>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {text.steps.map((item) => (
            <article key={item.step} className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/70 p-5">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-extrabold text-emerald-950 shadow-sm">
                {item.step}
              </span>
              <h3 className="mt-4 text-2xl font-bold text-emerald-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.scenariosEyebrow}</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.scenariosTitle}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {text.scenarios.map((scenario) => (
              <LocalizedLink
                key={scenario.href}
                href={scenario.href}
                locale={locale}
                className="rounded-[1.5rem] border border-emerald-900/10 bg-white px-4 py-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/40"
              >
                <h3 className="text-xl font-bold text-emerald-950">{scenario.title}</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900/72">{scenario.description}</p>
              </LocalizedLink>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.articlesTitle}</p>
            </div>
            <LocalizedLink href="/inspiracje" locale={locale} className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
              {text.articlesCta}
            </LocalizedLink>
          </div>
          <div className="mt-5 grid gap-4">
            {latestArticles.slice(0, 3).map((article) => (
              <EditorialArticleCard key={article.slug} article={article} compact locale={locale} />
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.directionsEyebrow}</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.directionsTitle}</h2>
          </div>
          <LocalizedLink href="/kierunki" locale={locale} className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            {text.openGuide}
          </LocalizedLink>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {featuredDirections.slice(0, 6).map((item) => (
            <article key={item.slug} className="overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white shadow-[0_16px_40px_rgba(16,84,48,0.08)]">
              <div className="relative h-56">
                <Image
                  src={item.heroImage}
                  alt={`${item.city}, ${item.country}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,26,15,0.08)_0%,rgba(8,26,15,0.5)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">{item.country}</p>
                  <h3 className="mt-2 text-3xl font-bold">{item.city}</h3>
                </div>
              </div>
              <div className="p-5">
                <p className="line-clamp-3 text-sm leading-7 text-emerald-900/78">{item.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.bestFor.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <LocalizedLink
                    href={`/kierunki/${item.slug}`}
                    locale={locale}
                    onClick={() =>
                      sendClientEvent("destination_card_clicked", {
                        slug: item.slug,
                        city: item.city,
                        action: "guide",
                        source: "homepage",
                        locale,
                      })
                    }
                    className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
                  >
                    {text.openGuide}
                  </LocalizedLink>
                  <LocalizedLink
                    href={buildPlannerHref(item.city)}
                    locale={locale}
                    onClick={() =>
                      sendClientEvent("destination_card_clicked", {
                        slug: item.slug,
                        city: item.city,
                        action: "planner",
                        source: "homepage",
                        locale,
                      })
                    }
                    className="rounded-full border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                  >
                    {text.openPlanner}
                  </LocalizedLink>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_24px_80px_rgba(6,29,16,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">{text.scaleEyebrow}</p>
          <h2 className="mt-2 font-display text-4xl sm:text-5xl">{text.scaleTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-white/78">{text.scaleBody}</p>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{text.trustEyebrow}</p>
          <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">{text.trustTitle}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {text.trustItems.map((item) => (
              <div key={item} className="rounded-[1.4rem] border border-emerald-900/10 bg-emerald-50/75 px-4 py-4 text-sm leading-6 text-emerald-950">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {TRUSTED_TRAVEL_RESOURCES.slice(0, 4).map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-emerald-900/10 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
              >
                {resource.label[locale]}
              </a>
            ))}
          </div>
        </article>
      </section>

      <PartnerPlacementSection
        eyebrow={text.partnersEyebrow}
        title={text.partnersTitle}
        body={text.partnersBody}
        cards={partnerPlacementCards}
        footerNote={text.partnersFooterNote}
      />

      <section className="relative overflow-hidden rounded-[2.3rem] border border-emerald-900/10 bg-emerald-950 px-6 py-8 text-white shadow-[0_28px_80px_rgba(6,29,16,0.18)] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.18),transparent_26%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">{text.finalEyebrow}</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">{text.finalTitle}</h2>
            <p className="mt-4 text-sm leading-8 text-emerald-50/78">{text.finalBody}</p>
            {lastSnapshot ? (
              <p className="mt-4 text-sm text-emerald-100/76">
                {formatShortDate(lastSnapshot.travelStartDate, dateLocale)} -{" "}
                {formatShortDate(
                  normalizeTravelEndDate(
                    lastSnapshot.travelStartDate,
                    lastSnapshot.travelEndDate,
                    lastSnapshot.travelNights,
                  ),
                  dateLocale,
                )}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <LocalizedLink
              href="/planner?mode=standard"
              locale={locale}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              {text.finalPrimary}
            </LocalizedLink>
            <LocalizedLink
              href="/planner?mode=discovery"
              locale={locale}
              className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
            >
              {text.finalSecondary}
            </LocalizedLink>
          </div>
        </div>
      </section>
    </div>
  );
}


