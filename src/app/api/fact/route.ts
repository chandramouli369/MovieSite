import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { createDefaultFactService } from "@/lib/fact-service";
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

  const factService = createDefaultFactService(generateFunFact);

  try {
    const result = await factService.getOrGenerateFact({
      userId: user.id,
      movieTitle: user.favoriteMovie,
    });

    if (result.status === "in_progress") {
      return NextResponse.json(
        { error: result.message },
        { status: 409 },
      );
    }

    return NextResponse.json({
      fact: result.fact,
      createdAt: result.createdAt,
      source: result.status,
    });
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
}
