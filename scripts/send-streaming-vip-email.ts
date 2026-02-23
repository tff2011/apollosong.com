/**
 * Send Streaming VIP Upsell email for a specific order (real production flow)
 * Usage: npx tsx scripts/send-streaming-vip-email.ts <email>
 */

import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { buildStreamingVipUpsellEmail } from "../src/server/email/streaming-vip-upsell";

dotenv.config({ path: ".env" });

const db = new PrismaClient();
const targetEmail = process.argv[2];

if (!targetEmail) {
    console.error("Usage: npx tsx scripts/send-streaming-vip-email.ts <email>");
    process.exit(1);
}

async function main() {
    console.log(`🔍 Buscando pedidos COMPLETED para: ${targetEmail}`);

    // Find completed orders for this email
    const orders = await db.songOrder.findMany({
        where: {
            email: targetEmail,
            status: "COMPLETED",
            orderType: "MAIN",
        },
        orderBy: { createdAt: "desc" },
        take: 1,
    });

    if (orders.length === 0) {
        console.log("❌ Nenhum pedido COMPLETED encontrado para este email");

        // Show what orders exist
        const allOrders = await db.songOrder.findMany({
            where: { email: targetEmail },
            select: { id: true, status: true, orderType: true, recipientName: true },
        });
        console.log("📋 Pedidos existentes:", allOrders);
        process.exit(1);
    }

    const order = orders[0]!;
    console.log(`✅ Pedido encontrado: ${order.id}`);
    console.log(`   - Destinatário: ${order.recipientName}`);
    console.log(`   - Status: ${order.status}`);
    console.log(`   - Locale: ${order.locale}`);

    // Build the email
    const siteUrl = order.locale === "pt"
        ? "https://cancaodivina.com.br"
        : "https://apollosong.com";

    const trackOrderUrl = `${siteUrl}/${order.locale}/track-order?id=${order.id}`;

    const emailContent = buildStreamingVipUpsellEmail({
        orderId: order.id,
        recipientName: order.recipientName || "alguém especial",
        email: order.email,
        locale: order.locale || "pt",
        currency: order.currency,
        trackOrderUrl,
    });

    console.log(`\n📧 Enviando email...`);
    console.log(`   Subject: ${emailContent.subject}`);

    // Send email
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: order.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        replyTo: process.env.SMTP_REPLY_TO || undefined,
    });

    console.log(`\n✅ Email enviado com sucesso!`);
    console.log(`   Message ID: ${info.messageId}`);

    // Log to database (like the worker does)
    await db.sentEmail.create({
        data: {
            recipient: order.email,
            subject: emailContent.subject,
            template: "streaming-vip-upsell",
            orderId: order.id,
            metadata: { recipientName: order.recipientName, manual: true },
            status: "SENT",
        },
    });

    console.log(`   Logged to sentEmail table`);
}

main()
    .catch(console.error)
    .finally(() => db.$disconnect());
