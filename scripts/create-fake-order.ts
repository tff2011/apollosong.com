import "dotenv/config";
import { db } from "../src/server/db";
import { sendSaleAlert } from "../src/lib/telegram";
import { randomUUID } from "crypto";

async function createFakeOrder() {
    console.log("Criando pedido fake com todos os order bumps...");

    const order = await db.songOrder.create({
        data: {
            // Quiz data
            recipient: "wife",
            recipientName: "Maria Santos",
            genre: "worship",
            vocals: "female",
            qualities: "Ela é uma mulher incrível, cheia de fé e amor. Sempre está orando pela família e nos encoraja em todos os momentos difíceis.",
            memories: "Lembro do dia em que nos conhecemos na igreja, foi amor à primeira vista. Nosso casamento foi abençoado por Deus.",
            message: "Te amo mais do que palavras podem expressar. Você é minha bênção!",
            email: "thiagofelizola@gmail.com",

            // Localization
            locale: "pt",
            currency: "BRL",
            priceAtOrder: 14800, // R$148,00

            // Status COMPLETED (to show order bumps)
            status: "COMPLETED",
            paymentId: "pi_fake_test_" + Date.now(),
            paymentCompletedAt: new Date(),
            quizCompletedAt: new Date(),
            songDeliveredAt: new Date(),

            // Simulated Stripe fees (BRL 148 -> ~$29 USD, fee ~$1.50)
            stripeFee: 150, // $1.50 USD
            stripeNetAmount: 2750, // $27.50 USD net

            // Device info
            deviceType: "mobile",
            browserName: "Chrome",
            osName: "Android",

            // Traffic
            utmSource: "instagram",
            utmMedium: "cpc",
            utmCampaign: "natal2024",

            // ALL Order bumps
            hasFastDelivery: true,
            hasCertificate: true,
            hasLyrics: true,
            certificateToken: randomUUID(),

            // Fake song and lyrics
            songFileUrl: "https://pub-17653d8e09ec2ab1f59e734054fc2834.r2.dev/songs/musica0-pt.mp3",
            lyrics: `[Verso 1]
Hoje é um dia especial pra você
Uma canção que vou dedicar
Com carinho e amor pra valer
Essa música vai te embalar

[Refrão]
Feliz aniversário, minha esposa
Que Deus te abençoe sempre
Com alegria e paz preciosa
Que sua vida seja brilhante

[Verso 2]
Lembro dos momentos que vivemos
Das risadas e da amizade
São memórias que guardamos
Com muito amor e saudade

[Bridge]
Tu és a luz da minha vida
A razão do meu viver
Com fé em Deus, nossa partida
Foi o melhor que pude ter`,
        },
    });

    console.log(`✅ Pedido criado: ${order.id}`);

    // Send Telegram alert
    console.log("Enviando alerta Telegram...");
    await sendSaleAlert({
        orderId: order.id,
        locale: order.locale,
        recipientName: order.recipientName,
        recipient: order.recipient,
        genre: order.genre,
        vocals: order.vocals,
        email: order.email,
        currency: order.currency,
        grossAmountCents: order.priceAtOrder,
        netAmountCents: order.stripeNetAmount!,
        stripeFee: order.stripeFee!,
        hasFastDelivery: order.hasFastDelivery ?? false,
        hasExtraSong: false,
        utmSource: order.utmSource,
        utmMedium: order.utmMedium,
        utmCampaign: order.utmCampaign,
        deviceType: order.deviceType,
    });

    // Send email
    console.log("Enviando email de confirmação...");
    const { buildPurchaseApprovedEmail } = await import("../src/server/email/purchase-approved");
    const { sendEmail } = await import("../src/server/email/mailer");

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const checkoutUrl = new URL(
        `/${order.locale}/track-order?orderId=${order.id}&email=${encodeURIComponent(order.email)}`,
        baseUrl
    ).toString();

    const emailContent = buildPurchaseApprovedEmail({
        orderId: order.id,
        recipientName: order.recipientName,
        customerEmail: order.email,
        locale: order.locale,
        price: order.priceAtOrder / 100,
        currency: order.currency,
        genre: order.genre,
        checkoutUrl,
        childOrders: [],
    });

    await sendEmail({
        to: order.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        template: "PURCHASE_APPROVED",
        orderId: order.id,
        from: emailContent.from,
    });

    console.log(`✅ Email enviado para ${order.email}`);
    console.log("\n🎉 Pedido fake criado com sucesso!");
    console.log(`   ID: ${order.id}`);
    console.log(`   Email: ${order.email}`);
    console.log(`   Recipient: ${order.recipientName}`);
    console.log(`   Net USD: $${(order.stripeNetAmount! / 100).toFixed(2)}`);
    console.log(`   Order Bumps:`);
    console.log(`     - Fast Delivery: ${order.hasFastDelivery}`);
    console.log(`     - Certificate: ${order.hasCertificate}`);
    console.log(`     - Lyrics: ${order.hasLyrics}`);
    console.log(`   Certificate Token: ${order.certificateToken}`);
    console.log(`\n   Track Order URL: http://localhost:3000/pt/track-order?email=${encodeURIComponent(order.email)}`);

    process.exit(0);
}

createFakeOrder().catch((err) => {
    console.error("Erro:", err);
    process.exit(1);
});
