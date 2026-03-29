import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

const category = getEditorialCategoryBySlug("tanie-podroze");

export const metadata: Metadata = {
  title: category?.title ?? "Tanie podroze",
  description: category?.description ?? "Tanie podroze i praktyczne scenariusze budzetowe.",
  alternates: {
    canonical: "/tanie-podroze",
  },
  openGraph: {
    title: `${category?.title ?? "Tanie podroze"} - HelpTravel`,
    description: category?.description ?? "Tanie podroze i praktyczne scenariusze budzetowe.",
    url: `${getSiteUrl()}/tanie-podroze`,
    type: "website",
  },
};

export default function BudgetTravelCategoryPage() {
  return <CategoryPage slug="tanie-podroze" />;
}
