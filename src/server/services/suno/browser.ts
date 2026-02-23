/**
 * Patchright (Playwright) browser management for Suno AI automation
 */

import { chromium } from "patchright";
import type { Browser, BrowserContext, Page } from "patchright";
import { URLS, SELECTORS } from "./selectors";
import { sendCaptchaAlert } from "../../../lib/telegram";
import { isSunoFastMode } from "./config";
import path from "path";

const DEFAULT_AUTH_STATE_PATH = "./suno-auth-state.json";
const DEFAULT_USER_DATA_DIR = "./playwright-user-data";
const DEFAULT_AUTH_STATE_TMP_PATH = "/tmp/suno-auth-state.json";

function getSunoResourceBlockingMode(): "off" | "light" | "aggressive" {
    const raw = (process.env.SUNO_RESOURCE_BLOCKING || "").trim().toLowerCase();
    if (!raw) return "off";
    if (raw === "0" || raw === "false" || raw === "off" || raw === "none") return "off";
    if (raw === "1" || raw === "true" || raw === "light") return "light";
    if (raw === "aggressive") return "aggressive";
    return "light";
}

function shouldAllowMediaUrl(url: string): boolean {
    // If you choose aggressive mode, we still must allow actual song downloads.
    // Keep this permissive; worst case it doesn't save bandwidth, but it won't break downloads.
    const lower = url.toLowerCase();
    if (lower.includes("/download")) return true;
    if (lower.includes("content-disposition=attachment")) return true;
    if (lower.endsWith(".mp3") || lower.includes(".mp3?")) return true;
    if (lower.endsWith(".wav") || lower.includes(".wav?")) return true;
    if (lower.endsWith(".m4a") || lower.includes(".m4a?")) return true;
    if (lower.endsWith(".flac") || lower.includes(".flac?")) return true;
    if (lower.endsWith(".ogg") || lower.includes(".ogg?")) return true;
    if (lower.endsWith(".aac") || lower.includes(".aac?")) return true;
    return false;
}

function isLikelyCaptchaAssetUrl(url: string): boolean {
    const lower = url.toLowerCase();

    // hCaptcha
    if (lower.includes("hcaptcha.com")) return true;

    // reCAPTCHA (just in case Suno switches)
    if (lower.includes("recaptcha")) return true;
    if (lower.includes("gstatic.com/recaptcha")) return true;

    // Cloudflare Turnstile (just in case Suno switches)
    if (lower.includes("challenges.cloudflare.com")) return true;

    // Suno wrapper endpoints we already see in logs
    if (lower.includes("suno.com/captcha")) return true;
    if (lower.includes("/getcaptcha/")) return true;

    return false;
}

async function setupResourceBlocking(context: BrowserContext): Promise<void> {
    const mode = getSunoResourceBlockingMode();
    if (mode === "off") return;

    const blockTypes = new Set<string>(["image", "font"]);
    if (mode === "aggressive") {
        blockTypes.add("media");
    }

    console.log(`[Suno Browser] Resource blocking enabled: ${mode} (blocking: ${Array.from(blockTypes).join(", ")})`);

    await context.route("**/*", (route) => {
        const request = route.request();
        const type = request.resourceType();
        const url = request.url();

        if (!blockTypes.has(type)) {
            return route.continue();
        }

        // Never block captcha assets; otherwise manual solving becomes impossible.
        if (isLikelyCaptchaAssetUrl(url)) {
            return route.continue();
        }

        // Never block critical downloads even in aggressive mode.
        if (type === "media" && shouldAllowMediaUrl(url)) {
            return route.continue();
        }

        return route.abort();
    });
}

function getAuthStatePath(): string {
    return process.env.SUNO_AUTH_STATE_PATH || DEFAULT_AUTH_STATE_PATH;
}

function getAuthStateTmpPath(): string {
    return process.env.SUNO_AUTH_STATE_TMP_PATH || DEFAULT_AUTH_STATE_TMP_PATH;
}

function getUserDataDir(): string {
    return process.env.SUNO_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
}

// Singleton browser instance
let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;

// Avoid spamming Telegram or taking dozens of screenshots when a page is noisy.
let lastCaptchaAlertAt = 0;
let lastCaptchaScreenshotAt = 0;
let lastCaptchaSirenAt = 0;

/**
 * Get or create the browser instance
 */
