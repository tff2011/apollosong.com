"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Check, Sparkles, MessageCircle, ExternalLink, RefreshCw, Headphones, X, Camera } from "lucide-react";
import { api } from "~/trpc/react";
import { AudioPlayer } from "~/components/audio-player";
import { cn } from "~/lib/utils";
import { PhoneInput } from "react-international-phone";
import { useSearchParams } from "next/navigation";
import "react-international-phone/style.css";

interface StreamingUpsellSuccessProps {
    orderId: string;
    email: string;
    recipientName: string;
    locale: string;
    currency: string;
    priceAtOrder: number;
    isPreview?: boolean;
    t: {
        title: string;
        subtitle: string;
        description: string;
        detailsTitle: string;
        detailsSongFor: string;
        detailsPlatforms: string;
        detailsPlatformsValue: string;
        detailsTotal: string;
        nextTitle: string;
        next1: string;
        next2: string;
        whatsAppCta: string;
        whatsAppMessage: string;
        backToOrder: string;
        chooseName?: string;
        chooseNameDesc?: string;
        chooseSong?: string;
        chooseSongDesc?: string;
        option1?: string;
        option2?: string;
        confirmChoices?: string;
        confirming?: string;
        generateNewNames?: string;
        generatingNames?: string;
        choicesConfirmed?: string;
        nowSendPhoto?: string;
    };
    common: (key: string) => string;
    trackOrderPath: string;
    formatPrice: (cents: number, currency: string) => string;
}

// Preview data for debug mode - using real sample audio URLs
const PREVIEW_SUGGESTIONS = [
    "Luz do Meu Caminho",
    "Canção para Maria",
    "Amor Eterno",
    "Melodia do Coração",
    "Nossa História",
];

const PREVIEW_PARENT_ORDER = {
    id: "preview-parent-123",
    // Using same audio but with query params to differentiate URLs
    songFileUrl: "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/upsell-spotify.mp3?v=1",
    songFileUrl2: "https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/upsell-spotify.mp3?v=2",
    lyrics: "Preview lyrics content...",
    recipientName: "Maria",
    genre: "worship",
};

const STREAMING_SONG_NAME_STOP_WORDS = new Set([
    "a", "o", "as", "os", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por", "pra", "pro", "com", "sem",
    "the", "an", "and", "of", "for", "to", "in", "on", "with", "from", "my", "your", "our",
    "del", "la", "las", "el", "los", "y", "mi", "tu", "su",
    "du", "des", "le", "les", "pour", "avec", "sans", "mon", "ma", "mes", "ton", "ta", "tes",
    "di", "della", "delle", "dello", "il", "lo", "gli", "per", "senza", "mio", "mia", "tuo", "tua", "uno",
]);

function normalizeSongNameForComparison(value: string | null | undefined): string {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function tokenizeSongNameForComparison(value: string | null | undefined): string[] {
    const normalized = normalizeSongNameForComparison(value)
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) return [];

    return normalized
        .split(" ")
        .filter((token) => token.length > 1 && !STREAMING_SONG_NAME_STOP_WORDS.has(token));
}

