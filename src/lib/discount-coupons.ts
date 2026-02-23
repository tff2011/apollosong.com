export const CHECKOUT_COUPON_CONFIG_ID = 1;

const COUPON_CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;

export function normalizeCouponCode(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
    return normalized || null;
}

export function isValidCouponCode(value: string): boolean {
    return COUPON_CODE_REGEX.test(value);
}

export function calculateCouponDiscountAmount(totalCents: number, discountPercent: number): number {
    if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) return 0;
    return Math.max(0, Math.round(totalCents * (discountPercent / 100)));
}

export function applyCouponDiscount(totalCents: number, discountPercent: number): {
    discountAmount: number;
    finalTotal: number;
} {
    const discountAmount = calculateCouponDiscountAmount(totalCents, discountPercent);
    return {
        discountAmount,
        finalTotal: Math.max(0, totalCents - discountAmount),
    };
}
