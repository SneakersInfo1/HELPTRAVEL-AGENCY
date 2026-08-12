"use client";

// Mapa wyników — WŁASNA (MapLibre GL + kafelki Geoapify przez nasze proxy).
//
// DLACZEGO NIE WIDGET LITEAPI. Poprzednia sesja osadziła tu gotowy widget
// `components.liteapi.travel`. Wyglądał znośnie, ale ma własną pulę hoteli
// i własną wyszukiwarkę, więc trzy rzeczy z briefu §13 były na nim FIZYCZNIE
// niewykonalne: synchronizacja marker↔karta, zachowanie naszych filtrów
// i „przeszukaj ten obszar" na NASZYCH wynikach. Do tego walutę i język
// trzeba było podmieniać w cudzym DOM-ie przez MutationObserver — rozwiązanie,
// które każda ich aktualizacja mogła wywrócić bez ostrzeżenia.
//
// KLUCZ. Mapa nie potrzebuje nowego konta: `GEOAPIFY_API_KEY` jest w projekcie
// od dawna (Geoapify figuruje też w polityce prywatności jako podmiot
// przetwarzający). Klucz zostaje po stronie serwera — kafelki idą przez
// /api/map/tiles, bo repozytorium jest publiczne.
//
// WYDAJNOŚĆ (brief §29 i §33). `maplibre-gl` waży ~200 kB gzip i NIE MOŻE
// obciążać widoku listy. Import jest dynamiczny i dzieje się dopiero przy
// pierwszym otwarciu mapy; CSS biblioteki też (`import("maplibre-gl/dist/…")`).
//
// SKALA. Kierunek potrafi mieć 2000 hoteli. Nie wstawiamy 2000 znaczników:
// widoczne punkty są przycinane do kadru i grupowane w siatce pikselowej,
// więc w DOM jest ~150 elementów niezależnie od wielkości puli.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

import { formatPLN } from "@/lib/money";

