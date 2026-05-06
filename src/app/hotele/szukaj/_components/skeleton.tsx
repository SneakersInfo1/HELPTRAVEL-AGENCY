// Skeleton card for streaming SSR while real results render.
// No spinners per master spec §5.2.

export function ResultSkeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white sm:flex-row">
      <div className="aspect-[4/3] w-full shrink-0 bg-neutral-200 sm:aspect-[1/1] sm:w-64" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="h-5 w-3/4 rounded bg-neutral-200" />
        <div className="h-3 w-1/3 rounded bg-neutral-200" />
        <div className="h-3 w-1/2 rounded bg-neutral-200" />
        <div className="mt-auto flex items-end justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-neutral-200" />
            <div className="h-6 w-28 rounded bg-neutral-200" />
          </div>
          <div className="h-10 w-32 rounded-lg bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}

export function ResultSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <ResultSkeleton key={i} />
      ))}
    </div>
  );
}
