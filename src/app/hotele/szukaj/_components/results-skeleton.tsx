function SkeletonCard() {
  return (
    <article className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)]">
      <div className="aspect-[4/3] animate-pulse bg-neutral-200" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-3/4 animate-pulse rounded bg-neutral-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
        <div className="h-7 w-32 animate-pulse rounded-full bg-amber-100" />
        <div className="flex items-end justify-between gap-3 pt-4">
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-200" />
            <div className="h-7 w-28 animate-pulse rounded bg-emerald-100" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-lg bg-emerald-100" />
        </div>
      </div>
    </article>
  );
}

export function ResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
