import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

export const revalidate = 86400;

const category = getEditorialCategoryBySlug("przewodniki");

export const metadata: Metadata = {
  title: category?.title ?? "Przewodniki",
  description: category?.description ?? "Przewodniki travelowe HelpTravel.",
  alternates: {
    canonical: "/przewodniki",
  },
  openGraph: {
    title: `${category?.title ?? "Przewodniki"} - HelpTravel`,
    description: category?.description ?? "Przewodniki travelowe HelpTravel.",
    url: `${getSiteUrl()}/przewodniki`,
    type: "website",
  },
};

export default function GuidesCategoryPage() {
  return <CategoryPage slug="przewodniki" />;
}