export interface MapPoint {
  hotelId: string;
  name: string;
  lat: number;
  lng: number;
  /** Cena całego pobytu. `null` = jeszcze nie znamy → znacznik neutralny. */
  totalAmount: number | null;
  currency: string;
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Props {
  points: MapPoint[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (hotelId: string | null) => void;
  onHoverMarker: (hotelId: string | null) => void;
  /** `null` = użytkownik czyści ograniczenie do obszaru. */
  onSearchArea: (bounds: MapBounds | null) => void;
  /** Czy lista jest AKTUALNIE ograniczona do obszaru (steruje treścią CTA). */
  areaActive: boolean;
  className?: string;
}

// Komórka siatki grupującej — PROSTOKĄTNA, nie kwadratowa.
//
// Pierwsza wersja używała kwadratu 56 px i wyglądała dobrze na zrzucie, ale
// test E2E wyłapał, że pigułka „1 234 zł" ma realnie ~90-110 px szerokości:
// znaczniki z sąsiednich komórek nachodziły na siebie i jeden PRZECHWYTYWAŁ
// kliknięcie w drugi. Playwright zgłosił to wprost („intercepts pointer
// events"), a dla gościa wyglądałoby to jak mapa, która otwiera nie ten hotel,
// w który celował. Wymiary komórki muszą odpowiadać wymiarom pigułki.
//
// PODNIESIONE 2026-08-08. Na zrzutach właściciela znaczniki nadal na siebie
// nachodziły („16 od 576 zł" pod „od 428 zł"). Przyczyna: komórka miała
// DOKŁADNIE wymiar pigułki, więc dwie sąsiednie stykały się krawędziami —
// a znacznik jest wyśrodkowany na punkcie, czyli wystaje o pół szerokości
// poza swoją komórkę. Komórka musi być szersza od pigułki o zapas na tę
// połówkę, inaczej stykanie się jest matematycznie nieuniknione.
const CLUSTER_X = 132;
const CLUSTER_Y = 56;
/** Sufit znaczników w DOM. Powyżej i tak nie da się w nic trafić palcem. */
const MAX_MARKERS = 150;

type Cell = { key: string; lat: number; lng: number; items: MapPoint[] };

/**
 * Czy punkt nadaje się na mapę.
 *
 * `Number.isFinite` nie wystarcza: dostawca potrafi zwrócić szerokość spoza
 * zakresu (widziane w danych „sparse"), a `LngLatBounds.contains` rzuca wtedy
 * wyjątkiem — w środku `useMemo`, czyli podczas renderu, co kończy się białym
 * ekranem zamiast brakującym znacznikiem. Sprawdzamy OBA pola i oba zakresy.
 *
 * `0,0` odrzucamy świadomie: to Zatoka Gwinejska i w praktyce zawsze znaczy
 * „dostawca nie podał współrzędnych", a nie hotel na środku oceanu.
 */
function prawidloweWspolrzedne(p: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

export function HotelMap({
  points,
  selectedId,
  hoveredId,
  onSelect,
  onHoverMarker,
  onSearchArea,
  areaActive,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, MapLibreMarker>>(new Map());
  /** Aktualna zawartość komórek — czytana przez obsługiwacze zdarzeń. */
  const cellsRef = useRef<Map<string, Cell>>(new Map());
  /** Czy gość sam ruszył mapą. Od tego momentu kadr jest jego. */
  const userMovedRef = useRef(false);
  /** Zaznaczenie czytane poza cyklem renderu — patrz memo `cells`. */
  const wyborRef = useRef({ selectedId, hoveredId });
  useLayoutEffect(() => {
    wyborRef.current = { selectedId, hoveredId };
  }, [selectedId, hoveredId]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  /** Rośnie przy każdym końcu ruchu mapy — wymusza przeliczenie znaczników. */
  const [viewTick, setViewTick] = useState(0);

  // Callbacki w ref: efekt tworzący mapę ma pustą listę zależności (mapa
  // powstaje RAZ), a bez tego trzymałby pierwsze wersje funkcji na zawsze.
  //
  // Aktualizacja w `useLayoutEffect`, NIE w ciele renderu. Zapis do refa
  // podczas renderu jest w tym repo błędem lintu (`react-hooks/refs`) i ma
  // konkretny powód: przy renderze współbieżnym React może przerwać i odrzucić
  // render, a zapis do refa już się wykonał — obsługiwacz zobaczyłby wtedy
  // callback z przebiegu, który nigdy nie trafił na ekran.
  const cb = useRef({ onSelect, onHoverMarker });
  useLayoutEffect(() => {
    cb.current = { onSelect, onHoverMarker };
  }, [onSelect, onHoverMarker]);

  // Środek startowy liczony ze średniej punktów — bez tego mapa startuje
  // nad Atlantykiem i gość widzi wodę zamiast hoteli.
  const initialCenter = useMemo<[number, number]>(() => {
    const withCoords = points.filter(prawidloweWspolrzedne);
    if (!withCoords.length) return [0, 0];
    const lat = withCoords.reduce((s, p) => s + p.lat, 0) / withCoords.length;
    const lng = withCoords.reduce((s, p) => s + p.lng, 0) / withCoords.length;
    return [lng, lat];
  }, [points]);

  // ── Utworzenie mapy (raz) ────────────────────────────────────────────────
  //
  // ZASADA PO FORENSYCE 2026-08-11: komponent NIGDY nie ma prawa zostać
  // w stanie „ani mapy, ani komunikatu".
  //
  // Zmierzone na produkcyjnym buildzie (30 × lista↔mapa + 10 × mapa→hotel→
  // Wstecz): 50 kontekstów WebGL utworzonych, 50 zwolnionych, zero osieroconych
  // canvasów, zero pustych map — cykl życia MapLibre jest tu czysty i to NIE
  // BYŁA przyczyna zgłoszenia (`Map.remove()` w maplibre-gl v6 sam woła
  // `WEBGL_lose_context.loseContext()`; sprawdzone w źródle w node_modules).
  //
  // Zostają jednak trzy ścieżki, na których gość zobaczyłby wieczny szkielet
  // zamiast mapy albo komunikatu, i one są tu domykane:
  //   1. `styledata` nie dochodzi (odrzucony styl, zabity kontekst, zawieszony
  //      wątek) → `ready` na zawsze `false`;
  //   2. kontener znika między pobraniem paczki a utworzeniem mapy → cichy
  //      `return` bez ustawienia `failed`;
  //   3. przeglądarka odbiera kontekst WebGL już DZIAŁAJĄCEJ mapie
  //      (`webglcontextlost`) → canvas zostaje, ale nic nie rysuje.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let odepnijGesty: (() => void) | null = null;
    /** Czy mapa zdążyła zgłosić `styledata` — rozdziela błędy startu od kafelków. */
    let wystartowala = false;
    // Czuwak: jeżeli w tym czasie mapa nie zgłosi gotowości, pokazujemy
    // uczciwy komunikat awaryjny. 12 s to wielokrotność zmierzonego czasu do
    // `styledata` (~0,9 s) — próg ma łapać ZAWIESZENIE, nie wolne łącze.
    let czuwak: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      czuwak = null;
      if (!cancelled) setFailed(true);
    }, 12_000);
    const rozbrojCzuwak = () => {
      if (czuwak !== null) clearTimeout(czuwak);
      czuwak = null;
    };
    // Kopia referencji do sprzątania: `markersRef.current` może wskazywać
    // inną mapę w chwili odmontowania, a wtedy cleanup zostawiłby znaczniki
    // (wyciek + „duchy" po przełączeniu widoku).
    const liveMarkers = markersRef.current;

    void (async () => {
      try {
        const [{ Map: GlMap, NavigationControl, AttributionControl }] = await Promise.all([
          import("maplibre-gl"),
          // CSS biblioteki — bez niego kontrolki i canvas mają zerowe wymiary.
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled) return;
        if (!containerRef.current) {
          // Kontener zniknął, a komponent NIE został odmontowany. Bez tego
          // `return` zostawiał wieczny szkielet: ani mapy, ani błędu.
          rozbrojCzuwak();
          setFailed(true);
          return;
        }

        map = new GlMap({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              geoapify: {
                type: "raster",
                // Kafelki 512 px (`@2x`) zamiast 256 px. Ta sama powierzchnia
                // mapy to wtedy CZTERY RAZY mniej żądań (9 zamiast ~35 na
                // ekran 1920×1080) — a przy zmierzonych 0,39–0,69 s na kafelek
                // przez to proxy właśnie liczba żądań, nie ich waga, decydowała
                // o tym, jak długo w mapie widać białe dziury. Przeglądarka i
                // tak zwalnia po ~6 równoległych połączeniach na host.
                //
                // ZMIERZONE A/B (2026-08-08, ten sam kierunek, ten sam serwer,
                // czas od kliknięcia „Mapa" do ostatniego kafelka):
                //   256 px → 5943 ms
                //   512 px → 2761–2955 ms
                // To jest te „około 5 sekund" ze zgłoszenia właściciela.
                //
                // `tileSize: 512` jest tu OBOWIĄZKOWE, nie kosmetyczne: mówi
                // MapLibre, że kafelek zajmuje 512 px ekranu, więc biblioteka
                // pobiera o jeden poziom przybliżenia mniej. Bez tego mapa
                // byłaby przybliżona o jeden poziom za mocno.
                tiles: [`${window.location.origin}/api/map/tiles/{z}/{x}/{y}@2x.png`],
                tileSize: 512,
                maxzoom: 18,
                // Atrybucja jest warunkiem licencji OSM/Geoapify. Nie usuwać.
                attribution:
                  '© <a href="https://www.geoapify.com/">Geoapify</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
              },
            },
            layers: [{ id: "geoapify", type: "raster", source: "geoapify" }],
          },
          center: initialCenter,
          zoom: 11,
          // Obrót i pochylenie tylko mylą przy wyborze hotelu.
          dragRotate: false,
          pitchWithRotate: false,
          attributionControl: false,
        });

        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new AttributionControl({ compact: true }), "bottom-right");

        // `ready` na `styledata`, NIE na `load`.
        //
        // `load` odpala się dopiero, gdy dojdą PIERWSZE KAFELKI. Zmierzone:
        // canvas istniał po 921 ms, a znaczniki pojawiały się po 3035 ms —
        // przez te dwie sekundy nakładka „Wczytuję mapę…" przykrywała
        // działającą już mapę. Gość widział wielki pusty panel i miał prawo
        // uznać, że funkcja jest zepsuta.
        //
        // `styledata` odpala się po sparsowaniu stylu, czyli wtedy, gdy
        // `project()` i `getBounds()` już działają — a to wszystko, czego
        // potrzebują znaczniki. Kafelki dociągają się w tle, pod nimi.
        map.once("styledata", () => {
          wystartowala = true;
          rozbrojCzuwak();
          if (!cancelled) setReady(true);
        });
        // Styl odrzucony przez walidator kończy się zdarzeniem `error`,
        // a NIE `styledata` (sprawdzone w źródle: `Style._load` przy błędzie
        // walidacji wychodzi PRZED wysłaniem `styledata`). Bez tego nasłuchu
        // MapLibre tylko wypisywał błąd do konsoli, a gość patrzył na
        // pulsujący szkielet bez końca.
        //
        // Liczą się WYŁĄCZNIE błędy sprzed startu. Po starcie `error` znaczy
        // najczęściej niedociągnięty kafelek — mapa działa, a przewracanie jej
        // wtedy w komunikat awaryjny byłoby lekarstwem gorszym od choroby.
        map.on("error", () => {
          if (cancelled || wystartowala) return;
          rozbrojCzuwak();
          setFailed(true);
        });
        // Przeglądarka może odebrać kontekst WebGL DZIAŁAJĄCEJ mapie (limit
        // kontekstów, uśpiona karta, reset sterownika). Canvas zostaje wtedy
        // w drzewie, ale nie rysuje nic — czyli dokładnie „pusta mapa".
        // MapLibre sam tego nie odzyskuje, więc mówimy o tym wprost.
        map.getCanvas().addEventListener("webglcontextlost", () => {
          if (!cancelled) setFailed(true);
        });
        map.on("moveend", () => {
          if (cancelled) return;
          // „Szukaj w tym obszarze" ma się pokazać tylko wtedy, gdy to GOŚĆ
          // przesunął mapę. Nasze własne dopasowanie kadru też kończy się
          // `moveend`, a przycisk po nim byłby myląco bezcelowy.
          if (userMovedRef.current) setMoved(true);
          setViewTick((t) => t + 1);
        });

        // Pierwszy gest gościa oddaje mu kadr na stałe. Nasłuch na kontenerze,
        // a nie na zdarzeniach mapy: `movestart` odpala się także przy naszym
        // `fitBounds`/`easeTo`, więc nie da się z niego odróżnić, kto ruszył.
        const przejmij = () => {
          userMovedRef.current = true;
        };
        const el = containerRef.current;
        el?.addEventListener("pointerdown", przejmij, { passive: true });
        el?.addEventListener("wheel", przejmij, { passive: true });
        odepnijGesty = () => {
          el?.removeEventListener("pointerdown", przejmij);
          el?.removeEventListener("wheel", przejmij);
        };
        // Klik w tło = odznaczenie. Bez tego dymek zostaje na ekranie
        // i zasłania mapę, dopóki gość nie trafi w inny znacznik.
        map.on("click", () => cb.current.onSelect(null));

        mapRef.current = map;
      } catch {
        // Sprzątamy TU, a nie licząc na cleanup efektu. Gdy wyjątek poleci po
        // `new GlMap`, komponent zostaje zamontowany (pokazuje komunikat
        // awaryjny), więc cleanup się NIE uruchomi — a kontekst WebGL, worker
        // kafelków i nasłuchy zostałyby żywe do odmontowania całej strony.
        sprzataj();
        rozbrojCzuwak();
        if (!cancelled) setFailed(true);
      }
    })();

    /** Idempotentne zwolnienie zasobów mapy. Wołane z `catch` i z cleanupu. */
    function sprzataj() {
      odepnijGesty?.();
      odepnijGesty = null;
      // Kolejność ma znaczenie: znaczniki trzymają referencje do mapy.
      for (const m of liveMarkers.values()) {
        try {
          m.remove();
        } catch {
          // Znacznik po zabranym kontekście potrafi rzucić przy odpinaniu.
        }
      }
      liveMarkers.clear();
      cellsRef.current.clear();
      // `remove()` na mapie, która nie zdążyła dostać kontekstu, potrafi
      // rzucić — a wtedy DALSZE linie (zerowanie refów) nigdy by się nie
      // wykonały i następna instancja zastałaby wskaźnik na trupa.
      try {
        map?.remove();
      } catch {
        // Zwolnienie zasobów jest best-effort; poprawność stanu nie jest.
      }
      map = null;
      mapRef.current = null;
    }

    return () => {
      cancelled = true;
      rozbrojCzuwak();
      sprzataj();
    };
    // Celowo raz: `initialCenter` przy pustej puli byłby [0,0], a po dojściu
    // cen zmiana środka wyrwałaby mapę spod palca. Dopasowanie kadru do
    // punktów robi osobny efekt niżej.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dopasowanie kadru do puli ────────────────────────────────────────────
  //
  // Historia tego miejsca to dwa przeciwne błędy i jedna reguła pośrodku.
  //
  // 1. „Dopasuj raz" — mapa łapała kilkanaście hoteli, które akurat zdążyły
  //    się wycenić, i zostawała na tym wycinku (4 znaczniki przy 44 wynikach).
  // 2. „Dopasuj przy każdej zmianie punktów" — ceny dojeżdżają strumieniem
  //    przez kilkanaście sekund, więc mapa PRZEKADROWYWAŁA SIĘ kilkadziesiąt
  //    razy z rzędu. To jest zgłoszone „mapa ładuje się 5 sekund" dla
  //    Heraklionu: mapa była gotowa od początku, tylko wciąż uciekała.
  //
  // Reguła: kadrujemy, gdy gość NIE MIAŁBY NA CO PATRZEĆ — czyli przy
  // pierwszym dopasowaniu oraz wtedy, gdy w bieżącym kadrze nie został ani
  // jeden punkt (np. po zmianie filtrów). W każdej innej sytuacji kadr
  // zostaje tam, gdzie jest. Po pierwszym geście gościa nie ruszamy go nigdy.
  const dopasowanoRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || userMovedRef.current) return;
    const withCoords = points.filter(prawidloweWspolrzedne);
    if (withCoords.length === 0) return;

