import type { Metadata } from "next";
import Link from "next/link";

// ────────────────────────────────────────────────────────────────────────────
// Regulamin serwisu HelpTravel
//
// Dokument zredagowany zgodnie z polskim porządkiem prawnym, w szczególności:
//   • art. 384–385[4] Kodeksu cywilnego (wzorce umowne, klauzule abuzywne)
//   • ustawą z 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną
//   • ustawą z 30 maja 2014 r. o prawach konsumenta (zwłaszcza art. 38)
//   • rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO)
//   • ustawą z 24 listopada 2017 r. o imprezach turystycznych i powiązanych
//     usługach turystycznych (w zakresie wyłączenia tej ustawy)
//
// Dane rejestrowe Operatora czytane są z env publicznych (Vercel). Gdy nie są
// jeszcze uzupełnione, dokument prezentuje legalną minimalną wersję
// ("dostępne na żądanie pod adresem kontaktowym"). Po ustawieniu zmiennych
// NEXT_PUBLIC_OPERATOR_* dokument samoczynnie pokaże pełną identyfikację
// wymaganą art. 5 ust. 1 ustawy o świadczeniu usług drogą elektroniczną.
// ────────────────────────────────────────────────────────────────────────────

const SITE_NAME = "HelpTravel";
const SITE_DOMAIN = "helptravel.pl";

const operator = {
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || SITE_NAME,
  legalForm: process.env.NEXT_PUBLIC_OPERATOR_LEGAL_FORM?.trim() || null,
  address: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS?.trim() || null,
  nip: process.env.NEXT_PUBLIC_OPERATOR_NIP?.trim() || null,
  regon: process.env.NEXT_PUBLIC_OPERATOR_REGON?.trim() || null,
  registry: process.env.NEXT_PUBLIC_OPERATOR_REGISTRY?.trim() || null,
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "kontakt@helptravel.pl",
};

const EFFECTIVE_DATE = "24 maja 2026 r.";
const EFFECTIVE_DATE_ISO = "2026-05-24";

export const metadata: Metadata = {
  title: "Regulamin",
  description:
    "Regulamin serwisu HelpTravel. Zasady korzystania, świadczenie usług drogą elektroniczną, proces rezerwacji hotelowej, reklamacje, prawo odstąpienia, dane Operatora.",
  alternates: { canonical: "/regulamin" },
  openGraph: {
    title: "Regulamin | HelpTravel",
    description:
      "Pełen regulamin serwisu HelpTravel: definicje, usługi, rezerwacje, reklamacje, prawo konsumenta, ochrona danych.",
    url: "/regulamin",
    type: "article",
  },
  robots: { index: true, follow: true },
};

// ────────────────────────────────────────────────────────────────────────────
// Struktura dokumentu
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
};

