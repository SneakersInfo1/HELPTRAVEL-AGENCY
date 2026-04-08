import type { DestinationStory } from "./destination-content";
import type { SiteLocale } from "./locale";
import type { DestinationGuideContent, EditorialFaq } from "./publisher-content";
import type { DestinationProfile } from "./types";

const monthLabels = {
  pl: ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrzesniu", "pazdzierniku", "listopadzie", "grudniu"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
} as const;

const categoryTitleMap: Record<string, { pl: string; en: string }> = {
  "city-breaki": { pl: "City breaki", en: "City breaks" },
  "cieple-kierunki": { pl: "Cieple kierunki", en: "Warm escapes" },
  "tanie-podroze": { pl: "Tanie podroze", en: "Budget travel" },
  "weekendowe-wyjazdy": { pl: "Weekendowe wyjazdy", en: "Weekend trips" },
  "bez-wizy": { pl: "Bez wizy", en: "Visa-free" },
  przewodniki: { pl: "Przewodniki", en: "Guides" },
};

export interface LocalizedDestinationGuide {
  overview: string;
  whyGo: string[];
  bestTime: string;
  budgetNote: string;
  whoFor: string[];
  highlights: string[];
  districts: string[];
  faq: EditorialFaq[];
  bestForTags: string[];
  tripLength: string;
  tripProfile: string;
  routeComfort: string;
  visaNote: string;
  miniPlan: DestinationStory["miniPlan"];
}

function comfortableMonths(destination: DestinationProfile) {
  return destination.avgTempByMonth
    .map((temp, index) => ({ temp, index: index + 1 }))
    .filter((item) => item.temp >= 18 && item.temp <= 30)
    .slice(0, 4)
    .map((item) => item.index);
}

export function formatDestinationMonth(month: number, locale: SiteLocale) {
  return monthLabels[locale][month - 1] ?? (locale === "en" ? "season" : "sezon");
}

function tripLengthLabel(flightHours: number, locale: SiteLocale) {
  if (locale === "en") {
    if (flightHours <= 3.5) {
      return "3-4 days";
    }
    if (flightHours <= 5.5) {
      return "4-5 days";
    }
    return "5-7 days";
  }

  if (flightHours <= 3.5) {
    return "3-4 dni";
  }
  if (flightHours <= 5.5) {
    return "4-5 dni";
  }
  return "5-7 dni";
}

function tripProfileLabel(destination: DestinationProfile, locale: SiteLocale) {
  if (locale === "en") {
    if (destination.beachScore >= 0.75) return "beach plus reset";
    if (destination.cityScore >= 0.8) return "city break";
    if (destination.natureScore >= 0.75) return "views and a slower rhythm";
    return "balanced short trip";
  }

  if (destination.beachScore >= 0.75) return "plaza i reset";
  if (destination.cityScore >= 0.8) return "city break";
  if (destination.natureScore >= 0.75) return "widoki i spokoj";
  return "wyjazd mieszany";
}

function routeComfortLabel(destination: DestinationProfile, locale: SiteLocale) {
  if (locale === "en") {
    if (destination.accessScore >= 0.82) return "easy access from Poland";
    if (destination.accessScore >= 0.65) return "worth planning the route carefully";
    return "best booked with a bit more lead time";
  }

  if (destination.accessScore >= 0.82) return "latwy dolot z Polski";
  if (destination.accessScore >= 0.65) return "warto dobrze ustawic trase";
  return "najlepiej planowac z wyprzedzeniem";
}

function visaNoteLabel(destination: DestinationProfile, locale: SiteLocale) {
  return locale === "en"
    ? destination.visaForPL
      ? "visa-free for Polish passport holders"
      : "check entry requirements before booking"
    : destination.visaForPL
      ? "bez wizy dla polskiego paszportu"
      : "sprawdz formalnosci przed rezerwacja";
}

function englishBestForTags(destination: DestinationProfile, story: DestinationStory) {
  const tags = new Set<string>();

  if (destination.beachScore >= 0.7) tags.add("beach time");
  if (destination.cityScore >= 0.75 || destination.sightseeingScore >= 0.8) tags.add("city break");
  if (destination.natureScore >= 0.7) tags.add("views");
  if (destination.nightlifeScore >= 0.72) tags.add("evenings out");
  if (story.bestFor.some((item) => item.toLowerCase().includes("jedzenie"))) tags.add("good food");
  if (tags.size < 4) tags.add("short leisure trip");

  return [...tags].slice(0, 4);
}

