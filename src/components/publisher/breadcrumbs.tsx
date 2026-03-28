import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-800/75">
      {items.map((item, index) => {
        const key = `${item.label}-${index}`;
        const isLast = index === items.length - 1;
        return (
          <span key={key} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href} className="transition hover:text-emerald-950">
                {item.label}
              </Link>
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
