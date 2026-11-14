import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComparisonTemplate } from "@/components/editorial/comparison-template";
import { comparisonPairs } from "@/lib/mvp/comparisons";
import { loadComparisonPage } from "@/lib/seo/comparison-page-data";
import { comparisonViewFor } from "@/lib/seo/comparison-view-data";
import { socialMeta } from "@/lib/seo/social-meta";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ para: string }>;
}

// Układ: components/editorial/comparison-template.tsx (wariant „Werdykt").
// Model widoku (tytuł, opis, werdykt, linki, JSON-LD): lib/seo/comparison-view.ts.
// Liczby o kierunkach wyłącznie z bramki faktów (lib/seo/comparison-model.ts);
// treść redakcyjna z twierdzeniami sprawdzonymi w źródłach: content/seo/comparisons.
// CTA do produktu idą przez SeoCtaLink z typTresci="comparison" (w szablonie).

export async function generateStaticParams() {
  return comparisonPairs.map((pair) => ({ para: pair.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { para } = await params;
  const found = comparisonViewFor(para);
  if (!found) return { title: "Porównanie kierunków" };
  const { pair, view } = found;
  const path = `/porownanie/${pair.slug}`;

  return {
    // Tytuł bez sufiksu marki: z „| HelpTravel" wszystkie 54 porównania miały
    // 63–71 znaków i były ucinane w wynikach (crawl 13.11.2026).
    title: { absolute: view.metaTitle },
    description: view.metaDescription,
    alternates: { canonical: path },
    ...socialMeta({
      title: view.metaTitle,
      description: view.metaDescription,
      path,
      type: "article",
      ownImage: true,
      modifiedTime: view.modifiedAt,
    }),
  };
}

export default async function ComparisonPage({ params }: PageProps) {
  const { para } = await params;
  const data = await loadComparisonPage(para);
  if (!data) notFound();
  return <ComparisonTemplate {...data} />;
}
