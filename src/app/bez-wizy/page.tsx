import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";

const category = getEditorialCategoryBySlug("bez-wizy");

export const metadata: Metadata = {
  title: category?.title ?? "Bez wizy",
  description: category?.description ?? "Kierunki i inspiracje dla osob szukajacych prostszych formalnosci.",
};

export default function VisaFreeCategoryPage() {
  return <CategoryPage slug="bez-wizy" />;
}
