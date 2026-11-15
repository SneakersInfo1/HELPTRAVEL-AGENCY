import type { ClimateFactSource } from "@/lib/seo/destination-facts";

export function ClimateSourceLine({
  source,
  className = "text-xs leading-6 text-ink-muted",
}: {
  source: ClimateFactSource;
  className?: string;
}) {
  return (
    <p className={className}>
      Źródło:{" "}
      <a
        href={source.url}
        target="_blank"
        rel="noopener nofollow"
        className="font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand"
      >
        <span className="text-brand">{source.name}</span>
      </a>
      ; dane: {source.provider}, stacja {source.station}, {source.periodLabel}
    </p>
  );
}
