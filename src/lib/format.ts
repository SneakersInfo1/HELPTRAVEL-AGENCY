export type MoneyLocale = "pl" | "en";

export function formatMoney(value: number, currency: string = "PLN", locale: MoneyLocale = "pl"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
