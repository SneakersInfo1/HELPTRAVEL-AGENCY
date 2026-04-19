export const polishMonthSlugs = [
  "styczen",
  "luty",
  "marzec",
  "kwiecien",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpien",
  "wrzesien",
  "pazdziernik",
  "listopad",
  "grudzien",
] as const;

export type PolishMonthSlug = (typeof polishMonthSlugs)[number];

export const polishMonthLabels: Record<PolishMonthSlug, string> = {
  styczen: "styczen",
  luty: "luty",
  marzec: "marzec",
  kwiecien: "kwiecien",
  maj: "maj",
  czerwiec: "czerwiec",
  lipiec: "lipiec",
  sierpien: "sierpien",
  wrzesien: "wrzesien",
  pazdziernik: "pazdziernik",
  listopad: "listopad",
  grudzien: "grudzien",
};

export const polishMonthInflected: Record<PolishMonthSlug, string> = {
  styczen: "styczniu",
  luty: "lutym",
  marzec: "marcu",
  kwiecien: "kwietniu",
  maj: "maju",
  czerwiec: "czerwcu",
  lipiec: "lipcu",
  sierpien: "sierpniu",
  wrzesien: "wrzesniu",
  pazdziernik: "pazdzierniku",
  listopad: "listopadzie",
  grudzien: "grudniu",
};

export function getMonthIndex(slug: PolishMonthSlug): number {
  return polishMonthSlugs.indexOf(slug);
}

export function isPolishMonthSlug(value: string): value is PolishMonthSlug {
  return (polishMonthSlugs as readonly string[]).includes(value);
}

export type Season = "wiosna" | "lato" | "jesien" | "zima";

export const seasonSlugs: Season[] = ["wiosna", "lato", "jesien", "zima"];

export const seasonMonthIndexes: Record<Season, number[]> = {
  wiosna: [2, 3, 4],
  lato: [5, 6, 7],
  jesien: [8, 9, 10],
  zima: [11, 0, 1],
};

export const seasonLabels: Record<Season, string> = {
  wiosna: "wiosna",
  lato: "lato",
  jesien: "jesien",
  zima: "zima",
};

export const seasonInflected: Record<Season, string> = {
  wiosna: "wiosna",
  lato: "latem",
  jesien: "jesienia",
  zima: "zima",
};
