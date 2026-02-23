export type Vocals = "male" | "female" | "either";

/**
 * Normalize vocals values across the codebase.
 *
 * We have legacy/edge cases where vocals may be stored as "MALE"/"FEMALE"/"EITHER"
 * (or other variants). Internally we standardize to: "male" | "female" | "either".
 */
export function normalizeVocals(value: unknown): Vocals {
    if (typeof value !== "string") return "either";

    const v = value.trim().toLowerCase();

    if (v === "male" || v === "m" || v === "masc" || v === "masculino" || v === "masculina") {
        return "male";
    }

    if (v === "female" || v === "f" || v === "fem" || v === "feminino" || v === "feminina") {
        return "female";
    }

    return "either";
}

