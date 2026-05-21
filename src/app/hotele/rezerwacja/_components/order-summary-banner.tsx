// Compact emerald-tinted banner shown at the top of the booking card in both
// the form view and the paying view. Pure presentational, server-safe.

interface Props {
  hotelName: string;
  hotelCity?: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  price?: number;
  currency: string;
}

const PL_MONTHS = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
];

function formatPlDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const day = Number(m[3]);
  const monthIdx = Number(m[2]) - 1;
  const month = PL_MONTHS[monthIdx];
  return month ? `${day} ${month}` : iso;
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(`${checkin}T00:00:00Z`);
  const b = new Date(`${checkout}T00:00:00Z`);
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(1, diff);
}

function nightNoun(n: number): string {
  if (n === 1) return "noc";
  if (n >= 2 && n <= 4) return "noce";
  return "nocy";
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function OrderSummaryBanner({
  hotelName,
  hotelCity,
  checkin,
  checkout,
  price,
  currency,
}: Props) {
  const nights = nightsBetween(checkin, checkout);
  const meta = [
    hotelCity,
    `${formatPlDate(checkin)} → ${formatPlDate(checkout)}`,
    `${nights} ${nightNoun(nights)}`,
    typeof price === "number" && Number.isFinite(price)
      ? formatPrice(price, currency)
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
      <div className="text-sm font-semibold text-emerald-900">{hotelName}</div>
      <div className="mt-0.5 text-xs text-emerald-900/70">{meta.join(" · ")}</div>
    </div>
  );
}
