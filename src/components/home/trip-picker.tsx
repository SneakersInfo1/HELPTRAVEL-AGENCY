"use client";

// Dobieracz wyjazdu — sekcja C strony głównej.
//
// ZASTĘPUJE siatkę siedmiu kafli. Powód: kafle robiły to samo, co dwie sekcje
// nad nimi (zdjęcie + nazwa + „od X zł"), więc użytkownik przewijał trzeci raz
// ten sam wzorzec. Co gorsza, cena na KAŻDYM z sześciu kafli była kwotą już
// widoczną wyżej na tej samej stronie (Plaża 1117 zł = Larnaka z sekcji B,
// Budżet 737 zł = Sofia z sekcji B, itd.) — te same liczby pod trzema różnymi
// etykietami wyglądały na wygenerowane, mimo że były prawdziwe.
//
// Rola sekcji jest teraz inna: PRZECHWYCENIE INTENCJI. Użytkownik wie, ile chce
// wydać i na co ma ochotę, ale nie zna kierunku — a wpisanie czegokolwiek
// w wyszukiwarkę wymaga od niego decyzji, której jeszcze nie podjął.
//
// LICZNIK MUSI BYĆ PRAWDZIWY. „Mamy 12 wyjazdów od 737 zł" liczymy z DOKŁADNIE
// tej samej puli, którą użytkownik zobaczy po kliknięciu — `filterDeals` jest
// czystą funkcją współdzieloną z modelem i pokrytą testami. Licznik rozjechany
// z wynikiem jest gorszy niż brak licznika: raz przyłapany, podważa każdą inną
// liczbę na stronie.
//
// Bez modala, bez czatu, bez przekierowania — widget jest inline, więc krok
// „zmieniam zdanie" nic nie kosztuje.

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import {
  BUDGET_BANDS,
  budgetBandLabel,
  dealsLabel,
  filterDeals,
  formatPricePln,
  type BudgetBandId,
  type DealCard,
} from "@/lib/home/deal-card";
// Logika stanu żyje w czystym module — komponent jest nad nią cienką powłoką.
// Dzięki temu przełączanie chipów, trzy stany podsumowania i cel CTA są
// pokryte testami mimo braku DOM-u w tym repo.
import {
  EMPTY_PICKER_STATE,
  pickerCtaHref,
  pickerSummary,
  toggleBudget,
  toggleTheme,
  type PickerState,
} from "@/lib/home/trip-picker-state";
import { track } from "@/lib/analytics/track";
import { useViewOnce } from "@/lib/analytics/use-view-once";
import { COPY_VARIANT, HOME_COPY } from "@/lib/home/copy";
import { cn } from "@/lib/ui/cn";

export interface TripPickerTheme {
  /** Slug moodu — trafia do URL /wyjazdy/{slug} i do eventu GA4. */
  slug: string;
  label: string;
}

interface TripPickerProps {
  /** Pula ofert ze snapshotu — wyłącznie kierunki ze ŚWIEŻĄ ceną pakietu. */
  deals: readonly DealCard[];
  themes: readonly TripPickerTheme[];
  /** slug moodu → id kierunków należących do niego. */
  themeMembership: Readonly<Record<string, readonly string[]>>;
  /**
   * Etykieta przycisku. Propsem, nie na sztywno — to jedna z dwóch rzeczy
   * (obok nagłówka), które da się testować bez ruszania danych. Domyślna
   * wartość i limit długości siedzą w lib/home/copy.ts.
   */
  ctaLabel?: string;
}

/**
 * Wspólny kształt chipa. Wysokość 44 px = próg dotykowy (90% ruchu to telefon).
 *
 * `active:scale` z tego samego powodu, co na kartach: na telefonie `hover:`
 * nie istnieje, więc bez stanu wciśnięcia chip nie potwierdza dotknięcia,
 * dopóki nie przeliczy się licznik.
 */
