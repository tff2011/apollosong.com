import { getUnsubscribeUrl } from "../../lib/email-unsubscribe";

type AutoDeliveryEmailParams = {
    orderId: string;
    recipientName: string;
    customerEmail: string;
    locale: string;
    trackOrderUrl: string;
    songFileUrl?: string | null;
    songFileUrl2?: string | null;
};

export function buildAutoDeliveryEmail(data: AutoDeliveryEmailParams) {
    const isPt = data.locale === "pt";
    const hasTwoOptions = data.songFileUrl && data.songFileUrl2;
    // Dual branding: Local brand + "by Apollo Song" (except English)
    const logoText = isPt ? "Apollo Song" : "Apollo Song";
    const subBrandText = isPt ? "por Apollo Song" : ""; // Empty for English
    const senderName = isPt ? "Apollo Song" : "Apollo Song";

    const subject = isPt
        ? `Sua música para ${data.recipientName} está pronta! 🎵`
        : `Your song for ${data.recipientName} is ready! 🎵`;

    const title = isPt ? "Sua Música Está Pronta!" : "Your Song Is Ready!";
    const greeting = isPt ? "Olá!" : "Hello!";

    const intro = isPt
        ? `Temos uma notícia incrível! A canção dedicada a <strong>${data.recipientName}</strong> ficou pronta e está esperando por você.`
        : `We have amazing news! The song dedicated to <strong>${data.recipientName}</strong> is ready and waiting for you.`;

    const emotionalMessage = isPt
        ? "Este é um momento especial. Uma melodia única foi criada com todo carinho para tocar o coração de quem você ama."
        : "This is a special moment. A unique melody was crafted with great care to touch the heart of someone you love.";

    const twoOptionsMessage = isPt
        ? "Criamos <strong>duas versões</strong> da sua música para você escolher a que mais te emociona!"
        : "We created <strong>two versions</strong> of your song so you can choose the one that moves you most!";

    const listenButtonText = isPt ? "Ouvir Minhas Músicas" : "Listen to My Songs";

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

    const footerText = isPt
        ? "Feito com paixão e amor por Apollo Song."
        : "Made with passion and love by Apollo Song.";

    const websiteUrl = isPt ? "www.apollosong.com/pt" : "www.apollosong.com";
    const supportLabel = isPt ? "Precisa de ajuda?" : "Need help?";
    const supportAction = isPt ? "Fale conosco no WhatsApp" : "Chat with us on WhatsApp";

    const clickHereText = isPt ? "Clique no botão abaixo para ouvir 👇" : "Click the button below to listen 👇";
    const preheaderText = isPt
        ? `A música para ${data.recipientName} está pronta! Clique para ouvir agora.`
        : `The song for ${data.recipientName} is ready! Click to listen now.`;
    const unsubscribeText = isPt ? "Não deseja mais receber emails?" : "Don't want to receive emails?";
    const unsubscribeAction = isPt ? "Clique aqui" : "Click here";
    const unsubscribeUrl = getUnsubscribeUrl(data.customerEmail, data.locale);
    const addressText = isPt
        ? "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil"
        : "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil";

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0A0E1A; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #F0EDE6;">
    <!-- Preheader text (hidden but shows in email preview) -->
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #0A0E1A;">
        ${preheaderText}
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0A0E1A;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #0A0E1A; padding: 35px 0; border-bottom: 4px solid #C9A84C;">
                           <span style="font-family: Georgia, serif; font-size: 32px; font-weight: bold; color: #FFFFFF; letter-spacing: -0.5px;">
                               ${logoText}
                           </span>
                           ${subBrandText ? `<br><span style="font-family: Arial, sans-serif; font-size: 14px; color: #C9A84C; letter-spacing: 0.5px;">${subBrandText}</span>` : ""}
                        </td>
                    </tr>
                    <!-- Emoji -->
                    <tr>
                        <td align="center" style="padding: 35px 0 15px; background-color: #FFFFFF;">
                            <span style="font-size: 56px;">${hasTwoOptions ? "🎵🎵" : "🎵"}</span>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 35px; background-color: #FFFFFF;">
                            <h1 style="color: #0A0E1A; font-size: 26px; margin: 0 0 25px; text-align: center; font-weight: 700;">${title}</h1>
                            <p style="font-size: 16px; line-height: 1.7; color: #F0EDE6; margin-bottom: 18px;">${greeting}</p>
                            <p style="font-size: 16px; line-height: 1.7; color: #F0EDE6; margin-bottom: 20px;">${intro}</p>
                            ${hasTwoOptions ? `
                            <p style="font-size: 15px; line-height: 1.6; color: #0A0E1A; margin-bottom: 20px; text-align: center; background-color: #F5F0EB; padding: 15px 20px; border-radius: 8px; border: 1px solid #D9C4A8;">
                                ${twoOptionsMessage}
                            </p>
                            ` : ""}
                            <!-- CTA Section - Above emotional message -->
                            <div style="text-align: center; margin-bottom: 25px; padding: 25px; background-color: #0A0E1A; background: linear-gradient(135deg, #0A0E1A 0%, #1A2035 100%); border-radius: 12px;">
                                <p style="font-size: 17px; color: #FFFFFF; margin: 0 0 18px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                                    ${clickHereText}
                                </p>
                                <a href="${data.trackOrderUrl}" style="background-color: #22c55e; color: #FFFFFF; padding: 16px 45px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);">
                                    🎵 ${listenButtonText}
                                </a>
                            </div>
                            <!-- Emotional message - Below CTA -->
                            <p style="font-size: 15px; line-height: 1.7; color: #6B7280; margin-bottom: 30px; font-style: italic; padding: 18px; background-color: #F9FAFB; border-radius: 8px; border-left: 4px solid #C9A84C;">
                                "${emotionalMessage}"
                            </p>
                            <!-- Tips Section -->
                            <div style="background-color: #F9FAFB; border-radius: 8px; padding: 22px; margin-bottom: 20px; border: 1px solid #E5E7EB;">
                                <h3 style="color: #0A0E1A; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px; font-weight: 700;">${sharingTitle}</h3>
                                <ul style="margin: 0; padding: 0 0 0 18px; color: #4B5563; font-size: 14px; line-height: 1.9;">
                                    ${sharingTips.map(tip => `<li style="margin-bottom: 6px;">${tip}</li>`).join("")}
                                </ul>
                            </div>
                            <!-- Support -->
                            <p style="font-size: 14px; color: #6B7280; text-align: center; margin-top: 25px;">
                                ${supportLabel} <a href="https://wa.me/5561995790193" style="color: #0A0E1A; text-decoration: underline; font-weight: 500;">${supportAction}</a>
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F3F4F6; padding: 25px; text-align: center; border-top: 1px solid #E5E7EB;">
                            <p style="font-size: 13px; color: #6B7280; margin: 0 0 10px;">
                                ${footerText}
                            </p>
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0 0 8px;">
                                <a href="https://${websiteUrl}" style="color: #0A0E1A; text-decoration: none;">${websiteUrl}</a>
                            </p>
                            <p style="font-size: 11px; color: #9CA3AF; margin: 0 0 8px;">
                                ${addressText}
                            </p>
                            <p style="font-size: 11px; color: #9CA3AF; margin: 0;">
                                Order ID: <span style="font-family: monospace;">${data.orderId}</span>
                            </p>
                            <p style="font-size: 11px; color: #9CA3AF; margin: 15px 0 0;">
                                ${unsubscribeText} <a href="${unsubscribeUrl}" style="color: #6B7280; text-decoration: underline;">${unsubscribeAction}</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const text = `
${senderName}
${title}
----------------------------

${greeting}

${intro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

"${emotionalMessage}"

----------------------------
${listenButtonText}: ${data.trackOrderUrl}
----------------------------

${sharingTitle}:
${sharingTips.map(tip => `• ${tip}`).join("\n")}

----------------------------

${supportLabel}: ${supportAction} -> https://wa.me/5561995790193

${footerText}
${websiteUrl}
${addressText}
Order ID: ${data.orderId}

${unsubscribeText} -> ${unsubscribeUrl}
    `;

    return { subject, html, text };
}
