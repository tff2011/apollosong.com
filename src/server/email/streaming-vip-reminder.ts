export type StreamingVipReminderEmailData = {
    orderId: string;
    parentOrderId: string;
    recipientName?: string | null;
    email: string;
    locale?: string | null;
    price: number;
    currency: string;
    trackOrderUrl: string;
};

type EmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    greeting: string;
    paragraphs: string[];
    cta: string;
    signoff: string;
    ps?: string;
};

type CopyParams = {
    recipientName: string;
    customerFirstName: string;
    price: string;
};

type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";

const PT_COPY = ({ recipientName, customerFirstName, price }: CopyParams): EmailTemplate => ({
    subject: `A música de ${recipientName} está a um passo do Spotify...`,
    preheader: "Você já fez o mais difícil. A música dela está esperando.",
    headline: "Ela merece ouvir essa música pra sempre",
    greeting: `Oi${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `Eu vi que você começou a colocar a música de ${recipientName} no Spotify... mas não finalizou.`,
        "Eu entendo — a vida corrida, mil abas abertas, aquele \"depois eu volto\". Acontece.",
        `Mas deixa eu te contar uma coisa: você já fez a parte mais difícil. Você parou, pensou em cada detalhe, escolheu as palavras certas. A música de ${recipientName} existe. Ela está linda. Está pronta.`,
        "Só que por enquanto... só vocês dois podem ouvir.",
        `Agora imagina: ${recipientName} abre o Spotify, digita o próprio nome... e encontra uma música feita só pra ela. Uma música que conta a história de vocês. Que ela pode ouvir no carro, no trabalho, quando sentir saudade.`,
        "Isso não é um presente qualquer. É um presente que fica pra sempre.",
    ],
    cta: "Colocar no Spotify agora",
    signoff: "Com carinho,\nEquipe Apollo Song",
    ps: "Se tiver qualquer dúvida, é só responder esse email.",
});

const EN_COPY = ({ recipientName, customerFirstName, price }: CopyParams): EmailTemplate => ({
    subject: `${recipientName}'s song is one step away from Spotify...`,
    preheader: "You already did the hard part. The song is waiting.",
    headline: "They deserve to hear this song forever",
    greeting: `Hi${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `I noticed you started putting ${recipientName}'s song on Spotify... but didn't finish.`,
        "I get it — busy life, a hundred tabs open, that \"I'll come back later\" moment. It happens.",
        `But here's the thing: you already did the hardest part. You stopped, thought about every detail, chose the right words. ${recipientName}'s song exists. It's beautiful. It's ready.`,
        "It's just that for now... only you two can hear it.",
        `Now imagine: ${recipientName} opens Spotify, types their own name... and finds a song made just for them. A song that tells your story. That they can listen to in the car, at work, whenever they miss you.`,
        "This isn't just any gift. It's a gift that lasts forever.",
    ],
    cta: "Put it on Spotify now",
    signoff: "With care,\nThe ApolloSong Team",
    ps: "If you have any questions, just reply to this email.",
});

const ES_COPY = ({ recipientName, customerFirstName, price }: CopyParams): EmailTemplate => ({
    subject: `La canción de ${recipientName} está a un paso de Spotify...`,
    preheader: "Ya hiciste lo más difícil. La canción está esperando.",
    headline: "Merece escuchar esta canción para siempre",
    greeting: `Hola${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `Vi que empezaste a poner la canción de ${recipientName} en Spotify... pero no terminaste.`,
        "Lo entiendo — la vida ajetreada, mil pestañas abiertas, ese \"ya vuelvo después\". Pasa.",
        `Pero déjame contarte algo: ya hiciste la parte más difícil. Te detuviste, pensaste en cada detalle, elegiste las palabras correctas. La canción de ${recipientName} existe. Está hermosa. Está lista.`,
        "Solo que por ahora... solo ustedes dos pueden escucharla.",
        `Ahora imagina: ${recipientName} abre Spotify, escribe su propio nombre... y encuentra una canción hecha solo para ella. Una canción que cuenta la historia de ustedes. Que puede escuchar en el carro, en el trabajo, cuando sienta nostalgia.`,
        "Esto no es un regalo cualquiera. Es un regalo que dura para siempre.",
    ],
    cta: "Ponerla en Spotify ahora",
    signoff: "Con cariño,\nEl equipo de ApolloSong",
    ps: "Si tienes alguna pregunta, solo responde a este correo.",
});

