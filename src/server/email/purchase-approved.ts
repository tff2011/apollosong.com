import { env } from "~/env";
import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

type OrderBump = {
    orderType: string; // "FAST_DELIVERY", "EXTRA_SONG"
    priceAtOrder: number;
    recipientName?: string;
};

type PurchaseApprovedEmailParams = {
    orderId: string;
    recipientName: string;
    customerEmail: string;
    locale: string;
    checkoutUrl: string;
    price: number;
    currency: string;
    childOrders?: OrderBump[];
    genre: string;
    hasCertificate?: boolean;
    hasLyrics?: boolean;
    orderType?: string; // "MAIN", "GENRE_VARIANT", etc.
};

export function buildPurchaseApprovedEmail({
    orderId,
    recipientName,
    customerEmail,
    locale,
    checkoutUrl,
    price,
    currency,
    childOrders = [],
    genre,
    hasCertificate = false,
    hasLyrics = false,
    orderType = "MAIN",
}: PurchaseApprovedEmailParams) {
    type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";
    const loc: SupportedLocale = locale === "pt" ? "pt" : locale === "es" ? "es" : locale === "fr" ? "fr" : locale === "it" ? "it" : "en";

    // Brand names by locale
    const brandNames: Record<SupportedLocale, string> = {
        en: "Apollo Song",
        pt: "Apollo Song",
        es: "Apollo Song",
        fr: "ChansonDivine",
        it: "ApolloSong",
    };

    const logoText = brandNames[loc];
    const logoUrl = "https://apollosong.com/images/logo.png"; // Keeping variable but ignoring for now if using text

    // Dual branding - "by Apollo Song" (empty for English)
    const subBrandByLocale: Record<SupportedLocale, string> = {
        pt: "por Apollo Song",
        en: "",
        es: "por Apollo Song",
        fr: "par Apollo Song",
        it: "da Apollo Song",
    };
    const subBrandText = subBrandByLocale[loc];

    // Sender
    const from = `"Apollo Song" <contact@apollosong.com>`;

    // Content Localization (no emojis in subject - spam trigger)
    const subjects: Record<SupportedLocale, string> = {
        en: `Your song for ${recipientName} is being created`,
        pt: `Sua música para ${recipientName} está sendo criada`,
        es: `Tu canción para ${recipientName} está siendo creada`,
        fr: `Votre chanson pour ${recipientName} est en cours de création`,
        it: `La tua canzone per ${recipientName} è in fase di creazione`,
    };

    // GENRE_VARIANT specific subjects (no emojis - spam trigger)
    const genreVariantSubjects: Record<SupportedLocale, (genreDisplay: string) => string> = {
        en: (genreDisplay) => `Your extra style (${genreDisplay}) for ${recipientName} is on the way`,
        pt: (genreDisplay) => `Seu estilo extra (${genreDisplay}) para ${recipientName} está a caminho`,
        es: (genreDisplay) => `Tu estilo extra (${genreDisplay}) para ${recipientName} está en camino`,
        fr: (genreDisplay) => `Votre style supplémentaire (${genreDisplay}) pour ${recipientName} est en route`,
        it: (genreDisplay) => `Il tuo stile extra (${genreDisplay}) per ${recipientName} è in arrivo`,
    };

    const streamingVipSubjects: Record<SupportedLocale, string> = {
        en: "Your VIP Distribution is confirmed",
        pt: "Sua Distribuição VIP está confirmada",
        es: "Tu Distribución VIP está confirmada",
        fr: "Votre Distribution VIP est confirmée",
        it: "La tua Distribuzione VIP è confermata",
    };

    const subject = subjects[loc];

    const titles: Record<SupportedLocale, string> = {
        en: "Payment Confirmed",
        pt: "Pagamento Confirmado",
        es: "Pago Confirmado",
        fr: "Paiement Confirmé",
        it: "Pagamento Confermato",
    };
    const title = titles[loc];

    const greetings: Record<SupportedLocale, string> = {
        en: "Hello!",
        pt: "Olá!",
        es: "¡Hola!",
        fr: "Bonjour !",
        it: "Ciao!",
    };
    const greeting = greetings[loc];

    const intros: Record<SupportedLocale, string> = {
        en: `We are delighted to have you with us. We have confirmed your payment, and our team has already started working with great care on the song dedicated to <strong>${recipientName}</strong>.`,
        pt: `É uma alegria ter você conosco. Confirmamos seu pagamento e nossa equipe já começou a trabalhar com todo carinho na canção dedicada a <strong>${recipientName}</strong>.`,
        es: `Es un placer tenerte con nosotros. Hemos confirmado tu pago y nuestro equipo ya ha comenzado a trabajar con mucho cariño en la canción dedicada a <strong>${recipientName}</strong>.`,
        fr: `Nous sommes ravis de vous avoir parmi nous. Nous avons confirmé votre paiement et notre équipe a déjà commencé à travailler avec grand soin sur la chanson dédiée à <strong>${recipientName}</strong>.`,
        it: `Siamo lieti di averti con noi. Abbiamo confermato il tuo pagamento e il nostro team ha già iniziato a lavorare con grande cura sulla canzone dedicata a <strong>${recipientName}</strong>.`,
    };

    // GENRE_VARIANT specific texts - will get genreDisplay after it's defined below
    const genreVariantIntros: Record<SupportedLocale, (genreDisplay: string) => string> = {
        en: (genreDisplay) => `We have confirmed your payment for an additional musical style. Our team will now create a new version of <strong>${recipientName}</strong>'s song in the <strong>${genreDisplay}</strong> style.`,
        pt: (genreDisplay) => `Confirmamos seu pagamento para um estilo musical adicional. Nossa equipe vai criar uma nova versão da música de <strong>${recipientName}</strong> no estilo <strong>${genreDisplay}</strong>.`,
        es: (genreDisplay) => `Hemos confirmado tu pago por un estilo musical adicional. Nuestro equipo creará una nueva versión de la canción de <strong>${recipientName}</strong> en el estilo <strong>${genreDisplay}</strong>.`,
        fr: (genreDisplay) => `Nous avons confirmé votre paiement pour un style musical supplémentaire. Notre équipe va créer une nouvelle version de la chanson de <strong>${recipientName}</strong> dans le style <strong>${genreDisplay}</strong>.`,
        it: (genreDisplay) => `Abbiamo confermato il tuo pagamento per uno stile musicale aggiuntivo. Il nostro team creerà una nuova versione della canzone di <strong>${recipientName}</strong> nello stile <strong>${genreDisplay}</strong>.`,
    };

    const streamingVipIntros: Record<SupportedLocale, (name: string) => string> = {
        en: (name) => `We have confirmed your VIP Distribution. We will publish <strong>${name}</strong>'s song on Spotify, Instagram, and TikTok and create a beautiful cover using the person's photo.`,
        pt: (name) => `Confirmamos sua Distribuição VIP. Vamos publicar a música de <strong>${name}</strong> no Spotify, Instagram e TikTok e criar uma capa linda com a foto da pessoa.`,
        es: (name) => `Hemos confirmado tu Distribución VIP. Publicaremos la canción de <strong>${name}</strong> en Spotify, Instagram y TikTok y crearemos una portada hermosa con la foto de la persona.`,
        fr: (name) => `Votre Distribution VIP est confirmée. Nous publierons la chanson de <strong>${name}</strong> sur Spotify, Instagram et TikTok et créerons une belle pochette avec la photo de la personne.`,
        it: (name) => `Abbiamo confermato la tua Distribuzione VIP. Pubblicheremo la canzone di <strong>${name}</strong> su Spotify, Instagram e TikTok e creeremo una bella copertina con la foto della persona.`,
    };

    const intro = intros[loc];

    const timelines: Record<SupportedLocale, string> = {
        en: "Soon, you will receive a unique masterpiece, created to touch the heart and immortalize this moment.",
        pt: "Em breve, você receberá uma obra única, feita para tocar o coração e eternizar esse momento.",
        es: "Pronto recibirás una obra única, hecha para tocar el corazón y eternizar este momento.",
        fr: "Bientôt, vous recevrez une œuvre unique, créée pour toucher le cœur et immortaliser ce moment.",
        it: "Presto riceverai un'opera unica, creata per toccare il cuore e immortalare questo momento.",
    };

    // GENRE_VARIANT specific timeline texts
    const genreVariantTimelines: Record<SupportedLocale, string> = {
        en: "This new version will have the same heartfelt message, now in a different musical style.",
        pt: "Essa nova versão terá a mesma mensagem especial, agora em um estilo musical diferente.",
        es: "Esta nueva versión tendrá el mismo mensaje especial, ahora en un estilo musical diferente.",
        fr: "Cette nouvelle version aura le même message sincère, dans un style musical différent.",
        it: "Questa nuova versione avrà lo stesso messaggio speciale, in uno stile musicale diverso.",
    };

    const streamingVipTimelines: Record<SupportedLocale, string> = {
        en: "Reply to this email with the best photo or send it via WhatsApp. We'll notify you as soon as the song goes live.",
        pt: "Responda este email com a melhor foto ou envie pelo WhatsApp. Avisaremos assim que a música estiver no ar.",
        es: "Responde a este email con la mejor foto o envíala por WhatsApp. Te avisaremos cuando la canción esté en línea.",
        fr: "Répondez à cet email avec la meilleure photo ou envoyez-la via WhatsApp. Nous vous préviendrons dès que la chanson sera en ligne.",
        it: "Rispondi a questa email con la migliore foto o inviala via WhatsApp. Ti avviseremo appena la canzone sarà online.",
    };

    const timeline = timelines[loc];

    const orderSummaryTitles: Record<SupportedLocale, string> = {
        en: "Order Summary",
        pt: "Resumo do Pedido",
        es: "Resumen del Pedido",
        fr: "Récapitulatif de la Commande",
        it: "Riepilogo dell'Ordine",
    };
    const orderSummaryTitle = orderSummaryTitles[loc];

    const mainItemLabels: Record<SupportedLocale, string> = {
        en: `Custom Song for ${recipientName}`,
        pt: `Música Personalizada para ${recipientName}`,
        es: `Canción Personalizada para ${recipientName}`,
        fr: `Chanson Personnalisée pour ${recipientName}`,
        it: `Canzone Personalizzata per ${recipientName}`,
    };

    // GENRE_VARIANT specific main item labels
    const genreVariantMainItemLabels: Record<SupportedLocale, (genreDisplay: string) => string> = {
        en: (genreDisplay) => `Extra Style (${genreDisplay}) for ${recipientName}`,
        pt: (genreDisplay) => `Estilo Extra (${genreDisplay}) para ${recipientName}`,
        es: (genreDisplay) => `Estilo Extra (${genreDisplay}) para ${recipientName}`,
        fr: (genreDisplay) => `Style Extra (${genreDisplay}) pour ${recipientName}`,
        it: (genreDisplay) => `Stile Extra (${genreDisplay}) per ${recipientName}`,
    };

    const streamingVipMainItemLabels: Record<SupportedLocale, (name: string) => string> = {
        en: (name) => `VIP Distribution for ${name}`,
        pt: (name) => `Distribuição VIP para ${name}`,
        es: (name) => `Distribución VIP para ${name}`,
        fr: (name) => `Distribution VIP pour ${name}`,
        it: (name) => `Distribuzione VIP per ${name}`,
    };

    const mainItemLabel = mainItemLabels[loc];

    const totalLabel = "Total";

    const trackButtons: Record<SupportedLocale, string> = {
        en: "Track Order",
        pt: "Acompanhar Pedido",
        es: "Seguir Pedido",
        fr: "Suivre la Commande",
        it: "Traccia l'Ordine",
    };
    const trackButton = trackButtons[loc];

    // CTA button texts - no ALL CAPS (spam trigger), clear and friendly
    const ctaButtonTexts: Record<SupportedLocale, string> = {
        en: "Listen to Your Songs and Track Your Order",
        pt: "Ouvir Suas Músicas e Acompanhar Pedido",
        es: "Escuchar Tus Canciones y Seguir Tu Pedido",
        fr: "Écouter Vos Chansons et Suivre Votre Commande",
        it: "Ascolta le Tue Canzoni e Segui il Tuo Ordine",
    };
    const ctaButtonText = ctaButtonTexts[loc];

    // URL intro texts
    const urlIntros: Record<SupportedLocale, string> = {
        en: "Access your order at:",
        pt: "Acesse seu pedido em:",
        es: "Accede a tu pedido en:",
        fr: "Accédez à votre commande sur :",
        it: "Accedi al tuo ordine su:",
    };
    const urlIntro = urlIntros[loc];

    // Attention banner texts
    const attentionBanners: Record<SupportedLocale, string> = {
        en: "YOUR SONG WILL BE DELIVERED AT THE LINK BELOW",
        pt: "SUA MÚSICA SERÁ ENTREGUE NO LINK ABAIXO",
        es: "TU CANCIÓN SERÁ ENTREGADA EN EL ENLACE ABAJO",
        fr: "VOTRE CHANSON SERA LIVRÉE AU LIEN CI-DESSOUS",
        it: "LA TUA CANZONE SARÀ CONSEGNATA AL LINK QUI SOTTO",
    };
    const attentionBanner = attentionBanners[loc];

    const saveThisLinkTexts: Record<SupportedLocale, string> = {
        en: "Save this link! This is where you will listen to and download your song.",
        pt: "Guarde este link! É aqui que você vai ouvir e baixar sua música.",
        es: "¡Guarda este enlace! Aquí es donde escucharás y descargarás tu canción.",
        fr: "Gardez ce lien ! C'est ici que vous écouterez et téléchargerez votre chanson.",
        it: "Salva questo link! Qui ascolterai e scaricherai la tua canzone.",
    };
    const saveThisLinkText = saveThisLinkTexts[loc];

    // Edit info instruction section
    const editInfoTitles: Record<SupportedLocale, string> = {
        en: "Did you forget any details? You can still edit!",
        pt: "Esqueceu algum detalhe? Você ainda pode editar!",
        es: "¿Olvidaste algún detalle? ¡Aún puedes editar!",
        fr: "Vous avez oublié un détail ? Vous pouvez encore modifier !",
        it: "Hai dimenticato un dettaglio? Puoi ancora modificare!",
    };
    const editInfoTitle = editInfoTitles[loc];

    const editInfoDescriptions: Record<SupportedLocale, string> = {
        en: `You can review and correct all the information you submitted (recipient name, memories, qualities, message, music style, etc.) directly from your tracking link. Just access the link above, make your changes, and click the <strong style="color: #EA580C;">orange "EDIT INFORMATION" button</strong> to save. This ensures your song is perfect before production begins.`,
        pt: `Você pode revisar e corrigir todas as informações que enviou (nome do homenageado, memórias, qualidades, mensagem, estilo musical, etc.) diretamente pelo link de acompanhamento. Basta acessar o link acima, fazer as alterações desejadas e clicar no <strong style="color: #EA580C;">botão laranja "EDITAR INFORMAÇÕES"</strong> para salvar. Assim garantimos que a música fique perfeita antes da produção começar.`,
        es: `Puedes revisar y corregir toda la información que enviaste (nombre del homenajeado, recuerdos, cualidades, mensaje, estilo musical, etc.) directamente desde tu enlace de seguimiento. Solo accede al enlace de arriba, haz tus cambios y haz clic en el <strong style="color: #EA580C;">botón naranja "EDITAR INFORMACIÓN"</strong> para guardar. Así garantizamos que la canción quede perfecta antes de que comience la producción.`,
        fr: `Vous pouvez vérifier et corriger toutes les informations que vous avez soumises (nom du destinataire, souvenirs, qualités, message, style musical, etc.) directement depuis votre lien de suivi. Accédez au lien ci-dessus, effectuez vos modifications et cliquez sur le <strong style="color: #EA580C;">bouton orange "MODIFIER LES INFORMATIONS"</strong> pour enregistrer. Cela garantit que votre chanson sera parfaite avant le début de la production.`,
        it: `Puoi rivedere e correggere tutte le informazioni che hai inviato (nome del destinatario, ricordi, qualità, messaggio, stile musicale, ecc.) direttamente dal tuo link di monitoraggio. Accedi al link sopra, apporta le modifiche e clicca sul <strong style="color: #EA580C;">pulsante arancione "MODIFICA INFORMAZIONI"</strong> per salvare. Così garantiamo che la canzone sia perfetta prima dell'inizio della produzione.`,
    };
    const editInfoDescription = editInfoDescriptions[loc];

    const footerTexts: Record<SupportedLocale, string> = {
        en: "Made with passion and love by Apollo Song.",
        pt: "Feito com paixão e amor por Apollo Song.",
        es: "Hecho con pasión y amor por Apollo Song.",
        fr: "Fait avec passion et amour par ChansonDivine.",
        it: "Fatto con passione e amore da ApolloSong.",
    };
    const footerText = footerTexts[loc];

    const websiteUrls: Record<SupportedLocale, string> = {
        en: "www.apollosong.com",
        pt: "www.apollosong.com/pt",
        es: "www.apollosong.com/es",
        fr: "www.apollosong.com/fr",
        it: "www.apollosong.com/it",
    };
    const websiteUrl = websiteUrls[loc];

    const supportLabels: Record<SupportedLocale, string> = {
        en: "Couldn't listen to your songs?",
        pt: "Não conseguiu ouvir suas músicas?",
        es: "¿No pudiste escuchar tus canciones?",
        fr: "Vous n'avez pas pu écouter vos chansons ?",
        it: "Non sei riuscito ad ascoltare le tue canzoni?",
    };
    const supportLabel = supportLabels[loc];

    const supportActions: Record<SupportedLocale, string> = {
        en: "Contact us via WhatsApp (do not reply to this email)",
        pt: "Fale conosco pelo WhatsApp (não responda este email)",
        es: "Contáctanos por WhatsApp (no respondas a este correo)",
        fr: "Contactez-nous via WhatsApp (ne répondez pas à cet email)",
        it: "Contattaci su WhatsApp (non rispondere a questa email)",
    };
    const supportAction = supportActions[loc];

    // WhatsApp pre-filled messages by locale (includes customer email for easy lookup)
    const whatsappMessages: Record<SupportedLocale, string> = {
        en: `Hello! I just purchased a custom song and I have a question. My email: ${customerEmail}`,
        pt: `Olá! Acabei de comprar uma música personalizada e tenho uma dúvida. Meu email: ${customerEmail}`,
        es: `¡Hola! Acabo de comprar una canción personalizada y tengo una pregunta. Mi email: ${customerEmail}`,
        fr: `Bonjour ! Je viens d'acheter une chanson personnalisée et j'ai une question. Mon email: ${customerEmail}`,
        it: `Ciao! Ho appena acquistato una canzone personalizzata e ho una domanda. La mia email: ${customerEmail}`,
    };
    const whatsappMessage = encodeURIComponent(whatsappMessages[loc]);

    // Preheader
    const preheaders: Record<SupportedLocale, string> = {
        en: `Your song for ${recipientName} is being created with love!`,
        pt: `Sua música para ${recipientName} está sendo criada com carinho!`,
        es: `¡Tu canción para ${recipientName} se está creando con amor!`,
        fr: `Votre chanson pour ${recipientName} est en cours de création !`,
        it: `La tua canzone per ${recipientName} è in fase di creazione!`,
    };
    const preheaderText = preheaders[loc];

    // Phone number for footer (required for CAN-SPAM compliance and trust)
    const phoneNumber = "+55 61 99579-0193";

    // Address and unsubscribe
    const addressTexts: Record<SupportedLocale, string> = {
        en: "CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil",
        pt: "CSG 3 LT 7, Brasília-DF, CEP 72035-503, Brasil",
        es: "CSG 3 LT 7, Brasilia-DF, CP 72035-503, Brasil",
        fr: "CSG 3 LT 7, Brasilia-DF, Code postal 72035-503, Brésil",
        it: "CSG 3 LT 7, Brasilia-DF, CAP 72035-503, Brasile",
    };
    const addressText = addressTexts[loc];

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
    const unsubscribeText = unsubscribeTexts[loc];
    const unsubscribeAction = unsubscribeActions[loc];
    const unsubscribeUrl = getUnsubscribeUrl(customerEmail, loc);

    // Automated email notice
    const automatedEmailNotices: Record<SupportedLocale, string> = {
        en: "This is an automated email. Do not reply.",
        pt: "Este é um email automático. Não responda.",
        es: "Este es un correo automático. No responda.",
        fr: "Ceci est un email automatique. Ne répondez pas.",
        it: "Questa è un'email automatica. Non rispondere.",
    };
    const automatedEmailNotice = automatedEmailNotices[loc];

    const whatsappSupportNotices: Record<SupportedLocale, string> = {
        en: "For support, contact us via WhatsApp:",
        pt: "Para suporte, fale conosco pelo WhatsApp:",
        es: "Para soporte, contáctenos por WhatsApp:",
        fr: "Pour toute assistance, contactez-nous via WhatsApp :",
        it: "Per assistenza, contattaci su WhatsApp:",
    };
    const whatsappSupportNotice = whatsappSupportNotices[loc];

    const genreLabels: Record<SupportedLocale, string> = {
        en: "Music Style",
        pt: "Estilo Musical",
        es: "Estilo Musical",
        fr: "Style Musical",
        it: "Stile Musicale",
    };
    const genreLabel = genreLabels[loc];

    // Genre translations
    const genreTranslations: Record<string, Record<SupportedLocale, string>> = {
        // Universal genres
        pop: { en: "Pop", pt: "Pop", es: "Pop", fr: "Pop", it: "Pop" },
        rock: { en: "Rock", pt: "Rock", es: "Rock", fr: "Rock", it: "Rock" },
        "jovem-guarda": { en: "Jovem Guarda", pt: "Jovem Guarda", es: "Jovem Guarda", fr: "Jovem Guarda", it: "Jovem Guarda" },
        "rock-classico": { en: "Classic Rock", pt: "Rock Clássico", es: "Rock Clásico", fr: "Rock Classique", it: "Rock Classico" },
        "pop-rock-brasileiro": { en: "Brazilian Pop Rock", pt: "Pop Rock Brasileiro", es: "Pop Rock Brasileño", fr: "Pop Rock Brésilien", it: "Pop Rock Brasiliano" },
        "heavy-metal": { en: "Heavy Metal", pt: "Heavy Metal", es: "Heavy Metal", fr: "Heavy Metal", it: "Heavy Metal" },
        eletronica: { en: "Electronic", pt: "Música Eletrônica", es: "Música Electrónica", fr: "Musique Électronique", it: "Musica Elettronica" },
        "eletronica-afro-house": { en: "Afro House", pt: "Afro House", es: "Afro House", fr: "Afro House", it: "Afro House" },
        "eletronica-progressive-house": { en: "Progressive House", pt: "Progressive House", es: "Progressive House", fr: "Progressive House", it: "Progressive House" },
        "eletronica-melodic-techno": { en: "Melodic Techno", pt: "Melodic Techno", es: "Melodic Techno", fr: "Melodic Techno", it: "Melodic Techno" },
        latina: { en: "Latin Music", pt: "Música Latina", es: "Música Latina", fr: "Musique Latine", it: "Musica Latina" },
        bolero: { en: "Bolero", pt: "Bolero", es: "Bolero", fr: "Bolero", it: "Bolero" },
        rnb: { en: "R&B", pt: "Black Music", es: "R&B / Soul", fr: "R&B / Soul", it: "R&B / Soul" },
        worship: { en: "Worship", pt: "Gospel", es: "Adoración", fr: "Louange", it: "Adorazione" },
        gospel: { en: "Worship", pt: "Gospel", es: "Adoración", fr: "Louange", it: "Adorazione" },
        hiphop: { en: "Hip-Hop", pt: "Rap", es: "Reggaetón / Hip-Hop", fr: "Rap Français", it: "Hip-Hop / Rap" },
        funk: { en: "Funk", pt: "Funk", es: "Funk", fr: "Funk", it: "Funk" },
        "funk-carioca": { en: "Funk Carioca", pt: "Funk Carioca", es: "Funk Carioca", fr: "Funk Carioca", it: "Funk Carioca" },
        "funk-paulista": { en: "Funk Paulista", pt: "Funk Paulista", es: "Funk Paulista", fr: "Funk Paulista", it: "Funk Paulista" },
        "funk-melody": { en: "Funk Melody", pt: "Funk Melody", es: "Funk Melody", fr: "Funk Melody", it: "Funk Melody" },
        brega: { en: "Brega", pt: "Brega", es: "Brega", fr: "Brega", it: "Brega" },
        "brega-romantico": { en: "Brega Romantico", pt: "Brega Romântico", es: "Brega Romántico", fr: "Brega Romantique", it: "Brega Romantico" },
        tecnobrega: { en: "Tecnobrega", pt: "Tecnobrega", es: "Tecnobrega", fr: "Tecnobrega", it: "Tecnobrega" },
        jazz: { en: "Jazz", pt: "Jazz", es: "Jazz", fr: "Jazz", it: "Jazz" },
        blues: { en: "American Blues", pt: "Blues Americano", es: "Blues Americano", fr: "Blues Américain", it: "Blues Americano" },
        "blues-melancholic": { en: "American Blues (Melancholic)", pt: "Blues Americano (Melancólico)", es: "Blues Americano (Melancólico)", fr: "Blues Américain (Mélancolique)", it: "Blues Americano (Malinconico)" },
        "blues-upbeat": { en: "American Blues (Upbeat)", pt: "Blues Americano (Alto Astral)", es: "Blues Americano (Animado)", fr: "Blues Américain (Enjoué)", it: "Blues Americano (Solare)" },
        country: { en: "Country", pt: "Sertanejo", es: "Country", fr: "Country", it: "Country" },
        reggae: { en: "Reggae", pt: "Reggae", es: "Reggae", fr: "Reggae", it: "Reggae" },
        lullaby: { en: "Lullaby", pt: "Infantil", es: "Canción de Cuna", fr: "Berceuse", it: "Ninna Nanna" },
        "lullaby-ninar": { en: "Lullaby (Soothing)", pt: "Canções de Ninar", es: "Canción de Cuna (Suave)", fr: "Berceuse (Douce)", it: "Ninna Nanna (Dolce)" },
        "lullaby-animada": { en: "Kids Song (Upbeat)", pt: "Infantil Animada", es: "Canción Infantil (Animada)", fr: "Chanson Enfant (Enjouée)", it: "Canzone per Bambini (Vivace)" },
        // Brazilian genres
        sertanejo: { en: "Sertanejo", pt: "Sertanejo", es: "Sertanejo", fr: "Sertanejo", it: "Sertanejo" },
        samba: { en: "Samba", pt: "Samba", es: "Samba", fr: "Samba", it: "Samba" },
        pagode: { en: "Pagode", pt: "Pagode", es: "Pagode", fr: "Pagode", it: "Pagode" },
        "pagode-de-mesa": { en: "Pagode de Mesa (Roots)", pt: "Pagode de Mesa (Raiz)", es: "Pagode de Mesa (Raiz)", fr: "Pagode de Mesa (Raiz)", it: "Pagode de Mesa (Raiz)" },
        "pagode-romantico": { en: "Pagode Romantico (90s)", pt: "Pagode Romântico (Anos 90)", es: "Pagode Romântico (Anos 90)", fr: "Pagode Romântico (Anos 90)", it: "Pagode Romântico (Anos 90)" },
        "pagode-universitario": { en: "Pagode Universitario / Novo Pagode", pt: "Pagode Universitário / Novo Pagode", es: "Pagode Universitário / Novo Pagode", fr: "Pagode Universitário / Novo Pagode", it: "Pagode Universitário / Novo Pagode" },
        forro: { en: "Forró", pt: "Forró", es: "Forró", fr: "Forró", it: "Forró" },
        "sertanejo-raiz": { en: "Sertanejo Raiz", pt: "Sertanejo Raiz", es: "Sertanejo Raiz", fr: "Sertanejo Raiz", it: "Sertanejo Raiz" },
        "sertanejo-universitario": { en: "Sertanejo Universitário", pt: "Sertanejo Universitário", es: "Sertanejo Universitário", fr: "Sertanejo Universitário", it: "Sertanejo Universitário" },
        "sertanejo-romantico": { en: "Sertanejo Romântico", pt: "Sertanejo Romântico", es: "Sertanejo Romântico", fr: "Sertanejo Romântico", it: "Sertanejo Romântico" },
        "forro-pe-de-serra": { en: "Forró Pé-de-Serra", pt: "Forró Pé-de-Serra", es: "Forró Pé-de-Serra", fr: "Forró Pé-de-Serra", it: "Forró Pé-de-Serra" },
        "forro-pe-de-serra-rapido": { en: "Forró Pé-de-Serra (Dançante)", pt: "Forró Pé-de-Serra (Dançante)", es: "Forró Pé-de-Serra (Bailable)", fr: "Forró Pé-de-Serra (Dansant)", it: "Forró Pé-de-Serra (Ballabile)" },
        "forro-pe-de-serra-lento": { en: "Forró Pé-de-Serra (Slow)", pt: "Forró Pé-de-Serra (Lento)", es: "Forró Pé-de-Serra (Lento)", fr: "Forró Pé-de-Serra (Lent)", it: "Forró Pé-de-Serra (Lento)" },
        "forro-universitario": { en: "Forró Universitário", pt: "Forró Universitário", es: "Forró Universitário", fr: "Forró Universitário", it: "Forró Universitário" },
        "forro-eletronico": { en: "Forró Eletrônico", pt: "Forró Eletrônico", es: "Forró Eletrônico", fr: "Forró Eletrônico", it: "Forró Eletrônico" },
        axe: { en: "Axé", pt: "Axé", es: "Axé", fr: "Axé", it: "Axé" },
        mpb: { en: "MPB", pt: "MPB", es: "MPB", fr: "MPB", it: "MPB" },
        "mpb-bossa-nova": { en: "MPB / Bossa Nova (Classic)", pt: "MPB / Bossa Nova (Clássica)", es: "MPB / Bossa Nova (Clásica)", fr: "MPB / Bossa Nova (Classique)", it: "MPB / Bossa Nova (Classica)" },
        "mpb-cancao-brasileira": { en: "Classic MPB / Brazilian Song", pt: "MPB Clássica / Canção Brasileira", es: "MPB Clásica / Canción Brasileña", fr: "MPB Classique / Chanson Brésilienne", it: "MPB Classica / Canzone Brasiliana" },
        "mpb-pop": { en: "Pop MPB", pt: "Pop MPB (Radiofônica)", es: "Pop MPB", fr: "Pop MPB", it: "Pop MPB" },
        "mpb-intimista": { en: "Intimate MPB / Brazilian Folk-Pop", pt: "MPB Intimista / Folk-Pop Brasileiro", es: "MPB Intimista / Folk-Pop Brasileño", fr: "MPB Intimiste / Folk-Pop Brésilien", it: "MPB Intimista / Folk-Pop Brasiliano" },
        bossa: { en: "Bossa Nova", pt: "Bossa Nova", es: "Bossa Nova", fr: "Bossa Nova", it: "Bossa Nova" },
        // Latin genres
        adoracion: { en: "Worship", pt: "Adoração", es: "Adoración", fr: "Adoration", it: "Adorazione" },
        salsa: { en: "Salsa", pt: "Salsa", es: "Salsa", fr: "Salsa", it: "Salsa" },
        merengue: { en: "Merengue", pt: "Merengue", es: "Merengue", fr: "Merengue", it: "Merengue" },
        bachata: { en: "Bachata", pt: "Bachata", es: "Bachata", fr: "Bachata", it: "Bachata" },
        cumbia: { en: "Cumbia", pt: "Cumbia", es: "Cumbia", fr: "Cumbia", it: "Cumbia" },
        ranchera: { en: "Ranchera", pt: "Ranchera", es: "Ranchera", fr: "Ranchera", it: "Ranchera" },
        balada: { en: "Romantic Ballad", pt: "Balada Romântica", es: "Balada Romántica", fr: "Ballade Romantique", it: "Ballata Romantica" },
        // French genres
        chanson: { en: "French Chanson", pt: "Chanson Francesa", es: "Chanson Francesa", fr: "Chanson Française", it: "Chanson Francese" },
        variete: { en: "French Variété", pt: "Variété Francesa", es: "Variété Francesa", fr: "Variété Française", it: "Variété Francese" },
        // Italian genres
        tarantella: { en: "Tarantella", pt: "Tarantela", es: "Tarantela", fr: "Tarentelle", it: "Tarantella" },
        napoletana: { en: "Neapolitan Song", pt: "Canção Napolitana", es: "Canción Napolitana", fr: "Chanson Napolitaine", it: "Canzone Napoletana" },
        lirico: { en: "Operatic", pt: "Lírico", es: "Lírico", fr: "Lyrique", it: "Lirico" },
    };
    const genreDisplay = genreTranslations[genre]?.[loc] || genre;

    // Override texts for GENRE_VARIANT and STREAMING_UPSELL orders
    const isGenreVariant = orderType === "GENRE_VARIANT";
    const isStreamingUpsell = orderType === "STREAMING_UPSELL";
    const shouldShowGenre = !isGenreVariant && !isStreamingUpsell;

    const finalSubject = isGenreVariant
        ? genreVariantSubjects[loc](genreDisplay)
        : isStreamingUpsell
        ? streamingVipSubjects[loc]
        : subject;
    const finalIntro = isGenreVariant
        ? genreVariantIntros[loc](genreDisplay)
        : isStreamingUpsell
        ? streamingVipIntros[loc](recipientName)
        : intro;
    const finalTimeline = isGenreVariant
        ? genreVariantTimelines[loc]
        : isStreamingUpsell
        ? streamingVipTimelines[loc]
        : timeline;
    const finalMainItemLabel = isGenreVariant
        ? genreVariantMainItemLabels[loc](genreDisplay)
        : isStreamingUpsell
        ? streamingVipMainItemLabels[loc](recipientName)
        : mainItemLabel;

    // Helper formatting
    const formatPrice = (amount: number) =>
        new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);

    // Build Order Items List
    const childTotal = childOrders.reduce((acc, item) => acc + item.priceAtOrder, 0) / 100;
    const mainPrice = price - childTotal;

    let itemsHtml = `
        <div style="border-bottom: 1px solid #E2E8F0; padding: 12px 0;">
            <div style="color: #060912; font-weight: 600; font-size: 16px;">
                ${finalMainItemLabel}
                <span style="float: right; color: #060912;">${formatPrice(mainPrice)}</span>
            </div>
            ${shouldShowGenre ? `<div style="color: #64748B; font-size: 14px; margin-top: 4px;">${genreLabel}: <span style="color: #334155;">${genreDisplay}</span></div>` : ''}
        </div>`;

    // Order item labels by locale
    const fastDeliveryLabels: Record<SupportedLocale, string> = {
        en: "Fast Delivery (24h)",
        pt: "Entrega Expressa (24h)",
        es: "Entrega Rápida (24h)",
        fr: "Livraison Express (24h)",
        it: "Consegna Express (24h)",
    };
    const extraSongLabels: Record<SupportedLocale, (name?: string) => string> = {
        en: (name) => `Extra Song${name ? ` for ${name}` : ""}`,
        pt: (name) => `Música Extra${name ? ` para ${name}` : ""}`,
        es: (name) => `Canción Extra${name ? ` para ${name}` : ""}`,
        fr: (name) => `Chanson Supplémentaire${name ? ` pour ${name}` : ""}`,
        it: (name) => `Canzone Extra${name ? ` per ${name}` : ""}`,
    };
    const genreVariantLabels: Record<SupportedLocale, string> = {
        en: "Genre Variant",
        pt: "Variação de Gênero",
        es: "Variante de Género",
        fr: "Variante de Genre",
        it: "Variante di Genere",
    };

    if (childOrders.length > 0) {
        childOrders.forEach(item => {
            let label = item.orderType;
            if (item.orderType === "FAST_DELIVERY") label = fastDeliveryLabels[loc];
            if (item.orderType === "EXTRA_SONG") label = extraSongLabels[loc](item.recipientName);
            if (item.orderType === "GENRE_VARIANT") label = genreVariantLabels[loc];

            itemsHtml += `
            <div style="border-bottom: 1px solid #E2E8F0; padding: 12px 0;">
                <span style="color: #475569; font-size: 15px;">${label}</span>
                <span style="float: right; color: #060912; font-size: 15px;">${formatPrice(item.priceAtOrder / 100)}</span>
            </div>`;
        });
    }

    // Certificate and Lyrics labels (defined outside if blocks for use in text template)
    const certificateLabels: Record<SupportedLocale, string> = {
        en: "Gift Experience",
        pt: "Experiência Presente",
        es: "Experiencia de Regalo",
        fr: "Expérience Cadeau",
        it: "Esperienza Regalo",
    };
    const lyricsLabels: Record<SupportedLocale, string> = {
        en: "Song Lyrics",
        pt: "Letra da Música",
        es: "Letra de la Canción",
        fr: "Paroles de la Chanson",
        it: "Testo della Canzone",
    };

    // Add Certificate of Authorship if purchased
    if (hasCertificate) {
        const certificateLabel = certificateLabels[loc];
        const certificatePrice = currency === "BRL" ? 19.90 : 19.90;
        itemsHtml += `
            <div style="border-bottom: 1px solid #E2E8F0; padding: 12px 0;">
                <span style="color: #475569; font-size: 15px;">🎖️ ${certificateLabel}</span>
                <span style="float: right; color: #060912; font-size: 15px;">${formatPrice(certificatePrice)}</span>
            </div>`;
    }

    // Add Song Lyrics if purchased
    if (hasLyrics) {
        const lyricsLabel = lyricsLabels[loc];
        const lyricsPrice = currency === "BRL" ? 9.90 : 9.90;
        itemsHtml += `
            <div style="border-bottom: 1px solid #E2E8F0; padding: 12px 0;">
                <span style="color: #475569; font-size: 15px;">📜 ${lyricsLabel}</span>
                <span style="float: right; color: #060912; font-size: 15px;">${formatPrice(lyricsPrice)}</span>
            </div>`;
    }

    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${loc}">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="format-detection" content="telephone=no, address=no, email=no" />
    <title>${finalSubject}</title>
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

                            <p style="font-size: 20px; line-height: 1.6; color: #334155; margin-bottom: 35px;">
                                ${finalIntro}
                            </p>

                            <!-- Attention Banner -->
                            <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 2px solid #F59E0B; text-align: center;">
                                <p style="font-size: 14px; color: #92400E; margin: 0 0 8px; font-weight: 800; letter-spacing: 1px;">
                                    ${attentionBanner}
                                </p>
                                <p style="font-size: 14px; color: #A16207; margin: 0;">
                                    ${saveThisLinkText}
                                </p>
                            </div>

                            <!-- CTA Section -->
                            <div style="background-color: #060912; border-radius: 12px; padding: 30px; margin-bottom: 35px; border: 2px solid #334155;">
                                <!-- Explicit URL -->
                                <p style="font-size: 16px; color: #94A3B8; margin: 0 0 12px; text-align: center; font-weight: 600;">
                                    ${urlIntro}
                                </p>
                                <p style="font-size: 14px; margin: 0 0 25px; text-align: center; word-break: break-all;">
                                    <a href="${checkoutUrl}" style="color: #A0845E; text-decoration: underline;">${checkoutUrl}</a>
                                </p>

                                <!-- Big CTA Button -->
                                <div style="text-align: center;">
                                    <a href="${checkoutUrl}" style="background-color: #22C55E; color: #FFFFFF !important; padding: 20px 30px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; display: inline-block; line-height: 1.4; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);">
                                        ${ctaButtonText}
                                    </a>
                                </div>
                            </div>

                            <!-- Edit Info Instruction -->
                            ${!isStreamingUpsell ? `
                            <div style="background-color: #FFF7ED; border: 2px solid #FB923C; border-radius: 12px; padding: 24px 28px; margin-bottom: 30px;">
                                <p style="font-size: 18px; color: #9A3412; margin: 0 0 12px; font-weight: 700;">
                                    ✏️ ${editInfoTitle}
                                </p>
                                <p style="font-size: 15px; line-height: 1.7; color: #78350F; margin: 0;">
                                    ${editInfoDescription}
                                </p>
                            </div>
                            ` : ''}

                            <p style="font-size: 20px; line-height: 1.6; color: #64748B; margin-bottom: 35px; font-style: italic; text-align: center; padding: 20px; background-color: #F8FAFC; border-radius: 8px;">
                                "${finalTimeline}"
                            </p>

                            <!-- Order Summary -->
                            <div style="background-color: #F8FAFC; border-radius: 12px; padding: 25px; margin-bottom: 35px; border: 1px solid #E2E8F0;">
                                <h3 style="color: #0A0E1A; font-size: 16px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 15px; border-bottom: 2px solid #E2E8F0; padding-bottom: 10px;">${orderSummaryTitle}</h3>

                                ${itemsHtml}

                                <div style="padding-top: 15px; margin-top: 5px; text-align: right;">
                                    <span style="color: #64748B; font-size: 16px; margin-right: 10px;">${totalLabel}:</span>
                                    <span style="color: #1DB954; font-size: 24px; font-weight: bold;">${formatPrice(price)}</span>
                                </div>
                            </div>

                            <!-- WhatsApp Support -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="text-align: center; padding: 25px; background-color: #F0FDF4; border-radius: 12px; border: 1px solid #BBF7D0;">
                                        <p style="font-size: 18px; color: #166534 !important; margin: 0 0 12px; font-weight: 600;">
                                            ${supportLabel}
                                        </p>
                                        <a href="https://wa.me/5561995790193?text=${whatsappMessage}" style="color: #25D366 !important; text-decoration: none; font-weight: bold; font-size: 18px;">
                                            📱 ${supportAction}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F8FAFC; padding: 30px; text-align: center; border-top: 1px solid #E2E8F0;">
                            <!-- Automated Email Notice -->
                            <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                <p style="font-size: 12px; color: #92400E; margin: 0; font-weight: 600;">
                                    ${automatedEmailNotice}
                                </p>
                                <p style="font-size: 12px; color: #A16207; margin: 6px 0 0;">
                                    ${whatsappSupportNotice} <a href="https://wa.me/5561995790193" style="color: #15803D; font-weight: bold; text-decoration: none;">+55 61 99579-0193</a>
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

    // Simple Text Layout
    const text = `
Apollo Song
${title}
----------------------------

${greeting}

${finalIntro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}

****************************
${attentionBanner}
${saveThisLinkText}
****************************

${urlIntro}
${checkoutUrl}

>>> ${ctaButtonText} <<<

${!isStreamingUpsell ? `✏️ ${editInfoTitle}
${editInfoDescription.replace(/<strong[^>]*>/g, "").replace(/<\/strong>/g, "")}
` : ''}
${finalTimeline}

----------------------------
${orderSummaryTitle}
${finalMainItemLabel} - ${formatPrice(mainPrice)}
${shouldShowGenre ? `${genreLabel}: ${genreDisplay}\n` : ''}
${childOrders.map(item => {
        let label = item.orderType;
        if (item.orderType === "FAST_DELIVERY") label = fastDeliveryLabels[loc];
        if (item.orderType === "EXTRA_SONG") label = extraSongLabels[loc](item.recipientName);
        if (item.orderType === "GENRE_VARIANT") label = genreVariantLabels[loc];
        return `${label} - ${formatPrice(item.priceAtOrder / 100)}`;
    }).join("\n")}
${hasCertificate ? `🎖️ ${certificateLabels[loc]} - ${formatPrice(currency === "BRL" ? 19.90 : 19.90)}\n` : ""}${hasLyrics ? `📜 ${lyricsLabels[loc]} - ${formatPrice(currency === "BRL" ? 9.90 : 9.90)}\n` : ""}
${totalLabel}: ${formatPrice(price)}
----------------------------

${supportLabel}: ${supportAction} -> https://wa.me/5561995790193?text=${whatsappMessage}

${footerText}
${websiteUrl}
${phoneNumber}
Order ID: ${orderId}
${addressText}

${unsubscribeText} -> ${unsubscribeUrl}
    `;

    const replyTo = "contact@apollosong.com";

    return {
        subject: finalSubject,
        html,
        text,
        from,
        headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "Reply-To": replyTo,
            "X-Priority": "3",
            "X-Mailer": "Apollo Song Mailer",
        }
    };
}
