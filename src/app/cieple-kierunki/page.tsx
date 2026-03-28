import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";

const category = getEditorialCategoryBySlug("cieple-kierunki");

export const metadata: Metadata = {
  title: category?.title ?? "Cieple kierunki",
  description: category?.description ?? "Cieple kierunki z Polski na 4-7 dni.",
};

export default function WarmDestinationsCategoryPage() {
  return <CategoryPage slug="cieple-kierunki" />;
}