export async function getBrowser(): Promise<Browser> {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const isProduction = process.env.NODE_ENV === "production";
    // Allow forcing headless mode via env var (useful for local background processing)
    const forceHeadless = envFlag(process.env.SUNO_HEADLESS);
    const headless = isProduction || forceHeadless;

    console.log(
        `[Suno Browser] Launching browser (headless: ${headless}, executablePath: ${executablePath || "default"})`
    );

    const launchArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
    ];

    // Allow WebAudio alerts to play without a real user gesture (used for CAPTCHA siren).
    if (!headless) {
        // When running with a visible browser locally, avoid a fixed 1920x1080 viewport that can overflow
        // smaller screens (eg. MacBook). We'll use a window-sized viewport and start maximized.
        launchArgs.push("--start-maximized");
        launchArgs.push("--autoplay-policy=no-user-gesture-required");
    }

    browserInstance = await chromium.launch({
        headless,
        executablePath: executablePath || undefined,
        args: launchArgs,
        ignoreDefaultArgs: ["--enable-automation"],
    });

    return browserInstance;
}

/**
 * Extract email from Suno JWT token in auth state
 */
function extractEmailFromAuthState(authStateContent: string): string | null {
    try {
        const state = JSON.parse(authStateContent);
        const cookies = state.cookies || [];

        // Find the __session cookie for .suno.com domain
        const sessionCookie = cookies.find((c: { name: string; domain: string; value: string }) =>
            c.name === "__session" && c.domain === ".suno.com"
        );

        if (!sessionCookie?.value) {
            return null;
        }

        // JWT is in format: header.payload.signature
        const parts = sessionCookie.value.split(".");
        if (parts.length !== 3) {
            return null;
        }

        // Decode the payload (base64url)
        const payload = Buffer.from(parts[1]!, "base64url").toString("utf-8");
        const claims = JSON.parse(payload);

        // Extract email from claims
        const email = claims["suno.com/claims/email"] || claims["https://suno.ai/claims/email"];
        if (email) {
            console.log(`[Suno Browser] Extracted account email: ${email}`);
            return email;
        }

        return null;
    } catch (error) {
        console.warn("[Suno Browser] Failed to extract email from auth state:", error);
        return null;
    }
}

// Cache the extracted email
let cachedSunoEmail: string | null = null;

/**
 * Get the current Suno account email (extracted from auth state)
 */
export function getSunoAccountEmail(): string | null {
    return cachedSunoEmail;
}

/**
 * Extract and cache email from auth state file (called once at startup)
 */
async function extractAndCacheEmail(): Promise<void> {
    if (cachedSunoEmail) return; // Already cached

    const fs = await import("fs/promises");

    // Check for base64-encoded state in env var
    const stateJson = process.env.SUNO_AUTH_STATE_JSON;
    if (stateJson) {
        try {
            const decoded = Buffer.from(stateJson, "base64").toString("utf-8");
            cachedSunoEmail = extractEmailFromAuthState(decoded);
            if (cachedSunoEmail) return;
        } catch (error) {
            console.error("[Suno Browser] Failed to parse SUNO_AUTH_STATE_JSON:", error);
        }
    }

    // Check for default auth state file in project root
    const statePath = getAuthStatePath();
    try {
        const content = await fs.readFile(statePath, "utf-8");
        cachedSunoEmail = extractEmailFromAuthState(content);
    } catch {
        // File doesn't exist or can't be read
    }
}

/**
 * Check if auth state file exists
 */
async function authStateExists(): Promise<string | null> {
    const fs = await import("fs/promises");

    // Check for base64-encoded state in env var
    const stateJson = process.env.SUNO_AUTH_STATE_JSON;
    if (stateJson) {
        try {
            // Write to temp file for Patchright/Playwright
            const tempPath = getAuthStateTmpPath();
            const decoded = Buffer.from(stateJson, "base64").toString("utf-8");
            // Ensure parent dir exists (cross-platform; supports relative ./tmp paths)
            await fs.mkdir(path.dirname(tempPath), { recursive: true }).catch(() => {});
            await fs.writeFile(tempPath, decoded);
            console.log("[Suno Browser] Using auth state from SUNO_AUTH_STATE_JSON");

            // Extract and cache email
            cachedSunoEmail = extractEmailFromAuthState(decoded);

            return tempPath;
        } catch (error) {
            console.error("[Suno Browser] Failed to parse SUNO_AUTH_STATE_JSON:", error);
        }
    }

    // Check for default auth state file in project root
    const statePath = getAuthStatePath();
    try {
        await fs.access(statePath);
        console.log(`[Suno Browser] Using auth state from ${statePath}`);

        // Extract and cache email
        const content = await fs.readFile(statePath, "utf-8");
        cachedSunoEmail = extractEmailFromAuthState(content);

        return statePath;
    } catch {
        return null;
    }
}

