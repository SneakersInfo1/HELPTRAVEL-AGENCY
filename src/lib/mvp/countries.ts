// Pełna mapa krajów ISO 3166-1 alpha-2 z nazwami polskimi i angielskimi.
//
// DLACZEGO POWSTAŁ TEN MODUŁ
// `resolveCountryCode` w lib/liteapi/search.ts miał 73 wpisy i WYŁĄCZNIE
// Europę + basen Morza Śródziemnego. Skutek zmierzony 2026-07-26:
// `resolveCountryCode("Thailand")` → null, `("Tajlandia")` → null, tak samo
// Wietnam, Japonia, Meksyk, Malediwy, Indonezja, Sri Lanka, USA, Dominikana.
// Czyli nawet użytkownik, który wpisał kierunek RĘCZNIE w URL, nie mógł
// wyszukać hotelu poza Europą — mimo że LiteAPI ma tam większość ze swoich
// ~3 mln obiektów. To była twarda blokada dostępu do oferty, nie kosmetyka.
//
// Stara mapa miała też dwa własne defekty, powtórzone tu świadomie NIE:
//   • klucz `Albania_PL: "AL"` — obejście kolizji nazw w literale obiektu,
//     przez które polska „Albania" nigdy nie trafiała w mapę wprost;
//   • fallback po `includes()` iterujący w kolejności wstawiania, więc krótka
//     nazwa mogła przechwycić dłuższą (np. „Gwinea" przed „Gwinea Bissau").
//     Tutaj dopasowanie fragmentem idzie od NAJDŁUŻSZEJ nazwy.
//
// Moduł jest czysty (bez `server-only`, bez I/O) — testowalny pod node:test.

/** [kod ISO, nazwa angielska, nazwa polska, ...aliasy] */
type Row = readonly [string, string, string, ...string[]];

