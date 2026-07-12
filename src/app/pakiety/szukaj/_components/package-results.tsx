// Live wyniki pakietów (async server component — streamowany przez <Suspense>).
// Odpala searchPackages z produkcyjnymi deps (żywe LiteAPI: loty + hotele).
// To JEST właściwy moment na live-search (interaktywne flow po submit), w
// przeciwieństwie do landingów/homepage, które czytają cache (§6/§8).

import { PackageListing } from "@/modules/packages/components/PackageListing";
import { createProductionDeps } from "@/modules/packages/services/packageSearch.deps";
import { searchPackages } from "@/modules/packages/services/packageSearch";
import type { PackageSearchParams } from "@/modules/packages/types";

export async function PackageResults({
  params,
  originLabel,
  destinationCity,
  destinationCountry,
}: {
  params: PackageSearchParams;
  originLabel: string;
  destinationCity: string;
  destinationCountry?: string;
}) {
  let result: Awaited<ReturnType<typeof searchPackages>> = null;
  try {
    result = await searchPackages(params, createProductionDeps());
  } catch (err) {
    console.error("[pakiety/szukaj] searchPackages error", err);
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-base font-semibold text-amber-900">Nie udało się pobrać pakietów</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-amber-800">
          Spróbuj ponownie za chwilę albo zmień termin lub kierunek.
        </p>
      </div>
    );
  }

  // null = brak bazowego lotu (brak połączenia / nierozpoznany kierunek).
  if (!result) {
    return (
      <div className="rounded-2xl border border-emerald-900/10 bg-white p-8 text-center">
        <p className="text-base font-semibold text-neutral-900">Brak lotów dla tego kierunku i dat</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">
          Nie znaleźliśmy przelotu w obie strony z {originLabel}. Spróbuj innego terminu albo pobliskiego
          lotniska wylotu.
        </p>
      </div>
    );
  }

  const adults = params.occupancies.reduce((s, o) => s + o.adults, 0);
  const childrenCount = params.occupancies.reduce((s, o) => s + o.children.length, 0);

  return (
    <PackageListing
      offers={result.offers}
      originLabel={originLabel}
      destinationCity={destinationCity}
      destinationCountry={destinationCountry}
      context={{ dateFrom: params.dateFrom, dateTo: params.dateTo, adults, childrenCount, changeHref: "/" }}
    />
  );
}
