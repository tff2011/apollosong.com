import { env } from "~/env";
import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

type GenreVariantInfo = {
    orderId: string;
    genre: string;
    trackOrderUrl: string;
};

type SongDeliveryEmailParams = {
    orderId: string;
    recipientName: string;
    locale: string;
    trackOrderUrl: string;
    songFileUrl?: string;
    songFileUrl2?: string;
    hasCertificate?: boolean;
    certificateToken?: string | null;
    hasLyrics?: boolean;
    genreVariants?: GenreVariantInfo[];
    customerEmail: string;
};

export function buildSongDeliveryEmail({
    orderId,
    recipientName,
    locale,
    trackOrderUrl,
    songFileUrl,
    songFileUrl2,
    hasCertificate = false,
    certificateToken = null,
    hasLyrics = false,
    genreVariants = [],
    customerEmail,
}: SongDeliveryEmailParams) {
    const isPt = locale === "pt";
    const isEs = locale === "es";
    const isFr = locale === "fr";
    const isIt = locale === "it";
    const hasTwoOptions = songFileUrl && songFileUrl2;

    const logoText = isPt ? "Apollo Song" : "Apollo Song";
    // Dual branding - "by Apollo Song" (empty for English)
    const subBrandText = isPt
        ? "por Apollo Song"
        : isEs
            ? "por Apollo Song"
            : isFr
                ? "par Apollo Song"
                : isIt
                    ? "da Apollo Song"
                    : ""; // Empty for English

    // Content Localization
    const subject = isEs
        ? `¡Tu canción para ${recipientName} está lista! 🎵`
        : isPt
            ? `Sua música para ${recipientName} está pronta! 🎵`
            : `Your song for ${recipientName} is ready! 🎵`;

    const title = isEs ? "¡Tu Canción Está Lista!" : isPt ? "Sua Música Está Pronta!" : "Your Song Is Ready!";
    const greeting = isEs ? "¡Hola!" : isPt ? "Olá!" : "Hello!";

    const intro = isEs
        ? `¡Tenemos noticias increíbles! La canción dedicada a <strong>${recipientName}</strong> está lista y esperándote.`
        : isPt
            ? `Temos uma notícia incrível! A canção dedicada a <strong>${recipientName}</strong> ficou pronta e está esperando por você.`
            : `We have amazing news! The song dedicated to <strong>${recipientName}</strong> is ready and waiting for you.`;

    const emotionalMessage = isEs
        ? "Este es un momento especial. Una melodía única fue creada con mucho cariño para tocar el corazón de quien amas."
        : isPt
            ? "Este é um momento especial. Uma melodia única foi criada com todo carinho para tocar o coração de quem você ama."
            : "This is a special moment. A unique melody was crafted with great care to touch the heart of someone you love.";

    // Two options messaging
    const twoOptionsMessage = isEs
        ? "¡Creamos <strong>dos versiones</strong> de tu canción para que elijas la que más te emocione!"
        : isPt
            ? "Criamos <strong>duas versões</strong> da sua música para você escolher a que mais te emociona!"
            : "We created <strong>two versions</strong> of your song so you can choose the one that moves you most!";

    // Sender Name Logic - localized for each language
    const senderName = isPt
        ? "Apollo Song (Apollo Song)"
        : isEs
            ? "Apollo Song (Apollo Song)"
            : isFr
                ? "Apollo Song (Apollo Song)"
                : isIt
                    ? "Apollo Song (Apollo Song)"
                    : "Apollo Song"; // EN only
    const from = `"Apollo Song" <contact@apollosong.com>`;

    const listenButtonText = isEs
        ? "Escuchar Mis Canciones"
        : isPt
            ? "Ouvir Minhas Músicas"
            : isFr
                ? "Écouter Mes Chansons"
                : isIt
                    ? "Ascolta le Mie Canzoni"
                    : "Listen to My Songs";

    // Instagram follow text
    const instagramFollowText = isEs
        ? "Síguenos en Instagram para ver más historias de amor"
        : isPt
            ? "Siga-nos no Instagram para ver mais histórias de amor"
            : isFr
                ? "Suivez-nous sur Instagram pour voir plus d'histoires d'amour"
                : isIt
                    ? "Seguici su Instagram per vedere altre storie d'amore"
                    : "Follow us on Instagram to see more love stories";
    const instagramHandle = "@apollosongbr";

    const sharingTitle = isEs ? "Consejos para Compartir" : isPt ? "Dicas para Compartilhar" : "Sharing Tips";
    const sharingTips = isEs
        ? [
            "Reproduce la canción en un momento especial, como una sorpresa durante una cena o celebración",
            "Comparte el enlace con familiares y amigos para que todos puedan escucharla",
            "Guarda el archivo MP3 para siempre tener este recuerdo musical contigo",
        ]
        : isPt
            ? [
                "Toque a música em um momento especial, como uma surpresa durante um jantar ou celebração",
                "Compartilhe o link com familiares e amigos para que todos possam ouvir",
                "Guarde o arquivo MP3 para sempre ter essa memória musical com você",
            ]
            : [
                "Play the song at a special moment, like a surprise during dinner or a celebration",
                "Share the link with family and friends so everyone can listen",
                "Save the MP3 file to always have this musical memory with you",
            ];

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

    const supportLabel = isEs
        ? "¿No pudiste escuchar tus canciones?"
        : isPt
            ? "Não conseguiu ouvir suas músicas?"
            : isFr
                ? "Vous n'avez pas pu écouter vos chansons ?"
                : isIt
                    ? "Non sei riuscito ad ascoltare le tue canzoni?"
                    : "Couldn't listen to your songs?";
    const supportAction = isEs
        ? "Contáctanos por WhatsApp (no respondas a este correo)"
        : isPt
            ? "Fale conosco pelo WhatsApp (não responda este email)"
            : isFr
                ? "Contactez-nous via WhatsApp (ne répondez pas à cet email)"
                : isIt
                    ? "Contattaci su WhatsApp (non rispondere a questa email)"
                    : "Contact us via WhatsApp (do not reply to this email)";

    // Automated email notice
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

    // Certificate section
    const certificateTitle = isEs ? "Experiencia de Regalo" : isPt ? "Experiência Presente" : isFr ? "Expérience Cadeau" : isIt ? "Esperienza Regalo" : "Gift Experience";
    const certificateDescription = isEs
        ? `¡Tu certificado exclusivo para ${recipientName} está listo! Comparte el enlace o escanea el código QR para una experiencia especial.`
        : isPt
            ? `Seu certificado exclusivo para ${recipientName} está pronto! Compartilhe o link ou escaneie o QR Code para uma experiência especial.`
            : `Your exclusive certificate for ${recipientName} is ready! Share the link or scan the QR Code for a special experience.`;
    const certificateButtonText = isEs ? "Ver Certificado" : isPt ? "Ver Certificado" : "View Certificate";

    // Lyrics section
    const lyricsTitle = isEs ? "Letra de la Canción" : isPt ? "Letra da Música" : "Song Lyrics";
    const lyricsDescription = isEs
        ? `¡La letra exclusiva de la canción para ${recipientName} está lista! Visualiza en línea o descarga como PDF.`
        : isPt
            ? `A letra exclusiva da música para ${recipientName} está pronta! Visualize online ou baixe em PDF.`
            : `The exclusive lyrics for ${recipientName}'s song are ready! View online or download as PDF.`;
    const lyricsButtonText = isEs ? "Ver Letra" : isPt ? "Ver Letra" : "View Lyrics";

    // Genre variant lyrics section
    const genreVariantLyricsTitle = (genre: string) =>
        isEs ? `Letra - Estilo Extra (${genre})` : isPt ? `Letra - Estilo Extra (${genre})` : `Lyrics - Extra Style (${genre})`;
    const genreVariantLyricsDescription = (genre: string) => isEs
        ? `¡La letra adaptada al estilo ${genre} está lista! Visualiza en línea o descarga como PDF.`
        : isPt
            ? `A letra adaptada no estilo ${genre} está pronta! Visualize online ou baixe em PDF.`
            : `The lyrics adapted to ${genre} style are ready! View online or download as PDF.`;

    // Genre translations
    const genreTranslations: Record<string, { pt: string; es: string; en: string }> = {
        pop: { en: "Pop", pt: "Pop", es: "Pop" },
        rock: { en: "Rock", pt: "Rock", es: "Rock" },
        "jovem-guarda": { en: "Jovem Guarda", pt: "Jovem Guarda", es: "Jovem Guarda" },
        "rock-classico": { en: "Classic Rock", pt: "Rock Clássico", es: "Rock Clásico" },
        "pop-rock-brasileiro": { en: "Brazilian Pop Rock", pt: "Pop Rock Brasileiro", es: "Pop Rock Brasileño" },
        "heavy-metal": { en: "Heavy Metal", pt: "Heavy Metal", es: "Heavy Metal" },
        eletronica: { en: "Electronic", pt: "Música Eletrônica", es: "Música Electrónica" },
        "eletronica-afro-house": { en: "Afro House", pt: "Afro House", es: "Afro House" },
        "eletronica-progressive-house": { en: "Progressive House", pt: "Progressive House", es: "Progressive House" },
        "eletronica-melodic-techno": { en: "Melodic Techno", pt: "Melodic Techno", es: "Melodic Techno" },
        rnb: { en: "R&B", pt: "Black Music", es: "R&B / Soul" },
        worship: { en: "Worship", pt: "Gospel", es: "Adoración" },
        gospel: { en: "Worship", pt: "Gospel", es: "Adoración" },
        hiphop: { en: "Hip-Hop", pt: "Rap", es: "Reggaetón / Hip-Hop" },
        funk: { en: "Funk", pt: "Funk", es: "Funk" },
        "funk-carioca": { en: "Funk Carioca", pt: "Funk Carioca", es: "Funk Carioca" },
        "funk-paulista": { en: "Funk Paulista", pt: "Funk Paulista", es: "Funk Paulista" },
        "funk-melody": { en: "Funk Melody", pt: "Funk Melody", es: "Funk Melody" },
        brega: { en: "Brega", pt: "Brega", es: "Brega" },
        "brega-romantico": { en: "Brega Romantico", pt: "Brega Romântico", es: "Brega Romántico" },
        tecnobrega: { en: "Tecnobrega", pt: "Tecnobrega", es: "Tecnobrega" },
        jazz: { en: "Jazz", pt: "Jazz", es: "Jazz" },
        blues: { en: "American Blues", pt: "Blues Americano", es: "Blues Americano" },
        "blues-melancholic": { en: "American Blues (Melancholic)", pt: "Blues Americano (Melancólico)", es: "Blues Americano (Melancólico)" },
        "blues-upbeat": { en: "American Blues (Upbeat)", pt: "Blues Americano (Alto Astral)", es: "Blues Americano (Animado)" },
        country: { en: "Country", pt: "Sertanejo", es: "Country" },
        reggae: { en: "Reggae", pt: "Reggae", es: "Reggae" },
        lullaby: { en: "Lullaby", pt: "Infantil", es: "Canción de Cuna" },
        "lullaby-ninar": { en: "Lullaby (Soothing)", pt: "Canções de Ninar", es: "Canción de Cuna (Suave)" },
        "lullaby-animada": { en: "Kids Song (Upbeat)", pt: "Infantil Animada", es: "Canción Infantil (Animada)" },
        latina: { en: "Latin Music", pt: "Música Latina", es: "Música Latina" },
        bolero: { en: "Bolero", pt: "Bolero", es: "Bolero" },
        sertanejo: { en: "Sertanejo", pt: "Sertanejo", es: "Sertanejo" },
        samba: { en: "Samba", pt: "Samba", es: "Samba" },
        pagode: { en: "Pagode", pt: "Pagode", es: "Pagode" },
        "pagode-de-mesa": { en: "Pagode de Mesa (Roots)", pt: "Pagode de Mesa (Raiz)", es: "Pagode de Mesa (Raiz)" },
        "pagode-romantico": { en: "Pagode Romantico (90s)", pt: "Pagode Romântico (Anos 90)", es: "Pagode Romântico (Anos 90)" },
        "pagode-universitario": { en: "Pagode Universitario / Novo Pagode", pt: "Pagode Universitário / Novo Pagode", es: "Pagode Universitário / Novo Pagode" },
        forro: { en: "Forró", pt: "Forró", es: "Forró" },
        "sertanejo-raiz": { en: "Sertanejo Raiz", pt: "Sertanejo Raiz", es: "Sertanejo Raiz" },
        "sertanejo-universitario": { en: "Sertanejo Universitário", pt: "Sertanejo Universitário", es: "Sertanejo Universitário" },
        "sertanejo-romantico": { en: "Sertanejo Romântico", pt: "Sertanejo Romântico", es: "Sertanejo Romântico" },
        "forro-pe-de-serra": { en: "Forró Pé-de-Serra", pt: "Forró Pé-de-Serra", es: "Forró Pé-de-Serra" },
        "forro-pe-de-serra-rapido": { en: "Forró Pé-de-Serra (Dançante)", pt: "Forró Pé-de-Serra (Dançante)", es: "Forró Pé-de-Serra (Bailable)" },
        "forro-pe-de-serra-lento": { en: "Forró Pé-de-Serra (Slow)", pt: "Forró Pé-de-Serra (Lento)", es: "Forró Pé-de-Serra (Lento)" },
        "forro-universitario": { en: "Forró Universitário", pt: "Forró Universitário", es: "Forró Universitário" },
        "forro-eletronico": { en: "Forró Eletrônico", pt: "Forró Eletrônico", es: "Forró Eletrônico" },
        axe: { en: "Axé", pt: "Axé", es: "Axé" },
        mpb: { en: "MPB", pt: "MPB", es: "MPB" },
        "mpb-bossa-nova": { en: "MPB / Bossa Nova (Classic)", pt: "MPB / Bossa Nova (Clássica)", es: "MPB / Bossa Nova (Clásica)" },
        "mpb-cancao-brasileira": { en: "Classic MPB / Brazilian Song", pt: "MPB Clássica / Canção Brasileira", es: "MPB Clásica / Canción Brasileña" },
        "mpb-pop": { en: "Pop MPB", pt: "Pop MPB (Radiofônica)", es: "Pop MPB" },
        "mpb-intimista": { en: "Intimate MPB / Brazilian Folk-Pop", pt: "MPB Intimista / Folk-Pop Brasileiro", es: "MPB Intimista / Folk-Pop Brasileño" },
        bossa: { en: "Bossa Nova", pt: "Bossa Nova", es: "Bossa Nova" },
        adoracion: { en: "Worship", pt: "Adoração", es: "Adoración" },
        salsa: { en: "Salsa", pt: "Salsa", es: "Salsa" },
        merengue: { en: "Merengue", pt: "Merengue", es: "Merengue" },
        bachata: { en: "Bachata", pt: "Bachata", es: "Bachata" },
        cumbia: { en: "Cumbia", pt: "Cumbia", es: "Cumbia" },
        ranchera: { en: "Ranchera", pt: "Ranchera", es: "Ranchera" },
        balada: { en: "Romantic Ballad", pt: "Balada Romântica", es: "Balada Romántica" },
    };
    const getGenreDisplay = (genre: string) => {
        const lang = isPt ? "pt" : isEs ? "es" : "en";
        return genreTranslations[genre]?.[lang] || genre;
    };

    const baseUrl = env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
    const certificateUrl = hasCertificate && certificateToken
        ? `${baseUrl}/${locale}/certificate/${certificateToken}`
        : null;
    const lyricsUrl = hasLyrics
        ? `${baseUrl}/${locale}/lyrics/${orderId}`
        : null;

    // Instagram URL
    const instagramUrl = "https://www.instagram.com/apollosongbr";

    // Preheader (hidden text for email preview)
    const preheaderText = isEs
        ? `¡La canción para ${recipientName} está lista! Haz clic para escuchar.`
        : isPt
            ? `A música para ${recipientName} está pronta! Clique para ouvir.`
            : isFr
                ? `La chanson pour ${recipientName} est prête ! Cliquez pour écouter.`
                : isIt
                    ? `La canzone per ${recipientName} è pronta! Clicca per ascoltare.`
                    : `The song for ${recipientName} is ready! Click to listen.`;

    // Address and unsubscribe
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
    <!-- Preheader text (hidden but shows in email preview) -->
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #0A0E1A;">
        ${preheaderText}
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>

    <!-- Container -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0A0E1A;">
        <tr>
            <td align="center" style="padding: 40px 20px;">

                <!-- Card -->
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden;">

                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #FFFFFF; padding: 40px 0 30px; border-bottom: 1px solid #E8DDD3;">
                           <!-- Text Logo to match Home -->
                           <span style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #F0EDE6; letter-spacing: -0.5px;">
                               ${logoText}
                           </span>
                           ${subBrandText ? `<br><span style="font-family: Arial, sans-serif; font-size: 12px; color: #78716C;">${subBrandText}</span>` : ""}
                        </td>
                    </tr>

                    <!-- Celebration Icon -->
                    <tr>
                        <td align="center" style="padding: 40px 0 20px; background-color: #FFFFFF;">
                            <span style="font-size: 56px;">${hasTwoOptions ? "🎵" : "🎵"}</span>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 0 50px 40px; background-color: #FFFFFF;">
                            <h1 style="color: #F0EDE6; font-size: 28px; margin: 0 0 20px; text-align: center; font-weight: 500; font-family: Georgia, serif;">${title}</h1>

                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 20px;">
                                ${greeting}
                            </p>

                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 20px;">
                                ${intro}
                            </p>

                            ${hasTwoOptions ? `
                            <p style="font-size: 16px; line-height: 1.7; color: #44403C; margin-bottom: 20px; text-align: center; background-color: #0A0E1A; padding: 16px; border-radius: 12px;">
                                ${twoOptionsMessage}
                            </p>
                            ` : ""}

                            <p style="font-size: 16px; line-height: 1.7; color: #4A4539; margin-bottom: 30px; font-style: italic; padding: 20px; background-color: #0A0E1A; border-radius: 12px; border-left: 4px solid #C9A84C;">
                                "${emotionalMessage}"
                            </p>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin-bottom: 40px;">
                                <a href="${trackOrderUrl}" style="background-color: #22c55e; color: #FFFFFF !important; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; display: inline-block;">
                                    ${listenButtonText}
                                </a>
                            </div>

                            <!-- Instagram Follow -->
                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="background-color: #E1306C; border-radius: 12px; padding: 20px; text-align: center;">
                                        <a href="${instagramUrl}" style="color: #FFFFFF !important; text-decoration: none; font-size: 14px; font-weight: 500;">
                                            📸 ${instagramFollowText}<br>
                                            <span style="font-weight: 700; font-size: 16px; color: #FFFFFF !important;">${instagramHandle}</span>
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Sharing Tips -->
                            <div style="background-color: #0A0E1A; border-radius: 12px; padding: 25px; margin-bottom: 20px;">
                                <h3 style="color: #F0EDE6; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 15px; border-bottom: 1px solid #E8DDD3; padding-bottom: 10px;">${sharingTitle}</h3>
                                <ul style="margin: 0; padding: 0 0 0 20px; color: #78716C; font-size: 14px; line-height: 1.8;">
                                    ${sharingTips.map(tip => `<li>${tip}</li>`).join("")}
                                </ul>
                            </div>

                            ${certificateUrl ? `
                            <!-- Certificate Section -->
                            <div style="background-color: #0A0E1A; border-radius: 12px; padding: 25px; margin-bottom: 20px; border: 2px solid #C9A84C; text-align: center;">
                                <span style="font-size: 48px;">🎖️</span>
                                <h3 style="color: #F0EDE6; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${certificateTitle}</h3>
                                <p style="color: #44403C; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
                                    ${certificateDescription}
                                </p>
                                <a href="${certificateUrl}" style="background-color: #C9A84C; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${certificateButtonText}
                                </a>
                            </div>
                            ` : ""}

                            ${lyricsUrl ? `
                            <!-- Lyrics Section -->
                            <div style="background-color: #0A0E1A; border-radius: 12px; padding: 25px; margin-bottom: 20px; border: 2px solid #9B7ED9; text-align: center;">
                                <span style="font-size: 48px;">📜</span>
                                <h3 style="color: #F0EDE6; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${lyricsTitle}</h3>
                                <p style="color: #44403C; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
                                    ${lyricsDescription}
                                </p>
                                <a href="${lyricsUrl}" style="background-color: #9B7ED9; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${lyricsButtonText}
                                </a>
                            </div>
                            ` : ""}

                            ${genreVariants.map(gv => {
                                const genreDisplay = getGenreDisplay(gv.genre);
                                return `
                            <!-- Genre Variant Lyrics Section - ${genreDisplay} -->
                            <div style="background-color: #0A0E1A; border-radius: 12px; padding: 25px; margin-bottom: 20px; border: 2px solid #7ED9B4; text-align: center;">
                                <span style="font-size: 48px;">📜</span>
                                <h3 style="color: #F0EDE6; font-size: 18px; margin: 15px 0 10px; font-family: Georgia, serif;">${genreVariantLyricsTitle(genreDisplay)}</h3>
                                <p style="color: #44403C; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
                                    ${genreVariantLyricsDescription(genreDisplay)}
                                </p>
                                <a href="${gv.trackOrderUrl}" style="background-color: #7ED9B4; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    ${lyricsButtonText}
                                </a>
                            </div>
                            `;
                            }).join("")}

                            <!-- Support -->
                            <p style="font-size: 14px; color: #9A9488; text-align: center; margin-top: 30px;">
                                ${supportLabel} <a href="https://wa.me/5561995790193${isPt ? "?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20meu%20pedido." : ""}" style="color: #C9A84C; text-decoration: none; font-weight: 500;">${supportAction}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
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

                <!-- Spacer -->
                <div style="height: 40px;"></div>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    // Simple Text Layout
    const twoOptionsTextMessage = hasTwoOptions
        ? (isEs ? "\n¡Creamos DOS VERSIONES de tu canción para que elijas!\n" : isPt ? "\nCriamos DUAS VERSÕES da sua música para você escolher!\n" : "\nWe created TWO VERSIONS of your song for you to choose!\n")
        : "";

    const text = `
${senderName}
${title}
----------------------------

${greeting}

${intro.replace(/<strong>/g, "").replace(/<\/strong>/g, "")}
${twoOptionsTextMessage}
"${emotionalMessage}"

----------------------------
${listenButtonText}: ${trackOrderUrl}
----------------------------

📸 ${instagramFollowText}
${instagramHandle}: ${instagramUrl}
----------------------------

${sharingTitle}:
${sharingTips.map(tip => `• ${tip}`).join("\n")}
${certificateUrl ? `
----------------------------
🎖️ ${certificateTitle}
${certificateDescription}
${certificateButtonText}: ${certificateUrl}
` : ""}${lyricsUrl ? `
----------------------------
📜 ${lyricsTitle}
${lyricsDescription}
${lyricsButtonText}: ${lyricsUrl}
` : ""}${genreVariants.map(gv => {
    const genreDisplay = getGenreDisplay(gv.genre);
    return `
----------------------------
📜 ${genreVariantLyricsTitle(genreDisplay)}
${genreVariantLyricsDescription(genreDisplay)}
${lyricsButtonText}: ${gv.trackOrderUrl}
`;
}).join("")}
----------------------------

${supportLabel}: ${supportAction} -> https://wa.me/5561995790193${isPt ? "?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20meu%20pedido." : ""}

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
