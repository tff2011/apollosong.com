import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

export type StreamingVipUpsellEmailData = {
    orderId: string;
    recipientName: string;
    email: string;
    locale: string;
    currency: string;
    trackOrderUrl: string;
};

type EmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    greeting: string;
    paragraphs: string[];
    benefits: string[];
    cta: string;
    ctaSecondary: string;
    priceLabel: string;
    signoff: string;
};

type CopyParams = {
    recipientName: string;
    price: string;
};

type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";

const PT_COPY = ({ recipientName, price }: CopyParams): EmailTemplate => ({
    subject: `E se ${recipientName} pudesse ouvir a própria música no Spotify? 🎧`,
    preheader: `Imagine ${recipientName} encontrando a própria música nas plataformas...`,
    headline: "A música ficou linda. Mas ainda é só de vocês dois.",
    greeting: "Oi!",
    paragraphs: [
        `Faz pouco tempo que você recebeu a música de ${recipientName}. E eu imagino que já rolou aquele **momento especial** de ouvir juntos, ver a reação, talvez até algumas lágrimas...`,
        "Mas deixa eu te contar uma coisa:",
        `Agora **só você e ${recipientName}** conseguem ouvir essa música. Ela existe, está pronta, está linda... mas está **guardada só pra vocês**.`,
        "**E se pudesse estar no Spotify?**",
        `Imagina ${recipientName} abrindo o Spotify, digitando o próprio nome... e **encontrando uma música feita especialmente**. Uma música pra ouvir no carro, no trabalho, na academia, **quando bater a saudade**.`,
        `Imagina ${recipientName} podendo **compartilhar com os amigos**, com a família. "Olha, **fizeram uma música pra mim**!"`,
        "Isso não é mais só um presente. **É um legado**. Uma música que vai **existir pra sempre**.",
    ],
    benefits: [
        "A música de {name} no **Spotify, Instagram e TikTok**",
        "**Capa profissional** feita com foto",
        "{name} pode ouvir e compartilhar **de qualquer lugar**",
        "A música fica disponível **para sempre**",
    ],
    cta: "Quero colocar no Spotify",
    ctaSecondary: "Tenho dúvidas, quero falar no WhatsApp",
    priceLabel: "Por apenas",
    signoff: "Com amor,\npor Apollo Song",
});

const EN_COPY = ({ recipientName, price }: CopyParams): EmailTemplate => ({
    subject: `What if ${recipientName} could hear their song on Spotify? 🎧`,
    preheader: "Imagine them finding their own song on streaming platforms...",
    headline: "The song turned out beautiful. But it's still just between you two.",
    greeting: "Hi!",
    paragraphs: [
        `It's been a little while since you received ${recipientName}'s song. And I imagine you've already had that special moment of listening together, seeing the reaction, maybe even some tears...`,
        "But let me tell you something:",
        `Right now, only you and ${recipientName} can hear this song. It exists, it's ready, it's beautiful... but it's kept just for you two.`,
        "What if it could be on Spotify?",
        `Imagine ${recipientName} opening Spotify, typing their own name... and finding a song made just for them. A song they can listen to in the car, at work, at the gym, whenever they miss you.`,
        "Imagine them being able to share it with friends, with family. \"Look, someone made a song for me!\"",
        "This isn't just a gift anymore. It's a legacy. A song that will exist forever.",
    ],
    benefits: [
        "{name}'s song on **Spotify, Instagram, and TikTok**",
        "**Professional cover art** made with their photo",
        "They can listen and share **from anywhere**",
        "The song stays available **forever**",
    ],
    cta: "Put it on Spotify",
    ctaSecondary: "I have questions, let's chat on WhatsApp",
    priceLabel: "For only",
    signoff: "With love,\nby ApolloSong",
});

