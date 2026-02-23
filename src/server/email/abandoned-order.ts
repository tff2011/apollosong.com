import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";
import { GENRE_NAMES } from "~/lib/lyrics-generator";

export type ReminderStage = "15m" | "3d" | "7d";

export type AbandonedOrderEmailData = {
    orderId: string;
    recipientName?: string | null;
    locale?: string | null;
    price: number;
    currency: string;
    checkoutUrl: string;
    customerEmail: string;
    priceMode?: "exact" | "startingFrom";
    // Quiz fields for order summary
    recipient?: string | null;
    qualities?: string | null;
    memories?: string | null;
    message?: string | null;
    genre?: string | null;
    vocals?: string | null;
};

type EmailTemplate = {
    subject: string;
    preheader: string;
    headline: string;
    paragraphs: string[];
    cta: string;
    signoff: string;
};

type CopyParams = {
    recipientName: string;
    price: string;
};

type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";

const PT_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `A canção de ${recipientName} está quase pronta — posso finalizar?`,
        preheader: "Faltam apenas 2 cliques para criar algo inesquecível.",
        headline: "Sua história já está guardada aqui",
        paragraphs: [
            `Vi que você começou a criar uma canção personalizada para ${recipientName} — e a história que você contou é linda demais para ficar parada.`,
            "Falta só um passo para eu começar a compor. Sua história já está salva e pronta para virar música.",
            `O valor é ${price} e você tem garantia total de 30 dias. Se não amar, devolvemos seu dinheiro.`,
            `Clique abaixo e em 7 dias ${recipientName} vai chorar de emoção.`,
        ],
        cta: `Criar a música de ${recipientName}`,
        signoff: "Com carinho, equipe Apollo Song",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `Encontrei sua história para ${recipientName}... ela merece virar música`,
        preheader: "Ainda guardamos tudo o que você escreveu.",
        headline: "Essa história merece ser cantada",
        paragraphs: [
            `Voltei para lembrar: sua canção para ${recipientName} ainda está salva aqui.`,
            "Li a história que você compartilhou e confesso que me emocionei. É exatamente o tipo de presente que transforma vidas.",
            `Por apenas ${price}, você dá um presente que ${recipientName} vai guardar para sempre. E se não gostar, devolvemos tudo.`,
            "Não deixe essa história morrer no rascunho. Ela merece virar música.",
        ],
        cta: "Transformar em música agora",
        signoff: "Com carinho, equipe Apollo Song",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Última chance: a canção de ${recipientName} será arquivada amanhã`,
        preheader: "Depois disso, você precisará começar do zero.",
        headline: "Eu ainda posso criar sua canção",
        paragraphs: [
            `Este é o último lembrete: seu pedido para ${recipientName} será arquivado em 24 horas.`,
            "Depois disso, você precisará começar tudo de novo. Mas se finalizar agora, eu começo a compor ainda hoje.",
            `O presente mais emocionante que você já deu por apenas ${price}. 30 dias de garantia.`,
            "É o caminho mais rápido para fazer alguém chorar de alegria.",
        ],
        cta: "Finalizar antes que expire",
        signoff: "Com carinho, equipe Apollo Song",
    }),
};

const EN_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `${recipientName}'s song is almost ready — can I finish it?`,
        preheader: "Just 2 clicks away from something unforgettable.",
        headline: "Your story is saved and waiting",
        paragraphs: [
            `I saw you started creating a custom song for ${recipientName} — and the story you shared is too beautiful to leave unfinished.`,
            "Just one more step and I can start composing. Your story is already saved and ready to become music.",
            `The total is ${price} with a full 30-day guarantee. If you don't love it, we'll refund every penny.`,
            `Click below and in 7 days ${recipientName} will cry tears of joy.`,
        ],
        cta: `Create ${recipientName}'s song`,
        signoff: "With care, the ApolloSong team",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `I found your story for ${recipientName}... it deserves to become a song`,
        preheader: "We still have everything you wrote saved.",
        headline: "This story deserves to be sung",
        paragraphs: [
            `Just a reminder: your song for ${recipientName} is still saved here.`,
            "I read the story you shared and honestly, it moved me. This is exactly the kind of gift that changes lives.",
            `For just ${price}, you can give ${recipientName} a gift they'll treasure forever. And if they don't love it, we refund everything.`,
            "Don't let this story die in the drafts. It deserves to become music.",
        ],
        cta: "Turn it into music now",
        signoff: "With care, the ApolloSong team",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Last chance: ${recipientName}'s song will be archived tomorrow`,
        preheader: "After that, you'll need to start from scratch.",
        headline: "I can still create your song",
        paragraphs: [
            `This is my final reminder: your order for ${recipientName} will be archived in 24 hours.`,
            "After that, you'll need to start over. But if you finish now, I'll start composing today.",
            `The most emotional gift you'll ever give for just ${price}. 30-day money-back guarantee.`,
            "It's the fastest way to make someone cry tears of joy.",
        ],
        cta: "Finish before it expires",
        signoff: "With care, the ApolloSong team",
    }),
};

