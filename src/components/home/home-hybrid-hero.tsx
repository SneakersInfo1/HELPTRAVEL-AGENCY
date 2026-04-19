import { DestinationTile } from "./destination-tile";
import { MiniPlannerForm } from "./mini-planner-form";
import type { DestinationProfile } from "@/lib/mvp/types";

interface FeaturedTile {
  destination: DestinationProfile;
  heroImage: string;
}

interface HomeHybridHeroProps {
  featured: FeaturedTile[];
  // Lista wszystkich destynacji (city + country) do autocomplete w mini-plannerze.
  // Maksymalnie kilka KB JSON w bundlu — akceptowalne, bo poprawia UX.
  destinationOptions: Array<Pick<DestinationProfile, "city" | "country">>;
}

export function HomeHybridHero({ featured, destinationOptions }: HomeHybridHeroProps) {
  return (
    <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.95),rgba(225,243,231,0.85))] p-5 shadow-[0_18px_56px_rgba(16,84,48,0.08)] sm:p-7">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          HelpTravel
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] text-emerald-950 sm:text-5xl">
          Wyjazd, ktory zaplanujesz w 3 minuty.
        </h1>
        <p className="mt-3 text-sm leading-7 text-emerald-900/78 sm:text-base">
          Wybierz kierunek, my pokazujemy najlepszy termin, noclegi i loty z Polski w jednym miejscu.
        </p>
      </div>
      <div className="mt-5">
        <MiniPlannerForm destinationOptions={destinationOptions} />
      </div>
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Albo wybierz gotowy pomysl
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {featured.map((tile) => (
            <DestinationTile
              key={tile.destination.slug}
              destination={tile.destination}
              heroImage={tile.heroImage}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
