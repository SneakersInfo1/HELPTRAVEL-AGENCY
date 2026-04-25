import type { Metadata } from "next";

import { getAnalyticsSummary } from "@/lib/mvp/analytics";

export const metadata: Metadata = {
  title: "Analityka",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function AnalyticsPage() {
  const summary = await getAnalyticsSummary();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-3xl border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_46px_rgba(16,84,48,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Panel lite</p>
        <h1 className="mt-2 text-3xl font-bold text-emerald-950">Analityka MVP</h1>
        <p className="mt-3 text-sm text-emerald-900/80">
          Prosty, tylko do odczytu panel do sprawdzania ruchu produktu i monetyzacji afiliacyjnej.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-5">
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-emerald-700">Starty planera</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary.plannerRuns}</p>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-emerald-700">Wygenerowane wyniki</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary.generatedResults}</p>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-emerald-700">Klikniecia afiliacyjne</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary.affiliateClicks}</p>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-emerald-700">Akcje retencyjne</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary.retentionActions}</p>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-emerald-700">Porównania kierunków</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{summary.comparisonEvents}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <h2 className="text-lg font-bold text-emerald-950">Najczęstsze zapytania</h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/85">
            {summary.topQueries.map((item) => (
              <li key={item.key} className="rounded-lg bg-emerald-50/70 px-3 py-2">
                {item.key} <span className="font-semibold">({item.count})</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <h2 className="text-lg font-bold text-emerald-950">Najczęściej wybierane kierunki</h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/85">
            {summary.topDestinations.map((item) => (
              <li key={item.key} className="rounded-lg bg-emerald-50/70 px-3 py-2">
                {item.key} <span className="font-semibold">({item.count})</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <h2 className="text-lg font-bold text-emerald-950">Typy zdarzen</h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/85">
            {summary.topEventTypes.map((item) => (
              <li key={item.key} className="rounded-lg bg-emerald-50/70 px-3 py-2">
                {item.key} <span className="font-semibold">({item.count})</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <h2 className="text-lg font-bold text-emerald-950">Klikniecia po partnerach</h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/85">
            {summary.topClickProviders.map((item) => (
              <li key={item.key} className="rounded-lg bg-emerald-50/70 px-3 py-2">
                {item.key} <span className="font-semibold">({item.count})</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
          <h2 className="text-lg font-bold text-emerald-950">Klikniecia po zrodle</h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/85">
            {summary.topClickSources.map((item) => (
              <li key={item.key} className="rounded-lg bg-emerald-50/70 px-3 py-2">
                {item.key} <span className="font-semibold">({item.count})</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}


