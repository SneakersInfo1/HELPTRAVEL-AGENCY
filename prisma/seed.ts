import { curatedDestinations } from "../src/lib/mvp/destinations";

interface PrismaDestinationDelegate {
  upsert(args: unknown): Promise<unknown>;
}

interface PrismaClientLike {
  destination: PrismaDestinationDelegate;
  $disconnect(): Promise<void>;
}

async function getPrismaClient(): Promise<PrismaClientLike> {
  const prismaPkg = (await import("@prisma/client")) as {
    PrismaClient?: new () => PrismaClientLike;
  };

  if (!prismaPkg.PrismaClient) {
    throw new Error("PrismaClient is unavailable. Run `pnpm db:generate` first.");
  }

  return new prismaPkg.PrismaClient();
}

async function main() {
  const prisma = await getPrismaClient();

  for (const destination of curatedDestinations) {
    await prisma.destination.upsert({
      where: { id: destination.id },
      update: {
        slug: destination.slug,
        city: destination.city,
        country: destination.country,
        visaForPL: destination.visaForPL,
        avgTempByMonthJson: destination.avgTempByMonth,
        costIndex: destination.costIndex,
        beachScore: destination.beachScore,
        cityScore: destination.cityScore,
        sightseeingScore: destination.sightseeingScore,
        nightlifeScore: destination.nightlifeScore,
        natureScore: destination.natureScore,
        safetyScore: destination.safetyScore,
        accessScore: destination.accessScore,
        typicalFlightHoursFromPL: destination.typicalFlightHoursFromPL,
        affiliateLinksJson: destination.affiliateLinks,
      },
      create: {
        id: destination.id,
        slug: destination.slug,
        city: destination.city,
        country: destination.country,
        visaForPL: destination.visaForPL,
        avgTempByMonthJson: destination.avgTempByMonth,
        costIndex: destination.costIndex,
        beachScore: destination.beachScore,
        cityScore: destination.cityScore,
        sightseeingScore: destination.sightseeingScore,
        nightlifeScore: destination.nightlifeScore,
        natureScore: destination.natureScore,
        safetyScore: destination.safetyScore,
        accessScore: destination.accessScore,
        typicalFlightHoursFromPL: destination.typicalFlightHoursFromPL,
        affiliateLinksJson: destination.affiliateLinks,
      },
    });
  }

  console.log(`Seeded destinations: ${curatedDestinations.length}`);
  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
