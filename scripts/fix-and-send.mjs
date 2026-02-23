import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const db = new PrismaClient();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

// 1. Fix the email typo that was just inserted
async function fixTypoEmail() {
    const result = await db.songOrder.updateMany({
        where: { email: 'thiago@gmail.comsd' },
        data: { email: 'thiago@gmail.com' }
    });
    if (result.count > 0) {
        console.log(`✓ Corrigido: thiago@gmail.comsd → thiago@gmail.com (${result.count} registros)`);
    }
}

// 2. Send delivery emails
async function sendDeliveryEmails() {
    const orderIds = [
        'cmkikkfx7000sjl04vm49ym02',
        'cmkea41nr000fji04jr8jvjvy',
    ];

    for (const orderId of orderIds) {
        const order = await db.songOrder.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            console.log(`✗ Pedido ${orderId} não encontrado`);
            continue;
        }

        console.log(`\nEnviando para: ${order.email} (${order.recipientName})`);

        const trackUrl = `https://apollosong.com/${order.locale}/track-order?email=${encodeURIComponent(order.email)}`;

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #8B4513;">🎵 Sua música está pronta!</h1>
    <p>Olá!</p>
    <p>Sua música personalizada para <strong>${order.recipientName}</strong> está pronta!</p>
    <p>Clique no botão abaixo para ouvir e baixar:</p>
    <p style="text-align: center; margin: 30px 0;">
        <a href="${trackUrl}" style="background-color: #C45A3B; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Ouvir Minha Música
        </a>
    </p>
    <p>Ou acesse: <a href="${trackUrl}">${trackUrl}</a></p>
    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
    <p style="color: #666; font-size: 12px;">Este é um reenvio automático. Você já recebeu sua música anteriormente.</p>
</body>
</html>`;

        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: order.email,
                subject: `🎵 Sua música para ${order.recipientName} está pronta! (Reenvio)`,
                html,
                text: `Sua música para ${order.recipientName} está pronta! Acesse: ${trackUrl}`,
            });
            console.log(`  ✓ Email enviado!`);
        } catch (error) {
            console.log(`  ✗ Erro: ${error.message}`);
        }
    }
}

async function main() {
    await fixTypoEmail();
    await sendDeliveryEmails();
}

main().catch(console.error).finally(() => db.$disconnect());
