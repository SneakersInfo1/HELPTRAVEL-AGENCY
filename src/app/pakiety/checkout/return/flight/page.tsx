// Powrót z widgetu płatności LOTU (Checkout 2). Sukces → POST flight-paid
// (book idempotentny po prebookId) → strona potwierdzenia pakietu.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PackageReturnClient } from "../return-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Płatność za lot — pakiet", robots: { index: false, follow: false } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PackageFlightReturnPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();
  const sp = await searchParams;
  return (
    <main className="min-h-screen bg-neutral-50/60">
      <PackageReturnClient which="flight" sagaId={one(sp.sid) ?? ""} redirectStatus={one(sp.redirect_status) ?? null} />
    </main>
  );
}
