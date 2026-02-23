import { PrismaClient } from "../generated/prisma/index.js";
import { nanoid } from "nanoid";
import nodemailer from "nodemailer";

const db = new PrismaClient();

const testEmail = "thiagofelizola@gmail.com";
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

function buildSongDeliveryEmail({ recipientName, locale, trackOrderUrl, songFileUrl, songFileUrl2, hasCertificate, certificateToken }) {
    const isPt = locale === "pt";
    const logoText = isPt ? "Apollo Song" : "Apollo Song";
    const certificateUrl = hasCertificate && certificateToken
        ? `${baseUrl}/${locale}/certificate/${certificateToken}`
        : null;

    const subject = isPt
        ? `🎵 Sua música para ${recipientName} está pronta!`
        : `🎵 Your song for ${recipientName} is ready!`;

    const title = isPt ? "Sua Música Está Pronta!" : "Your Song Is Ready!";
    const intro = isPt
        ? `A música exclusiva para <strong>${recipientName}</strong> está pronta para ser ouvida!`
        : `The exclusive song for <strong>${recipientName}</strong> is ready to be heard!`;
    const option1Label = isPt ? "Opção 1" : "Option 1";
    const option2Label = isPt ? "Opção 2" : "Option 2";
    const listenText = isPt ? "Ouvir Música" : "Listen to Song";
    const certificateTitle = isPt ? "Certificado de Autoria" : "Certificate of Authorship";
    const certificateDesc = isPt
        ? `Seu certificado exclusivo para ${recipientName} está pronto! Compartilhe o link ou escaneie o QR Code para uma experiência especial.`
        : `Your exclusive certificate for ${recipientName} is ready! Share the link or scan the QR Code for a special experience.`;
    const certificateBtn = isPt ? "Ver Certificado" : "View Certificate";
    const trackText = isPt ? "Acompanhar Pedido" : "Track Order";
    const footerText = isPt ? "Feito com fé e amor por Apollo Song" : "Made with faith and love by Apollo Song";

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #3D3929;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FAF8F5;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #FFFFFF; padding: 40px 0 30px; border-bottom: 1px solid #E8E4DC;">
                            <span style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #3D3929;">${logoText}</span>
                        </td>
                    </tr>
                    <!-- Icon -->
                    <tr>
                        <td align="center" style="padding: 40px 0 20px; background-color: #FFFFFF;">
                            <span style="font-size: 56px;">🎵</span>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <h1 style="color: #3D3929; font-size: 28px; margin: 0 0 20px; text-align: center; font-weight: 500; font-family: Georgia, serif;">${title}</h1>
                            <p style="font-size: 16px; line-height: 1.7; color: #5C5647; margin-bottom: 30px; text-align: center;">${intro}</p>

                            <!-- Song Options -->
                            <div style="text-align: center; margin-bottom: 30px;">
                                <p style="color: #7A7265; font-size: 14px; margin-bottom: 10px;">${option1Label}</p>
                                <a href="${songFileUrl}" style="background-color: #C4A574; color: #FFFFFF; padding: 14px 35px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block;">
                                    🎧 ${listenText} 1
                                </a>
                            </div>

                            ${songFileUrl2 ? `
                            <div style="text-align: center; margin-bottom: 30px;">
                                <p style="color: #7A7265; font-size: 14px; margin-bottom: 10px;">${option2Label}</p>
                                <a href="${songFileUrl2}" style="background-color: #C4A574; color: #FFFFFF; padding: 14px 35px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block;">
                                    🎧 ${listenText} 2
                                </a>
                            </div>
                            ` : ""}

                            ${certificateUrl ? `
                            <!-- Certificate Section -->
                            <div style="background-color: #FAF8F5; border-radius: 12px; padding: 25px; margin: 30px 0; border: 2px solid #C4A574; text-align: center;">
                                <span style="font-size: 48px;">🎖️</span>
                                <h3 style="color: #3D3929; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${certificateTitle}</h3>
                                <p style="color: #5C5647; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">${certificateDesc}</p>
                                <a href="${certificateUrl}" style="background-color: #C4A574; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${certificateBtn}
                                </a>
                            </div>
                            ` : ""}

                            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #E8E4DC;">
                                <a href="${trackOrderUrl}" style="color: #C4A574; font-weight: 500; text-decoration: none;">📋 ${trackText}</a>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #FAF8F5; padding: 30px; text-align: center; border-top: 1px solid #E8E4DC;">
                            <p style="font-size: 12px; color: #9A9488; margin: 0;">${footerText}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

    return { subject, html };
}

