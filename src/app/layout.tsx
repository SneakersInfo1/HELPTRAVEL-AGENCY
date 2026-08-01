import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";
import { LanguageProvider } from "@/components/site/language-provider";
import { SiteShell } from "@/components/site/site-shell";
import { WebVitalsReporter } from "@/components/site/web-vitals-reporter";
import { CookieConsentBanner } from "@/components/site/cookie-consent-banner";
import { GoogleAnalytics } from "@/components/site/google-analytics";
import { MicrosoftClarity } from "@/components/site/microsoft-clarity";
import { QuickSearchLauncher } from "@/components/site/quick-search-launcher";
import { ConciergeLauncher } from "@/components/concierge/concierge-launcher";
import { ConsentProvider } from "@/lib/consent/context";
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
  // Tytuł i opisy poniżej to teksty, które Google pokazuje przy KAŻDEJ stronie
  // serwisu. Do 2026-07-31 obiecywały „plan wyjazdu w 3 minuty" i „0 zł":
  // planera nie ma od zwrotu na rezerwacje własne, „3 minuty" nie miały źródła,
  // a „0 zł" mówiło o serwisie, w którym płaci się za nocleg. Wynik wyszukiwania
  // był więc pierwszą rzeczą, jaką klient czytał — i pierwszą nieprawdą.
  title: {
    default: "HelpTravel — hotele i loty w jednym miejscu, ceny w złotówkach",
    template: "%s | HelpTravel",
  },
  alternates: {
    canonical: siteUrl,
    // hreflang.languages intentionally NOT declared at root: /en/* paths are
    // permanent-redirected to the Polish root by middleware.ts, so advertising
    // them as alternate-language canonicals would point Google at a redirect
    // chain and cause the hreflang cluster to be dropped. Once real EN
    // content ships (own metadata + non-redirected route), restore this.
    types: {
      "application/rss+xml": `${siteUrl}/feed.xml`,
    },
  },
  description:
    "Rezerwuj hotel i lot w jednym miejscu. Ceny w złotówkach, z podatkami i opłatami, potwierdzenie e-mailem od razu. Bez zakładania konta.",
  keywords: [
    "tani lot i hotel",
    "planer podróży",
    "porównywarka lotów",
    "city break",
    "krótkie wyjazdy z Polski",
    "wakacje last minute",
    "loty z Krakowa",
    "loty z Warszawy",
    "tanie wakacje",
    "travel planner",
  ],
  applicationName: "HelpTravel",
  category: "travel",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "HelpTravel — hotele i loty w jednym miejscu, ceny w złotówkach",
    description:
      "Rezerwuj hotel i lot bez skakania po serwisach. Ceny w PLN z podatkami i opłatami, potwierdzenie e-mailem, bez zakładania konta.",
    url: siteUrl,
    siteName: "HelpTravel",
    locale: "pl_PL",
    alternateLocale: ["en_US"],
    type: "website",
    // images są generowane dynamicznie przez src/app/opengraph-image.tsx
    // (1200x630 PNG ze spojnym brandingiem) - nie definiuj ich tu, zeby nie nadpisac.
  },
  twitter: {
    card: "summary_large_image",
    title: "HelpTravel — hotele i loty w jednym miejscu",
    description: "Ceny w złotówkach z podatkami i opłatami, potwierdzenie e-mailem, bez zakładania konta.",
    // images: generowane przez src/app/twitter-image.tsx (fallback do opengraph-image)
  },
  // PERF: favicon wskazywał na `helptravel-mark.png` — 640 KB w rozdzielczości
  // 747×747, pobierane przez przeglądarkę przy każdym wejściu na dowolną
  // podstronę, żeby narysować ikonę 16 px w karcie. Teraz 2 KB (32 px)
  // i 18 KB (180 px, ekrany o wysokim DPI). Duży plik zostaje wyłącznie dla
  // Open Graph i schema.org, czyli dla crawlerów, nie dla użytkownika.
  icons: {
    icon: [
      { url: "/branding/helptravel-mark-32.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/helptravel-mark-180.png", type: "image/png", sizes: "180x180" },
    ],
    shortcut: ["/branding/helptravel-mark-32.png"],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  verification: googleVerification ? { google: googleVerification } : undefined,
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "HelpTravel",
      alternateName: "HelpTravel.pl",
      url: siteUrl,
      inLanguage: ["pl-PL", "en-US"],
      description:
        "Serwis rezerwacji hoteli i lotów dla polskiego podróżnego. Ceny w złotówkach, rezerwacja bez zakładania konta.",
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/hotele/szukaj?destination={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "HelpTravel",
      legalName: "HelpTravel",
      url: siteUrl,
      // Wymiary zgodne z plikiem: źródło ma 747×747, nie 512×512. Deklarowanie
      // rozmiaru, którego obraz nie ma, to dla walidatora schema.org błąd.
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/branding/helptravel-mark.png`,
        width: 747,
        height: 747,
      },
      slogan: "Hotele i loty w jednym miejscu, w złotówkach",
      description:
        "Niezależny polski serwis travelowy: planer wyjazdów z lotem, hotelem i planem dnia w jednym kliku, oparty o sprawdzonych partnerów rezerwacyjnych.",
      areaServed: [
        { "@type": "Country", name: "Poland" },
        { "@type": "Place", name: "Europe" },
      ],
      knowsLanguage: ["pl", "en"],
      sameAs: [
        "https://helptravel.pl",
      ],
    },
    {
      "@type": "Service",
      "@id": `${siteUrl}/#service`,
      serviceType: "Trip planning and booking comparison",
      name: "Planer wyjazdów HelpTravel",
      provider: { "@id": `${siteUrl}/#organization` },
      areaServed: { "@type": "Place", name: "Europe" },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "PLN",
        description: "Korzystanie z planera jest darmowe. Płatność następuje wyłącznie u partnera rezerwacyjnego.",
      },
      audience: { "@type": "Audience", audienceType: "Polish travelers and Polish diaspora in Europe" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning className={`${displayFont.variable} ${uiFont.variable} h-full antialiased`}>
      {/* Warm the connection to the hero-image CDN early so the LCP
          backdrop image isn't gated on a cold TLS handshake. */}
      <link rel="preconnect" href="https://images.pexels.com" />
      <link rel="dns-prefetch" href="https://images.pexels.com" />
      <body className="min-h-full">
        <a href="#main-content" className="skip-to-content">
          Przejdź do głównej treści
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <ConsentProvider>
          <LanguageProvider>
            <GoogleAnalytics />
            <MicrosoftClarity />
            <WebVitalsReporter />
            <SiteShell>{children}</SiteShell>
            <CookieConsentBanner />
            <QuickSearchLauncher />
            <ConciergeLauncher />
          </LanguageProvider>
        </ConsentProvider>
      </body>
    </html>
  );
}