const ES_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `La canción de ${recipientName} está casi lista — ¿puedo terminarla?`,
        preheader: "Solo faltan 2 clics para crear algo inolvidable.",
        headline: "Tu historia está guardada aquí",
        paragraphs: [
            `Vi que empezaste a crear una canción personalizada para ${recipientName} — y la historia que compartiste es demasiado hermosa para dejarla sin terminar.`,
            "Solo falta un paso más para que comience a componer. Tu historia ya está guardada y lista para convertirse en música.",
            `El total es ${price} con garantía total de 30 días. Si no te encanta, te devolvemos todo.`,
            `Haz clic abajo y en 7 días ${recipientName} llorará de emoción.`,
        ],
        cta: `Crear la canción de ${recipientName}`,
        signoff: "Con cariño, el equipo de ApolloSong",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `Encontré tu historia para ${recipientName}... merece convertirse en canción`,
        preheader: "Todavía tenemos guardado todo lo que escribiste.",
        headline: "Esta historia merece ser cantada",
        paragraphs: [
            `Solo un recordatorio: tu canción para ${recipientName} todavía está guardada aquí.`,
            "Leí la historia que compartiste y honestamente, me conmovió. Este es exactamente el tipo de regalo que cambia vidas.",
            `Por solo ${price}, puedes darle a ${recipientName} un regalo que atesorará para siempre. Y si no le encanta, te devolvemos todo.`,
            "No dejes que esta historia muera en los borradores. Merece convertirse en música.",
        ],
        cta: "Convertirla en música ahora",
        signoff: "Con cariño, el equipo de ApolloSong",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Última oportunidad: la canción de ${recipientName} será archivada mañana`,
        preheader: "Después de eso, tendrás que empezar de cero.",
        headline: "Todavía puedo crear tu canción",
        paragraphs: [
            `Este es mi último recordatorio: tu pedido para ${recipientName} será archivado en 24 horas.`,
            "Después de eso, tendrás que empezar de nuevo. Pero si terminas ahora, empezaré a componer hoy.",
            `El regalo más emotivo que jamás darás por solo ${price}. Garantía de devolución de 30 días.`,
            "Es la forma más rápida de hacer llorar a alguien de alegría.",
        ],
        cta: "Finalizar antes de que expire",
        signoff: "Con cariño, el equipo de ApolloSong",
    }),
};

const FR_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `La chanson de ${recipientName} est presque prête — puis-je la terminer ?`,
        preheader: "Plus que 2 clics pour créer quelque chose d'inoubliable.",
        headline: "Votre histoire est sauvegardée ici",
        paragraphs: [
            `J'ai vu que vous avez commencé à créer une chanson personnalisée pour ${recipientName} — et l'histoire que vous avez partagée est trop belle pour rester inachevée.`,
            "Il ne reste qu'une étape et je pourrai commencer à composer. Votre histoire est déjà sauvegardée et prête à devenir musique.",
            `Le total est de ${price} avec une garantie complète de 30 jours. Si vous n'êtes pas satisfait, nous vous remboursons intégralement.`,
            `Cliquez ci-dessous et dans 7 jours ${recipientName} pleurera de joie.`,
        ],
        cta: `Créer la chanson de ${recipientName}`,
        signoff: "Avec affection, l'équipe ChansonDivine",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `J'ai trouvé votre histoire pour ${recipientName}... elle mérite de devenir une chanson`,
        preheader: "Nous avons encore tout ce que vous avez écrit.",
        headline: "Cette histoire mérite d'être chantée",
        paragraphs: [
            `Juste un rappel : votre chanson pour ${recipientName} est toujours sauvegardée ici.`,
            "J'ai lu l'histoire que vous avez partagée et honnêtement, elle m'a touché. C'est exactement le type de cadeau qui change des vies.",
            `Pour seulement ${price}, vous pouvez offrir à ${recipientName} un cadeau qu'il/elle chérira pour toujours. Et si ça ne plaît pas, nous remboursons tout.`,
            "Ne laissez pas cette histoire mourir dans les brouillons. Elle mérite de devenir musique.",
        ],
        cta: "Transformer en musique maintenant",
        signoff: "Avec affection, l'équipe ChansonDivine",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Dernière chance : la chanson de ${recipientName} sera archivée demain`,
        preheader: "Après cela, vous devrez recommencer à zéro.",
        headline: "Je peux encore créer votre chanson",
        paragraphs: [
            `Ceci est mon dernier rappel : votre commande pour ${recipientName} sera archivée dans 24 heures.`,
            "Après cela, vous devrez tout recommencer. Mais si vous finalisez maintenant, je commencerai à composer aujourd'hui.",
            `Le cadeau le plus émouvant que vous offrirez jamais pour seulement ${price}. Garantie satisfait ou remboursé de 30 jours.`,
            "C'est le moyen le plus rapide de faire pleurer quelqu'un de joie.",
        ],
        cta: "Finaliser avant expiration",
        signoff: "Avec affection, l'équipe ChansonDivine",
    }),
};

const IT_COPY: Record<ReminderStage, (params: CopyParams) => EmailTemplate> = {
    "15m": ({ recipientName, price }) => ({
        subject: `La canzone di ${recipientName} è quasi pronta — posso completarla?`,
        preheader: "Solo 2 clic per creare qualcosa di indimenticabile.",
        headline: "La tua storia è salvata qui",
        paragraphs: [
            `Ho visto che hai iniziato a creare una canzone personalizzata per ${recipientName} — e la storia che hai condiviso è troppo bella per lasciarla incompiuta.`,
            "Manca solo un passaggio e potrò iniziare a comporre. La tua storia è già salvata e pronta per diventare musica.",
            `Il totale è ${price} con garanzia completa di 30 giorni. Se non ti piace, ti rimborsiamo tutto.`,
            `Clicca qui sotto e tra 7 giorni ${recipientName} piangerà di gioia.`,
        ],
        cta: `Creare la canzone di ${recipientName}`,
        signoff: "Con affetto, il team ApolloSong",
    }),
    "3d": ({ recipientName, price }) => ({
        subject: `Ho trovato la tua storia per ${recipientName}... merita di diventare una canzone`,
        preheader: "Abbiamo ancora tutto quello che hai scritto.",
        headline: "Questa storia merita di essere cantata",
        paragraphs: [
            `Solo un promemoria: la tua canzone per ${recipientName} è ancora salvata qui.`,
            "Ho letto la storia che hai condiviso e onestamente mi ha commosso. Questo è esattamente il tipo di regalo che cambia le vite.",
            `Per soli ${price}, puoi dare a ${recipientName} un regalo che custodirà per sempre. E se non piace, rimborsiamo tutto.`,
            "Non lasciare che questa storia muoia nelle bozze. Merita di diventare musica.",
        ],
        cta: "Trasformarla in musica ora",
        signoff: "Con affetto, il team ApolloSong",
    }),
    "7d": ({ recipientName, price }) => ({
        subject: `Ultima occasione: la canzone di ${recipientName} sarà archiviata domani`,
        preheader: "Dopo dovrai ricominciare da zero.",
        headline: "Posso ancora creare la tua canzone",
        paragraphs: [
            `Questo è il mio ultimo promemoria: il tuo ordine per ${recipientName} sarà archiviato tra 24 ore.`,
            "Dopo dovrai ricominciare da capo. Ma se finalizzi ora, inizierò a comporre oggi.",
            `Il regalo più emozionante che darai mai per soli ${price}. Garanzia soddisfatti o rimborsati di 30 giorni.`,
            "È il modo più veloce per far piangere qualcuno di gioia.",
        ],
        cta: "Finalizzare prima che scada",
        signoff: "Con affetto, il team ApolloSong",
    }),
};

const COPY_BY_LOCALE: Record<SupportedLocale, Record<ReminderStage, (params: CopyParams) => EmailTemplate>> = {
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

const alreadyPaidMessages: Record<SupportedLocale, string> = {
    en: "If you already paid, please ignore this email.",
    pt: "Se você já concluiu o pagamento, ignore este email.",
    es: "Si ya completaste el pago, ignora este correo.",
    fr: "Si vous avez déjà payé, veuillez ignorer cet email.",
    it: "Se hai già completato il pagamento, ignora questa email.",
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

const whatsappSupportCopy: Record<SupportedLocale, { label: string; action: string; message: (orderId: string) => string }> = {
    en: {
        label: "Have questions or worried this might be a scam? Chat with us on WhatsApp.",
        action: "Chat with us on WhatsApp",
        message: (orderId) => `Hi! I received this email and want to confirm it's legitimate. Order ID: ${orderId}.`,
    },
    pt: {
        label: "Está com dúvidas ou desconfiado de golpe? Fale conosco no WhatsApp.",
        action: "Fale conosco no WhatsApp",
        message: (orderId) => `Olá! Recebi este email e gostaria de confirmar se é legítimo. Pedido: ${orderId}.`,
    },
    es: {
        label: "¿Tienes dudas o sospechas de estafa? Escríbenos por WhatsApp.",
        action: "Escríbenos por WhatsApp",
        message: (orderId) => `¡Hola! Recibí este correo y quiero confirmar si es legítimo. Pedido: ${orderId}.`,
    },
    fr: {
        label: "Vous avez des doutes ou pensez qu'il s'agit d'une arnaque ? Contactez-nous sur WhatsApp.",
        action: "Contactez-nous sur WhatsApp",
        message: (orderId) => `Bonjour ! J'ai reçu cet email et je veux confirmer qu'il est légitime. Commande : ${orderId}.`,
    },
    it: {
        label: "Hai dubbi o temi che possa essere una truffa? Contattaci su WhatsApp.",
        action: "Contattaci su WhatsApp",
        message: (orderId) => `Ciao! Ho ricevuto questa email e voglio confermare che sia legittima. Ordine: ${orderId}.`,
    },
};

