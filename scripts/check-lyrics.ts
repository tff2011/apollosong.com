import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2] || "lisi141297@gmail.com";

  const order = await db.songOrder.findFirst({
    where: { email, orderType: "MAIN" },
    select: {
      id: true,
      recipientName: true,
      status: true,
      hasLyrics: true,
      lyrics: true,
      correctedLyrics: true,
      displayLyrics: true,
      lyricsPdfA4Url: true,
      lyricsPdfA3Url: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!order) {
    console.log("Order not found");
    return;
  }

  console.log("\n📋 Order Details:");
  console.log(`   ID: ${order.id}`);
  console.log(`   Recipient: ${order.recipientName}`);
  console.log(`   Status: ${order.status}`);
  console.log(`   Has Lyrics Addon: ${order.hasLyrics}`);
  console.log(`   A4 PDF URL: ${order.lyricsPdfA4Url || "NULL"}`);
  console.log(`   A3 PDF URL: ${order.lyricsPdfA3Url || "NULL"}`);

  // Show which lyrics source will be used
  const lyricsSource = order.correctedLyrics
    ? "correctedLyrics"
    : order.displayLyrics
      ? "displayLyrics"
      : "lyrics";

  console.log(`\n📝 Lyrics Source: ${lyricsSource}`);

  if (order.lyrics) {
    console.log(`\n--- LYRICS (original) ---`);
    console.log(order.lyrics.substring(0, 500) + "...");
  }

  if (order.displayLyrics) {
    console.log(`\n--- DISPLAY LYRICS ---`);
    console.log(order.displayLyrics.substring(0, 500) + "...");
  }

  if (order.correctedLyrics) {
    console.log(`\n--- CORRECTED LYRICS ---`);
    console.log(order.correctedLyrics.substring(0, 500) + "...");
  }

  await db.$disconnect();
}

main().catch(console.error);
