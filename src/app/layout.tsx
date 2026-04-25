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
    default: "HelpTravel",
    template: "%s | HelpTravel",
  },
  alternates: {
    canonical: siteUrl,
    types: {
      "application/rss+xml": `${siteUrl}/feed.xml`,
    },
  },
  description:
    "HelpTravel pomaga szybko wybrać kierunek, ustawić termin i przejść do noclegów, lotów oraz dalszych kroków wyjazdu.",
  keywords: [
    "planer podróży",
    "kierunki",
    "city break",
    "loty i hotele",
    "krótkie wyjazdy z Polski",
    "planowanie wyjazdu",
  ],
  applicationName: "HelpTravel",
  category: "travel",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "HelpTravel",
    description:
      "Wybierz kierunek, ustaw termin i przejdź dalej do noclegów, lotów i kolejnych kroków wyjazdu.",
    url: siteUrl,
    siteName: "HelpTravel",
    locale: "pl_PL",
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
    description: "Wybierz kierunek albo opisz wyjazd, a potem przejdź do noclegów, lotów i kolejnych kroków.",
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
        "Planer podróży, katalog kierunków i pomysły na krótkie wyjazdy z Polski.",
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
        "Niezależny serwis travelowy pomagający wybrać kierunek i przejść do partnera rezerwacyjnego.",
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

