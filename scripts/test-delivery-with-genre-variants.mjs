import "dotenv/config";
import nodemailer from "nodemailer";

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

// Genre translations
const genreTranslations = {
    pop: { en: "Pop", pt: "Pop", es: "Pop" },
    rock: { en: "Rock", pt: "Rock", es: "Rock" },
    worship: { en: "Worship", pt: "Gospel", es: "Adoración" },
    country: { en: "Country", pt: "Sertanejo", es: "Country" },
    sertanejo: { en: "Sertanejo", pt: "Sertanejo", es: "Sertanejo" },
    jazz: { en: "Jazz", pt: "Jazz", es: "Jazz" },
    forro: { en: "Forró", pt: "Forró", es: "Forró" },
};

function getGenreDisplay(genre, locale) {
    const lang = locale === "pt" ? "pt" : locale === "es" ? "es" : "en";
    return genreTranslations[genre]?.[lang] || genre;
}

function buildTestEmail({ recipientName, locale, trackOrderUrl, songFileUrl, songFileUrl2, hasCertificate, certificateToken, hasLyrics, genreVariants = [] }) {
    const isPt = locale === "pt";
    const logoText = isPt ? "Apollo Song" : "Apollo Song";
    const senderName = isPt ? "Apollo Song" : "Apollo Song";

    const certificateUrl = hasCertificate && certificateToken
        ? `${baseUrl}/${locale}/certificate/${certificateToken}`
        : null;
    const lyricsUrl = hasLyrics ? `${baseUrl}/${locale}/lyrics/test-order-123` : null;

    const subject = isPt
        ? `Sua música para ${recipientName} está pronta! 🎵`
        : `Your song for ${recipientName} is ready! 🎵`;

    const title = isPt ? "Sua Música Está Pronta!" : "Your Song Is Ready!";
    const greeting = isPt ? "Olá!" : "Hello!";
    const intro = isPt
        ? `Temos uma notícia incrível! A canção dedicada a <strong>${recipientName}</strong> ficou pronta e está esperando por você.`
        : `We have amazing news! The song dedicated to <strong>${recipientName}</strong> is ready and waiting for you.`;
    const emotionalMessage = isPt
        ? "Este é um momento especial. Uma melodia única foi criada com todo carinho para tocar o coração de quem você ama."
        : "This is a special moment. A unique melody was crafted with great care to touch the heart of someone you love.";

    const twoOptionsMessage = isPt
        ? "Criamos <strong>duas versões</strong> da sua música para você escolher a que mais te emociona!"
        : "We created <strong>two versions</strong> of your song so you can choose the one that moves you most!";

    const listenButtonText = isPt ? "Ouvir Minhas Músicas" : "Listen to My Songs";
    const downloadButtonText = isPt ? "Baixar MP3" : "Download MP3";
    const option1Label = isPt ? "Opção 1" : "Option 1";
    const option2Label = isPt ? "Opção 2" : "Option 2";

    const certificateTitle = isPt ? "Certificado de Autoria" : "Certificate of Authorship";
    const certificateDescription = isPt
        ? `Seu certificado exclusivo para ${recipientName} está pronto! Compartilhe o link ou escaneie o QR Code para uma experiência especial.`
        : `Your exclusive certificate for ${recipientName} is ready! Share the link or scan the QR Code for a special experience.`;
    const certificateButtonText = isPt ? "Ver Certificado" : "View Certificate";

    const lyricsTitle = isPt ? "Letra da Música" : "Song Lyrics";
    const lyricsDescription = isPt
        ? `A letra exclusiva da música para ${recipientName} está pronta! Visualize online ou baixe em PDF.`
        : `The exclusive lyrics for ${recipientName}'s song are ready! View online or download as PDF.`;
    const lyricsButtonText = isPt ? "Ver Letra" : "View Lyrics";

    // Genre variant lyrics section
    const genreVariantLyricsTitle = (genre) =>
        isPt ? `Letra - Estilo Extra (${genre})` : `Lyrics - Extra Style (${genre})`;
    const genreVariantLyricsDescription = (genre) => isPt
        ? `A letra adaptada no estilo ${genre} está pronta! Visualize online ou baixe em PDF.`
        : `The lyrics adapted to ${genre} style are ready! View online or download as PDF.`;

    const sharingTitle = isPt ? "Dicas para Compartilhar" : "Sharing Tips";
    const sharingTips = isPt
        ? [
            "Toque a música em um momento especial, como uma surpresa durante um jantar ou celebração",
            "Compartilhe o link com familiares e amigos para que todos possam ouvir",
            "Guarde o arquivo MP3 para sempre ter essa memória musical com você",
        ]
        : [
            "Play the song at a special moment, like a surprise during dinner or a celebration",
            "Share the link with family and friends so everyone can listen",
            "Save the MP3 file to always have this musical memory with you",
        ];

    const supportLabel = isPt ? "Precisa de ajuda?" : "Need help?";
    const supportAction = isPt ? "Fale conosco no WhatsApp" : "Chat with us on WhatsApp";
    const footerText = isPt ? "Feito com fé e amor por Apollo Song." : "Made with faith and love by Apollo Song.";
    const websiteUrl = isPt ? "www.apollosong.com/pt" : "www.apollosong.com";

    // Build genre variant sections HTML
    const genreVariantSectionsHtml = genreVariants.map(gv => {
        const genreDisplay = getGenreDisplay(gv.genre, locale);
        return `
                            <!-- Genre Variant Lyrics Section - ${genreDisplay} -->
                            <div style="background-color: #FAF8F5; border-radius: 12px; padding: 25px; margin-bottom: 20px; border: 2px solid #7ED9B4; text-align: center;">
                                <span style="font-size: 48px;">📜</span>
                                <h3 style="color: #3D3929; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${genreVariantLyricsTitle(genreDisplay)}</h3>
                                <p style="color: #5C5647; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
                                    ${genreVariantLyricsDescription(genreDisplay)}
                                </p>
                                <a href="${gv.trackOrderUrl}" style="background-color: #7ED9B4; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${lyricsButtonText}
                                </a>
                            </div>
        `;
    }).join("");

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #3D3929;">

    <!-- Container -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FAF8F5;">
        <tr>
            <td align="center" style="padding: 40px 20px;">

                <!-- Card -->
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #FFFFFF; padding: 40px 0 30px; border-bottom: 1px solid #E8E4DC;">
                           <span style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #3D3929; letter-spacing: -0.5px;">
                               ${logoText}
                           </span>
                        </td>
                    </tr>

                    <!-- Celebration Icon -->
                    <tr>
                        <td align="center" style="padding: 40px 0 20px; background-color: #FFFFFF;">
                            <span style="font-size: 56px;">🎵</span>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <h1 style="color: #3D3929; font-size: 28px; margin: 0 0 20px; text-align: center; font-weight: 500; font-family: Georgia, serif;">${title}</h1>

                            <p style="font-size: 16px; line-height: 1.7; color: #5C5647; margin-bottom: 20px;">
                                ${greeting}
                            </p>

                            <p style="font-size: 16px; line-height: 1.7; color: #5C5647; margin-bottom: 20px;">
                                ${intro}
                            </p>

                            ${songFileUrl && songFileUrl2 ? `
                            <p style="font-size: 16px; line-height: 1.7; color: #5C5647; margin-bottom: 20px; text-align: center; background-color: #FAF8F5; padding: 16px; border-radius: 12px;">
                                ${twoOptionsMessage}
                            </p>
                            ` : ""}

                            <p style="font-size: 16px; line-height: 1.7; color: #7A7265; margin-bottom: 30px; font-style: italic; padding: 20px; background-color: #FAF8F5; border-radius: 12px; border-left: 4px solid #C4A574;">
                                "${emotionalMessage}"
                            </p>

                            <!-- CTA Buttons -->
                            <div style="text-align: center; margin-bottom: 40px;">
                                <a href="${trackOrderUrl}" style="background-color: #C4A574; color: #FFFFFF; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block; margin-bottom: 15px;">
                                    ${listenButtonText}
                                </a>
                                <br>
                                <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
                                    <a href="${songFileUrl}" style="color: #C4A574; padding: 10px 25px; text-decoration: none; font-size: 14px; display: inline-block; border: 2px solid #C4A574; border-radius: 50px; margin: 5px; font-weight: 500;">
                                        ${downloadButtonText} - ${option1Label}
                                    </a>
                                    <a href="${songFileUrl2}" style="color: #C4A574; padding: 10px 25px; text-decoration: none; font-size: 14px; display: inline-block; border: 2px solid #C4A574; border-radius: 50px; margin: 5px; font-weight: 500;">
                                        ${downloadButtonText} - ${option2Label}
                                    </a>
                                </div>
                            </div>

                            <!-- Sharing Tips -->
                            <div style="background-color: #FAF8F5; border-radius: 12px; padding: 25px; margin-bottom: 20px;">
                                <h3 style="color: #3D3929; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 15px; border-bottom: 1px solid #E8E4DC; padding-bottom: 10px;">${sharingTitle}</h3>
                                <ul style="margin: 0; padding: 0 0 0 20px; color: #7A7265; font-size: 14px; line-height: 1.8;">
                                    ${sharingTips.map(tip => `<li>${tip}</li>`).join("")}
                                </ul>
                            </div>

                            ${certificateUrl ? `
                            <!-- Certificate Section -->
                            <div style="background-color: #FAF8F5; border-radius: 12px; padding: 25px; margin-bottom: 20px; border: 2px solid #C4A574; text-align: center;">
                                <span style="font-size: 48px;">🎖️</span>
                                <h3 style="color: #3D3929; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${certificateTitle}</h3>
                                <p style="color: #5C5647; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
                                    ${certificateDescription}
                                </p>
                                <a href="${certificateUrl}" style="background-color: #C4A574; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${certificateButtonText}
                                </a>
                            </div>
                            ` : ""}

                            ${lyricsUrl ? `
                            <!-- Lyrics Section -->
                            <div style="background-color: #FAF8F5; border-radius: 12px; padding: 25px; margin-bottom: 20px; border: 2px solid #9B7ED9; text-align: center;">
                                <span style="font-size: 48px;">📜</span>
                                <h3 style="color: #3D3929; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${lyricsTitle}</h3>
                                <p style="color: #5C5647; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
                                    ${lyricsDescription}
                                </p>
                                <a href="${lyricsUrl}" style="background-color: #9B7ED9; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${lyricsButtonText}
                                </a>
                            </div>
                            ` : ""}

                            ${genreVariantSectionsHtml}

                            <!-- Support -->
                            <p style="font-size: 14px; color: #9A9488; text-align: center; margin-top: 30px;">
                                ${supportLabel} <a href="https://wa.me/5561995790193${isPt ? "?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20meu%20pedido." : ""}" style="color: #C4A574; text-decoration: none; font-weight: 500;">${supportAction}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #FAF8F5; padding: 30px; text-align: center; border-top: 1px solid #E8E4DC;">
                            <p style="font-size: 12px; color: #9A9488; margin: 0;">
                                ${footerText}<br>
                                <a href="https://${websiteUrl}" style="color: #C4A574; text-decoration: none;">${websiteUrl}</a><br>
                                <span style="font-size: 10px; color: #B5AFA6;">Order ID: <span style="font-family: monospace;">test-order-123</span></span>
                            </p>
                        </td>
                    </tr>
                </table>

                <!-- Spacer -->
                <div style="height: 40px;"></div>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    return { subject, html, from: `"${senderName}" <${process.env.SMTP_FROM}>` };
}

