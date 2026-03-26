import Image from "next/image";
import Link from "next/link";

import { HeroMedia } from "@/components/mvp/hero-media";
import { curatedDestinations } from "@/lib/mvp/destinations";
import { getDestinationStory, getFeaturedStorySlugs, getVideoHeroSource } from "@/lib/mvp/destination-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";

const modes = [
  {
    title: "Nie wiem dokąd lecieć",
    description:
      "Napisz po swojemu, czego szukasz, a system poda 3-5 najlepszych kierunków z rankingiem, uzasadnieniem i planem.",
    href: "/planner?mode=discovery",
    cta: "Uruchom inteligentne szukanie",
  },
  {
    title: "Mam kierunek",
    description:
      "Wybierz miejsce i parametry, a zobaczysz dopasowane oferty, lokalne atrakcje i estetyczny plan wyjazdu.",
    href: "/planner?mode=standard",
    cta: "Sprawdź wybrany kierunek",
  },
];

const steps = [
  "Opisujesz potrzebę albo konkretny kierunek.",
  "System porządkuje preferencje i liczy ranking opłacalności.",
  "Dostajesz wizualny wynik z kosztem orientacyjnym i lokalnym kontekstem.",
  "Przechodzisz do partnerów i zapisujesz plan podróży.",
];

const proofPoints = [
  { label: "3-5", value: "kierunków w rankingu" },
  { label: "Lokalne", value: "zdjęcia i atrakcje" },
  { label: "PL", value: "cały interfejs i copy" },
];

const featuredSlugs = getFeaturedStorySlugs();

