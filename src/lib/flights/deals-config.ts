export interface DealRoute {
  origin: string;
  destinationIata: string;
  destinationId: string;
}

/**
 * Pula tras. Większa od jednego przebiegu, żeby co dwie godziny badać inne
 * trasy, a po pełnym obrocie wrócić do początku bez losowania i bez luk.
 *
 * DLACZEGO AŻ TRZYDZIEŚCI SZEŚĆ. Rozmiar puli wynika z POMIARU, nie z chęci
 * pokazania wielu kierunków. Pierwszy realny przebieg (2026-08-02, 8 tras
 * × 6 terminów, 48 wyszukań, zero błędów) pokazał, że rozrzut cen wewnątrz
 * jednej trasy jest zwykle mały: sześć z ośmiu tras zmieściło się w 2–8%
 * między najtańszym a typowym terminem, i tylko Ateny (−25%) oraz Lizbona
 * (−19%) miały różnicę, którą uczciwie można nazwać okazją.
 *
 * Były dwa wyjścia: poluzować próg albo poszerzyć pulę. Poluzowanie oznaczało
 * nazwanie „okazją" różnicy 8% — czyli dokładnie ten rodzaj naciągania, przed
 * którym PRODUCT.md ostrzega wprost. Więc pula, nie próg.
 */
export const DEAL_ROUTES: readonly DealRoute[] = [
  { origin: "WAW", destinationIata: "BCN", destinationId: "barcelona-spain" },
  { origin: "WAW", destinationIata: "AGP", destinationId: "malaga-spain" },
  { origin: "WAW", destinationIata: "PMI", destinationId: "palma-spain" },
  { origin: "WAW", destinationIata: "ALC", destinationId: "alicante-spain" },
  { origin: "WAW", destinationIata: "AYT", destinationId: "antalya-turkey" },
  { origin: "WAW", destinationIata: "RHO", destinationId: "rhodes-greece" },
  { origin: "WAW", destinationIata: "HER", destinationId: "heraklion-greece" },
  { origin: "WAW", destinationIata: "FAO", destinationId: "faro-portugal" },
  { origin: "WAW", destinationIata: "LIS", destinationId: "lisbon-portugal" },
  { origin: "WAW", destinationIata: "ATH", destinationId: "athens-greece" },
  { origin: "WAW", destinationIata: "IST", destinationId: "istanbul-turkey" },
  { origin: "WAW", destinationIata: "SPU", destinationId: "split-croatia" },
  { origin: "WAW", destinationIata: "OPO", destinationId: "porto-portugal" },
  { origin: "WAW", destinationIata: "NAP", destinationId: "naples-italy" },
  { origin: "WAW", destinationIata: "CTA", destinationId: "catania-italy" },
  { origin: "WAW", destinationIata: "LCA", destinationId: "larnaca-cyprus" },
  { origin: "WAW", destinationIata: "CFU", destinationId: "corfu-greece" },
  { origin: "WAW", destinationIata: "TFS", destinationId: "santa-cruz-de-tenerife-spain" },
  { origin: "KRK", destinationIata: "ZTH", destinationId: "zakynthos-greece" },
  { origin: "KRK", destinationIata: "KGS", destinationId: "kos-greece" },
  { origin: "KRK", destinationIata: "HRG", destinationId: "hurghada-egypt" },
  { origin: "KRK", destinationIata: "DBV", destinationId: "dubrovnik-croatia" },
  { origin: "KRK", destinationIata: "VLC", destinationId: "valencia-spain" },
  { origin: "KRK", destinationIata: "NCE", destinationId: "nice-france" },
  // Rozszerzenie po pierwszym realnym przebiegu (patrz komentarz wyżej).
  // Dobór celowo sięga dalej niż basen Morza Śródziemnego: im większy rozrzut
  // długości tras i sezonowości, tym większa szansa, że w danym momencie
  // KTÓRAŚ trasa ma termin realnie tańszy od pozostałych.
  { origin: "WAW", destinationIata: "PFO", destinationId: "paphos-cyprus" },
  { origin: "WAW", destinationIata: "SKG", destinationId: "thessaloniki-greece" },
  { origin: "WAW", destinationIata: "CHQ", destinationId: "chania-greece" },
  { origin: "WAW", destinationIata: "BRI", destinationId: "bari-italy" },
  { origin: "WAW", destinationIata: "PMO", destinationId: "palermo-italy" },
  { origin: "WAW", destinationIata: "MLA", destinationId: "valletta-malta" },
  { origin: "WAW", destinationIata: "ACE", destinationId: "arrecife-spain" },
  { origin: "WAW", destinationIata: "LPA", destinationId: "las-palmas-spain" },
  { origin: "WAW", destinationIata: "FNC", destinationId: "funchal-portugal" },
  { origin: "WAW", destinationIata: "SSH", destinationId: "sharm-el-sheikh-egypt" },
  { origin: "WAW", destinationIata: "RAK", destinationId: "marrakesh-morocco" },
  { origin: "WAW", destinationIata: "DXB", destinationId: "dubai-united-arab-emirates" },
];

/**
 * Ile tras bada jeden przebieg. Dwanaście z trzydziestu sześciu = pełny obrót
 * puli w trzy przebiegi, czyli SZEŚĆ GODZIN.
 *
 * To nie jest dobór „na oko": karta z ceną lotu jest ważna tak długo, jak
 * długo ta cena jeszcze istnieje, a bilety zmieniają się szybciej niż stawki
 * hotelowe. Im krótszy pełny obrót, tym świeższa najstarsza pokazywana okazja
 * (patrz `DEAL_FRESH_MS`).
 *
 * Zmierzony koszt: 12 tras × 6 terminów = 72 wyszukania na przebieg, ~2,2 s
 * na wyszukanie przy współbieżności 6, czyli ok. 155 s wobec budżetu 250 s.
 * Dwanaście przebiegów na dobę daje 864 wyszukania — mniej niż połowa tego,
 * co robi istniejący prewarming lotów (~1900/dobę).
 */
