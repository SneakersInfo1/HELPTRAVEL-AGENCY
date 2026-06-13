import type { Metadata } from "next";
import Link from "next/link";

// ────────────────────────────────────────────────────────────────────────────
// Polityka prywatności serwisu HelpTravel
//
// Dokument zredagowany zgodnie z RODO (rozporządzenie 2016/679), w
// szczególności realizujący obowiązek informacyjny z art. 13 i 14.
// Dodatkowo uwzględnia:
//   • ustawę z 10 maja 2018 r. o ochronie danych osobowych
//   • ustawę z 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną
//   • Dyrektywę ePrivacy 2002/58/WE (cookies, marketing direct)
//   • wytyczne EROD oraz UODO dotyczące zgody, podstaw prawnych i
//     przekazywania danych do państw trzecich
//
// Dane Administratora czytane z env (NEXT_PUBLIC_OPERATOR_*) — taka sama
// strategia jak w regulaminie. Po ustawieniu zmiennych dokument pokaże pełne
// dane wymagane art. 13 ust. 1 lit. a RODO.
// ────────────────────────────────────────────────────────────────────────────

const SITE_NAME = "HelpTravel";
const SITE_DOMAIN = "helptravel.pl";

const admin = {
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || SITE_NAME,
  legalForm: process.env.NEXT_PUBLIC_OPERATOR_LEGAL_FORM?.trim() || null,
  address: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS?.trim() || null,
  nip: process.env.NEXT_PUBLIC_OPERATOR_NIP?.trim() || null,
  regon: process.env.NEXT_PUBLIC_OPERATOR_REGON?.trim() || null,
  registry: process.env.NEXT_PUBLIC_OPERATOR_REGISTRY?.trim() || null,
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "kontakt@helptravel.pl",
};

const EFFECTIVE_DATE = "25 maja 2026 r.";
const EFFECTIVE_DATE_ISO = "2026-05-25";

export const metadata: Metadata = {
  title: "Polityka prywatności",
  description:
    "Polityka prywatności HelpTravel — pełne informacje o przetwarzaniu danych zgodnie z RODO: administrator, podstawy prawne, odbiorcy, retencja, prawa osób.",
  alternates: { canonical: "/polityka-prywatnosci" },
  openGraph: {
    title: "Polityka prywatności | HelpTravel",
    description:
      "Jak przetwarzamy dane osobowe w HelpTravel — RODO art. 13, podstawy prawne, odbiorcy, prawa.",
    url: "/polityka-prywatnosci",
    type: "article",
  },
  robots: { index: true, follow: true },
};

// ────────────────────────────────────────────────────────────────────────────
// Schemat dokumentu
// ────────────────────────────────────────────────────────────────────────────

type Paragraph = string;
type ListItem = { label?: string; body: string };

type Section = {
  id: string;
  ord: string;
  title: string;
  intro?: Paragraph;
  paragraphs?: Paragraph[];
  list?: ListItem[];
  numbered?: ListItem[];
  table?: { headers: string[]; rows: string[][] };
};

