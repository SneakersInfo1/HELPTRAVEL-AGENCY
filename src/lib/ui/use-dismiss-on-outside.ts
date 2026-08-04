"use client";

// Zamykanie rozwijanej listy: kliknięcie POZA komponentem albo Escape.
//
// PO CO TO ISTNIEJE — zgłoszenie właściciela 2026-08-02: „pasek na homepage się
// chowa, jak na PC nacisnę żeby zjechać w dół to od razu znika, na mobile nie ma
// tego problemu".
//
// Wszystkie trzy comboboxy zamykały listę na `onBlur` inputa (z opóźnieniem
// 150 ms, żeby zdążył zarejestrować się klik w pozycję). To działa dopóki jedyną
// przyczyną utraty fokusu jest kliknięcie w treść strony. Na desktopie NIE JEST:
// naciśnięcie PASKA PRZEWIJANIA również zabiera fokus z pola, więc lista znikała
// dokładnie w momencie, w którym użytkownik próbował ją przewinąć. Na telefonie
// paska nie ma — stąd „na mobile nie ma tego problemu".
//
// `relatedTarget` nie rozstrzyga tego przypadku, bo przy kliknięciu w pasek
// przewijania jest `null` — tak samo jak przy kliknięciu w niefokusowalne tło,
// gdzie zamknąć TRZEBA. Rozstrzyga dopiero pozycja zdarzenia wskaźnika:
// współrzędne paska leżą POZA obszarem treści dokumentu
// (`documentElement.clientWidth/clientHeight`).
//
// Dlatego zamknięciem steruje `pointerdown` na dokumencie, a nie utrata fokusu.
// Wyjście tabulatorem obsługuje osobno `onBlur` z niepustym `relatedTarget`
// (patrz wywołania) — tam brak fokusu jest jednoznaczny.

import { useEffect, useRef, type RefObject } from "react";

export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
  extraRefs: ReadonlyArray<RefObject<HTMLElement | null>> = [],
): void {
  // Callback w refie: inaczej każda zmiana tożsamości funkcji (a przy zwykłej
  // strzałce w JSX to każdy render) odpinałaby i przypinała nasłuch, gubiąc
  // zdarzenie akurat wtedy, gdy lista przebudowuje się po wpisaniu znaku.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Portale nie są potomkami `ref` w DOM-ie. Trzymamy dodatkowe granice w
  // refie, żeby zmiana tablicy przekazanej inline nie przepinała nasłuchów w
  // trakcie klikania pozycji listy.
  const extraRefsRef = useRef(extraRefs);
  useEffect(() => {
    extraRefsRef.current = extraRefs;
  }, [extraRefs]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const root = document.documentElement;
      // Pasek przewijania okna leży poza obszarem treści. `>=`, nie `>`:
      // pierwszy piksel paska ma współrzędną równą szerokości treści.
      if (event.clientX >= root.clientWidth || event.clientY >= root.clientHeight) return;
      if (ref.current?.contains(event.target as Node)) return;
      if (extraRefsRef.current.some((extraRef) => extraRef.current?.contains(event.target as Node))) return;
      onDismissRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef.current();
    };

    // Faza przechwytywania: pozycja listy bywa zmieniana przez inne nasłuchy
    // (kalendarz w portalu), a my chcemy decyzję podjąć na surowym zdarzeniu.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, ref]);
}