const CHIP_BASE =
  "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100";

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        CHIP_BASE,
        active
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface-raised text-ink hover:border-brand/40 hover:bg-brand-soft",
      )}
    >
      {/* Ikona TYLKO na wybranym — na wszystkich naraz byłaby dekoracją.
          Znacznik niesie tu stan, więc jest uzasadniony. */}
      {active && <Check aria-hidden strokeWidth={2.5} className="h-4 w-4 shrink-0" />}
      {label}
    </button>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        {/* Numeracja jest tu uzasadniona: to REALNA sekwencja, a nie ozdobnik —
            kolejne kroki zawężają ten sam zbiór. */}
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand"
        >
          {index}
        </span>
        {title}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function TripPicker({
  deals,
  themes,
  themeMembership,
  ctaLabel = HOME_COPY.picker.cta ?? "Pokaż wyjazdy",
}: TripPickerProps) {
  const [state, setState] = useState<PickerState>(EMPTY_PICKER_STATE);
  const { budget, theme } = state;
  // Ref, nie stan: „czy już zaczął" nie wpływa na render, więc trzymanie tego
  // w stanie wywołałoby zbędne przerysowanie przy pierwszym kliknięciu.
  const startedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // MIANOWNIK dla `quiz_start`. Sam licznik rozpoczętych doborów nie pozwala
  // odróżnić „widget nie zachęca" od „nikt tu nie doscrollował", a to dwa
  // przeciwne wnioski: przerobić widget albo przenieść sekcję wyżej.
  useViewOnce(
    rootRef,
    useCallback(() => {
      track("quiz_view", {
        page_path: window.location.pathname,
        available_count: deals.length,
        copy_variant: COPY_VARIANT,
      });
    }, [deals.length]),
  );

  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track("quiz_start", { page_path: window.location.pathname });
  }, []);

  const matching = useMemo(
    () => filterDeals(deals, { budget, theme }, themeMembership),
    [deals, budget, theme, themeMembership],
  );
  const summary = pickerSummary(state, matching);

  // Krok uznajemy za ukończony, gdy użytkownik dokonał WYBORU — odznaczenie to
  // cofnięcie, nie postęp. Decyzja siedzi w `toggle*` (pokryta testem), tutaj
  // zostaje tylko wysłanie eventu.
  const selectBudget = useCallback(
    (id: BudgetBandId) => {
      markStarted();
      const { state: next, reported } = toggleBudget(state, id);
      setState(next);
      if (reported) track("quiz_step_complete", { step: 1, step_name: "budget", value: reported });
    },
    [state, markStarted],
  );

  const selectTheme = useCallback(
    (slug: string) => {
      markStarted();
      const { state: next, reported } = toggleTheme(state, slug);
      setState(next);
      if (reported) track("quiz_step_complete", { step: 2, step_name: "theme", value: reported });
    },
    [state, markStarted],
  );

  const ctaHref = pickerCtaHref(state);

  const onSubmit = useCallback(() => {
    track("quiz_submit", {
      budget: budget ?? "any",
      theme: theme ?? "any",
      results_count: matching.length,
      cheapest_price: summary.kind === "results" ? (summary.cheapestPln ?? undefined) : undefined,
      copy_variant: COPY_VARIANT,
    });
  }, [budget, theme, matching.length, summary]);

  return (
    <div
      ref={rootRef}
      className="rounded-[2rem] border border-line bg-surface-raised p-5 shadow-[var(--shadow-md)] sm:p-7"
    >
      <div className="grid gap-6 sm:gap-7">
        <Step index={1} title="Ile chcesz wydać na osobę?">
          {BUDGET_BANDS.map((b) => (
            <Chip
              key={b.id}
              active={budget === b.id}
              label={budgetBandLabel(b)}
              onClick={() => selectBudget(b.id)}
            />
          ))}
        </Step>

        <Step index={2} title="Na co masz ochotę?">
          {themes.map((t) => (
            <Chip key={t.slug} active={theme === t.slug} label={t.label} onClick={() => selectTheme(t.slug)} />
          ))}
        </Step>
      </div>

      {/* Wynik na żywo. Kotwica całego widgetu — to jest moment, w którym
          abstrakcyjny wybór zamienia się w konkret („jest 12 takich wyjazdów,
          najtańszy 737 zł"). */}
      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:mt-7 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p
          // aria-live: użytkownik czytnika ekranu też musi wiedzieć, że liczba
          // się zmieniła — bez tego chipy „nic nie robią".
          aria-live="polite"
          className="text-sm leading-6 text-ink-muted"
        >
          {summary.kind === "results" ? (
            <>
              Mamy <strong className="font-bold text-ink">{dealsLabel(summary.count)}</strong>
              {summary.cheapestPln !== null && (
                <>
                  {" "}
                  od{" "}
                  <strong className="font-bold text-brand">
                    {formatPricePln(summary.cheapestPln)}/os.
                  </strong>
                </>
              )}
            </>
          ) : summary.kind === "empty" ? (
            // Pusty wynik dostaje WYJŚCIE, nie samo „brak". Ślepa uliczka
            // w tym miejscu oznacza wyjście ze strony.
            <>W tym zestawieniu nic teraz nie mamy — spróbuj wyższego budżetu albo innego typu.</>
          ) : (
            <>Wybierz budżet albo typ wyjazdu, a policzę, ile mamy propozycji.</>
          )}
        </p>

        <a
          href={ctaHref}
          onClick={onSubmit}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-bold shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {/* span: globalne a{color:inherit} bije text-* na <a> */}
          <Search aria-hidden strokeWidth={2} className="h-4 w-4 shrink-0 text-white" />
          <span className="text-white">{ctaLabel}</span>
        </a>
      </div>
    </div>
  );
}
