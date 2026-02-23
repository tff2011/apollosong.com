
import type { Page } from "patchright";

/**
 * Human-like interaction utilities for Suno automation
 */

// Global state for fatigue management
let sessionStartTime = Date.now();
let lastBreakTime = Date.now();
let fatigueLevel = 0; // 0 to 1

export const FatigueManager = {
    /**
     * Reset the session tracking (e.g. on new run)
     */
    reset() {
        sessionStartTime = Date.now();
        lastBreakTime = Date.now();
        fatigueLevel = 0;
    },

    /**
     * Update fatigue based on elapsed time
     * Increases slightly every minute
     */
    update() {
        const elapsedMinutes = (Date.now() - sessionStartTime) / 60000;
        // Fatigue grows slowly: reaches ~0.3 after 1 hour, ~0.6 after 2 hours
        fatigueLevel = Math.min(0.8, elapsedMinutes * 0.005);
    },

    /**
     * Get the current delay multiplier (1.0 to 2.0 based on fatigue)
     */
    getDelayMultiplier() {
        this.update();
        return 1.0 + fatigueLevel;
    },

    /**
     * Check if it's time for a coffee break
     * Returns the duration of the break in ms if taken, 0 otherwise
     */
    async checkCoffeeBreak(page: Page | null = null): Promise<number> {
        const disableBreaksRaw = (process.env.SUNO_DISABLE_COFFEE_BREAKS || "").trim().toLowerCase();
        if (disableBreaksRaw === "1" || disableBreaksRaw === "true" || disableBreaksRaw === "yes" || disableBreaksRaw === "on") {
            return 0;
        }

        const elapsedSinceBreak = Date.now() - lastBreakTime;
        const oneHourMs = 60 * 60 * 1000;

        // Randomize the interval slightly (50-70 mins)
        const breakInterval = oneHourMs * (0.8 + Math.random() * 0.4);

        if (elapsedSinceBreak > breakInterval) {
            const breakDurationMinutes = 2 + Math.random() * 3; // 2 to 5 minutes
            const breakDurationMs = breakDurationMinutes * 60 * 1000;

            console.log(`[FatigueManager] ☕ Taking a coffee break for ${breakDurationMinutes.toFixed(1)} minutes...`);

            if (page) {
                // Optionally move mouse to a "resting" position or off-screen
                try {
                    await page.mouse.move(0, 500, { steps: 50 });
                } catch (e) { /* ignore */ }
            }

            await new Promise(resolve => setTimeout(resolve, breakDurationMs));

            lastBreakTime = Date.now();
            // Reset fatigue slightly after a break, but not fully
            fatigueLevel = Math.max(0, fatigueLevel - 0.2);

            console.log(`[FatigueManager] ☕ Break over. Resuming work.`);
            return breakDurationMs;
        }

        return 0;
    }
};

/**
 * Generate a random point on a cubic Bezier curve
 */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    return (1 - t) ** 3 * p0 +
        3 * (1 - t) ** 2 * t * p1 +
        3 * (1 - t) * t ** 2 * p2 +
        t ** 3 * p3;
}

// Mouse state tracking (since Playwright doesn't expose it easily)
const MouseState = {
    x: 0,
    y: 0,
    initialized: false
};

/**
 * Initialize mouse position if needed (e.g. to a random spot or 0,0)
 */
async function ensureMouseState(page: Page) {
    if (!MouseState.initialized) {
        // Start from a random position
        const viewport = page.viewportSize();
        MouseState.x = Math.random() * (viewport?.width || 1280);
        MouseState.y = Math.random() * (viewport?.height || 720);
        await page.mouse.move(MouseState.x, MouseState.y);
        MouseState.initialized = true;
    }
}

/**
 * Generate a Bezier path
 */
function generateBezierPath(start: { x: number, y: number }, end: { x: number, y: number }, steps: number): { x: number, y: number }[] {
    const path: { x: number, y: number }[] = [];

    // Control points for a natural arc
    // Randomize control points to vary the curve direction and intensity
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

    // Variance relative to distance (10% to 30% of distance is a good arc)
    const offsetMagnitude = distance * (0.1 + Math.random() * 0.2);

    // Random angle for the arc
    const angle = Math.atan2(deltaY, deltaX);
    // Add perpendicular offset
    // + or - math.PI/2 (random side)
    const arcAngle = angle + (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);

    // Control point 1 (closer to start)
    const cp1 = {
        x: start.x + (deltaX * 0.25) + Math.cos(arcAngle) * offsetMagnitude,
        y: start.y + (deltaY * 0.25) + Math.sin(arcAngle) * offsetMagnitude
    };

    // Control point 2 (closer to end)
    const cp2 = {
        x: start.x + (deltaX * 0.75) + Math.cos(arcAngle) * offsetMagnitude,
        y: start.y + (deltaY * 0.75) + Math.sin(arcAngle) * offsetMagnitude
    };

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        path.push({
            x: cubicBezier(t, start.x, cp1.x, cp2.x, end.x),
            y: cubicBezier(t, start.y, cp1.y, cp2.y, end.y)
        });
    }

    return path;
}

