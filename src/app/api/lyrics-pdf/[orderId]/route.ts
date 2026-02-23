import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "~/server/db";
import { LyricsPDF } from "~/components/certificate/lyrics-pdf";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    const { orderId } = await params;

    if (!orderId) {
        return NextResponse.json(
            { error: "Order ID is required" },
            { status: 400 }
        );
    }

    try {
        // Fetch order with lyrics
        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                recipientName: true,
                lyrics: true,
                correctedLyrics: true,
                displayLyrics: true,
                locale: true,
                hasLyrics: true,
                status: true,
                orderType: true,
                parentOrderId: true,
                parentOrder: {
                    select: { hasLyrics: true },
                },
                childOrders: {
                    where: { orderType: "LYRICS_UPSELL" },
                    select: { hasLyrics: true },
                },
            },
        });

        if (!order) {
            return NextResponse.json(
                { error: "Order not found" },
                { status: 404 }
            );
        }

        // Check if any child LYRICS_UPSELL order has hasLyrics
        const hasLyricsUpsell = order.childOrders?.some((child) => child.hasLyrics);

        // For LYRICS_UPSELL, GENRE_VARIANT, or EXTRA_SONG, get lyrics from parent order if this order has no lyrics content
        const hasOwnLyricsContent = !!(order.displayLyrics || order.correctedLyrics || order.lyrics);
        const shouldUseParent =
            (order.orderType === "LYRICS_UPSELL" || order.orderType === "GENRE_VARIANT" || order.orderType === "EXTRA_SONG") &&
            order.parentOrderId &&
            !order.hasLyrics &&
            !hasLyricsUpsell &&
            !hasOwnLyricsContent;

        const targetOrder = shouldUseParent
            ? await db.songOrder.findUnique({
                    where: { id: order.parentOrderId! },
                    select: {
                        id: true,
                        recipientName: true,
                        lyrics: true,
                        correctedLyrics: true,
                        displayLyrics: true,
                        locale: true,
                        hasLyrics: true,
                        status: true,
                    },
                })
                : order;

        if (!targetOrder) {
            return NextResponse.json(
                { error: "Order not found" },
                { status: 404 }
            );
        }

        // Check if lyrics are available (own purchase, upsell child, or parent purchase)
        if (!targetOrder.hasLyrics && !hasLyricsUpsell && !order.parentOrder?.hasLyrics) {
            return NextResponse.json(
                { error: "Lyrics add-on not purchased for this order" },
                { status: 403 }
            );
        }

        if (targetOrder.status !== "COMPLETED") {
            return NextResponse.json(
                { error: "Lyrics not yet available" },
                { status: 404 }
            );
        }

        // Generate PDF using the best available lyrics (corrected > display > original)
        const lyricsToUse = targetOrder.displayLyrics || targetOrder.correctedLyrics || targetOrder.lyrics;
        if (!lyricsToUse) {
            return NextResponse.json(
                { error: "Lyrics not yet available" },
                { status: 404 }
            );
        }
        const pdfBuffer = await renderToBuffer(
            LyricsPDF({
                recipientName: targetOrder.recipientName,
                lyrics: lyricsToUse,
                locale: targetOrder.locale || "en",
            })
        );

        // Convert Buffer to Uint8Array for NextResponse
        const uint8Array = new Uint8Array(pdfBuffer);

        // Return PDF as response
        const filename = `lyrics-${targetOrder.recipientName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`;

        return new NextResponse(uint8Array, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-cache",
            },
        });
    } catch (error) {
        console.error("Error generating lyrics PDF:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: "Failed to generate PDF", details: errorMessage },
            { status: 500 }
        );
    }
}
