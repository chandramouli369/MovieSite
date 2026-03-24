import { describe, expect, it, vi } from "vitest";

import { CACHE_WINDOW_MS, createFactService, type FactRepository } from "./fact-service";

type MemoryFact = {
  userId: string;
  movieTitle: string;
  factText: string;
  createdAt: Date;
};

function createMemoryRepo(seedFacts: MemoryFact[] = []): FactRepository {
  const facts = [...seedFacts];
  const locks = new Map<string, Date>();

  const lockKey = (userId: string, movieTitle: string) => `${userId}::${movieTitle}`;

  return {
    async findLatestFact({ userId, movieTitle }) {
      const rows = facts
        .filter((f) => f.userId === userId && f.movieTitle === movieTitle)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (!rows[0]) return null;
      return {
        factText: rows[0].factText,
        createdAt: rows[0].createdAt,
      };
    },
    async createFact({ userId, movieTitle, factText }) {
      const created = {
        userId,
        movieTitle,
        factText,
        createdAt: new Date(),
      };
      facts.push(created);
      return {
        factText: created.factText,
        createdAt: created.createdAt,
      };
    },
    async tryAcquireLock({ userId, movieTitle }) {
      const key = lockKey(userId, movieTitle);
      if (locks.has(key)) return false;
      locks.set(key, new Date());
      return true;
    },
    async releaseLock({ userId, movieTitle }) {
      locks.delete(lockKey(userId, movieTitle));
    },
  };
}

describe("fact service (Variant A)", () => {
  it("returns cached fact when latest is under 60 seconds old", async () => {
    const now = new Date("2026-03-24T18:00:00.000Z");
    const repo = createMemoryRepo([
      {
        userId: "u1",
        movieTitle: "Interstellar",
        factText: "Cached fact",
        createdAt: new Date(now.getTime() - 10_000),
      },
    ]);
    const generate = vi.fn(async () => "Should not be called");
    const service = createFactService(repo, {
      now: () => now,
      sleep: async () => {},
      generate,
    });

    const result = await service.getOrGenerateFact({
      userId: "u1",
      movieTitle: "Interstellar",
    });

    expect(result.status).toBe("cached");
    expect("fact" in result && result.fact).toBe("Cached fact");
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not leak facts across users (authorization boundary)", async () => {
    const now = new Date("2026-03-24T18:00:00.000Z");
    const repo = createMemoryRepo([
      {
        userId: "u2",
        movieTitle: "Interstellar",
        factText: "Other user's newer fact",
        createdAt: new Date(now.getTime() - 3_000),
      },
      {
        userId: "u1",
        movieTitle: "Interstellar",
        factText: "Requesting user's own cached fact",
        createdAt: new Date(now.getTime() - 5_000),
      },
    ]);
    const generate = vi.fn(async () => "Should not be called");
    const service = createFactService(repo, {
      now: () => now,
      sleep: async () => {},
      generate,
    });

    const result = await service.getOrGenerateFact({
      userId: "u1",
      movieTitle: "Interstellar",
    });

    expect(result.status).toBe("cached");
    expect("fact" in result && result.fact).toBe(
      "Requesting user's own cached fact",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns most recent fallback fact when generation fails", async () => {
    const now = new Date("2026-03-24T18:00:00.000Z");
    const repo = createMemoryRepo([
      {
        userId: "u1",
        movieTitle: "Interstellar",
        factText: "Old fallback fact",
        createdAt: new Date(now.getTime() - CACHE_WINDOW_MS - 5_000),
      },
    ]);
    const generate = vi.fn(async () => {
      throw new Error("OpenAI timeout");
    });
    const service = createFactService(repo, {
      now: () => now,
      sleep: async () => {},
      generate,
    });

    const result = await service.getOrGenerateFact({
      userId: "u1",
      movieTitle: "Interstellar",
    });

    expect(result.status).toBe("stale_fallback");
    expect("fact" in result && result.fact).toBe("Old fallback fact");
  });
});

