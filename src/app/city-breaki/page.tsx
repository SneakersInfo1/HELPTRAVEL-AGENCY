import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

const category = getEditorialCategoryBySlug("city-breaki");

export const metadata: Metadata = {
  title: category?.title ?? "City breaki",
  description: category?.description ?? "City breaki i krotkie wyjazdy z Polski.",
  alternates: {
    canonical: "/city-breaki",
  },
  openGraph: {
    title: `${category?.title ?? "City breaki"} - HelpTravel`,
    description: category?.description ?? "City breaki i krotkie wyjazdy z Polski.",
    url: `${getSiteUrl()}/city-breaki`,
    type: "website",
  },
};

export default function CityBreaksCategoryPage() {
  return <CategoryPage slug="city-breaki" />;
}
