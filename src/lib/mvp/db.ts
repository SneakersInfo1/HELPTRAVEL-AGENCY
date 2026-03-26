/* eslint-disable @typescript-eslint/no-explicit-any */
let prismaClientPromise: Promise<any | null> | null = null;

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function getPrisma(): Promise<any | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!prismaClientPromise) {
    prismaClientPromise = (async () => {
      try {
        const prismaPkg = (await import("@prisma/client")) as {
          PrismaClient?: new () => any;
          default?: {
            PrismaClient?: new () => any;
          };
        };
        const PrismaClient = prismaPkg.PrismaClient ?? prismaPkg.default?.PrismaClient;
        if (!PrismaClient) {
          throw new Error("PrismaClient export is unavailable.");
        }
        const globalForPrisma = globalThis as unknown as { prisma?: any };
        if (!globalForPrisma.prisma) {
          globalForPrisma.prisma = new PrismaClient();
        }
        return globalForPrisma.prisma;
      } catch (error) {
        console.warn("Prisma client unavailable. Falling back to in-memory store.", error);
        return null;
      }
    })();
  }

  return prismaClientPromise;
}
