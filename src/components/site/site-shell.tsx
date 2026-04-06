"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { LocalizedLink } from "@/components/site/localized-link";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { useLanguage } from "@/components/site/language-provider";

const copy = {
  pl: {
    nav: [
      { href: "/", label: "Start" },
      { href: "/planner", label: "Planer" },
      { href: "/kierunki", label: "Kierunki" },
      { href: "/inspiracje", label: "Inspiracje" },
      { href: "/przewodniki", label: "Przewodniki" },
      { href: "/jak-pracujemy", label: "Jak pracujemy" },
    ],
    mobileLinks: [
      { href: "/city-breaki", label: "City breaki" },
      { href: "/cieple-kierunki", label: "Cieple kierunki" },
      { href: "/bez-wizy", label: "Bez wizy" },
      { href: "/kontakt", label: "Kontakt" },
    ],
    plannerCta: "Zacznij plan",
    menuOpen: "Menu",
    menuClose: "Zamknij",
    headerNote: "Kierunek, pobyt, lot i kolejne kroki wyjazdu w jednym flow.",
    footerLead: "Planer podrozy i serwis z przewodnikami pod realne decyzje wyjazdowe.",
    footerBody:
      "Laczymy inspiracje, katalog kierunkow i planner, ktory prowadzi do hoteli, lotow i kolejnych krokow wyjazdu.",
    footerColumns: [
      {
        title: "Odkrywaj",
        links: [
          { href: "/kierunki", label: "Kierunki" },
          { href: "/inspiracje", label: "Inspiracje" },
          { href: "/przewodniki", label: "Przewodniki" },
          { href: "/planner?mode=discovery", label: "Nie wiem dokad leciec" },
          { href: "/mapa-serwisu", label: "Mapa serwisu" },
        ],
      },
      {
        title: "Tematy",
        links: [
          { href: "/city-breaki", label: "City breaki" },
          { href: "/cieple-kierunki", label: "Cieple kierunki" },
          { href: "/tanie-podroze", label: "Tanie podroze" },
          { href: "/weekendowe-wyjazdy", label: "Weekendowe wyjazdy" },
        ],
      },
      {
        title: "Zaufanie",
        links: [
          { href: "/o-nas", label: "O nas" },
          { href: "/kontakt", label: "Kontakt" },
          { href: "/polityka-prywatnosci", label: "Polityka prywatnosci" },
          { href: "/regulamin", label: "Regulamin" },
          { href: "/linki-partnerskie", label: "Linki partnerskie" },
          { href: "/dla-partnerow", label: "Dla partnerow" },
        ],
      },
    ],
    footerMetaLeft: "HelpTravel - planner podrozy, kierunki, inspiracje i przejscia do partnerow.",
    footerMetaRight: "Serwis informacyjny i afiliacyjny. Finalne warunki oferty sprawdzaj zawsze u partnera.",
  },
  en: {
    nav: [
      { href: "/", label: "Home" },
      { href: "/planner", label: "Planner" },
      { href: "/kierunki", label: "Destinations" },
      { href: "/inspiracje", label: "Inspiration" },
      { href: "/przewodniki", label: "Guides" },
      { href: "/jak-pracujemy", label: "How we work" },
    ],
    mobileLinks: [
      { href: "/city-breaki", label: "City breaks" },
      { href: "/cieple-kierunki", label: "Warm escapes" },
      { href: "/bez-wizy", label: "Visa-free" },
      { href: "/kontakt", label: "Contact" },
    ],
    plannerCta: "Start planning",
    menuOpen: "Menu",
    menuClose: "Close",
    headerNote: "Destination, stay, flight and the next trip step in one flow.",
    footerLead: "Trip planner and travel content built for real booking decisions.",
    footerBody:
      "We combine destination discovery, editorial guidance and a planner that moves users toward stays, flights and next travel steps.",
    footerColumns: [
      {
        title: "Discover",
        links: [
          { href: "/kierunki", label: "Destinations" },
          { href: "/inspiracje", label: "Inspiration" },
          { href: "/przewodniki", label: "Guides" },
          { href: "/planner?mode=discovery", label: "I need ideas" },
          { href: "/mapa-serwisu", label: "Site map" },
        ],
      },
      {
        title: "Themes",
        links: [
          { href: "/city-breaki", label: "City breaks" },
          { href: "/cieple-kierunki", label: "Warm escapes" },
          { href: "/tanie-podroze", label: "Budget travel" },
          { href: "/weekendowe-wyjazdy", label: "Weekend trips" },
        ],
      },
      {
        title: "Trust",
        links: [
          { href: "/o-nas", label: "About" },
          { href: "/kontakt", label: "Contact" },
          { href: "/polityka-prywatnosci", label: "Privacy policy" },
          { href: "/regulamin", label: "Terms" },
          { href: "/linki-partnerskie", label: "Affiliate disclosure" },
          { href: "/dla-partnerow", label: "For partners" },
        ],
      },
    ],
    footerMetaLeft: "HelpTravel - trip planner, destinations, inspiration and partner outbound flow.",
    footerMetaRight: "Informational and affiliate-based website. Always check final conditions with the external partner.",
  },
} as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const pathname = usePathname();
  const text = copy[locale];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mobileMenuButtonLabel = mobileMenuOpen ? text.menuClose : text.menuOpen;
  const primaryLinks = useMemo(() => text.nav, [text.nav]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-4 sm:px-6 lg:px-8">
      <header className="sticky top-0 z-30 mt-3 overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white/82 px-4 py-3 shadow-[0_14px_40px_rgba(12,58,34,0.06)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <LocalizedLink href="/" className="flex items-center">
              <Image
                src="/branding/helptravel-logo.png"
                alt="HelpTravel"
                width={320}
                height={240}
                className="h-auto w-[118px] sm:w-[148px]"
                priority
              />
            </LocalizedLink>
            <div className="hidden min-[920px]:block">
              <p className="max-w-xs text-xs font-medium leading-5 text-emerald-900/62">{text.headerNote}</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <LanguageSwitcher />
            <nav className="flex flex-wrap items-center gap-2">
              {primaryLinks.map((item) => {
                const active = isActivePath(pathname, item.href);

                return (
                  <LocalizedLink
                    key={item.href}
                    href={item.href}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                      active
                        ? "border-emerald-700 bg-emerald-700 text-white shadow-[0_12px_30px_rgba(21,128,61,0.16)]"
                        : "border-emerald-900/10 bg-white/70 text-emerald-900 hover:border-emerald-500/50 hover:bg-emerald-50"
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
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="inline-flex h-11 items-center rounded-full border border-emerald-900/10 bg-white px-4 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuButtonLabel}
            >
              {mobileMenuButtonLabel}
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="mt-4 grid gap-3 border-t border-emerald-900/10 pt-4 lg:hidden">
            <p className="text-sm leading-6 text-emerald-900/66">{text.headerNote}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {primaryLinks.map((item) => {
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
              className="inline-flex items-center justify-center rounded-[1.2rem] bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              {text.plannerCta}
            </LocalizedLink>
          </div>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="mt-8 rounded-[2rem] border border-emerald-900/10 bg-white/92 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
          <div>
            <Image
              src="/branding/helptravel-logo.png"
              alt="HelpTravel"
              width={220}
              height={136}
              className="h-auto w-[180px] sm:w-[220px]"
            />
            <h2 className="mt-3 font-display text-4xl leading-none text-emerald-950">{text.footerLead}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/76">{text.footerBody}</p>
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-900/10 pt-4 text-xs text-emerald-900/62">
          <p>{text.footerMetaLeft}</p>
          <p>{text.footerMetaRight}</p>
        </div>
      </footer>
    </div>
  );
}
