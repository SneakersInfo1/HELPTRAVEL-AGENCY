import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";

const category = getEditorialCategoryBySlug("city-breaki");

export const metadata: Metadata = {
  title: category?.title ?? "City breaki",
  description: category?.description ?? "City breaki i krotkie wyjazdy z Polski.",
};

export default function CityBreaksCategoryPage() {
  return <CategoryPage slug="city-breaki" />;
}
