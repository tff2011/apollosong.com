/**
 * Script para fazer login manual no DistroKid e salvar a sessão.
 *
 * Uso: npx tsx scripts/distrokid-login.ts
 *
 * Vai abrir o browser, você faz login manualmente (captcha/2FA se necessário),
 * e quando chegar no dashboard a sessão é salva automaticamente.
 */

import { DistroKidAutomation } from '../src/server/services/distrokid/automation';

async function main() {
    const automation = new DistroKidAutomation();

    try {
        await automation.init();

        // Check if already logged in
        if (await automation.isLoggedIn()) {
            console.log('✓ Já está logado! Sessão válida.');
            return;
        }

        // Do manual login
        await automation.manualLogin();
        console.log('✓ Sessão salva com sucesso!');
        console.log('Agora você pode rodar a automação normalmente.');

    } catch (error) {
        console.error('Erro:', error);
    } finally {
        await automation.close();
    }
}

main();
