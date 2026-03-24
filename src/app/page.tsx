"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    (async () => {
      setMeError(null);
      setResolving(true);
      try {
        const res = await fetch("/api/me", { credentials: "same-origin" });
        if (cancelled) return;

        if (!res.ok) {
          let message = `Could not load your profile (HTTP ${res.status}).`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {
            /* non-JSON error page */
          }
          if (res.status === 401) {
            message = "Your session is not valid here. Try signing in again.";
          }
          setMeError(message);
          return;
        }

        const data = (await res.json()) as { favoriteMovie?: string | null };
        if (cancelled) return;
        const movie = data.favoriteMovie?.trim();
        router.replace(movie ? "/dashboard" : "/onboarding");
      } catch {
        if (!cancelled) {
          setMeError(
            "Could not reach /api/me. Check that the dev server is running.",
          );
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router, retryTick]);

  if (status === "loading" || (status === "authenticated" && resolving)) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (status === "authenticated" && meError) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-red-700" role="alert">
            {meError}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            After Google sign-in we load your row from Postgres. If the database
            is not running or <code className="rounded bg-zinc-100 px-1">DATABASE_URL</code>{" "}
            in <code className="rounded bg-zinc-100 px-1">.env</code> is wrong,
            this step fails. From the project folder run:{" "}
            <code className="rounded bg-zinc-100 px-1">npx prisma migrate dev</code>
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setRetryTick((t) => t + 1)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-zinc-600">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Movie Memory
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Sign in once, tell us your favorite film, and we will pull a quick fun
          fact from OpenAI.
        </p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="mt-8 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Sign in with Google
        </button>
      </main>
    </div>
  );
}