export const DEAL_ROUTES_PER_RUN = 12;
/**
 * Terminy próbek, liczone w dniach od dziś.
 *
 * Reszty z dzielenia przez 7 to KOMPLET 0–5, więc wewnątrz jednego przebiegu
 * każda próbka wypada w INNYM dniu tygodnia — niezależnie od tego, w jaki
 * dzień akurat wystartował cron. To jest cały sens tej listy: bilety są
 * najdroższe w piątek i niedzielę, a najtańsze w środku tygodnia, więc sześć
 * próbek z tego samego dnia tygodnia dałoby medianę „typowej ceny piątkowej"
 * podpisaną jako typowa cena trasy.
 *
 * Pierwsza wersja miała [18, 25, 33, 46, 60, 81] i wyglądała poprawnie, bo
 * żadna z tych liczb nie jest wielokrotnością siedmiu. Zmierzone: reszty to
 * 4, 4, 5, 4, 4, 4 — pięć z sześciu próbek lądowało w ten sam dzień tygodnia.
 * Warunek „nie wielokrotność 7" jest bezużyteczny; liczy się rozrzut RESZT.
 *
 * Rozpiętość (3 tygodnie → ~12 tygodni) jest dobrana pod deklarację z sekcji:
 * mediana ma opisywać najbliższe miesiące, a nie jeden weekend.
 */
export const DEAL_SAMPLE_LEAD_DAYS: readonly number[] = [21, 29, 37, 45, 60, 82];
export const DEAL_NIGHTS = 7;
// Jedna osoba daje cenę na osobę i ten sam wynik da się odtworzyć linkiem.
export const DEAL_ADULTS = 1;
/**
 * Ile razy dłużej od NAJSZYBSZEJ oferty tego samego wyszukania może trwać
 * podróż, żeby wciąż nadawała się na kartę „okazji".
 *
 * DLACZEGO TO ISTNIEJE. Pierwszy przebieg na realnych danych (2026-08-02)
 * wystawił dwie karty, które formalnie spełniały wszystkie progi cenowe:
 * Teneryfa za 1448 zł z przelotem 20 h 15 min i Hurghada za 1680 zł z 14 h
 * 35 min — jedna i druga przez Zurych. To nie są okazje, tylko najtańsze
 * bilety: sortowanie po samej cenie zawsze wypycha na wierzch trasy z
 * wielogodzinną przesiadką. Użytkownik, który kliknie „−21%" i zobaczy dobę
 * w podróży, nie uzna tego za oszczędność.
 *
 * Próg jest WZGLĘDNY, a nie sztywną liczbą godzin, bo 8 h to katastrofa na
 * trasie do Aten i normalna podróż na Wyspy Kanaryjskie. Punkt odniesienia
 * bierzemy z tego samego wyszukania, więc kalibruje się sam dla każdej trasy
 * i każdego terminu.
 *
 * Skutek uboczny jest pożądany: mediana liczy się z ofert po tym samym
 * filtrze, więc porównanie „ta cena vs typowa" dalej zestawia porównywalne
 * podróże, a nie okazyjny bilet z całonocną przesiadką wobec zwykłych lotów.
 */
export const DEAL_MAX_DURATION_RATIO = 1.5;
/**
 * Bezwzględny sufit czasu podróży (dłuższy z dwóch odcinków), w minutach.
 *
 * Sam próg względny nie wystarcza i widać to w danych: dla Pafos wszystkie
 * oferty w oknie 31.08 były długie, więc „półtora raza od najszybszej"
 * dopuszczało 20 h, a dla Lanzarote i Szarm el-Szejk 14 h. Kiedy CAŁY wynik
 * wyszukiwania jest zły, próg względny mierzy się do złego punktu odniesienia
 * i przepuszcza wszystko.
 *
 * Dwanaście godzin jest hojne dla TEJ puli: najdalszy kierunek to Dubaj
 * (zmierzone 6–9 h z jedną przesiadką), a Wyspy Kanaryjskie realnie 8–9 h.
 * Sufit odcina więc wyłącznie podróże z wielogodzinnym postojem, których
 * nikt nie kupuje dla oszczędności 300 zł. Jeżeli pula kiedyś sięgnie Azji
 * albo obu Ameryk, tę liczbę trzeba podnieść razem z nią.
 */
export const DEAL_MAX_DURATION_MINUTES = 720;
export const DEAL_CONCURRENCY = 6;
// Zostaje 50 sekund marginesu względem limitu funkcji Vercel.
export const DEAL_TIME_BUDGET_MS = 250_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export interface DealDateWindow {
  checkin: string;
  checkout: string;
  label: string;
}

/** Okna są liczone wyłącznie w UTC, więc zmiana czasu lokalnego nie przesuwa dat. */
export function computeDealDateWindows(
  now: Date = new Date(),
): DealDateWindow[] {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return DEAL_SAMPLE_LEAD_DAYS.map((lead) => {
    const checkin = addDays(base, lead);
    return {
      checkin: iso(checkin),
      checkout: iso(addDays(checkin, DEAL_NIGHTS)),
      label: `lead-${lead}`,
    };
  });
}
