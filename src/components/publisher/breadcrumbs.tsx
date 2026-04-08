import Link from "next/link";

import { LocalizedLink } from "@/components/site/localized-link";
import { localizeHref, type SiteLocale } from "@/lib/mvp/locale";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, locale }: { items: BreadcrumbItem[]; locale?: SiteLocale }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-800/75">
      {items.map((item, index) => {
        const key = `${item.label}-${index}`;
        const isLast = index === items.length - 1;
        return (
          <span key={key} className="flex items-center gap-2">
            {item.href && !isLast && locale ? (
              <Link href={localizeHref(item.href, locale)} className="transition hover:text-emerald-950">
                {item.label}
              </Link>
            ) : item.href && !isLast ? (
              <LocalizedLink href={item.href} className="transition hover:text-emerald-950">
                {item.label}
              </LocalizedLink>
            ) : (
              <span className={isLast ? "text-emerald-950" : ""}>{item.label}</span>
            )}
            {!isLast ? <span className="text-emerald-700/45">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}
