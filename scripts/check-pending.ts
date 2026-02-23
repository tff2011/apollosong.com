import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

async function check() {
    const orders = await db.songOrder.findMany({
        where: {
            status: { in: ["PAID", "IN_PROGRESS"] },
            orderType: "MAIN",
            paymentCompletedAt: { lte: new Date("2026-01-03T23:59:59Z") }
        },
        select: {
            id: true,
            recipientName: true,
            songFileUrl: true,
            paymentCompletedAt: true,
            status: true,
            email: true,
        },
        orderBy: { paymentCompletedAt: "asc" }
    });

    console.log("Pedidos PAID/IN_PROGRESS até dia 3:\n");

    let withSong = 0;
    let withoutSong = 0;

    for (const o of orders) {
        const hasSong = o.songFileUrl ? "✅ COM" : "❌ SEM";
        const paid = o.paymentCompletedAt?.toISOString().split("T")[0];
        console.log(`${hasSong} | ${o.recipientName.padEnd(20)} | ${paid} | ${o.email}`);

        if (o.songFileUrl) {
            withSong++;
        } else {
            withoutSong++;
        }
    }

    console.log(`\nTotal: ${orders.length}`);
    console.log(`  - Com música: ${withSong}`);
    console.log(`  - Sem música: ${withoutSong}`);

    await db.$disconnect();
}

check();
