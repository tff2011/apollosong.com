/**
 * Premium Frameable Lyrics PDF Generator
 *
 * Generates elegant PDFs suitable for framing using Patchright (Playwright)
 * to render HTML/CSS with Google Fonts.
 */

export { stripLyricsTags } from "./lyrics-cleaner";
export { generateFrameableLyricsHtml, checkLyricsFit } from "./html-template";

import { chromium } from "patchright";
import type { Browser } from "patchright";

// Singleton browser instance for PDF generation
let pdfBrowserInstance: Browser | null = null;

/**
 * Get or create a browser instance for PDF generation.
 */
async function getPdfBrowser(): Promise<Browser> {
  if (pdfBrowserInstance && pdfBrowserInstance.isConnected()) {
    return pdfBrowserInstance;
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const headless = true; // Always headless for PDF generation

  console.log(
    `[Frameable PDF] Launching browser (executablePath: ${executablePath || "default"})`
  );

  pdfBrowserInstance = await chromium.launch({
    headless,
    executablePath: executablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  return pdfBrowserInstance;
}

export type PaperSize = "A4" | "A3";

interface GeneratePdfOptions {
  html: string;
  size: PaperSize;
}

/**
 * Generate a PDF from HTML content using Patchright (Playwright).
 * Uses auto-scaling to fit content on a single page by reducing font sizes.
 */
export async function generatePdfFromHtml(
  options: GeneratePdfOptions
): Promise<Buffer> {
  const { html, size } = options;

  const browser = await getPdfBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Page dimensions in pixels (96 DPI)
  const pageDimensions = {
    A4: { width: 794, height: 1123 },
    A3: { width: 1123, height: 1587 },
  };

  const { width, height } = pageDimensions[size];

  try {
    // Set viewport to match paper size
    await page.setViewportSize({ width, height });

    // Set the HTML content
    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for fonts to load
    await page.waitForFunction(() => document.fonts.ready, {
      timeout: 10000,
    });

    const hasFitScript = await page.evaluate(
      () => typeof (window as any).__fitLyrics === "function"
    );
    if (hasFitScript) {
      try {
        await page.waitForFunction(
          () => (window as any).__lyricsFitDone === true,
          { timeout: 5000 }
        );
      } catch {
        // Ignore timeouts and fall back to server-side scaling.
      }
    }

    // Auto-scale: reduce font sizes until content fits
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      const overflowInfo = await page.evaluate(() => {
        const pageEl = document.querySelector(".page") as HTMLElement;
        const footer = document.querySelector(".footer") as HTMLElement;
        const lyricsContainer = document.querySelector(".lyrics-container") as HTMLElement;

        if (!pageEl || !footer || !lyricsContainer) {
          return { overflow: 0, debug: "Missing elements" };
        }

        const pageRect = pageEl.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();

        const footerTop = footerRect.top - pageRect.top;

        // Find the lowest point of any lyric line or stanza break
        let maxBottom = 0;
        const allElements = document.querySelectorAll(
          ".lyric-line, .stanza-break, .continuation-note, .continuation-resume"
        );
        allElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const bottom = rect.bottom - pageRect.top;
          if (bottom > maxBottom) {
            maxBottom = bottom;
          }
        });

        // Also check the lyrics container itself
        const containerRect = lyricsContainer.getBoundingClientRect();
        const containerBottom = containerRect.bottom - pageRect.top;

        // Use the maximum of all measurements
        const actualBottom = Math.max(maxBottom, containerBottom);
        const overflow = Math.max(0, actualBottom - footerTop + 15); // 15px safety margin

        const hasColumns = !!document.querySelector(".lyrics-columns");

        return {
          overflow,
          debug: `hasColumns=${hasColumns}, footerTop=${Math.round(footerTop)}, maxBottom=${Math.round(maxBottom)}, containerBottom=${Math.round(containerBottom)}, overflow=${Math.round(overflow)}`
        };
      });

      const { overflow, debug } = overflowInfo;
      console.log(`[Frameable PDF] Check: ${debug}`);

      if (overflow <= 0) {
        break; // Content fits!
      }

      // Calculate reduction factor based on overflow severity
      const reductionFactor = overflow > 100 ? 0.90 : overflow > 50 ? 0.93 : 0.95;
      console.log(`[Frameable PDF] Overflow detected: ${overflow}px, reducing font sizes by ${Math.round((1 - reductionFactor) * 100)}% (attempt ${attempts + 1})`);

      // Reduce all font sizes and related dimensions
      await page.evaluate((factor) => {
        // Reduce lyric line font sizes
        const textBlocks = document.querySelectorAll(
          ".lyric-line, .continuation-note, .continuation-resume, .column-flow"
        );
        textBlocks.forEach((el) => {
          const style = window.getComputedStyle(el);
          const currentSize = parseFloat(style.fontSize);
          (el as HTMLElement).style.fontSize = `${currentSize * factor}px`;
        });

        // Reduce stanza break heights
        const breaks = document.querySelectorAll(".stanza-break");
        breaks.forEach((el) => {
          const style = window.getComputedStyle(el);
          const currentHeight = parseFloat(style.height);
          (el as HTMLElement).style.height = `${currentHeight * factor}px`;
        });

        // Also reduce line-height slightly to pack content tighter
        const lines = document.querySelectorAll(".lyric-line");
        lines.forEach((el) => {
          const style = window.getComputedStyle(el);
          const currentSize = parseFloat(style.fontSize);
          const currentLineHeight = parseFloat(style.lineHeight);
          if (!Number.isFinite(currentSize) || !Number.isFinite(currentLineHeight) || currentSize === 0) {
            return;
          }
          const currentRatio = currentLineHeight / currentSize;
          const nextRatio = Math.max(1.25, currentRatio * 0.98);
          (el as HTMLElement).style.lineHeight = String(nextRatio);
        });
      }, reductionFactor);

      await page.waitForTimeout(50);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn(`[Frameable PDF] Could not fit content after ${maxAttempts} attempts`);
    }

    // Generate PDF
    const pdf = await page.pdf({
      format: size,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
    await context.close();
  }
}

/**
 * Close the PDF browser instance (for cleanup).
 */
export async function closePdfBrowser(): Promise<void> {
  if (pdfBrowserInstance) {
    await pdfBrowserInstance.close();
    pdfBrowserInstance = null;
    console.log("[Frameable PDF] Browser closed");
  }
}
