import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

export type MonthlyReengagementEmailData = {
    orderId: string;
    recipientName: string;
    email: string;
    locale: string;
    currency: string;
    quizUrl: string;
    customerEmail: string;
};

type EmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    greeting: string;
    paragraphs: string[];
    occasions: string[];
    cta: string;
    ctaSecondary: string;
    discount: string;
    signoff: string;
};

type CopyParams = {
    recipientName: string;
    discount: string;
};

type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";

const PT_COPY = ({ recipientName, discount }: CopyParams): EmailTemplate => ({
    subject: `Faz 1 mês que ${recipientName} recebeu aquela música especial... 🎵`,
    preheader: `Quem será o próximo a ser homenageado?`,
    headline: "Lembra da reação?",
    greeting: "Oi!",
    paragraphs: [
        `Faz exatamente **1 mês** que você deu aquele presente único para ${recipientName}.`,
        `Eu ainda lembro quando você escolheu cada detalhe... o gênero, as memórias, a mensagem. E aposto que você também lembra da **reação** quando a música tocou pela primeira vez.`,
        `Talvez lágrimas. Talvez um abraço apertado. Talvez aquele silêncio emocionado que vale mais que mil palavras.`,
        `E agora eu te pergunto:`,
        `**Quem é a próxima pessoa especial na sua vida que merece esse momento?**`,
        `Pensa comigo... No próximo mês tem aniversário de alguém? Um amigo que está passando por um momento difícil? Seus pais que você não agradece há tempos? Aquele casal que vai completar bodas?`,
        `Uma música personalizada não é só um presente. É **uma declaração de amor que fica pra sempre**.`,
    ],
    occasions: [
        "🎂 **Aniversários** de pessoas queridas",
        "💒 **Casamentos** e bodas",
        "👨‍👩‍👧 **Dia dos Pais/Mães** ou homenagens em vida",
        "🎓 **Formaturas** e conquistas",
        "💔 **Homenagens póstumas** para eternizar memórias",
        "❤️ Ou simplesmente dizer **\"eu te amo\"** de um jeito único",
    ],
    cta: "Criar uma nova música",
    ctaSecondary: "Tenho dúvidas, quero falar no WhatsApp",
    discount: discount,
    signoff: "Com carinho,\nEquipe Apollo Song",
});

const EN_COPY = ({ recipientName, discount }: CopyParams): EmailTemplate => ({
    subject: `It's been 1 month since ${recipientName} received that special song... 🎵`,
    preheader: `Who will be the next one to be honored?`,
    headline: "Remember the reaction?",
    greeting: "Hi!",
    paragraphs: [
        `It's been exactly **1 month** since you gave that unique gift to ${recipientName}.`,
        `I still remember when you chose every detail... the genre, the memories, the message. And I bet you also remember the **reaction** when the song played for the first time.`,
        `Maybe tears. Maybe a tight hug. Maybe that emotional silence that's worth more than a thousand words.`,
        `And now I ask you:`,
        `**Who is the next special person in your life who deserves this moment?**`,
        `Think with me... Is there a birthday coming up next month? A friend going through a tough time? Your parents whom you haven't thanked in a while? That couple celebrating their anniversary?`,
        `A personalized song isn't just a gift. It's **a declaration of love that lasts forever**.`,
    ],
    occasions: [
        "🎂 **Birthdays** of loved ones",
        "💒 **Weddings** and anniversaries",
        "👨‍👩‍👧 **Mother's/Father's Day** or tributes while they're here",
        "🎓 **Graduations** and achievements",
        "💔 **Memorial tributes** to eternalize memories",
        "❤️ Or simply saying **\"I love you\"** in a unique way",
    ],
    cta: "Create a new song",
    ctaSecondary: "I have questions, let's chat on WhatsApp",
    discount: discount,
    signoff: "With love,\nApolloSong Team",
});

