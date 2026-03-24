"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function OnboardingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    (async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data: { favoriteMovie?: string | null } = await res.json();
        if (cancelled) return;
        if (data.favoriteMovie?.trim()) {
          router.replace("/dashboard");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/movie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteMovie: title }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save your movie.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || checking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-zinc-900">
          Welcome — one quick step
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          What is your favorite movie? We trim spaces and validate length on the
          server before saving.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-left text-sm font-medium text-zinc-800">
            Favorite movie
            <input
              type="text"
              name="favoriteMovie"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
              placeholder="e.g. The Apartment"
              disabled={submitting}
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Continue"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-500">
          <button
            type="button"
            className="font-medium text-zinc-800 underline-offset-2 hover:underline"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </button>
        </p>
      </main>
    </div>
  );
}
