/**
 * Suno AI song generation service
 * Automates song creation using Patchright (Playwright) browser automation
 */

import type { ElementHandle, Page } from "patchright";
import type { SunoGenerationParams, SunoGenerationResult, SunoCreditsInfo } from "./types";
import { getSunoStylePrompt, getGenreDisplayName } from "./genre-mapping";
import { SELECTORS, TIMEOUTS, URLS } from "./selectors";
import { createPage, navigateToCreate, resetContext, takeScreenshot, checkForCaptcha } from "./browser";
import { humanClick, humanType, FatigueManager } from "./human-interaction";
import { sendSunoDetectionDiagnostic } from "~/lib/telegram";
import { normalizeVocals } from "~/lib/vocals";
import { isSunoFastMode } from "./config";

const FAST_MODE = isSunoFastMode();

// Fast mode reduces fixed sleeps. Keep conservative defaults and rely on existing retries/verification.
const SUNO_DELAYS = {
    customToggleSettleMs: FAST_MODE ? 150 : 300,
    customButtonSettleMs: FAST_MODE ? 450 : 1000,
    fillClearSettleMs: FAST_MODE ? 75 : 150,
    composerSettleMs: FAST_MODE ? 150 : 300,
    composerStabilityMs: FAST_MODE ? 350 : 600,
    composerRetrySettleMs: FAST_MODE ? 150 : 250,
    advancedOptionsTransitionMs: FAST_MODE ? 600 : 1000,
    libraryAfterGotoMs: FAST_MODE ? 2500 : 4000,
    libraryResetFiltersMs: FAST_MODE ? 600 : 1200,
    librarySearchInputWaitMs: FAST_MODE ? 900 : 2000,
    librarySearchResultsMs: FAST_MODE ? 1200 : 2000,
    scanSearchResultsMs: FAST_MODE ? 900 : 1500,
    scanRetryMs: FAST_MODE ? 700 : 2000,
    songsInitialWaitMs: FAST_MODE ? 1500 : 5000,
    pollIntervalMs: FAST_MODE ? 2500 : TIMEOUTS.POLL_INTERVAL,
    existingSongsInitialWaitMs: FAST_MODE ? 1500 : 3000,
    betweenDownloadsMs: FAST_MODE ? 900 : 3000,
    downloadRetryMs: FAST_MODE ? 1200 : 3000,
    downloadScrollSettleMs: FAST_MODE ? 150 : 500,
    menuOpenMs: FAST_MODE ? 700 : 1500,
    submenuOpenMs: FAST_MODE ? 700 : 1500,
    hoverSubmenuMs: FAST_MODE ? 500 : 1000,
    cdnFallbackMs: FAST_MODE ? 1500 : 3000,
    escapeMenuMs: FAST_MODE ? 150 : 500,
    stepDelayMs: FAST_MODE ? 250 : 1000,
};

/**
 * Check remaining credits on Suno
 */
export async function checkCredits(page: Page): Promise<SunoCreditsInfo | null> {
    try {
        // Try to find credits display element
        const creditsElement = await page.$(SELECTORS.CREDITS_DISPLAY);
        if (!creditsElement) {
            console.warn("[Suno Service] Credits display not found");
            return null;
        }

        const creditsText = await creditsElement.textContent();
        if (!creditsText) {
            return null;
        }

        // Parse credits number (e.g., "50 credits" or just "50")
        const match = creditsText.match(/(\d+)/);
        if (match && match[1]) {
            const remaining = parseInt(match[1], 10);
            console.log(`[Suno Service] Credits remaining: ${remaining}`);
            return { remaining, total: remaining }; // We don't know total from UI
        }

        return null;
    } catch (error) {
        console.error("[Suno Service] Error checking credits:", error);
        return null;
    }
}

/**
 * Ensure Custom Mode is enabled
 */
async function ensureCustomMode(page: Page): Promise<boolean> {
    try {
        console.log("[Suno Service] Checking for Custom Mode...");

        // The new Suno UI can mount the composer panel lazily; give it a moment before probing selectors.
        try {
            await page.waitForSelector(SELECTORS.CUSTOM_MODE_TOGGLE, { timeout: 5000 });
        } catch {
            // ignore
        }

        const fieldsLookOk = async (): Promise<boolean> => {
            const resolved = await resolveComposerInputs(page);
            if (!resolved) return false;
            return true;
        };

        // Treat "Custom" as enabled only when BOTH composer fields are visible and distinct.
        // In Simple mode, the page can still contain the word "Lyrics" (buttons) and a textarea ("Song Description"),
        // so checking only the lyrics selector can produce false positives.
        if (await fieldsLookOk()) {
            console.log("[Suno Service] Custom Mode already enabled (lyrics + styles visible)");
            return true;
        }

        // Try to find and click Custom Mode toggle
        const toggle = await page.$(SELECTORS.CUSTOM_MODE_TOGGLE);
        if (toggle) {
            const ariaChecked = await toggle.getAttribute("aria-checked");
            const ariaPressed = await toggle.getAttribute("aria-pressed");
            const ariaSelected = await toggle.getAttribute("aria-selected");
            const dataState = await toggle.getAttribute("data-state");
            const isOn = ariaChecked === "true"
                || ariaPressed === "true"
                || ariaSelected === "true"
                || dataState === "checked"
                || dataState === "on"
                || dataState === "active";

            if (!isOn) {
                try {
                    await toggle.scrollIntoViewIfNeeded();
                } catch {
                    // ignore
                }
                await toggle.click({ force: true, timeout: 5000 });
                await page.waitForTimeout(SUNO_DELAYS.customToggleSettleMs);
            } else {
                // Even if it looks "on", force a click is risky (could toggle away),
                // but we can still wait for fields to appear (some UIs mount lazily).
            }

            // Wait briefly for Custom composer fields to mount.
            try {
                await page.waitForSelector(SELECTORS.STYLE_INPUT, { timeout: 6000 });
            } catch {
                // ignore
            }

            if (await fieldsLookOk()) {
                console.log("[Suno Service] Custom Mode enabled (lyrics + styles visible)");
                return true;
            }
        }

        // Fallback: look for "Custom" button/tab/switch (new Suno UI varies markup across accounts).
        try {
            const customTab = page.getByRole("tab", { name: /custom/i }).first();
            if (await customTab.count()) {
                await customTab.click({ timeout: 2000 });
                await page.waitForTimeout(SUNO_DELAYS.customButtonSettleMs);
                if (await fieldsLookOk()) {
                    console.log("[Suno Service] Custom Mode enabled via role=tab (lyrics + styles visible)");
                    return true;
                }
            }
        } catch {
            // ignore
        }

        try {
            const tablist = page.getByRole("tablist").first();
            if (await tablist.count()) {
                const customInTablist = tablist.getByText("Custom", { exact: true }).first();
                if (await customInTablist.count()) {
                    await customInTablist.click({ timeout: 2000 });
                    await page.waitForTimeout(SUNO_DELAYS.customButtonSettleMs);
                    if (await fieldsLookOk()) {
                        console.log("[Suno Service] Custom Mode enabled via tablist text (lyrics + styles visible)");
                        return true;
                    }
                }
            }
        } catch {
            // ignore
        }

        // Legacy fallback: look for "Custom" button or switch
        const customButton = await page.$('button:has-text("Custom")');
        if (customButton) {
            await customButton.click(); // Keep simple click for fallback
            await page.waitForTimeout(SUNO_DELAYS.customButtonSettleMs);
            try {
                await page.waitForSelector(SELECTORS.STYLE_INPUT, { timeout: 6000 });
            } catch {
                // ignore
            }

            if (await fieldsLookOk()) {
                console.log("[Suno Service] Custom Mode enabled via button (lyrics + styles visible)");
                return true;
            }
        }

        console.warn("[Suno Service] Could not find Custom Mode toggle, lyrics field might not appear");
        return false;
    } catch (error) {
        console.error("[Suno Service] Error enabling Custom Mode:", error);
        return false;
    }
}

/**
 * Helper to click and fill an element reliably
 */
async function clickAndFill(page: Page, selector: string, value: string): Promise<boolean> {
    try {
        const element = await page.waitForSelector(selector, { state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE });
        if (!element) {
            return false;
        }

        return await clickAndFillElement(page, element as ElementHandle<HTMLElement>, value, selector);
    } catch (error) {
        console.error(`[Suno Service] Error filling ${selector}:`, error);
        return false;
    }
}

