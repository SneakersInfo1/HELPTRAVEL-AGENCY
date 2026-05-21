import { getDestinationStory } from "./destination-content";
import { allDestinationProfiles, getDestinationProfileBySlug } from "./destinations";
import type { DestinationProfile } from "./types";

export interface EditorialFaq {
  question: string;
  answer: string;
}

export interface EditorialSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface EditorialArticle {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  hero: string;
  plannerPrompt: string;
  categorySlugs: string[];
  destinationSlugs: string[];
  practicalBullets: string[];
  sections: EditorialSection[];
  faq: EditorialFaq[];
}

export interface EditorialCategory {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  hero: string;
  articleSlugs: string[];
  destinationSlugs: string[];
}

export interface DestinationGuideOverrides {
  slug: string;
  overview: string;
  whyGo: string[];
  bestTime: string;
  budgetNote: string;
  whoFor: string[];
  highlights: string[];
  districts: string[];
  faq: EditorialFaq[];
}

export interface DestinationGuideContent extends DestinationGuideOverrides {
  destination: DestinationProfile;
}

const publishedDestinationSlugs = [
  "malaga-spain",
  "barcelona-spain",
  "valencia-spain",
  "lisbon-portugal",
  "rome-italy",
  "naples-italy",
  "budapest-hungary",
  "prague-czechia",
  "athens-greece",
  "valletta-malta",
  "larnaca-cyprus",
  "tirana-albania",
  "istanbul-turkey",
  "antalya-turkey",
  "marrakesh-morocco",
  "agadir-morocco",
  "berlin-germany",
  "amsterdam-netherlands",
  "dublin-ireland",
  "london-uk",
  "las-palmas-spain",
  "funchal-portugal",
] as const;

