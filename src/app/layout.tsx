import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";
import { getSiteUrl } from "@/lib/mvp/site";

const siteUrl = getSiteUrl();

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
  description: "Premium planer podróży dla city breaków i niezdecydowanych.",
  openGraph: {
    title: "HelpTravel Agency",
    description: "Premium planer podróży dla city breaków i niezdecydowanych.",
    url: siteUrl,
    siteName: "HelpTravel Agency",
    locale: "pl_PL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HelpTravel Agency",
    description: "Premium planer podróży dla city breaków i niezdecydowanych.",
  },
};

const navItems = [
  { href: "/", label: "Start" },
  { href: "/planner", label: "Planner" },
  { href: "/inspirations/cieple-kraje-bez-wizy-do-2500-zl", label: "Inspiracje" },
  { href: "/admin/analytics", label: "Analityka" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={`${displayFont.variable} ${uiFont.variable} h-full antialiased`}>
      <body className="min-h-full">
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
                  <span className="block text-sm font-semibold text-emerald-950">Premium planer podróży</span>
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
        </div>
      </body>
    </html>
  );
}