/**
 * Move mouse in a human-like curve to the target coordinates
 */
async function moveMouseCurve(page: Page, targetX: number, targetY: number) {
    await ensureMouseState(page);

    const start = { x: MouseState.x, y: MouseState.y };
    const end = { x: targetX, y: targetY };

    // Speed: average pixels per step?
    // Let's aim for ~20-50 steps depending on distance
    const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const minSteps = 10;
    const maxSteps = 100;
    // Faster: fewer steps
    const rawSteps = Math.min(maxSteps, Math.max(minSteps, Math.floor(dist / 15)));

    const delayMult = FatigueManager.getDelayMultiplier();
    // Reduce steps slightly for speed if fatigue is low? Or keep smooth?
    // Actually, "Snap" means fewer steps or faster interval.
    // Let's keep steps sufficient for curve, but execute fast.

    const path = generateBezierPath(start, end, rawSteps);

    // Overshoot? (Human behavior: go slightly past and correct)
    // Only for larger movements
    if (dist > 300 && Math.random() > 0.3) {
        // Implement simple overshoot by extending the path slightly in logic, complex to redraw bezier.
        // Or just move there and then wiggle?
        // Let's stick to a clean curve for now, GhostCursor does complex multistage.
    }

    for (const point of path) {
        // No delay per step, or very minimal. Playwright default is instant if no steps param.
        // We want tight control.
        await page.mouse.move(point.x, point.y);

        // Very slight inconsistency in movement speed?
        if (Math.random() > 0.9) {
            // Micro-pause
            // await page.waitForTimeout(1); // minimal
        }
    }

    MouseState.x = targetX;
    MouseState.y = targetY;
}

/**
 * Click an element at a random position within its bounding box
 * with human-like movement delay and curve
 */
export async function humanClick(page: Page, selector: string) {
    // Check for coffee break before action
    await FatigueManager.checkCoffeeBreak(page);

    const element = await page.$(selector);
    if (!element) throw new Error(`Element ${selector} not found`);

    const box = await element.boundingBox();
    if (!box) throw new Error(`Bounding box for ${selector} not found`);

    // Margin to avoid clicking edges
    const margin = Math.min(box.width, box.height) * 0.1;

    const minX = box.x + margin;
    const maxX = box.x + box.width - margin;
    const minY = box.y + margin;
    const maxY = box.y + box.height - margin;

    // Random point
    const targetX = minX + Math.random() * (maxX - minX);
    const targetY = minY + Math.random() * (maxY - minY);

    // Initial random delay before moving (reaction time) - Faster: 20-70ms
    const reactionTime = 20 * FatigueManager.getDelayMultiplier() + Math.random() * 50;
    await page.waitForTimeout(reactionTime);

    // Move mouse
    await moveMouseCurve(page, targetX, targetY);

    // Pause slightly over the target before clicking (aiming) - Faster: 10-35ms
    const aimTime = 10 * FatigueManager.getDelayMultiplier() + Math.random() * 25;
    await page.waitForTimeout(aimTime);

    // Click
    await page.mouse.down();
    // Short random hold time
    await page.waitForTimeout(20 + Math.random() * 50);
    await page.mouse.up();
}

/**
 * Type text like a human (variable keystroke delays)
 */
export async function humanType(page: Page, selector: string, text: string) {
    // Click focused first
    await humanClick(page, selector);

    // Clear existing (simulated by select all + backspace? or triple click?)
    // Reliable clear:
    const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";
    await page.keyboard.press(selectAllShortcut);
    await page.keyboard.press("Backspace");

    // Intelligent typing speed based on content length
    // If text is long > 50 chars (like lyrics), type VERY fast (simulating paste/skilled typing)
    // If short, type normally
    const isLongText = text.length > 50;

    // Base delay: 
    // Long text: 2ms - 8ms (near instant)
    // Short text: 15ms - 50ms (snappy human)
    const baseDelay = isLongText ? 2 : 15;
    const variance = isLongText ? 6 : 35;

    const multiplier = FatigueManager.getDelayMultiplier();

    for (const char of text) {
        // Randomize delay per key
        const randomVar = Math.random() * variance;
        const delay = (baseDelay + randomVar) * multiplier;

        await page.keyboard.type(char, { delay: 0 });

        // For very long text, occasionally don't wait at all (burst)
        if (isLongText && Math.random() > 0.5) {
            continue;
        }

        if (delay > 0) {
            await page.waitForTimeout(delay);
        }
    }
}
