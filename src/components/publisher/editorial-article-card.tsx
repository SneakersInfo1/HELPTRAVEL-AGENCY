"use client";

import { LocalizedLink } from "@/components/site/localized-link";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";

export function EditorialArticleCard({
  article,
  compact = false,
  readLabel = "Czytaj artykul",
}: {
  article: EditorialArticle;
  compact?: boolean;
  readLabel?: string;
}) {
  return (
    <article className="group rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_40px_rgba(16,84,48,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(16,84,48,0.12)]">
      <LocalizedLink href={`/inspiracje/${article.slug}`} className="block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{article.title}</p>
        <p className={`mt-3 font-display text-3xl leading-tight text-emerald-950 ${compact ? "line-clamp-2 text-2xl" : ""}`}>
          {article.excerpt}
        </p>
        <p className={`mt-3 text-sm leading-7 text-emerald-900/78 ${compact ? "line-clamp-3" : ""}`}>{article.description}</p>
      </LocalizedLink>
      <div className="mt-4 flex flex-wrap gap-2">
        {article.categorySlugs.slice(0, 3).map((category) => (
          <LocalizedLink
            key={category}
            href={`/${category}`}
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900"
          >
            {category.replace(/-/g, " ")}
          </LocalizedLink>
        ))}
      </div>
      <LocalizedLink
        href={`/inspiracje/${article.slug}`}
        className="mt-5 inline-flex rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
      >
        {readLabel}
      </LocalizedLink>
    </article>
  );
}