    if (dopasowanoRef.current) {
      const b = map.getBounds();
      const widoczne = withCoords.some((p) => b.contains([p.lng, p.lat]));
      if (widoczne) return; // jest na co patrzeć — nie wyrywamy kadru
    }
    dopasowanoRef.current = true;

    // Jeden punkt: `fitBounds` na zerowym prostokącie daje maksymalne
    // przybliżenie, więc ustawiamy środek wprost. Bez tego przypadku
    // wyszukiwanie zawężone do jednego hotelu zostawiało mapę tam, gdzie
    // otworzyła się przy starcie — czyli nad zupełnie innym miejscem.
    if (withCoords.length === 1) {
      map.jumpTo({ center: [withCoords[0].lng, withCoords[0].lat], zoom: 14 });
      setMoved(false);
      return;
    }

    const lats = withCoords.map((p) => p.lat);
    const lngs = withCoords.map((p) => p.lng);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 56, maxZoom: 14, animate: false },
    );
    // Dopasowanie samo w sobie nie jest „ruchem użytkownika", więc nie
    // pokazujemy po nim przycisku „Szukaj w tym obszarze".
    setMoved(false);
  }, [ready, points]);

  // ── Reakcja na zmianę rozmiaru kontenera ─────────────────────────────────
  //
  // MapLibre mierzy kontener przy tworzeniu i potem NIE pilnuje go sam; nasłuch
  // na `window.resize` nie wystarcza, bo kontener mapy zmienia rozmiar także
  // wtedy, gdy okno stoi w miejscu: znika sidebar filtrów, dochodzi pasek
  // szybkich filtrów, wjeżdża podgląd wybranego obiektu, zmienia się liczba
  // linii nagłówka. Bez `resize()` canvas zostaje w starym rozmiarze, a mapa
  // ma wtedy niepokryty pas — dokładnie ten biały prostokąt w prawym górnym
  // rogu ze zrzutu właściciela („niedoładowana / źle wykadrowana mapa").
  // Obserwujemy TEN SAM element, który dostał MapLibre jako `container`
  // (`containerRef`), a nie zewnętrzną ramkę — inaczej mierzylibyśmy pudełko,
  // które nie musi zmieniać się razem z canvasem.
  //
  // ZOOM PRZEGLĄDARKI to drugi, osobny tor. Zmiana zoomu zmienia
  // `devicePixelRatio`, czyli rozdzielczość BUFORA canvasa, nawet gdy jego
  // rozmiar w pikselach CSS zostaje ten sam. Sam `ResizeObserver` tego nie
  // widzi, bo obserwuje wymiary CSS. Bez reakcji na tę zmianę mapa zostawała
  // z buforem policzonym dla starego DPR i robiła się rozmyta albo — przy
  // zmniejszeniu — rysowała się na części kontenera.
  //
  // `matchMedia("(resolution: …dppx)")` to jedyny sposób, żeby dostać
  // ZDARZENIE przy zmianie DPR; nasłuch trzeba zakładać od nowa po każdej
  // zmianie, bo zapytanie jest przypięte do konkretnej wartości.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready || typeof ResizeObserver === "undefined") return;
    let klatka = 0;
    const przelicz = () => {
      // Jedna aktualizacja na klatkę: obserwator potrafi odpalić kilka razy
      // w trakcie jednej animacji układu, a `resize()` przelicza projekcję.
      cancelAnimationFrame(klatka);
      klatka = requestAnimationFrame(() => mapRef.current?.resize());
    };

    const ro = new ResizeObserver(przelicz);
    ro.observe(el);

    let mq: MediaQueryList | null = null;
    const odepnijDpr = () => mq?.removeEventListener("change", naZmianeDpr);
    function naZmianeDpr() {
      odepnijDpr();
      przelicz();
      podepnijDpr();
    }
    function podepnijDpr() {
      if (typeof window.matchMedia !== "function") return;
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener("change", naZmianeDpr);
    }
    podepnijDpr();

    return () => {
      cancelAnimationFrame(klatka);
      ro.disconnect();
      odepnijDpr();
    };
  }, [ready]);

  // ── Grupowanie w siatce pikselowej ───────────────────────────────────────
  // Liczone w układzie EKRANU, nie geograficznym: dwa hotele odległe o 20 m
  // mają się złączyć przy dalekim zoomie i rozjechać przy bliskim, a tylko
  // rzut na piksele daje to naturalnie.
  const cells = useMemo<Cell[]>(() => {
    const map = mapRef.current;
    if (!map || !ready) return [];
    void viewTick; // przelicz po każdym ruchu mapy

    const bounds = map.getBounds();

    /** Jedno przejście grupujące przy zadanym rozmiarze komórki. */
    const pogrupuj = (skala: number): Cell[] => {
      const buckets = new Map<string, Cell>();
      for (const p of points) {
        if (!prawidloweWspolrzedne(p)) continue;
        if (!bounds.contains([p.lng, p.lat])) continue;
        const pt = map.project([p.lng, p.lat]);
        const key = `${Math.round(pt.x / (CLUSTER_X * skala))}:${Math.round(pt.y / (CLUSTER_Y * skala))}`;
        const cell = buckets.get(key);
        if (cell) cell.items.push(p);
        else buckets.set(key, { key, lat: p.lat, lng: p.lng, items: [p] });
      }

      // Reprezentant komórki liczony DETERMINISTYCZNIE, a nie „pierwszy, który
      // wpadł". To była realna przyczyna zgłoszenia „znacznik ucieka spod
      // kursora": kolejność `points` zmienia się przy KAŻDEJ dochodzącej
      // cenie (lista przelicza sortowanie), więc pierwszy element komórki
      // bywał raz jednym, raz drugim hotelem — i znacznik przeskakiwał
      // o kilkadziesiąt pikseli, choć na mapie nic się nie wydarzyło.
      // Zmierzone przed poprawką: przesunięcie 46×43 px po kliknięciu.
      //
      // Klucz porządku: hotelId. Nie cena — ta dochodzi strumieniem, więc
      // sortowanie po niej miałoby dokładnie tę samą wadę.
      for (const cell of buckets.values()) {
        if (cell.items.length === 1) continue;
        const reprezentant = cell.items.reduce((a, b) => (a.hotelId <= b.hotelId ? a : b));
        cell.lat = reprezentant.lat;
        cell.lng = reprezentant.lng;
      }
      return [...buckets.values()];
    };

    // Przy nadmiarze POWIĘKSZAMY komórkę i grupujemy ponownie, zamiast ucinać
    // listę.
    //
    // Wersja z `slice(0, MAX_MARKERS)` po posortowaniu wg gęstości miała realną
    // wadę (znalezione w niezależnym review): przy 2000 rozproszonych hoteli
    // większość komórek ma dokładnie jeden obiekt, więc sortowanie nie miało
    // czego rozstrzygać i zostawało arbitralne 150 pierwszych — razem z
    // ryzykiem, że wypadnie z nich WŁAŚNIE ten hotel, który gość zaznaczył.
    // Powiększanie siatki zachowuje wszystkie obiekty, tylko w większych
    // paczkach — a paczkę można rozwinąć kliknięciem.
    let cells = pogrupuj(1);
    for (let skala = 1.6; cells.length > MAX_MARKERS && skala <= 8; skala *= 1.6) {
      cells = pogrupuj(skala);
    }

    // Ostatnia deska ratunku: gdyby nawet przy ośmiokrotnej komórce było za
    // gęsto, tniemy — ale NIGDY nie usuwamy komórki z zaznaczonym ani
    // wskazanym obiektem, bo zniknąłby dymek podglądu.
    if (cells.length > MAX_MARKERS) {
      // Zaznaczenie czytamy z REFA, nie z propsa. Gdyby `selectedId`
      // i `hoveredId` weszły do zależności tego memo, każde najechanie myszą
      // na kartę przeliczałoby rzut wszystkich 2000 punktów — lekarstwo
      // gorsze od choroby.
      const chronione = new Set(
        [wyborRef.current.selectedId, wyborRef.current.hoveredId].filter(Boolean) as string[],
      );
      const trzymaj = (c: Cell) => c.items.some((i) => chronione.has(i.hotelId));
      const musi = cells.filter(trzymaj);
      const reszta = cells
        .filter((c) => !trzymaj(c))
        .sort((a, b) => b.items.length - a.items.length)
        .slice(0, Math.max(0, MAX_MARKERS - musi.length));
      cells = [...musi, ...reszta];
    }
    return cells;
  }, [points, ready, viewTick]);

  // ── Synchronizacja znaczników z komórkami ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    void (async () => {
      const { Marker } = await import("maplibre-gl");
      if (cancelled || !mapRef.current) return;

      const live = markersRef.current;
      const wanted = new Set(cells.map((c) => c.key));
      for (const [key, marker] of live) {
        if (!wanted.has(key)) {
          marker.remove();
          live.delete(key);
        }
      }

      // Aktualny stan komórek POD KLUCZEM. Obsługiwacze zdarzeń czytają stąd,
      // a nie z domknięcia.
      //
      // BŁĄD, KTÓRY TO NAPRAWIA (wyłapany testem E2E 2026-08-07): istniejącym
      // znacznikom podmienialiśmy tylko treść i klasy, więc zostawały przy
      // obsługiwaczu z chwili UTWORZENIA. Gdy komórka zmieniła się z grupy
      // w pojedynczy obiekt — a dzieje się to za każdym przybliżeniem i przy
      // każdej zmianie filtrów — znacznik wyglądał jak pojedynczy hotel
      // z ceną, ale po kliknięciu dalej PRZYBLIŻAŁ mapę. Dla gościa: „klikam
      // hotel, a strona tylko się przybliża i nic nie wybiera".
      for (const c of cells) cellsRef.current.set(c.key, c);
      for (const key of [...cellsRef.current.keys()]) {
        if (!wanted.has(key)) cellsRef.current.delete(key);
      }

      for (const cell of cells) {
        const el = buildMarkerEl(cell, wyborRef.current.selectedId, wyborRef.current.hoveredId);
        const key = cell.key;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const current = cellsRef.current.get(key);
          if (!current) return;
          // Grupa: przybliż zamiast wybierać przypadkowy hotel z paczki.
          if (current.items.length > 1) {
            map.easeTo({
              center: [current.lng, current.lat],
              zoom: Math.min(18, map.getZoom() + 2),
            });
            return;
          }
          cb.current.onSelect(current.items[0].hotelId);
        });
        el.addEventListener("mouseenter", () => {
          const current = cellsRef.current.get(key);
          cb.current.onHoverMarker(
            current && current.items.length === 1 ? current.items[0].hotelId : null,
          );
        });
        el.addEventListener("mouseleave", () => cb.current.onHoverMarker(null));

        const existing = live.get(cell.key);
        if (existing) {
          // Podmiana samej zawartości — tworzenie Markera od nowa przy każdym
          // najechaniu myszą powodowało miganie całej warstwy.
          //
          // UWAGA: `className = …` skasowałoby klasę `maplibregl-marker`,
          // którą biblioteka dokłada przy tworzeniu znacznika. Pozycja
          // przetrwałaby (siedzi w stylu inline), ale reguły biblioteki na
          // zdarzenia wskaźnika i warstwy — już nie. Stąd `setAttribute`
          // z jawnie zachowaną klasą biblioteki.
          const node = existing.getElement();
          node.replaceChildren(...el.childNodes);
          node.setAttribute("class", `maplibregl-marker ${el.className}`);
          node.setAttribute("aria-label", el.getAttribute("aria-label") ?? "");
          node.dataset.kind = el.dataset.kind ?? "";
          if (el.dataset.hotelId) node.dataset.hotelId = el.dataset.hotelId;
          else delete node.dataset.hotelId;
          // Reprezentant komórki mógł się zmienić (inny hotel wypadł pierwszy
          // po zmianie sortowania albo filtrów) — bez tego znacznik zostawał
          // w starym punkcie i wskazywał nie ten obiekt, co pokazuje.
          existing.setLngLat([cell.lng, cell.lat]);
        } else {
          live.set(cell.key, new Marker({ element: el }).setLngLat([cell.lng, cell.lat]).addTo(map));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Zaznaczenie ŚWIADOMIE poza zależnościami — zmienia tylko kolor, a tym
    // zajmuje się osobny, tani efekt niżej. Czytamy je z `wyborRef`, więc
    // reguła zależności nie ma tu nic do zgłoszenia.
  }, [cells, ready]);

  // ── Podświetlenie: sam kolor, bez przebudowy warstwy ─────────────────────
  //
  // Wcześniej zaznaczenie i najechanie były w zależnościach efektu wyżej,
  // więc KAŻDY ruch myszy po liście budował od nowa do 150 przycisków i trzy
  // razy tyle obsługiwaczy zdarzeń — tylko po to, żeby jeden znacznik zmienił
  // kolor. Tutaj zmieniamy wyłącznie atrybut `class` istniejących węzłów.
  useEffect(() => {
    if (!ready) return;
    for (const [key, marker] of markersRef.current) {
      const cell = cellsRef.current.get(key);
      if (!cell) continue;
      const node = marker.getElement();
      node.setAttribute("class", `maplibregl-marker ${markerClass(cell, selectedId, hoveredId)}`);
    }
  }, [selectedId, hoveredId, ready, cells]);

  // Wybrany hotel spoza kadru — dosuwamy mapę, ale bez skoków zoomu.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) return;
    const p = points.find((x) => x.hotelId === selectedId);
    if (!p || !prawidloweWspolrzedne(p)) return;
    if (map.getBounds().contains([p.lng, p.lat])) return;
    map.easeTo({ center: [p.lng, p.lat], duration: 400 });
  }, [selectedId, points, ready]);

  const searchHere = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    onSearchArea({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    setMoved(false);
  }, [onSearchArea]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-neutral-100 p-6 text-center ${className}`}>
        <p className="text-sm text-neutral-600">
          Nie udało się wczytać mapy. Lista wyników działa normalnie.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-neutral-100 ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {/* „Przeszukaj ten obszar" — pojawia się DOPIERO po ruchu mapy (brief
          §13E: nie odpytujemy przy każdym pikselu przesunięcia). Filtrowanie
          jest lokalne: pula kierunku jest już w pamięci przeglądarki razem
          ze współrzędnymi, więc nie ma tu żadnego zapytania do dostawcy. */}
      {ready && (moved || areaActive) && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center gap-2 px-3">
          {moved && (
            <button
              type="button"
              onClick={searchHere}
              className="pointer-events-auto inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-emerald-800 shadow-lg ring-1 ring-emerald-900/10 transition hover:bg-emerald-50"
            >
              Szukaj w tym obszarze
            </button>
          )}
          {areaActive && (
            <button
              type="button"
              onClick={() => {
                onSearchArea(null);
                setMoved(false);
              }}
              className="pointer-events-auto inline-flex h-10 items-center rounded-full bg-neutral-900/85 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-neutral-900"
            >
              Pokaż cały kierunek
            </button>
          )}
        </div>
      )}

      {/* Szkielet, nie komunikat. Wielki pusty panel z napisem „Wczytuję
          mapę…" czytał się jak awaria; zarys kontrolek i delikatny puls
          mówią „to się właśnie buduje". Znika płynnie, gdy styl jest gotowy —
          czyli po ~0,9 s zamiast po 3 s (patrz komentarz przy `styledata`). */}
      <div
        aria-hidden={ready}
        className={`pointer-events-none absolute inset-0 bg-neutral-100 transition-opacity duration-500 motion-reduce:transition-none ${
          ready ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-100 via-neutral-200/60 to-neutral-100 motion-reduce:animate-none" />
        <div className="absolute right-3 top-3 h-16 w-8 rounded-md bg-white/70 shadow-sm" />
        <div className="absolute bottom-3 right-3 h-4 w-40 rounded bg-white/60" />
        <span className="sr-only" role="status">
          Wczytuję mapę
        </span>
      </div>
    </div>
  );
}

