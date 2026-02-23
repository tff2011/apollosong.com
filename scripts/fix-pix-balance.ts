import { PrismaClient } from "../generated/prisma";
import Stripe from "stripe";

const db = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function fixPixBalance() {
    // Find the PIX order missing stripeNetAmount
    const order = await db.songOrder.findFirst({
        where: {
            email: "mariadenisefigueiredo20@gmail.com",
            status: "PAID",
            stripeNetAmount: null,
            paymentMethod: "pix",
        },
        select: {
            id: true,
            paymentId: true,
            email: true,
            recipientName: true,
            priceAtOrder: true,
            currency: true,
        },
    });

    if (!order) {
        console.log("No PIX order found needing update");
        return;
    }

    console.log(`Found order: ${order.id}`);
    console.log(`  Recipient: ${order.recipientName}`);
    console.log(`  Email: ${order.email}`);
    console.log(`  Payment ID: ${order.paymentId}`);

    if (!order.paymentId) {
        console.log("Order has no paymentId!");
        return;
    }

    // Fetch the charge from Stripe
    const charges = await stripe.charges.list({
        payment_intent: order.paymentId,
        limit: 1,
    });

    const charge = charges.data[0];
    if (!charge) {
        console.log("No charge found for this payment intent");
        return;
    }

    console.log(`  Charge ID: ${charge.id}`);
    console.log(`  Balance Transaction: ${charge.balance_transaction}`);

    if (!charge.balance_transaction) {
        console.log("Charge has no balance_transaction yet!");
        return;
    }

    // Fetch balance transaction
    const balanceTransaction = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction as string
    );

    console.log(`  Fee: ${balanceTransaction.fee} (${balanceTransaction.fee / 100} USD)`);
    console.log(`  Net: ${balanceTransaction.net} (${balanceTransaction.net / 100} USD)`);

    // Update the order
    await db.songOrder.update({
        where: { id: order.id },
        data: {
            stripeFee: balanceTransaction.fee,
            stripeNetAmount: balanceTransaction.net,
        },
    });

    console.log(`\n✅ Order ${order.id} updated successfully!`);
    console.log(`   Net USD: $${(balanceTransaction.net / 100).toFixed(2)}`);
}

fixPixBalance()
    .catch(console.error)
    .finally(() => db.$disconnect());
