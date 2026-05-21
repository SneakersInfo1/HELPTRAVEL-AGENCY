/* eslint-disable @typescript-eslint/no-explicit-any */
let prismaClientPromise: Promise<any | null> | null = null;

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

// Detects DATABASE_URL values that are placeholders rather than real
// connection strings. Phase 4 swaps in a real provisioned URL; until then
// we silently route every Prisma call to the in-memory fallback.
function isPlaceholderUrl(raw: string | undefined): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;
  // Common placeholder patterns we have used in .env.local templates.
  const placeholders = [/REPLACE_ME/i, /YOUR_/i, /<.+>/, /placeholder/i];
  if (placeholders.some((re) => re.test(trimmed))) return true;
  // Anything that doesn't start with a known DB scheme is treated as not-yet-real.
  if (!/^(postgres(ql)?|mysql|sqlite|mongodb|sqlserver):\/\//i.test(trimmed)) return true;
  return false;
}

let lastWarn = 0;
function warnFallbackOncePerMinute(reason: string): void {
  const now = Date.now();
  if (now - lastWarn < 60_000) return;
  lastWarn = now;
  console.warn(`[db] Prisma unavailable — using in-memory store. ${reason}`);
}

export async function getPrisma(): Promise<any | null> {
  if (isPlaceholderUrl(process.env.DATABASE_URL)) {
    warnFallbackOncePerMinute(
      process.env.DATABASE_URL
        ? "DATABASE_URL is a placeholder. Real connection wired in Phase 4."
        : "DATABASE_URL not set. Real connection wired in Phase 4.",
    );
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
        warnFallbackOncePerMinute(`Prisma client init failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    })();
  }

  return prismaClientPromise;
}

/**
 * Run a Prisma operation with an automatic in-memory fallback when:
 *   • DATABASE_URL is a placeholder (Phase 4 not yet wired), OR
 *   • Prisma init throws (PrismaClientInitializationError, etc.), OR
 *   • the operation itself throws because the DB is unreachable.
 *
 * Logs warnings at most once per minute so the console doesn't get spammed.
 *
 * Usage:
 *   const sessions = await withPrismaFallback(
 *     async (prisma) => prisma.anonymousSession.findMany(),
 *     [],
 *   );
 */
export async function withPrismaFallback<T>(
  fn: (prisma: any) => Promise<T>,
  fallback: T,
  context = "operation",
): Promise<T> {
  const prisma = await getPrisma();
  if (!prisma) return fallback;
  try {
    return await fn(prisma);
  } catch (error) {
    const isInitError =
      error instanceof Error &&
      (/PrismaClientInitializationError/.test(error.constructor?.name ?? "") ||
        /Can't reach database server/i.test(error.message) ||
        /authentication failed/i.test(error.message));
    if (isInitError) {
      warnFallbackOncePerMinute(`${context} failed; using fallback. ${error.message.split("\n")[0]}`);
      return fallback;
    }
    throw error;
  }
}
