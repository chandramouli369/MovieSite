export const CACHE_WINDOW_MS = 60_000;
const LOCK_STALE_AFTER_MS = 45_000;
const IN_PROGRESS_WAIT_MS = 5_000;
const IN_PROGRESS_POLL_MS = 250;

type FactSnapshot = {
  factText: string;
  createdAt: Date;
};

export type FactResult =
  | { status: "cached"; fact: string; createdAt: string }
  | { status: "generated"; fact: string; createdAt: string }
  | { status: "stale_fallback"; fact: string; createdAt: string }
  | { status: "in_progress"; message: string };

type Services = {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  generate: (movieTitle: string) => Promise<string>;
};

export type FactRepository = {
  findLatestFact: (params: { userId: string; movieTitle: string }) => Promise<FactSnapshot | null>;
  createFact: (params: { userId: string; movieTitle: string; factText: string }) => Promise<FactSnapshot>;
  tryAcquireLock: (params: { userId: string; movieTitle: string; now: Date }) => Promise<boolean>;
  releaseLock: (params: { userId: string; movieTitle: string }) => Promise<void>;
};

const defaultRepo: FactRepository = {
  async findLatestFact({ userId, movieTitle }) {
    const { prisma } = await import("./prisma");
    return prisma.fact.findFirst({
      where: { userId, movieTitle },
      orderBy: { createdAt: "desc" },
      select: { factText: true, createdAt: true },
    });
  },
  async createFact({ userId, movieTitle, factText }) {
    const { prisma } = await import("./prisma");
    return prisma.fact.create({
      data: { userId, movieTitle, factText },
      select: { factText: true, createdAt: true },
    });
  },
  async tryAcquireLock({ userId, movieTitle, now }) {
    const { prisma } = await import("./prisma");
    try {
      await prisma.factGenerationLock.create({
        data: { userId, movieTitle, lockedAt: now },
      });
      return true;
    } catch {
      // Another request likely owns the lock. If stale, clear and retry once.
      const existingLock = await prisma.factGenerationLock.findUnique({
        where: { userId_movieTitle: { userId, movieTitle } },
        select: { lockedAt: true },
      });
      if (!existingLock) return false;

      if (now.getTime() - existingLock.lockedAt.getTime() > LOCK_STALE_AFTER_MS) {
        await prisma.factGenerationLock.deleteMany({
          where: { userId, movieTitle, lockedAt: existingLock.lockedAt },
        });
        try {
          await prisma.factGenerationLock.create({
            data: { userId, movieTitle, lockedAt: now },
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  },
  async releaseLock({ userId, movieTitle }) {
    const { prisma } = await import("./prisma");
    await prisma.factGenerationLock.deleteMany({ where: { userId, movieTitle } });
  },
};

function isFreshFact(fact: FactSnapshot | null, now: Date): fact is FactSnapshot {
  if (!fact) return false;
  return now.getTime() - fact.createdAt.getTime() < CACHE_WINDOW_MS;
}

function toFactPayload(status: Exclude<FactResult["status"], "in_progress">, fact: FactSnapshot): FactResult {
  return {
    status,
    fact: fact.factText,
    createdAt: fact.createdAt.toISOString(),
  };
}

export function createFactService(
  repo: FactRepository,
  services: Services,
) {
  return {
    async getOrGenerateFact(params: {
      userId: string;
      movieTitle: string;
    }): Promise<FactResult> {
      const { userId, movieTitle } = params;
      const now = services.now();

      const latest = await repo.findLatestFact({ userId, movieTitle });
      if (isFreshFact(latest, now)) {
        return toFactPayload("cached", latest);
      }

      const lockAcquired = await repo.tryAcquireLock({ userId, movieTitle, now });
      if (!lockAcquired) {
        const waitUntil = services.now().getTime() + IN_PROGRESS_WAIT_MS;

        while (services.now().getTime() < waitUntil) {
          await services.sleep(IN_PROGRESS_POLL_MS);
          const winnerFact = await repo.findLatestFact({ userId, movieTitle });
          if (isFreshFact(winnerFact, services.now())) {
            return toFactPayload("cached", winnerFact);
          }
        }
        return {
          status: "in_progress",
          message: "Fact generation is in progress. Please retry in a moment.",
        };
      }

      try {
        const secondCheck = await repo.findLatestFact({ userId, movieTitle });
        if (isFreshFact(secondCheck, services.now())) {
          return toFactPayload("cached", secondCheck);
        }

        let generatedText: string;
        try {
          generatedText = await services.generate(movieTitle);
        } catch {
          const fallback = await repo.findLatestFact({ userId, movieTitle });
          if (fallback) {
            return toFactPayload("stale_fallback", fallback);
          }
          throw new Error("Fact generation failed and no cached fact exists.");
        }

        const created = await repo.createFact({
          userId,
          movieTitle,
          factText: generatedText,
        });
        return toFactPayload("generated", created);
      } finally {
        await repo.releaseLock({ userId, movieTitle });
      }
    },
  };
}

export function createDefaultFactService(generate: (movieTitle: string) => Promise<string>) {
  return createFactService(defaultRepo, {
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    generate,
  });
}

