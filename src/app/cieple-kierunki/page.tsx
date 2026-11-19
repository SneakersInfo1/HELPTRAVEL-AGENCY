import type { Metadata } from "next";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import { completeSocial } from "@/lib/seo/social-meta";

// Dobowe ISR jawnie. Wcześniej wynikało z zapytania do Pexels (revalidate 1 dzień);
// kierunki z rejestru zdjęć nie pytają API, a wyniki wyszukiwania leżą w cache 30 dni.
export const revalidate = 86400;

const category = getEditorialCategoryBySlug("cieple-kierunki");

export const metadata: Metadata = completeSocial({
  title: category?.title ?? "Ciepłe kierunki",
  description: category?.description ?? "Ciepłe kierunki z Polski na 4-7 dni.",
  alternates: {
    canonical: "/cieple-kierunki",
  },
  openGraph: {
    title: `${category?.title ?? "Ciepłe kierunki"} - HelpTravel`,
    description: category?.description ?? "Ciepłe kierunki z Polski na 4-7 dni.",
    url: `${getSiteUrl()}/cieple-kierunki`,
    type: "website",
  },
});

export default function WarmDestinationsCategoryPage() {
  return <CategoryPage slug="cieple-kierunki" />;
}