async function main() {
    console.log("📧 Enviando email de teste com todos os order bumps...\n");

    const trackOrderUrl = `${baseUrl}/pt/track-order?orderId=test-order-123&email=${encodeURIComponent(testEmail)}`;

    const emailData = buildTestEmail({
        recipientName: "Maria",
        locale: "pt",
        trackOrderUrl,
        songFileUrl: "https://pub-4a4ed5261e644d10a1c47a920c769d54.r2.dev/songs/musica0-pt.mp3",
        songFileUrl2: "https://pub-4a4ed5261e644d10a1c47a920c769d54.r2.dev/songs/musica1-pt.mp3",
        hasCertificate: true,
        certificateToken: "test-certificate-token",
        hasLyrics: true,
        genreVariants: [
            {
                orderId: "genre-variant-1",
                genre: "sertanejo",
                trackOrderUrl: `${baseUrl}/pt/track-order?orderId=genre-variant-1&email=${encodeURIComponent(testEmail)}`,
            },
            {
                orderId: "genre-variant-2",
                genre: "rock",
                trackOrderUrl: `${baseUrl}/pt/track-order?orderId=genre-variant-2&email=${encodeURIComponent(testEmail)}`,
            },
        ],
    });

    console.log(`📬 To: ${testEmail}`);
    console.log(`📋 Subject: [TESTE] ${emailData.subject}`);
    console.log(`\n📦 Order Bumps incluídos:`);
    console.log(`   ✅ Certificado de Autoria`);
    console.log(`   ✅ Letra da Música (pedido principal)`);
    console.log(`   ✅ Letra - Estilo Extra (Sertanejo)`);
    console.log(`   ✅ Letra - Estilo Extra (Rock)`);

    await transporter.sendMail({
        from: emailData.from,
        to: testEmail,
        subject: `[TESTE] ${emailData.subject}`,
        html: emailData.html,
    });

    console.log("\n✅ Email enviado com sucesso!");
    console.log(`\n📱 Verifique seu email: ${testEmail}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Erro:", error);
        process.exit(1);
    });