const FR_COPY = ({ recipientName, customerFirstName, price }: CopyParams): EmailTemplate => ({
    subject: `La chanson de ${recipientName} est à un pas de Spotify...`,
    preheader: "Vous avez déjà fait le plus dur. La chanson attend.",
    headline: "Elle mérite d'écouter cette chanson pour toujours",
    greeting: `Bonjour${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `J'ai remarqué que vous avez commencé à mettre la chanson de ${recipientName} sur Spotify... mais vous n'avez pas terminé.`,
        "Je comprends — la vie trépidante, cent onglets ouverts, ce \"j'y reviendrai plus tard\". Ça arrive.",
        `Mais laissez-moi vous dire quelque chose : vous avez déjà fait le plus difficile. Vous vous êtes arrêté, avez réfléchi à chaque détail, choisi les bons mots. La chanson de ${recipientName} existe. Elle est magnifique. Elle est prête.`,
        "C'est juste que pour l'instant... seuls vous deux pouvez l'écouter.",
        `Maintenant imaginez : ${recipientName} ouvre Spotify, tape son propre nom... et trouve une chanson faite rien que pour elle. Une chanson qui raconte votre histoire. Qu'elle peut écouter dans la voiture, au travail, quand elle a le mal du pays.`,
        "Ce n'est pas un cadeau ordinaire. C'est un cadeau qui dure pour toujours.",
    ],
    cta: "La mettre sur Spotify maintenant",
    signoff: "Avec affection,\nL'équipe ChansonDivine",
    ps: "Si vous avez des questions, répondez simplement à cet email.",
});

const IT_COPY = ({ recipientName, customerFirstName, price }: CopyParams): EmailTemplate => ({
    subject: `La canzone di ${recipientName} è a un passo da Spotify...`,
    preheader: "Hai già fatto la parte più difficile. La canzone sta aspettando.",
    headline: "Merita di ascoltare questa canzone per sempre",
    greeting: `Ciao${customerFirstName ? ` ${customerFirstName}` : ""},`,
    paragraphs: [
        `Ho notato che hai iniziato a mettere la canzone di ${recipientName} su Spotify... ma non hai finito.`,
        "Capisco — la vita frenetica, cento schede aperte, quel \"ci torno dopo\". Succede.",
        `Ma lascia che ti dica una cosa: hai già fatto la parte più difficile. Ti sei fermato, hai pensato a ogni dettaglio, hai scelto le parole giuste. La canzone di ${recipientName} esiste. È bellissima. È pronta.`,
        "Solo che per ora... solo voi due potete ascoltarla.",
        `Ora immagina: ${recipientName} apre Spotify, digita il proprio nome... e trova una canzone fatta solo per lei. Una canzone che racconta la vostra storia. Che può ascoltare in macchina, al lavoro, quando sente la nostalgia.`,
        "Questo non è un regalo qualsiasi. È un regalo che dura per sempre.",
    ],
    cta: "Metterla su Spotify ora",
    signoff: "Con affetto,\nIl team ApolloSong",
    ps: "Se hai domande, rispondi semplicemente a questa email.",
});

const COPY_BY_LOCALE: Record<SupportedLocale, (params: CopyParams) => EmailTemplate> = {
    en: EN_COPY,
    pt: PT_COPY,
    es: ES_COPY,
    fr: FR_COPY,
    it: IT_COPY,
};

const defaultNames: Record<SupportedLocale, string> = {
    en: "someone special",
    pt: "alguém especial",
    es: "alguien especial",
    fr: "quelqu'un de spécial",
    it: "qualcuno di speciale",
};

const brandNames: Record<SupportedLocale, string> = {
    en: "ApolloSong",
    pt: "Apollo Song",
    es: "ApolloSong",
    fr: "ChansonDivine",
    it: "ApolloSong",
};

const orderLabels: Record<SupportedLocale, string> = {
    en: "Order ID",
    pt: "Pedido",
    es: "Pedido",
    fr: "Commande",
    it: "Ordine",
};