const ES_COPY = ({ recipientName, price }: CopyParams): EmailTemplate => ({
    subject: `¿Y si ${recipientName} pudiera escuchar su canción en Spotify? 🎧`,
    preheader: "Imagina encontrando su propia canción en las plataformas...",
    headline: "La canción quedó hermosa. Pero todavía es solo de ustedes dos.",
    greeting: "¡Hola!",
    paragraphs: [
        `Hace poco que recibiste la canción de ${recipientName}. Y me imagino que ya tuvieron ese momento especial de escuchar juntos, ver la reacción, quizás hasta algunas lágrimas...`,
        "Pero déjame contarte algo:",
        `Ahora solo tú y ${recipientName} pueden escuchar esta canción. Existe, está lista, está hermosa... pero está guardada solo para ustedes.`,
        "¿Y si pudiera estar en Spotify?",
        `Imagina a ${recipientName} abriendo Spotify, escribiendo su propio nombre... y encontrando una canción hecha solo para ella. Una canción que puede escuchar en el carro, en el trabajo, en el gimnasio, cuando sienta nostalgia.`,
        "Imagina que pueda compartirla con amigos, con la familia. \"¡Mira, me hicieron una canción!\"",
        "Esto ya no es solo un regalo. Es un legado. Una canción que existirá para siempre.",
    ],
    benefits: [
        "La canción de {name} en **Spotify, Instagram y TikTok**",
        "**Portada profesional** hecha con su foto",
        "Puede escuchar y compartir **desde cualquier lugar**",
        "La canción queda disponible **para siempre**",
    ],
    cta: "Quiero ponerla en Spotify",
    ctaSecondary: "Tengo dudas, quiero hablar por WhatsApp",
    priceLabel: "Por solo",
    signoff: "Con cariño,\npor ApolloSong",
});

const FR_COPY = ({ recipientName, price }: CopyParams): EmailTemplate => ({
    subject: `Et si ${recipientName} pouvait écouter sa chanson sur Spotify ? 🎧`,
    preheader: "Imaginez trouver sa propre chanson sur les plateformes...",
    headline: "La chanson est magnifique. Mais elle n'appartient encore qu'à vous deux.",
    greeting: "Bonjour !",
    paragraphs: [
        `Cela fait peu de temps que vous avez reçu la chanson de ${recipientName}. Et j'imagine que vous avez déjà vécu ce moment spécial de l'écouter ensemble, de voir la réaction, peut-être même quelques larmes...`,
        "Mais laissez-moi vous dire quelque chose :",
        `En ce moment, seuls vous et ${recipientName} pouvez écouter cette chanson. Elle existe, elle est prête, elle est magnifique... mais elle n'est gardée que pour vous deux.`,
        "Et si elle pouvait être sur Spotify ?",
        `Imaginez ${recipientName} ouvrant Spotify, tapant son propre nom... et trouvant une chanson faite rien que pour elle. Une chanson qu'elle peut écouter dans la voiture, au travail, à la salle de sport, quand elle s'ennuie de vous.`,
        "Imaginez qu'elle puisse la partager avec ses amis, sa famille. \"Regarde, on m'a fait une chanson !\"",
        "Ce n'est plus juste un cadeau. C'est un héritage. Une chanson qui existera pour toujours.",
    ],
    benefits: [
        "La chanson de {name} sur **Spotify, Instagram et TikTok**",
        "**Pochette professionnelle** faite avec sa photo",
        "Elle peut écouter et partager **de n'importe où**",
        "La chanson reste disponible **pour toujours**",
    ],
    cta: "La mettre sur Spotify",
    ctaSecondary: "J'ai des questions, parlons sur WhatsApp",
    priceLabel: "Pour seulement",
    signoff: "Avec amour,\npar ChansonDivine",
});

