"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  startTransition,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  DEFAULT_SITE_LOCALE,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  getDocumentLang,
  localizeHref,
  localeFromPathname,
  resolveSiteLocale,
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

function persistLocale(locale: SiteLocale) {
  if (typeof window === "undefined") {
    return;
  }

  document.documentElement.lang = getDocumentLang(locale);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [locale, setLocaleState] = useState<SiteLocale>(() => getPreferredLocale());

  useEffect(() => {
    persistLocale(locale);
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
        persistLocale(nextLocale);

        const currentPath = pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname);
        const currentSearch = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
        const currentHash = typeof window === "undefined" ? "" : window.location.hash;
        const currentHref = `${currentPath}${currentSearch ? `?${currentSearch}` : ""}${currentHash}`;
        const nextHref = localizeHref(currentHref, nextLocale);

        if (typeof window !== "undefined" && nextHref !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
          startTransition(() => {
            router.replace(nextHref, { scroll: false });
          });
        }
      },
    }),
    [locale, pathname, router],
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
