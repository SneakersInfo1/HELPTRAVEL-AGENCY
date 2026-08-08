"use client";

// Wysokość nagłówka serwisu jako zmienna CSS — jedno źródło prawdy dla
// wszystkiego, co się do niego przykleja.
//
// PROBLEM, KTÓRY TO ROZWIĄZUJE (zgłoszenie 2026-08-08: „pasek na górze przy
// scrollowaniu zjeżdża i nie daje wrażenia stabilności").
//
// Offsety były wpisane ręcznie w trzech miejscach i w trzech różnych
// wartościach: pasek wyszukiwania miał `top-[72px] sm:top-[84px]`, panel
// filtrów `lg:top-[148px]`, mapa `top-[9rem]`. Zmierzone w przeglądarce na
// 1920 px: nagłówek kończy się na 82 px, a pasek przykleja się na 84 px —
// czyli między nimi przez cały czas przewijania prześwitywał dwupikselowy
// pasek TREŚCI. Na telefonie rozjazd był w drugą stronę i pasek wchodził pod
// nagłówek. Każda zmiana wysokości logo albo paddingu nagłówka rozstraja to
// od nowa, bo liczby nie mają z nim żadnego związku.
//
// Teraz wysokość jest MIERZONA i publikowana jako `--ht-header-h`. Nagłówek
// jest wspólny dla całego serwisu, więc mierzymy jego realny prostokąt razem
// z górnym marginesem — pastylka ma `mt-2`, którego sama wysokość nie obejmuje.
//
// Komponent nic nie renderuje i niczego nie stylizuje poza tą jedną zmienną,
// więc nie może zepsuć żadnej innej strony.

import { useEffect } from "react";

export function HeaderOffsetProbe() {
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    const root = document.documentElement;
    let klatka = 0;
    const zmierz = () => {
      cancelAnimationFrame(klatka);
      klatka = requestAnimationFrame(() => {
        // `bottom` względem dokumentu przy przewinięciu na samą górę = górny
        // margines + wysokość. Liczymy z `offsetTop`, żeby wynik nie zależał
        // od tego, jak daleko strona jest właśnie przewinięta.
        const el = header as HTMLElement;
        const dol = el.offsetTop + el.offsetHeight;
        root.style.setProperty("--ht-header-h", `${Math.round(dol)}px`);
      });
    };

    zmierz();
    const ro = new ResizeObserver(zmierz);
    ro.observe(header);
    window.addEventListener("resize", zmierz);
    return () => {
      cancelAnimationFrame(klatka);
      ro.disconnect();
      window.removeEventListener("resize", zmierz);
      root.style.removeProperty("--ht-header-h");
    };
  }, []);

  return null;
}
