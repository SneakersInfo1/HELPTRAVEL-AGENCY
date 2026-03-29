import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";

const category = getEditorialCategoryBySlug("przewodniki");

export const metadata: Metadata = {
  title: category?.title ?? "Przewodniki",
  description: category?.description ?? "Przewodniki travelowe HelpTravel.",
};

export default function GuidesCategoryPage() {
  return <CategoryPage slug="przewodniki" />;
}
