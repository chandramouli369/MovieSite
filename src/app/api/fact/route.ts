import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { generateFunFact } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.appUser.findUnique({
    where: { email: session.user.email },
  });

  if (!user?.favoriteMovie) {
    return NextResponse.json(
      { error: "Add a favorite movie before requesting a fact." },
      { status: 400 },
    );
  }

  let factText: string;
  try {
    factText = await generateFunFact(user.favoriteMovie);
  } catch (err) {
    console.error("OpenAI fact generation failed:", err);

    const status =
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : undefined;
    const message = err instanceof Error ? err.message : String(err);

    if (status === 401) {
      return NextResponse.json(
        {
          error:
            "OpenAI rejected the API key (401). Check OPENAI_API_KEY in .env and restart the dev server.",
        },
        { status: 502 },
      );
    }
    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "OpenAI rate limit or quota reached (429). Add billing / credits in platform.openai.com → Billing, then try again.",
        },
        { status: 502 },
      );
    }

    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: isDev
          ? `OpenAI error: ${message}`
          : "We could not reach the AI service. Check OPENAI_API_KEY and try again.",
      },
      { status: 502 },
    );
  }

  if (!factText) {
    return NextResponse.json(
      { error: "The AI returned an empty fact. Please try again." },
      { status: 502 },
    );
  }

  const fact = await prisma.fact.create({
    data: {
      userId: user.id,
      movieTitle: user.favoriteMovie,
      factText,
    },
  });

  return NextResponse.json({
    fact: fact.factText,
    createdAt: fact.createdAt.toISOString(),
  });
}