const unsubscribeTexts: Record<SupportedLocale, { text: string; action: string }> = {
    en: { text: "Don't want to receive these emails?", action: "Unsubscribe" },
    pt: { text: "Não deseja mais receber estes emails?", action: "Descadastrar" },
    es: { text: "¿No desea recibir más estos correos?", action: "Cancelar suscripción" },
    fr: { text: "Vous ne souhaitez plus recevoir ces emails ?", action: "Se désabonner" },
    it: { text: "Non vuoi più ricevere queste email?", action: "Annulla iscrizione" },
};

const addressTexts: Record<SupportedLocale, string> = {
    en: "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil",
    pt: "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil",
    es: "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil",
    fr: "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Brésil",
    it: "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile",
};

// ============= ORDER SUMMARY TRANSLATIONS =============

const orderSummaryTitles: Record<SupportedLocale, string> = {
    en: "Your order summary",
    pt: "Resumo do seu pedido",
    es: "Resumen de tu pedido",
    fr: "Résumé de votre commande",
    it: "Riepilogo del tuo ordine",
};

const summaryLabels: Record<SupportedLocale, { for: string; genre: string; vocals: string; qualities: string; memories: string; message: string }> = {
    en: { for: "For", genre: "Genre", vocals: "Voice", qualities: "What makes them special", memories: "Memories", message: "Your message" },
    pt: { for: "Para", genre: "Gênero", vocals: "Voz", qualities: "O que torna especial", memories: "Memórias", message: "Sua mensagem" },
    es: { for: "Para", genre: "Género", vocals: "Voz", qualities: "Lo que lo hace especial", memories: "Recuerdos", message: "Tu mensaje" },
    fr: { for: "Pour", genre: "Genre", vocals: "Voix", qualities: "Ce qui le rend spécial", memories: "Souvenirs", message: "Votre message" },
    it: { for: "Per", genre: "Genere", vocals: "Voce", qualities: "Cosa lo rende speciale", memories: "Ricordi", message: "Il tuo messaggio" },
};

