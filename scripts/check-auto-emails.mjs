import "dotenv/config";
import { db } from "../src/server/db.js";

// Check recent auto-delivery emails
const recentAutoEmails = await db.sentEmail.findMany({
    where: {
        template: "SONG_DELIVERY_AUTO",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
        id: true,
        recipient: true,
        createdAt: true,
        status: true,
    },
});

console.log("=== Recent Auto-Delivery Emails ===");
console.log("Count:", recentAutoEmails.length);
recentAutoEmails.forEach(e => {
    console.log(
        e.createdAt?.toISOString().slice(0, 19),
        (e.recipient || "").slice(0, 30).padEnd(30),
        e.status
    );
});

// Also check worker activity by checking completed orders
const recentAutoDelivered = await db.songOrder.findMany({
    where: {
        status: "COMPLETED",
        songDeliveredAt: { not: null },
    },
    orderBy: { songDeliveredAt: "desc" },
    take: 10,
    select: {
        id: true,
        email: true,
        songDeliveredAt: true,
        hasFastDelivery: true,
    },
});

console.log("\n=== Recently Delivered Orders ===");
console.log("Count:", recentAutoDelivered.length);
recentAutoDelivered.forEach(o => {
    console.log(
        o.songDeliveredAt?.toISOString().slice(0, 19),
        (o.email || "").slice(0, 30).padEnd(30),
        o.hasFastDelivery ? "EXPRESS" : "STANDARD"
    );
});

process.exit(0);
