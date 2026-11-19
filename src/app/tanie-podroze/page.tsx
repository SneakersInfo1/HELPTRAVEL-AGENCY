import type { Metadata } from "next";
import { completeSocial } from "@/lib/seo/social-meta";

import { CategoryPage } from "@/components/publisher/category-page";
import { getEditorialCategoryBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";

// Dobowe ISR jawnie. Wcześniej wynikało z zapytania do Pexels (revalidate 1 dzień);
// kierunki z rejestru zdjęć nie pytają API, a wyniki wyszukiwania leżą w cache 30 dni.
export const revalidate = 86400;

const category = getEditorialCategoryBySlug("tanie-podroze");

export const metadata: Metadata = completeSocial({
  title: category?.title ?? "Ceny wyjazdów",
  description: category?.description ?? "Jak sprawdzać aktualne ceny lotów i noclegów dla własnego terminu.",
  alternates: {
    canonical: "/tanie-podroze",
  },
  openGraph: {
    title: `${category?.title ?? "Ceny wyjazdów"} - HelpTravel`,
    description: category?.description ?? "Jak sprawdzać aktualne ceny lotów i noclegów dla własnego terminu.",
    url: `${getSiteUrl()}/tanie-podroze`,
    type: "website",
  },
});

export default function BudgetTravelCategoryPage() {
  return <CategoryPage slug="tanie-podroze" />;
}

