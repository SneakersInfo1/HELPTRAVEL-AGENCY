import Link from "next/link";

import { LocalizedLink } from "@/components/site/localized-link";
import { localizeHref, type SiteLocale } from "@/lib/mvp/locale";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, locale }: { items: BreadcrumbItem[]; locale?: SiteLocale }) {
  return (
    // Kolor DZIEDZICZONY po kontenerze, nie zaszyty. Kolory były ustawione pod
    // jasne tło (`text-emerald-950` na ostatnim okruchu), a ten sam komponent
    // renderuje się też w ciemnym pasie hero — zmierzone tam 1,0:1 i 2,84:1,
    // czyli ostatni okruch i separatory były praktycznie niewidoczne.
    // Krycie zamiast koloru działa na obu tłach: ciemny rodzic daje biel,
    // jasny daje `ink`, a komponent nie musi wiedzieć, gdzie stoi.
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {items.map((item, index) => {
        const key = `${item.label}-${index}`;
        const isLast = index === items.length - 1;
        return (
          <span key={key} className="flex items-center gap-2">
            {item.href && !isLast && locale ? (
              <Link
                href={localizeHref(item.href, locale)}
                className="opacity-75 underline-offset-4 transition duration-150 ease-out hover:underline hover:opacity-100 motion-reduce:transition-none"
              >
                {item.label}
              </Link>
            ) : item.href && !isLast ? (
              <LocalizedLink
                href={item.href}
                className="opacity-75 underline-offset-4 transition duration-150 ease-out hover:underline hover:opacity-100 motion-reduce:transition-none"
              >
                {item.label}
              </LocalizedLink>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
            {!isLast ? (
              <span aria-hidden className="opacity-60">
                /
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