function normalizeSunoText(value: string): string {
    return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeSunoTextLoose(value: string): string {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

type Box = { x: number; y: number; width: number; height: number };

async function areSameElement(a: ElementHandle<HTMLElement>, b: ElementHandle<HTMLElement>): Promise<boolean> {
    try {
        return await a.evaluate((el, other) => el === other, b);
    } catch {
        return false;
    }
}

async function getHeadingBox(page: Page, labels: string[]): Promise<Box | null> {
    for (const label of labels) {
        try {
            const el = await page.$(`:text-is("${label}")`);
            if (!el) continue;
            const box = await el.boundingBox();
            if (box) return box;
        } catch {
            // ignore
        }
    }
    return null;
}

async function resolveComposerInputs(
    page: Page
): Promise<{ lyricsEl: ElementHandle<HTMLElement>; styleEl: ElementHandle<HTMLElement> } | null> {
    const lyricsHandles = (await page.$$(SELECTORS.LYRICS_TEXTAREA)) as ElementHandle<HTMLElement>[];
    const styleHandles = (await page.$$(SELECTORS.STYLE_INPUT)) as ElementHandle<HTMLElement>[];

    if (lyricsHandles.length === 0 || styleHandles.length === 0) {
        return null;
    }

    const lyricsHeadingBox = await getHeadingBox(page, ["Lyrics", "Letra"]);
    const stylesHeadingBox = await getHeadingBox(page, ["Styles", "Estilos"]);
    const advancedOptionsBox = await getHeadingBox(page, ["Advanced Options", "Opcoes avancadas", "Opções avançadas"]);

    const toCandidates = async (handles: ElementHandle<HTMLElement>[]) => {
        const out: Array<{ el: ElementHandle<HTMLElement>; box: Box }> = [];
        for (const el of handles) {
            const box = await el.boundingBox();
            if (!box) continue;
            out.push({ el, box });
        }
        return out;
    };

    let lyrics = await toCandidates(lyricsHandles);
    let styles = await toCandidates(styleHandles);

    // Prefer candidates within the expected vertical regions when headings are present.
    if (lyricsHeadingBox && stylesHeadingBox) {
        const between = lyrics.filter((c) => c.box.y + c.box.height <= stylesHeadingBox.y + 8 && c.box.y >= lyricsHeadingBox.y - 8);
        if (between.length) lyrics = between;
    } else if (lyricsHeadingBox) {
        const below = lyrics.filter((c) => c.box.y + c.box.height >= lyricsHeadingBox.y - 8);
        if (below.length) lyrics = below;
    }

    if (stylesHeadingBox) {
        const belowStyles = styles.filter((c) => c.box.y >= stylesHeadingBox.y - 8);
        if (belowStyles.length) styles = belowStyles;
    }

    if (advancedOptionsBox) {
        const aboveAdvanced = styles.filter((c) => c.box.y + c.box.height <= advancedOptionsBox.y + 120);
        if (aboveAdvanced.length) styles = aboveAdvanced;
    }

    // Sort top-to-bottom, prefer larger targets.
    lyrics.sort((a, b) => a.box.y - b.box.y || b.box.height - a.box.height);
    styles.sort((a, b) => a.box.y - b.box.y || b.box.height - a.box.height);

    // Pick the best distinct pair. Enforce vertical order if possible (lyrics above styles).
    for (const l of lyrics) {
        for (const s of styles) {
            if (l.el === s.el) continue;
            if (await areSameElement(l.el, s.el)) continue;
            if (l.box.y <= s.box.y) {
                return { lyricsEl: l.el, styleEl: s.el };
            }
        }
    }

    // Fallback: any distinct pair.
    for (const l of lyrics) {
        for (const s of styles) {
            if (l.el === s.el) continue;
            if (await areSameElement(l.el, s.el)) continue;
            return { lyricsEl: l.el, styleEl: s.el };
        }
    }

    return null;
}

async function clickAndFillElement(
    page: Page,
    element: ElementHandle<HTMLElement>,
    value: string,
    debugLabel: string
): Promise<boolean> {
    try {
        if (await checkForCaptcha(page)) {
            console.warn(`[Suno Service] CAPTCHA still present while filling ${debugLabel}.`);
            return false;
        }

        // Inputs are typically more reliable (and faster) with a single fill/paste-style operation.
        const tagName = await element.evaluate((el) => (el as HTMLElement).tagName.toLowerCase());
        const isNativeTextInput = tagName === "input" || tagName === "textarea";

        const verifyFilled = async (): Promise<boolean> => {
            try {
                const currentValue = await element.evaluate((el) => {
                    if (!el) return "";
                    // textarea/input path
                    if ("value" in (el as any)) {
                        return String((el as any).value || "");
                    }
                    // contenteditable fallback
                    const ht = el as HTMLElement;
                    return String((ht as any).innerText || ht.textContent || "");
                });

                const normalizedCurrent = String(currentValue || "").replace(/\r\n/g, "\n").trim();
                const normalizedTarget = String(value || "").replace(/\r\n/g, "\n").trim();
                if (!normalizedTarget) return normalizedCurrent.length > 0;
                if (normalizedCurrent.length === 0) return false;

                const probe = normalizedTarget.slice(0, Math.min(40, normalizedTarget.length));
                if (probe && normalizedCurrent.includes(probe)) return true;

                // If Suno enforces max length, allow "mostly filled" as success.
                return normalizedCurrent.length >= Math.min(normalizedTarget.length, 120);
            } catch {
                return false;
            }
        };

        const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";

        const keyboardPaste = async () => {
            try {
                await page.keyboard.press(selectAllShortcut);
            } catch {
                // ignore
            }
            try {
                await page.keyboard.press("Backspace");
            } catch {
                // ignore
            }
            try {
                await page.keyboard.insertText(value);
            } catch {
                await page.keyboard.type(value, { delay: 0 });
            }
        };

        // Prefer a single "paste-like" fill for long text (lyrics/styles) and for inputs (title).
        // Typing char-by-char is slower and can be flaky if focus is stolen mid-typing.
        const preferFill = isNativeTextInput || value.length > 120;
        if (preferFill) {
            try {
                await element.click({ force: true, timeout: 5000 });
            } catch {
                // ignore
            }

            try {
                await element.fill(value);
            } catch (e) {
                console.warn(`[Suno Service] Direct fill failed for ${debugLabel}, falling back to keyboard paste...`, e);
                await keyboardPaste();
            }

            if (await verifyFilled()) {
                return true;
            }

            // Last resort: set value via JS + dispatch input/change (some UIs need events).
            try {
                await element.evaluate((el, v) => {
                    if (!el) return;
                    const value = String(v ?? "");
                    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
                        el.value = value;
                        el.dispatchEvent(new Event("input", { bubbles: true }));
                        el.dispatchEvent(new Event("change", { bubbles: true }));
                        return;
                    }
                    if ((el as HTMLElement).isContentEditable) {
                        (el as HTMLElement).innerText = value;
                    } else {
                        (el as any).textContent = value;
                    }
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                }, value);
            } catch {
                // ignore
            }

            return await verifyFilled();
        }

        // Short text: keyboard input is often fine.
        try {
            await element.click({ force: true, timeout: 5000 });
        } catch {
            // ignore
        }
        await keyboardPaste();
        return await verifyFilled();
    } catch (error) {
        console.error(`[Suno Service] Error filling ${debugLabel}:`, error);
        return false;
    }
}

async function verifyLyricsStrict(
    page: Page,
    lyrics: string,
    lyricsEl?: ElementHandle<HTMLElement>,
    styleEl?: ElementHandle<HTMLElement>
): Promise<boolean> {
    try {
        const element = lyricsEl ?? (await page.$(SELECTORS.LYRICS_TEXTAREA));
        if (!element) return false;

        // Guard against selector drift: lyrics selector must not resolve to the Styles input.
        try {
            const style = styleEl ?? (await page.$(SELECTORS.STYLE_INPUT));
            if (style) {
                const same = await areSameElement(element as ElementHandle<HTMLElement>, style as ElementHandle<HTMLElement>);
                if (same) return false;
            }
        } catch {
            // ignore
        }

        const currentValue = await element.evaluate((el) => {
            if (!el) return "";
            if ("value" in (el as any)) {
                return String((el as any).value || "");
            }
            const ht = el as HTMLElement;
            return String((ht as any).innerText || ht.textContent || "");
        });

        const normalizedCurrent = normalizeSunoText(currentValue);
        const normalizedTarget = normalizeSunoText(lyrics);
        const looseCurrent = normalizeSunoTextLoose(currentValue);
        const looseTarget = normalizeSunoTextLoose(lyrics);

        if (!normalizedTarget) {
            return normalizedCurrent.length > 0;
        }

        // Fast-path: ignore whitespace differences. The new UI sometimes normalizes line breaks/spaces.
        if (looseCurrent === looseTarget) {
            return true;
        }

        // Short lyrics: avoid partial pastes, but be tolerant to minor normalization.
        if (normalizedTarget.length <= 200) {
            if (looseTarget && looseCurrent.includes(looseTarget)) {
                return true;
            }

            const minLen = Math.max(
                Math.floor(looseTarget.length * 0.9),
                looseTarget.length - 25,
                Math.min(80, looseTarget.length)
            );
            if (looseCurrent.length < minLen) {
                return false;
            }

            const head = looseTarget.slice(0, Math.min(30, looseTarget.length));
            const tail = looseTarget.slice(-Math.min(30, looseTarget.length));
            const probes = [head, tail].filter((p) => p.length >= 10);
            if (probes.length === 0) {
                return looseCurrent.length > 0;
            }
            return probes.every((probe) => looseCurrent.includes(probe));
        }

        // Guard: even if probes match (e.g. repeated chorus), ensure we have "most" of the payload.
        // This prevents a partial paste from being treated as success.
        const minLen = Math.max(
            200,
            Math.floor(normalizedTarget.length * 0.9),
            normalizedTarget.length - 120
        );
        if (normalizedCurrent.length < minLen) {
            return false;
        }

        const head = looseTarget.slice(0, 40);
        const tail = looseTarget.slice(-40);
        const midStart = Math.max(0, Math.floor(looseTarget.length / 2) - 20);
        const mid = looseTarget.slice(midStart, midStart + 40);

        const probes = [head, mid, tail].filter(Boolean);
        return probes.every((probe) => looseCurrent.includes(probe));
    } catch {
        return false;
    }
}

async function verifyStyleStrict(
    page: Page,
    stylePrompt: string,
    styleEl?: ElementHandle<HTMLElement>,
    lyricsEl?: ElementHandle<HTMLElement>
): Promise<boolean> {
    try {
        const element = styleEl ?? (await page.$(SELECTORS.STYLE_INPUT));
        if (!element) return false;

        // Guard against selector drift: styles selector must not resolve to the Lyrics input.
        try {
            const lyrics = lyricsEl ?? (await page.$(SELECTORS.LYRICS_TEXTAREA));
            if (lyrics) {
                const same = await areSameElement(element as ElementHandle<HTMLElement>, lyrics as ElementHandle<HTMLElement>);
                if (same) return false;
            }
        } catch {
            // ignore
        }

        const currentValue = await element.evaluate((el) => {
            if (!el) return "";
            if ("value" in (el as any)) {
                return String((el as any).value || "");
            }
            const ht = el as HTMLElement;
            return String((ht as any).innerText || ht.textContent || "");
        });

        const normalizedCurrent = normalizeSunoText(currentValue);
        const normalizedTarget = normalizeSunoText(stylePrompt);
        const looseCurrent = normalizeSunoTextLoose(currentValue);
        const looseTarget = normalizeSunoTextLoose(stylePrompt);

        if (!normalizedTarget) {
            return normalizedCurrent.length > 0;
        }

        // Style prompts are typically short; require exact match to avoid accidental fills into the wrong field.
        if (normalizedTarget.length <= 250) {
            if (looseCurrent === looseTarget) return true;
            if (looseTarget && looseCurrent.includes(looseTarget)) return true;
            return false;
        }

        const minLen = Math.max(
            200,
            Math.floor(normalizedTarget.length * 0.9),
            normalizedTarget.length - 120
        );
        if (normalizedCurrent.length < minLen) {
            return false;
        }

        const head = looseTarget.slice(0, 40);
        const tail = looseTarget.slice(-40);
        const midStart = Math.max(0, Math.floor(looseTarget.length / 2) - 20);
        const mid = looseTarget.slice(midStart, midStart + 40);

        const probes = [head, mid, tail].filter(Boolean);
        return probes.every((probe) => looseCurrent.includes(probe));
    } catch {
        return false;
    }
}

/**
 * Fill in the lyrics field
 */
async function fillLyrics(page: Page, lyrics: string): Promise<boolean> {
    try {
        const customOk = await ensureCustomMode(page);
        if (!customOk) {
            console.error("[Suno Service] Custom Mode not enabled; refusing to fill lyrics (prevents partial/incorrect fields)");
            return false;
        }

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const resolved = await resolveComposerInputs(page);
            if (!resolved) {
                console.warn(`[Suno Service] Could not resolve distinct Lyrics/Styles inputs (attempt ${attempt}/${maxAttempts})`);
                await page.waitForTimeout(SUNO_DELAYS.composerRetrySettleMs);
                continue;
            }

            const filled = await clickAndFillElement(page, resolved.lyricsEl, lyrics, "lyrics");
            if (!filled) {
                console.warn(`[Suno Service] Lyrics fill attempt ${attempt}/${maxAttempts} failed to set value`);
                continue;
            }

            // Let the UI settle; Suno sometimes re-renders inputs shortly after fill.
            await page.waitForTimeout(SUNO_DELAYS.composerSettleMs);
            const afterSettle = (await resolveComposerInputs(page)) || resolved;
            const okNow = await verifyLyricsStrict(page, lyrics, afterSettle.lyricsEl, afterSettle.styleEl);
            if (okNow) {
                // Stability check: verify again after a short delay to catch async truncation/reset.
                await page.waitForTimeout(SUNO_DELAYS.composerStabilityMs);
                const afterStable = (await resolveComposerInputs(page)) || afterSettle;
                if (await verifyLyricsStrict(page, lyrics, afterStable.lyricsEl, afterStable.styleEl)) {
                    // For human visibility, scroll back to the top (helps confirm the lyrics are all there).
                    try {
                        await afterStable.lyricsEl.evaluate((el) => {
                            try {
                                const ht = el as HTMLElement;
                                if ("scrollTop" in (ht as any)) {
                                    (ht as any).scrollTop = 0;
                                }
                                if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
                                    el.selectionStart = 0;
                                    el.selectionEnd = 0;
                                }
                            } catch {
                                // ignore
                            }
                        });
                    } catch {
                        // ignore
                    }

                    console.log("[Suno Service] Lyrics filled successfully");
                    return true;
                }
            }

            // Lightweight debug: lengths only (avoid logging lyrics content).
            try {
                const currentValue = await afterSettle.lyricsEl.evaluate((el) => {
                    if (!el) return "";
                    if ("value" in (el as any)) {
                        return String((el as any).value || "");
                    }
                    const ht = el as HTMLElement;
                    return String((ht as any).innerText || ht.textContent || "");
                });
                const currentLen = normalizeSunoText(currentValue).length;
                const targetLen = normalizeSunoText(lyrics).length;
                console.warn(`[Suno Service] Lyrics verify failed (attempt ${attempt}/${maxAttempts}) len=${currentLen}/${targetLen}`);
            } catch {
                // ignore
            }

            console.warn(`[Suno Service] Lyrics did not pass strict verification (attempt ${attempt}/${maxAttempts}). Retrying...`);

            // Force clear then retry (helps when the UI keeps an old draft).
            try {
                const beforeRetry = (await resolveComposerInputs(page)) || afterSettle;
                await beforeRetry.lyricsEl.click({ force: true, timeout: 1500 });
                try { await beforeRetry.lyricsEl.fill(""); } catch { /* ignore */ }
                try { await page.keyboard.press("Meta+A"); } catch { /* ignore */ }
                try { await page.keyboard.press("Control+A"); } catch { /* ignore */ }
                try { await page.keyboard.press("Backspace"); } catch { /* ignore */ }
            } catch {
                // ignore
            }

            await page.waitForTimeout(SUNO_DELAYS.composerRetrySettleMs);
        }

        console.error("[Suno Service] Lyrics verification failed after all retries");
        return false;
    } catch (error) {
        console.error("[Suno Service] Error filling lyrics:", error);
        return false;
    }
}

/**
 * Fill in the style/genre field
 */
async function fillStyle(page: Page, stylePrompt: string): Promise<boolean> {
    try {
        const customOk = await ensureCustomMode(page);
        if (!customOk) {
            console.error("[Suno Service] Custom Mode not enabled; cannot fill style");
            return false;
        }

        console.log(`[Suno Service] Setting style: ${stylePrompt}`);

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const resolved = await resolveComposerInputs(page);
            if (!resolved) {
                console.warn(`[Suno Service] Could not resolve distinct Lyrics/Styles inputs (attempt ${attempt}/${maxAttempts})`);
                await page.waitForTimeout(SUNO_DELAYS.composerRetrySettleMs);
                continue;
            }

            const filled = await clickAndFillElement(page, resolved.styleEl, stylePrompt, "styles");
            if (!filled) {
                console.warn(`[Suno Service] Style fill attempt ${attempt}/${maxAttempts} failed to set value`);
                continue;
            }

            await page.waitForTimeout(SUNO_DELAYS.composerSettleMs);
            const afterSettle = (await resolveComposerInputs(page)) || resolved;
            const okNow = await verifyStyleStrict(page, stylePrompt, afterSettle.styleEl, afterSettle.lyricsEl);
            if (okNow) {
                await page.waitForTimeout(SUNO_DELAYS.composerStabilityMs);
                const afterStable = (await resolveComposerInputs(page)) || afterSettle;
                if (await verifyStyleStrict(page, stylePrompt, afterStable.styleEl, afterStable.lyricsEl)) {
                    console.log("[Suno Service] Style filled successfully");
                    return true;
                }
            }

            console.warn(`[Suno Service] Style did not pass strict verification (attempt ${attempt}/${maxAttempts}). Retrying...`);
            try {
                const beforeRetry = (await resolveComposerInputs(page)) || afterSettle;
                await beforeRetry.styleEl.click({ force: true, timeout: 1500 });
                try { await beforeRetry.styleEl.fill(""); } catch { /* ignore */ }
                try { await page.keyboard.press("Meta+A"); } catch { /* ignore */ }
                try { await page.keyboard.press("Control+A"); } catch { /* ignore */ }
                try { await page.keyboard.press("Backspace"); } catch { /* ignore */ }
            } catch {
                // ignore
            }

            await page.waitForTimeout(SUNO_DELAYS.composerRetrySettleMs);
        }

        console.error("[Suno Service] Style verification failed after all retries");
        return false;
    } catch (error) {
        console.error("[Suno Service] Error filling style:", error);
        return false;
    }
}

