import { env } from "~/env";
import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

export type StreamingVipInProgressEmailParams = {
    orderId: string;
    recipientName: string;
    locale: string;
    trackOrderUrl: string;
    songName?: string | null;
    coverUrl?: string | null;
    customerEmail: string;
};

export function buildStreamingVipInProgressEmail({
    orderId,
    recipientName,
    locale,
    trackOrderUrl,
    songName,
    coverUrl,
    customerEmail,
}: StreamingVipInProgressEmailParams) {
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

    // Dual branding - "by Apollo Song" (empty for English)
    const subBrandByLocale: Record<SupportedLocale, string> = {
        pt: "por Apollo Song",
        en: "",
        es: "por Apollo Song",
        fr: "par Apollo Song",
        it: "da Apollo Song",
    };
    const subBrandText = subBrandByLocale[loc];

    const subjects: Record<SupportedLocale, string> = {
        en: `Great news! ${recipientName}'s song is now with the distributor`,
        pt: `Boas notícias! A música de ${recipientName} já está com a distribuidora`,
        es: `¡Buenas noticias! La canción de ${recipientName} ya está con la distribuidora`,
        fr: `Bonne nouvelle ! La chanson de ${recipientName} est maintenant chez le distributeur`,
        it: `Ottime notizie! La canzone di ${recipientName} è ora con il distributore`,
    };

    const titles: Record<SupportedLocale, string> = {
        en: "Your Song Is on Its Way to Social Media",
        pt: "Sua Música Está a Caminho das Redes Sociais",
        es: "Tu Canción Está en Camino a las Redes Sociales",
        fr: "Votre Chanson Est en Route vers les Réseaux Sociaux",
        it: "La Tua Canzone È in Viaggio verso i Social Media",
    };

    const greetings: Record<SupportedLocale, string> = {
        en: "Hello!",
        pt: "Olá!",
        es: "¡Hola!",
        fr: "Bonjour !",
        it: "Ciao!",
    };

    const intros: Record<SupportedLocale, string> = {
        en: `We have great news: the song for <strong>${recipientName}</strong> has been sent to the distributor and is being processed for publication.`,
        pt: `Temos uma ótima notícia: a música de <strong>${recipientName}</strong> já foi enviada para a distribuidora e está sendo processada para publicação.`,
        es: `Tenemos excelentes noticias: la canción de <strong>${recipientName}</strong> ha sido enviada a la distribuidora y está siendo procesada para su publicación.`,
        fr: `Excellente nouvelle : la chanson de <strong>${recipientName}</strong> a été envoyée au distributeur et est en cours de traitement pour publication.`,
        it: `Ottime notizie: la canzone di <strong>${recipientName}</strong> è stata inviata al distributore ed è in fase di elaborazione per la pubblicazione.`,
    };

    const songNameLabels: Record<SupportedLocale, string> = {
        en: "Song name:",
        pt: "Nome da música:",
        es: "Nombre de la canción:",
        fr: "Nom de la chanson :",
        it: "Nome della canzone:",
    };

    const timeframes: Record<SupportedLocale, string> = {
        en: "In 1 to 4 days, it will be available for search on Spotify, Instagram, TikTok, and other platforms.",
        pt: "Em 1 a 4 dias, ela estará disponível para busca no Spotify, Instagram, TikTok e outras plataformas.",
        es: "En 1 a 4 días, estará disponible para búsqueda en Spotify, Instagram, TikTok y otras plataformas.",
        fr: "Dans 1 à 4 jours, elle sera disponible pour la recherche sur Spotify, Instagram, TikTok et autres plateformes.",
        it: "In 1-4 giorni, sarà disponibile per la ricerca su Spotify, Instagram, TikTok e altre piattaforme.",
    };

    const nextSteps: Record<SupportedLocale, string> = {
        en: "As soon as it's live, you'll receive another email with the direct link to share.",
        pt: "Assim que estiver no ar, você receberá outro email com o link direto para compartilhar.",
        es: "Tan pronto como esté en línea, recibirás otro correo con el enlace directo para compartir.",
        fr: "Dès qu'elle sera en ligne, vous recevrez un autre email avec le lien direct à partager.",
        it: "Non appena sarà online, riceverai un'altra email con il link diretto da condividere.",
    };

    const trackOrderButtonText: Record<SupportedLocale, string> = {
        en: "Track Order",
        pt: "Acompanhar Pedido",
        es: "Seguir Pedido",
        fr: "Suivre la Commande",
        it: "Segui Ordine",
    };

    const urlIntros: Record<SupportedLocale, string> = {
        en: "Track your order at:",
        pt: "Acompanhe seu pedido em:",
        es: "Sigue tu pedido en:",
        fr: "Suivez votre commande sur :",
        it: "Segui il tuo ordine su:",
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

    const preheaders: Record<SupportedLocale, string> = {
        en: `${recipientName}'s song has been sent to the distributor - coming soon to Spotify and social media!`,
        pt: `A música de ${recipientName} foi enviada para a distribuidora - em breve no Spotify e nas redes sociais!`,
        es: `La canción de ${recipientName} ha sido enviada a la distribuidora - ¡pronto en Spotify y redes sociales!`,
        fr: `La chanson de ${recipientName} a été envoyée au distributeur - bientôt sur Spotify et les réseaux sociaux !`,
        it: `La canzone di ${recipientName} è stata inviata al distributore - presto su Spotify e sui social!`,
    };

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

    const unsubscribeUrl = getUnsubscribeUrl(customerEmail, loc);

    const subject = subjects[loc];
    const title = titles[loc];
    const greeting = greetings[loc];
    const intro = intros[loc];
    const songNameLabel = songNameLabels[loc];
    const timeframe = timeframes[loc];
    const nextStep = nextSteps[loc];
    const trackOrderButton = trackOrderButtonText[loc];
    const urlIntro = urlIntros[loc];
    const footerText = footerTexts[loc];
    const websiteUrl = websiteUrls[loc];
    const preheaderText = preheaders[loc];
    const addressText = addressTexts[loc];
    const unsubscribeText = unsubscribeTexts[loc];
    const unsubscribeAction = unsubscribeActions[loc];
    const automatedEmailNotice = automatedEmailNotices[loc];
    const whatsappSupportNotice = whatsappSupportNotices[loc];

    // Song info section HTML (cover + name)
    const songInfoHtml = (songName || coverUrl) ? `
                            <!-- Song Info Section -->
                            <div style="background-color: #F8FAFC; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center; border: 1px solid #E2E8F0;">
                                ${coverUrl ? `
                                <div style="margin-bottom: 15px;">
                                    <img src="${coverUrl}" alt="Capa da música" style="width: 200px; height: 200px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
                                </div>
                                ` : ""}
                                ${songName ? `
                                <p style="font-size: 14px; color: #64748B; margin: 0 0 5px;">${songNameLabel}</p>
                                <p style="font-size: 22px; color: #0A0E1A; margin: 0; font-weight: 600; font-family: Georgia, serif;">"${songName}"</p>
                                ` : ""}
                            </div>
    ` : "";

    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${loc}">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="format-detection" content="telephone=no, address=no, email=no" />
    <title>${subject}</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #060912; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <!-- Preheader text (hidden but shows in email preview) -->
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #F1F5F9;">
        ${preheaderText}
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>

    <!-- Container -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9;">
        <tr>
            <td align="center" style="padding: 40px 20px;">

                <!-- Card -->
                <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 12px; overflow: hidden;">

                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #0A0E1A; padding: 40px 0;">
                           <!-- Text Logo -->
                           <span style="font-family: serif; font-size: 32px; font-weight: bold; color: #FFFFFF !important; letter-spacing: -0.5px;">
                               ${logoText}
                           </span>
                           ${subBrandText ? `<br><span style="font-family: Arial, sans-serif; font-size: 14px; color: #D9C4A8 !important;">${subBrandText}</span>` : ""}
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px 50px;">
                            <h1 style="color: #0A0E1A; font-size: 32px; margin: 0 0 25px; text-align: center; font-weight: 600;">${title}</h1>

                            <p style="font-size: 20px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                                ${greeting}
                            </p>

                            <p style="font-size: 20px; line-height: 1.6; color: #334155; margin-bottom: 25px;">
                                ${intro}
                            </p>

                            ${songInfoHtml}

                            <p style="font-size: 20px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                                ${timeframe}
                            </p>

                            <p style="font-size: 20px; line-height: 1.6; color: #64748B; margin-bottom: 35px; font-style: italic; text-align: center; padding: 20px; background-color: #F8FAFC; border-radius: 8px;">
                                "${nextStep}"
                            </p>

                            <!-- CTA Section -->
                            <div style="background-color: #060912; border-radius: 12px; padding: 30px; margin-bottom: 35px; border: 2px solid #334155;">
                                <!-- Explicit URL -->
                                <p style="font-size: 16px; color: #94A3B8; margin: 0 0 12px; text-align: center; font-weight: 600;">
                                    ${urlIntro}
                                </p>
                                <p style="font-size: 14px; margin: 0 0 25px; text-align: center; word-break: break-all;">
                                    <a href="${trackOrderUrl}" style="color: #A0845E; text-decoration: underline;">${trackOrderUrl}</a>
                                </p>

                                <!-- Big CTA Button -->
                                <div style="text-align: center;">
                                    <a href="${trackOrderUrl}" style="background-color: #22C55E; color: #FFFFFF !important; padding: 20px 30px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; display: inline-block; line-height: 1.4; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);">
                                        ${trackOrderButton}
                                    </a>
                                </div>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F8FAFC; padding: 30px; text-align: center; border-top: 1px solid #E2E8F0;">
                            <!-- Automated Email Notice -->
                            <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                                <p style="font-size: 14px; color: #92400E; margin: 0; font-weight: 600;">
                                    ${automatedEmailNotice}
                                </p>
                                <p style="font-size: 16px; color: #92400E; margin: 10px 0 0; font-weight: 600;">
                                    ${whatsappSupportNotice}
                                </p>
                                <p style="margin: 8px 0 0;">
                                    <a href="https://wa.me/5561995790193" style="color: #15803D; font-weight: bold; text-decoration: none; font-size: 20px;">+55 61 99579-0193</a>
                                </p>
                            </div>
                            <p style="font-size: 14px; color: #64748B; margin: 0;">
                                ${footerText}<br>
                                <a href="https://${websiteUrl}" style="color: #0A0E1A; text-decoration: none; font-weight: 500;">${websiteUrl}</a><br>
                                <span style="font-size: 12px; color: #94A3B8;">Order ID: <span style="font-family: monospace;">${orderId}</span></span>
                            </p>
                            <p style="font-size: 12px; color: #94A3B8; margin: 12px 0 0;">
                                ${addressText}
                            </p>
                            <p style="font-size: 12px; color: #94A3B8; margin: 8px 0 0;">
                                ${unsubscribeText} <a href="${unsubscribeUrl}" style="color: #94A3B8; text-decoration: underline;">${unsubscribeAction}</a>
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
Apollo Song
${title}
----------------------------

${greeting}

${intro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

${songName ? `${songNameLabel} "${songName}"` : ""}

${timeframe}

"${nextStep}"

${urlIntro}
${trackOrderUrl}

>>> ${trackOrderButton} <<<

----------------------------
${automatedEmailNotice}
${whatsappSupportNotice} +55 61 99579-0193
----------------------------

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
