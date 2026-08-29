-- Tutor access is scoped per direction. Admins may still manage every direction.
CREATE TABLE "UserDirection" (
    "userId" TEXT NOT NULL,
    "directionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDirection_pkey" PRIMARY KEY ("userId","directionId")
);

CREATE INDEX "UserDirection_directionId_idx" ON "UserDirection"("directionId");

ALTER TABLE "UserDirection" ADD CONSTRAINT "UserDirection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDirection" ADD CONSTRAINT "UserDirection_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
