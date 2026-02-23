import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const orderId = process.argv[2] || "cmkqqx3ef000ql804bm4l4lq1";

  const order = await db.songOrder.findUnique({
    where: { id: orderId },
    select: {
      lyrics: true,
      correctedLyrics: true,
      displayLyrics: true,
    },
  });

  if (!order) {
    console.log("Order not found");
    return;
  }

  const lyrics = order.lyrics || "";
  const corrected = order.correctedLyrics || "";
  const display = order.displayLyrics || "";

  console.log("\n📊 Comparison:");
  console.log(`   lyrics length: ${lyrics.length}`);
  console.log(`   correctedLyrics length: ${corrected.length}`);
  console.log(`   displayLyrics length: ${display.length}`);

  console.log(`\n   lyrics === correctedLyrics: ${lyrics === corrected}`);
  console.log(`   lyrics === displayLyrics: ${lyrics === display}`);
  console.log(`   correctedLyrics === displayLyrics: ${corrected === display}`);

  // Find differences
  if (lyrics !== corrected) {
    console.log("\n🔍 Differences between lyrics and correctedLyrics:");
    const lyricsLines = lyrics.split("\n");
    const correctedLines = corrected.split("\n");
    for (let i = 0; i < Math.max(lyricsLines.length, correctedLines.length); i++) {
      if (lyricsLines[i] !== correctedLines[i]) {
        console.log(`   Line ${i + 1}:`);
        console.log(`     lyrics:    "${lyricsLines[i] || "(empty)"}"`);
        console.log(`     corrected: "${correctedLines[i] || "(empty)"}"`);
      }
    }
  }

  await db.$disconnect();
}

main().catch(console.error);