function englishOverview(guide: DestinationGuideContent, story: DestinationStory) {
  const destination = guide.destination;
  const tripLength = tripLengthLabel(destination.typicalFlightHoursFromPL, "en");

  return `${destination.city} works well when you want a ${tripLength} trip that still feels clear and decision-friendly: a sensible route from Poland, enough reasons to stay longer than a rushed weekend and an easy bridge into hotels, flights and the next trip step. ${story.summary}`;
}

function englishWhyGo(guide: DestinationGuideContent, story: DestinationStory) {
  const destination = guide.destination;
  const tags = englishBestForTags(destination, story);

  return [
    `${destination.city} is strongest when the brief points toward ${tags.slice(0, 2).join(" and ")} rather than a vague "anywhere warm" search.`,
    `It gives you a practical format for ${tripLengthLabel(destination.typicalFlightHoursFromPL, "en")} without forcing an overloaded itinerary or overly long travel time.`,
    `The destination also converts well from inspiration into action: clear hotel areas, a defensible budget range and a strong next step into flights or local mobility.`,
  ];
}

function englishBestTime(destination: DestinationProfile) {
  const months = comfortableMonths(destination).map((month) => formatDestinationMonth(month, "en"));
  if (months.length === 0) {
    return "This destination is better treated as flexible across the year, with the final choice depending more on the exact brief than on one perfect month.";
  }

  return `The most comfortable window usually lands around ${months.join(", ")}, when weather, walkability and the overall trip rhythm tend to work best together.`;
}

function englishBudget(destination: DestinationProfile) {
  if (destination.costIndex <= 0.95) {
    return "This is one of the easier destinations to defend on a sensible budget without dropping straight into a low-standard trip.";
  }

  if (destination.costIndex >= 1.35) {
    return "Budgeting with a bit of margin matters here, because accommodation and daily spend can rise faster than in cheaper alternatives with a similar climate or city profile.";
  }

  return "The strongest setup is usually a mid-range budget: a good base, enough room for food and a couple of paid highlights, without pushing the whole trip into premium-only territory.";
}

function englishWhoFor(destination: DestinationProfile, story: DestinationStory) {
  const tags = englishBestForTags(destination, story);
  const whoFor = [
    `for travelers who want ${tags[0] ?? "a practical short trip"}`,
    `for trips built around ${tripLengthLabel(destination.typicalFlightHoursFromPL, "en")}`,
    destination.beachScore >= 0.68
      ? "for people who want city time and sea access in the same trip"
      : "for people who want a clear city-first or sightseeing-first plan",
  ];

  return whoFor.slice(0, 4);
}

function englishFaq(guide: DestinationGuideContent) {
  const destination = guide.destination;
  const tripLength = tripLengthLabel(destination.typicalFlightHoursFromPL, "en");

  return [
    {
      question: `How long should you plan for ${destination.city}?`,
      answer: `The strongest default is usually ${tripLength}. That window balances flight effort, budget and the amount you can realistically see without turning the trip into a checklist sprint.`,
    },
    {
      question: `Does ${destination.city} work better as a city break or as a more relaxed stay?`,
      answer:
        destination.beachScore >= 0.7
          ? "It works best as a hybrid. You can still build a city-led trip, but the destination becomes stronger when you leave room for slower moments and some reset by the coast."
          : "It is usually strongest as a city-first or sightseeing-first destination, not as a passive fly-and-do-nothing escape.",
    },
  ];
}

function englishMiniPlan(guide: DestinationGuideContent, story: DestinationStory) {
  const attractions = story.attractions.slice(0, 3);
  const districts = story.districts.slice(0, 2);

  return [
    {
      day: 1,
      title: "Arrival and orientation",
      description: `Use day one to settle in, walk through ${districts[0] ?? guide.destination.city} and get a feel for the local rhythm before committing to the heavier sightseeing blocks.`,
    },
    {
      day: 2,
      title: "Core highlights",
      description: `Build the strongest day around ${attractions.join(", ")}, but keep enough margin for food and one slower stretch instead of trying to overfit the itinerary.`,
    },
    {
      day: 3,
      title: "Local angle and better finish",
      description: `Use the final day for a more local district, another viewpoint or a calmer neighborhood so the trip ends with a fuller sense of place rather than only the main checklist.`,
    },
  ];
}

