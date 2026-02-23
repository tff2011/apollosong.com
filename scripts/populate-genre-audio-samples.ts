/**
 * Script to populate GenreAudioSample table with real customer songs
 * Now includes vocals (male/female) to support filtering
 *
 * Run with: npx tsx scripts/populate-genre-audio-samples.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Fetching completed orders with songs...\n");

    // Get all completed orders with songs
    const orders = await prisma.songOrder.findMany({
        where: {
            status: "COMPLETED",
            songFileUrl: { not: null },
            vocals: { in: ["male", "female"] }, // Only orders with explicit vocals
        },
        select: {
            id: true,
            genre: true,
            locale: true,
            vocals: true,
            recipientName: true,
            songFileUrl: true,
            updatedAt: true,
        },
        orderBy: {
            updatedAt: "desc", // Most recent first
        },
    });

    console.log(`Found ${orders.length} completed orders with songs\n`);

    // Group by locale -> genre -> vocals, keeping only the first (most recent) for each
    const samplesByKey = new Map<string, typeof orders[0]>();

    for (const order of orders) {
        if (!order.vocals) continue;
        const key = `${order.locale}:${order.genre}:${order.vocals}`;
        if (!samplesByKey.has(key)) {
            samplesByKey.set(key, order);
        }
    }

    console.log(`Unique locale/genre/vocals combinations: ${samplesByKey.size}\n`);

    // Show what we found
    const byLocale = new Map<string, Map<string, string[]>>();
    for (const [key, order] of samplesByKey) {
        const [locale, genre, vocals] = key.split(":");
        if (!byLocale.has(locale!)) {
            byLocale.set(locale!, new Map());
        }
        const localeMap = byLocale.get(locale!)!;
        if (!localeMap.has(vocals!)) {
            localeMap.set(vocals!, []);
        }
        localeMap.get(vocals!)!.push(genre!);
    }

    console.log("Samples by locale and vocals:");
    for (const [locale, vocalsMap] of byLocale) {
        console.log(`  ${locale.toUpperCase()}:`);
        for (const [vocals, genres] of vocalsMap) {
            console.log(`    ${vocals}: ${genres.length} genres - ${genres.sort().join(", ")}`);
        }
    }

    console.log("\n--- Inserting into GenreAudioSample table ---\n");

    let inserted = 0;
    let skipped = 0;

    for (const [key, order] of samplesByKey) {
        const [locale, genre, vocals] = key.split(":");

        if (!order.songFileUrl || !vocals) continue;

        try {
            await prisma.genreAudioSample.upsert({
                where: {
                    locale_genre_vocals: {
                        locale: locale!,
                        genre: genre!,
                        vocals: vocals,
                    },
                },
                update: {
                    audioUrl: order.songFileUrl,
                },
                create: {
                    locale: locale!,
                    genre: genre!,
                    vocals: vocals,
                    audioUrl: order.songFileUrl,
                },
            });
            console.log(`  [OK] ${locale}/${genre}/${vocals}`);
            inserted++;
        } catch (error) {
            console.error(`  [SKIP] ${locale}/${genre}/${vocals}: ${error}`);
            skipped++;
        }
    }

    console.log(`\nDone! Inserted/updated: ${inserted}, Skipped: ${skipped}`);

    // Show final counts
    const finalCounts = await prisma.genreAudioSample.groupBy({
        by: ["locale", "vocals"],
        _count: true,
    });

    console.log("\nFinal counts in GenreAudioSample:");
    for (const item of finalCounts) {
        console.log(`  ${item.locale.toUpperCase()} / ${item.vocals}: ${item._count} samples`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
