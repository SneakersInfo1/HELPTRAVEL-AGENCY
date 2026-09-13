"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_SITE_LOCALE, type SiteLocale } from "@/lib/mvp/locale";

interface LanguageContextValue {
  locale: SiteLocale;
}

// Serwis jest wyłącznie polski i nie ma przełącznika języka.
//
// Do 2026-09 provider wybierał język z ustawień przeglądarki, zapisanej
// preferencji i parametru adresu. Renderer Google działa w en-US, więc po
// hydratacji Googlebot dostawał `lang="en"`, linki `/en/*` i `?lang=en` — a do
// tego błąd hydratacji #418, bo serwer renderował po polsku. Stąd `/?lang=en`
// w wynikach wyszukiwania (audyt SEO Growth V1, pkt 4). Język nie zależy już od
// klienta; parametr `lang` na wejściu przekierowuje middleware.
const SITE_LANGUAGE: LanguageContextValue = { locale: DEFAULT_SITE_LOCALE };

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  return <LanguageContext.Provider value={SITE_LANGUAGE}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
