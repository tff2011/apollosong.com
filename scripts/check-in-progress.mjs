import "dotenv/config";
import { db } from "../src/server/db.js";

const inProgress = await db.songOrder.findMany({
    where: { status: "IN_PROGRESS", orderType: "MAIN" },
    select: {
        id: true,
        email: true,
        recipientName: true,
        createdAt: true,
        songFileUrl: true,
        songFileUrl2: true,
        songUploadedAt: true,
        songDeliveredAt: true,
        hasFastDelivery: true,
        lyrics: true,
        lyricsStatus: true,
    },
    orderBy: { createdAt: "asc" },
});

console.log("=== IN_PROGRESS Orders Analysis ===");
console.log("Total IN_PROGRESS (MAIN):", inProgress.length);

// Categorize
const withSong = inProgress.filter(o => o.songFileUrl || o.songFileUrl2);
const withoutSong = inProgress.filter(o => !o.songFileUrl && !o.songFileUrl2);
const withSongNotDelivered = withSong.filter(o => !o.songDeliveredAt);

console.log("\n--- Breakdown ---");
console.log("With song uploaded:", withSong.length);
console.log("Without song:", withoutSong.length);
console.log("With song but NOT delivered:", withSongNotDelivered.length);

// Orders with song but not delivered (problem!)
if (withSongNotDelivered.length > 0) {
    console.log("\n=== PROBLEM: Orders with song but not delivered ===");
    const now = new Date();
    withSongNotDelivered.slice(0, 20).forEach(o => {
        const uploadDate = o.songUploadedAt ? o.songUploadedAt.toISOString().split("T")[0] : "N/A";
        const daysSinceUpload = o.songUploadedAt ? Math.floor((now.getTime() - o.songUploadedAt.getTime()) / (1000 * 60 * 60 * 24)) : "N/A";
        console.log(
            o.id.slice(0, 15) + "...",
            (o.email || "").slice(0, 25).padEnd(25),
            "uploaded:", uploadDate,
            "days_ago:", daysSinceUpload,
            "fast:", o.hasFastDelivery ? "Y" : "N"
        );
    });
    if (withSongNotDelivered.length > 20) {
        console.log("... and", withSongNotDelivered.length - 20, "more");
    }
}

// Orders without song (may be waiting for generation)
if (withoutSong.length > 0) {
    console.log("\n=== Orders without song (waiting for generation) ===");
    withoutSong.slice(0, 10).forEach(o => {
        console.log(
            o.id.slice(0, 15) + "...",
            (o.email || "").slice(0, 25).padEnd(25),
            "created:", o.createdAt?.toISOString().split("T")[0] || "N/A",
            "lyrics:", o.lyricsStatus || "none"
        );
    });
    if (withoutSong.length > 10) {
        console.log("... and", withoutSong.length - 10, "more");
    }
}

process.exit(0);
