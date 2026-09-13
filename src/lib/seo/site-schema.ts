// Dane strukturalne całego serwisu (WebSite, Organization, Service) — renderuje
// je główny layout. Wydzielone z layout.tsx, żeby dało się je testować: layout
// importuje CSS i fonty, których node:test nie załaduje.

export function buildSiteStructuredData(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "HelpTravel",
        alternateName: "HelpTravel.pl",
        url: siteUrl,
        // Jedna wersja językowa. Do 2026-09 stało tu ["pl-PL", "en-US"], choć
        // wersji angielskiej nie ma — deklaracja wspierała błędną detekcję języka.
        inLanguage: "pl-PL",
        description:
          "Serwis rezerwacji hoteli i lotów dla polskiego podróżnego. Ceny w złotówkach, rezerwacja bez zakładania konta.",
        publisher: { "@id": `${siteUrl}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/hotele/szukaj?destination={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "HelpTravel",
        legalName: "HelpTravel",
        url: siteUrl,
        // Wymiary zgodne z plikiem: źródło ma 747×747, nie 512×512. Deklarowanie
        // rozmiaru, którego obraz nie ma, to dla walidatora schema.org błąd.
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/branding/helptravel-mark.png`,
          width: 747,
          height: 747,
        },
        slogan: "Hotele i loty w jednym miejscu, w złotówkach",
        description:
          "Polski serwis rezerwacji hoteli i lotów. Ceny w złotówkach z podatkami i opłatami, rezerwacja bez zakładania konta.",
        areaServed: [
          { "@type": "Country", name: "Poland" },
          { "@type": "Place", name: "Europe" },
        ],
        knowsLanguage: ["pl", "en"],
        sameAs: ["https://helptravel.pl"],
      },
      // Ten blok był najgorszym miejscem starej nieprawdy, bo mówił ją MASZYNIE:
      // deklarował Google'owi `price: "0"` i „płatność następuje wyłącznie
      // u partnera rezerwacyjnego" dla usługi nazwanej „Planer wyjazdów". Planera
      // nie ma, a nocleg kupuje się i płaci na helptravel.pl. Structured data
      // trafia do rich resultów, więc fałszywa cena 0 PLN jest tam groźniejsza
      // niż w tekście strony — użytkownik widzi ją, zanim w ogóle kliknie.
      {
        "@type": "Service",
        "@id": `${siteUrl}/#service`,
        serviceType: "Hotel and flight booking",
        name: "Rezerwacja hoteli i lotów HelpTravel",
        provider: { "@id": `${siteUrl}/#organization` },
        areaServed: { "@type": "Place", name: "Europe" },
        // Bez `offers`: cena zależy od obiektu, terminu i liczby osób, więc
        // każda liczba wpisana tutaj byłaby zmyślona. Brak deklaracji jest
        // uczciwszy niż deklaracja nieprawdziwa.
        audience: { "@type": "Audience", audienceType: "Polish travelers and Polish diaspora in Europe" },
      },
    ],
  };
}