const recipientTypeLabels: Record<SupportedLocale, Record<string, string>> = {
    en: {
        husband: "husband",
        wife: "wife",
        boyfriend: "boyfriend",
        girlfriend: "girlfriend",
        children: "children",
        father: "father",
        mother: "mother",
        sibling: "sibling",
        grandparent: "grandparent",
        friend: "friend",
        myself: "myself",
        other: "other",
    },
    pt: {
        husband: "marido",
        wife: "esposa",
        boyfriend: "namorado",
        girlfriend: "namorada",
        children: "filhos",
        father: "pai",
        mother: "mãe",
        sibling: "irmão(ã)",
        grandparent: "avô/avó",
        friend: "amigo(a)",
        myself: "eu mesmo",
        other: "outro",
    },
    es: {
        husband: "esposo",
        wife: "esposa",
        boyfriend: "novio",
        girlfriend: "novia",
        children: "hijos",
        father: "padre",
        mother: "madre",
        sibling: "hermano(a)",
        grandparent: "abuelo(a)",
        friend: "amigo(a)",
        myself: "yo mismo",
        other: "otro",
    },
    fr: {
        husband: "mari",
        wife: "femme",
        boyfriend: "petit ami",
        girlfriend: "petite amie",
        children: "enfants",
        father: "père",
        mother: "mère",
        sibling: "frère/sœur",
        grandparent: "grand-parent",
        friend: "ami(e)",
        myself: "moi-même",
        other: "autre",
    },
    it: {
        husband: "marito",
        wife: "moglie",
        boyfriend: "fidanzato",
        girlfriend: "fidanzata",
        children: "figli",
        father: "padre",
        mother: "madre",
        sibling: "fratello/sorella",
        grandparent: "nonno/nonna",
        friend: "amico(a)",
        myself: "me stesso",
        other: "altro",
    },
};

