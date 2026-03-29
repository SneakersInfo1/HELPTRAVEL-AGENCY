import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Podglad logo",
  robots: {
    index: false,
    follow: false,
  },
};

const logos = [1, 2, 3, 4, 5];

export default function LogoPreviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">HelpTravel branding</p>
        <h1 className="mt-3 font-display text-4xl text-emerald-950">Wybierz logo (1-5)</h1>
        <p className="mt-3 text-sm text-emerald-900/78">Otworz te strone i napisz mi numer, ktory wybierasz. Od razu podmienie favicon i logo.</p>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {logos.map((num) => (
          <article
            key={num}
            className="rounded-[1.6rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_14px_38px_rgba(16,84,48,0.06)]"
          >
            <p className="text-sm font-semibold text-emerald-950">Logo {num}</p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-900/10">
              <Image
                src={`/branding/logo-option-${num}.png`}
                alt={`Logo opcja ${num}`}
                width={512}
                height={512}
                className="h-auto w-full"
              />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