function calculateTokenJaccardSimilarity(a: string[], b: string[]): number {
    const aSet = new Set(a);
    const bSet = new Set(b);
    if (aSet.size === 0 || bSet.size === 0) return 0;

    let intersectionCount = 0;
    for (const token of aSet) {
        if (bSet.has(token)) intersectionCount += 1;
    }

    const unionCount = new Set([...aSet, ...bSet]).size;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function areSongNamesConflicting(a: string | null | undefined, b: string | null | undefined): boolean {
    const normalizedA = normalizeSongNameForComparison(a);
    const normalizedB = normalizeSongNameForComparison(b);

    if (!normalizedA || !normalizedB) return false;
    if (normalizedA === normalizedB) return true;
    if (normalizedA.replace(/\s+/g, "") === normalizedB.replace(/\s+/g, "")) return true;

    const tokenizedA = tokenizeSongNameForComparison(normalizedA);
    const tokenizedB = tokenizeSongNameForComparison(normalizedB);
    if (tokenizedA.length === 0 || tokenizedB.length === 0) return false;

    const tokenPhraseA = tokenizedA.join(" ");
    const tokenPhraseB = tokenizedB.join(" ");

    if (tokenPhraseA === tokenPhraseB) return true;

    const minTokenPhraseLength = Math.min(tokenPhraseA.length, tokenPhraseB.length);
    if (
        minTokenPhraseLength >= 12 &&
        (tokenPhraseA.includes(tokenPhraseB) || tokenPhraseB.includes(tokenPhraseA))
    ) {
        return true;
    }

    const tokenSimilarity = calculateTokenJaccardSimilarity(tokenizedA, tokenizedB);
    return tokenSimilarity >= 0.85;
}

export function StreamingUpsellSuccess({
    orderId,
    email,
    recipientName,
    locale,
    currency,
    priceAtOrder,
    isPreview = false,
    t,
    common,
    trackOrderPath,
    formatPrice,
}: StreamingUpsellSuccessProps) {
    const searchParams = useSearchParams();
    const previewRealCoverParam = searchParams.get("previewRealCover");
    const previewRealCover =
        isPreview &&
        previewRealCoverParam !== "0" &&
        previewRealCoverParam !== "false";
    const [step, setStep] = useState<"loading" | "song_selection" | "selecting" | "confirming" | "generating_cover" | "cover_review" | "done">("loading");
    const [songNames, setSongNames] = useState<string[]>([]);
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [selectedSongUrl, setSelectedSongUrl] = useState<string | null>(null);
    const [selectedCoverStyle, setSelectedCoverStyle] = useState<"realistic" | "cartoon" | null>(null);
    const [generatedCoverUrl, setGeneratedCoverUrl] = useState<string | null>(null);
    const [finalOutcome, setFinalOutcome] = useState<"approved" | "human_review" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSavingSongSelection, setIsSavingSongSelection] = useState(false);
    const [isSubmittingCoverDecision, setIsSubmittingCoverDecision] = useState(false);

    // New states for steps 3 and 4
    const [backupWhatsApp, setBackupWhatsApp] = useState<string>("");
    const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
    const [uploadedPhotoKey, setUploadedPhotoKey] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Refs for auto-scroll
    const whatsappRef = useRef<HTMLDivElement>(null);
    const photoUploadRef = useRef<HTMLDivElement>(null);
    const confirmButtonRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Ref to prevent duplicate uploads (drag + click simultaneously)
    const uploadInProgressRef = useRef(false);

    // Fetch streaming upsell data (parent order with songs)
    const { data: streamingData, isLoading: isLoadingData } = api.songOrder.getStreamingUpsellData.useQuery(
        { orderId },
        { enabled: !isPreview }
    );

    // Generate song names mutation
    const generateNames = api.songOrder.generateSongNamesForUser.useMutation({
        onSuccess: (data) => {
            const cleanedSuggestions: string[] = [];
            for (const rawName of data.suggestions) {
                const name = rawName.replace(/\s+/g, " ").trim();
                if (!name) continue;
                const isDuplicateSuggestion = cleanedSuggestions.some((existingName) =>
                    areSongNamesConflicting(name, existingName)
                );
                if (!isDuplicateSuggestion) {
                    cleanedSuggestions.push(name);
                }
            }
            setSongNames(cleanedSuggestions);
            setStep("selecting");
            setError(null);
        },
        onError: (err) => {
            console.error("Failed to generate names:", err);
            setError(err.message);
            setStep("selecting");
        },
    });

    // Save choices mutation
    const saveChoices = api.songOrder.saveStreamingChoices.useMutation();

    // Select preferred song mutation (for when user buys 1 song from 2 options)
    const selectPreferredSong = api.songOrder.selectPreferredSongForStreaming.useMutation();

    // Photo upload mutation
    const getUploadUrl = api.songOrder.getHonoreePhotoUploadUrl.useMutation();
    const getPreviewUploadUrl = api.songOrder.getStreamingPreviewPhotoUploadUrl.useMutation();
    const generateAutoCover = api.songOrder.generateAutoCoverForCustomer.useMutation();
    const generatePreviewCover = api.songOrder.generateStreamingPreviewCover.useMutation();
    const submitCoverDecision = api.songOrder.submitAutoCoverDecision.useMutation();

    // Get default country based on locale
    const getDefaultCountry = () => {
        switch (locale) {
            case "pt": return "br";
            case "es": return "es";
            case "fr": return "fr";
            case "it": return "it";
            default: return "us";
        }
    };

    // Check if WhatsApp is valid (at least 10 digits after country code)
    const isWhatsAppValid = backupWhatsApp.replace(/\D/g, "").length >= 10;

    // Translations for steps 3 and 4
    const stepTranslations = {
        whatsappTitle: {
            pt: "WhatsApp para contato",
            en: "WhatsApp for contact",
            es: "WhatsApp de contacto",
            fr: "WhatsApp de contact",
            it: "WhatsApp di contatto",
        },
        whatsappDesc: {
            pt: "Precisamos de um número para entrar em contato sobre a capa",
            en: "We need a number to contact you about the cover art",
            es: "Necesitamos un número para contactarte sobre la portada",
            fr: "Nous avons besoin d'un numéro pour vous contacter au sujet de la couverture",
            it: "Abbiamo bisogno di un numero per contattarti riguardo la copertina",
        },
        whatsappError: {
            pt: "Por favor, insira um número válido com pelo menos 10 dígitos",
            en: "Please enter a valid number with at least 10 digits",
            es: "Por favor, ingresa un número válido con al menos 10 dígitos",
            fr: "Veuillez entrer un numéro valide avec au moins 10 chiffres",
            it: "Inserisci un numero valido con almeno 10 cifre",
        },
        photoTitle: {
            pt: "Foto do homenageado",
            en: "Photo of the honoree",
            es: "Foto del homenajeado",
            fr: "Photo de la personne honorée",
            it: "Foto della persona onorata",
        },
        photoDesc: {
            pt: "Envie uma foto para criarmos a capa da música. Basta 1 foto do rosto ou corpo inteiro.",
            en: "Send a photo so we can create the song cover. Just 1 photo of their face or full body.",
            es: "Envía una foto para crear la portada de la canción. Solo 1 foto del rostro o cuerpo completo.",
            fr: "Envoyez une photo pour créer la couverture de la chanson. Juste 1 photo du visage ou du corps entier.",
            it: "Invia una foto per creare la copertina della canzone. Solo 1 foto del viso o del corpo intero.",
        },
        photoSuccess: {
            pt: "Foto enviada com sucesso!",
            en: "Photo uploaded successfully!",
            es: "¡Foto subida con éxito!",
            fr: "Photo téléchargée avec succès !",
            it: "Foto caricata con successo!",
        },
        photoUploading: {
            pt: "Enviando foto...",
            en: "Uploading photo...",
            es: "Subiendo foto...",
            fr: "Téléchargement de la photo...",
            it: "Caricamento foto...",
        },
        photoDropzone: {
            pt: "Clique para enviar ou arraste",
            en: "Click to upload or drag",
            es: "Haz clic para subir o arrastra",
            fr: "Cliquez pour télécharger ou glissez",
            it: "Clicca per caricare o trascina",
        },
        photoNote: {
            pt: "Entraremos em contato no WhatsApp com a capa para aprovação antes de publicar.",
            en: "We'll contact you on WhatsApp with the cover for approval before publishing.",
            es: "Te contactaremos por WhatsApp con la portada para aprobación antes de publicar.",
            fr: "Nous vous contacterons sur WhatsApp avec la couverture pour approbation avant publication.",
            it: "Ti contatteremo su WhatsApp con la copertina per approvazione prima della pubblicazione.",
        },
        photoTip: {
            pt: "Dica: Envie uma foto agora para agilizar o processo!",
            en: "Tip: Upload a photo now to speed up the process!",
            es: "Consejo: ¡Sube una foto ahora para acelerar el proceso!",
            fr: "Conseil : Téléchargez une photo maintenant pour accélérer le processus !",
            it: "Suggerimento: Carica una foto ora per velocizzare il processo!",
        },
        errorInvalidType: {
            pt: "Por favor, envie uma imagem JPG, PNG ou WEBP",
            en: "Please upload a JPG, PNG, or WEBP image",
            es: "Por favor, sube una imagen JPG, PNG o WEBP",
            fr: "Veuillez télécharger une image JPG, PNG ou WEBP",
            it: "Carica un'immagine JPG, PNG o WEBP",
        },
        errorTooLarge: {
            pt: "A imagem deve ter no máximo 10MB",
            en: "Image must be less than 10MB",
            es: "La imagen debe ser menor a 10MB",
            fr: "L'image doit faire moins de 10 Mo",
            it: "L'immagine deve essere inferiore a 10 MB",
        },
        errorUpload: {
            pt: "Erro ao enviar foto. Tente novamente.",
            en: "Failed to upload photo. Please try again.",
            es: "Error al subir la foto. Inténtalo de nuevo.",
            fr: "Échec du téléchargement de la photo. Veuillez réessayer.",
            it: "Caricamento foto fallito. Riprova.",
        },
        // Song selection step translations
        chooseSongVersionTitle: {
            pt: "Qual versão você quer no Spotify?",
            en: "Which version do you want on Spotify?",
            es: "¿Cuál versión quieres en Spotify?",
            fr: "Quelle version voulez-vous sur Spotify?",
            it: "Quale versione vuoi su Spotify?",
        },
        chooseSongVersionDesc: {
            pt: "Ouça as duas opções e escolha sua favorita",
            en: "Listen to both options and choose your favorite",
            es: "Escucha las dos opciones y elige tu favorita",
            fr: "Écoutez les deux options et choisissez votre préférée",
            it: "Ascolta entrambe le opzioni e scegli la tua preferita",
        },
        confirmVersion: {
            pt: "Confirmar Versão",
            en: "Confirm Version",
            es: "Confirmar Versión",
            fr: "Confirmer la Version",
            it: "Conferma Versione",
        },
        confirmingVersion: {
            pt: "Confirmando...",
            en: "Confirming...",
            es: "Confirmando...",
            fr: "Confirmation...",
            it: "Confermando...",
        },
        option1: {
            pt: "Opção 1",
            en: "Option 1",
            es: "Opción 1",
            fr: "Option 1",
            it: "Opzione 1",
        },
        option2: {
            pt: "Opção 2",
            en: "Option 2",
            es: "Opción 2",
            fr: "Option 2",
            it: "Opzione 2",
        },
        coverStyleTitle: {
            pt: "Preferência do estilo da capa",
            en: "Cover style preference",
            es: "Preferencia del estilo de portada",
            fr: "Préférence du style de couverture",
            it: "Preferenza stile copertina",
        },
        coverStyleDesc: {
            pt: "Escolha como deseja a primeira versão automática da capa",
            en: "Choose how you want the first automatic cover version",
            es: "Elige cómo quieres la primera versión automática de la portada",
            fr: "Choisissez le style de la première version automatique de la couverture",
            it: "Scegli lo stile della prima versione automatica della copertina",
        },
        coverStyleRealistic: {
            pt: "Realista",
            en: "Realistic",
            es: "Realista",
            fr: "Réaliste",
            it: "Realistico",
        },
        coverStyleCartoon: {
            pt: "Desenhado / Animado",
            en: "Illustrated / Animated",
            es: "Dibujado / Animado",
            fr: "Illustré / Animé",
            it: "Disegnato / Animato",
        },
        coverGeneratingTitle: {
            pt: "Gerando sua capa automaticamente...",
            en: "Generating your cover automatically...",
            es: "Generando tu portada automáticamente...",
            fr: "Génération automatique de votre couverture...",
            it: "Generazione automatica della copertina...",
        },
        coverGeneratingDesc: {
            pt: "Estamos criando 1 versão da capa com o estilo escolhido. Aguarde um instante...",
            en: "We're creating one cover version using your selected style. Please wait a moment...",
            es: "Estamos creando 1 versión de portada con el estilo elegido. Espera un momento...",
            fr: "Nous créons 1 version de couverture avec le style choisi. Veuillez patienter un instant...",
            it: "Stiamo creando 1 versione della copertina con lo stile scelto. Attendi un momento...",
        },
        coverReviewTitle: {
            pt: "Sua capa para a música \"{songName}\" para as plataformas de streaming está pronta!",
            en: "Your cover for \"{songName}\" is ready for streaming platforms!",
            es: "¡Tu portada para \"{songName}\" está lista para plataformas de streaming!",
            fr: "Votre couverture pour \"{songName}\" est prête pour les plateformes de streaming !",
            it: "La tua copertina per \"{songName}\" è pronta per le piattaforme di streaming!",
        },
        coverReviewDesc: {
            pt: "Você gostou desta versão?",
            en: "Did you like this version?",
            es: "¿Te gustó esta versión?",
            fr: "Avez-vous aimé cette version ?",
            it: "Ti piace questa versione?",
        },
        coverApprove: {
            pt: "Aprovar, gostei",
            en: "Approve, I like it",
            es: "Aprobar, me gustó",
            fr: "Approuver, j'aime",
            it: "Approva, mi piace",
        },
        coverHumanReview: {
            pt: "Não gostei, solicitar revisão humana",
            en: "Didn't like it, request human review",
            es: "No me gustó, solicitar revisión humana",
            fr: "Je n'ai pas aimé, demander une révision humaine",
            it: "Non mi piace, richiedi revisione umana",
        },
        coverStyleRequired: {
            pt: "Selecione o estilo da capa para continuar",
            en: "Select a cover style to continue",
            es: "Selecciona un estilo de portada para continuar",
            fr: "Sélectionnez un style de couverture pour continuer",
            it: "Seleziona uno stile di copertina per continuare",
        },
        duplicateSongName: {
            pt: "Este nome de música já foi usado na outra música deste pedido. Escolha um nome diferente.",
            en: "This song name is already being used by the other song in this order. Please choose a different name.",
            es: "Este nombre ya se usa en la otra canción de este pedido. Elige un nombre diferente.",
            fr: "Ce nom est déjà utilisé pour l'autre chanson de cette commande. Choisissez un nom différent.",
            it: "Questo nome è già usato per l'altra canzone di questo ordine. Scegli un nome diverso.",
        },
        duplicateSongTag: {
            pt: "Já usado na outra música",
            en: "Already used by the other song",
            es: "Ya usado en la otra canción",
            fr: "Déjà utilisé par l'autre chanson",
            it: "Già usato dall'altra canzone",
        },
        coverFinalApprovedTitle: {
            pt: "Capa aprovada com sucesso!",
            en: "Cover approved successfully!",
            es: "¡Portada aprobada con éxito!",
            fr: "Couverture approuvée avec succès !",
            it: "Copertina approvata con successo!",
        },
        coverFinalApprovedDesc: {
            pt: "Perfeito. Seu pedido está pronto para publicarmos nas plataformas de streaming. Aguarde: quando publicarmos, entraremos em contato no WhatsApp.",
            en: "Perfect. Your order is ready for publishing on streaming platforms. Please wait: we'll contact you on WhatsApp once it's published.",
            es: "Perfecto. Tu pedido está listo para publicar en plataformas de streaming. Espera: te contactaremos por WhatsApp cuando esté publicado.",
            fr: "Parfait. Votre commande est prête à être publiée sur les plateformes de streaming. Veuillez patienter : nous vous contacterons sur WhatsApp une fois publiée.",
            it: "Perfetto. Il tuo ordine è pronto per la pubblicazione sulle piattaforme di streaming. Attendi: ti contatteremo su WhatsApp quando sarà pubblicato.",
        },
        coverFinalHumanTitle: {
            pt: "Revisão humana solicitada",
            en: "Human review requested",
            es: "Revisión humana solicitada",
            fr: "Révision humaine demandée",
            it: "Revisione umana richiesta",
        },
        coverFinalHumanDesc: {
            pt: "Nossa equipe vai te chamar no WhatsApp para ajustar a capa.",
            en: "Our team will contact you on WhatsApp to adjust the cover.",
            es: "Nuestro equipo te contactará por WhatsApp para ajustar la portada.",
            fr: "Notre équipe vous contactera sur WhatsApp pour ajuster la couverture.",
            it: "Il nostro team ti contatterà su WhatsApp per regolare la copertina.",
        },
        coverApprovedNextTitle: {
            pt: "Próximos passos",
            en: "Next steps",
            es: "Próximos pasos",
            fr: "Prochaines étapes",
            it: "Prossimi passi",
        },
        coverApprovedNext1: {
            pt: "Nossa equipe vai publicar sua música nas plataformas de streaming.",
            en: "Our team will publish your song on streaming platforms.",
            es: "Nuestro equipo publicará tu canción en las plataformas de streaming.",
            fr: "Notre équipe publiera votre chanson sur les plateformes de streaming.",
            it: "Il nostro team pubblicherà la tua canzone sulle piattaforme di streaming.",
        },
        coverApprovedNext2: {
            pt: "Assim que estiver publicada, entraremos em contato no WhatsApp.",
            en: "As soon as it's published, we'll contact you on WhatsApp.",
            es: "Apenas esté publicada, te contactaremos por WhatsApp.",
            fr: "Dès qu'elle sera publiée, nous vous contacterons sur WhatsApp.",
            it: "Non appena sarà pubblicata, ti contatteremo su WhatsApp.",
        },
        coverHumanNextTitle: {
            pt: "Próximos passos",
            en: "Next steps",
            es: "Próximos pasos",
            fr: "Prochaines étapes",
            it: "Prossimi passi",
        },
        coverHumanNext1: {
            pt: "Nossa equipe vai revisar sua capa manualmente.",
            en: "Our team will review your cover manually.",
            es: "Nuestro equipo revisará tu portada manualmente.",
            fr: "Notre équipe va réviser votre couverture manuellement.",
            it: "Il nostro team revisionerà manualmente la tua copertina.",
        },
        coverHumanNext2: {
            pt: "Entraremos em contato no WhatsApp com a nova versão para aprovação.",
            en: "We'll contact you on WhatsApp with the new version for approval.",
            es: "Te contactaremos por WhatsApp con la nueva versión para aprobación.",
            fr: "Nous vous contacterons sur WhatsApp avec la nouvelle version pour approbation.",
            it: "Ti contatteremo su WhatsApp con la nuova versione per l'approvazione.",
        },
    } as const;

    const tr = (key: keyof typeof stepTranslations): string => {
        const translations = stepTranslations[key];
        const localeKey = locale as keyof typeof translations;
        return translations[localeKey] ?? translations.en;
    };

    const previewSongsModeParam = searchParams.get("previewSongs");
    const previewSongsMode = previewSongsModeParam === "1" ? 1 : 2;
    const previewParentOrder = {
        ...PREVIEW_PARENT_ORDER,
        songFileUrl2: previewSongsMode === 1 ? null : PREVIEW_PARENT_ORDER.songFileUrl2,
    };

    // Get parent order data (preview or real)
    const parentOrder = isPreview ? previewParentOrder : streamingData?.parentOrder;
    const hasTwoSongs = !!(parentOrder?.songFileUrl && parentOrder?.songFileUrl2);

    // Check if user already made choices
    const existingChoices = streamingData?.order;
    const siblingOrders = streamingData?.siblingOrders ?? [];
    const siblingSongNames = siblingOrders
        .filter((sibling) => sibling.status !== "CANCELLED" && sibling.status !== "REFUNDED")
        .map((sibling) => sibling.streamingSongName)
        .filter((name): name is string => !!name?.trim());
    const isSongNameUsedBySibling = (name: string | null | undefined) => {
        return siblingSongNames.some((siblingName) => areSongNamesConflicting(name, siblingName));
    };
    const hasDuplicateSelectedName = isSongNameUsedBySibling(selectedName);
    const hasSavedBasics = !isPreview && !!existingChoices?.streamingSongName;
    const hasGeneratedCover = !isPreview && !!existingChoices?.streamingCoverUrl;
    const hasApprovedCover = !isPreview && !!existingChoices?.coverApproved;
    const hasHumanReviewRequested = !isPreview && !!existingChoices?.coverHumanReviewRequested;

    // Check if song selection is needed (user bought 1 song from 2 options)
    const needsSongSelection = hasTwoSongs && !existingChoices?.preferredSongForStreaming && !isPreview;

    // Song URL - may be null if user needs to select
    const preSelectedSongUrl = existingChoices?.preferredSongForStreaming ?? null;

    const inferCoverStyleFromKey = (key: string | null | undefined): "realistic" | "cartoon" | null => {
        if (!key) return null;
        if (key.includes("cartoon")) return "cartoon";
        if (key.includes("realistic")) return "realistic";
        return null;
    };

    // Determine which option label to show (1 or 2)
    const selectedOptionNumber = selectedSongUrl === parentOrder?.songFileUrl2 ? 2 : 1;
    const nextIncompleteOrder = siblingOrders.find(
        (sibling) => sibling.status !== "PENDING" && !sibling.streamingSongName
    );
    const bundleOrderIds = (() => {
        const orderIdsParam = searchParams.get("orderIds");
        if (!orderIdsParam) return [] as string[];
        const parsedIds = orderIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        return Array.from(new Set([orderId, ...parsedIds]));
    })();
    const remainingBundleOrderIds = bundleOrderIds.filter((id) => id !== orderId);
    const nextBundleOrderId = remainingBundleOrderIds[0] ?? null;
    const nextOrderLabel =
        locale === "pt"
            ? "Continuar com a 2a música"
            : locale === "es"
            ? "Continuar con la 2a canción"
            : locale === "fr"
            ? "Continuer avec la 2e chanson"
            : locale === "it"
            ? "Continua con la 2a canzone"
            : "Continue with the 2nd song";
    const nextBundleLabel =
        locale === "pt"
            ? "Continuar com a próxima música"
            : locale === "es"
            ? "Continuar con la próxima canción"
            : locale === "fr"
            ? "Continuer avec la prochaine chanson"
            : locale === "it"
            ? "Continua con la prossima canzone"
            : "Continue with the next song";
    const nextBundleHref = nextBundleOrderId
        ? (() => {
              const basePath = `/${locale}/order/${nextBundleOrderId}/success`;
              if (remainingBundleOrderIds.length <= 1) return basePath;
              return `${basePath}?orderIds=${encodeURIComponent(remainingBundleOrderIds.join(","))}`;
          })()
        : null;

    // Auto-trigger name generation when data is ready
    useEffect(() => {
        if (isPreview) {
            // Only trigger in loading state to prevent resets
            if (step !== "loading") return;

            const timer = setTimeout(() => {
                setSongNames(PREVIEW_SUGGESTIONS);
                // Pre-select the song URL in preview mode
                setSelectedSongUrl(PREVIEW_PARENT_ORDER.songFileUrl);
                setStep("selecting");
            }, 1500);
            return () => clearTimeout(timer);
        }

        if (!streamingData) {
            return;
        }

        if (existingChoices?.backupWhatsApp && !backupWhatsApp) {
            setBackupWhatsApp(existingChoices.backupWhatsApp);
        }
        if (existingChoices?.honoreePhotoUrl && !uploadedPhotoUrl) {
            setUploadedPhotoUrl(existingChoices.honoreePhotoUrl);
            setUploadedPhotoKey(existingChoices.honoreePhotoKey ?? null);
        }
        if (existingChoices?.streamingCoverKey && !selectedCoverStyle) {
            const inferredStyle = inferCoverStyleFromKey(existingChoices.streamingCoverKey);
            if (inferredStyle) setSelectedCoverStyle(inferredStyle);
        }

        if (hasSavedBasics) {
            setSelectedName(existingChoices?.streamingSongName ?? null);
            setSelectedSongUrl(existingChoices?.preferredSongForStreaming ?? null);
            if (existingChoices?.streamingSongName && songNames.length === 0) {
                setSongNames([existingChoices.streamingSongName]);
            }

            if (hasApprovedCover) {
                setFinalOutcome("approved");
                setStep("done");
                return;
            }

            if (hasHumanReviewRequested) {
                setFinalOutcome("human_review");
                setStep("done");
                return;
            }

            if (hasGeneratedCover && existingChoices?.streamingCoverUrl) {
                setGeneratedCoverUrl(existingChoices.streamingCoverUrl);
                setStep("cover_review");
                return;
            }
        }

        // Don't reset state if user has already advanced past loading
        // This prevents refetch from resetting the form and asking for name again
        if (step !== "loading" && step !== "song_selection") {
            return;
        }

        // If song selection is needed, go to song selection step first
        if (needsSongSelection && step === "loading" && streamingData) {
            setStep("song_selection");
            return;
        }

        // If choices are partially filled, return to selecting screen (without regenerating names)
        if (hasSavedBasics && step === "loading") {
            setStep("selecting");
            return;
        }

        // Set pre-selected song URL from the order (chosen at purchase time)
        if (preSelectedSongUrl && !selectedSongUrl) {
            setSelectedSongUrl(preSelectedSongUrl);
        }

        // If not 2 songs (or song already selected), proceed to name generation
        if (streamingData && parentOrder?.lyrics && step === "loading" && !generateNames.isPending) {
            // Set the song URL if there's only one song
            if (!hasTwoSongs && parentOrder?.songFileUrl && !selectedSongUrl) {
                setSelectedSongUrl(parentOrder.songFileUrl);
            }
            generateNames.mutate({ orderId });
        }
    }, [
        isPreview,
        streamingData,
        existingChoices,
        backupWhatsApp,
        uploadedPhotoUrl,
        selectedCoverStyle,
        hasSavedBasics,
        hasGeneratedCover,
        hasApprovedCover,
        hasHumanReviewRequested,
        songNames.length,
        parentOrder?.lyrics,
        step,
        orderId,
        preSelectedSongUrl,
        selectedSongUrl,
        needsSongSelection,
        hasTwoSongs,
    ]);

    // Auto-scroll to WhatsApp input when name is selected
    // (Song is now pre-selected at purchase time, so we skip song selection step)
    useEffect(() => {
        if (selectedName && !hasDuplicateSelectedName && whatsappRef.current) {
            setTimeout(() => {
                whatsappRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    }, [selectedName, hasDuplicateSelectedName]);

    // Auto-scroll to photo upload when WhatsApp is valid
    useEffect(() => {
        if (isWhatsAppValid && photoUploadRef.current) {
            setTimeout(() => {
                photoUploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    }, [isWhatsAppValid]);

    // Auto-scroll to confirm button when all required fields are ready
    useEffect(() => {
        if (uploadedPhotoUrl && selectedCoverStyle && confirmButtonRef.current) {
            setTimeout(() => {
                confirmButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    }, [uploadedPhotoUrl, selectedCoverStyle]);

    const handleSelectName = (name: string) => {
        if (isSongNameUsedBySibling(name)) {
            setError(tr("duplicateSongName"));
            return;
        }
        setError(null);
        setSelectedName(name);
    };

    const handleConfirmSongSelection = async () => {
        if (!selectedSongUrl || isPreview) return;

        setIsSavingSongSelection(true);
        setError(null);

        try {
            await selectPreferredSong.mutateAsync({
                orderId,
                preferredSongUrl: selectedSongUrl,
            });

            // After saving, proceed to name generation
            generateNames.mutate({ orderId });
        } catch (err) {
            console.error("Failed to save song selection:", err);
            setError((err as Error).message);
            setIsSavingSongSelection(false);
        }
    };

    const handleConfirm = async () => {
        if (selectedName && hasDuplicateSelectedName) {
            setError(tr("duplicateSongName"));
            return;
        }

        if (!selectedName || !isWhatsAppValid || !uploadedPhotoUrl || !selectedCoverStyle) {
            if (!selectedCoverStyle) setError(tr("coverStyleRequired"));
            return;
        }

        setError(null);

        if (isPreview) {
            setStep("generating_cover");
            if (previewRealCover) {
                try {
                    const generated = await generatePreviewCover.mutateAsync({
                        photoUrl: uploadedPhotoUrl,
                        style: selectedCoverStyle,
                        songName: selectedName,
                        recipientName: recipientName || parentOrder?.recipientName || "Pessoa homenageada",
                        genre: parentOrder?.genre || "pop",
                        locale,
                    });
                    setGeneratedCoverUrl(generated.url);
                } catch (err) {
                    console.error("Failed to generate real preview cover:", err);
                    setError((err as Error).message || tr("errorUpload"));
                    setStep("selecting");
                    return;
                }
            } else {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                setGeneratedCoverUrl(uploadedPhotoUrl);
            }
            setStep("cover_review");
            return;
        }

        try {
            setStep("confirming");
            await saveChoices.mutateAsync({
                orderId,
                songName: selectedName,
                preferredSongUrl: selectedSongUrl ?? undefined,
                backupWhatsApp: backupWhatsApp,
                honoreePhotoUrl: uploadedPhotoUrl,
                honoreePhotoKey: uploadedPhotoKey ?? undefined,
            });

            setStep("generating_cover");
            const generated = await generateAutoCover.mutateAsync({
                orderId,
                style: selectedCoverStyle,
            });

            setGeneratedCoverUrl(generated.url);
            setStep("cover_review");
        } catch (err) {
            console.error("Failed to confirm streaming choices:", err);
            setError((err as Error).message || tr("errorUpload"));
            setStep("selecting");
        }
    };

    const handleCoverDecision = async (decision: "approve" | "human_review") => {
        if (!generatedCoverUrl) return;

        setIsSubmittingCoverDecision(true);
        setError(null);

        try {
            if (!isPreview) {
                await submitCoverDecision.mutateAsync({
                    orderId,
                    decision,
                });
            } else {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            setFinalOutcome(decision === "approve" ? "approved" : "human_review");
            setStep("done");
        } catch (err) {
            console.error("Failed to submit cover decision:", err);
            setError((err as Error).message || "Erro ao salvar decisão da capa");
            setStep("cover_review");
        } finally {
            setIsSubmittingCoverDecision(false);
        }
    };

    const handleRegenerateNames = () => {
        if (isPreview) {
            setSongNames([...PREVIEW_SUGGESTIONS].sort(() => Math.random() - 0.5));
            return;
        }

        setSelectedName(null);
        // Don't reset selectedSongUrl - it's pre-selected at purchase time
        generateNames.mutate({ orderId });
    };

    // Photo upload handlers
    const handleFileUpload = useCallback(async (file: File) => {
        // Prevent duplicate uploads (drag + click simultaneously)
        if (uploadInProgressRef.current || isUploadingPhoto) {
            console.log("Upload already in progress, ignoring duplicate call");
            return;
        }
        uploadInProgressRef.current = true;

        // Validate file type
        const validTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!validTypes.includes(file.type)) {
            setError(tr("errorInvalidType"));
            uploadInProgressRef.current = false;
            return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setError(tr("errorTooLarge"));
            uploadInProgressRef.current = false;
            return;
        }

        setIsUploadingPhoto(true);
        setError(null);

        try {
            if (isPreview && !previewRealCover) {
                // Simulate upload for preview
                await new Promise(resolve => setTimeout(resolve, 1500));
                const fakeUrl = URL.createObjectURL(file);
                setUploadedPhotoUrl(fakeUrl);
                setUploadedPhotoKey("preview-key");
                return;
            }

            // Get presigned upload URL
            const { uploadUrl, publicUrl, key } = isPreview
                ? await getPreviewUploadUrl.mutateAsync({
                    fileName: file.name,
                })
                : await getUploadUrl.mutateAsync({
                    orderId,
                    fileName: file.name,
                });

            // Upload file directly to R2
            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type,
                },
            });

            if (!uploadResponse.ok) {
                throw new Error("Upload failed");
            }

            setUploadedPhotoUrl(publicUrl);
            setUploadedPhotoKey(key);
        } catch (err) {
            console.error("Failed to upload photo:", err);
            setError(tr("errorUpload"));
        } finally {
            setIsUploadingPhoto(false);
            uploadInProgressRef.current = false;
        }
    }, [isPreview, previewRealCover, orderId, getUploadUrl, getPreviewUploadUrl, isUploadingPhoto]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileUpload(file);
        }
    }, [handleFileUpload]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileUpload(file);
        }
    }, [handleFileUpload]);

    const handleRemovePhoto = useCallback(() => {
        setUploadedPhotoUrl(null);
        setUploadedPhotoKey(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    // canConfirm: all required data for automatic cover generation
    const canConfirm = !!(selectedName && !hasDuplicateSelectedName && isWhatsAppValid && uploadedPhotoUrl && selectedCoverStyle);

    const whatsappMessage = t.whatsAppMessage.replace("{orderId}", orderId).replace("{email}", email);
    const whatsappUrl = `https://wa.me/5561995790193?text=${encodeURIComponent(whatsappMessage)}`;
    const coverTitleSongName = selectedName || recipientName || "Sua música";
    const coverReviewTitle = tr("coverReviewTitle").replace("{songName}", coverTitleSongName);
    const isHumanReviewFlow = finalOutcome === "human_review";
    const doneNextTitle = isHumanReviewFlow ? tr("coverHumanNextTitle") : tr("coverApprovedNextTitle");
    const doneNext1 = isHumanReviewFlow ? tr("coverHumanNext1") : tr("coverApprovedNext1");
    const doneNext2 = isHumanReviewFlow ? tr("coverHumanNext2") : tr("coverApprovedNext2");

    // Loading state
    if (step === "loading" || isLoadingData) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isPreview && (
                    <div className="bg-sky-400 text-sky-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - streaming vip success
                    </div>
                )}
                <Header common={common} />
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto text-center space-y-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center mx-auto">
                            <Loader2 className="w-12 h-12 text-sky-600 animate-spin" />
                        </div>
                        <h1 className="text-2xl font-serif font-bold text-charcoal">
                            {t.generatingNames ?? "Gerando sugestões de nome..."}
                        </h1>
                        <p className="text-charcoal/60">
                            {locale === "pt"
                                ? "Estamos criando opções especiais para sua música"
                                : "We're creating special name options for your song"}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Song selection state - choose which version to use for streaming
    if (step === "song_selection") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isPreview && (
                    <div className="bg-sky-400 text-sky-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - streaming vip success (song selection)
                    </div>
                )}
                <Header common={common} />
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        {/* Icon & Title */}
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center mx-auto shadow-lg">
                                <Headphones className="w-12 h-12 text-sky-600" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {tr("chooseSongVersionTitle")}
                            </h1>
                            <p className="text-xl sm:text-2xl text-sky-700 font-medium">
                                {tr("chooseSongVersionDesc")}
                            </p>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Song Selection */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <div className="space-y-4">
                                {/* Option 1 */}
                                <button
                                    onClick={() => setSelectedSongUrl(parentOrder?.songFileUrl ?? null)}
                                    disabled={isSavingSongSelection}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl border-2 transition-all",
                                        selectedSongUrl === parentOrder?.songFileUrl
                                            ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/30"
                                            : "border-charcoal/10 hover:border-sky-300 hover:bg-sky-50/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div
                                            className={cn(
                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                                selectedSongUrl === parentOrder?.songFileUrl
                                                    ? "border-sky-500 bg-sky-500"
                                                    : "border-charcoal/30"
                                            )}
                                        >
                                            {selectedSongUrl === parentOrder?.songFileUrl && (
                                                <Check className="w-4 h-4 text-white" />
                                            )}
                                        </div>
                                        <span className="font-bold text-lg">{tr("option1")}</span>
                                    </div>
                                    {parentOrder?.songFileUrl && (
                                        <AudioPlayer
                                            src={parentOrder.songFileUrl}
                                            variant="compact-light"
                                            showDownload={false}
                                        />
                                    )}
                                </button>

                                {/* Option 2 */}
                                <button
                                    onClick={() => setSelectedSongUrl(parentOrder?.songFileUrl2 ?? null)}
                                    disabled={isSavingSongSelection}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl border-2 transition-all",
                                        selectedSongUrl === parentOrder?.songFileUrl2
                                            ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/30"
                                            : "border-charcoal/10 hover:border-sky-300 hover:bg-sky-50/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div
                                            className={cn(
                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                                selectedSongUrl === parentOrder?.songFileUrl2
                                                    ? "border-sky-500 bg-sky-500"
                                                    : "border-charcoal/30"
                                            )}
                                        >
                                            {selectedSongUrl === parentOrder?.songFileUrl2 && (
                                                <Check className="w-4 h-4 text-white" />
                                            )}
                                        </div>
                                        <span className="font-bold text-lg">{tr("option2")}</span>
                                    </div>
                                    {parentOrder?.songFileUrl2 && (
                                        <AudioPlayer
                                            src={parentOrder.songFileUrl2}
                                            variant="compact-light"
                                            showDownload={false}
                                        />
                                    )}
                                </button>
                            </div>

                            {/* Confirm Button */}
                            <button
                                onClick={handleConfirmSongSelection}
                                disabled={!selectedSongUrl || isSavingSongSelection}
                                className={cn(
                                    "w-full mt-6 py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-2",
                                    selectedSongUrl && !isSavingSongSelection
                                        ? "bg-sky-600 text-white hover:bg-sky-700 shadow-lg"
                                        : "bg-charcoal/20 text-charcoal/50 cursor-not-allowed"
                                )}
                            >
                                {isSavingSongSelection ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        {tr("confirmingVersion")}
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        {tr("confirmVersion")}
                                    </>
                                )}
                            </button>
                        </div>

                        <p className="text-center text-xs text-charcoal/30">
                            Order ID: {orderId}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (step === "generating_cover") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isPreview && (
                    <div className="bg-sky-400 text-sky-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - streaming vip success (generating cover)
                    </div>
                )}
                <Header common={common} />
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto text-center space-y-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center mx-auto">
                            <Loader2 className="w-12 h-12 text-sky-600 animate-spin" />
                        </div>
                        <h1 className="text-2xl font-serif font-bold text-charcoal">
                            {tr("coverGeneratingTitle")}
                        </h1>
                        <p className="text-charcoal/60">
                            {tr("coverGeneratingDesc")}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (step === "cover_review") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isPreview && (
                    <div className="bg-sky-400 text-sky-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - streaming vip success (cover review)
                    </div>
                )}
                <Header common={common} />
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center mx-auto shadow-lg">
                                <Sparkles className="w-12 h-12 text-sky-600" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {coverReviewTitle}
                            </h1>
                            <p className="text-xl sm:text-2xl text-sky-700 font-medium">
                                {tr("coverReviewDesc")}
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                                {error}
                            </div>
                        )}

                        {generatedCoverUrl && (
                            <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                                <img
                                    src={generatedCoverUrl}
                                    alt="Generated cover"
                                    className="w-full rounded-2xl border border-charcoal/10"
                                />
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleCoverDecision("approve")}
                                disabled={isSubmittingCoverDecision}
                                className={cn(
                                    "flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all shadow-lg",
                                    !isSubmittingCoverDecision
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                        : "bg-charcoal/20 text-charcoal/50 cursor-not-allowed"
                                )}
                            >
                                {isSubmittingCoverDecision ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        {t.confirming ?? "Confirmando..."}
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        {tr("coverApprove")}
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => handleCoverDecision("human_review")}
                                disabled={isSubmittingCoverDecision}
                                className={cn(
                                    "flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all border-2",
                                    !isSubmittingCoverDecision
                                        ? "border-amber-300 text-amber-800 hover:bg-amber-50"
                                        : "border-charcoal/20 text-charcoal/50 cursor-not-allowed"
                                )}
                            >
                                {tr("coverHumanReview")}
                            </button>
                        </div>

                        <p className="text-center text-xs text-charcoal/30">
                            Order ID: {orderId}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Done state - show WhatsApp CTA
    if (step === "done") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-sky-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isPreview && (
                    <div className="bg-sky-400 text-sky-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - streaming vip success (done)
                    </div>
                )}
                <Header common={common} />
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        {/* Success Icon & Title */}
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center mx-auto shadow-lg">
                                <Check className="w-12 h-12 text-green-600" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {isHumanReviewFlow ? tr("coverFinalHumanTitle") : tr("coverFinalApprovedTitle")}
                            </h1>
                            <p className="text-xl sm:text-2xl text-sky-700 font-medium">
                                {isHumanReviewFlow ? tr("coverFinalHumanDesc") : tr("coverFinalApprovedDesc")}
                            </p>
                        </div>

                        {/* Confirmed Details */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-sky-500" />
                                {t.detailsTitle}
                            </h3>
                            <div className="space-y-3 text-charcoal/80">
                                <div className="flex justify-between">
                                    <span>{t.detailsSongFor}</span>
                                    <span className="font-semibold text-charcoal">{recipientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{locale === "pt" ? "Nome escolhido" : "Chosen name"}</span>
                                    <span className="font-semibold text-sky-700">&quot;{selectedName}&quot;</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{t.detailsPlatforms}</span>
                                    <span className="font-semibold text-charcoal">{t.detailsPlatformsValue}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{t.detailsTotal}</span>
                                    <span className="font-semibold text-charcoal">
                                        {formatPrice(priceAtOrder, currency)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Next steps */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-sky-500" />
                                {doneNextTitle}
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-start gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Check className="w-3.5 h-3.5 text-sky-600" />
                                    </div>
                                    {doneNext1}
                                </li>
                                <li className="flex items-start gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Check className="w-3.5 h-3.5 text-sky-600" />
                                    </div>
                                    {doneNext2}
                                </li>
                            </ul>
                        </div>

                        {/* Action */}
                        <div className="flex flex-col gap-3 pt-2">
                            {nextIncompleteOrder && (
                                <a
                                    href={`/${locale}/order/${nextIncompleteOrder.id}/success`}
                                    className="flex items-center justify-center gap-2 px-8 py-4 bg-sky-100 text-sky-900 rounded-xl font-semibold hover:bg-sky-200 transition-colors border border-sky-200"
                                >
                                    <Headphones className="w-5 h-5" />
                                    {nextOrderLabel}
                                </a>
                            )}
                            {!nextIncompleteOrder && nextBundleHref && (
                                <a
                                    href={nextBundleHref}
                                    className="flex items-center justify-center gap-2 px-8 py-4 bg-sky-100 text-sky-900 rounded-xl font-semibold hover:bg-sky-200 transition-colors border border-sky-200"
                                >
                                    <Headphones className="w-5 h-5" />
                                    {nextBundleLabel}
                                </a>
                            )}
                            {isHumanReviewFlow && (
                                <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-8 py-4 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 transition-colors shadow-lg"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                    {t.whatsAppCta}
                                </a>
                            )}
                            <a
                                href={trackOrderPath}
                                className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-charcoal/20 text-charcoal rounded-xl font-semibold hover:border-charcoal/40 transition-colors"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {t.backToOrder}
                            </a>
                        </div>

                        <p className="text-center text-xs text-charcoal/30">
                            Order ID: {orderId}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Selection state - show name selection AND song selection on same page
    return (
        <div className="min-h-screen bg-gradient-to-b from-sky-50 via-[#0A0E1A] to-[#0A0E1A]">
            {isPreview && (
                <div className="bg-sky-400 text-sky-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                    Debug mode - streaming vip success (selecting)
                </div>
            )}
            <Header common={common} />
            <div className="container mx-auto px-5 py-10">
                <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                    {/* Icon & Title */}
                    <div className="text-center space-y-4">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center mx-auto shadow-lg">
                            <Headphones className="w-12 h-12 text-sky-600" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                            {t.title}
                        </h1>
                        <p className="text-xl sm:text-2xl text-sky-700 font-medium">
                            {t.subtitle}
                        </p>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Step 1: Name Selection */}
                    <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                        <h3 className="font-bold text-charcoal text-xl mb-2 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-sky-500 text-white flex items-center justify-center text-sm font-bold">
                                1
                            </div>
                            {t.chooseName ?? "Escolha o nome da música"}
                        </h3>
                        <p className="text-charcoal/60 text-sm mb-4 ml-9">
                            {t.chooseNameDesc ?? "Selecione o nome que mais combina com sua homenagem"}
                        </p>

                        <div className="space-y-2">
                            {songNames.map((name, index) => {
                                const isUsedBySibling = isSongNameUsedBySibling(name);
                                return (
                                    <button
                                        key={`${name}-${index}`}
                                        onClick={() => handleSelectName(name)}
                                        disabled={isUsedBySibling}
                                        className={cn(
                                            "w-full text-left px-4 py-3 rounded-xl border-2 transition-all",
                                            selectedName === name && !isUsedBySibling
                                                ? "border-sky-500 bg-sky-50 text-sky-900"
                                                : isUsedBySibling
                                                    ? "border-red-200 bg-red-50 text-red-700 cursor-not-allowed"
                                                    : "border-charcoal/10 hover:border-sky-300 hover:bg-sky-50/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={cn(
                                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                                        selectedName === name && !isUsedBySibling
                                                            ? "border-sky-500 bg-sky-500"
                                                            : isUsedBySibling
                                                                ? "border-red-300 bg-red-100"
                                                                : "border-charcoal/30"
                                                    )}
                                                >
                                                    {selectedName === name && !isUsedBySibling && (
                                                        <Check className="w-3 h-3 text-white" />
                                                    )}
                                                </div>
                                                <span className="font-medium">{name}</span>
                                            </div>
                                            {isUsedBySibling && (
                                                <span className="text-xs font-semibold text-red-700">
                                                    {tr("duplicateSongTag")}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {selectedName && hasDuplicateSelectedName && (
                            <p className="mt-3 text-sm text-red-600">
                                {tr("duplicateSongName")}
                            </p>
                        )}

                        <button
                            onClick={handleRegenerateNames}
                            disabled={generateNames.isPending}
                            className="mt-4 flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 disabled:opacity-50"
                        >
                            <RefreshCw className={cn("w-4 h-4", generateNames.isPending && "animate-spin")} />
                            {t.generateNewNames ?? "Gerar novas sugestões"}
                        </button>
                    </div>

                    {/* Info card showing which song is being processed (if order has 2 songs) */}
                    {hasTwoSongs && selectedSongUrl && (
                        <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center flex-shrink-0">
                                    <Check className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm text-sky-800/70">
                                        {locale === "pt" ? "Música selecionada:" : locale === "es" ? "Canción seleccionada:" : locale === "fr" ? "Chanson sélectionnée:" : locale === "it" ? "Canzone selezionata:" : "Selected song:"}
                                    </p>
                                    <p className="font-semibold text-sky-900">
                                        {t.option1 && t.option2
                                            ? (selectedOptionNumber === 1 ? t.option1 : t.option2)
                                            : (selectedOptionNumber === 1 ? "Opção 1" : "Opção 2")}
                                    </p>
                                </div>
                            </div>
                            {selectedSongUrl && (
                                <div className="mt-3">
                                    <AudioPlayer
                                        src={selectedSongUrl}
                                        variant="compact-light"
                                        showDownload={false}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: WhatsApp for contact */}
                    <div
                        ref={whatsappRef}
                        className={cn(
                            "bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg transition-all duration-300",
                            selectedName && !hasDuplicateSelectedName ? "opacity-100" : "opacity-50 pointer-events-none"
                        )}
                    >
                        <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-2 flex items-center gap-2">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-base font-bold",
                                selectedName && !hasDuplicateSelectedName ? "bg-sky-500 text-white" : "bg-charcoal/20 text-charcoal/50"
                            )}>
                                2
                            </div>
                            {tr("whatsappTitle")}
                        </h3>
                        <p className="text-charcoal/60 text-base sm:text-lg mb-4 ml-10">
                            {tr("whatsappDesc")}
                        </p>

                        <div className="ml-10">
                            <PhoneInput
                                defaultCountry={getDefaultCountry()}
                                value={backupWhatsApp}
                                onChange={(phone) => setBackupWhatsApp(phone)}
                                inputClassName="!w-full !py-4 !text-lg sm:!text-xl !rounded-r-xl !border-charcoal/20"
                                countrySelectorStyleProps={{
                                    buttonClassName: "!py-4 !px-3 !rounded-l-xl !border-charcoal/20",
                                }}
                                className="w-full"
                            />
                            {backupWhatsApp && !isWhatsAppValid && (
                                <p className="text-red-500 text-base mt-3">
                                    {tr("whatsappError")}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Step 3: Photo upload */}
                    <div
                        ref={photoUploadRef}
                        className={cn(
                            "bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg transition-all duration-300",
                            isWhatsAppValid ? "opacity-100" : "opacity-50 pointer-events-none"
                        )}
                    >
                        <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-2 flex items-center gap-2">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-base font-bold",
                                isWhatsAppValid ? "bg-sky-500 text-white" : "bg-charcoal/20 text-charcoal/50"
                            )}>
                                3
                            </div>
                            {tr("photoTitle")}
                        </h3>
                        <p className="text-charcoal/60 text-base sm:text-lg mb-4 ml-10">
                            {tr("photoDesc")}
                        </p>

                        <div className="ml-10">
                            {uploadedPhotoUrl ? (
                                <div className="relative inline-block">
                                    <img
                                        src={uploadedPhotoUrl}
                                        alt="Uploaded photo"
                                        className="w-full max-w-sm rounded-xl border-2 border-sky-500"
                                    />
                                    <button
                                        onClick={handleRemovePhoto}
                                        className="absolute -top-3 -right-3 w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                    <p className="text-green-600 text-base sm:text-lg mt-3 flex items-center gap-2">
                                        <Check className="w-5 h-5" />
                                        {tr("photoSuccess")}
                                    </p>
                                </div>
                            ) : (
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onClick={() => !isUploadingPhoto && fileInputRef.current?.click()}
                                    className={cn(
                                        "border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-all",
                                        isDragging
                                            ? "border-sky-500 bg-sky-50"
                                            : "border-charcoal/20 hover:border-sky-400 hover:bg-sky-50/50",
                                        isUploadingPhoto && "cursor-wait opacity-70"
                                    )}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handleFileInputChange}
                                        className="hidden"
                                        disabled={isUploadingPhoto}
                                    />
                                    {isUploadingPhoto ? (
                                        <div className="flex flex-col items-center gap-4">
                                            <Loader2 className="w-14 h-14 text-sky-500 animate-spin" />
                                            <span className="text-charcoal/60 text-lg">
                                                {tr("photoUploading")}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center">
                                                <Camera className="w-10 h-10 text-sky-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-charcoal text-lg sm:text-xl">
                                                    {tr("photoDropzone")}
                                                </p>
                                                <p className="text-base text-charcoal/60 mt-2">
                                                    JPG, PNG, WEBP (max 10MB)
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <p className="text-charcoal/50 text-sm sm:text-base mt-4">
                                {tr("photoNote")}
                            </p>
                        </div>
                    </div>

                    {/* Step 4: Cover style selection */}
                    <div
                        className={cn(
                            "bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg transition-all duration-300",
                            uploadedPhotoUrl ? "opacity-100" : "opacity-50 pointer-events-none"
                        )}
                    >
                        <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-2 flex items-center gap-2">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-base font-bold",
                                uploadedPhotoUrl ? "bg-sky-500 text-white" : "bg-charcoal/20 text-charcoal/50"
                            )}>
                                4
                            </div>
                            {tr("coverStyleTitle")}
                        </h3>
                        <p className="text-charcoal/60 text-base sm:text-lg mb-4 ml-10">
                            {tr("coverStyleDesc")}
                        </p>

                        <div className="ml-10 space-y-3">
                            <button
                                onClick={() => setSelectedCoverStyle("realistic")}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-xl border-2 transition-all",
                                    selectedCoverStyle === "realistic"
                                        ? "border-sky-500 bg-sky-50 text-sky-900"
                                        : "border-charcoal/10 hover:border-sky-300 hover:bg-sky-50/50"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                            selectedCoverStyle === "realistic"
                                                ? "border-sky-500 bg-sky-500"
                                                : "border-charcoal/30"
                                        )}
                                    >
                                        {selectedCoverStyle === "realistic" && (
                                            <Check className="w-3 h-3 text-white" />
                                        )}
                                    </div>
                                    <span className="font-medium">{tr("coverStyleRealistic")}</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setSelectedCoverStyle("cartoon")}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-xl border-2 transition-all",
                                    selectedCoverStyle === "cartoon"
                                        ? "border-sky-500 bg-sky-50 text-sky-900"
                                        : "border-charcoal/10 hover:border-sky-300 hover:bg-sky-50/50"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                            selectedCoverStyle === "cartoon"
                                                ? "border-sky-500 bg-sky-500"
                                                : "border-charcoal/30"
                                        )}
                                    >
                                        {selectedCoverStyle === "cartoon" && (
                                            <Check className="w-3 h-3 text-white" />
                                        )}
                                    </div>
                                    <span className="font-medium">{tr("coverStyleCartoon")}</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Confirm Button */}
                    <div ref={confirmButtonRef} className="flex flex-col gap-3">
                        <button
                            onClick={handleConfirm}
                            disabled={!canConfirm || step === "confirming"}
                            className={cn(
                                "flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all shadow-lg",
                                canConfirm
                                    ? "bg-sky-600 text-white hover:bg-sky-700"
                                    : "bg-charcoal/20 text-charcoal/50 cursor-not-allowed"
                            )}
                        >
                            {step === "confirming" ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t.confirming ?? "Confirmando..."}
                                </>
                            ) : (
                                <>
                                    <Check className="w-5 h-5" />
                                    {t.confirmChoices ?? "Confirmar Escolhas"}
                                </>
                            )}
                        </button>
                        {uploadedPhotoUrl && !selectedCoverStyle && (
                            <p className="text-center text-amber-600 text-base sm:text-lg">
                                {tr("coverStyleRequired")}
                            </p>
                        )}
                        {selectedName && hasDuplicateSelectedName && (
                            <p className="text-center text-red-600 text-base sm:text-lg">
                                {tr("duplicateSongName")}
                            </p>
                        )}
                    </div>

                    <p className="text-center text-xs text-charcoal/30">
                        Order ID: {orderId}
                    </p>
                </div>
            </div>
        </div>
    );
}

function Header({ common }: { common: (key: string) => string }) {
    return (
        <div className="bg-white/80 backdrop-blur-sm border-b border-charcoal/10">
            <div className="container mx-auto px-5 py-4">
                <div className="max-w-xl mx-auto text-center flex flex-col items-center">
                    <span className="font-serif text-xl font-bold text-charcoal tracking-tight">
                        {common("brand")}
                    </span>
                    <span className="text-[0.65rem] font-semibold tracking-widest text-charcoal/60">
                        {common("brandByline")}
                    </span>
                </div>
            </div>
        </div>
    );
}
