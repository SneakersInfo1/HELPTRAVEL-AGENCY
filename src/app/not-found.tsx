import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strona nie znaleziona",
  description: "Ta strona nie istnieje. Wroc do strony glownej lub zacznij od plannera.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">404</p>
      <h1 className="font-display text-5xl leading-[1.05] text-emerald-950 sm:text-6xl">
        Tej strony juz tu nie ma.
      </h1>
      <p className="max-w-xl text-base leading-7 text-emerald-900/78">
        Adres mogl sie zmienic albo strona zostala usunieta. Wroc na strone glowna, zobacz katalog kierunkow albo
        zacznij planowanie wyjazdu.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Strona glowna
        </Link>
        <Link
          href="/kierunki"
          className="rounded-full border border-emerald-900/15 bg-white px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
        >
          Zobacz kierunki
        </Link>
        <Link
          href="/planner"
          className="rounded-full border border-emerald-900/15 bg-white px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
        >
          Uruchom planner
        </Link>
      </div>
    </main>
  );
}
