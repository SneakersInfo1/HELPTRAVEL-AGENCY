// /polubione — zapisane obiekty (brief V3 §17).
//
// Strona serwerowa z klienckim ciałem: źródłem jest localStorage przeglądarki,
// więc listy nie da się wyrenderować na serwerze. Nagłówek i metadane zostają
// po stronie serwera, żeby strona miała poprawny tytuł i opis.
//
// `noindex`: to prywatny widok konkretnej przeglądarki. Zaindeksowany nie
// niesie żadnej treści (u robota lista jest zawsze pusta) i tylko rozmywałby
// mapę serwisu.

import type { Metadata } from "next";

import { FavoritesList } from "./_components/favorites-list";

export const metadata: Metadata = {
  title: "Polubione hotele",
  description: "Obiekty zapisane w tej przeglądarce — wróć do nich, kiedy zechcesz.",
  robots: "noindex, follow",
};

export default function PolubionePage() {
  return (
    <main className="min-h-screen py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">Polubione</h1>
        <p className="mt-1 text-sm leading-6 text-neutral-600">
          Zapisane miejsca, do których możesz wrócić. Ceny sprawdzamy na żywo przy
          otwarciu obiektu — nie przechowujemy ich, bo zależą od terminu i liczby gości.
        </p>
      </header>

      <FavoritesList />
    </main>
  );
}
