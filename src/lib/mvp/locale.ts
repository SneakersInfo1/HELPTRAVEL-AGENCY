export type SiteLocale = "pl" | "en";

export const DEFAULT_SITE_LOCALE: SiteLocale = "pl";
export const LOCALE_STORAGE_KEY = "helptravel-locale";
export const LOCALE_COOKIE_KEY = "helptravel-locale";

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("tel:");
}

export function resolveSiteLocale(value?: string | string[] | null): SiteLocale {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized) {
    return DEFAULT_SITE_LOCALE;
  }

  const lower = normalized.toLowerCase();
  return lower.startsWith("en") ? "en" : "pl";
}

export function localeFromPathname(pathname?: string | null): SiteLocale | null {
  if (!pathname) {
    return null;
  }

  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : null;
}

export function stripLocalePrefix(pathname: string): string {
  if (pathname === "/en") {
    return "/";
  }

  if (pathname.startsWith("/en/")) {
    return pathname.slice(3) || "/";
  }

  return pathname || "/";
}

function supportsLocalePrefix(pathname: string): boolean {
  return pathname === "/" || pathname === "/planner";
}

function ensureLeadingSlash(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function withLocalePrefix(pathname: string, locale: SiteLocale): string {
  const normalizedPath = stripLocalePrefix(ensureLeadingSlash(pathname));

  if (locale === "en" && supportsLocalePrefix(normalizedPath)) {
    return normalizedPath === "/" ? "/en" : `/en${normalizedPath}`;
  }

  return normalizedPath;
}

export function localizeHref(href: string, locale: SiteLocale) {
  if (!href || href.startsWith("#") || isExternalHref(href)) {
    return href;
  }

  const [pathWithQuery, hash = ""] = href.split("#");
  const url = new URL(pathWithQuery, "https://helptravel.local");
  const localizedPathname = withLocalePrefix(url.pathname, locale);

  url.pathname = localizedPathname;
  if (locale === "en" && !supportsLocalePrefix(stripLocalePrefix(localizedPathname))) {
    url.searchParams.set("lang", "en");
  } else {
    url.searchParams.delete("lang");
  }

  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}

export function getDocumentLang(locale: SiteLocale) {
  return locale === "en" ? "en" : "pl";
}

export function getLanguageTag(locale: SiteLocale) {
  return locale === "en" ? "en-US" : "pl-PL";
}
