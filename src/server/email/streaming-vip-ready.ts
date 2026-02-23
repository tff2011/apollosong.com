import { env } from "../../env";
import { getUnsubscribeUrl } from "../../lib/email-unsubscribe";

type StreamingVipReadyEmailParams = {
    orderId: string;
    recipientName: string;
    locale: string;
    spotifyUrl: string;
    trackOrderUrl: string;
    songName?: string;
    coverUrl?: string;
    customerEmail: string;
};

export function buildStreamingVipReadyEmail({
    orderId,
    recipientName,
    locale,
    spotifyUrl,
    trackOrderUrl,
    songName,
    coverUrl,
    customerEmail,
}: StreamingVipReadyEmailParams) {
    type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";
    const loc: SupportedLocale =
        locale === "pt" ? "pt" : locale === "es" ? "es" : locale === "fr" ? "fr" : locale === "it" ? "it" : "en";

    const brandNames: Record<SupportedLocale, string> = {
        en: "Apollo Song",
        pt: "Apollo Song",
        es: "Apollo Song",
        fr: "ChansonDivine",
        it: "ApolloSong",
    };

    const logoText = brandNames[loc];
    const from = `"Apollo Song" <contact@apollosong.com>`;

    const subjects: Record<SupportedLocale, string> = {
        en: `Your song for ${recipientName} is on Spotify! 🎧`,
        pt: `Sua música para ${recipientName} já está no Spotify! 🎧`,
        es: `¡Tu canción para ${recipientName} ya está en Spotify! 🎧`,
        fr: `Votre chanson pour ${recipientName} est sur Spotify ! 🎧`,
        it: `La tua canzone per ${recipientName} è su Spotify! 🎧`,
    };

    const titles: Record<SupportedLocale, string> = {
        en: "Your VIP Distribution is Live",
        pt: "Sua Distribuição VIP Está no Ar",
        es: "Tu Distribución VIP Está en Línea",
        fr: "Votre Distribution VIP Est en Ligne",
        it: "La tua Distribuzione VIP È Online",
    };

    const greetings: Record<SupportedLocale, string> = {
        en: "Hello!",
        pt: "Olá!",
        es: "¡Hola!",
        fr: "Bonjour !",
        it: "Ciao!",
    };

    const intros: Record<SupportedLocale, string> = {
        en: `Great news! The song for <strong>${recipientName}</strong> is now available on Spotify and the main platforms.`,
        pt: `Temos uma ótima notícia! A música de <strong>${recipientName}</strong> já está disponível no Spotify e nas principais plataformas.`,
        es: `¡Tenemos buenas noticias! La canción de <strong>${recipientName}</strong> ya está disponible en Spotify y en las principales plataformas.`,
        fr: `Excellente nouvelle ! La chanson de <strong>${recipientName}</strong> est maintenant disponible sur Spotify et les principales plateformes.`,
        it: `Ottima notizia! La canzone di <strong>${recipientName}</strong> è ora disponibile su Spotify e sulle principali piattaforme.`,
    };

    const spotifyButtonText: Record<SupportedLocale, string> = {
        en: "Listen on Spotify",
        pt: "Ouvir no Spotify",
        es: "Escuchar en Spotify",
        fr: "Écouter sur Spotify",
        it: "Ascolta su Spotify",
    };

    const trackOrderButtonText: Record<SupportedLocale, string> = {
        en: "Track my orders",
        pt: "Acompanhar meus pedidos",
        es: "Ver mis pedidos",
        fr: "Suivre mes commandes",
        it: "Segui i miei ordini",
    };

    const newSongButtonText: Record<SupportedLocale, string> = {
        en: "Request new personalized song",
        pt: "Solicitar nova música personalizada",
        es: "Solicitar nueva canción personalizada",
        fr: "Demander une nouvelle chanson personnalisée",
        it: "Richiedi nuova canzone personalizzata",
    };

    const fallbackLabel: Record<SupportedLocale, string> = {
        en: "If the button doesn't open, use this link:",
        pt: "Se o botão não abrir, use este link:",
        es: "Si el botón no se abre, usa este enlace:",
        fr: "Si le bouton ne s'ouvre pas, utilisez ce lien :",
        it: "Se il pulsante non si apre, usa questo link:",
    };

    const supportLabel: Record<SupportedLocale, string> = {
        en: "Couldn't listen to your songs?",
        pt: "Não conseguiu ouvir suas músicas?",
        es: "¿No pudiste escuchar tus canciones?",
        fr: "Vous n'avez pas pu écouter vos chansons ?",
        it: "Non sei riuscito ad ascoltare le tue canzoni?",
    };

    const supportAction: Record<SupportedLocale, string> = {
        en: "Contact us via WhatsApp (do not reply to this email)",
        pt: "Fale conosco pelo WhatsApp (não responda este email)",
        es: "Contáctanos por WhatsApp (no respondas a este correo)",
        fr: "Contactez-nous via WhatsApp (ne répondez pas à cet email)",
        it: "Contattaci su WhatsApp (non rispondere a questa email)",
    };

    const automatedEmailNotices: Record<SupportedLocale, string> = {
        en: "This is an automated email. Do not reply.",
        pt: "Este é um email automático. Não responda.",
        es: "Este es un correo automático. No responda.",
        fr: "Ceci est un email automatique. Ne répondez pas.",
        it: "Questa è un'email automatica. Non rispondere.",
    };

    const whatsappSupportNotices: Record<SupportedLocale, string> = {
        en: "For support, contact us via WhatsApp:",
        pt: "Para suporte, fale conosco pelo WhatsApp:",
        es: "Para soporte, contáctenos por WhatsApp:",
        fr: "Pour toute assistance, contactez-nous via WhatsApp :",
        it: "Per assistenza, contattaci su WhatsApp:",
    };

    const footerTexts: Record<SupportedLocale, string> = {
        en: "Made with passion and love by Apollo Song.",
        pt: "Feito com paixão e amor por Apollo Song.",
        es: "Hecho con pasión y amor por Apollo Song.",
        fr: "Fait avec passion et amour par ChansonDivine.",
        it: "Fatto con passione e amore da ApolloSong.",
    };

    const websiteUrls: Record<SupportedLocale, string> = {
        en: "www.apollosong.com",
        pt: "www.apollosong.com/pt",
        es: "www.apollosong.com/es",
        fr: "www.apollosong.com/fr",
        it: "www.apollosong.com/it",
    };

    // Preheader
    const preheaders: Record<SupportedLocale, string> = {
        en: `The song for ${recipientName} is now live on Spotify!`,
        pt: `A música de ${recipientName} já está no Spotify!`,
        es: `¡La canción de ${recipientName} ya está en Spotify!`,
        fr: `La chanson de ${recipientName} est maintenant sur Spotify !`,
        it: `La canzone di ${recipientName} è ora su Spotify!`,
    };

    // Address and unsubscribe
    const addressTexts: Record<SupportedLocale, string> = {
        en: "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil",
        pt: "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil",
        es: "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil",
        fr: "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Brésil",
        it: "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile",
    };

    const unsubscribeTexts: Record<SupportedLocale, string> = {
        en: "Don't want to receive emails?",
        pt: "Não deseja mais receber emails?",
        es: "¿No desea recibir más correos?",
        fr: "Vous ne souhaitez plus recevoir d'emails ?",
        it: "Non vuoi più ricevere email?",
    };

    const unsubscribeActions: Record<SupportedLocale, string> = {
        en: "Click here",
        pt: "Clique aqui",
        es: "Haga clic aquí",
        fr: "Cliquez ici",
        it: "Clicca qui",
    };

    // Dual branding - "by Apollo Song" (empty for English)
    const subBrandByLocale: Record<SupportedLocale, string> = {
        pt: "por Apollo Song",
        en: "",
        es: "por Apollo Song",
        fr: "par Apollo Song",
        it: "da Apollo Song",
    };

    const subject = subjects[loc];
    const title = titles[loc];
    const greeting = greetings[loc];
    const intro = intros[loc];
    const spotifyButton = spotifyButtonText[loc];
    const trackOrderButton = trackOrderButtonText[loc];
    const newSongButton = newSongButtonText[loc];
    const baseUrl = "https://apollosong.com";
    const quizUrl = `${baseUrl}/${locale}`;
    const fallbackText = fallbackLabel[loc];
    const supportText = supportLabel[loc];
    const supportCta = supportAction[loc];
    const footerText = footerTexts[loc];
    const websiteUrl = websiteUrls[loc];
    const preheaderText = preheaders[loc];
    const addressText = addressTexts[loc];
    const unsubscribeText = unsubscribeTexts[loc];
    const unsubscribeAction = unsubscribeActions[loc];
    const subBrandText = subBrandByLocale[loc];
    const automatedEmailNotice = automatedEmailNotices[loc];
    const whatsappSupportNotice = whatsappSupportNotices[loc];
    const unsubscribeUrl = getUnsubscribeUrl(customerEmail, loc);

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
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
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden;">
                    <tr>
                        <td align="center" style="background-color: #FFFFFF; padding: 40px 0 30px; border-bottom: 1px solid #E8DDD3;">
                           <span style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #F0EDE6; letter-spacing: -0.5px;">
                               ${logoText}
                           </span>
                           ${subBrandText ? `<br><span style="font-family: Arial, sans-serif; font-size: 12px; color: #78716C;">${subBrandText}</span>` : ""}
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 36px 0 20px; background-color: #FFFFFF;">
                            ${coverUrl ? `
                            <img src="${coverUrl}" alt="${songName || "Capa da música"}" style="width: 200px; height: 200px; border-radius: 12px; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
                            ` : `<span style="font-size: 56px;">🎵</span>`}
                            ${songName ? `<p style="font-size: 20px; font-weight: 600; color: #F0EDE6; margin: 16px 0 0; font-family: Georgia, serif;">"${songName}"</p>` : ""}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <h1 style="color: #F0EDE6; font-size: 28px; margin: 0 0 18px; text-align: center; font-weight: 500; font-family: Georgia, serif;">${title}</h1>
                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 20px;">${greeting}</p>
                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 24px;">
                                ${intro}
                            </p>
                            <div style="text-align: center; margin-bottom: 16px;">
                                <a href="${spotifyUrl}" style="background-color: #1DB954; color: #FFFFFF !important; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block;">
                                    ${spotifyButton}
                                </a>
                            </div>
                            <div style="text-align: center; margin-bottom: 16px;">
                                <a href="${trackOrderUrl}" style="background-color: #3B82F6; color: #FFFFFF !important; padding: 14px 34px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${trackOrderButton}
                                </a>
                            </div>
                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${quizUrl}" style="background-color: #C9A84C; color: #FFFFFF !important; padding: 14px 34px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${newSongButton}
                                </a>
                            </div>
                            <p style="font-size: 14px; line-height: 1.6; color: #78716C; margin-bottom: 16px;">
                                ${fallbackText}<br>
                                <a href="${spotifyUrl}" style="color: #1DB954; text-decoration: none; word-break: break-all;">${spotifyUrl}</a>
                            </p>
                            <p style="font-size: 14px; color: #9A9488; text-align: center; margin-top: 30px;">
                                ${supportText} <a href="https://wa.me/5561995790193${loc === "pt" ? "?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20meu%20pedido." : ""}" style="color: #C9A84C; text-decoration: none; font-weight: 500;">${supportCta}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0A0E1A; padding: 30px; text-align: center; border-top: 1px solid #E8DDD3;">
                            <!-- Automated Email Notice -->
                            <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                <p style="font-size: 11px; color: #92400E; margin: 0; font-weight: 600;">
                                    ${automatedEmailNotice}
                                </p>
                                <p style="font-size: 11px; color: #A16207; margin: 6px 0 0;">
                                    ${whatsappSupportNotice} <a href="https://wa.me/5561995790193" style="color: #15803D; font-weight: bold; text-decoration: none;">+55 61 99579-0193</a>
                                </p>
                            </div>
                            <p style="font-size: 12px; color: #9A9488; margin: 0;">
                                ${footerText}<br>
                                <a href="https://${websiteUrl}" style="color: #C9A84C; text-decoration: none;">${websiteUrl}</a><br>
                                <span style="font-size: 10px; color: #B5AFA6;">Order ID: <span style="font-family: monospace;">${orderId}</span></span>
                            </p>
                            <p style="font-size: 10px; color: #B5AFA6; margin: 12px 0 0;">
                                ${addressText}
                            </p>
                            <p style="font-size: 10px; color: #B5AFA6; margin: 8px 0 0;">
                                ${unsubscribeText} <a href="${unsubscribeUrl}" style="color: #B5AFA6; text-decoration: underline;">${unsubscribeAction}</a>
                            </p>
                        </td>
                    </tr>
                </table>
                <div style="height: 40px;"></div>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const text = `
Apollo Song
${title}
----------------------------

${greeting}

${intro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

${spotifyButton}: ${spotifyUrl}
${trackOrderButton}: ${trackOrderUrl}
${newSongButton}: ${quizUrl}

${fallbackText} ${spotifyUrl}

${supportText}: ${supportCta} -> https://wa.me/5561995790193${loc === "pt" ? "?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20meu%20pedido." : ""}

${footerText}
${websiteUrl}
Order ID: ${orderId}
${addressText}

${unsubscribeText} -> ${unsubscribeUrl}
    `;

    return {
        subject,
        html,
        text,
        from,
        headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
    };
}
