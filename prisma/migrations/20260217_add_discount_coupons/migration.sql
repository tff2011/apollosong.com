-- Migration: checkout discount coupons + admin toggle for coupon field

CREATE TABLE IF NOT EXISTS "CheckoutCouponConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "couponFieldEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutCouponConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CheckoutCouponConfig" ("id", "couponFieldEnabled")
VALUES (1, false)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "DiscountCoupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountCoupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiscountCoupon_code_key" ON "DiscountCoupon"("code");
CREATE INDEX IF NOT EXISTS "DiscountCoupon_isActive_idx" ON "DiscountCoupon"("isActive");
CREATE INDEX IF NOT EXISTS "DiscountCoupon_usedCount_idx" ON "DiscountCoupon"("usedCount");

ALTER TABLE "SongOrder"
  ADD COLUMN IF NOT EXISTS "couponId" TEXT,
  ADD COLUMN IF NOT EXISTS "couponCode" TEXT,
  ADD COLUMN IF NOT EXISTS "couponDiscountPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "couponDiscountAmount" INTEGER;

CREATE INDEX IF NOT EXISTS "SongOrder_couponId_idx" ON "SongOrder"("couponId");
CREATE INDEX IF NOT EXISTS "SongOrder_couponCode_idx" ON "SongOrder"("couponCode");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SongOrder_couponId_fkey'
  ) THEN
    ALTER TABLE "SongOrder"
      ADD CONSTRAINT "SongOrder_couponId_fkey"
      FOREIGN KEY ("couponId") REFERENCES "DiscountCoupon"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

INSERT INTO "DiscountCoupon" (
  "id",
  "code",
  "discountPercent",
  "maxUses",
  "usedCount",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  'coupon_carna10',
  'CARNA10',
  10,
  NULL,
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
