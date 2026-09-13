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

// Nazwy do wyświetlania. Slugi wyżej zostają ASCII (są adresami), ale tekst
// widoczny i tytuły mają polskie znaki — do 2026-09 stało tu „pazdziernik".
export const polishMonthLabels: Record<PolishMonthSlug, string> = {
  styczen: "styczeń",
  luty: "luty",
  marzec: "marzec",
  kwiecien: "kwiecień",
  maj: "maj",
  czerwiec: "czerwiec",
  lipiec: "lipiec",
  sierpien: "sierpień",
  wrzesien: "wrzesień",
  pazdziernik: "październik",
  listopad: "listopad",
  grudzien: "grudzień",
};

/** Miejscownik: „(w) styczniu", „(we) wrześniu". Z przyimkiem — inMonthPhrase(). */
export const polishMonthInflected: Record<PolishMonthSlug, string> = {
  styczen: "styczniu",
  luty: "lutym",
  marzec: "marcu",
  kwiecien: "kwietniu",
  maj: "maju",
  czerwiec: "czerwcu",
  lipiec: "lipcu",
  sierpien: "sierpniu",
  wrzesien: "wrześniu",
  pazdziernik: "październiku",
  listopad: "listopadzie",
  grudzien: "grudniu",
};

/** „w październiku", „we wrześniu" — przed „wrz-" przyimek przyjmuje formę „we". */
export function inMonthPhrase(slug: PolishMonthSlug): string {
  return `${slug === "wrzesien" ? "we" : "w"} ${polishMonthInflected[slug]}`;
}

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

/** Biernik po „na": „na wiosnę", „na lato". Do 2026-09 dawało „na latem" i „na zima". */
export const seasonInflected: Record<Season, string> = {
  wiosna: "wiosnę",
  lato: "lato",
  jesien: "jesień",
  zima: "zimę",
};
