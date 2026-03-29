import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

const category = getEditorialCategoryBySlug("bez-wizy");

export const metadata: Metadata = {
  title: category?.title ?? "Bez wizy",
  description: category?.description ?? "Kierunki i inspiracje dla osob szukajacych prostszych formalnosci.",
  alternates: {
    canonical: "/bez-wizy",
  },
  openGraph: {
    title: `${category?.title ?? "Bez wizy"} - HelpTravel`,
    description: category?.description ?? "Kierunki i inspiracje dla osob szukajacych prostszych formalnosci.",
    url: `${getSiteUrl()}/bez-wizy`,
    type: "website",
  },
};

export default function VisaFreeCategoryPage() {
  return <CategoryPage slug="bez-wizy" />;
}
