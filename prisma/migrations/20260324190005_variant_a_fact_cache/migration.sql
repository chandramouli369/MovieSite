-- CreateTable
CREATE TABLE "FactGenerationLock" (
    "userId" TEXT NOT NULL,
    "movieTitle" VARCHAR(200) NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactGenerationLock_pkey" PRIMARY KEY ("userId","movieTitle")
);

-- CreateIndex
CREATE INDEX "FactGenerationLock_lockedAt_idx" ON "FactGenerationLock"("lockedAt");

-- AddForeignKey
ALTER TABLE "FactGenerationLock" ADD CONSTRAINT "FactGenerationLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
