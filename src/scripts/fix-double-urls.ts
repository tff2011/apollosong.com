
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting URL sanitization...");

    // Find all song orders with potential double protocol in songFileUrl
    const orders = await prisma.songOrder.findMany({
        where: {
            OR: [
                { songFileUrl: { startsWith: "https://https://" } },
                { songFileUrl2: { startsWith: "https://https://" } },
            ],
        },
        select: {
            id: true,
            songFileUrl: true,
            songFileUrl2: true,
        },
    });

    console.log(`Found ${orders.length} orders with corrupted URLs.`);

    let updatedCount = 0;

    for (const order of orders) {
        const updateData: any = {};
        let needsUpdate = false;

        if (order.songFileUrl && order.songFileUrl.startsWith("https://https://")) {
            updateData.songFileUrl = order.songFileUrl.replace(
                "https://https://",
                "https://"
            );
            needsUpdate = true;
        }

        if (order.songFileUrl2 && order.songFileUrl2.startsWith("https://https://")) {
            updateData.songFileUrl2 = order.songFileUrl2.replace(
                "https://https://",
                "https://"
            );
            needsUpdate = true;
        }

        if (needsUpdate) {
            await prisma.songOrder.update({
                where: { id: order.id },
                data: updateData,
            });
            updatedCount++;
        }
    }

    console.log(`Successfully updated ${updatedCount} orders.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
