const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function normalizeFlag(value: string | undefined): string | null {
    if (!value) return null;
    return value.trim().toLowerCase();
}

/**
 * Suno automation is enabled by default.
 * Set SUNO_AUTOMATION_ENABLED=false to pause all Suno processing quickly.
 */
export function isSunoAutomationEnabled(): boolean {
    const normalized = normalizeFlag(process.env.SUNO_AUTOMATION_ENABLED);
    if (!normalized) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    if (TRUE_VALUES.has(normalized)) return true;
    return true;
}

export function getSunoAutomationDisabledReason(): string {
    return "Suno automation disabled via SUNO_AUTOMATION_ENABLED=false";
}

/**
 * Fast mode: reduces fixed sleeps and polls more frequently.
 * This does NOT change Suno's generation time; it only speeds up the steps we control.
 */
export function isSunoFastMode(): boolean {
    const normalized = normalizeFlag(process.env.SUNO_FAST_MODE);
    if (!normalized) return false;
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return false;
}
