import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { StorageService } from "~/lib/storage";
import { db } from "~/server/db";
import { requireAdminApiAccess } from "~/server/auth/admin-api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TARGET_SIZE = 1500; // Reasonable size for honoree photos

export async function POST(request: NextRequest) {
    const access = await requireAdminApiAccess("LEADS");
    if (!access.ok) {
        return access.response;
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const orderId = formData.get("orderId") as string | null;

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

        // Get file buffer
        const arrayBuffer = await file.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);

        // Process image with sharp - resize but maintain aspect ratio
        const processedBuffer = await sharp(inputBuffer)
            .resize(TARGET_SIZE, TARGET_SIZE, {
                fit: "inside", // Maintain aspect ratio, fit within bounds
                withoutEnlargement: true, // Don't upscale small images
            })
            .jpeg({
                quality: 85,
                mozjpeg: true,
            })
            .toBuffer();

        // Generate unique key for R2
        const timestamp = Date.now();
        const key = `honoree-photos/${orderId}-${timestamp}.jpg`;

        // Upload to R2
        const url = await StorageService.uploadBuffer(
            key,
            processedBuffer,
            "image/jpeg"
        );

        // Get the order to check for old photo and delete it
        const existingOrder = await db.songOrder.findUnique({
            where: { id: orderId },
            select: { honoreePhotoKey: true },
        });

        // Delete old photo if exists
        if (existingOrder?.honoreePhotoKey) {
            try {
                await StorageService.deleteFile(existingOrder.honoreePhotoKey);
            } catch (e) {
                console.error("Failed to delete old honoree photo:", e);
            }
        }

        // Update order with new photo URL
        await db.songOrder.update({
            where: { id: orderId },
            data: {
                honoreePhotoUrl: url,
                honoreePhotoKey: key,
            },
        });

        // Calculate compression stats
        const originalSize = inputBuffer.length;
        const compressedSize = processedBuffer.length;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        return NextResponse.json({
            success: true,
            url,
            key,
            originalSize,
            compressedSize,
            compressionRatio: `${compressionRatio}%`,
        });
    } catch (error) {
        console.error("Honoree photo upload error:", error);
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

        // Get the order to find the photo key
        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: { honoreePhotoKey: true },
        });

        if (!order?.honoreePhotoKey) {
            return NextResponse.json(
                { error: "Pedido não possui foto do homenageado para deletar" },
                { status: 404 }
            );
        }

        // Delete from R2
        try {
            await StorageService.deleteFile(order.honoreePhotoKey);
            console.log(`[Delete Honoree Photo] Deleted from R2: ${order.honoreePhotoKey}`);
        } catch (e) {
            console.error("Failed to delete honoree photo from R2:", e);
        }

        // Clear photo URL in database
        await db.songOrder.update({
            where: { id: orderId },
            data: {
                honoreePhotoUrl: null,
                honoreePhotoKey: null,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Foto deletada com sucesso",
        });
    } catch (error) {
        console.error("Honoree photo delete error:", error);
        return NextResponse.json(
            { error: "Erro ao deletar foto" },
            { status: 500 }
        );
    }
}