const sections: Section[] = [
  {
    id: "postanowienia-ogolne",
    ord: "§ 1",
    title: "Postanowienia ogólne",
    paragraphs: [
      `Niniejsza Polityka prywatności (dalej: „Polityka”) opisuje zasady przetwarzania danych osobowych Użytkowników serwisu internetowego ${SITE_NAME} dostępnego pod adresem ${SITE_DOMAIN} (dalej: „Serwis”).`,
      `Polityka stanowi wykonanie obowiązku informacyjnego, o którym mowa w art. 13 i 14 rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (dalej: „RODO”), a także realizuje wymogi ustawy z dnia 10 maja 2018 r. o ochronie danych osobowych, ustawy z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną oraz Dyrektywy ePrivacy 2002/58/WE.`,
      `Korzystanie z Serwisu oznacza zapoznanie się z Polityką. Polityka jest udostępniana nieodpłatnie w sposób umożliwiający jej pozyskanie, odtwarzanie i utrwalanie pod adresem ${SITE_DOMAIN}/polityka-prywatnosci.`,
    ],
  },
  {
    id: "administrator",
    ord: "§ 2",
    title: "Administrator danych osobowych",
    intro: "Administratorem danych osobowych w rozumieniu art. 4 pkt 7 RODO jest:",
    list: [
      { label: "Administrator", body: admin.legalForm ? `${admin.name} (${admin.legalForm})` : admin.name },
      admin.address
        ? { label: "Adres", body: admin.address }
        : { label: "Adres", body: "Adres siedziby udostępniany na żądanie pod adresem kontaktowym Administratora." },
      admin.nip
        ? { label: "NIP", body: admin.nip }
        : { label: "NIP", body: "Numer NIP udostępniany na żądanie pod adresem kontaktowym Administratora." },
      admin.regon
        ? { label: "REGON", body: admin.regon }
        : { label: "REGON", body: "Numer REGON udostępniany na żądanie pod adresem kontaktowym Administratora." },
      admin.registry
        ? { label: "Rejestr", body: admin.registry }
        : { label: "Rejestr", body: "Wpis w rejestrze (CEIDG / KRS) udostępniany na żądanie." },
      { label: "Kontakt elektroniczny", body: admin.email },
    ],
    paragraphs: [
      `Wszelkie sprawy związane z przetwarzaniem danych, realizacją praw, o których mowa w § 10, oraz reklamacjami dotyczącymi prywatności prosimy kierować na adres ${admin.email}. Administrator odpowiada w terminie do 30 dni od dnia otrzymania żądania, z możliwością przedłużenia o kolejne dwa miesiące w przypadku skomplikowanego charakteru żądania (art. 12 ust. 3 RODO).`,
    ],
  },
  {
    id: "iod",
    ord: "§ 3",
    title: "Inspektor Ochrony Danych",
    paragraphs: [
      "Administrator nie wyznaczył Inspektora Ochrony Danych (IOD). Skala i charakter przetwarzania w Serwisie nie spełniają przesłanek obligatoryjnego powołania IOD wymienionych w art. 37 ust. 1 RODO (m.in. przetwarzania na dużą skalę szczególnych kategorii danych lub regularnego i systematycznego monitorowania osób). Funkcję kontaktu w sprawach ochrony danych pełni bezpośrednio Administrator.",
    ],
  },
  {
    id: "definicje",
    ord: "§ 4",
    title: "Definicje",
    intro: "Pojęcia użyte w niniejszej Polityce mają następujące znaczenie:",
    list: [
      {
        label: "Dane osobowe",
        body: "informacje o zidentyfikowanej lub możliwej do zidentyfikowania osobie fizycznej (art. 4 pkt 1 RODO).",
      },
      {
        label: "Przetwarzanie",
        body: "operacja lub zestaw operacji wykonywanych na danych osobowych (art. 4 pkt 2 RODO).",
      },
      {
        label: "Użytkownik",
        body: "osoba fizyczna korzystająca z Serwisu.",
      },
      {
        label: "Sesja",
        body: "anonimowy identyfikator korzystania z Serwisu, przechowywany w pamięci przeglądarki Użytkownika, łączący zapytania w jedną sesję techniczną.",
      },
      {
        label: "Procesor",
        body: "podmiot przetwarzający dane na zlecenie Administratora na podstawie art. 28 RODO (umowa powierzenia).",
      },
      {
        label: "Odbiorca",
        body: "osoba fizyczna lub prawna, której Administrator ujawnia dane osobowe (art. 4 pkt 9 RODO).",
      },
    ],
  },
  {
    id: "cele-podstawy",
    ord: "§ 5",
    title: "Cele i podstawy prawne przetwarzania",
    intro:
      "Administrator przetwarza dane Użytkowników w następujących celach i w oparciu o następujące podstawy prawne:",
    table: {
      headers: ["Cel przetwarzania", "Podstawa prawna (RODO)", "Okres retencji"],
      rows: [
        [
          "Świadczenie nieodpłatnych usług w Serwisie (planer, treści, sesja anonimowa)",
          "art. 6 ust. 1 lit. b — wykonanie umowy",
          "do 24 godzin (TTL sesji w Upstash Redis)",
        ],
        [
          "Pośrednictwo technologiczne w Rezerwacji Hotelowej",
          "art. 6 ust. 1 lit. b — wykonanie umowy",
          "5 lat od daty rezerwacji (księgowość + roszczenia)",
        ],
        [
          "Obsługa reklamacji i kontaktu",
          "art. 6 ust. 1 lit. b oraz lit. f — uzasadniony interes (rozpatrzenie zgłoszenia)",
          "do 3 lat od zamknięcia sprawy",
        ],
        [
          "Cele rachunkowe i podatkowe",
          "art. 6 ust. 1 lit. c — obowiązek prawny (Ordynacja podatkowa)",
          "5 lat liczone od końca roku podatkowego",
        ],
        [
          "Analityka i pomiar użytkowania Serwisu (cookies analityczne)",
          "art. 6 ust. 1 lit. a — zgoda (banner cookies)",
          "12 miesięcy lub do cofnięcia zgody",
        ],
        [
          "Marketing własny i afiliacja (cookies marketingowe, identyfikatory partnerskie)",
          "art. 6 ust. 1 lit. a — zgoda",
          "do 12 miesięcy lub do cofnięcia zgody",
        ],
        [
          "Zapewnienie bezpieczeństwa Serwisu (rate-limit, ochrona przed nadużyciami)",
          "art. 6 ust. 1 lit. f — uzasadniony interes",
          "do 30 dni",
        ],
        [
          "Dochodzenie i obrona roszczeń",
          "art. 6 ust. 1 lit. f — uzasadniony interes",
          "do upływu terminu przedawnienia roszczeń",
        ],
      ],
    },
  },
  {
    id: "kategorie",
    ord: "§ 6",
    title: "Kategorie przetwarzanych danych",
    intro: "Administrator przetwarza następujące kategorie danych osobowych:",
    numbered: [
      {
        label: "Dane identyfikacyjne",
        body:
          "imię, nazwisko, adres e-mail, numer telefonu — wyłącznie w procesie Rezerwacji Hotelowej (dane głównego gościa i pozostałych gości).",
      },
      {
        label: "Dane transakcyjne",
        body:
          "identyfikator rezerwacji, identyfikator transakcji płatniczej, kwota, waluta, status płatności. Dane karty płatniczej (numer, CVV) NIE są przetwarzane przez Administratora — autoryzacja odbywa się bezpośrednio u dostawcy usług płatniczych (Stripe).",
      },
      {
        label: "Dane techniczne",
        body:
          "adres IP, typ przeglądarki, język, identyfikator Sesji, znacznik czasowy żądania, adres odsyłający (referer), informacje o urządzeniu.",
      },
      {
        label: "Dane o korzystaniu z Serwisu",
        body:
          "zapytania do planera, wybrane kierunki, kliknięcia w linki partnerów (Pomoc, Linki partnerskie), zapisane plany. Dane przypisane są wyłącznie do anonimowej Sesji.",
      },
      {
        label: "Dane z plików cookie",
        body:
          "preferencja języka, zapis decyzji o cookies, identyfikatory analityczne i partnerskie (jeżeli Użytkownik wyraził zgodę). Szczegóły — § 13.",
      },
    ],
  },
  {
    id: "odbiorcy",
    ord: "§ 7",
    title: "Odbiorcy danych — procesory i partnerzy",
    intro:
      "W ramach realizacji celów określonych w § 5 Administrator powierza dane lub udostępnia je niżej wymienionym podmiotom. Każdy procesor związany jest umową powierzenia spełniającą wymogi art. 28 RODO.",
    table: {
      headers: ["Podmiot", "Rola", "Lokalizacja", "Cel"],
      rows: [
        [
          "LiteAPI Travel Ltd.",
          "Procesor",
          "Wielka Brytania (decyzja stwierdzająca odpowiedni stopień ochrony)",
          "Realizacja Rezerwacji Hotelowej, agregacja oferty hoteli, webhook potwierdzenia",
        ],
        [
          "Stripe Payments Europe, Ltd.",
          "Procesor (dane karty — autonomiczny administrator)",
          "Irlandia + USA (Standardowe Klauzule Umowne)",
          "Autoryzacja płatności, zgodność PSD2/SCA, zwroty",
        ],
        [
          "Upstash, Inc.",
          "Procesor",
          "USA (SCC)",
          "Pamięć sesji, zapis rezerwacji w toku, rate-limit",
        ],
        [
          "Vercel, Inc.",
          "Procesor",
          "USA (SCC) — region serwerowy iad1 (Waszyngton)",
          "Hosting Serwisu, dostarczanie treści (CDN), logi techniczne",
        ],
        [
          "Pexels GmbH",
          "Autonomiczny administrator",
          "Niemcy (UE) + USA (SCC)",
          "Dostarczanie obrazów ilustracyjnych. Brak przekazania danych identyfikujących — żądania anonimowe.",
        ],
        [
          "Unsplash, Inc.",
          "Autonomiczny administrator",
          "Kanada (decyzja stwierdzająca odpowiedni stopień ochrony)",
          "Dostarczanie obrazów ilustracyjnych. Brak danych identyfikujących.",
        ],
        [
          "Geoapify GmbH",
          "Procesor",
          "Niemcy (UE)",
          "Geokodowanie i wyszukiwanie miejsc (autouzupełnianie destynacji).",
        ],
        [
          "Cupid Travel (CDN obrazów hoteli LiteAPI)",
          "Procesor (w ramach LiteAPI)",
          "UE/EOG",
          "Dostarczanie zdjęć hoteli prezentowanych w Serwisie",
        ],
        [
          "CJ Affiliate (Commission Junction LLC)",
          "Joint Controller",
          "USA (SCC)",
          "Afiliacja Hotels.com, Expedia, Vrbo — atrybucja kliknięcia",
        ],
        [
          "Stay22 Inc.",
          "Joint Controller",
          "Kanada (decyzja stwierdzająca odpowiedni stopień ochrony)",
          "Mapy noclegowe + afiliacja Booking.com / Airbnb",
        ],
        [
          "Google LLC (Google Analytics 4)",
          "Procesor (po wyrażeniu zgody na cookies analityczne)",
          "USA (Standardowe Klauzule Umowne + EU-U.S. Data Privacy Framework)",
          "Anonimowa analityka ruchu i interakcji. Aktywne wyłącznie po zgodzie; IP anonimizowane (anonymize_ip).",
        ],
      ],
    },
    paragraphs: [
      "Administrator nie sprzedaje danych osobowych i nie przekazuje ich podmiotom innym niż wymienione powyżej. Lista jest aktualizowana w razie zmiany stosu technologicznego.",
    ],
  },
  {
    id: "panstwa-trzecie",
    ord: "§ 8",
    title: "Przekazywanie danych do państw trzecich",
    intro:
      "Dane mogą być przekazywane poza Europejski Obszar Gospodarczy (EOG) do podmiotów wymienionych w § 7, w szczególności do USA. Każde takie przekazanie odbywa się w oparciu o:",
    numbered: [
      {
        body:
          "decyzję Komisji Europejskiej stwierdzającą odpowiedni stopień ochrony (art. 45 RODO) — dotyczy Wielkiej Brytanii i Kanady;",
      },
      {
        body:
          "Standardowe Klauzule Umowne zatwierdzone przez Komisję Europejską (art. 46 ust. 2 lit. c RODO) wraz z dodatkowymi środkami bezpieczeństwa (m.in. szyfrowanie w tranzycie i w spoczynku) — dotyczy USA, Singapuru;",
      },
      {
        body:
          "udział procesora w EU-U.S. Data Privacy Framework (jeżeli posiada certyfikację) — alternatywnie do SCC, dla procesorów z USA.",
      },
    ],
    paragraphs: [
      "Treść Standardowych Klauzul Umownych jest dostępna do wglądu na żądanie skierowane na adres kontaktowy Administratora.",
    ],
  },
  {
    id: "retencja",
    ord: "§ 9",
    title: "Okres przechowywania danych",
    intro:
      "Dane są przechowywane przez okres niezbędny do realizacji celu przetwarzania, wynikający z § 5 lub z przepisów prawa, w szczególności:",
    numbered: [
      { body: "dane z anonimowej Sesji — do 24 godzin (TTL ustawiony w Upstash Redis);" },
      {
        body:
          "dane Rezerwacji Hotelowej (imię, nazwisko, e-mail, identyfikator rezerwacji, dane transakcyjne) — przez 5 lat od daty rezerwacji, ze względu na obowiązki rachunkowe i okresy przedawnienia roszczeń (art. 86 § 1 Ordynacji podatkowej; art. 118 Kodeksu cywilnego);",
      },
      {
        body:
          "korespondencja reklamacyjna i kontaktowa — do 3 lat od zamknięcia sprawy;",
      },
      {
        body:
          "logi techniczne (adres IP, znacznik czasowy, ścieżka) — do 30 dni, w celach bezpieczeństwa i diagnostyki;",
      },
      {
        body:
          "preferencja zgody na cookies — 12 miesięcy od zapisania w przeglądarce Użytkownika;",
      },
      {
        body:
          "cookies analityczne i marketingowe — okresy określone w § 13.",
      },
    ],
  },
  {
    id: "prawa",
    ord: "§ 10",
    title: "Prawa osób, których dane dotyczą",
    intro:
      "Każdej osobie, której dane są przetwarzane, przysługują na podstawie RODO następujące prawa:",
    numbered: [
      {
        label: "Prawo dostępu (art. 15 RODO)",
        body:
          "uzyskanie informacji, czy i jakie dane są przetwarzane oraz uzyskanie kopii tych danych.",
      },
      {
        label: "Prawo do sprostowania (art. 16 RODO)",
        body: "żądanie poprawienia danych nieprawidłowych lub uzupełnienia niekompletnych.",
      },
      {
        label: "Prawo do usunięcia (art. 17 RODO)",
        body:
          "tzw. „prawo do bycia zapomnianym” — z zastrzeżeniem przypadków, w których przetwarzanie wynika z obowiązku prawnego (np. dane Rezerwacji w okresie retencji księgowej).",
      },
      {
        label: "Prawo do ograniczenia (art. 18 RODO)",
        body: "wstrzymanie przetwarzania w określonych przypadkach (m.in. kwestionowanie prawidłowości danych).",
      },
      {
        label: "Prawo do przenoszenia (art. 20 RODO)",
        body:
          "otrzymanie danych w ustrukturyzowanym, powszechnie używanym formacie nadającym się do odczytu maszynowego (JSON) — w zakresie danych przetwarzanych na podstawie zgody lub umowy w sposób zautomatyzowany.",
      },
      {
        label: "Prawo sprzeciwu (art. 21 RODO)",
        body:
          "wobec przetwarzania opartego na art. 6 ust. 1 lit. f (uzasadniony interes). Wobec marketingu bezpośredniego — sprzeciw można złożyć w dowolnej chwili i jest on dla Administratora bezwzględnie wiążący.",
      },
      {
        label: "Prawo cofnięcia zgody (art. 7 ust. 3 RODO)",
        body:
          "w dowolnej chwili, bez wpływu na zgodność z prawem przetwarzania, którego dokonano przed cofnięciem. Cookies analityczne i marketingowe wycofujemy w ustawieniach cookies — patrz § 13.",
      },
      {
        label: "Prawo skargi do organu nadzorczego (art. 77 RODO)",
        body:
          "Prezes Urzędu Ochrony Danych Osobowych (PUODO), ul. Stawki 2, 00-193 Warszawa. Strona internetowa: uodo.gov.pl.",
      },
    ],
    paragraphs: [
      `Wnioski w sprawie realizacji praw prosimy kierować na adres ${admin.email}. Administrator weryfikuje tożsamość Wnioskodawcy w sposób proporcjonalny do żądania, aby zapobiec ujawnieniu danych osobie nieuprawnionej.`,
    ],
  },
  {
    id: "wymog",
    ord: "§ 11",
    title: "Wymóg podania danych",
    intro:
      "Podanie danych osobowych jest dobrowolne. Brak podania określonych danych skutkuje jedynie niemożnością skorzystania z funkcjonalności, dla której dane są niezbędne:",
    numbered: [
      {
        body:
          "korzystanie z planera, czytanie treści i przeglądanie kierunków — nie wymaga podawania danych osobowych;",
      },
      {
        body:
          "zawarcie Rezerwacji Hotelowej — wymaga podania danych głównego gościa i pozostałych gości (imię, nazwisko, e-mail, numer telefonu) zgodnie z wymogami Partnera Rezerwacyjnego;",
      },
      {
        body:
          "kontakt e-mail z Administratorem — wymaga podania adresu e-mail nadawcy.",
      },
    ],
  },
  {
    id: "profilowanie",
    ord: "§ 12",
    title: "Automatyczne podejmowanie decyzji i profilowanie",
    paragraphs: [
      "Administrator nie podejmuje wobec Użytkowników decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, w tym profilowaniu, które wywoływałyby skutki prawne lub w podobny sposób istotnie wpływały na Użytkownika (art. 22 RODO).",
      "Wyniki Planera oraz rekomendacje kierunków stanowią zalecenia informacyjne mające pomóc w wyborze wyjazdu. Nie generują wiążących prawnie decyzji i nie różnicują Użytkowników w sposób istotny.",
    ],
  },
  {
    id: "cookies",
    ord: "§ 13",
    title: "Pliki cookie i podobne technologie",
    intro:
      "Serwis korzysta z plików cookie i podobnych technologii (pamięć lokalna przeglądarki). Cookies dzielimy na trzy kategorie:",
    table: {
      headers: ["Kategoria", "Cel", "Czas trwania", "Podmiot"],
      rows: [
        [
          "Niezbędne (zawsze aktywne)",
          "Identyfikator Sesji, preferencja języka, zapis Twojej decyzji o cookies, ochrona CSRF, rate-limit",
          "do 24 godzin (Sesja) / 12 miesięcy (preferencje)",
          "Administrator (1st-party)",
        ],
        [
          "Analityczne (wymagają zgody)",
          "Anonimowe metryki użycia Serwisu (Web Vitals, ruch, czas na stronie). Nie identyfikujemy Użytkownika.",
          "do 12 miesięcy",
          "Administrator (1st-party) lub procesor analityczny po wdrożeniu",
        ],
        [
          "Marketingowe / afiliacyjne (wymagają zgody)",
          "Identyfikatory atrybucji kliknięć w linki partnerów afiliacyjnych (m.in. CJ, Stay22), pomiar skuteczności kampanii.",
          "do 12 miesięcy",
          "1st-party + odpowiedni partner (3rd-party)",
        ],
      ],
    },
    paragraphs: [
      "Zgoda na cookies analityczne i marketingowe jest udzielana w banerze pojawiającym się przy pierwszej wizycie w Serwisie. Możesz w każdej chwili zmienić swoją zgodę, otwierając ustawienia cookies — link „Ustawienia cookies” znajduje się w stopce Serwisu.",
      `Bezpośredni dostęp do ustawień: <a href="#cookie-settings">${SITE_DOMAIN}#cookie-settings</a>.`,
      "Część przeglądarek internetowych umożliwia centralne ograniczenie lub zablokowanie obsługi plików cookies w ustawieniach przeglądarki. Wyłączenie cookies niezbędnych może spowodować nieprawidłowe działanie Serwisu, w tym brak możliwości dokonania Rezerwacji.",
    ],
  },
  {
    id: "bezpieczenstwo",
    ord: "§ 14",
    title: "Bezpieczeństwo danych",
    intro:
      "Administrator stosuje środki techniczne i organizacyjne odpowiadające ryzyku, o których mowa w art. 32 RODO, w szczególności:",
    numbered: [
      { body: "transmisja danych szyfrowana protokołem TLS 1.2/1.3 (HTTPS) na całej powierzchni Serwisu;" },
      { body: "rygorystyczne nagłówki bezpieczeństwa (Strict-Transport-Security, Content-Security-Policy, Permissions-Policy, X-Frame-Options DENY);" },
      { body: "uwierzytelniony dostęp do paneli administracyjnych procesorów; uprawnienia oparte o zasadę najmniejszych uprawnień;" },
      { body: "izolacja środowisk (produkcyjne / preview / testowe);" },
      { body: "monitorowanie incydentów oraz mechanizm rate-limit chroniący przed nadużyciami;" },
      {
        body:
          "płatności obsługiwane wyłącznie przez certyfikowanego operatora płatności (Stripe) zgodnie z PSD2/SCA — Administrator nie ma dostępu do pełnych danych instrumentu płatniczego.",
      },
    ],
    paragraphs: [
      "W przypadku stwierdzenia naruszenia ochrony danych osobowych mogącego skutkować ryzykiem naruszenia praw lub wolności osób, Administrator powiadomi PUODO w terminie 72 godzin od stwierdzenia naruszenia (art. 33 RODO) oraz, jeśli ryzyko jest wysokie, niezwłocznie powiadomi również osoby, których dane dotyczą (art. 34 RODO).",
    ],
  },
  {
    id: "zmiany",
    ord: "§ 15",
    title: "Zmiany Polityki prywatności",
    paragraphs: [
      "Administrator może dokonywać zmian Polityki w razie zmiany przepisów prawa, zmiany stosowanych procesorów, wdrożenia nowych funkcjonalności wpływających na przetwarzanie danych lub wystąpienia innych istotnych okoliczności.",
      "O każdej zmianie Polityki informujemy poprzez publikację jednolitego tekstu Polityki w Serwisie oraz, w razie istotnych zmian wpływających na zakres przetwarzania danych — w sposób umożliwiający zapoznanie się ze zmianami z odpowiednim wyprzedzeniem.",
      `Wersja Polityki obowiązuje od ${EFFECTIVE_DATE}.`,
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Render
// ────────────────────────────────────────────────────────────────────────────

function RenderList({ items, ordered }: { items: ListItem[]; ordered?: boolean }) {
  if (ordered) {
    return (
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-emerald-900/82 marker:text-emerald-700">
        {items.map((item, idx) => (
          <li key={idx} className="pl-1">
            {item.label ? <span className="font-semibold text-emerald-950">{item.label}: </span> : null}
            {item.body}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <dl className="mt-4 grid gap-3 text-sm leading-7 text-emerald-900/82">
      {items.map((item, idx) => (
        <div key={idx} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
          {item.label ? <dt className="font-semibold text-emerald-950">{item.label}</dt> : null}
          <dd className={item.label ? "mt-1" : ""}>{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}

function RenderTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-emerald-900/10 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-emerald-50/80 text-xs font-semibold uppercase tracking-wide text-emerald-800">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-900/10">
          {rows.map((row, idx) => (
            <tr key={idx} className="text-emerald-900/82">
              {row.map((cell, cidx) => (
                <td key={cidx} className="px-4 py-3 align-top leading-6">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Ochrona danych osobowych
        </p>
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          Polityka prywatności
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/82">
          Niniejszy dokument opisuje, w jaki sposób przetwarzamy Twoje dane osobowe podczas korzystania z serwisu{" "}
          {SITE_NAME}. Polityka spełnia wymogi RODO, ustawy o ochronie danych osobowych, ustawy o świadczeniu usług
          drogą elektroniczną oraz Dyrektywy ePrivacy. Jest podzielona na § sekcje dla łatwej nawigacji.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold text-emerald-800">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">
            Wersja obowiązująca od:{" "}
            <time dateTime={EFFECTIVE_DATE_ISO} className="font-bold">
              {EFFECTIVE_DATE}
            </time>
          </span>
          <Link
            href="/regulamin"
            className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 transition hover:bg-emerald-50"
          >
            Regulamin →
          </Link>
          <a
            href="#cookie-settings"
            className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 transition hover:bg-emerald-50"
          >
            Ustawienia cookies →
          </a>
          <Link
            href="/kontakt"
            className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 transition hover:bg-emerald-50"
          >
            Kontakt →
          </Link>
        </div>
      </section>

      {/* Spis treści */}
      <nav
        aria-label="Spis treści Polityki prywatności"
        className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Spis treści</p>
        <ol className="mt-4 grid gap-2 text-sm leading-7 text-emerald-900/82 sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-xl px-3 py-2 transition hover:bg-emerald-50 hover:text-emerald-900"
              >
                <span className="font-semibold text-emerald-950">{s.ord}.</span> {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Sekcje */}
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-24 rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{section.ord}</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">{section.title}</h2>
          {section.intro ? (
            <p className="mt-4 text-sm leading-7 text-emerald-900/82">{section.intro}</p>
          ) : null}
          {section.list ? <RenderList items={section.list} /> : null}
          {section.numbered ? <RenderList items={section.numbered} ordered /> : null}
          {section.table ? <RenderTable headers={section.table.headers} rows={section.table.rows} /> : null}
          {section.paragraphs?.map((p, idx) =>
            /<a /.test(p) ? (
              <p
                key={idx}
                className="mt-3 text-sm leading-7 text-emerald-900/82 [&_a]:font-semibold [&_a]:text-emerald-700 [&_a]:underline-offset-2 hover:[&_a]:underline"
                dangerouslySetInnerHTML={{ __html: p }}
              />
            ) : (
              <p key={idx} className="mt-3 text-sm leading-7 text-emerald-900/82">
                {p}
              </p>
            ),
          )}
        </section>
      ))}

      {/* Stopka dokumentu */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <h2 className="text-xl font-bold text-emerald-950">Kontakt w sprawach prywatności</h2>
        <p className="mt-3 text-sm leading-7 text-emerald-900/82">
          Wnioski o realizację praw, zapytania o przetwarzanie danych oraz wycofanie zgody prosimy kierować na adres{" "}
          <a className="font-semibold text-emerald-700 underline-offset-2 hover:underline" href={`mailto:${admin.email}`}>
            {admin.email}
          </a>
          . Termin odpowiedzi: do 30 dni od dnia otrzymania żądania.
        </p>
        <p className="mt-3 text-xs leading-6 text-emerald-900/80">
          Wersja Polityki: {EFFECTIVE_DATE}. Administrator: {admin.name}
          {admin.nip ? `, NIP ${admin.nip}` : ""}
          {admin.address ? `, ${admin.address}` : ""}.
        </p>
      </section>
    </main>
  );
}
