// FAZA 9 — sekcja prawdziwych opinii gości. Czysto prezentacyjna: dostaje już
// wyselekcjonowane, czytelne opinie (lib/liteapi/reviews → selectReviews).
// Pusta lista → zwraca null (sekcja w ogóle się nie renderuje — zero fałszywek).

import { formatReviewDate, type DisplayReview } from "@/lib/liteapi/reviews";

export function HotelReviews({ reviews }: { reviews: DisplayReview[] }) {
  if (reviews.length === 0) return null;

  return (
    <section id="reviews" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
      <h2 className="text-lg font-bold text-neutral-900">Opinie gości</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((rev, i) => {
          const meta = [rev.typePl, formatReviewDate(rev.dateIso)].filter(Boolean).join(" · ");
          return (
            <figure key={i} className="flex flex-col rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-100">
              <div className="flex items-center gap-2">
                {rev.score != null && (
                  <span className="shrink-0 rounded-md bg-emerald-700 px-2 py-0.5 text-sm font-bold text-white">
                    {rev.score.toFixed(1)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-neutral-900">{rev.name}</div>
                  {meta && <div className="text-[11px] text-neutral-500">{meta}</div>}
                </div>
              </div>
              <blockquote className="mt-2 text-sm leading-relaxed text-neutral-700">„{rev.text}”</blockquote>
              {!rev.isPolish && (
                <figcaption className="mt-auto pt-2 text-[11px] text-neutral-400">opinia w języku angielskim</figcaption>
              )}
            </figure>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-neutral-400">
        Opinie pochodzą od zweryfikowanych gości u partnera rezerwacyjnego.
      </p>
    </section>
  );
}