export function getLocalizedDestinationGuide(
  guide: DestinationGuideContent,
  story: DestinationStory,
  locale: SiteLocale,
): LocalizedDestinationGuide {
  if (locale === "pl") {
    return {
      overview: guide.overview,
      whyGo: guide.whyGo,
      bestTime: guide.bestTime,
      budgetNote: guide.budgetNote,
      whoFor: guide.whoFor,
      highlights: guide.highlights,
      districts: guide.districts,
      faq: guide.faq,
      bestForTags: story.bestFor,
      tripLength: tripLengthLabel(guide.destination.typicalFlightHoursFromPL, "pl"),
      tripProfile: tripProfileLabel(guide.destination, "pl"),
      routeComfort: routeComfortLabel(guide.destination, "pl"),
      visaNote: visaNoteLabel(guide.destination, "pl"),
      miniPlan: story.miniPlan,
    };
  }

  return {
    overview: englishOverview(guide, story),
    whyGo: englishWhyGo(guide, story),
    bestTime: englishBestTime(guide.destination),
    budgetNote: englishBudget(guide.destination),
    whoFor: englishWhoFor(guide.destination, story),
    highlights: story.attractions.slice(0, 5),
    districts: story.districts.slice(0, 4),
    faq: englishFaq(guide),
    bestForTags: englishBestForTags(guide.destination, story),
    tripLength: tripLengthLabel(guide.destination.typicalFlightHoursFromPL, "en"),
    tripProfile: tripProfileLabel(guide.destination, "en"),
    routeComfort: routeComfortLabel(guide.destination, "en"),
    visaNote: visaNoteLabel(guide.destination, "en"),
    miniPlan: englishMiniPlan(guide, story),
  };
}

export function buildLocalizedAvoidNotes(guide: DestinationGuideContent, locale: SiteLocale) {
  const notes: string[] = [];

  if (guide.destination.typicalFlightHoursFromPL > 5) {
    notes.push(
      locale === "en"
        ? "Less comfortable if the whole point is a very short, ultra-efficient weekend with minimal travel time."
        : "Mniej wygodny wybor na bardzo szybki weekend, jesli liczysz na minimalny czas w drodze.",
    );
  }
  if (guide.destination.costIndex > 1.3) {
    notes.push(
      locale === "en"
        ? "Harder to defend when the budget is extremely tight and cheaper alternatives can deliver a similar climate or trip style."
        : "Przy bardzo twardym budzecie latwiej obronic tansze alternatywy w podobnym klimacie.",
    );
  }
  if (guide.destination.beachScore < 0.45) {
    notes.push(
      locale === "en"
        ? "Not the best fit if the core brief is mostly beach time and a full-day reset by the water."
        : "To nie jest najlepszy kierunek, jesli priorytetem ma byc glownie plaza i calodniowy reset nad morzem.",
    );
  }
  if (guide.destination.cityScore < 0.55 && guide.destination.sightseeingScore < 0.55) {
    notes.push(
      locale === "en"
        ? "It becomes weaker when the brief expects a dense, high-intensity city break with many landmarks packed into a short stay."
        : "Slabiej broni sie, gdy szukasz bardzo intensywnego city breaku z duza liczba punktow do zwiedzania.",
    );
  }

  return notes.slice(0, 3);
}

export function buildLocalizedHotelAreaGuidance(guide: DestinationGuideContent, locale: SiteLocale) {
  const districts = guide.districts.slice(0, 3);

  return districts.map((district, index) => {
    const rationale =
      locale === "en"
        ? index === 0
          ? "The safest starting point if this is your first trip here and you want the key areas within easy reach."
          : index === 1 && guide.destination.beachScore >= 0.65
            ? "A strong option if you want to stay closer to the sea or switch into a calmer rhythm after the city core."
            : "Worth considering when you care more about local atmosphere or want to avoid the most obvious tourist streets."
        : index === 0
          ? "Najbezpieczniejszy start, jesli pierwszy raz lecisz do tego miasta i chcesz miec wszystko blisko."
          : index === 1 && guide.destination.beachScore >= 0.65
            ? "Dobry wybor, gdy chcesz mieszkac blizej morza albo spokojniejszego rytmu po dniu w miescie."
            : "Warto rozwazyc, jesli bardziej liczy sie lokalny klimat albo chcesz uniknac najbardziej oczywistych ulic.";

    return { district, rationale };
  });
}

