import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();
  const entries = await db.supportKnowledge.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
    select: { id: true, title: true, category: true, locale: true, channel: true, isActive: true },
  });
  console.table(entries);
  await db.$disconnect();
}

main();
