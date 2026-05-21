"use client";

import Link from "next/link";

interface ResultsErrorProps {
  title: string;
  message?: string | null;
  iata?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function ResultsError({ title, message, iata, lat, lng }: ResultsErrorProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {message ? <p className="mt-1 text-sm text-amber-900/82">{message}</p> : null}
          {(iata || lat != null || lng != null) && (
            <dl className="mt-3 grid gap-2 text-xs text-amber-900/72 sm:grid-cols-3">
              {iata ? (
                <div className="rounded-xl bg-white/55 px-3 py-2">
                  <dt className="font-semibold uppercase tracking-wide">IATA</dt>
                  <dd>{iata}</dd>
                </div>
              ) : null}
              {lat != null ? (
                <div className="rounded-xl bg-white/55 px-3 py-2">
                  <dt className="font-semibold uppercase tracking-wide">Lat</dt>
                  <dd>{lat.toFixed(4)}</dd>
                </div>
              ) : null}
              {lng != null ? (
                <div className="rounded-xl bg-white/55 px-3 py-2">
                  <dt className="font-semibold uppercase tracking-wide">Lng</dt>
                  <dd>{lng.toFixed(4)}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-bold text-white transition hover:bg-amber-700"
          >
            Spróbuj ponownie
          </button>
          <Link
            href="/kierunki"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-amber-300 bg-white/70 px-4 text-sm font-bold text-amber-950 transition hover:bg-white"
          >
            Zobacz inne kierunki
          </Link>
        </div>
      </div>
    </div>
  );
}
