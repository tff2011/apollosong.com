"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "~/i18n/provider";
import { api } from "~/trpc/react";
import { CheckCircle2, Music, Clock, Mail, Loader2, AlertCircle, Home, CreditCard, Bookmark, Copy, Check, ExternalLink, MessageCircle, Phone, Heart, Sparkles, Pencil, X, Guitar, FileText, Headphones, ChevronDown, Mic2 } from "lucide-react";
import confetti from "canvas-confetti";
import { loadStripe } from "@stripe/stripe-js";
import { GENRE_NAMES, RELATIONSHIP_NAMES } from "~/lib/lyrics-generator";
import { genreTypes, recipientTypes, vocalTypes } from "~/lib/validations/song-order";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { StreamingUpsellSuccess } from "./streaming-upsell-success";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type SuccessPageProps = {
    orderId: string;
    preview?: boolean;
    previewType?: "MAIN" | "MUSICIAN_TIP" | "GENRE_VARIANT" | "LYRICS_UPSELL" | "STREAMING_UPSELL" | "KARAOKE_UPSELL";
};

type RecipientType = (typeof recipientTypes)[number];
type GenreType = (typeof genreTypes)[number];
type VocalType = (typeof vocalTypes)[number];

type StoryDraft = {
    recipientName: string;
    recipient: RecipientType;
    genre: GenreType;
    vocals: VocalType;
    qualities: string;
    memories: string;
    message: string;
};

type StorySource = {
    recipientName: string;
    recipient: string;
    genre: string;
    vocals?: string | null;
    qualities?: string | null;
    memories?: string | null;
    message?: string | null;
};

const buildStoryDraft = (source: StorySource): StoryDraft => ({
    recipientName: source.recipientName ?? "",
    recipient: (source.recipient ?? "other") as RecipientType,
    genre: (source.genre ?? "pop") as GenreType,
    vocals: (source.vocals ?? "either") as VocalType,
    qualities: source.qualities ?? "",
    memories: source.memories ?? "",
    message: source.message ?? "",
});

const PREVIEW_ORDER = {
    id: "preview-order-123",
    recipientName: "Maria",
    recipient: "wife",
    genre: "worship",
    vocals: "female",
    qualities: "Carinhosa, dedicada, sempre apoia a familia com fe.",
    memories: "Nos casamos em dois mil e dezenove e ela orou comigo em cada desafio.",
    message: "Quero que ela sinta o quanto e amada.",
    email: "preview@example.com",
    priceAtOrder: 19750, // R$99 + R$49 fast + R$49.50 extra song
    currency: "BRL" as const,
    locale: "pt" as const,
    planType: "express" as const,
    hasFastDelivery: true,
    orderType: "MAIN" as const,
    paymentMethod: "card",
    parentOrderId: null as string | null,
    childOrders: [
        { id: "child-1", orderType: "EXTRA_SONG", recipientName: "João" },
        { id: "child-2", orderType: "GENRE_VARIANT", recipientName: "Maria", genre: "samba" },
    ],
};