/**
 * Fill in the song title
 */
async function fillTitle(page: Page, title: string): Promise<boolean> {
    try {
        console.log(`[Suno Service] Setting title: ${title}`);

        // Find ALL possible title inputs and target the visible one
        const selector = SELECTORS.TITLE_INPUT;
        // Avoid long waits here: title is optional, and on Suno it can be collapsed/virtualized until scrolled.
        let titleInput = await page.$(selector);
        if (!titleInput) {
            // Try to bring the field into view and/or expand it.
            try {
                const titleRow = page.getByText(/song title/i).first();
                if (await titleRow.count()) {
                    await titleRow.scrollIntoViewIfNeeded();
                    await titleRow.click({ force: true, timeout: 1500 });
                    await page.waitForTimeout(200);
                } else {
                    // Fallback scroll to bottom (some layouts mount the title field late).
                    await page.mouse.wheel(0, 1200);
                    await page.waitForTimeout(200);
                }
            } catch {
                // ignore
            }
            titleInput = await page.$(selector);
        }

        const success = titleInput ? await clickAndFill(page, selector, title) : false;

        if (success) {
            console.log("[Suno Service] Title filled successfully");
        } else {
            console.warn("[Suno Service] Title field found but could not be filled");
        }
        return success;
    } catch (error) {
        // Title is optional, so we just warn
        console.warn("[Suno Service] Failed to fill title (non-critical):", error);
        return false;
    }
}

async function setVocalGender(page: Page, vocals: string): Promise<boolean> {
    const normalizedVocals = normalizeVocals(vocals);
    if (normalizedVocals === "either") {
        console.log("[Suno Service] No vocal preference, skipping gender selection");
        return true;
    }

    try {
        const genderSelector = normalizedVocals === "male" ? SELECTORS.VOCAL_MALE : SELECTORS.VOCAL_FEMALE;

        // Check if the gender button is visible (if not, we need to expand advanced options)
        let genderButton = await page.$(genderSelector);
        if (!genderButton || !(await genderButton.isVisible())) {
            console.log("[Suno Service] Advanced options button hidden, trying to expand...");
            const advancedButton = await page.$(SELECTORS.ADVANCED_OPTIONS_BUTTON);
            if (advancedButton) {
                await advancedButton.click({ force: true });
                await page.waitForTimeout(SUNO_DELAYS.advancedOptionsTransitionMs); // Wait for transition
            }
        }

        // Try to find the button again after possible expansion
        genderButton = await page.$(genderSelector);
        if (genderButton) {
            // Check if already selected to avoid unnecessary click
            const isSelected = await genderButton.getAttribute("data-selected");
            if (isSelected === "true") {
                console.log(`[Suno Service] Vocal gender ${normalizedVocals} already selected`);
                return true;
            }

            await humanClick(page, genderSelector);
            console.log(`[Suno Service] Vocal gender set to: ${normalizedVocals}`);
            return true;
        }

        // Try text-based fallback
        const genderText = normalizedVocals === "male" ? "Male" : "Female";
        const textElement = await page.$(normalizedVocals === "male" ? 'button:has-text("Male")' : 'button:has-text("Female")');
        if (textElement) {
            await textElement.click({ force: true });
            console.log(`[Suno Service] Vocal gender set to: ${normalizedVocals} (via fallback)`);
            return true;
        }

        console.warn("[Suno Service] Could not find vocal gender selector");
        return true; // Non-critical
    } catch (error) {
        console.error("[Suno Service] Error setting vocal gender:", error);
        return true; // Non-critical, continue
    }
}

/**
 * Click the Create button to start generation
 */
async function clickCreate(page: Page): Promise<boolean> {
    try {
        if (await checkForCaptcha(page)) {
            console.warn("[Suno Service] CAPTCHA still present before clicking Create.");
            return false;
        }

        const candidates = (await page.$$(SELECTORS.CREATE_BUTTON)) as ElementHandle<HTMLElement>[];
        if (candidates.length === 0) {
            console.error("[Suno Service] Create button not found");
            return false;
        }

        const scored: Array<{ el: ElementHandle<HTMLElement>; score: number }> = [];
        for (const el of candidates) {
            const box = await el.boundingBox();
            if (!box) continue;

            const info = await el.evaluate((node) => {
                const btn = node as HTMLButtonElement;
                const ariaLabel = node.getAttribute("aria-label") || "";
                const ariaDisabled = (node.getAttribute("aria-disabled") || "").toLowerCase() === "true";
                const disabled = (btn as any).disabled === true || ariaDisabled;
                const text = (node.textContent || "").trim();
                return { ariaLabel, disabled, text };
            });
            if (info.disabled) continue;

            const aria = info.ariaLabel.toLowerCase();
            const text = info.text.toLowerCase();
            let score = 0;
            if (aria.includes("create song")) score += 5000;
            else if (aria.startsWith("create")) score += 2000;
            else if (text.includes("create")) score += 800;

            // Prefer the big bottom button (new UI) by position/size.
            const bottom = box.y + box.height;
            const area = box.width * box.height;
            score += Math.round(bottom); // lowest on screen tends to be the real Create
            score += Math.round(box.width * 2);
            score += Math.round(area / 50);

            scored.push({ el, score });
        }

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0]?.el;
        if (!best) {
            console.error("[Suno Service] Create button found but appears disabled or not visible");
            return false;
        }

        try {
            await best.scrollIntoViewIfNeeded();
        } catch {
            // ignore
        }

        // Use a direct click here to avoid selector ambiguity (there can be multiple "Create" buttons).
        await best.click({ force: true, timeout: 5000 });
        console.log("[Suno Service] Create button clicked");
        return true;
    } catch (error) {
        console.error("[Suno Service] Error clicking create:", error);
        return false;
    }
}

/**
 * Check if text looks like a playlist (has "X Songs" pattern)
 */
function isPlaylistText(text: string): boolean {
    // Playlists show "47 Songs · 5mo ago" pattern
    return /\d+\s*Songs?\s*·/i.test(text);
}

/**
 * Check if text looks like a generated song (has duration like "3:07" but no "Songs" count)
 */
function isGeneratedSongText(text: string): boolean {
    // Must have duration format
    if (!SELECTORS.DURATION_REGEX.test(text)) {
        return false;
    }
    // Must NOT be a playlist
    if (isPlaylistText(text)) {
        return false;
    }
    return true;
}

/**
 * Extract unique song identifier from text (duration + first few words)
 */
function getSongIdentifier(text: string): string {
    // Extract duration (e.g., "3:32")
    const durationMatch = text.match(/(\d{1,2}:\d{2})/);
    const duration = durationMatch?.[1] || "";

    // Get first 20 chars after duration for uniqueness
    const afterDuration = text.slice(text.indexOf(duration) + duration.length).trim().slice(0, 20);

    return `${duration}-${afterDuration}`;
}

async function getCardTextFromMenuButton(menuButton: any): Promise<string> {
    return await menuButton.evaluate((el: HTMLElement, songCardSelector: string) => {
        if (!el) return "";

        // Prefer a real card container. Avoid fallbacks that climb to large page
        // containers (sidebar/header/etc) which can contain multiple /song/ links
        // and cause us to click the wrong menu (eg. user profile menu).
        let container = el.closest(songCardSelector) as HTMLElement | null;

        // Fallback: walk up to a small "card-like" container with exactly one unique song id.
        if (!container) {
            let parent = el.parentElement as HTMLElement | null;
            for (let i = 0; i < 12 && parent; i++) {
                const tag = (parent.tagName || "").toLowerCase();
                if (tag === "html" || tag === "body") break;

                const links = Array.from(parent.querySelectorAll('a[href*="/song/"]')) as HTMLAnchorElement[];
                if (links.length > 0) {
                    const ids = new Set<string>();
                    for (const link of links) {
                        const href = link.getAttribute("href") || "";
                        const match = href.match(/\/song\/([a-f0-9-]+)/i);
                        if (match?.[1]) ids.add(match[1].toLowerCase());
                    }

                    // Card containers usually only contain one unique song id (may have multiple links to it).
                    if (ids.size === 1) {
                        const text = parent.innerText || "";
                        // Avoid huge containers like the whole workspace list.
                        if (text.length >= 10 && text.length <= 1500) {
                            container = parent;
                            break;
                        }
                    }
                }

                parent = parent.parentElement as HTMLElement | null;
            }
        }

        if (!container) return "";

        const durationEl = container.querySelector('[data-testid="duration"], .duration, time');
        const durationText = durationEl?.textContent?.trim() || "";
        const text = container.innerText || "";
        if (durationText && !text.includes(durationText)) {
            return `${durationText} ${text}`;
        }
        return text;
    }, SELECTORS.SONG_CARD);
}

async function getCardTextFromCard(card: any): Promise<string> {
    return await card.evaluate((el: HTMLElement) => {
        if (!el) return "";
        const durationEl = el.querySelector('[data-testid="duration"], .duration, time');
        const durationText = durationEl?.textContent?.trim() || "";
        const text = el.innerText || "";
        if (durationText && !text.includes(durationText)) {
            return `${durationText} ${text}`;
        }
        return text;
    });
}

async function findMenuButtonFromCard(card: any): Promise<Awaited<ReturnType<Page["$"]>> | null> {
    try {
        await card.scrollIntoViewIfNeeded();
        await card.hover({ force: true });
    } catch {
        // Ignore hover failures
    }

    let current: any = card;
    for (let i = 0; i < 6 && current; i++) {
        let button = await current.$(SELECTORS.SONG_MENU_BUTTON);
        if (button) return button;

        button = await current.$(
            'button[aria-haspopup="menu"], [role="button"][aria-haspopup="menu"], button[aria-label*="more" i], button[aria-label*="options" i], button[aria-label*="actions" i], button[title*="more" i], button[title*="options" i], button[title*="actions" i]'
        );
        if (button) return button;

        const parentHandle = await current.evaluateHandle((el: HTMLElement | null) => el?.parentElement || null);
        if (!parentHandle) break;
        current = parentHandle;
    }

    return null;
}

async function getSongIdFromCardElement(card: any): Promise<string | null> {
    return await card.evaluate((el: HTMLElement) => {
        if (!el) return null;
        const link = el.querySelector('a[href*="/song/"]') as HTMLAnchorElement | null;
        if (!link) return null;
        const href = link.getAttribute("href");
        if (!href) return null;
        const match = href.match(/\/song\/([a-f0-9-]+)/);
        return match?.[1] || null;
    });
}

function matchesOrderIdInText(text: string, orderId: string): boolean {
    if (!text || !orderId) return false;
    const normalizedText = text.toLowerCase();
    const normalizedOrderId = orderId.toLowerCase();

    // Full match (best case)
    if (normalizedText.includes(`order #${normalizedOrderId}`)) return true;
    if (normalizedText.includes(`#${normalizedOrderId}`)) return true;
    if (normalizedText.includes(normalizedOrderId)) return true;

    // Suno often truncates long titles in the workspace list, e.g.:
    // "Order #cmlb56beh002vl404vjbnn..."
    // Match a reasonably long prefix to avoid false positives.
    const prefixLen = Math.min(12, normalizedOrderId.length);
    const prefix = normalizedOrderId.slice(0, prefixLen);
    if (prefix.length >= 10) {
        if (normalizedText.includes(`order #${prefix}`)) return true;
        if (normalizedText.includes(`#${prefix}`)) return true;
        // Fallback: if the prefix appears and "order" appears, it's very likely this card.
        if (normalizedText.includes(prefix) && normalizedText.includes("order")) return true;
    }

    return false;
}

/**
 * Get the song UUID from a menu button's container
 */
async function getSongIdFromCard(page: Page, menuButton: any): Promise<string | null> {
    return await menuButton.evaluate((el: HTMLElement, songCardSelector: string) => {
        if (!el) return null;

        // Anchor to the closest card to avoid accidentally picking a link from
        // a different card when the DOM nesting changes.
        let container = el.closest(songCardSelector) as HTMLElement | null;

        // Fallback: walk up to a small "card-like" container with exactly one unique song id.
        if (!container) {
            let parent = el.parentElement as HTMLElement | null;
            for (let i = 0; i < 12 && parent; i++) {
                const tag = (parent.tagName || "").toLowerCase();
                if (tag === "html" || tag === "body") break;

                const links = Array.from(parent.querySelectorAll('a[href*="/song/"]')) as HTMLAnchorElement[];
                if (links.length > 0) {
                    const ids = new Set<string>();
                    for (const link of links) {
                        const href = link.getAttribute("href") || "";
                        const match = href.match(/\/song\/([a-f0-9-]+)/i);
                        if (match?.[1]) ids.add(match[1].toLowerCase());
                    }
                    if (ids.size === 1) {
                        const text = parent.innerText || "";
                        if (text.length >= 10 && text.length <= 1500) {
                            container = parent;
                            break;
                        }
                    }
                }

                parent = parent.parentElement as HTMLElement | null;
            }
        }

        if (!container) return null;

        // Extract exactly one unique id (card can have multiple links to the same song).
        const links = Array.from(container.querySelectorAll('a[href*="/song/"]')) as HTMLAnchorElement[];
        const ids = new Set<string>();
        for (const link of links) {
            const href = link.getAttribute("href") || "";
            const match = href.match(/\/song\/([a-f0-9-]+)/i);
            if (match?.[1]) ids.add(match[1].toLowerCase());
        }
        if (ids.size !== 1) {
            return null;
        }
        return Array.from(ids)[0] || null;
    }, SELECTORS.SONG_CARD);
}
/**
 * getExistingSongIds - Legacy text-based ID for backward compatibility fallback
 */
