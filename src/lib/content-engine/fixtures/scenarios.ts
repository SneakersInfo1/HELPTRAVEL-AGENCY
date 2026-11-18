import type { FixtureInventoryOptions } from "../inventory";
import type { FakeLlmStep } from "../llm";
import type { GscCsvInputs } from "../pipeline";
import type { FixtureSource } from "../sources";

export type FixtureScenarioName = "refresh" | "new-evergreen" | "reject-unverified";

const DAILY = `Data,Clicks,Impressions,CTR,Position
2026-11-11,31,1200,0.0258,8.4
2026-11-12,34,1300,0.0262,8.1
2026-11-13,37,1400,0.0264,7.9
`;

const PAGES_REFRESH = `Najpopularniejsze strony,Clicks,Impressions,CTR,Position
https://helptravel.pl/porownanie/madeira-czy-teneryfa,2,3000,0.0007,8
https://helptravel.pl/kierunki/madeira,90,900,0.10,3
https://helptravel.pl/kierunki/teneryfa,70,700,0.10,3
`;

const PAGES_NEW = `Najpopularniejsze strony,Clicks,Impressions,CTR,Position
https://helptravel.pl/kierunki/walencja,300,1000,0.30,1
https://helptravel.pl/porownanie/walencja-czy-malaga,160,1000,0.16,2
https://helptravel.pl/inspiracje/architektura-hiszpanii,110,1000,0.11,3
`;

const QUERIES_REFRESH = `Najpopularniejsze zapytania,Clicks,Impressions,CTR,Position
madeira czy teneryfa,5,1400,0.0036,9
helptravel,20,100,0.20,1
`;

const QUERIES_NEW = `Najpopularniejsze zapytania,Clicks,Impressions,CTR,Position
ogrody parki i dzielnice Walencji,12,2500,0.0048,11
help travel,30,120,0.25,1
`;

const REFRESH_RESEARCH = JSON.stringify({
  claims: [
    {
      claim: "Madeira jest archipelagiem położonym na Oceanie Atlantyckim.",
      value: "Madeira",
      dataClass: "geography",
      sourceUrl: "https://visitmadeira.com/official-guide",
      observedEvidence: "Madeira is an archipelago in the Atlantic Ocean.",
    },
    {
      claim: "Park Narodowy Teide obejmuje wysokogórski krajobraz wulkaniczny Teneryfy.",
      value: "Teide National Park",
      dataClass: "attraction",
      sourceUrl: "https://webtenerife.com/official-guide",
      observedEvidence: "Teide National Park occupies the high volcanic landscape of Tenerife.",
    },
    {
      claim: "Teneryfę obsługują porty lotnicze Tenerife North i Tenerife South.",
      value: "Tenerife North Airport; Tenerife South Airport",
      dataClass: "transport",
      sourceUrl: "https://aena.es/en/tenerife-airports.html",
      observedEvidence: "Tenerife is served by Tenerife North Airport and Tenerife South Airport.",
    },
  ],
});

