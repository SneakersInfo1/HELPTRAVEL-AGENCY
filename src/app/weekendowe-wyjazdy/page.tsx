import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

const category = getEditorialCategoryBySlug("weekendowe-wyjazdy");

export const metadata: Metadata = {
  title: category?.title ?? "Weekendowe wyjazdy",
  description: category?.description ?? "Weekendowe wyjazdy i szybkie city breaki z Polski.",
  alternates: {
    canonical: "/weekendowe-wyjazdy",
  },
  openGraph: {
    title: `${category?.title ?? "Weekendowe wyjazdy"} - HelpTravel`,
    description: category?.description ?? "Weekendowe wyjazdy i szybkie city breaki z Polski.",
    url: `${getSiteUrl()}/weekendowe-wyjazdy`,
    type: "website",
  },
};

export default function WeekendTripsCategoryPage() {
  return <CategoryPage slug="weekendowe-wyjazdy" />;
}
