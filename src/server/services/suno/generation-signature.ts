import { createHash } from "crypto";
import { normalizeVocals } from "../../../lib/vocals";

type SunoSignatureInput = {
    lyrics: string;
    genre: string;
    locale: string;
    vocals: string;
    recipientName: string;
};

function normalizeText(value: string): string {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .trim();
}

/**
 * Deterministic signature for "what should be generated".
 * If this signature changes, we must not reuse an existing Kie task ID.
 */
export function buildSunoGenerationSignature(input: SunoSignatureInput): string {
    const payload = [
        normalizeText(input.lyrics),
        normalizeText(input.genre).toLowerCase(),
        normalizeText(input.locale).toLowerCase(),
        normalizeVocals(input.vocals),
        normalizeText(input.recipientName),
    ].join("\u241f");

    return createHash("sha256").update(payload).digest("hex");
}

