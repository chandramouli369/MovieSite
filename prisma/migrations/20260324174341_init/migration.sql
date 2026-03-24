-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "favoriteMovie" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieTitle" VARCHAR(200) NOT NULL,
    "factText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "Fact_userId_createdAt_idx" ON "Fact"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Fact_userId_movieTitle_createdAt_idx" ON "Fact"("userId", "movieTitle", "createdAt");

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