const vocalTypeLabels: Record<SupportedLocale, Record<string, string>> = {
    en: { female: "Female Voice", male: "Male Voice", either: "No Preference" },
    pt: { female: "Voz Feminina", male: "Voz Masculina", either: "Sem Preferência" },
    es: { female: "Voz Femenina", male: "Voz Masculina", either: "Sin Preferencia" },
    fr: { female: "Voix féminine", male: "Voix masculine", either: "Pas de préférence" },
    it: { female: "Voce femminile", male: "Voce maschile", either: "Nessuna preferenza" },
};

const complementMessages: Record<SupportedLocale, string> = {
    en: "Forgot something? No problem! After payment you can add more details.",
    pt: "Esqueceu algo? Sem problema! Após o pagamento você pode adicionar mais detalhes.",
    es: "¿Olvidaste algo? ¡Sin problema! Después del pago puedes agregar más detalles.",
    fr: "Vous avez oublié quelque chose ? Pas de problème ! Après le paiement, vous pourrez ajouter plus de détails.",
    it: "Hai dimenticato qualcosa? Nessun problema! Dopo il pagamento potrai aggiungere più dettagli.",
};

function getLocale(locale?: string | null): SupportedLocale {
    if (locale === "pt" || locale === "es" || locale === "fr" || locale === "it") {
        return locale;
    }
    return "en";
}

