// Deterministyczne "social proof" per-destynacja. Bazuje na hashu sluga
// + (opcjonalnie) numerze tygodnia, zeby liczby byly stabilne w sesji
// ale zmienialy sie z czasem. UWAGA: to nie sa realne dane —
// dopoki nie podlaczymy prisma.plan.count / rating API, traktuj jako
// heurystyke. Patrz README_SOCIAL_PROOF.md zanim pushniesz do produkcji.

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function isoWeekNumber(date = new Date()): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export interface DestinationSocialProof {
  rating: number; // 4.5 - 4.9
  reviewsCount: number; // 800 - 4800
  planningNow: number; // 8 - 64 (osob planuje w tym tygodniu)
  priceFromPLN: number; // od X zl
  discountPct: number | null; // -22% jesli > 0, null gdy brak promocji
  isBestseller: boolean; // top 20% najgoretszych
  isHotDeal: boolean; // ostatnio spadla cena
}

export function getDestinationSocialProof(slug: string): DestinationSocialProof {
  const h = hashSlug(slug);
  const week = isoWeekNumber();
  const weekH = h ^ week;

  // Rating: 4.5 - 4.9 (jednostki 0.1)
  const rating = 4.5 + ((h % 5) * 0.1);

  // Reviews: 800 - 4800
  const reviewsCount = 800 + (h % 4001);

  // Planning now: 8 - 64 (zmienia sie per tydzien)
  const planningNow = 8 + (weekH % 57);

  // Price from: 499 - 2499 zl (bazuje na slug-ie)
  const priceFromPLN = 499 + (h % 2001);

  // Discount: 40% destynacji ma promocje 15-42%
  const hasDiscount = (h % 10) < 4;
  const discountPct = hasDiscount ? 15 + (h % 28) : null;

  // Bestseller: top ~20% (1 z 5)
  const isBestseller = (h % 5) === 0;

  // Hot deal: inne 20% (niezaleznie, moze sie pokrywac z bestseller)
  const isHotDeal = ((h >> 3) % 5) === 1;

  return {
    rating: Math.round(rating * 10) / 10,
    reviewsCount,
    planningNow,
    priceFromPLN,
    discountPct,
    isBestseller,
    isHotDeal,
  };
}

export function formatPricePLN(price: number): string {
  // 1249 -> "1 249"
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
