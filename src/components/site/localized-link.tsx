"use client";

import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { localizeHref, type SiteLocale } from "@/lib/mvp/locale";

type LocalizedLinkProps = Omit<LinkProps, "href"> & {
  href: string;
  className?: string;
  children: ReactNode;
  locale?: SiteLocale;
};

export function LocalizedLink({ href, children, locale: localeOverride, ...props }: LocalizedLinkProps) {
  const { locale } = useLanguage();
  const effectiveLocale = localeOverride ?? locale;

  return (
    <Link {...props} href={localizeHref(href, effectiveLocale)}>
      {children}
    </Link>
  );
}