async function seedPersistentContext(context: BrowserContext, authStatePath: string): Promise<void> {
    try {
        const fs = await import("fs/promises");
        const raw = await fs.readFile(authStatePath, "utf-8");
        const state = JSON.parse(raw) as { cookies?: Parameters<BrowserContext["addCookies"]>[0]; origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }>; sessionStorage?: Array<{ name: string; value: string }> }> };

        if (state.cookies?.length) {
            await context.addCookies(state.cookies);
        }

        if (state.origins?.length) {
            await context.addInitScript((origins) => {
                const match = origins.find((entry) => entry.origin === window.location.origin);
                if (!match) return;
                if (match.localStorage) {
                    for (const item of match.localStorage) {
                        localStorage.setItem(item.name, item.value);
                    }
                }
                if (match.sessionStorage) {
                    for (const item of match.sessionStorage) {
                        sessionStorage.setItem(item.name, item.value);
                    }
                }
            }, state.origins);
        }
    } catch (error) {
        console.warn("[Suno Browser] Failed to seed persistent context from auth state:", error);
    }
}

/**
 * Get or create a browser context with Suno auth state
 */
export async function getContext(): Promise<BrowserContext> {
    // Always extract email from auth state file (even when using persistent context)
    await extractAndCacheEmail();

    if (contextInstance) {
        return contextInstance;
    }

    // CDP Support: Connect to existing Chrome instance if URL is provided
    const cdpUrl = process.env.SUNO_CHROME_CDP_URL;
    if (cdpUrl) {
        try {
            console.log(`[Suno Browser] Connecting to Chrome via CDP at ${cdpUrl}...`);
            const browser = await chromium.connectOverCDP(cdpUrl);
            const contexts = browser.contexts();
            if (contexts.length > 0) {
                contextInstance = contexts[0] || null;
                console.log("[Suno Browser] Connected to existing context via CDP");
            } else {
                console.log("[Suno Browser] No existing context found in CDP browser, creating new one...");
                // Note: For persistent Chrome profile, the default context is usually what we want,
                // but connectOverCDP might expose it differently depending on how it was launched.
                // Usually `connectOverCDP` gives us a browser where we can just use the default context.
                // If specific contexts are needed, we might need to handle that.
                // For now, let's assume the user wants to use the default profile window.
                // For now, let's assume the user wants to use the default profile window.
                const fallbackContext = await browser.newContext();
                contextInstance = browser.contexts()[0] || fallbackContext;
            }

            // Keep browser instance reference for cleanup (though closing CDP browser might act differently)
            browserInstance = browser;

            if (!contextInstance) {
                throw new Error("Could not obtain a valid context from CDP browser");
            }
            return contextInstance;
        } catch (error) {
            console.error("[Suno Browser] Failed to connect via CDP:", error);
            console.log("[Suno Browser] Falling back to standard launch...");
        }
    }

    const userDataDir = getUserDataDir();
    const isProduction = process.env.NODE_ENV === "production";
    const forceHeadless = envFlag(process.env.SUNO_HEADLESS);
    const headless = isProduction || forceHeadless;
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const authStatePath = await authStateExists();
    let hasPersistentState = false;
    const viewport = headless ? { width: 1920, height: 1080 } : null;

    try {
        const fs = await import("fs/promises");
        await fs.mkdir(userDataDir, { recursive: true });
        const entries = await fs.readdir(userDataDir);
        hasPersistentState = entries.length > 0;

        console.log(`[Suno Browser] Using persistent user data at ${userDataDir}${hasPersistentState ? "" : " (empty)"}, launching persistent context...`);
        if (hasPersistentState && authStatePath) {
            console.log(
                `[Suno Browser] Note: ${userDataDir} is not empty, so auth state (${authStatePath}) will NOT be applied. To switch accounts, use a different SUNO_USER_DATA_DIR (recommended) or delete this folder.`
            );
        }

        // Launch persistent context directly (it manages its own browser instance)
        contextInstance = await chromium.launchPersistentContext(userDataDir, {
            headless,
            executablePath: executablePath || undefined,
            viewport,
            acceptDownloads: true,
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
                ...(headless
                    ? []
                    : [
                          "--start-maximized",
                          // Allow WebAudio alerts to play without a real user gesture (used for CAPTCHA siren).
                          "--autoplay-policy=no-user-gesture-required",
                      ]),
            ],
            ignoreDefaultArgs: ["--enable-automation"],
        });

        if (!hasPersistentState && authStatePath) {
            await seedPersistentContext(contextInstance, authStatePath);
            console.log("[Suno Browser] Seeded persistent context with auth state");
        }

        await setupResourceBlocking(contextInstance);

        console.log("[Suno Browser] Persistent context created");
        return contextInstance;
    } catch (err) {
        console.log("[Suno Browser] Persistent user data not available, falling back to storageState...");
    }

    const browser = await getBrowser();

    if (authStatePath) {
        // Use saved auth state (includes cookies + localStorage + sessionStorage)
        contextInstance = await browser.newContext({
            viewport,
            acceptDownloads: true,
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale: "en-US",
            timezoneId: "America/New_York",
            storageState: authStatePath,
        });
        console.log("[Suno Browser] Context created with saved auth state");
    } else {
        // No auth state - create context without authentication
        console.warn("[Suno Browser] No auth state found. Run: npx tsx scripts/suno-login.ts");
        contextInstance = await browser.newContext({
            viewport,
            acceptDownloads: true,
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale: "en-US",
            timezoneId: "America/New_York",
        });
    }

    await setupResourceBlocking(contextInstance);

    return contextInstance;
}