const REFRESH_WRITER = JSON.stringify({
  topicCluster: "porównanie wysp atlantyckich",
  title: "Madeira czy Teneryfa: porównanie charakteru wysp",
  description: "Porównanie Madery i Teneryfy według krajobrazu, sposobu zwiedzania oraz organizacji przylotu, oparte na oficjalnych źródłach.",
  lead: "Madeira czy Teneryfa to wybór między zwartym, górzystym archipelagiem a większą wyspą z rozległym krajobrazem wulkanicznym. Zestawienie pokazuje różnice, które rzeczywiście wpływają na plan dnia i sposób poruszania się.",
  sections: [
    {
      id: "charakter-wysp",
      kind: "prose",
      heading: "Dwa odmienne rytmy zwiedzania",
      claimIds: ["claim-1", "claim-2"],
      paragraphs: [
        "Madeira jest archipelagiem na Atlantyku, dlatego plan wyjazdu naturalnie skupia się na górzystym wnętrzu, punktach widokowych oraz miejscowościach rozłożonych przy wybrzeżu. Taki układ sprzyja układaniu dni wokół jednego obszaru zamiast ciągłego przemieszczania się pomiędzy odległymi częściami wyspy.",
        "Teneryfa daje inny punkt ciężkości. Park Narodowy Teide wprowadza wyraźny motyw wysokiego krajobrazu wulkanicznego, a pozostałe części wyspy pozwalają łączyć miasta, wybrzeże i punkty obserwacyjne. W praktyce przy wyborze warto zacząć od tego, czy ważniejsza jest zwarta trasa górska, czy większa różnorodność otoczenia.",
      ],
    },
    {
      id: "organizacja-przylotu",
      kind: "prose",
      heading: "Przylot jako część planu",
      claimIds: ["claim-3"],
      paragraphs: [
        "Teneryfę obsługują porty Tenerife North oraz Tenerife South. Wybór miejsca przylotu należy więc zestawić z bazą noclegową i pierwszym etapem podróży, ponieważ sama nazwa wyspy nie opisuje całej logistyki. Oficjalne informacje pasażerskie każdego portu są właściwym miejscem do sprawdzenia transportu naziemnego przed wyjazdem.",
        "Na obu kierunkach dobrze układać plan od regionów, a dopiero później dopisywać pojedyncze atrakcje. Ogranicza to zbędne przejazdy i zostawia przestrzeń na zmianę kolejności przy gorszej widoczności w górach. Porównanie nie wskazuje jednego zwycięzcy, lecz pomaga dopasować wyspę do oczekiwanego tempa.",
      ],
    },
    {
      id: "werdykt",
      kind: "verdict",
      heading: "Która wyspa pasuje do planu",
      claimIds: ["claim-1", "claim-2", "claim-3"],
      options: [
        { "label": "Madeira", "chooseIf": ["Chcesz budować dni wokół górzystego wnętrza i nadmorskich miejscowości."], "skipIf": ["Wolisz rozległy krajobraz wulkaniczny z większą liczbą odmiennych regionów."] },
        { "label": "Teneryfa", "chooseIf": ["Park Teide i zróżnicowanie regionów są główną osią wyjazdu."], "skipIf": ["Szukasz bardziej zwartego programu skoncentrowanego na górskich trasach."] }
      ],
      basis: "Werdykt wynika z oficjalnie opisanego charakteru obu wysp oraz z układu portów lotniczych Teneryfy, a nie z rankingu popularności.",
    },
  ],
  imageAsset: { provider: "none", licence: "brak obrazu", alt: "", credit: "" },
  relatedContent: ["/kierunki/madeira", "/kierunki/teneryfa"],
  ctaTarget: "/porownanie",
});

const NEW_RESEARCH = JSON.stringify({
  claims: [
    {
      claim: "Ogród Turii biegnie dawnym korytem rzeki przez Walencję.",
      value: "Turia Garden",
      dataClass: "geography",
      sourceUrl: "https://visitvalencia.com/parks",
      observedEvidence: "Turia Garden follows the former riverbed through Valencia.",
    },
    {
      claim: "Park Cabecera znajduje się przy zachodnim krańcu Ogrodu Turii.",
      value: "Cabecera Park",
      dataClass: "attraction",
      sourceUrl: "https://visitvalencia.com/parks",
      observedEvidence: "Cabecera Park is located at the western end of Turia Garden.",
    },
    {
      claim: "Giełda Jedwabiu w Walencji była zespołem budynków związanych z handlem jedwabiem.",
      value: "Silk Exchange of Valencia",
      dataClass: "attraction",
      sourceUrl: "https://whc.unesco.org/en/list/782/",
      observedEvidence: "The Silk Exchange of Valencia is a group of buildings originally used for trading in silk.",
    },
  ],
});

