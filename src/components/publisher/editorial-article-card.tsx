"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { LocalizedLink } from "@/components/site/localized-link";
import { categoryLabelPl, foldCategorySlug } from "@/lib/mvp/category-slug";
import { sendClientEvent } from "@/lib/mvp/client-events";
import type { SiteLocale } from "@/lib/mvp/locale";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";

// PRZEPISANE 2026-07-31. Trzy wady, wszystkie strukturalne, nie kosmetyczne:
//
// 1. TYTUŁ BYŁ PASTYLKĄ, ZAJAWKA BYŁA NAGŁÓWKIEM. `article.title` renderował
//    się jako `text-[10px]` wersalikami na zdjęciu, a rolę nagłówka pełnił
//    `article.excerpt` w `font-display text-2xl`. Odwrotnie niż w danych.
// 2. ZERO NAGŁÓWKÓW. Cała karta była zbudowana z `<p>`, więc siatka artykułów
//    na stronie-hubie nie miała żadnej struktury nagłówkowej — ani dla
//    czytnika ekranu, ani dla wyszukiwarki.
// 3. TRZY LINKI DO TEGO SAMEGO ADRESU w jednej karcie (zdjęcie, tekst, CTA).
//    Czytnik ekranu wymieniał ten sam cel trzy razy. Teraz jest jeden link
//    w nagłówku, rozciągnięty pseudo-elementem na całą kartę, a chipy
//    kategorii siedzą nad nim (`relative z-10`), więc dalej są klikalne.
//
// Zdarzenie GA4 `content_card_clicked` zostaje, ale z jednym `action: "open"` —
// wcześniej ta sama karta potrafiła wysłać „open" i „cta" za jedno kliknięcie.

export function EditorialArticleCard({
  article,
  compact = false,
  readLabel = "Czytaj artykuł",
  locale,
  imageUrl,
  imageAlt,
}: {
  article: EditorialArticle;
  compact?: boolean;
  readLabel?: string;
  locale?: SiteLocale;
  /** Optional Pexels photo — renders a full-bleed image header on top. */
  imageUrl?: string;
  imageAlt?: string;
}) {
  const pathname = usePathname();
  const source = pathname?.startsWith("/inspiracje")
    ? "ideas_index"
    : pathname?.startsWith("/")
      ? "homepage_or_hub"
      : "content";
  const href = `/inspiracje/${article.slug}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100">
      {imageUrl ? (
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image
            src={imageUrl}
            alt={imageAlt ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        <h3 className={compact ? "font-display text-xl text-ink" : "font-display text-xl text-ink sm:text-2xl"}>
          <LocalizedLink
            href={href}
            locale={locale}
            onClick={() =>
              sendClientEvent("content_card_clicked", {
                slug: article.slug,
                title: article.title,
                source,
                action: "open",
              })
            }
            /* Rozciąga obszar kliknięcia na całą kartę, zostawiając w drzewie
               dostępności jeden link zamiast trzech. */
            className="before:absolute before:inset-0 before:content-['']"
          >
            {article.title}
          </LocalizedLink>
        </h3>

        <p className={`mt-2 text-sm leading-6 text-ink-muted ${compact ? "line-clamp-2" : "line-clamp-3"}`}>
          {article.excerpt}
        </p>

        {article.categorySlugs.length > 0 ? (
          <div className="relative z-10 mt-4 flex flex-wrap gap-2">
            {article.categorySlugs.slice(0, 3).map((category) => (
              <LocalizedLink
                key={category}
                href={`/${foldCategorySlug(category)}`}
                locale={locale}
                className="rounded-sm bg-brand-soft px-2.5 py-1 transition duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-xs font-semibold text-brand">{categoryLabelPl(category)}</span>
              </LocalizedLink>
            ))}
          </div>
        ) : null}

        {/* Afordancja, nie kolejny link — cała karta jest już klikalna. */}
        <span className="mt-5 text-sm font-bold text-brand group-hover:underline group-hover:underline-offset-4">
          {readLabel}
        </span>
      </div>
    </article>
  );
}
