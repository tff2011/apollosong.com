import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

const testEmail = "thiagofelizola@gmail.com";

// Import and build the email
const { buildPurchaseApprovedEmail } = await import("../src/server/email/purchase-approved.ts");

const emailData = buildPurchaseApprovedEmail({
    orderId: "test-order-123",
    recipientName: "Maria",
    customerEmail: testEmail,
    locale: "pt",
    checkoutUrl: `https://apollosong.com/pt/track-order?orderId=test-order-123&email=${encodeURIComponent(testEmail)}`,
    price: 69.90,
    currency: "BRL",
    genre: "sertanejo",
    childOrders: [
        { orderType: "FAST_DELIVERY", priceAtOrder: 1990 },
        { orderType: "GENRE_VARIANT", priceAtOrder: 1990 },
    ],
    hasCertificate: true,
    hasLyrics: true,
});

console.log("Enviando email de teste para:", testEmail);
console.log("Subject:", emailData.subject);

try {
    const result = await transporter.sendMail({
        from: emailData.from,
        to: testEmail,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
    });

    console.log("✅ Email enviado com sucesso!");
    console.log("Message ID:", result.messageId);
} catch (error) {
    console.error("❌ Erro ao enviar email:", error);
}
