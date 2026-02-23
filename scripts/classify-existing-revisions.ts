/**
 * Script to classify existing REVISION orders that don't have revisionFault
 * Run with: npx tsx scripts/classify-existing-revisions.ts
 */

import { PrismaClient } from "@prisma/client";
import { classifyRevision } from "../src/lib/revision-classifier";

const db = new PrismaClient();

async function main() {
    console.log("Finding REVISION orders without fault classification...\n");

    const orders = await db.songOrder.findMany({
        where: {
            status: "REVISION",
            revisionFault: null,
        },
        select: {
            id: true,
            recipientName: true,
            revisionNotes: true,
            revisionType: true,
            locale: true,
            qualities: true,
            memories: true,
            message: true,
        },
    });

    console.log(`Found ${orders.length} orders to classify\n`);

    for (const order of orders) {
        console.log(`\n---\nClassifying: ${order.recipientName} (${order.id})`);
        console.log(`Current type: ${order.revisionType || "none"}`);
        console.log(`Notes: ${order.revisionNotes?.substring(0, 100)}...`);

        try {
            const classification = await classifyRevision({
                revisionNotes: order.revisionNotes || "",
                recipientName: order.recipientName,
                locale: order.locale || "pt",
                originalQualities: order.qualities || undefined,
                originalMemories: order.memories || undefined,
                originalMessage: order.message || undefined,
            });

            console.log(`\nResult:`);
            console.log(`  Type: ${classification.type}`);
            console.log(`  Fault: ${classification.fault}`);
            console.log(`  Confidence: ${classification.confidence}`);
            console.log(`  Reason: ${classification.faultReason}`);

            // Update the order
            await db.songOrder.update({
                where: { id: order.id },
                data: {
                    revisionType: classification.type,
                    revisionFault: classification.fault,
                    revisionFaultReason: classification.faultReason,
                },
            });

            console.log(`  ✅ Updated!`);
        } catch (error) {
            console.error(`  ❌ Error:`, error);
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("\n\nDone!");
}

main()
    .catch(console.error)
    .finally(() => db.$disconnect());