async function getExistingSongIds(page: Page): Promise<Set<string>> {
    const existingIds = new Set<string>();
    const menuButtons = await page.$$(SELECTORS.SONG_MENU_BUTTON);

    for (const button of menuButtons) {
        const text = await getCardTextFromMenuButton(button);

        if (!isPlaylistText(text) && isGeneratedSongText(text)) {
            const songId = getSongIdentifier(text);
            existingIds.add(songId);
        }
    }

    console.log(`[Suno Service] Found ${existingIds.size} existing songs on page (will ignore these)`);
    return existingIds;
}

interface OrderSongScan {
    menuButtonsFound: number;
    matchingCards: number;
    readyButtons: Awaited<ReturnType<Page["$"]>>[];
    readyCount: number;
    cardTexts: string[];
    orderCardTexts: string[];
}

async function scanOrderSongCards(page: Page, orderId: string, options?: { useSearch?: boolean }): Promise<OrderSongScan> {
    if (options?.useSearch) {
        try {
            // Avoid clicking "through" a CAPTCHA modal (which can close it) and don't proceed in headless.
            if (await checkForCaptcha(page)) {
                return {
                    menuButtonsFound: 0,
                    matchingCards: 0,
                    readyButtons: [],
                    readyCount: 0,
                    cardTexts: [],
                    orderCardTexts: [],
                };
            }
            const searchInput = await page.$(SELECTORS.LIBRARY_SEARCH_INPUT);
            if (searchInput) {
                try {
                    await searchInput.scrollIntoViewIfNeeded();
                } catch {
                    // ignore
                }
                try {
                    // No `force: true` here: forcing clicks can dismiss the CAPTCHA dialog.
                    await searchInput.click({ timeout: 2000 });
                } catch {
                    // ignore
                }
                await searchInput.fill(orderId);
                await page.waitForTimeout(SUNO_DELAYS.scanSearchResultsMs);
            }
        } catch {
            // Ignore search failures
        }
    }
    const menuButtons = await page.$$(SELECTORS.SONG_MENU_BUTTON);
    const readyButtons: Awaited<ReturnType<Page["$"]>>[] = [];
    const seenSongKeys = new Set<string>();
    const cardTexts: string[] = [];
    const orderCardTexts: string[] = [];
    let matchingCards = 0;

    const processCardText = (text: string): boolean => {
        if (text.length > 10) {
            cardTexts.push(text);
        }
        if (!matchesOrderIdInText(text, orderId)) {
            return false;
        }
        if (text.length > 10) {
            const hasDuration = SELECTORS.DURATION_REGEX.test(text);
            const statusIndicator = hasDuration ? "✅ PRONTA" : "⏳ GERANDO";
            orderCardTexts.push(`${statusIndicator}: ${text.slice(0, 60).replace(/\n/g, " ")}`);
        }
        if (isPlaylistText(text)) {
            return false;
        }
        matchingCards++;
        if (!isGeneratedSongText(text)) {
            return false;
        }
        return true;
    };

    for (let index = 0; index < menuButtons.length; index++) {
        const button = menuButtons[index];
        if (!button) continue;
        const text = await getCardTextFromMenuButton(button);
        const isReadySong = processCardText(text);
        if (!isReadySong) continue;
        const cardUuid = await getSongIdFromCard(page, button);
        const dedupeKey = cardUuid
            ? `uuid:${cardUuid}`
            : `legacy:${getSongIdentifier(text)}:menu:${index}`;
        if (seenSongKeys.has(dedupeKey)) continue;
        seenSongKeys.add(dedupeKey);
        readyButtons.push(button);
    }

    if (readyButtons.length === 0) {
        const cards = await page.$$(SELECTORS.SONG_CARD);
        for (let index = 0; index < cards.length; index++) {
            const card = cards[index];
            if (!card) continue;
            const text = await getCardTextFromCard(card);
            const isReadySong = processCardText(text);
            if (!isReadySong) continue;
            const cardUuid = await getSongIdFromCardElement(card);
            const dedupeKey = cardUuid
                ? `uuid:${cardUuid}`
                : `legacy:${getSongIdentifier(text)}:card:${index}`;
            if (seenSongKeys.has(dedupeKey)) continue;
            seenSongKeys.add(dedupeKey);
            const menuButton = await findMenuButtonFromCard(card);
            if (menuButton) {
                readyButtons.push(menuButton);
            }
        }
    }

    return {
        menuButtonsFound: menuButtons.length,
        matchingCards,
        readyButtons,
        readyCount: readyButtons.length,
        cardTexts: cardTexts.slice(0, 5),
        orderCardTexts: orderCardTexts.slice(0, 4),
    };
}

async function searchLibraryForOrder(page: Page, orderId: string): Promise<OrderSongScan | null> {
    try {
        console.log(`[Suno Service] Searching library for existing songs (order ${orderId})...`);
        await page.goto(URLS.LIBRARY, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.PAGE_LOAD });
        await page.waitForTimeout(SUNO_DELAYS.libraryAfterGotoMs);

        if (await checkForCaptcha(page)) {
            console.warn("[Suno Service] CAPTCHA still present while searching library. Aborting library search for now.");
            return null;
        }

        // Suno Library can persist filters from previous sessions, which may hide all songs and cause false negatives.
        // If we see a "Reset filters" action, click it before searching.
        try {
                const resetFiltersSel = 'button:has-text("Reset filters"), button:has-text("Reset Filters")';
                if (await page.isVisible(resetFiltersSel)) {
                    console.warn("[Suno Service] Library has active filters; resetting to improve search reliability...");
                    await humanClick(page, resetFiltersSel);
                    await page.waitForTimeout(SUNO_DELAYS.libraryResetFiltersMs);
                }
            } catch {
                // ignore
            }

        let searchInput = await page.$(SELECTORS.LIBRARY_SEARCH_INPUT);
        if (!searchInput) {
            // Wait a bit more for the input to appear
            await page.waitForTimeout(SUNO_DELAYS.librarySearchInputWaitMs);
            searchInput = await page.$(SELECTORS.LIBRARY_SEARCH_INPUT);
        }

        if (searchInput) {
            try {
                await searchInput.scrollIntoViewIfNeeded();
            } catch {
                // ignore
            }
            // No `force: true`: forcing clicks can dismiss CAPTCHA dialogs if one appears.
            try {
                await searchInput.click({ timeout: 3000 });
            } catch (e) {
                console.warn("[Suno Service] Library search input click failed, continuing without focusing input:", e);
            }
            try {
                await searchInput.fill(orderId);
            } catch (e) {
                console.warn("[Suno Service] Library search input fill failed, continuing with visible cards scan:", e);
            }
            await page.waitForTimeout(SUNO_DELAYS.librarySearchResultsMs);

            let scan = await scanOrderSongCards(page, orderId, { useSearch: true });
            if (scan.matchingCards === 0) {
                await page.waitForTimeout(SUNO_DELAYS.scanRetryMs);
                scan = await scanOrderSongCards(page, orderId, { useSearch: true });
            }

            if (scan.matchingCards === 0) {
                // If filters are hiding results, Suno shows "Reset filters" prominently.
                // Try once more after resetting filters.
                try {
                    const resetFiltersSel = 'button:has-text("Reset filters"), button:has-text("Reset Filters")';
                    if (await page.isVisible(resetFiltersSel)) {
                        console.warn("[Suno Service] Library search returned 0 results with filters active; resetting filters and retrying...");
                        await humanClick(page, resetFiltersSel);
                        await page.waitForTimeout(SUNO_DELAYS.libraryResetFiltersMs);
                        scan = await scanOrderSongCards(page, orderId, { useSearch: true });
                    }
                } catch {
                    // ignore
                }
            }

            if (scan.matchingCards > 0) {
                console.log(`[Suno Service] Found ${scan.matchingCards} card(s) in library with query "${orderId}"`);
                return scan;
            }
        } else {
            console.warn("[Suno Service] Library search input not found, scanning visible cards...");
        }

        const fallbackScan = await scanOrderSongCards(page, orderId, { useSearch: true });
        if (fallbackScan.matchingCards > 0) {
            console.log(`[Suno Service] Found ${fallbackScan.matchingCards} card(s) in library without search`);
        }
        return fallbackScan;
    } catch (error) {
        console.warn("[Suno Service] Library search failed:", error);
        return null;
    }
}

async function tryDownloadExistingOrderSongs(params: {
    page: Page;
    orderId: string;
    recipientName: string;
    genre: string;
    creditsRemaining?: number;
    scan: OrderSongScan;
    sourceLabel: string;
}): Promise<SunoGenerationResult | null> {
    const { page, orderId, recipientName, genre, creditsRemaining, scan, sourceLabel } = params;

    if (scan.matchingCards === 0) {
        return null;
    }

    console.warn(`[Suno Service] Found ${scan.matchingCards} existing card(s) for order ${orderId} (${sourceLabel}). Skipping generation and downloading existing songs.`);

    const songsReady = scan.readyCount >= 2
        ? scan.readyCount
        : await waitForOrderSongsReady({ page, orderId, recipientName, genre });

    if (songsReady === 0) {
        await takeScreenshot(page, `error-existing-no-ready-${orderId}`);
        return {
            success: false,
            songs: [],
            creditsRemaining,
            error: "Existing order songs found but none were ready for download",
        };
    }

    const songs: { title: string; durationSeconds: number; mp3Buffer: Buffer }[] = [];
    let orderButtons = scan.readyCount >= songsReady
        ? scan.readyButtons
        : (await scanOrderSongCards(page, orderId)).readyButtons;

    const maxToDownload = Math.min(songsReady, orderButtons.length, 2);

    if (maxToDownload === 0) {
        await takeScreenshot(page, `error-existing-no-download-${orderId}`);
        return {
            success: false,
            songs: [],
            creditsRemaining,
            error: "Existing order songs found but no downloadable cards were detected",
        };
    }

    for (let i = 0; i < maxToDownload; i++) {
        if (i > 0) {
            console.log(`[Suno Service] Waiting 3s before downloading existing song ${i + 1}...`);
            await page.waitForTimeout(SUNO_DELAYS.betweenDownloadsMs);
        }

        let buffer: Buffer | null = null;
        let retries = 0;
        const maxRetries = 2;

        while (!buffer && retries < maxRetries) {
            const buttonToUse = orderButtons[i];
            buffer = await downloadSong(page, i, new Set<string>(), undefined, buttonToUse, orderId);

            if (!buffer && retries < maxRetries - 1) {
                console.warn(`[Suno Service] ⚠️ Download failed for existing song ${i + 1}, retry ${retries + 1}/${maxRetries - 1}...`);
                await page.waitForTimeout(SUNO_DELAYS.downloadRetryMs);
                orderButtons = (await scanOrderSongCards(page, orderId)).readyButtons;
                retries++;
            } else if (!buffer) {
                retries++;
            }
        }

        if (buffer) {
            songs.push({
                title: `${recipientName} Song ${i + 1}`,
                durationSeconds: 0,
                mp3Buffer: buffer,
            });
            console.log(`[Suno Service] ✓ Existing song ${i + 1} downloaded successfully (${buffer.length} bytes)`);
        } else {
            console.error(`[Suno Service] ❌ FAILED to download existing song ${i + 1} after ${maxRetries} attempts`);
        }
    }

    const finalCredits = await checkCredits(page);

    console.log(`[Suno Service] Existing order download complete. ${songs.length} songs downloaded.`);

    return {
        success: songs.length > 0,
        songs,
        creditsRemaining: finalCredits?.remaining ?? creditsRemaining,
        error: songs.length === 0 ? "No songs could be downloaded" : undefined,
    };
}

/**
 * Wait for both songs to finish generating
 * Songs are ready when they show a duration (e.g., "3:07") and are NOT playlists
 */
interface WaitForSongsParams {
    page: Page;
    existingSongIds: Set<string>;
    expectedSongUUIDs?: Set<string>;
    // Diagnostic params
    orderId: string;
    recipientName: string;
    genre: string;
    apiPostResponses: string[];
}

