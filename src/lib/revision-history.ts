export type NormalizedRevisionHistoryEntry = Record<string, unknown> & {
    revisionNumber: number;
};

export type NormalizeRevisionHistoryOptions = {
    /**
     * Current order `revisionCount`. When provided, we can reliably detect and
     * fix legacy 1-based numbering (where the latest snapshot is `revisionCount`
     * instead of `revisionCount - 1`).
     */
    revisionCount?: number | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalizes `SongOrder.revisionHistory` into a stable, 0-based sequence.
 *
 * Why: older data used 1-based numbering (and mixed deploys can cause collisions like
 * [1,2,2]). Duplicate numbers break lookups when using maps keyed by `revisionNumber`.
 */
export function normalizeRevisionHistory(
    history: unknown,
    options: NormalizeRevisionHistoryOptions = {}
): NormalizedRevisionHistoryEntry[] {
    if (!Array.isArray(history)) return [];

    type InternalEntry = {
        idx: number;
        entry: Record<string, unknown>;
        revisionNumber: number;
        requestedAtMs: number | null;
        completedAtMs: number | null;
        isOriginalLike: boolean;
    };

    const toMs = (value: unknown): number | null => {
        if (value instanceof Date) {
            const t = value.getTime();
            return Number.isFinite(t) ? t : null;
        }
        if (typeof value === "string") {
            const t = Date.parse(value);
            return Number.isFinite(t) ? t : null;
        }
        return null;
    };

    const hasValue = (value: unknown): boolean => {
        if (value === null || value === undefined) return false;
        if (typeof value === "string") return value.trim().length > 0;
        return true;
    };

    const isOriginalLikeEntry = (entry: Record<string, unknown>): boolean => {
        const keys = [
            "requestedAt",
            "notes",
            "type",
            "fault",
            "faultReason",
            "melodyPreference",
            "completedBy",
            "completedAt",
        ];
        return !keys.some((k) => hasValue(entry[k]));
    };

    const entries: InternalEntry[] = history
        .filter(isPlainObject)
        .map((entry, idx) => {
            const revRaw = entry.revisionNumber;
            const revisionNumber = typeof revRaw === "number" && Number.isFinite(revRaw)
                ? Math.trunc(revRaw)
                : typeof revRaw === "string" && /^\d+$/.test(revRaw.trim())
                    ? Number.parseInt(revRaw.trim(), 10)
                    : idx; // best-effort fallback

            return {
                idx,
                entry,
                revisionNumber,
                requestedAtMs: toMs(entry.requestedAt),
                completedAtMs: toMs(entry.completedAt),
                isOriginalLike: isOriginalLikeEntry(entry),
            };
        });

    const getTimeKey = (e: InternalEntry): number => e.requestedAtMs ?? e.completedAtMs ?? Number.NEGATIVE_INFINITY;

    // Shift fully 1-based histories down when we have `revisionCount` context.
    // Example: revisionCount=5, stored keys are 1..5 (latest snapshot keyed by 5).
    const hasRev0Before = entries.some((e) => e.revisionNumber === 0);
    const maxRevBefore = entries.reduce((acc, e) => Math.max(acc, e.revisionNumber), Number.NEGATIVE_INFINITY);
    const revisionCount = typeof options.revisionCount === "number" && Number.isFinite(options.revisionCount)
        ? options.revisionCount
        : null;
    if (!hasRev0Before && revisionCount && revisionCount > 0 && maxRevBefore === revisionCount) {
        for (const e of entries) {
            if (e.revisionNumber > 0) e.revisionNumber -= 1;
        }
    }

    // Resolve collisions introduced by mixed 1-based/0-based deploys.
    // Heuristic: for the same revisionNumber, older entries are likely the 1-based ones and should shift down.
    for (let iter = 0; iter < 10; iter++) {
        const groups = new Map<number, InternalEntry[]>();
        for (const e of entries) {
            const list = groups.get(e.revisionNumber);
            if (list) list.push(e);
            else groups.set(e.revisionNumber, [e]);
        }

        let changed = false;
        for (const [, group] of groups) {
            if (group.length < 2) continue;

            group.sort((a, b) => {
                const ta = getTimeKey(a);
                const tb = getTimeKey(b);
                if (ta !== tb) return ta - tb;
                return a.idx - b.idx;
            });

            for (let i = 0; i < group.length - 1; i++) {
                const item = group[i]!;
                if (item.revisionNumber > 0) {
                    item.revisionNumber -= 1;
                    changed = true;
                }
            }
        }

        if (!changed) break;
    }

    // Detect fully 1-based histories (no rev 0, and rev 1 looks like the original snapshot).
    const hasRev0 = entries.some((e) => e.revisionNumber === 0);
    const hasOldOriginal = !hasRev0 && entries.some((e) => e.revisionNumber === 1 && e.isOriginalLike);
    if (hasOldOriginal) {
        for (const e of entries) {
            if (e.revisionNumber > 0) e.revisionNumber -= 1;
        }
    }

    // Clamp + materialize output. Sort by revisionNumber so the UI renders in the expected order.
    return entries
        .map((e) => ({
            ...e.entry,
            revisionNumber: Math.max(0, e.revisionNumber),
        }))
        .sort((a, b) => a.revisionNumber - b.revisionNumber);
}
