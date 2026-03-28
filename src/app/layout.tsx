import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";
import { getSiteUrl } from "@/lib/mvp/site";

const siteUrl = getSiteUrl();
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

const displayFont = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const uiFont = Manrope({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HelpTravel Agency",
    template: "%s | HelpTravel Agency",
  },
  description: "Planer podrozy, kierunki, inspiracje i przewodniki dla city breakow oraz krotkich wyjazdow z Polski.",
  openGraph: {
    title: "HelpTravel Agency",
    description: "Planer podrozy, kierunki, inspiracje i przewodniki dla city breakow oraz krotkich wyjazdow z Polski.",
    url: siteUrl,
    siteName: "HelpTravel Agency",
    locale: "pl_PL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HelpTravel Agency",
    description: "Planer podrozy, kierunki, inspiracje i przewodniki dla city breakow oraz krotkich wyjazdow z Polski.",
  },
  verification: googleVerification ? { google: googleVerification } : undefined,
};

const navItems = [
  { href: "/", label: "Start" },
  { href: "/planner", label: "Planer" },
  { href: "/kierunki", label: "Kierunki" },
  { href: "/inspiracje", label: "Inspiracje" },
  { href: "/przewodniki", label: "Przewodniki" },
  { href: "/city-breaki", label: "City breaki" },
  { href: "/bez-wizy", label: "Bez wizy" },
  { href: "/jak-pracujemy", label: "Jak pracujemy" },
];

const footerColumns = [
  {
    title: "Odkrywaj",
    links: [
      { href: "/kierunki", label: "Kierunki" },
      { href: "/inspiracje", label: "Inspiracje" },
      { href: "/przewodniki", label: "Przewodniki" },
      { href: "/planner?mode=discovery", label: "Nie wiem dokad leciec" },
      { href: "/mapa-serwisu", label: "Mapa serwisu" },
      { href: "/jak-pracujemy", label: "Jak pracujemy" },
      { href: "/standard-redakcyjny", label: "Standard redakcyjny" },
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
      { href: "/jak-pracujemy", label: "Jak pracujemy" },
      { href: "/dla-partnerow", label: "Dla partnerow" },
      { href: "/standard-redakcyjny", label: "Standard redakcyjny" },
    ],
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "HelpTravel Agency",
      url: siteUrl,
      inLanguage: "pl-PL",
      description:
        "Planer podrozy, katalog kierunkow, inspiracje i przewodniki dla osob planujacych city breaki i krotkie wyjazdy z Polski.",
    },
    {
      "@type": "Organization",
      name: "HelpTravel Agency",
      url: siteUrl,
      description:
        "Niezalezny serwis travelowy laczacy warstwe contentowa i planer wyjazdow z przekierowaniami do partnerow zewnetrznych.",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={`${displayFont.variable} ${uiFont.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-4 sm:px-6 lg:px-8">
          <header className="sticky top-0 z-30 mt-3 rounded-[1.75rem] border border-emerald-900/10 bg-white/75 px-4 py-3 shadow-[0_14px_40px_rgba(12,58,34,0.06)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-700 text-sm font-bold text-white shadow-[0_10px_25px_rgba(21,128,61,0.28)]">
                  HT
                </span>
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    HelpTravel Agency
                  </span>
                  <span className="block text-sm font-semibold text-emerald-950">Planer i serwis travelowy</span>
                </span>
              </Link>

              <nav className="flex flex-wrap items-center gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-emerald-900/10 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-emerald-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          <div className="flex flex-1 flex-col">{children}</div>

          <footer className="mt-8 rounded-[2rem] border border-emerald-900/10 bg-white/92 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">HelpTravel Agency</p>
                <h2 className="mt-3 font-display text-4xl leading-none text-emerald-950">
                  Planer podrozy i serwis z przewodnikami pod realne decyzje wyjazdowe.
                </h2>
                <p className="mt-4 text-sm leading-7 text-emerald-900/76">
                  Strona laczy tresci wydawnicze, katalog kierunkow i planer, ktory prowadzi do partnerow zewnetrznych.
                  Budujemy uzyteczny projekt dla osob planujacych city breaki, krotkie urlopy i wyjazdy bez konkretnego
                  kierunku na starcie.
                </p>
              </div>

              {footerColumns.map((column) => (
                <div key={column.title}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{column.title}</p>
                  <div className="mt-4 flex flex-col gap-3">
                    {column.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-sm font-medium text-emerald-900/78 transition hover:text-emerald-700"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-900/10 pt-4 text-xs text-emerald-900/62">
              <p>HelpTravel Agency - planer podrozy, inspiracje, kierunki i linki partnerskie.</p>
              <p>Serwis informacyjny i afiliacyjny. Finalne warunki oferty zawsze sprawdzaj u partnera.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
