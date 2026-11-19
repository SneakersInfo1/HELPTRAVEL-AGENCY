// Trasa laboratoryjna: trzy warianty układu strony porównania na tej samej treści.
//
// Istnieje WYŁĄCZNIE do porównania kierunków art direction na zrzutach
// (docs/seo/DESIGN_QUALITY_STANDARD.md). Bez SEO_LAB=1 zwraca 404 — na
// produkcji i na Preview jej nie ma; do tego noindex i brak w sitemapie.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComparisonTemplate, type ComparisonVariant } from "@/components/editorial/comparison-template";
import { loadComparisonPage } from "@/lib/seo/comparison-page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laboratorium układu — porównanie",
  robots: { index: false, follow: false },
};

const VARIANTS: readonly ComparisonVariant[] = ["magazyn", "werdykt", "pojedynek", "karta"];

export default async function ComparisonLabPage({ params }: { params: Promise<{ wariant: string; para: string }> }) {
  if (process.env.SEO_LAB !== "1") notFound();
  const { wariant, para } = await params;
  if (!VARIANTS.includes(wariant as ComparisonVariant)) notFound();
  const data = await loadComparisonPage(para);
  if (!data) notFound();
  return <ComparisonTemplate {...data} variant={wariant as ComparisonVariant} />;
}
