import type { SiteLocale } from "@/lib/mvp/locale";

export type TrustedTravelResource = {
  href: string;
  label: Record<SiteLocale, string>;
  description: Record<SiteLocale, string>;
};

export const TRUSTED_TRAVEL_RESOURCES: TrustedTravelResource[] = [
  {
    href: "https://www.gov.pl/web/dyplomacja/informacje-dla-podróżujacych",
    label: {
      pl: "MSZ: informacje dla podróżujacych",
      en: "Polish MFA travel information",
    },
    description: {
      pl: "Oficjalne ostrzezenia, praktyczne wskazowki i komunikaty przed wyjazdem.",
      en: "Official travel notices, safety updates and trip preparation guidance.",
    },
  },
  {
    href: "https://europa.eu/youreurope/citizens/travel/passenger-rights/index_pl.htm",
    label: {
      pl: "UE: prawa pasazera",
      en: "EU passenger rights",
    },
    description: {
      pl: "Oficjalne zasady dotyczace opoznionych lotów, odwolanych polaczen i overbookingu.",
      en: "Official rules for delays, cancellations and denied boarding in Europe.",
    },
  },
  {
    href: "https://www.nfz.gov.pl/dla-pacjenta/nasze-zdrowie-w-ue/leczenie-w-krajach-unii-europejskiej-i-efta/jak-wyrobic-karte-ekuz/",
    label: {
      pl: "NFZ: jak wyrobic EKUZ",
      en: "NFZ: how to get an EHIC card",
    },
    description: {
      pl: "Praktyczna instrukcja dotyczaca karty EKUZ przy wyjazdach po Europie.",
      en: "Official guidance on the European Health Insurance Card for trips in Europe.",
    },
  },
  {
    href: "https://www.pot.gov.pl/pl",
    label: {
      pl: "Polska Organizacja Turystyczna",
      en: "Polish Tourism Organisation",
    },
    description: {
      pl: "Instytucjonalne źródło wiedzy o rynku turystycznym i kierunkach podróży.",
      en: "Institutional source for tourism information and destination context.",
    },
  },
];