const destinationGuideOverrides: DestinationGuideOverrides[] = [
  {
    slug: "malaga-spain",
    overview:
      "Malaga to jeden z najmocniejszych kierunków dla osób, które chcą mieć plaże, zwiedzanie i prosty city break bez nadmiernej logistyki. Dobrze łączy klimat południa Hiszpanii z wygodnym lotem i szerokim wybórem noclegów.",
    whyGo: [
      "Łatwo połączyć wypoczynek nad morzem ze spacerami po starym mieście.",
      "Dobrze sprawdza się na 3-5 dni i nie wymaga bardzo wysokiego budżetu.",
      "Na miejscu łatwo zbudować plan: zabytki, punkty widokowe, tapas i plaża.",
    ],
    bestTime:
      "Najlepszy czas na wyjazd to marzec-maj oraz wrzesień-listopad. Latem Malaga jest bardzo słoneczna i goraca, ale poza szczytem sezonu łatwiej o lepszy balans ceny, pogody i komfortu.",
    budgetNote:
      "Na 4 dni budżet zwykle najlepiej rozkładac na lot, nocleg blisko centrum lub plaży, jedzenie i 1-2 płatne atrakcje. To kierunek, w którym da się rozsądnie planować bez schodzenia do poziomu bardzo niskiego standardu.",
    whoFor: [
      "dla par szukających lekkiego city breaku z klima",
      "dla osób, które chcą plaże i spacery po mieście",
      "dla wyjazdów 3-5 dni bez skomplikowanego planu",
    ],
    highlights: ["Alcazaba", "Gibralfaro", "La Malagueta", "Muelle Uno", "Mercado Atarazanas"],
    districts: ["Centro Historico", "La Malagueta", "Soho", "El Palo"],
    faq: [
      {
        question: "Czy Malaga jest dobra na pierwszy city break w Hiszpanii?",
        answer:
          "Tak. To jeden z łatwiejszych kierunków na start, bo daje prosty dojazd, czytelny układ miasta i dużo rzeczy do zrobienia w krótkim czasie.",
      },
      {
        question: "Ile dni warto przeznaczyc na Malage?",
        answer:
          "Najwygodniej planować 3-5 dni. Krotki weekend wystarczy na centrum i plaże, a przy 4-5 dniach można dorzucić więcej lokalnych miejsc albo wyjazd poza miasto.",
      },
    ],
  },
  {
    slug: "barcelona-spain",
    overview:
      "Barcelona jest mocna, gdy zależy Ci na dużym mieście z energia, architektura i odrobina klimatu nadmorskiego. To kierunek bardziej intensywny niż Malaga, ale bardzo atrakcyjny dla osób, które chcą czuc tempo miasta.",
    whyGo: [
      "Szybko robi wrażenie i daje dużo powodów do powrotu.",
      "Łączy architekture, gastronomię i życie więczórne z dostępem do plaży.",
      "Nadaje się zarówno na 4 dni, jak i dłuższy city break.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiące to kwiecień-czerwięc oraz wrzesień-październik. W lipcu i sierpniu jest największy tłok i najwyższe ceny, ale wtedy też najłatwiej połączyć miasto z plażą.",
    budgetNote:
      "Barcelona rzadko bywa najtansza, dlatego warto pilnować lokalizacji noclegu i kosztów jedzenia. Dobrze zaplanowany wyjazd nadal może być opłacalny, ale trzeba uważać na wysokie koszty centrum.",
    whoFor: [
      "dla osób, które lubia mocny miejski klimat",
      "dla par i grup szukających więczórnego zycia",
      "dla wyjazdów, gdzie liczą się architektura i design",
    ],
    highlights: ["Sagrada Familia", "Park Guell", "Barceloneta", "El Born", "La Boqueria"],
    districts: ["Eixample", "El Born", "Barceloneta", "Gracia"],
    faq: [
      {
        question: "Czy Barcelona nadaje się na tani weekend?",
        answer:
          "Może się udać, ale trzeba ostrożnie wybierać termin i nocleg. To raczej kierunek o średnim lub wyższym koszcie niż typowo budżetowy city break.",
      },
      {
        question: "Czy warto jechac do Barcelony tylko na 4 dni?",
        answer:
          "Tak. To jeden z najczestszych scenariuszy i przy dobrym planie 4 dni wystarcza na najmocniejsze miejsca i chwilę nad morzem.",
      },
    ],
  },
  {
    slug: "lisbon-portugal",
    overview:
      "Lizbona ma bardziej nastrojowy rytm niż wiele innych stolic Europy. Dobrze pasuje do osób, które lubia spacery, punkty widokowe, jedzenie i mniej oczywisty klimat niż klasyczne duze miasto.",
    whyGo: [
      "Miasto jest charakterystyczne i dobrze zapamietywane nawet po krótkim wyjezdzie.",
      "Daje dużo widoków, lokalnych dzielnic i spokojniejszej atmosfery.",
      "Bardzo dobrze działa na 4-5 dni z lekkim planem i przerwami na jedzenie.",
    ],
    bestTime:
      "Wiosna i wczesna jesień są zwykle najlepsze. Zima jest łagodna, a lato przyjemne, ale najbardziej komfortowy balans temperatur i tłoku wypada poza szczytem sezonu.",
    budgetNote:
      "Budżet w Lizbonie warto planować z zapasem na poruszanie się po mieście i jedzenie w bardziej klimatycznych miejscach. To kierunek, gdzie przyjemność wyjazdu często zależy od dobrego rozkładu dnia, nie od ekstremalnego oszczędzania.",
    whoFor: [
      "dla osób, które lubia klimat i spacery",
      "dla par na krótki wyjazd z charakterem",
      "dla city breaku z widokami i spokojniejszym rytmem",
    ],
    highlights: ["Alfama", "Baixa", "Belem", "LX Factory", "punkty widokowe"],
    districts: ["Alfama", "Baixa", "Bairro Alto", "Belem"],
    faq: [
      {
        question: "Czy Lizbona jest dobra na pierwszy wyjazd do Portugalii?",
        answer:
          "Tak, bo daje dobry miks miejskich atrakcji, lokalnego klimatu i prostego planowania. Na pierwszy wyjazd 4-5 dni sprawdza się bardzo dobrze.",
      },
      {
        question: "Czy w Lizbonie trzeba wynajmowac auto?",
        answer:
          "Nie. Na city break auto najczęściej nie jest potrzebne, a poruszanie się po mieście najlepiej opierać na spacerach i transporcie miejskim.",
      },
    ],
  },
  {
    slug: "rome-italy",
    overview:
      "Rzym to klasyk, ale nadal bardzo mocny contentowo i komercyjnie. Dobrze sprawdza się dla osób, które chcą dużego nazwiska, ikon miasta i bardzo czytelnego powodu wyjazdu.",
    whyGo: [
      "To kierunek, który jest zrozumialy dla kazdego i łatwo go sprzedac treściowo.",
      "Najwazniejsze atrakcje są mocne już przy pierwszym wyjezdzie.",
      "Rzym bardzo dobrze sprawdza się na 3-4 dni i ma silny potencjał na SEO.",
    ],
    bestTime:
      "Najwygodniejsze terminy to marzec-maj i październik-listopad. W wakacje bywa bardzo gorąco i bardziej tloczno, dlatego wiele osób woli poza sezonem.",
    budgetNote:
      "W Rzymie łatwo przepalić budżet na lokalizacji i restauracjach przy głównej trasie. Najlepiej szukać balansu: dobra baza noclegowa, sensowne tempo i kilka kluczowych atrakcji zamiast próbowania zrobić wszystkiego naraz.",
    whoFor: [
      "dla osób stawiajacych na klasyczne zwiedzanie",
      "dla par i pierwszych city breakow",
      "dla wyjazdów 3-4 dni z mocnymi ikonami miasta",
    ],
    highlights: ["Koloseum", "Fontanna di Trevi", "Watykan", "Panteon", "Zatybrze"],
    districts: ["Centro Storico", "Monti", "Trastevere", "Prati"],
    faq: [
      {
        question: "Ile dni trzeba na Rzym?",
        answer:
          "Najczestszy i najwygodniejszy scenariusz to 3-4 dni. To wystarczy na najbardziej znane miejsca i przyjemniejsze tempo bez biegania od zabytku do zabytku.",
      },
      {
        question: "Czy Rzym pasuje do budżetu do 2000 zl?",
        answer:
          "Przy dobrych terminach i ostroznym doborze noclegu bywa to mozliwe, ale Rzym czesciej jest kierunkiem, w którym warto zostawic sobie trochę więcej marginesu.",
      },
    ],
  },
  {
    slug: "budapest-hungary",
    overview:
      "Budapeszt jest jednym z najlepszych kierunków dla osób, które chcą dobrego stosunku ceny do jakości. Nadaje się do krótkich wyjazdów, romantycznych weekendow i budżetowych city breakow z Polski.",
    whyGo: [
      "To kierunek o bardzo dobrym balansie ceny, wygody i klimatu miasta.",
      "Mocne strony to termy, panoramy, spacery i więczórne życie nad Dunajem.",
      "Bardzo dobrze wypada przy budżetach, które nie pozwalają na drozsze stolice Zachodu.",
    ],
    bestTime:
      "Wiosna i wczesna jesień są zwykle najprzyjemniejsze. Zima nadal ma sens ze względu na termy i klimat miasta, ale wtedy plan warto bardziej opierać o wnętrza i spokojne tempo.",
    budgetNote:
      "Budapeszt dobrze znosi niższe budżety. Przy rozsądnym planie można zrobić udany wyjazd na 3-4 dni i nadal mieć miejsce na jedzenie, termy i więczórne wyjście.",
    whoFor: [
      "dla osób szukających dobrej relacji cena-jakość",
      "dla par na weekend",
      "dla city breaku z więczórnym klimatem",
    ],
    highlights: ["Parlament", "Baszty Rybackie", "termy", "wzgorze Gellerta", "nabrzeze Dunaju"],
    districts: ["Belvaros", "Buda", "Zydowska dzielnica", "okolice Parlamentu"],
    faq: [
      {
        question: "Czy Budapeszt nadaje się na pierwszy city break za granice?",
        answer:
          "Tak. To bardzo bezpieczny wybór na start, bo jest prosty logistycznie, atrakcyjny cenowo i latwy do zaplanowania.",
      },
      {
        question: "Czy 2-3 dni wystarcza na Budapeszt?",
        answer:
          "Na szybki wypad tak, ale 3-4 dni pozwalają lepiej połączyć zwiedzanie, termy i spokojniejsze odkrywanie miasta.",
      },
    ],
  },
  {
    slug: "prague-czechia",
    overview:
      "Praga jest jednym z najłatwiejszych kierunków na weekendowy city break z Polski. Mocno działa na osóby, które chcą pewnego wyjazdu: klimatyczne stare miasto, dobra gastronomia i prosty plan.",
    whyGo: [
      "Jest blisko, czytelnie i bardzo dobrze nadaje się na 2-3 dni.",
      "Dobrze wypada kosztówo przy wyjazdach we dwoje i krótkich terminach.",
      "Ma jeden z najbardziej rozpoznawalnych klimatow miejskich w Europie Srodkowej.",
    ],
    bestTime:
      "Najlepiej sprawdza się od kwietnia do czerwca oraz od września do listopada. Zima też ma sens, jeśli celem jest bardziej klimat miasta niż długie spacery bez przerw.",
    budgetNote:
      "Praga jest mocna przy krótkim wyjezdzie i średnim budzecie. To kierunek, gdzie duza czesc atrakcji daje się zobaczyć spacerem, co upraszcza plan i ogranicza koszty.",
    whoFor: [
      "dla weekendowych wyjazdów z Polski",
      "dla par i grup szukających klasycznego city breaku",
      "dla osób, które chcą blisko i bez duzej logistyki",
    ],
    highlights: ["Most Karola", "Hradczany", "Rynek Starego Miasta", "Mala Strana", "punkty widokowe"],
    districts: ["Stare Miasto", "Mala Strana", "Nowe Miasto", "Vinohrady"],
    faq: [
      {
        question: "Czy Praga jest dobra na wyjazd bez samolotu?",
        answer:
          "Tak. W zaleznosci od miasta startowego wiele osób wybiera też pociag lub samochod, co dodatkowo poszerza grupe odbiórcow tej strony.",
      },
      {
        question: "Czy Praga nadal jest dobrym kierunkiem przy ograniczonym budzecie?",
        answer:
          "Tak, szczególnie na 2-3 dni. Trzeba jednak pilnować noclegu w dobrym terminie, bo popularne weekendy potrafią być drozsze.",
      },
    ],
  },
  {
    slug: "athens-greece",
    overview:
      "Ateny są dobrym wybórem dla osób, które chcą mieć mocny historyczny kierunek, słońce i opcje dorzucenia nadmorskiego klimatu. To nie jest tylko muzeum pod chmurka, ale też miasto na krótki, intensywny wyjazd.",
    whyGo: [
      "Silny miks historii, lokalnej kuchni i miejskiego rytmu.",
      "Łatwo zbudować plan 3-4 dni bez poczucia niedosytu.",
      "Dobrze pasuje do osób, które chcą ciepło i zwiedzanie w jednym.",
    ],
    bestTime:
      "Ateny najlepiej wyglądają wiosna i jesienią. Lato jest bardzo gorące, ale nadal popularne, szczególnie gdy wyjazd łączy miasto z nadmorskim odpoczynkiem.",
    budgetNote:
      "Budżet trzeba planować pod wejścia do głównych atrakcji i nocleg z dobrym dojazdem. Przy dobrze wybranym terminie Ateny nadal mogą być opłacalnym city breakiem.",
    whoFor: [
      "dla osób, które chcą ciepło i zabytki",
      "dla krótkiego urlopu 3-4 dni",
      "dla wyjazdów, gdzie duze znaczenie ma lokalna kuchnia",
    ],
    highlights: ["Akropol", "Plaka", "Monastiraki", "wzgorze Likavitos", "Ateńska agora"],
    districts: ["Plaka", "Monastiraki", "Koukaki", "Syntagma"],
    faq: [
      {
        question: "Czy Ateny są bardziej kierunkiem na zwiedzanie czy na relaks?",
        answer:
          "Na sam city break to głównie zwiedzanie, ale przy dobrym planie można też dorzucić bardziej relaksujace momenty i nadmorski klimat.",
      },
      {
        question: "Czy Ateny nadają się na 4 dni?",
        answer:
          "Tak. To bardzo dobry format, bo pozwala zobaczyć najważniejsze miejsca i nie spieszyc się przez cały wyjazd.",
      },
    ],
  },
  {
    slug: "valletta-malta",
    overview:
      "Malta dobrze pasuje do osób, które chcą słońce, wygodny krótki wyjazd i miks miasta z morskim klimatem. To kierunek czytelny, kompaktowy i dobry dla polskiego odbiórcy planujacego 4-5 dni.",
    whyGo: [
      "Wyspa daje dużo wrazen na niewielkiej przestrzeni.",
      "Łatwo zbudować plan bez ciaglego przemieszczania się.",
      "To dobry kierunek dla osób, które lubia jasny, słoneczny klimat i widoki.",
    ],
    bestTime:
      "Najwygodniej planować od marca do czerwca oraz od września do listopada. Malta jest mocna też zima, jeśli celem jest ucieczka od polskiej pogody i nie zależy Ci na pełnym plażowaniu.",
    budgetNote:
      "Malta nie zawsze jest najtansza, ale dobrze działa przy krótszym wyjezdzie. W budzecie warto pilnować noclegu, bo lokalizacja potrafi mocno zmienic cały odbiór wyjazdu.",
    whoFor: [
      "dla par i krótkich urlopow",
      "dla osób szukających słońca poza sezonem",
      "dla wyjazdu z widokami i spokojnym tempem",
    ],
    highlights: ["Valletta", "Mdina", "Three Cities", "nabrzeze", "punkty widokowe"],
    districts: ["Valletta", "Sliema", "St. Julian's", "Three Cities"],
    faq: [
      {
        question: "Czy Malta pasuje na 4 dni?",
        answer:
          "Tak. To jeden z najlepszych formatow, bo wyspa jest kompaktowa i w 4 dni można zobaczyć sporo bez przemeczenia.",
      },
      {
        question: "Czy Malta nadaje się na wyjazd poza sezonem?",
        answer:
          "Tak, bardzo. Wlasnie wtedy często wypada najlepiej dla osób, które szukają słońca, ale nie potrzebuja pełnego wakacyjnego sezonu.",
      },
    ],
  },
  {
    slug: "larnaca-cyprus",
    overview:
      "Cypr jest mocny dla osób, które chcą ciepło, bezpieczny wyjazd i prosty model słońce plus morze plus odrobina zwiedzania. Larnaka dobrze spina ten scenariusz dla polskiego odbiórcy.",
    whyGo: [
      "To wygodny kierunek na 4-7 dni z naciskiem na odpoczynek.",
      "Dobrze sprawdza się poza głównym sezonem letnim.",
      "Łatwo połączyć plaże z lekkim planem miejskim i wycieczkami.",
    ],
    bestTime:
      "Wiosna oraz jesień są zwykle najprzyjemniejsze. Latem jest bardzo gorąco, ale to nadal naturalny czas dla osób nastawionych głównie na plażę.",
    budgetNote:
      "Przy planowaniu budżetu warto uwzglednic transfery i standard noclegu, bo to mocno wpływa na odbiór całego wyjazdu. Sam kierunek jest nadal stosunkowo prosty do zorganizowania.",
    whoFor: [
      "dla osób, które stawiaja na słońce i spokój",
      "dla par i wyjazdów na 5-7 dni",
      "dla tych, którzy chcą ciepłego kierunku bez skomplikowanego planu",
    ],
    highlights: ["promenada Finikoudes", "plaże", "kosciol sw. Lazarza", "lokalne tawerny", "okolice Ayia Napy"],
    districts: ["centrum Larnaki", "Finikoudes", "Mackenzie", "okolice portu"],
    faq: [
      {
        question: "Czy Larnaka to kierunek głównie plażowy?",
        answer:
          "Tak, ale nie tylko. Dobrze działa w modelu spokojnego wyjazdu z jedna lub dwiema wycieczkami i prostym rytmem dnia.",
      },
      {
        question: "Na ile dni warto leciec na Cypr?",
        answer:
          "Najczęściej 5-7 dni. Krotszy wyjazd nadal ma sens, ale ten kierunek dobrze wygląda przy nieco spokojniejszym tempie.",
      },
    ],
  },
  {
    slug: "istanbul-turkey",
    overview:
      "Stambul jest dla osób, które chcą bardzo mocnego miejskiego kierunku z jedzeniem, historia i energia dużego miasta. To nie jest spokojny city break, ale świetny kierunek dla tych, którzy lubia intensywny klimat.",
    whyGo: [
      "To jedno z najbardziej charakterystycznych miast w zasiegu krótkiego lotu.",
      "Daje ogrom treści pod przewodniki, foodie content i city break.",
      "Dobrze łączy wartosc historyczna z życiem codzieńnym i lokalnym rytmem.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiące to kwiecień-czerwięc i wrzesień-listopad. Lato jest ciepłe i intensywne, ale dla wielu osób nadal bardzo atrakcyjne.",
    budgetNote:
      "Stambul daje sporo za swoj koszt, ale warto planować margines na jedzenie, przejazdy i bardziej komfortowa baze noclegowa. To miasto, w którym lokalizacja noclegu bardzo zmienia wygodę wyjazdu.",
    whoFor: [
      "dla osób, które lubia duze miasta",
      "dla foodie tripow i intensywnego zwiedzania",
      "dla city breaku z charakterem i historia",
    ],
    highlights: ["Hagia Sophia", "Blekitny Meczet", "Bazar", "Galata", "Bosfor"],
    districts: ["Sultanahmet", "Karakoy", "Galata", "Kadikoy"],
    faq: [
      {
        question: "Czy Stambul nadaje się na 3 dni?",
        answer:
          "Tak, ale to raczej intensywny format. Najlepiej wypada 4-5 dni, kiedy da się trochę zwolnic i poczuc miasto.",
      },
      {
        question: "Czy to dobry kierunek dla osób, które lubia jedzenie?",
        answer:
          "Zdecydowanie tak. Kuchnia i rytm miasta są jednym z najmocniejszych powodów, by wybrać ten kierunek.",
      },
    ],
  },
  {
    slug: "antalya-turkey",
    overview:
      "Antalya to mocny kierunek dla osób, które stawiaja na ciepło, morze i wygodny wypoczynek. Lepiej działa jako krótki urlop niż klasyczny city break, ale dla wielu uzytkownikow to właśnie taki kierunek bedzie najbardziej praktyczny.",
    whyGo: [
      "To prosty model: słońce, plaże i hotelowy komfort.",
      "Dobrze wypada dla wyjazdów 5-7 dni i wyższego nacisku na relaks.",
      "Można go sprzedac treściowo jako ciepły kierunek z Polski.",
    ],
    bestTime:
      "Najlepiej sprawdza się od mają do października. Wysoki sezon daje najwięcej opcji plażowych, a poza szczytem łatwiej złapać lepszy balans ceny do pogody.",
    budgetNote:
      "Budżet zależy mocno od standardu noclegu i formule wyjazdu. Sama destynacja daje szeroki zakres opcji, od bardziej budżetowych po wygodniejszy wypoczynek.",
    whoFor: [
      "dla osób nastawionych na słońce i morze",
      "dla krótkiego urlopu 5-7 dni",
      "dla par i wyjazdów z mocnym akcentem relaksu",
    ],
    highlights: ["stare miasto Kaleici", "plaże", "wodospady", "wycieczki w okolice", "widoki na wybrzeze"],
    districts: ["Kaleici", "Konyaalti", "Lara", "okolice mariny"],
    faq: [
      {
        question: "Czy Antalya to bardziej wakacje czy city break?",
        answer:
          "Zdecydowanie bardziej krótkie wakacje i wypoczynek niż klasyczny city break. Da się tu zwiedzac, ale główny atut to słońce i wygoda wyjazdu.",
      },
      {
        question: "Na ile dni najlepiej planować Antalya?",
        answer:
          "Najlepiej 5-7 dni. Krotszy wyjazd też ma sens, ale ten kierunek lepiej wypada przy spokojniejszym rytmie.",
      },
    ],
  },
  {
    slug: "marrakesh-morocco",
    overview:
      "Marrakesz jest dla osób, które szukają mocno innego klimatu, ciepła i intensywnego miejskiego doswiadczenia. To bardzo dobry kandydat do scenariuszy typu ciepło, bez wizy, cos innego niż Europa.",
    whyGo: [
      "Daje wyraźny kontrast wobec klasycznych europejskich city breakow.",
      "Dobrze wygląda w contentach o ciepłych kierunkach i wyjazdach bez wizy.",
      "Łatwo zbudować z niego mocna historie: kolory, jedzenie, medyna, targi i riady.",
    ],
    bestTime:
      "Najlepiej wypada od października do kwietnia. Latem temperatury potrafią być bardzo wysokie, dlatego wiele osób wybiera właśnie sezony przejsciowe.",
    budgetNote:
      "Marrakesz często dobrze wygląda przy budzecie średnim, ale trzeba uczciwie liczyc koszty lotu i noclegu. To kierunek bardziej egzotyczny, ale nadal mozliwy do ogarniecia bez wielkiego budżetu.",
    whoFor: [
      "dla osób szukających czegos innego niż klasyczna Europa",
      "dla wyjazdów bez wizy z Polski",
      "dla krótkich wyjazdów z mocnym klimatem miejsca",
    ],
    highlights: ["medyna", "Jemaa el-Fnaa", "ogrody", "riady", "lokalna kuchnia"],
    districts: ["medyna", "Gueliz", "Hivernage", "Kasbah"],
    faq: [
      {
        question: "Czy Marrakesz nadaje się na 4-5 dni?",
        answer:
          "Tak. To bardzo dobry format, bo wystarcza na wejście w klimat miasta, kilka atrakcji i spokojniejszy rytm bez poczucia przesytu.",
      },
      {
        question: "Czy Marrakesz jest dobry dla osób szukających ciepła poza sezonem?",
        answer:
          "Tak. To jeden z kierunków, który bardzo dobrze wypada jesienią, zima i wczesna wiosna, gdy wiele osób z Polski szuka słońca i wyraznego odcięcia od codzieńnosci.",
      },
    ],
  },
  {
    slug: "agadir-morocco",
    overview:
      "Agadir jest spokojniejszym marokanskim kierunkiem niż Marrakesz i lepiej pasuje do osób, które stawiaja na plażę, słońce i prostszy model wypoczynku. To dobry kontrapunkt w treściach o ciepłych kierunkach.",
    whyGo: [
      "Dobrze wypada dla osób, które chcą Maroko w łagodniejszej wersji.",
      "Ma mocniejszy profil plażowy niż typowo miejski.",
      "Nadaje się do zestawien ciepło i relaks oraz plażą plus lokalny klimat.",
    ],
    bestTime:
      "Najlepiej sprawdza się od jesieńi do wiosny. Wtedy dobrze wpisuje się w potrzebę ucieczki od chlodniejszej pogody w Polsce.",
    budgetNote:
      "Agadir dobrze wypada przy budżetach średnich, ale trzeba liczyc lot i standard noclegu. Dla wielu osób to kierunek bardziej relaksacyjny niż typowo budżetowy city break.",
    whoFor: [
      "dla osób nastawionych na plażę i spokój",
      "dla par i krótkich wakacji",
      "dla wyjazdu z ciepłem poza głównym sezonem europejskim",
    ],
    highlights: ["plaża", "promenada", "marina", "lokalne targi", "punkty widokowe"],
    districts: ["promenada", "centrum", "marina", "okolice plaży"],
    faq: [
      {
        question: "Czy Agadir jest bardziej na plażę niż na zwiedzanie?",
        answer:
          "Tak. To kierunek mocniej wypoczynkowy, dlatego najlepiej pasuje do osób, które chcą słońce, morze i prosty rytm dnia.",
      },
      {
        question: "Na ile dni najlepiej leciec do Agadiru?",
        answer:
          "Najlepiej 5-7 dni, chociaz krótszy wyjazd też ma sens, jeśli zależy Ci na szybkiej ucieczce do ciepłego miejsca.",
      },
    ],
  },
  {
    slug: "las-palmas-spain",
    overview:
      "Las Palmas gra role kanaryjskiego kierunku dla osób, które szukają ciepła wtedy, gdy Europa kontynentalna nie daje już takiej pogody. To dobry temat pod content o zimowych i poza sezonowych wyjazdach.",
    whyGo: [
      "To jeden z mocniejszych kierunków na słońce zima.",
      "Łatwo sprzedac go treściowo jako ucieczke od polskiej pogody.",
      "Dobrze łączy miejski klimat wyspy z plażąmi i bardziej urlopowym rytmem.",
    ],
    bestTime:
      "Najwieksza przewaga tego kierunku to jesień, zima i wczesna wiosna. Wlasnie wtedy Las Palmas ma najmocniejszy sens dla polskiego odbiórcy.",
    budgetNote:
      "Lot bywa dłuższy i to trzeba uczciwie zaznaczyc. Przy zimowym wyjezdzie wiele osób akceptuje ten kompromis, bo w zamian dostaje wyraznie lepsza pogodę.",
    whoFor: [
      "dla osób szukających ciepła zima",
      "dla wyjazdów 5-7 dni",
      "dla tych, którzy chcą połączyć miasto i plaże",
    ],
    highlights: ["Las Canteras", "stare miasto", "punkty widokowe", "wyspiarski klimat", "spacery nad oceanem"],
    districts: ["Las Canteras", "Vegueta", "Triana", "okolice nabrzeza"],
    faq: [
      {
        question: "Czy Las Palmas nadaje się na zimowy wyjazd z Polski?",
        answer:
          "Tak, i to jest jeden z najmocniejszych argumentow za tym kierunkiem. Wlasnie w chlodniejszych miesiącach wypada szczególnie atrakcyjnie.",
      },
      {
        question: "Czy to bardziej city break czy urlop?",
        answer:
          "To cos pomiedzy. Ma miejska baze, ale najczęściej lepiej wypada jako krótkie wakacje niż bardzo szybki city break.",
      },
    ],
  },
  {
    slug: "funchal-portugal",
    overview:
      "Funchal i Madera pasują do osób, które szukają krajobrazow, natury i spokojniejszego rytmu. To świetny kierunek do contentów o krótkim urlopie, aktywnym wypoczynku i ciepłych wyjazdach poza sezonem.",
    whyGo: [
      "To mocny kierunek dla natury, widoków i aktywnego odpoczynku.",
      "Dobrze odroznia się od klasycznych city breakow z Europy.",
      "Ma silny potencjał pod przewodniki i treści o krótkim urlopie.",
    ],
    bestTime:
      "Madera jest atrakcyjna przez duza czesc roku, ale najwięcej sensu ma zwykle wiosna, jesienią i zima, gdy szukasz łagodnej pogody oraz zielonego otoczenia.",
    budgetNote:
      "Budżet trzeba liczyc z mysla o charakterze wyspy: nocleg, transport i aktywnosci terenowe. To mniej kierunek na bardzo tani wypad, a bardziej na dobrze zaplanowany krótki urlop.",
    whoFor: [
      "dla osób, które lubia naturę i widoki",
      "dla par na spokojniejszy wyjazd",
      "dla krótkich wakacji zamiast klasycznego city breaku",
    ],
    highlights: ["punkty widokowe", "lewady", "Funchal", "ogrody", "nadmorskie spacery"],
    districts: ["centrum Funchal", "okolice portu", "wzgorza", "strefy widokowe"],
    faq: [
      {
        question: "Czy Funchal pasuje na 4 dni?",
        answer:
          "Tak, ale przy 5-6 dniach kierunek wypada jeszcze lepiej. To miejsce, które korzysta na spokojniejszym rytmie i czasie na naturę.",
      },
      {
        question: "Czy to dobry kierunek dla osób, które nie lubia samego lezenia na plaży?",
        answer:
          "Tak, zdecydowanie. Najmocniej wygrywa tu widok, natura i aktywne odkrywanie wyspy.",
      },
    ],
  },
  {
    slug: "valencia-spain",
    overview:
      "Walencja to jeden z najlepszych kompromisow miedzy klasycznym city breakiem a wyjazdem z oddechem. Daje plaże, dobre jedzenie, nowoczesna architekture i mniej przytłącząjace tempo niż Barcelona.",
    whyGo: [
      "Bardzo dobrze łączy miejski rytm z dostępem do morza i szerokich spacerowych stref.",
      "Dobrze wypada dla osób, które chcą Hiszpanii, ale mniej chaosu niż w największych miastach.",
      "Nadaje się na 4-5 dni i dobrze znosi scenariusz plażą plus zwiedzanie.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiące to kwiecień-czerwięc oraz wrzesień-listopad. Wysokie lato nadal ma sens, ale poza szczytem sezonu łatwiej o przyjemniejszy rytm miasta i niższa presje cenowa.",
    budgetNote:
      "Walencja dobrze wygląda przy budzecie średnim. Nie jest tak tania jak Budapeszt czy Praga, ale często daje bardzo dobry stosunek jakości pobytu do finalnego kosztu.",
    whoFor: [
      "dla osób, które chcą Hiszpanii bez przesadnie intensywnego tempa",
      "dla par i wyjazdów 4-5 dni",
      "dla scenariuszy plaża plus zwiedzanie",
    ],
    highlights: ["Miasto Sztuki i Nauki", "plaża Malvarrosa", "stare miasto", "Mercado Central", "Turia"],
    districts: ["Ciutat Vella", "Ruzafa", "El Carmen", "okolice Turii"],
    faq: [
      {
        question: "Czy Walencja jest lepsza od Barcelony na spokojniejszy wyjazd?",
        answer:
          "Dla wielu osób tak. Nadal daje Hiszpanie, plaże i dobre jedzenie, ale zwykle z mniejszym tłokiem i spokojniejszym rytmem niż Barcelona.",
      },
      {
        question: "Ile dni najlepiej zaplanować na Walencje?",
        answer:
          "Najlepiej 4-5 dni. To format, w którym dobrze da się połączyć centrum, nowoczesne strefy i chwilę nad morzem.",
      },
    ],
  },
  {
    slug: "naples-italy",
    overview:
      "Neapol jest kierunkiem dla osób, które chcą intensywnego klimatu południowych Wloch, mocnej kuchni i miasta z charakterem. To nie jest wypolerowany city break, ale właśnie dlatego daje bardzo mocne wrażenie miejsca.",
    whyGo: [
      "Jedzenie i lokalny rytm miasta są same w sobie bardzo mocnym powodem wyjazdu.",
      "To dobry kierunek dla osób, które chcą zobaczyć bardziej surowa i autentyczna strone Wloch.",
      "Dobrze łączy się z pomyslem na 3-4 dni w mieście lub z szerszym planem wokol Kampanii.",
    ],
    bestTime:
      "Najlepiej planować Neapol na wiosne i jesień, gdy temperatury sprzyjaja spacerom i wyjazdom po okolicy. Lato bywa bardziej meczace, szczególnie przy intensywnym zwiedzaniu.",
    budgetNote:
      "Neapol potrafi być rozsądniejszy kosztówo niż Rzym czy Mediolan, ale warto pilnować lokalizacji noclegu i logistyki pierwszego dnia. To kierunek, gdzie wygoda bazy noclegówej ma duze znaczenie.",
    whoFor: [
      "dla foodie tripow i intensywnych miejskich wyjazdów",
      "dla osób, które lubia surowy lokalny klimat",
      "dla 3-4 dni we Wloszech bez zbednego polerowania",
    ],
    highlights: ["Spaccanapoli", "historyczne centrum", "nabrzeze", "pizza", "punkty startowe na Pompeje i Wezuwiusz"],
    districts: ["Centro Storico", "Chiaia", "Quartieri Spagnoli", "okolice nabrzeza"],
    faq: [
      {
        question: "Czy Neapol to dobry pierwszy city break we Wloszech?",
        answer:
          "Tak, ale raczej dla osób, które lubia miasta z mocnym charakterem. Jeśli szukasz bardziej klasycznego i przewidywalnego scenariusza, prostszy może być Rzym.",
      },
      {
        question: "Czy na Neapol wystarcza 3 dni?",
        answer:
          "Tak. To jeden z tych kierunków, które potrafią zrobić wrażenie już przy 3 dniach, jeśli plan jest dobrze ustawiony.",
      },
    ],
  },
  {
    slug: "tirana-albania",
    overview:
      "Tirana to ciekawy kierunek dla osób, które szukają mniej oczywistego miasta na city break i chcą połączyć niższy koszt z poczuciem odkrywania czegos mniej oklepanego. Daje miejski klimat, prostszy budżet i dobry punkt startowy do dalszego poznawania Albanii.",
    whyGo: [
      "Dobrze sprawdza się dla osób, które chcą nowego kierunku bez presji najdroższych stolic Europy.",
      "To mocny kandydat do treści o tanich wyjazdach i mniej oczywistych city breakach.",
      "Przy krótszym pobyćie daje miejski klimat, a przy 4-5 dniach można myslec też o okolicy.",
    ],
    bestTime:
      "Najprzyjemniejsze miesiące to kwiecień-czerwięc i wrzesień-październik. Wtedy Tirana daje przyjemniejszy balans pogody i miejskiego tempa.",
    budgetNote:
      "To jeden z kierunków, który często dobrze wypada przy ograniczonym budzecie. Nadal warto jednak patrzec na całość wyjazdu: lot, lokalizacje noclegu i plan dnia.",
    whoFor: [
      "dla osób szukających mniej oczywistych miast",
      "dla budżetowych city breakow",
      "dla wyjazdów 3-4 dni z poczuciem odkrywania nowego kierunku",
    ],
    highlights: ["Plac Skanderbega", "Bunk'Art", "kawiarnie", "kolejka Dajti", "miejskie życie więczórne"],
    districts: ["Blloku", "centrum", "okolice placu Skanderbega", "rejony kawiarniane"],
    faq: [
      {
        question: "Czy Tirana nadaje się na tani city break?",
        answer:
          "Tak, to jedna z jej mocniejszych stron. Przy dobrze dobranym locie i rozsądnym noclegu potrafi bardzo dobrze wypasc kosztówo.",
      },
      {
        question: "Czy Tirana jest dobrym kierunkiem dla osób, które byly już w klasycznych stolicach Europy?",
        answer:
          "Tak. Wlasnie wtedy daje dodatkowa wartosc, bo pokazuje mniej oczywisty miejski klimat i nie jest kopia najpopularniejszych tras city breakowych.",
      },
    ],
  },
  {
    slug: "berlin-germany",
    overview:
      "Berlin jest dobrym kierunkiem dla osób, które szukają dużego europejskiego miasta z muzeami, dzielnicami i bardzo wyraźnym charakterem. To mocny kandydat do city breakow dla osób, które cenią kulture, gastro i miejski rytm bardziej niż klasyczne odhaczanie ikon.",
    whyGo: [
      "Daje ogrom treści: muzea, architekture, dzielnice i bardzo mocny klimat miejski.",
      "Dobrze pasuje do wyjazdów 3-4 dni i do odbiórcy, który lubi odkrywac miasto warstwami.",
      "To mocny kierunek pod publiczny travel content, bo dobrze łączy praktyke z wyrazna tozsamoscia miejsca.",
    ],
    bestTime:
      "Berlin najlepiej sprawdza się od kwietnia do czerwca oraz we wrzesniu i październiku. To miesiące, w których spacery i tempo miasta są najbardziej komfortowe.",
    budgetNote:
      "Berlin bywa średni lub wyższy kosztówo, ale nadal da się go zaplanować rozsądnie. Kluczowe jest znalezienie dobrej bazy w dzielnicy, która nie utrudnia poruszania się po mieście.",
    whoFor: [
      "dla osób lubiacych muzea, dzielnice i gastronomię",
      "dla city breakow z miejskim rytmem zamiast typowego sightseeingu",
      "dla wyjazdów 3-4 dni z naciskiem na kulture",
    ],
    highlights: ["Wyspa Muzeow", "East Side Gallery", "Mitte", "Kreuzberg", "Prenzlauer Berg"],
    districts: ["Mitte", "Kreuzberg", "Prenzlauer Berg", "Neukolln"],
    faq: [
      {
        question: "Czy Berlin pasuje na pierwszy city break do Niemieć?",
        answer:
          "Tak. To bardzo mocny wybór, szczególnie jeśli bardziej od klasycznych zabytkow interesuje Cie nowoczesne duze miasto z warstwami i klimatem.",
      },
      {
        question: "Ile dni warto przeznaczyc na Berlin?",
        answer:
          "Najlepiej 3-4 dni. Taki format pozwala zobaczyć kilka roznych dzielnic i nie robic wyjazdu w zbyt dużym pospiechu.",
      },
    ],
  },
  {
    slug: "amsterdam-netherlands",
    overview:
      "Amsterdam to kierunek mocny dla osób, które szukają kompaktowego miasta o wysokiej jakości spaceru, estetyce i bardzo czytelnym miejskim klimacie. Dobrze działa na 3-4 dni i ma silna rozpoznawalnosc dla polskiego odbiórcy.",
    whyGo: [
      "Miasto jest kompaktowe i bardzo dobrze nadaje się do zwiedzania bez rozbudowanej logistyki.",
      "To mocny kierunek dla par, weekendowych wypadów i scenariuszy z naciskiem na klimat miejsca.",
      "Bardzo dobrze wygląda treściowo: kanały, muzea, dzielnice i spokojniejszy rytm dnia.",
    ],
    bestTime:
      "Najbardziej komfortowe są wiosna oraz wczesna jesień. To czas, w którym Amsterdam daje najlepszy balans pogody, spaceru i klimatu miasta.",
    budgetNote:
      "Amsterdam rzadko jest kierunkiem budżetowym, dlatego trzeba uczciwie komunikować wyższe koszty noclegów. Nadal jednak wiele osób uznaje go za kierunek wart dopłaty ze względu na jakość pobytu.",
    whoFor: [
      "dla par i estetycznych city breakow",
      "dla osób, które lubia kompaktowe miasta",
      "dla 3-4 dni z naciskiem na muzealny i spacerowy rytm",
    ],
    highlights: ["kanały", "Jordaan", "muzea", "Vondelpark", "de 9 straatjes"],
    districts: ["Jordaan", "centrum", "De Pijp", "Museumplein"],
    faq: [
      {
        question: "Czy Amsterdam nadaje się na weekend we dwoje?",
        answer:
          "Tak, to jeden z jego najmocniejszych scenariuszy. Miasto jest zwarte, klimatyczne i dobrze działa przy spokojniejszym rytmie.",
      },
      {
        question: "Czy Amsterdam jest dobrym kierunkiem przy ograniczonym budzecie?",
        answer:
          "Raczej nie jest to najtańszy wybór. To kierunek, który bardziej wygrywa klimatem i jakościa miasta niż sama niska cena.",
      },
    ],
  },
  {
    slug: "dublin-ireland",
    overview:
      "Dublin pasuje do osób, które chcą prostego, anglojęzycznego city breaku z pubami, muzyka na żywo i klimatem miasta, które dobrze sprawdza się na szybki wyjazd. To kierunek bardziej o atmosferze niż o długiej liście ikon.",
    whyGo: [
      "To prosty format na 2-4 dni z bardzo czytelnym rytmem miasta.",
      "Dobrze wypada dla osób, które cenią klimat, muzyke, gastro i więczórne życie.",
      "To przydatny kontrapunkt wobec bardziej słonecznych city breakow.",
    ],
    bestTime:
      "Dublin najlepiej planować od mają do września, kiedy pogoda bardziej sprzyja spacerom. Poza tym okresem nadal ma sens, ale trzeba liczyc się z bardziej zmiennymi warunkami.",
    budgetNote:
      "Dublin nie jest kierunkiem niskobudżetowym, dlatego najważniejsze jest uczciwe ustawienie oczekiwan. Najlepiej traktowac go jako city break z wyższym standardem, a nie tania ucieczke na weekend.",
    whoFor: [
      "dla osób szukających klimatu miasta i więczórnego zycia",
      "dla wyjazdów 2-4 dni",
      "dla tych, którzy cenią latwy format bez rozbudowanej logistyki",
    ],
    highlights: ["Temple Bar", "Trinity College", "puby", "nadbrzeza", "miejskie spacery"],
    districts: ["Temple Bar", "centrum", "St Stephen's Green", "Docklands"],
    faq: [
      {
        question: "Czy Dublin to bardziej kierunek na klimat niż na klasyczne zabytki?",
        answer:
          "Tak. To miasto bardziej wygrywa atmosfera, pubami, muzyka i spacerowym rytmem niż bardzo dluga lista ikon do odhaczenia.",
      },
      {
        question: "Na ile dni najlepiej planować Dublin?",
        answer:
          "Najlepiej 2-4 dni. To format, w którym najlepiej wypada i nie potrzebuje rozciągania do tygodniowego urlopu.",
      },
    ],
  },
  {
    slug: "london-uk",
    overview:
      "Londyn to kierunek dla osób, które chcą dużego, wielowarstwowego miasta z muzeami, dzielnicami i bardzo mocnym powodem do wyjazdu. To nie jest tani city break, ale nadal jest jednym z najmocniejszych kierunków dla odbiórcy szukającego dużego europejskiego miasta.",
    whyGo: [
      "Daje bardzo szeroki wachlarz scenariuszy: kultura, muzea, zakupy, gastronomia i klasyczne ikony miasta.",
      "To kierunek, który dobrze działa w treściach porownawczych i scenariuszach z wyższym standardem.",
      "Bardzo mocno pracuje na rozpoznawalnosc marki i publiczny charakter serwisu.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiące to maj-czerwięc oraz wrzesień-październik. Londyn da się odwiedzac przez cały rok, ale w tych miesiącach zwykle najłatwiej o wygodny rytm spacerowy.",
    budgetNote:
      "To kierunek droższy, dlatego kluczowe jest uczciwe ustawienie oczekiwan i budżetu. W zamian Londyn daje ogrom treści, muzeow i scenariuszy pobytu nawet na krótki wyjazd.",
    whoFor: [
      "dla osób, które chcą dużego miasta z bardzo szeroka oferta",
      "dla 3-5 dni z naciskiem na kulture i dzielnice",
      "dla wyjazdów, gdzie koszt schodzi na drugi plan wobec jakości kierunku",
    ],
    highlights: ["Westminster", "South Bank", "muzea", "Covent Garden", "Notting Hill"],
    districts: ["West End", "South Bank", "Notting Hill", "Shoreditch"],
    faq: [
      {
        question: "Czy Londyn ma sens na 3 dni?",
        answer:
          "Tak, ale trzeba podejsc do niego selektywnie. To kierunek, który daje dużo nawet przy 3 dniach, ale zdecydowanie nie da się wtedy zobaczyć wszystkiego.",
      },
      {
        question: "Czy Londyn nadaje się do treści o tanich podróżach?",
        answer:
          "Raczej nie. To kierunek, który lepiej opisywać przez jakość i sile scenariusza wyjazdu niż przez bardzo niski budżet.",
      },
    ],
  },
];

const editorialArticles: EditorialArticle[] = [
  {
    slug: "cieple-kraje-bez-wizy",
    title: "Ciepłe kraje bez wizy",
    description:
      "Praktyczny przewodnik po ciepłych kierunkach, które dobrze sprawdzają się z Polski i nie wymagają skomplikowanej logistyki.",
    excerpt:
      "Scenariusz dla osób, które chcą słońca, prostszych formalnosci i sensownego budżetu na 4-7 dni.",
    hero:
      "To jeden z najmocniejszych tematow dla polskiego odbiórcy: ciepło, bez zbednych formalnosci i kierunki, które da się ogarnac w rozsądnym budzecie.",
    plannerPrompt:
      "Chce do ciepłego kraju bez wizy, 5 dni, budżet do 2500 zl, najlepiej z Polski, plaża i cos do zwiedzania.",
    categorySlugs: ["ciepłe-kierunki", "bez-wizy", "przewodniki"],
    destinationSlugs: ["marrakesh-morocco", "agadir-morocco", "antalya-turkey", "larnaca-cyprus", "las-palmas-spain"],
    practicalBullets: [
      "Sprawdź realny czas lotu, a nie tylko sam koszt biletu.",
      "Nie mieszaj bardzo taniego lotu z bardzo slabym noclegiem tylko po to, by zmiescic się w budzecie.",
      "Przy 4-5 dniach mocniej premiuj kierunki z prostym dojazdem i szybkim transferem z lotniska.",
    ],
    sections: [
      {
        title: "Kiedy taki kierunek ma najwięcej sensu",
        paragraphs: [
          "Najczęściej wtedy, gdy chcesz uciec od zimniejszej pogody w Polsce i nie planujesz długiego urlopu. Ciepłe kierunki bez dodatkowej biurokracji wygrywają prostotą decyzji.",
          "To też dobry scenariusz dla osób, które chcą zaplanować wyjazd szybko: masz budżet, liczbę dni i styl wyjazdu, a potem potrzebujesz już tylko dobrej selekcji kierunków.",
        ],
      },
      {
        title: "Na co patrzec przy wybórze",
        paragraphs: [
          "Najwazniejsze jest połączenie pogody, czasu lotu i budżetu. Samo ciepło nie wystarczy, jeśli dojazd zjada zbyt dużo czasu albo mocno ogranicza jakość noclegu.",
        ],
        bullets: [
          "pogoda w konkretnym miesiącu, nie tylko ogólna średnia roczna",
          "czas lotu i liczba przesiadek",
          "czy kierunek jest bardziej plażowy czy bardziej miejski",
        ],
      },
      {
        title: "Jak korzystac z planera",
        paragraphs: [
          "W plannerze warto wpisać konkret: budżet, liczbę dni, czy zależy Ci na plaży, oraz czy wolisz spokojny wyjazd czy łączenie plaży ze zwiedzaniem. To od razu poprawia ranking i powoduje, ze wynik nie jest generyczny.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy bez wizy zawsze oznacza brak jakichkolwiek formalnosci?",
        answer:
          "Nie. To dobra wskazowka na etapie wybóru kierunku, ale przed wyjazdem zawsze trzeba sprawdźic aktualne zasady wjazdu i wymagane dokumenty.",
      },
      {
        question: "Czy da się poleciec do ciepłego kraju na 5 dni i nie przepalić budżetu?",
        answer:
          "Tak, ale najlepiej wybierać kierunki z dobrym stosunkiem ceny do pogody i nie przeciagac lotu ponad to, co ma sens przy tak krótkim czasie.",
      },
    ],
  },
  {
    slug: "tanie-city-breaki-na-weekend",
    title: "Tanie city breaki na weekend",
    description:
      "Zestawienie kierunków, które dają sensowną jakość na 2-4 dni bez potrzeby rozciągania budżetu ponad potrzebę.",
    excerpt:
      "Weekendowy city break powinien być prosty: latwy dojazd, czytelny plan i dobra relacja ceny do wygody.",
    hero:
      "Weekendowy wyjazd nie musi być przypadkowy. Najlepiej działaja kierunki, które są blisko, mają prosty układ miasta i nie wymagają wielkiej logistyki.",
    plannerPrompt:
      "Szukam taniego city breaku na weekend, 2-3 dni, z Polski, dużo zwiedzania i budżet do 1800 zl.",
    categorySlugs: ["city-breaki", "tanie-podróże", "weekendowe-wyjazdy"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "rome-italy", "malaga-spain"],
    practicalBullets: [
      "Na 2-3 dni premiuj kierunki z szybkim transferem z lotniska.",
      "Lepszy prosty hotel blisko centrum niż pozornie tańszy nocleg daleko od wszystkiego.",
      "Najpierw licz czas, dopiero potem dopracowuj liste atrakcji.",
    ],
    sections: [
      {
        title: "Co sprawia, ze city break jest naprawde opłacalny",
        paragraphs: [
          "Nie zawsze wygrywa najnizsza cena lotu. W weekendowych wyjazdach liczy się też wygodny dojazd, latwe poruszanie się po mieście i brak potrzeby ciaglego przemieszczania się.",
          "Dlatego często lepiej wypada kierunek wystarczajaco tani, ale prostszy i bardziej przewidywalny.",
        ],
      },
      {
        title: "Jak nie zepsuc sobie krótkiego wyjazdu",
        paragraphs: [
          "Najczestszy blad to ladowanie zbyt wielu atrakcji do 48 godzin. Taki wyjazd powinien zostawic przestrzen na jedzenie, spacer i oddech, inaczej nawet dobry kierunek zaczyna meczyc.",
        ],
      },
      {
        title: "Dla kogo taki scenariusz działa najlepiej",
        paragraphs: [
          "To idealna opcja dla par, znajomych i osób, które chcą wyjechac bez brania długiego urlopu. Wlasnie dlatego ten temat dobrze pracuje pod afiliacje i ruch z SEO.",
        ],
      },
    ],
    faq: [
      {
        question: "Jaki budżet ma sens na tani city break?",
        answer:
          "Najczęściej od 1500 do 2500 zl za cały wyjazd, zalezne od kierunku, terminu i standardu noclegu. Najważniejszy jest jednak stosunek kosztu do wygody.",
      },
      {
        question: "Czy na weekend lepiej wybierać Poludnie Europy czy kierunki blizsze Polsce?",
        answer:
          "Przy bardzo krótkim formacie zwykle lepiej wypadają kierunki z krótszym lotem, chyba ze mocno zależy Ci na pogodzie i akceptujesz dłuższy dojazd.",
      },
    ],
  },
  {
    slug: "najlepsze-kierunki-na-4-dni",
    title: "Najlepsze kierunki na 4 dni",
    description:
      "Praktyczny wybór kierunków na 4-dniowy wyjazd z Polski z naciskiem na sensowny balans zwiedzania, komfortu i budżetu.",
    excerpt:
      "Cztery dni to jeden z najlepszych formatow na miasto albo lekki kierunek z plażą i zwiedzaniem.",
    hero:
      "4 dni to wystarczajaco dużo, żeby poczuc kierunek, ale nadal na tyle krotko, ze trzeba dobrze wybierać logistyke i charakter miasta.",
    plannerPrompt:
      "Najlepszy kierunek na 4 dni z Polski, budżet do 2500 zl, zwiedzanie i dobry klimat miasta.",
    categorySlugs: ["city-breaki", "przewodniki"],
    destinationSlugs: ["lisbon-portugal", "rome-italy", "athens-greece", "barcelona-spain", "budapest-hungary"],
    practicalBullets: [
      "4 dni to bardzo dobry format na jedno miasto z 1-2 dodatkowymi strefami.",
      "Najlepiej wybierać kierunki, które nie zmuszaja do wielu przesiadek i dalekich transferow.",
      "W tym formacie bardziej oplaca się skupic na jakości planu niż na odhaczaniu wszystkiego.",
    ],
    sections: [
      {
        title: "Dlaczego 4 dni to tak dobry format",
        paragraphs: [
          "To jeden z najbardziej praktycznych układow dla polskiego odbiórcy. Pozwala zobaczyć dużo więcej niż weekend, ale nie wymaga jeszcze pełnych wakacji ani wysokiego budżetu.",
        ],
      },
      {
        title: "Jak wybierać miasto na 4 dni",
        paragraphs: [
          "Szukaj miejsc, które mają mocne centrum, kilka dzielnic z roznym klimatem i dobry dostęp z lotniska. Wlasnie takie kierunki najczęściej zostawiają najlepsze wrażenie po krótkim wyjezdzie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 4 dni wystarcza na Barcelona albo Rzym?",
        answer:
          "Tak, jeśli plan jest dobrze ustawiony i nie probujesz zobaczyć wszystkiego naraz. To właśnie jeden z najczestszych i najlepszych formatow dla tych kierunków.",
      },
      {
        question: "Czy lepiej wybrać jeden kierunek czy łączyć dwa miasta?",
        answer:
          "Przy 4 dniach prawie zawsze lepiej wygrywa jeden kierunek. Tylko wtedy masz szanse na wyjazd, który jest wygodny i daje prawdziwe wrażenie miejsca.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-do-2000-zl",
    title: "Gdzie poleciec do 2000 zl",
    description:
      "Kierunki, które mają realna szanse zmiescic się w budzecie do 2000 zl, szczególnie przy krótszych formatach wyjazdu.",
    excerpt:
      "To temat dla osób, które szukają konkretu: jaki kierunek ma jeszcze sens, gdy budżet jest wyraznie ograniczony.",
    hero:
      "Budżet do 2000 zl wciąż pozwala zaplanować sensowny wyjazd, ale wymaga lepszego filtrowania kierunku i unikania miejsc, które na starcie są po prostu zbyt drogie.",
    plannerPrompt:
      "Gdzie poleciec do 2000 zl z Polski, 3-4 dni, najlepiej dobre jedzenie i zwiedzanie.",
    categorySlugs: ["tanie-podróże", "city-breaki"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "athens-greece", "malaga-spain"],
    practicalBullets: [
      "Przy takim budzecie wybieraj krotsze wyjazdy i mocno patrz na lot plus nocleg, nie tylko na sama destynacje.",
      "Najlepiej działaja miasta o mocnym centrum i niewielkiej potrzebie dodatkowych przejazdow.",
      "Wynik ma być sensowny, a nie ekstremalnie tani kosztem komfortu.",
    ],
    sections: [
      {
        title: "Co naprawde miesci się w tym budzecie",
        paragraphs: [
          "Najłatwiej zmiescic się przy 2-4 dniach i kierunkach o średnim lub niskim koscie na miejscu. W droższych stolicach taki budżet szybko robi się zbyt ciasny.",
        ],
      },
      {
        title: "Jak uniknąć pozornie taniego wyjazdu",
        paragraphs: [
          "Niski lot i bardzo slaby nocleg daleko od centrum rzadko dają dobry efekt. Warto patrzec na całość: wygodę, czas i jakość pobytu, nie tylko sama cyfrę.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 2000 zl to budżet na osóbe czy za cały wyjazd?",
        answer:
          "Najczęściej takie frazy są rozumiane jako cały budżet scenariusza planowania. W praktyce zawsze warto doprecyzować to w plannerze, bo mocno zmienia ranking.",
      },
      {
        question: "Czy w tym budzecie lepiej wybierać Europe Srodkowa?",
        answer:
          "Często tak, bo skraca lot i poprawia stosunek ceny do czasu na miejscu. Ale przy dobrym terminie można czasem zmiescic też poludniowe kierunki.",
      },
    ],
  },
  {
    slug: "gdzie-na-weekend-we-dwoje",
    title: "Gdzie na weekend we dwoje",
    description:
      "Pomysly na city break i krótkie wyjazdy dla par, z naciskiem na klimat miejsca, tempo dnia i komfort wyjazdu.",
    excerpt:
      "Dobre kierunki dla par to nie zawsze najglosniejsze miasta. Liczy się klimat, spacery, jedzenie i sensowny rytm pobytu.",
    hero:
      "Weekend we dwoje powinien być prosty do zaplanowania i mieć wyraźny charakter: nastrojowe dzielnice, dobra gastronomia, spacerowy rytm i realny czas dla siebie.",
    plannerPrompt:
      "Gdzie na weekend we dwoje z Polski, dobry klimat miasta, 3 dni, bez stresu i z dobrym jedzeniem.",
    categorySlugs: ["weekendowe-wyjazdy", "city-breaki"],
    destinationSlugs: ["budapest-hungary", "lisbon-portugal", "malaga-spain", "valletta-malta"],
    practicalBullets: [
      "Na wyjazd dla par lepiej działaja miasta z dobrym rytmem spacerowym niż kierunki wymagające ciaglego przemieszczania się.",
      "Wieczorne dzielnice, punkty widokowe i dobra baza noclegowa robia wieksza roznice niż przesadnie dluga lista atrakcji.",
      "Warto pilnować lotu powrótnego, żeby nie zepsuc ostatniego dnia.",
    ],
    sections: [
      {
        title: "Czego najczęściej szukają pary",
        paragraphs: [
          "Nie chodzi tylko o romantycznosc. Dla wielu osób liczy się wygoda wyjazdu, dobra kuchnia, spacerowy klimat i poczucie, ze miasto nie wymusza ciaglego tempa.",
        ],
      },
      {
        title: "Jak wybrać kierunek pod taki wyjazd",
        paragraphs: [
          "Warto stawiac na miasta, które dobrze działaja już od pierwszego więczóru. Jeśli po przylocie możesz od razu wejsc w klimat centrum, promenady lub dzielnicy z restauracjami, to znaczy, ze kierunek pracuje na Twója korzysc.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy lepszy bedzie kierunek plażowy czy miejski?",
        answer:
          "To zależy od pory roku i oczekiwan. Na krótki weekend często lepiej wypada miasto z miejscem na spacer i dobra kolacje niż kierunek stricte wakacyjny.",
      },
      {
        question: "Ile dni planować na weekend we dwoje?",
        answer:
          "Najczęściej 2-4 dni. To wystarcza, by złapać klimat miejsca bez rozciągania kosztu i organizacji.",
      },
    ],
  },
  {
    slug: "najlepsze-kierunki-na-krotki-urlop",
    title: "Najlepsze kierunki na krótki urlop",
    description:
      "Wybór kierunków na 4-7 dni, gdy chcesz czegos więcej niż weekend, ale bez planowania dużych wakacji.",
    excerpt:
      "Krotki urlop powinien łączyć wygodę lotu, sensowny rytm dnia i kierunek, który daje dosc atrakcji bez chaosu.",
    hero:
      "Najlepsze kierunki na krótki urlop to te, które nie wymagają duzej logistyki, a jednocześnie dają realne odciecie od codzieńnosci.",
    plannerPrompt:
      "Szukam kierunku na krótki urlop 5-6 dni, ciepło albo miejski klimat, z Polski, budżet do 3000 zl.",
    categorySlugs: ["przewodniki", "ciepłe-kierunki"],
    destinationSlugs: ["malaga-spain", "athens-greece", "larnaca-cyprus", "funchal-portugal", "antalya-turkey"],
    practicalBullets: [
      "W tym formacie szczególnie liczy się balans czasu lotu do czasu pobytu.",
      "Najlepiej wybierać kierunki, które dają więcej niż jedna rzecz: na przykład plaże i miasto albo naturę i spokój.",
      "Dobrze jest mieć jeden główny plan dnia i sporo luzu dookola niego.",
    ],
    sections: [
      {
        title: "Kiedy krótki urlop wygrywa z klasycznym city breakiem",
        paragraphs: [
          "Wtedy, gdy chcesz nie tylko zobaczyć miasto, ale też odpoczac. 5-6 dni pozwala lepiej rozłożyć wyjazd i nie zamienia całego pobytu w ciagle przejazdy i odhaczanie atrakcji.",
        ],
      },
      {
        title: "Jak budowac ranking takich kierunków",
        paragraphs: [
          "Najmocniej powinny punktówac kierunki z dobrym dojazdem, przewidywalna pogoda i wysoka szansa, ze już pierwszy dzień bedzie przyjemny, a nie tylko organizacyjny.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 5 dni to już wakacje czy jeszcze city break?",
        answer:
          "To format pomiedzy. Wlasnie dlatego jest tak ciekawy treściowo i produktowo: pozwala złapać i miejski klimat, i chwilę odpoczynku.",
      },
      {
        question: "Czy taki wyjazd musi być drogi?",
        answer:
          "Nie. Przy dobrym kierunku i rozsądnym terminie nadal da się utrzymać koszt na sensownym poziomie, zwlaszcza jeśli nie celujesz w najdrozsze stolice.",
      },
    ],
  },
  {
    slug: "tanie-kierunki-z-polski",
    title: "Tanie kierunki z Polski",
    description:
      "Kierunki, które dobrze wypadają dla osób startujacych z Polski i szukających realnej relacji ceny do jakości.",
    excerpt:
      "To nie tylko kwestia samego lotu. Liczy się też to, ile kosztuje pobyt na miejscu i czy kierunek dobrze wypada przy krótkim czasie.",
    hero:
      "Najciekawsze tanie kierunki z Polski to te, które nie tylko mają dobry bilet, ale jeszcze pozwalają sensownie spedzic czas bez przepalania budżetu na miejscu.",
    plannerPrompt:
      "Tanie kierunki z Polski, 4 dni, budżet do 2200 zl, zwiedzanie i dobry dojazd.",
    categorySlugs: ["tanie-podróże", "przewodniki"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "istanbul-turkey", "athens-greece", "malaga-spain"],
    practicalBullets: [
      "Nie patrz tylko na stolice. Czasem lepiej wypada miasto o slabiej rozpoznawalnej marce, ale lepszym budzecie.",
      "Przy tanim kierunku bardzo dużo daje dobra lokalizacja noclegu i prosty plan dnia.",
      "Najmocniej wygrywają miejsca, które łatwo obsluzyc komunikacja i spacerem.",
    ],
    sections: [
      {
        title: "Jak rozumieć tani kierunek",
        paragraphs: [
          "To nie musi być absolutnie najtansza opcja. W praktyce lepiej szukać miejsc, które są uczciwie opłacalne: lot, nocleg, jedzenie i prosty plan w jednej, sensownej całośći.",
        ],
      },
      {
        title: "Co najczęściej psuje budżet",
        paragraphs: [
          "Slaby nocleg daleko od centrum, drogie transfery i zbyt długi lot jak na format wyjazdu. Dlatego właśnie potrzebny jest ranking oparty o cały scenariusz, a nie tylko jedna cene.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy tani kierunek to zawsze Europa Srodkowa?",
        answer:
          "Nie zawsze, ale często tak bywa przy bardzo ograniczonych budżetach. W praktyce wiele zależy od terminu i aktualnych lotów z Polski.",
      },
      {
        question: "Czy warto wpisywac w plannerze konkretny budżet?",
        answer:
          "Tak. To jedna z najważniejszych informacji dla silnika dopasowania i pomaga od razu odciac kierunki, które są po prostu za drogie.",
      },
    ],
  },
  {
    slug: "kierunki-z-plaza-i-zwiedzaniem",
    title: "Kierunki z plażą i zwiedzaniem",
    description:
      "Najlepsze miejsca dla osób, które nie chcą wybierać miedzy relaksem a miejskim klimatem.",
    excerpt:
      "To bardzo mocny typ wyjazdu: rano miasto lub atrakcje, po południu woda, promenada i spokojniejszy rytm.",
    hero:
      "Wlasnie takie kierunki najczęściej wygrywają w praktyce: dają i ladne miasto, i prawdziwy oddech przy wodzie. To wygodne, komercyjnie mocne i bardzo zrozumiale dla odbiórcy.",
    plannerPrompt:
      "Szukam kierunku z plażą i zwiedzaniem, 4-5 dni, z Polski, słońce i miasto w jednym.",
    categorySlugs: ["ciepłe-kierunki", "city-breaki"],
    destinationSlugs: ["malaga-spain", "barcelona-spain", "valletta-malta", "athens-greece", "larnaca-cyprus"],
    practicalBullets: [
      "Najlepiej wybierać kierunki, gdzie plaża nie wymaga wyjazdu daleko poza miasto.",
      "Ten format jest bardzo dobry na 4-5 dni.",
      "Najbardziej liczy się to, czy miejski i plażowy rytm da się połączyć bez marnowania czasu.",
    ],
    sections: [
      {
        title: "Dlaczego ten typ wyjazdu tak dobrze się sprzedaje",
        paragraphs: [
          "Bo rozwiazuje bardzo czesty dylemat. Wiele osób nie chce wybierać miedzy odpoczynkiem a czyms do zrobienia. Kierunki z plażą i zwiedzaniem odpowiadają na obie potrzeby naraz.",
        ],
      },
      {
        title: "Jak wybierać najlepsza opcje",
        paragraphs: [
          "Warto patrzec na to, czy centrum i plaża są blisko siebie oraz czy miasto ma cos więcej niż tylko dobra pogodę. Im mocniejszy lokalny charakter i gastronomia, tym lepszy efekt dla całego wyjazdu.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy taki kierunek nadaje się na 3 dni?",
        answer:
          "Tak, ale najlepiej wypada przy 4-5 dniach. Wtedy masz realna szanse połączyć obie potrzeby bez poczucia, ze wszystko robisz w biegu.",
      },
      {
        question: "Czy to dobry scenariusz dla osób niezdecydowanych?",
        answer:
          "Tak, bo to jedna z najczestszych kombinacji preferencji. Wlasnie taki opis bardzo dobrze nadaje się do wpisania naturalnym jezykiem w plannerze.",
      },
    ],
  },
  {
    slug: "pomysly-na-city-break-w-europie",
    title: "Pomysly na city break w Europie",
    description:
      "Lista najmocniejszych kierunków w Europie dla osób szukających konkretu: co wybrać, dlaczego i dla jakiego stylu wyjazdu.",
    excerpt:
      "To przewodnik dla osób, które chcą szybko zrozumieć roznice miedzy klasycznymi kierunkami i dobrac miasto do swojego stylu.",
    hero:
      "Nie kazdy city break jest taki sam. Jedne kierunki wygrywają dla par, inne dla szybkiego zwiedzania, a jeszcze inne dla połączenia miasta i relaksu. Wlasnie to warto pokazać czytelnikowi.",
    plannerPrompt:
      "Pomoz wybrać city break w Europie na 4 dni, budżet do 2500 zl, dobry klimat miejsca i zwiedzanie.",
    categorySlugs: ["city-breaki", "przewodniki"],
    destinationSlugs: ["rome-italy", "barcelona-spain", "lisbon-portugal", "budapest-hungary", "prague-czechia"],
    practicalBullets: [
      "Najpierw wybierz format wyjazdu: klasyczne zwiedzanie, para, jedzenie, plaża plus miasto lub budżetowy weekend.",
      "Dobre miasto na city break powinno mieć mocny pierwszy dzień i proste centrum.",
      "Lepiej mieć 3 swietne miejsca na planie niż 20 losowych punktów.",
    ],
    sections: [
      {
        title: "Jak nie wybierać miasta tylko po marce",
        paragraphs: [
          "Wiele osób zaczyna od najbardziej znanych nazw, ale nie zawsze to one najlepiej pasują do celu wyjazdu. Czasem mniejsze lub tansze miasto daje wyraznie lepszy efekt.",
        ],
      },
      {
        title: "Jak zbudować porównańie kierunków",
        paragraphs: [
          "Najwygodniej patrzec na pięć rzeczy: czas lotu, koszt pobytu, klimat miasta, styl wyjazdu i liczbę miejsc, które rzeczywiście warto zobaczyć w tak krótkim czasie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy lepiej wybierać kierunek znany czy bardziej niszowy?",
        answer:
          "To zależy od potrzeb. Znane miasta są prostsze na pierwszy wyjazd, ale bardziej niszowe kierunki często wygrywają kosztem i tempem pobytu.",
      },
      {
        question: "Czy city break zawsze musi oznaczac duze miasto?",
        answer:
          "Nie. Najwazniejsze jest to, czy miejsce daje miejski rytm, czytelny plan i wystarczajaco dużo treści na krótki wyjazd.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-jesienia-z-polski",
    title: "Gdzie poleciec jesienią z Polski",
    description:
      "Jesieńne kierunki z Polski z naciskiem na pogodę, balans ceny do komfortu i praktyczny format 4-7 dni.",
    excerpt:
      "Jesień to jeden z najlepszych momentow na wyjazdy: mniej tłoku, często lepsze ceny i bardziej komfortowa pogoda w wielu kierunkach.",
    hero:
      "To dobry moment, by pokazać sile serwisu jako wydawniczego przewodnika i narzedzia jednocześnie. Jesieńne kierunki dobrze łączą ruch SEO z intencja zakupowa.",
    plannerPrompt:
      "Gdzie poleciec jesienią z Polski, 5 dni, najlepiej ciepło i bez bardzo wysokiego budżetu.",
    categorySlugs: ["ciepłe-kierunki", "przewodniki"],
    destinationSlugs: ["malaga-spain", "lisbon-portugal", "valletta-malta", "marrakesh-morocco", "funchal-portugal"],
    practicalBullets: [
      "Jesieńia warto grac na kierunki, które nadal mają pogodę, ale nie są już w szcżycie sezonu.",
      "To dobry czas na Malaga, Malte, Lizbone, Madere i czesc kierunków w Maroku.",
      "Przy jesieńnych wyjazdach szczególnie dobrze pracuje mix miasta i relaksu.",
    ],
    sections: [
      {
        title: "Dlaczego jesień daje przewage",
        paragraphs: [
          "Po wakacjach wiele kierunków nadal ma bardzo dobra pogodę, ale mniejszy tłok i lepsze warunki do spokojnego zwiedzania. To bardzo mocny argument dla polskiego odbiórcy.",
        ],
      },
      {
        title: "Jak ustawic wyszukiwanie",
        paragraphs: [
          "Najlepiej wpisać miesiąc, budżet i oczekiwany styl wyjazdu. Wtedy planner może mocniej premiować kierunki, które w tym konkretnym okresie wypadają najlepiej.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy jesień to dobry moment na ciepły kierunek?",
        answer:
          "Tak, bardzo często lepszy niż srodek lata, bo daje lepsza pogodę do spacerow i mniejszy tłok w najpopularniejszych miejscach.",
      },
      {
        question: "Czy jesień lepiej sprawdza się na city break czy krótkie wakacje?",
        answer:
          "Na oba scenariusze. To zależy głównie od liczby dni i tego, czy bardziej zależy Ci na mieście czy na odpoczynku.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-zima-z-polski",
    title: "Gdzie poleciec zima z Polski",
    description:
      "Najciekawsze kierunki na zimowy wyjazd z Polski, od słonecznych opcji po klimatyczne miasta na krótki urlop.",
    excerpt:
      "Zima nie musi oznaczac tylko jarmarkow i grubyćh kurtek. Dla wielu uzytkownikow to moment szukania słońca i prostego resetu.",
    hero:
      "Zimowe kierunki bardzo dobrze łączą się z afiliacja, bo stoi za nimi konkretna potrzeba: słońce, reset i sensowny plan na 4-7 dni bez czekania do lata.",
    plannerPrompt:
      "Gdzie poleciec zima z Polski, najlepiej ciepło, 5 dni, budżet do 3000 zl, bez komplikacji.",
    categorySlugs: ["ciepłe-kierunki", "przewodniki"],
    destinationSlugs: ["las-palmas-spain", "marrakesh-morocco", "agadir-morocco", "malaga-spain", "funchal-portugal"],
    practicalBullets: [
      "Zima najmocniej premiuje kierunki, które mają przewidywalna pogodę i sensowny czas lotu.",
      "To dobry moment na Kanary, poludnie Hiszpanii, Madeire i czesc Maroka.",
      "Wynik powinien jasno pokazywac kompromis: pogoda kontra długość lotu i budżet.",
    ],
    sections: [
      {
        title: "Czego szuka uzytkownik zima",
        paragraphs: [
          "Najczęściej nie tylko samego wyjazdu, ale odcięcia od pogody i rutyny. Dlatego kierunki zimowe trzeba opisywać nie tylko przez temperaturę, ale też przez prostote całego scenariusza.",
        ],
      },
      {
        title: "Jak porownywac zimowe opcje",
        paragraphs: [
          "Warto uczciwie pokazać, ze niektóre miejsca mają lepsza pogodę, ale są dalej lub drozsze. Inne są bliżej, ale dają tylko łagodniejszy klimat, a nie pełne lato. Taki balans buduje wiarygodnosc strony.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy zima da się poleciec w ciepłe miejsce bez bardzo dużego budżetu?",
        answer:
          "Tak, ale trzeba dobrze dobrac kierunek i termin. Najlepiej szukać miejsc, które mają przewidywalna pogodę i nie są skrajnie daleko od Polski.",
      },
      {
        question: "Czy Malaga to dobry zimowy kierunek?",
        answer:
          "Tak, jeśli szukasz łagodnej zimy i city breaku z oddechem. Jeśli oczekujesz pełnego plażowego lata, lepiej spojrzec na Kanary lub inne ciepłejsze opcje.",
      },
    ],
  },
  {
    slug: "krotkie-wakacje-w-europie",
    title: "Krotkie wakacje w Europie",
    description:
      "Pomysly na 4-7 dni w Europie dla osób, które chcą wyjechac na lekki urlop bez skomplikowanej organizacji.",
    excerpt:
      "To wyjazdy pomiedzy city breakiem a pełnymi wakacjami: nadal wygodne, ale dające więcej odpoczynku i elastycznosci.",
    hero:
      "Krotkie wakacje w Europie to jeden z najmocniejszych formatow dla startupu travelowego. Ludzie szukają czegos szybkiego, ale nadal wartosciowego i dobrze uzasadnionego.",
    plannerPrompt:
      "Krotkie wakacje w Europie, 5-6 dni, budżet do 3200 zl, najlepiej plaże albo ladne miasto.",
    categorySlugs: ["ciepłe-kierunki", "weekendowe-wyjazdy"],
    destinationSlugs: ["valletta-malta", "larnaca-cyprus", "funchal-portugal", "malaga-spain", "athens-greece"],
    practicalBullets: [
      "Najlepiej wybierać kierunki, które pozwalają i odpoczac, i cos zobaczyć.",
      "Dobrze sprawdzają się miejsca z jednym wygodnym noclegiem i planem bez ciaglych zmian bazy.",
      "Ten format lubi jasne komunikaty o pogodzie, budzecie i stylu wyjazdu.",
    ],
    sections: [
      {
        title: "Czym krótkie wakacje roznia się od city breaku",
        paragraphs: [
          "Przede wszystkim tempem. To nadal wyjazd zorganizowany na krotko, ale nie musi być tak gesty od atrakcji. Warto pokazać uzytkownikowi, ze taka opcja jest bardziej do zycia niż 48 godzin gonitwy.",
        ],
      },
      {
        title: "Jak dobierac kierunek",
        paragraphs: [
          "Najlepiej szukać miejsc, które dają przynajmniej dwie mocne osie wyjazdu: na przykład morze i miasto albo natura i spokój. Wtedy taki wyjazd broni się nawet przy nieco wyższym budzecie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 5-6 dni to nadal dobry format na Europe?",
        answer:
          "Tak, to bardzo dobry format. Daje dużo swobody i pozwala wybrać kierunek bardziej pod styl pobytu, a nie tylko pod sam czas dojazdu.",
      },
      {
        question: "Czy lepiej wtedy wybierać wyspy czy miasta?",
        answer:
          "To zależy od oczekiwan. Jeśli chcesz relaksu i pogody, wyspy często wygrywają. Jeśli zależy Ci na rytmie miasta i gastronomii, lepiej sprawdźi się mocny kierunek miejski.",
      },
    ],
  },
  {
    slug: "kierunki-na-pierwszy-city-break",
    title: "Kierunki na pierwszy city break",
    description:
      "Przewodnik po miastach, które najlepiej nadają się na pierwszy zagraniczny city break z Polski: proste, czytelne i bez zbędnej logistyki.",
    excerpt:
      "Pierwszy city break powinien być latwy do ogarniecia. Najlepiej wygrywają miasta z mocnym centrum, prostym dojazdem i scenariuszem, który nie wymaga eksperckiej wiedzy.",
    hero:
      "To jeden z najbardziej praktycznych tematow dla serwisu travelowego. Dobrze dobrany pierwszy city break buduje zaufanie do marki, bo pomaga czytelnikowi podjac decyzje bez chaosu.",
    plannerPrompt:
      "Szukam pierwszego city breaku z Polski, 3-4 dni, bez skomplikowanej logistyki, budżet do 2500 zl.",
    categorySlugs: ["city-breaki", "przewodniki", "weekendowe-wyjazdy"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "rome-italy", "malaga-spain", "lisbon-portugal"],
    practicalBullets: [
      "Najpierw patrz na prosty dojazd i kompaktowe centrum.",
      "Pierwszy wyjazd nie powinien wymagac walki z dalekimi transferami i przejazdami pomiedzy atrakcjami.",
      "Lepiej wybrać jedno miasto z jasnym rytmem niż ambitny kierunek, który na starcie meczy logistyka.",
    ],
    sections: [
      {
        title: "Jak rozpoznac dobry pierwszy kierunek",
        paragraphs: [
          "Najlepiej wygrywają miasta, w których już pierwszy dzień jest przyjemny i czytelny. Po wyjsciu z lotniska powinienes szybko trafic do centrum i mieć od razu poczucie, ze wyjazd zaczal się dobrze.",
          "Dlatego tak dobrze wypadają Budapeszt, Praga czy Malaga. Dają szybki efekt i nie wymagają od czytelnika zbyt wielu decyzji organizacyjnych.",
        ],
      },
      {
        title: "Czego unikac przy pierwszym city breaku",
        paragraphs: [
          "Nie warto zaczynac od miasta, które jest bardzo drogie, rozlegle albo wymaga wielu przesiadek. Lepiej zostawic sobie takie kierunki na pozniejszy etap, kiedy wiesz już, jaki styl wyjazdu najbardziej Ci odpowiada.",
        ],
        bullets: [
          "zbyt długiego lotu jak na 2-4 dni",
          "noclegu daleko od centrum tylko dlatego, ze jest niższa cena",
          "planu, który probuje zmiescic cale miasto w 48 godzin",
        ],
      },
      {
        title: "Jak korzystac z tego scenariusza w plannerze",
        paragraphs: [
          "Wpisz w plannerze, ze to Twój pierwszy city break, dodaj liczbę dni i budżet. To pozwoli silnikowi mocniej premiować kierunki, które są proste, sprawdzone i dobrze pracuja dla polskiego odbiórcy.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy pierwszy city break musi być bardzo tani?",
        answer:
          "Nie. Wazniejsze jest to, żeby byl prosty i wygodny. Czasem trochę wyższy budżet daje znacznie lepszy pierwszy kontakt z zagranicznym wyjazdem.",
      },
      {
        question: "Czy lepiej zaczac od miasta czy od kierunku z plażą?",
        answer:
          "Na pierwszy raz zwykle najlepiej wypada miasto albo kierunek typu plaża plus zwiedzanie, gdzie łatwo ustawic rytm dnia bez skrajnych kompromisow.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-w-maju",
    title: "Gdzie poleciec w maju",
    description:
      "Najlepsze kierunki na majowy wyjazd z Polski, kiedy pogoda zaczyna już mocno sprzyjac city breakom i krótkim wakacjom.",
    excerpt:
      "Maj to jeden z najlepszych miesiecy na wyjazdy. W wielu kierunkach jest już ciepło, ale nadal bez największego sezonowego tłoku.",
    hero:
      "To bardzo mocny temat dla serwisu travelowego, bo łączy wysoką intencje, dobra pogodę i praktyczne pytanie o to, gdzie najlepiej wykorzystac kilka dni wolnego.",
    plannerPrompt:
      "Gdzie poleciec w maju z Polski, 4-5 dni, najlepiej ciepło i cos do zwiedzania, budżet do 3000 zl.",
    categorySlugs: ["ciepłe-kierunki", "przewodniki"],
    destinationSlugs: ["malaga-spain", "valencia-spain", "athens-greece", "larnaca-cyprus", "valletta-malta"],
    practicalBullets: [
      "Maj premiuje kierunki, które mają już pogodę, ale jeszcze nie są w pełnym szcżycie sezonu.",
      "To dobry miesiąc dla scenariuszy plaża plus miasto oraz dla łagodniejszych city breakow na południu Europy.",
      "Warto pilnować terminu wylotu, bo okolice długich weekendow potrafią mocno zmienic dostępność i ceny.",
    ],
    sections: [
      {
        title: "Dlaczego maj jest tak dobry na wyjazd",
        paragraphs: [
          "W maju wiele kierunków daje już bardzo przyjemna pogodę do spacerow, plaży i więczórnego zycia miasta. Jednoczesnie nie ma jeszcze takiego obciazenia jak w pelni lata, co poprawia komfort pobytu.",
        ],
      },
      {
        title: "Jak wybierać kierunek na maj",
        paragraphs: [
          "Najbardziej opłacalne są miejsca, które łączą słońce z czytelnym planem dnia. Dobrze sprawdzają się Malaga, Malta, Ateny czy Walencja, bo dają i klimat, i realny sens na 4-5 dni.",
        ],
        bullets: [
          "sprawdzaj nie tylko temperaturę, ale też wiatr i komfort spaceru",
          "premiuj kierunki z prostym dojazdem z lotniska",
          "szukaj miast, które dobrze działaja już od pierwszego popołudnia",
        ],
      },
      {
        title: "Jak wpisać taka potrzebę do planera",
        paragraphs: [
          "Najlepiej wpisać miesiąc, liczbę dni, budżet i to, czy wolisz miejski klimat czy bardziej wakacyjny układ dnia. Taki opis bardzo dobrze przeklada się na sensowny ranking kierunków.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy maj jest lepszy od czerwca na krótki wyjazd?",
        answer:
          "Często tak, bo daje bardzo dobry balans pogody i tłoku. Dla wielu osób to jeden z najlepszych miesiecy na city breaki i krótkie wakacje.",
      },
      {
        question: "Czy w maju lepiej wybierać miasto czy kierunek plażowy?",
        answer:
          "Oba scenariusze mają sens. Maj jest mocny właśnie dlatego, ze wiele kierunków daje wtedy i komfort zwiedzania, i pierwsze odczucie ciepłego wyjazdu.",
      },
    ],
  },
  {
    slug: "europa-na-5-dni",
    title: "Europa na 5 dni",
    description:
      "Najlepsze kierunki w Europie na 5-dniowy wyjazd z Polski: ani za krotko, ani jeszcze nie pełne wakacje, ale idealnie pod praktyczny reset.",
    excerpt:
      "Pieciodniowy wyjazd to bardzo wdzieczny format. Daje więcej swobody niż weekend, ale nadal wymaga dobrego doboru miasta lub kierunku.",
    hero:
      "To temat o wysokiej intencji, bo wiele osób ma właśnie 5 dni i chce wybrać miejsce, które wykorzysta ten czas najlepiej: bez chaosu, ale z realnym efektem wyjazdu.",
    plannerPrompt:
      "Szukam kierunku w Europie na 5 dni, z Polski, budżet do 3200 zl, zwiedzanie albo plaża plus miasto.",
    categorySlugs: ["przewodniki", "ciepłe-kierunki", "city-breaki"],
    destinationSlugs: ["lisbon-portugal", "valencia-spain", "athens-greece", "valletta-malta", "funchal-portugal"],
    practicalBullets: [
      "5 dni to dobry format na wyjazdy, które potrzebuja trochę więcej oddechu niż klasyczny city break.",
      "Najlepiej pracuja kierunki, które nie marnuja pierwszego dnia na logistyczne zamieszanie.",
      "To dobry moment, by pozwolić sobie na 1-2 mocne atrakcje i nadal zachować spokojny rytm.",
    ],
    sections: [
      {
        title: "Co daje 5 dni, czego nie daje weekend",
        paragraphs: [
          "Przede wszystkim pozwala przestać gonic. Możesz rozłożyć wyjazd na dzień przylotu, dwa mocniejsze dni zwiedzania, jeden spokojniejszy i finalny dzień bez poczucia, ze wszystko dzieje się za szybko.",
        ],
      },
      {
        title: "Jak wybierać miasto lub kierunek na taki format",
        paragraphs: [
          "Najlepiej wypadają miejsca, które mają kilka warstw: stare miasto, dzielnice, punkty widokowe, jedzenie, a czasem także morze. Wtedy 5 dni nie jest ani przesadnie długie, ani zbyt krótkie.",
        ],
        bullets: [
          "premiuj miasta z mocnym centrum i 1-2 dodatkowymi strefami",
          "dla ciepła szukaj kierunków typu Malta, Walencja, Ateny",
          "dla spokoju i natury dobrze wygląda też Madera",
        ],
      },
      {
        title: "Jak ustawic wyszukiwanie ofert",
        paragraphs: [
          "Przy 5 dniach warto jasno wpisać, czy to ma być bardziej city break czy bardziej krótki urlop. To jedna z tych informacji, które bardzo mocno poprawiaja jakość wynikow.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 5 dni to już dobry format na ciepły kierunek?",
        answer:
          "Tak. To jeden z najlepszych formatow na miejsca, które łączą odpoczynek i zwiedzanie bez koniecznosci brania pełnego tygodnia urlopu.",
      },
      {
        question: "Czy na 5 dni lepiej wybrać jedno miasto czy dwa miejsca?",
        answer:
          "W wiekszosci przypadkow nadal lepiej wygrywa jeden kierunek. Pozwala to zachować wygodę i nie psuc wyjazdu przeladowana logistyka.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-latem-na-krotko",
    title: "Gdzie poleciec latem na krotko",
    description:
      "Kierunki na 3-5 dni latem, kiedy chcesz wykorzystac pogodę, ale nie budowac od razu pełnych wakacji.",
    excerpt:
      "Latem wiele osób szuka nie tylko dużego urlopu, ale też krotszego wyjazdu, który daje szybki reset i poczucie prawdziwego lata.",
    hero:
      "To scenariusz bardzo komercyjny i bardzo praktyczny jednocześnie: kilka dni, słońce, dobra logistyka i kierunek, który nie rozczarowuje po przylocie.",
    plannerPrompt:
      "Gdzie poleciec latem na krotko z Polski, 3-5 dni, słońce, plaża albo ladne miasto, budżet do 3000 zl.",
    categorySlugs: ["ciepłe-kierunki", "weekendowe-wyjazdy", "przewodniki"],
    destinationSlugs: ["malaga-spain", "valencia-spain", "larnaca-cyprus", "valletta-malta", "las-palmas-spain"],
    practicalBullets: [
      "Latem szczególnie liczy się to, żeby kierunek dawal efekt już przy krótkim pobyćie.",
      "Najmocniej wygrywają miejsca, w których nie tracisz czasu na dalekie transfery i rozciagnieta logistyke.",
      "Krotki letni wyjazd powinien mieć prosty model: centrum, morze, jedzenie i kilka pewnych atrakcji.",
    ],
    sections: [
      {
        title: "Kiedy krótki letni wyjazd ma sens",
        paragraphs: [
          "Wtedy, gdy chcesz wykorzystac pogodę i nie czekac na dłuższy urlop. Dla wielu osób 3-5 dni latem jest wystarczajace, żeby realnie odpoczac i zobaczyć cos nowego.",
        ],
      },
      {
        title: "Jakie kierunki najlepiej działaja latem",
        paragraphs: [
          "Najbezpieczniej wypadają miasta i kierunki, które mają i rytm miejski, i latwy dostęp do morza. Dzięki temu nawet przy krótszym pobyćie masz poczucie pełnego wyjazdu, a nie tylko szybkiego przelotu i powrotu.",
        ],
        bullets: [
          "Walencja i Malaga dla plaży plus miasta",
          "Malta i Cypr dla bardziej wakacyjnego klimatu",
          "Kanary wtedy, gdy priorytetem jest mocna pogoda niezaleznie od sezonu",
        ],
      },
      {
        title: "Jak opisywać taka potrzebę w plannerze",
        paragraphs: [
          "Najlepiej wpisać, ze chodzi o lato, 3-5 dni i konkretny budżet. Warto też dodac, czy celem ma być głównie plaża, czy jednak po równo plaża i zwiedzanie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 3 dni latem wystarcza na ciepły wyjazd?",
        answer:
          "Tak, jeśli wybierzesz kierunek o prostym dojezdzie i nie bedziesz probowal zmiescic zbyt wielu rzeczy w jednym planie.",
      },
      {
        question: "Czy lepiej latem wybrać miasto czy typowo wakacyjny kierunek?",
        answer:
          "To zależy od stylu wyjazdu. Przy 3-5 dniach najlepiej wypadają kierunki hybrydowe, gdzie miasto i odpoczynek wzajemnie się uzupełniają.",
      },
    ],
  },
];

const editorialCategories: EditorialCategory[] = [
  {
    slug: "przewodniki",
    title: "Przewodniki",
    description:
      "Praktyczne przewodniki i scenariusze wyjazdów, które łączą treść wydawnicza z mozliwoscia przejscia do planera.",
    eyebrow: "Praktyczne treści",
    hero: "Treśći dla osób, które chcą zrozumieć kierunek przed kliknieciem w oferty.",
    articleSlugs: [
      "cieple-kraje-bez-wizy",
      "najlepsze-kierunki-na-4-dni",
      "najlepsze-kierunki-na-krotki-urlop",
      "kierunki-na-pierwszy-city-break",
      "gdzie-poleciec-w-maju",
      "europa-na-5-dni",
      "gdzie-poleciec-latem-na-krotko",
      "tanie-kierunki-z-polski",
      "gdzie-poleciec-jesienia-z-polski",
      "gdzie-poleciec-zima-z-polski",
    ],
    destinationSlugs: ["malaga-spain", "lisbon-portugal", "rome-italy", "marrakesh-morocco", "funchal-portugal", "valencia-spain", "naples-italy"],
  },
  {
    slug: "city-breaki",
    title: "City breaki",
    description:
      "Kierunki i poradniki dla osób, które chcą zrobić mocny wyjazd 2-5 dni bez chaosu i z dobrym stosunkiem ceny do jakości.",
    eyebrow: "Miejskie wyjazdy",
    hero: "Najlepsze city breaki dla polskiego odbiórcy: czytelne, praktyczne i dobrze porównańe.",
    articleSlugs: [
      "tanie-city-breaki-na-weekend",
      "najlepsze-kierunki-na-4-dni",
      "pomysly-na-city-break-w-europie",
      "gdzie-na-weekend-we-dwoje",
      "kierunki-na-pierwszy-city-break",
      "europa-na-5-dni",
    ],
    destinationSlugs: ["rome-italy", "budapest-hungary", "prague-czechia", "barcelona-spain", "lisbon-portugal", "berlin-germany", "amsterdam-netherlands"],
  },
  {
    slug: "cieple-kierunki",
    title: "Ciepłe kierunki",
    description:
      "Słońce, łagodniejsza pogoda i sensowne scenariusze wyjazdów z Polski na 4-7 dni.",
    eyebrow: "Słońce i klimat",
    hero: "Kierunki dla osób, które szukają ciepła, ale nadal chcą podejmowac decyzje na podstawie realnych argumentow.",
    articleSlugs: [
      "cieple-kraje-bez-wizy",
      "kierunki-z-plaza-i-zwiedzaniem",
      "gdzie-poleciec-w-maju",
      "europa-na-5-dni",
      "gdzie-poleciec-latem-na-krotko",
      "gdzie-poleciec-jesienia-z-polski",
      "gdzie-poleciec-zima-z-polski",
      "krotkie-wakacje-w-europie",
    ],
    destinationSlugs: ["malaga-spain", "larnaca-cyprus", "valletta-malta", "marrakesh-morocco", "las-palmas-spain", "valencia-spain", "funchal-portugal"],
  },
  {
    slug: "bez-wizy",
    title: "Bez wizy",
    description:
      "Scenariusze dla osób, które chcą uproscic decyzje i szukają kierunków z mniejsza liczba formalnosci na starcie.",
    eyebrow: "Mniej formalnosci",
    hero: "To jeden z najmocniejszych tematow do wyszukiwania naturalnym jezykiem i do budowy contentu o wysokiej intencji.",
    articleSlugs: ["ciepłe-kraje-bez-wizy"],
    destinationSlugs: ["marrakesh-morocco", "agadir-morocco", "antalya-turkey", "larnaca-cyprus", "tirana-albania"],
  },
  {
    slug: "tanie-podroze",
    title: "Tanie podróże",
    description:
      "Treść dla osób, które chcą dobrze wydac budżet, a nie tylko szukać najniższej cyfry za wszelka cene.",
    eyebrow: "Budżet pod kontrola",
    hero: "Najlepsze kierunki do budżetowych decyzji to te, które nadal dają sensowną jakość i prosty plan.",
    articleSlugs: ["tanie-city-breaki-na-weekend", "gdzie-poleciec-do-2000-zl", "tanie-kierunki-z-polski", "kierunki-na-pierwszy-city-break"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "athens-greece", "malaga-spain", "tirana-albania"],
  },
  {
    slug: "weekendowe-wyjazdy",
    title: "Weekendowe wyjazdy",
    description:
      "Kierunki i poradniki pod 2-4 dni, kiedy liczą się czas lotu, prostotą planu i dobry rytm wyjazdu.",
    eyebrow: "Wyjazdy na szybko",
    hero: "Weekendowe wyjazdy powinny być czytelne, dobrze ustawione logistycznie i przyjazne dla ograniczonego czasu.",
    articleSlugs: ["tanie-city-breaki-na-weekend", "gdzie-na-weekend-we-dwoje", "krótkie-wakacje-w-europie", "kierunki-na-pierwszy-city-break", "gdzie-poleciec-latem-na-krotko"],
    destinationSlugs: ["prague-czechia", "budapest-hungary", "rome-italy", "malaga-spain", "amsterdam-netherlands", "dublin-ireland"],
  },
];

function inferDestinationCategorySlugs(destination: DestinationProfile): string[] {
  const categories = new Set<string>(["przewodniki"]);

  if (destination.cityScore >= 0.76 || destination.sightseeingScore >= 0.76) {
    categories.add("city-breaki");
  }
  if (destination.beachScore >= 0.62 || (destination.avgTempByMonth[4] ?? 0) >= 22) {
    categories.add("ciepłe-kierunki");
  }
  if (destination.costIndex <= 1.02) {
    categories.add("tanie-podróże");
  }
  if (destination.typicalFlightHoursFromPL <= 3.3) {
    categories.add("weekendowe-wyjazdy");
  }
  if (destination.visaForPL) {
    categories.add("bez-wizy");
  }

  return [...categories];
}

function monthLabel(month: number): string {
  return ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrzesniu", "październiku", "listopadzie", "grudniu"][month - 1] ?? "sezonie";
}

function describeBestMonths(destination: DestinationProfile): string {
  const comfortableMonths = destination.avgTempByMonth
    .map((temp, index) => ({ temp, index: index + 1 }))
    .filter((item) => item.temp >= 18 && item.temp <= 30)
    .slice(0, 4)
    .map((item) => monthLabel(item.index));

  if (comfortableMonths.length === 0) {
    return "Ten kierunek najlepiej traktowac jako elastyczny sezonowo i dopasowywac bardziej do briefu niż do jednego miesiąca.";
  }

  return `Najwygodniej planować ten kierunek zwykle w ${comfortableMonths.join(", ")}, kiedy łatwiej połączyć pogodę, spacerowy rytm i realna przyjemność z pobytu.`;
}

function describeBudget(destination: DestinationProfile): string {
  if (destination.costIndex <= 0.95) {
    return "To kierunek, który dobrze broni się przy rozsądnym budzecie i nie wymaga od razu wysokich wydatkow, żeby wyjazd mial sens.";
  }

  if (destination.costIndex >= 1.4) {
    return "Budżet warto ustawic z lekkim zapasem, bo noclegi i codzieńne wydatki mogą szybciej rosnac niż w tańszych alternatywach.";
  }

  return "Najlepiej planować go jako średni budżet: z dobra baza noclegowa, sensowna logistyka i marginesem na jedzenie oraz 1-2 płatne punkty programu.";
}

function describeWorstMonths(destination: DestinationProfile): string {
  const monthNames = ["styczen", "luty", "marzec", "kwiecień", "maj", "czerwięc", "lipiec", "sierpien", "wrzesień", "październik", "listopad", "grudzień"];
  const ranked = destination.avgTempByMonth
    .map((temp, idx) => ({ temp, name: monthNames[idx] }))
    .sort((a, b) => {
      const aDist = a.temp < 12 ? 12 - a.temp : a.temp > 32 ? a.temp - 32 : 0;
      const bDist = b.temp < 12 ? 12 - b.temp : b.temp > 32 ? b.temp - 32 : 0;
      return bDist - aDist;
    });
  const worst = ranked.slice(0, 2).filter((m) => m.temp < 12 || m.temp > 32);
  if (worst.length === 0) {
    return `${destination.city} działa całorocznie — nie ma tu jednego miesiąca, który zdecydowanie odpada. Decyzje warto opierać na cenach lotów i własnych preferencjach pogodowych.`;
  }
  return `Najslabiej broni się zwykle w miesiącach takich jak ${worst.map((m) => m.name).join(" i ")}, gdy temperatura odbiega od komfortowego okna na chodzenie po mieście. Jeśli pogoda ma być kluczowa, lepiej wybrać inny termin.`;
}

function describePeakAndOffSeason(destination: DestinationProfile): string {
  const summerAvg = (destination.avgTempByMonth[5] + destination.avgTempByMonth[6] + destination.avgTempByMonth[7]) / 3;
  if (summerAvg > 27 && destination.beachScore >= 0.7) {
    return "Lato to peak sezonu — najwięcej tłumów i najwyższe ceny. Wczesna jesień i późna wiosna dają podobne wrażenia za znacznie mniej pieniędzy i bez kolejek.";
  }
  if (summerAvg > 25) {
    return "W lipcu i sierpniu jest najdrożej i najtłumniej. Czerwięc i wrzesień często wygrywają stosunkiem ceny do pogody.";
  }
  if (summerAvg < 18) {
    return "Sezonowosc nie jest tu dramatyczna — wybór terminu zależy bardziej od cen biletow niż od pogody. Off-season nie istnieje w klasycznym sensie.";
  }
  return "Klasyczny sezon przypada na ciepliejsza polowe roku, ale nie ma tu bardzo gwaltownych skokow cenowych — wystarczy unikac dwoch szczytowych tygodni urlopu szkolnego.";
}

function describeWhoForExtra(destination: DestinationProfile): string[] {
  const extras: string[] = [];
  if (destination.beachScore >= 0.75) extras.push("plażowicze szukający resetu nad morzem");
  if (destination.cityScore >= 0.8 && destination.sightseeingScore >= 0.7) extras.push("fani klasycznych city breakow");
  if (destination.nightlifeScore >= 0.75) extras.push("ekipy szukające zycia więczórnego");
  if (destination.natureScore >= 0.7) extras.push("osóby ceniace bliskosc natury");
  if (destination.costIndex <= 1) extras.push("planujacy z mysla o budzecie");
  if (destination.typicalFlightHoursFromPL <= 3) extras.push("wybierajacy się na wyjazd 3-4 dniowy");
  if (destination.safetyScore >= 0.78) extras.push("rodziny z dziecmi");
  return extras.slice(0, 4);
}

function buildGenericDestinationGuide(destination: DestinationProfile): DestinationGuideContent {
  const story = getDestinationStory(destination);
  const lengthHint =
    destination.typicalFlightHoursFromPL <= 2.5 ? "3-4 dni" : destination.typicalFlightHoursFromPL <= 4.5 ? "4-5 dni" : "5-7 dni";
  const flightHint = `lot z Polski to około ${destination.typicalFlightHoursFromPL.toFixed(1)} h`;
  const whoForExtra = describeWhoForExtra(destination);
  const whoFor = whoForExtra.length > 0 ? whoForExtra : story.bestFor.slice(0, 4);

  const whyGo: string[] = [
    `${destination.city} daje wyjazdówy scenariusz mocny pod ${story.bestFor.slice(0, 2).join(" i ")}.`,
    `Skaluje się od szybkiego city breaku do bardziej dopracowanego pobytu ${lengthHint} (${flightHint}).`,
  ];
  if (destination.cityScore >= 0.75) {
    whyGo.push(`Mocne tlo miejskie i zwiedzanie — ${Math.round(destination.cityScore * 100)}/100 w naszym wewnętrznym scoringu.`);
  }
  if (destination.beachScore >= 0.7) {
    whyGo.push(`Solidny profil plażowy (${Math.round(destination.beachScore * 100)}/100), więc można połączyć miasto z resetem nad morzem.`);
  }
  if (destination.costIndex <= 1.05) {
    whyGo.push("Rozsadny indeks kosztów — łatwo obronić kierunek przy normalnym budzecie wakacyjnym.");
  } else if (destination.costIndex >= 1.3) {
    whyGo.push("Wyzszy indeks kosztów oznacza, ze warto mieć przemyslane decyzje noclegówe i logistyczne, ale produkt obrania się jakościa.");
  }
  whyGo.push("Po stronie produktu łatwo przejsc od inspiracji do konkretu: noclegu, lotu i dalszych decyzji wyjazdówych.");

  const dataDrivenHighlights: string[] = [];
  if (destination.sightseeingScore >= 0.75) {
    dataDrivenHighlights.push(`Gesta siatka miejsc do zobaczenia — scoring zwiedzania ${Math.round(destination.sightseeingScore * 100)}/100.`);
  }
  if (destination.nightlifeScore >= 0.75) {
    dataDrivenHighlights.push("Aktywne życie więczórne, dobrze pasujące pod wyjazdy w grupie.");
  }
  if (destination.natureScore >= 0.7) {
    dataDrivenHighlights.push("Bliskosc natury — krajobrazy i widoki w zasiegu krótkiego wyjazdu z miasta.");
  }
  const highlights = [...story.attractions.slice(0, 5), ...dataDrivenHighlights].slice(0, 7);

  return {
    slug: destination.slug,
    destination,
    overview: `${destination.city} to kierunek, który HelpTravel traktuje jako praktyczny wybór pod ${lengthHint}, z naciskiem na realne decyzje: czy pasuje do budżetu, jaki ma rytm pobytu i czy daje dobry kolejny krok do hoteli, lotów i atrakcji.`,
    whyGo,
    bestTime: describeBestMonths(destination),
    budgetNote: describeBudget(destination),
    whoFor,
    highlights,
    districts: story.districts.slice(0, 4),
    faq: [
      {
        question: `Na ile dni najlepiej planować ${destination.city}?`,
        answer: `Najczęściej najlepiej sprawdza się scenariusz ${lengthHint}. Taki zakres dobrze równowazy dojazd, budżet i liczbę rzeczy, które da się zrobić bez przepalania energii. ${flightHint.charAt(0).toUpperCase() + flightHint.slice(1)}, więc do dnia w celu nie trzeba doliczać całodniowej podróży.`,
      },
      {
        question: `Czy ${destination.city} lepiej traktowac jako city break czy pełny wypoczynek?`,
        answer:
          destination.beachScore >= 0.7
            ? "To kierunek, który dobrze łączy pobyt miejski z oddechem i wypoczynkiem, więc można zbudować go jako hybryde — 2 dni miasto, 2 dni morze."
            : "Najlepiej wypada jako kierunek decyzyjny pod konkretne zwiedzanie, jedzenie i rytm miasta, a nie tylko bierny wypoczynek nad woda.",
      },
      {
        question: `Kiedy NIE warto leciec do ${destination.city}?`,
        answer: describeWorstMonths(destination),
      },
      {
        question: `Czy ${destination.city} jest droga destynacja?`,
        answer:
          destination.costIndex <= 1
            ? `Nie — indeks kosztów ${destination.costIndex.toFixed(2)} oznacza, ze noclegi i jedzenie wypadają zwykle tanio jak na standard europejski. Można obronić ten kierunek przy realnym budzecie wakacyjnym.`
            : destination.costIndex >= 1.3
              ? `Tak — indeks kosztów ${destination.costIndex.toFixed(2)} jest powyżej średniej europejskiej. Główne wydatki to noclegi w centrum i restauracje turystyczne. Da się zoptymalizować decyzjami logistycznymi.`
              : `Średni budżet w skali europejskiej — indeks kosztów około ${destination.costIndex.toFixed(2)}. Warto trzymać rezerwę na 1-2 płatne punkty programu i sensowne miejsce do spania.`,
      },
      {
        question: `Czy lepiej leciec w sezonie czy poza sezonem?`,
        answer: describePeakAndOffSeason(destination),
      },
      {
        question: `Co zrobić, jeśli ${destination.city} nie pasuje do mojego briefu?`,
        answer: `Sprawdź porównania na HelpTravel dla podobnych kierunków albo otwórz planner — pomoże dobrac alternatywe na bazie budżetu, długośći wyjazdu i stylu, którego szukasz.`,
      },
    ],
  };
}

export function getPublishedDestinations(): DestinationProfile[] {
  return publishedDestinationSlugs
    .map((slug) => getDestinationProfileBySlug(slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));
}

export function getPublishedDestinationSlugs(): string[] {
  return [...publishedDestinationSlugs];
}

export function getDestinationGuideBySlug(slug: string): DestinationGuideContent | undefined {
  const override = destinationGuideOverrides.find((item) => item.slug === slug);
  const destination = getDestinationProfileBySlug(slug);
  if (!destination) {
    return undefined;
  }

  if (!override) {
    return buildGenericDestinationGuide(destination);
  }

  return {
    ...override,
    destination,
  };
}

export function getEditorialArticles(): EditorialArticle[] {
  return editorialArticles;
}

export function getLatestEditorialArticles(limit = 6): EditorialArticle[] {
  return [...editorialArticles].slice(-limit).reverse();
}

export function getEditorialArticleBySlug(slug: string): EditorialArticle | undefined {
  return editorialArticles.find((article) => article.slug === slug);
}

export function getEditorialCategories(): EditorialCategory[] {
  return editorialCategories;
}

export function getEditorialCategoryBySlug(slug: string): EditorialCategory | undefined {
  return editorialCategories.find((category) => category.slug === slug);
}

export function getCategoriesForDestination(slug: string): EditorialCategory[] {
  const destination = getDestinationProfileBySlug(slug);
  if (!destination) {
    return [];
  }

  const inferredCategories = inferDestinationCategorySlugs(destination);
  return editorialCategories.filter((category) => inferredCategories.includes(category.slug));
}

export function getArticlesForCategory(slug: string): EditorialArticle[] {
  return editorialArticles.filter((article) => article.categorySlugs.includes(slug));
}

export function getArticlesForDestination(slug: string): EditorialArticle[] {
  const direct = editorialArticles.filter((article) => article.destinationSlugs.includes(slug));
  if (direct.length > 0) {
    return direct;
  }

  const destination = getDestinationProfileBySlug(slug);
  if (!destination) {
    return [];
  }

  const inferredCategories = inferDestinationCategorySlugs(destination);
  return editorialArticles.filter((article) =>
    article.categorySlugs.some((categorySlug) => inferredCategories.includes(categorySlug)),
  );
}

export function getRelatedArticles(article: EditorialArticle, limit = 3): EditorialArticle[] {
  return editorialArticles
    .filter((candidate) => candidate.slug !== article.slug)
    .map((candidate) => {
      const sharedCategories = candidate.categorySlugs.filter((slug) => article.categorySlugs.includes(slug)).length;
      const sharedDestinations = candidate.destinationSlugs.filter((slug) => article.destinationSlugs.includes(slug)).length;
      return {
        article: candidate,
        score: sharedCategories * 3 + sharedDestinations * 2,
      };
    })
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "pl"))
    .slice(0, limit)
    .map((item) => item.article);
}

export function getSimilarDestinations(slug: string, limit = 4): DestinationProfile[] {
  const current = getDestinationProfileBySlug(slug);
  if (!current) return [];

  return allDestinationProfiles
    .filter((destination) => destination.slug !== slug)
    .map((destination) => {
      const similarity =
        1 - Math.abs(destination.beachScore - current.beachScore) * 0.22 -
        Math.abs(destination.cityScore - current.cityScore) * 0.2 -
        Math.abs(destination.sightseeingScore - current.sightseeingScore) * 0.2 -
        Math.abs(destination.costIndex - current.costIndex) * 0.14 -
        Math.abs(destination.typicalFlightHoursFromPL - current.typicalFlightHoursFromPL) * 0.06 +
        (destination.region === current.region ? 0.06 : 0);

      return { destination, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((item) => item.destination);
}