async function waitForSongsReady(params: WaitForSongsParams): Promise<number> {
    const { page, existingSongIds, expectedSongUUIDs, orderId, recipientName, genre, apiPostResponses } = params;

    console.log(`[Suno Service] Waiting for songs... ${expectedSongUUIDs?.size ? `(Strict Mode: Expecting ${Array.from(expectedSongUUIDs).join(", ")})` : "(Legacy Discovery Mode)"}`);

    const startTime = Date.now();
    let lastReadyCount = 0;
    let lastLogTime = 0;
    let lastDiagnosticTime = 0;
    const foundNewSongIds = new Set<string>(); // Track NEW songs we've found (legacy)
    const foundExpectedUUIDs = new Set<string>(); // Track NEW songs we've found (strict)
    const diagnosticCardTexts: string[] = []; // Collect card texts for diagnostic
    const orderCardTexts: string[] = []; // Cards specifically for THIS order

    // Wait a moment for generation to start and cards to appear
    await page.waitForTimeout(SUNO_DELAYS.songsInitialWaitMs);

    while (Date.now() - startTime < TIMEOUTS.SONG_GENERATION) {
        const captchaStillPresent = await checkForCaptcha(page);
        if (captchaStillPresent) {
            console.warn("[Suno Service] CAPTCHA still present while waiting for songs. Retrying...");
            await page.waitForTimeout(SUNO_DELAYS.pollIntervalMs);
            continue;
        }

        // If we can identify cards for this specific order, prefer that signal.
        // This is far more reliable than global "new song" discovery when the UI layout changes.
        // Also re-apply the library/workspace search query. In Suno, new clips can fail to
        // appear in an already-filtered list unless the query is re-triggered.
        const orderScan = await scanOrderSongCards(page, orderId, { useSearch: true });
        if (orderScan.matchingCards > 0) {
            const readyCount = Math.min(orderScan.readyCount, 2);
            if (readyCount >= 2) {
                console.log(`[Suno Service] 🎵 ${readyCount} order songs are ready! (order: ${orderId})`);
                return readyCount;
            }

            // Log progress every 30 seconds OR when count changes
            const now = Date.now();
            if (now - lastLogTime >= 30000 || readyCount !== lastReadyCount) {
                const elapsedSec = Math.round((now - startTime) / 1000);
                console.log(
                    `[Suno Service] [${elapsedSec}s] Order songs ready: ${readyCount}/2, waiting... (menu buttons: ${orderScan.menuButtonsFound}, matching cards: ${orderScan.matchingCards})`
                );
                lastLogTime = now;
                lastReadyCount = readyCount;
            }

            // Send diagnostic update every 60 seconds
            if (now - lastDiagnosticTime >= 60000) {
                lastDiagnosticTime = now;
                const elapsedSec = Math.round((now - startTime) / 1000);

                await sendSunoDetectionDiagnostic({
                    orderId,
                    recipientName,
                    genre,
                    phase: `PROGRESSO - ${elapsedSec}s`,
                    details: {
                        menuButtonsFound: orderScan.menuButtonsFound,
                        matchingCards: orderScan.matchingCards,
                        cardTexts: orderScan.cardTexts,
                        orderCardTexts: orderScan.orderCardTexts,
                        elapsedSeconds: elapsedSec,
                        mode: "order-scan",
                        apiPostResponses: apiPostResponses.slice(0, 5),
                    },
                });
            }

            await page.waitForTimeout(SUNO_DELAYS.pollIntervalMs);
            continue;
        }

        const strictMode = expectedSongUUIDs && expectedSongUUIDs.size >= 2;
        // Find all menu buttons which are reliable anchors for song cards
        const menuButtons = await page.$$(SELECTORS.SONG_MENU_BUTTON);

        // Count NEW songs found in this iteration
        let newSongsThisRound = 0;

        // Clear diagnostic texts for fresh collection each iteration
        diagnosticCardTexts.length = 0;
        orderCardTexts.length = 0;

        // Check ALL buttons to find actual songs
        for (const button of menuButtons) {
            // Extract text directly to avoid handle issues
            const text = await getCardTextFromMenuButton(button);

            // Collect card texts for diagnostic (all cards, not just songs)
            if (text.length > 10) {
                diagnosticCardTexts.push(text);

                // Specifically track cards for THIS order
                if (matchesOrderIdInText(text, orderId)) {
                    const hasDuration = SELECTORS.DURATION_REGEX.test(text);
                    const statusIndicator = hasDuration ? "✅ PRONTA" : "⏳ GERANDO";
                    orderCardTexts.push(`${statusIndicator}: ${text.slice(0, 60).replace(/\n/g, " ")}`);
                }
            }

            // Skip playlists
            if (isPlaylistText(text)) {
                continue;
            }

            // Check if this is a ready song
            if (isGeneratedSongText(text)) {
                // Use song identifier to track unique songs
                const songId = getSongIdentifier(text);

                // Skip if this song existed BEFORE we clicked Create (old song)
                if (existingSongIds.has(songId)) {
                    continue;
                }

                // Skip if we already found this exact new song
                if (!strictMode && foundNewSongIds.has(songId)) {
                    newSongsThisRound++;
                    if (foundNewSongIds.size >= 2) break;
                    continue;
                }

                // This is a NEW song!

                // STRICT MODE CHECK
                if (strictMode) {
                    const uuid = await getSongIdFromCard(page, button);
                    if (uuid && expectedSongUUIDs.has(uuid)) {
                        // Mark as found and increment our round counter
                        if (!foundExpectedUUIDs.has(uuid)) {
                            foundExpectedUUIDs.add(uuid);
                            console.log(`[Suno Service] ✓ VERIFIED song ready: "${text.slice(0, 40)}..." (UUID: ${uuid})`);
                        }
                        newSongsThisRound++;
                        if (foundExpectedUUIDs.size >= 2) break;
                        continue;
                    } else {
                        // This is a new song content-wise, but doesn't match our expected UUIDs
                        // It might be a different generation finishing up?
                        // Ignore it in strict mode
                        continue;
                    }
                }

                // LEGACY MODE (Fallback)
                if (!foundNewSongIds.has(songId)) {
                    foundNewSongIds.add(songId);
                    console.log(`[Suno Service] ✓ NEW song ready: "${text.slice(0, 60).replace(/\n/g, ' ')}..." (id: ${songId})`);
                }
                newSongsThisRound++;
            }

            // Stop early once we already have 2 songs
            if ((strictMode ? foundExpectedUUIDs.size : foundNewSongIds.size) >= 2 || newSongsThisRound >= 2) break;
        }

        const readyCount = strictMode
            ? Math.min(foundExpectedUUIDs.size, 2)
            : Math.min(foundNewSongIds.size, 2);

        if (readyCount >= 2) {
            console.log(`[Suno Service] 🎵 ${readyCount} songs are ready!`);
            return readyCount;
        }

        // Check for error messages
        const errorElement = await page.$(SELECTORS.ERROR_MESSAGE);
        if (errorElement && await errorElement.isVisible()) {
            const errorText = await errorElement.textContent();
            console.error(`[Suno Service] Error during generation: ${errorText}`);
            if (errorText?.toLowerCase().includes("failed") || errorText?.toLowerCase().includes("error")) {
                throw new Error(`Generation failed: ${errorText}`);
            }
        }

        // Log progress every 30 seconds OR when count changes
        const now = Date.now();
        if (now - lastLogTime >= 30000 || readyCount !== lastReadyCount) {
            const elapsedSec = Math.round((now - startTime) / 1000);
            console.log(`[Suno Service] [${elapsedSec}s] Songs ready: ${readyCount}/2, waiting... (menu buttons: ${menuButtons.length}, cards collected: ${diagnosticCardTexts.length})`);
            lastLogTime = now;
            lastReadyCount = readyCount;
        }

        // Send diagnostic update every 60 seconds
        const elapsedMs = now - startTime;
        if (now - lastDiagnosticTime >= 60000) {
            lastDiagnosticTime = now;
            const elapsedSec = Math.round(elapsedMs / 1000);

            // Send progress diagnostic to Telegram
            await sendSunoDetectionDiagnostic({
                orderId,
                recipientName,
                genre,
                phase: `PROGRESSO - ${elapsedSec}s`,
                details: {
                    expectedUUIDs: expectedSongUUIDs ? Array.from(expectedSongUUIDs) : [],
                    existingSongIds: existingSongIds.size,
                    menuButtonsFound: menuButtons.length,
                    cardTexts: diagnosticCardTexts.slice(0, 5),
                    orderCardTexts: orderCardTexts.slice(0, 4),
                    elapsedSeconds: elapsedSec,
                    mode: expectedSongUUIDs && expectedSongUUIDs.size > 0 ? "strict" : "legacy",
                    apiPostResponses: apiPostResponses.slice(0, 5),
                },
            });
        }

        // Fallback: If strict mode hasn't found any songs after 60s, switch to legacy mode
        if (expectedSongUUIDs && expectedSongUUIDs.size >= 2 && foundExpectedUUIDs.size < 2 && elapsedMs > 60000) {
            console.warn(`[Suno Service] ⚠️ Strict mode timeout after 60s, falling back to legacy discovery mode`);
            expectedSongUUIDs.clear(); // Clear to disable strict mode and use legacy detection
        }

        // Wait before next check
        await page.waitForTimeout(SUNO_DELAYS.pollIntervalMs);
    }

    // Timeout - send final diagnostic
    const finalElapsedSec = Math.round((Date.now() - startTime) / 1000);
    const menuButtons = await page.$$(SELECTORS.SONG_MENU_BUTTON);

    await sendSunoDetectionDiagnostic({
        orderId,
        recipientName,
        genre,
        phase: lastReadyCount > 0 ? `TIMEOUT - ${lastReadyCount} música(s) encontrada(s)` : "FALHA - Nenhuma música detectada",
        details: {
            expectedUUIDs: expectedSongUUIDs ? Array.from(expectedSongUUIDs) : [],
            existingSongIds: existingSongIds.size,
            menuButtonsFound: menuButtons.length,
            cardTexts: diagnosticCardTexts.slice(0, 5),
            orderCardTexts: orderCardTexts.slice(0, 4),
            elapsedSeconds: finalElapsedSec,
            mode: expectedSongUUIDs && expectedSongUUIDs.size > 0 ? "strict" : "legacy",
            apiPostResponses: apiPostResponses.slice(0, 5),
        },
    });

    // Timeout - but if we have at least 1 song, return that
    if (lastReadyCount > 0) {
        console.warn(`[Suno Service] ⚠️ Timeout waiting for 2 songs. Proceeding with ${lastReadyCount} song(s).`);
    } else {
        console.warn(`[Suno Service] ❌ Timeout - no songs found.`);
    }
    return lastReadyCount;
}

interface WaitForOrderSongsParams {
    page: Page;
    orderId: string;
    recipientName: string;
    genre: string;
}

async function waitForOrderSongsReady(params: WaitForOrderSongsParams): Promise<number> {
    const { page, orderId, recipientName, genre } = params;

    console.log(`[Suno Service] Waiting for existing order songs to be ready... (Order: ${orderId})`);

    const startTime = Date.now();
    let lastReadyCount = 0;
    let lastLogTime = 0;
    let lastDiagnosticTime = 0;

    // Give the page a moment to load cards
    await page.waitForTimeout(SUNO_DELAYS.existingSongsInitialWaitMs);

    while (Date.now() - startTime < TIMEOUTS.SONG_GENERATION) {
        const scan = await scanOrderSongCards(page, orderId);
        const readyCount = scan.readyCount;

        if (readyCount >= 2) {
            console.log(`[Suno Service] 🎵 ${readyCount} existing order songs are ready!`);
            return readyCount;
        }

        // Check for error messages
        const errorElement = await page.$(SELECTORS.ERROR_MESSAGE);
        if (errorElement && await errorElement.isVisible()) {
            const errorText = await errorElement.textContent();
            console.error(`[Suno Service] Error during existing song wait: ${errorText}`);
            if (errorText?.toLowerCase().includes("failed") || errorText?.toLowerCase().includes("error")) {
                throw new Error(`Generation failed: ${errorText}`);
            }
        }

        const now = Date.now();
        if (now - lastLogTime >= 30000 || readyCount !== lastReadyCount) {
            const elapsedSec = Math.round((now - startTime) / 1000);
            console.log(`[Suno Service] [${elapsedSec}s] Existing order songs ready: ${readyCount}/2, waiting... (menu buttons: ${scan.menuButtonsFound}, matching cards: ${scan.matchingCards})`);
            lastLogTime = now;
            lastReadyCount = readyCount;
        }

        if (now - lastDiagnosticTime >= 60000) {
            lastDiagnosticTime = now;
            const elapsedSec = Math.round((now - startTime) / 1000);

            await sendSunoDetectionDiagnostic({
                orderId,
                recipientName,
                genre,
                phase: `REUSO - PROGRESSO - ${elapsedSec}s`,
                details: {
                    menuButtonsFound: scan.menuButtonsFound,
                    cardTexts: scan.cardTexts,
                    orderCardTexts: scan.orderCardTexts,
                    elapsedSeconds: elapsedSec,
                },
            });
        }

        await page.waitForTimeout(SUNO_DELAYS.pollIntervalMs);
    }

    const finalElapsedSec = Math.round((Date.now() - startTime) / 1000);
    const finalScan = await scanOrderSongCards(page, orderId);

    await sendSunoDetectionDiagnostic({
        orderId,
        recipientName,
        genre,
        phase: lastReadyCount > 0 ? `REUSO - TIMEOUT - ${lastReadyCount} música(s) encontrada(s)` : "REUSO - FALHA - Nenhuma música detectada",
        details: {
            menuButtonsFound: finalScan.menuButtonsFound,
            cardTexts: finalScan.cardTexts,
            orderCardTexts: finalScan.orderCardTexts,
            elapsedSeconds: finalElapsedSec,
        },
    });

    if (lastReadyCount > 0) {
        console.warn(`[Suno Service] ⚠️ Timeout waiting for 2 existing songs. Proceeding with ${lastReadyCount} song(s).`);
    } else {
        console.warn(`[Suno Service] ❌ Timeout - no existing order songs found.`);
    }

    return lastReadyCount;
}

