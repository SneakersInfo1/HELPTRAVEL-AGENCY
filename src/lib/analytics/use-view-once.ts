"use client";

import { useEffect, useRef, type RefObject } from "react";

// Ekspozycja sekcji — „użytkownik to zobaczył", raportowane RAZ na wizytę.
//
// Po co osobny hook zamiast trzech kopii `IntersectionObserver`: bez licznika
// ekspozycji sekcja z niskim CTR jest nie do odróżnienia od sekcji, do której
// nikt nie doscrollował. To dwa przeciwne wnioski (popraw kartę vs przenieś
// sekcję wyżej), a mylenie ich kosztuje kolejny sprint.
//
// PUŁAPKA, dla której ten kod żyje w jednym miejscu: warunkiem MUSI być
// `intersectionRatio`, a NIE `entry.isIntersecting`. Obserwator dostarcza
// pierwszy wpis od razu po `observe()`, niezależnie od progu, a `isIntersecting`
// jest prawdziwe przy jakimkolwiek przecięciu — więc sekcja, której górna
// krawędź wchodzi w ekran przy scrollu 0, raportowałaby wyświetlenie każdemu,
// kto otworzył stronę i nic nie zrobił. Zawyżone wyświetlenia zaniżają CTR,
// czyli psują dokładnie tę liczbę, dla której ten pomiar powstał.

/**
 * Ile elementu musi być widoczne, żeby uznać go za obejrzany.
 *
 * 0,25 — sekcje strony głównej są wysokie, więc „w polu widzenia" ma znaczyć
 * „widać zawartość", a nie „wjechał górny piksel". Wszystkie sekcje, na których
 * ten hook jest używany, są niższe niż ekran 375×812, więc próg jest osiągalny.
 */
export const VIEW_THRESHOLD = 0.25;

/**
 * Woła `onView` raz, gdy element osiągnie próg widoczności.
 *
 * `onView` czytane z refa, więc funkcja przekazana inline nie restartuje
 * obserwatora przy każdym renderze rodzica.
 */
export function useViewOnce(
  ref: RefObject<HTMLElement | null>,
  onView: () => void,
  enabled = true,
): void {
  const sentRef = useRef(false);
  const onViewRef = useRef(onView);

  useEffect(() => {
    onViewRef.current = onView;
  }, [onView]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || sentRef.current) return;
    // Brak IntersectionObserver (stare WebView) = brak pomiaru ekspozycji.
    // Analityka nigdy nie może wywrócić strony.
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < VIEW_THRESHOLD || sentRef.current) continue;
          sentRef.current = true;
          io.disconnect();
          onViewRef.current();
        }
      },
      { threshold: VIEW_THRESHOLD },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled]);
}
