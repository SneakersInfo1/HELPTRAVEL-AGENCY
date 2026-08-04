"use client";

// Wyszukiwarka lotnisk jak na Booking (zadanie 1). Renderuje grupy
// „Miasto — wszystkie lotniska" ORAZ pojedyncze lotniska ze słownika
// (lib/flights/airports). Działa po nazwach PL/EN, kodach IATA i aliasach
// (Chopin, Okęcie, Modlin, Heathrow…). Komponent kontrolowany przez rodzica
// (query + potwierdzony wybór w stanie formularza), wzorem OriginCombobox.

import { Plane, PlaneTakeoff, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { searchAirports, type AirportOption } from "@/lib/flights/airports";
import { useDismissOnOutside } from "@/lib/ui/use-dismiss-on-outside";

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (option: AirportOption) => void;
  onClear: () => void;
  error?: string;
  fieldClassName: string;
  labelClassName: string;
  label?: string;
  placeholder?: string;
  inputAriaLabel?: string;
}

interface AnchoredListPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

const MOBILE_BREAKPOINT = "(min-width: 640px)";
const AIRPORT_LIST_HEIGHT = 320;
const SHEET_HISTORY_KEY = "__helptravelAirportSheet";

function getAnchoredListPosition(anchor: HTMLElement): AnchoredListPosition {
  const rect = anchor.getBoundingClientRect();
  const gap = 6;
  const viewportPadding = 16;
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
  const spaceAbove = rect.top - gap - viewportPadding;
  const openAbove = spaceBelow < AIRPORT_LIST_HEIGHT && spaceAbove > spaceBelow;
  const available = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(AIRPORT_LIST_HEIGHT, Math.max(200, available));

  return openAbove
    ? {
        left: rect.left,
        bottom: window.innerHeight - rect.top + gap,
        width: rect.width,
        maxHeight,
      }
    : { left: rect.left, top: rect.bottom + gap, width: rect.width, maxHeight };
}

function optionKey(o: AirportOption): string {
  return o.kind === "group" ? `g:${o.group.id}` : `a:${o.airport.code}`;
}

