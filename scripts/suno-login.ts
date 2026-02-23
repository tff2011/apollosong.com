/**
 * Script interativo para fazer login no Suno e salvar o estado do browser
 *
 * Uso:
 *   npx tsx scripts/suno-login.ts
 *
 * O script vai:
 *   1. Abrir o browser visível
 *   2. Navegar para suno.com
 *   3. Aguardar você fazer login manualmente
 *   4. Salvar o estado completo (cookies + localStorage + sessionStorage)
 *   5. Fechar o browser
 *
 * Depois, o arquivo suno-auth-state.json será usado pela automação.
 */

import { chromium } from "patchright";
import * as readline from "readline";

const AUTH_STATE_PATH = process.env.SUNO_AUTH_STATE_PATH || "./suno-auth-state.json";
const USER_DATA_DIR = process.env.SUNO_USER_DATA_DIR || "./playwright-user-data";

async function waitForEnter(message: string): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

async function main() {
    console.log("🔐 Suno Login - Salvamento de Sessão\n");
    console.log("Este script vai abrir o browser para você fazer login no Suno.");
    console.log("Após o login, a sessão será salva para uso na automação.\n");
    console.log(`📁 User data dir: ${USER_DATA_DIR}`);
    console.log(`🗂️  Auth state path: ${AUTH_STATE_PATH}\n`);

    // Launch browser in visible mode with persistent context
    // Using user data dir to appear as a real browser
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        // Avoid a fixed 1920x1080 viewport that can overflow smaller screens (eg. MacBook).
        // With `viewport: null`, the page uses the window size (and `--start-maximized`).
        viewport: null,
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        args: [
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
    });

    // Fake browser to avoid detection
    const browser = context.browser();

    const page = await context.newPage();

    console.log("📱 Abrindo suno.com...\n");
    await page.goto("https://suno.com", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("║                                                             ║");
    console.log("║  👆 FAÇA LOGIN NO BROWSER                                   ║");
    console.log("║                                                             ║");
    console.log("║  1. Clique em 'Sign In' ou 'Log In'                         ║");
    console.log("║  2. Entre com sua conta (Google, Discord, etc.)             ║");
    console.log("║  3. Aguarde carregar a página principal do Suno             ║");
    console.log("║  4. Volte aqui e pressione ENTER                            ║");
    console.log("║                                                             ║");
    console.log("═══════════════════════════════════════════════════════════════\n");

    await waitForEnter("Pressione ENTER após fazer login no Suno... ");

    // Verify login by checking URL or presence of user elements
    const currentUrl = page.url();
    console.log(`\n📍 URL atual: ${currentUrl}`);

    // Check if already on create page or logged in
    if (currentUrl.includes("/create") || currentUrl.includes("suno.com/home")) {
        console.log("\n✅ Login verificado com sucesso!");
    } else if (currentUrl.includes("accounts.suno.com") || currentUrl.includes("sign-in")) {
        console.log("\n❌ Login não detectado! A página está na tela de login.");
        console.log("   Por favor, execute o script novamente e complete o login.\n");
        await context.close();
        process.exit(1);
    } else {
        // Try to navigate to create page to verify login
        console.log("🔍 Verificando se o login funcionou...");
        try {
            await page.goto("https://suno.com/create", { waitUntil: "domcontentloaded", timeout: 15000 });
            await page.waitForTimeout(3000);
        } catch (error) {
            console.log("⚠️  Timeout na navegação, mas continuando...");
        }

        const finalUrl = page.url();
        if (finalUrl.includes("accounts.suno.com") || finalUrl.includes("sign-in")) {
            console.log("\n❌ Login não detectado! A página redirecionou para login.");
            console.log("   Por favor, execute o script novamente e complete o login.\n");
            await context.close();
            process.exit(1);
        }

        console.log("\n✅ Login verificado com sucesso!");
    }

    // Save the complete browser state
    console.log(`\n💾 Salvando estado do browser em ${AUTH_STATE_PATH}...`);
    await context.storageState({ path: AUTH_STATE_PATH });

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("║                                                             ║");
    console.log("║  ✅ SESSÃO SALVA COM SUCESSO!                               ║");
    console.log("║                                                             ║");
    console.log("║  O arquivo suno-auth-state.json foi criado.                 ║");
    console.log("║  Agora você pode executar: npx tsx scripts/test-suno.ts     ║");
    console.log("║                                                             ║");
    console.log("═══════════════════════════════════════════════════════════════\n");

    await context.close();
}

main().catch((error) => {
    console.error("❌ Erro:", error);
    process.exit(1);
});
