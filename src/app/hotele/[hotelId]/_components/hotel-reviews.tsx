// Sekcja opinii gości (Etap 10 przebudowy, 2026-08-06).
//
// Rozbudowa poprzedniej wersji (42 linie, same cytaty) o rzeczy, które
// dostawca zwraca, a których nie pokazywaliśmy:
//   • ocena ogólna + liczba opinii,
//   • KATEGORIE ocen z paskami (sentiment_analysis.categories),
//   • najczęściej chwalone rzeczy (sentiment_analysis.pros),
//   • treść KRYTYCZNĄ opinii (`cons`) — dotąd pokazywaliśmy same plusy,
//     czyli obraz korzystniejszy niż napisał gość,
//   • konkretną atrybucję źródła zamiast ogólnika.
//
// Czego świadomie NIE robimy: nie tłumaczymy maszynowo treści opinii
// (zmienia wymowę — brief §13) i oznaczamy, co pochodzi od AI dostawcy.

import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";

import { reviewsLabel } from "@/lib/hotels/domain/format";
import { reviewSourceLabel, scoreToPercent } from "@/lib/hotels/domain/review";
import type { ReviewCategory } from "@/lib/hotels/domain/types";
import { ratingLabel } from "@/lib/hotels/rating";
import { formatReviewDate, type DisplayReview } from "@/lib/liteapi/reviews";

interface Props {
  reviews: DisplayReview[];
  /** Kategorie ocen z analizy sentymentu dostawcy (treść generowana przez AI). */
  categories?: ReviewCategory[];
  /** Najczęściej chwalone rzeczy — również podsumowanie AI dostawcy. */
  highlights?: string[];
  /** Miesiąc i rok ostatniej aktualizacji analizy AI — do jawnego oznaczenia. */
  sentimentUpdated?: string | null;
  /** Ocena ogólna obiektu (skala 0–10) i liczba opinii — z /data/hotel. */
  overallScore?: number | null;
  reviewCount?: number | null;
}

function CategoryBar({ category }: { category: ReviewCategory }) {
  const percent = scoreToPercent(category.score);
  // Ocena poza skalą 0–10 znaczy, że nasze założenie o skali jest błędne —
  // wtedy pasek kłamie, więc go nie rysujemy (sama liczba zostaje).
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-neutral-700">{category.label}</span>
        <span className="text-sm font-semibold text-neutral-900">{category.score.toFixed(1)}</span>
      </div>
      {percent !== null && (
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200"
          role="img"
          aria-label={`${category.label}: ${category.score.toFixed(1)} na 10`}
        >
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

export function HotelReviews({
  reviews,
  categories = [],
  highlights = [],
  sentimentUpdated,
  overallScore,
  reviewCount,
}: Props) {
  const hasQuotes = reviews.length > 0;
  const hasSummary = categories.length > 0 || highlights.length > 0;
  // Nic realnego do pokazania → sekcja się nie renderuje. Zero pustych ramek.
  if (!hasQuotes && !hasSummary) return null;

  const sources = reviewSourceLabel(reviews.map((r) => r.source));

  return (
    <section id="reviews" className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-neutral-900">Opinie gości</h2>
        {typeof overallScore === "number" && overallScore > 0 && (
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-700 px-2 py-1 text-sm font-bold text-white">
              {overallScore.toFixed(1)}
            </span>
            <div className="text-sm">
              <span className="font-semibold text-neutral-900">{ratingLabel(overallScore)}</span>
              {typeof reviewCount === "number" && reviewCount > 0 && (
                <span className="ml-1.5 text-neutral-500">{reviewsLabel(reviewCount)}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <CategoryBar key={c.label} category={c} />
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-neutral-800">Co goście chwalą najczęściej</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {highlights.map((h) => (
              <li
                key={h}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900"
              >
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasSummary && (
        // Oznaczenie treści AI jest WYMAGANE (brief §11.5) — to podsumowanie
        // modelu dostawcy, nie cytat gościa.
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-neutral-500">
          <Sparkles aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Powyższe oceny kategorii i podsumowanie zalet przygotowała sztuczna inteligencja naszego
            partnera na podstawie opinii gości
            {sentimentUpdated ? ` (aktualizacja: ${sentimentUpdated})` : ""}.
          </span>
        </p>
      )}

      {hasQuotes && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    {meta && <div className="text-[11px] text-neutral-600">{meta}</div>}
                  </div>
                </div>

                <blockquote className="mt-2 flex gap-1.5 text-sm leading-relaxed text-neutral-700">
                  <ThumbsUp aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>„{rev.text}”</span>
                </blockquote>

                {/* Krytyka gościa. Pokazujemy ją świadomie: bez niej dawaliśmy
                    obraz korzystniejszy, niż napisał autor opinii. */}
                {rev.cons && (
                  <div className="mt-2 flex gap-1.5 text-sm leading-relaxed text-neutral-600">
                    <ThumbsDown aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span>„{rev.cons}”</span>
                  </div>
                )}

                {!rev.isPolish && (
                  <figcaption className="mt-auto pt-2 text-[11px] text-neutral-500">
                    opinia w języku angielskim — nie tłumaczymy jej maszynowo
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] text-neutral-500">
        {sources
          ? `Opinie pochodzą od zweryfikowanych gości (${sources}) za pośrednictwem naszego partnera rezerwacyjnego.`
          : "Opinie pochodzą od zweryfikowanych gości u partnera rezerwacyjnego."}
      </p>
    </section>
  );
}