export function SuccessPage({ orderId, preview = false, previewType = "MAIN" }: SuccessPageProps) {
    const t = useTranslations("checkout");
    const common = useTranslations("common");
    const locale = useLocale();
    const utils = api.useUtils();
    const [hasConfetti, setHasConfetti] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<"loading" | "success" | "failed" | "requires_action">("loading");
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const [currentEmail, setCurrentEmail] = useState("");
    const [emailDraft, setEmailDraft] = useState("");
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [emailStatus, setEmailStatus] = useState<"idle" | "saved" | "error">("idle");
    const [emailError, setEmailError] = useState<string | null>(null);
    const [storyDraft, setStoryDraft] = useState<StoryDraft | null>(null);
    const [storySnapshot, setStorySnapshot] = useState<StoryDraft | null>(null);
    const [storyInitializedOrderId, setStoryInitializedOrderId] = useState<string | null>(null);
    const [isEditingStory, setIsEditingStory] = useState(false);
    const [storyStatus, setStoryStatus] = useState<"idle" | "saved" | "error">("idle");
    const [storyError, setStoryError] = useState<string | null>(null);

    // WhatsApp backup state
    const [backupPhone, setBackupPhone] = useState("");
    const [whatsAppSaved, setWhatsAppSaved] = useState(false);
    const [whatsAppError, setWhatsAppError] = useState(false);

    // WhatsApp backup mutation
    const updateBackupWhatsApp = api.songOrder.updateBackupWhatsApp.useMutation({
        onSuccess: () => {
            setWhatsAppSaved(true);
            setWhatsAppError(false);
        },
        onError: () => {
            setWhatsAppError(true);
            setWhatsAppSaved(false);
        },
    });

    const updateEmail = api.songOrder.updateEmail.useMutation({
        onSuccess: (data) => {
            setCurrentEmail(data.email);
            setEmailDraft(data.email);
            setIsEditingEmail(false);
            setEmailError(null);
            setEmailStatus("saved");
        },
        onError: () => {
            setEmailStatus("error");
            setEmailError(t("success.emailEdit.error"));
        },
    });

    const updateStoryDetails = api.songOrder.updateStoryDetails.useMutation({
        onSuccess: (data) => {
            const nextStory = buildStoryDraft(data);
            setStoryDraft(nextStory);
            setStorySnapshot(nextStory);
            setIsEditingStory(false);
            setStoryError(null);
            setStoryStatus("saved");
            utils.songOrder.getById.setData({ orderId }, (previous: any) =>
                previous ? { ...previous, ...data } : previous
            );
        },
        onError: () => {
            setStoryStatus("error");
            setStoryError(t("success.storyReview.error"));
        },
    });

    // Check payment intent status from URL params (for 3DS redirects)
    useEffect(() => {
        if (preview) {
            setPaymentStatus("success");
            return;
        }

        const checkPaymentStatus = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const paymentIntentClientSecret = urlParams.get("payment_intent_client_secret");
            const redirectStatus = urlParams.get("redirect_status");

            // If no payment_intent in URL, this might be a direct access or Pix payment
            // Check the order status instead
            if (!paymentIntentClientSecret) {
                // Will be handled by order status check below
                setPaymentStatus("success");
                return;
            }

            // Check redirect_status first (faster check)
            if (redirectStatus === "failed") {
                setPaymentStatus("failed");
                setPaymentError(t("paymentFailed.cardDeclined"));
                return;
            }

            // Verify with Stripe for more detailed status
            try {
                const stripe = await stripePromise;
                if (!stripe) {
                    setPaymentStatus("success"); // Fallback to order check
                    return;
                }

                const { paymentIntent, error } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);

                if (error) {
                    console.error("Error retrieving payment intent:", error);
                    setPaymentStatus("failed");
                    setPaymentError(error.message || t("paymentFailed.generic"));
                    return;
                }

                if (!paymentIntent) {
                    setPaymentStatus("failed");
                    setPaymentError(t("paymentFailed.generic"));
                    return;
                }

                switch (paymentIntent.status) {
                    case "succeeded":
                    case "processing": // Pix payments may be in processing state
                        setPaymentStatus("success");
                        break;
                    case "requires_payment_method":
                        setPaymentStatus("failed");
                        setPaymentError(t("paymentFailed.cardDeclined"));
                        break;
                    case "requires_action":
                        setPaymentStatus("requires_action");
                        setPaymentError(t("paymentFailed.actionRequired"));
                        break;
                    case "canceled":
                        setPaymentStatus("failed");
                        setPaymentError(t("paymentFailed.canceled"));
                        break;
                    default:
                        setPaymentStatus("failed");
                        setPaymentError(t("paymentFailed.generic"));
                }
            } catch (err) {
                console.error("Error checking payment status:", err);
                // Fallback to order status check
                setPaymentStatus("success");
            }
        };

        void checkPaymentStatus();
    }, [preview, t]);

    // Fetch order data (skip in preview mode)
    const { data: fetchedOrder, isLoading, error } = api.songOrder.getById.useQuery(
        { orderId },
        { retry: 1, enabled: !preview }
    );

    const previewOverrides: Record<string, { priceAtOrder: number; parentOrderId: string | null }> = {
        MUSICIAN_TIP: { priceAtOrder: 2500, parentOrderId: "parent-order-123" },
        GENRE_VARIANT: { priceAtOrder: 3990, parentOrderId: "parent-order-123" },
        LYRICS_UPSELL: { priceAtOrder: 1490, parentOrderId: "parent-order-123" },
        STREAMING_UPSELL: { priceAtOrder: 19700, parentOrderId: "parent-order-123" },
        KARAOKE_UPSELL: { priceAtOrder: 4990, parentOrderId: "parent-order-123" },
    };

    const order = preview
        ? {
            ...PREVIEW_ORDER,
            orderType: previewType,
            parentOrderId: previewOverrides[previewType ?? "MAIN"]?.parentOrderId ?? null,
            priceAtOrder: previewOverrides[previewType ?? "MAIN"]?.priceAtOrder ?? PREVIEW_ORDER.priceAtOrder,
        }
        : fetchedOrder;
    const showStatementDescriptor = order?.paymentMethod === "card";
    const parentOrderId = order?.parentOrderId ?? orderId;
    const { data: parentOrder } = api.songOrder.getById.useQuery(
        { orderId: parentOrderId },
        {
            retry: 1,
            enabled: !!order?.parentOrderId && !preview && (order?.orderType === "LYRICS_UPSELL" || order?.orderType === "KARAOKE_UPSELL"),
        }
    );

    useEffect(() => {
        if (order?.email && !currentEmail) {
            setCurrentEmail(order.email);
            setEmailDraft(order.email);
        }
    }, [order?.email, currentEmail]);

    useEffect(() => {
        if (!order || storyInitializedOrderId === order.id) return;
        const initialStory = buildStoryDraft(order);
        setStoryDraft(initialStory);
        setStorySnapshot(initialStory);
        setStoryInitializedOrderId(order.id);
    }, [order, storyInitializedOrderId]);

    useEffect(() => {
        if (emailStatus === "saved" || emailStatus === "error") {
            const timeout = setTimeout(() => setEmailStatus("idle"), 4000);
            return () => clearTimeout(timeout);
        }
    }, [emailStatus]);

    useEffect(() => {
        if (storyStatus === "saved" || storyStatus === "error") {
            const timeout = setTimeout(() => setStoryStatus("idle"), 4000);
            return () => clearTimeout(timeout);
        }
    }, [storyStatus]);

    // Trigger confetti on successful load (only if payment succeeded)
    useEffect(() => {
        if (order && !hasConfetti && paymentStatus === "success") {
            setHasConfetti(true);
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ["#0A0E1A", "#4A8E9A", "#4CAF50", "#4A6FA5"],
            });
        }
    }, [order, hasConfetti, paymentStatus]);

    useEffect(() => {
        if (!order || preview) return;

        // Clear pending order from localStorage (user completed payment)
        try {
            localStorage.removeItem(`pending_order_${locale}`);
            // Clear quiz draft after successful payment (avoid confusing "resume" states).
            localStorage.removeItem(`quiz_data_${locale}`);
            localStorage.removeItem("apollo-extra-song-draft");
        } catch (e) {
            // Ignore localStorage errors
        }

        // Check localStorage to prevent duplicate tracking across page loads
        const trackedKey = `fb_purchase_tracked_${orderId}`;
        if (localStorage.getItem(trackedKey)) return;

        window.fbq?.(
            "track",
            "Purchase",
            {
                value: order.priceAtOrder / 100,
                currency: order.currency,
                content_ids: [orderId],
                content_type: "product",
                order_id: orderId,
            },
            { eventID: `purchase_${orderId}` }
        );
        window.ttq?.track?.(
            "Purchase",
            {
                value: order.priceAtOrder / 100,
                currency: order.currency,
                content_id: orderId,
                content_type: "product",
                order_id: orderId,
            },
            { event_id: `purchase_${orderId}` }
        );

        // Mark as tracked in localStorage
        localStorage.setItem(trackedKey, "true");
    }, [order, orderId, preview, locale]);

    const isPremiumSixHourPlan = order?.planType === "acelerado";

    const getWithinHoursText = (hours: number) => {
        if (locale === "pt") return `até ${hours}h`;
        if (locale === "es") return `hasta ${hours}h`;
        if (locale === "fr") return `sous ${hours}h`;
        if (locale === "it") return `entro ${hours}h`;
        return `within ${hours}h`;
    };

    // Get delivery estimate date/text
    const getDeliveryDate = () => {
        if (isPremiumSixHourPlan) {
            return getWithinHoursText(6);
        }
        const date = new Date();
        const daysToAdd = order?.hasFastDelivery ? 1 : 7;
        date.setDate(date.getDate() + daysToAdd);
        if (locale === "pt") {
            return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
        }
        return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    };

    const getDeliveryPlanLabel = () => {
        if (isPremiumSixHourPlan) {
            if (locale === "pt") return "Turbo (até 6h)";
            if (locale === "es") return "Turbo (hasta 6h)";
            if (locale === "fr") return "Accéléré (sous 6h)";
            if (locale === "it") return "Accelerato (entro 6h)";
            return "Accelerated (within 6h)";
        }
        return order?.hasFastDelivery ? t("success.fastDelivery") : t("success.standardDelivery");
    };

    const getFastDeliveryItemLabel = () => {
        if (isPremiumSixHourPlan) {
            if (locale === "pt") return "Entrega Prioritária 6h";
            if (locale === "es") return "Entrega prioritaria 6h";
            if (locale === "fr") return "Livraison prioritaire 6h";
            if (locale === "it") return "Consegna prioritaria 6h";
            return "Priority delivery 6h";
        }
        return t("success.fastDeliveryItem");
    };

    const getStep3Description = () => {
        if (isPremiumSixHourPlan) {
            if (locale === "pt") return "Sua canção personalizada será entregue em até 6h.";
            if (locale === "es") return "Tu canción personalizada será entregada en hasta 6h.";
            if (locale === "fr") return "Votre chanson personnalisée sera livrée sous 6h.";
            if (locale === "it") return "La tua canzone personalizzata sarà consegnata entro 6h.";
            return "Your personalized song will be delivered within 6h.";
        }
        return t("success.step3Desc").replace("{date}", getDeliveryDate());
    };

    // Format currency
    const formatPrice = (cents: number, currency: string) => {
        const amount = cents / 100;
        if (currency === "BRL") {
            return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        }
        return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
    };

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const handleStartEmailEdit = () => {
        setIsEditingEmail(true);
        setEmailDraft(currentEmail || order?.email || "");
        setEmailError(null);
        setEmailStatus("idle");
    };

    const handleCancelEmailEdit = () => {
        setIsEditingEmail(false);
        setEmailDraft(currentEmail || order?.email || "");
        setEmailError(null);
        setEmailStatus("idle");
    };

    const handleSaveEmail = () => {
        if (!order) return;

        const nextEmail = emailDraft.trim();
        if (!emailRegex.test(nextEmail)) {
            setEmailError(t("success.emailEdit.invalid"));
            return;
        }

        const baseEmail = (currentEmail || order?.email || "").toLowerCase();
        if (nextEmail.toLowerCase() === baseEmail) {
            setIsEditingEmail(false);
            setEmailError(null);
            return;
        }

        if (preview) {
            setCurrentEmail(nextEmail);
            setEmailDraft(nextEmail);
            setIsEditingEmail(false);
            setEmailStatus("saved");
            return;
        }

        updateEmail.mutate({
            orderId: order.id,
            currentEmail: currentEmail || order.email,
            newEmail: nextEmail,
        });
    };

    const normalizeStoryDraft = (draft: StoryDraft) => ({
        recipientName: draft.recipientName.trim(),
        recipient: draft.recipient,
        genre: draft.genre,
        vocals: draft.vocals,
        qualities: draft.qualities.trim(),
        memories: draft.memories.trim(),
        message: draft.message.trim(),
    });

    const handleStartStoryEdit = () => {
        if (!storySnapshot) return;
        setStoryDraft(storySnapshot);
        setIsEditingStory(true);
        setStoryError(null);
        setStoryStatus("idle");
    };

    const handleStoryFieldChange = <K extends keyof StoryDraft>(field: K, value: StoryDraft[K]) => {
        setStoryDraft((previous) => {
            if (!previous) return previous;
            return { ...previous, [field]: value };
        });
        setStoryStatus("idle");
        setStoryError(null);
    };

    const handleCancelStoryEdit = () => {
        if (storySnapshot) {
            setStoryDraft(storySnapshot);
        }
        setIsEditingStory(false);
        setStoryError(null);
        setStoryStatus("idle");
    };

    const handleSaveStory = () => {
        if (!order || !storyDraft) return;

        const normalized = normalizeStoryDraft(storyDraft);
        if (!isStoryValid || isStoryUnchanged) {
            return;
        }

        if (preview) {
            setStoryDraft(normalized);
            setStorySnapshot(normalized);
            setIsEditingStory(false);
            setStoryError(null);
            setStoryStatus("saved");
            return;
        }

        updateStoryDetails.mutate({
            orderId: order.id,
            email: currentEmail || order.email,
            recipientName: normalized.recipientName,
            recipient: normalized.recipient,
            genre: normalized.genre,
            vocals: normalized.vocals,
            qualities: normalized.qualities,
            memories: normalized.memories,
            message: normalized.message || null,
        });
    };

    // Build track order URL with email pre-filled
    const getTrackOrderPath = () => {
        const email = currentEmail || order?.email || "";
        return `/${locale}/track-order?email=${encodeURIComponent(email)}`;
    };

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
    const trackOrderFullUrl = `${siteUrl}${getTrackOrderPath()}`;

    // Copy link to clipboard
    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(trackOrderFullUrl);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy link:", err);
        }
    };

    // Save link to WhatsApp
    const handleSaveToWhatsApp = () => {
        const message = t("success.trackOrder.whatsAppMessage").replace("{url}", trackOrderFullUrl);
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, "_blank");
    };

    // Save backup WhatsApp
    const handleSaveWhatsApp = () => {
        if (!backupPhone || backupPhone.length < 8 || !order) return;

        // In preview mode, just show success state
        if (preview) {
            setWhatsAppSaved(true);
            return;
        }

        setWhatsAppError(false);
        updateBackupWhatsApp.mutate({
            orderId: order.id,
            email: currentEmail || order.email,
            backupWhatsApp: backupPhone,
        });
    };

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

    // Get extra songs and genre variants from child orders
    const extraSongs = order?.childOrders?.filter(
        (child: { orderType: string }) => child.orderType === "EXTRA_SONG"
    ) ?? [];
    const genreVariants = order?.childOrders?.filter(
        (child: { orderType: string }) => child.orderType === "GENRE_VARIANT"
    ) ?? [];
    const displayEmail = currentEmail || order?.email || "";
    const trimmedEmailDraft = emailDraft.trim();
    const isEmailValid = emailRegex.test(trimmedEmailDraft);
    const isEmailUnchanged = trimmedEmailDraft.toLowerCase() === displayEmail.toLowerCase();
    const normalizedStoryDraft = storyDraft ? normalizeStoryDraft(storyDraft) : null;
    const normalizedStorySnapshot = storySnapshot ? normalizeStoryDraft(storySnapshot) : null;
    const isStoryValid = normalizedStoryDraft
        ? (normalizedStoryDraft.recipient === "group" || normalizedStoryDraft.recipientName.length > 0) &&
        normalizedStoryDraft.qualities.length >= 10 &&
        normalizedStoryDraft.memories.length >= 10
        : false;
    const isStoryUnchanged = normalizedStoryDraft && normalizedStorySnapshot
        ? JSON.stringify(normalizedStoryDraft) === JSON.stringify(normalizedStorySnapshot)
        : true;
    const storyDisplay = normalizedStorySnapshot ?? normalizedStoryDraft ?? (order ? buildStoryDraft(order) : null);

    if (isLoading && !preview) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-dark mx-auto" />
                    <p className="text-charcoal/60">{t("loading")}</p>
                </div>
            </div>
        );
    }

    // Payment verification in progress
    if (paymentStatus === "loading" && !preview) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-dark mx-auto" />
                    <p className="text-charcoal/60">{t("verifyingPayment")}</p>
                </div>
            </div>
        );
    }

    // Payment failed - redirect user back to checkout
    if ((paymentStatus === "failed" || paymentStatus === "requires_action") && !preview) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-6 max-w-md mx-auto px-6">
                    <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                        <CreditCard className="w-10 h-10 text-amber-600" />
                    </div>
                    <h1 className="text-2xl font-serif font-bold text-charcoal">
                        {t("paymentFailed.title")}
                    </h1>
                    <p className="text-charcoal/60">
                        {paymentError || t("paymentFailed.generic")}
                    </p>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                        <p className="text-sm text-green-800">
                            {t("paymentFailed.pixSuggestion")}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <a
                            href={`/${locale}/order/${orderId}/checkout`}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#4A8E9A] text-dark rounded-xl font-semibold hover:bg-[#F0EDE6] transition-colors"
                        >
                            <CreditCard className="w-5 h-5" />
                            {t("paymentFailed.tryAgain")}
                        </a>
                        <a
                            href={`/${locale}`}
                            className="inline-block px-6 py-3 text-charcoal/70 rounded-xl font-medium hover:text-charcoal transition-colors"
                        >
                            {t("success.backHome")}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    if ((error || !order) && !preview) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md mx-auto px-6">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-serif font-bold text-charcoal">
                        {t("error.title")}
                    </h1>
                    <p className="text-charcoal/60">{t("error.description")}</p>
                    <a
                        href={`/${locale}/create`}
                        className="inline-block px-6 py-3 bg-[#4A8E9A] text-dark rounded-xl font-semibold hover:bg-[#F0EDE6] transition-colors"
                    >
                        {t("error.tryAgain")}
                    </a>
                </div>
            </div>
        );
    }

    // At this point, order is guaranteed to be defined
    if (!order) return null;

    const storyReview = t.raw("success.storyReview") as {
        title: string;
        description: string;
        edit: string;
        save: string;
        saving: string;
        cancel: string;
        saved: string;
        error: string;
        helper: string;
        nameLabel: string;
        relationshipLabel: string;
        genreLabel: string;
        vocalsLabel: string;
        qualitiesLabel: string;
        memoriesLabel: string;
        messageLabel: string;
        messagePlaceholder: string;
        emptyValue: string;
        vocals: {
            female: string;
            male: string;
            either: string;
        };
    };

    const isDebug = process.env.NODE_ENV !== "production";
    const localeKey = locale as keyof (typeof GENRE_NAMES)["pop"];
    const genreDisplay = GENRE_NAMES[order.genre]?.[localeKey] || order.genre;
    const getGenreLabel = (value: string) => GENRE_NAMES[value]?.[localeKey] ?? value;
    const getRelationshipLabel = (value: string) => RELATIONSHIP_NAMES[value]?.[localeKey] ?? value;
    const getVocalLabel = (value: VocalType) => storyReview.vocals[value] ?? value;
    const replaceTokens = (text: string) =>
        text
            .replace("{name}", order.recipientName)
            .replace("{genre}", genreDisplay)
            .replace("{amount}", formatPrice(order.priceAtOrder, order.currency));
    const replaceStreamingTokens = (text: string) =>
        replaceTokens(text).replace("{orderId}", orderId);

    // Get tipSuccess translations
    const tipSuccess = t.raw("success.tipSuccess") as {
        title: string;
        subtitle: string;
        description: string;
        impactTitle: string;
        impact1: string;
        impact2: string;
        impact3: string;
        fromMusicians: string;
        thankYouMessage: string;
        shareTitle: string;
        shareDescription: string;
        createAnother: string;
        backToOrder: string;
    };

    const genreVariantSuccess = t.raw("success.genreVariantSuccess") as {
        title: string;
        subtitle: string;
        description: string;
        detailsTitle: string;
        detailsSongFor: string;
        detailsGenre: string;
        detailsTotal: string;
        nextTitle: string;
        next1: string;
        next2: string;
        backToOrder: string;
    };

    const lyricsUpsellSuccess = t.raw("success.lyricsUpsellSuccess") as {
        title: string;
        subtitle: string;
        description: string;
        detailsTitle: string;
        detailsSongFor: string;
        detailsStatus: string;
        detailsStatusValue: string;
        detailsTotal: string;
        nextTitle: string;
        next1: string;
        next2: string;
        downloadButton: string;
        backToOrder: string;
    };
    const lyricsUpsellPending = t.raw("success.lyricsUpsellPending") as {
        title: string;
        subtitle: string;
        description: string;
        detailsTitle: string;
        detailsSongFor: string;
        detailsStatus: string;
        detailsStatusValue: string;
        detailsTotal: string;
        nextTitle: string;
        next1: string;
        next2: string;
        backToOrder: string;
    };

    const streamingVipSuccess = t.raw("success.streamingVipSuccess") as {
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
    };

    const karaokeUpsellSuccess = t.raw("success.karaokeUpsellSuccess") as {
        title: string;
        subtitle: string;
        subtitlePending: string;
        description: string;
        detailsTitle: string;
        detailsSongFor: string;
        detailsGenre: string;
        detailsStatus: string;
        detailsStatusReady: string;
        detailsStatusPending: string;
        detailsTotal: string;
        nextTitle: string;
        next1: string;
        next1Pending: string;
        next2: string;
        next2Pending: string;
        trackingLink: string;
        trackingLinkDesc: string;
        copyLink: string;
        linkCopied: string;
        backToOrder: string;
    };

    const trackOrderPath = getTrackOrderPath();
    const readFullPageNotice = t("success.readFullPageNotice");
    const deliveryPlanLabel = getDeliveryPlanLabel();
    const deliveryEstimateLabel = t("success.trackOrder.deliveryEstimateLabel");
    const trackOrderDescription = {
        lead: t("success.trackOrder.descriptionLead"),
        highlight1: t("success.trackOrder.descriptionHighlight1"),
        mid: t("success.trackOrder.descriptionMid"),
        highlight2: t("success.trackOrder.descriptionHighlight2"),
        end: t("success.trackOrder.descriptionEnd"),
    };
    const ReadFullPageNotice = () => (
        <div className="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl px-4 py-4 text-base sm:text-lg font-semibold text-center leading-relaxed flex items-center justify-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-200 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
            </div>
            <span>{readFullPageNotice}</span>
        </div>
    );
    const StepBadge = ({ step }: { step: number }) => (
        <div className="pointer-events-none absolute -top-3 -left-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-[#E6D6C8] bg-[#FFF7F0] text-base sm:text-lg font-black text-[#4A6FA5] shadow-md">
            {step}
        </div>
    );
    const StepArrow = () => (
        <div className="flex justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-charcoal/10 bg-white/80 text-charcoal/40 shadow-sm">
                <ChevronDown className="w-4 h-4" />
            </div>
        </div>
    );

    // Special success page for MUSICIAN_TIP
    if (order.orderType === "MUSICIAN_TIP") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-rose-50 via-[#0A0E1A] to-[#0A0E1A]">
                {/* Header */}
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

                {/* Content */}
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        {/* Heart Icon & Title */}
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-100 to-rose-200 flex items-center justify-center mx-auto shadow-lg">
                                <Heart className="w-12 h-12 text-rose-500 fill-rose-500" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {tipSuccess.title}
                            </h1>
                            <p className="text-xl sm:text-2xl text-rose-600 font-medium">
                                {tipSuccess.subtitle}
                            </p>
                            <p className="text-charcoal/70 leading-relaxed">
                                {tipSuccess.description.replace("{amount}", formatPrice(order.priceAtOrder, order.currency))}
                            </p>
                        </div>

                        <ReadFullPageNotice />

                        {/* Impact Card */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-amber-500" />
                                {tipSuccess.impactTitle}
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                        <Heart className="w-3.5 h-3.5 text-rose-500" />
                                    </div>
                                    {tipSuccess.impact1}
                                </li>
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                        <Heart className="w-3.5 h-3.5 text-rose-500" />
                                    </div>
                                    {tipSuccess.impact2}
                                </li>
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                        <Heart className="w-3.5 h-3.5 text-rose-500" />
                                    </div>
                                    {tipSuccess.impact3}
                                </li>
                            </ul>
                        </div>

                        {/* Message from Musicians */}
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-6 border border-amber-200 shadow-lg">
                            <p className="font-semibold text-amber-800 mb-3">
                                {tipSuccess.fromMusicians}
                            </p>
                            <p className="text-amber-900/80 leading-relaxed italic">
                                &ldquo;{tipSuccess.thankYouMessage}&rdquo;
                            </p>
                        </div>

                        {/* Social Follow Section */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-2 text-center">
                                {tipSuccess.shareTitle}
                            </h3>
                            <p className="text-charcoal/60 text-center mb-4">
                                {tipSuccess.shareDescription}
                            </p>
                            <div className="flex flex-col gap-3">
                                <a
                                    href="https://www.instagram.com/apollosongbr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-transform hover:scale-105"
                                    style={{
                                        background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                                    }}
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                                    </svg>
                                    {locale === "pt" ? "Seguir no Instagram" : locale === "es" ? "Seguir en Instagram" : locale === "fr" ? "Suivre sur Instagram" : locale === "it" ? "Segui su Instagram" : "Follow on Instagram"}
                                </a>
                                <a
                                    href="https://tiktok.com/@apollosong"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-black text-white font-semibold transition-transform hover:scale-105"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                                    </svg>
                                    {locale === "pt" ? "Seguir no TikTok" : locale === "es" ? "Seguir en TikTok" : locale === "fr" ? "Suivre sur TikTok" : locale === "it" ? "Segui su TikTok" : "Follow on TikTok"}
                                </a>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3 pt-4">
                            <a
                                href={`/${locale}/create`}
                                className="flex items-center justify-center gap-2 px-8 py-4 bg-[#4A8E9A] text-dark rounded-xl font-semibold hover:bg-[#F0EDE6] transition-colors shadow-lg"
                            >
                                <Music className="w-5 h-5" />
                                {tipSuccess.createAnother}
                            </a>
                            {order.parentOrderId && (
                                <a
                                    href={`/${locale}/track-order?email=${encodeURIComponent(displayEmail)}`}
                                    className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-charcoal/20 text-charcoal rounded-xl font-semibold hover:border-charcoal/40 transition-colors"
                                >
                                    <ExternalLink className="w-5 h-5" />
                                    {tipSuccess.backToOrder}
                                </a>
                            )}
                        </div>

                        {/* Order ID */}
                        <p className="text-center text-xs text-charcoal/30">
                            Tip ID: {orderId}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (order.orderType === "GENRE_VARIANT") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-purple-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isDebug && (
                    <div className="bg-amber-400 text-amber-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - genre variant success
                    </div>
                )}
                {/* Header */}
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

                {/* Content */}
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        {/* Icon & Title */}
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-100 to-fuchsia-100 flex items-center justify-center mx-auto shadow-lg">
                                <Guitar className="w-12 h-12 text-purple-600" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {replaceTokens(genreVariantSuccess.title)}
                            </h1>
                            <p className="text-xl sm:text-2xl text-purple-700 font-medium">
                                {replaceTokens(genreVariantSuccess.subtitle)}
                            </p>
                            <p className="text-charcoal/70 leading-relaxed">
                                {replaceTokens(genreVariantSuccess.description)}
                            </p>
                        </div>

                        <ReadFullPageNotice />

                        {/* Details */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-500" />
                                {genreVariantSuccess.detailsTitle}
                            </h3>
                            <div className="space-y-3 text-charcoal/80">
                                <div className="flex justify-between">
                                    <span>{genreVariantSuccess.detailsSongFor}</span>
                                    <span className="font-semibold text-charcoal">{order.recipientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{genreVariantSuccess.detailsGenre}</span>
                                    <span className="font-semibold text-charcoal">{genreDisplay}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{genreVariantSuccess.detailsTotal}</span>
                                    <span className="font-semibold text-charcoal">
                                        {formatPrice(order.priceAtOrder, order.currency)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Next steps */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-500" />
                                {genreVariantSuccess.nextTitle}
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                                    </div>
                                    {genreVariantSuccess.next1}
                                </li>
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                                    </div>
                                    {genreVariantSuccess.next2}
                                </li>
                            </ul>
                        </div>

                        {/* Action */}
                        <div className="flex flex-col gap-3 pt-2">
                            <a
                                href={trackOrderPath}
                                className="flex items-center justify-center gap-2 px-8 py-4 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors shadow-lg"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {genreVariantSuccess.backToOrder}
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

    if (order.orderType === "KARAOKE_UPSELL") {
        const isSongReady = preview || parentOrder?.status === "COMPLETED";
        const statusText = isSongReady
            ? karaokeUpsellSuccess.detailsStatusReady
            : karaokeUpsellSuccess.detailsStatusPending;
        const subtitleText = isSongReady ? karaokeUpsellSuccess.subtitle : karaokeUpsellSuccess.subtitlePending;
        const next1Text = isSongReady ? karaokeUpsellSuccess.next1 : karaokeUpsellSuccess.next1Pending;
        const next2Text = isSongReady ? karaokeUpsellSuccess.next2 : karaokeUpsellSuccess.next2Pending;

        return (
            <div className="min-h-screen bg-gradient-to-b from-rose-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isDebug && (
                    <div className="bg-rose-400 text-rose-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - karaoke success
                    </div>
                )}
                {/* Header */}
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

                {/* Content */}
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        {/* Icon & Title */}
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center mx-auto shadow-lg">
                                <Mic2 className="w-12 h-12 text-rose-600" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {replaceTokens(karaokeUpsellSuccess.title)}
                            </h1>
                            <p className="text-xl sm:text-2xl text-rose-700 font-medium">
                                {replaceTokens(subtitleText)}
                            </p>
                        </div>

                        <ReadFullPageNotice />

                        {/* Details */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-rose-500" />
                                {karaokeUpsellSuccess.detailsTitle}
                            </h3>
                            <div className="space-y-3 text-charcoal/80">
                                <div className="flex justify-between">
                                    <span>{karaokeUpsellSuccess.detailsSongFor}</span>
                                    <span className="font-semibold text-charcoal">{order.recipientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{karaokeUpsellSuccess.detailsGenre}</span>
                                    <span className="font-semibold text-charcoal">
                                        {GENRE_NAMES[order.genre]?.[locale as keyof (typeof GENRE_NAMES)[string]] || order.genre}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{karaokeUpsellSuccess.detailsStatus}</span>
                                    <span className="font-semibold text-charcoal">
                                        {statusText}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{karaokeUpsellSuccess.detailsTotal}</span>
                                    <span className="font-semibold text-charcoal">
                                        {formatPrice(order.priceAtOrder, order.currency)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Next steps */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-rose-500" />
                                {karaokeUpsellSuccess.nextTitle}
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                                    </div>
                                    {next1Text}
                                </li>
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                                    </div>
                                    {next2Text}
                                </li>
                            </ul>
                        </div>

                        {/* Tracking link */}
                        <div className="bg-rose-50 rounded-3xl p-6 border-2 border-rose-200 shadow-lg">
                            <h3 className="font-bold text-rose-900 text-lg sm:text-xl mb-2 flex items-center gap-2">
                                <Bookmark className="w-5 h-5 text-rose-600" />
                                {karaokeUpsellSuccess.trackingLink}
                            </h3>
                            <p className="text-sm text-rose-800/70 mb-4">
                                {karaokeUpsellSuccess.trackingLinkDesc}
                            </p>
                            <div className="bg-white rounded-xl p-3 border border-rose-200 flex items-center gap-2">
                                <span className="flex-1 text-sm text-charcoal/70 truncate font-mono">
                                    {trackOrderFullUrl}
                                </span>
                                <button
                                    onClick={handleCopyLink}
                                    className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors"
                                >
                                    {linkCopied ? (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {karaokeUpsellSuccess.linkCopied}
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            {karaokeUpsellSuccess.copyLink}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Action */}
                        <div className="flex flex-col gap-3 pt-2">
                            <a
                                href={trackOrderPath}
                                className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-charcoal/20 text-charcoal rounded-xl font-semibold hover:border-charcoal/40 transition-colors"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {karaokeUpsellSuccess.backToOrder}
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

    if (order.orderType === "LYRICS_UPSELL") {
        const lyricsDownloadOrderId = order.parentOrderId ?? order.id;
        const lyricsDownloadUrl = `/api/lyrics-pdf/${lyricsDownloadOrderId}`;
        const isLyricsReady = preview || parentOrder?.status === "COMPLETED";
        const lyricsCopy = isLyricsReady ? lyricsUpsellSuccess : lyricsUpsellPending;

        return (
            <div className="min-h-screen bg-gradient-to-b from-amber-50 via-[#0A0E1A] to-[#0A0E1A]">
                {isDebug && (
                    <div className="bg-amber-400 text-amber-950 text-xs font-bold tracking-widest uppercase text-center py-2">
                        Debug mode - lyrics pdf success
                    </div>
                )}
                {/* Header */}
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

                {/* Content */}
                <div className="container mx-auto px-5 py-10">
                    <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                        {/* Icon & Title */}
                        <div className="text-center space-y-4">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto shadow-lg">
                                <FileText className="w-12 h-12 text-amber-600" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                                {replaceTokens(lyricsCopy.title)}
                            </h1>
                            <p className="text-xl sm:text-2xl text-amber-700 font-medium">
                                {replaceTokens(lyricsCopy.subtitle)}
                            </p>
                            <p className="text-charcoal/70 leading-relaxed">
                                {replaceTokens(lyricsCopy.description)}
                            </p>
                        </div>

                        <ReadFullPageNotice />

                        {/* Details */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-amber-500" />
                                {lyricsCopy.detailsTitle}
                            </h3>
                            <div className="space-y-3 text-charcoal/80">
                                <div className="flex justify-between">
                                    <span>{lyricsCopy.detailsSongFor}</span>
                                    <span className="font-semibold text-charcoal">{order.recipientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{lyricsCopy.detailsStatus}</span>
                                    <span className="font-semibold text-charcoal">
                                        {lyricsCopy.detailsStatusValue}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{lyricsCopy.detailsTotal}</span>
                                    <span className="font-semibold text-charcoal">
                                        {formatPrice(order.priceAtOrder, order.currency)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Next steps */}
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <h3 className="font-bold text-charcoal text-xl sm:text-2xl mb-4 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-amber-500" />
                                {lyricsCopy.nextTitle}
                            </h3>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                                    </div>
                                    {lyricsCopy.next1}
                                </li>
                                <li className="flex items-center gap-3 text-charcoal/80">
                                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                                    </div>
                                    {lyricsCopy.next2}
                                </li>
                            </ul>
                        </div>

                        {/* Action */}
                        <div className="flex flex-col gap-3 pt-2">
                            {isLyricsReady && (
                                <a
                                    href={lyricsDownloadUrl}
                                    className="flex items-center justify-center gap-2 px-8 py-4 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors shadow-lg"
                                >
                                    <FileText className="w-5 h-5" />
                                    {lyricsUpsellSuccess.downloadButton}
                                </a>
                            )}
                            <a
                                href={trackOrderPath}
                                className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-charcoal/20 text-charcoal rounded-xl font-semibold hover:border-charcoal/40 transition-colors"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {lyricsCopy.backToOrder}
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

    if (order.orderType === "STREAMING_UPSELL") {
        return (
            <StreamingUpsellSuccess
                orderId={orderId}
                email={order.email ?? ""}
                recipientName={order.recipientName}
                locale={locale}
                currency={order.currency}
                priceAtOrder={order.priceAtOrder}
                isPreview={preview}
                t={streamingVipSuccess}
                common={common}
                trackOrderPath={trackOrderPath}
                formatPrice={formatPrice}
            />
        );
    }

    return (
        <div className="min-h-screen bg-porcelain">
            {/* Header */}
            <div className="bg-white border-b border-charcoal/10">
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

            {/* Content */}
            <div className="container mx-auto px-5 py-10">
                <div className="max-w-xl mx-auto space-y-7 text-base sm:text-lg">
                    {/* Success Icon & Title */}
                    <div className="text-center space-y-4">
                        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                            {t("success.title")}
                        </h1>
                        <p className="text-charcoal/70 text-xl sm:text-2xl">
                            {t("success.subtitle").split("{name}")[0]}
                            <span className="font-bold underline text-charcoal">{order.recipientName}</span>
                            {t("success.subtitle").split("{name}")[1]}
                        </p>
                        <p className="text-charcoal/60 text-base sm:text-lg">
                            {t("success.sentTo")} <span className="font-medium text-charcoal/70">{displayEmail}</span>
                        </p>
                        {showStatementDescriptor && (
                            <p className="text-charcoal/50 text-sm sm:text-base">
                                {t("success.statementDescriptor")}
                            </p>
                        )}
                    </div>

                    <ReadFullPageNotice />

                    {/* Track Order Card - Highlighted */}
                    <div className="relative">
                        <StepBadge step={1} />
                        <div className="relative overflow-hidden bg-gradient-to-br from-[#4A8E9A] via-[#4A3020] to-[#7A5A3E] rounded-3xl p-6 shadow-xl">
                            {/* Decorative elements */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                            <div className="relative z-10">
                                {/* Header with icon */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                        <Music className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-2xl">
                                            {t("success.trackOrder.title")}
                                        </h3>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-white/90 mb-5 leading-relaxed">
                                    {trackOrderDescription.lead}{" "}
                                    <span className="font-semibold text-white">
                                        {trackOrderDescription.highlight1}
                                    </span>{" "}
                                    {trackOrderDescription.mid}{" "}
                                    <span className="font-semibold text-white">
                                        {trackOrderDescription.highlight2}
                                    </span>
                                    {trackOrderDescription.end}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-white/90 mb-5">
                                    <Clock className="w-4 h-4" />
                                    <span className="font-medium text-white/80">
                                        {deliveryEstimateLabel}:
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-[#4A6FA5] font-bold shadow-sm">
                                        {getDeliveryDate()}
                                    </span>
                                    <span className="text-white/80">
                                        • {deliveryPlanLabel}
                                    </span>
                                </div>

                                {/* Main CTA Button */}
                                <a
                                    href={getTrackOrderPath()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center justify-center gap-3 w-full py-4 px-6 bg-porcelain text-dark rounded-2xl font-bold text-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] mb-4"
                                >
                                    <ExternalLink className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                                    {t("success.trackOrder.button")}
                                </a>

                                {/* Save options */}
                                <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Bookmark className="w-4 h-4 text-white/90" />
                                        <span className="text-white font-medium text-base">
                                            {t("success.trackOrder.saveLink")}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyLink}
                                        className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-left text-lg font-semibold text-white/95 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                                    >
                                        <span className="flex items-start gap-2">
                                            <Copy className="w-4 h-4 text-white/80 mt-0.5 flex-shrink-0" />
                                            <span className="block break-all font-bold">{trackOrderFullUrl}</span>
                                        </span>
                                    </button>
                                    {linkCopied && (
                                        <p className="text-white/90 text-sm text-center font-semibold">
                                            {t("success.trackOrder.copied")}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSaveToWhatsApp}
                                        className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-lg text-base font-semibold transition-colors"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        {t("success.trackOrder.saveWhatsApp")}
                                    </button>
                                    <p className="text-white font-medium text-base text-center">
                                        {t("success.trackOrder.saveLinkNote")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <StepArrow />

                    {/* Email Review & Edit */}
                    <div className="relative">
                        <StepBadge step={2} />
                        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-charcoal/10 shadow-lg space-y-4">
                            {/* Header with icon */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <Pencil className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
                                </div>
                                <h3 className="font-bold text-charcoal text-xl sm:text-2xl">
                                    {t("success.emailEdit.title")}
                                </h3>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-base sm:text-lg font-semibold px-3 py-2 rounded-xl text-center">
                                {t("success.emailEdit.prompt")}
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-base text-charcoal/70">
                                    {t("success.emailEdit.label")}
                                </p>
                                {!isEditingEmail && (
                                    <button
                                        type="button"
                                        onClick={handleStartEmailEdit}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4A8E9A] px-4 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#F0EDE6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A8E9A]/40 sm:w-auto"
                                    >
                                        <Pencil className="w-4 h-4" />
                                        {t("success.emailEdit.edit")}
                                    </button>
                                )}
                            </div>

                            {!isEditingEmail ? (
                                <p className="font-medium text-charcoal break-all">
                                    {displayEmail}
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    <input
                                        type="email"
                                        value={emailDraft}
                                        onChange={(event) => {
                                            setEmailDraft(event.target.value);
                                            setEmailError(null);
                                            setEmailStatus("idle");
                                        }}
                                        placeholder={t("success.emailEdit.placeholder")}
                                        className={`w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 ${emailError ? "border-red-300" : "border-charcoal/20"
                                            }`}
                                    />
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            onClick={handleSaveEmail}
                                            disabled={updateEmail.isPending || !isEmailValid || isEmailUnchanged}
                                            className="flex items-center justify-center gap-2 flex-1 py-3 px-4 bg-[#4A8E9A] hover:bg-[#F0EDE6] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
                                        >
                                            {updateEmail.isPending ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {t("success.emailEdit.saving")}
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="w-4 h-4" />
                                                    {t("success.emailEdit.save")}
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={handleCancelEmailEdit}
                                            className="flex items-center justify-center gap-2 flex-1 py-3 px-4 border border-charcoal/20 text-charcoal rounded-xl font-semibold hover:border-charcoal/40 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                            {t("success.emailEdit.cancel")}
                                        </button>
                                    </div>
                                    {emailError && (
                                        <p className="text-red-600 text-base text-center">
                                            {emailError}
                                        </p>
                                    )}
                                </div>
                            )}

                            {emailStatus === "saved" && !isEditingEmail && (
                                <p className="text-green-700 text-base text-center font-medium">
                                    {t("success.emailEdit.saved")}
                                </p>
                            )}

                            {storyDisplay && (
                                <div className="border-t border-charcoal/10 pt-4 space-y-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="text-base font-semibold text-charcoal">
                                                {storyReview.title}
                                            </p>
                                            <p className="text-sm text-charcoal/60">
                                                {storyReview.description}
                                            </p>
                                        </div>
                                        {!isEditingStory && (
                                            <button
                                                type="button"
                                                onClick={handleStartStoryEdit}
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4A8E9A] px-4 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#F0EDE6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A8E9A]/40 sm:w-auto"
                                            >
                                                <Pencil className="w-4 h-4" />
                                                {storyReview.edit}
                                            </button>
                                        )}
                                    </div>

                                    {!isEditingStory ? (
                                        <div className="space-y-4 text-base">
                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <div>
                                                    <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                        {storyReview.nameLabel}
                                                    </p>
                                                    <p className="text-base sm:text-lg font-semibold text-charcoal">
                                                        {storyDisplay.recipientName || storyReview.emptyValue}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                        {storyReview.relationshipLabel}
                                                    </p>
                                                    <p className="text-base sm:text-lg font-semibold text-charcoal">
                                                        {getRelationshipLabel(storyDisplay.recipient)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                        {storyReview.genreLabel}
                                                    </p>
                                                    <p className="text-base sm:text-lg font-semibold text-charcoal">
                                                        {getGenreLabel(storyDisplay.genre)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                        {storyReview.vocalsLabel}
                                                    </p>
                                                    <p className="text-base sm:text-lg font-semibold text-charcoal">
                                                        {getVocalLabel(storyDisplay.vocals)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                    {storyReview.qualitiesLabel}
                                                </p>
                                                <p className="text-base sm:text-lg font-semibold text-charcoal/80 whitespace-pre-line leading-relaxed">
                                                    {storyDisplay.qualities}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                    {storyReview.memoriesLabel}
                                                </p>
                                                <p className="text-base sm:text-lg font-semibold text-charcoal/80 whitespace-pre-line leading-relaxed">
                                                    {storyDisplay.memories}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm uppercase tracking-wide text-[#4A6FA5]">
                                                    {storyReview.messageLabel}
                                                </p>
                                                <p className="text-base sm:text-lg font-semibold text-charcoal/80 whitespace-pre-line leading-relaxed">
                                                    {storyDisplay.message || storyReview.emptyValue}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.nameLabel}
                                                        <input
                                                            type="text"
                                                            value={storyDraft?.recipientName ?? ""}
                                                            onChange={(event) => handleStoryFieldChange("recipientName", event.target.value)}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20"
                                                        />
                                                    </label>
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.relationshipLabel}
                                                        <select
                                                            value={storyDraft?.recipient ?? recipientTypes[0]}
                                                            onChange={(event) => handleStoryFieldChange("recipient", event.target.value as RecipientType)}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20 bg-white"
                                                        >
                                                            {recipientTypes.map((recipient) => (
                                                                <option key={recipient} value={recipient}>
                                                                    {getRelationshipLabel(recipient)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.genreLabel}
                                                        <select
                                                            value={storyDraft?.genre ?? genreTypes[0]}
                                                            onChange={(event) => handleStoryFieldChange("genre", event.target.value as GenreType)}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20 bg-white"
                                                        >
                                                            {genreTypes.map((genre) => (
                                                                <option key={genre} value={genre}>
                                                                    {getGenreLabel(genre)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.vocalsLabel}
                                                        <select
                                                            value={storyDraft?.vocals ?? vocalTypes[2]}
                                                            onChange={(event) => handleStoryFieldChange("vocals", event.target.value as VocalType)}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20 bg-white"
                                                        >
                                                            {vocalTypes.map((vocals) => (
                                                                <option key={vocals} value={vocals}>
                                                                    {getVocalLabel(vocals)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>
                                                <div className="grid gap-3">
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.qualitiesLabel}
                                                        <textarea
                                                            value={storyDraft?.qualities ?? ""}
                                                            onChange={(event) => handleStoryFieldChange("qualities", event.target.value)}
                                                            rows={4}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20 resize-none"
                                                        />
                                                    </label>
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.memoriesLabel}
                                                        <textarea
                                                            value={storyDraft?.memories ?? ""}
                                                            onChange={(event) => handleStoryFieldChange("memories", event.target.value)}
                                                            rows={4}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20 resize-none"
                                                        />
                                                    </label>
                                                    <label className="text-sm font-medium text-charcoal/70">
                                                        {storyReview.messageLabel}
                                                        <textarea
                                                            value={storyDraft?.message ?? ""}
                                                            onChange={(event) => handleStoryFieldChange("message", event.target.value)}
                                                            rows={3}
                                                            placeholder={storyReview.messagePlaceholder}
                                                            className="mt-1 w-full rounded-xl border px-4 py-3 text-base text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/40 border-charcoal/20 resize-none"
                                                        />
                                                    </label>
                                                </div>
                                            </div>

                                            <p className="text-sm text-charcoal/60">
                                                {storyReview.helper}
                                            </p>

                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <button
                                                    onClick={handleSaveStory}
                                                    disabled={updateStoryDetails.isPending || !isStoryValid || isStoryUnchanged}
                                                    className="flex items-center justify-center gap-2 flex-1 py-3 px-4 bg-[#4A8E9A] hover:bg-[#F0EDE6] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
                                                >
                                                    {updateStoryDetails.isPending ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            {storyReview.saving}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="w-4 h-4" />
                                                            {storyReview.save}
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={handleCancelStoryEdit}
                                                    className="flex items-center justify-center gap-2 flex-1 py-3 px-4 border border-charcoal/20 text-charcoal rounded-xl font-semibold hover:border-charcoal/40 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                    {storyReview.cancel}
                                                </button>
                                            </div>

                                            {storyError && (
                                                <p className="text-red-600 text-base text-center">
                                                    {storyError}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {storyStatus === "saved" && !isEditingStory && (
                                        <p className="text-green-700 text-base text-center font-medium">
                                            {storyReview.saved}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <StepArrow />

                    {/* WhatsApp Backup Card */}
                    {!whatsAppSaved && (
                        <div className="relative">
                            <StepBadge step={3} />
                            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-charcoal/10 shadow-lg">
                                {/* Header with icon */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                        <Phone className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-charcoal text-xl sm:text-2xl">
                                            {t("success.whatsAppBackup.title")}
                                        </h3>
                                        <span className="text-sm bg-white/60 px-2.5 py-1 rounded-full text-charcoal/60 font-medium">
                                            {t("success.whatsAppBackup.optional")}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-charcoal/60 text-base mb-4">
                                    {t("success.whatsAppBackup.description")}
                                </p>

                                <div className="space-y-3">
                                    <PhoneInput
                                        defaultCountry={getDefaultCountry()}
                                        value={backupPhone}
                                        onChange={(phone) => setBackupPhone(phone)}
                                        inputClassName="!w-full !py-3 !text-base !rounded-xl !border-charcoal/20"
                                        countrySelectorStyleProps={{
                                            buttonClassName: "!py-3 !px-3 !rounded-l-xl !border-charcoal/20",
                                        }}
                                        className="w-full"
                                    />

                                    <button
                                        onClick={handleSaveWhatsApp}
                                        disabled={updateBackupWhatsApp.isPending || !backupPhone || backupPhone.length < 8}
                                        className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
                                    >
                                        {updateBackupWhatsApp.isPending ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t("success.whatsAppBackup.saving")}
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-4 h-4" />
                                                {t("success.whatsAppBackup.save")}
                                            </>
                                        )}
                                    </button>

                                    {whatsAppError && (
                                        <p className="text-red-600 text-base text-center">
                                            {t("success.whatsAppBackup.error")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* WhatsApp Saved Confirmation */}
                    {whatsAppSaved && (
                        <div className="relative">
                            <StepBadge step={3} />
                            <div className="bg-green-50 rounded-2xl p-3 sm:p-4 border border-green-200">
                                <div className="flex items-start sm:items-center justify-between gap-2">
                                    <div className="flex items-start sm:items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                                        <div className="min-w-0">
                                            <p className="text-base text-green-800 font-medium">
                                                {t("success.whatsAppBackup.saved")}
                                            </p>
                                            <p className="text-base text-green-700 font-mono break-all">
                                                {backupPhone}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setWhatsAppSaved(false)}
                                        className="inline-flex items-center justify-center rounded-xl border border-green-300 px-3 py-2 text-base font-semibold text-green-700 transition-colors hover:border-green-400 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/60"
                                    >
                                        {t("success.whatsAppBackup.edit")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <StepArrow />

                    {/* Order Confirmation Card */}
                    <div className="relative">
                        <StepBadge step={4} />
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            {/* Header with icon */}
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#4A8E9A]/10 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-dark" />
                                </div>
                                <h3 className="font-bold text-charcoal text-xl sm:text-2xl">
                                    {t("success.orderDetails")}
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-charcoal/70">{t("songFor")}</span>
                                    <span className="font-medium text-dark">{order.recipientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-charcoal/70">{t("genre")}</span>
                                    <span className="font-medium text-charcoal">{GENRE_NAMES[order.genre]?.[locale as keyof typeof GENRE_NAMES[string]] || order.genre}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-charcoal/70">{t("success.delivery")}</span>
                                    {order.hasFastDelivery ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-base font-medium">
                                            <Clock className="w-3.5 h-3.5" />
                                            {deliveryPlanLabel}
                                        </span>
                                    ) : (
                                        <span className="font-medium text-charcoal">{t("success.standardDelivery")}</span>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-charcoal/70">{t("success.orderNumber")}</span>
                                    <span className="font-mono text-base text-charcoal">{orderId.slice(-8).toUpperCase()}</span>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-charcoal/10 my-4" />

                                {/* Items Purchased */}
                                <div>
                                    <p className="text-charcoal/70 text-base mb-2">{t("success.includes")}</p>
                                    <ul className="space-y-1.5">
                                        <li className="flex items-center gap-2 text-base text-charcoal">
                                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                                            {t("success.customSong")} - {order.recipientName}
                                        </li>
                                        {order.hasFastDelivery && (
                                            <li className="flex items-center gap-2 text-base text-charcoal">
                                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                {getFastDeliveryItemLabel()}
                                            </li>
                                        )}
                                        {extraSongs.map((song: { id: string; recipientName: string }) => (
                                            <li key={song.id} className="flex items-center gap-2 text-base text-charcoal">
                                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                {t("success.extraSongFor").replace("{name}", song.recipientName)}
                                            </li>
                                        ))}
                                        {genreVariants.map((variant: { id: string; genre?: string | null }) => (
                                            <li key={variant.id} className="flex items-center gap-2 text-base text-charcoal">
                                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                {t("success.genreVariantFor").replace(
                                                    "{genre}",
                                                    variant.genre
                                                        ? (GENRE_NAMES[variant.genre]?.[locale as keyof typeof GENRE_NAMES[string]] || variant.genre)
                                                        : ""
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-charcoal/10 my-4" />

                                {/* Total Paid */}
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-charcoal">{t("success.totalPaid")}</span>
                                    <span className="text-2xl font-bold text-dark">
                                        {formatPrice(order.priceAtOrder, order.currency)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <StepArrow />

                    {/* What Happens Next */}
                    <div className="relative">
                        <StepBadge step={5} />
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            {/* Header with icon */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                                </div>
                                <h3 className="font-bold text-charcoal text-xl sm:text-2xl">
                                    {t("success.whatsNext")}
                                </h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#4A8E9A]/10 flex items-center justify-center flex-shrink-0">
                                        <Mail className="w-4 h-4 text-dark" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-charcoal">{t("success.step1Title")}</p>
                                        <p className="text-base text-charcoal/60">{t("success.step1Desc")}</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#4A8E9A]/10 flex items-center justify-center flex-shrink-0">
                                        <Music className="w-4 h-4 text-dark" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-charcoal">{t("success.step2Title")}</p>
                                        <p className="text-base text-charcoal/60">{t("success.step2Desc")}</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#4A8E9A]/10 flex items-center justify-center flex-shrink-0">
                                        <Clock className="w-4 h-4 text-dark" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-charcoal">{t("success.step3Title")}</p>
                                        <p className="text-base text-charcoal/60">
                                            {getStep3Description()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 bg-green-50 rounded-2xl p-4 border border-green-200">
                                <p className="text-base text-green-800 text-center">
                                    {t("success.emailNote").replace("{email}", displayEmail)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <StepArrow />

                    {/* Social Follow Section */}
                    <div className="relative">
                        <StepBadge step={6} />
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            {/* Header with icon */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                                    <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />
                                </div>
                                <h3 className="font-bold text-charcoal text-xl sm:text-2xl">
                                    {locale === "pt" ? "Nos siga!" : "Follow us!"}
                                </h3>
                            </div>
                            <p className="text-charcoal/70 mb-4 text-center">
                                {locale === "pt" ? "Siga-nos para ver mais músicas incríveis!" : "Follow us for more amazing songs!"}
                            </p>
                            <div className="flex flex-col gap-3">
                                <a
                                    href="https://www.instagram.com/apollosongbr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-transform hover:scale-105"
                                    style={{
                                        background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                                    }}
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                                    </svg>
                                    {locale === "pt" ? "Seguir no Instagram" : "Follow on Instagram"}
                                </a>
                                <a
                                    href="https://tiktok.com/@apollosong"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-black text-white font-semibold transition-transform hover:scale-105"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                                    </svg>
                                    {locale === "pt" ? "Seguir no TikTok" : "Follow on TikTok"}
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Back to Home */}
                    <div className="text-center pt-4">
                        <a
                            href={`/${locale}`}
                            className="inline-flex items-center gap-2 px-8 py-4 bg-[#4A8E9A] text-dark rounded-xl font-semibold hover:bg-[#F0EDE6] transition-colors shadow-lg"
                        >
                            <Home className="w-5 h-5" />
                            {t("success.backHome")}
                        </a>
                    </div>

                    {/* Order ID for reference */}
                    <p className="text-center text-xs text-charcoal/30">
                        Order ID: {orderId}
                    </p>
                </div>
            </div>

            {/* Floating WhatsApp Button */}
            <a
                href={`https://wa.me/?text=${encodeURIComponent(t("success.trackOrder.floatingWhatsAppMessage").replace("{url}", trackOrderFullUrl))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#20BD5A] transition-all duration-300 hover:scale-110"
                aria-label="Save to WhatsApp"
            >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
            </a>
        </div>
    );
}
