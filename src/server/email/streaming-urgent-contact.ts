import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

export type StreamingUrgentContactEmailData = {
    orderId: string;
    recipientName: string;
    email: string;
    locale: string;
    streamingSongName?: string | null;
};

type EmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    greeting: string;
    paragraphs: string[];
    cta: string;
    signoff: string;
};

type CopyParams = {
    recipientName: string;
    songName: string;
};

type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";

const PT_COPY = ({ recipientName, songName }: CopyParams): EmailTemplate => ({
    subject: `📞 Precisamos falar com você sobre a música de ${recipientName}`,
    preheader: `Sua música está quase pronta para o Spotify! Falta só um detalhe...`,
    headline: "Estamos quase lá!",
    greeting: "Oi!",
    paragraphs: [
        `A música de **${recipientName}** está sendo preparada para subir no **Spotify, Instagram e TikTok**.`,
        `Mas para finalizar, **precisamos falar com você** sobre alguns detalhes importantes.`,
        `Por favor, **entre em contato conosco pelo WhatsApp** para que possamos dar continuidade:`,
    ],
    cta: "Falar no WhatsApp agora",
    signoff: "Estamos te esperando!\n\nEquipe Apollo Song",
});

const EN_COPY = ({ recipientName, songName }: CopyParams): EmailTemplate => ({
    subject: `📞 We need to talk to you about ${recipientName}'s song`,
    preheader: `Your song is almost ready for Spotify! Just one detail missing...`,
    headline: "We're almost there!",
    greeting: "Hi!",
    paragraphs: [
        `**${recipientName}**'s song is being prepared to go live on **Spotify, Instagram, and TikTok**.`,
        `But to finalize it, **we need to talk to you** about some important details.`,
        `Please **contact us on WhatsApp** so we can proceed:`,
    ],
    cta: "Chat on WhatsApp now",
    signoff: "We're waiting for you!\n\nApolloSong Team",
});

const ES_COPY = ({ recipientName, songName }: CopyParams): EmailTemplate => ({
    subject: `📞 Necesitamos hablar contigo sobre la canción de ${recipientName}`,
    preheader: `¡Tu canción está casi lista para Spotify! Solo falta un detalle...`,
    headline: "¡Ya casi estamos!",
    greeting: "¡Hola!",
    paragraphs: [
        `La canción de **${recipientName}** se está preparando para subir a **Spotify, Instagram y TikTok**.`,
        `Pero para finalizar, **necesitamos hablar contigo** sobre algunos detalles importantes.`,
        `Por favor, **contáctanos por WhatsApp** para que podamos continuar:`,
    ],
    cta: "Hablar en WhatsApp ahora",
    signoff: "¡Te estamos esperando!\n\nEquipo ApolloSong",
});

const FR_COPY = ({ recipientName, songName }: CopyParams): EmailTemplate => ({
    subject: `📞 Nous devons vous parler de la chanson de ${recipientName}`,
    preheader: `Votre chanson est presque prête pour Spotify ! Il ne manque qu'un détail...`,
    headline: "On y est presque !",
    greeting: "Bonjour !",
    paragraphs: [
        `La chanson de **${recipientName}** est en cours de préparation pour être mise en ligne sur **Spotify, Instagram et TikTok**.`,
        `Mais pour finaliser, **nous devons vous parler** de quelques détails importants.`,
        `Veuillez **nous contacter sur WhatsApp** pour que nous puissions continuer :`,
    ],
    cta: "Parler sur WhatsApp maintenant",
    signoff: "Nous vous attendons !\n\nÉquipe ChansonDivine",
});

const IT_COPY = ({ recipientName, songName }: CopyParams): EmailTemplate => ({
    subject: `📞 Dobbiamo parlarti della canzone di ${recipientName}`,
    preheader: `La tua canzone è quasi pronta per Spotify! Manca solo un dettaglio...`,
    headline: "Ci siamo quasi!",
    greeting: "Ciao!",
    paragraphs: [
        `La canzone di **${recipientName}** è in fase di preparazione per essere pubblicata su **Spotify, Instagram e TikTok**.`,
        `Ma per finalizzare, **dobbiamo parlarti** di alcuni dettagli importanti.`,
        `Per favore, **contattaci su WhatsApp** per poter procedere:`,
    ],
    cta: "Parla su WhatsApp ora",
    signoff: "Ti aspettiamo!\n\nTeam ApolloSong",
});

const COPY_BY_LOCALE: Record<SupportedLocale, (params: CopyParams) => EmailTemplate> = {
    en: EN_COPY,
    pt: PT_COPY,
    es: ES_COPY,
    fr: FR_COPY,
    it: IT_COPY,
};

const brandNames: Record<SupportedLocale, string> = {
    en: "ApolloSong",
    pt: "Apollo Song",
    es: "ApolloSong",
    fr: "ChansonDivine",
    it: "ApolloSong",
};

const defaultNames: Record<SupportedLocale, string> = {
    en: "someone special",
    pt: "alguém especial",
    es: "alguien especial",
    fr: "quelqu'un de spécial",
    it: "qualcuno di speciale",
};

const addressByLocale: Record<SupportedLocale, string> = {
    pt: "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil",
    en: "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil",
    es: "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil",
    fr: "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Brésil",
    it: "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile",
};