const NEW_WRITER = JSON.stringify({
  topicCluster: "zielona i historyczna Walencja",
  title: "Ogrody, parki i dzielnice Walencji na spokojny spacer",
  description: "Plan poznawania Walencji przez Ogród Turii, Park Cabecera i historyczne dzielnice, z trasą opartą na oficjalnych opisach miejsc.",
  lead: "Ogrody, parki i dzielnice Walencji można połączyć w spójną trasę bez układania listy przypadkowych punktów. Osią planu jest dawne koryto rzeki, od którego łatwo przejść do zielonych terenów i historycznej zabudowy.",
  sections: [
    {
      id: "os-trasy",
      kind: "prose",
      heading: "Ogród Turii jako oś orientacyjna",
      claimIds: ["claim-1"],
      paragraphs: [
        "Ogród Turii biegnie przez Walencję dawnym korytem rzeki. Ta cecha pomaga potraktować zielony pas nie jako pojedynczą atrakcję, lecz jako czytelną oś miasta. Zamiast przeskakiwać między odległymi punktami, można wybierać kolejne wyjścia z ogrodu i poznawać sąsiednie ulice etapami. Taki porządek ułatwia zachowanie spokojnego tempa oraz zmianę planu bez burzenia całego dnia.",
        "Trasę dobrze rozpocząć od zaznaczenia dzielnicy, do której chce się dojść po spacerze. Ogród pełni wtedy rolę łącznika, a nie celu zamkniętego w sobie. Po drodze można obserwować, jak zmienia się otoczenie: otwarte fragmenty rekreacyjne przechodzą w odcinki bliższe zwartej zabudowie. To prosty sposób na zrozumienie układu Walencji przed dokładniejszym zwiedzaniem jej historycznych części.",
      ],
    },
    {
      id: "zachodni-koniec",
      kind: "prose",
      heading: "Park Cabecera i zachodni kierunek",
      claimIds: ["claim-2"],
      paragraphs: [
        "Park Cabecera leży przy zachodnim krańcu Ogrodu Turii. Dzięki temu może być naturalnym początkiem albo finałem spaceru prowadzonego wzdłuż zielonej osi. Wybór kierunku zależy od miejsca noclegu i dalszych planów, ale sama relacja obu terenów daje jasny punkt odniesienia. Nie trzeba tworzyć osobnych przejazdów do dwóch niezależnych miejsc, jeżeli chce się oglądać je jako jedną przestrzeń.",
        "Zachodni odcinek pasuje osobom, które wolą obserwować miasto przez jego przestrzenie publiczne niż przez serię wnętrz. W planie warto zostawić czas na odpoczynek, ponieważ sens tej części trasy wynika z ciągłości, a nie z odhaczania kolejnych nazw. Po wyjściu z parku można wrócić do ogrodu albo skierować się ku lokalnym ulicom, zachowując prostą orientację względem dawnego koryta.",
      ],
    },
    {
      id: "historyczny-kontekst",
      kind: "prose",
      heading: "Historyczne centrum bez przypadkowej listy",
      claimIds: ["claim-3"],
      paragraphs: [
        "Giełda Jedwabiu w Walencji była zespołem budynków używanych w związku z handlem jedwabiem. Ten kontekst pozwala czytać historyczne centrum jako część dawnego miasta handlowego, a nie wyłącznie dekoracyjne tło. Spacer zyskuje dzięki temu konkretny temat: relację między reprezentacyjną architekturą, ulicami centrum i funkcjami, które kształtowały ich otoczenie.",
        "Połączenie zielonej osi z historycznym centrum pokazuje dwa odmienne sposoby korzystania z miasta. Pierwszy opiera się na długiej, otwartej przestrzeni i swobodnym wyborze wyjść. Drugi zachęca do uważnego oglądania zwartej tkanki oraz powiązań pomiędzy budynkami. Nie trzeba zamykać obu części w jednym dniu; lepiej zachować wspólny motyw i dobrać długość trasy do własnego rytmu.",
      ],
    },
    {
      id: "warianty-spaceru",
      kind: "list",
      heading: "Jak ułożyć wariant spaceru",
      claimIds: ["claim-1", "claim-2", "claim-3"],
      intro: "Każdy wariant korzysta z tej samej osi, ale inaczej rozkłada akcenty między zielenią a zabudową.",
      items: [
        "Wariant zielony prowadzi od Parku Cabecera wzdłuż Ogrodu Turii i kończy się przy wybranym wyjściu do sąsiedniej dzielnicy.",
        "Wariant miejski zaczyna się w historycznym centrum, obejmuje Giełdę Jedwabiu, a później schodzi ku ogrodowi na spokojniejszą część dnia.",
        "Wariant dzielnicowy wykorzystuje ogród tylko jako łącznik pomiędzy dwoma obszarami i zostawia więcej czasu na boczne ulice.",
      ],
    },
    {
      id: "praktyka-bez-pospiechu",
      kind: "prose",
      heading: "Plan odporny na zmianę tempa",
      claimIds: ["claim-1", "claim-2"],
      paragraphs: [
        "Najbardziej użyteczny plan nie wymaga przejścia całej osi. Wystarczy ustalić punkt startowy, pożądany kierunek i miejsce wyjścia do kolejnej dzielnicy. Jeśli spacer zajmie więcej czasu, można zakończyć go wcześniej bez utraty głównego sensu. Jeśli zostanie zapas energii, ciągłość ogrodu pozwala łatwo wydłużyć trasę, nie szukając nowego celu po drugiej stronie miasta.",
        "Przed wyjściem dobrze sprawdzić oficjalne informacje o konkretnych obiektach, które mają znaleźć się po drodze. Sam układ ogrodu, parku i centrum pozostaje podstawą orientacji, lecz dostęp do wnętrz może podlegać odrębnym zasadom. Dzięki rozdzieleniu stałej struktury trasy od bieżących szczegółów spacer pozostaje czytelny, a decyzje podejmuje się na podstawie właściwego źródła.",
      ],
    },
  ],
  imageAsset: { provider: "none", licence: "brak obrazu", alt: "", credit: "" },
  relatedContent: ["/kierunki/walencja", "/porownanie/walencja-czy-malaga", "/inspiracje/architektura-hiszpanii"],
  ctaTarget: "/kierunki",
});