export function AirportCombobox({
  query,
  onQueryChange,
  onSelect,
  onClear,
  error,
  fieldClassName,
  labelClassName,
  label = "Skąd",
  placeholder = "Miasto lub lotnisko",
  inputAriaLabel = "Lotnisko wylotu",
}: Props) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [listPosition, setListPosition] = useState<AnchoredListPosition | null>(null);
  const [highlight, setHighlight] = useState(-1);
  // Czy użytkownik COKOLWIEK wpisał od ostatniego wejścia w pole. Gdy `false`
  // (świeży fokus — także na polu z już potwierdzonym lotniskiem) pokazujemy
  // PEŁNĄ listę domyślną zamiast filtrować po nazwie potwierdzonego wyboru.
  // Bez tego klik w pole „Lotnisko Chopina (WAW)" filtrował po tym tekście →
  // 0 trafień → komunikat „Brak lotniska dla…" zamiast listy do zmiany.
  const [typed, setTyped] = useState(false);
  // Granica komponentu dla zamykania listy. Zamknięcie NIE może wisieć na
  // utracie fokusu: naciśnięcie paska przewijania też ją powoduje, a wtedy
  // lista znikała w trakcie przewijania (zgłoszenie właściciela 2026-08-02).
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Druga granica należy do portalu w <body>; bez niej capture-phase
  // pointerdown potraktowałby wybór podpowiedzi jak klik poza comboboxem.
  const portalRef = useRef<HTMLDivElement>(null);
  const suppressTriggerFocusRef = useRef(false);
  const historyBackPendingRef = useRef(false);

  // Dopóki user nie zacznie pisać, traktujemy pole jak puste → lista domyślna
  // („Polska — dowolne lotnisko" + cała PL + grupy EU + popularne huby).
  const term = typed ? query : "";
  const options = searchAirports(term, term.trim() ? 8 : 40);

  function closeSuggestions() {
    if (
      !isDesktop &&
      !historyBackPendingRef.current &&
      (window.history.state as Record<string, unknown> | null)?.[SHEET_HISTORY_KEY] === listboxId
    ) {
      historyBackPendingRef.current = true;
      window.history.back();
    }
    setOpen(false);
  }

  function openSuggestions() {
    const desktop = window.matchMedia(MOBILE_BREAKPOINT).matches;
    setIsDesktop(desktop);
    if (desktop && inputRef.current) setListPosition(getAnchoredListPosition(inputRef.current));
    setOpen(true);
  }

  const pick = (o: AirportOption) => {
    onSelect(o);
    closeSuggestions();
    setHighlight(-1);
    setTyped(false);
  };

  function scrollHighlightIntoView(index: number) {
    if (index < 0) return;
    listRef.current
      ?.querySelectorAll<HTMLElement>('[role="option"]')
      [index]?.scrollIntoView({ block: "nearest" });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(highlight + 1, options.length - 1);
      setHighlight(next);
      scrollHighlightIntoView(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(highlight - 1, 0);
      setHighlight(next);
      scrollHighlightIntoView(next);
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      pick(options[highlight]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeSuggestions();
    }
  }

  useDismissOnOutside(wrapRef, open, closeSuggestions, [portalRef]);

  // Portal jest pozycjonowany względem viewportu. Capture na scrollu łapie
  // także przewijanie zagnieżdżonych kontenerów, które nie bąbelkuje.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const updatePosition = () => {
      if (inputRef.current) setListPosition(getAnchoredListPosition(inputRef.current));
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, isDesktop]);

  // Mobile: modalny pełny ekran, własny wpis historii i blokada tła. Sprawdzenie
  // markera przed pushState czyni efekt bezpiecznym przy powtórzeniu w StrictMode.
  useEffect(() => {
    if (!open || isDesktop) return;
    const triggerInput = inputRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    historyBackPendingRef.current = false;
    const currentState = window.history.state as Record<string, unknown> | null;
    if (currentState?.[SHEET_HISTORY_KEY] !== listboxId) {
      window.history.pushState(
        { ...(currentState ?? {}), [SHEET_HISTORY_KEY]: listboxId },
        "",
      );
    }
    const handlePopState = () => setOpen(false);
    window.addEventListener("popstate", handlePopState);
    const frame = window.requestAnimationFrame(() => {
      mobileInputRef.current?.focus();
      mobileInputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", handlePopState);
      document.body.style.overflow = previousOverflow;
      suppressTriggerFocusRef.current = true;
      triggerInput?.focus({ preventScroll: true });
    };
  }, [open, isDesktop, listboxId]);

  const optionRows = options.length > 0 ? (
    options.map((o, idx) => {
      const active = idx === highlight;
      const isGroup = o.kind === "group";
      const title = isGroup ? o.group.label : o.airport.name;
      // Bez kodów IATA (prośba właściciela) — sam opis lokalizacji.
      const sub = isGroup
        ? (o.group.city === o.group.country ? "Wszystkie polskie lotniska" : o.group.country)
        : `${o.airport.city}, ${o.airport.country}`;
      return (
        <li
          key={optionKey(o)}
          id={`${listboxId}-opt-${idx}`}
          role="option"
          aria-selected={active}
          onMouseDown={(event) => {
            event.preventDefault();
            pick(o);
          }}
          onMouseEnter={() => setHighlight(idx)}
          className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2 transition-colors duration-150 ease-out active:bg-emerald-100 motion-reduce:transition-none ${
            isDesktop ? "min-h-[52px]" : "min-h-[56px]"
          } ${active ? "bg-emerald-50" : "hover:bg-emerald-50/60"}`}
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted"
          >
            {isGroup ? (
              <PlaneTakeoff className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Plane className="h-4 w-4" strokeWidth={2} />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-emerald-950">{title}</span>
            <span className="text-[11px] text-emerald-900/55">{sub}</span>
          </span>
        </li>
      );
    })
  ) : (
    <li className="px-3 py-3 text-sm text-emerald-900/56">
      Brak lotniska dla „{query}”. Spróbuj miasta lub kodu IATA.
    </li>
  );

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1.5">
      <span className={labelClassName}>{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined}
          aria-label={inputAriaLabel}
          value={query}
          onChange={(e) => {
            setTyped(true);
            onQueryChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onKeyDown={handleKeyDown}
          onClick={() => {
            if (window.matchMedia(MOBILE_BREAKPOINT).matches && !open) openSuggestions();
          }}
          onPointerDown={(event) => {
            if (!window.matchMedia(MOBILE_BREAKPOINT).matches) {
              event.preventDefault();
              openSuggestions();
            }
          }}
          onFocus={(e) => {
            if (suppressTriggerFocusRef.current) {
              suppressTriggerFocusRef.current = false;
              return;
            }
            // Wejście w pole = pokaż pełną listę (nie filtruj po potwierdzonym
            // wyborze) i zaznacz tekst, żeby pierwszy znak go zastąpił.
            openSuggestions();
            setTyped(false);
            e.currentTarget.select();
          }}
          onBlur={(event) => {
            // Tylko realne przeniesienie fokusu zamyka listę; `relatedTarget`
            // równy null (pasek przewijania, klik w tło) zostawia decyzję
            // hakowi wyżej, który odróżnia pasek od kliknięcia poza polem.
            const next = event.relatedTarget as Node | null;
            if (
              next &&
              !wrapRef.current?.contains(next) &&
              !portalRef.current?.contains(next)
            ) closeSuggestions();
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`${fieldClassName} w-full ${query ? "pr-9" : ""}`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onClear();
              closeSuggestions();
            }}
            aria-label="Wyczyść lotnisko"
            // Kształt zostaje 24 px (większy krzyżyk zdominowałby pole), ale
            // OBSZAR KLIKU rośnie pseudo-elementem do 44 px — minimum z WCAG
            // 2.5.8. Zmierzone przed zmianą: 24×24, czyli cel, w który na
            // telefonie trafia się co drugi raz, a 90% ruchu to telefon.
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-emerald-900/45 transition-colors duration-150 ease-out before:absolute before:-inset-[10px] before:content-[''] hover:bg-emerald-50 hover:text-emerald-900 active:bg-emerald-100 motion-reduce:transition-none"
          >
            <X aria-hidden className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {open && isDesktop && listPosition && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={portalRef}
            className="fixed z-[60]"
            style={{
              left: listPosition.left,
              top: listPosition.top,
              bottom: listPosition.bottom,
              width: listPosition.width,
            }}
          >
            <ul
              id={listboxId}
              ref={listRef}
              role="listbox"
              aria-label="Lotniska"
              className="w-full overflow-y-auto overscroll-contain rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
              style={{ maxHeight: listPosition.maxHeight }}
            >
              {optionRows}
            </ul>
          </div>,
          document.body,
        )}

      {open && !isDesktop && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={portalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Wyszukiwanie lotniska wylotu"
            className="fixed inset-0 z-[70] flex flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
          >
            <div className="flex min-h-14 items-center gap-2 border-b border-emerald-900/10 px-2">
              <button
                type="button"
                onClick={closeSuggestions}
                aria-label="Zamknij"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-emerald-950 transition-colors duration-150 ease-out hover:bg-emerald-50 active:bg-emerald-100 motion-reduce:transition-none"
              >
                <X aria-hidden className="h-5 w-5" strokeWidth={2} />
              </button>
              <h2 className="text-lg font-bold text-emerald-950">Skąd?</h2>
            </div>
            <div className="border-b border-emerald-900/10 p-3 text-lg">
              <div className="relative">
                <input
                  ref={mobileInputRef}
                  // Patrz bliźniacza uwaga w mini-planner-form.tsx: samo
                  // `focus()` w requestAnimationFrame zostawiało fokus na polu
                  // pod nakładką, więc klawiatura telefonu podnosiła się dla
                  // niewidocznego pola.
                  autoFocus
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-activedescendant={highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined}
                  aria-label={inputAriaLabel}
                  value={query}
                  onChange={(event) => {
                    setTyped(true);
                    onQueryChange(event.target.value);
                    setHighlight(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  autoComplete="off"
                  className={`h-14 w-full rounded-sm border border-emerald-900/15 bg-white px-4 font-medium text-emerald-950 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 ${query ? "pr-12" : ""}`}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      onClear();
                      setTyped(false);
                      setHighlight(-1);
                      mobileInputRef.current?.focus();
                    }}
                    aria-label="Wyczyść lotnisko"
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-emerald-900/50 transition-colors duration-150 ease-out hover:bg-emerald-50 active:bg-emerald-100 motion-reduce:transition-none"
                  >
                    <X aria-hidden className="h-5 w-5" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
            <ul
              id={listboxId}
              ref={listRef}
              role="listbox"
              aria-label="Lotniska"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
            >
              {optionRows}
            </ul>
          </div>,
          document.body,
        )}

      {error && (
        // rounded-sm, nie -lg: w tokenach projektu `rounded-lg` to 20 px —
        // WIĘCEJ niż 2xl — a komunikaty błędów formularza mają 8 px.
        <p className="mt-1 rounded-sm bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
