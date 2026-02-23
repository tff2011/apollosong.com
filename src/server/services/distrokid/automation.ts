import { chromium, type Browser, type Page, type BrowserContext } from "patchright";
import { existsSync, mkdirSync } from 'fs';
import { DISTROKID_PROFILE_DIR } from "./paths";

interface MusicUploadData {
    nomeDaMusica: string;
    arquivoMp3: string; // absolute path to MP3 file
    arquivoCapa: string; // absolute path to Cover image
}

// Fixed data as specified
const DADOS_FIXOS = {
    autor: 'Thiago Felizola Freires',
    artista: 'ApolloSong.com',
    genero: 'Música latina', // value: "22" in select
};

export class DistroKidAutomation {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async init(): Promise<void> {
        // Use a persistent profile directory so DistroKid recognizes the "device"
        const userDataDir = DISTROKID_PROFILE_DIR;

        // Ensure directory exists
        if (!existsSync(userDataDir)) {
            mkdirSync(userDataDir, { recursive: true });
        }

        console.log('Using persistent Chrome profile at:', userDataDir);

        const isProduction = process.env.NODE_ENV === 'production';
        const headlessEnv = process.env.DISTROKID_HEADLESS;
        const headless = headlessEnv !== undefined
            ? headlessEnv === 'true'
            : isProduction;
        const chromePath =
            process.env.DISTROKID_CHROME_PATH ||
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
        const chromeChannel =
            chromePath ? undefined : (process.env.DISTROKID_CHROME_CHANNEL || (!isProduction ? 'chrome' : undefined));

        const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
            headless,
            viewport: { width: 1280, height: 900 },
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        };

        if (chromeChannel) {
            launchOptions.channel = chromeChannel;
        }
        if (chromePath) {
            launchOptions.executablePath = chromePath;
        }

        // Launch with persistent context - this keeps the same device fingerprint
        this.context = await chromium.launchPersistentContext(userDataDir, launchOptions);