const ROWS: readonly Row[] = [
  // ── Europa ──
  ["AD", "Andorra", "Andora"],
  ["AL", "Albania", "Albania"],
  ["AT", "Austria", "Austria"],
  ["BA", "Bosnia and Herzegovina", "Bośnia i Hercegowina", "Bosnia"],
  ["BE", "Belgium", "Belgia"],
  ["BG", "Bulgaria", "Bułgaria"],
  ["BY", "Belarus", "Białoruś"],
  ["CH", "Switzerland", "Szwajcaria"],
  ["CY", "Cyprus", "Cypr"],
  ["CZ", "Czechia", "Czechy", "Czech Republic", "Czech"],
  ["DE", "Germany", "Niemcy"],
  ["DK", "Denmark", "Dania"],
  ["EE", "Estonia", "Estonia"],
  ["ES", "Spain", "Hiszpania"],
  ["FI", "Finland", "Finlandia"],
  ["FO", "Faroe Islands", "Wyspy Owcze"],
  ["FR", "France", "Francja"],
  ["GB", "United Kingdom", "Wielka Brytania", "UK", "Great Britain", "England", "Anglia", "Scotland", "Szkocja"],
  ["GI", "Gibraltar", "Gibraltar"],
  ["GR", "Greece", "Grecja"],
  ["HR", "Croatia", "Chorwacja"],
  ["HU", "Hungary", "Węgry"],
  ["IE", "Ireland", "Irlandia"],
  ["IS", "Iceland", "Islandia"],
  ["IT", "Italy", "Włochy", "Republic of Italy"],
  ["LI", "Liechtenstein", "Liechtenstein"],
  ["LT", "Lithuania", "Litwa"],
  ["LU", "Luxembourg", "Luksemburg"],
  ["LV", "Latvia", "Łotwa"],
  ["MC", "Monaco", "Monako"],
  ["MD", "Moldova", "Mołdawia"],
  ["ME", "Montenegro", "Czarnogóra"],
  ["MK", "North Macedonia", "Macedonia Północna", "Macedonia"],
  ["MT", "Malta", "Malta"],
  ["NL", "Netherlands", "Holandia", "Niderlandy"],
  ["NO", "Norway", "Norwegia"],
  ["PL", "Poland", "Polska"],
  ["PT", "Portugal", "Portugalia"],
  ["RO", "Romania", "Rumunia"],
  ["RS", "Serbia", "Serbia"],
  ["RU", "Russia", "Rosja"],
  ["SE", "Sweden", "Szwecja"],
  ["SI", "Slovenia", "Słowenia"],
  ["SK", "Slovakia", "Słowacja"],
  ["SM", "San Marino", "San Marino"],
  ["UA", "Ukraine", "Ukraina"],
  ["VA", "Vatican City", "Watykan"],
  ["XK", "Kosovo", "Kosowo"],

  // ── Bliski Wschód i Afryka Północna ──
  ["AE", "United Arab Emirates", "Zjednoczone Emiraty Arabskie", "UAE", "Emiraty", "Dubai", "Dubaj"],
  ["BH", "Bahrain", "Bahrajn"],
  ["DZ", "Algeria", "Algieria"],
  ["EG", "Egypt", "Egipt"],
  ["IL", "Israel", "Izrael"],
  ["IQ", "Iraq", "Irak"],
  ["IR", "Iran", "Iran"],
  ["JO", "Jordan", "Jordania"],
  ["KW", "Kuwait", "Kuwejt"],
  ["LB", "Lebanon", "Liban"],
  ["LY", "Libya", "Libia"],
  ["MA", "Morocco", "Maroko"],
  ["OM", "Oman", "Oman"],
  ["QA", "Qatar", "Katar"],
  ["SA", "Saudi Arabia", "Arabia Saudyjska"],
  ["TN", "Tunisia", "Tunezja"],
  ["TR", "Turkey", "Turcja", "Türkiye", "Turkiye"],
  ["YE", "Yemen", "Jemen"],

  // ── Afryka Subsaharyjska ──
  ["AO", "Angola", "Angola"],
  ["BW", "Botswana", "Botswana"],
  ["CI", "Ivory Coast", "Wybrzeże Kości Słoniowej", "Côte d'Ivoire"],
  ["CM", "Cameroon", "Kamerun"],
  ["CV", "Cape Verde", "Republika Zielonego Przylądka", "Cabo Verde", "Zielony Przylądek"],
  ["ET", "Ethiopia", "Etiopia"],
  ["GH", "Ghana", "Ghana"],
  ["GM", "Gambia", "Gambia"],
  ["KE", "Kenya", "Kenia"],
  ["MG", "Madagascar", "Madagaskar"],
  ["MU", "Mauritius", "Mauritius"],
  ["MZ", "Mozambique", "Mozambik"],
  ["NA", "Namibia", "Namibia"],
  ["NG", "Nigeria", "Nigeria"],
  ["RW", "Rwanda", "Rwanda"],
  ["SC", "Seychelles", "Seszele"],
  ["SN", "Senegal", "Senegal"],
  ["TZ", "Tanzania", "Tanzania", "Zanzibar"],
  ["UG", "Uganda", "Uganda"],
  ["ZA", "South Africa", "Republika Południowej Afryki", "RPA"],
  ["ZM", "Zambia", "Zambia"],
  ["ZW", "Zimbabwe", "Zimbabwe"],

  // ── Azja ──
  ["AM", "Armenia", "Armenia"],
  ["AZ", "Azerbaijan", "Azerbejdżan"],
  ["BD", "Bangladesh", "Bangladesz"],
  ["BT", "Bhutan", "Bhutan"],
  ["BN", "Brunei", "Brunei"],
  ["CN", "China", "Chiny"],
  ["GE", "Georgia", "Gruzja"],
  ["HK", "Hong Kong", "Hongkong"],
  ["ID", "Indonesia", "Indonezja", "Bali"],
  ["IN", "India", "Indie"],
  ["JP", "Japan", "Japonia"],
  ["KG", "Kyrgyzstan", "Kirgistan"],
  ["KH", "Cambodia", "Kambodża"],
  ["KR", "South Korea", "Korea Południowa", "Korea"],
  ["KZ", "Kazakhstan", "Kazachstan"],
  ["LA", "Laos", "Laos"],
  ["LK", "Sri Lanka", "Sri Lanka", "Cejlon"],
  ["MM", "Myanmar", "Mjanma", "Birma"],
  ["MN", "Mongolia", "Mongolia"],
  ["MO", "Macao", "Makau"],
  ["MV", "Maldives", "Malediwy"],
  ["MY", "Malaysia", "Malezja"],
  ["NP", "Nepal", "Nepal"],
  ["PH", "Philippines", "Filipiny"],
  ["PK", "Pakistan", "Pakistan"],
  ["SG", "Singapore", "Singapur"],
  ["TH", "Thailand", "Tajlandia"],
  ["TW", "Taiwan", "Tajwan"],
  ["UZ", "Uzbekistan", "Uzbekistan"],
  ["VN", "Vietnam", "Wietnam", "Viet Nam"],

  // ── Ameryka Północna, Środkowa i Karaiby ──
  ["AG", "Antigua and Barbuda", "Antigua i Barbuda"],
  ["AW", "Aruba", "Aruba"],
  ["BB", "Barbados", "Barbados"],
  ["BS", "Bahamas", "Bahamy"],
  ["BZ", "Belize", "Belize"],
  ["CA", "Canada", "Kanada"],
  ["CR", "Costa Rica", "Kostaryka"],
  ["CU", "Cuba", "Kuba"],
  ["CW", "Curaçao", "Curaçao", "Curacao"],
  ["DO", "Dominican Republic", "Dominikana", "Republika Dominikańska"],
  ["GT", "Guatemala", "Gwatemala"],
  ["HN", "Honduras", "Honduras"],
  ["HT", "Haiti", "Haiti"],
  ["JM", "Jamaica", "Jamajka"],
  ["KY", "Cayman Islands", "Kajmany"],
  ["MX", "Mexico", "Meksyk"],
  ["NI", "Nicaragua", "Nikaragua"],
  ["PA", "Panama", "Panama"],
  ["PR", "Puerto Rico", "Portoryko"],
  ["SV", "El Salvador", "Salwador"],
  ["TC", "Turks and Caicos Islands", "Turks i Caicos"],
  ["TT", "Trinidad and Tobago", "Trynidad i Tobago"],
  ["US", "United States", "Stany Zjednoczone", "USA", "United States of America", "America"],
  ["VI", "U.S. Virgin Islands", "Wyspy Dziewicze Stanów Zjednoczonych"],

  // ── Ameryka Południowa ──
  ["AR", "Argentina", "Argentyna"],
  ["BO", "Bolivia", "Boliwia"],
  ["BR", "Brazil", "Brazylia"],
  ["CL", "Chile", "Chile"],
  ["CO", "Colombia", "Kolumbia"],
  ["EC", "Ecuador", "Ekwador"],
  ["GY", "Guyana", "Gujana"],
  ["PE", "Peru", "Peru"],
  ["PY", "Paraguay", "Paragwaj"],
  ["SR", "Suriname", "Surinam"],
  ["UY", "Uruguay", "Urugwaj"],
  ["VE", "Venezuela", "Wenezuela"],

  // ── Oceania ──
  ["AU", "Australia", "Australia"],
  ["FJ", "Fiji", "Fidżi"],
  ["NC", "New Caledonia", "Nowa Kaledonia"],
  ["NZ", "New Zealand", "Nowa Zelandia"],
  ["PF", "French Polynesia", "Polinezja Francuska", "Tahiti"],
  ["PG", "Papua New Guinea", "Papua-Nowa Gwinea"],
  ["WS", "Samoa", "Samoa"],
];