/**
 * Create a new page for song generation
 */
export async function createPage(): Promise<Page> {
    const context = await getContext();
    const page = await context.newPage();

    // Set up console logging for debugging
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            console.error(`[Suno Page Console Error] ${msg.text()}`);
        }
    });

    // Set up request/response logging for debugging
    page.on("pageerror", (err) => {
        console.error(`[Suno Page Error] ${err.message}`);
    });

    return page;
}

/**
 * Navigate to Suno create page and verify login status
 */
export async function navigateToCreate(page: Page): Promise<boolean> {
    console.log("[Suno Browser] Navigating to create page...");

    const fastMode = isSunoFastMode();
    const settleMs = fastMode ? 1500 : 5000;

    try {
        await page.goto(URLS.CREATE, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
    } catch (error) {
        console.warn("[Suno Browser] Navigation timeout (domcontentloaded), trying to proceed anyway...");
    }

    // Wait for Clerk and other scripts to settle
    await page.waitForTimeout(settleMs);

    // Ensure the composer UI is mounted. Sometimes the page gets stuck on a blank loader,
    // and later steps fail to find inputs (lyrics/styles).
    const ensureComposerReady = async (): Promise<boolean> => {
        try {
            await page.waitForSelector(SELECTORS.CREATE_BUTTON, { state: "visible", timeout: 15000 });
            return true;
        } catch {
            return false;
        }
    };

    if (!(await ensureComposerReady())) {
        console.warn("[Suno Browser] Create UI not ready after initial load, reloading once...");
        try {
            await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        } catch {
            // ignore
        }
        await page.waitForTimeout(settleMs);
        await ensureComposerReady(); // best-effort
    }

    // Check if we were redirected to login
    const currentUrl = page.url();
    console.log(`[Suno Browser] Current URL after navigation: ${currentUrl}`);

    // Check for CAPTCHA immediately after navigation
    await checkForCaptcha(page);

    // If redirected to accounts.suno.com or sign-in, we are definitely not logged in
    if (currentUrl.includes("accounts.suno.com") || currentUrl.includes("/signin") || currentUrl.includes("/login")) {
        console.error("[Suno Browser] Redirected to login page - session expired or cookies missing");
        return false;
    }

    // Check for login indicator (if Sign in button is visible, we are logged out)
    const signInButton = await page.$(SELECTORS.LOGGED_OUT_INDICATOR);
    if (signInButton && await signInButton.isVisible()) {
        console.error("[Suno Browser] Not logged in - sign in button found");
        return false;
    }

    // Check for user avatar or credits display
    const userAvatar = await page.$(SELECTORS.USER_AVATAR);
    const creditsDisplay = await page.$(SELECTORS.CREDITS_DISPLAY);

    if (userAvatar || creditsDisplay) {
        console.log("[Suno Browser] Login verified (avatar or credits found)");
        return true;
    }

    // If we are on the create page and no sign-in button, assume logged in for now
    if (currentUrl.includes("/create")) {
        console.log("[Suno Browser] On create page, assuming logged in...");
        return true;
    }

    console.error(`[Suno Browser] Not on create page and login not verified. Current URL: ${currentUrl}`);
    return false;
}

/**
 * Check for CAPTCHA and handle it
 */
function extractCaptchaSiteKeyFromSrc(src: string | null): string | null {
    if (!src) {
        return null;
    }

    const normalized = src.replace("#", "?");
    const match = normalized.match(/[?&]sitekey=([^&]+)/i) || normalized.match(/[?&]siteKey=([^&]+)/i);
    if (!match?.[1]) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

function sanitizeCaptchaFrameSrc(src: string | null): string {
    if (!src) return "(no-src)";

    try {
        const url = new URL(src);
        const keys = Array.from(url.searchParams.keys()).slice(0, 8);
        const keySummary = keys.length > 0 ? `?${keys.join("&")}` : "";
        return `${url.origin}${url.pathname}${keySummary}`;
    } catch {
        // Fallback: strip query/hash and truncate.
        const clean = src.split(/[?#]/)[0] || src;
        return clean.slice(0, 200);
    }
}

function extractCaptchaRqDataFromSrc(src: string | null): string | null {
    if (!src) {
        return null;
    }

    const normalized = src.replace("#", "?");
    const match = normalized.match(/[?&]rqdata=([^&]+)/i);
    if (!match?.[1]) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

async function getCaptchaSiteKey(page: Page, captchaFrame: any): Promise<string | null> {
    const frameAttrSiteKey = await captchaFrame.getAttribute("data-sitekey");
    if (frameAttrSiteKey) {
        return frameAttrSiteKey;
    }

    const frameSrc = await captchaFrame.getAttribute("src");
    const siteKeyFromSrc = extractCaptchaSiteKeyFromSrc(frameSrc);
    if (siteKeyFromSrc) {
        return siteKeyFromSrc;
    }

    const siteKeyFromDom = await page.evaluate(() => {
        const candidates = [
            'iframe[data-sitekey]',
            '[data-sitekey]',
            'div[data-sitekey]',
            'textarea[name="h-captcha-response"]',
        ];

        for (const selector of candidates) {
            const element = document.querySelector(selector);
            const siteKey = element?.getAttribute("data-sitekey");
            if (siteKey) {
                return siteKey;
            }
        }

        const iframeSrc = document.querySelector('iframe[src*="hcaptcha.com"]')?.getAttribute("src");
        return iframeSrc || null;
    });

    return extractCaptchaSiteKeyFromSrc(siteKeyFromDom);
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}

function envFlag(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseDurationMs(raw: string | undefined, fallbackMs: number): number {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) return fallbackMs;

    // Accept plain numbers (ms) and common suffixes: "6500ms", "10s", "2m", "0.5s".
    const match = value.match(/^(-?\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
    if (!match?.[1]) return fallbackMs;

    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return fallbackMs;

    const unit = (match[2] || "ms").toLowerCase();
    const mult = unit === "ms"
        ? 1
        : unit === "s"
            ? 1000
            : unit === "m"
                ? 60_000
                : unit === "h"
                    ? 3_600_000
                    : 1;

    return Math.round(n * mult);
}

async function playTerminalSiren(durationMs: number): Promise<void> {
    // Cross-platform fallback (works in most terminals; some terminals may ignore it).
    const endAt = Date.now() + durationMs;
    let tick = 0;

    while (Date.now() < endAt) {
        process.stdout.write("\x07");
        tick += 1;
        const intervalMs = tick % 10 < 5 ? 120 : 220;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

async function tryPlayOsSiren(durationMs: number): Promise<boolean> {
    if (process.platform !== "darwin") {
        return false;
    }

    const fs = await import("fs");

    const explicit = String(process.env.SUNO_CAPTCHA_SIREN_SOUND_PATH || "").trim();
    const candidates = [
        explicit,
        // macOS built-in alert sounds (pick the first that exists)
        "/System/Library/Sounds/Sosumi.aiff",
        "/System/Library/Sounds/Glass.aiff",
        "/System/Library/Sounds/Funk.aiff",
        "/System/Library/Sounds/Ping.aiff",
        "/System/Library/Sounds/Tink.aiff",
        "/System/Library/Sounds/Submarine.aiff",
    ].filter(Boolean);

    const soundPath = candidates.find((p) => {
        try {
            return fs.existsSync(p);
        } catch {
            return false;
        }
    });

    if (!soundPath) {
        return false;
    }

    const afplayPath = "/usr/bin/afplay";
    if (!fs.existsSync(afplayPath)) {
        return false;
    }

    const volumeRaw = String(process.env.SUNO_CAPTCHA_SIREN_VOLUME || "").trim();
    const volume = volumeRaw
        ? clampNumber(Number(volumeRaw), 0.05, 2)
        : null;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const endAt = Date.now() + durationMs;

    try {
        const { spawn } = await import("child_process");

        // Loop the system sound to create a noticeable alert even when the browser can't play audio.
        // This is especially useful on macOS, where terminal bell can be muted/disabled.
        while (Date.now() < endAt) {
            const remaining = endAt - Date.now();
            const args = volume != null
                ? ["-v", String(volume), soundPath]
                : [soundPath];

            const proc = spawn(afplayPath, args, { stdio: "ignore" });

            const exitOrError = new Promise<"exit" | "error">((resolve) => {
                proc.once("exit", () => resolve("exit"));
                proc.once("error", () => resolve("error"));
            });

            const raced = await Promise.race([
                exitOrError,
                sleep(Math.max(10, Math.min(remaining, 2000))),
            ]);

            if (raced === "error") {
                try { proc.kill("SIGKILL"); } catch { /* ignore */ }
                return false;
            }

            if (raced !== "exit") {
                try { proc.kill("SIGKILL"); } catch { /* ignore */ }
            }

            // Small gap between plays to avoid sounding like a single long chime.
            await sleep(80);
        }

        return true;
    } catch {
        return false;
    }
}

async function tryPlayBrowserSiren(page: Page, durationMs: number): Promise<boolean> {
    try {
        const ok = await page.evaluate(async (ms) => {
            const w = window as any;
            const AudioCtx = w.AudioContext || w.webkitAudioContext;
            if (!AudioCtx) return false;

            const wait = (t: number) => new Promise<void>((resolve) => setTimeout(resolve, t));

            let ctx: AudioContext;
            try {
                ctx = new AudioCtx();
            } catch {
                return false;
            }

            // Autoplay policies can leave WebAudio suspended. Try to resume quickly, but never hang.
            if (ctx.state === "suspended") {
                try {
                    await Promise.race([ctx.resume(), wait(250)]);
                } catch {
                    // ignore
                }
            }

            if (ctx.state === "suspended") {
                try {
                    await Promise.race([ctx.close(), wait(100)]);
                } catch {
                    // ignore
                }
                return false;
            }

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sawtooth";
            gain.gain.value = 0.1;

            osc.connect(gain);
            gain.connect(ctx.destination);

            const start = ctx.currentTime;
            const durationSec = Math.max(0.5, ms / 1000);

            // Simple alternating tone to mimic a siren.
            const low = 420;
            const high = 880;
            const step = 0.17;
            for (let t = 0; t <= durationSec; t += step) {
                const freq = Math.floor(t / step) % 2 === 0 ? low : high;
                osc.frequency.setValueAtTime(freq, start + t);
            }

            osc.start();
            osc.stop(start + durationSec);

            osc.onended = () => {
                try {
                    ctx.close();
                } catch {
                    // ignore
                }
            };

            // Real-time cleanup fallback (in case audio time doesn't advance for any reason).
            setTimeout(() => {
                try {
                    ctx.close();
                } catch {
                    // ignore
                }
            }, ms + 500);

            return true;
        }, durationMs);

        return ok === true;
    } catch {
        return false;
    }
}

export async function checkForCaptcha(page: Page): Promise<boolean> {
    try {
        const debugCaptcha = envFlag(process.env.SUNO_DEBUG_CAPTCHA);
        const debounceMs = Number(process.env.SUNO_CAPTCHA_DEBOUNCE_MS || "350");
        const alertCooldownMs = Number(process.env.SUNO_CAPTCHA_ALERT_COOLDOWN_MS || "120000"); // 2 min
        const autoScreenshot = envFlag(process.env.SUNO_CAPTCHA_AUTO_SCREENSHOT);
        const screenshotCooldownMs = Number(process.env.SUNO_CAPTCHA_SCREENSHOT_COOLDOWN_MS || "60000"); // 1 min
        // Default siren ON unless explicitly disabled.
        const captchaSirenEnabled = process.env.SUNO_CAPTCHA_SIREN === undefined
            ? true
            : envFlag(process.env.SUNO_CAPTCHA_SIREN);
        const captchaSirenDurationMs = clampNumber(
            parseDurationMs(process.env.SUNO_CAPTCHA_SIREN_DURATION_MS, 6500),
            10,
            600000
        );
        const captchaSirenCooldownMs = clampNumber(
            parseDurationMs(process.env.SUNO_CAPTCHA_SIREN_COOLDOWN_MS, 30000),
            0,
            600000
        );
        const captchaMaxWaitMs = clampNumber(
            parseDurationMs(process.env.SUNO_CAPTCHA_MAX_WAIT_MS, 15 * 60_000),
            10_000,
            24 * 60 * 60_000
        );

        const findBlockingCaptchaFrame = async (): Promise<any | null> => {
            const viewport = page.viewportSize();
            const frames = await page.$$(SELECTORS.CAPTCHA_FRAME);

            let best: { frame: any; area: number } | null = null;

            for (const frame of frames) {
                try {
                    if (!(await frame.isVisible())) {
                        continue;
                    }

                    const box = await frame.boundingBox();
                    if (!box) {
                        continue;
                    }

                    // Ignore tiny/preload iframes (common false positive).
                    const area = box.width * box.height;
                    if (box.width < 180 || box.height < 60 || area < 12000) {
                        if (debugCaptcha) {
                            const src = await frame.getAttribute("src");
                            console.log(
                                `[Suno Browser] CAPTCHA frame ignored (too small) size=${Math.round(box.width)}x${Math.round(box.height)} src=${sanitizeCaptchaFrameSrc(src)}`
                            );
                        }
                        continue;
                    }

                    // Ignore iframes fully outside the viewport (can be offscreen preload).
                    if (viewport) {
                        const offscreen = box.x + box.width < 0
                            || box.y + box.height < 0
                            || box.x > viewport.width
                            || box.y > viewport.height;
                        if (offscreen) {
                            if (debugCaptcha) {
                                const src = await frame.getAttribute("src");
                                console.log(
                                    `[Suno Browser] CAPTCHA frame ignored (offscreen) box=${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} src=${sanitizeCaptchaFrameSrc(src)}`
                                );
                            }
                            continue;
                        }
                    }

                    // Extra guard: sometimes a dialog is technically "visible" but fully transparent or not interactive.
                    const isInteractive = await frame.evaluate((el) => {
                        function isBad(node: HTMLElement | null): boolean {
                            if (!node) return false;
                            const style = window.getComputedStyle(node);
                            const opacity = Number(style.opacity || "1");
                            if (opacity <= 0.05) return true;
                            if (style.pointerEvents === "none") return true;
                            if (node.getAttribute("aria-hidden") === "true") return true;
                            return false;
                        }

                        let cur: HTMLElement | null = el as HTMLElement;
                        // Check a handful of ancestors for "hidden but still measurable" cases.
                        for (let i = 0; i < 8 && cur; i++) {
                            if (isBad(cur)) return false;
                            cur = cur.parentElement;
                        }
                        return true;
                    });
                    if (!isInteractive) {
                        if (debugCaptcha) {
                            const src = await frame.getAttribute("src");
                            console.log(`[Suno Browser] CAPTCHA frame ignored (non-interactive) src=${sanitizeCaptchaFrameSrc(src)}`);
                        }
                        continue;
                    }

                    // Keep the biggest blocking frame as the best candidate.
                    if (!best || area > best.area) {
                        best = { frame, area };
                    }
                } catch {
                    // Ignore transient frame errors.
                }
            }

            if (debugCaptcha && best) {
                try {
                    const box = await best.frame.boundingBox();
                    const src = await best.frame.getAttribute("src");
                    console.log(
                        `[Suno Browser] CAPTCHA frame selected size=${Math.round(box?.width || 0)}x${Math.round(box?.height || 0)} src=${sanitizeCaptchaFrameSrc(src)}`
                    );
                } catch {
                    // ignore
                }
            }

            return best?.frame || null;
        };

        // 1) Detect a blocking captcha iframe/modal.
        let captchaFrame = await findBlockingCaptchaFrame();
        if (!captchaFrame) {
            return false;
        }

        // 2) Debounce: avoid false positives from short-lived/preload frames.
        if (Number.isFinite(debounceMs) && debounceMs > 0) {
            await page.waitForTimeout(debounceMs);
            captchaFrame = await findBlockingCaptchaFrame();
            if (!captchaFrame) {
                // Some captchas briefly unmount/remount during initialization.
                // Give it a short grace window before treating as a false positive.
                const graceDeadline = Date.now() + 1200;
                while (Date.now() < graceDeadline) {
                    await page.waitForTimeout(200);
                    captchaFrame = await findBlockingCaptchaFrame();
                    if (captchaFrame) break;
                }
                if (!captchaFrame) {
                    if (debugCaptcha) {
                        console.log(`[Suno Browser] CAPTCHA frame disappeared during debounce (${debounceMs}ms) and grace window. Ignoring.`);
                    }
                    return false;
                }
            }
        }

        console.warn("⚠️ [Suno Browser] CAPTCHA DETECTED! ⚠️");

        const isHeadless = envFlag(process.env.SUNO_HEADLESS) || process.env.NODE_ENV === "production";
        if (debugCaptcha) {
            console.log(
                `[Suno Browser] CAPTCHA config headless=${isHeadless} siren=${captchaSirenEnabled} durationMs=${captchaSirenDurationMs}`
            );
        }

        if (isHeadless) {
            // Best-effort alert even when headless (manual solving isn't possible here).
            if (captchaSirenEnabled) {
                const now = Date.now();
                if (captchaSirenCooldownMs === 0 || (now - lastCaptchaSirenAt) >= captchaSirenCooldownMs) {
                    lastCaptchaSirenAt = now;
                    (async () => {
                        const playedOs = await tryPlayOsSiren(captchaSirenDurationMs);
                        if (!playedOs) {
                            await playTerminalSiren(captchaSirenDurationMs);
                        }
                    })().catch(() => {
                        // ignore
                    });
                }
            }
            console.error("[Suno Browser] Cannot solve CAPTCHA in headless mode. Switch to non-headless to solve it manually.");
            await takeScreenshot(page, "error-captcha-detected");
            return true;
        }

        try {
            await page.bringToFront();
        } catch {
            // ignore
        }
        try {
            await captchaFrame.scrollIntoViewIfNeeded();
        } catch {
            // ignore
        }

        console.log("---------------------------------------------------");
        console.log("🛑 AUTOMATION PAUSED: CAPTCHA DETECTED");
        console.log("👉 Please solve the CAPTCHA in the browser window manually.");
        console.log("👉 The script will resume automatically once the CAPTCHA is gone.");
        console.log("---------------------------------------------------");

        const now = Date.now();

        if (autoScreenshot && (now - lastCaptchaScreenshotAt) >= screenshotCooldownMs) {
            lastCaptchaScreenshotAt = now;
            takeScreenshot(page, `captcha-detected-${now}`).catch(() => {
                // ignore
            });
        }

        // Send Telegram alert (cooldown to avoid spam)
        if ((now - lastCaptchaAlertAt) >= alertCooldownMs) {
            lastCaptchaAlertAt = now;
            sendCaptchaAlert().catch(e => console.error("[Suno Browser] Failed to send Telegram alert:", e));
        }

        if (captchaSirenEnabled) {
            if (captchaSirenCooldownMs === 0 || (now - lastCaptchaSirenAt) >= captchaSirenCooldownMs) {
                lastCaptchaSirenAt = now;
                (async () => {
                    const playedInBrowser = await tryPlayBrowserSiren(page, captchaSirenDurationMs);
                    if (debugCaptcha) {
                        console.log(`[Suno Browser] Siren played in browser: ${playedInBrowser}`);
                    }
                    if (!playedInBrowser) {
                        if (debugCaptcha) {
                            console.log("[Suno Browser] Browser siren unavailable; trying OS siren...");
                        }

                        const playedOs = await tryPlayOsSiren(captchaSirenDurationMs);
                        if (debugCaptcha) {
                            console.log(`[Suno Browser] Siren played via OS: ${playedOs}`);
                        }
                        if (!playedOs) {
                            if (debugCaptcha) {
                                console.log("[Suno Browser] OS siren unavailable; falling back to terminal bell...");
                            }
                            await playTerminalSiren(captchaSirenDurationMs);
                        }
                    }
                })().catch(() => {
                    // ignore
                });
            }
        } else {
            // Play 3 beeps to alert user
            for (let i = 0; i < 3; i++) {
                process.stdout.write("\x07");
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Wait loop
        let isPresent = true;
        let consecutiveAbsent = 0;
        let checks = 0;
        const maxChecks = Math.max(1, Math.round(captchaMaxWaitMs / 1000)); // default ~15 minutes

        while (isPresent && checks < maxChecks) {
            await page.waitForTimeout(1000);
            const frame = await findBlockingCaptchaFrame();
            if (!frame) {
                consecutiveAbsent += 1;
                if (consecutiveAbsent >= 2) {
                    isPresent = false;
                    console.log("✅ [Suno Browser] CAPTCHA gone! Resuming...");
                }
            } else {
                consecutiveAbsent = 0;
            }
            checks++;
            if (checks % 10 === 0) {
                console.log(`[Suno Browser] Waiting for CAPTCHA solution... (${checks}s)`);
            }
        }

        if (isPresent) {
            console.error(`[Suno Browser] Timed out waiting for CAPTCHA solution after ~${Math.round(maxChecks)}s.`);
            return true; // Captcha still there
        }

        return false; // Captcha gone
    } catch (error) {
        console.error("[Suno Browser] Error checking for CAPTCHA:", error);
        return false;
    }
}

/**
 * Close the browser and cleanup
 */
export async function closeBrowser(): Promise<void> {
    if (contextInstance) {
        await contextInstance.close();
        contextInstance = null;
    }
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
    console.log("[Suno Browser] Browser closed");
}

/**
 * Reset the context (useful after errors)
 */
export async function resetContext(): Promise<void> {
    if (contextInstance) {
        await contextInstance.close();
        contextInstance = null;
    }
    console.log("[Suno Browser] Context reset");
}

/**
 * Take a screenshot for debugging
 */
export async function takeScreenshot(page: Page, name: string): Promise<Buffer> {
    try {
        const screenshot = await page.screenshot({
            fullPage: false,
            type: "png",
            timeout: 5000,
        });

        try {
            const fs = await import("fs");
            if (!fs.existsSync("screenshots")) {
                fs.mkdirSync("screenshots", { recursive: true });
            }
            fs.writeFileSync(`screenshots/${name}.png`, screenshot);
            console.log(`[Suno Browser] Screenshot saved: screenshots/${name}.png`);
        } catch (err) {
            console.error("[Suno Browser] Failed to save screenshot to disk:", err);
        }

        return screenshot;
    } catch (error) {
        console.error(`[Suno Browser] Failed to take screenshot '${name}':`, error);
        return Buffer.from([]);
    }
}