/**
 * Find menu buttons for NEW songs only (not playlists, not old songs)
 */
async function findSongMenuButtons(page: Page, existingSongIds: Set<string>, expectedSongUUIDs?: Set<string>): Promise<Awaited<ReturnType<Page["$$"]>>> {
    const menuButtons = await page.$$(SELECTORS.SONG_MENU_BUTTON);
    const songButtons: Awaited<ReturnType<Page["$$"]>> = [];
    const foundSongKeys = new Set<string>();
    const strictUuidMode = Boolean(expectedSongUUIDs && expectedSongUUIDs.size >= 2);

    const findMenuButtonByUuid = async (uuid: string): Promise<Awaited<ReturnType<Page["$"]>> | null> => {
        const lower = uuid.toLowerCase();
        const linkCandidates = await page.$$(`a[href*="/song/${lower}"]`);

        for (const link of linkCandidates) {
            try {
                const cardHandle = await link.evaluateHandle((el, cardSel) => el.closest(cardSel), SELECTORS.SONG_CARD);
                const card = cardHandle.asElement();
                if (!card) continue;

                try {
                    await card.scrollIntoViewIfNeeded();
                } catch {
                    // ignore
                }

                const cardText = await getCardTextFromCard(card);
                if (!cardText || isPlaylistText(cardText) || !isGeneratedSongText(cardText)) {
                    continue; // Not a ready song card.
                }

                const cardUuid = await getSongIdFromCardElement(card);
                if (!cardUuid || cardUuid.toLowerCase() !== lower) {
                    continue;
                }

                const menu = await card.$(SELECTORS.SONG_MENU_BUTTON);
                if (menu) {
                    try {
                        if (await menu.isVisible()) return menu;
                    } catch {
                        // ignore
                    }
                }

                const fallbackMenu = await card.$('button[data-context-menu-trigger="true"], button[aria-haspopup="menu"], [data-testid="more-button"]');
                if (fallbackMenu) {
                    try {
                        if (await fallbackMenu.isVisible()) return fallbackMenu;
                    } catch {
                        // ignore
                    }
                }
            } catch {
                // ignore transient DOM errors
            }
        }

        return null;
    };

    if (strictUuidMode) {
        const expected = Array.from(expectedSongUUIDs!);
        const resolved: Array<NonNullable<Awaited<ReturnType<Page["$"]>>>> = [];

        for (const uuid of expected) {
            const menu = await findMenuButtonByUuid(uuid);
            if (menu) {
                resolved.push(menu);
            } else {
                console.warn(`[Suno Service] Strict UUID mode: could not resolve menu button for song ${uuid}`);
            }
        }

        if (resolved.length >= 2) {
            console.log(`[Suno Service] Strict UUID mode: resolved ${resolved.length} menu button(s) via UUID anchors.`);
            return resolved.slice(0, 2);
        }

        console.warn(`[Suno Service] Strict UUID mode: resolved only ${resolved.length} menu button(s), falling back to legacy scanning...`);
    }

    console.log(`[Suno Service] Scanning ${menuButtons.length} menu buttons to find NEW songs (ignoring ${existingSongIds.size} old songs)...`);

    for (let index = 0; index < menuButtons.length; index++) {
        const button = menuButtons[index];
        if (!button) continue;
        const text = await getCardTextFromMenuButton(button);

        // Skip playlists, only include actual songs
        if (!isPlaylistText(text) && isGeneratedSongText(text)) {
            const cardUuid = await getSongIdFromCard(page, button);

            // In strict mode, only accept the two UUIDs returned by the generation API.
            if (strictUuidMode) {
                if (!cardUuid || !expectedSongUUIDs!.has(cardUuid)) {
                    continue;
                }
            }

            const songId = strictUuidMode ? "" : getSongIdentifier(text);

            // Skip OLD songs that existed before Create (legacy mode only).
            if (!strictUuidMode && existingSongIds.has(songId)) {
                continue;
            }

            const dedupeKey = cardUuid
                ? `uuid:${cardUuid}`
                : `legacy:${songId}:menu:${index}`;

            // Skip duplicates
            if (foundSongKeys.has(dedupeKey)) {
                continue;
            }

            foundSongKeys.add(dedupeKey);
            songButtons.push(button);
            console.log(`[Suno Service] Found NEW downloadable song ${songButtons.length}: "${text.slice(0, 40).replace(/\n/g, ' ')}..." (id: ${cardUuid || songId})`);
            if (songButtons.length >= 2) break; // Only need 2
        }
    }

    if (songButtons.length < 2) {
        const cards = await page.$$(SELECTORS.SONG_CARD);
        for (let index = 0; index < cards.length; index++) {
            const card = cards[index];
            if (!card) continue;
            const text = await getCardTextFromCard(card);
            if (!isPlaylistText(text) && isGeneratedSongText(text)) {
                const uuid = await getSongIdFromCardElement(card);

                if (strictUuidMode) {
                    if (!uuid || !expectedSongUUIDs!.has(uuid)) {
                        continue;
                    }
                }

                const songId = strictUuidMode ? "" : getSongIdentifier(text);

                if (!strictUuidMode && existingSongIds.has(songId)) {
                    continue;
                }

                const dedupeKey = uuid
                    ? `uuid:${uuid}`
                    : `legacy:${songId}:card:${index}`;

                if (foundSongKeys.has(dedupeKey)) {
                    continue;
                }

                const menuButton = await findMenuButtonFromCard(card);
                if (!menuButton) continue;

                foundSongKeys.add(dedupeKey);
                songButtons.push(menuButton);
                console.log(`[Suno Service] Found NEW downloadable song ${songButtons.length} (card fallback): "${text.slice(0, 40).replace(/\n/g, " ")}..." (id: ${uuid || songId})`);
                if (songButtons.length >= 2) break;
            }
        }
    }

    // STRICT MODE FILTER
    if (expectedSongUUIDs && expectedSongUUIDs.size >= 2) {
        console.log(`[Suno Service] Filtering found songs by expected UUIDs: ${Array.from(expectedSongUUIDs).join(", ")}`);
        const verifiedButtons = [];
        for (const button of songButtons) {
            const uuid = await getSongIdFromCard(page, button);
            if (uuid && expectedSongUUIDs.has(uuid)) {
                verifiedButtons.push(button);
                console.log(`[Suno Service] ✓ Button matched UUID ${uuid}`);
            }
        }
        console.log(`[Suno Service] Verified ${verifiedButtons.length} song buttons.`);
        return verifiedButtons;
    }

    console.log(`[Suno Service] Total NEW downloadable songs found: ${songButtons.length}`);
    return songButtons;
}

/**
 * Download a song as MP3 buffer
 * @param page - Playwright page
 * @param songIndex - Index of the song to download (0 or 1)
 * @param existingSongIds - Set of song IDs that existed before generation (to exclude)
 * @param preSelectedButton - Optional: pre-selected menu button to avoid re-searching
 */
/**
 * Download a song as MP3 buffer
 * @param page - Playwright page
 * @param songIndex - Index of the song to download (0 or 1)
 * @param existingSongIds - Set of song IDs that existed before generation (to exclude)
 * @param expectedSongUUIDs - Set of song IDs to STRICTLY match (optional)
 * @param preSelectedButton - Optional: pre-selected menu button to avoid re-searching
 */
