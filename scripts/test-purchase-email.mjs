import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const db = new PrismaClient();

// Import the email builder (we'll inline it since it's TS)
async function main() {
    const email = "statusct7@gmail.com";

    const order = await db.songOrder.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
    });

    if (!order) {
        console.log("Pedido não encontrado para:", email);
        process.exit(1);
    }

    console.log("Pedido encontrado:", order.id);
    console.log("Recipient:", order.recipientName);
    console.log("Genre:", order.genre);
    console.log("Locale:", order.locale);

    // Build checkout URL
    const checkoutUrl = `https://apollosong.com/${order.locale || "pt"}/track-order?email=${encodeURIComponent(order.email)}`;

    // Create transporter
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    // Import and build email dynamically
    const { buildPurchaseApprovedEmail } = await import("../src/server/email/purchase-approved.ts");

    const emailData = buildPurchaseApprovedEmail({
        orderId: order.id,
        recipientName: order.recipientName || "Amado",
        customerEmail: order.email,
        locale: order.locale || "pt",
        checkoutUrl,
        price: order.priceAtOrder / 100,
        currency: order.currency || "BRL",
        childOrders: [],
        genre: order.genre || "pop",
        hasCertificate: order.certificate || false,
        hasLyrics: order.lyricsPdf || false,
        orderType: order.orderType || "MAIN",
    });

    console.log("\nEnviando email para:", order.email);
    console.log("Subject:", emailData.subject);

    // Build headers for anti-spam
    const mailHeaders = {};
    if (emailData.headers?.["List-Unsubscribe"]) mailHeaders["List-Unsubscribe"] = emailData.headers["List-Unsubscribe"];
    if (emailData.headers?.["List-Unsubscribe-Post"]) mailHeaders["List-Unsubscribe-Post"] = emailData.headers["List-Unsubscribe-Post"];
    if (emailData.headers?.["X-Priority"]) mailHeaders["X-Priority"] = emailData.headers["X-Priority"];
    if (emailData.headers?.["X-Mailer"]) mailHeaders["X-Mailer"] = emailData.headers["X-Mailer"];

    const result = await transporter.sendMail({
        from: emailData.from,
        to: order.email,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        replyTo: emailData.headers?.["Reply-To"],
        headers: Object.keys(mailHeaders).length > 0 ? mailHeaders : undefined,
    });

    console.log("\nEmail enviado com sucesso!");
    console.log("Message ID:", result.messageId);

    await db.$disconnect();
}

main().catch(console.error);
