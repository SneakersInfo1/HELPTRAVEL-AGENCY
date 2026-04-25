import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";
import { LanguageProvider } from "@/components/site/language-provider";
import { SiteShell } from "@/components/site/site-shell";
import { WebVitalsReporter } from "@/components/site/web-vitals-reporter";
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
    default: "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty | 0 zl",
    template: "%s | HelpTravel",
  },
  alternates: {
    canonical: siteUrl,
    languages: {
      "pl-PL": siteUrl,
      "en-US": `${siteUrl}/en`,
    },
    types: {
      "application/rss+xml": `${siteUrl}/feed.xml`,
    },
  },
  description:
    "Zaplanuj wyjazd w 3 minuty: lot + hotel + gotowy plan dnia. 22 lotniska w Polsce i Europie. Bez rejestracji. 100% darmowe — placisz tylko za rezerwacje u partnerow.",
  keywords: [
    "tani lot i hotel",
    "planer podrozy",
    "porownywarka lotow",
    "city break",
    "krotkie wyjazdy z Polski",
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
    title: "HelpTravel - Loty + hotel i plan wyjazdu w 3 minuty",
    description:
      "Zaplanuj caly wyjazd w 3 minuty: lot, hotel i plan dnia w jednym kliku. 22 lotniska PL + EU. Bez rejestracji. 100% darmowe.",
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
    title: "HelpTravel - Loty + hotel i plan w 3 minuty",
    description: "Zaplanuj wyjazd w 3 minuty: lot, hotel i plan dnia. 22 lotniska PL+EU. Bez rejestracji. 0 zl.",
    // images: generowane przez src/app/twitter-image.tsx (fallback do opengraph-image)
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/branding/helptravel-mark.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
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
        "Planer podrozy, ktory laczy lot, hotel i gotowy plan dnia w jednym kliku. 22 lotniska PL+EU. Bez rejestracji.",
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/planner?mode=standard&q={search_term_string}`,
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
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/branding/helptravel-mark.svg`,
        width: 512,
        height: 512,
      },
      slogan: "Lot + hotel i plan wyjazdu w 3 minuty",
      description:
        "Niezalezny polski serwis travelowy: planer wyjazdow z lotem, hotelem i planem dnia w jednym kliku, oparty o sprawdzonych partnerow rezerwacyjnych.",
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
      name: "Planer wyjazdow HelpTravel",
      provider: { "@id": `${siteUrl}/#organization` },
      areaServed: { "@type": "Place", name: "Europe" },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "PLN",
        description: "Korzystanie z plannera jest darmowe. Platnosc nastepuje wylacznie u partnera rezerwacyjnego.",
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
      <body className="min-h-full">
        <a href="#main-content" className="skip-to-content">
          Przejdz do glownej tresci
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <LanguageProvider>
          <WebVitalsReporter />
          <SiteShell>{children}</SiteShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
