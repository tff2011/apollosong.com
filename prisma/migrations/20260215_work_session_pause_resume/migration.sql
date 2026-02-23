-- Migration: Work session pause/resume support

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'WorkSessionStatus'
      AND e.enumlabel = 'PAUSED'
  ) THEN
    ALTER TYPE "WorkSessionStatus" ADD VALUE 'PAUSED';
  END IF;
END $$;

ALTER TABLE "WorkSession"
  ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totalPausedMs" INTEGER NOT NULL DEFAULT 0;
