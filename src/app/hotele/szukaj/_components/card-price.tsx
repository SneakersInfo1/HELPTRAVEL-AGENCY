"use client";

import { UtensilsCrossed } from "lucide-react";

import { nightsWord, taxNoticeFromSlim, taxNoticeText } from "@/lib/hotels/domain/format";
import type { PriceEntry } from "@/lib/hotels/price-store";
import { localizeBoard } from "@/lib/liteapi/translations";
import { formatPLN } from "@/lib/money";

const formatDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};

// Presentational price slot — pure function of the store entry. Fetching
// is owned by ResultsList via the price-store so prices survive
// re-sorts/filters without re-hitting the network.
export function PriceView({ entry, nights }: { entry: PriceEntry | undefined; nights: number }) {
  if (entry === undefined || entry === "loading") {
    return (
      <div className="animate-pulse" aria-label="Sprawdzam cenę">
        <div className="h-3 w-16 rounded bg-neutral-200" />
        <div className="mt-1.5 h-6 w-28 rounded bg-neutral-200" />
        <div className="mt-1.5 h-2.5 w-36 rounded bg-neutral-100" />
      </div>
    );
  }

  if (entry === "error") {
    // Fetch ceny padł (po ponowce) — to NIE jest brak miejsc. Strona hotelu
    // pobiera stawki osobnym endpointem, więc kierujemy tam.
    return (
      <div className="text-sm text-neutral-500">
        <div className="font-medium text-neutral-600">Nie udało się pobrać ceny</div>
        <div className="text-[11px]">Otwórz hotel — sprawdzimy dostępność na jego stronie.</div>
      </div>
    );
  }

  if (entry === null) {
    return (
      <div className="text-sm text-neutral-500">
        <div className="font-medium text-neutral-600">Brak miejsc w tym terminie</div>
        <div className="text-[11px]">Spróbuj zmienić daty lub zobacz pokoje.</div>
      </div>
    );
  }

  const board = entry.boardName ? localizeBoard(entry.boardName) : null;
  const isFreeCancel = entry.refundableTag === "RFN" || Boolean(entry.cancellationDeadline);
  const freeCancelDate = formatDate(entry.cancellationDeadline);
  const perNight = formatPLN(Math.round(entry.totalAmount / Math.max(1, nights)), entry.currency);
  const total = formatPLN(entry.totalAmount, entry.currency);
  // Etykieta podatkowa WYNIKA z danych. `null` = dostawca nie podał rozbicia,
  // więc nie piszemy nic (zamiast dawnego bezwarunkowego „wł. podatków i opłat",
  // które było nieprawdą dla ~52% taryf).
  const taxText = taxNoticeText(taxNoticeFromSlim(entry.taxesIncluded, entry.taxExtraAmount, entry.currency));

  return (
    <div>
      {board && (
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
          <UtensilsCrossed aria-hidden className="h-3 w-3" />
          {board}
        </div>
      )}
      {isFreeCancel && freeCancelDate && (
        <div className="mb-1 text-xs font-medium text-emerald-700">
          Bezpłatna anulacja do {freeCancelDate}
        </div>
      )}
      {/* Hierarchia z briefu §8.5: dominuje cena CAŁEGO pobytu, „za noc" jest
          informacją pomocniczą. Wcześniej było odwrotnie na liście, a na stronie
          hotelu odwrotnie do listy — dwie sprzeczne hierarchie w jednym lejku. */}
      <div className="text-xl font-bold text-emerald-700">{total}</div>
      <div className="text-xs text-neutral-600">
        za {nights} {nightsWord(nights)} · {perNight} / noc
      </div>
      {taxText && <div className="text-[11px] text-neutral-500">{taxText}</div>}
    </div>
  );
}
