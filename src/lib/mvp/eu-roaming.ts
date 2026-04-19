// Kraje, w ktorych polskie taryfy maja roaming UE/EOG za darmo.
// Yesim eSIM ma realny sens TYLKO poza ta lista — inaczej wciskamy uzytkownikowi cos co nie potrzebuje.

const EU_ROAMING_FREE = new Set<string>([
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Italy",
  "Latvia",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Norway",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
]);

export function isEuRoamingFree(country: string): boolean {
  return EU_ROAMING_FREE.has(country.trim());
}
