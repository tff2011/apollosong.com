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

const testEmail = process.argv[2] || "statusct7@gmail.com";
const locale = process.argv[3] || "pt";
const recipientName = "Maria";

const isPt = locale === "pt";
const isEs = locale === "es";
const isFr = locale === "fr";
const isIt = locale === "it";

// Texts by locale
const logoText = isPt ? "Apollo Song" : "Apollo Song";

// Sender Name Logic - localized for each language
const senderName = isPt
    ? "Apollo Song (Apollo Song)"
    : isEs
        ? "Apollo Song (Canción Divina)"
        : isFr
            ? "Apollo Song (Chanson Divine)"
            : isIt
                ? "Apollo Song (Canzone Divina)"
                : "Apollo Song"; // EN only

const subject = isEs
    ? `¡Tu canción para ${recipientName} está lista! 🎵`
    : isPt
        ? `Sua música para ${recipientName} está pronta! 🎵`
        : isFr
            ? `Votre chanson pour ${recipientName} est prête ! 🎵`
            : isIt
                ? `La tua canzone per ${recipientName} è pronta! 🎵`
                : `Your song for ${recipientName} is ready! 🎵`;

const title = isEs ? "¡Tu Canción Está Lista!" : isPt ? "Sua Música Está Pronta!" : isFr ? "Votre Chanson Est Prête !" : isIt ? "La Tua Canzone È Pronta!" : "Your Song Is Ready!";
const greeting = isEs ? "¡Hola!" : isPt ? "Olá!" : isFr ? "Bonjour !" : isIt ? "Ciao!" : "Hello!";

const intro = isEs
    ? `¡Tenemos noticias increíbles! La canción dedicada a <strong>${recipientName}</strong> está lista y esperándote.`
    : isPt
        ? `Temos uma notícia incrível! A canção dedicada a <strong>${recipientName}</strong> ficou pronta e está esperando por você.`
        : isFr
            ? `Nous avons une nouvelle incroyable ! La chanson dédiée à <strong>${recipientName}</strong> est prête et vous attend.`
            : isIt
                ? `Abbiamo una notizia incredibile! La canzone dedicata a <strong>${recipientName}</strong> è pronta e ti aspetta.`
                : `We have amazing news! The song dedicated to <strong>${recipientName}</strong> is ready and waiting for you.`;

const emotionalMessage = isEs
    ? "Este es un momento especial. Una melodía única fue creada con mucho cariño para tocar el corazón de quien amas."
    : isPt
        ? "Este é um momento especial. Uma melodia única foi criada com todo carinho para tocar o coração de quem você ama."
        : isFr
            ? "C'est un moment spécial. Une mélodie unique a été créée avec beaucoup d'amour pour toucher le cœur de celui que vous aimez."
            : isIt
                ? "Questo è un momento speciale. Una melodia unica è stata creata con tanto amore per toccare il cuore di chi ami."
                : "This is a special moment. A unique melody was crafted with great care to touch the heart of someone you love.";

const twoOptionsMessage = isEs
    ? "¡Creamos <strong>dos versiones</strong> de tu canción para que elijas la que más te emocione!"
    : isPt
        ? "Criamos <strong>duas versões</strong> da sua música para você escolher a que mais te emociona!"
        : isFr
            ? "Nous avons créé <strong>deux versions</strong> de votre chanson pour que vous puissiez choisir celle qui vous émeut le plus !"
            : isIt
                ? "Abbiamo creato <strong>due versioni</strong> della tua canzone così puoi scegliere quella che ti emoziona di più!"
                : "We created <strong>two versions</strong> of your song so you can choose the one that moves you most!";

const listenButtonText = isEs
    ? "Escuchar Mis Canciones"
    : isPt
        ? "Ouvir Minhas Músicas"
        : isFr
            ? "Écouter Mes Chansons"
            : isIt
                ? "Ascolta le Mie Canzoni"
                : "Listen to My Songs";

const instagramFollowText = isEs
    ? "Síguenos en Instagram para ver más historias de amor"
    : isPt
        ? "Siga-nos no Instagram para ver mais histórias de amor"
        : isFr
            ? "Suivez-nous sur Instagram pour voir plus d'histoires d'amour"
            : isIt
                ? "Seguici su Instagram per vedere altre storie d'amore"
                : "Follow us on Instagram to see more love stories";

const instagramHandle = isPt ? "@cancaodivinabr" : "@apollosong";
const instagramUrl = isPt ? "https://www.instagram.com/cancaodivinabr" : "https://www.instagram.com/apollosong";