const ES_COPY = ({ recipientName, discount }: CopyParams): EmailTemplate => ({
    subject: `Hace 1 mes que ${recipientName} recibió esa canción especial... 🎵`,
    preheader: `¿Quién será el próximo en ser homenajeado?`,
    headline: "¿Recuerdas la reacción?",
    greeting: "¡Hola!",
    paragraphs: [
        `Hace exactamente **1 mes** que le diste ese regalo único a ${recipientName}.`,
        `Todavía recuerdo cuando elegiste cada detalle... el género, los recuerdos, el mensaje. Y apuesto que tú también recuerdas la **reacción** cuando la canción sonó por primera vez.`,
        `Quizás lágrimas. Quizás un abrazo apretado. Quizás ese silencio emocionado que vale más que mil palabras.`,
        `Y ahora te pregunto:`,
        `**¿Quién es la próxima persona especial en tu vida que merece este momento?**`,
        `Piensa conmigo... ¿El próximo mes hay cumpleaños de alguien? ¿Un amigo pasando por un momento difícil? ¿Tus padres a quienes no agradeces hace tiempo? ¿Esa pareja que va a celebrar su aniversario?`,
        `Una canción personalizada no es solo un regalo. Es **una declaración de amor que dura para siempre**.`,
    ],
    occasions: [
        "🎂 **Cumpleaños** de seres queridos",
        "💒 **Bodas** y aniversarios",
        "👨‍👩‍👧 **Día del Padre/Madre** u homenajes en vida",
        "🎓 **Graduaciones** y logros",
        "💔 **Homenajes póstumos** para eternizar memorias",
        "❤️ O simplemente decir **\"te amo\"** de una forma única",
    ],
    cta: "Crear una nueva canción",
    ctaSecondary: "Tengo dudas, quiero hablar por WhatsApp",
    discount: discount,
    signoff: "Con cariño,\nEquipo ApolloSong",
});

const FR_COPY = ({ recipientName, discount }: CopyParams): EmailTemplate => ({
    subject: `Cela fait 1 mois que ${recipientName} a reçu cette chanson spéciale... 🎵`,
    preheader: `Qui sera le prochain à être honoré ?`,
    headline: "Vous souvenez-vous de la réaction ?",
    greeting: "Bonjour !",
    paragraphs: [
        `Cela fait exactement **1 mois** que vous avez offert ce cadeau unique à ${recipientName}.`,
        `Je me souviens encore quand vous avez choisi chaque détail... le genre, les souvenirs, le message. Et je parie que vous vous souvenez aussi de la **réaction** quand la chanson a joué pour la première fois.`,
        `Peut-être des larmes. Peut-être une étreinte serrée. Peut-être ce silence ému qui vaut plus que mille mots.`,
        `Et maintenant je vous demande :`,
        `**Qui est la prochaine personne spéciale dans votre vie qui mérite ce moment ?**`,
        `Réfléchissez avec moi... Y a-t-il un anniversaire le mois prochain ? Un ami qui traverse une période difficile ? Vos parents que vous n'avez pas remerciés depuis longtemps ? Ce couple qui va fêter son anniversaire de mariage ?`,
        `Une chanson personnalisée n'est pas qu'un cadeau. C'est **une déclaration d'amour qui dure pour toujours**.`,
    ],
    occasions: [
        "🎂 **Anniversaires** de proches",
        "💒 **Mariages** et anniversaires de mariage",
        "👨‍👩‍👧 **Fête des Pères/Mères** ou hommages de leur vivant",
        "🎓 **Diplômes** et réussites",
        "💔 **Hommages posthumes** pour éterniser les souvenirs",
        "❤️ Ou simplement dire **\"je t'aime\"** d'une façon unique",
    ],
    cta: "Créer une nouvelle chanson",
    ctaSecondary: "J'ai des questions, parlons sur WhatsApp",
    discount: discount,
    signoff: "Avec amour,\nÉquipe ChansonDivine",
});

