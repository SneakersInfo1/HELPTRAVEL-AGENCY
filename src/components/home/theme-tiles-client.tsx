"use client";

// Klienckie części sekcji „Nie wiesz, dokąd jechać?": kafel konsjerża oraz
// pomiar klików w kafle kategorii. Sama sekcja zostaje serwerowa — do
// przeglądarki jedzie tylko to, co naprawdę potrzebuje interaktywności.

import type { ReactNode } from "react";
import { MessagesSquare } from "lucide-react";

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
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-brand-strong/20 bg-brand-strong p-3 text-left text-white transition hover:-translate-y-1 hover:shadow-lg sm:p-4"
    >
      <MessagesSquare
        aria-hidden
        strokeWidth={1.5}
        className="absolute right-3 top-3 h-8 w-8 text-white/25 transition group-hover:text-white/40"
      />
      <h3 className="font-display text-lg leading-tight sm:text-xl">
        Powiedz budżet — dobiorę wyjazd
      </h3>
      <p className="mt-0.5 hidden text-[11px] text-white/75 sm:block">
        Napisz, ile masz i kiedy chcesz jechać
      </p>
      <p className="mt-1 text-[11px] font-semibold text-white/90">
        Otwórz asystenta <span aria-hidden>→</span>
      </p>
    </button>
  );
}
