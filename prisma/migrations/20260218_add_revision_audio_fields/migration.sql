-- Migration: store customer revision voice note metadata on SongOrder

ALTER TABLE "SongOrder"
  ADD COLUMN IF NOT EXISTS "revisionAudioUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "revisionAudioKey" TEXT;