const sharingTitle = isEs ? "Consejos para Compartir" : isPt ? "Dicas para Compartilhar" : isFr ? "Conseils de Partage" : isIt ? "Suggerimenti per Condividere" : "Sharing Tips";
const sharingTips = isEs
    ? [
        "Reproduce la canción en un momento especial, como una sorpresa durante una cena o celebración",
        "Comparte el enlace con familiares y amigos para que todos puedan escucharla",
        "Guarda el archivo MP3 para siempre tener este recuerdo musical contigo",
    ]
    : isPt
        ? [
            "Toque a música em um momento especial, como uma surpresa durante um jantar ou celebração",
            "Compartilhe o link com familiares e amigos para que todos possam ouvir",
            "Guarde o arquivo MP3 para sempre ter essa memória musical com você",
        ]
        : isFr
            ? [
                "Jouez la chanson lors d'un moment spécial, comme une surprise lors d'un dîner ou d'une célébration",
                "Partagez le lien avec votre famille et vos amis pour que tout le monde puisse l'écouter",
                "Conservez le fichier MP3 pour toujours avoir ce souvenir musical avec vous",
            ]
            : isIt
                ? [
                    "Riproduci la canzone in un momento speciale, come una sorpresa durante una cena o una celebrazione",
                    "Condividi il link con familiari e amici così tutti possono ascoltarla",
                    "Conserva il file MP3 per avere sempre questo ricordo musicale con te",
                ]
                : [
                    "Play the song at a special moment, like a surprise during dinner or a celebration",
                    "Share the link with family and friends so everyone can listen",
                    "Save the MP3 file to always have this musical memory with you",
                ];

const footerText = isEs
    ? "Hecho con fe y amor por Canción Divina."
    : isPt
        ? "Feito com fé e amor por Apollo Song."
        : isFr
            ? "Fait avec foi et amour par Chanson Divine."
            : isIt
                ? "Fatto con fede e amore da Canzone Divina."
                : "Made with faith and love by Apollo Song.";

const websiteUrl = isPt ? "www.cancaodivina.com.br" : isEs ? "www.apollosong.com/es" : isFr ? "www.apollosong.com/fr" : isIt ? "www.apollosong.com/it" : "www.apollosong.com";

const supportLabel = isEs ? "¿Necesitas ayuda?" : isPt ? "Precisa de ajuda?" : isFr ? "Besoin d'aide ?" : isIt ? "Hai bisogno di aiuto?" : "Need help?";
const supportAction = isEs ? "Contáctanos por WhatsApp" : isPt ? "Fale conosco no WhatsApp" : isFr ? "Contactez-nous sur WhatsApp" : isIt ? "Contattaci su WhatsApp" : "Chat with us on WhatsApp";

const trackOrderUrl = `https://apollosong.com/${locale}/track-order?orderId=test-order-123&email=${encodeURIComponent(testEmail)}`;

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
                           <!-- Text Logo to match Home -->
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

                            <p style="font-size: 16px; line-height: 1.7; color: #5C5647; margin-bottom: 20px; text-align: center; background-color: #FAF8F5; padding: 16px; border-radius: 12px;">
                                ${twoOptionsMessage}
                            </p>

                            <p style="font-size: 16px; line-height: 1.7; color: #7A7265; margin-bottom: 30px; font-style: italic; padding: 20px; background-color: #FAF8F5; border-radius: 12px; border-left: 4px solid #C4A574;">
                                "${emotionalMessage}"
                            </p>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin-bottom: 40px;">
                                <a href="${trackOrderUrl}" style="background-color: #C4A574; color: #FFFFFF; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block;">
                                    ${listenButtonText}
                                </a>
                            </div>

                            <!-- Instagram Follow -->
                            <div style="text-align: center; margin-bottom: 30px; padding: 20px; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); border-radius: 12px;">
                                <a href="${instagramUrl}" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 500;">
                                    📸 ${instagramFollowText}<br>
                                    <span style="font-weight: 700; font-size: 16px;">${instagramHandle}</span>
                                </a>
                            </div>

                            <!-- Sharing Tips -->
                            <div style="background-color: #FAF8F5; border-radius: 12px; padding: 25px; margin-bottom: 20px;">
                                <h3 style="color: #3D3929; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 15px; border-bottom: 1px solid #E8E4DC; padding-bottom: 10px;">${sharingTitle}</h3>
                                <ul style="margin: 0; padding: 0 0 0 20px; color: #7A7265; font-size: 14px; line-height: 1.8;">
                                    ${sharingTips.map(tip => `<li>${tip}</li>`).join("")}
                                </ul>
                            </div>

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

const text = `
${senderName}
${title}
----------------------------

${greeting}

${intro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

"${emotionalMessage}"

----------------------------
${listenButtonText}: ${trackOrderUrl}
----------------------------

📸 ${instagramFollowText}
${instagramHandle}: ${instagramUrl}
----------------------------

${sharingTitle}:
${sharingTips.map(tip => `• ${tip}`).join("\n")}

----------------------------

${supportLabel}: ${supportAction} -> https://wa.me/5561995790193

${footerText}
${websiteUrl}
`;

console.log("Enviando email de teste para:", testEmail);
console.log("Locale:", locale);
console.log("Subject:", subject);
console.log("");
console.log("✅ SEM links de download direto");
console.log("✅ COM botão para track-order");
console.log("✅ COM seção do Instagram");
console.log("");

try {
    const result = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"${senderName}" <contact@apollosong.com>`,
        to: testEmail,
        subject: subject,
        html: html,
        text: text,
        replyTo: process.env.SMTP_REPLY_TO || undefined,
    });

    console.log("✅ Email enviado com sucesso!");
    console.log("Message ID:", result.messageId);
} catch (error) {
    console.error("❌ Erro ao enviar email:", error);
}
