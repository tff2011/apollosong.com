/**
 * Script para baixar as músicas mais recentes do Suno
 * Navega diretamente para a página da música e baixa de lá
 */

import "dotenv/config";
import { chromium } from "patchright";
import { PrismaClient } from "../generated/prisma";

const AUTH_STATE_PATH = process.env.SUNO_AUTH_STATE_PATH || "./suno-auth-state.json";
const USER_DATA_DIR = process.env.SUNO_USER_DATA_DIR || "./playwright-user-data";

process.env.SUNO_AUTH_STATE_PATH = AUTH_STATE_PATH;

const db = new PrismaClient();

async function main() {
    const orderId = "cmk1gss58000bjp04i6xawe2d"; // Haras Pancadão

    console.log("🎵 Download de músicas recentes do Suno\n");

    // Buscar o pedido
    const order = await db.songOrder.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        console.error("❌ Pedido não encontrado!");
        process.exit(1);
    }

    console.log(`📋 Order: ${orderId}`);
    console.log(`👤 Cliente: ${order.email}`);
    console.log(`🎤 Destinatário: ${order.recipientName}\n`);

    // Launch browser with persistent context
    const userDataDir = USER_DATA_DIR;

    console.log("🌐 Abrindo browser...");
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        // Use window-sized viewport so the UI fits smaller screens (eg. MacBook).
        viewport: null,
        args: [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--start-maximized",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
    });

    const page = await context.newPage();

    try {
        const fs = await import("fs/promises");
        await fs.mkdir("./test-output", { recursive: true });

        // First, navigate to library to find the most recent songs
        console.log("📂 Navegando para o Library...");
        await page.goto("https://suno.com/me", { waitUntil: "domcontentloaded", timeout: 60000 });

        // Wait longer for content to load
        console.log("⏳ Aguardando carregamento completo...");
        await page.waitForTimeout(8000);

        // Take screenshot
        await page.screenshot({ path: "./test-output/workspace.png" });
        console.log("📸 Screenshot salvo: ./test-output/workspace.png");

        // Find song links to get the song IDs
        const songLinks = await page.$$('a[href*="/song/"]');
        console.log(`\n🔍 Encontrados ${songLinks.length} links de músicas`);

        if (songLinks.length < 2) {
            console.error("❌ Menos de 2 músicas encontradas!");
            await context.close();
            process.exit(1);
        }

        // Get first 2 song hrefs
        const songHrefs: string[] = [];
        for (let i = 0; i < Math.min(2, songLinks.length); i++) {
            const link = songLinks[i];
            if (link) {
                const href = await link.getAttribute('href');
                if (href) {
                    songHrefs.push(href);
                    console.log(`  ${i + 1}. ${href}`);
                }
            }
        }

        const downloadedSongs: { filename: string; buffer: Buffer }[] = [];

        // Download each song by navigating to its page
        for (let i = 0; i < songHrefs.length; i++) {
            const songHref = songHrefs[i];
            if (!songHref) continue;

            console.log(`\n🎵 Baixando música ${i + 1}...`);
            console.log(`  📌 Navegando para: https://suno.com${songHref}`);

            await page.goto(`https://suno.com${songHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForTimeout(5000);

            // Take screenshot of song page
            await page.screenshot({ path: `./test-output/song-page-${i + 1}.png` });
            console.log(`  📸 Screenshot da página da música salvo`);

            // Step 1: Click the menu button (...)
            console.log("  🔍 Procurando botão de menu...");

            // Wait for page to stabilize
            await page.waitForTimeout(2000);

            // Use locator instead of $$ for better stability
            const menuLocator = page.locator('button[data-context-menu-trigger="true"]').first();
            await menuLocator.waitFor({ state: 'visible', timeout: 10000 });

            console.log("  ✓ Botão de menu encontrado");
            await menuLocator.click({ force: true });
            console.log("  ✓ Clicou no menu (...)");
            await page.waitForTimeout(1500);

            // Screenshot of menu
            await page.screenshot({ path: `./test-output/song-menu-${i + 1}.png` });

            // Step 2: Find and HOVER over Download to reveal submenu
            console.log("  🔍 Procurando Download no menu...");

            // Use getByText to find Download
            let downloadEl = null;
            try {
                downloadEl = page.getByText('Download', { exact: true }).first();
                await downloadEl.waitFor({ state: 'visible', timeout: 5000 });
            } catch {
                // Try locator approach
                const downloadLocator = page.locator('text=Download').first();
                if (await downloadLocator.isVisible()) {
                    downloadEl = downloadLocator;
                }
            }

            if (!downloadEl) {
                console.log("  ❌ Download não encontrado no menu");
                await page.keyboard.press("Escape");
                continue;
            }

            // Hover over Download to reveal submenu
            await downloadEl.hover();
            console.log("  🖱️ Hover sobre Download...");
            await page.waitForTimeout(1500);

            // Screenshot of submenu
            await page.screenshot({ path: `./test-output/download-submenu-${i + 1}.png` });

            // Step 3: NOW set up download handler and click MP3 Audio
            console.log("  🎵 Procurando MP3 Audio...");

            // Set up download handler RIGHT BEFORE clicking
            const downloadPromise = page.waitForEvent("download", { timeout: 30000 });

            // Find and click MP3 Audio
            let mp3El = null;
            try {
                mp3El = page.getByText('MP3 Audio').first();
                await mp3El.waitFor({ state: 'visible', timeout: 5000 });
            } catch {
                // Try just "Audio"
                try {
                    mp3El = page.getByText('Audio', { exact: true }).first();
                    await mp3El.waitFor({ state: 'visible', timeout: 3000 });
                } catch {
                    console.log("  ❌ MP3 Audio não encontrado");
                    await page.keyboard.press("Escape");
                    continue;
                }
            }

            console.log("  ✓ Encontrado MP3 Audio, clicando...");
            await mp3El.click();

            // Wait for download
            console.log("  ⏳ Aguardando download...");
            try {
                const download = await downloadPromise;
                const path = await download.path();
                if (path) {
                    const buffer = await fs.readFile(path);
                    const filename = `haras-pancadao-${i + 1}.mp3`;
                    await fs.writeFile(`./test-output/${filename}`, buffer);
                    console.log(`  ✅ Salvo: ./test-output/${filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
                    downloadedSongs.push({ filename, buffer });
                }
            } catch (e) {
                console.log("  ❌ Download falhou ou timeout");
            }

            // Press Escape to close any menus
            await page.keyboard.press("Escape");
            await page.waitForTimeout(2000);
        }

        // Upload to R2 if songs were downloaded
        if (downloadedSongs.length > 0) {
            console.log("\n☁️ Fazendo upload para R2...");

            try {
                // Import S3 client directly
                const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

                const s3 = new S3Client({
                    region: "auto",
                    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
                    credentials: {
                        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "",
                        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "",
                    },
                });

                const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
                const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

                if (!bucketName) {
                    throw new Error("R2_BUCKET_NAME not configured");
                }

                for (let i = 0; i < downloadedSongs.length; i++) {
                    const song = downloadedSongs[i];
                    if (!song) continue;

                    const key = `songs/${order.id}/song-${i + 1}.mp3`;

                    // Upload to R2
                    const command = new PutObjectCommand({
                        Bucket: bucketName,
                        Key: key,
                        Body: song.buffer,
                        ContentType: "audio/mpeg",
                    });

                    await s3.send(command);

                    // Get public URL
                    const songPublicUrl = publicUrl
                        ? `${publicUrl}/${key}`
                        : `https://${bucketName}.r2.cloudflarestorage.com/${key}`;

                    console.log(`✅ Upload ${i + 1}: ${songPublicUrl}`);

                    // Update database
                    if (i === 0) {
                        await db.songOrder.update({
                            where: { id: order.id },
                            data: {
                                songFileUrl: songPublicUrl,
                                songFileKey: key,
                                songUploadedAt: new Date(),
                            }
                        });
                    } else if (i === 1) {
                        await db.songOrder.update({
                            where: { id: order.id },
                            data: {
                                songFileUrl2: songPublicUrl,
                                songFileKey2: key,
                                songUploadedAt2: new Date(),
                            }
                        });
                    }
                }

                // Update status to IN_PROGRESS (songs ready, awaiting delivery)
                await db.songOrder.update({
                    where: { id: order.id },
                    data: { status: "IN_PROGRESS" }
                });

                console.log("\n✅ Upload para R2 concluído!");
                console.log("✅ Status atualizado para IN_PROGRESS");
                console.log("⚠️  Músicas NÃO foram enviadas ao cliente");

            } catch (uploadError) {
                console.error("❌ Erro no upload:", uploadError);
            }
        } else {
            console.log("\n⚠️ Nenhuma música foi baixada");
        }

    } catch (error) {
        console.error("❌ Erro:", error);
        await page.screenshot({ path: "./test-output/error.png" });
    } finally {
        await context.close();
        await db.$disconnect();
    }

    console.log("\n✅ Script finalizado!");
}

main().catch(console.error);
