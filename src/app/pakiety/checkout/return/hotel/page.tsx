// Powrót z widgetu płatności HOTELU (Checkout 1). Widget wraca z ?sid=…
// (nasze sagaId) + parametrami Stripe (redirect_status). Sukces → POST
// hotel-paid (book = autorytatywna walidacja transakcji) → ekran przejściowy
// „Hotel potwierdzony ✓" → Checkout 2. Porażka → payment-failed (retryable).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PackageReturnClient } from "../return-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Płatność za hotel — pakiet", robots: { index: false, follow: false } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PackageHotelReturnPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();
  const sp = await searchParams;
  return (
    <main className="min-h-screen bg-neutral-50/60">
      <PackageReturnClient which="hotel" sagaId={one(sp.sid) ?? ""} redirectStatus={one(sp.redirect_status) ?? null} />
    </main>
  );
}
