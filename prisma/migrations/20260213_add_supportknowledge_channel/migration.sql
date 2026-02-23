-- Migration: Add channel scoped knowledge entries to support knowledge
-- This is safe (no destructive operations) and preserves existing data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'supportknowledgechannel'
  ) THEN
    CREATE TYPE "SupportKnowledgeChannel" AS ENUM ('BOTH', 'EMAIL', 'WHATSAPP');
  END IF;
END
$$;

ALTER TABLE "SupportKnowledge"
  ADD COLUMN IF NOT EXISTS "channel" "SupportKnowledgeChannel" NOT NULL DEFAULT 'BOTH';