/** Bez diakrytyków, bez interpunkcji, lowercase — „Türkiye" == „turkiye". */
export function normalizeCountryName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // ł/Ł nie rozkłada się przez NFD — trzeba ręcznie, inaczej „Łotwa" nie trafia.
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** znormalizowana nazwa → kod ISO */
const NAME_TO_CODE = new Map<string, string>();
/** kod ISO → { en, pl } do wyświetlania */
const CODE_TO_NAMES = new Map<string, { en: string; pl: string }>();

for (const [code, en, pl, ...aliases] of ROWS) {
  CODE_TO_NAMES.set(code, { en, pl });
  for (const name of [en, pl, ...aliases]) {
    const key = normalizeCountryName(name);
    // Pierwszy wpis wygrywa: aliasy współdzielone między krajami (np. „Korea")
    // nie mają nadpisywać nazwy kanonicznej.
    if (!NAME_TO_CODE.has(key)) NAME_TO_CODE.set(key, code);
  }
}

/**
 * Nazwy posortowane OD NAJDŁUŻSZEJ — używane wyłącznie przy dopasowaniu
 * fragmentem. Kolejność ma znaczenie: przy iteracji w kolejności wstawiania
 * „Gwinea" przechwyciłaby „Gwinea Bissau", a „Korea" — „Korea Południowa".
 */
