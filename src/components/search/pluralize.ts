// Polish pluralization for the guests popover trigger (zadanie 1, faza 1
// plan — approved 2026-06-11). Kept tiny and dependency-free; the forms are
// the natural genitive-plural readings used by Booking/Airbnb PL:
//   1 dorosły · 2-9 dorosłych        1 dziecko · 2-6 dzieci

export const adultsLabel = (n: number): string =>
  n === 1 ? "1 dorosły" : `${n} dorosłych`;

export const childrenLabel = (n: number): string =>
  n === 1 ? "1 dziecko" : `${n} dzieci`;

export const guestsLabel = (adults: number, children: number): string =>
  children > 0 ? `${adultsLabel(adults)} · ${childrenLabel(children)}` : adultsLabel(adults);