export default async function Home() {
  const featuredDestinations = await Promise.all(
    featuredSlugs.map(async (slug) => {
      const destination = curatedDestinations.find((item) => item.slug === slug);
      if (!destination) return null;
      return { ...destination, media: await resolveDestinationMedia(destination) };
    }),
  );

  const video = getVideoHeroSource();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-emerald-950 text-white shadow-[0_30px_100px_rgba(8,40,24,0.24)] animate-fade-in-up">
        <div className="absolute inset-0">
          <HeroMedia src={video.src} poster={video.poster} alt="Podróżniczy klimat" className="opacity-60" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,11,0.84)_0%,rgba(8,28,16,0.64)_48%,rgba(8,28,16,0.34)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.24),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_24%)]" />
        </div>

        <div className="relative grid gap-8 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-50/90">
              Premium planer podróży
            </span>
            <h1 className="mt-5 text-balance font-display text-5xl leading-[0.95] text-white sm:text-6xl lg:text-7xl">
              Zaplanuj wyjazd, który wygląda i działa jak produkt liderów travel-tech.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-emerald-50/82 sm:text-lg">
              HelpTravel Agency porządkuje kierunki, pokazuje lokalny kontekst, rekomenduje najlepsze opcje i prowadzi
              do partnerów afiliacyjnych. Bez chaosu. Bez generycznych wyników. Po polsku.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/planner?mode=discovery"
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Zacznij planowanie
              </Link>
              <Link
                href="/inspirations/cieple-kraje-bez-wizy-do-2500-zl"
                className="rounded-full border border-white/15 bg-white/6 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/12"
              >
                Zobacz inspiracje
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                "lokalne zdjęcia i klimat miejsca",
                "ranking opłacalności kierunków",
                "zapis planów i afiliacja od startu",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-emerald-50/88"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[22rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/20">
            <div className="absolute inset-0">
              <Image
                src={video.poster}
                alt="Podróżniczy klimat"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,23,17,0.06)_0%,rgba(14,23,17,0.5)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  Klimat premium
                </span>
                <span className="inline-flex rounded-full bg-emerald-400/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  Hero video
                </span>
                <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  Fallback na mobile
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/84">
                Hero video buduje atmosferę podróży, a statyczny poster trzyma lekkość i wydajność na mobile.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3 animate-fade-in-up">
        {proofPoints.map((item) => (
          <article
            key={item.value}
            className="rounded-[1.5rem] border border-emerald-900/10 bg-white/92 p-5 shadow-[0_14px_38px_rgba(16,84,48,0.06)]"
          >
            <p className="text-3xl font-bold text-emerald-950">{item.label}</p>
            <p className="mt-2 text-sm leading-6 text-emerald-900/75">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 animate-fade-in-up">
        {modes.map((mode) => (
          <article
            key={mode.title}
            className="group rounded-[1.75rem] border border-emerald-900/10 bg-white/90 p-6 shadow-[0_16px_46px_rgba(16,84,48,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(16,84,48,0.12)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Tryby planowania</p>
            <h2 className="mt-3 text-3xl font-bold text-emerald-950">{mode.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-emerald-900/78">{mode.description}</p>
            <Link
              href={mode.href}
              className="mt-5 inline-flex rounded-full bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition duration-200 hover:bg-emerald-200"
            >
              {mode.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-6 rounded-[2rem] border border-emerald-900/10 bg-white/92 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)] lg:grid-cols-[0.9fr_1.1fr] animate-fade-in-up">
        <article>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Jak to działa</p>
          <h3 className="mt-3 text-3xl font-bold text-emerald-950">Prosty flow, ale z premium odczuciem.</h3>
          <ol className="mt-5 space-y-3">
            {steps.map((step, index) => (
              <li
                key={step}
                className="rounded-2xl border border-emerald-900/8 bg-emerald-50/70 px-4 py-3 text-sm leading-7 text-emerald-900 transition duration-200 hover:bg-emerald-50"
              >
                <span className="font-semibold text-emerald-800">Krok {index + 1}. </span>
                {step}
              </li>
            ))}
          </ol>
        </article>

        <article className="grid gap-4">
          <div className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.95),rgba(225,243,231,0.88))] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Dlaczego to działa</p>
            <h3 className="mt-2 text-2xl font-bold text-emerald-950">Ranking, wizualna wiarygodność i lokalny kontekst.</h3>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">
              Strona nie wygląda jak prototyp. Mamy dużo powietrza, mocne CTA, zdjęcia, lokalne opisy i wyniki dopasowane
              do kierunku, np. Malagi.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {featuredDestinations.map((destination) => {
              if (!destination) return null;
              const story = getDestinationStory(destination);
              return (
                <Link
                  key={destination.id}
                  href={`/planner?mode=standard&q=${encodeURIComponent(destination.city)}`}
                  className="group overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white shadow-[0_14px_38px_rgba(16,84,48,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(16,84,48,0.14)]"
                >
                  <div className="relative h-40">
                    <Image
                      src={story.heroImage}
                      alt={story.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{story.tagline}</p>
                    <h4 className="mt-2 text-xl font-bold text-emerald-950">{story.name}</h4>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-emerald-900/76">{story.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {story.bestFor.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr] animate-fade-in-up">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/92 p-6 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Inspiracje podróżnicze</p>
          <h3 className="mt-3 text-3xl font-bold text-emerald-950">Gotowe scenariusze, które sprzedają się także w SEO.</h3>
          <div className="mt-5 grid gap-3">
            {[
              "Weekend w Rzymie do 2000 zł",
              "4 dni w Barcelonie z plażą i zwiedzaniem",
              "Ciepłe kraje bez wizy do 2500 zł",
              "Gdzie polecieć zimą tanio z Polski",
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm font-medium text-emerald-950">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_18px_50px_rgba(8,40,24,0.2)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Premium wygląd i odczucie</p>
          <h3 className="mt-3 text-3xl font-bold">Zielony motyw, większa głębia, lepsza hierarchia.</h3>
          <p className="mt-3 text-sm leading-7 text-emerald-50/82">
            Używamy większych sekcji, subtelnych cieni, mocniejszych CTA, eleganckich kart i animacji wejścia. Dzięki
            temu strona wygląda bardziej jak produkt z rynku travel-tech niż zwykły landing.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["video hero", "lokalne zdjęcia", "rekomendacje kierunkowe", "mocne CTA"].map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                {tag}
              </span>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
