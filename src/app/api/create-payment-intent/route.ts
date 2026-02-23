import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "~/server/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PaymentOrderRow = {
    id: string;
    email: string;
    locale: string;
    currency: string;
    priceAtOrder: number;
    recipientName: string;
    status: string;
    stripePaymentIntentId: string | null;
    parentOrderId: string | null;
    orderType: string;
};

async function getOrderForPayment(orderId: string): Promise<PaymentOrderRow | null> {
    return db.songOrder.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            email: true,
            locale: true,
            currency: true,
            priceAtOrder: true,
            recipientName: true,
            status: true,
            stripePaymentIntentId: true,
            parentOrderId: true,
            orderType: true,
        },
    });
}

/**
 * Some orders (e.g., order bumps) have priceAtOrder=0 because they are included
 * in a parent/wrapper order. Creating a PaymentIntent for them triggers a Stripe
 * "minimum charge amount" error. Resolve the first payable ancestor instead.
 */
async function resolvePayableOrder(orderId: string): Promise<{
    payableOrder: PaymentOrderRow | null;
    resolvedOrderIds: string[];
}> {
    const resolvedOrderIds: string[] = [];
    const seen = new Set<string>();

    let currentId: string | null = orderId;
    while (currentId) {
        if (seen.has(currentId)) break;
        seen.add(currentId);

        const order = await getOrderForPayment(currentId);
        if (!order) return { payableOrder: null, resolvedOrderIds };

        resolvedOrderIds.push(order.id);

        if (order.priceAtOrder > 0 || !order.parentOrderId) {
            return { payableOrder: order, resolvedOrderIds };
        }

        currentId = order.parentOrderId;
    }

    // Defensive fallback
    return { payableOrder: await getOrderForPayment(orderId), resolvedOrderIds };
}

