import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";
import { LanguageProvider } from "@/components/site/language-provider";
import { SiteShell } from "@/components/site/site-shell";
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
    default: "HelpTravel",
    template: "%s | HelpTravel",
  },
  alternates: {
    types: {
      "application/rss+xml": `${siteUrl}/feed.xml`,
    },
  },
  description:
    "HelpTravel laczy discovery kierunkow, planner wyjazdu i przejscia do hoteli, lotow oraz dodatkow dla city breakow i krotkich wyjazdow z Polski.",
  keywords: [
    "planer podrozy",
    "kierunki",
    "city break",
    "loty i hotele",
    "krotkie wyjazdy z Polski",
    "travel planner",
  ],
  applicationName: "HelpTravel",
  category: "travel",
  openGraph: {
    title: "HelpTravel",
    description:
      "Wybieraj kierunki szybciej i przechodz do hoteli, lotow oraz dodatkow w jednym komercyjnym flow.",
    url: siteUrl,
    siteName: "HelpTravel",
    locale: "pl_PL",
    alternateLocale: ["en_US"],
    type: "website",
    images: [
      {
        url: "/branding/helptravel-logo.png",
        width: 900,
        height: 560,
        alt: "HelpTravel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HelpTravel",
    description: "Travel planner, destination discovery and booking-ready flow for short trips from Poland.",
    images: ["/branding/helptravel-logo.png"],
  },
  icons: {
    icon: [{ url: "/branding/helptravel-mark.png", type: "image/png" }],
    shortcut: ["/branding/helptravel-mark.png"],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  verification: googleVerification ? { google: googleVerification } : undefined,
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "HelpTravel",
      url: siteUrl,
      inLanguage: "pl-PL",
      description:
        "Planer podrozy, katalog kierunkow, inspiracje i przewodniki dla osob planujacych city breaki i krotkie wyjazdy z Polski.",
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/planner?mode=standard&q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      name: "HelpTravel",
      url: siteUrl,
      logo: `${siteUrl}/branding/helptravel-mark.png`,
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
    <html lang="pl" suppressHydrationWarning className={`${displayFont.variable} ${uiFont.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <LanguageProvider>
          <SiteShell>{children}</SiteShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
