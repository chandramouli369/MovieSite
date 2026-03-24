import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;
  const name = session.user.name ?? null;
  const image = session.user.image ?? null;

  try {
    const user = await prisma.appUser.upsert({
      where: { email },
      update: { name, image },
      create: { email, name, image },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      favoriteMovie: user.favoriteMovie,
    });
  } catch (err) {
    console.error("GET /api/me database error:", err);
    return NextResponse.json(
      {
        error:
          "Database unavailable. Start Postgres, set DATABASE_URL in .env, then run: npx prisma migrate dev",
      },
      { status: 503 },
    );
  }
}

