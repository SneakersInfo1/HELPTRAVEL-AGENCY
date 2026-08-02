"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Mail, Menu, X } from "lucide-react";

import { HeaderSearchTrigger } from "@/components/site/header-search-trigger";
import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, stripLocalePrefix } from "@/lib/mvp/locale";

const copy = {
  pl: {
    // 4 pozycje zamiast 5: „Regulamin" zszedł do menu mobilnego i stopki
    // (gdzie i tak był). Nawigacja ma prowadzić, a nie wyliczać wszystko.
    nav: [
      { href: "/kierunki", label: "Kierunki" },
      { href: "/inspiracje", label: "Pomysły na wyjazd" },
      { href: "/jak-pracujemy", label: "Jak to działa" },
      { href: "/o-nas", label: "O serwisie" },
    ],
    mobileLinks: [
      { href: "/faq", label: "FAQ" },
      { href: "/regulamin", label: "Regulamin" },
      { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
    ],
    // „Zacznij planować" nie mówiło, co się stanie po kliknięciu. Nazwa akcji
    // = to, co użytkownik dostaje (i ta sama fraza co w pasku sticky).
    plannerCta: "Znajdź wyjazd",
    stickySearch: "Szukaj wyjazdu",
    menuOpen: "Menu",
    menuClose: "Zamknij menu",
    headerNote: "Kierunek, termin i kolejne kroki wyjazdu bez chaosu.",
    skipToContent: "Przejdź do treści",
    footerLead: "Pomagamy wybrać wyjazd i zarezerwować go na miejscu.",
    // POPRAWKA FAKTOGRAFICZNA (redesign 2026-07): poprzednia treść mówiła
    // „Rezerwacje finalizujesz u partnera" i „serwis afiliacyjny" — to zostało
    // po erze Travelpayouts. Dziś rezerwacja i płatność dzieją się TUTAJ
    // (LiteAPI + Stripe, rozliczenie NUITEE TRAVEL). Stopka na stronie
    // o zaufaniu nie może opisywać nieistniejącego modelu.
    footerBody: "Hotel i lot rezerwujesz u nas, w złotówkach i bez zakładania konta. Płatność obsługuje Stripe, a na wyciągu zobaczysz NUITEE TRAVEL — to nasz partner rozliczeniowy. Potwierdzenie z numerem rezerwacji przychodzi e-mailem.",
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
          { href: "/faq", label: "FAQ" },
        ],
      },
      {
        title: "Pomoc i dokumenty",
        links: [
          { href: "/cennik", label: "Cennik" },
          { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
          { href: "/regulamin", label: "Regulamin" },
          { href: "/dla-partnerow", label: "Dla partnerów" },
          { href: "/standard-redakcyjny", label: "Standard redakcyjny" },
          { href: "#cookie-settings", label: "Ustawienia cookies" },
        ],
      },
    ],
    footerMetaLeft: "Hotele i loty dla podróżnych z Polski. Ceny finalne w PLN.",
    // Usunięte „Transparentny serwis afiliacyjny" — nieprawda od czasu
    // przejścia na własne rezerwacje przez LiteAPI.
    footerMetaRight: "Rezerwacje realizuje LiteAPI. Płatności: Stripe.",
    contactTitle: "Kontakt",
  },
  en: {
    nav: [
      { href: "/kierunki", label: "Destinations" },
      { href: "/inspiracje", label: "Trip ideas" },
      { href: "/jak-pracujemy", label: "How it works" },
      { href: "/o-nas", label: "About" },
    ],
    mobileLinks: [
      { href: "/faq", label: "FAQ" },
      { href: "/regulamin", label: "Terms" },
      { href: "/polityka-prywatnosci", label: "Privacy policy" },
    ],
    plannerCta: "Find a trip",
    stickySearch: "Search trips",
    menuOpen: "Menu",
    menuClose: "Close menu",
    headerNote: "Destination, dates and the next travel steps without the usual clutter.",
    skipToContent: "Skip to content",
    footerLead: "We help people choose a trip and book it right here.",
    footerBody: "You book the hotel and flight with us, in PLN and without creating an account. Payments are handled by Stripe and your statement will show NUITEE TRAVEL — our settlement partner. The confirmation with your booking number arrives by e-mail.",
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
          { href: "/faq", label: "FAQ" },
        ],
      },
      {
        title: "Help and documents",
        links: [
          { href: "/cennik", label: "Pricing" },
          { href: "/polityka-prywatnosci", label: "Privacy policy" },
          { href: "/regulamin", label: "Terms" },
          { href: "/dla-partnerow", label: "For partners" },
          { href: "/standard-redakcyjny", label: "Editorial standard" },
          { href: "#cookie-settings", label: "Cookie settings" },
        ],
      },
    ],
    footerMetaLeft: "Hotels and flights for travellers from Poland. Final prices in PLN.",
    footerMetaRight: "Bookings powered by LiteAPI. Payments: Stripe.",
    contactTitle: "Contact",
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

  // PEŁNA SZEROKOŚĆ NA STRONIE GŁÓWNEJ (właściciel 2026-08-02: „żeby nie było
  // białych pasków po bokach na mobile i na pc").
  //
  // Białe pasy brały się STĄD, a nie z samej strony: ta rama nakładała
  // `px-4 sm:px-6 lg:px-8` również na `/`, więc hero ze zdjęciem kończył się
  // 16 px przed krawędzią telefonu i 32 px przed krawędzią monitora. Na home
  // padding schodzi do zera i należy do poszczególnych sekcji, dzięki czemu
  // tło hero i pas kierunków idą od krawędzi do krawędzi, a tekst dalej ma
  // swój margines.
  //
  // Pozostałe strony (artykuły, wyniki, checkout) zostają w `max-w-7xl`
  // z paddingiem: treść tekstowa rozjechana na całą szerokość monitora jest
  // nieczytelna, a tego zadanie nie dotyczyło.
  const ramaCls = isHome ? "max-w-none" : "max-w-7xl px-4 pb-4 sm:px-6 lg:px-8";
  // Sekcje pełnoszerokościowe biorą padding same — ten sam zestaw wartości,
  // żeby nagłówek, stopka i sekcje strony miały wspólną linię lewego marginesu.
  const bleedPadCls = "px-4 sm:px-6 xl:px-8";

  return (
    <div className={`mx-auto flex min-h-screen w-full flex-col ${ramaCls}`}>
      {/* Skip link removed 2026-05-26 — it duplicated the one already rendered
          by src/app/layout.tsx (both pointed at #main-content, creating two
          competing focus targets for keyboard/AT users). Layout's skip link
          is canonical; this site-shell only owns the #main-content wrapper. */}

      {/* Na home nagłówek jest PASEM przyklejonym do krawędzi: pływająca
          pastylka z marginesem i promieniem 1,2rem wyglądałaby jak wyspa nad
          treścią, która idzie od brzegu do brzegu. Poza home bez zmian. */}
      <header
        className={
          isHome
            ? `sticky top-0 z-30 border-b border-emerald-900/10 bg-white py-2 shadow-[0_1px_0_rgba(12,58,34,0.06)] ${bleedPadCls}`
            : "sticky top-0 z-30 mt-2 rounded-[1.2rem] border border-emerald-900/10 bg-white px-3 py-2 shadow-[0_10px_30px_rgba(12,58,34,0.055)] sm:px-4"
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <LocalizedLink
              href="/"
              aria-label="HelpTravel"
              className="flex items-center"
            >
              {/* PERF: było `helptravel-logo.png` — 1018 KB źródła 1254×1254
                  renderowane w 48 px, z `priority`, czyli preładowane na KAŻDEJ
                  stronie serwisu. Custom loader (`cdn-loader.ts`) przepuszcza
                  pliki z /public bez zmian, więc Vercel tego nie skalował i do
                  przeglądarki szedł pełny megabajt. Wariant 384 px pokrywa
                  56 px CSS przy DPR 3 z zapasem i waży 52 KB. */}
              <Image
                src="/branding/helptravel-logo-384.png"
                alt="HelpTravel"
                width={384}
                height={384}
                className="block h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
                priority
              />
            </LocalizedLink>
          </div>

          {/* Linki nawigacyjne są TEKSTEM, nie pigułkami. Wcześniej 5 pozycji
              w ramkach wyglądało jak 5 przycisków o tej samej wadze co CTA —
              wszystko krzyczało tak samo, więc nic nie prowadziło. Teraz
              jedyny element w pełnym kolorze marki to akcja. */}
          <nav aria-label="Główne menu" className="hidden items-center gap-1 lg:flex">
            {text.nav.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <LocalizedLink
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "font-semibold text-brand"
                      : "font-medium text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </LocalizedLink>
              );
            })}

            {/* Kompaktowe wyszukiwanie — pojawia się dopiero po zjechaniu poza
                hero (wzorzec Booking.com: szukaj z każdego miejsca strony). */}
            <HeaderSearchTrigger label={text.stickySearch} isHome={isHome} />

            <LocalizedLink
              href="/#hero"
              className="ml-1 rounded-full bg-brand px-4 py-2 text-sm font-bold transition hover:opacity-90"
            >
              <span className="text-white">{text.plannerCta}</span>
            </LocalizedLink>
          </nav>

          <div className="flex items-center gap-1.5 lg:hidden">
            <HeaderSearchTrigger label={text.stickySearch} isHome={isHome} compact />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-raised text-ink shadow-sm transition hover:bg-surface-sunken"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-panel"
              aria-label={mobileMenuOpen ? text.menuClose : text.menuOpen}
            >
              {mobileMenuOpen ? (
                <X aria-hidden className="h-5 w-5" strokeWidth={2} />
              ) : (
                <Menu aria-hidden className="h-5 w-5" strokeWidth={2} />
              )}
            </button>
          </div>
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
            {/* Kwadrat 384×384: poprzednie `width={150} height={93}` deklarowało
                proporcje, których plik nie ma (źródło jest kwadratowe), więc
                miejsce rezerwowane pod obraz nie zgadzało się z tym, co się
                wyrenderowało — czyli przeskok układu przy ładowaniu. */}
            <Image
              src="/branding/helptravel-logo-384.png"
              alt="HelpTravel"
              width={384}
              height={384}
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
                    { href: "#cookie-settings", label: "Cookies" },
                  ]
                : [
                    { href: "/regulamin", label: "Regulamin" },
                    { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
                    { href: "/cennik", label: "Cennik" },
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
      <footer
        className={
          isHome
            ? `mt-8 border-t border-emerald-900/10 bg-white/95 py-8 ${bleedPadCls}`
            : "mt-8 rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]"
        }
      >
        {/* Gęściej: 5 kolumn zamiast 4 na desktopie, 2 na tablecie. Trzy
            rzadkie, wysokie kolumny zostawiały pustkę i wydłużały stronę. */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.85fr_0.85fr_0.85fr_0.95fr]">
          <div>
            {/* TRZECIE użycie tego samego pliku 1018 KB — stopka głównego
                layoutu, czyli KAŻDA strona serwisu. Przeoczone przy pierwszym
                przebiegu i wychwycone dopiero pomiarem produkcji po wdrożeniu:
                w HTML strony głównej dalej stał `helptravel-logo.png`.
                `width/height` 220×136 deklarowało też proporcje, których plik
                nie ma (źródło jest kwadratowe) — czyli rezerwowane miejsce nie
                zgadzało się z tym, co się wyrenderowało. */}
            <Image
              src="/branding/helptravel-logo-384.png"
              alt="HelpTravel"
              width={384}
              height={384}
              className="h-auto w-[140px] sm:w-[200px]"
            />
            <p className="mt-3 text-base font-bold leading-snug text-emerald-950 sm:text-lg">{text.footerLead}</p>
            <p className="mt-2 hidden text-sm leading-6 text-emerald-900/76 sm:block">{text.footerBody}</p>
          </div>

          {text.footerColumns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{column.title}</p>
              <div className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <LocalizedLink
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium text-ink-muted transition hover:text-brand"
                  >
                    {link.label}
                  </LocalizedLink>
                ))}
              </div>
            </div>
          ))}

          <FooterContactColumn title={text.contactTitle} />
        </div>
      </footer>
      )}
    </div>
  );
}

