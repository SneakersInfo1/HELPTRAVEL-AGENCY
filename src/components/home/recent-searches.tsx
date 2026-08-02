"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BedDouble, MapPin } from "lucide-react";

import { LocalizedLink } from "@/components/site/localized-link";
import { formatDateRange } from "@/lib/home/deal-card";
import {
  clearRecentSearches,
  readRecentSearches,
  type RecentSearch,
} from "@/lib/mvp/recent-searches";

// Sekcja „Ostatnio wyszukiwane" (2026-08-02, wzór ze strony pokazowej LiteAPI).
//
// Jedyna sekcja strony głównej, której treść nie pochodzi z serwera — historia
// wyszukiwań żyje WYŁĄCZNIE w localStorage przeglądarki (serwis świadomie jej
// nie zapisuje). Stąd trzy konsekwencje w kodzie poniżej:
//
//  1. Render dopiero PO zamontowaniu. Serwer nie ma jak wiedzieć, co user
//     wyszukiwał, więc pierwszy render klienta MUSI być pusty — inaczej
//     dostajemy niezgodność hydratacji na każdej wizycie z historią.
//  2. Brak wpisów = brak sekcji, bez pustego stanu. „Nie masz jeszcze
//     wyszukiwań" na stronie głównej to zajęte miejsce i zero wartości.
//  3. Zdjęcia kierunków przychodzą PROPSEM z serwera (mapa `imageByKey`,
//     zbudowana z kafelków, które strona i tak już rozwiązała). Klient nie ma
//     jak dociągnąć zdjęcia miasta bez dodatkowego zapytania, a wyszukiwanie
//     na stronie głównej nie jest wartościowe na tyle, żeby za nie płacić
//     kolejnym round-tripem.

/** Ile kart pokazujemy. Store trzyma więcej (patrz MAX_RECENT_SEARCHES) —
 *  zapas sprawia, że wygaśnięcie jednego terminu nie przerzedza pasa. */
const SHOWN = 3;

function guestsLabel(n: number): string {
  if (n === 1) return "1 gość";
  const mod10 = n % 10;
  const mod100 = n % 100;
  // 2–4 (poza 12–14) → mianownik liczby mnogiej „goście"; reszta → „gości".
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} goście`;
  return `${n} gości`;
}

function roomsLabel(n: number): string {
  if (n === 1) return "1 pokój";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} pokoje`;
  return `${n} pokoi`;
}

export function RecentSearches({
  heading = "Ostatnio wyszukiwane",
  imageByKey = {},
}: {
  heading?: string;
  /** Zdjęcia kierunków z serwera: klucz `imageKey` rekordu → URL. */
  imageByKey?: Record<string, string>;
}) {
  const [items, setItems] = useState<RecentSearch[]>([]);

  useEffect(() => {
    // Deferred (setTimeout 0) — ten sam wzorzec co w `home-search-tabs`:
    // synchroniczne setState w efekcie odpala kaskadowy render
    // (react-hooks/set-state-in-effect). Odczyt z localStorage jest szybki,
    // ale zawsze o jeden render za późno, więc odsunięcie nic nie kosztuje.
    const id = window.setTimeout(() => setItems(readRecentSearches()), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recent-searches" className="w-full px-4 sm:px-6 xl:px-8">
      <div className="flex items-end justify-between gap-4">
        <h2 id="recent-searches" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
          {heading}
        </h2>
        <button
          type="button"
          onClick={() => {
            clearRecentSearches();
            setItems([]);
          }}
          // -my-2/py-2: cel dotykowy ≥ 40 px bez rozpychania wiersza nagłówka.
          className="-my-2 shrink-0 py-2 text-xs font-semibold text-ink-muted underline underline-offset-4 transition hover:text-ink"
        >
          Wyczyść
        </button>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item.id}>
            <RecentCard item={item} photo={item.photo ?? (item.imageKey ? imageByKey[item.imageKey] : undefined)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentCard({ item, photo }: { item: RecentSearch; photo?: string }) {
  const range = formatDateRange(item.checkin, item.checkout);
  const Icon = item.kind === "hotel" ? BedDouble : MapPin;

  return (
    <LocalizedLink
      href={item.href}
      className="flex items-center gap-3 rounded-md border border-line bg-surface-raised p-2.5 shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
    >
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-surface-sunken">
        {photo ? (
          <Image src={photo} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          // Brak zdjęcia to NIE jest powód, żeby ukryć kartę — użytkownik
          // wraca tu po termin, nie po obrazek. Ikona typu wyszukania niesie
          // przy okazji informację, której nie ma nigdzie indziej na karcie.
          <span className="flex h-full w-full items-center justify-center text-ink-muted">
            <Icon aria-hidden className="h-5 w-5" strokeWidth={2} />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{item.title}</span>
        {item.subtitle ? (
          <span className="block truncate text-xs text-ink-muted">{item.subtitle}</span>
        ) : null}
        <span className="mt-0.5 block truncate text-xs text-ink-muted">
          {range ? `${range} · ` : ""}
          {guestsLabel(item.guests)}, {roomsLabel(item.rooms)}
        </span>
      </span>
    </LocalizedLink>
  );
}
