import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2] || "amaurisantino@gmail.com";

  const orders = await db.songOrder.findMany({
    where: { email },
    select: {
      id: true,
      recipientName: true,
      orderType: true,
      genre: true,
      status: true,
      createdAt: true,
      parentOrderId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nOrders for ${email}:\n`);
  orders.forEach((o) => {
    console.log(`- ${o.orderType.padEnd(15)} | ${(o.recipientName || "N/A").padEnd(20)} | Genre: ${(o.genre || "N/A").padEnd(25)} | Status: ${o.status.padEnd(12)} | Parent: ${o.parentOrderId || "N/A"}`);
  });

  await db.$disconnect();
}

main().catch(console.error);