/**
 * Klasy znacznika — jedyne, co zmienia się przy zaznaczeniu i najechaniu.
 *
 * WARSTWY. Pigułka z ceną ma ~90-110 px szerokości, więc w gęstym centrum
 * sąsiednie znaczniki NIEUCHRONNIE się stykają — tak działa każda mapa
 * hotelowa i nie da się tego usunąć bez przesuwania obiektów z ich
 * prawdziwych współrzędnych, na co na mapie nie ma zgody.
 *
 * Kluczowa zasada: znacznik pod kursorem ZAWSZE wychodzi na wierzch.
 * Pierwsza wersja stawiała grupy nad pojedynczymi obiektami (dla czytelności
 * licznika) i to był błąd — grupa systematycznie przykrywała hotel obok,
 * więc części obiektów nie dało się kliknąć.
 */
function markerClass(cell: Cell, selectedId: string | null, hoveredId: string | null): string {
  const active =
    cell.items.length === 1 &&
    (cell.items[0].hotelId === selectedId || cell.items[0].hotelId === hoveredId);
  return [
    // `min-h-9` (36 px) + większy padding: cel dotykowy zamiast pigułki 24 px.
    // WCAG 2.2 AA chce 44 px, ale na mapie to nierealne — 44-pikselowe pigułki
    // zlewałyby się w gęstym centrum w jedną plamę i gość nie trafiłby w NIC.
    // 36 px to najwyższa wartość, przy której siatka grupująca (CLUSTER_Y 56)
    // wciąż utrzymuje odstęp między sąsiadami.
    "inline-flex min-h-9 cursor-pointer items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold shadow-md ring-1 transition-[background-color,color] hover:z-30",
    active
      ? // BEZ `scale-110`. Powiększanie zaznaczonego znacznika zmieniało jego
        // pole trafienia W CHWILI KLIKNIĘCIA — kursor lądował poza elementem,
        // który właśnie urósł, i kolejny klik trafiał w mapę zamiast w hotel.
        // Wyróżnienie robi teraz sam kolor i pierścień, które nie ruszają
        // geometrii.
        "z-30 bg-emerald-700 text-white ring-2 ring-emerald-900/25"
      : "bg-white text-emerald-900 ring-emerald-900/15 hover:bg-emerald-50",
  ].join(" ");
}

