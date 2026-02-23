export const SUNO_TURBO_DELAY_HOURS = 3;
export const SUNO_EXPRESS_DELAY_HOURS = 8;
export const SUNO_ESSENTIAL_DELAY_HOURS = 36;
export const SUNO_TURBO_DELAY_MS = SUNO_TURBO_DELAY_HOURS * 60 * 60 * 1000;
export const SUNO_EXPRESS_DELAY_MS = SUNO_EXPRESS_DELAY_HOURS * 60 * 60 * 1000;
export const SUNO_ESSENTIAL_DELAY_MS = SUNO_ESSENTIAL_DELAY_HOURS * 60 * 60 * 1000;

function normalizePlanType(planType: string | null | undefined): string {
    return String(planType || "").trim().toLowerCase();
}

export function isTurboPlanType(planType: string | null | undefined): boolean {
    const normalized = normalizePlanType(planType);
    return normalized === "acelerado";
}

export function isExpressPlanType(planType: string | null | undefined): boolean {
    const normalized = normalizePlanType(planType);
    return normalized === "express";
}

export function isEssentialPlanType(planType: string | null | undefined): boolean {
    const normalized = normalizePlanType(planType);
    return normalized === "essencial";
}

export function resolveSunoAutomationDelayWindowMs(params: {
    isExpressOrder: boolean;
    planType?: string | null;
    parentPlanType?: string | null;
}): number {
    if (isTurboPlanType(params.planType) || isTurboPlanType(params.parentPlanType)) {
        return SUNO_TURBO_DELAY_MS;
    }

    if (
        params.isExpressOrder ||
        isExpressPlanType(params.planType) ||
        isExpressPlanType(params.parentPlanType)
    ) {
        return SUNO_EXPRESS_DELAY_MS;
    }

    if (isEssentialPlanType(params.planType) || isEssentialPlanType(params.parentPlanType)) {
        return SUNO_ESSENTIAL_DELAY_MS;
    }

    // Legacy flows (without 24h/7d plan) keep the old behavior with no extra delay.
    return 0;
}

export function getSunoAutomationDelayMs(params: {
    isExpressOrder: boolean;
    planType?: string | null;
    parentPlanType?: string | null;
    paymentCompletedAt: Date | null;
    createdAt: Date;
    now?: Date;
}): number {
    const delayWindowMs = resolveSunoAutomationDelayWindowMs({
        isExpressOrder: params.isExpressOrder,
        planType: params.planType,
        parentPlanType: params.parentPlanType,
    });
    if (delayWindowMs <= 0) return 0;

    const now = params.now ?? new Date();
    const paidAt = params.paymentCompletedAt ?? params.createdAt;
    const eligibleAtMs = paidAt.getTime() + delayWindowMs;
    return Math.max(0, eligibleAtMs - now.getTime());
}

export function formatDelayShort(ms: number): string {
    const safeMs = Math.max(0, ms);
    const totalMinutes = Math.ceil(safeMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `${totalMinutes}min`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}min`;
}
