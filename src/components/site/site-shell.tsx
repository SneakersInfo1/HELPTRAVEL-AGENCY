"use client";

import Image from "next/image";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { LocalizedLink } from "@/components/site/localized-link";
import { PartnerLogoWordmark, TRUSTED_PARTNERS } from "@/components/site/partner-logo";
import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, stripLocalePrefix } from "@/lib/mvp/locale";
import {
  POPULAR_DESTINATIONS_EN,
  POPULAR_DESTINATIONS_PL,
  POPULAR_ROUTES_EN,
  POPULAR_ROUTES_PL,
  buildDestinationHref,
  buildRouteHref,
} from "@/lib/mvp/popular-routes";
import { TRUSTED_TRAVEL_RESOURCES } from "@/lib/mvp/trusted-resources";

const copy = {
  pl: {
    nav: [
      { href: "/planner", label: "Planner" },
      { href: "/kierunki", label: "Kierunki" },
      { href: "/inspiracje", label: "Pomysły na wyjazd" },
      { href: "/jak-pracujemy", label: "Jak to działa" },
      { href: "/o-nas", label: "O serwisie" },
    ],
    mobileLinks: [
      { href: "/faq", label: "FAQ" },
      { href: "/kontakt", label: "Kontakt" },
      { href: "/linki-partnerskie", label: "Linki partnerskie" },
    ],
    plannerCta: "Zacznij planować",
    menuOpen: "Menu",
    menuClose: "Zamknij menu",
    headerNote: "Kierunek, termin i kolejne kroki wyjazdu bez chaosu.",
    skipToContent: "Przejdź do treści",
    footerLead: "Pomagamy wybrać wyjazd i przejść dalej spokojnie.",
    footerBody: "Korzystanie z serwisu jest darmowe. Rezerwacje finalizujesz u partnera, a ostatnie ceny i warunki zawsze sprawdzasz po jego stronie.",
    footerColumns: [
      {
        title: "Start",
        links: [
          { href: "/planner", label: "Planner" },
          { href: "/kierunki", label: "Katalog kierunków" },
          { href: "/inspiracje", label: "Pomysły na wyjazd" },
          { href: "/city-breaki", label: "City breaki" },
        ],
      },
      {
        title: "Zaufanie",
        links: [
          { href: "/jak-pracujemy", label: "Jak to działa" },
          { href: "/o-nas", label: "O serwisie" },
          { href: "/faq", label: "FAQ" },
          { href: "/kontakt", label: "Kontakt" },
        ],
      },
      {
        title: "Pomoc i dokumenty",
        links: [
          { href: "/cennik", label: "Cennik" },
          { href: "/linki-partnerskie", label: "Linki partnerskie" },
          { href: "/polityka-prywatnosci", label: "Polityka prywatnosci" },
          { href: "/regulamin", label: "Regulamin" },
          { href: "/dla-partnerow", label: "Dla partnerów" },
          { href: "/standard-redakcyjny", label: "Standard redakcyjny" },
        ],
      },
    ],
    resourcesTitle: "Oficjalne źródła przed wyjazdem",
    partnerTitle: "Partnerzy rezerwacyjni",
    footerMetaLeft: "Planner, kierunki i pomysły na wyjazd dla osób z Polski.",
    footerMetaRight: "Transparentny serwis afiliacyjny. Nie jestesmy biurem podróży.",
  },
  en: {
    nav: [
      { href: "/planner", label: "Planner" },
      { href: "/kierunki", label: "Destinations" },
      { href: "/inspiracje", label: "Trip ideas" },
      { href: "/jak-pracujemy", label: "How it works" },
      { href: "/o-nas", label: "About" },
    ],
    mobileLinks: [
      { href: "/faq", label: "FAQ" },
      { href: "/kontakt", label: "Contact" },
      { href: "/linki-partnerskie", label: "Affiliate links" },
    ],
    plannerCta: "Start planning",
    menuOpen: "Menu",
    menuClose: "Close menu",
    headerNote: "Destination, dates and the next travel steps without the usual clutter.",
    skipToContent: "Skip to content",
    footerLead: "We help people choose a trip and move forward calmly.",
    footerBody: "The service is free to use. Final booking happens with the partner, and the last price or policy should always be checked on their site.",
    footerColumns: [
      {
        title: "Start",
        links: [
          { href: "/planner", label: "Planner" },
          { href: "/kierunki", label: "Destination catalog" },
          { href: "/inspiracje", label: "Trip ideas" },
          { href: "/city-breaki", label: "City breaks" },
        ],
      },
      {
        title: "Trust",
        links: [
          { href: "/jak-pracujemy", label: "How it works" },
          { href: "/o-nas", label: "About" },
          { href: "/faq", label: "FAQ" },
          { href: "/kontakt", label: "Contact" },
        ],
      },
      {
        title: "Help and documents",
        links: [
          { href: "/cennik", label: "Pricing" },
          { href: "/linki-partnerskie", label: "Affiliate links" },
          { href: "/polityka-prywatnosci", label: "Privacy policy" },
          { href: "/regulamin", label: "Terms" },
          { href: "/dla-partnerow", label: "For partners" },
          { href: "/standard-redakcyjny", label: "Editorial standard" },
        ],
      },
    ],
    resourcesTitle: "Official resources before a trip",
    partnerTitle: "Booking partners",
    footerMetaLeft: "Planner, destinations and trip ideas for short leisure travel.",
    footerMetaRight: "Transparent affiliate website. Not a travel agency.",
  },
} as const;

