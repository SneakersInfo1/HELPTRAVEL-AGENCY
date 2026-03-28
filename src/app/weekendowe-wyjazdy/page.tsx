import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";

const category = getEditorialCategoryBySlug("weekendowe-wyjazdy");

export const metadata: Metadata = {
  title: category?.title ?? "Weekendowe wyjazdy",
  description: category?.description ?? "Weekendowe wyjazdy i szybkie city breaki z Polski.",
};

export default function WeekendTripsCategoryPage() {
  return <CategoryPage slug="weekendowe-wyjazdy" />;
}
