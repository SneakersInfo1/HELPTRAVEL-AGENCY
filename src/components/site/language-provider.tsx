"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_SITE_LOCALE,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  getDocumentLang,
  localeFromPathname,
  resolveSiteLocale,
  stripLocalePrefix,
  type SiteLocale,
} from "@/lib/mvp/locale";

interface LanguageContextValue {
  locale: SiteLocale;
  setLocale: (locale: SiteLocale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getPreferredLocale(): SiteLocale {
  if (typeof window === "undefined") {
    return DEFAULT_SITE_LOCALE;
  }

  const pathLocale = localeFromPathname(window.location.pathname);
  if (pathLocale) {
    return pathLocale;
  }

  const urlLocale = new URLSearchParams(window.location.search).get("lang");
  if (urlLocale) {
    return resolveSiteLocale(urlLocale);
  }

  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storedLocale) {
    return resolveSiteLocale(storedLocale);
  }

  return resolveSiteLocale(window.navigator.language);
}

function syncLocale(locale: SiteLocale) {
  if (typeof window === "undefined") {
    return;
  }

  document.documentElement.lang = getDocumentLang(locale);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;

  const url = new URL(window.location.href);
  const normalizedPathname = stripLocalePrefix(url.pathname);
  url.pathname = locale === "en" && (normalizedPathname === "/" || normalizedPathname === "/planner")
    ? normalizedPathname === "/"
      ? "/en"
      : `/en${normalizedPathname}`
    : normalizedPathname;

  if (locale === "en" && !(normalizedPathname === "/" || normalizedPathname === "/planner")) {
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
