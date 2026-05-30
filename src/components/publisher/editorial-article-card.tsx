"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { LocalizedLink } from "@/components/site/localized-link";
import { foldCategorySlug } from "@/lib/mvp/category-slug";
import { sendClientEvent } from "@/lib/mvp/client-events";
import type { SiteLocale } from "@/lib/mvp/locale";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";

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
  const source = pathname?.startsWith("/inspiracje") ? "ideas_index" : pathname?.startsWith("/") ? "homepage_or_hub" : "content";
  const href = `/inspiracje/${article.slug}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_40px_rgba(16,84,48,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(16,84,48,0.12)]">
      {imageUrl ? (
        <LocalizedLink
          href={href}
          locale={locale}
          onClick={() => sendClientEvent("content_card_clicked", { slug: article.slug, title: article.title, source, action: "open" })}
          className="relative -mx-5 -mt-5 mb-4 block aspect-[16/10] overflow-hidden"
        >
          <Image
            src={imageUrl}
            alt={imageAlt ?? article.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-[1.05]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0)_45%,rgba(5,18,11,0.5)_100%)]" />
          <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-900 backdrop-blur-sm">
            {article.title}
          </span>
        </LocalizedLink>
      ) : null}
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
        className="block"
      >
        {!imageUrl ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{article.title}</p>
        ) : null}
        <p
          className={
            imageUrl
              ? "font-display text-2xl leading-tight text-emerald-950 line-clamp-2"
              : `mt-3 font-display text-3xl leading-tight text-emerald-950 ${compact ? "line-clamp-2 text-2xl" : ""}`
          }
        >
          {article.excerpt}
        </p>
        <p className={`mt-3 text-sm leading-7 text-emerald-900/78 ${compact || imageUrl ? "line-clamp-3" : ""}`}>{article.description}</p>
      </LocalizedLink>
      <div className="mt-4 flex flex-wrap gap-2">
        {article.categorySlugs.slice(0, 3).map((category) => (
          <LocalizedLink
            key={category}
            href={`/${foldCategorySlug(category)}`}
            locale={locale}
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900"
          >
            {category.replace(/-/g, " ")}
          </LocalizedLink>
        ))}
      </div>
      <LocalizedLink
        href={href}
        locale={locale}
        onClick={() =>
          sendClientEvent("content_card_clicked", {
            slug: article.slug,
            title: article.title,
            source,
            action: "cta",
          })
        }
        className="mt-5 inline-flex w-fit rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
      >
        {readLabel}
      </LocalizedLink>
    </article>
  );
}
