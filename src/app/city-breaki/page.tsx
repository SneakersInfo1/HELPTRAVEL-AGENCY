import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import { completeSocial } from "@/lib/seo/social-meta";

// Dobowe ISR jawnie. Wcześniej wynikało z zapytania do Pexels (revalidate 1 dzień);
// kierunki z rejestru zdjęć nie pytają API, a wyniki wyszukiwania leżą w cache 30 dni.
export const revalidate = 86400;

const category = getEditorialCategoryBySlug("city-breaki");

export const metadata: Metadata = completeSocial({
  title: category?.title ?? "City breaki",
  description: category?.description ?? "City breaki i krótkie wyjazdy z Polski.",
  alternates: {
    canonical: "/city-breaki",
  },
  openGraph: {
    title: `${category?.title ?? "City breaki"} - HelpTravel`,
    description: category?.description ?? "City breaki i krótkie wyjazdy z Polski.",
    url: `${getSiteUrl()}/city-breaki`,
    type: "website",
  },
});

export default function CityBreaksCategoryPage() {
  return <CategoryPage slug="city-breaki" />;
}

