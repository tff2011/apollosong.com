-- Migration: add Kie task tracking and karaoke playback fields to SongOrder

ALTER TABLE "SongOrder"
  ADD COLUMN IF NOT EXISTS "kieTaskId" TEXT,
  ADD COLUMN IF NOT EXISTS "kieAudioId1" TEXT,
  ADD COLUMN IF NOT EXISTS "kieAudioId2" TEXT,
  ADD COLUMN IF NOT EXISTS "hasKaraokePlayback" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "karaokeFileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "karaokeFileKey" TEXT,
  ADD COLUMN IF NOT EXISTS "karaokeStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "karaokeError" TEXT,
  ADD COLUMN IF NOT EXISTS "karaokeGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "karaokeKieTaskId" TEXT;