async function downloadSong(
    page: Page,
    songIndex: number,
    existingSongIds: Set<string>,
    expectedSongUUIDs?: Set<string>,
    preSelectedButton?: Awaited<ReturnType<Page["$"]>>,
    orderIdForVerification?: string
): Promise<Buffer | null> {
    let didAttachRequestListener = false;
    const captureRequest = (request: { url: () => string }) => {
        // `cdnUrl` is scoped inside `downloadSong`; reset per invocation.
        const url = request.url();
        if (url.includes(".mp3") || url.includes("cdn") && url.includes("audio")) {
            console.log(`[Suno Service] Captured audio URL: ${url}`);
            cdnUrl = url;
        }
    };
    // `cdnUrl` must be declared before `captureRequest` runs.
    let cdnUrl: string | null = null;

    const safePressEscape = async () => {
        try {
            // Never press Escape while a CAPTCHA dialog is present (it can dismiss it).
            if (await checkForCaptcha(page)) {
                return;
            }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(SUNO_DELAYS.escapeMenuMs);
        } catch {
            // ignore
        }
    };

    try {
        console.log(`[Suno Service] Downloading song ${songIndex + 1}...`);

        if (await checkForCaptcha(page)) {
            console.warn(`[Suno Service] CAPTCHA still present before downloading song ${songIndex + 1}.`);
            return null;
        }

        let menuButton = preSelectedButton;

        // Only search for buttons if not provided
        if (!menuButton) {
            console.log(`[Suno Service] No pre-selected button, searching for song ${songIndex + 1}...`);
            const songButtons = await findSongMenuButtons(page, existingSongIds, expectedSongUUIDs);

            if (songIndex >= songButtons.length) {
                console.error(`[Suno Service] Song ${songIndex + 1} not found. Only ${songButtons.length} song buttons found (after filtering playlists)`);
                return null;
            }

            menuButton = songButtons[songIndex];
        }

        if (!menuButton) {
            console.error(`[Suno Service] Menu button at index ${songIndex} is undefined`);
            return null;
        }

        const strictUuidMode = Boolean(expectedSongUUIDs && expectedSongUUIDs.size >= 2);
        const cardText = await getCardTextFromMenuButton(menuButton);
        const cardUuid = await getSongIdFromCard(page, menuButton);

        // Safety: refuse to download if we can't confidently associate the card to this order/generation.
        if (strictUuidMode) {
            const uuidMatches = Boolean(cardUuid && expectedSongUUIDs!.has(cardUuid));
            const orderTextMatches = Boolean(orderIdForVerification && matchesOrderIdInText(cardText, orderIdForVerification));

            if (!uuidMatches && !orderTextMatches) {
                console.error(
                    `[Suno Service] Refusing to download song ${songIndex + 1}: UUID/order mismatch. ` +
                    `uuid=${cardUuid ?? "null"} expectedCount=${expectedSongUUIDs!.size} orderId=${orderIdForVerification ?? "n/a"} ` +
                    `cardText="${cardText.slice(0, 120).replace(/\\s+/g, " ")}"`
                );
                await takeScreenshot(page, `error-download-mismatch-${orderIdForVerification ?? "unknown"}-${songIndex + 1}`);
                return null;
            }
        } else if (orderIdForVerification) {
            if (!cardText) {
                console.error(
                    `[Suno Service] Refusing to download song ${songIndex + 1}: could not read card text for order verification (order ${orderIdForVerification}).`
                );
                await takeScreenshot(page, `error-download-no-card-text-${orderIdForVerification}-${songIndex + 1}`);
                return null;
            }
            if (!matchesOrderIdInText(cardText, orderIdForVerification)) {
                console.error(
                    `[Suno Service] Refusing to download song ${songIndex + 1}: card text does not match order ${orderIdForVerification}. ` +
                    `uuid=${cardUuid ?? "null"} cardText="${cardText.slice(0, 120).replace(/\\s+/g, " ")}"`
                );
                await takeScreenshot(page, `error-download-order-mismatch-${orderIdForVerification}-${songIndex + 1}`);
                return null;
            }
        }

        // Extra guard: we only expect ready song cards here.
        if (cardText && (isPlaylistText(cardText) || !isGeneratedSongText(cardText))) {
            console.error(
                `[Suno Service] Refusing to download song ${songIndex + 1}: selected card is not a ready song. ` +
                `order=${orderIdForVerification ?? "n/a"} uuid=${cardUuid ?? "null"} ` +
                `cardText="${cardText.slice(0, 120).replace(/\\s+/g, " ")}"`
            );
            await takeScreenshot(page, `error-download-not-ready-${orderIdForVerification ?? "unknown"}-${songIndex + 1}`);
            return null;
        }

        // Scroll into view
        await menuButton.scrollIntoViewIfNeeded();
        await page.waitForTimeout(SUNO_DELAYS.downloadScrollSettleMs);

        // Set up network listener to capture CDN URLs
        page.on("request", captureRequest);
        didAttachRequestListener = true;

        // Click the menu button directly
        console.log(`[Suno Service] Clicking menu button for song ${songIndex + 1}`);
        if (await checkForCaptcha(page)) {
            console.warn(`[Suno Service] CAPTCHA still present before opening menu for song ${songIndex + 1}.`);
            return null;
        }
        // Do not force clicks here: it can click "through" modals and close them.
        try {
            await menuButton.click({ timeout: 5000 });
        } catch (e) {
            // Fallback: some Suno UI states make buttons "not clickable" due to overlays/animations.
            // Only force-click after confirming no CAPTCHA is present.
            console.warn(`[Suno Service] Menu click failed for song ${songIndex + 1}, retrying with force...`, e);
            if (await checkForCaptcha(page)) return null;
            await menuButton.click({ force: true, timeout: 5000 });
        }
        await page.waitForTimeout(SUNO_DELAYS.menuOpenMs); // Wait for menu to appear

        const tryClickDownload = async () => {
            let downloadButton = await page.$('button:has-text("Download")');
            if (!downloadButton) {
                downloadButton = await page.$('[role="menuitem"]:has-text("Download")');
            }
            if (!downloadButton) {
                downloadButton = await page.$(SELECTORS.DOWNLOAD_OPTION);
            }
            if (!downloadButton) {
                try {
                    const locator = page.getByRole("menuitem", { name: /download/i }).first();
                    if (await locator.count()) {
                        if (await checkForCaptcha(page)) return false;
                        try {
                            await locator.click({ timeout: 5000 });
                        } catch (e) {
                            console.warn("[Suno Service] Download locator click failed, retrying with force...", e);
                            if (await checkForCaptcha(page)) return false;
                            await locator.click({ force: true, timeout: 5000 });
                        }
                        return true;
                    }
                } catch {
                    // ignore
                }
                return false;
            }
            if (await downloadButton.isVisible()) {
                console.log("[Suno Service] Found Download option, clicking...");
                if (await checkForCaptcha(page)) return false;
                try {
                    await downloadButton.click({ timeout: 5000 });
                } catch (e) {
                    console.warn("[Suno Service] Download button click failed, retrying with force...", e);
                    if (await checkForCaptcha(page)) return false;
                    await downloadButton.click({ force: true, timeout: 5000 });
                }
                await page.waitForTimeout(SUNO_DELAYS.submenuOpenMs); // Wait for submenu
                return true;
            }
            return false;
        };

        let downloadClicked = await tryClickDownload();
        if (!downloadClicked && FAST_MODE) {
            // Fast mode may race the menu animation; wait once more and retry.
            await page.waitForTimeout(900);
            downloadClicked = await tryClickDownload();
        }
        if (!downloadClicked) {
            console.error("[Suno Service] Download option not found or not visible in menu");
            await takeScreenshot(page, `error-no-download-menu-${songIndex}`);
            page.off("request", captureRequest);
            return null;
        }

        const resolveMp3Button = async () => {
            let mp3Button = await page.$('button:has-text("MP3 Audio")');
            if (!mp3Button) {
                mp3Button = await page.$('button:has-text("MP3")');
            }
            if (!mp3Button) {
                mp3Button = await page.$('button:has-text("Audio")');
            }
            if (!mp3Button) {
                mp3Button = await page.$('[role="menuitem"]:has-text("MP3")');
            }
            if (!mp3Button) {
                mp3Button = await page.$('[role="menuitem"]:has-text("Audio")');
            }
            if (!mp3Button) {
                mp3Button = await page.$(SELECTORS.DOWNLOAD_MP3);
            }
            return mp3Button;
        };

        // Click MP3 option - try multiple selectors
        let mp3Button = await resolveMp3Button();
        if (!mp3Button || !(await mp3Button.isVisible())) {
            console.log("[Suno Service] MP3 option not visible, hovering Download to reveal submenu...");
            const downloadHoverTarget = await page.$(SELECTORS.DOWNLOAD_OPTION)
                ?? await page.$('[role="menuitem"]:has-text("Download")')
                ?? await page.$('button:has-text("Download")');
            if (downloadHoverTarget) {
                await downloadHoverTarget.hover();
                await page.waitForTimeout(SUNO_DELAYS.hoverSubmenuMs);
                mp3Button = await resolveMp3Button();
            }
        }

        if (mp3Button && await mp3Button.isVisible()) {
            console.log("[Suno Service] Found MP3 Audio option, clicking...");

            // Set up download handler BEFORE clicking
            const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUTS.DOWNLOAD_START });
            if (await checkForCaptcha(page)) {
                console.warn(`[Suno Service] CAPTCHA still present before clicking MP3 for song ${songIndex + 1}.`);
                return null;
            }
            try {
                await mp3Button.click({ timeout: 5000 });
            } catch (e) {
                console.warn(`[Suno Service] MP3 click failed for song ${songIndex + 1}, retrying with force...`, e);
                if (await checkForCaptcha(page)) return null;
                await mp3Button.click({ force: true, timeout: 5000 });
            }

            try {
                const download = await downloadPromise;
                // 1) Preferred: read from Playwright-managed download path.
                try {
                    const downloadPath = await download.path();
                    if (downloadPath) {
                        const fs = await import("fs/promises");
                        const buffer = await fs.readFile(downloadPath);
                        console.log(`[Suno Service] Song ${songIndex + 1} downloaded via event (${buffer.length} bytes)`);
                        return buffer;
                    }
                } catch (e) {
                    console.warn(`[Suno Service] Download path unavailable for song ${songIndex + 1}:`, e);
                }

                // 2) Fallback: force-save to a known temp path (covers CDP/persistent edge cases).
                try {
                    const [fs, os, path] = await Promise.all([
                        import("fs/promises"),
                        import("os"),
                        import("path"),
                    ]);
                    const tmpPath = path.join(
                        os.tmpdir(),
                        `hs-suno-${orderIdForVerification ?? "unknown"}-${songIndex + 1}-${Date.now()}.mp3`
                    );
                    await download.saveAs(tmpPath);
                    const buffer = await fs.readFile(tmpPath);
                    await fs.unlink(tmpPath).catch(() => {});
                    console.log(`[Suno Service] Song ${songIndex + 1} downloaded via saveAs (${buffer.length} bytes)`);
                    return buffer;
                } catch (e) {
                    console.warn(`[Suno Service] Download saveAs failed for song ${songIndex + 1}:`, e);
                }

                // 3) Fallback: stream read (when available).
                try {
                    const stream = await (download as any).createReadStream?.();
                    if (stream) {
                        const chunks: Buffer[] = [];
                        await new Promise<void>((resolve, reject) => {
                            stream.on("data", (chunk: Buffer | Uint8Array) => {
                                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                            });
                            stream.on("end", () => resolve());
                            stream.on("error", (err: unknown) => reject(err));
                        });
                        const buffer = Buffer.concat(chunks);
                        console.log(`[Suno Service] Song ${songIndex + 1} downloaded via stream (${buffer.length} bytes)`);
                        return buffer;
                    }
                } catch (e) {
                    console.warn(`[Suno Service] Download stream read failed for song ${songIndex + 1}:`, e);
                }

                // 4) Last resort: fetch the download URL / captured CDN URL without clicking again.
                const downloadUrl = typeof (download as any).url === "function" ? (download as any).url() : null;
                if (downloadUrl) {
                    try {
                        const response = await fetch(downloadUrl);
                        if (response.ok) {
                            const buffer = Buffer.from(await response.arrayBuffer());
                            console.log(`[Suno Service] Song ${songIndex + 1} downloaded via download.url() (${buffer.length} bytes)`);
                            return buffer;
                        }
                    } catch (e) {
                        console.warn(`[Suno Service] download.url() fetch failed for song ${songIndex + 1}:`, e);
                    }
                }

                // Wait briefly for the request listener to capture a CDN URL.
                await page.waitForTimeout(SUNO_DELAYS.cdnFallbackMs);
                if (cdnUrl) {
                    console.log(`[Suno Service] Fetching from CDN: ${cdnUrl}`);
                    try {
                        const response = await fetch(cdnUrl);
                        if (response.ok) {
                            const buffer = Buffer.from(await response.arrayBuffer());
                            console.log(`[Suno Service] Song ${songIndex + 1} downloaded via CDN (${buffer.length} bytes)`);
                            return buffer;
                        }
                    } catch (e) {
                        console.error(`[Suno Service] CDN fetch failed:`, e);
                    }
                }
            } catch (downloadError) {
                console.warn(`[Suno Service] Download event timeout, trying CDN URL...`);
                await takeScreenshot(page, `download-timeout-${songIndex}`);

                // Wait a bit more for network request
                await page.waitForTimeout(SUNO_DELAYS.cdnFallbackMs);

                // Try to fetch from captured CDN URL
                if (cdnUrl) {
                    console.log(`[Suno Service] Fetching from CDN: ${cdnUrl}`);
                    try {
                        const response = await fetch(cdnUrl);
                        if (response.ok) {
                            const buffer = Buffer.from(await response.arrayBuffer());
                            console.log(`[Suno Service] Song ${songIndex + 1} downloaded via CDN (${buffer.length} bytes)`);
                            return buffer;
                        }
                    } catch (fetchError) {
                        console.error(`[Suno Service] CDN fetch failed:`, fetchError);
                    }
                }
            }
        } else {
            console.error(`[Suno Service] MP3 Audio option not found or not visible`);
            await takeScreenshot(page, `error-no-mp3-option-${songIndex}`);
        }

        return null;
    } catch (error) {
        console.error(`[Suno Service] Error downloading song ${songIndex + 1}:`, error);
        return null;
    } finally {
        if (didAttachRequestListener) {
            page.off("request", captureRequest);
        }
        await safePressEscape();
    }
}

/**
 * Main function to generate songs on Suno
 */