const IT_COPY = ({ recipientName, price }: CopyParams): EmailTemplate => ({
    subject: `E se ${recipientName} potesse ascoltare la sua canzone su Spotify? 🎧`,
    preheader: "Immagina trovare la propria canzone sulle piattaforme...",
    headline: "La canzone è bellissima. Ma è ancora solo vostra.",
    greeting: "Ciao!",
    paragraphs: [
        `È passato poco tempo da quando hai ricevuto la canzone di ${recipientName}. E immagino che avete già vissuto quel momento speciale di ascoltarla insieme, vedere la reazione, forse anche qualche lacrima...`,
        "Ma lascia che ti dica una cosa:",
        `In questo momento, solo tu e ${recipientName} potete ascoltare questa canzone. Esiste, è pronta, è bellissima... ma è custodita solo per voi due.`,
        "E se potesse essere su Spotify?",
        `Immagina ${recipientName} che apre Spotify, digita il proprio nome... e trova una canzone fatta solo per lei. Una canzone che può ascoltare in macchina, al lavoro, in palestra, quando sente la nostalgia.`,
        "Immagina che possa condividerla con gli amici, con la famiglia. \"Guarda, mi hanno fatto una canzone!\"",
        "Questo non è più solo un regalo. È un'eredità. Una canzone che esisterà per sempre.",
    ],
    benefits: [
        "La canzone di {name} su **Spotify, Instagram e TikTok**",
        "**Copertina professionale** fatta con la sua foto",
        "Può ascoltare e condividere **da qualsiasi luogo**",
        "La canzone rimane disponibile **per sempre**",
    ],
    cta: "Voglio metterla su Spotify",
    ctaSecondary: "Ho domande, parliamo su WhatsApp",
    priceLabel: "Per soli",
    signoff: "Con amore,\nda ApolloSong",
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

// Dual branding - "by Apollo Song" (empty for English)
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

function formatPrice(currency: string, locale: SupportedLocale): string {
    if (currency === "BRL") return "R$197";
    if (currency === "EUR") return "€99";
    return "$99";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderMarkdownBold(text: string): string {
    // First escape HTML, then render bold (need to handle ** before escaping)
    return text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0A0E1A;">$1</strong>');
}

function escapeAndRenderBold(text: string): string {
    // Split by ** markers, escape each part, then rejoin with bold tags
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map(part => {
        if (part.startsWith("**") && part.endsWith("**")) {
            const inner = part.slice(2, -2);
            return `<strong style="color:#0A0E1A;">${escapeHtml(inner)}</strong>`;
        }
        return escapeHtml(part);
    }).join("");
}

export function buildStreamingVipUpsellEmail(data: StreamingVipUpsellEmailData) {
    const locale = getLocale(data.locale);
    const recipientName = data.recipientName?.trim() || defaultNames[locale];
    const price = formatPrice(data.currency, locale);

    const template = COPY_BY_LOCALE[locale]({ recipientName, price });
    const brandName = brandNames[locale];

    // Direct checkout URL - creates the streaming upsell order and redirects to payment
    // Always use apollosong.com as the main domain for API calls
    const siteUrl = "https://apollosong.com";
    const checkoutUrl = `${siteUrl}/api/streaming-upsell?orderId=${encodeURIComponent(data.orderId)}&email=${encodeURIComponent(data.email)}`;
    const safeCheckoutUrl = escapeHtml(checkoutUrl);
    const whatsappMessage = locale === "pt"
        ? `Olá! Tenho dúvidas sobre colocar a música no Spotify. Email: ${data.email}`
        : locale === "es"
            ? `¡Hola! Tengo dudas sobre poner la canción en Spotify. Email: ${data.email}`
            : locale === "fr"
                ? `Bonjour! J'ai des questions sur la mise en ligne sur Spotify. Email: ${data.email}`
                : locale === "it"
                    ? `Ciao! Ho domande su come mettere la canzone su Spotify. Email: ${data.email}`
                    : `Hi! I have questions about putting the song on Spotify. Email: ${data.email}`;
    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;
    const addressText = addressByLocale[locale];
    const unsubscribeCopy = unsubscribeByLocale[locale];
    const subBrandText = subBrandByLocale[locale];
    const unsubscribeUrl = getUnsubscribeUrl(data.email, locale);

    const htmlParagraphs = template.paragraphs
        .map((p) => `<p style="margin:0 0 16px;line-height:1.7;color:#374151;font-size:16px;">${escapeAndRenderBold(p)}</p>`)
        .join("");

    const htmlBenefits = template.benefits
        .map((b) => {
            const text = b.replace("{name}", recipientName);
            return `<li style="margin:0 0 12px;padding-left:8px;line-height:1.6;color:#0A0E1A;font-size:17px;font-weight:500;">${escapeAndRenderBold(text)}</li>`;
        })
        .join("");

    // Platform names with brand colors - text only for maximum compatibility
    const platformIcons = `
      <div style="text-align:center;margin:28px 0 24px;">
        <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;">
          <span style="color:#1DB954;">Spotify</span>
          <span style="color:#9ca3af;margin:0 8px;">•</span>
          <span style="color:#E4405F;">Instagram</span>
          <span style="color:#9ca3af;margin:0 8px;">•</span>
          <span style="color:#000000;">TikTok</span>
        </p>
      </div>`;

    // Example cover image
    const coverExample = `
      <div style="text-align:center;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:14px;color:#6b7280;font-weight:600;">
          ${locale === "pt" ? "Exemplo de capa profissional:" : locale === "es" ? "Ejemplo de portada profesional:" : locale === "fr" ? "Exemple de pochette professionnelle:" : locale === "it" ? "Esempio di copertina professionale:" : "Example of professional cover art:"}
        </p>
        <img src="${siteUrl}/images/capas/capa-ex-1.jpg" alt="Cover Example" width="200" height="200" style="border-radius:16px;" />
      </div>`;

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
                <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#111827;font-weight:700;">${escapeHtml(template.headline)}</h1>

                <!-- Greeting -->
                <p style="margin:0 0 16px;line-height:1.7;color:#374151;font-size:16px;">${escapeHtml(template.greeting)}</p>

                <!-- Paragraphs -->
                ${htmlParagraphs}

                <!-- Platform Icons -->
                ${platformIcons}

                <!-- Cover Example -->
                ${coverExample}

                <!-- Benefits Box -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
                  <tr>
                    <td style="padding:24px 28px;background-color:#F5F0EB;border-radius:16px;border-left:5px solid #4A6FA5;">
                      <ul style="margin:0;padding:0 0 0 20px;list-style:disc;">
                        ${htmlBenefits}
                      </ul>
                    </td>
                  </tr>
                </table>

                <!-- Price -->
                <p style="margin:0 0 24px;text-align:center;font-size:20px;color:#374151;">
                  ${escapeHtml(template.priceLabel)} <strong style="color:#0A0E1A;font-size:28px;">${escapeHtml(price)}</strong>
                </p>

                <!-- Primary CTA -->
                <div style="text-align:center;margin:0 0 16px;">
                  <a href="${safeCheckoutUrl}" style="display:inline-block;padding:18px 36px;background-color:#22c55e;color:#ffffff !important;text-decoration:none;border-radius:14px;font-weight:700;font-size:17px;">
                    🎧 ${escapeHtml(template.cta)}
                  </a>
                </div>

                <!-- Secondary CTA (WhatsApp) -->
                <div style="text-align:center;margin:0 0 24px;">
                  <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:14px 28px;background-color:#25D366;color:#ffffff !important;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;">
                    💬 ${escapeHtml(template.ctaSecondary)}
                  </a>
                </div>

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
        "---",
        ...template.benefits.map((b) => `• ${b.replace(/\*\*/g, "").replace("{name}", recipientName)}`),
        "",
        `${template.priceLabel} ${price}`,
        "",
        `${template.cta}: ${checkoutUrl}`,
        "",
        `${template.ctaSecondary}: ${whatsappUrl}`,
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
