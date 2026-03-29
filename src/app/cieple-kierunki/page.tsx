import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

const category = getEditorialCategoryBySlug("cieple-kierunki");

export const metadata: Metadata = {
  title: category?.title ?? "Cieple kierunki",
  description: category?.description ?? "Cieple kierunki z Polski na 4-7 dni.",
  alternates: {
    canonical: "/cieple-kierunki",
  },
  openGraph: {
    title: `${category?.title ?? "Cieple kierunki"} - HelpTravel`,
    description: category?.description ?? "Cieple kierunki z Polski na 4-7 dni.",
    url: `${getSiteUrl()}/cieple-kierunki`,
    type: "website",
  },
};

export default function WarmDestinationsCategoryPage() {
  return <CategoryPage slug="cieple-kierunki" />;
}