const IT_COPY = ({ recipientName, discount }: CopyParams): EmailTemplate => ({
    subject: `È passato 1 mese da quando ${recipientName} ha ricevuto quella canzone speciale... 🎵`,
    preheader: `Chi sarà il prossimo ad essere omaggiato?`,
    headline: "Ricordi la reazione?",
    greeting: "Ciao!",
    paragraphs: [
        `È passato esattamente **1 mese** da quando hai fatto quel regalo unico a ${recipientName}.`,
        `Ricordo ancora quando hai scelto ogni dettaglio... il genere, i ricordi, il messaggio. E scommetto che anche tu ricordi la **reazione** quando la canzone è stata riprodotta per la prima volta.`,
        `Forse lacrime. Forse un abbraccio stretto. Forse quel silenzio emozionato che vale più di mille parole.`,
        `E ora ti chiedo:`,
        `**Chi è la prossima persona speciale nella tua vita che merita questo momento?**`,
        `Pensa con me... Il mese prossimo c'è il compleanno di qualcuno? Un amico che sta attraversando un momento difficile? I tuoi genitori che non ringrazi da tempo? Quella coppia che festeggerà l'anniversario?`,
        `Una canzone personalizzata non è solo un regalo. È **una dichiarazione d'amore che dura per sempre**.`,
    ],
    occasions: [
        "🎂 **Compleanni** di persone care",
        "💒 **Matrimoni** e anniversari",
        "👨‍👩‍👧 **Festa del Papà/Mamma** o omaggi in vita",
        "🎓 **Lauree** e traguardi",
        "💔 **Omaggi postumi** per eternizzare i ricordi",
        "❤️ O semplicemente dire **\"ti amo\"** in modo unico",
    ],
    cta: "Creare una nuova canzone",
    ctaSecondary: "Ho domande, parliamo su WhatsApp",
    discount: discount,
    signoff: "Con affetto,\nTeam ApolloSong",
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

export function buildMonthlyReengagementEmail(data: MonthlyReengagementEmailData) {
    const locale = getLocale(data.locale);
    const recipientName = data.recipientName?.trim() || defaultNames[locale];
    const discount = ""; // No discount for now, can be added later

    const template = COPY_BY_LOCALE[locale]({ recipientName, discount });
    const brandName = brandNames[locale];

    const siteUrl = "https://apollosong.com";
    const quizUrl = data.quizUrl || `${siteUrl}/${locale === "en" ? "" : locale}`;
    const safeQuizUrl = escapeHtml(quizUrl);
    const unsubscribeUrl = getUnsubscribeUrl(data.customerEmail, locale);

    const whatsappMessage = locale === "pt"
        ? `Olá! Quero criar uma nova música personalizada!`
        : locale === "es"
            ? `¡Hola! ¡Quiero crear una nueva canción personalizada!`
            : locale === "fr"
                ? `Bonjour! Je veux créer une nouvelle chanson personnalisée!`
                : locale === "it"
                    ? `Ciao! Voglio creare una nuova canzone personalizzata!`
                    : `Hi! I want to create a new personalized song!`;
    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;

    const addressText = addressByLocale[locale];
    const unsubscribeCopy = unsubscribeByLocale[locale];
    const subBrandText = subBrandByLocale[locale];

    const htmlParagraphs = template.paragraphs
        .map((p) => `<p style="margin:0 0 16px;line-height:1.7;color:#374151;font-size:16px;">${escapeAndRenderBold(p)}</p>`)
        .join("");

    const htmlOccasions = template.occasions
        .map((o) => `<li style="margin:0 0 10px;padding-left:8px;line-height:1.5;color:#0A0E1A;font-size:15px;">${escapeAndRenderBold(o)}</li>`)
        .join("");

    const occasionsTitle: Record<SupportedLocale, string> = {
        pt: "Ocasiões perfeitas para presentear:",
        en: "Perfect occasions to gift:",
        es: "Ocasiones perfectas para regalar:",
        fr: "Occasions parfaites pour offrir:",
        it: "Occasioni perfette per regalare:",
    };

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

                <!-- Occasions Box -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
                  <tr>
                    <td style="padding:24px 28px;background-color:#fef3c7;border-radius:16px;border-left:5px solid #f59e0b;">
                      <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#92400e;">${escapeHtml(occasionsTitle[locale])}</p>
                      <ul style="margin:0;padding:0 0 0 20px;list-style:none;">
                        ${htmlOccasions}
                      </ul>
                    </td>
                  </tr>
                </table>

                <!-- Primary CTA -->
                <div style="text-align:center;margin:28px 0 16px;">
                  <a href="${safeQuizUrl}" style="display:inline-block;padding:18px 40px;background-color:#22c55e;color:#ffffff !important;text-decoration:none;border-radius:14px;font-weight:700;font-size:18px;">
                    🎵 ${escapeHtml(template.cta)}
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
        occasionsTitle[locale],
        ...template.occasions.map((o) => `${o.replace(/\*\*/g, "")}`),
        "",
        `${template.cta}: ${quizUrl}`,
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