function buildOrderSummarySection(
    locale: SupportedLocale,
    data: {
        recipientName?: string | null;
        recipient?: string | null;
        genre?: string | null;
        vocals?: string | null;
        qualities?: string | null;
        memories?: string | null;
        message?: string | null;
    }
): { html: string; text: string } {
    const title = orderSummaryTitles[locale];
    const labels = summaryLabels[locale];
    const recipientTypes = recipientTypeLabels[locale];
    const vocalTypes = vocalTypeLabels[locale];
    const complementMessage = complementMessages[locale];

    // Build summary items
    const items: { label: string; value: string }[] = [];

    // For: [name] ([recipient type])
    if (data.recipientName) {
        const recipientType = data.recipient ? recipientTypes[data.recipient] ?? data.recipient : null;
        const forValue = recipientType
            ? `${data.recipientName} (${recipientType})`
            : data.recipientName;
        items.push({ label: labels.for, value: forValue });
    }

    // Genre (translated)
    if (data.genre) {
        const genreDisplay = GENRE_NAMES[data.genre]?.[locale] ?? data.genre;
        items.push({ label: labels.genre, value: genreDisplay });
    }

    // Vocals (translated)
    if (data.vocals) {
        const vocalsDisplay = vocalTypes[data.vocals] ?? data.vocals;
        items.push({ label: labels.vocals, value: vocalsDisplay });
    }

    // Qualities
    if (data.qualities) {
        items.push({ label: labels.qualities, value: data.qualities });
    }

    // Memories
    if (data.memories) {
        items.push({ label: labels.memories, value: data.memories });
    }

    // Message
    if (data.message) {
        items.push({ label: labels.message, value: data.message });
    }

    // If no items, return empty
    if (items.length === 0) {
        return { html: "", text: "" };
    }

    // Build HTML
    const htmlItems = items
        .map((item) => `<li style="margin:0 0 8px;color:#4a4a4a;"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</li>`)
        .join("");

    const html = `
                <div style="margin:0 0 20px;padding:16px 18px;background:#f0f7ff;border-radius:12px;border:1px solid #d0e3f7;">
                  <p style="margin:0 0 12px;color:#1d4ed8;font-size:14px;font-weight:600;">📋 ${escapeHtml(title)}</p>
                  <ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.5;">
                    ${htmlItems}
                  </ul>
                  <p style="margin:0;color:#6b7280;font-size:13px;font-style:italic;">💡 ${escapeHtml(complementMessage)}</p>
                </div>`;

    // Build text version
    const textItems = items.map((item) => `• ${item.label}: ${item.value}`).join("\n");
    const text = `📋 ${title}\n${textItems}\n\n💡 ${complementMessage}`;

    return { html, text };
}