const whatsappSupportCopy: Record<SupportedLocale, { label: string; action: string; message: (orderId: string) => string }> = {
    en: {
        label: "Questions about how this works?",
        action: "Chat with us on WhatsApp",
        message: (orderId) => `Hi! I have a question about the Streaming VIP. Order ID: ${orderId}.`,
    },
    pt: {
        label: "Ficou com dúvidas sobre como funciona?",
        action: "Tire suas dúvidas no WhatsApp",
        message: (orderId) => `Olá! Tenho uma dúvida sobre o Streaming VIP. Pedido: ${orderId}.`,
    },
    es: {
        label: "¿Tienes dudas sobre cómo funciona?",
        action: "Escríbenos por WhatsApp",
        message: (orderId) => `¡Hola! Tengo una pregunta sobre el Streaming VIP. Pedido: ${orderId}.`,
    },
    fr: {
        label: "Des questions sur le fonctionnement ?",
        action: "Contactez-nous sur WhatsApp",
        message: (orderId) => `Bonjour ! J'ai une question sur le Streaming VIP. Commande : ${orderId}.`,
    },
    it: {
        label: "Hai dubbi su come funziona?",
        action: "Contattaci su WhatsApp",
        message: (orderId) => `Ciao! Ho una domanda sul Streaming VIP. Ordine: ${orderId}.`,
    },
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

function extractFirstName(fullName?: string | null): string {
    if (!fullName) return "";
    const trimmed = fullName.trim();
    const firstSpace = trimmed.indexOf(" ");
    return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
}

export function buildStreamingVipReminderEmail(data: StreamingVipReminderEmailData) {
    const locale = getLocale(data.locale);
    const recipientName = data.recipientName?.trim() || defaultNames[locale];
    const customerFirstName = ""; // We don't have customer name in SongOrder model
    const price = formatPrice(data.price, data.currency, locale);

    const template = COPY_BY_LOCALE[locale]({
        recipientName,
        customerFirstName,
        price,
    });

    const safeTrackOrderUrl = escapeHtml(data.trackOrderUrl);
    const brandName = brandNames[locale];
    const orderLabel = orderLabels[locale];
    const whatsappCopy = whatsappSupportCopy[locale];
    const whatsappMessage = whatsappCopy.message(data.parentOrderId);
    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;

    const htmlParagraphs = template.paragraphs
        .map((paragraph) => `<p style="margin:0 0 18px;line-height:1.7;color:#2b2b2b;font-size:18px;">${escapeHtml(paragraph)}</p>`)
        .join("");

    const whatsappSection = `
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
                  <tr>
                    <td style="padding:20px 24px;background-color:#25D366;border-radius:16px;text-align:center;">
                      <p style="margin:0 0 12px;color:#ffffff !important;font-size:16px;font-weight:600;line-height:1.4;">
                        ${escapeHtml(whatsappCopy.label)}
                      </p>
                      <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:12px 24px;background-color:#ffffff;color:#25D366 !important;text-decoration:none;font-weight:700;font-size:15px;border-radius:30px;">
                        &#128172; ${escapeHtml(whatsappCopy.action)}
                      </a>
                      <p style="margin:12px 0 0;color:#ffffff !important;font-size:13px;">
                        +55 61 99579-0193
                      </p>
                    </td>
                  </tr>
                </table>`;

    const psSection = template.ps
        ? `<p style="margin:20px 0 0;color:#6f6f6f;font-size:14px;font-style:italic;line-height:1.5;">${escapeHtml(template.ps)}</p>`
        : "";

    const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(template.subject)}</title>
  </head>
  <body style="margin:0;background:#f8f5f0;font-family:Arial, sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(template.preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;">
            <tr>
              <td style="padding:32px 32px 16px;">
                <p style="margin:0 0 8px;color:#0A0E1A;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(brandName)}</p>
                <h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:#1d1d1d;">${escapeHtml(template.headline)}</h1>
                <p style="margin:0 0 20px;line-height:1.7;color:#2b2b2b;font-size:18px;">${escapeHtml(template.greeting)}</p>
                ${htmlParagraphs}
                <a href="${safeTrackOrderUrl}" style="display:inline-block;margin:8px 0 24px;padding:16px 28px;background:#0A0E1A;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;">${escapeHtml(template.cta)}</a>
                ${psSection}
                ${whatsappSection}
                <p style="margin:0;color:#6f6f6f;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(template.signoff)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:11px;">${escapeHtml(orderLabel)}: ${escapeHtml(data.parentOrderId)}</p>
          <!-- Automated Email Notice -->
          <div style="background-color:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px;margin-top:16px;max-width:560px;">
            <p style="font-size:11px;color:#92400E;margin:0;font-weight:600;">
              ${escapeHtml(automatedEmailNotices[locale])}
            </p>
            <p style="font-size:11px;color:#A16207;margin:6px 0 0;">
              ${escapeHtml(whatsappSupportNotices[locale])} <a href="https://wa.me/5561995790193" style="color:#15803D;font-weight:bold;text-decoration:none;">+55 61 99579-0193</a>
            </p>
          </div>
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
        ...template.paragraphs,
        "",
        `${template.cta}: ${data.trackOrderUrl}`,
        "",
        template.ps || "",
        "",
        `${whatsappCopy.label} ${whatsappUrl}`,
        "",
        template.signoff,
        "",
        `${orderLabel}: ${data.parentOrderId}`,
        "",
        "---",
        automatedEmailNotices[locale],
        `${whatsappSupportNotices[locale]} +55 61 99579-0193`,
    ].filter(Boolean).join("\n");

    return {
        subject: template.subject,
        html,
        text,
    };
}

function formatPrice(price: number, currency: string, locale: SupportedLocale) {
    const localeMap: Record<SupportedLocale, string> = {
        en: "en-US",
        pt: "pt-BR",
        es: "es-ES",
        fr: "fr-FR",
        it: "it-IT",
    };
    try {
        return new Intl.NumberFormat(localeMap[locale], {
            style: "currency",
            currency,
        }).format(price);
    } catch {
        const fallbacks: Record<SupportedLocale, string> = {
            en: `$${price}`,
            pt: `R$${price}`,
            es: `$${price}`,
            fr: `${price}`,
            it: `${price}`,
        };
        return fallbacks[locale];
    }
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
