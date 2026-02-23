import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { StorageService } from "~/lib/storage";
import { db } from "~/server/db";
import path from "path";
import fs from "fs/promises";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const WATERMARK_SIZE = 90; // Watermark size in pixels
const WATERMARK_MARGIN = 20; // Margin from edge in pixels
const REFERENCE_SIZE = 1350; // Reference size for watermark scaling

export async function POST(request: NextRequest) {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const orderId = formData.get("orderId") as string | null;
        const promptType = formData.get("promptType") as string | null; // optional: "cartoon"|"photo"|"photoImproved"

        if (!file) {
            return NextResponse.json(
                { error: "Nenhum arquivo enviado" },
                { status: 400 }
            );
        }

        if (!orderId) {
            return NextResponse.json(
                { error: "ID do pedido não fornecido" },
                { status: 400 }
            );
        }

        // Validate file type
        if (!file.type.startsWith("image/")) {
            return NextResponse.json(
                { error: "Arquivo deve ser uma imagem" },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "Arquivo muito grande. Máximo 10MB." },
                { status: 400 }
            );
        }

        // Get file buffer (already resized + compressed by client)
        const arrayBuffer = await file.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        const originalSize = inputBuffer.length;

        // Get image dimensions for watermark positioning
        const metadata = await sharp(inputBuffer).metadata();
        const imgWidth = metadata.width || REFERENCE_SIZE;

        // Add watermark only (no resize — client sends square-cropped JPEG)
        let processedImage = sharp(inputBuffer);

        // Scale watermark size proportionally for smaller images
        const watermarkScale = Math.min(1, imgWidth / REFERENCE_SIZE);
        const scaledWatermarkSize = Math.round(WATERMARK_SIZE * watermarkScale);
        const scaledMargin = Math.round(WATERMARK_MARGIN * watermarkScale);

        try {
            const watermarkPath = path.join(process.cwd(), "public", "images", "watermark.png");
            await fs.access(watermarkPath);

            const watermarkBuffer = await sharp(watermarkPath)
                .resize(scaledWatermarkSize, scaledWatermarkSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
                .toBuffer();

            processedImage = processedImage.composite([{
                input: watermarkBuffer,
                top: imgWidth - scaledWatermarkSize - scaledMargin,
                left: imgWidth - scaledWatermarkSize - scaledMargin,
            }]);

            console.log("[Upload] Watermark added successfully");
        } catch {
            console.log("[Upload] No watermark file found at public/images/watermark.png, skipping");
        }

        const processedBuffer = await processedImage
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();

        // Generate key for R2 - deterministic per prompt type, or timestamped for generic uploads
        const validTypes = ["cartoon", "photo", "photoImproved"];
        const key = promptType && validTypes.includes(promptType)
            ? `covers/${orderId}-cover-${promptType}.jpg`
            : `covers/${orderId}-${Date.now()}.jpg`;

        // Upload to R2
        const url = await StorageService.uploadBuffer(
            key,
            processedBuffer,
            "image/jpeg"
        );

        if (!promptType) {
            // Generic upload: delete old cover and set as active
            const existingOrder = await db.songOrder.findUnique({
                where: { id: orderId },
                select: { streamingCoverKey: true },
            });

            if (existingOrder?.streamingCoverKey) {
                try {
                    await StorageService.deleteFile(existingOrder.streamingCoverKey);
                } catch (e) {
                    console.error("Failed to delete old cover:", e);
                }
            }
        }

        // Update order with new cover URL (always sets as active cover)
        await db.songOrder.update({
            where: { id: orderId },
            data: {
                streamingCoverUrl: url,
                streamingCoverKey: key,
                coverApproved: false,
            },
        });

        const compressedSize = processedBuffer.length;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        // Cache-busting for deterministic per-type keys
        const responseUrl = promptType ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}` : url;

        return NextResponse.json({
            success: true,
            url: responseUrl,
            key,
            promptType: promptType || null,
            originalSize,
            compressedSize,
            compressionRatio: `${compressionRatio}%`,
        });
    } catch (error) {
        console.error("Cover upload error:", error);
        return NextResponse.json(
            { error: "Erro ao processar imagem" },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get("orderId");

        if (!orderId) {
            return NextResponse.json(
                { error: "ID do pedido não fornecido" },
                { status: 400 }
            );
        }

        // Get the order to find the cover key
        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: { streamingCoverKey: true, streamingCoverUrl: true },
        });

        if (!order?.streamingCoverKey) {
            return NextResponse.json(
                { error: "Pedido não possui capa para deletar" },
                { status: 404 }
            );
        }

        // Delete from R2
        try {
            await StorageService.deleteFile(order.streamingCoverKey);
            console.log(`[Delete Cover] Deleted from R2: ${order.streamingCoverKey}`);
        } catch (e) {
            console.error("Failed to delete cover from R2:", e);
        }

        // Clear cover URL in database
        await db.songOrder.update({
            where: { id: orderId },
            data: {
                streamingCoverUrl: null,
                streamingCoverKey: null,
                coverApproved: false,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Capa deletada com sucesso",
        });
    } catch (error) {
        console.error("Cover delete error:", error);
        return NextResponse.json(
            { error: "Erro ao deletar capa" },
            { status: 500 }
        );
    }
}