export async function generateSongs(params: SunoGenerationParams): Promise<SunoGenerationResult> {
    const { orderId, lyrics, genre, locale, vocals, recipientName } = params;
    const normalizedVocals = normalizeVocals(vocals);

    console.log(`[Suno Service] Starting generation for order ${orderId}`);
    console.log(`[Suno Service] Genre: ${getGenreDisplayName(genre)}, Locale: ${locale}, Vocals: ${normalizedVocals}`);

    let page: Page | null = null;

    try {
        // Create page and navigate
        page = await createPage();
        const loggedIn = await navigateToCreate(page);

        if (!loggedIn) {
            return {
                success: false,
                songs: [],
                error: "Not logged in to Suno. Please update cookies.",
            };
        }

        // Check credits
        const credits = await checkCredits(page);
        const creditsRemaining = credits?.remaining;

        // Pre-check for existing songs of this order to avoid duplicate generations
        try {
            await page.waitForSelector(SELECTORS.SONG_MENU_BUTTON, { timeout: 8000 });
        } catch {
            // Ignore if no cards are visible yet
        }

        let existingOrderScan = await scanOrderSongCards(page, orderId, { useSearch: true });
        if (existingOrderScan.matchingCards === 0 && existingOrderScan.menuButtonsFound === 0) {
            await page.waitForTimeout(SUNO_DELAYS.scanRetryMs);
            existingOrderScan = await scanOrderSongCards(page, orderId, { useSearch: true });
        }

        const existingResult = await tryDownloadExistingOrderSongs({
            page,
            orderId,
            recipientName,
            genre,
            creditsRemaining,
            scan: existingOrderScan,
            sourceLabel: "create page",
        });
        if (existingResult) {
            return existingResult;
        }

        // Search in library using the search input to avoid duplicate generations
        const libraryScan = await searchLibraryForOrder(page, orderId);
        if (libraryScan) {
            const libraryResult = await tryDownloadExistingOrderSongs({
                page,
                orderId,
                recipientName,
                genre,
                creditsRemaining,
                scan: libraryScan,
                sourceLabel: "library",
            });
            if (libraryResult) {
                return libraryResult;
            }
        }

        // If we navigated away, return to create page
        if (!page.url().includes("/create")) {
            const backLoggedIn = await navigateToCreate(page);
            if (!backLoggedIn) {
                return {
                    success: false,
                    songs: [],
                    error: "Not logged in to Suno after library check. Please update cookies.",
                };
            }
        }

        // Fill in the form - add delays between steps
        const stylePrompt = await getSunoStylePrompt(genre, locale, normalizedVocals);

        await page.waitForTimeout(SUNO_DELAYS.stepDelayMs);
        if (!(await fillLyrics(page, lyrics))) {
            await takeScreenshot(page, `error-lyrics-${orderId}`);
            return {
                success: false,
                songs: [],
                creditsRemaining,
                error: "Failed to fill lyrics",
            };
        }

        await page.waitForTimeout(SUNO_DELAYS.stepDelayMs);
        if (!(await fillStyle(page, stylePrompt))) {
            await takeScreenshot(page, `error-style-${orderId}`);
            return {
                success: false,
                songs: [],
                creditsRemaining,
                error: "Failed to fill style",
            };
        }

        await page.waitForTimeout(SUNO_DELAYS.stepDelayMs);
        if (!(await setVocalGender(page, normalizedVocals))) {
            console.warn("[Suno Service] Could not set vocal gender, continuing...");
        }

        // Set Title (Optional but good for verification)
        await page.waitForTimeout(SUNO_DELAYS.stepDelayMs);
        await fillTitle(page, `Order #${orderId}`);

        // Safety: if this order already has cards (generating or ready), do NOT click Create again.
        // Suno truncates titles in the workspace list, so we re-scan here with the same matcher used elsewhere.
        const preCreateScan = await scanOrderSongCards(page, orderId, { useSearch: true });
        if (preCreateScan.matchingCards > 0) {
            console.warn(
                `[Suno Service] Found ${preCreateScan.matchingCards} existing card(s) for order ${orderId} before clicking Create. Reusing instead of generating again.`
            );
            const preCreateReuse = await tryDownloadExistingOrderSongs({
                page,
                orderId,
                recipientName,
                genre,
                creditsRemaining,
                scan: preCreateScan,
                sourceLabel: "pre-create-safety",
            });
            if (preCreateReuse) {
                return preCreateReuse;
            }
        }

        // Take screenshot before clicking create
        await takeScreenshot(page, `before-create-${orderId}`);

        // IMPORTANT: Capture existing song IDs BEFORE clicking Create
        // This prevents detecting old songs as new ones
        const existingSongIds = await getExistingSongIds(page);

        // INTERCEPT API RESPONSE TO GET REAL IDs
        const expectedSongUUIDs = new Set<string>();
        const apiPostResponses: string[] = []; // Collect ALL POST responses for diagnostic
        let generateApiCaptured = ""; // Keep track of the generate API call specifically

        try {
            page.on("response", async (response) => {
                const url = response.url();
                const method = response.request().method();

                // DEBUG: Log ALL Suno POST responses for diagnostic
                if (url.includes("suno.com") && method === "POST") {
                    try {
                        const statusCode = response.status();
                        const urlPath = url.split("suno.com")[1] || url;
                        const debugEntry = `POST ${urlPath} [${statusCode}]`;
                        console.log(`[Suno API DEBUG] ${debugEntry}`);

                        // Keep the generate API call at the front of the array for visibility
                        if (urlPath.includes("/generate") || urlPath.includes("/create")) {
                            generateApiCaptured = debugEntry;
                            apiPostResponses.unshift(`🎵 ${debugEntry}`); // Add with emoji at front
                        } else {
                            apiPostResponses.push(debugEntry);
                        }

                        // For successful responses, try to capture body preview
                        if (statusCode === 200 || statusCode === 201) {
                            const contentType = response.headers()["content-type"] || "";
                            if (contentType.includes("application/json")) {
                                const text = await response.text();
                                if (text && text.length > 0) {
                                    const bodyPreview = text.slice(0, 200);
                                    console.log(`[Suno API DEBUG] Body preview: ${bodyPreview}`);
                                    apiPostResponses.push(`  Body: ${bodyPreview}`);

                                    // Try to parse and extract song IDs from ANY response with clips
                                    try {
                                        const data = JSON.parse(text);

                                        // DEBUG: Log structure for generate-related endpoints
                                        if (urlPath.includes("/generate") || urlPath.includes("/getcaptcha") || urlPath.includes("/create")) {
                                            console.log(`[Suno API DEBUG] ${urlPath} response keys: ${Object.keys(data).join(", ")}`);
                                            if (data.clips && data.clips[0]) {
                                                console.log(`[Suno API DEBUG] Clip[0] keys: ${Object.keys(data.clips[0]).join(", ")}`);
                                                console.log(`[Suno API DEBUG] Clip[0] sample: ${JSON.stringify(data.clips[0]).slice(0, 300)}`);
                                            }
                                        }

                                        // Check for clips in ANY response (Suno may return them from different endpoints)
                                        const clips = data.clips || data.clip_ids || (Array.isArray(data) ? data : null);

                                        if (clips && Array.isArray(clips) && clips.length > 0) {
                                            console.log(`[Suno Service] ✓ Found ${clips.length} clips in ${urlPath}`);
                                            clips.forEach((clip: any, index: number) => {
                                                // Try multiple possible UUID field names
                                                const possibleId = typeof clip === "string"
                                                    ? clip
                                                    : (clip.clip_id || clip.uuid || clip.song_id || clip.id);

                                                // Validate it looks like a UUID (36 chars with dashes)
                                                const isValidUUID = typeof possibleId === "string"
                                                    && possibleId.length >= 32
                                                    && possibleId.includes("-");

                                                if (possibleId && isValidUUID) {
                                                    const normalized = possibleId.toLowerCase();
                                                    console.log(`[Suno Service]   - Clip ${index}: UUID ${normalized}`);
                                                    expectedSongUUIDs.add(normalized);
                                                } else {
                                                    // Log all available keys to find the right field
                                                    const clipKeys = typeof clip === "object" ? Object.keys(clip).join(", ") : "N/A";
                                                    console.log(`[Suno Service]   - Clip ${index}: ID "${possibleId}" invalid. Keys: ${clipKeys}`);
                                                }
                                            });
                                            console.log(`[Suno Service] ✓ Total valid UUIDs captured: ${expectedSongUUIDs.size}`);
                                        }
                                    } catch (parseError) {
                                        // Non-JSON or parse error - just log for relevant endpoints
                                        if (urlPath.includes("/generate") || urlPath.includes("/clips") || urlPath.includes("/getcaptcha")) {
                                            console.warn(`[Suno Service] JSON parse failed for ${urlPath}`);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Silently continue - response body might be consumed
                        console.warn(`[Suno API DEBUG] Response read error for ${url}:`, e);
                    }
                }
            });
        } catch (e) {
            console.warn("[Suno Service] Failed to setup response listener", e);
        }

        // Final guard: ensure lyrics are still fully present right before Create.
        // Suno can re-render the composer and partially reset the field after we fill it.
        // Also verify Styles, otherwise cards can appear as "(no styles)".
        const verifyComposerBeforeCreate = async (p: Page) => {
            const resolved = await resolveComposerInputs(p);
            if (!resolved) return { lyricsOk: false, styleOk: false, resolved: null as null | typeof resolved };
            const lyricsOk = await verifyLyricsStrict(p, lyrics, resolved.lyricsEl, resolved.styleEl);
            const styleOk = await verifyStyleStrict(p, stylePrompt, resolved.styleEl, resolved.lyricsEl);
            return { lyricsOk, styleOk, resolved };
        };

        for (let attempt = 1; attempt <= 2; attempt++) {
            const { lyricsOk, styleOk } = await verifyComposerBeforeCreate(page);
            if (lyricsOk && styleOk) break;

            if (!lyricsOk) {
                console.warn("[Suno Service] Lyrics changed after fill; refilling before Create...");
                if (!(await fillLyrics(page, lyrics))) {
                    await takeScreenshot(page, `error-lyrics-final-${orderId}`);
                    return {
                        success: false,
                        songs: [],
                        creditsRemaining,
                        error: "Failed to verify lyrics before Create",
                    };
                }
            }

            if (!styleOk) {
                console.warn("[Suno Service] Style changed after fill; refilling before Create...");
                if (!(await fillStyle(page, stylePrompt))) {
                    await takeScreenshot(page, `error-style-final-${orderId}`);
                    return {
                        success: false,
                        songs: [],
                        creditsRemaining,
                        error: "Failed to verify style before Create",
                    };
                }
            }
        }

        const finalComposerCheck = await verifyComposerBeforeCreate(page);
        if (!finalComposerCheck.lyricsOk || !finalComposerCheck.styleOk) {
            await takeScreenshot(page, `error-composer-final-${orderId}`);
            return {
                success: false,
                songs: [],
                creditsRemaining,
                error: "Failed to verify composer fields before Create",
            };
        }

        // Click Create
        if (!(await clickCreate(page))) {
            await takeScreenshot(page, `error-create-${orderId}`);
            return {
                success: false,
                songs: [],
                creditsRemaining,
                error: "Failed to click Create button",
            };
        }

        // CAPTCHA modal can appear right after clicking Create.
        const captchaAfterCreate = await checkForCaptcha(page);
        if (captchaAfterCreate) {
            console.warn("[Suno Service] CAPTCHA remained after Create click. Continuing to monitor during generation.");
        }

        // Wait for NEW songs to be ready (limiting to the captured IDs if available)
        const songsReady = await waitForSongsReady({
            page,
            existingSongIds,
            expectedSongUUIDs,
            orderId,
            recipientName,
            genre,
            apiPostResponses,
        });

        if (songsReady === 0) {
            await takeScreenshot(page, `error-no-songs-${orderId}`);

            // Rescue pass: try to download any songs that were generated but not detected
            try {
                const rescueCreateScan = await scanOrderSongCards(page, orderId, { useSearch: true });
                const rescueCreateResult = await tryDownloadExistingOrderSongs({
                    page,
                    orderId,
                    recipientName,
                    genre,
                    creditsRemaining,
                    scan: rescueCreateScan,
                    sourceLabel: "create-rescue",
                });
                if (rescueCreateResult) {
                    return rescueCreateResult;
                }

                const rescueLibraryScan = await searchLibraryForOrder(page, orderId);
                if (rescueLibraryScan) {
                    const rescueLibraryResult = await tryDownloadExistingOrderSongs({
                        page,
                        orderId,
                        recipientName,
                        genre,
                        creditsRemaining,
                        scan: rescueLibraryScan,
                        sourceLabel: "library-rescue",
                    });
                    if (rescueLibraryResult) {
                        return rescueLibraryResult;
                    }
                }
            } catch (rescueError) {
                console.warn("[Suno Service] Rescue scan failed after no-songs detection:", rescueError);
            }

            return {
                success: false,
                songs: [],
                creditsRemaining,
                error: "No songs were generated",
            };
        }

        // Download both NEW songs (excluding old songs)
        const songs: { title: string; durationSeconds: number; mp3Buffer: Buffer }[] = [];

        // Pre-fetch song buttons ONCE before downloads to avoid re-searching
        console.log(`[Suno Service] Pre-fetching song buttons before download loop...`);
        const orderDownloadScan = await scanOrderSongCards(page, orderId, { useSearch: true });
        const strictUuidMode = Boolean(expectedSongUUIDs && expectedSongUUIDs.size >= 2);

        let songButtons = strictUuidMode
            ? await findSongMenuButtons(page, existingSongIds, expectedSongUUIDs)
            : (orderDownloadScan.readyButtons.length > 0
                ? orderDownloadScan.readyButtons
                : await findSongMenuButtons(page, existingSongIds, expectedSongUUIDs));

        if (strictUuidMode && songButtons.length < 2 && orderDownloadScan.readyButtons.length > 0) {
            console.warn(
                `[Suno Service] Strict UUID mode found only ${songButtons.length} song button(s). ` +
                `Falling back to order-scan buttons (${orderDownloadScan.readyButtons.length}).`
            );
            songButtons = orderDownloadScan.readyButtons;
        }
        console.log(`[Suno Service] Found ${songButtons.length} song buttons to download`);

        for (let i = 0; i < Math.min(songsReady, 2); i++) {
            // Add delay between downloads to let UI stabilize
            if (i > 0) {
                console.log(`[Suno Service] Waiting 3s before downloading song ${i + 1}...`);
                await page.waitForTimeout(SUNO_DELAYS.betweenDownloadsMs);
            }

            let buffer: Buffer | null = null;
            let retries = 0;
            const maxRetries = 2;

            // Retry logic for downloads
            while (!buffer && retries < maxRetries) {
                const buttonToUse = songButtons[i];
                buffer = await downloadSong(page, i, existingSongIds, expectedSongUUIDs, buttonToUse, orderId);

                if (!buffer && retries < maxRetries - 1) {
                    console.warn(`[Suno Service] ⚠️ Download failed for song ${i + 1}, retry ${retries + 1}/${maxRetries - 1}...`);
                    await page.waitForTimeout(SUNO_DELAYS.downloadRetryMs);
                    // Re-fetch buttons in case UI changed
                    songButtons = await findSongMenuButtons(page, existingSongIds, expectedSongUUIDs);
                    retries++;
                } else if (!buffer) {
                    retries++;
                }
            }

            if (buffer) {
                songs.push({
                    title: `${recipientName} Song ${i + 1}`,
                    durationSeconds: 0, // We don't extract exact duration
                    mp3Buffer: buffer,
                });
                console.log(`[Suno Service] ✓ Song ${i + 1} downloaded successfully (${buffer.length} bytes)`);
            } else {
                console.error(`[Suno Service] ❌ FAILED to download song ${i + 1} after ${maxRetries} attempts`);
            }
        }

        // NOTE: We intentionally do NOT do a "final rescue search" after downloads anymore.
        // When a download succeeds in the browser but buffer extraction is flaky, rescue logic can
        // trigger extra downloads and confuse slot assignment. If we end up with only 1 song,
        // the order stays 1/2 and can be retried in a new run.

        // Check credits again after generation
        const finalCredits = await checkCredits(page);

        console.log(`[Suno Service] Generation complete. ${songs.length} songs downloaded.`);

        return {
            success: songs.length > 0,
            songs,
            creditsRemaining: finalCredits?.remaining,
            error: songs.length === 0 ? "No songs could be downloaded" : undefined,
        };
    } catch (error) {
        console.error("[Suno Service] Error during generation:", error);

        if (page) {
            await takeScreenshot(page, `error-exception-${orderId}`);
        }

        return {
            success: false,
            songs: [],
            error: error instanceof Error ? error.message : "Unknown error",
        };
    } finally {
        // Close page but keep browser/context for reuse
        if (page) {
            await page.close();
        }
    }
}

/**
 * Check if Suno session is valid (logged in)
 */
export async function checkSession(): Promise<boolean> {
    let page: Page | null = null;

    try {
        page = await createPage();
        const loggedIn = await navigateToCreate(page);
        return loggedIn;
    } catch (error) {
        console.error("[Suno Service] Error checking session:", error);
        return false;
    } finally {
        if (page) {
            await page.close();
        }
    }
}

// Re-export browser functions
export { closeBrowser, resetContext, getSunoAccountEmail } from "./browser";
export { getSunoStylePrompt, getGenreDisplayName, clearGenreCache, GENRE_STYLES, GENRE_DISPLAY_NAMES, GENRE_LOCALES } from "./genre-mapping";
export type { SunoGenerationParams, SunoGenerationResult, SunoCreditsInfo } from "./types";
