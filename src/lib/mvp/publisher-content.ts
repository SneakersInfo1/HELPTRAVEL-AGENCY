import { curatedDestinations } from "./destinations";
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
      "Malaga to jeden z najmocniejszych kierunkow dla osob, ktore chca miec plaze, zwiedzanie i prosty city break bez nadmiernej logistyki. Dobrze laczy klimat poludnia Hiszpanii z wygodnym lotem i szerokim wyborem noclegow.",
    whyGo: [
      "Latwo polaczyc wypoczynek nad morzem ze spacerami po starym miescie.",
      "Dobrze sprawdza sie na 3-5 dni i nie wymaga bardzo wysokiego budzetu.",
      "Na miejscu latwo zbudowac plan: zabytki, punkty widokowe, tapas i plaza.",
    ],
    bestTime:
      "Najlepszy czas na wyjazd to marzec-maj oraz wrzesien-listopad. Latem Malaga jest bardzo sloneczna i goraca, ale poza szczytem sezonu latwiej o lepszy balans ceny, pogody i komfortu.",
    budgetNote:
      "Na 4 dni budzet zwykle najlepiej rozkladac na lot, nocleg blisko centrum lub plazy, jedzenie i 1-2 platne atrakcje. To kierunek, w ktorym da sie rozsadnie planowac bez schodzenia do poziomu bardzo niskiego standardu.",
    whoFor: [
      "dla par szukajacych lekkiego city breaku z klima",
      "dla osob, ktore chca plaze i spacery po miescie",
      "dla wyjazdow 3-5 dni bez skomplikowanego planu",
    ],
    highlights: ["Alcazaba", "Gibralfaro", "La Malagueta", "Muelle Uno", "Mercado Atarazanas"],
    districts: ["Centro Historico", "La Malagueta", "Soho", "El Palo"],
    faq: [
      {
        question: "Czy Malaga jest dobra na pierwszy city break w Hiszpanii?",
        answer:
          "Tak. To jeden z latwiejszych kierunkow na start, bo daje prosty dojazd, czytelny uklad miasta i duzo rzeczy do zrobienia w krotkim czasie.",
      },
      {
        question: "Ile dni warto przeznaczyc na Malage?",
        answer:
          "Najwygodniej planowac 3-5 dni. Krotki weekend wystarczy na centrum i plaze, a przy 4-5 dniach mozna dorzucic wiecej lokalnych miejsc albo wyjazd poza miasto.",
      },
    ],
  },
  {
    slug: "barcelona-spain",
    overview:
      "Barcelona jest mocna, gdy zalezy Ci na duzym miescie z energia, architektura i odrobina klimatu nadmorskiego. To kierunek bardziej intensywny niz Malaga, ale bardzo atrakcyjny dla osob, ktore chca czuc tempo miasta.",
    whyGo: [
      "Szybko robi wrazenie i daje duzo powodow do powrotu.",
      "Laczy architekture, gastronomię i zycie wieczorne z dostepem do plazy.",
      "Nadaje sie zarowno na 4 dni, jak i dluzszy city break.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiace to kwiecien-czerwiec oraz wrzesien-pazdziernik. W lipcu i sierpniu jest najwiekszy tlok i najwyzsze ceny, ale wtedy tez najlatwiej polaczyc miasto z plaza.",
    budgetNote:
      "Barcelona rzadko bywa najtansza, dlatego warto pilnowac lokalizacji noclegu i kosztow jedzenia. Dobrze zaplanowany wyjazd nadal moze byc oplacalny, ale trzeba uwazac na wysokie koszty centrum.",
    whoFor: [
      "dla osob, ktore lubia mocny miejski klimat",
      "dla par i grup szukajacych wieczornego zycia",
      "dla wyjazdow, gdzie licza sie architektura i design",
    ],
    highlights: ["Sagrada Familia", "Park Guell", "Barceloneta", "El Born", "La Boqueria"],
    districts: ["Eixample", "El Born", "Barceloneta", "Gracia"],
    faq: [
      {
        question: "Czy Barcelona nadaje sie na tani weekend?",
        answer:
          "Moze sie udac, ale trzeba ostroznie wybierac termin i nocleg. To raczej kierunek o srednim lub wyzszym koszcie niz typowo budzetowy city break.",
      },
      {
        question: "Czy warto jechac do Barcelony tylko na 4 dni?",
        answer:
          "Tak. To jeden z najczestszych scenariuszy i przy dobrym planie 4 dni wystarcza na najmocniejsze miejsca i chwile nad morzem.",
      },
    ],
  },
  {
    slug: "lisbon-portugal",
    overview:
      "Lizbona ma bardziej nastrojowy rytm niz wiele innych stolic Europy. Dobrze pasuje do osob, ktore lubia spacery, punkty widokowe, jedzenie i mniej oczywisty klimat niz klasyczne duze miasto.",
    whyGo: [
      "Miasto jest charakterystyczne i dobrze zapamietywane nawet po krotkim wyjezdzie.",
      "Daje duzo widokow, lokalnych dzielnic i spokojniejszej atmosfery.",
      "Bardzo dobrze dziala na 4-5 dni z lekkim planem i przerwami na jedzenie.",
    ],
    bestTime:
      "Wiosna i wczesna jesien sa zwykle najlepsze. Zima jest lagodna, a lato przyjemne, ale najbardziej komfortowy balans temperatur i tloku wypada poza szczytem sezonu.",
    budgetNote:
      "Budzet w Lizbonie warto planowac z zapasem na poruszanie sie po miescie i jedzenie w bardziej klimatycznych miejscach. To kierunek, gdzie przyjemnosc wyjazdu czesto zalezy od dobrego rozkladu dnia, nie od ekstremalnego oszczedzania.",
    whoFor: [
      "dla osob, ktore lubia klimat i spacery",
      "dla par na krotki wyjazd z charakterem",
      "dla city breaku z widokami i spokojniejszym rytmem",
    ],
    highlights: ["Alfama", "Baixa", "Belem", "LX Factory", "punkty widokowe"],
    districts: ["Alfama", "Baixa", "Bairro Alto", "Belem"],
    faq: [
      {
        question: "Czy Lizbona jest dobra na pierwszy wyjazd do Portugalii?",
        answer:
          "Tak, bo daje dobry miks miejskich atrakcji, lokalnego klimatu i prostego planowania. Na pierwszy wyjazd 4-5 dni sprawdza sie bardzo dobrze.",
      },
      {
        question: "Czy w Lizbonie trzeba wynajmowac auto?",
        answer:
          "Nie. Na city break auto najczesciej nie jest potrzebne, a poruszanie sie po miescie najlepiej opierac na spacerach i transporcie miejskim.",
      },
    ],
  },
  {
    slug: "rome-italy",
    overview:
      "Rzym to klasyk, ale nadal bardzo mocny contentowo i komercyjnie. Dobrze sprawdza sie dla osob, ktore chca duzego nazwiska, ikon miasta i bardzo czytelnego powodu wyjazdu.",
    whyGo: [
      "To kierunek, ktory jest zrozumialy dla kazdego i latwo go sprzedac tresciowo.",
      "Najwazniejsze atrakcje sa mocne juz przy pierwszym wyjezdzie.",
      "Rzym bardzo dobrze sprawdza sie na 3-4 dni i ma silny potencjal na SEO.",
    ],
    bestTime:
      "Najwygodniejsze terminy to marzec-maj i pazdziernik-listopad. W wakacje bywa bardzo goraco i bardziej tloczno, dlatego wiele osob woli poza sezonem.",
    budgetNote:
      "W Rzymie latwo przepalic budzet na lokalizacji i restauracjach przy glownej trasie. Najlepiej szukac balansu: dobra baza noclegowa, sensowne tempo i kilka kluczowych atrakcji zamiast probowania zrobic wszystkiego naraz.",
    whoFor: [
      "dla osob stawiajacych na klasyczne zwiedzanie",
      "dla par i pierwszych city breakow",
      "dla wyjazdow 3-4 dni z mocnymi ikonami miasta",
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
        question: "Czy Rzym pasuje do budzetu do 2000 zl?",
        answer:
          "Przy dobrych terminach i ostroznym doborze noclegu bywa to mozliwe, ale Rzym czesciej jest kierunkiem, w ktorym warto zostawic sobie troche wiecej marginesu.",
      },
    ],
  },
  {
    slug: "budapest-hungary",
    overview:
      "Budapeszt jest jednym z najlepszych kierunkow dla osob, ktore chca dobrego stosunku ceny do jakosci. Nadaje sie do krotkich wyjazdow, romantycznych weekendow i budzetowych city breakow z Polski.",
    whyGo: [
      "To kierunek o bardzo dobrym balansie ceny, wygody i klimatu miasta.",
      "Mocne strony to termy, panoramy, spacery i wieczorne zycie nad Dunajem.",
      "Bardzo dobrze wypada przy budzetach, ktore nie pozwalaja na drozsze stolice Zachodu.",
    ],
    bestTime:
      "Wiosna i wczesna jesien sa zwykle najprzyjemniejsze. Zima nadal ma sens ze wzgledu na termy i klimat miasta, ale wtedy plan warto bardziej opierac o wnetrza i spokojne tempo.",
    budgetNote:
      "Budapeszt dobrze znosi nizsze budzety. Przy rozsadnym planie mozna zrobic udany wyjazd na 3-4 dni i nadal miec miejsce na jedzenie, termy i wieczorne wyjscie.",
    whoFor: [
      "dla osob szukajacych dobrej relacji cena-jakosc",
      "dla par na weekend",
      "dla city breaku z wieczornym klimatem",
    ],
    highlights: ["Parlament", "Baszty Rybackie", "termy", "wzgorze Gellerta", "nabrzeze Dunaju"],
    districts: ["Belvaros", "Buda", "Zydowska dzielnica", "okolice Parlamentu"],
    faq: [
      {
        question: "Czy Budapeszt nadaje sie na pierwszy city break za granice?",
        answer:
          "Tak. To bardzo bezpieczny wybor na start, bo jest prosty logistycznie, atrakcyjny cenowo i latwy do zaplanowania.",
      },
      {
        question: "Czy 2-3 dni wystarcza na Budapeszt?",
        answer:
          "Na szybki wypad tak, ale 3-4 dni pozwalaja lepiej polaczyc zwiedzanie, termy i spokojniejsze odkrywanie miasta.",
      },
    ],
  },
  {
    slug: "prague-czechia",
    overview:
      "Praga jest jednym z najlatwiejszych kierunkow na weekendowy city break z Polski. Mocno dziala na osoby, ktore chca pewnego wyjazdu: klimatyczne stare miasto, dobra gastronomia i prosty plan.",
    whyGo: [
      "Jest blisko, czytelnie i bardzo dobrze nadaje sie na 2-3 dni.",
      "Dobrze wypada kosztowo przy wyjazdach we dwoje i krotkich terminach.",
      "Ma jeden z najbardziej rozpoznawalnych klimatow miejskich w Europie Srodkowej.",
    ],
    bestTime:
      "Najlepiej sprawdza sie od kwietnia do czerwca oraz od wrzesnia do listopada. Zima tez ma sens, jesli celem jest bardziej klimat miasta niz dlugie spacery bez przerw.",
    budgetNote:
      "Praga jest mocna przy krotkim wyjezdzie i srednim budzecie. To kierunek, gdzie duza czesc atrakcji daje sie zobaczyc spacerem, co upraszcza plan i ogranicza koszty.",
    whoFor: [
      "dla weekendowych wyjazdow z Polski",
      "dla par i grup szukajacych klasycznego city breaku",
      "dla osob, ktore chca blisko i bez duzej logistyki",
    ],
    highlights: ["Most Karola", "Hradczany", "Rynek Starego Miasta", "Mala Strana", "punkty widokowe"],
    districts: ["Stare Miasto", "Mala Strana", "Nowe Miasto", "Vinohrady"],
    faq: [
      {
        question: "Czy Praga jest dobra na wyjazd bez samolotu?",
        answer:
          "Tak. W zaleznosci od miasta startowego wiele osob wybiera tez pociag lub samochod, co dodatkowo poszerza grupe odbiorcow tej strony.",
      },
      {
        question: "Czy Praga nadal jest dobrym kierunkiem przy ograniczonym budzecie?",
        answer:
          "Tak, szczegolnie na 2-3 dni. Trzeba jednak pilnowac noclegu w dobrym terminie, bo popularne weekendy potrafia byc drozsze.",
      },
    ],
  },
  {
    slug: "athens-greece",
    overview:
      "Ateny sa dobrym wyborem dla osob, ktore chca miec mocny historyczny kierunek, slonce i opcje dorzucenia nadmorskiego klimatu. To nie jest tylko muzeum pod chmurka, ale tez miasto na krotki, intensywny wyjazd.",
    whyGo: [
      "Silny miks historii, lokalnej kuchni i miejskiego rytmu.",
      "Latwo zbudowac plan 3-4 dni bez poczucia niedosytu.",
      "Dobrze pasuje do osob, ktore chca cieplo i zwiedzanie w jednym.",
    ],
    bestTime:
      "Ateny najlepiej wygladaja wiosna i jesienia. Lato jest bardzo gorace, ale nadal popularne, szczegolnie gdy wyjazd laczy miasto z nadmorskim odpoczynkiem.",
    budgetNote:
      "Budzet trzeba planowac pod wejscia do glownych atrakcji i nocleg z dobrym dojazdem. Przy dobrze wybranym terminie Ateny nadal moga byc oplacalnym city breakiem.",
    whoFor: [
      "dla osob, ktore chca cieplo i zabytki",
      "dla krotkiego urlopu 3-4 dni",
      "dla wyjazdow, gdzie duze znaczenie ma lokalna kuchnia",
    ],
    highlights: ["Akropol", "Plaka", "Monastiraki", "wzgorze Likavitos", "Ateńska agora"],
    districts: ["Plaka", "Monastiraki", "Koukaki", "Syntagma"],
    faq: [
      {
        question: "Czy Ateny sa bardziej kierunkiem na zwiedzanie czy na relaks?",
        answer:
          "Na sam city break to glownie zwiedzanie, ale przy dobrym planie mozna tez dorzucic bardziej relaksujace momenty i nadmorski klimat.",
      },
      {
        question: "Czy Ateny nadaja sie na 4 dni?",
        answer:
          "Tak. To bardzo dobry format, bo pozwala zobaczyc najwazniejsze miejsca i nie spieszyc sie przez caly wyjazd.",
      },
    ],
  },
  {
    slug: "valletta-malta",
    overview:
      "Malta dobrze pasuje do osob, ktore chca slonce, wygodny krotki wyjazd i miks miasta z morskim klimatem. To kierunek czytelny, kompaktowy i dobry dla polskiego odbiorcy planujacego 4-5 dni.",
    whyGo: [
      "Wyspa daje duzo wrazen na niewielkiej przestrzeni.",
      "Latwo zbudowac plan bez ciaglego przemieszczania sie.",
      "To dobry kierunek dla osob, ktore lubia jasny, sloneczny klimat i widoki.",
    ],
    bestTime:
      "Najwygodniej planowac od marca do czerwca oraz od wrzesnia do listopada. Malta jest mocna tez zima, jesli celem jest ucieczka od polskiej pogody i nie zalezy Ci na pelnym plazowaniu.",
    budgetNote:
      "Malta nie zawsze jest najtansza, ale dobrze dziala przy krotszym wyjezdzie. W budzecie warto pilnowac noclegu, bo lokalizacja potrafi mocno zmienic caly odbior wyjazdu.",
    whoFor: [
      "dla par i krotkich urlopow",
      "dla osob szukajacych slonca poza sezonem",
      "dla wyjazdu z widokami i spokojnym tempem",
    ],
    highlights: ["Valletta", "Mdina", "Three Cities", "nabrzeze", "punkty widokowe"],
    districts: ["Valletta", "Sliema", "St. Julian's", "Three Cities"],
    faq: [
      {
        question: "Czy Malta pasuje na 4 dni?",
        answer:
          "Tak. To jeden z najlepszych formatow, bo wyspa jest kompaktowa i w 4 dni mozna zobaczyc sporo bez przemeczenia.",
      },
      {
        question: "Czy Malta nadaje sie na wyjazd poza sezonem?",
        answer:
          "Tak, bardzo. Wlasnie wtedy czesto wypada najlepiej dla osob, ktore szukaja slonca, ale nie potrzebuja pelnego wakacyjnego sezonu.",
      },
    ],
  },
  {
    slug: "larnaca-cyprus",
    overview:
      "Cypr jest mocny dla osob, ktore chca cieplo, bezpieczny wyjazd i prosty model slonce plus morze plus odrobina zwiedzania. Larnaka dobrze spina ten scenariusz dla polskiego odbiorcy.",
    whyGo: [
      "To wygodny kierunek na 4-7 dni z naciskiem na odpoczynek.",
      "Dobrze sprawdza sie poza glownym sezonem letnim.",
      "Latwo polaczyc plaze z lekkim planem miejskim i wycieczkami.",
    ],
    bestTime:
      "Wiosna oraz jesien sa zwykle najprzyjemniejsze. Latem jest bardzo goraco, ale to nadal naturalny czas dla osob nastawionych glownie na plaze.",
    budgetNote:
      "Przy planowaniu budzetu warto uwzglednic transfery i standard noclegu, bo to mocno wplywa na odbior calego wyjazdu. Sam kierunek jest nadal stosunkowo prosty do zorganizowania.",
    whoFor: [
      "dla osob, ktore stawiaja na slonce i spokoj",
      "dla par i wyjazdow na 5-7 dni",
      "dla tych, ktorzy chca cieplego kierunku bez skomplikowanego planu",
    ],
    highlights: ["promenada Finikoudes", "plaze", "kosciol sw. Lazarza", "lokalne tawerny", "okolice Ayia Napy"],
    districts: ["centrum Larnaki", "Finikoudes", "Mackenzie", "okolice portu"],
    faq: [
      {
        question: "Czy Larnaka to kierunek glownie plazowy?",
        answer:
          "Tak, ale nie tylko. Dobrze dziala w modelu spokojnego wyjazdu z jedna lub dwiema wycieczkami i prostym rytmem dnia.",
      },
      {
        question: "Na ile dni warto leciec na Cypr?",
        answer:
          "Najczesciej 5-7 dni. Krotszy wyjazd nadal ma sens, ale ten kierunek dobrze wyglada przy nieco spokojniejszym tempie.",
      },
    ],
  },
  {
    slug: "istanbul-turkey",
    overview:
      "Stambul jest dla osob, ktore chca bardzo mocnego miejskiego kierunku z jedzeniem, historia i energia duzego miasta. To nie jest spokojny city break, ale swietny kierunek dla tych, ktorzy lubia intensywny klimat.",
    whyGo: [
      "To jedno z najbardziej charakterystycznych miast w zasiegu krotkiego lotu.",
      "Daje ogrom tresci pod przewodniki, foodie content i city break.",
      "Dobrze laczy wartosc historyczna z zyciem codziennym i lokalnym rytmem.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiace to kwiecien-czerwiec i wrzesien-listopad. Lato jest cieple i intensywne, ale dla wielu osob nadal bardzo atrakcyjne.",
    budgetNote:
      "Stambul daje sporo za swoj koszt, ale warto planowac margines na jedzenie, przejazdy i bardziej komfortowa baze noclegowa. To miasto, w ktorym lokalizacja noclegu bardzo zmienia wygode wyjazdu.",
    whoFor: [
      "dla osob, ktore lubia duze miasta",
      "dla foodie tripow i intensywnego zwiedzania",
      "dla city breaku z charakterem i historia",
    ],
    highlights: ["Hagia Sophia", "Blekitny Meczet", "Bazar", "Galata", "Bosfor"],
    districts: ["Sultanahmet", "Karakoy", "Galata", "Kadikoy"],
    faq: [
      {
        question: "Czy Stambul nadaje sie na 3 dni?",
        answer:
          "Tak, ale to raczej intensywny format. Najlepiej wypada 4-5 dni, kiedy da sie troche zwolnic i poczuc miasto.",
      },
      {
        question: "Czy to dobry kierunek dla osob, ktore lubia jedzenie?",
        answer:
          "Zdecydowanie tak. Kuchnia i rytm miasta sa jednym z najmocniejszych powodow, by wybrac ten kierunek.",
      },
    ],
  },
  {
    slug: "antalya-turkey",
    overview:
      "Antalya to mocny kierunek dla osob, ktore stawiaja na cieplo, morze i wygodny wypoczynek. Lepiej dziala jako krotki urlop niz klasyczny city break, ale dla wielu uzytkownikow to wlasnie taki kierunek bedzie najbardziej praktyczny.",
    whyGo: [
      "To prosty model: slonce, plaze i hotelowy komfort.",
      "Dobrze wypada dla wyjazdow 5-7 dni i wyzszego nacisku na relaks.",
      "Mozna go sprzedac tresciowo jako cieply kierunek z Polski.",
    ],
    bestTime:
      "Najlepiej sprawdza sie od maja do pazdziernika. Wysoki sezon daje najwiecej opcji plazowych, a poza szczytem latwiej zlapac lepszy balans ceny do pogody.",
    budgetNote:
      "Budzet zalezy mocno od standardu noclegu i formule wyjazdu. Sama destynacja daje szeroki zakres opcji, od bardziej budzetowych po wygodniejszy wypoczynek.",
    whoFor: [
      "dla osob nastawionych na slonce i morze",
      "dla krotkiego urlopu 5-7 dni",
      "dla par i wyjazdow z mocnym akcentem relaksu",
    ],
    highlights: ["stare miasto Kaleici", "plaze", "wodospady", "wycieczki w okolice", "widoki na wybrzeze"],
    districts: ["Kaleici", "Konyaalti", "Lara", "okolice mariny"],
    faq: [
      {
        question: "Czy Antalya to bardziej wakacje czy city break?",
        answer:
          "Zdecydowanie bardziej krotkie wakacje i wypoczynek niz klasyczny city break. Da sie tu zwiedzac, ale glowny atut to slonce i wygoda wyjazdu.",
      },
      {
        question: "Na ile dni najlepiej planowac Antalya?",
        answer:
          "Najlepiej 5-7 dni. Krotszy wyjazd tez ma sens, ale ten kierunek lepiej wypada przy spokojniejszym rytmie.",
      },
    ],
  },
  {
    slug: "marrakesh-morocco",
    overview:
      "Marrakesz jest dla osob, ktore szukaja mocno innego klimatu, ciepla i intensywnego miejskiego doswiadczenia. To bardzo dobry kandydat do scenariuszy typu cieplo, bez wizy, cos innego niz Europa.",
    whyGo: [
      "Daje wyrazny kontrast wobec klasycznych europejskich city breakow.",
      "Dobrze wyglada w contentach o cieplych kierunkach i wyjazdach bez wizy.",
      "Latwo zbudowac z niego mocna historie: kolory, jedzenie, medyna, targi i riady.",
    ],
    bestTime:
      "Najlepiej wypada od pazdziernika do kwietnia. Latem temperatury potrafia byc bardzo wysokie, dlatego wiele osob wybiera wlasnie sezony przejsciowe.",
    budgetNote:
      "Marrakesz czesto dobrze wyglada przy budzecie srednim, ale trzeba uczciwie liczyc koszty lotu i noclegu. To kierunek bardziej egzotyczny, ale nadal mozliwy do ogarniecia bez wielkiego budzetu.",
    whoFor: [
      "dla osob szukajacych czegos innego niz klasyczna Europa",
      "dla wyjazdow bez wizy z Polski",
      "dla krotkich wyjazdow z mocnym klimatem miejsca",
    ],
    highlights: ["medyna", "Jemaa el-Fnaa", "ogrody", "riady", "lokalna kuchnia"],
    districts: ["medyna", "Gueliz", "Hivernage", "Kasbah"],
    faq: [
      {
        question: "Czy Marrakesz nadaje sie na 4-5 dni?",
        answer:
          "Tak. To bardzo dobry format, bo wystarcza na wejscie w klimat miasta, kilka atrakcji i spokojniejszy rytm bez poczucia przesytu.",
      },
      {
        question: "Czy Marrakesz jest dobry dla osob szukajacych ciepla poza sezonem?",
        answer:
          "Tak. To jeden z kierunkow, ktory bardzo dobrze wypada jesienia, zima i wczesna wiosna, gdy wiele osob z Polski szuka slonca i wyraznego odciecia od codziennosci.",
      },
    ],
  },
  {
    slug: "agadir-morocco",
    overview:
      "Agadir jest spokojniejszym marokanskim kierunkiem niz Marrakesz i lepiej pasuje do osob, ktore stawiaja na plaze, slonce i prostszy model wypoczynku. To dobry kontrapunkt w tresciach o cieplych kierunkach.",
    whyGo: [
      "Dobrze wypada dla osob, ktore chca Maroko w lagodniejszej wersji.",
      "Ma mocniejszy profil plazowy niz typowo miejski.",
      "Nadaje sie do zestawien cieplo i relaks oraz plaza plus lokalny klimat.",
    ],
    bestTime:
      "Najlepiej sprawdza sie od jesieni do wiosny. Wtedy dobrze wpisuje sie w potrzebe ucieczki od chlodniejszej pogody w Polsce.",
    budgetNote:
      "Agadir dobrze wypada przy budzetach srednich, ale trzeba liczyc lot i standard noclegu. Dla wielu osob to kierunek bardziej relaksacyjny niz typowo budzetowy city break.",
    whoFor: [
      "dla osob nastawionych na plaze i spokoj",
      "dla par i krotkich wakacji",
      "dla wyjazdu z cieplem poza glownym sezonem europejskim",
    ],
    highlights: ["plaza", "promenada", "marina", "lokalne targi", "punkty widokowe"],
    districts: ["promenada", "centrum", "marina", "okolice plazy"],
    faq: [
      {
        question: "Czy Agadir jest bardziej na plaze niz na zwiedzanie?",
        answer:
          "Tak. To kierunek mocniej wypoczynkowy, dlatego najlepiej pasuje do osob, ktore chca slonce, morze i prosty rytm dnia.",
      },
      {
        question: "Na ile dni najlepiej leciec do Agadiru?",
        answer:
          "Najlepiej 5-7 dni, chociaz krotszy wyjazd tez ma sens, jesli zalezy Ci na szybkiej ucieczce do cieplego miejsca.",
      },
    ],
  },
  {
    slug: "las-palmas-spain",
    overview:
      "Las Palmas gra role kanaryjskiego kierunku dla osob, ktore szukaja ciepla wtedy, gdy Europa kontynentalna nie daje juz takiej pogody. To dobry temat pod content o zimowych i poza sezonowych wyjazdach.",
    whyGo: [
      "To jeden z mocniejszych kierunkow na slonce zima.",
      "Latwo sprzedac go tresciowo jako ucieczke od polskiej pogody.",
      "Dobrze laczy miejski klimat wyspy z plazami i bardziej urlopowym rytmem.",
    ],
    bestTime:
      "Najwieksza przewaga tego kierunku to jesien, zima i wczesna wiosna. Wlasnie wtedy Las Palmas ma najmocniejszy sens dla polskiego odbiorcy.",
    budgetNote:
      "Lot bywa dluzszy i to trzeba uczciwie zaznaczyc. Przy zimowym wyjezdzie wiele osob akceptuje ten kompromis, bo w zamian dostaje wyraznie lepsza pogode.",
    whoFor: [
      "dla osob szukajacych ciepla zima",
      "dla wyjazdow 5-7 dni",
      "dla tych, ktorzy chca polaczyc miasto i plaze",
    ],
    highlights: ["Las Canteras", "stare miasto", "punkty widokowe", "wyspiarski klimat", "spacery nad oceanem"],
    districts: ["Las Canteras", "Vegueta", "Triana", "okolice nabrzeza"],
    faq: [
      {
        question: "Czy Las Palmas nadaje sie na zimowy wyjazd z Polski?",
        answer:
          "Tak, i to jest jeden z najmocniejszych argumentow za tym kierunkiem. Wlasnie w chlodniejszych miesiacach wypada szczegolnie atrakcyjnie.",
      },
      {
        question: "Czy to bardziej city break czy urlop?",
        answer:
          "To cos pomiedzy. Ma miejska baze, ale najczesciej lepiej wypada jako krotkie wakacje niz bardzo szybki city break.",
      },
    ],
  },
  {
    slug: "funchal-portugal",
    overview:
      "Funchal i Madera pasuja do osob, ktore szukaja krajobrazow, natury i spokojniejszego rytmu. To swietny kierunek do contentow o krotkim urlopie, aktywnym wypoczynku i cieplych wyjazdach poza sezonem.",
    whyGo: [
      "To mocny kierunek dla natury, widokow i aktywnego odpoczynku.",
      "Dobrze odroznia sie od klasycznych city breakow z Europy.",
      "Ma silny potencjal pod przewodniki i tresci o krotkim urlopie.",
    ],
    bestTime:
      "Madera jest atrakcyjna przez duza czesc roku, ale najwiecej sensu ma zwykle wiosna, jesienia i zima, gdy szukasz lagodnej pogody oraz zielonego otoczenia.",
    budgetNote:
      "Budzet trzeba liczyc z mysla o charakterze wyspy: nocleg, transport i aktywnosci terenowe. To mniej kierunek na bardzo tani wypad, a bardziej na dobrze zaplanowany krotki urlop.",
    whoFor: [
      "dla osob, ktore lubia nature i widoki",
      "dla par na spokojniejszy wyjazd",
      "dla krotkich wakacji zamiast klasycznego city breaku",
    ],
    highlights: ["punkty widokowe", "lewady", "Funchal", "ogrody", "nadmorskie spacery"],
    districts: ["centrum Funchal", "okolice portu", "wzgorza", "strefy widokowe"],
    faq: [
      {
        question: "Czy Funchal pasuje na 4 dni?",
        answer:
          "Tak, ale przy 5-6 dniach kierunek wypada jeszcze lepiej. To miejsce, ktore korzysta na spokojniejszym rytmie i czasie na nature.",
      },
      {
        question: "Czy to dobry kierunek dla osob, ktore nie lubia samego lezenia na plazy?",
        answer:
          "Tak, zdecydowanie. Najmocniej wygrywa tu widok, natura i aktywne odkrywanie wyspy.",
      },
    ],
  },
  {
    slug: "valencia-spain",
    overview:
      "Walencja to jeden z najlepszych kompromisow miedzy klasycznym city breakiem a wyjazdem z oddechem. Daje plaze, dobre jedzenie, nowoczesna architekture i mniej przytlaczajace tempo niz Barcelona.",
    whyGo: [
      "Bardzo dobrze laczy miejski rytm z dostepem do morza i szerokich spacerowych stref.",
      "Dobrze wypada dla osob, ktore chca Hiszpanii, ale mniej chaosu niz w najwiekszych miastach.",
      "Nadaje sie na 4-5 dni i dobrze znosi scenariusz plaza plus zwiedzanie.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiace to kwiecien-czerwiec oraz wrzesien-listopad. Wysokie lato nadal ma sens, ale poza szczytem sezonu latwiej o przyjemniejszy rytm miasta i nizsza presje cenowa.",
    budgetNote:
      "Walencja dobrze wyglada przy budzecie srednim. Nie jest tak tania jak Budapeszt czy Praga, ale czesto daje bardzo dobry stosunek jakosci pobytu do finalnego kosztu.",
    whoFor: [
      "dla osob, ktore chca Hiszpanii bez przesadnie intensywnego tempa",
      "dla par i wyjazdow 4-5 dni",
      "dla scenariuszy plaza plus zwiedzanie",
    ],
    highlights: ["Miasto Sztuki i Nauki", "plaża Malvarrosa", "stare miasto", "Mercado Central", "Turia"],
    districts: ["Ciutat Vella", "Ruzafa", "El Carmen", "okolice Turii"],
    faq: [
      {
        question: "Czy Walencja jest lepsza od Barcelony na spokojniejszy wyjazd?",
        answer:
          "Dla wielu osob tak. Nadal daje Hiszpanie, plaze i dobre jedzenie, ale zwykle z mniejszym tlokiem i spokojniejszym rytmem niz Barcelona.",
      },
      {
        question: "Ile dni najlepiej zaplanowac na Walencje?",
        answer:
          "Najlepiej 4-5 dni. To format, w ktorym dobrze da sie polaczyc centrum, nowoczesne strefy i chwile nad morzem.",
      },
    ],
  },
  {
    slug: "naples-italy",
    overview:
      "Neapol jest kierunkiem dla osob, ktore chca intensywnego klimatu poludniowych Wloch, mocnej kuchni i miasta z charakterem. To nie jest wypolerowany city break, ale wlasnie dlatego daje bardzo mocne wrazenie miejsca.",
    whyGo: [
      "Jedzenie i lokalny rytm miasta sa same w sobie bardzo mocnym powodem wyjazdu.",
      "To dobry kierunek dla osob, ktore chca zobaczyc bardziej surowa i autentyczna strone Wloch.",
      "Dobrze laczy sie z pomyslem na 3-4 dni w miescie lub z szerszym planem wokol Kampanii.",
    ],
    bestTime:
      "Najlepiej planowac Neapol na wiosne i jesien, gdy temperatury sprzyjaja spacerom i wyjazdom po okolicy. Lato bywa bardziej meczace, szczegolnie przy intensywnym zwiedzaniu.",
    budgetNote:
      "Neapol potrafi byc rozsadniejszy kosztowo niz Rzym czy Mediolan, ale warto pilnowac lokalizacji noclegu i logistyki pierwszego dnia. To kierunek, gdzie wygoda bazy noclegowej ma duze znaczenie.",
    whoFor: [
      "dla foodie tripow i intensywnych miejskich wyjazdow",
      "dla osob, ktore lubia surowy lokalny klimat",
      "dla 3-4 dni we Wloszech bez zbednego polerowania",
    ],
    highlights: ["Spaccanapoli", "historyczne centrum", "nabrzeze", "pizza", "punkty startowe na Pompeje i Wezuwiusz"],
    districts: ["Centro Storico", "Chiaia", "Quartieri Spagnoli", "okolice nabrzeza"],
    faq: [
      {
        question: "Czy Neapol to dobry pierwszy city break we Wloszech?",
        answer:
          "Tak, ale raczej dla osob, ktore lubia miasta z mocnym charakterem. Jesli szukasz bardziej klasycznego i przewidywalnego scenariusza, prostszy moze byc Rzym.",
      },
      {
        question: "Czy na Neapol wystarcza 3 dni?",
        answer:
          "Tak. To jeden z tych kierunkow, ktore potrafia zrobic wrazenie juz przy 3 dniach, jesli plan jest dobrze ustawiony.",
      },
    ],
  },
  {
    slug: "tirana-albania",
    overview:
      "Tirana to ciekawy kierunek dla osob, ktore szukaja mniej oczywistego miasta na city break i chca polaczyc nizszy koszt z poczuciem odkrywania czegos mniej oklepanego. Daje miejski klimat, prostszy budzet i dobry punkt startowy do dalszego poznawania Albanii.",
    whyGo: [
      "Dobrze sprawdza sie dla osob, ktore chca nowego kierunku bez presji najdrozszych stolic Europy.",
      "To mocny kandydat do tresci o tanich wyjazdach i mniej oczywistych city breakach.",
      "Przy krotszym pobycie daje miejski klimat, a przy 4-5 dniach mozna myslec tez o okolicy.",
    ],
    bestTime:
      "Najprzyjemniejsze miesiace to kwiecien-czerwiec i wrzesien-pazdziernik. Wtedy Tirana daje przyjemniejszy balans pogody i miejskiego tempa.",
    budgetNote:
      "To jeden z kierunkow, ktory czesto dobrze wypada przy ograniczonym budzecie. Nadal warto jednak patrzec na calosc wyjazdu: lot, lokalizacje noclegu i plan dnia.",
    whoFor: [
      "dla osob szukajacych mniej oczywistych miast",
      "dla budzetowych city breakow",
      "dla wyjazdow 3-4 dni z poczuciem odkrywania nowego kierunku",
    ],
    highlights: ["Plac Skanderbega", "Bunk'Art", "kawiarnie", "kolejka Dajti", "miejskie zycie wieczorne"],
    districts: ["Blloku", "centrum", "okolice placu Skanderbega", "rejony kawiarniane"],
    faq: [
      {
        question: "Czy Tirana nadaje sie na tani city break?",
        answer:
          "Tak, to jedna z jej mocniejszych stron. Przy dobrze dobranym locie i rozsadnym noclegu potrafi bardzo dobrze wypasc kosztowo.",
      },
      {
        question: "Czy Tirana jest dobrym kierunkiem dla osob, ktore byly juz w klasycznych stolicach Europy?",
        answer:
          "Tak. Wlasnie wtedy daje dodatkowa wartosc, bo pokazuje mniej oczywisty miejski klimat i nie jest kopia najpopularniejszych tras city breakowych.",
      },
    ],
  },
  {
    slug: "berlin-germany",
    overview:
      "Berlin jest dobrym kierunkiem dla osob, ktore szukaja duzego europejskiego miasta z muzeami, dzielnicami i bardzo wyraznym charakterem. To mocny kandydat do city breakow dla osob, ktore cenią kulture, gastro i miejski rytm bardziej niz klasyczne odhaczanie ikon.",
    whyGo: [
      "Daje ogrom tresci: muzea, architekture, dzielnice i bardzo mocny klimat miejski.",
      "Dobrze pasuje do wyjazdow 3-4 dni i do odbiorcy, ktory lubi odkrywac miasto warstwami.",
      "To mocny kierunek pod publiczny travel content, bo dobrze laczy praktyke z wyrazna tozsamoscia miejsca.",
    ],
    bestTime:
      "Berlin najlepiej sprawdza sie od kwietnia do czerwca oraz we wrzesniu i pazdzierniku. To miesiace, w ktorych spacery i tempo miasta sa najbardziej komfortowe.",
    budgetNote:
      "Berlin bywa sredni lub wyzszy kosztowo, ale nadal da sie go zaplanowac rozsadnie. Kluczowe jest znalezienie dobrej bazy w dzielnicy, ktora nie utrudnia poruszania sie po miescie.",
    whoFor: [
      "dla osob lubiacych muzea, dzielnice i gastronomię",
      "dla city breakow z miejskim rytmem zamiast typowego sightseeingu",
      "dla wyjazdow 3-4 dni z naciskiem na kulture",
    ],
    highlights: ["Wyspa Muzeow", "East Side Gallery", "Mitte", "Kreuzberg", "Prenzlauer Berg"],
    districts: ["Mitte", "Kreuzberg", "Prenzlauer Berg", "Neukolln"],
    faq: [
      {
        question: "Czy Berlin pasuje na pierwszy city break do Niemiec?",
        answer:
          "Tak. To bardzo mocny wybor, szczegolnie jesli bardziej od klasycznych zabytkow interesuje Cie nowoczesne duze miasto z warstwami i klimatem.",
      },
      {
        question: "Ile dni warto przeznaczyc na Berlin?",
        answer:
          "Najlepiej 3-4 dni. Taki format pozwala zobaczyc kilka roznych dzielnic i nie robic wyjazdu w zbyt duzym pospiechu.",
      },
    ],
  },
  {
    slug: "amsterdam-netherlands",
    overview:
      "Amsterdam to kierunek mocny dla osob, ktore szukaja kompaktowego miasta o wysokiej jakosci spaceru, estetyce i bardzo czytelnym miejskim klimacie. Dobrze dziala na 3-4 dni i ma silna rozpoznawalnosc dla polskiego odbiorcy.",
    whyGo: [
      "Miasto jest kompaktowe i bardzo dobrze nadaje sie do zwiedzania bez rozbudowanej logistyki.",
      "To mocny kierunek dla par, weekendowych wypadów i scenariuszy z naciskiem na klimat miejsca.",
      "Bardzo dobrze wyglada tresciowo: kanały, muzea, dzielnice i spokojniejszy rytm dnia.",
    ],
    bestTime:
      "Najbardziej komfortowe sa wiosna oraz wczesna jesien. To czas, w ktorym Amsterdam daje najlepszy balans pogody, spaceru i klimatu miasta.",
    budgetNote:
      "Amsterdam rzadko jest kierunkiem budzetowym, dlatego trzeba uczciwie komunikowac wyzsze koszty noclegow. Nadal jednak wiele osob uznaje go za kierunek wart doplaty ze wzgledu na jakosc pobytu.",
    whoFor: [
      "dla par i estetycznych city breakow",
      "dla osob, ktore lubia kompaktowe miasta",
      "dla 3-4 dni z naciskiem na muzealny i spacerowy rytm",
    ],
    highlights: ["kanały", "Jordaan", "muzea", "Vondelpark", "de 9 straatjes"],
    districts: ["Jordaan", "centrum", "De Pijp", "Museumplein"],
    faq: [
      {
        question: "Czy Amsterdam nadaje sie na weekend we dwoje?",
        answer:
          "Tak, to jeden z jego najmocniejszych scenariuszy. Miasto jest zwarte, klimatyczne i dobrze dziala przy spokojniejszym rytmie.",
      },
      {
        question: "Czy Amsterdam jest dobrym kierunkiem przy ograniczonym budzecie?",
        answer:
          "Raczej nie jest to najtanszy wybor. To kierunek, ktory bardziej wygrywa klimatem i jakoscia miasta niz sama niska cena.",
      },
    ],
  },
  {
    slug: "dublin-ireland",
    overview:
      "Dublin pasuje do osob, ktore chca prostego, anglojezycznego city breaku z pubami, muzyka na zywo i klimatem miasta, ktore dobrze sprawdza sie na szybki wyjazd. To kierunek bardziej o atmosferze niz o długiej liscie ikon.",
    whyGo: [
      "To prosty format na 2-4 dni z bardzo czytelnym rytmem miasta.",
      "Dobrze wypada dla osob, ktore cenią klimat, muzyke, gastro i wieczorne zycie.",
      "To przydatny kontrapunkt wobec bardziej slonecznych city breakow.",
    ],
    bestTime:
      "Dublin najlepiej planowac od maja do wrzesnia, kiedy pogoda bardziej sprzyja spacerom. Poza tym okresem nadal ma sens, ale trzeba liczyc sie z bardziej zmiennymi warunkami.",
    budgetNote:
      "Dublin nie jest kierunkiem niskobudzetowym, dlatego najwazniejsze jest uczciwe ustawienie oczekiwan. Najlepiej traktowac go jako city break premium-light, a nie tania ucieczke na weekend.",
    whoFor: [
      "dla osob szukajacych klimatu miasta i wieczornego zycia",
      "dla wyjazdow 2-4 dni",
      "dla tych, ktorzy cenią latwy format bez rozbudowanej logistyki",
    ],
    highlights: ["Temple Bar", "Trinity College", "puby", "nadbrzeza", "miejskie spacery"],
    districts: ["Temple Bar", "centrum", "St Stephen's Green", "Docklands"],
    faq: [
      {
        question: "Czy Dublin to bardziej kierunek na klimat niz na klasyczne zabytki?",
        answer:
          "Tak. To miasto bardziej wygrywa atmosfera, pubami, muzyka i spacerowym rytmem niz bardzo dluga lista ikon do odhaczenia.",
      },
      {
        question: "Na ile dni najlepiej planowac Dublin?",
        answer:
          "Najlepiej 2-4 dni. To format, w ktorym najlepiej wypada i nie potrzebuje rozciagania do tygodniowego urlopu.",
      },
    ],
  },
  {
    slug: "london-uk",
    overview:
      "Londyn to kierunek dla osob, ktore chca duzego, wielowarstwowego miasta z muzeami, dzielnicami i bardzo mocnym powodem do wyjazdu. To nie jest tani city break, ale nadal jest jednym z najmocniejszych kierunkow dla odbiorcy szukajacego duzego europejskiego miasta.",
    whyGo: [
      "Daje bardzo szeroki wachlarz scenariuszy: kultura, muzea, zakupy, gastronomia i klasyczne ikony miasta.",
      "To kierunek, ktory dobrze dziala w tresciach porownawczych i scenariuszach premium-light.",
      "Bardzo mocno pracuje na rozpoznawalnosc marki i publiczny charakter serwisu.",
    ],
    bestTime:
      "Najbardziej komfortowe miesiace to maj-czerwiec oraz wrzesien-pazdziernik. Londyn da sie odwiedzac przez caly rok, ale w tych miesiacach zwykle najlatwiej o wygodny rytm spacerowy.",
    budgetNote:
      "To kierunek drozszy, dlatego kluczowe jest uczciwe ustawienie oczekiwan i budzetu. W zamian Londyn daje ogrom tresci, muzeow i scenariuszy pobytu nawet na krotki wyjazd.",
    whoFor: [
      "dla osob, ktore chca duzego miasta z bardzo szeroka oferta",
      "dla 3-5 dni z naciskiem na kulture i dzielnice",
      "dla wyjazdow, gdzie koszt schodzi na drugi plan wobec jakosci kierunku",
    ],
    highlights: ["Westminster", "South Bank", "muzea", "Covent Garden", "Notting Hill"],
    districts: ["West End", "South Bank", "Notting Hill", "Shoreditch"],
    faq: [
      {
        question: "Czy Londyn ma sens na 3 dni?",
        answer:
          "Tak, ale trzeba podejsc do niego selektywnie. To kierunek, ktory daje duzo nawet przy 3 dniach, ale zdecydowanie nie da sie wtedy zobaczyc wszystkiego.",
      },
      {
        question: "Czy Londyn nadaje sie do tresci o tanich podrozach?",
        answer:
          "Raczej nie. To kierunek, ktory lepiej opisywac przez jakosc i sile scenariusza wyjazdu niz przez bardzo niski budzet.",
      },
    ],
  },
];

const editorialArticles: EditorialArticle[] = [
  {
    slug: "cieple-kraje-bez-wizy",
    title: "Cieple kraje bez wizy",
    description:
      "Praktyczny przewodnik po cieplych kierunkach, ktore dobrze sprawdzaja sie z Polski i nie wymagaja skomplikowanej logistyki.",
    excerpt:
      "Scenariusz dla osob, ktore chca slonca, prostszych formalnosci i sensownego budzetu na 4-7 dni.",
    hero:
      "To jeden z najmocniejszych tematow dla polskiego odbiorcy: cieplo, bez zbednych formalnosci i kierunki, ktore da sie ogarnac w rozsadnym budzecie.",
    plannerPrompt:
      "Chce do cieplego kraju bez wizy, 5 dni, budzet do 2500 zl, najlepiej z Polski, plaza i cos do zwiedzania.",
    categorySlugs: ["cieple-kierunki", "bez-wizy", "przewodniki"],
    destinationSlugs: ["marrakesh-morocco", "agadir-morocco", "antalya-turkey", "larnaca-cyprus", "las-palmas-spain"],
    practicalBullets: [
      "Sprawdz realny czas lotu, a nie tylko sam koszt biletu.",
      "Nie mieszaj bardzo taniego lotu z bardzo slabym noclegiem tylko po to, by zmiescic sie w budzecie.",
      "Przy 4-5 dniach mocniej premiuj kierunki z prostym dojazdem i szybkim transferem z lotniska.",
    ],
    sections: [
      {
        title: "Kiedy taki kierunek ma najwiecej sensu",
        paragraphs: [
          "Najczesciej wtedy, gdy chcesz uciec od zimniejszej pogody w Polsce i nie planujesz dlugiego urlopu. Cieple kierunki bez dodatkowej biurokracji wygrywaja prostota decyzji.",
          "To tez dobry scenariusz dla osob, ktore chca zaplanowac wyjazd szybko: masz budzet, liczbe dni i styl wyjazdu, a potem potrzebujesz juz tylko dobrej selekcji kierunkow.",
        ],
      },
      {
        title: "Na co patrzec przy wyborze",
        paragraphs: [
          "Najwazniejsze jest polaczenie pogody, czasu lotu i budzetu. Samo cieplo nie wystarczy, jesli dojazd zjada zbyt duzo czasu albo mocno ogranicza jakosc noclegu.",
        ],
        bullets: [
          "pogoda w konkretnym miesiacu, nie tylko ogolna srednia roczna",
          "czas lotu i liczba przesiadek",
          "czy kierunek jest bardziej plazowy czy bardziej miejski",
        ],
      },
      {
        title: "Jak korzystac z planera",
        paragraphs: [
          "W plannerze warto wpisac konkret: budzet, liczbe dni, czy zalezy Ci na plazy, oraz czy wolisz spokojny wyjazd czy laczenie plazy ze zwiedzaniem. To od razu poprawia ranking i powoduje, ze wynik nie jest generyczny.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy bez wizy zawsze oznacza brak jakichkolwiek formalnosci?",
        answer:
          "Nie. To dobra wskazowka na etapie wyboru kierunku, ale przed wyjazdem zawsze trzeba sprawdzic aktualne zasady wjazdu i wymagane dokumenty.",
      },
      {
        question: "Czy da sie poleciec do cieplego kraju na 5 dni i nie przepalic budzetu?",
        answer:
          "Tak, ale najlepiej wybierac kierunki z dobrym stosunkiem ceny do pogody i nie przeciagac lotu ponad to, co ma sens przy tak krotkim czasie.",
      },
    ],
  },
  {
    slug: "tanie-city-breaki-na-weekend",
    title: "Tanie city breaki na weekend",
    description:
      "Zestawienie kierunkow, ktore daja sensowna jakosc na 2-4 dni bez potrzeby rozciagania budzetu ponad potrzebe.",
    excerpt:
      "Weekendowy city break powinien byc prosty: latwy dojazd, czytelny plan i dobra relacja ceny do wygody.",
    hero:
      "Weekendowy wyjazd nie musi byc przypadkowy. Najlepiej dzialaja kierunki, ktore sa blisko, maja prosty uklad miasta i nie wymagaja wielkiej logistyki.",
    plannerPrompt:
      "Szukam taniego city breaku na weekend, 2-3 dni, z Polski, duzo zwiedzania i budzet do 1800 zl.",
    categorySlugs: ["city-breaki", "tanie-podroze", "weekendowe-wyjazdy"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "rome-italy", "malaga-spain"],
    practicalBullets: [
      "Na 2-3 dni premiuj kierunki z szybkim transferem z lotniska.",
      "Lepszy prosty hotel blisko centrum niz pozornie tanszy nocleg daleko od wszystkiego.",
      "Najpierw licz czas, dopiero potem dopracowuj liste atrakcji.",
    ],
    sections: [
      {
        title: "Co sprawia, ze city break jest naprawde oplacalny",
        paragraphs: [
          "Nie zawsze wygrywa najnizsza cena lotu. W weekendowych wyjazdach liczy sie tez wygodny dojazd, latwe poruszanie sie po miescie i brak potrzeby ciaglego przemieszczania sie.",
          "Dlatego czesto lepiej wypada kierunek wystarczajaco tani, ale prostszy i bardziej przewidywalny.",
        ],
      },
      {
        title: "Jak nie zepsuc sobie krotkiego wyjazdu",
        paragraphs: [
          "Najczestszy blad to ladowanie zbyt wielu atrakcji do 48 godzin. Taki wyjazd powinien zostawic przestrzen na jedzenie, spacer i oddech, inaczej nawet dobry kierunek zaczyna meczyc.",
        ],
      },
      {
        title: "Dla kogo taki scenariusz dziala najlepiej",
        paragraphs: [
          "To idealna opcja dla par, znajomych i osob, ktore chca wyjechac bez brania dlugiego urlopu. Wlasnie dlatego ten temat dobrze pracuje pod afiliacje i ruch z SEO.",
        ],
      },
    ],
    faq: [
      {
        question: "Jaki budzet ma sens na tani city break?",
        answer:
          "Najczesciej od 1500 do 2500 zl za caly wyjazd, zalezne od kierunku, terminu i standardu noclegu. Najwazniejszy jest jednak stosunek kosztu do wygody.",
      },
      {
        question: "Czy na weekend lepiej wybierac Poludnie Europy czy kierunki blizsze Polsce?",
        answer:
          "Przy bardzo krotkim formacie zwykle lepiej wypadaja kierunki z krotszym lotem, chyba ze mocno zalezy Ci na pogodzie i akceptujesz dluzszy dojazd.",
      },
    ],
  },
  {
    slug: "najlepsze-kierunki-na-4-dni",
    title: "Najlepsze kierunki na 4 dni",
    description:
      "Praktyczny wybor kierunkow na 4-dniowy wyjazd z Polski z naciskiem na sensowny balans zwiedzania, komfortu i budzetu.",
    excerpt:
      "Cztery dni to jeden z najlepszych formatow na miasto albo lekki kierunek z plaza i zwiedzaniem.",
    hero:
      "4 dni to wystarczajaco duzo, zeby poczuc kierunek, ale nadal na tyle krotko, ze trzeba dobrze wybierac logistyke i charakter miasta.",
    plannerPrompt:
      "Najlepszy kierunek na 4 dni z Polski, budzet do 2500 zl, zwiedzanie i dobry klimat miasta.",
    categorySlugs: ["city-breaki", "przewodniki"],
    destinationSlugs: ["lisbon-portugal", "rome-italy", "athens-greece", "barcelona-spain", "budapest-hungary"],
    practicalBullets: [
      "4 dni to bardzo dobry format na jedno miasto z 1-2 dodatkowymi strefami.",
      "Najlepiej wybierac kierunki, ktore nie zmuszaja do wielu przesiadek i dalekich transferow.",
      "W tym formacie bardziej oplaca sie skupic na jakosci planu niz na odhaczaniu wszystkiego.",
    ],
    sections: [
      {
        title: "Dlaczego 4 dni to tak dobry format",
        paragraphs: [
          "To jeden z najbardziej praktycznych ukladow dla polskiego odbiorcy. Pozwala zobaczyc duzo wiecej niz weekend, ale nie wymaga jeszcze pelnych wakacji ani wysokiego budzetu.",
        ],
      },
      {
        title: "Jak wybierac miasto na 4 dni",
        paragraphs: [
          "Szukaj miejsc, ktore maja mocne centrum, kilka dzielnic z roznym klimatem i dobry dostep z lotniska. Wlasnie takie kierunki najczesciej zostawiaja najlepsze wrazenie po krotkim wyjezdzie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 4 dni wystarcza na Barcelona albo Rzym?",
        answer:
          "Tak, jesli plan jest dobrze ustawiony i nie probujesz zobaczyc wszystkiego naraz. To wlasnie jeden z najczestszych i najlepszych formatow dla tych kierunkow.",
      },
      {
        question: "Czy lepiej wybrac jeden kierunek czy laczyc dwa miasta?",
        answer:
          "Przy 4 dniach prawie zawsze lepiej wygrywa jeden kierunek. Tylko wtedy masz szanse na wyjazd, ktory jest wygodny i daje prawdziwe wrazenie miejsca.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-do-2000-zl",
    title: "Gdzie poleciec do 2000 zl",
    description:
      "Kierunki, ktore maja realna szanse zmiescic sie w budzecie do 2000 zl, szczegolnie przy krotszych formatach wyjazdu.",
    excerpt:
      "To temat dla osob, ktore szukaja konkretu: jaki kierunek ma jeszcze sens, gdy budzet jest wyraznie ograniczony.",
    hero:
      "Budzet do 2000 zl wciaz pozwala zaplanowac sensowny wyjazd, ale wymaga lepszego filtrowania kierunku i unikania miejsc, ktore na starcie sa po prostu zbyt drogie.",
    plannerPrompt:
      "Gdzie poleciec do 2000 zl z Polski, 3-4 dni, najlepiej dobre jedzenie i zwiedzanie.",
    categorySlugs: ["tanie-podroze", "city-breaki"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "athens-greece", "malaga-spain"],
    practicalBullets: [
      "Przy takim budzecie wybieraj krotsze wyjazdy i mocno patrz na lot plus nocleg, nie tylko na sama destynacje.",
      "Najlepiej dzialaja miasta o mocnym centrum i niewielkiej potrzebie dodatkowych przejazdow.",
      "Wynik ma byc sensowny, a nie ekstremalnie tani kosztem komfortu.",
    ],
    sections: [
      {
        title: "Co naprawde miesci sie w tym budzecie",
        paragraphs: [
          "Najlatwiej zmiescic sie przy 2-4 dniach i kierunkach o srednim lub niskim koscie na miejscu. W drozszych stolicach taki budzet szybko robi sie zbyt ciasny.",
        ],
      },
      {
        title: "Jak uniknac pozornie taniego wyjazdu",
        paragraphs: [
          "Niski lot i bardzo slaby nocleg daleko od centrum rzadko daja dobry efekt. Warto patrzec na calosc: wygode, czas i jakosc pobytu, nie tylko sama cyfre.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 2000 zl to budzet na osobe czy za caly wyjazd?",
        answer:
          "Najczesciej takie frazy sa rozumiane jako caly budzet scenariusza planowania. W praktyce zawsze warto doprecyzowac to w plannerze, bo mocno zmienia ranking.",
      },
      {
        question: "Czy w tym budzecie lepiej wybierac Europe Srodkowa?",
        answer:
          "Czesto tak, bo skraca lot i poprawia stosunek ceny do czasu na miejscu. Ale przy dobrym terminie mozna czasem zmiescic tez poludniowe kierunki.",
      },
    ],
  },
  {
    slug: "gdzie-na-weekend-we-dwoje",
    title: "Gdzie na weekend we dwoje",
    description:
      "Pomysly na city break i krotkie wyjazdy dla par, z naciskiem na klimat miejsca, tempo dnia i komfort wyjazdu.",
    excerpt:
      "Dobre kierunki dla par to nie zawsze najglosniejsze miasta. Liczy sie klimat, spacery, jedzenie i sensowny rytm pobytu.",
    hero:
      "Weekend we dwoje powinien byc prosty do zaplanowania i miec wyrazny charakter: nastrojowe dzielnice, dobra gastronomia, spacerowy rytm i realny czas dla siebie.",
    plannerPrompt:
      "Gdzie na weekend we dwoje z Polski, dobry klimat miasta, 3 dni, bez stresu i z dobrym jedzeniem.",
    categorySlugs: ["weekendowe-wyjazdy", "city-breaki"],
    destinationSlugs: ["budapest-hungary", "lisbon-portugal", "malaga-spain", "valletta-malta"],
    practicalBullets: [
      "Na wyjazd dla par lepiej dzialaja miasta z dobrym rytmem spacerowym niz kierunki wymagajace ciaglego przemieszczania sie.",
      "Wieczorne dzielnice, punkty widokowe i dobra baza noclegowa robia wieksza roznice niz przesadnie dluga lista atrakcji.",
      "Warto pilnowac lotu powrotnego, zeby nie zepsuc ostatniego dnia.",
    ],
    sections: [
      {
        title: "Czego najczesciej szukaja pary",
        paragraphs: [
          "Nie chodzi tylko o romantycznosc. Dla wielu osob liczy sie wygoda wyjazdu, dobra kuchnia, spacerowy klimat i poczucie, ze miasto nie wymusza ciaglego tempa.",
        ],
      },
      {
        title: "Jak wybrac kierunek pod taki wyjazd",
        paragraphs: [
          "Warto stawiac na miasta, ktore dobrze dzialaja juz od pierwszego wieczoru. Jesli po przylocie mozesz od razu wejsc w klimat centrum, promenady lub dzielnicy z restauracjami, to znaczy, ze kierunek pracuje na Twoja korzysc.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy lepszy bedzie kierunek plazowy czy miejski?",
        answer:
          "To zalezy od pory roku i oczekiwan. Na krotki weekend czesto lepiej wypada miasto z miejscem na spacer i dobra kolacje niz kierunek stricte wakacyjny.",
      },
      {
        question: "Ile dni planowac na weekend we dwoje?",
        answer:
          "Najczesciej 2-4 dni. To wystarcza, by zlapac klimat miejsca bez rozciagania kosztu i organizacji.",
      },
    ],
  },
  {
    slug: "najlepsze-kierunki-na-krotki-urlop",
    title: "Najlepsze kierunki na krotki urlop",
    description:
      "Wybor kierunkow na 4-7 dni, gdy chcesz czegos wiecej niz weekend, ale bez planowania duzych wakacji.",
    excerpt:
      "Krotki urlop powinien laczyc wygode lotu, sensowny rytm dnia i kierunek, ktory daje dosc atrakcji bez chaosu.",
    hero:
      "Najlepsze kierunki na krotki urlop to te, ktore nie wymagaja duzej logistyki, a jednoczesnie daja realne odciecie od codziennosci.",
    plannerPrompt:
      "Szukam kierunku na krotki urlop 5-6 dni, cieplo albo miejski klimat, z Polski, budzet do 3000 zl.",
    categorySlugs: ["przewodniki", "cieple-kierunki"],
    destinationSlugs: ["malaga-spain", "athens-greece", "larnaca-cyprus", "funchal-portugal", "antalya-turkey"],
    practicalBullets: [
      "W tym formacie szczegolnie liczy sie balans czasu lotu do czasu pobytu.",
      "Najlepiej wybierac kierunki, ktore daja wiecej niz jedna rzecz: na przyklad plaze i miasto albo nature i spokoj.",
      "Dobrze jest miec jeden glowny plan dnia i sporo luzu dookola niego.",
    ],
    sections: [
      {
        title: "Kiedy krotki urlop wygrywa z klasycznym city breakiem",
        paragraphs: [
          "Wtedy, gdy chcesz nie tylko zobaczyc miasto, ale tez odpoczac. 5-6 dni pozwala lepiej rozlozyc wyjazd i nie zamienia calego pobytu w ciagle przejazdy i odhaczanie atrakcji.",
        ],
      },
      {
        title: "Jak budowac ranking takich kierunkow",
        paragraphs: [
          "Najmocniej powinny punktowac kierunki z dobrym dojazdem, przewidywalna pogoda i wysoka szansa, ze juz pierwszy dzien bedzie przyjemny, a nie tylko organizacyjny.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 5 dni to juz wakacje czy jeszcze city break?",
        answer:
          "To format pomiedzy. Wlasnie dlatego jest tak ciekawy tresciowo i produktowo: pozwala zlapac i miejski klimat, i chwile odpoczynku.",
      },
      {
        question: "Czy taki wyjazd musi byc drogi?",
        answer:
          "Nie. Przy dobrym kierunku i rozsadnym terminie nadal da sie utrzymac koszt na sensownym poziomie, zwlaszcza jesli nie celujesz w najdrozsze stolice.",
      },
    ],
  },
  {
    slug: "tanie-kierunki-z-polski",
    title: "Tanie kierunki z Polski",
    description:
      "Kierunki, ktore dobrze wypadaja dla osob startujacych z Polski i szukajacych realnej relacji ceny do jakosci.",
    excerpt:
      "To nie tylko kwestia samego lotu. Liczy sie tez to, ile kosztuje pobyt na miejscu i czy kierunek dobrze wypada przy krotkim czasie.",
    hero:
      "Najciekawsze tanie kierunki z Polski to te, ktore nie tylko maja dobry bilet, ale jeszcze pozwalaja sensownie spedzic czas bez przepalania budzetu na miejscu.",
    plannerPrompt:
      "Tanie kierunki z Polski, 4 dni, budzet do 2200 zl, zwiedzanie i dobry dojazd.",
    categorySlugs: ["tanie-podroze", "przewodniki"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "istanbul-turkey", "athens-greece", "malaga-spain"],
    practicalBullets: [
      "Nie patrz tylko na stolice. Czasem lepiej wypada miasto o slabiej rozpoznawalnej marce, ale lepszym budzecie.",
      "Przy tanim kierunku bardzo duzo daje dobra lokalizacja noclegu i prosty plan dnia.",
      "Najmocniej wygrywaja miejsca, ktore latwo obsluzyc komunikacja i spacerem.",
    ],
    sections: [
      {
        title: "Jak rozumiec tani kierunek",
        paragraphs: [
          "To nie musi byc absolutnie najtansza opcja. W praktyce lepiej szukac miejsc, ktore sa uczciwie oplacalne: lot, nocleg, jedzenie i prosty plan w jednej, sensownej calosci.",
        ],
      },
      {
        title: "Co najczesciej psuje budzet",
        paragraphs: [
          "Slaby nocleg daleko od centrum, drogie transfery i zbyt dlugi lot jak na format wyjazdu. Dlatego wlasnie potrzebny jest ranking oparty o caly scenariusz, a nie tylko jedna cene.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy tani kierunek to zawsze Europa Srodkowa?",
        answer:
          "Nie zawsze, ale czesto tak bywa przy bardzo ograniczonych budzetach. W praktyce wiele zalezy od terminu i aktualnych lotow z Polski.",
      },
      {
        question: "Czy warto wpisywac w plannerze konkretny budzet?",
        answer:
          "Tak. To jedna z najwazniejszych informacji dla silnika dopasowania i pomaga od razu odciac kierunki, ktore sa po prostu za drogie.",
      },
    ],
  },
  {
    slug: "kierunki-z-plaza-i-zwiedzaniem",
    title: "Kierunki z plaza i zwiedzaniem",
    description:
      "Najlepsze miejsca dla osob, ktore nie chca wybierac miedzy relaksem a miejskim klimatem.",
    excerpt:
      "To bardzo mocny typ wyjazdu: rano miasto lub atrakcje, po poludniu woda, promenada i spokojniejszy rytm.",
    hero:
      "Wlasnie takie kierunki najczesciej wygrywaja w praktyce: daja i ladne miasto, i prawdziwy oddech przy wodzie. To wygodne, komercyjnie mocne i bardzo zrozumiale dla odbiorcy.",
    plannerPrompt:
      "Szukam kierunku z plaza i zwiedzaniem, 4-5 dni, z Polski, slonce i miasto w jednym.",
    categorySlugs: ["cieple-kierunki", "city-breaki"],
    destinationSlugs: ["malaga-spain", "barcelona-spain", "valletta-malta", "athens-greece", "larnaca-cyprus"],
    practicalBullets: [
      "Najlepiej wybierac kierunki, gdzie plaza nie wymaga wyjazdu daleko poza miasto.",
      "Ten format jest bardzo dobry na 4-5 dni.",
      "Najbardziej liczy sie to, czy miejski i plazowy rytm da sie polaczyc bez marnowania czasu.",
    ],
    sections: [
      {
        title: "Dlaczego ten typ wyjazdu tak dobrze sie sprzedaje",
        paragraphs: [
          "Bo rozwiazuje bardzo czesty dylemat. Wiele osob nie chce wybierac miedzy odpoczynkiem a czyms do zrobienia. Kierunki z plaza i zwiedzaniem odpowiadaja na obie potrzeby naraz.",
        ],
      },
      {
        title: "Jak wybierac najlepsza opcje",
        paragraphs: [
          "Warto patrzec na to, czy centrum i plaza sa blisko siebie oraz czy miasto ma cos wiecej niz tylko dobra pogode. Im mocniejszy lokalny charakter i gastronomia, tym lepszy efekt dla calego wyjazdu.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy taki kierunek nadaje sie na 3 dni?",
        answer:
          "Tak, ale najlepiej wypada przy 4-5 dniach. Wtedy masz realna szanse polaczyc obie potrzeby bez poczucia, ze wszystko robisz w biegu.",
      },
      {
        question: "Czy to dobry scenariusz dla osob niezdecydowanych?",
        answer:
          "Tak, bo to jedna z najczestszych kombinacji preferencji. Wlasnie taki opis bardzo dobrze nadaje sie do wpisania naturalnym jezykiem w plannerze.",
      },
    ],
  },
  {
    slug: "pomysly-na-city-break-w-europie",
    title: "Pomysly na city break w Europie",
    description:
      "Lista najmocniejszych kierunkow w Europie dla osob szukajacych konkretu: co wybrac, dlaczego i dla jakiego stylu wyjazdu.",
    excerpt:
      "To przewodnik dla osob, ktore chca szybko zrozumiec roznice miedzy klasycznymi kierunkami i dobrac miasto do swojego stylu.",
    hero:
      "Nie kazdy city break jest taki sam. Jedne kierunki wygrywaja dla par, inne dla szybkiego zwiedzania, a jeszcze inne dla polaczenia miasta i relaksu. Wlasnie to warto pokazac czytelnikowi.",
    plannerPrompt:
      "Pomoz wybrac city break w Europie na 4 dni, budzet do 2500 zl, dobry klimat miejsca i zwiedzanie.",
    categorySlugs: ["city-breaki", "przewodniki"],
    destinationSlugs: ["rome-italy", "barcelona-spain", "lisbon-portugal", "budapest-hungary", "prague-czechia"],
    practicalBullets: [
      "Najpierw wybierz format wyjazdu: klasyczne zwiedzanie, para, jedzenie, plaza plus miasto lub budzetowy weekend.",
      "Dobre miasto na city break powinno miec mocny pierwszy dzien i proste centrum.",
      "Lepiej miec 3 swietne miejsca na planie niz 20 losowych punktow.",
    ],
    sections: [
      {
        title: "Jak nie wybierac miasta tylko po marce",
        paragraphs: [
          "Wiele osob zaczyna od najbardziej znanych nazw, ale nie zawsze to one najlepiej pasuja do celu wyjazdu. Czasem mniejsze lub tansze miasto daje wyraznie lepszy efekt.",
        ],
      },
      {
        title: "Jak zbudowac porownanie kierunkow",
        paragraphs: [
          "Najwygodniej patrzec na piec rzeczy: czas lotu, koszt pobytu, klimat miasta, styl wyjazdu i liczbe miejsc, ktore rzeczywiscie warto zobaczyc w tak krotkim czasie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy lepiej wybierac kierunek znany czy bardziej niszowy?",
        answer:
          "To zalezy od potrzeb. Znane miasta sa prostsze na pierwszy wyjazd, ale bardziej niszowe kierunki czesto wygrywaja kosztem i tempem pobytu.",
      },
      {
        question: "Czy city break zawsze musi oznaczac duze miasto?",
        answer:
          "Nie. Najwazniejsze jest to, czy miejsce daje miejski rytm, czytelny plan i wystarczajaco duzo tresci na krotki wyjazd.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-jesienia-z-polski",
    title: "Gdzie poleciec jesienia z Polski",
    description:
      "Jesienne kierunki z Polski z naciskiem na pogode, balans ceny do komfortu i praktyczny format 4-7 dni.",
    excerpt:
      "Jesien to jeden z najlepszych momentow na wyjazdy: mniej tloku, czesto lepsze ceny i bardziej komfortowa pogoda w wielu kierunkach.",
    hero:
      "To dobry moment, by pokazac sile serwisu jako wydawniczego przewodnika i narzedzia jednoczesnie. Jesienne kierunki dobrze lacza ruch SEO z intencja zakupowa.",
    plannerPrompt:
      "Gdzie poleciec jesienia z Polski, 5 dni, najlepiej cieplo i bez bardzo wysokiego budzetu.",
    categorySlugs: ["cieple-kierunki", "przewodniki"],
    destinationSlugs: ["malaga-spain", "lisbon-portugal", "valletta-malta", "marrakesh-morocco", "funchal-portugal"],
    practicalBullets: [
      "Jesienia warto grac na kierunki, ktore nadal maja pogode, ale nie sa juz w szczycie sezonu.",
      "To dobry czas na Malaga, Malte, Lizbone, Madere i czesc kierunkow w Maroku.",
      "Przy jesiennych wyjazdach szczegolnie dobrze pracuje mix miasta i relaksu.",
    ],
    sections: [
      {
        title: "Dlaczego jesien daje przewage",
        paragraphs: [
          "Po wakacjach wiele kierunkow nadal ma bardzo dobra pogode, ale mniejszy tlok i lepsze warunki do spokojnego zwiedzania. To bardzo mocny argument dla polskiego odbiorcy.",
        ],
      },
      {
        title: "Jak ustawic wyszukiwanie",
        paragraphs: [
          "Najlepiej wpisac miesiac, budzet i oczekiwany styl wyjazdu. Wtedy planner moze mocniej premiowac kierunki, ktore w tym konkretnym okresie wypadaja najlepiej.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy jesien to dobry moment na cieply kierunek?",
        answer:
          "Tak, bardzo czesto lepszy niz srodek lata, bo daje lepsza pogode do spacerow i mniejszy tlok w najpopularniejszych miejscach.",
      },
      {
        question: "Czy jesien lepiej sprawdza sie na city break czy krotkie wakacje?",
        answer:
          "Na oba scenariusze. To zalezy glownie od liczby dni i tego, czy bardziej zalezy Ci na miescie czy na odpoczynku.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-zima-z-polski",
    title: "Gdzie poleciec zima z Polski",
    description:
      "Najciekawsze kierunki na zimowy wyjazd z Polski, od slonecznych opcji po klimatyczne miasta na krotki urlop.",
    excerpt:
      "Zima nie musi oznaczac tylko jarmarkow i grubych kurtek. Dla wielu uzytkownikow to moment szukania slonca i prostego resetu.",
    hero:
      "Zimowe kierunki bardzo dobrze lacza sie z afiliacja, bo stoi za nimi konkretna potrzeba: slonce, reset i sensowny plan na 4-7 dni bez czekania do lata.",
    plannerPrompt:
      "Gdzie poleciec zima z Polski, najlepiej cieplo, 5 dni, budzet do 3000 zl, bez komplikacji.",
    categorySlugs: ["cieple-kierunki", "przewodniki"],
    destinationSlugs: ["las-palmas-spain", "marrakesh-morocco", "agadir-morocco", "malaga-spain", "funchal-portugal"],
    practicalBullets: [
      "Zima najmocniej premiuje kierunki, ktore maja przewidywalna pogode i sensowny czas lotu.",
      "To dobry moment na Kanary, poludnie Hiszpanii, Madeire i czesc Maroka.",
      "Wynik powinien jasno pokazywac kompromis: pogoda kontra dlugosc lotu i budzet.",
    ],
    sections: [
      {
        title: "Czego szuka uzytkownik zima",
        paragraphs: [
          "Najczesciej nie tylko samego wyjazdu, ale odciecia od pogody i rutyny. Dlatego kierunki zimowe trzeba opisywac nie tylko przez temperature, ale tez przez prostote calego scenariusza.",
        ],
      },
      {
        title: "Jak porownywac zimowe opcje",
        paragraphs: [
          "Warto uczciwie pokazac, ze niektore miejsca maja lepsza pogode, ale sa dalej lub drozsze. Inne sa blizej, ale daja tylko lagodniejszy klimat, a nie pelne lato. Taki balans buduje wiarygodnosc strony.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy zima da sie poleciec w cieple miejsce bez bardzo duzego budzetu?",
        answer:
          "Tak, ale trzeba dobrze dobrac kierunek i termin. Najlepiej szukac miejsc, ktore maja przewidywalna pogode i nie sa skrajnie daleko od Polski.",
      },
      {
        question: "Czy Malaga to dobry zimowy kierunek?",
        answer:
          "Tak, jesli szukasz lagodnej zimy i city breaku z oddechem. Jesli oczekujesz pelnego plazowego lata, lepiej spojrzec na Kanary lub inne cieplejsze opcje.",
      },
    ],
  },
  {
    slug: "krotkie-wakacje-w-europie",
    title: "Krotkie wakacje w Europie",
    description:
      "Pomysly na 4-7 dni w Europie dla osob, ktore chca wyjechac na lekki urlop bez skomplikowanej organizacji.",
    excerpt:
      "To wyjazdy pomiedzy city breakiem a pelnymi wakacjami: nadal wygodne, ale dajace wiecej odpoczynku i elastycznosci.",
    hero:
      "Krotkie wakacje w Europie to jeden z najmocniejszych formatow dla startupu travelowego. Ludzie szukaja czegos szybkiego, ale nadal wartosciowego i dobrze uzasadnionego.",
    plannerPrompt:
      "Krotkie wakacje w Europie, 5-6 dni, budzet do 3200 zl, najlepiej plaze albo ladne miasto.",
    categorySlugs: ["cieple-kierunki", "weekendowe-wyjazdy"],
    destinationSlugs: ["valletta-malta", "larnaca-cyprus", "funchal-portugal", "malaga-spain", "athens-greece"],
    practicalBullets: [
      "Najlepiej wybierac kierunki, ktore pozwalaja i odpoczac, i cos zobaczyc.",
      "Dobrze sprawdzaja sie miejsca z jednym wygodnym noclegiem i planem bez ciaglych zmian bazy.",
      "Ten format lubi jasne komunikaty o pogodzie, budzecie i stylu wyjazdu.",
    ],
    sections: [
      {
        title: "Czym krotkie wakacje roznia sie od city breaku",
        paragraphs: [
          "Przede wszystkim tempem. To nadal wyjazd zorganizowany na krotko, ale nie musi byc tak gesty od atrakcji. Warto pokazac uzytkownikowi, ze taka opcja jest bardziej do zycia niz 48 godzin gonitwy.",
        ],
      },
      {
        title: "Jak dobierac kierunek",
        paragraphs: [
          "Najlepiej szukac miejsc, ktore daja przynajmniej dwie mocne osie wyjazdu: na przyklad morze i miasto albo natura i spokoj. Wtedy taki wyjazd broni sie nawet przy nieco wyzszym budzecie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 5-6 dni to nadal dobry format na Europe?",
        answer:
          "Tak, to bardzo dobry format. Daje duzo swobody i pozwala wybrac kierunek bardziej pod styl pobytu, a nie tylko pod sam czas dojazdu.",
      },
      {
        question: "Czy lepiej wtedy wybierac wyspy czy miasta?",
        answer:
          "To zalezy od oczekiwan. Jesli chcesz relaksu i pogody, wyspy czesto wygrywaja. Jesli zalezy Ci na rytmie miasta i gastronomii, lepiej sprawdzi sie mocny kierunek miejski.",
      },
    ],
  },
  {
    slug: "kierunki-na-pierwszy-city-break",
    title: "Kierunki na pierwszy city break",
    description:
      "Przewodnik po miastach, ktore najlepiej nadaja sie na pierwszy zagraniczny city break z Polski: proste, czytelne i bez zbednej logistyki.",
    excerpt:
      "Pierwszy city break powinien byc latwy do ogarniecia. Najlepiej wygrywaja miasta z mocnym centrum, prostym dojazdem i scenariuszem, ktory nie wymaga eksperckiej wiedzy.",
    hero:
      "To jeden z najbardziej praktycznych tematow dla serwisu travelowego. Dobrze dobrany pierwszy city break buduje zaufanie do marki, bo pomaga czytelnikowi podjac decyzje bez chaosu.",
    plannerPrompt:
      "Szukam pierwszego city breaku z Polski, 3-4 dni, bez skomplikowanej logistyki, budzet do 2500 zl.",
    categorySlugs: ["city-breaki", "przewodniki", "weekendowe-wyjazdy"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "rome-italy", "malaga-spain", "lisbon-portugal"],
    practicalBullets: [
      "Najpierw patrz na prosty dojazd i kompaktowe centrum.",
      "Pierwszy wyjazd nie powinien wymagac walki z dalekimi transferami i przejazdami pomiedzy atrakcjami.",
      "Lepiej wybrac jedno miasto z jasnym rytmem niz ambitny kierunek, ktory na starcie meczy logistyka.",
    ],
    sections: [
      {
        title: "Jak rozpoznac dobry pierwszy kierunek",
        paragraphs: [
          "Najlepiej wygrywaja miasta, w ktorych juz pierwszy dzien jest przyjemny i czytelny. Po wyjsciu z lotniska powinienes szybko trafic do centrum i miec od razu poczucie, ze wyjazd zaczal sie dobrze.",
          "Dlatego tak dobrze wypadaja Budapeszt, Praga czy Malaga. Daja szybki efekt i nie wymagaja od czytelnika zbyt wielu decyzji organizacyjnych.",
        ],
      },
      {
        title: "Czego unikac przy pierwszym city breaku",
        paragraphs: [
          "Nie warto zaczynac od miasta, ktore jest bardzo drogie, rozlegle albo wymaga wielu przesiadek. Lepiej zostawic sobie takie kierunki na pozniejszy etap, kiedy wiesz juz, jaki styl wyjazdu najbardziej Ci odpowiada.",
        ],
        bullets: [
          "zbyt dlugiego lotu jak na 2-4 dni",
          "noclegu daleko od centrum tylko dlatego, ze jest nizsza cena",
          "planu, ktory probuje zmiescic cale miasto w 48 godzin",
        ],
      },
      {
        title: "Jak korzystac z tego scenariusza w plannerze",
        paragraphs: [
          "Wpisz w plannerze, ze to Twoj pierwszy city break, dodaj liczbe dni i budzet. To pozwoli silnikowi mocniej premiowac kierunki, ktore sa proste, sprawdzone i dobrze pracuja dla polskiego odbiorcy.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy pierwszy city break musi byc bardzo tani?",
        answer:
          "Nie. Wazniejsze jest to, zeby byl prosty i wygodny. Czasem troche wyzszy budzet daje znacznie lepszy pierwszy kontakt z zagranicznym wyjazdem.",
      },
      {
        question: "Czy lepiej zaczac od miasta czy od kierunku z plaza?",
        answer:
          "Na pierwszy raz zwykle najlepiej wypada miasto albo kierunek typu plaza plus zwiedzanie, gdzie latwo ustawic rytm dnia bez skrajnych kompromisow.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-w-maju",
    title: "Gdzie poleciec w maju",
    description:
      "Najlepsze kierunki na majowy wyjazd z Polski, kiedy pogoda zaczyna juz mocno sprzyjac city breakom i krotkim wakacjom.",
    excerpt:
      "Maj to jeden z najlepszych miesiecy na wyjazdy. W wielu kierunkach jest juz cieplo, ale nadal bez najwiekszego sezonowego tloku.",
    hero:
      "To bardzo mocny temat dla serwisu travelowego, bo laczy wysoką intencje, dobra pogode i praktyczne pytanie o to, gdzie najlepiej wykorzystac kilka dni wolnego.",
    plannerPrompt:
      "Gdzie poleciec w maju z Polski, 4-5 dni, najlepiej cieplo i cos do zwiedzania, budzet do 3000 zl.",
    categorySlugs: ["cieple-kierunki", "przewodniki"],
    destinationSlugs: ["malaga-spain", "valencia-spain", "athens-greece", "larnaca-cyprus", "valletta-malta"],
    practicalBullets: [
      "Maj premiuje kierunki, ktore maja juz pogode, ale jeszcze nie sa w pelnym szczycie sezonu.",
      "To dobry miesiac dla scenariuszy plaza plus miasto oraz dla lagodniejszych city breakow na poludniu Europy.",
      "Warto pilnowac terminu wylotu, bo okolice dlugich weekendow potrafia mocno zmienic dostepnosc i ceny.",
    ],
    sections: [
      {
        title: "Dlaczego maj jest tak dobry na wyjazd",
        paragraphs: [
          "W maju wiele kierunkow daje juz bardzo przyjemna pogode do spacerow, plazy i wieczornego zycia miasta. Jednoczesnie nie ma jeszcze takiego obciazenia jak w pelni lata, co poprawia komfort pobytu.",
        ],
      },
      {
        title: "Jak wybierac kierunek na maj",
        paragraphs: [
          "Najbardziej oplacalne sa miejsca, ktore lacza slonce z czytelnym planem dnia. Dobrze sprawdzaja sie Malaga, Malta, Ateny czy Walencja, bo daja i klimat, i realny sens na 4-5 dni.",
        ],
        bullets: [
          "sprawdzaj nie tylko temperature, ale tez wiatr i komfort spaceru",
          "premiuj kierunki z prostym dojazdem z lotniska",
          "szukaj miast, ktore dobrze dzialaja juz od pierwszego popoludnia",
        ],
      },
      {
        title: "Jak wpisac taka potrzebe do planera",
        paragraphs: [
          "Najlepiej wpisac miesiac, liczbe dni, budzet i to, czy wolisz miejski klimat czy bardziej wakacyjny układ dnia. Taki opis bardzo dobrze przeklada sie na sensowny ranking kierunkow.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy maj jest lepszy od czerwca na krotki wyjazd?",
        answer:
          "Czesto tak, bo daje bardzo dobry balans pogody i tloku. Dla wielu osob to jeden z najlepszych miesiecy na city breaki i krotkie wakacje.",
      },
      {
        question: "Czy w maju lepiej wybierac miasto czy kierunek plazowy?",
        answer:
          "Oba scenariusze maja sens. Maj jest mocny wlasnie dlatego, ze wiele kierunkow daje wtedy i komfort zwiedzania, i pierwsze odczucie cieplego wyjazdu.",
      },
    ],
  },
  {
    slug: "europa-na-5-dni",
    title: "Europa na 5 dni",
    description:
      "Najlepsze kierunki w Europie na 5-dniowy wyjazd z Polski: ani za krotko, ani jeszcze nie pelne wakacje, ale idealnie pod praktyczny reset.",
    excerpt:
      "Pieciodniowy wyjazd to bardzo wdzieczny format. Daje wiecej swobody niz weekend, ale nadal wymaga dobrego doboru miasta lub kierunku.",
    hero:
      "To temat o wysokiej intencji, bo wiele osob ma wlasnie 5 dni i chce wybrac miejsce, ktore wykorzysta ten czas najlepiej: bez chaosu, ale z realnym efektem wyjazdu.",
    plannerPrompt:
      "Szukam kierunku w Europie na 5 dni, z Polski, budzet do 3200 zl, zwiedzanie albo plaza plus miasto.",
    categorySlugs: ["przewodniki", "cieple-kierunki", "city-breaki"],
    destinationSlugs: ["lisbon-portugal", "valencia-spain", "athens-greece", "valletta-malta", "funchal-portugal"],
    practicalBullets: [
      "5 dni to dobry format na wyjazdy, ktore potrzebuja troche wiecej oddechu niz klasyczny city break.",
      "Najlepiej pracuja kierunki, ktore nie marnuja pierwszego dnia na logistyczne zamieszanie.",
      "To dobry moment, by pozwolic sobie na 1-2 mocne atrakcje i nadal zachowac spokojny rytm.",
    ],
    sections: [
      {
        title: "Co daje 5 dni, czego nie daje weekend",
        paragraphs: [
          "Przede wszystkim pozwala przestac gonic. Mozesz rozlozyc wyjazd na dzien przylotu, dwa mocniejsze dni zwiedzania, jeden spokojniejszy i finalny dzien bez poczucia, ze wszystko dzieje sie za szybko.",
        ],
      },
      {
        title: "Jak wybierac miasto lub kierunek na taki format",
        paragraphs: [
          "Najlepiej wypadaja miejsca, ktore maja kilka warstw: stare miasto, dzielnice, punkty widokowe, jedzenie, a czasem takze morze. Wtedy 5 dni nie jest ani przesadnie dlugie, ani zbyt krotkie.",
        ],
        bullets: [
          "premiuj miasta z mocnym centrum i 1-2 dodatkowymi strefami",
          "dla ciepla szukaj kierunkow typu Malta, Walencja, Ateny",
          "dla spokoju i natury dobrze wyglada tez Madera",
        ],
      },
      {
        title: "Jak ustawic wyszukiwanie ofert",
        paragraphs: [
          "Przy 5 dniach warto jasno wpisac, czy to ma byc bardziej city break czy bardziej krotki urlop. To jedna z tych informacji, ktore bardzo mocno poprawiaja jakosc wynikow.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 5 dni to juz dobry format na cieply kierunek?",
        answer:
          "Tak. To jeden z najlepszych formatow na miejsca, ktore lacza odpoczynek i zwiedzanie bez koniecznosci brania pelnego tygodnia urlopu.",
      },
      {
        question: "Czy na 5 dni lepiej wybrac jedno miasto czy dwa miejsca?",
        answer:
          "W wiekszosci przypadkow nadal lepiej wygrywa jeden kierunek. Pozwala to zachowac wygode i nie psuc wyjazdu przeladowana logistyka.",
      },
    ],
  },
  {
    slug: "gdzie-poleciec-latem-na-krotko",
    title: "Gdzie poleciec latem na krotko",
    description:
      "Kierunki na 3-5 dni latem, kiedy chcesz wykorzystac pogode, ale nie budowac od razu pelnych wakacji.",
    excerpt:
      "Latem wiele osob szuka nie tylko duzego urlopu, ale tez krotszego wyjazdu, ktory daje szybki reset i poczucie prawdziwego lata.",
    hero:
      "To scenariusz bardzo komercyjny i bardzo praktyczny jednoczesnie: kilka dni, slonce, dobra logistyka i kierunek, ktory nie rozczarowuje po przylocie.",
    plannerPrompt:
      "Gdzie poleciec latem na krotko z Polski, 3-5 dni, slonce, plaza albo ladne miasto, budzet do 3000 zl.",
    categorySlugs: ["cieple-kierunki", "weekendowe-wyjazdy", "przewodniki"],
    destinationSlugs: ["malaga-spain", "valencia-spain", "larnaca-cyprus", "valletta-malta", "las-palmas-spain"],
    practicalBullets: [
      "Latem szczegolnie liczy sie to, zeby kierunek dawal efekt juz przy krotkim pobycie.",
      "Najmocniej wygrywaja miejsca, w ktorych nie tracisz czasu na dalekie transfery i rozciagnieta logistyke.",
      "Krotki letni wyjazd powinien miec prosty model: centrum, morze, jedzenie i kilka pewnych atrakcji.",
    ],
    sections: [
      {
        title: "Kiedy krotki letni wyjazd ma sens",
        paragraphs: [
          "Wtedy, gdy chcesz wykorzystac pogode i nie czekac na dluzszy urlop. Dla wielu osob 3-5 dni latem jest wystarczajace, zeby realnie odpoczac i zobaczyc cos nowego.",
        ],
      },
      {
        title: "Jakie kierunki najlepiej dzialaja latem",
        paragraphs: [
          "Najbezpieczniej wypadaja miasta i kierunki, ktore maja i rytm miejski, i latwy dostep do morza. Dzięki temu nawet przy krotszym pobycie masz poczucie pelnego wyjazdu, a nie tylko szybkiego przelotu i powrotu.",
        ],
        bullets: [
          "Walencja i Malaga dla plazy plus miasta",
          "Malta i Cypr dla bardziej wakacyjnego klimatu",
          "Kanary wtedy, gdy priorytetem jest mocna pogoda niezaleznie od sezonu",
        ],
      },
      {
        title: "Jak opisywac taka potrzebe w plannerze",
        paragraphs: [
          "Najlepiej wpisac, ze chodzi o lato, 3-5 dni i konkretny budzet. Warto tez dodac, czy celem ma byc glownie plaza, czy jednak po rowno plaza i zwiedzanie.",
        ],
      },
    ],
    faq: [
      {
        question: "Czy 3 dni latem wystarcza na cieply wyjazd?",
        answer:
          "Tak, jesli wybierzesz kierunek o prostym dojezdzie i nie bedziesz probowal zmiescic zbyt wielu rzeczy w jednym planie.",
      },
      {
        question: "Czy lepiej latem wybrac miasto czy typowo wakacyjny kierunek?",
        answer:
          "To zalezy od stylu wyjazdu. Przy 3-5 dniach najlepiej wypadaja kierunki hybrydowe, gdzie miasto i odpoczynek wzajemnie sie uzupelniaja.",
      },
    ],
  },
];

const editorialCategories: EditorialCategory[] = [
  {
    slug: "przewodniki",
    title: "Przewodniki",
    description:
      "Praktyczne przewodniki i scenariusze wyjazdow, ktore lacza tresc wydawnicza z mozliwoscia przejscia do planera.",
    eyebrow: "Praktyczne tresci",
    hero: "Tresci dla osob, ktore chca zrozumiec kierunek przed kliknieciem w oferty.",
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
      "Kierunki i poradniki dla osob, ktore chca zrobic mocny wyjazd 2-5 dni bez chaosu i z dobrym stosunkiem ceny do jakosci.",
    eyebrow: "Miejskie wyjazdy",
    hero: "Najlepsze city breaki dla polskiego odbiorcy: czytelne, praktyczne i dobrze porownane.",
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
    title: "Cieple kierunki",
    description:
      "Slonce, lagodniejsza pogoda i sensowne scenariusze wyjazdow z Polski na 4-7 dni.",
    eyebrow: "Slonce i klimat",
    hero: "Kierunki dla osob, ktore szukaja ciepla, ale nadal chca podejmowac decyzje na podstawie realnych argumentow.",
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
      "Scenariusze dla osob, ktore chca uproscic decyzje i szukaja kierunkow z mniejsza liczba formalnosci na starcie.",
    eyebrow: "Mniej formalnosci",
    hero: "To jeden z najmocniejszych tematow do wyszukiwania naturalnym jezykiem i do budowy contentu o wysokiej intencji.",
    articleSlugs: ["cieple-kraje-bez-wizy"],
    destinationSlugs: ["marrakesh-morocco", "agadir-morocco", "antalya-turkey", "larnaca-cyprus", "tirana-albania"],
  },
  {
    slug: "tanie-podroze",
    title: "Tanie podróże",
    description:
      "Tresc dla osob, ktore chca dobrze wydac budzet, a nie tylko szukac najnizszej cyfry za wszelka cene.",
    eyebrow: "Budzet pod kontrola",
    hero: "Najlepsze kierunki do budzetowych decyzji to te, ktore nadal daja sensowna jakosc i prosty plan.",
    articleSlugs: ["tanie-city-breaki-na-weekend", "gdzie-poleciec-do-2000-zl", "tanie-kierunki-z-polski", "kierunki-na-pierwszy-city-break"],
    destinationSlugs: ["budapest-hungary", "prague-czechia", "athens-greece", "malaga-spain", "tirana-albania"],
  },
  {
    slug: "weekendowe-wyjazdy",
    title: "Weekendowe wyjazdy",
    description:
      "Kierunki i poradniki pod 2-4 dni, kiedy licza sie czas lotu, prostota planu i dobry rytm wyjazdu.",
    eyebrow: "Wyjazdy na szybko",
    hero: "Weekendowe wyjazdy powinny byc czytelne, dobrze ustawione logistycznie i przyjazne dla ograniczonego czasu.",
    articleSlugs: ["tanie-city-breaki-na-weekend", "gdzie-na-weekend-we-dwoje", "krotkie-wakacje-w-europie", "kierunki-na-pierwszy-city-break", "gdzie-poleciec-latem-na-krotko"],
    destinationSlugs: ["prague-czechia", "budapest-hungary", "rome-italy", "malaga-spain", "amsterdam-netherlands", "dublin-ireland"],
  },
];

export function getPublishedDestinations(): DestinationProfile[] {
  return publishedDestinationSlugs
    .map((slug) => curatedDestinations.find((destination) => destination.slug === slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));
}

export function getPublishedDestinationSlugs(): string[] {
  return [...publishedDestinationSlugs];
}

export function getDestinationGuideBySlug(slug: string): DestinationGuideContent | undefined {
  const override = destinationGuideOverrides.find((item) => item.slug === slug);
  const destination = curatedDestinations.find((item) => item.slug === slug);
  if (!override || !destination) {
    return undefined;
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

export function getArticlesForCategory(slug: string): EditorialArticle[] {
  return editorialArticles.filter((article) => article.categorySlugs.includes(slug));
}

export function getArticlesForDestination(slug: string): EditorialArticle[] {
  return editorialArticles.filter((article) => article.destinationSlugs.includes(slug));
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
  const current = curatedDestinations.find((destination) => destination.slug === slug);
  if (!current) return [];

  return getPublishedDestinations()
    .filter((destination) => destination.slug !== slug)
    .map((destination) => {
      const similarity =
        1 - Math.abs(destination.beachScore - current.beachScore) * 0.22 -
        Math.abs(destination.cityScore - current.cityScore) * 0.2 -
        Math.abs(destination.sightseeingScore - current.sightseeingScore) * 0.2 -
        Math.abs(destination.costIndex - current.costIndex) * 0.14 -
        Math.abs(destination.typicalFlightHoursFromPL - current.typicalFlightHoursFromPL) * 0.06;

      return { destination, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((item) => item.destination);
}