const NAMES_BY_LENGTH_DESC = [...NAME_TO_CODE.keys()].sort((a, b) => b.length - a.length);

const VALID_CODES = new Set(CODE_TO_NAMES.keys());

/**
 * Nazwa kraju (PL, EN, alias albo gotowy kod ISO) → kod ISO 3166-1 alpha-2.
 * `null`, gdy nie da się rozpoznać — wołający MUSI to obsłużyć, bo LiteAPI
 * bez `countryCode` nie zwróci nic sensownego.
 */
export function resolveCountryCode(country: string): string | null {
  const raw = country.trim();
  if (!raw) return null;

  const key = normalizeCountryName(raw);
  const exact = NAME_TO_CODE.get(key);
  if (exact) return exact;

  // Gotowy kod ISO („TH", „th") — ale TYLKO taki, który realnie istnieje.
  // Stara wersja zwracała każde dwie litery wielkimi, więc literówka „Hi”
  // jechała do LiteAPI jako countryCode=HI i kończyła się pustą listą
  // zamiast czytelnym błędem.
  if (raw.length === 2 && VALID_CODES.has(raw.toUpperCase())) return raw.toUpperCase();

  // Fragment — obsługuje „Republic of Italy", „Kingdom of Spain",
  // „Turkey (Türkiye)". Od najdłuższej nazwy, patrz komentarz wyżej.
  for (const name of NAMES_BY_LENGTH_DESC) {
    // Nazwy krótsze niż 4 znaki („usa", „uae") tylko przy dokładnym trafieniu —
    // jako fragment łapałyby przypadkowe zbitki liter w innych słowach.
    if (name.length < 4) continue;
    if (key.includes(name)) return NAME_TO_CODE.get(name) ?? null;
  }
  return null;
}

/** Kod ISO → polska nazwa kraju (do wyświetlenia). */
export function countryNamePl(code: string): string | null {
  return CODE_TO_NAMES.get(code.toUpperCase())?.pl ?? null;
}

/** Kod ISO → angielska nazwa kraju (klucz do LiteAPI / URL-i). */
export function countryNameEn(code: string): string | null {
  return CODE_TO_NAMES.get(code.toUpperCase())?.en ?? null;
}

/** Wszystkie obsługiwane kraje — używane przez podpowiedzi „cały kraj". */
export function allCountries(): Array<{ code: string; en: string; pl: string }> {
  return [...CODE_TO_NAMES.entries()].map(([code, n]) => ({ code, en: n.en, pl: n.pl }));
}
