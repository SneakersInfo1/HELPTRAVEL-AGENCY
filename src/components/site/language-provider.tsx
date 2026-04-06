"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SiteLocale = "pl" | "en";

interface LanguageContextValue {
  locale: SiteLocale;
  setLocale: (locale: SiteLocale) => void;
}

const STORAGE_KEY = "helptravel-locale";

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getPreferredLocale(): SiteLocale {
  if (typeof window === "undefined") {
    return "pl";
  }

  const urlLocale = new URLSearchParams(window.location.search).get("lang");
  if (urlLocale === "pl" || urlLocale === "en") {
    return urlLocale;
  }

  const storedLocale = window.localStorage.getItem(STORAGE_KEY);
  if (storedLocale === "pl" || storedLocale === "en") {
    return storedLocale;
  }

  return window.navigator.language.toLowerCase().startsWith("en") ? "en" : "pl";
}

function syncLocale(locale: SiteLocale) {
  if (typeof window === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.cookie = `${STORAGE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;

  const url = new URL(window.location.href);
  if (locale === "en") {
    url.searchParams.set("lang", "en");
  } else {
    url.searchParams.delete("lang");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SiteLocale>(() => getPreferredLocale());

  useEffect(() => {
    syncLocale(locale);
  }, [locale]);

  useEffect(() => {
    const syncFromEnvironment = () => {
      const nextLocale = getPreferredLocale();
      setLocaleState((current) => (current === nextLocale ? current : nextLocale));
    };

    window.addEventListener("popstate", syncFromEnvironment);
    window.addEventListener("storage", syncFromEnvironment);

    return () => {
      window.removeEventListener("popstate", syncFromEnvironment);
      window.removeEventListener("storage", syncFromEnvironment);
    };
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(nextLocale);
        syncLocale(nextLocale);
      },
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