        // Get the first page or create one
        const pages = this.context.pages();
        if (pages.length > 0 && pages[0]) {
            this.page = pages[0];
        } else {
            this.page = await this.context.newPage();
        }
    }

    async saveSession(): Promise<void> {
        // With persistent context, session is automatically saved to the profile directory
        console.log('Session automatically saved to persistent profile');
    }

    async isLoggedIn(): Promise<boolean> {
        if (!this.page) return false;

        try {
            await this.page.goto('https://distrokid.com/mymusic/', { timeout: 60000 });
            await this.page.waitForLoadState('domcontentloaded');
            await this.page.waitForTimeout(3000);

            const url = this.page.url();

            // Check if redirected to signin
            if (url.includes('/signin')) return false;

            // Check if there's a 2FA/verification prompt
            const has2FA = await this.page.locator('text=/verificação|verification|2FA|código|code/i').first().isVisible().catch(() => false);
            if (has2FA) return false;

            // Check if we can see the "Subir música" button (means we're fully logged in)
            const hasUploadButton = await this.page.locator('text=/Subir música|Upload/i').first().isVisible().catch(() => false);

            return hasUploadButton;
        } catch {
            return false;
        }
    }

    // Manual login: opens browser for user to login manually with captcha/2FA
    async manualLogin(): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Opening DistroKid login page for manual login...');
        console.log('Please login manually (complete captcha/2FA if needed)');
        console.log('The session will be saved when you reach the main dashboard.');

        await this.page.goto('https://distrokid.com/signin/', { timeout: 60000 });

        // Wait for user to complete full login (including 2FA) - look for dashboard URL
        console.log('Waiting for full authentication (including 2FA if required)...');
        // Wait for either /mymusic/ or /dashboard/ (DistroKid uses both depending on state)
        await this.page.waitForURL(/.*(mymusic|dashboard).*/, { timeout: 300000 });

        // Save the session
        await this.saveSession();
        console.log('Manual login completed and session saved!');
    }

    async login(email: string, senha: string): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized');

        // First check if we're already logged in from saved session
        console.log('Checking if already logged in...');
        if (await this.isLoggedIn()) {
            console.log('Already logged in from saved session!');
            return;
        }

        console.log(`Not logged in. Attempting login as ${email}...`);

        // Navigate to signin page with retry logic (DistroKid can be slow)
        let retries = 3;
        while (retries > 0) {
            try {
                await this.page.goto('https://distrokid.com/signin/', { timeout: 60000 });
                await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
                break;
            } catch (e) {
                retries--;
                if (retries === 0) throw e;
                console.log(`Navigation timeout, retrying... (${retries} attempts left)`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Check if we were redirected away from /signin/ (already authenticated)
        const currentUrl = this.page.url();
        if (!currentUrl.includes('/signin')) {
            console.log('Already logged in (redirected from signin to:', currentUrl, ')');
            await this.saveSession();
            return;
        }

        try {
            const cookieButton = await this.page.getByRole('button', { name: /accept|concordo|aceitar/i }).first();
            if (await cookieButton.isVisible().catch(() => false)) {
                await cookieButton.click();
            }
        } catch (e) {
            // Ignore cookie banner errors
        }

        const emailInput = this.page.locator('input[name="email"]:visible, input#inputEmail:visible, input[name="inputSigninEmail"]:visible, input#inputSigninEmail:visible').first();
        await emailInput.waitFor({ state: 'visible', timeout: 30000 });
        await emailInput.click({ force: true });
        await emailInput.fill(email, { force: true });

        const passwordInput = this.page.locator('input[name="password"]:visible, input#inputPassword:visible, input[name="inputSigninPassword"]:visible, input#inputSigninPassword:visible, input[type="password"]:visible').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
        await passwordInput.fill(senha, { force: true });

        await this.page.locator('input#signInButtonStandalonePage:visible, button[type="submit"]:visible, input[type="submit"]:visible, #signinButton:visible').first().click();

        // Wait for login - if captcha/2FA appears, wait longer for manual intervention
        try {
            await this.page.waitForFunction(
                () => !window.location.href.includes('/signin'),
                { timeout: 15000 }
            );
        } catch {
            console.log('Login taking longer than expected - may need captcha/2FA.');
            console.log('Please complete the login manually in the browser window.');
            console.log('Waiting up to 5 minutes...');
            await this.page.waitForFunction(
                () => !window.location.href.includes('/signin'),
                { timeout: 300000 }
            );
        }

        // Save session after successful login
        await this.saveSession();
        console.log('Login successful and session saved!');
    }

    async navigateToNewUpload(): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Navigating to New Upload page...');
        let retries = 3;
        while (retries > 0) {
            try {
                await this.page.goto('https://distrokid.com/new/', { timeout: 60000 });
                await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
                break;
            } catch (e) {
                retries--;
                if (retries === 0) throw e;
                console.log(`Navigation timeout, retrying... (${retries} attempts left)`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    async uploadMusic(data: MusicUploadData): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log(`Starting upload for "${data.nomeDaMusica}"...`);

        // 1. Select Artist (ApolloSong.com)
        // Wait for selector to be available
        await this.page.waitForSelector('#artistName');
        await this.page.selectOption('#artistName', { label: DADOS_FIXOS.artista });
        console.log('✓ Artist selected:', DADOS_FIXOS.artista);

        // 2. Select Primary Genre (Latin Music)
        await this.page.selectOption('#genrePrimary', { label: DADOS_FIXOS.genero });
        console.log('✓ Genre selected:', DADOS_FIXOS.genero);

        // 3. Set Release Date to today (Format: YYYY-MM-DD)
        const today = new Date().toISOString().slice(0, 10);
        await this.page.fill('input#release-date-dp', today);
        console.log('✓ Release date set:', today);

        // 4. Upload Album Cover
        // Note: DistroKid sometimes changes IDs. The user script uses Input#artwork[type="file"]
        const coverInput = await this.page.$('input#artwork[type="file"]');
        if (coverInput) {
            await coverInput.setInputFiles(data.arquivoCapa);
            console.log('✓ Cover uploaded:', data.arquivoCapa);
            // Wait for image processing/preview if necessary
            // Removed fixed sleep to speed up flow
            // await this.page.waitForTimeout(3000);
        } else {
            console.warn('⚠ Cover input not found');
        }

        // 5. Fill Track Title
        // Dynamic ID, selecting by placeholder as per script
        await this.page.fill('input[placeholder="Título da faixa 1"]', data.nomeDaMusica).catch(async () => {
            // Fallback: try to find by name or other attributes if translation varies
            console.log('Fallback: attempting to find title input by name...');
            await this.page!.fill('input[name="track_title[1]"]', data.nomeDaMusica);
        });
        console.log('✓ Title filled:', data.nomeDaMusica);

        // 6. Upload MP3
        const audioInput = await this.page.$('input.trackupload[type="file"][accept*="audio"]');
        if (audioInput) {
            await audioInput.setInputFiles(data.arquivoMp3);
            console.log('✓ MP3 uploaded:', data.arquivoMp3);

            // Wait for upload complete indicator. 
            // User script has .upload-complete or .file-uploaded
            // Wait for upload complete indicator. 
            // User script has .upload-complete or .file-uploaded.
            // Reduced timeout to avoid blocking for 3 minutes if selector is missing.
            try {
                await this.page.waitForSelector('.upload-complete, .file-uploaded, .done-uploading', { timeout: 15000 });
                console.log('✓ MP3 upload confirmed by UI');
            } catch (e) {
                console.warn('⚠ Upload completion indicator not found (proceeding anyway, upload might still be processing or selector changed)');
            }
            // Removed fixed sleep to speed up flow
            // await this.page.waitForTimeout(3000);
        } else {
            throw new Error('Audio input not found');
        }

        // 7. Fill Songwriter Name (Thiago Felizola Freires)
        const [firstName, middleName, lastName] = this.splitName(DADOS_FIXOS.autor);
        console.log(`Attempting to fill songwriter name: ${firstName} | ${middleName} | ${lastName}`);

        try {
            // Wait for songwriter fields to be visible. Try different selectors for robustness.
            const firstNameSelector = 'input[name="songwriter_real_name_first1"], input[placeholder="Nome"], input[placeholder="First name"]';
            const firstNameInput = this.page.locator(firstNameSelector).first();

            await firstNameInput.scrollIntoViewIfNeeded();
            await firstNameInput.waitFor({ state: 'visible', timeout: 15000 });

            await firstNameInput.click({ force: true });
            await firstNameInput.fill(firstName, { force: true });
            console.log('✓ First name filled');

            if (middleName) {
                const middleNameSelector = 'input[name="songwriter_real_name_middle1"], input[placeholder="Nome do meio"], input[placeholder="Middle name"]';
                const middleNameInput = this.page.locator(middleNameSelector).first();
                await middleNameInput.fill(middleName, { force: true });
                console.log('✓ Middle name filled');
            }

            const lastNameSelector = 'input[name="songwriter_real_name_last1"], input[placeholder="Sobrenome"], input[placeholder="Last name"]';
            const lastNameInput = this.page.locator(lastNameSelector).first();
            await lastNameInput.fill(lastName, { force: true });
            console.log('✓ Last name filled');

            console.log('✓ Songwriter filled:', DADOS_FIXOS.autor);
        } catch (error) {
            console.error('⚠ Failed to fill songwriter name:', error);
            // Don't throw here to allow manual completion if needed, or we can throw if it's critical
        }

        // 8. Apple Music Credits (Performer & Producer)
        console.log('--- Starting Apple Music credits section ---');

        try {
            // Click to expand the credits section
            const creditsSection = this.page.locator('text=Adicionar créditos para cada música');
            if (await creditsSection.count() > 0) {
                await creditsSection.click();
                // Wait for the performer role select to appear instead of a fixed delay
                await this.page.locator('#track-1-performer-1-role, select.performer-role').first()
                    .waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
                console.log('✓ Credits section expanded');
            }

            // Intérprete (Performer) — find the right value via JS, then use Playwright's selectOption
            console.log('  Filling performer...');
            const performerValue = await this.page.evaluate(() => {
                const select = document.querySelector('#track-1-performer-1-role') as HTMLSelectElement;
                if (!select) return null;
                for (const opt of Array.from(select.options)) {
                    if (opt.text.toLowerCase().includes('principal') || opt.text.toLowerCase().includes('primary')) {
                        return opt.value;
                    }
                }
                // Fallback: first non-placeholder option
                return select.options.length > 1 ? select.options[1]!.value : null;
            });
            if (performerValue) {
                await this.page.selectOption('#track-1-performer-1-role', performerValue);
                console.log('    ✓ Performer role selected (value:', performerValue, ')');
            } else {
                console.warn('    ⚠ Could not find performer role option');
            }

            await this.page.locator('#track-1-performer-1-name').fill(DADOS_FIXOS.artista);
            console.log('    ✓ Performer name filled:', DADOS_FIXOS.artista);

            // Produtor (Producer)
            console.log('  Filling producer...');
            const producerValue = await this.page.evaluate(() => {
                const select = document.querySelector('#track-1-producer-1-role') as HTMLSelectElement;
                if (!select) return null;
                for (const opt of Array.from(select.options)) {
                    if (opt.value === 'Producer' || opt.text.toLowerCase().includes('produt')) {
                        return opt.value;
                    }
                }
                return null;
            });
            if (producerValue) {
                await this.page.selectOption('#track-1-producer-1-role', producerValue);
                console.log('    ✓ Producer role selected (value:', producerValue, ')');
            } else {
                console.warn('    ⚠ Could not find producer role option');
            }

            await this.page.locator('#track-1-producer-1-name').fill(DADOS_FIXOS.autor);
            console.log('    ✓ Producer name filled:', DADOS_FIXOS.autor);

            console.log('✓ Apple Music credits completed');

        } catch (e) {
            console.error('⚠ Error filling Apple Music credits:', e);
        }

        // 9. Check all mandatory checkboxes
        console.log('--- Starting checkbox section ---');

        // Scroll down to make sure checkboxes are in view
        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.page.waitForTimeout(1000);

        // List of required checkbox IDs
        const checkboxIds = [
            'areyousureyoutube',
            'areyousurenonstandardscaps',
            'areyousurepromoservices',
            'areyousurerecorded',
            'areyousureotherartist',
            'areyousuretandc'
        ];

        for (const id of checkboxIds) {
            console.log(`  Checking checkbox #${id}...`);
            const checkbox = this.page.locator(`#${id}`);
            const exists = await checkbox.count() > 0;

            if (!exists) {
                console.log(`    ⚠ Checkbox #${id} not found in DOM`);
                continue;
            }

            try {
                await checkbox.scrollIntoViewIfNeeded();
                const isChecked = await checkbox.isChecked();
                console.log(`    Currently checked: ${isChecked}`);

                if (!isChecked) {
                    // Try multiple methods to check
                    await checkbox.evaluate((el: HTMLInputElement) => {
                        el.checked = true;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                    console.log(`    ✓ Checked via JS`);
                }
            } catch (e) {
                console.warn(`    ⚠ Failed to check #${id}:`, e);
            }
        }

        // Double check - also click any unchecked areyousure checkboxes
        const allCheckboxes = await this.page.$$('input.areyousure[type="checkbox"]');
        console.log(`  Found ${allCheckboxes.length} total areyousure checkboxes`);

        for (const cb of allCheckboxes) {
            if (!cb) continue;
            const isChecked = await cb.isChecked();
            const id = await cb.getAttribute('id');
            if (!isChecked) {
                console.log(`    Forcing check on unchecked checkbox: ${id}`);
                await cb.evaluate((el: HTMLInputElement) => {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        }

        console.log('✓ All checkboxes processed');

        // 10. Submit
        console.log('--- Starting submit section ---');

        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.page.waitForTimeout(1000);

        // The button is: <input type="button" id="doneButton" value="Pronto" ...>
        const doneButton = this.page.locator('input#doneButton');
        const buttonExists = await doneButton.count() > 0;
        console.log(`  Done button exists: ${buttonExists}`);

        if (buttonExists) {
            await doneButton.scrollIntoViewIfNeeded();
            const isVisible = await doneButton.isVisible();
            const isEnabled = await doneButton.isEnabled();
            console.log(`  Button visible: ${isVisible}, enabled: ${isEnabled}`);

            if (isVisible && isEnabled) {
                console.log('  Clicking done button...');
                await doneButton.click({ force: true });
                console.log('✓ Done button clicked!');
            } else {
                console.log('  Trying JS click as fallback...');
                await doneButton.evaluate((el: HTMLInputElement) => el.click());
                console.log('✓ Done button clicked via JS!');
            }
        } else {
            // Fallback selectors
            console.log('  Trying fallback selectors...');
            const fallbackSelectors = ['input[value="Pronto"]', 'input[value="Done"]', '.distroDoneButtonWithAPI'];
            for (const sel of fallbackSelectors) {
                const btn = this.page.locator(sel);
                if (await btn.count() > 0) {
                    console.log(`  Found button with selector: ${sel}`);
                    await btn.click({ force: true });
                    console.log('✓ Form submitted via fallback!');
                    break;
                }
            }
        }

        console.log('✓ Form submission attempted!');

        // Wait for confirmation page or processing
        console.log('  Waiting for confirmation...');
        try {
            await this.page.waitForURL(/.*\/(done|success|confirmation).*/, { timeout: 60000 });
            console.log('✓ Reached confirmation page!');
        } catch {
            console.log('  Did not detect URL change (might still be processing)');
        }

        await this.page.waitForTimeout(3000);
    }

    private splitName(fullName: string): [string, string, string] {
        const parts = fullName.split(' ');
        const first = parts[0] ?? '';
        const last = parts[parts.length - 1] ?? '';
        const middle = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
        return [first, middle, last];
    }

    async close(): Promise<void> {
        if (this.context) {
            await this.context.close();
        }
    }
}
