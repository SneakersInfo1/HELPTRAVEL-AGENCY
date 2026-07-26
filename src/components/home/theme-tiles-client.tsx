"use client";

// Klienckie części sekcji „Nie wiesz, dokąd jechać?": kafel konsjerża oraz
// pomiar klików w kafle kategorii. Sama sekcja zostaje serwerowa — do
// przeglądarki jedzie tylko to, co naprawdę potrzebuje interaktywności.

import type { ReactNode } from "react";
// Compass, nie ikona czatu: ta sama ikona co zakładka w hero i dymek
// launchera — trzy wejścia do jednego produktu mają wyglądać jak jeden produkt.
import { Compass } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { requestConciergeOpen } from "@/lib/concierge/open-event";

/** Przezroczysta obwoluta: łapie klik w kafel kategorii i raportuje pozycję. */
export function TrackedTile({
  slug,
  position,
  children,
}: {
  slug: string;
  position: number;
  children: ReactNode;
}) {
  return (
    <div
      className="contents"
      onClickCapture={() => track("category_tile_clicked", { slug, position })}
    >
      {children}
    </div>
  );
}

/**
 * Drugie wejście do konsjerża — RÓWNORZĘDNY kafel w tej samej siatce, nie
 * baner. Użytkownik, który nie wie dokąd jechać, dostaje tu ścieżkę „powiedz
 * budżet" zamiast kolejnej kategorii do zgadywania.
 *
 * Kafel nie ma zdjęcia (celowo): w siatce fotografii jednolita, ciemna
 * powierzchnia marki czyta się jako inny RODZAJ akcji, a nie kolejny kierunek.
 */
export function AssistantTile() {
  return (
    <button
      type="button"
      onClick={() => requestConciergeOpen("category_tile")}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-brand-strong/20 bg-brand-strong p-3 text-left text-white transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 sm:p-4"
    >
      <Compass
        aria-hidden
        strokeWidth={1.5}
        className="absolute right-3 top-3 h-8 w-8 text-white/25 transition duration-200 ease-out group-hover:text-white/40 motion-reduce:transition-none"
      />
      {/* Kafel mówił „Powiedz budżet — dobiorę wyjazd", czyli DOKŁADNIE to, co
          od fazy 3a robi dobieracz stojący dwa centymetry wyżej. Dwa sąsiednie
          wejścia z tą samą obietnicą to nie wybór, tylko wahanie — użytkownik
          musi zgadnąć, czym się różnią.
          Asystent umie jedno, czego dwa chipy nie umieją: przyjąć warunki
          podane własnymi słowami (konkretne daty, dziecko, limit długości
          lotu). Kafel mówi teraz o tym. */}
      <h4 className="font-display text-lg leading-tight sm:text-xl">
        Opisz wyjazd własnymi słowami
      </h4>
      <p className="mt-0.5 hidden text-xs text-white/75 sm:block">
        Daty, dzieci, długość lotu — asystent to uwzględni
      </p>
      <p className="mt-1 text-xs font-semibold text-white/90">
        Otwórz asystenta <span aria-hidden>→</span>
      </p>
    </button>
  );
}
