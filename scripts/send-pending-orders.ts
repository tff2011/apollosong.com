import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import nodemailer from "nodemailer";

const db = new PrismaClient();

const SMTP_HOST = process.env.SMTP_HOST!;
const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD!;
const SMTP_FROM = process.env.SMTP_FROM!;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 587,
    secure: SMTP_SECURE,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
    },
});

const BATCH_SIZE = 10;
const DELAY_MS = 30000; // 30 seconds

function buildDeliveryEmail(data: {
    orderId: string;
    recipientName: string;
    locale: string;
    trackOrderUrl: string;
    songFileUrl?: string | null;
    songFileUrl2?: string | null;
}) {
    const isPt = data.locale === "pt";
    const isEs = data.locale === "es";
    const isFr = data.locale === "fr";
    const isIt = data.locale === "it";

    const hasTwoOptions = data.songFileUrl && data.songFileUrl2;

    let logoText = "Apollo Song";
    let subject = `Your song for ${data.recipientName} is ready! 🎵`;
    let title = "Your Song Is Ready!";
    let greeting = "Hello!";
    let intro = `We have amazing news! The song dedicated to <strong>${data.recipientName}</strong> is ready and waiting for you.`;
    let emotionalMessage = "This is a special moment. A unique melody was crafted with great care to touch the heart of someone you love.";
    let twoOptionsMessage = "We created <strong>two versions</strong> of your song so you can choose the one that moves you most!";
    let listenButtonText = "Listen to My Songs";
    let downloadButtonText = "Download MP3";
    let option1Label = "Option 1";
    let option2Label = "Option 2";
    let sharingTitle = "Sharing Tips";
    let sharingTips = [
        "Play the song at a special moment, like a surprise during dinner or a celebration",
        "Share the link with family and friends so everyone can listen",
        "Save the MP3 file to always have this musical memory with you",
    ];
    let footerText = "Made with faith and love by Apollo Song.";
    let websiteUrl = "www.apollosong.com";
    let supportLabel = "Need help?";
    let supportAction = "Chat with us on WhatsApp";

    if (isPt) {
        logoText = "Apollo Song";
        subject = `Sua música para ${data.recipientName} está pronta! 🎵`;
        title = "Sua Música Está Pronta!";
        greeting = "Olá!";
        intro = `Temos uma notícia incrível! A canção dedicada a <strong>${data.recipientName}</strong> ficou pronta e está esperando por você.`;
        emotionalMessage = "Este é um momento especial. Uma melodia única foi criada com todo carinho para tocar o coração de quem você ama.";
        twoOptionsMessage = "Criamos <strong>duas versões</strong> da sua música para você escolher a que mais te emociona!";
        listenButtonText = "Ouvir Minhas Músicas";
        downloadButtonText = "Baixar MP3";
        option1Label = "Opção 1";
        option2Label = "Opção 2";
        sharingTitle = "Dicas para Compartilhar";
        sharingTips = [
            "Toque a música em um momento especial, como uma surpresa durante um jantar ou celebração",
            "Compartilhe o link com familiares e amigos para que todos possam ouvir",
            "Guarde o arquivo MP3 para sempre ter essa memória musical com você",
        ];
        footerText = "Feito com fé e amor por Apollo Song.";
        websiteUrl = "www.apollosong.com/pt";
        supportLabel = "Precisa de ajuda?";
        supportAction = "Fale conosco no WhatsApp";
    } else if (isEs) {
        logoText = "Canción Divina";
        subject = `¡Tu canción para ${data.recipientName} está lista! 🎵`;
        title = "¡Tu Canción Está Lista!";
        greeting = "¡Hola!";
        intro = `¡Tenemos una noticia increíble! La canción dedicada a <strong>${data.recipientName}</strong> está lista y esperándote.`;
        emotionalMessage = "Este es un momento especial. Una melodía única fue creada con todo cariño para tocar el corazón de quien amas.";
        twoOptionsMessage = "Creamos <strong>dos versiones</strong> de tu canción para que elijas la que más te emociona!";
        listenButtonText = "Escuchar Mis Canciones";
        downloadButtonText = "Descargar MP3";
        option1Label = "Opción 1";
        option2Label = "Opción 2";
        sharingTitle = "Tips para Compartir";
        sharingTips = [
            "Reproduce la canción en un momento especial, como una sorpresa durante una cena o celebración",
            "Comparte el enlace con familiares y amigos para que todos puedan escuchar",
            "Guarda el archivo MP3 para siempre tener este recuerdo musical contigo",
        ];
        footerText = "Hecho con fe y amor por Canción Divina.";
        websiteUrl = "www.apollosong.com/es";
        supportLabel = "¿Necesitas ayuda?";
        supportAction = "Escríbenos en WhatsApp";
    } else if (isFr) {
        logoText = "Chanson Divine";
        subject = `Votre chanson pour ${data.recipientName} est prête ! 🎵`;
        title = "Votre Chanson Est Prête !";
        greeting = "Bonjour !";
        intro = `Nous avons une nouvelle incroyable ! La chanson dédiée à <strong>${data.recipientName}</strong> est prête et vous attend.`;
        emotionalMessage = "C'est un moment spécial. Une mélodie unique a été créée avec tout notre amour pour toucher le cœur de celui que vous aimez.";
        twoOptionsMessage = "Nous avons créé <strong>deux versions</strong> de votre chanson pour que vous puissiez choisir celle qui vous émeut le plus !";
        listenButtonText = "Écouter Mes Chansons";
        downloadButtonText = "Télécharger MP3";
        option1Label = "Option 1";
        option2Label = "Option 2";
        sharingTitle = "Conseils de Partage";
        sharingTips = [
            "Jouez la chanson lors d'un moment spécial, comme une surprise pendant un dîner ou une célébration",
            "Partagez le lien avec la famille et les amis pour que tout le monde puisse écouter",
            "Gardez le fichier MP3 pour toujours avoir ce souvenir musical avec vous",
        ];
        footerText = "Fait avec foi et amour par Chanson Divine.";
        websiteUrl = "www.apollosong.com/fr";
        supportLabel = "Besoin d'aide ?";
        supportAction = "Contactez-nous sur WhatsApp";
    } else if (isIt) {
        logoText = "Canzone Divina";
        subject = `La tua canzone per ${data.recipientName} è pronta! 🎵`;
        title = "La Tua Canzone È Pronta!";
        greeting = "Ciao!";
        intro = `Abbiamo una notizia incredibile! La canzone dedicata a <strong>${data.recipientName}</strong> è pronta e ti aspetta.`;
        emotionalMessage = "Questo è un momento speciale. Una melodia unica è stata creata con tutto l'amore per toccare il cuore di chi ami.";
        twoOptionsMessage = "Abbiamo creato <strong>due versioni</strong> della tua canzone così puoi scegliere quella che ti emoziona di più!";
        listenButtonText = "Ascolta Le Mie Canzoni";
        downloadButtonText = "Scarica MP3";
        option1Label = "Opzione 1";
        option2Label = "Opzione 2";
        sharingTitle = "Consigli per la Condivisione";
        sharingTips = [
            "Riproduci la canzone in un momento speciale, come una sorpresa durante una cena o una celebrazione",
            "Condividi il link con familiari e amici così tutti possono ascoltare",
            "Salva il file MP3 per avere sempre questo ricordo musicale con te",
        ];
        footerText = "Fatto con fede e amore da Canzone Divina.";
        websiteUrl = "www.apollosong.com/it";
        supportLabel = "Hai bisogno di aiuto?";
        supportAction = "Contattaci su WhatsApp";
    }

    let downloadButtonsHtml = "";
    if (hasTwoOptions) {
        downloadButtonsHtml = `
            <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
                <a href="${data.songFileUrl}" style="color: #B4975A; padding: 10px 25px; text-decoration: none; font-size: 14px; display: inline-block; border: 1px solid #B4975A; border-radius: 50px; margin: 5px;">
                    ${downloadButtonText} - ${option1Label}
                </a>
                <a href="${data.songFileUrl2}" style="color: #B4975A; padding: 10px 25px; text-decoration: none; font-size: 14px; display: inline-block; border: 1px solid #B4975A; border-radius: 50px; margin: 5px;">
                    ${downloadButtonText} - ${option2Label}
                </a>
            </div>
        `;
    } else {
        const singleUrl = data.songFileUrl || data.songFileUrl2 || "";
        downloadButtonsHtml = `
            <a href="${singleUrl}" style="color: #B4975A; padding: 10px 30px; text-decoration: none; font-size: 14px; display: inline-block; border: 1px solid #B4975A; border-radius: 50px; margin-top: 10px;">
                ${downloadButtonText}
            </a>
        `;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0F172A; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #E2E8F0;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0F172A;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #172554; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #1E3A8A;">
                    <tr>
                        <td align="center" style="background-color: #1E3A8A; padding: 40px 0; border-bottom: 3px solid #B4975A;">
                           <span style="font-family: serif; font-size: 28px; font-weight: bold; color: #F5E6D3; letter-spacing: -0.5px;">
                               ${logoText}
                           </span>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 40px 0 20px;">
                            <span style="font-size: 64px;">${hasTwoOptions ? "🎵🎵" : "🎵"}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 50px 40px;">
                            <h1 style="color: #B4975A; font-size: 28px; margin: 0 0 20px; text-align: center; font-weight: 600; letter-spacing: 0.5px;">${title}</h1>
                            <p style="font-size: 16px; line-height: 1.6; color: #CBD5E1; margin-bottom: 20px;">${greeting}</p>
                            <p style="font-size: 16px; line-height: 1.6; color: #CBD5E1; margin-bottom: 20px;">${intro}</p>
                            ${hasTwoOptions ? `
                            <p style="font-size: 16px; line-height: 1.6; color: #CBD5E1; margin-bottom: 20px; text-align: center; background-color: #1E3A8A; padding: 15px; border-radius: 8px;">
                                ${twoOptionsMessage}
                            </p>
                            ` : ""}
                            <p style="font-size: 16px; line-height: 1.6; color: #94A3B8; margin-bottom: 30px; font-style: italic; padding: 15px; background-color: #0F172A; border-radius: 8px; border-left: 3px solid #B4975A;">
                                "${emotionalMessage}"
                            </p>
                            <div style="text-align: center; margin-bottom: 40px;">
                                <a href="${data.trackOrderUrl}" style="background-color: #B4975A; color: #0F172A; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 15px;">
                                    ${listenButtonText}
                                </a>
                                <br>
                                ${downloadButtonsHtml}
                            </div>
                            <div style="background-color: #0F172A; border-radius: 8px; padding: 25px; margin-bottom: 20px; border: 1px solid #334155;">
                                <h3 style="color: #B4975A; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 15px; border-bottom: 1px solid #334155; padding-bottom: 10px;">${sharingTitle}</h3>
                                <ul style="margin: 0; padding: 0 0 0 20px; color: #94A3B8; font-size: 14px; line-height: 1.8;">
                                    ${sharingTips.map(tip => `<li>${tip}</li>`).join("")}
                                </ul>
                            </div>
                            <p style="font-size: 14px; color: #64748B; text-align: center; margin-top: 30px;">
                                ${supportLabel} <a href="https://wa.me/5561995790193" style="color: #B4975A; text-decoration: none;">${supportAction}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0F172A; padding: 30px; text-align: center; border-top: 1px solid #1E3A8A;">
                            <p style="font-size: 12px; color: #64748B; margin: 0;">
                                ${footerText}<br>
                                <a href="https://${websiteUrl}" style="color: #B4975A; text-decoration: none;">${websiteUrl}</a><br>
                                <span style="font-size: 10px; color: #475569;">Order ID: <span style="font-family: monospace;">${data.orderId}</span></span>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { subject, html };
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    // Find all orders from Jan 3 and before that are ready but not delivered
    const cutoffDate = new Date("2026-01-03T23:59:59.999Z");

    const pendingOrders = await db.songOrder.findMany({
        where: {
            status: { in: ["PAID", "IN_PROGRESS"] },
            songFileUrl: { not: null },
            songDeliveredAt: null,
            paymentCompletedAt: {
                not: null,
                lte: cutoffDate,
            },
            orderType: "MAIN", // Only main orders, not extras
        },
        select: {
            id: true,
            email: true,
            recipientName: true,
            locale: true,
            songFileUrl: true,
            songFileUrl2: true,
            paymentCompletedAt: true,
        },
        orderBy: {
            paymentCompletedAt: "asc", // Oldest first
        },
    });

    console.log(`\n📧 Found ${pendingOrders.length} pending orders from Jan 3 and before\n`);

    if (pendingOrders.length === 0) {
        console.log("✅ No pending orders to send!");
        await db.$disconnect();
        return;
    }

    // Process in batches
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < pendingOrders.length; i += BATCH_SIZE) {
        const batch = pendingOrders.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(pendingOrders.length / BATCH_SIZE);

        console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} orders)...`);

        for (const order of batch) {
            try {
                const trackOrderUrl = new URL(
                    `/${order.locale}/track-order`,
                    SITE_URL
                ).toString();

                const email = buildDeliveryEmail({
                    orderId: order.id,
                    recipientName: order.recipientName,
                    locale: order.locale,
                    trackOrderUrl,
                    songFileUrl: order.songFileUrl,
                    songFileUrl2: order.songFileUrl2,
                });

                await transporter.sendMail({
                    from: SMTP_FROM,
                    to: order.email,
                    subject: email.subject,
                    html: email.html,
                });

                // Update order status
                const now = new Date();
                await db.songOrder.update({
                    where: { id: order.id },
                    data: {
                        status: "COMPLETED",
                        songDeliveredAt: now,
                    },
                });

                // Also mark child orders as COMPLETED
                await db.songOrder.updateMany({
                    where: {
                        parentOrderId: order.id,
                        status: { in: ["PAID", "IN_PROGRESS"] },
                    },
                    data: {
                        status: "COMPLETED",
                        songDeliveredAt: now,
                    },
                });

                // Log the sent email
                await db.sentEmail.create({
                    data: {
                        recipient: order.email,
                        subject: email.subject,
                        template: "SONG_DELIVERY_BATCH",
                        orderId: order.id,
                        metadata: { batchSend: true },
                        status: "SENT",
                    },
                });

                sent++;
                const paidAt = order.paymentCompletedAt?.toISOString().split("T")[0];
                console.log(`  ✅ ${order.id} -> ${order.email} (paid: ${paidAt})`);
            } catch (error) {
                failed++;
                console.error(`  ❌ ${order.id} -> ${order.email}: ${error}`);
            }
        }

        // Wait 30 seconds before next batch (unless it's the last batch)
        if (i + BATCH_SIZE < pendingOrders.length) {
            console.log(`\n⏳ Waiting 30 seconds before next batch...`);
            await sleep(DELAY_MS);
        }
    }

    console.log(`\n========================================`);
    console.log(`✅ Sent: ${sent}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`========================================\n`);

    await db.$disconnect();
}

main().catch(console.error);
