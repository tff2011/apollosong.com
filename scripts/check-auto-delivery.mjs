import "dotenv/config";
import { db } from "../src/server/db.js";

const EXPRESS_DELIVERY_HOURS = 12;
const STANDARD_DELIVERY_HOURS = 48;

const now = new Date();
const expressCutoffTime = new Date(now.getTime() - EXPRESS_DELIVERY_HOURS * 60 * 60 * 1000);
const standardCutoffTime = new Date(now.getTime() - STANDARD_DELIVERY_HOURS * 60 * 60 * 1000);

console.log("=== Auto-Delivery Debug ===");
console.log("Now:", now.toISOString());
console.log("Express cutoff (12h ago):", expressCutoffTime.toISOString());
console.log("Standard cutoff (48h ago):", standardCutoffTime.toISOString());

// Find express orders that SHOULD have been auto-delivered
const expressOverdue = await db.songOrder.findMany({
    where: {
        hasFastDelivery: true,
        status: { in: ["PAID", "IN_PROGRESS"] },
        songFileUrl: { not: null },
        songDeliveredAt: null,
        paymentCompletedAt: {
            not: null,
            lte: expressCutoffTime,
        },
        orderType: "MAIN",
    },
    select: {
        id: true,
        email: true,
        recipientName: true,
        paymentCompletedAt: true,
        songUploadedAt: true,
        hasFastDelivery: true,
    },
    orderBy: { paymentCompletedAt: "asc" },
});

// Find standard orders that SHOULD have been auto-delivered
const standardOverdue = await db.songOrder.findMany({
    where: {
        NOT: { hasFastDelivery: true },
        status: { in: ["PAID", "IN_PROGRESS"] },
        songFileUrl: { not: null },
        songDeliveredAt: null,
        paymentCompletedAt: {
            not: null,
            lte: standardCutoffTime,
        },
        orderType: "MAIN",
    },
    select: {
        id: true,
        email: true,
        recipientName: true,
        paymentCompletedAt: true,
        songUploadedAt: true,
        hasFastDelivery: true,
    },
    orderBy: { paymentCompletedAt: "asc" },
});

console.log("\n=== EXPRESS Overdue (paid > 12h ago, has song, not delivered) ===");
console.log("Count:", expressOverdue.length);
if (expressOverdue.length > 0) {
    expressOverdue.slice(0, 20).forEach(o => {
        const hoursSincePayment = Math.round((now.getTime() - (o.paymentCompletedAt?.getTime() || 0)) / (1000 * 60 * 60));
        console.log(
            o.id.slice(0, 15) + "...",
            (o.email || "").slice(0, 25).padEnd(25),
            "paid:", o.paymentCompletedAt?.toISOString().slice(0, 16),
            "hours_ago:", hoursSincePayment
        );
    });
    if (expressOverdue.length > 20) console.log("... and", expressOverdue.length - 20, "more");
}

console.log("\n=== STANDARD Overdue (paid > 48h ago, has song, not delivered) ===");
console.log("Count:", standardOverdue.length);
if (standardOverdue.length > 0) {
    standardOverdue.slice(0, 20).forEach(o => {
        const hoursSincePayment = Math.round((now.getTime() - (o.paymentCompletedAt?.getTime() || 0)) / (1000 * 60 * 60));
        console.log(
            o.id.slice(0, 15) + "...",
            (o.email || "").slice(0, 25).padEnd(25),
            "paid:", o.paymentCompletedAt?.toISOString().slice(0, 16),
            "hours_ago:", hoursSincePayment
        );
    });
    if (standardOverdue.length > 20) console.log("... and", standardOverdue.length - 20, "more");
}

// Also check: orders within the window (not yet overdue)
const expressPending = await db.songOrder.count({
    where: {
        hasFastDelivery: true,
        status: { in: ["PAID", "IN_PROGRESS"] },
        songFileUrl: { not: null },
        songDeliveredAt: null,
        paymentCompletedAt: {
            not: null,
            gt: expressCutoffTime,
        },
        orderType: "MAIN",
    },
});

const standardPending = await db.songOrder.count({
    where: {
        NOT: { hasFastDelivery: true },
        status: { in: ["PAID", "IN_PROGRESS"] },
        songFileUrl: { not: null },
        songDeliveredAt: null,
        paymentCompletedAt: {
            gt: standardCutoffTime,
        },
        orderType: "MAIN",
    },
});

console.log("\n=== Summary ===");
console.log("Express overdue (should have been sent):", expressOverdue.length);
console.log("Standard overdue (should have been sent):", standardOverdue.length);
console.log("Express pending (within 12h window):", expressPending);
console.log("Standard pending (within 48h window):", standardPending);

if (expressOverdue.length > 0 || standardOverdue.length > 0) {
    console.log("\n⚠️  PROBLEM: There are orders that should have been auto-delivered but weren't!");
    console.log("Check if the auto-delivery worker is running.");
}

process.exit(0);
