"use client";

import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";

import { useLanguage, type SiteLocale } from "@/components/site/language-provider";

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("tel:");
}

export function localizeHref(href: string, locale: SiteLocale) {
  if (!href || href.startsWith("#") || isExternalHref(href)) {
    return href;
  }

  const [pathWithQuery, hash = ""] = href.split("#");
  const url = new URL(pathWithQuery, "https://helptravel.local");

  if (locale === "en") {
    url.searchParams.set("lang", "en");
  } else {
    url.searchParams.delete("lang");
  }

  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}

type LocalizedLinkProps = Omit<LinkProps, "href"> & {
  href: string;
  className?: string;
  children: ReactNode;
};

export function LocalizedLink({ href, children, ...props }: LocalizedLinkProps) {
  const { locale } = useLanguage();

  return (
    <Link {...props} href={localizeHref(href, locale)}>
      {children}
    </Link>
  );
}
