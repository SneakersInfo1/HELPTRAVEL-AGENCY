// Pionowy wycinek ŚRODKA zdjęcia Pexels — źródło `<picture><source>` dla hero
// na telefonie (src/components/home/cinematic-backdrop.tsx).
//
// ZMIERZONE 2026-11-02 (hero 375×737 px, zdjęcie 3:2, ken-burns do 1,18×):
// `sizes="(max-width: 1024px) 1280px"` to piksele CSS, więc telefon z DPR 2
// i 3 wybierał rendition 3840×2560 (481 KB), z którego object-cover pokazywał
// środkowe ~34 % szerokości. Wycinek o proporcji 0,8 w PEŁNEJ wysokości źródła
// zawiera dokładnie ten sam fragment w tej samej gęstości:
//   2048×2560 (DPR 3) = 301 KB, 1366×1707 (DPR 2) = 166 KB.
//
// `we` = bez powiększania: gdy źródło jest niższe niż żądany wycinek (np. 16:9),
// wsrv oddaje pełną wysokość źródła zamiast rozciągać (sprawdzone: h=3000 przy
// źródle 2560 → 2048×2560). Pexels jest pobierany w 3840 px szerokości — tyle,
// ile telefon dostawał do tej pory — więc wycinek nie traci rozdzielczości.
//
// Adres jest budowany jak w `cdn-loader.ts` (Pexels: auto=compress, cs=tinysrgb,
// bez `h`, dpr=1; wsrv: WebP, `default` = oryginał przy awarii proxy). Osobny
// moduł, bo loader jest plikiem `images.loaderFile` z własnym kontraktem.

/** Szerokość renditionu Pexels, z którego tniemy — ta sama, którą telefon pobierał dotąd. */
const ZRODLO_W = 3840;

export function pexelsCenterCrop(src: string, width: number, height: number, quality: number): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== "images.pexels.com") return null;

  url.searchParams.set("auto", "compress");
  url.searchParams.set("cs", "tinysrgb");
  url.searchParams.delete("h");
  url.searchParams.set("w", String(ZRODLO_W));
  url.searchParams.set("dpr", "1");
  const zrodlo = url.toString();

  const proxied = new URL("https://wsrv.nl/");
  proxied.searchParams.set("url", zrodlo);
  proxied.searchParams.set("w", String(width));
  proxied.searchParams.set("h", String(height));
  proxied.searchParams.set("fit", "cover");
  proxied.searchParams.set("a", "center");
  proxied.searchParams.set("q", String(quality));
  proxied.searchParams.set("output", "webp");
  proxied.searchParams.set("we", "");
  proxied.searchParams.set("default", zrodlo);
  return proxied.toString();
}
