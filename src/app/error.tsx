"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-600">Cos poszlo nie tak</p>
      <h1 className="font-display text-5xl leading-[1.05] text-emerald-950 sm:text-6xl">
        Mamy chwilowy problem.
      </h1>
      <p className="max-w-xl text-base leading-7 text-emerald-900/78">
        Sprobuj ponownie za chwile albo wroc na strone glowna. Jesli problem sie powtarza, daj nam znac.
      </p>
      {error.digest ? (
        <p className="text-xs text-emerald-900/60">ID bledu: {error.digest}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Sprobuj ponownie
        </button>
        <Link
          href="/"
          className="rounded-full border border-emerald-900/15 bg-white px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
        >
          Strona glowna
        </Link>
      </div>
    </main>
  );
}