function isActivePath(pathname: string, href: string) {
  const normalizedPathname = stripLocalePrefix(pathname);
  return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const pathname = usePathname();
  const effectiveLocale = localeFromPathname(pathname) ?? locale;
  const text = copy[effectiveLocale];
  const shouldLoadStay22 = !pathname.startsWith("/admin");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-4 sm:px-6 lg:px-8">
      {shouldLoadStay22 ? (
        <Script id="stay22-letmeallez" strategy="afterInteractive">
          {`(function (s, t, a, y, twenty, two) {
  s.Stay22 = s.Stay22 || {};
  s.Stay22.params = { lmaID: "69dbaa5050e44cb3cb21c07e" };
  twenty = t.createElement(a);
  two = t.getElementsByTagName(a)[0];
  twenty.async = 1;
  twenty.src = y;
  two.parentNode.insertBefore(twenty, two);
})(window, document, "script", "https://scripts.stay22.com/letmeallez.js");`}
        </Script>
      ) : null}

      <a
        href="#main-content"
        className="sr-only rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        {text.skipToContent}
      </a>

      <header className="sticky top-0 z-30 mt-2 overflow-hidden rounded-[1.45rem] border border-emerald-900/10 bg-white/92 px-3 py-1.5 shadow-[0_10px_30px_rgba(12,58,34,0.055)] backdrop-blur-xl sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <LocalizedLink href="/" className="flex items-center">
              <Image
                src="/branding/helptravel-logo.png"
                alt="HelpTravel"
                width={320}
                height={240}
                className="h-auto w-[82px] sm:w-[96px]"
                priority
              />
            </LocalizedLink>
          </div>

          <nav aria-label="Główne menu" className="hidden items-center gap-2 lg:flex">
            {text.nav.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <LocalizedLink
                  key={item.href}
                  href={item.href}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                    active
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-[0_12px_30px_rgba(21,128,61,0.16)]"
                      : "border-emerald-900/10 bg-white text-emerald-900 hover:border-emerald-500/50 hover:bg-emerald-50"
                  }`}
                >
                  {item.label}
                </LocalizedLink>
              );
            })}
            <LocalizedLink
              href="/planner?mode=standard"
              className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              {text.plannerCta}
            </LocalizedLink>
          </nav>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="inline-flex min-h-10 items-center rounded-full border border-emerald-900/10 bg-white px-4 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50 lg:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? text.menuClose : text.menuOpen}
          >
            {mobileMenuOpen ? text.menuClose : text.menuOpen}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="mt-4 grid gap-3 border-t border-emerald-900/10 pt-4 lg:hidden">
            <p className="text-sm leading-6 text-emerald-900/70">{text.headerNote}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {text.nav.map((item) => {
                const active = isActivePath(pathname, item.href);

                return (
                  <LocalizedLink
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition ${
                      active
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-emerald-900/10 bg-white text-emerald-950 hover:bg-emerald-50"
                    }`}
                  >
                    {item.label}
                  </LocalizedLink>
                );
              })}
              {text.mobileLinks.map((item) => (
                <LocalizedLink
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-[1.2rem] border border-emerald-900/10 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
                >
                  {item.label}
                </LocalizedLink>
              ))}
            </div>
            <LocalizedLink
              href="/planner?mode=standard"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-[1.2rem] bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              {text.plannerCta}
            </LocalizedLink>
          </div>
        ) : null}
      </header>

      <div id="main-content" className="flex flex-1 flex-col">
        {children}
      </div>

      <footer className="mt-8 rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
          <div>
            <Image
              src="/branding/helptravel-logo.png"
              alt="HelpTravel"
              width={220}
              height={136}
              className="h-auto w-[180px] sm:w-[220px]"
            />
            <h2 className="mt-3 text-2xl font-bold leading-tight text-emerald-950">{text.footerLead}</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/76">{text.footerBody}</p>
          </div>

          {text.footerColumns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{column.title}</p>
              <div className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <LocalizedLink
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium text-emerald-900/78 transition hover:text-emerald-700"
                  >
                    {link.label}
                  </LocalizedLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* SEO internal links: top kierunki + top trasy origin->destination */}
        <section className="mt-8 grid gap-6 border-t border-emerald-900/10 pt-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {effectiveLocale === "en" ? "Popular destinations" : "Popularne kierunki"}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {(effectiveLocale === "en" ? POPULAR_DESTINATIONS_EN : POPULAR_DESTINATIONS_PL).map((dest) => (
                <li key={dest.slug}>
                  <LocalizedLink
                    href={buildDestinationHref(dest)}
                    className="inline-flex items-center rounded-full border border-emerald-900/10 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:border-emerald-500/40 hover:bg-emerald-100"
                  >
                    {dest.anchor}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {effectiveLocale === "en" ? "Popular routes" : "Popularne trasy"}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {(effectiveLocale === "en" ? POPULAR_ROUTES_EN : POPULAR_ROUTES_PL).map((route) => (
                <li key={`${route.origin}-${route.destinationSlug}`}>
                  <LocalizedLink
                    href={buildRouteHref(route)}
                    className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:border-amber-400 hover:bg-amber-100"
                  >
                    <span aria-hidden className="mr-1 text-amber-600">✈</span>
                    {route.anchor}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-8 grid gap-6 border-t border-emerald-900/10 pt-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.resourcesTitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {TRUSTED_TRAVEL_RESOURCES.slice(0, 4).map((resource) => (
                <a
                  key={resource.href}
                  href={resource.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-emerald-900/10 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:border-emerald-500/40 hover:bg-emerald-100"
                >
                  {resource.label[effectiveLocale]}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.partnerTitle}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {TRUSTED_PARTNERS.map((partner) => (
                <PartnerLogoWordmark key={partner} brand={partner} />
              ))}
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-900/10 pt-4 text-xs text-emerald-900/62">
          <p>{text.footerMetaLeft}</p>
          <p>{text.footerMetaRight}</p>
        </div>
      </footer>
    </div>
  );
}