const unsubscribeByLocale: Record<SupportedLocale, { text: string; action: string }> = {
    pt: { text: "Não deseja mais receber emails?", action: "Clique aqui" },
    en: { text: "Don't want to receive emails?", action: "Click here" },
    es: { text: "¿No desea recibir más correos?", action: "Haga clic aquí" },
    fr: { text: "Vous ne souhaitez plus recevoir d'emails ?", action: "Cliquez ici" },
    it: { text: "Non vuoi più ricevere email?", action: "Clicca qui" },
};

const subBrandByLocale: Record<SupportedLocale, string> = {
    pt: "por Apollo Song",
    en: "",
    es: "por Apollo Song",
    fr: "par Apollo Song",
    it: "da Apollo Song",
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

function getLocale(locale?: string | null): SupportedLocale {
    if (locale === "pt" || locale === "es" || locale === "fr" || locale === "it") {
        return locale;
    }
    return "en";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAndRenderBold(text: string): string {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map(part => {
        if (part.startsWith("**") && part.endsWith("**")) {
            const inner = part.slice(2, -2);
            return `<strong style="color:#0A0E1A;">${escapeHtml(inner)}</strong>`;
        }
        return escapeHtml(part);
    }).join("");
}

export function buildStreamingUrgentContactEmail(data: StreamingUrgentContactEmailData) {
    const locale = getLocale(data.locale);
    const recipientName = data.recipientName?.trim() || defaultNames[locale];
    const songName = data.streamingSongName || "";

    const template = COPY_BY_LOCALE[locale]({ recipientName, songName });
    const brandName = brandNames[locale];

    const whatsappMessage = locale === "pt"
        ? `Olá! Recebi um email sobre a música de ${recipientName} no Spotify. Pedido: ${data.orderId}`
        : locale === "es"
            ? `¡Hola! Recibí un email sobre la canción de ${recipientName} en Spotify. Pedido: ${data.orderId}`
            : locale === "fr"
                ? `Bonjour! J'ai reçu un email concernant la chanson de ${recipientName} sur Spotify. Commande: ${data.orderId}`
                : locale === "it"
                    ? `Ciao! Ho ricevuto un'email riguardo la canzone di ${recipientName} su Spotify. Ordine: ${data.orderId}`
                    : `Hi! I received an email about ${recipientName}'s song on Spotify. Order: ${data.orderId}`;

    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;

    const addressText = addressByLocale[locale];
    const unsubscribeCopy = unsubscribeByLocale[locale];
    const subBrandText = subBrandByLocale[locale];
    const unsubscribeUrl = getUnsubscribeUrl(data.email, locale);

    const htmlParagraphs = template.paragraphs
        .map((p) => `<p style="margin:0 0 16px;line-height:1.7;color:#374151;font-size:16px;">${escapeAndRenderBold(p)}</p>`)
        .join("");

    const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(template.subject)}</title>
  </head>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(template.preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;">
            <tr>
              <td style="padding:32px 32px 24px;">
                <!-- Brand -->
                <p style="margin:0 0 4px;color:#0A0E1A;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;">${escapeHtml(brandName)}</p>
                ${subBrandText ? `<p style="margin:0 0 8px;color:#6f6f6f;font-size:11px;">${escapeHtml(subBrandText)}</p>` : ""}

                <!-- Headline -->
                <h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:#111827;font-weight:700;">${escapeHtml(template.headline)}</h1>

                <!-- Greeting -->
                <p style="margin:0 0 16px;line-height:1.7;color:#374151;font-size:16px;">${escapeHtml(template.greeting)}</p>

                <!-- Paragraphs -->
                ${htmlParagraphs}

                <!-- WhatsApp CTA - Large and prominent -->
                <div style="text-align:center;margin:32px 0;">
                  <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:20px 48px;background-color:#25D366;color:#ffffff !important;text-decoration:none;border-radius:16px;font-weight:700;font-size:20px;">
                    💬 ${escapeHtml(template.cta)}
                  </a>
                </div>

                <!-- WhatsApp number display -->
                <p style="margin:0 0 24px;text-align:center;font-size:18px;color:#374151;">
                  <strong style="color:#25D366;">+55 61 99579-0193</strong>
                </p>

                <!-- Signoff -->
                <p style="margin:24px 0 0;color:#6b7280;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(template.signoff)}</p>
              </td>
            </tr>
          </table>
          <!-- Automated Email Notice -->
          <div style="background-color:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px;margin-top:16px;max-width:560px;">
            <p style="font-size:11px;color:#92400E;margin:0;font-weight:600;">
              ${escapeHtml(automatedEmailNotices[locale])}
            </p>
            <p style="font-size:11px;color:#A16207;margin:6px 0 0;">
              ${escapeHtml(whatsappSupportNotices[locale])} <a href="https://wa.me/5561995790193" style="color:#15803D;font-weight:bold;text-decoration:none;">+55 61 99579-0193</a>
            </p>
          </div>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:10px;">${escapeHtml(addressText)}</p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">${escapeHtml(unsubscribeCopy.text)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9a9a9a;text-decoration:underline;">${escapeHtml(unsubscribeCopy.action)}</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const text = [
        template.headline,
        "",
        template.greeting,
        "",
        ...template.paragraphs.map(p => p.replace(/\*\*/g, "")),
        "",
        `${template.cta}: ${whatsappUrl}`,
        "",
        "WhatsApp: +55 61 99579-0193",
        "",
        template.signoff,
        "",
        "---",
        automatedEmailNotices[locale],
        `${whatsappSupportNotices[locale]} +55 61 99579-0193`,
        "",
        addressText,
        `${unsubscribeCopy.text} ${unsubscribeUrl}`,
    ].join("\n");

    return {
        subject: template.subject,
        html,
        text,
        headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    };
}
