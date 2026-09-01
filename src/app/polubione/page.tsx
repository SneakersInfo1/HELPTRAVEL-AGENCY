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
import { SHELL_CONTENT } from "@/lib/ui/layout";

export const metadata: Metadata = {
  title: "Polubione hotele",
  description: "Obiekty zapisane w tej przeglądarce — wróć do nich, kiedy zechcesz.",
  robots: "noindex, follow",
};

export default function PolubionePage() {
  return (
    // `min-h-screen` USUNIĘTE (brief §7). Ta strona była najostrzejszym
    // przypadkiem „gigantycznej losowej białej dziury": treść pustego stanu
    // kończyła się na ~530 px, a stopka zaczynała na ~1195 px — 723 px pustki
    // na 1920 i 394 px na telefonie (zmierzone, `e2e/layout-shots.ts before`).
    //
    // Przyczyna nie była tutaj przypadkowa: powłoka serwisu to już kolumna
    // `flex min-h-[100dvh]`, w której `#main-content` ma `flex-1`. Stopkę na
    // dół dociąga więc SAM UKŁAD. Dołożone tu `min-h-screen` kazało temu
    // `<main>` mieć dodatkowo całą wysokość okna — i ta wysokość dochodziła
    // do wysokości powłoki zamiast się z nią pokrywać.
    //
    // Strona nie miała też ŻADNEGO limitu szerokości ani paddingu: brała je
    // z ramy powłoki, która po przebudowie nagłówka przestała je nakładać.
    <main className={`flex w-full flex-1 flex-col py-8 ${SHELL_CONTENT}`}>
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
