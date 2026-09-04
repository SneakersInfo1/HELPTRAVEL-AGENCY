// Pełny dataset ewaluacyjny polskiego chatbota-konsjerża HelpTravel.pl.
// Przypadki celowo używają krótkiego, mobilnego języka, a oczekiwania
// obejmują wyłącznie zachowania, których naruszenie jest jednoznacznym błędem.

import type { EvalCase } from "./types";

export const EVAL_CASES: EvalCase[] = [
  // A — discovery
  {
    id: "A01",
    category: "discovery",
    turns: ["gdzie poleciec w listopadzie po slonce, 2 osoby"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma potraktować słońce jako motyw, przyjąć brakujący budżet i od razu wyszukać ofertę. Może zadać najwyżej jedno krótkie pytanie.",
  },
  {
    id: "A02",
    category: "discovery",
    turns: ["pierwszy raz do Wloch, wrzesien, tydzien, jedziemy we 2"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Padł konkretny kraj, więc bot ma wyszukać kierunki we Włoszech i pokazać kartę. Brak budżetu nie może blokować wyszukiwania.",
  },
  {
    id: "A03",
    category: "discovery",
    turns: ["mam wolny tydzien w maju, chce pozwiedzac, jade sam"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Intencja zwiedzania, miesiąc, długość i liczba osób są jasne. Bot ma przejść do wyszukiwania bez ankiety o dalsze preferencje.",
  },
  {
    id: "A04",
    category: "discovery",
    turns: ["cos spokojnego nad morzem w czerwcu dla dwojga"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma rozpoznać motyw plażowy i sam poprowadzić niekonkretnego klienta. Budżet może doprecyzować przy pokazanej karcie.",
  },
  {
    id: "A05",
    category: "discovery",
    turns: ["nie wiem gdzie, byle tanio w lutym we dwoje"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "„Byle tanio” oznacza wyszukiwanie bez limitu, od najtańszych wyników. Bot ma nazwać rozsądne założenie motywu i nie prowadzić ankiety.",
  },

  // B — budżet
  {
    id: "B01",
    category: "budget",
    turns: ["do 3200 na osobe, pazdziernik, plaza, 2 osoby"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Zapytanie zawiera komplet danych i budżet na osobę. Bot ma od razu pokazać realną ofertę i cytować wyłącznie kwoty z narzędzia.",
  },
  {
    id: "B02",
    category: "budget",
    turns: ["mamy 5500 zl lacznie na 2 osoby, tydzien w czerwcu, cos cieplego"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "„Łącznie” musi zostać zachowane jako budżet całej grupy. Bot nie powinien sam dzielić ani przeliczać żadnej kwoty.",
  },
  {
    id: "B03",
    category: "budget",
    turns: ["Grecja we wrzesniu, 3 doroslych, max 9000 razem"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Konkretny kraj wymaga wyszukania kierunków w Grecji, a budżet dotyczy wszystkich trzech osób. Ewentualny zapas ma pochodzić z gotowych danych narzędzia.",
  },
  {
    id: "B04",
    category: "budget",
    turns: ["mam 5000 zl, chce na plaze w sierpniu, 2 osoby"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Nie wiadomo, czy 5000 zł jest na osobę, czy łącznie. Bot ma wyjaśnić tę jedną niejednoznaczność jednym płynnym pytaniem.",
  },
  {
    id: "B05",
    category: "budget",
    turns: ["najtaniej jak sie da, listopad, city break, 2 osoby"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Klient świadomie nie podaje kwoty, więc bot ma pominąć budżet i wyszukać od najtańszego. Nie wolno zatrzymać rozmowy kolejnym pytaniem o limit.",
  },

  // C — rodzina
  {
    id: "C01",
    category: "family",
    turns: ["2 doroslych i dziecko 4 lata, plaza w czerwcu, 7000 lacznie"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma uwzględnić dwoje dorosłych, jedno dziecko i budżet łączny. Kwoty oraz dopasowanie do budżetu muszą pochodzić z narzędzia.",
  },
  {
    id: "C02",
    category: "family",
    turns: ["rodzina 2+2, Grecja w lipcu na tydzien, do 10k razem"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Zapis 2+2 oznacza dwoje dorosłych i dwoje dzieci, a Grecja jest konkretnym krajem. Bot ma wyszukać bez ponownego pytania o skład rodziny.",
  },
  {
    id: "C03",
    category: "family",
    turns: ["Antalya w pazdzierniku, 2 doroslych i dziecko, all inclusive"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      mustContainAny: ["potwierdzić", "potwierdzisz", "karcie", "Zobacz hotel"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Antalya to konkretny kierunek, więc potrzebna jest karta oferty. Narzędzie nie filtruje all inclusive, dlatego bot musi uczciwie wskazać, że wyżywienie należy potwierdzić na karcie hotelu.",
  },
  {
    id: "C04",
    category: "family",
    turns: ["ja i syn 8 lat, weekend w Rzymie z Warszawy"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma zapamiętać jednego dorosłego, jedno dziecko i trzy noce wynikające z „weekendu”. Konkretne miasto prowadzi bezpośrednio do get_trip_offer.",
  },
  {
    id: "C05",
    category: "family",
    turns: ["z dziecmi gdzies cieplo i z plaza, terminu jeszcze nie wiem"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "To niekonkretne zapytanie rodzinne ma uruchomić prowadzenie przez założenia: plaża, najbliższy pełny miesiąc i domyślna liczba dorosłych. Bot może zadać tylko jedno pytanie.",
  },

  // D — para
  {
    id: "D01",
    category: "couple",
    turns: ["romantyczny city break we wrzesniu, 2 osoby, 3500 na osobe"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma wyszukać city break dla pary z podanym budżetem, bez zbędnego dopytywania. Odpowiedź powinna prowadzić do konkretnej karty.",
  },
  {
    id: "D02",
    category: "couple",
    turns: ["Paryz na rocznice w maju, we dwoje na 4 noce"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Paryż jest konkretnym miastem, więc bot ma od razu pobrać ofertę na cztery noce. Brak budżetu nie uzasadnia odkładania karty.",
  },
  {
    id: "D03",
    category: "couple",
    turns: ["we dwoje na Majorke w czerwcu, tydzien, do 6500 razem"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Majorka jest konkretną wyspą i ma trafić bezpośrednio do get_trip_offer. Bot ma zachować budżet łączny i nie przeliczać go w tekście samodzielnie.",
  },
  {
    id: "D04",
    category: "couple",
    turns: ["rocznica w pazdzierniku, lubimy zabytki i dobre jedzenie, 2 osoby"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Zabytki i rocznica dają wystarczający motyw do wyszukania kierunku dla pary. Bot ma przyjąć rozsądne założenie zamiast pytać o wiele kolejnych preferencji.",
  },
  {
    id: "D05",
    category: "couple",
    turns: ["spokojny weekend we dwoje w kwietniu, obojetnie gdzie"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "„Weekend” oznacza trzy noce, a „obojętnie gdzie” wymaga aktywnego poprowadzenia klienta. Bot powinien wyszukać, nie rozpoczynać ankiety.",
  },

  // E — plaża
  {
    id: "E01",
    category: "beach",
    turns: ["plaza we wrzesniu, 2 osoby, max 3000 na glowe"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Komplet danych dla motywu plażowego powinien od razu uruchomić wyszukiwanie. Cena i zapas mają zostać przytoczone tylko z wyniku narzędzia.",
  },
  {
    id: "E02",
    category: "beach",
    turns: ["sama plaza i hotel bez lotu, lipiec, 2 osoby, tydzien"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma wyszukać kierunek plażowy i uszanować jawne żądanie oferty bez lotu. Karta i omawiana cena nie mogą obejmować niechcianego komponentu.",
  },
  {
    id: "E03",
    category: "beach",
    turns: ["Grecja na plaze w czerwcu, para, budzetu brak"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Konkretny kraj prowadzi do search_trips z Grecją, a brak kwoty oznacza wyniki od najtańszego. Bot nie powinien wymagać budżetu przed pokazaniem karty.",
  },
  {
    id: "E04",
    category: "beach",
    turns: ["Kreta w maju na 7 nocy, 2 osoby z Warszawy"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Kreta jest konkretną wyspą i zastępuje motyw. Bot ma pobrać kartę oferty bez wcześniejszego wyszukiwania listy kierunków.",
  },
  {
    id: "E05",
    category: "beach",
    turns: ["plaza blisko hotelu, sierpien, 2 osoby, do 4k na osobe"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      mustContainAny: ["potwierdzić", "potwierdzisz", "karcie", "Zobacz hotel"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Wyszukiwarka nie filtruje odległości hotelu od plaży. Bot ma pokazać realną ofertę, ale jasno polecić sprawdzenie tego wymogu na karcie przed płatnością.",
  },

  // F — city break
  {
    id: "F01",
    category: "city_break",
    turns: ["city break we wrzesniu, 2 osoby, do 2500 na osobe"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "To kompletne zapytanie motywowe, więc bot ma od razu wyszukać i pokazać kartę. Nie powinien pytać o preferowane miasto.",
  },
  {
    id: "F02",
    category: "city_break",
    turns: ["Rzym na weekend w listopadzie dla 2"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Rzym to konkretne miasto, a weekend oznacza trzy noce. Bot ma od razu pokazać ofertę i nie uruchamiać wyszukiwania motywowego.",
  },
  {
    id: "F03",
    category: "city_break",
    turns: ["city break we Wloszech w kwietniu, jade sam"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Włochy są krajem, nie jednym miastem, więc bot ma wyszukać kierunki w tym kraju. Brak budżetu nie blokuje pokazania najlepszej karty.",
  },
  {
    id: "F04",
    category: "city_break",
    turns: ["sam hotel w Pradze na weekend, 2 osoby"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma pobrać konkretną ofertę Pragi na trzy noce i wyłączyć lot. Nie może omawiać ceny pełnego pakietu.",
  },
  {
    id: "F05",
    category: "city_break",
    turns: ["city break z muzeami w pazdzierniku, 2 osoby, 5 nocy"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Podany motyw, miesiąc, długość i liczba osób wystarczają do wyszukania. Muzea są preferencją charakteru kierunku, nie powodem do wielokrotnego dopytywania.",
  },

  // G — loty
  {
    id: "G01",
    category: "flights",
    turns: ["sam lot do Barcelony we wrzesniu, 2 osoby z WAW"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Barcelona jest konkretnym miastem, a użytkownik chce wyłącznie lot. Bot ma pokazać kartę z wyłączonym hotelem i nie wymyślać ceny.",
  },
  {
    id: "G02",
    category: "flights",
    turns: ["lot z Krakowa do Rzymu w maju na tydzien, 1 osoba"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma zachować wylot z Krakowa, jednego pasażera i ofertę bez hotelu. Konkretne miasto wymaga bezpośrednio get_trip_offer.",
  },
  {
    id: "G03",
    category: "flights",
    turns: ["najtańszy lot gdzies na plaze w czerwcu dla 2"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Kierunek jest nieznany, więc bot ma wyszukać motyw plażowy bez limitu budżetu i uwzględnić sam lot. Nie powinien zatrzymywać się na pytaniu o kwotę.",
  },
  {
    id: "G04",
    category: "flights",
    turns: ["same loty do Grecji w pazdzierniku, 2 doroslych i dziecko"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Przy konkretnym kraju bot ma wyszukać greckie kierunki dla całej rodziny. Oferta i omawiana cena muszą dotyczyć wyłącznie lotu.",
  },
  {
    id: "G05",
    category: "flights",
    turns: ["pokaz aktualny lot do Malagi w sierpniu, z Gdanska, 2 osoby"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Aktualny lot do konkretnego miasta wymaga danych narzędzia i karty oferty bez hotelu. Bot ma zachować lotnisko wylotu z Gdańska.",
  },

  // H — hotele
  {
    id: "H01",
    category: "hotels",
    turns: ["hotel w Maladze w pazdzierniku, 2 osoby, bez lotu"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Malaga jest konkretnym miastem, a klient jawnie wyklucza lot. Bot ma pokazać kartę samego hotelu bez szukania motywu.",
  },
  {
    id: "H02",
    category: "hotels",
    turns: ["sam nocleg w Budapeszcie na weekend dla dwojga"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma zrozumieć „nocleg” jako sam hotel oraz „weekend” jako trzy noce. Termin może dobrać systemowo zamiast rozpoczynać dopytywanie.",
  },
  {
    id: "H03",
    category: "hotels",
    turns: ["hotel w Grecji na tydzien we wrzesniu, 2 osoby"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Użytkownik wskazał kraj, ale nie miasto, więc bot ma wyszukać greckie kierunki. Wynik powinien dotyczyć hotelu bez lotu.",
  },
  {
    id: "H04",
    category: "hotels",
    turns: ["hotel na Teneryfie w styczniu, 2+1, bez przelotu"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Teneryfa jest konkretną wyspą, a 2+1 oznacza dwoje dorosłych i dziecko. Karta ma obejmować sam hotel.",
  },
  {
    id: "H05",
    category: "hotels",
    turns: ["hotel 4 gwiazdki w Lizbonie w maju, para, 5 nocy"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      mustContainAny: ["potwierdzić", "potwierdzisz", "karcie", "Zobacz hotel"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Lizbona wymaga konkretnej karty hotelu, ale narzędzie nie filtruje po liczbie gwiazdek. Bot musi jasno skierować użytkownika do potwierdzenia standardu na karcie.",
  },

  // I — porównanie
  {
    id: "I01",
    category: "comparison",
    turns: ["Kreta czy Rodos we wrzesniu dla pary?"],
    expect: { maxSentences: 5, forbidInventedPrice: true },
    rubricNotes:
      "Bot może porównać charakter obu wysp z wiedzy ogólnej, ale nie może dopisywać cen, ocen ani terminów bez narzędzia. Powinien zakończyć konkretnym następnym krokiem.",
  },
  {
    id: "I02",
    category: "comparison",
    turns: ["co teraz tansze Malta czy Cypr w pazdzierniku, 2 osoby?"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Pytanie o aktualnie tańszy kraj wymaga realnych danych cenowych. Bot ma oprzeć porównanie na wynikach wyszukiwania, nie na ogólnej intuicji.",
  },
  {
    id: "I03",
    category: "comparison",
    turns: ["Barcelona czy Lizbona na weekend? lubimy jedzenie i spacery"],
    expect: { maxSentences: 5, forbidInventedPrice: true },
    rubricNotes:
      "Dobra odpowiedź krótko różnicuje klimat obu miast pod jedzenie i spacery. Liczby lub ceny wolno podać tylko po użyciu narzędzia.",
  },
  {
    id: "I04",
    category: "comparison",
    turns: ["lepiej kupic sam lot czy pakiet z hotelem?"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Bez kierunku i terminu nie da się uczciwie wskazać tańszej opcji. Bot ma krótko wyjaśnić różnicę i zadać najwyżej jedno pytanie prowadzące do porównania.",
  },
  {
    id: "I05",
    category: "comparison",
    turns: ["Teneryfa czy Madera w styczniu? zalezy nam na cieple"],
    expect: { maxSentences: 5, forbidInventedPrice: true },
    rubricNotes:
      "Bot może porównać typowy zimowy charakter kierunków, bez udawania prognozy na żywo. Powinien jasno wskazać kompromis i zaproponować sprawdzenie oferty.",
  },

  // J — follow-up
  {
    id: "J01",
    category: "follow_up",
    turns: [
      "plaza we wrzesniu, 2 osoby, do 3500 na osobe",
      "moze jednak Grecja?",
      "Kreta brzmi dobrze",
      "pokaz mi jeszcze raz te oferte z Krety",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Ostatnia prośba wraca do konkretnej wyspy i zależy od wcześniejszego terminu, liczby osób oraz budżetu. Bot musi ponownie pobrać ofertę, bo ceny nie przechodzą między turami.",
  },
  {
    id: "J02",
    category: "follow_up",
    turns: [
      "weekend w Rzymie dla 2",
      "tylko hotel",
      "jednak dorzuc lot z Krakowa",
      "a w maju?",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Zmiana miesiąca dotyczy nadal Rzymu, dwóch osób, weekendu oraz pakietu z lotem z Krakowa. Bot ma zachować cały kontekst i odświeżyć konkretną ofertę.",
  },
  {
    id: "J03",
    category: "follow_up",
    turns: [
      "cos cieplego we wrzesniu, 2 osoby, 3k na osobe",
      "a moze Turcja?",
      "pokaz Antalye",
      "za drogo",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "„Za drogo” jest obiekcją wobec właśnie pokazanej karty. Bot ma pobrać ofertę najtańszego wcześniejszego kandydata, nie szukać od nowa ani powtarzać Antalyi.",
  },
  {
    id: "J04",
    category: "follow_up",
    turns: [
      "city break w kwietniu, 2 osoby, do 3000 na osobe",
      "co masz we Wloszech?",
      "Rzym czy Neapol?",
      "dobra pokaz Neapol",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "W ostatniej turze klient wybiera konkretny kierunek z wcześniejszego porównania. Bot ma pamiętać kwiecień, dwie osoby i budżet oraz pokazać kartę Neapolu.",
  },
  {
    id: "J05",
    category: "follow_up",
    turns: [
      "wakacje z dzieckiem nad morzem w lipcu, 2+1",
      "bez lotu bo jedziemy autem",
      "moze Chorwacja",
      "Split",
      "a zmien na wrzesien",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Zmienia się wyłącznie miesiąc; nadal chodzi o Split, rodzinę 2+1 i sam hotel. Bot ma odświeżyć kartę z zachowaniem tych warunków.",
  },
  {
    id: "J06",
    category: "follow_up",
    turns: [
      "tani city break w listopadzie, jade sam",
      "Budapeszt",
      "a jednak dla dwoch",
      "i na weekend",
      "pokaz jeszcze raz",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Końcowa prośba oznacza świeżą kartę Budapesztu dla dwóch osób, w listopadzie i na trzy noce. Bot nie może wrócić do wcześniejszej liczby podróżnych.",
  },
  {
    id: "J07",
    category: "follow_up",
    turns: [
      "chce na Majorke",
      "w czerwcu",
      "na 7 nocy",
      "mamy 6000 lacznie",
      "a sam hotel?",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Ostatnia tura zmienia pakiet na sam hotel, zachowując Majorkę, czerwiec, siedem nocy i budżet łączny. Bot ma pobrać nową kartę, a nie odejmować ceny lotu samodzielnie.",
  },
  {
    id: "J08",
    category: "follow_up",
    turns: [
      "chce gdzies gdzie cieplo",
      "grudzien",
      "2 osoby",
      "moze Kanary",
      "Teneryfa",
      "daj link do tej oferty",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Link jest częścią ponownie pokazanej karty, więc bot ma odświeżyć ofertę Teneryfy dla dwóch osób w grudniu. Nie powinien twierdzić, że nie potrafi wyświetlić linku.",
  },
  {
    id: "J09",
    category: "follow_up",
    turns: [
      "city break we wrzesniu dla 2",
      "Lizbona",
      "wylot z Gdanska",
      "nie pasuje mi ten termin",
      "to pazdziernik",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Październik zastępuje wcześniejszy termin, ale miasto, dwie osoby i wylot z Gdańska pozostają bez zmian. Bot ma pobrać aktualną kartę Lizbony.",
  },
  {
    id: "J10",
    category: "follow_up",
    turns: [
      "plaza w sierpniu, 2 osoby, 4000 na osobe",
      "pokaz druga opcje",
      "a ma all inclusive?",
      "to cos tanszego",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Końcowa obiekcja cenowa dotyczy pokazanej alternatywy. Bot ma użyć najtańszego kandydata z wcześniejszych wyników i nie obiecywać all inclusive bez potwierdzenia na karcie.",
  },

  // K — niejednoznaczne
  {
    id: "K01",
    category: "ambiguous",
    turns: ["cos fajnego na urlop"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Bot ma aktywnie poprowadzić klienta: przyjąć rozsądne założenia i wyszukać albo zadać jedno zbiorcze pytanie. Nie może zamienić odpowiedzi w ankietę.",
  },
  {
    id: "K02",
    category: "ambiguous",
    turns: ["mam 4k i chce leciec"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Nie wiadomo, czy kwota jest łączna, ani kiedy i w jakim stylu ma być wyjazd. Bot ma zebrać najważniejsze braki jednym płynnym pytaniem z przykładową odpowiedzią.",
  },
  {
    id: "K03",
    category: "ambiguous",
    turns: ["morze albo zwiedzanie, wszystko mi jedno"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Klient oddaje wybór botowi, więc dobra odpowiedź przejmuje inicjatywę albo zadaje jedno rozstrzygające pytanie. Kolejne pytania o preferencje byłyby zbędną ankietą.",
  },
  {
    id: "K04",
    category: "ambiguous",
    turns: ["w czerwcu"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Sam miesiąc nie wystarcza do rozpoznania intencji. Bot ma zareagować naturalnie i zadać najwyżej jedno zbiorcze pytanie, zamiast dopowiadać ofertę znikąd.",
  },
  {
    id: "K05",
    category: "ambiguous",
    turns: ["gdzie jest najlepiej?"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Nie istnieje obiektywnie najlepszy kierunek, więc bot ma krótko przejąć inicjatywę lub zebrać podstawę wyboru jednym pytaniem. Nie może udawać pewności ani tworzyć ankiety.",
  },

  // L — obsługa serwisu
  {
    id: "L01",
    category: "site_support",
    turns: ["jak zarezerwowac wyjazd?"],
    expect: {
      maxSentences: 6,
      mustContainAny: ["Zobacz hotel", "Zobacz lot", "formularz", "Stripe"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma opisać wyłącznie znany proces: karta, strona oferty, formularz, płatność i e-mail. Nie może twierdzić, że sam dokonuje rezerwacji.",
  },
  {
    id: "L02",
    category: "site_support",
    turns: ["czym moge zaplacic?"],
    expect: {
      maxSentences: 6,
      mustContainAny: ["kartą", "karta", "Google Pay", "Stripe"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Dozwolone fakty to płatność przez Stripe kartą lub Google Pay. Bot nie powinien dopisywać przelewu, PayPala ani innych metod.",
  },
  {
    id: "L03",
    category: "site_support",
    turns: ["czy po platnosci dostane potwierdzenie?"],
    expect: {
      maxSentences: 6,
      mustContainAny: ["e-mail z numerem rezerwacji", "mail z numerem rezerwacji"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma potwierdzić tylko znany fakt: po opłaceniu przychodzi e-mail z numerem rezerwacji. Nie powinien wymyślać dodatkowych dokumentów ani terminów wysyłki.",
  },
  {
    id: "L04",
    category: "site_support",
    turns: ["jak zmienic date po kupieniu?"],
    expect: { maxSentences: 6, forbidInventedPrice: true },
    rubricNotes:
      "Prompt nie opisuje procedury zmiany daty, więc bot ma uczciwie odesłać do warunków lub strony konkretnej rezerwacji. Nie może wymyślić opłaty ani gwarantować zmiany.",
  },
  {
    id: "L05",
    category: "site_support",
    turns: ["czy moge anulowac hotel?"],
    expect: {
      maxSentences: 6,
      mustContainAny: ["warunki", "stronie rezerwacji", "karcie", "nie mogę potwierdzić"],
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Możliwość anulacji zależy od konkretnej oferty i nie jest ogólną obietnicą HelpTravel. Bot ma skierować do rzeczywistych warunków, bez dopisywania terminów lub kosztów.",
  },

  // M — słabe lub puste wejście
  {
    id: "M01",
    category: "bad_input",
    turns: ["polec cos"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Bardzo ogólna prośba wymaga spokojnego przejęcia inicjatywy. Bot ma przyjąć założenia lub zadać jedno krótkie pytanie, nie ankietę.",
  },
  {
    id: "M02",
    category: "bad_input",
    turns: ["no i?"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Bez wcześniejszego kontekstu bot nie powinien udawać, że wie, o co chodzi. Ma naturalnie skierować rozmowę z powrotem na wybór wyjazdu.",
  },
  {
    id: "M03",
    category: "bad_input",
    turns: ["hmm"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Odpowiedź powinna być krótka, pomocna i bez halucynowania wcześniejszej oferty. Dopuszczalne jest jedno proste pytanie prowadzące.",
  },
  {
    id: "M04",
    category: "bad_input",
    turns: ["chce gdzies wyjechac ale nie wiem gdzie"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Bot ma odciążyć niezdecydowanego klienta, zamiast żądać pełnego briefu. Najwyżej jedno pytanie może zebrać podstawowy kontekst.",
  },
  {
    id: "M05",
    category: "bad_input",
    turns: ["eee ten no wyjazd jakis"],
    expect: { maxSentences: 5, maxQuestions: 1, forbidInventedPrice: true },
    rubricNotes:
      "Chaotyczne wejście trzeba obsłużyć cierpliwie i po polsku. Bot nie może wymyślić celu, budżetu ani ceny jako faktu.",
  },

  // N — rozmowy wieloturowe
  {
    id: "N01",
    category: "multi_turn",
    turns: [
      "chce na plaze",
      "we wrzesniu",
      "2 doroslych i dziecko",
      "budzet 7500 lacznie",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Ostatnia tura domyka komplet informacji z trzech poprzednich wiadomości. Bot ma wyszukać plażę we wrześniu dla rodziny 2+1 z budżetem łącznym.",
  },
  {
    id: "N02",
    category: "multi_turn",
    turns: [
      "weekend w Rzymie",
      "dla dwoch",
      "z Krakowa",
      "tylko lot",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma połączyć Rzym, dwie osoby, wylot z Krakowa i trzy noce wynikające z weekendu. Końcowa karta powinna zawierać sam lot.",
  },
  {
    id: "N03",
    category: "multi_turn",
    turns: [
      "wakacje z dziecmi",
      "2+2",
      "sierpien",
      "Grecja",
      "mamy 9000 lacznie",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Wyszukiwanie ma dotyczyć Grecji w sierpniu dla rodziny 2+2 z budżetem całej grupy. Bot nie może zgubić dzieci ani potraktować kwoty jako limitu na osobę.",
  },
  {
    id: "N04",
    category: "multi_turn",
    turns: [
      "cos romantycznego",
      "pazdziernik",
      "na 5 nocy",
      "jedziemy we dwoje, do 3500 na osobe",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma zebrać rozproszony kontekst i wyszukać romantyczny wyjazd dla pary w październiku na pięć nocy. Ostatnia kwota jest jednoznacznie budżetem na osobę.",
  },
  {
    id: "N05",
    category: "multi_turn",
    turns: [
      "chce Malage",
      "w maju",
      "sam hotel",
      "2 osoby",
      "na tydzien",
      "pokaz oferte",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Końcowe polecenie odnosi się do Malagi w maju, siedmiu nocy, dwóch osób i samego hotelu. Bot ma pobrać konkretną kartę bez ponownego pytania o dane.",
  },
  {
    id: "N06",
    category: "multi_turn",
    turns: [
      "gdzie w zime po slonce",
      "styczen",
      "wylot Gdansk",
      "ja i zona, najtaniej",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma wyszukać zimowe słońce w styczniu dla dwóch osób z wylotem z Gdańska. „Najtaniej” oznacza brak kwotowego limitu, a nie kolejne pytanie o budżet.",
  },
  {
    id: "N07",
    category: "multi_turn",
    turns: [
      "city break",
      "kwiecien",
      "jade sam",
      "3 noce",
      "do 2200 na osobe",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "W pięciu krótkich turach klient podał wszystkie parametry wyjazdu. Bot ma ich użyć razem i pokazać ofertę city breaku bez ponownego dopytywania.",
  },
  {
    id: "N08",
    category: "multi_turn",
    turns: [
      "urlop na Teneryfie",
      "listopad",
      "2 doroslych",
      "jedno dziecko",
      "7 nocy",
      "do 8000 lacznie",
    ],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Teneryfa pozostaje konkretnym kierunkiem przez całą rozmowę. Bot ma pobrać ofertę w listopadzie dla rodziny 2+1 na siedem nocy z budżetem łącznym.",
  },
  {
    id: "N09",
    category: "multi_turn",
    turns: [
      "chcemy do Wloch",
      "wrzesien",
      "3 dorosle osoby",
      "5000 na osobe, co macie",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Kraj, miesiąc, liczba osób i budżet są rozłożone na cztery tury. Bot ma wyszukać włoskie kierunki, a nie zgadywać jedno miasto.",
  },
  {
    id: "N10",
    category: "multi_turn",
    turns: [
      "hotel i lot na plaze",
      "czerwiec",
      "z Poznania",
      "2 osoby",
      "budzetu nie wiem, pokaz najtansze",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma zachować pełny pakiet, czerwiec, wylot z Poznania i dwie osoby. Jawny brak budżetu wymaga wyszukania od najtańszego, nie kolejnej dopytki.",
  },
  {
    id: "N11",
    category: "multi_turn",
    turns: [
      "szukam wyjazdu",
      "dla pary",
      "na rocznice",
      "we wrzesniu",
      "5 nocy",
      "wylot Warszawa",
      "4000 na osobe",
      "chcemy raczej zwiedzac niz lezec",
    ],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Ostatnia tura rozstrzyga motyw na zwiedzanie, a wszystkie pozostałe warunki są w poprzednich wiadomościach. Bot ma pamiętać osiem tur i wyszukać jedną spójną ofertę.",
  },

  // O — naturalny polski
  {
    id: "O01",
    category: "polish_natural",
    turns: ["gdzie tanio na tydzien we wrzesniu"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma zrozumieć potoczne zdanie bez polskich znaków: siedem nocy, wrzesień i szukanie od najtańszego. Brak liczby osób uzupełnia założeniem zamiast ankietą.",
  },
  {
    id: "O02",
    category: "polish_natural",
    turns: ["mam 4k na dwoje gdzie poleciec w maju"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "„4k na dwoje” oznacza 4000 zł łącznie dla dwóch osób. Bot ma sam przyjąć rozsądny motyw, jasno go nazwać i przejść do wyników.",
  },
  {
    id: "O03",
    category: "polish_natural",
    turns: ["cos cieplego w pazdzierniku pls"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      maxQuestions: 1,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Krótki, potoczny prompt ma zostać poprawnie zinterpretowany jako wyjazd plażowy w październiku. Bot powinien użyć domyślnej liczby osób i pokazać ofertę.",
  },
  {
    id: "O04",
    category: "polish_natural",
    turns: ["chcem do barcy na wikend z krk we 2"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma rozpoznać mimo literówek Barcelonę, weekend, Kraków i dwie osoby. Konkretne miasto wymaga karty na trzy noce bez poprawiania użytkownika.",
  },
  {
    id: "O05",
    category: "polish_natural",
    turns: ["moze jakas grecja we wrzesniu 2os max 6k razem"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot ma odczytać skróty jako Grecję, wrzesień, dwie osoby i 6000 zł łącznie. Powinien wyszukać po kraju i nie pytać ponownie o znaczenie budżetu.",
  },

  // P — pytania adversarial i brak danych
  {
    id: "P01",
    category: "adversarial",
    turns: ["ile dokladnie kosztuje Marriott w Rzymie 12 marca?"],
    expect: {
      maxSentences: 5,
      mustAdmitNoLiveData: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot nie ma wyszukiwarki konkretnego hotelu po nazwie ani potwierdzonej ceny na żądany dzień. Ma przyznać ograniczenie i może zaproponować realną alternatywę z karty, ale bez zmyślonej kwoty.",
  },
  {
    id: "P02",
    category: "adversarial",
    turns: ["jaka bedzie pogoda w Atenach 18 maja o 14?"],
    expect: {
      maxSentences: 5,
      mustAdmitNoLiveData: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "To prośba o prognozę na konkretny dzień i godzinę, której bot nie ma. Powinien powiedzieć to wprost, najwyżej opisać typowy maj i wrócić do doboru wyjazdu.",
  },
  {
    id: "P03",
    category: "adversarial",
    turns: ["o ktorej dokladnie leci LOT LO281 do Londynu 14 listopada?"],
    expect: {
      maxSentences: 5,
      mustAdmitNoLiveData: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Narzędzia nie pozwalają sprawdzić rozkładu konkretnego numeru lotu. Bot ma przyznać brak takich danych i nie wymyślić godziny ani dostępności.",
  },
  {
    id: "P04",
    category: "adversarial",
    turns: ["jakie sa warunki anulacji w Hotel Riu Palace na Teneryfie?"],
    expect: {
      maxSentences: 5,
      mustAdmitNoLiveData: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot nie zna warunków nazwanej oferty bez jej rzeczywistej karty. Ma odesłać do warunków rezerwacji i nie podawać zmyślonych terminów, procentów ani opłat.",
  },
  {
    id: "P05",
    category: "adversarial",
    turns: ["czy na pewno zostaly tylko 2 pokoje w tym hotelu?"],
    expect: {
      maxSentences: 5,
      mustAdmitNoLiveData: true,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Bot nie ma danych o liczbie pozostałych pokoi i nie może tworzyć presji niedostępnością. Powinien jasno przyznać ograniczenie i skierować do bieżącej karty oferty.",
  },

  // Q — użycie narzędzi
  {
    id: "Q01",
    category: "tool_use",
    turns: ["znajdz realna oferte na plaze w czerwcu, 2 osoby, 3000 na osobe"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Użytkownik jawnie prosi o realną ofertę dla motywu i podał komplet danych. Poprawna odpowiedź wymaga search_trips oraz widocznej karty.",
  },
  {
    id: "Q02",
    category: "tool_use",
    turns: ["sprawdz aktualna oferte do Lizbony w pazdzierniku dla 2"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Aktualna oferta do konkretnego miasta wymaga bezpośrednio get_trip_offer. Bot nie powinien zastępować tego ogólnym opisem Lizbony ani wyszukiwaniem motywu.",
  },
  {
    id: "Q03",
    category: "tool_use",
    turns: ["jakie macie motywy wyjazdow?"],
    expect: {
      mustCallTool: ["list_themes"],
      mustNotCallTool: ["search_trips", "get_trip_offer"],
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Lista obsługiwanych motywów musi pochodzić z list_themes, a nie z pamięci modelu. Samo pytanie nie wymaga jeszcze wyszukania ani karty oferty.",
  },
  {
    id: "Q04",
    category: "tool_use",
    turns: ["pokaz co jest teraz do Grecji w maju dla 2, do 3500 na osobe"],
    expect: {
      mustCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Zapytanie dotyczy aktualnych danych dla konkretnego kraju, dlatego wymaga search_trips z Grecją. Oferta i każda kwota muszą być uziemione w wyniku.",
  },
  {
    id: "Q05",
    category: "tool_use",
    turns: ["daj karte hotelu i lotu do Budapesztu na weekend dla 2"],
    expect: {
      mustCallTool: ["get_trip_offer"],
      mustNotCallTool: ["search_trips"],
      mustShowOffer: true,
      maxSentences: 5,
      forbidInventedPrice: true,
    },
    rubricNotes:
      "Jawna prośba o kartę konkretnego miasta wymaga get_trip_offer dla pełnego pakietu na trzy noce. Bot ma pozwolić karcie dostarczyć linki zamiast tworzyć je w tekście.",
  },
];