export async function POST(request: NextRequest) {
    try {
        const { orderId, orderIds } = await request.json();

        if (!orderId) {
            return NextResponse.json(
                { error: "Order ID is required" },
                { status: 400 }
            );
        }

        const rawOrderIds = Array.isArray(orderIds)
            ? orderIds
            : typeof orderIds === "string"
            ? orderIds.split(",")
            : [];
        const normalizedOrderIds = rawOrderIds
            .map((id) => (typeof id === "string" ? id.trim() : id))
            .filter(Boolean);
        const uniqueOrderIds = Array.from(new Set([orderId, ...normalizedOrderIds].filter(Boolean)));
        const isBundleCheckout = uniqueOrderIds.length > 1;

        if (isBundleCheckout) {
            const orders = await db.songOrder.findMany({
                where: { id: { in: uniqueOrderIds } },
                select: {
                    id: true,
                    email: true,
                    locale: true,
                    currency: true,
                    priceAtOrder: true,
                    recipientName: true,
                    status: true,
                    stripePaymentIntentId: true,
                    orderType: true,
                    parentOrderId: true,
                },
            });

            if (orders.length !== uniqueOrderIds.length) {
                return NextResponse.json(
                    { error: "One or more orders not found" },
                    { status: 404 }
                );
            }

            if (orders.some((order) => order.orderType !== "STREAMING_UPSELL")) {
                return NextResponse.json(
                    { error: "Bundle checkout only supports streaming upsells" },
                    { status: 400 }
                );
            }

            const primaryOrder = orders.find((order) => order.id === orderId) ?? orders[0]!;
            const normalizedEmail = primaryOrder.email.toLowerCase();
            const currency = primaryOrder.currency;
            const locale = primaryOrder.locale;
            const hasMismatchedOrder = orders.some(
                (order) =>
                    order.email.toLowerCase() !== normalizedEmail ||
                    order.currency !== currency ||
                    order.locale !== locale
            );

            if (hasMismatchedOrder) {
                return NextResponse.json(
                    { error: "Order bundle mismatch" },
                    { status: 400 }
                );
            }

            if (orders.some((order) => order.status !== "PENDING")) {
                return NextResponse.json(
                    { error: "Order already paid" },
                    { status: 400 }
                );
            }

            const existingIntentIds = Array.from(
                new Set(orders.map((order) => order.stripePaymentIntentId).filter(Boolean))
            );

            if (existingIntentIds.length > 1) {
                return NextResponse.json(
                    { error: "Multiple payment intents found for this bundle" },
                    { status: 400 }
                );
            }

            const totalAmount = orders.reduce((sum, order) => sum + order.priceAtOrder, 0);

            if (existingIntentIds.length === 1) {
                try {
                    const existingPaymentIntent = await stripe.paymentIntents.retrieve(
                        existingIntentIds[0]!
                    );

                    if (
                        existingPaymentIntent.status === "requires_payment_method" ||
                        existingPaymentIntent.status === "requires_confirmation" ||
                        existingPaymentIntent.status === "requires_action"
                    ) {
                        // Check if the existing payment intent amount matches the bundle total
                        if (existingPaymentIntent.amount === totalAmount) {
                            await db.songOrder.updateMany({
                                where: { id: { in: uniqueOrderIds }, stripePaymentIntentId: null },
                                data: { stripePaymentIntentId: existingPaymentIntent.id },
                            });
                            return NextResponse.json({
                                clientSecret: existingPaymentIntent.client_secret,
                                paymentIntentId: existingPaymentIntent.id,
                                amount: existingPaymentIntent.amount,
                            });
                        }
                        // Amount mismatch - cancel old intent and create new one
                        console.log(`Payment intent amount mismatch: ${existingPaymentIntent.amount} vs ${totalAmount}, creating new one`);
                        await stripe.paymentIntents.cancel(existingPaymentIntent.id);
                        await db.songOrder.updateMany({
                            where: { stripePaymentIntentId: existingPaymentIntent.id },
                            data: { stripePaymentIntentId: null },
                        });
                    }

                    if (existingPaymentIntent.status === "succeeded") {
                        return NextResponse.json(
                            { error: "Order already paid" },
                            { status: 400 }
                        );
                    }
                } catch (retrieveError) {
                    console.log("Could not retrieve existing PaymentIntent, creating new one");
                }
            }
            const isBRL = currency === "BRL";
            const paymentMethodTypes: Stripe.PaymentIntentCreateParams["payment_method_types"] =
                isBRL ? ["card", "pix"] : ["card"];

            const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
                amount: totalAmount,
                currency: currency.toLowerCase(),
                payment_method_types: paymentMethodTypes,
                receipt_email: primaryOrder.email,
                metadata: {
                    orderId: primaryOrder.id,
                    primaryOrderId: primaryOrder.id,
                    orderIds: uniqueOrderIds.join(","),
                    recipientName: primaryOrder.recipientName,
                },
                description: `ApolloSong - Custom Song for ${primaryOrder.recipientName}`,
            };

            if (isBRL) {
                paymentIntentParams.payment_method_options = {
                    pix: {
                        amount_includes_iof: "always",
                    },
                };
            }

            const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

            await db.songOrder.updateMany({
                where: { id: { in: uniqueOrderIds } },
                data: { stripePaymentIntentId: paymentIntent.id },
            });

            return NextResponse.json({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                amount: paymentIntent.amount,
            });
        }

        const { payableOrder: order, resolvedOrderIds } = await resolvePayableOrder(orderId);

        if (!order) {
            return NextResponse.json(
                { error: "Order not found" },
                { status: 404 }
            );
        }

        if (order.status === "PAID" || order.status === "COMPLETED") {
            return NextResponse.json(
                { error: "Order already paid" },
                { status: 400 }
            );
        }

        if (order.priceAtOrder <= 0) {
            return NextResponse.json(
                { error: "This order has no payable amount (it may be included in another order)" },
                { status: 400 }
            );
        }

        if (order.stripePaymentIntentId) {
            try {
                const existingPaymentIntent = await stripe.paymentIntents.retrieve(
                    order.stripePaymentIntentId
                );

                if (
                    existingPaymentIntent.status === "requires_payment_method" ||
                    existingPaymentIntent.status === "requires_confirmation" ||
                    existingPaymentIntent.status === "requires_action"
                ) {
                    // Ensure included/child orders can recover this same PaymentIntent on refresh.
                    if (resolvedOrderIds.length > 1) {
                        await db.songOrder.updateMany({
                            where: { id: { in: resolvedOrderIds }, stripePaymentIntentId: null },
                            data: { stripePaymentIntentId: existingPaymentIntent.id },
                        });
                    }
                    return NextResponse.json({
                        clientSecret: existingPaymentIntent.client_secret,
                        paymentIntentId: existingPaymentIntent.id,
                        amount: existingPaymentIntent.amount,
                    });
                }

                if (existingPaymentIntent.status === "succeeded") {
                    return NextResponse.json(
                        { error: "Order already paid" },
                        { status: 400 }
                    );
                }
            } catch (retrieveError) {
                console.log("Could not retrieve existing PaymentIntent, creating new one");
            }
        }

        const isBRL = order.currency === "BRL";
        const paymentMethodTypes: Stripe.PaymentIntentCreateParams["payment_method_types"] =
            isBRL ? ["card", "pix"] : ["card"];

        const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
            amount: order.priceAtOrder,
            currency: order.currency.toLowerCase(),
            payment_method_types: paymentMethodTypes,
            receipt_email: order.email,
            metadata: {
                orderId: order.id,
                recipientName: order.recipientName,
            },
            description: `ApolloSong - Custom Song for ${order.recipientName}`,
        };

        if (isBRL) {
            paymentIntentParams.payment_method_options = {
                pix: {
                    amount_includes_iof: "always",
                },
            };
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

        // Ensure any resolved "included" orders also point at the same PaymentIntent.
        const ordersToUpdate = resolvedOrderIds.length > 0 ? resolvedOrderIds : [orderId];
        await db.songOrder.updateMany({
            where: { id: { in: ordersToUpdate } },
            data: { stripePaymentIntentId: paymentIntent.id },
        });

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
        });
    } catch (error) {
        console.error("Error creating payment intent:", error);

        if (error instanceof Stripe.errors.StripeError) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Failed to create payment intent" },
            { status: 500 }
        );
    }
}