const REJECT_RESEARCH = JSON.stringify({
  claims: [
    {
      claim: "Bilet dzienny do wszystkich atrakcji kosztuje dziewięćdziesiąt dziewięć euro.",
      value: "99 EUR",
      dataClass: "price",
      sourceUrl: "https://visitvalencia.com/parks",
      observedEvidence: "A day ticket costs 99 EUR.",
    },
  ],
});

const SOURCE_FIXTURES: Readonly<Record<string, FixtureSource>> = {
  "https://visitmadeira.com/official-guide": "Madeira is an archipelago in the Atlantic Ocean. Its landscape combines a mountainous interior with coastal settlements.",
  "https://webtenerife.com/official-guide": "Teide National Park occupies the high volcanic landscape of Tenerife. The island also has historic towns and coastal areas.",
  "https://aena.es/en/tenerife-airports.html": "Tenerife is served by Tenerife North Airport and Tenerife South Airport. Each airport publishes official passenger information.",
  "https://visitvalencia.com/parks": "Turia Garden follows the former riverbed through Valencia. Cabecera Park is located at the western end of Turia Garden. The official tourism board describes neighbourhoods around the historic centre.",
  "https://whc.unesco.org/en/list/782/": "The Silk Exchange of Valencia is a group of buildings originally used for trading in silk. UNESCO describes its civil architecture.",
};

const REFRESH_INVENTORY: FixtureInventoryOptions = {
  existing: [
    { canonicalUrl: "/porownanie/madeira-czy-teneryfa", title: "Madeira czy Teneryfa – porównanie wysp" },
    { canonicalUrl: "/kierunki/madeira", title: "Madeira – przewodnik" },
    { canonicalUrl: "/kierunki/teneryfa", title: "Teneryfa – przewodnik" },
  ],
  knownRoutes: ["/porownanie", "/kierunki", "/kierunki/madeira", "/kierunki/teneryfa"],
};

const NEW_INVENTORY: FixtureInventoryOptions = {
  existing: [
    { canonicalUrl: "/kierunki/walencja", title: "Walencja – przewodnik po mieście" },
    { canonicalUrl: "/porownanie/walencja-czy-malaga", title: "Walencja czy Malaga" },
    { canonicalUrl: "/inspiracje/architektura-hiszpanii", title: "Dzielnice i architektura Hiszpanii" },
    { canonicalUrl: "/najlepsze-kierunki/wiosna", title: "Parki miejskie na wiosenny wyjazd" },
  ],
  knownRoutes: [
    "/kierunki",
    "/kierunki/walencja",
    "/porownanie/walencja-czy-malaga",
    "/inspiracje/architektura-hiszpanii",
    "/najlepsze-kierunki/wiosna",
  ],
};

export interface FixtureScenario {
  gsc: GscCsvInputs;
  inventory: FixtureInventoryOptions;
  sources: Readonly<Record<string, FixtureSource>>;
  scripts: Partial<Record<"researcher" | "writer", readonly FakeLlmStep[]>>;
}

export function fixtureScenario(name: FixtureScenarioName): FixtureScenario {
  if (name === "new-evergreen") {
    return {
      gsc: { pages: PAGES_NEW, queries: QUERIES_NEW, daily: DAILY },
      inventory: NEW_INVENTORY,
      sources: SOURCE_FIXTURES,
      scripts: { researcher: [NEW_RESEARCH], writer: [NEW_WRITER] },
    };
  }
  if (name === "reject-unverified") {
    return {
      gsc: { pages: PAGES_REFRESH, queries: QUERIES_REFRESH, daily: DAILY },
      inventory: REFRESH_INVENTORY,
      sources: SOURCE_FIXTURES,
      scripts: { researcher: [REJECT_RESEARCH], writer: [REFRESH_WRITER] },
    };
  }
  return {
    gsc: { pages: PAGES_REFRESH, queries: QUERIES_REFRESH, daily: DAILY },
    inventory: REFRESH_INVENTORY,
    sources: SOURCE_FIXTURES,
    scripts: { researcher: [REFRESH_RESEARCH], writer: [REFRESH_WRITER] },
  };
}

