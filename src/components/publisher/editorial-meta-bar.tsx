interface EditorialMetaBarProps {
  eyebrow: string;
  title: string;
  items: string[];
}

export function EditorialMetaBar({ eyebrow, title, items }: EditorialMetaBarProps) {
  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.96),rgba(226,244,232,0.9))] p-4 shadow-[0_14px_36px_rgba(16,84,48,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-emerald-950">{title}</h2>
        <span className="text-xs text-emerald-900/52">aktualizacja: marzec 2026</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-emerald-900/10 bg-white/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
