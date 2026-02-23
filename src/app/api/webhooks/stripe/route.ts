import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "~/server/db";
import { sendPurchaseEvent } from "~/lib/facebook-capi";
import { sendTikTokPurchaseEvent } from "~/lib/tiktok-capi";
import { sendSaleAlert, sendMusicianTipAlert } from "~/lib/telegram";
import { enqueueLyricsGeneration } from "~/server/queues/lyrics-generation";
import { type Prisma } from "@prisma/client";
import { convertSupabaseImportOnPaid } from "~/lib/supabase-source-conversion";
import { nanoid } from "nanoid";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

type ChildOrder = {
    orderType: string;
    priceAtOrder?: number | null;
    recipientName?: string | null;
    genre?: string | null;
};

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return NextResponse.json(
            { error: "Missing stripe-signature header" },
            { status: 400 }
        );
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return NextResponse.json(
            { error: "Webhook signature verification failed" },
            { status: 400 }
        );
    }

    // Handle the event
    switch (event.type) {
        case "payment_intent.succeeded": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const bundleOrderIds = paymentIntent.metadata.orderIds
                ? paymentIntent.metadata.orderIds
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean)
                : [];
            const orderId =
                paymentIntent.metadata.primaryOrderId ||
                paymentIntent.metadata.orderId ||
                bundleOrderIds[0];
            const orderIds = bundleOrderIds.length > 0 && orderId
                ? Array.from(new Set([orderId, ...bundleOrderIds]))
                : orderId
                ? [orderId]
                : [];

            if (orderId) {
                try {
                    const order = await db.songOrder.findUnique({
                        where: { id: orderId },
                        select: {
                            id: true,
                            email: true,
                            backupWhatsApp: true,
                            currency: true,
                            priceAtOrder: true,
                            stripeFee: true,
                            stripeNetAmount: true,
                            status: true,
                            recipientName: true,
                            recipient: true,
                            genre: true,
                            vocals: true,
                            locale: true,
                            userAgent: true,
                            userIp: true,
                            fbc: true,
                            fbp: true,
                            landingPage: true,
                            deviceType: true,
                            utmSource: true,
                            utmMedium: true,
                            utmCampaign: true,
                            hasFastDelivery: true,
                            planType: true,
                            hasCertificate: true,
                            hasLyrics: true,
                            orderType: true,
                            parentOrderId: true,
                            childOrders: {
                                select: {
                                    orderType: true,
                                    priceAtOrder: true,
                                    recipientName: true,
                                    genre: true,
                                },
                            },
                        },
                    });

                    if (!order) {
                        console.warn(`Order ${orderId} not found for webhook`);
                        break;
                    }

                    const shouldSendCapi =
                        order.status !== "PAID" && order.status !== "COMPLETED";

                    // Get Stripe fee, net amount, and payment method from the charge
                    let stripeFee: number | null = null;
                    let stripeNetAmount: number | null = null;
                    let paymentMethod: string | null = null;

                    try {
                        const charges = await stripe.charges.list({
                            payment_intent: paymentIntent.id,
                            limit: 1,
                        });

                        const charge = charges.data[0];
                        if (charge) {
                            // Get payment method type (card, pix, boleto, etc.)
                            paymentMethod = charge.payment_method_details?.type ?? null;

                            console.log(`[payment_intent.succeeded] Order ${orderId}, method: ${paymentMethod}, balance_transaction: ${charge.balance_transaction ?? 'NULL'}`);

                            if (charge.balance_transaction) {
                                const balanceTransaction = await stripe.balanceTransactions.retrieve(
                                    charge.balance_transaction as string
                                );
                                stripeFee = balanceTransaction.fee;
                                stripeNetAmount = balanceTransaction.net; // Always in USD (account currency)
                            } else if (paymentMethod === "pix") {
                                console.log(`[payment_intent.succeeded] PIX payment - balance_transaction not available yet, will be captured by charge.succeeded/updated`);
                            }
                        }
                    } catch (feeError) {
                        console.error("Failed to fetch Stripe fee:", feeError);
                    }

                    // Build update data (without financials - those are updated atomically below)
                    const updateData: Prisma.SongOrderUpdateInput = {
                        status: "PAID",
                        paymentId: paymentIntent.id,
                        paymentCompletedAt: new Date(),
                        paymentMethod,
                    };

                    // Update order status to PAID (bundle-aware)
                    if (orderIds.length > 0) {
                        await db.songOrder.updateMany({
                            where: { id: { in: orderIds } },
                            data: updateData,
                        });
                    } else {
                        await db.songOrder.update({
                            where: { id: orderId },
                            data: updateData,
                        });
                    }

                    // Update financials atomically to prevent duplicate Telegram alerts
                    // Only one webhook (payment_intent.succeeded or charge.succeeded) will succeed
                    let wasFirstToSetFinancials = false;
                    if (stripeFee !== null && stripeNetAmount !== null) {
                        const financialUpdate = await db.songOrder.updateMany({
                            where: { id: orderId, stripeNetAmount: null },
                            data: { stripeFee, stripeNetAmount },
                        });
                        wasFirstToSetFinancials = financialUpdate.count > 0;
                        if (wasFirstToSetFinancials) {
                            console.log(`[payment_intent.succeeded] Order ${orderId} financials set atomically`);
                        } else {
                            console.log(`[payment_intent.succeeded] Order ${orderId} financials already set by another webhook`);
                        }
                    }

                    // Convert supabase-import → supabase-convertido on payment
                    await convertSupabaseImportOnPaid(orderIds.length > 0 ? orderIds : [orderId]);

                    console.log(`Order ${orderId} marked as PAID`);

                    // Also update child orders (order bumps) to PAID and inherit order bumps from parent
                    if (order.childOrders && order.childOrders.length > 0) {
                        await db.songOrder.updateMany({
                            where: { parentOrderId: orderId },
                            data: {
                                status: "PAID",
                                paymentCompletedAt: new Date(),
                                // Inherit lyrics PDF and certificate from parent order
                                hasLyrics: order.hasLyrics ?? false,
                                hasCertificate: order.hasCertificate ?? false,
                            },
                        });
                        console.log(`${order.childOrders.length} child order(s) marked as PAID for order ${orderId} (inherited hasLyrics: ${order.hasLyrics}, hasCertificate: ${order.hasCertificate})`);

                        // Ensure song-producing child orders with certificate have their own public token.
                        // This avoids reusing the parent "Gift Experience" link for extra song/genre variant.
                        if (order.hasCertificate) {
                            const certificateChildren = await db.songOrder.findMany({
                                where: {
                                    parentOrderId: orderId,
                                    orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT"] },
                                    hasCertificate: true,
                                    certificateToken: null,
                                },
                                select: { id: true },
                            });

                            let generatedTokenCount = 0;
                            for (const child of certificateChildren) {
                                const updateResult = await db.songOrder.updateMany({
                                    where: { id: child.id, certificateToken: null },
                                    data: { certificateToken: nanoid(12) },
                                });
                                if (updateResult.count > 0) {
                                    generatedTokenCount += 1;
                                }
                            }

                            if (generatedTokenCount > 0) {
                                console.log(
                                    `[payment_intent.succeeded] Generated ${generatedTokenCount} certificate token(s) for child orders of ${orderId}`
                                );
                            }
                        }

                        // Convert supabase-import → supabase-convertido for child orders too
                        const childIds = await db.songOrder.findMany({
                            where: { parentOrderId: orderId },
                            select: { id: true },
                        });
                        if (childIds.length > 0) {
                            await convertSupabaseImportOnPaid(childIds.map(c => c.id));
                        }
                    }

                    // BRL premium plan includes karaoke at checkout.
                    // Mark parent as pending karaoke so UI and workers can continue automatically.
                    if (order.orderType === "MAIN" && order.planType === "acelerado") {
                        await db.songOrder.update({
                            where: { id: orderId },
                            data: { hasKaraokePlayback: true, karaokeStatus: "pending" },
                        });
                    }

                    // Handle LYRICS_UPSELL: Update parent order to have lyrics and mark as completed
                    if (order.orderType === "LYRICS_UPSELL" && order.parentOrderId) {
                        await db.songOrder.update({
                            where: { id: order.parentOrderId },
                            data: { hasLyrics: true },
                        });
                        // Mark upsell as COMPLETED since delivery is instant
                        await db.songOrder.update({
                            where: { id: orderId },
                            data: { status: "COMPLETED" },
                        });
                        console.log(`Parent order ${order.parentOrderId} updated with hasLyrics=true, LYRICS_UPSELL ${orderId} marked as COMPLETED`);
                    }

                    // Handle KARAOKE_UPSELL: Enqueue vocal separation after payment
                    if (order.orderType === "KARAOKE_UPSELL" && order.parentOrderId) {
                        const parentOrder = await db.songOrder.findUnique({
                            where: { id: order.parentOrderId },
                            select: { id: true, songFileUrl: true, kieTaskId: true, kieAudioId1: true, kieAudioId2: true },
                        });

                        // Always mark parent as having karaoke purchased
                        await db.songOrder.update({
                            where: { id: order.parentOrderId },
                            data: { hasKaraokePlayback: true, karaokeStatus: "pending" },
                        });

                        // Keep child karaoke order linked to the exact parent Kie IDs.
                        if (parentOrder) {
                            await db.songOrder.update({
                                where: { id: orderId },
                                data: {
                                    kieTaskId: parentOrder.kieTaskId,
                                    kieAudioId1: parentOrder.kieAudioId1,
                                    kieAudioId2: parentOrder.kieAudioId2,
                                },
                            });
                        }

                        if (parentOrder?.songFileUrl && parentOrder.kieTaskId && parentOrder.kieAudioId1) {
                            // Song is ready — enqueue karaoke generation immediately
                            const { enqueueKaraokeGeneration } = await import("~/server/queues/karaoke-generation");
                            await enqueueKaraokeGeneration({
                                orderId,
                                parentOrderId: order.parentOrderId,
                                songFileUrl: parentOrder.songFileUrl,
                                kieTaskId: parentOrder.kieTaskId,
                                kieAudioId: parentOrder.kieAudioId1,
                                kieAudioId2: parentOrder.kieAudioId2 ?? undefined,
                            });
                            console.log(`Karaoke generation queued for order ${orderId} (parent: ${order.parentOrderId})`);
                        } else {
                            // Song not ready yet — karaoke will be auto-triggered when song completes
                            console.log(`Karaoke pre-purchased for ${orderId}: waiting for parent ${order.parentOrderId} song completion`);
                        }

                        // Send Telegram alert for karaoke purchase
                        try {
                            const { sendOperationalAlert } = await import("~/lib/telegram");
                            const currencySymbol = order.currency === "BRL" ? "R$" : order.currency === "EUR" ? "€" : "$";
                            const amount = ((order.priceAtOrder ?? 0) / 100).toFixed(2).replace(".", order.currency === "BRL" || order.currency === "EUR" ? "," : ".");
                            await sendOperationalAlert(
                                `🎤 <b>Karaokê vendido!</b>\n\n` +
                                `Pedido: <code>${orderId}</code>\n` +
                                `Homenageado: ${order.recipientName}\n` +
                                `Gênero: ${order.genre}\n` +
                                `Valor: ${currencySymbol}${amount}\n` +
                                `Email: ${order.email}\n` +
                                `Música pronta: ${parentOrder?.songFileUrl ? "✅ Sim (geração iniciada)" : "⏳ Não (aguardando música)"}`
                            );
                        } catch { /* don't let alert failure break webhook */ }
                    }

                    // Handle MUSICIAN_TIP: Mark as COMPLETED immediately (no delivery needed)
                    if (order.orderType === "MUSICIAN_TIP") {
                        const tipUpdateData: Prisma.SongOrderUpdateInput = { status: "COMPLETED" };
                        // Ensure financial data is stored for tips (user request: "guardar o net liquid usd")
                        if (stripeNetAmount !== null) tipUpdateData.stripeNetAmount = stripeNetAmount;
                        if (stripeFee !== null) tipUpdateData.stripeFee = stripeFee;

                        await db.songOrder.update({
                            where: { id: orderId },
                            data: tipUpdateData,
                        });
                        console.log(`MUSICIAN_TIP ${orderId} marked as COMPLETED (Net: ${stripeNetAmount}, Fee: ${stripeFee})`);
                    }

                    // Queue lyrics generation only on first paid transition
                    // (avoid duplicate generation on repeated payment_intent.succeeded webhooks).
                    if (
                        shouldSendCapi &&
                        order.orderType !== "MUSICIAN_TIP" &&
                        order.orderType !== "LYRICS_UPSELL" &&
                        order.orderType !== "STREAMING_UPSELL" &&
                        order.orderType !== "KARAOKE_UPSELL"
                    ) {
                        try {
                            const lyricsPriority = order.hasFastDelivery ? 1 : 5;
                            await enqueueLyricsGeneration(orderId, { priority: lyricsPriority });
                            console.log(`Lyrics generation queued for order ${orderId}`);

                            // Also queue lyrics generation for child orders that actually need songs
                            // (EXTRA_SONG and GENRE_VARIANT only).
                            if (order.childOrders && order.childOrders.length > 0) {
                                const childOrderIds = await db.songOrder.findMany({
                                    where: {
                                        parentOrderId: orderId,
                                        orderType: { in: ["EXTRA_SONG", "GENRE_VARIANT"] },
                                    },
                                    select: { id: true },
                                });
                                for (const child of childOrderIds) {
                                    await enqueueLyricsGeneration(child.id, { priority: lyricsPriority });
                                    console.log(`Lyrics generation queued for child order ${child.id}`);
                                }
                            }
                        } catch (lyricsError) {
                            console.error(`Failed to queue lyrics generation for order ${orderId}:`, lyricsError);
                            // Don't fail the webhook response, but alert ops
                            try {
                                const { sendOperationalAlert } = await import("~/lib/telegram");
                                await sendOperationalAlert(`🚨 <b>FALHA ao enfileirar lyrics</b>\n\nPedido <code>${orderId}</code> não entrou na fila de geração. Ação manual necessária.\n\nErro: ${lyricsError instanceof Error ? lyricsError.message : "Unknown"}`);
                            } catch { /* don't let alert failure break webhook */ }
                        }
                    } else if (!shouldSendCapi) {
                        console.log(`Skipping lyrics queue for order ${orderId}: duplicate paid webhook`);
                    }

                    if (shouldSendCapi) {
                        const chargedAmountCents = paymentIntent.amount ?? order.priceAtOrder;
                        let sourceUrl: string | undefined;
                        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

                        if (siteUrl && order.landingPage) {
                            try {
                                sourceUrl = new URL(order.landingPage, siteUrl).toString();
                            } catch {
                                sourceUrl = undefined;
                            }
                        }

                        await sendPurchaseEvent({
                            orderId: order.id,
                            email: order.email,
                            value: chargedAmountCents / 100,
                            currency: order.currency,
                            contentIds: [order.id],
                            userAgent: order.userAgent ?? undefined,
                            userIp: order.userIp ?? undefined,
                            fbc: order.fbc ?? undefined,
                            fbp: order.fbp ?? undefined,
                            sourceUrl,
                        });

                        await sendTikTokPurchaseEvent({
                            orderId: order.id,
                            email: order.email,
                            value: chargedAmountCents / 100,
                            currency: order.currency,
                            userAgent: order.userAgent ?? undefined,
                            userIp: order.userIp ?? undefined,
                            sourceUrl,
                        });
                    }

                    // Send Telegram sale alert BEFORE email (email is slow and can timeout)
                    // Only send if we were the first webhook to set financial data (atomic check)
                    if (shouldSendCapi && wasFirstToSetFinancials) {
                        try {
                            // Use special alert for musician tips
                            if (order.orderType === "MUSICIAN_TIP" && order.parentOrderId) {
                                await sendMusicianTipAlert({
                                    orderId: order.id,
                                    parentOrderId: order.parentOrderId,
                                    locale: order.locale,
                                    email: order.email,
                                    currency: order.currency,
                                    amountCents: paymentIntent.amount ?? order.priceAtOrder,
                                    netAmountCents: stripeNetAmount!, // Safe: wasFirstToSetFinancials guarantees non-null
                                    stripeFee: stripeFee!, // Safe: wasFirstToSetFinancials guarantees non-null
                                });
                            } else {
                                const hasExtraSong = order.childOrders?.some(
                                    (child: ChildOrder) => child.orderType === "EXTRA_SONG"
                                );
                                const genreVariantCount = order.childOrders?.filter(
                                    (child: ChildOrder) => child.orderType === "GENRE_VARIANT"
                                ).length ?? 0;

                                console.log(
                                    `[payment_intent.succeeded] Sending sale alert for ${order.id} (orderType=${order.orderType}, planType=${order.planType ?? "n/a"})`
                                );
                                await sendSaleAlert({
                                    orderId: order.id,
                                    locale: order.locale,
                                    recipientName: order.recipientName,
                                    recipient: order.recipient,
                                    genre: order.genre,
                                    vocals: order.vocals,
                                    email: order.email,
                                    backupWhatsApp: order.backupWhatsApp,
                                    currency: order.currency,
                                    grossAmountCents: paymentIntent.amount ?? order.priceAtOrder,
                                    netAmountCents: stripeNetAmount!, // Safe: wasFirstToSetFinancials guarantees non-null
                                    stripeFee: stripeFee!, // Safe: wasFirstToSetFinancials guarantees non-null
                                    hasFastDelivery: order.hasFastDelivery ?? false,
                                    hasExtraSong: hasExtraSong ?? false,
                                    genreVariantCount,
                                    hasCertificate: order.hasCertificate ?? false,
                                    hasLyrics: order.hasLyrics ?? false,
                                    orderType: order.orderType,
                                    planType: order.planType,
                                    utmSource: order.utmSource,
                                    utmMedium: order.utmMedium,
                                    utmCampaign: order.utmCampaign,
                                    deviceType: order.deviceType,
                                });
                            }
                        } catch (telegramError) {
                            console.error("Failed to send Telegram alert:", telegramError);
                        }
                    }

                    // Send confirmation email to customer (can be slow, do it last)
                    try {
                        const { buildPurchaseApprovedEmail } = await import(
                            "~/server/email/purchase-approved"
                        );
                        const { sendEmail } = await import("~/server/email/mailer");

                        const baseUrl =
                            process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
                        const checkoutUrl = new URL(
                            `/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`,
                            baseUrl
                        ).toString();

                        const emailContent = buildPurchaseApprovedEmail({
                            orderId: order.id,
                            recipientName: order.recipientName,
                            customerEmail: order.email,
                            locale: order.locale,
                            price: (paymentIntent.amount ?? order.priceAtOrder) / 100,
                            currency: order.currency,
                            genre: order.genre,
                            checkoutUrl,
                            childOrders: order.childOrders,
                            hasCertificate: order.hasCertificate ?? false,
                            hasLyrics: order.hasLyrics ?? false,
                            orderType: order.orderType ?? "MAIN",
                        });

                        await sendEmail({
                            to: order.email,
                            subject: emailContent.subject,
                            html: emailContent.html,
                            text: emailContent.text,
                            template: "PURCHASE_APPROVED",
                            orderId: order.id,
                            metadata: {
                                paymentIntentId: paymentIntent.id,
                            },
                            from: emailContent.from,
                        });
                        console.log(`Purchase approved email sent to ${order.email}`);
                    } catch (emailError) {
                        console.error(
                            `Failed to send purchase approved email for order ${orderId}:`,
                            emailError
                        );
                        // Don't fail the webhook response
                    }
                } catch (error) {
                    console.error(`Failed to update order ${orderId}:`, error);
                    // Don't return error - we've received the payment
                }
            }
            break;
        }

        case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const orderId =
                paymentIntent.metadata.primaryOrderId ||
                paymentIntent.metadata.orderId ||
                paymentIntent.metadata.orderIds?.split(",")[0];

            if (orderId) {
                console.log(
                    `Payment failed for order ${orderId}: ${paymentIntent.last_payment_error?.message}`
                );
                // Order remains in PENDING status
            }
            break;
        }

        case "charge.refunded": {
            const charge = event.data.object as Stripe.Charge;
            const paymentIntentId = charge.payment_intent as string;

            if (paymentIntentId) {
                try {
                    // Find order by payment ID and mark as refunded
                    await db.songOrder.updateMany({
                        where: { paymentId: paymentIntentId },
                        data: { status: "REFUNDED" },
                    });

                    console.log(`Order with payment ${paymentIntentId} marked as REFUNDED`);
                } catch (error) {
                    console.error(`Failed to update refunded order:`, error);
                }
            }
            break;
        }

        // Handle balance_transaction for PIX (fires after payment_intent.succeeded)
        case "charge.succeeded": {
            const charge = event.data.object as Stripe.Charge;
            const paymentIntentId = charge.payment_intent as string;
            const paymentMethodType = charge.payment_method_details?.type;

            console.log(`[charge.succeeded] Received for ${paymentIntentId}, method: ${paymentMethodType}, balance_transaction: ${charge.balance_transaction ?? 'NULL'}`);

            // Only process if we have both payment_intent and balance_transaction
            if (paymentIntentId && charge.balance_transaction) {
                try {
                    // Find order missing stripeNetAmount (PIX/delayed balance transaction)
                    const order = await db.songOrder.findFirst({
                        where: {
                            stripeNetAmount: null,
                            status: { in: ["PENDING", "PAID", "COMPLETED"] },
                            OR: [
                                { paymentId: paymentIntentId },
                                { stripePaymentIntentId: paymentIntentId },
                            ],
                        },
                        select: {
                            id: true,
                            email: true,
                            backupWhatsApp: true,
                            currency: true,
                            priceAtOrder: true,
                            recipientName: true,
                            recipient: true,
                            genre: true,
                            vocals: true,
                            locale: true,
                            utmSource: true,
                            utmMedium: true,
                            utmCampaign: true,
                            deviceType: true,
                            hasFastDelivery: true,
                            planType: true,
                            hasCertificate: true,
                            hasLyrics: true,
                            orderType: true,
                            parentOrderId: true,
                            childOrders: {
                                select: { orderType: true },
                            },
                        },
                    });

                    if (order) {
                        // Fetch balance transaction to get fee and net amount
                        const balanceTransaction = await stripe.balanceTransactions.retrieve(
                            charge.balance_transaction as string
                        );

                        const stripeFee = balanceTransaction.fee;
                        const stripeNetAmount = balanceTransaction.net;

                        // Update order with financial data using atomic check to avoid race conditions
                        const updateResult = await db.songOrder.updateMany({
                            where: {
                                id: order.id,
                                stripeNetAmount: null // Only update if not already updated
                            },
                            data: { stripeFee, stripeNetAmount },
                        });

                        if (updateResult.count === 0) {
                            console.log(`[charge.succeeded] Order ${order.id} was already updated, skipping duplicate alert.`);
                            break;
                        }

                        console.log(`[charge.succeeded] Order ${order.id} updated with balance_transaction (fee: ${stripeFee}, net: ${stripeNetAmount})`);

                        // Send the Telegram alert that was skipped in payment_intent.succeeded
                        try {
                            // Use special alert for musician tips
                            if (order.orderType === "MUSICIAN_TIP" && order.parentOrderId) {
                                await sendMusicianTipAlert({
                                    orderId: order.id,
                                    parentOrderId: order.parentOrderId,
                                    locale: order.locale,
                                    email: order.email,
                                    currency: order.currency,
                                    amountCents: charge.amount,
                                    netAmountCents: stripeNetAmount,
                                    stripeFee: stripeFee,
                                });
                            } else {
                                const hasExtraSong = order.childOrders?.some(
                                    (child: ChildOrder) => child.orderType === "EXTRA_SONG"
                                );
                                const genreVariantCount = order.childOrders?.filter(
                                    (child: ChildOrder) => child.orderType === "GENRE_VARIANT"
                                ).length ?? 0;

                                console.log(
                                    `[charge.succeeded] Sending sale alert for ${order.id} (orderType=${order.orderType}, planType=${order.planType ?? "n/a"})`
                                );
                                await sendSaleAlert({
                                    orderId: order.id,
                                    locale: order.locale,
                                    recipientName: order.recipientName,
                                    recipient: order.recipient,
                                    genre: order.genre,
                                    vocals: order.vocals,
                                    email: order.email,
                                    backupWhatsApp: order.backupWhatsApp,
                                    currency: order.currency,
                                    grossAmountCents: charge.amount,
                                    netAmountCents: stripeNetAmount,
                                    stripeFee: stripeFee,
                                    hasFastDelivery: order.hasFastDelivery ?? false,
                                    hasExtraSong: hasExtraSong ?? false,
                                    genreVariantCount,
                                    hasCertificate: order.hasCertificate ?? false,
                                    hasLyrics: order.hasLyrics ?? false,
                                    orderType: order.orderType,
                                    planType: order.planType,
                                    utmSource: order.utmSource,
                                    utmMedium: order.utmMedium,
                                    utmCampaign: order.utmCampaign,
                                    deviceType: order.deviceType,
                                });
                            }
                            console.log(`[charge.succeeded] Telegram alert sent for order ${order.id}`);
                        } catch (telegramError) {
                            console.error("[charge.succeeded] Failed to send Telegram alert:", telegramError);
                        }
                    } else {
                        console.log(`[charge.succeeded] No order needs update for ${paymentIntentId}`);
                    }
                } catch (error) {
                    console.error("[charge.succeeded] Failed to process:", error);
                }
            }
            break;
        }

        // Fallback: Handle delayed balance_transaction for PIX and other payment methods
        case "charge.updated": {
            const charge = event.data.object as Stripe.Charge;
            const paymentIntentId = charge.payment_intent as string;
            const paymentMethodType = charge.payment_method_details?.type;

            console.log(`[charge.updated] Received for ${paymentIntentId}, method: ${paymentMethodType}, balance_transaction: ${charge.balance_transaction ?? 'NULL'}`);

            // Only process if we have a balance_transaction (PIX may not have it immediately)
            if (paymentIntentId && charge.balance_transaction) {
                try {
                    // Find order missing stripeNetAmount (PIX/delayed balance transaction)
                    const order = await db.songOrder.findFirst({
                        where: {
                            stripeNetAmount: null,
                            status: { in: ["PENDING", "PAID", "COMPLETED"] },
                            OR: [
                                { paymentId: paymentIntentId },
                                { stripePaymentIntentId: paymentIntentId },
                            ],
                        },
                        select: {
                            id: true,
                            email: true,
                            backupWhatsApp: true,
                            currency: true,
                            priceAtOrder: true,
                            recipientName: true,
                            recipient: true,
                            genre: true,
                            vocals: true,
                            locale: true,
                            utmSource: true,
                            utmMedium: true,
                            utmCampaign: true,
                            deviceType: true,
                            hasFastDelivery: true,
                            planType: true,
                            hasCertificate: true,
                            hasLyrics: true,
                            orderType: true,
                            parentOrderId: true,
                            childOrders: {
                                select: { orderType: true },
                            },
                        },
                    });

                    if (order) {
                        // Fetch balance transaction to get fee and net amount
                        const balanceTransaction = await stripe.balanceTransactions.retrieve(
                            charge.balance_transaction as string
                        );

                        const stripeFee = balanceTransaction.fee;
                        const stripeNetAmount = balanceTransaction.net;

                        // Update order with financial data using atomic check to avoid race conditions
                        const updateResult = await db.songOrder.updateMany({
                            where: {
                                id: order.id,
                                stripeNetAmount: null // Only update if not already updated
                            },
                            data: { stripeFee, stripeNetAmount },
                        });

                        if (updateResult.count === 0) {
                            console.log(`[charge.updated] Order ${order.id} was already updated, skipping duplicate alert.`);
                            break;
                        }

                        console.log(`[charge.updated] Order ${order.id} updated with balance_transaction (fee: ${stripeFee}, net: ${stripeNetAmount})`);

                        // Send the Telegram alert that was skipped earlier
                        try {
                            // Use special alert for musician tips
                            if (order.orderType === "MUSICIAN_TIP" && order.parentOrderId) {
                                await sendMusicianTipAlert({
                                    orderId: order.id,
                                    parentOrderId: order.parentOrderId,
                                    locale: order.locale,
                                    email: order.email,
                                    currency: order.currency,
                                    amountCents: charge.amount,
                                    netAmountCents: stripeNetAmount,
                                    stripeFee: stripeFee,
                                });
                            } else {
                                const hasExtraSong = order.childOrders?.some(
                                    (child: ChildOrder) => child.orderType === "EXTRA_SONG"
                                );
                                const genreVariantCount = order.childOrders?.filter(
                                    (child: ChildOrder) => child.orderType === "GENRE_VARIANT"
                                ).length ?? 0;

                                console.log(
                                    `[charge.updated] Sending sale alert for ${order.id} (orderType=${order.orderType}, planType=${order.planType ?? "n/a"})`
                                );
                                await sendSaleAlert({
                                    orderId: order.id,
                                    locale: order.locale,
                                    recipientName: order.recipientName,
                                    recipient: order.recipient,
                                    genre: order.genre,
                                    vocals: order.vocals,
                                    email: order.email,
                                    backupWhatsApp: order.backupWhatsApp,
                                    currency: order.currency,
                                    grossAmountCents: charge.amount,
                                    netAmountCents: stripeNetAmount,
                                    stripeFee: stripeFee,
                                    hasFastDelivery: order.hasFastDelivery ?? false,
                                    hasExtraSong: hasExtraSong ?? false,
                                    genreVariantCount,
                                    hasCertificate: order.hasCertificate ?? false,
                                    hasLyrics: order.hasLyrics ?? false,
                                    orderType: order.orderType,
                                    planType: order.planType,
                                    utmSource: order.utmSource,
                                    utmMedium: order.utmMedium,
                                    utmCampaign: order.utmCampaign,
                                    deviceType: order.deviceType,
                                });
                            }
                            console.log(`[charge.updated] Telegram alert sent for order ${order.id}`);
                        } catch (telegramError) {
                            console.error("[charge.updated] Failed to send Telegram alert:", telegramError);
                        }
                    }
                } catch (error) {
                    console.error("[charge.updated] Failed to process:", error);
                }
            }
            break;
        }

        default:
            // Unhandled event type
            console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
}