async function main() {
    console.log("Creating test certificates...\n");

    // Create PT test order
    const ptOrder = await db.songOrder.create({
        data: {
            email: testEmail,
            recipientName: "Maria Silva",
            recipient: "mother",
            genre: "worship",
            vocals: "female",
            qualities: "Teste de certificado em português",
            memories: "Memórias de teste",
            message: "Mensagem de teste",
            locale: "pt",
            currency: "BRL",
            priceAtOrder: 9900,
            status: "COMPLETED",
            hasCertificate: true,
            hasLyrics: true,
            certificateToken: nanoid(12),
            lyrics: `[Verso 1]
Em cada amanhecer, Teu amor se renova
Como o sol que nasce, Tua graça transborda
Nos braços do Pai, encontro minha paz
E em cada momento, Teu amor me satisfaz

[Refrão]
Maria, escolhida por Deus
Mulher de fé, coração que não se rendeu
Nas tempestades, Ele te sustentou
E em cada passo, Seu amor te guiou

[Verso 2]
Nos dias difíceis, Sua mão te conduziu
Pela vale escuro, Sua luz resplandeceu
E quando o medo quis te derrubar
O Senhor disse: "Não temas, vou te guardar"`,
            songFileUrl: "https://pub-4a4ed5261e644d10a1c47a920c769d54.r2.dev/songs/musica0-pt.mp3",
            songFileUrl2: "https://pub-4a4ed5261e644d10a1c47a920c769d54.r2.dev/songs/musica1-pt.mp3",
        },
    });

    console.log(`✅ PT Order created: ${ptOrder.id}`);
    console.log(`   Certificate URL: ${baseUrl}/pt/certificate/${ptOrder.certificateToken}`);

    // Create EN test order
    const enOrder = await db.songOrder.create({
        data: {
            email: testEmail,
            recipientName: "John Smith",
            recipient: "father",
            genre: "country",
            vocals: "male",
            qualities: "Certificate test in English",
            memories: "Test memories",
            message: "Test message",
            locale: "en",
            currency: "USD",
            priceAtOrder: 9900,
            status: "COMPLETED",
            hasCertificate: true,
            hasLyrics: true,
            certificateToken: nanoid(12),
            lyrics: `[Verse 1]
In every sunrise, Your love is made new
Like the morning light, Your grace shines through
In the Father's arms, I find my rest
And in every moment, I am truly blessed

[Chorus]
John, chosen by the Lord above
A man of faith, filled with endless love
Through every storm, He held you tight
And guided your path with His holy light

[Verse 2]
When the road was long and the way unclear
His gentle voice whispered, "I am here"
And when doubt tried to steal your peace
He reminded you that His love won't cease`,
            songFileUrl: "https://pub-4a4ed5261e644d10a1c47a920c769d54.r2.dev/songs/musica0-en.mp3",
            songFileUrl2: "https://pub-4a4ed5261e644d10a1c47a920c769d54.r2.dev/songs/musica1-en.mp3",
        },
    });

    console.log(`✅ EN Order created: ${enOrder.id}`);
    console.log(`   Certificate URL: ${baseUrl}/en/certificate/${enOrder.certificateToken}`);

    // Send PT email
    console.log("\n📧 Sending PT email...");
    const ptTrackOrderUrl = `${baseUrl}/pt/track-order?email=${encodeURIComponent(testEmail)}`;
    const ptEmailData = buildSongDeliveryEmail({
        recipientName: ptOrder.recipientName,
        locale: "pt",
        trackOrderUrl: ptTrackOrderUrl,
        songFileUrl: ptOrder.songFileUrl,
        songFileUrl2: ptOrder.songFileUrl2,
        hasCertificate: true,
        certificateToken: ptOrder.certificateToken,
    });

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: testEmail,
        subject: `[TESTE PT] ${ptEmailData.subject}`,
        html: ptEmailData.html,
    });
    console.log("   PT email sent!");

    // Send EN email
    console.log("\n📧 Sending EN email...");
    const enTrackOrderUrl = `${baseUrl}/track-order?email=${encodeURIComponent(testEmail)}`;
    const enEmailData = buildSongDeliveryEmail({
        recipientName: enOrder.recipientName,
        locale: "en",
        trackOrderUrl: enTrackOrderUrl,
        songFileUrl: enOrder.songFileUrl,
        songFileUrl2: enOrder.songFileUrl2,
        hasCertificate: true,
        certificateToken: enOrder.certificateToken,
    });

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: testEmail,
        subject: `[TEST EN] ${enEmailData.subject}`,
        html: enEmailData.html,
    });
    console.log("   EN email sent!");

    console.log("\n✅ Done! Check your email and the certificate URLs:");
    console.log(`\n📜 PT Certificate: ${baseUrl}/pt/certificate/${ptOrder.certificateToken}`);
    console.log(`📜 EN Certificate: ${baseUrl}/en/certificate/${enOrder.certificateToken}`);

    await db.$disconnect();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
