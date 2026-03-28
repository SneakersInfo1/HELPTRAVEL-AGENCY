import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";

const category = getEditorialCategoryBySlug("tanie-podroze");

export const metadata: Metadata = {
  title: category?.title ?? "Tanie podróże",
  description: category?.description ?? "Tanie podroze i praktyczne scenariusze budzetowe.",
};

export default function BudgetTravelCategoryPage() {
  return <CategoryPage slug="tanie-podroze" />;
}
