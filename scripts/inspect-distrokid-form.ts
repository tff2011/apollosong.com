
import { chromium } from "patchright";
import path from 'path';

async function main() {
    // Use the same profile path as the service
    const userDataDir = path.join(process.cwd(), 'tmp', 'distrokid-chrome-profile');

    console.log(`Using Chrome profile: ${userDataDir}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        viewport: { width: 1280, height: 1000 }
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log('Navigating to Upload page...');
        await page.goto('https://distrokid.com/new/');
        await page.waitForLoadState('networkidle');

        console.log('Scrolling down to load potential dynamic fields...');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);

        console.log('\\n--- INSPECTING SONGWRITER INPUTS ---');

        // Find inputs that might be related to songwriter/real names
        const inputs = await page.$$eval('input', (elements) => {
            return elements.map(el => ({
                id: el.id,
                name: el.name,
                placeholder: el.placeholder,
                type: el.type,
                isVisible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
                value: el.value,
                outerHTML: el.outerHTML.substring(0, 150) + (el.outerHTML.length > 150 ? '...' : '')
            })).filter(info => {
                const s = JSON.stringify(info).toLowerCase();
                // Filter for likely candidates
                return s.includes('real_name') ||
                    s.includes('songwriter') ||
                    s.includes('nome') ||
                    s.includes('first') ||
                    s.includes('last') ||
                    s.includes('sobrenome');
            });
        });

        console.log(JSON.stringify(inputs, null, 2));
        console.log('--------------------------------------\\n');

        console.log('Browser PAUSED. You can use the Playwright Inspector.');
        await page.pause();

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await context.close();
    }
}

main();
