"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Mail, Menu, X } from "lucide-react";

import { FavoritesNavLink } from "@/components/site/favorites-nav-link";
import { HeaderSearchTrigger } from "@/components/site/header-search-trigger";
import { LocalizedLink } from "@/components/site/localized-link";
import { useLanguage } from "@/components/site/language-provider";
import { localeFromPathname, stripLocalePrefix } from "@/lib/mvp/locale";
import { SITE_HEADER_GUTTER } from "@/lib/ui/layout";

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
    favorites: "Polubione",
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
    favorites: "Saved",
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

  // ROZRÓŻNIANIE RODZIN TRAS PRZESTAŁO BYĆ POWŁOCE POTRZEBNE (2026-09-02).
  //
  // Stały tu wcześniej `isHotelWide` i `isFlights`. Powstały, bo rama nakładała
  // `max-w-7xl` na wszystko poza homepage, więc sekcje, które potrzebowały
  // szerokości, musiały prosić o wyjątek. Rama nie ogranicza już niczego,
  // a nagłówek ma jeden gutter dla całego serwisu — nie ma więc od czego robić
  // wyjątków. Szerokość treści należy w całości do `<main>` każdej strony:
  //   • hotele  → `src/lib/hotels/layout.ts`
  //   • loty    → `src/lib/flights/layout.ts`
  //   • reszta  → `src/lib/ui/layout.ts`

  // ── NAGŁÓWEK I STOPKA SĄ PASEM NA KAŻDEJ TRASIE (brief §2–§4, 2026-09-01) ──
  //
  // Do tej pory były nim tylko na homepage i w lotach. Wszędzie indziej były
  // PŁYWAJĄCĄ PASTYLKĄ — i to nie dlatego, że ktoś tak zaprojektował nagłówek,
  // tylko dlatego, że nagłówek siedział W ŚRODKU ramy ograniczonej do
  // `max-w-7xl`. Zmierzone przed poprawką (viewport 1920):
  //
  //   homepage        nagłówek x=0    szer. 1920   promień 0
  //   /hotele/szukaj  nagłówek x=40   szer. 1840   promień 19,2 px
  //   /kierunki       nagłówek x=352  szer. 1216   promień 19,2 px
  //   /regulamin      nagłówek x=352  szer. 1216   promień 19,2 px
  //
  // Czyli na podstronach 37 % szerokości monitora było marginesem WOKÓŁ
  // nagłówka, a on sam wyglądał jak biała karta doklejona nad stroną.
  //
  // Poprawka jest jedna i wspólna: rama przestaje ograniczać szerokość
  // (`max-w-*` schodzi na `<main>` każdej strony — tam, gdzie od dawna jest
  // w hotelach i lotach), a nagłówek i stopka dostają tę samą budowę co na
  // homepage: pas na pełną szerokość + wewnętrzny rząd z limitem.
  //
  // JEDEN GUTTER DLA CAŁEGO SERWISU (poprawka po zgłoszeniu z 2026-09-02).
  //
  // Pierwsza wersja tej przebudowy dawała rzędowi nagłówka limit szerokości
  // ZALEŻNY OD RODZINY TRAS, żeby logo stało w linii z treścią pod spodem.
  // Zmierzone skutki na 1920 px: homepage 32, hotele 40, loty 100, podstrony
  // 160 — a na /regulamin logo wyrównywało się do kolumny TEKSTU szerokiej na
  // 720 px. Logo skakało o 128 px między stroną główną a katalogiem kierunków.
  //
  // Nagłówek należy do OKNA, nie do artykułu pod nim. Wyrównanie nagłówka
  // i szerokość treści są teraz od siebie niezależne: pas nie ma żadnego
  // limitu wewnętrznego, tylko wspólny gutter ze `SITE_HEADER_GUTTER`.
  const pasCls = `border-emerald-900/15 bg-surface-raised/85 backdrop-blur-md ${SITE_HEADER_GUTTER}`;

  // RAMA NIE OGRANICZA JUŻ NICZEGO.
  //
  // Do 2026-09-01 stało tu `max-w-7xl px-4 pb-4 sm:px-6 lg:px-8` dla wszystkich
  // tras poza homepage, hotelami i lotami — i to był korzeń obu problemów
  // z briefu naraz:
  //
  //  1. Nagłówek jest DZIECKIEM tej ramy, więc razem z nią zjeżdżał na
  //     środek ekranu i przestawał być pasem (§2).
  //  2. Każda strona dokładała do tego własne `max-w-7xl px-4 sm:px-6 lg:px-8`,
  //     więc limity i paddingi mnożyły się: 1920 → 1280 → 1216 → 1152 px
  //     realnej treści, czyli 40 % monitora na marginesy (§5, §6).
  //
  // Szerokość należy teraz do `<main>` każdej strony — dokładnie tak, jak od
  // 2026-08-07 (hotele) i 2026-08-29 (loty) działa w sekcjach, które ten sam
  // problem miały już rozwiązany. Wartości: `src/lib/ui/layout.ts`.
  //
  // `min-h-[100dvh]` zamiast `min-h-screen`: na telefonie `100vh` liczy się do
  // krawędzi EKRANU, nie okna, więc pasek adresu przeglądarki dokładał kilkadziesiąt
  // pikseli wysokości, których nie da się zobaczyć — i strona zawsze miała
  // pionowy scroll, nawet gdy treść mieściła się w oknie.
  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      {/* Skip link removed 2026-05-26 — it duplicated the one already rendered
          by src/app/layout.tsx (both pointed at #main-content, creating two
          competing focus targets for keyboard/AT users). Layout's skip link
          is canonical; this site-shell only owns the #main-content wrapper. */}

      {/* Nagłówek jest PASEM przyklejonym do krawędzi — na KAŻDEJ trasie.
          Pływająca pastylka z marginesem i promieniem 1,2 rem wyglądała jak
          biała wyspa doklejona nad stroną; szczegóły i pomiary przy `pasCls`. */}
      <header
        // ODDZIELENIE OD TREŚCI — zgłoszenie właściciela ze zrzutu podstrony
        // „City break": biały nagłówek na białej sekcji zlewał się w jedną
        // płaszczyznę i wyglądał, jakby był przypadkowo nałożony na stronę.
        //
        // Przyczyna: obramowanie `emerald-900/10` i cień o alfa 0.055 są
        // praktycznie niewidoczne na bieli. Na stronie głównej problem nie
        // występował, bo pod nagłówkiem jest zdjęcie hero — stąd wrażenie, że
        // „to tylko na niektórych stronach".
        //
        // Rozwiązanie działa na obu rodzajach tła:
        //  - `bg-surface-raised/85` + `backdrop-blur-md` — treść przewijana pod
        //    spodem prześwituje i rozmywa się, co samo w sobie komunikuje
        //    warstwę, także gdy sekcja pod spodem jest ciemna;
        //  - wyraźniejsza krawędź `emerald-900/15` zamiast ledwie widocznej /10;
        //  - najmocniejszy z trzech tokenów cienia, bo nagłówek unosi się nad
        //    CAŁĄ stroną, a nie nad sąsiednią kartą.
        //
        // UWAGA NA KOMENTARZE W TYM PLIKU: Tailwind v4 skanuje także treść
        // komentarzy. Wpisanie tu nazwy klasy z gwiazdką (wzorzec „shadow”
        // plus nawias kwadratowy plus zmienna z gwiazdką) sprawia, że Tailwind
        // uzna to za realną klasę i wygeneruje regułę z `var(--shadow-` i
        // gwiazdką w środku. To niepoprawny CSS, przez który CAŁY globals.css
        // przestaje się parsować — a wtedy znikają wszystkie style, nie tylko
        // cień. Kosztowało to jedną pomyłkę: opisując tokeny, pisz je słownie,
        // nigdy jako gotową nazwę klasy z symbolem wieloznacznym.
        className={`sticky top-0 z-30 border-b py-2 shadow-[var(--shadow-lg)] ${pasCls}`}
      >
        <div className="flex w-full items-center justify-between gap-3">
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
                  56 px CSS przy DPR 3 z zapasem i waży 52 KB.

                  WYGLĄD: wariant `-alpha`, bo zgłoszenie właściciela brzmiało
                  „logo wygląda jak wklejone" i miało konkretną, zmierzalną
                  przyczynę — plik miał NIEPRZEZROCZYSTE, prawie białe tło
                  (piksel narożny 254,254,254 przy alfie 255). Na
                  półprzezroczystym nagłówku i nad zdjęciami ten biały kwadrat
                  czytał się dokładnie jak naklejka.

                  Tło usunięte wypełnieniem od krawędzi, a nie progiem jasności:
                  próg zjadłby także jasne fragmenty WEWNĄTRZ znaku (biały
                  samolot w niebieskim kole). Zeszło 74,9% powierzchni pliku,
                  sam znak został nietknięty. */}
              <Image
                src="/branding/helptravel-logo-384-alpha.png"
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

            {/* Polubione — przed CTA, bo to powrót do własnych rzeczy, a nie
                nowa akcja. Licznik dochodzi po odczycie z przeglądarki. */}
            <FavoritesNavLink
              label={text.favorites}
              active={isActivePath(pathname, "/polubione")}
            />

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
            className="mt-4 grid w-full gap-3 border-t border-emerald-900/10 pt-4 lg:hidden"
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
              <FavoritesNavLink
                label={text.favorites}
                active={isActivePath(pathname, "/polubione")}
                variant="mobile"
              />
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

      {/* `min-w-0`: bez tego dziecko flexa ma domyślnie `min-width: auto`,
          więc szeroka tabela albo długi ciąg bez spacji rozpycha CAŁĄ powłokę
          i strona dostaje poziomy scroll (brief §13). */}
      <div id="main-content" className="flex min-w-0 flex-1 flex-col">
        {children}
      </div>

      {isCheckout ? (
        /* Minimal checkout footer — logo, legal links, disclaimer. Nothing
           that can pull the buyer back out of the funnel. */
        <footer className={`mt-8 border-t border-emerald-900/10 bg-white/95 py-6 ${SITE_HEADER_GUTTER}`}>
          <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-between">
            {/* Kwadrat 384×384: poprzednie `width={150} height={93}` deklarowało
                proporcje, których plik nie ma (źródło jest kwadratowe), więc
                miejsce rezerwowane pod obraz nie zgadzało się z tym, co się
                wyrenderowało — czyli przeskok układu przy ładowaniu. */}
            <Image
              src="/branding/helptravel-logo-384-alpha.png"
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
          <p
            className="mt-4 w-full border-t border-emerald-900/10 pt-3 text-center text-[11px] text-emerald-900/60 sm:text-left"
          >
            {text.footerMetaRight}
          </p>
        </footer>
      ) : (
      /* Stopka jest PASEM na każdej trasie — z tego samego powodu co nagłówek.
         Pływająca karta z promieniem 2 rem kończyła stronę „wyspą" zawieszoną
         nad tłem, przez co dół serwisu wyglądał na inny produkt niż homepage. */
      <footer className={`mt-8 border-t border-emerald-900/10 bg-white/95 py-8 ${SITE_HEADER_GUTTER}`}>
        {/* Gęściej: 5 kolumn zamiast 4 na desktopie, 2 na tablecie. Trzy
            rzadkie, wysokie kolumny zostawiały pustkę i wydłużały stronę. */}
        <div className="grid w-full gap-8 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.85fr_0.85fr_0.85fr_0.95fr]">
          <div>
            {/* TRZECIE użycie tego samego pliku 1018 KB — stopka głównego
                layoutu, czyli KAŻDA strona serwisu. Przeoczone przy pierwszym
                przebiegu i wychwycone dopiero pomiarem produkcji po wdrożeniu:
                w HTML strony głównej dalej stał `helptravel-logo.png`.
                `width/height` 220×136 deklarowało też proporcje, których plik
                nie ma (źródło jest kwadratowe) — czyli rezerwowane miejsce nie
                zgadzało się z tym, co się wyrenderowało. */}
            <Image
              src="/branding/helptravel-logo-384-alpha.png"
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

