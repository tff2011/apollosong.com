-- Migration: Multi-user admin permissions + employee time clock
-- Safe migration with IF NOT EXISTS guards.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'adminrole'
  ) THEN
    CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'STAFF');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'adminpermission'
  ) THEN
    CREATE TYPE "AdminPermission" AS ENUM (
      'LEADS',
      'STATS',
      'CONVERSION',
      'TICKETS',
      'WHATSAPP',
      'BOUNCES',
      'KNOWLEDGE',
      'PRONUNCIATION',
      'GENRE_PROMPTS',
      'AUDIO_SAMPLES',
      'SUNO_EMAILS',
      'CONTENT_CALENDAR'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'worksessionstatus'
  ) THEN
    CREATE TYPE "WorkSessionStatus" AS ENUM ('PENDING_START', 'DECLINED', 'OPEN', 'CLOSED');
  END IF;
END
$$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "adminUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "adminPasswordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "adminRole" "AdminRole" NOT NULL DEFAULT 'STAFF',
  ADD COLUMN IF NOT EXISTS "adminPermissions" "AdminPermission"[] NOT NULL DEFAULT ARRAY[]::"AdminPermission"[],
  ADD COLUMN IF NOT EXISTS "adminEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "User_adminUsername_key" ON "User"("adminUsername");

CREATE TABLE IF NOT EXISTS "WorkSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "firstLoginAt" TIMESTAMP(3) NOT NULL,
  "promptAnsweredAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "status" "WorkSessionStatus" NOT NULL DEFAULT 'PENDING_START',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkSession_userId_dayKey_key" ON "WorkSession"("userId", "dayKey");
CREATE INDEX IF NOT EXISTS "WorkSession_dayKey_idx" ON "WorkSession"("dayKey");
CREATE INDEX IF NOT EXISTS "WorkSession_userId_startedAt_idx" ON "WorkSession"("userId", "startedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkSession_userId_fkey'
  ) THEN
    ALTER TABLE "WorkSession"
      ADD CONSTRAINT "WorkSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;
