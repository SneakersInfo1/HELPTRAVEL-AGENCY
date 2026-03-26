import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { curatedDestinations } from "@/lib/mvp/destinations";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { getSeoPageBySlug, seoInspirationPages } from "@/lib/mvp/seo-pages";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";

interface InspirationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return seoInspirationPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: InspirationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoPageBySlug(slug);
  if (!page) {
    return { title: "Inspiracje podrozy", description: "Planowanie city breakow i ranking kierunkow." };
  }
  return { title: `${page.title} | HelpTravel Agency`, description: page.description };
}

export default async function InspirationPage({ params }: InspirationPageProps) {
  const { slug } = await params;
  const page = getSeoPageBySlug(slug);
  if (!page) notFound();
  const destination = page.destinationSlug ? curatedDestinations.find((item) => item.slug === page.destinationSlug) : null;
  const destinationWithMedia = destination ? { ...destination, media: await resolveDestinationMedia(destination) } : null;
  const story = destinationWithMedia ? getDestinationStory(destinationWithMedia) : null;
  const heroImage =
    story?.heroImage ??
    (page.destinationSlug ? `https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1600&q=82` : `https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1600&q=82`);
  const gallery = story?.gallery ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_20px_60px_rgba(16,84,48,0.08)]">
        <div className="relative h-72 sm:h-[30rem]">
          <Image src={heroImage} alt={page.title} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,10,0.08)_0%,rgba(6,16,10,0.7)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Inspiracja SEO</p>
            <h1 className="mt-2 text-4xl font-bold">{page.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/84">{page.hero}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <h2 className="text-xl font-bold text-emerald-950">Co dostajesz w plannerze</h2>
          <ul className="mt-4 space-y-2 text-sm text-emerald-900/85">
            {page.bullets.map((bullet) => (
              <li key={bullet} className="rounded-2xl bg-emerald-50/70 px-4 py-3">• {bullet}</li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.95),rgba(225,243,231,0.9))] p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Scenariusz</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">Przefiltruj kierunek, zobacz ranking i przejdź do partnerów.</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-900/80">
            To jest dokładnie ten typ strony, który może zbierać ruch SEO i prowadzić użytkownika dalej do planera.
          </p>
          <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900">
            Przykladowe zapytanie: <span className="font-semibold">{page.sampleQuery}</span>
          </p>
          <div className="mt-4">
            <Link
              href={`/planner?mode=discovery&q=${encodeURIComponent(page.sampleQuery)}`}
              className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
            >
              Uruchom planner na tym scenariuszu
            </Link>
          </div>
        </article>
      </section>

      {gallery.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-3">
          {gallery.slice(0, 3).map((imageUrl, index) => (
            <article key={imageUrl} className="overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
              <div className="relative h-56">
                <Image src={imageUrl} alt={`${page.title} zdjęcie ${index + 1}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