/**
 * Znacznik jako zwykły element DOM — pełna kontrola nad wyglądem marki
 * i darmowe stany `hover`/`selected` bez ikon SDF.
 */
function buildMarkerEl(cell: Cell, selectedId: string | null, hoveredId: string | null): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";

  const isGroup = cell.items.length > 1;
  const item = cell.items[0];
  // Rozróżnienie „pojedynczy obiekt" vs „grupa" jest potrzebne testom E2E
  // (kliknięcie w grupę przybliża, w pojedynczy — wybiera hotel) i bywa
  // pomocne przy diagnozie na produkcji.
  el.dataset.kind = isGroup ? "group" : "single";
  if (!isGroup) el.dataset.hotelId = item.hotelId;

  el.className = markerClass(cell, selectedId, hoveredId);

  if (isGroup) {
    const cheapest = cell.items.reduce<number | null>(
      (min, p) => (p.totalAmount !== null && (min === null || p.totalAmount < min) ? p.totalAmount : min),
      null,
    );
    // Licznik dostaje własne, ciemniejsze tło. Wariant tekstowy
    // („82 · od 82 zł") czytał się jak jedna liczba powtórzona dwa razy —
    // zwłaszcza gdy liczba obiektów i cena wypadły podobne.
    const count = document.createElement("span");
    count.className = "mr-1 rounded-full bg-emerald-700 px-1.5 text-white";
    count.textContent = String(cell.items.length);
    el.append(count);
    el.append(
      document.createTextNode(
        cheapest !== null ? `od ${formatPLN(cheapest, cell.items[0].currency)}` : "obiektów",
      ),
    );
    el.setAttribute(
      "aria-label",
      `${cell.items.length} obiektów w tym miejscu${
        cheapest !== null ? `, od ${formatPLN(cheapest, cell.items[0].currency)}` : ""
      } — powiększ, aby zobaczyć`,
    );
  } else {
    el.textContent = item.totalAmount !== null ? formatPLN(item.totalAmount, item.currency) : "—";
    el.setAttribute(
      "aria-label",
      `${item.name}${item.totalAmount !== null ? `, ${formatPLN(item.totalAmount, item.currency)}` : ""}`,
    );
  }

  return el;
}
