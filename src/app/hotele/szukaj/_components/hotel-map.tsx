"use client";

// Mapa wyników — widget mapy LiteAPI, dopasowany do HelpTravel.
//
// Decyzja właściciela (2026-08-06): korzystamy z gotowego widgetu dostawcy
// zamiast budować własną mapę na MapLibre. Zaleta: zero kosztu kafelków
// i zero dodatkowego klucza API. Cena: to jest komponent DOSTAWCY, więc
// dopasowujemy go tym, na co pozwala jego konfiguracja.
//
// Co robimy, żeby to była mapa HelpTravel, a nie obce okno:
//   • `currency: "PLN"` — wymóg wprost od właściciela; bez tego widget
//     pokazuje ceny w USD (na tym poległ wcześniej gotowy chatbot LiteAPI),
//   • `primaryColor` z palety marki (emerald-700) + kolory dymka,
//   • `labelsOverride` — widget NIE MA parametru języka, więc polskie napisy
//     wchodzą przez podmianę etykiet,
//   • `onHotelClick` — klik prowadzi na NASZĄ stronę hotelu z zachowaniem
//     dat i liczby gości. Bez tego gość wychodzi na domenę *.nuitee.link
//     i wypada z naszego lejka,
//   • `hideLogo` — to ma być sekcja HelpTravel.
//
// Skrypt ładujemy DOPIERO po otwarciu mapy (lazy), żeby nie obciążał
// pierwszego renderu listy (brief §10: „nie blokuj pierwszego renderu").

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SDK_SRC = "https://components.liteapi.travel/v1.0/sdk.umd.js";

// Kolory marki (te same tokeny co reszta sekcji hotelowej).
const BRAND = "#047857"; // emerald-700 — kontrast 4,83:1 na bieli (WCAG AA)

interface LiteApiSdk {
  init?: (config: { domain: string }) => void;
  Map?: {
    create: (config: Record<string, unknown>) => void;
  };
}

declare global {
  interface Window {
    LiteAPI?: LiteApiSdk;
  }
}

/**
 * Podmiana symbolu waluty i angielskich napisów w DOM widgetu.
 *
 * DLACZEGO TO W OGÓLE ISTNIEJE — zmierzone 2026-08-06 na żywym widgecie:
 *
 *   • `currency: "PLN"` DZIAŁA na poziomie kwot. Dowód: widget pokazał dla
 *     Madrytu 2125–6206, a LiteAPI dla tych samych dat zwraca w PLN 1153–11861
 *     i w USD 310–3186. Zakres pasuje do PLN, a górna wartość przekracza
 *     maksimum USD — więc to złotówki.
 *   • ALE widget rysuje przy nich symbol **`$`**, a interfejs zostaje po
 *     angielsku („Sep 15", „2 adults, 1 room", „Search"). Parametry
 *     `language` / `locale` / `lang` sprawdzone — nie robią nic.
 *     `labelsOverride` nie pokrywa tych napisów.
 *
 * „$ 2125" przy kwocie 2125 zł to nie kosmetyka: polski gość odczyta to jako
 * ~8500 zł. Zostawienie tego byłoby wprowadzaniem w błąd co do ceny — czyli
 * dokładnie tym, co ta przebudowa likwiduje w całym serwisie.
 *
 * Świadomy kompromis: poprawiamy DOM dostawcy z zewnątrz. Jest to KRUCHE —
 * zmiana struktury widgetu może to unieważnić. Dlatego działa wyłącznie
 * wewnątrz kontenera mapy, nie rusza niczego innego, a gdy przestanie
 * trafiać, najgorszym skutkiem jest powrót do stanu sprzed poprawki.
 * Docelowo: poprosić LiteAPI o obsługę waluty i języka w widgecie.
 */
// Skróty miesięcy — widget renderuje daty jako „Sep 15".
const MONTHS_PL: Record<string, string> = {
  jan: "sty", feb: "lut", mar: "mar", apr: "kwi", may: "maj", jun: "cze",
  jul: "lip", aug: "sie", sep: "wrz", oct: "paź", nov: "lis", dec: "gru",
};

// UWAGA na odstępy: widget wstawia PODWÓJNĄ spację („2 adults,  1 room"),
// dlatego wszędzie `\s+`, nigdy pojedyncza spacja. Zmierzone na żywym DOM.
const UI_PL: Array<[RegExp, string]> = [
  [/^Search$/i, "Szukaj"],
  [/^Search\s+this\s+area$/i, "Przeszukaj ten obszar"],
  [/^(\d+)\s+adults?,\s+(\d+)\s+rooms?$/i, "$1 os., $2 pok."],
  [/^(\d+)\s+adults?$/i, "$1 os."],
  [/^(\d+)\s+rooms?$/i, "$1 pok."],
  [/^View\s+hotel$/i, "Zobacz hotel"],
  [/^per\s+night$/i, "za noc"],
  [/^reviews?$/i, "opinii"],
  [/^Loading\.{0,3}$/i, "Wczytywanie…"],
  [/^No\s+results?$/i, "Brak wyników"],
  // „Sep 15" → „15 wrz" (polski szyk: dzień przed miesiącem).
  [/^([A-Z][a-z]{2})\s+(\d{1,2})$/, "__DATE__"],
];

