"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type MeResponse = {
  name: string | null;
  email: string;
  image: string | null;
  favoriteMovie: string | null;
};

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fact, setFact] = useState<string | null>(null);
  const [factError, setFactError] = useState<string | null>(null);
  const [factLoading, setFactLoading] = useState(false);

  const loadMe = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/me");
    if (res.status === 401) {
      router.replace("/");
      return;
    }
    if (!res.ok) {
      setLoadError("Could not load your profile.");
      return;
    }
    const data = (await res.json()) as MeResponse;
    setMe(data);
    if (!data.favoriteMovie?.trim()) {
      router.replace("/onboarding");
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }
    if (status === "authenticated") {
      void loadMe();
    }
  }, [status, router, loadMe]);

  async function requestFact() {
    setFact(null);
    setFactError(null);
    setFactLoading(true);
    try {
      const res = await fetch("/api/fact");
      const body = (await res.json().catch(() => ({}))) as {
        fact?: string;
        error?: string;
      };
      if (!res.ok) {
        setFactError(body.error ?? "Something went wrong.");
        return;
      }
      if (body.fact) setFact(body.fact);
    } finally {
      setFactLoading(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && !me && !loadError)) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (loadError || !me) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6">
        <p className="text-sm text-red-600">{loadError ?? "Unknown error."}</p>
        <button
          type="button"
          onClick={() => void loadMe()}
          className="mt-4 text-sm font-medium text-zinc-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const displayName =
    me.name?.trim() || me.email.split("@")[0] || "there";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {me.image ? (
            <img
              src={me.image}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-700"
              aria-hidden
            >
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Hi, {displayName}
            </h1>
            <p className="text-sm text-zinc-600">{me.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
        >
          Log out
        </button>
      </header>

      <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-zinc-500">Favorite movie</h2>
        <p className="mt-1 text-base text-zinc-900">{me.favoriteMovie}</p>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-500">Fun fact</h2>
          <button
            type="button"
            onClick={() => void requestFact()}
            disabled={factLoading}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {factLoading ? "Generating…" : "Get a fun fact"}
          </button>
        </div>
        {factError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {factError}
          </p>
        ) : null}
        {fact ? (
          <p className="mt-3 text-sm leading-relaxed text-zinc-800">{fact}</p>
        ) : !factError ? (
          <p className="mt-3 text-sm text-zinc-500">
            Each request asks OpenAI for a new fact and stores it in Postgres.
          </p>
        ) : null}
      </section>
    </div>
  );
}
