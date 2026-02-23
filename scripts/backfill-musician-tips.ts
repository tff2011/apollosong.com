import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import Stripe from "stripe";

const db = new PrismaClient();
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
    throw new Error("STRIPE_SECRET_KEY is required");
}
const stripe = new Stripe(stripeKey);

const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

async function backfillMusicianTips() {
    const tips = await db.songOrder.findMany({
        where: {
            orderType: "MUSICIAN_TIP",
            status: { in: ["PAID", "COMPLETED"] },
            stripeNetAmount: null,
            OR: [
                { paymentId: { not: null } },
                { stripePaymentIntentId: { not: null } },
            ],
        },
        orderBy: { createdAt: "asc" },
        take: LIMIT,
        select: {
            id: true,
            paymentId: true,
            stripePaymentIntentId: true,
            email: true,
            priceAtOrder: true,
            currency: true,
            createdAt: true,
            status: true,
        },
    });

    if (tips.length === 0) {
        console.log("No musician tips found needing backfill.");
        return;
    }

    console.log(`Found ${tips.length} musician tip(s) needing backfill.`);
    if (DRY_RUN) {
        console.log("Running in DRY_RUN mode. No updates will be written.");
    }

    let updated = 0;
    let skipped = 0;

    for (const tip of tips) {
        const paymentIntentId = tip.paymentId ?? tip.stripePaymentIntentId;
        if (!paymentIntentId) {
            console.log(`[skip] ${tip.id} has no payment intent id`);
            skipped += 1;
            continue;
        }

        const charges = await stripe.charges.list({
            payment_intent: paymentIntentId,
            limit: 1,
        });

        const charge = charges.data[0];
        if (!charge) {
            console.log(`[skip] ${tip.id} no charge found for ${paymentIntentId}`);
            skipped += 1;
            continue;
        }

        if (!charge.balance_transaction) {
            console.log(`[skip] ${tip.id} charge has no balance_transaction yet`);
            skipped += 1;
            continue;
        }

        const balanceTransaction = await stripe.balanceTransactions.retrieve(
            charge.balance_transaction as string
        );

        const stripeFee = balanceTransaction.fee;
        const stripeNetAmount = balanceTransaction.net;

        if (DRY_RUN) {
            console.log(
                `[dry-run] ${tip.id} net: ${stripeNetAmount} fee: ${stripeFee}`
            );
            continue;
        }

        const updateResult = await db.songOrder.updateMany({
            where: { id: tip.id, stripeNetAmount: null },
            data: { stripeFee, stripeNetAmount },
        });

        if (updateResult.count > 0) {
            updated += 1;
            console.log(`[updated] ${tip.id} net: ${stripeNetAmount} fee: ${stripeFee}`);
        } else {
            skipped += 1;
            console.log(`[skip] ${tip.id} already updated`);
        }
    }

    console.log(`Done. Updated: ${updated}, skipped: ${skipped}.`);
}

backfillMusicianTips()
    .catch((error) => {
        console.error("Backfill failed:", error);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
