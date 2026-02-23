import { env } from "~/env";
import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

type RevisionCompletedEmailParams = {
    orderId: string;
    recipientName: string;
    locale: string;
    trackOrderUrl: string;
    customerEmail: string;
};

export function buildRevisionCompletedEmail({
    orderId,
    recipientName,
    locale,
    trackOrderUrl,
    customerEmail,
}: RevisionCompletedEmailParams) {
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
        en: `Your revised song for ${recipientName} is ready!`,
        pt: `Sua musica revisada para ${recipientName} esta pronta!`,
        es: `Tu cancion revisada para ${recipientName} esta lista!`,
        fr: `Votre chanson revisee pour ${recipientName} est prete!`,
        it: `La tua canzone revisionata per ${recipientName} e pronta!`,
    };

    const titles: Record<SupportedLocale, string> = {
        en: "Your Revision Is Complete!",
        pt: "Sua Revisao Esta Pronta!",
        es: "Tu Revision Esta Lista!",
        fr: "Votre Revision Est Terminee!",
        it: "La Tua Revisione E Completa!",
    };

    const greetings: Record<SupportedLocale, string> = {
        en: "Hello!",
        pt: "Ola!",
        es: "Hola!",
        fr: "Bonjour!",
        it: "Ciao!",
    };

    const intros: Record<SupportedLocale, string> = {
        en: `Great news! We have completed the revision for <strong>${recipientName}</strong>'s song. Your updated version is ready to enjoy!`,
        pt: `Otima noticia! Finalizamos a revisao da musica de <strong>${recipientName}</strong>. Sua versao atualizada esta pronta!`,
        es: `Excelente noticia! Hemos completado la revision de la cancion de <strong>${recipientName}</strong>. Tu version actualizada esta lista!`,
        fr: `Excellente nouvelle! Nous avons termine la revision de la chanson de <strong>${recipientName}</strong>. Votre version mise a jour est prete!`,
        it: `Ottima notizia! Abbiamo completato la revisione della canzone di <strong>${recipientName}</strong>. La tua versione aggiornata e pronta!`,
    };

    const buttonText: Record<SupportedLocale, string> = {
        en: "Listen to My Revised Song",
        pt: "Ouvir Minha Musica Revisada",
        es: "Escuchar Mi Cancion Revisada",
        fr: "Ecouter Ma Chanson Revisee",
        it: "Ascolta la Mia Canzone Revisionata",
    };

    const fallbackLabel: Record<SupportedLocale, string> = {
        en: "If the button doesn't open, use this link:",
        pt: "Se o botao nao abrir, use este link:",
        es: "Si el boton no se abre, usa este enlace:",
        fr: "Si le bouton ne s'ouvre pas, utilisez ce lien:",
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

    const preheaders: Record<SupportedLocale, string> = {
        en: `The revised song for ${recipientName} is ready!`,
        pt: `A musica revisada de ${recipientName} esta pronta!`,
        es: `La cancion revisada de ${recipientName} esta lista!`,
        fr: `La chanson revisee de ${recipientName} est prete!`,
        it: `La canzone revisionata di ${recipientName} e pronta!`,
    };

    const addressTexts: Record<SupportedLocale, string> = {
        en: "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil",
        pt: "CSG 3 LT 7, Brasilia-DF, CEP 72035-503, Brasil",
        es: "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil",
        fr: "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Bresil",
        it: "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile",
    };

    const unsubscribeTexts: Record<SupportedLocale, string> = {
        en: "Don't want to receive emails?",
        pt: "Nao deseja mais receber emails?",
        es: "No desea recibir mas correos?",
        fr: "Vous ne souhaitez plus recevoir d'emails?",
        it: "Non vuoi piu ricevere email?",
    };

    const unsubscribeActions: Record<SupportedLocale, string> = {
        en: "Click here",
        pt: "Clique aqui",
        es: "Haga clic aqui",
        fr: "Cliquez ici",
        it: "Clicca qui",
    };

    const subBrandByLocale: Record<SupportedLocale, string> = {
        pt: "por Apollo Song",
        en: "",
        es: "por Apollo Song",
        fr: "par Apollo Song",
        it: "da Apollo Song",
    };

    const unsubscribeUrl = getUnsubscribeUrl(customerEmail, loc);

    // Upsell Spotify section
    const upsellTitles: Record<SupportedLocale, string> = {
        pt: "Quer eternizar essa musica?",
        en: "Want to make this song last forever?",
        es: "Quieres que esta cancion dure para siempre?",
        fr: "Vous voulez que cette chanson dure pour toujours?",
        it: "Vuoi che questa canzone duri per sempre?",
    };

    const upsellTexts: Record<SupportedLocale, string> = {
        pt: `Coloque a musica de <strong>${recipientName}</strong> no Spotify, Apple Music, TikTok, Instagram e WhatsApp. Um presente que pode ser ouvido e compartilhado em qualquer lugar do mundo, para sempre.`,
        en: `Put <strong>${recipientName}</strong>'s song on Spotify, Apple Music, TikTok, Instagram, and WhatsApp. A gift that can be heard and shared anywhere in the world, forever.`,
        es: `Pon la cancion de <strong>${recipientName}</strong> en Spotify, Apple Music, TikTok, Instagram y WhatsApp. Un regalo que se puede escuchar y compartir en cualquier parte del mundo, para siempre.`,
        fr: `Mettez la chanson de <strong>${recipientName}</strong> sur Spotify, Apple Music, TikTok, Instagram et WhatsApp. Un cadeau qui peut etre ecoute et partage partout dans le monde, pour toujours.`,
        it: `Metti la canzone di <strong>${recipientName}</strong> su Spotify, Apple Music, TikTok, Instagram e WhatsApp. Un regalo che puo essere ascoltato e condiviso ovunque nel mondo, per sempre.`,
    };

    const upsellButtons: Record<SupportedLocale, string> = {
        pt: "Quero no Spotify!",
        en: "I want it on Spotify!",
        es: "Lo quiero en Spotify!",
        fr: "Je le veux sur Spotify!",
        it: "Lo voglio su Spotify!",
    };

    const subject = subjects[loc];
    const title = titles[loc];
    const greeting = greetings[loc];
    const intro = intros[loc];
    const button = buttonText[loc];
    const fallbackText = fallbackLabel[loc];
    const supportText = supportLabel[loc];
    const supportCta = supportAction[loc];
    const footerText = footerTexts[loc];
    const websiteUrl = websiteUrls[loc];
    const preheaderText = preheaders[loc];
    const addressText = addressTexts[loc];
    const unsubscribeText = unsubscribeTexts[loc];
    const unsubscribeAction = unsubscribeActions[loc];
    const automatedEmailNotice = automatedEmailNotices[loc];
    const whatsappSupportNotice = whatsappSupportNotices[loc];
    const subBrandText = subBrandByLocale[loc];
    const upsellTitle = upsellTitles[loc];
    const upsellText = upsellTexts[loc];
    const upsellButton = upsellButtons[loc];
    const upsellUrl = `${trackOrderUrl}#streaming-upsell`;

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
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
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
                            <span style="font-size: 56px;">&#10004;</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <h1 style="color: #F0EDE6; font-size: 28px; margin: 0 0 18px; text-align: center; font-weight: 500; font-family: Georgia, serif;">${title}</h1>
                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 20px;">${greeting}</p>
                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 24px;">
                                ${intro}
                            </p>
                            <div style="text-align: center; margin-bottom: 28px;">
                                <a href="${trackOrderUrl}" style="background-color: #22c55e; color: #FFFFFF; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
                                    ${button}
                                </a>
                            </div>
                            <p style="font-size: 14px; line-height: 1.6; color: #78716C; margin-bottom: 16px;">
                                ${fallbackText}<br>
                                <a href="${trackOrderUrl}" style="color: #22c55e; text-decoration: none; word-break: break-all;">${trackOrderUrl}</a>
                            </p>
                        </td>
                    </tr>
                    <!-- Upsell Spotify Section -->
                    <tr>
                        <td style="padding: 0 30px 30px; background-color: #FFFFFF;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background-color: #1DB954; border-radius: 12px; padding: 24px; text-align: center;">
                                        <span style="font-size: 32px; display: block; margin-bottom: 12px;">&#127911;</span>
                                        <h3 style="color: #FFFFFF !important; font-size: 18px; margin: 0 0 12px; font-weight: 600; font-family: Georgia, serif;">${upsellTitle}</h3>
                                        <p style="color: #FFFFFF !important; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                                            ${upsellText}
                                        </p>
                                        <a href="${upsellUrl}" style="background-color: #FFFFFF; color: #1DB954 !important; padding: 14px 32px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                            ${upsellButton}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <p style="font-size: 14px; color: #9A9488; text-align: center; margin-top: 10px;">
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

${button}: ${trackOrderUrl}

${fallbackText} ${trackOrderUrl}

----------------------------
${upsellTitle}

${upsellText.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

${upsellButton}: ${upsellUrl}
----------------------------

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
