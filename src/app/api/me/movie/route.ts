import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { favoriteMovieSchema } from "@/lib/validation";

const bodySchema = z.object({
  favoriteMovie: favoriteMovieSchema,
});

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;
  const name = session.user.name ?? null;
  const image = session.user.image ?? null;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Invalid favorite movie.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { favoriteMovie } = parsed.data;

  const user = await prisma.appUser.upsert({
    where: { email },
    update: { favoriteMovie, name, image },
    create: { email, name, image, favoriteMovie },
  });

  return NextResponse.json({
    id: user.id,
    favoriteMovie: user.favoriteMovie,
  });
}

