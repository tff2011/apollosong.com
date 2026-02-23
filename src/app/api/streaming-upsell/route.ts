import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

/**
 * GET /api/streaming-upsell?orderId=xxx&email=xxx
 * Creates a streaming VIP upsell order and redirects to checkout
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const parentOrderId = searchParams.get("orderId");
    const email = searchParams.get("email");

    if (!parentOrderId || !email) {
        return NextResponse.json(
            { error: "Missing orderId or email" },
            { status: 400 }
        );
    }

    try {
        // Find the parent order
        const parentOrder = await db.songOrder.findUnique({
            where: { id: parentOrderId },
            select: {
                id: true,
                email: true,
                backupWhatsApp: true,
                status: true,
                recipientName: true,
                recipient: true,
                genre: true,
                vocals: true,
                locale: true,
                currency: true,
                orderType: true,
                qualities: true,
                memories: true,
                message: true,
                hasFastDelivery: true,
            },
        });

        if (!parentOrder) {
            return NextResponse.redirect(
                new URL(`/pt/track-order?error=not_found`, request.url)
            );
        }

        // Validate email
        if (parentOrder.email.toLowerCase() !== email.toLowerCase()) {
            return NextResponse.redirect(
                new URL(`/${parentOrder.locale}/track-order?error=email_mismatch`, request.url)
            );
        }

        // Check if streaming upsell already exists
        const existingUpsell = await db.songOrder.findFirst({
            where: {
                parentOrderId: parentOrder.id,
                orderType: "STREAMING_UPSELL",
            },
        });

        if (existingUpsell) {
            // Redirect to existing upsell checkout if pending, or track-order if paid
            if (existingUpsell.status === "PENDING") {
                return NextResponse.redirect(
                    new URL(`/${parentOrder.locale}/order/${existingUpsell.id}`, request.url)
                );
            }
            return NextResponse.redirect(
                new URL(`/${parentOrder.locale}/track-order?email=${encodeURIComponent(email)}`, request.url)
            );
        }

        // Calculate price based on currency
        const priceAtOrder = parentOrder.currency === "BRL" ? 19700 : 9900;

        // Create the streaming upsell order
        const streamingUpsell = await db.songOrder.create({
            data: {
                email: parentOrder.email,
                status: "PENDING",
                orderType: "STREAMING_UPSELL",
                parentOrderId: parentOrder.id,
                recipientName: parentOrder.recipientName,
                recipient: parentOrder.recipient,
                genre: parentOrder.genre,
                vocals: parentOrder.vocals,
                locale: parentOrder.locale,
                currency: parentOrder.currency,
                priceAtOrder,
                qualities: parentOrder.qualities,
                memories: parentOrder.memories,
                message: parentOrder.message,
                hasFastDelivery: false,
                backupWhatsApp: parentOrder.backupWhatsApp,
            },
        });

        // Redirect to checkout
        return NextResponse.redirect(
            new URL(`/${parentOrder.locale}/order/${streamingUpsell.id}`, request.url)
        );
    } catch (error) {
        console.error("Error creating streaming upsell:", error);
        return NextResponse.redirect(
            new URL(`/pt/track-order?error=server_error`, request.url)
        );
    }
}