/**
 * Kolumna kontaktu i identyfikacji operatora — element ZAUFANIA, nie
 * formalność: użytkownik przed podaniem karty sprawdza, kto za tym stoi.
 *
 * Dane pochodzą z NEXT_PUBLIC_OPERATOR_* (ten sam zestaw, którego używa
 * /regulamin). Każde pole, którego nie ma w env, po prostu się nie renderuje —
 * pusta linia jest lepsza niż wymyślony NIP.
 */
function FooterContactColumn({ title }: { title: string }) {
  // Fallback JAK W REGULAMINIE I POLITYCE PRYWATNOŚCI — te dokumenty podają
  // `kontakt@helptravel.pl`, gdy zmienna nie jest ustawiona. Po zdjęciu strony
  // /kontakt (decyzja właściciela 2026-07-30) ten adres jest JEDYNĄ wskazaną
  // drogą kontaktu, więc nie może zniknąć przy braku zmiennej na Vercelu —
  // serwis przyjmujący płatności musi mieć gdzie odesłać reklamację.
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "kontakt@helptravel.pl";
  const operator = {
    name: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || null,
    legalForm: process.env.NEXT_PUBLIC_OPERATOR_LEGAL_FORM?.trim() || null,
    address: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS?.trim() || null,
    nip: process.env.NEXT_PUBLIC_OPERATOR_NIP?.trim() || null,
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{title}</p>
      <div className="mt-4 flex flex-col gap-3 text-sm text-ink-muted">
        {email ? (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-2 font-medium transition hover:text-brand"
          >
            <Mail aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{email}</span>
          </a>
        ) : null}

        {operator.name ? (
          <address className="mt-1 not-italic text-xs leading-5 text-ink-muted">
            <span className="block font-semibold text-ink">
              {operator.name}
              {operator.legalForm ? ` ${operator.legalForm}` : ""}
            </span>
            {operator.address ? <span className="block">{operator.address}</span> : null}
            {operator.nip ? <span className="block">NIP {operator.nip}</span> : null}
          </address>
        ) : null}
      </div>
    </div>
  );
}

