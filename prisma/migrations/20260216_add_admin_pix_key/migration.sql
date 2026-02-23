-- Migration: add PIX key field for admin users
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "pixKey" TEXT;
