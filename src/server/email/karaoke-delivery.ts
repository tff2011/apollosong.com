import { env } from "~/env";
import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

type KaraokeDeliveryEmailParams = {
  orderId: string;
  recipientName: string;
  locale: string;
  trackOrderUrl: string;
  karaokeFileUrl: string;
  customerEmail: string;
};

export function buildKaraokeDeliveryEmail({
  orderId,
  recipientName,
  locale,
  trackOrderUrl,
  karaokeFileUrl,
  customerEmail,
}: KaraokeDeliveryEmailParams) {
  const isPt = locale === "pt";
  const isEs = locale === "es";
  const isFr = locale === "fr";
  const isIt = locale === "it";

  const logoText = isPt ? "Apollo Song" : "Apollo Song";
  const subBrandText = isPt
    ? "por Apollo Song"
    : isEs
      ? "por Apollo Song"
      : isFr
        ? "par Apollo Song"
        : isIt
          ? "da Apollo Song"
          : "";

  const subject = isEs
    ? `¡Tu versión karaoke para ${recipientName} está lista! 🎤`
    : isPt
      ? `Sua versão karaokê de ${recipientName} está pronta! 🎤`
      : isFr
        ? `Votre version karaoké pour ${recipientName} est prête ! 🎤`
        : isIt
          ? `La tua versione karaoke per ${recipientName} è pronta! 🎤`
          : `Your karaoke version for ${recipientName} is ready! 🎤`;

  const title = isEs
    ? "¡Tu Versión Karaoke Está Lista!"
    : isPt
      ? "Sua Versão Karaokê Está Pronta!"
      : isFr
        ? "Votre Version Karaoké est Prête !"
        : isIt
          ? "La Tua Versione Karaoke è Pronta!"
          : "Your Karaoke Version Is Ready!";

  const greeting = isEs ? "¡Hola!" : isPt ? "Olá!" : isFr ? "Bonjour !" : isIt ? "Ciao!" : "Hello!";

  const intro = isEs
    ? `¡La versión karaoke de la canción de <strong>${recipientName}</strong> está lista! Ahora puedes cantarla en fiestas, reuniones o en un karaoke familiar.`
    : isPt
      ? `A versão karaokê da música de <strong>${recipientName}</strong> ficou pronta! Agora você pode cantar em festas, reuniões ou no karaokê da família.`
      : isFr
        ? `La version karaoké de la chanson de <strong>${recipientName}</strong> est prête ! Vous pouvez maintenant la chanter lors de fêtes ou en karaoké familial.`
        : isIt
          ? `La versione karaoke della canzone di <strong>${recipientName}</strong> è pronta! Ora puoi cantarla a feste, riunioni o al karaoke in famiglia.`
          : `The karaoke version of <strong>${recipientName}</strong>'s song is ready! Now you can sing it at parties, gatherings, or family karaoke.`;

  const listenButtonText = isEs
    ? "Escuchar Mi Karaoke"
    : isPt
      ? "Ouvir Meu Karaokê"
      : isFr
        ? "Écouter Mon Karaoké"
        : isIt
          ? "Ascolta il Mio Karaoke"
          : "Listen to My Karaoke";

  const from = `"Apollo Song" <contact@apollosong.com>`;

  const footerText = isEs
    ? "Hecho con pasión y amor por Apollo Song."
    : isPt
      ? "Feito com paixão e amor por Apollo Song."
      : isFr
        ? "Fait avec passion et amour par Apollo Song."
        : isIt
          ? "Fatto con passione e amore da Apollo Song."
          : "Made with passion and love by Apollo Song.";

  const websiteUrl = isEs ? "www.apollosong.com/es" : isPt ? "www.apollosong.com/pt" : "www.apollosong.com";

  const automatedEmailNotice = isEs
    ? "Este es un correo automático. No responda."
    : isPt
      ? "Este é um email automático. Não responda."
      : isFr
        ? "Ceci est un email automatique. Ne répondez pas."
        : isIt
          ? "Questa è un'email automatica. Non rispondere."
          : "This is an automated email. Do not reply.";

  const whatsappSupportNotice = isEs
    ? "Para soporte, contáctenos por WhatsApp:"
    : isPt
      ? "Para suporte, fale conosco pelo WhatsApp:"
      : isFr
        ? "Pour toute assistance, contactez-nous via WhatsApp :"
        : isIt
          ? "Per assistenza, contattaci su WhatsApp:"
          : "For support, contact us via WhatsApp:";

  const preheaderText = isEs
    ? `¡La versión karaoke para ${recipientName} está lista! Haz clic para escuchar.`
    : isPt
      ? `A versão karaokê de ${recipientName} está pronta! Clique para ouvir.`
      : isFr
        ? `La version karaoké pour ${recipientName} est prête ! Cliquez pour écouter.`
        : isIt
          ? `La versione karaoke per ${recipientName} è pronta! Clicca per ascoltare.`
          : `The karaoke version for ${recipientName} is ready! Click to listen.`;

  const addressText = isEs
    ? "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil"
    : isPt
      ? "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil"
      : isFr
        ? "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Brésil"
        : isIt
          ? "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile"
          : "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil";

  const unsubscribeText = isEs
    ? "¿No desea recibir más correos?"
    : isPt
      ? "Não deseja mais receber emails?"
      : isFr
        ? "Vous ne souhaitez plus recevoir d'emails ?"
        : isIt
          ? "Non vuoi più ricevere email?"
          : "Don't want to receive emails?";

  const unsubscribeAction = isEs
    ? "Haga clic aquí"
    : isPt
      ? "Clique aqui"
      : isFr
        ? "Cliquez ici"
        : isIt
          ? "Clicca qui"
          : "Click here";

  const unsubscribeUrl = getUnsubscribeUrl(customerEmail, locale);

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0E1A; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #F0EDE6;">
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
                        <td align="center" style="padding: 40px 0 20px; background-color: #FFFFFF;">
                            <span style="font-size: 56px;">🎤</span>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <h1 style="color: #F0EDE6; font-size: 28px; margin: 0 0 20px; text-align: center; font-weight: 500; font-family: Georgia, serif;">${title}</h1>

                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 20px;">
                                ${greeting}
                            </p>

                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 30px;">
                                ${intro}
                            </p>

                            <div style="text-align: center; margin-bottom: 40px;">
                                <a href="${trackOrderUrl}" style="background-color: #7c3aed; color: #FFFFFF !important; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block;">
                                    ${listenButtonText}
                                </a>
                            </div>

                            <p style="font-size: 14px; color: #9A9488; text-align: center; margin-top: 30px;">
                                <a href="https://wa.me/5561995790193${isPt ? "?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20meu%20pedido." : ""}" style="color: #C9A84C; text-decoration: none; font-weight: 500;">WhatsApp</a>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="background-color: #0A0E1A; padding: 30px; text-align: center; border-top: 1px solid #E8DDD3;">
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
${logoText}
${title}
----------------------------

${greeting}

${intro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

----------------------------
${listenButtonText}: ${trackOrderUrl}
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
    },
  };
}
