/**
 * PRAWDZIWY zoom przeglądarki dla testów E2E.
 *
 * DLACZEGO NIE `setViewportSize`. Zmiana szerokości okna to NIE to samo, co
 * zoom. Zoom robi dwie rzeczy naraz: dzieli rozmiar okna w pikselach CSS przez
 * współczynnik ORAZ mnoży przez niego `devicePixelRatio`. Testy, które udawały
 * zoom samą zmianą szerokości, nie widziały drugiej połowy — a to właśnie DPR
 * decyduje o rozdzielczości bufora canvasa mapy. Zgłoszenie właściciela
 * („przy 80% wygląda poprawniej niż przy 100%") było o zachowaniu, którego taki
 * test z definicji nie mógł wykryć.
 *
 * `Emulation.setDeviceMetricsOverride` z CDP ustawia oba pola naraz, czyli
 * odwzorowuje to, co robi Chrome przy Ctrl+/Ctrl−.
 *
 * Przykład: ekran 1920×1080 przy zoomie 125% daje okno 1536×864 px CSS
 * i `devicePixelRatio` 1,25.
 */
import type { Page } from "@playwright/test";

export interface WymiaryEkranu {
  /** Fizyczna szerokość ekranu w pikselach urządzenia. */
  width: number;
  /** Fizyczna wysokość ekranu w pikselach urządzenia. */
  height: number;
}

/**
 * Ustawia realny zoom przeglądarki.
 *
 * @param zoom 1 = 100%, 0.8 = 80%, 1.25 = 125%.
 */
export async function ustawZoom(
  page: Page,
  ekran: WymiaryEkranu,
  zoom: number,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: Math.round(ekran.width / zoom),
    height: Math.round(ekran.height / zoom),
    deviceScaleFactor: zoom,
    mobile: false,
  });
}

/** Macierz zoomu w kolejności priorytetu z briefu: 100% jest celem głównym. */
export const MACIERZ_ZOOMU = [1, 1.1, 0.9, 1.25, 0.8] as const;
