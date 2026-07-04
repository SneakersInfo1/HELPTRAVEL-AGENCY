"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, stripLocalePrefix } from "@/lib/mvp/locale";

const copy = {
  pl: {
    nav: [
      { href: "/kierunki", label: "Kierunki" },
      { href: "/inspiracje", label: "Pomysły na wyjazd" },
      { href: "/jak-pracujemy", label: "Jak to działa" },
      { href: "/o-nas", label: "O serwisie" },
      { href: "/regulamin", label: "Regulamin" },
    ],
    mobileLinks: [
      { href: "/faq", label: "FAQ" },
      { href: "/kontakt", label: "Kontakt" },
      { href: "/linki-partnerskie", label: "Linki partnerskie" },
      { href: "/regulamin", label: "Regulamin" },
      { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
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
          { href: "/", label: "Hotele" },
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
          { href: "/redakcja", label: "Redakcja" },
          { href: "/raporty", label: "Raporty i dane" },
          { href: "/faq", label: "FAQ" },
          { href: "/kontakt", label: "Kontakt" },
        ],
      },
      {
        title: "Pomoc i dokumenty",
        links: [
          { href: "/cennik", label: "Cennik" },
          { href: "/linki-partnerskie", label: "Linki partnerskie" },
          { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
          { href: "/regulamin", label: "Regulamin" },
          { href: "/dla-partnerow", label: "Dla partnerów" },
          { href: "/standard-redakcyjny", label: "Standard redakcyjny" },
          { href: "#cookie-settings", label: "Ustawienia cookies" },
        ],
      },
    ],
    footerMetaLeft: "Planner, kierunki i pomysły na wyjazd dla osób z Polski.",
    footerMetaRight: "Transparentny serwis afiliacyjny. Nie jesteśmy biurem podróży.",
  },
  en: {
    nav: [
      { href: "/kierunki", label: "Destinations" },
      { href: "/inspiracje", label: "Trip ideas" },
      { href: "/jak-pracujemy", label: "How it works" },
      { href: "/o-nas", label: "About" },
      { href: "/regulamin", label: "Terms" },
    ],
    mobileLinks: [
      { href: "/faq", label: "FAQ" },
      { href: "/kontakt", label: "Contact" },
      { href: "/linki-partnerskie", label: "Affiliate links" },
      { href: "/regulamin", label: "Terms" },
      { href: "/polityka-prywatnosci", label: "Privacy policy" },
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
          { href: "/", label: "Hotele" },
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
          { href: "/redakcja", label: "Editorial team" },
          { href: "/raporty", label: "Reports & data" },
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
          { href: "#cookie-settings", label: "Cookie settings" },
        ],
      },
    ],
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Checkout funnel (guest data → payment → confirmation) gets a MINIMAL
  // footer: Clarity showed the full footer's link wall (destinations, routes,
  // external resources) pulling buyers out of the flow right before payment.
  // Booking/Airbnb do the same — legal links only past this point.
  const isCheckout = stripLocalePrefix(pathname).startsWith("/hotele/rezerwacja");
  // Homepage wychodzi poza globalny kontener 1280 px (właściciel 2026-07-04:
  // „strona ma być pełna, bez pustych przestrzeni na bokach"). Pozostałe
  // strony (artykuły, wyniki, checkout) zostają w max-w-7xl dla czytelności —
  // treść tekstowa nie może się rozjeżdżać na całą szerokość monitora.
  const isHome = stripLocalePrefix(pathname) === "/";

  return (
    <div
      className={`mx-auto flex min-h-screen w-full flex-col px-4 pb-4 sm:px-6 lg:px-8 ${
        isHome ? "max-w-none" : "max-w-7xl"
      }`}
    >
      {/* Skip link removed 2026-05-26 — it duplicated the one already rendered
          by src/app/layout.tsx (both pointed at #main-content, creating two
          competing focus targets for keyboard/AT users). Layout's skip link
          is canonical; this site-shell only owns the #main-content wrapper. */}

      <header className="sticky top-0 z-30 mt-2 rounded-[1.2rem] border border-emerald-900/10 bg-white px-3 py-2 shadow-[0_10px_30px_rgba(12,58,34,0.055)] sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <LocalizedLink
              href="/"
              aria-label="HelpTravel"
              className="flex items-center"
            >
              <Image
                src="/branding/helptravel-logo.png"
                alt="HelpTravel"
                width={160}
                height={160}
                className="block h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
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
              href="/#hero"
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
            aria-controls="mobile-nav-panel"
            aria-label={mobileMenuOpen ? text.menuClose : text.menuOpen}
          >
            {mobileMenuOpen ? text.menuClose : text.menuOpen}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div
            id="mobile-nav-panel"
            role="region"
            aria-label="Menu mobilne"
            className="mt-4 grid gap-3 border-t border-emerald-900/10 pt-4 lg:hidden"
          >
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
              href="/#hero"
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

      {isCheckout ? (
        /* Minimal checkout footer — logo, legal links, disclaimer. Nothing
           that can pull the buyer back out of the funnel. */
        <footer className="mt-8 rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <Image
              src="/branding/helptravel-logo.png"
              alt="HelpTravel"
              width={150}
              height={93}
              className="h-auto w-[120px]"
            />
            <nav
              aria-label={effectiveLocale === "en" ? "Legal" : "Dokumenty"}
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
            >
              {(effectiveLocale === "en"
                ? [
                    { href: "/regulamin", label: "Terms" },
                    { href: "/polityka-prywatnosci", label: "Privacy" },
                    { href: "/cennik", label: "Pricing" },
                    { href: "/kontakt", label: "Contact" },
                    { href: "#cookie-settings", label: "Cookies" },
                  ]
                : [
                    { href: "/regulamin", label: "Regulamin" },
                    { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
                    { href: "/cennik", label: "Cennik" },
                    { href: "/kontakt", label: "Kontakt" },
                    { href: "#cookie-settings", label: "Ustawienia cookies" },
                  ]
              ).map((link) => (
                <LocalizedLink
                  key={link.href}
                  href={link.href}
                  className="text-xs font-medium text-emerald-900/78 transition hover:text-emerald-700"
                >
                  {link.label}
                </LocalizedLink>
              ))}
            </nav>
          </div>
          <p className="mt-4 border-t border-emerald-900/10 pt-3 text-center text-[11px] text-emerald-900/60 sm:text-left">
            {text.footerMetaRight}
          </p>
        </footer>
      ) : (
      <footer className="mt-8 rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
          <div>
            <Image
              src="/branding/helptravel-logo.png"
              alt="HelpTravel"
              width={220}
              height={136}
              className="h-auto w-[140px] sm:w-[200px]"
            />
            <p className="mt-3 text-base font-bold leading-snug text-emerald-950 sm:text-lg">{text.footerLead}</p>
            <p className="mt-2 hidden text-sm leading-6 text-emerald-900/76 sm:block">{text.footerBody}</p>
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
      </footer>
      )}
    </div>
  );
}

