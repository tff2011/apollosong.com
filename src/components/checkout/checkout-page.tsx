"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "~/i18n/provider";
import { api } from "~/trpc/react";
import { Shield, CheckCircle2, Loader2, AlertCircle, Guitar, FileText, Heart, ChevronDown, Mic2 } from "lucide-react";

// Social Media Icons
function SpotifyIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
    );
}

function InstagramIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
    );
}

function TikTokIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
        </svg>
    );
}

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}
import { cn } from "~/lib/utils";
import { loadStripe } from "@stripe/stripe-js";
import {
    Elements,
    PaymentElement,
    useStripe,
    useElements,
} from "@stripe/react-stripe-js";
import { PlanSelector } from "./plan-selector";
import { CoverArtSlider } from "./cover-art-slider";
import { WhatsappAudioPlayer } from "~/components/ui/whatsapp-audio-player";
import type { BRLPlanType } from "~/lib/validations/song-order";

// Initialize Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type CheckoutPageProps = {
    orderId: string;
};

export function CheckoutPage({ orderId }: CheckoutPageProps) {
    const t = useTranslations("checkout");
    const common = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderIdsParam = searchParams.get("orderIds");
    const bundleOrderIds = useMemo(() => {
        if (!orderIdsParam) return null;
        const ids = orderIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const uniqueIds = Array.from(new Set([orderId, ...ids]));
        return uniqueIds.length > 1 ? uniqueIds : null;
    }, [orderId, orderIdsParam]);
    const isBundleCheckout = !!bundleOrderIds;
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [planConfirmed, setPlanConfirmed] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<BRLPlanType>("express");
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const hasTrackedCheckoutRef = useRef(false);
    const hasCreatedPaymentIntentRef = useRef(false);

    // Fetch order data
    const { data: order, isLoading, error } = api.songOrder.getById.useQuery(
        { orderId },
        { retry: 1 }
    );

    // If the user lands on an included/child order (priceAtOrder=0), redirect to the payable parent/wrapper order.
    useEffect(() => {
        if (!order) return;
        if (order.status !== "PENDING") return;
        if (!order.parentOrderId) return;
        if (order.priceAtOrder > 0) return;

        router.replace(`/${locale}/order/${order.parentOrderId}`);
    }, [order, locale, router]);

    // Keep URL locale aligned with order locale to avoid mixed language/currency perception
    // (e.g. opening a USD order through /pt/... route).
    useEffect(() => {
        if (!order?.locale) return;
        if (order.locale === locale) return;

        const queryString = searchParams.toString();
        const targetPath = `/${order.locale}/order/${order.id}${queryString ? `?${queryString}` : ""}`;
        router.replace(targetPath);
    }, [order, locale, router, searchParams]);

    // Mutation to update plan
    const updatePlanMutation = api.songOrder.updatePlan.useMutation();

    // Check if this locale uses plan-based pricing (PT=BRL, ES=USD, FR=EUR)
    const usesPlanPricing = order
        ? (order.locale === "pt" || order.locale === "es" || order.locale === "fr" || order.locale === "it")
        : false;

    // Initialize plan from order when loaded
    useEffect(() => {
        if (!order) return;
        if (order.planType) {
            setSelectedPlan(order.planType as BRLPlanType);
            setPlanConfirmed(true); // Plan was already selected in quiz
        }
        setCurrentPrice(isBundleCheckout ? null : order.priceAtOrder);
        // Skip plan selection for non-plan locales (EN only) and non-MAIN orders
        // EXTRA_SONG and other child orders have their price included in the parent order
        if (!usesPlanPricing || order.orderType === "EXTRA_SONG" || order.orderType === "GENRE_VARIANT" || order.orderType === "LYRICS_UPSELL" || order.orderType === "MUSICIAN_TIP" || order.orderType === "STREAMING_UPSELL" || order.orderType === "KARAOKE_UPSELL") {
            setPlanConfirmed(true);
        }
    }, [order, usesPlanPricing, isBundleCheckout]);

    // Check if this is a non-main order type (child orders have their price included in parent)
    const isExtraSong = order?.orderType === "EXTRA_SONG";
    const isGenreVariant = order?.orderType === "GENRE_VARIANT";
    const isLyricsUpsell = order?.orderType === "LYRICS_UPSELL";
    const isStreamingUpsell = order?.orderType === "STREAMING_UPSELL";
    const isMusicianTip = order?.orderType === "MUSICIAN_TIP";
    const isKaraokeUpsell = order?.orderType === "KARAOKE_UPSELL";

    // Genre labels for display
    const genreLabels: Record<string, string> = locale === "pt" ? {
        pop: "Pop",
        country: "Sertanejo",
        rock: "Rock",
        "jovem-guarda": "Jovem Guarda",
        "rock-classico": "Rock Clássico",
        "pop-rock-brasileiro": "Pop Rock Brasileiro",
        "heavy-metal": "Heavy Metal",
        eletronica: "Eletrônica",
        "eletronica-afro-house": "Afro House",
        "eletronica-progressive-house": "Progressive House",
        "eletronica-melodic-techno": "Melodic Techno",
        latina: "Música Latina",
        salsa: "Salsa",
        merengue: "Merengue",
        bachata: "Bachata",
        bolero: "Bolero",
        rnb: "Black Music",
        jazz: "Jazz",
        blues: "Blues Americano",
        "blues-melancholic": "Blues Americano (Melancólico)",
        "blues-upbeat": "Blues Americano (Alto Astral)",
        worship: "Gospel",
        hiphop: "Rap",
        funk: "Funk",
        "funk-carioca": "Funk Carioca",
        "funk-paulista": "Funk Paulista",
        "funk-melody": "Funk Melody",
        brega: "Brega",
        "brega-romantico": "Brega Romântico",
        tecnobrega: "Tecnobrega",
        samba: "Samba",
        pagode: "Pagode",
        "pagode-de-mesa": "Pagode de Mesa (Raiz)",
        "pagode-romantico": "Pagode Romântico (Anos 90)",
        "pagode-universitario": "Pagode Universitário / Novo Pagode",
        forro: "Forró",
        "sertanejo-raiz": "Sertanejo Raiz",
        "sertanejo-universitario": "Sertanejo Universitário",
        "sertanejo-romantico": "Sertanejo Romântico",
        "forro-pe-de-serra": "Forró Pé-de-Serra", // Legacy
        "forro-pe-de-serra-rapido": "Forró Pé-de-Serra (Dançante)",
        "forro-pe-de-serra-lento": "Forró Pé-de-Serra (Lento)",
        "forro-universitario": "Forró Universitário",
        "forro-eletronico": "Forró Eletrônico",
        axe: "Axé",
        capoeira: "Capoeira",
        reggae: "Reggae",
        lullaby: "Infantil",
        "lullaby-ninar": "Canções de Ninar",
        "lullaby-animada": "Infantil Animada",
    } : {
        pop: "Pop",
        country: "Country",
        rock: "Rock",
        rnb: "R&B",
        jazz: "Jazz",
        blues: "American Blues",
        "blues-melancholic": "American Blues (Melancholic)",
        "blues-upbeat": "American Blues (Upbeat)",
        eletronica: "Electronic",
        "eletronica-afro-house": "Afro House",
        "eletronica-progressive-house": "Progressive House",
        "eletronica-melodic-techno": "Melodic Techno",
        latina: "Latin Music",
        salsa: "Salsa",
        merengue: "Merengue",
        bachata: "Bachata",
        bolero: "Bolero",
        worship: "Worship",
        hiphop: "Hip-Hop",
        lullaby: "Lullaby",
        "lullaby-ninar": "Lullaby (Soothing)",
        "lullaby-animada": "Kids Song (Upbeat)",
    };

    const rawVariantGenres = isGenreVariant
        ? [
            order?.genre,
            ...(order?.childOrders ?? [])
                .filter((child: { orderType: string; genre: string }) => child.orderType === "GENRE_VARIANT")
                .map((child: { orderType: string; genre: string }) => child.genre),
        ]
        : [];
    const uniqueVariantGenres = Array.from(
        new Set(rawVariantGenres.filter((genre): genre is string => !!genre))
    );
    const variantGenresLabel = uniqueVariantGenres
        .map((genre) => genreLabels[genre] || genre)
        .join(", ");
    const hasMultipleVariantGenres = uniqueVariantGenres.length > 1;

    useEffect(() => {
        if (hasTrackedCheckoutRef.current) return;
        if (!order || order.status !== "PENDING") return;
        if (isBundleCheckout && currentPrice === null) return;

        const priceToTrack = currentPrice ?? order.priceAtOrder;
        window.fbq?.("track", "InitiateCheckout", {
            content_ids: [orderId],
            content_type: "product",
            value: priceToTrack / 100,
            currency: order.currency,
            num_items: 1,
        });
        window.ttq?.track?.("InitiateCheckout", {
            content_id: orderId,
            content_type: "product",
            value: priceToTrack / 100,
            currency: order.currency,
        });
        hasTrackedCheckoutRef.current = true;
    }, [order, orderId, currentPrice, isBundleCheckout]);

    // Create PaymentIntent when order is loaded AND plan is confirmed
    useEffect(() => {
        // Guard against duplicate calls
        if (hasCreatedPaymentIntentRef.current) return;
        if (!order || order.status !== "PENDING") return;
        if (clientSecret) return; // Already have a client secret
        // Included child orders (priceAtOrder=0) are paid via a parent/wrapper order.
        if (order.priceAtOrder <= 0 && order.parentOrderId) return;
        // For plan-based pricing (PT, ES, FR locales), wait until plan is confirmed
        if (usesPlanPricing && !planConfirmed) return;

        hasCreatedPaymentIntentRef.current = true;

        fetch("/api/create-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId,
                orderIds: bundleOrderIds ?? undefined,
            }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.error) {
                    setPaymentError(data.error);
                    hasCreatedPaymentIntentRef.current = false; // Allow retry on error
                } else {
                    setClientSecret(data.clientSecret);
                    if (typeof data.amount === "number") {
                        setCurrentPrice(data.amount);
                    }
                }
            })
            .catch((err) => {
                console.error("Failed to create payment intent:", err);
                setPaymentError(t("error.paymentSetup"));
                hasCreatedPaymentIntentRef.current = false; // Allow retry on error
            });
    }, [order, orderId, t, clientSecret, planConfirmed, bundleOrderIds, isBundleCheckout, currentPrice]);

    // Handle plan confirmation
    const handlePlanConfirm = async () => {
        if (!order) return;

        try {
            const result = await updatePlanMutation.mutateAsync({
                orderId,
                planType: selectedPlan,
            });
            setCurrentPrice(result.priceAtOrder);
            setPlanConfirmed(true);
        } catch (err) {
            console.error("Failed to update plan:", err);
            setPaymentError(t("error.paymentSetup"));
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-dark mx-auto" />
                    <p className="text-charcoal/60">{t("loading")}</p>
                </div>
            </div>
        );
    }

    if (error || !order) {
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

    if (order.status === "PENDING" && order.priceAtOrder <= 0 && order.parentOrderId) {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-dark mx-auto" />
                    <p className="text-charcoal/60">{t("loading")}</p>
                </div>
            </div>
        );
    }

    // Order already paid
    if (order.status === "PAID" || order.status === "COMPLETED") {
        return (
            <div className="min-h-screen bg-porcelain flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md mx-auto px-6">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-serif font-bold text-charcoal">
                        {t("alreadyPaid.title")}
                    </h1>
                    <p className="text-charcoal/60">{t("alreadyPaid.description")}</p>
                    <a
                        href={`/${locale}`}
                        className="inline-block px-6 py-3 bg-[#4A8E9A] text-dark rounded-xl font-semibold hover:bg-[#F0EDE6] transition-colors"
                    >
                        {t("alreadyPaid.goHome")}
                    </a>
                </div>
            </div>
        );
    }

    const payableAmount = currentPrice ?? order.priceAtOrder;
    const isPlanPricingOrder =
        order.currency === "BRL" ||
        order.locale === "es" ||
        order.locale === "fr" ||
        order.locale === "it";
    const planType = (order.planType ?? "express") as BRLPlanType;
    const isPremiumSixHourPlan = planType === "acelerado";
    const isBRL = order.currency === "BRL";
    const isEUR = order.currency === "EUR";
    const isES = order.locale === "es";
    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (order.currency === "BRL") {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        if (order.currency === "EUR") {
            return `€${amount.toFixed(2)}`;
        }
        return `$${amount.toFixed(2)} USD`;
    };

    const basePrice = (() => {
        if (isBRL) {
            if (planType === "essencial") return 6990;
            if (planType === "acelerado") return 19990;
            return 9990;
        }
        if (isEUR) {
            if (planType === "essencial") return 6900;
            if (planType === "acelerado") return 12900;
            return 9900;
        }
        if (order.locale === "es") {
            if (planType === "essencial") return 1700;
            if (planType === "acelerado") return 3700;
            return 2700;
        }
        return 9900; // EN base
    })();

    const showFastDeliveryLine = !isPlanPricingOrder && order.currency === "USD" && order.hasFastDelivery;
    const fastDeliveryPrice = 4900;
    const extraSongCount = order.childOrders.filter((c) => c.orderType === "EXTRA_SONG").length;
    const extraSongChild = order.childOrders.find((c) => c.orderType === "EXTRA_SONG");
    const genreVariantCount = order.childOrders.filter((c) => c.orderType === "GENRE_VARIANT").length;
    const genreVariantPrice = isES ? 999 : isEUR ? 2900 : 3990;
    const extraSongPrice = isES ? 999 : isEUR ? 2900 : isBRL ? 4990 : 4950;
    const certificatePrice = isES ? 999 : isEUR ? 1900 : 1990;
    const lyricsPrice = isES ? 999 : isEUR ? 900 : isBRL ? 1490 : 990;
    const couponDiscountAmount = order.couponDiscountAmount ?? 0;
    const hasCouponDiscount = couponDiscountAmount > 0 && !!order.couponCode;

    const planLabel = isPlanPricingOrder ? t(`plans.${planType}.name`) : null;
    const deliveryLabel = (() => {
        const date = new Date();
        const localeCode =
            locale === "pt"
                ? "pt-BR"
                : locale === "es"
                    ? "es-ES"
                    : locale === "fr"
                        ? "fr-FR"
                        : locale === "it"
                            ? "it-IT"
                            : "en-US";

        const within24h = () => {
            if (locale === "pt") return "até 24h";
            if (locale === "es") return "hasta 24h";
            if (locale === "fr") return "sous 24h";
            if (locale === "it") return "entro 24h";
            return "within 24h";
        };
        const within6h = () => {
            if (locale === "pt") return "até 6h";
            if (locale === "es") return "hasta 6h";
            if (locale === "fr") return "sous 6h";
            if (locale === "it") return "entro 6h";
            return "within 6h";
        };

        if (isPlanPricingOrder) {
            if (planType === "acelerado") return within6h();
            if (planType === "express") return within24h();
            date.setDate(date.getDate() + 7);
        } else {
            if (order.hasFastDelivery) return within24h();
            date.setDate(date.getDate() + 7);
        }

        return locale === "en"
            ? date.toLocaleDateString(localeCode, { month: "short", day: "numeric" })
            : date.toLocaleDateString(localeCode, { day: "numeric", month: "short" });
    })();

    // Map app locale to Stripe locale codes
    const stripeLocaleMap: Record<string, string> = {
        pt: "pt-BR",
        en: "en",
        es: "es",
        fr: "fr",
        it: "it",
    };
    const stripeLocale = stripeLocaleMap[locale] || "en";
    const includedInPlanLabel = locale === "pt"
        ? "Incluído no plano"
        : locale === "es"
            ? "Incluido en el plan"
            : locale === "fr"
                ? "Inclus dans le forfait"
                : locale === "it"
                    ? "Incluso nel piano"
                    : "Included in plan";
    const karaokePlaybackLabel = locale === "pt"
        ? "Playback Karaokê"
        : locale === "es"
            ? "Playback Karaoke"
            : locale === "fr"
                ? "Playback Karaoké"
                : locale === "it"
                    ? "Playback Karaoke"
                    : "Karaoke Playback";

    const stripeOptions = {
        clientSecret: clientSecret || undefined,
        fonts: [
            {
                cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
            },
        ],
        appearance: {
            theme: "stripe" as const,
            variables: {
                colorPrimary: "#4A8E9A",
                colorBackground: "#ffffff",
                colorText: "#1a1a1a",
                colorDanger: "#dc2626",
                fontFamily: '"Inter", system-ui, sans-serif',
                borderRadius: "12px",
                spacingUnit: "4px",
            },
        },
        locale: stripeLocale as "en" | "pt-BR" | "es" | "fr" | "it",
    };

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
                <div className="max-w-2xl mx-auto space-y-6">
                    {/* Main Order Summary */}
                    {order.orderType === "MAIN" && !isBundleCheckout && (
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <div className="flex items-start justify-between gap-4 mb-5">
                                <div>
                                    <h3 className="font-bold text-charcoal text-lg">
                                        {t("orderSummary")}
                                    </h3>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("breakdown.title")}
                                    </p>
                                </div>
                                <a
                                    href={`/${locale}/create?step=checkout`}
                                    className="text-sm font-semibold text-dark hover:underline"
                                >
                                    {t("actions.reviewPlan")}
                                </a>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-charcoal/60">{t("songFor")}</span>
                                    <span className="font-medium text-charcoal">
                                        {order.recipientName}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-charcoal/60">{t("genre")}</span>
                                    <span className="font-medium text-charcoal">
                                        {genreLabels[order.genre] || order.genre}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-charcoal/60">{t("delivery")}</span>
                                    <span className="font-medium text-charcoal">{deliveryLabel}</span>
                                </div>
                            </div>

                            <div className="border-t border-charcoal/10 my-4" />

                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-charcoal/70">
                                        {t("breakdown.base")}
                                        {planLabel ? ` (${planLabel})` : ""}
                                    </span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {formatPrice(basePrice)}
                                    </span>
                                </div>

                                {showFastDeliveryLine && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-charcoal/70">{t("breakdown.fastDelivery")}</span>
                                        <span className="font-medium text-charcoal tabular-nums">
                                            {formatPrice(fastDeliveryPrice)}
                                        </span>
                                    </div>
                                )}

                                {extraSongCount > 0 && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-charcoal/70">
                                            {t("breakdown.extraSong")}
                                            {extraSongChild?.recipientName ? ` (${extraSongChild.recipientName})` : ""}
                                        </span>
                                        <span className="font-medium text-charcoal tabular-nums">
                                            {formatPrice(extraSongCount * extraSongPrice)}
                                        </span>
                                    </div>
                                )}

                                {genreVariantCount > 0 && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-charcoal/70">
                                            {t("breakdown.genreVariants", {
                                                count: String(genreVariantCount),
                                            })}
                                        </span>
                                        <span className="font-medium text-charcoal tabular-nums">
                                            {formatPrice(genreVariantCount * genreVariantPrice)}
                                        </span>
                                    </div>
                                )}

                                {order.hasCertificate && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-charcoal/70">{t("breakdown.certificate")}</span>
                                        <span className="font-medium text-charcoal tabular-nums">
                                            {isPremiumSixHourPlan ? includedInPlanLabel : formatPrice(certificatePrice)}
                                        </span>
                                    </div>
                                )}

                                {order.hasLyrics && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-charcoal/70">{t("breakdown.lyrics")}</span>
                                        <span className="font-medium text-charcoal tabular-nums">
                                            {isPremiumSixHourPlan ? includedInPlanLabel : formatPrice(lyricsPrice)}
                                        </span>
                                    </div>
                                )}

                                {isPremiumSixHourPlan && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-charcoal/70">{karaokePlaybackLabel}</span>
                                        <span className="font-medium text-charcoal tabular-nums">
                                            {includedInPlanLabel}
                                        </span>
                                    </div>
                                )}

                                {hasCouponDiscount && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-green-700">
                                            {locale === "pt"
                                                ? `Cupom (${order.couponCode})`
                                                : locale === "es"
                                                    ? `Cupón (${order.couponCode})`
                                                    : locale === "fr"
                                                        ? `Code promo (${order.couponCode})`
                                                        : locale === "it"
                                                            ? `Codice sconto (${order.couponCode})`
                                                            : `Discount code (${order.couponCode})`}
                                        </span>
                                        <span className="font-semibold text-green-700 tabular-nums">
                                            -{formatPrice(couponDiscountAmount)}
                                        </span>
                                    </div>
                                )}

                                <div className="border-t border-charcoal/10 pt-3 flex items-center justify-between">
                                    <span className="font-semibold text-charcoal">
                                        {t("breakdown.total")}
                                    </span>
                                    <span className="text-xl font-bold text-dark tabular-nums">
                                        {formatPrice(payableAmount)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Genre Variant Summary */}
                    {isGenreVariant && (
                        <div className="bg-purple-50 rounded-3xl p-6 border border-purple-200 shadow-lg">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                    <Guitar className="w-6 h-6 text-purple-600" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-purple-900 text-lg">
                                        {t("genreVariant.title")}
                                    </h3>
                                    <p className="text-purple-700 text-sm mt-1">
                                        {t("genreVariant.subtitle")}
                                    </p>
                                    <div className="mt-4 bg-white rounded-xl p-4 border border-purple-200">
                                        <p className="text-xs text-purple-600 mb-2">
                                            {t("genreVariant.orderSummary")}
                                        </p>
                                        <p className="font-semibold text-charcoal">
                                            {hasMultipleVariantGenres
                                                ? t("genreVariant.styleVersions", {
                                                    genres: variantGenresLabel,
                                                })
                                                : t("genreVariant.styleVersion", {
                                                    genre: variantGenresLabel || (order && (genreLabels[order.genre] || order.genre)),
                                                })}
                                        </p>
                                        <p className="text-xs text-charcoal/60 mt-1">
                                            {t("genreVariant.sameLyrics")}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Lyrics Upsell Summary */}
                    {isLyricsUpsell && (
                        <div className="bg-amber-50 rounded-3xl p-6 border border-amber-200 shadow-lg">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-6 h-6 text-amber-600" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-amber-900 text-lg">
                                        {t("lyricsUpsell.title")}
                                    </h3>
                                    <p className="text-amber-700 text-sm mt-1">
                                        {t("lyricsUpsell.subtitle")}
                                    </p>
                                    <div className="mt-4 bg-white rounded-xl p-4 border border-amber-200">
                                        <p className="text-xs text-amber-600 mb-2">
                                            {t("lyricsUpsell.orderSummary")}
                                        </p>
                                        <p className="font-semibold text-charcoal">
                                            {t("lyricsUpsell.productName")}
                                        </p>
                                        <p className="text-xs text-charcoal/60 mt-1">
                                            {t("lyricsUpsell.description")}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Karaoke Upsell Summary */}
                    {isKaraokeUpsell && (
                        <div className="bg-gradient-to-br from-rose-50 via-pink-50 to-orange-50 rounded-3xl p-6 border border-rose-200 shadow-lg">
                            <div className="text-center mb-5">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center mx-auto shadow-md mb-4">
                                    <Mic2 className="w-8 h-8 text-rose-600" />
                                </div>
                                <h3 className="font-bold text-rose-900 text-2xl">
                                    {t("karaokeUpsell.title")}
                                </h3>
                                <p className="text-rose-700 mt-1">
                                    {t("karaokeUpsell.subtitle")}
                                </p>
                            </div>

                            <div className="bg-white rounded-2xl p-5 border border-rose-200 shadow-sm space-y-3">
                                <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">
                                    {t("karaokeUpsell.orderSummary")}
                                </p>
                                <p className="font-bold text-charcoal text-lg">
                                    {t("karaokeUpsell.productName")}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800">
                                        {order?.recipientName}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-pink-100 px-3 py-1 text-sm font-semibold text-pink-800">
                                        {order?.genre ? (genreLabels[order.genre] || order.genre) : ""}
                                    </span>
                                </div>
                                <p className="text-sm text-charcoal/60">
                                    {t("karaokeUpsell.description")}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Streaming VIP Summary */}
                    {isStreamingUpsell && (
                        <>
                        <div className="bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 rounded-3xl p-6 border border-sky-200 shadow-lg">
                            {/* Header with CTA */}
                            <div className="text-center mb-5">
                                <p className="text-sm font-semibold text-sky-700 uppercase tracking-wide mb-3">
                                    {t("streamingVip.paymentTitle")}
                                </p>
                                <div className="flex justify-center mb-3">
                                    <div className="flex -space-x-2">
                                        <div className="w-11 h-11 rounded-full bg-[#1DB954] flex items-center justify-center shadow-lg ring-2 ring-white">
                                            <SpotifyIcon className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center shadow-lg ring-2 ring-white">
                                            <InstagramIcon className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="w-11 h-11 rounded-full bg-black flex items-center justify-center shadow-lg ring-2 ring-white">
                                            <TikTokIcon className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="w-11 h-11 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg ring-2 ring-white">
                                            <WhatsAppIcon className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                </div>
                                <h3 className="font-bold text-sky-900 text-2xl">
                                    {t("streamingVip.title")}
                                </h3>
                                <p className="text-sky-700 text-base mt-1">
                                    {t("streamingVip.subtitle")}
                                </p>
                            </div>

                            {/* Song details + How It Works (side by side) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div className="bg-white rounded-xl p-4 border border-sky-200">
                                    <p className="font-semibold text-charcoal text-lg">
                                        {t("streamingVip.songFor", { name: order?.recipientName || "..." })}
                                    </p>
                                    <p className="text-sm text-charcoal/70 mt-1">
                                        {t("streamingVip.genreLabel", { genre: order?.genre ? (genreLabels[order.genre] || order.genre) : "..." })}
                                    </p>
                                    <p className="text-xs text-sky-600 mt-2 font-medium">
                                        {t("streamingVip.singleSong")}
                                    </p>
                                </div>

                                {/* How It Works Audio (PT only) */}
                                {locale === "pt" && (
                                    <div className="bg-white/60 rounded-xl p-4 border border-sky-100 flex flex-col">
                                        <p className="text-sm font-semibold text-sky-700 uppercase tracking-wide mb-2">
                                            {t("streamingVip.howItWorks")}
                                        </p>
                                        <div className="flex-1 flex items-center">
                                            <WhatsappAudioPlayer
                                                src="https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/upsell-spotify.mp3"
                                                compact
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* What's included */}
                            <div className="bg-white/60 rounded-xl p-4 border border-sky-100">
                                <p className="text-sm font-semibold text-sky-700 uppercase tracking-wide mb-3">
                                    {t("streamingVip.includedItems")}
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-base text-charcoal">
                                        <CheckCircle2 className="w-5 h-5 text-[#1DB954] flex-shrink-0" />
                                        {t("streamingVip.item1")}
                                    </li>
                                    <li className="flex items-center gap-3 text-base text-charcoal">
                                        <CheckCircle2 className="w-5 h-5 text-[#1DB954] flex-shrink-0" />
                                        {t("streamingVip.item2")}
                                    </li>
                                    <li className="flex items-center gap-3 text-base text-charcoal">
                                        <CheckCircle2 className="w-5 h-5 text-[#1DB954] flex-shrink-0" />
                                        {t("streamingVip.item3")}
                                    </li>
                                    <li className="flex items-center gap-3 text-base text-charcoal">
                                        <CheckCircle2 className="w-5 h-5 text-[#1DB954] flex-shrink-0" />
                                        {t("streamingVip.item4")}
                                    </li>
                                    <li className="flex items-center gap-3 text-base text-charcoal">
                                        <CheckCircle2 className="w-5 h-5 text-[#25D366] flex-shrink-0" />
                                        {t("streamingVip.item5")}
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Arrow pointing to payment */}
                        <div className="flex justify-center py-2">
                            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center animate-bounce">
                                <ChevronDown className="w-6 h-6 text-sky-600" />
                            </div>
                        </div>
                        </>
                    )}

                    {/* Musician Tip Summary */}
                    {isMusicianTip && (
                        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 rounded-3xl p-6 border border-orange-200 shadow-lg">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                                    <Heart className="w-6 h-6 text-rose-500" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-charcoal text-lg">
                                        {t("musicianTip.title")}
                                    </h3>
                                    <p className="text-charcoal/70 text-sm mt-1">
                                        {t("musicianTip.subtitle")}
                                    </p>
                                    <div className="mt-4 bg-white rounded-xl p-4 border border-orange-200">
                                        <p className="text-xs text-orange-600 mb-2">
                                            {t("musicianTip.orderSummary")}
                                        </p>
                                        <p className="font-semibold text-charcoal">
                                            {t("musicianTip.productName")}
                                        </p>
                                        <p className="text-xs text-charcoal/60 mt-1">
                                            {t("musicianTip.description")}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Plan Selection for plan-based pricing (only for MAIN orders) */}
                    {usesPlanPricing && !planConfirmed && !isExtraSong && !isGenreVariant && !isLyricsUpsell && !isStreamingUpsell && !isMusicianTip && !isKaraokeUpsell && (
                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                            <PlanSelector
                                selectedPlan={selectedPlan}
                                onPlanChange={setSelectedPlan}
                                onConfirm={handlePlanConfirm}
                                isUpdating={updatePlanMutation.isPending}
                                hasExtraSong={order.childOrders.length > 0}
                                currency={order.currency}
                                locale={locale}
                            />
                        </div>
                    )}

                    {/* Payment Section - show after plan is confirmed */}
                    {planConfirmed && (
                        <>
                            <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                                {!isStreamingUpsell && (
                                    <h3 className="font-bold text-charcoal text-lg mb-4">
                                        {t("paymentDetails")}
                                    </h3>
                                )}

                                {paymentError && (
                                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {paymentError}
                                    </div>
                                )}

                                {clientSecret ? (
                                    <Elements stripe={stripePromise} options={stripeOptions}>
                                        <CheckoutForm
                                            orderId={orderId}
                                            price={currentPrice ?? order.priceAtOrder}
                                            currency={order.currency}
                                            locale={locale}
                                            email={order.email}
                                            bundleOrderIds={bundleOrderIds}
                                        />
                                    </Elements>
                                ) : (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-dark" />
                                    </div>
                                )}
                            </div>

                            {/* Trust Badges */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white rounded-2xl p-4 border border-charcoal/10 flex items-center gap-3">
                                    <Shield className="w-5 h-5 text-green-600" />
                                    <span className="text-sm text-charcoal">{t("securePayment")}</span>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-charcoal/10 flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    <span className="text-sm text-charcoal">{t("moneyBack")}</span>
                                </div>
                            </div>

                            {/* Pix Info for BRL */}
                            {order.currency === "BRL" && (
                                <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
                                    <p className="text-sm text-green-800 text-center">
                                        {t("pixInfo")}
                                    </p>
                                </div>
                            )}

                            {/* Cover Art Examples for Streaming VIP */}
                            {isStreamingUpsell && (
                                <CoverArtSlider
                                    title={t("streamingVip.coversTitle")}
                                    subtitle={t("streamingVip.coversSubtitle")}
                                />
                            )}
                        </>
                    )}

                    {/* Order ID for reference */}
                    <p className="text-center text-xs text-charcoal/30">
                        Order ID: {orderId}
                    </p>
                </div>
            </div>
        </div>
    );
}

// Checkout Form Component
type CheckoutFormProps = {
    orderId: string;
    price: number;
    currency: string;
    locale: string;
    email: string;
    bundleOrderIds?: string[] | null;
};

function CheckoutForm({ orderId, price, currency, locale, email, bundleOrderIds }: CheckoutFormProps) {
    const t = useTranslations("checkout");
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasTrackedPaymentRef = useRef(false);

    const formatPrice = (cents: number, curr: string) => {
        const amount = cents / 100;
        if (curr === "BRL") {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        if (curr === "EUR") {
            return `€${amount.toFixed(2)}`;
        }
        return `$${amount.toFixed(2)} USD`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsProcessing(true);
        setError(null);

        if (!hasTrackedPaymentRef.current) {
            window.fbq?.("track", "AddPaymentInfo", {
                content_ids: [orderId],
                content_type: "product",
                value: price / 100,
                currency,
            });
            window.ttq?.track?.("AddPaymentInfo", {
                content_id: orderId,
                content_type: "product",
                value: price / 100,
                currency,
            });
            hasTrackedPaymentRef.current = true;
        }

        const { error: submitError } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: (() => {
                    const baseUrl = `${window.location.origin}/${locale}/order/${orderId}/success`;
                    if (!bundleOrderIds || bundleOrderIds.length <= 1) return baseUrl;
                    const orderIdsParam = encodeURIComponent(bundleOrderIds.join(","));
                    return `${baseUrl}?orderIds=${orderIdsParam}`;
                })(),
            },
        });

        if (submitError) {
            setError(submitError.message || t("error.paymentFailed"));
            setIsProcessing(false);
        }
        // If no error, Stripe will redirect to return_url
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement
                options={{
                    layout: "tabs",
                    paymentMethodOrder: currency === "BRL" ? ["pix", "card"] : ["card"],
                    defaultValues: {
                        billingDetails: {
                            email,
                        },
                    },
                }}
            />

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={!stripe || !elements || isProcessing}
                className={cn(
                    "w-full flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white text-lg font-semibold transition-all shadow-lg",
                    isProcessing || !stripe
                        ? "bg-[#4A8E9A]/70 cursor-not-allowed"
                        : "bg-[#4A8E9A] hover:bg-[#F0EDE6] active:scale-[0.98]"
                )}
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t("processing")}
                    </>
                ) : (
                    <>
                        {t("payButton")} - {formatPrice(price, currency)}
                    </>
                )}
            </button>

            <p className="text-xs text-charcoal/50 text-center">
                {t("securePaymentNote")}
            </p>

            {/* One-time payment notice for non-BRL locales */}
            {currency !== "BRL" && (
                <p className="text-xs text-charcoal/40 text-center pt-2 border-t border-charcoal/10">
                    {t("oneTimePayment")}
                </p>
            )}
        </form>
    );
}
