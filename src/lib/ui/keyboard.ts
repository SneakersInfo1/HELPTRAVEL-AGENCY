"use client";

// Chowanie klawiatury systemowej na telefonie.
//
// PO CO TO ISTNIEJE — zgłoszenie właściciela 2026-08-04 wraz ze zrzutami z
// iPhone'a: „po otwarciu wyboru kierunku i kliknięciu ✕ warstwa się zamyka,
// ale klawiatura telefonu zostaje otwarta". Klawiatura zasłaniała wtedy dolną
// połowę ekranu, a strona pod spodem była przesunięta.
//
// Przyczyną NIE była sama warstwa, tylko sprzątanie efektu, które oddawało
// fokus polu wyzwalającemu (`triggerInput.focus()`). Na desktopie to poprawne
// zachowanie dostępnościowe — fokus wraca tam, skąd wyszedł. Na iOS i
// Androidzie sfokusowany <input type="text"> JEST równoznaczny z otwartą
// klawiaturą, więc ten sam kod, który dba o dostępność, trzymał klawiaturę.
//
// Dlaczego nie wystarczy zmiana stanu w Reakcie: zniknięcie pola z drzewa nie
// jest dla WebKita poleceniem schowania klawiatury. Safari chowa ją dopiero,
// gdy element faktycznie straci fokus — i tylko wtedy, gdy dzieje się to w
// obrębie gestu użytkownika albo zanim węzeł zostanie usunięty z dokumentu.
// Sprzątanie efektu Reacta biegnie jeszcze przed usunięciem węzła, więc jest
// właściwym momentem na `blur()`.

/**
 * Zdejmuje fokus z aktywnego pola, żeby telefon schował klawiaturę.
 *
 * Wywołuj przy KAŻDYM zamknięciu warstwy z polem tekstowym: ✕, kliknięcie tła,
 * wybór pozycji z listy, Escape i przycisk Wstecz. Na desktopie jest to
 * nieszkodliwe — tam i tak nie ma klawiatury ekranowej.
 */
export function zamknijKlawiature(): void {
  if (typeof document === "undefined") return;
  const aktywny = document.activeElement;
  if (!(aktywny instanceof HTMLElement)) return;
  // Blur tylko dla pól, które realnie podnoszą klawiaturę. Bez tego warunku
  // zdejmowalibyśmy fokus np. z przycisku zamykającego, psując nawigację
  // klawiaturą na desktopie bez żadnego zysku na telefonie.
  const podnosiKlawiature =
    aktywny instanceof HTMLInputElement ||
    aktywny instanceof HTMLTextAreaElement ||
    aktywny.isContentEditable;
  if (podnosiKlawiature) aktywny.blur();
}

/**
 * Czy fokus stoi na polu tekstowym — czyli czy klawiatura jest podniesiona.
 * Wyodrębnione, żeby test mógł to sprawdzić bez dostępu do prawdziwej
 * klawiatury systemowej, której w żadnej przeglądarce nie da się odpytać.
 */
export function fokusNaPoluTekstowym(): boolean {
  if (typeof document === "undefined") return false;
  const aktywny = document.activeElement;
  return (
    aktywny instanceof HTMLInputElement ||
    aktywny instanceof HTMLTextAreaElement ||
    (aktywny instanceof HTMLElement && aktywny.isContentEditable)
  );
}
