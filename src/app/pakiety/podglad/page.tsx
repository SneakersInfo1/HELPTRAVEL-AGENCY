// PODGLĄD UI pakietów (krok 1) — narzędzie dev/staging do iteracji designu na
// realnych komponentach bez żywego API. Za flagą NEXT_PUBLIC_FEATURE_PACKAGES
// (poza flagą → 404). noindex — to nie jest strona publiczna.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PackageListing } from "@/modules/packages/components/PackageListing";
import { PREVIEW_OFFERS } from "@/modules/packages/fixtures";

export const metadata: Metadata = {
  title: "Podgląd pakietów (dev)",
  robots: { index: false, follow: false },
};

export default function PackagesPreviewPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();

  return (
    <main className="min-h-screen">
      <PackageListing
        offers={PREVIEW_OFFERS}
        originLabel="Warszawy"
        destinationCity="Barcelona"
        destinationCountry="Spain"
      />
    </main>
  );
}