function patchWidgetText(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const edits: Array<[Text, string]> = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const raw = text.nodeValue ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Sam symbol w osobnym węźle (tak renderuje go widget) → „zł".
    // Polska konwencja stawia walutę PO kwocie, ale symbol siedzi w oddzielnym
    // elemencie przed liczbą, więc przestawienie wymagałoby przebudowy węzłów
    // dostawcy. „zł 2125" jest jednoznaczne i nie kłamie — a to jest tu cel.
    if (trimmed === "$") {
      edits.push([text, raw.replace("$", "zł")]);
      continue;
    }
    // Symbol sklejony z kwotą („$2125").
    if (/^\$\s?[\d.,\s]+$/.test(trimmed)) {
      edits.push([text, raw.replace(/^\s*\$\s?/, "").trimEnd() + " zł"]);
      continue;
    }
    for (const [pattern, replacement] of UI_PL) {
      const m = pattern.exec(trimmed);
      if (!m) continue;
      if (replacement === "__DATE__") {
        const monthPl = MONTHS_PL[m[1].toLowerCase()];
        // Nieznany skrót miesiąca zostawiamy w spokoju — lepiej angielski
        // niż zniekształcona data.
        if (monthPl) edits.push([text, `${m[2]} ${monthPl}`]);
      } else {
        edits.push([text, trimmed.replace(pattern, replacement)]);
      }
      break;
    }
  }

  for (const [node, value] of edits) node.nodeValue = value;
}

let sdkPromise: Promise<void> | null = null;

/** Ładuje SDK raz na kartę. Kolejne otwarcia mapy korzystają z tej samej obietnicy. */
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("brak window"));
  if (window.LiteAPI?.Map) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("SDK się nie załadowało")));
      return;
    }
    const el = document.createElement("script");
    el.src = SDK_SRC;
    el.async = true;
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("SDK się nie załadowało")));
    document.head.appendChild(el);
  });
  return sdkPromise;
}

interface Props {
  /** Google Place ID kierunku — widget centruje mapę wyłącznie po nim. */
  placeId: string;
  checkin: string;
  checkout: string;
  /** Parametry wyszukiwania do przeniesienia na stronę hotelu. */
  searchQuery: string;
  /** Domena white-labelu LiteAPI (NEXT_PUBLIC_LITEAPI_WIDGET_DOMAIN). */
  domain: string;
}

export function HotelMap({ placeId, checkin, checkout, searchQuery, domain }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const observerRef = useRef<MutationObserver | null>(null);
  // Router i parametry wyszukiwania trzymamy w referencjach, żeby efekt
  // inicjalizujący mapę nie przepinał się przy każdej nawigacji — widget
  // montuje się RAZ i nie chcemy go przeładowywać.
  //
  // Aktualizacja idzie przez efekt, nie przez przypisanie w renderze:
  // zapis do refa w trakcie renderu jest w tym projekcie błędem lintu
  // (React Compiler: „Cannot access refs during render") i faktycznie
  // psułby renderowanie współbieżne.
  const routerRef = useRef(router);
  const queryRef = useRef(searchQuery);
  useEffect(() => {
    routerRef.current = router;
    queryRef.current = searchQuery;
  }, [router, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    loadSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const sdk = window.LiteAPI;
        if (!sdk?.Map) throw new Error("SDK bez modułu Map");

        sdk.init?.({ domain });
        sdk.Map.create({
          selector: "#helptravel-hotel-map",
          placeId,
          checkin,
          checkout,
          // Wymóg wprost: ceny w PLN. Bez tego widget pokazuje USD.
          currency: "PLN",
          primaryColor: BRAND,
          hideLogo: true,
          popup: {
            titleColor: "#171717",
            textColor: "#525252",
            backgroundColor: "#ffffff",
          },
          // Widget nie ma parametru języka — polskie napisy wchodzą tędy.
          labelsOverride: {
            searchButton: "Szukaj",
            searchThisArea: "Przeszukaj ten obszar",
            viewHotel: "Zobacz hotel",
            perNight: "za noc",
            reviews: "opinii",
            loading: "Wczytywanie…",
            noResults: "Brak obiektów w tym obszarze",
          },
          // Klik zostaje w HelpTravel: przechodzimy na naszą stronę hotelu
          // z zachowaniem dat i liczby gości. Bez tego gość ląduje na
          // *.nuitee.link i wypada z naszego lejka.
          onHotelClick: (hotel: { hotelId?: string; id?: string }) => {
            const id = hotel?.hotelId ?? hotel?.id;
            if (!id) return;
            routerRef.current.push(`/hotele/${encodeURIComponent(id)}?${queryRef.current}`);
          },
        });
        if (!cancelled) setStatus("ready");

        // Widget dorysowuje markery asynchronicznie i przy każdym ruchu mapy,
        // więc jednorazowa podmiana nie wystarczy — obserwujemy zmiany.
        const root = containerRef.current;
        if (root) {
          patchWidgetText(root);
          const observer = new MutationObserver(() => patchWidgetText(root));
          observer.observe(root, { childList: true, subtree: true, characterData: true });
          observerRef.current = observer;
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [placeId, checkin, checkout, domain]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
      <div id="helptravel-hotel-map" ref={containerRef} className="h-[70vh] min-h-[420px] w-full" />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-sm text-neutral-600">
          Wczytywanie mapy…
        </div>
      )}

      {/* Awaria dostawcy NIE może zabrać wyników — lista jest obok, na tej
          samej stronie, a tu mówimy wprost, co się stało (brief §10). */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 px-6 text-center">
          <p className="text-sm font-medium text-neutral-800">Nie udało się wczytać mapy</p>
          <p className="text-sm text-neutral-600">
            Wszystkie obiekty znajdziesz na liście — przełącz widok powyżej.
          </p>
        </div>
      )}
    </div>
  );
}