export function buildLocalizedComparisonSignals(
  current: DestinationProfile,
  alternatives: DestinationProfile[],
  locale: SiteLocale,
) {
  return alternatives.slice(0, 3).map((destination) => {
    const priceAngle =
      locale === "en"
        ? destination.costIndex + 0.08 < current.costIndex
          ? `${destination.city} usually lands as the cheaper option when total trip cost is the main constraint.`
          : destination.costIndex - 0.08 > current.costIndex
            ? `${current.city} tends to protect the budget better if you do not want to pay more for a similar climate.`
            : `${destination.city} plays in a similar price band, so the decision is driven more by vibe and logistics.`
        : destination.costIndex + 0.08 < current.costIndex
          ? `${destination.city} wypada zwykle taniej, jesli priorytetem jest koszt calosci wyjazdu.`
          : destination.costIndex - 0.08 > current.costIndex
            ? `${current.city} zwykle lepiej broni budzet, jesli nie chcesz doplacac za podobny klimat.`
            : `${destination.city} gra w podobnym pulapie cenowym, wiec decyduje raczej klimat i logistyka.`;

    const styleAngle =
      locale === "en"
        ? destination.beachScore > current.beachScore + 0.12
          ? `${destination.city} has a stronger beach profile and is easier to defend when the brief leans toward sea time and reset.`
          : destination.cityScore > current.cityScore + 0.12
            ? `${destination.city} behaves more like a classic city break with denser sightseeing.`
            : destination.natureScore > current.natureScore + 0.12
              ? `${destination.city} gives a calmer, more scenic rhythm than ${current.city}.`
              : `${current.city} is the more balanced pick when you want to combine several needs without a hard compromise.`
        : destination.beachScore > current.beachScore + 0.12
          ? `${destination.city} ma mocniejszy profil plazowy i lepiej wypada przy briefie pod reset nad morzem.`
          : destination.cityScore > current.cityScore + 0.12
            ? `${destination.city} mocniej pracuje jako klasyczny city break z gestszym zwiedzaniem.`
            : destination.natureScore > current.natureScore + 0.12
              ? `${destination.city} daje spokojniejszy, bardziej widokowy rytm niz ${current.city}.`
              : `${current.city} jest bardziej rownym wyborem, gdy chcesz polaczyc kilka potrzeb bez duzych kompromisow.`;

    return {
      slug: destination.slug,
      city: destination.city,
      summary: priceAngle,
      bestFor: styleAngle,
    };
  });
}

export function buildLocalizedWinningScenarios(guide: DestinationGuideContent, locale: SiteLocale) {
  const destination = guide.destination;

  if (locale === "en") {
    return [
      {
        title: "It wins when you want a clean trip setup",
        body:
          destination.accessScore >= 0.8
            ? "Access from Poland is relatively easy, which makes the destination easier to defend even when the trip window is short."
            : "It works best when you can plan the route a bit earlier and you are not optimizing purely for the shortest possible travel effort.",
      },
      {
        title: "It wins when the brief is properly framed",
        body:
          destination.beachScore >= 0.68
            ? "This is a strong pick when you want city energy and coastal reset in the same trip, instead of choosing a purely beach or purely city scenario."
            : destination.cityScore >= 0.75
              ? "It becomes strongest when the core brief is city time, sightseeing and a clear 3-5 day plan without unnecessary sprawl."
              : "It tends to win when the brief asks for a calmer rhythm, more views and a balanced short escape rather than an overpacked weekend.",
      },
      {
        title: "It wins when value still matters",
        body:
          destination.costIndex <= 1.05
            ? "It is easier to hold a strong cost-to-experience ratio here than in many louder alternatives with a similar climate."
            : "This is not an ultra-budget pick, but it can still make strong sense if you avoid wasting the budget on the wrong hotel area.",
      },
    ];
  }

  return [
    {
      title: "Wygrywa, gdy liczysz na sprawny wyjazd",
      body:
        destination.accessScore >= 0.8
          ? "Dolot z Polski jest relatywnie prosty, wiec latwiej obronic ten kierunek nawet przy krotkim oknie wyjazdu."
          : "Najlepiej broni sie wtedy, gdy mozesz zaplanowac trase odrobine wczesniej i nie oczekujesz najkrotszej logistyki.",
    },
    {
      title: "Wygrywa, gdy brief jest dobrze ustawiony",
      body:
        destination.beachScore >= 0.68
          ? "To dobry wybor, jesli chcesz polaczyc klimat miejski z resetem nad morzem, zamiast jechac w skrajnie plazowy albo skrajnie miejski scenariusz."
          : destination.cityScore >= 0.75
            ? "Najmocniej pracuje, gdy priorytetem jest miasto, zwiedzanie i czytelny plan na 3-5 dni bez rozlewania wyjazdu."
            : "Najlepiej wypada przy spokojniejszym briefie, gdzie licza sie widoki, rytm miejsca i bardziej zbalansowany plan.",
    },
    {
      title: "Wygrywa, gdy budzet ma byc sensowny",
      body:
        destination.costIndex <= 1.05
          ? "Latwiej utrzymac tu dobry stosunek kosztu do efektu niz w wielu glosniejszych kierunkach o podobnym klimacie."
          : "To nie jest kierunek ultrabudzetowy, ale nadal moze byc bardzo sensowny, jesli nie przepalasz budzetu na zla lokalizacje noclegu.",
    },
  ];
}

export function getLocalizedCategoryTitle(slug: string, fallback: string, locale: SiteLocale) {
  return categoryTitleMap[slug]?.[locale] ?? (locale === "en" ? fallback.replace(/-/g, " ") : fallback);
}