const sections: Section[] = [
  {
    id: "postanowienia-ogolne",
    ord: "§ 1",
    title: "Postanowienia ogólne",
    paragraphs: [
      `Niniejszy regulamin (dalej: „Regulamin”) określa zasady korzystania z serwisu internetowego ${SITE_NAME} dostępnego pod adresem ${SITE_DOMAIN} (dalej: „Serwis”) oraz zasady świadczenia usług drogą elektroniczną przez Operatora Serwisu.`,
      `Regulamin został sporządzony na podstawie powszechnie obowiązujących przepisów prawa polskiego, w szczególności Kodeksu cywilnego, ustawy z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną, ustawy z dnia 30 maja 2014 r. o prawach konsumenta oraz rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO).`,
      `Korzystanie z Serwisu oznacza akceptację niniejszego Regulaminu w wersji obowiązującej w chwili rozpoczęcia korzystania.`,
      `Regulamin udostępniany jest nieodpłatnie, w sposób umożliwiający jego pozyskanie, odtwarzanie i utrwalanie w każdym czasie pod adresem ${SITE_DOMAIN}/regulamin.`,
    ],
  },
  {
    id: "operator",
    ord: "§ 2",
    title: "Operator Serwisu",
    intro: "Operatorem Serwisu, a zarazem usługodawcą w rozumieniu ustawy o świadczeniu usług drogą elektroniczną, jest:",
    list: [
      { label: "Nazwa", body: operator.legalForm ? `${operator.name} (${operator.legalForm})` : operator.name },
      operator.address
        ? { label: "Adres", body: operator.address }
        : { label: "Adres", body: "Adres siedziby udostępniany na żądanie pod adresem kontaktowym Operatora." },
      operator.nip
        ? { label: "NIP", body: operator.nip }
        : { label: "NIP", body: "Numer NIP udostępniany na żądanie pod adresem kontaktowym Operatora." },
      operator.regon
        ? { label: "REGON", body: operator.regon }
        : { label: "REGON", body: "Numer REGON udostępniany na żądanie pod adresem kontaktowym Operatora." },
      operator.registry
        ? { label: "Rejestr", body: operator.registry }
        : {
            label: "Rejestr",
            body: "Wpis w rejestrze przedsiębiorców (CEIDG / KRS) udostępniany na żądanie pod adresem kontaktowym Operatora.",
          },
      { label: "Kontakt elektroniczny", body: operator.email },
    ],
    paragraphs: [
      `Kontakt z Operatorem w sprawach związanych z Serwisem, reklamacjami i wykonywaniem praw wynikających z Regulaminu odbywa się przede wszystkim za pośrednictwem poczty elektronicznej na adres ${operator.email}.`,
    ],
  },
  {
    id: "definicje",
    ord: "§ 3",
    title: "Definicje",
    intro: "Użyte w Regulaminie pojęcia oznaczają:",
    list: [
      {
        label: "Użytkownik",
        body:
          "osoba fizyczna posiadająca pełną zdolność do czynności prawnych (a w przypadkach przewidzianych przez przepisy także ograniczoną zdolność), osoba prawna albo jednostka organizacyjna, której ustawa przyznaje zdolność prawną — korzystająca z Serwisu.",
      },
      {
        label: "Konsument",
        body:
          "Użytkownik będący osobą fizyczną dokonującą w Serwisie czynności prawnej niezwiązanej bezpośrednio z jej działalnością gospodarczą lub zawodową (art. 22[1] Kodeksu cywilnego).",
      },
      {
        label: "Przedsiębiorca-konsument",
        body:
          "osoba fizyczna prowadząca działalność gospodarczą, zawierająca umowę bezpośrednio związaną z jej działalnością, gdy z treści tej umowy wynika, że nie ma ona dla niej charakteru zawodowego — w zakresie określonym art. 38a oraz art. 7aa ustawy o prawach konsumenta korzysta z części uprawnień Konsumenta.",
      },
      {
        label: "Partner Rezerwacyjny",
        body:
          "podmiot zewnętrzny (m.in. hotel, sięć hotelowa, agregator rezerwacyjny, operator platformy bookingowej, w tym LiteAPI Travel Ltd. wraz z dostawcami noclegów), za pomocą którego Użytkownik finalizuje rezerwację noclegu i z którym Użytkownik zawiera właściwą umowę o świadczenie usługi noclegowej.",
      },
      {
        label: "Partner Afiliacyjny",
        body:
          "podmiot zewnętrzny (m.in. Booking.com, Hotels.com, Expedia, Vrbo, CJ Affiliate, Stay22), do którego Użytkownik może przejść za pośrednictwem Linku Afiliacyjnego.",
      },
      {
        label: "Link Afiliacyjny",
        body:
          "hiperłącze prowadzące do platformy Partnera Afiliacyjnego, oznaczone parametrem identyfikującym Serwis, z którego pochodzi przejście, umożliwiającym Operatorowi otrzymanie prowizji od Partnera w razie późniejszego zakupu.",
      },
      {
        label: "Sesja",
        body:
          "anonimowa, technicznie generowana sesja Użytkownika w Serwisie, identyfikowana losowym ciągiem znaków, służąca m.in. do zapamiętywania preferencji wyjazdu, zapisanych planów oraz przebiegu rezerwacji hotelowej; Serwis nie wymaga zakładania konta.",
      },
      {
        label: "Planer",
        body:
          "interaktywne narzędzie Serwisu umożliwiające wprowadzenie preferencji wyjazdu i otrzymanie propozycji kierunków, terminów oraz dalszych kroków planowania.",
      },
      {
        label: "Rezerwacja Hotelowa",
        body:
          "umowa o świadczenie usługi noclegowej zawierana przez Użytkownika z Partnerem Rezerwacyjnym za pośrednictwem technologicznej infrastruktury Serwisu (w szczególności w ścieżce /hotele/rezerwacja).",
      },
      {
        label: "Voucher",
        body:
          "elektroniczne potwierdzenie zawarcia Rezerwacji Hotelowej, generowane po pozytywnej autoryzacji płatności i potwierdzeniu rezerwacji przez Partnera Rezerwacyjnego.",
      },
      {
        label: "Treści Serwisu",
        body:
          "wszelkie materiały tekstowe, graficzne, audiowizualne, układy stron, kompozycje opisów kierunków, planerów, przewodników, oznaczenia, logo i inne utwory w rozumieniu prawa autorskiego, publikowane w Serwisie.",
      },
    ],
  },
  {
    id: "charakter-serwisu",
    ord: "§ 4",
    title: "Charakter Serwisu i jego rola prawna",
    paragraphs: [
      `Serwis ${SITE_NAME} jest niezależnym serwisem informacyjnym, planerem podróży oraz pośrednikiem technologicznym. Operator nie jest organizatorem turystyki ani agentem turystycznym w rozumieniu ustawy z dnia 24 listopada 2017 r. o imprezach turystycznych i powiązanych usługach turystycznych, a Serwis nie świadczy usług polegających na łączeniu co najmniej dwóch różnych rodzajów usług turystycznych na potrzeby tej samej podróży lub wakacji.`,
      `Serwis nie organizuje wyjazdów, nie sprzedaje imprez turystycznych ani pakietów dynamicznych, nie pobiera od Użytkowników wpłat na poczet usług turystycznych innych podmiotów oraz nie ponosi odpowiedzialności organizatora turystyki.`,
      `Rolą Operatora jest: (a) udostępnianie treści informacyjnych i porównawczych, (b) udostępnianie Planera i innych narzędzi wspierających decyzje podróżne, (c) świadczenie pośrednictwa technologicznego umożliwiającego zawarcie Rezerwacji Hotelowej z Partnerem Rezerwacyjnym, (d) udostępnianie Linków Afiliacyjnych do Partnerów Afiliacyjnych.`,
      `W przypadku Rezerwacji Hotelowej stronami umowy o świadczenie usługi noclegowej są Użytkownik i właściwy Partner Rezerwacyjny. Operator występuje wyłącznie w roli pośrednika technologicznego oraz, w odniesieniu do płatności, pośrednika płatniczego.`,
    ],
  },
  {
    id: "uslugi",
    ord: "§ 5",
    title: "Rodzaje i zakres świadczonych usług",
    intro: "Operator świadczy w Serwisie drogą elektroniczną następujące usługi nieodpłatne na rzecz Użytkownika:",
    numbered: [
      { body: "udostępnianie treści informacyjnych, inspiracyjnych i poradnikowych dotyczących podróży;" },
      { body: "udostępnianie Planera, w tym otrzymywanie sugestii kierunków na podstawie zapytania;" },
      { body: "udostępnianie wyszukiwarek lotów, noclegów i aktywności (w tym z wykorzystaniem danych Partnerów Afiliacyjnych);" },
      { body: "zapisywanie planów wyjazdu w ramach anonimowej Sesji;" },
      {
        body:
          "udostępnianie Linków Afiliacyjnych umożliwiających przejście do Partnerów Afiliacyjnych i zawarcie umowy bezpośrednio z nimi;",
      },
      {
        body:
          "pośrednictwo technologiczne w zawarciu Rezerwacji Hotelowej z Partnerem Rezerwacyjnym, obejmujące w szczególności: wyszukanie obiektu, prezentację stawek, prebooking, obsługę formularza danych gościa, przekierowanie do bezpiecznej autoryzacji płatności oraz prezentację Vouchera.",
      },
    ],
    paragraphs: [
      `Korzystanie z usług, o których mowa w ust. 1 pkt 1–6, jest dla Użytkownika nieodpłatne. Operator pobiera wynagrodzenie wyłącznie od Partnerów (w modelu prowizyjnym), co nie wpływa na cenę usługi prezentowaną Użytkownikowi.`,
      `Operator zastrzega prawo do udostępniania w przyszłości dodatkowych usług, w tym usług płatnych — które wymagają odrębnej, wyraźnej akceptacji warunków przez Użytkownika przed ich uruchomieniem.`,
    ],
  },
  {
    id: "wymagania-techniczne",
    ord: "§ 6",
    title: "Wymagania techniczne",
    intro: "Do prawidłowego korzystania z Serwisu wymagane jest:",
    numbered: [
      { body: "urządzenie z dostępem do Internetu (komputer, tablet, smartfon);" },
      { body: "aktualna wersja przeglądarki internetowej z włączoną obsługą JavaScript i plików cookie;" },
      { body: "aktywny adres poczty elektronicznej (w przypadku Rezerwacji Hotelowej oraz korzystania z formularza kontaktowego);" },
      { body: "w przypadku Rezerwacji Hotelowej — ważny instrument płatniczy akceptowany przez dostawcę usług płatniczych obsługującego Partnera Rezerwacyjnego (m.in. karta płatnicza zgodna z PSD2/SCA)." },
    ],
    paragraphs: [
      "Operator nie ponosi odpowiedzialności za zakłócenia, w tym przerwy w funkcjonowaniu Serwisu, spowodowane siłą wyższą, niedozwolonym działaniem osób trzecich lub niekompatybilnością Serwisu z infrastrukturą techniczną Użytkownika.",
    ],
  },
  {
    id: "zawarcie-umowy",
    ord: "§ 7",
    title: "Zawarcie umowy o świadczenie usług drogą elektroniczną",
    paragraphs: [
      "Umowa o świadczenie usług nieodpłatnych, o których mowa w § 5 ust. 1 pkt 1–5, zostaje zawarta z chwilą rozpoczęcia faktycznego korzystania przez Użytkownika z danej funkcjonalności Serwisu i rozwiązuje się z chwilą zakończenia korzystania (zamknięcia karty przeglądarki) lub usunięcia Sesji.",
      "Umowa o pośrednictwo technologiczne w Rezerwacji Hotelowej (§ 5 ust. 1 pkt 6) zawierana jest w momencie rozpoczęcia przez Użytkownika procesu rezerwacji konkretnego obiektu w ścieżce /hotele/rezerwacja i wygasa z chwilą zakończenia procesu (otrzymaniem Vouchera albo niepowodzeniem rezerwacji).",
      "Korzystanie z Serwisu nie wymaga rejestracji ani założenia konta. Sesje są anonimowe i przypisane do losowo wygenerowanego identyfikatora przechowywanego w pamięci przeglądarki Użytkownika i, w niezbędnym zakresie, po stronie Operatora.",
    ],
  },
  {
    id: "rezerwacja",
    ord: "§ 8",
    title: "Proces Rezerwacji Hotelowej",
    intro: "Rezerwacja Hotelowa przebiega następująco:",
    numbered: [
      { body: "Użytkownik wybiera obiekt i stawkę spośród prezentowanych w Serwisie wyników wyszukiwania." },
      {
        body:
          "Operator wykonuje techniczną operację „prebookingu” u Partnera Rezerwacyjnego, w której Partner potwierdza dostępność obiektu i ostateczną cenę dla wybranych warunków.",
      },
      {
        body:
          "Użytkownik podaje dane głównego gościa (holder) oraz dane wszystkich gości i przechodzi do bezpiecznej autoryzacji płatności na infrastrukturze dostawcy usług płatniczych (m.in. Stripe), zgodnie z wymogami PSD2/SCA.",
      },
      {
        body:
          "Po pomyślnej autoryzacji Operator przekazuje Partnerowi Rezerwacyjnemu polecenie zawarcia rezerwacji, a po jej potwierdzeniu przez Partnera Użytkownik otrzymuje Voucher z numerem rezerwacji.",
      },
      {
        body:
          "Wraz z otrzymaniem Vouchera dochodzi do zawarcia umowy o świadczenie usługi noclegowej między Użytkownikiem a Partnerem Rezerwacyjnym, na warunkach Partnera obowiązujących w chwili rezerwacji.",
      },
    ],
    paragraphs: [
      "Dane przekazywane Partnerowi Rezerwacyjnemu obejmują w szczególności: imię i nazwisko głównego gościa, adres e-mail, numer telefonu, dane pozostałych gości oraz identyfikator transakcji płatniczej. Zakres ten jest niezbędny do wykonania umowy noclegowej.",
      "W procesie rezerwacji stosowany jest mechanizm idempotencji (jednorazowość operacji) oparty na identyfikatorze Sesji oraz nagłówku Idempotency-Key, którego celem jest zapobieganie podwójnym rezerwacjom w razie zakłóceń sieciowych po stronie Użytkownika lub Partnera.",
      `W razie pomyślnej autoryzacji płatności i braku potwierdzenia ze strony Partnera Rezerwacyjnego (sytuacja awaryjna) Operator podejmuje próbę uzgodnienia stanu rezerwacji z Partnerem przy użyciu identyfikatora Sesji (clientReference). Jeżeli rezerwacja nie zostanie potwierdzona, środki podlegają zwrotowi w tym samym kanale płatności, zgodnie z polityką Partnera i dostawcy płatności.`,
    ],
  },
  {
    id: "ceny-platnosci",
    ord: "§ 9",
    title: "Ceny i płatności",
    paragraphs: [
      "Ceny prezentowane w Serwisie pochodzą bezpośrednio od Partnerów Rezerwacyjnych lub Partnerów Afiliacyjnych i mogą się zmieniać w czasie rzeczywistym. Cena wiążąca to cena zaprezentowana w ostatnim kroku rezerwacji u danego Partnera, bezpośrednio przed autoryzacją płatności.",
      "Cena obejmuje koszty wskazane jako wliczone w cenę przez Partnera Rezerwacyjnego. Dodatkowe opłaty pobierane w obiekcie (tzw. resort fee, opłata klimatyczna, opłata miejscowa, kaucja, opłaty za parking, śniadanie, sprzątanie itp.) są opłatami Partnera Rezerwacyjnego pobieranymi na miejscu i nie są przekazywane Operatorowi.",
      "Płatności w ramach Rezerwacji Hotelowej obsługiwane są przez dostawców usług płatniczych (m.in. Stripe Payments Europe, Ltd.) zintegrowanych z infrastrukturą Partnera Rezerwacyjnego. Operator nie ma dostępu do pełnych danych instrumentu płatniczego Użytkownika.",
      "Operator nie pobiera od Użytkownika dodatkowego wynagrodzenia ponad cenę zaprezentowaną przez Partnera. Wynagrodzenie Operatora to wyłącznie prowizja wypłacana przez Partnerów, niewpływająca na cenę usługi.",
      "Faktury, paragony lub inne dokumenty księgowe za usługę noclegową wystawiane są przez Partnera Rezerwacyjnego, zgodnie z jego polityką i obowiązującymi go przepisami.",
    ],
  },
  {
    id: "anulacje",
    ord: "§ 10",
    title: "Zmiany, anulacje i zwroty",
    paragraphs: [
      "Polityka anulacji, modyfikacji oraz zwrotu środków każdorazowo wynika z warunków Partnera Rezerwacyjnego dla wybranej stawki (m.in. „refundable” / „non-refundable”) i jest prezentowana Użytkownikowi przed potwierdzeniem rezerwacji.",
      "Anulacji lub zmiany Rezerwacji Hotelowej Użytkownik może dokonać kontaktując się z Partnerem Rezerwacyjnym, korzystając z odpowiedniej funkcji w Serwisie (jeżeli jest dostępna) lub zwracając się do Operatora pod adresem kontaktowym Operatora, który przekaże dyspozycję Partnerowi.",
      "Zwrot środków, jeżeli przysługuje, dokonywany jest przez ten sam kanał płatności, którym dokonano płatności pierwotnej, w terminach wynikających z polityki Partnera Rezerwacyjnego oraz przepisów dostawcy usług płatniczych. Operator nie odpowiada za terminy księgowania zwrotu po stronie banku Użytkownika.",
    ],
  },
  {
    id: "odstapienie",
    ord: "§ 11",
    title: "Prawo odstąpienia od umowy",
    paragraphs: [
      "Konsumentowi (oraz osobie, o której mowa w art. 7aa i 38a ustawy o prawach konsumenta) przysługuje co do zasady prawo odstąpienia od umowy zawartej na odległość w terminie 14 dni bez podania przyczyny.",
      "Prawo odstąpienia, o którym mowa w ust. 1, NIE PRZYSŁUGUJE w odniesieniu do umów o świadczenie usług w zakresie zakwaterowania, innych niż do celów mieszkalnych, przewozu rzeczy, najmu samochodów, gastronomii, usług związanych z wypoczynkiem, wydarzeniami rozrywkowymi, sportowymi lub kulturalnymi, jeżeli w umowie oznaczono dzień lub okres świadczenia usługi (art. 38 ust. 1 pkt 12 ustawy z dnia 30 maja 2014 r. o prawach konsumenta).",
      "Oznacza to, że Rezerwacja Hotelowa, jako umowa o usługę noclegową z określonym dniem rozpoczęcia i zakończenia pobytu, jest wyłączona z 14-dniowego prawa do odstąpienia. Anulacja i zwrot środków przebiegają wyłącznie na zasadach polityki Partnera Rezerwacyjnego, o których mowa w § 10.",
      "Pozostałe usługi nieodpłatne świadczone w Serwisie (§ 5 ust. 1 pkt 1–5) Użytkownik może w każdej chwili zakończyć poprzez zaprzestanie korzystania z Serwisu.",
    ],
  },
  {
    id: "reklamacje",
    ord: "§ 12",
    title: "Reklamacje",
    intro:
      "Reklamacje dotyczące działania Serwisu (np. błędów technicznych, nieprawidłowości w funkcjonowaniu Planera, problemów z przebiegiem rezerwacji po stronie Operatora) Użytkownik może składać:",
    numbered: [
      { body: `pocztą elektroniczną na adres ${operator.email}, z dopiskiem „Reklamacja”;` },
      { body: "korzystając z formularza kontaktowego dostępnego na stronie /kontakt." },
    ],
    paragraphs: [
      "Reklamacja powinna zawierać co najmniej: imię i nazwisko (lub firmę) Użytkownika, adres do korespondencji elektronicznej, zwięzły opis okoliczności i przedmiotu reklamacji, datę i godzinę zdarzenia oraz, w miarę możliwości, identyfikator Sesji lub numer rezerwacji.",
      "Operator rozpatruje reklamację w terminie 14 dni od dnia jej otrzymania. Brak odpowiedzi w tym terminie uważa się za uznanie reklamacji w stosunku do Konsumenta zgodnie z art. 7a ustawy o prawach konsumenta.",
      "Reklamacje dotyczące merytorycznego wykonania usługi noclegowej (m.in. standardu pokoju, czystości, wyposażenia, obsługi obiektu) należy kierować bezpośrednio do Partnera Rezerwacyjnego lub do obiektu noclegowego, zgodnie z danymi kontaktowymi wskazanymi w Voucherze. Operator może, na życzenie Użytkownika, przekazać reklamację Partnerowi, jednak nie odpowiada za jej rozpatrzenie.",
    ],
  },
  {
    id: "afiliacja",
    ord: "§ 13",
    title: "Linki Afiliacyjne i transparentność",
    paragraphs: [
      "Serwis korzysta z modelu afiliacyjnego. Niektóre odnośniki prowadzące do Partnerów Afiliacyjnych zawierają parametry identyfikujące Serwis, dzięki którym Operator może otrzymać wynagrodzenie prowizyjne od Partnera w przypadku dokonania przez Użytkownika zakupu po przejściu z Serwisu.",
      "Korzystanie z Linków Afiliacyjnych nie zwiększa ceny usługi po stronie Partnera Afiliacyjnego ani nie nakłada na Użytkownika żadnych dodatkowych zobowiązań wobec Operatora.",
      "Po kliknięciu Linku Afiliacyjnego Użytkownik opuszcza Serwis i korzysta z platformy Partnera Afiliacyjnego na zasadach określonych w regulaminie i polityce prywatności tego Partnera. Operator nie jest stroną umów zawieranych przez Użytkownika z Partnerami Afiliacyjnymi.",
      "Lista Partnerów Afiliacyjnych dostępna jest pod adresem /linki-partnerskie i może być aktualizowana w miarę rozwoju Serwisu.",
    ],
  },
  {
    id: "dane-osobowe",
    ord: "§ 14",
    title: "Ochrona danych osobowych",
    paragraphs: [
      "Administratorem danych osobowych Użytkowników w zakresie korzystania z Serwisu jest Operator. Szczegółowe zasady przetwarzania danych, podstawy prawne, okresy retencji, prawa osób, których dane dotyczą, oraz informacje o powierzeniu danych dostawcom Operatora określa Polityka prywatności dostępna pod adresem /polityka-prywatnosci.",
      "W zakresie Rezerwacji Hotelowej Partner Rezerwacyjny występuje jako odrębny administrator danych osobowych w stosunku do danych niezbędnych do zawarcia i wykonania umowy o usługę noclegową.",
      "Operator stosuje środki techniczne i organizacyjne adekwatne do ryzyka, mające na celu ochronę przetwarzanych danych osobowych, zgodnie z art. 32 RODO.",
    ],
  },
  {
    id: "prawa-autorskie",
    ord: "§ 15",
    title: "Prawa własności intelektualnej",
    paragraphs: [
      "Treści Serwisu — w szczególności teksty, opisy kierunków, układy stron, zdjęcia (w zakresie, w jakim prawa do nich przysługują Operatorowi lub jego licencjodawcom), grafiki, logo, znaki towarowe oraz baza danych Serwisu — stanowią przedmiot praw wyłącznych Operatora lub podmiotów współpracujących i podlegają ochronie prawnej.",
      "Użytkownik może korzystać z Treści Serwisu wyłącznie w zakresie własnego użytku osobistego, w sposób zgodny z prawem i niniejszym Regulaminem.",
      "Zabronione jest w szczególności: zwielokrotnianie, kopiowanie, modyfikowanie, dystrybuowanie, publiczne udostępnianie, scrapowanie zautomatyzowane (w tym przy użyciu agentów AI bez wyraźnej zgody Operatora), wykorzystywanie do trenowania modeli komercyjnych oraz wykorzystywanie w celach komercyjnych Treści Serwisu bez uprzedniej, pisemnej zgody Operatora.",
      "Powyższe nie wyłącza praw przewidzianych przepisami o dozwolonym użytku, w tym prawa cytatu zgodnie z art. 29 ustawy o prawie autorskim i prawach pokrewnych.",
    ],
  },
  {
    id: "zasady-korzystania",
    ord: "§ 16",
    title: "Zasady korzystania z Serwisu",
    intro: "Użytkownik zobowiązany jest do korzystania z Serwisu zgodnie z prawem i dobrymi obyczajami. Zabronione jest w szczególności:",
    numbered: [
      { body: "dostarczanie do Serwisu treści o charakterze bezprawnym (art. 8 ust. 3 pkt 2 lit. b ustawy o świadczeniu usług drogą elektroniczną);" },
      { body: "podejmowanie działań zmierzających do zakłócenia funkcjonowania Serwisu, w tym ataków DDoS, prób nieuprawnionego dostępu, eksploitów lub testów penetracyjnych bez zgody Operatora;" },
      { body: "automatyczne pobieranie treści (scrapowanie) wykraczające poza normalne korzystanie z Serwisu, w tym w celu trenowania modeli AI bez zgody Operatora;" },
      { body: "korzystanie z Serwisu z wykorzystaniem fałszywych danych identyfikacyjnych lub instrumentów płatniczych, do których Użytkownik nie ma uprawnień;" },
      { body: "podejmowanie działań mających na celu obejście mechanizmów bezpieczeństwa, idempotencji lub ograniczeń liczby zapytań." },
    ],
    paragraphs: [
      "W razie naruszenia przez Użytkownika postanowień niniejszego paragrafu Operator zastrzega prawo do ograniczenia dostępu do Serwisu albo rozwiązania umowy o świadczenie usług drogą elektroniczną ze skutkiem natychmiastowym.",
    ],
  },
  {
    id: "odpowiedzialnosc",
    ord: "§ 17",
    title: "Odpowiedzialność",
    paragraphs: [
      "Operator odpowiada za prawidłowe działanie technicznej infrastruktury Serwisu w granicach określonych przepisami prawa. Operator dokłada starań, aby treści informacyjne były aktualne i rzetelne, jednak nie gwarantuje ich bezbłędności ani kompletności.",
      "Operator nie ponosi odpowiedzialności za: jakość, terminowość ani zgodność z opisem usług noclegowych świadczonych przez Partnerów Rezerwacyjnych, decyzje Partnerów Afiliacyjnych w zakresie cen i dostępności, działania osób trzecich oraz zdarzenia siły wyższej.",
      "W stosunku do Użytkownika niebędącego Konsumentem ani osobą, o której mowa w art. 7aa lub 38a ustawy o prawach konsumenta, odpowiedzialność Operatora ograniczona jest do strat rzeczywistych (z wyłączeniem utraconych korzyści) oraz do wysokości wynagrodzenia prowizyjnego otrzymanego przez Operatora w związku z daną transakcją.",
      "Postanowienia ust. 3 nie ograniczają odpowiedzialności Operatora wobec Konsumenta ani osoby, o której mowa w art. 7aa lub 38a ustawy o prawach konsumenta, w zakresie, w jakim ograniczenia takie są niedopuszczalne na gruncie obowiązujących przepisów.",
    ],
  },
  {
    id: "dostepnosc",
    ord: "§ 18",
    title: "Dostępność Serwisu",
    paragraphs: [
      "Operator dokłada starań, aby Serwis był dostępny w sposób ciągły. Operator zastrzega jednak prawo do przerw technicznych, prac konserwacyjnych oraz wdrożeń, które mogą skutkować czasową niedostępnością wybranych funkcjonalności.",
      "Operator zastrzega prawo do wycofania, zawieszenia lub modyfikacji poszczególnych funkcjonalności Serwisu z ważnych powodów, w szczególności technologicznych, biznesowych lub prawnych, z odpowiednim wyprzedzeniem, jeżeli zmiana wpływa na korzystanie z Serwisu.",
    ],
  },
  {
    id: "zmiany",
    ord: "§ 19",
    title: "Zmiany Regulaminu",
    paragraphs: [
      "Operator może dokonywać zmian Regulaminu z ważnych przyczyn, w szczególności: zmiany przepisów prawa, zmiany funkcjonalności Serwisu, zmiany zakresu współpracy z Partnerami, względów bezpieczeństwa, zmiany danych Operatora.",
      "O każdej zmianie Regulaminu Operator informuje poprzez publikację jednolitego tekstu Regulaminu w Serwisie oraz, w stosunku do Użytkowników korzystających z usług ciągłych — w sposób umożliwiający zapoznanie się ze zmianami z odpowiednim wyprzedzeniem.",
      "Do umów dotyczących Rezerwacji Hotelowych zawartych przed dniem wejścia w życie zmienionego Regulaminu stosuje się postanowienia Regulaminu obowiązujące w dniu rozpoczęcia procesu rezerwacji.",
    ],
  },
  {
    id: "spory",
    ord: "§ 20",
    title: "Rozwiązywanie sporów i prawo właściwe",
    paragraphs: [
      "Prawem właściwym dla Regulaminu i wszelkich stosunków prawnych z niego wynikających jest prawo polskie. Powyższe nie pozbawia Konsumenta ochrony wynikającej z bezwzględnie obowiązujących przepisów państwa jego miejsca zwykłego pobytu.",
      "Konsument ma możliwość skorzystania z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń, w tym w szczególności: zwrócenia się do powiatowego (miejskiego) rzecznika konsumentów, wojewódzkiego inspektora Inspekcji Handlowej lub skorzystania ze stałego polubownego sądu konsumenckiego.",
      "Konsument ma prawo skorzystać z unijnej platformy internetowej ODR (Online Dispute Resolution) prowadzonej przez Komisję Europejską, dostępnej pod adresem https://ec.europa.eu/consumers/odr/. Adres elektroniczny Operatora do kontaktu na potrzeby platformy ODR: " + operator.email + ".",
      "Sądem właściwym dla rozstrzygania sporów z Użytkownikami niebędącymi Konsumentami jest sąd właściwy miejscowo dla siedziby Operatora. Spory z Konsumentami rozstrzyga sąd właściwy zgodnie z ogólnymi przepisami procedury cywilnej.",
    ],
  },
  {
    id: "koncowe",
    ord: "§ 21",
    title: "Postanowienia końcowe",
    paragraphs: [
      `Niniejszy Regulamin wchodzi w życie w dniu ${EFFECTIVE_DATE}.`,
      "Jeżeli którekolwiek z postanowień Regulaminu okaże się nieważne lub bezskuteczne, pozostałe postanowienia zachowują moc obowiązującą, a postanowienie nieważne zastępuje się postanowieniem najbliższym celowi gospodarczemu pierwotnego postanowienia, dopuszczalnym przez prawo.",
      "W sprawach nieuregulowanych Regulaminem zastosowanie mają powszechnie obowiązujące przepisy prawa polskiego, w szczególności Kodeksu cywilnego, ustawy o świadczeniu usług drogą elektroniczną, ustawy o prawach konsumenta oraz RODO.",
      "Aktualna treść Regulaminu wraz z datą wejścia w życie dostępna jest pod adresem " + SITE_DOMAIN + "/regulamin.",
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

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Warunki korzystania z Serwisu
        </p>
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">Regulamin</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/82">
          Niniejszy dokument określa zasady świadczenia usług drogą elektroniczną w serwisie {SITE_NAME}, w tym usług
          informacyjnych, działania Planera, korzystania z Linków Afiliacyjnych oraz pośrednictwa technologicznego w
          Rezerwacji Hotelowej. Regulamin został zredagowany zgodnie z prawem polskim i UE i jest skonstruowany w sposób
          przejrzysty dla Konsumenta.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold text-emerald-800">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5">
            Wersja obowiązująca od:{" "}
            <time dateTime={EFFECTIVE_DATE_ISO} className="font-bold">
              {EFFECTIVE_DATE}
            </time>
          </span>
          <Link
            href="/polityka-prywatnosci"
            className="rounded-full border border-emerald-900/10 bg-white px-3 py-1.5 transition hover:bg-emerald-50"
          >
            Polityka prywatności →
          </Link>
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
        aria-label="Spis treści Regulaminu"
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
          {section.paragraphs?.map((p, idx) => (
            <p key={idx} className="mt-3 text-sm leading-7 text-emerald-900/82">
              {p}
            </p>
          ))}
          {section.list ? <RenderList items={section.list} /> : null}
          {section.numbered ? <RenderList items={section.numbered} ordered /> : null}
        </section>
      ))}

      {/* Stopka regulaminowa */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <h2 className="text-xl font-bold text-emerald-950">Kontakt w sprawach regulaminowych</h2>
        <p className="mt-3 text-sm leading-7 text-emerald-900/82">
          Pytania, reklamacje oraz wnioski związane z Regulaminem prosimy kierować na adres{" "}
          <a className="font-semibold text-emerald-700 underline-offset-2 hover:underline" href={`mailto:${operator.email}`}>
            {operator.email}
          </a>
          . Czas odpowiedzi na reklamacje: do 14 dni od dnia otrzymania zgłoszenia.
        </p>
        <p className="mt-3 text-xs leading-6 text-emerald-900/80">
          Wersja Regulaminu: {EFFECTIVE_DATE}. Operator: {operator.name}
          {operator.nip ? `, NIP ${operator.nip}` : ""}
          {operator.address ? `, ${operator.address}` : ""}.
        </p>
      </section>
    </main>
  );
}
