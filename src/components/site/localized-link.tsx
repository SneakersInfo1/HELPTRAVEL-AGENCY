"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { localizeHref, type SiteLocale } from "@/lib/mvp/locale";

type LocalizedLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
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