export function buildAbandonedOrderEmail(stage: ReminderStage, data: AbandonedOrderEmailData) {
    const locale = getLocale(data.locale);
    const recipientName = data.recipientName?.trim() || defaultNames[locale];
    const formattedPrice = formatPrice(data.price, data.currency, locale);
    const price = formattedPrice;

    const template = COPY_BY_LOCALE[locale][stage]({
        recipientName,
        price,
    });

    if (data.priceMode === "startingFrom") {
        if (locale === "pt") {
            if (stage === "15m") {
                template.paragraphs[2] = `Em poucos minutos você conclui, e eu começo a compor algo único. Planos a partir de ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `É uma homenagem linda, emocional e feita sob medida. Planos a partir de ${formattedPrice}, com garantia total.`;
            } else {
                template.paragraphs[2] = `Basta finalizar o pedido e eu começo a criar. Planos a partir de ${formattedPrice}.`;
            }
        } else if (locale === "en") {
            if (stage === "15m") {
                template.paragraphs[2] = `It takes just a few minutes to complete, and I will start composing right away. Plans start at ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `It's a beautiful, emotional, custom-made gift. Plans start at ${formattedPrice}, with a full guarantee.`;
            } else {
                template.paragraphs[2] = `Just finish the order and I will start composing. Plans start at ${formattedPrice}.`;
            }
        } else if (locale === "es") {
            if (stage === "15m") {
                template.paragraphs[2] = `Solo toma unos minutos completar, y empezaré a componer de inmediato. Planes desde ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `Es un regalo hermoso, emocional y hecho a medida. Planes desde ${formattedPrice}, con garantía total.`;
            } else {
                template.paragraphs[2] = `Solo finaliza el pedido y empezaré a crear. Planes desde ${formattedPrice}.`;
            }
        } else if (locale === "fr") {
            if (stage === "15m") {
                template.paragraphs[2] = `Il ne faut que quelques minutes pour finaliser, et je commencerai à composer immédiatement. Offres à partir de ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `C'est un cadeau magnifique, émouvant et sur mesure. Offres à partir de ${formattedPrice}, avec garantie totale.`;
            } else {
                template.paragraphs[2] = `Il suffit de finaliser la commande et je commencerai à créer. Offres à partir de ${formattedPrice}.`;
            }
        } else if (locale === "it") {
            if (stage === "15m") {
                template.paragraphs[2] = `Bastano pochi minuti per completare, e inizierò a comporre subito. Piani a partire da ${formattedPrice}.`;
            } else if (stage === "3d") {
                template.paragraphs[2] = `È un regalo bellissimo, emozionante e fatto su misura. Piani a partire da ${formattedPrice}, con garanzia totale.`;
            } else {
                template.paragraphs[2] = `Basta completare l'ordine e inizierò a creare. Piani a partire da ${formattedPrice}.`;
            }
        }
    }

    const safeCheckoutUrl = escapeHtml(data.checkoutUrl);
    const brandName = brandNames[locale];
    const orderLabel = orderLabels[locale];
    const whatsappCopy = whatsappSupportCopy[locale];
    const whatsappMessage = whatsappCopy.message(data.orderId);
    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;
    const unsubscribeCopy = unsubscribeTexts[locale];
    const addressText = addressTexts[locale];
    const unsubscribeUrl = getUnsubscribeUrl(data.customerEmail, locale);

    const htmlParagraphs = template.paragraphs
        .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6;color:#2b2b2b;">${escapeHtml(paragraph)}</p>`)
        .join("");

    // Build order summary section with quiz data
    const orderSummary = buildOrderSummarySection(locale, {
        recipientName: data.recipientName,
        recipient: data.recipient,
        genre: data.genre,
        vocals: data.vocals,
        qualities: data.qualities,
        memories: data.memories,
        message: data.message,
    });

    const whatsappSection = `
                <div style="margin:0 0 20px;padding:16px 18px;background:#f8f5f0;border-radius:12px;border:1px solid #efe5d6;">
                  <p style="margin:0 0 10px;color:#6f6f6f;font-size:14px;line-height:1.5;">
                    ${escapeHtml(whatsappCopy.label)}
                  </p>
                  <a href="${escapeHtml(whatsappUrl)}" style="color:#25D366;text-decoration:none;font-weight:600;font-size:15px;">
                    ${escapeHtml(whatsappCopy.action)}
                  </a>
                </div>`;

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
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.3;color:#1d1d1d;">${escapeHtml(template.headline)}</h1>
                ${htmlParagraphs}
                ${orderSummary.html}
                <a href="${safeCheckoutUrl}" style="display:inline-block;margin:8px 0 20px;padding:14px 24px;background-color:#0A0E1A;color:#ffffff !important;text-decoration:none;border-radius:12px;font-weight:700;">${escapeHtml(template.cta)}</a>
                ${whatsappSection}
                <p style="margin:0;color:#6f6f6f;font-size:14px;line-height:1.5;">${escapeHtml(template.signoff)}</p>
                <p style="margin:12px 0 0;color:#9a9a9a;font-size:12px;line-height:1.5;">${escapeHtml(alreadyPaidMessages[locale])}</p>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:11px;">${escapeHtml(orderLabel)}: ${escapeHtml(data.orderId)}</p>
          <!-- Automated Email Notice -->
          <div style="background-color:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px;margin-top:16px;max-width:560px;">
            <p style="font-size:11px;color:#92400E;margin:0;font-weight:600;">
              ${escapeHtml(automatedEmailNotices[locale])}
            </p>
            <p style="font-size:11px;color:#A16207;margin:6px 0 0;">
              ${escapeHtml(whatsappSupportNotices[locale])} <a href="https://wa.me/5561995790193" style="color:#15803D;font-weight:bold;text-decoration:none;font-size:14px;">+55 61 99579-0193</a>
            </p>
          </div>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:10px;">${escapeHtml(addressText)}</p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">${escapeHtml(unsubscribeCopy.text)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9a9a9a;text-decoration:underline;">${escapeHtml(unsubscribeCopy.action)}</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const whatsappLine = `${whatsappCopy.label} ${whatsappUrl}`;

    const text = [
        template.headline,
        "",
        ...template.paragraphs,
        "",
        ...(orderSummary.text ? [orderSummary.text, ""] : []),
        `${template.cta}: ${data.checkoutUrl}`,
        "",
        whatsappLine,
        "",
        template.signoff,
        "",
        alreadyPaidMessages[locale],
        `${orderLabel}: ${data.orderId}`,
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
            es: `€${price}`,
            fr: `€${price}`,
            it: `€${price}`,
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
