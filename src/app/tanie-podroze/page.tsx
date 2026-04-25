import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

const category = getEditorialCategoryBySlug("tanie-podroze");

export const metadata: Metadata = {
  title: category?.title ?? "Tanie podróże",
  description: category?.description ?? "Tanie podróże i praktyczne scenariusze budżetowe.",
  alternates: {
    canonical: "/tanie-podroze",
  },
  openGraph: {
    title: `${category?.title ?? "Tanie podróże"} - HelpTravel`,
    description: category?.description ?? "Tanie podróże i praktyczne scenariusze budżetowe.",
    url: `${getSiteUrl()}/tanie-podroze`,
    type: "website",
  },
};

export default function BudgetTravelCategoryPage() {
  return <CategoryPage slug="tanie-podroze" />;
}

