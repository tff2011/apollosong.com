"use client";

import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Music, Edit2, Gift, Pause, CheckCircle2, Shield, Star, Clock, Sparkles, Heart, FileText, X, ChevronLeft, ChevronRight, Loader2, Zap, Rocket, Check, Mic, Square, AlertCircle, Volume2, Wand2, Tag } from "lucide-react";
import { useTranslations, useLocale } from "~/i18n/provider";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
    collectBrowserInfo,
    collectTrafficSource,
    collectSessionAnalytics,
    initSessionTracking,
} from "~/lib/analytics/browser-info";
import { OrderBumpModal } from "./order-bump-modal";
import type { OrderBumpSelection, BRLPlanType } from "~/lib/validations/song-order";
import { useAudioTranscription, type TranscriptionStatus } from "~/hooks/use-audio-transcription";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { applyCouponDiscount } from "~/lib/discount-coupons";

type QuizData = {
    recipient: string;
    name: string;
    relationship: string; // Custom relationship when recipient is "other"
    genre: string;
    vocals: string;
    qualities: string;
    memories: string;
    message: string;
    email: string;
    whatsapp: string;
};

type AppliedCoupon = {
    code: string;
    discountPercent: number;
};

// Step slugs for URL parameter
const STEP_SLUGS_EN = ["basics", "genre", "qualities", "memories", "message", "checkout"] as const;
const STEP_SLUGS_PT = ["basics", "genre", "qualities", "memories", "message", "plans", "checkout"] as const;
const STEP_SLUGS_ES = ["basics", "genre", "qualities", "memories", "message", "plans", "checkout"] as const; // Spanish also has plans
const STEP_SLUGS_FR = ["basics", "genre", "qualities", "memories", "message", "plans", "checkout"] as const; // French also has plans
const STEP_SLUGS_IT = ["basics", "genre", "qualities", "memories", "message", "plans", "checkout"] as const; // Italian also has plans

type StepSlugEN = (typeof STEP_SLUGS_EN)[number];
type StepSlugPT = (typeof STEP_SLUGS_PT)[number];
type StepSlugES = (typeof STEP_SLUGS_ES)[number];
type StepSlugFR = (typeof STEP_SLUGS_FR)[number];
type StepSlugIT = (typeof STEP_SLUGS_IT)[number];
type StepSlug = StepSlugEN | StepSlugPT | StepSlugES | StepSlugFR | StepSlugIT;

const TOTAL_STEPS_EN = 6;
const TOTAL_STEPS_ES = 7; // Spanish has plans step
const TOTAL_STEPS_PT = 7;
const TOTAL_STEPS_FR = 7; // French has plans step
const TOTAL_STEPS_IT = 7; // Italian has plans step

const EUR_PLAN_PRICES_CENTS = {
    fr: { essencial: 6900, express: 9900, acelerado: 12900 },
    it: { essencial: 6900, express: 9900, acelerado: 12900 },
} as const;

const getEurPlanPriceCents = (locale: string, plan: BRLPlanType) =>
    (locale === "fr" ? EUR_PLAN_PRICES_CENTS.fr : EUR_PLAN_PRICES_CENTS.it)[plan];

const BRL_PLAN_PRICES_CENTS: Record<BRLPlanType, number> = {
    essencial: 6990,
    express: 9990,
    acelerado: 19990,
};

const ES_PLAN_PRICES_CENTS: Record<BRLPlanType, number> = {
    essencial: 1700,
    express: 2700,
    acelerado: 3700,
};

const recipientOptions = ["husband", "wife", "boyfriend", "girlfriend", "children", "father", "mother", "sibling", "friend", "myself", "group", "other"] as const;
// Ordered by sales (most sold first)
const genreOptionsEN = ["pop", "country", "worship", "rock", "rnb", "jazz", "blues", "hiphop"] as const;
// PT genres ordered by sales: samba(714), worship(527), country/sertanejo(325+), pagode(287+), mpb(226+), pop(113), jovem-guarda(67), forro(56+), reggae(40), rock(33+), hiphop(24), jazz(23), rnb(20), axe(19), brega(19), lullaby(13), capoeira(4), funk(7), blues(0)
const genreOptionsPT = ["samba", "worship", "country", "pagode", "mpb", "pop", "jovem-guarda", "forro", "reggae", "rock", "eletronica", "latina", "hiphop", "jazz", "rnb", "axe", "brega", "lullaby", "capoeira", "funk", "blues", "bolero", "tango", "valsa", "musica-classica"] as const;
const forroSubgenresPT = ["forro-pe-de-serra-rapido", "forro-pe-de-serra-lento", "forro-universitario", "forro-eletronico"] as const;
const sertanejoSubgenresPT = ["sertanejo-raiz", "sertanejo-universitario", "sertanejo-romantico"] as const;
const funkSubgenresPT = ["funk-carioca", "funk-paulista", "funk-melody"] as const;
const rockSubgenresPT = ["rock-classico", "pop-rock-brasileiro", "heavy-metal"] as const;
const bregaSubgenresPT = ["brega-romantico", "tecnobrega"] as const;
const pagodeSubgenresPT = ["pagode-de-mesa", "pagode-romantico", "pagode-universitario"] as const;
const mpbSubgenresPT = ["mpb-bossa-nova", "mpb-cancao-brasileira", "mpb-pop", "mpb-intimista"] as const;
const eletronicaSubgenresPT = ["eletronica-afro-house", "eletronica-progressive-house", "eletronica-melodic-techno"] as const;
const lullabySubgenresPT = ["lullaby-ninar", "lullaby-animada"] as const;
const latinaSubgenresPT = ["salsa", "merengue", "bachata"] as const;
const bluesSubgenres = ["blues-melancholic", "blues-upbeat"] as const;
const genreOptionsPTAll = [...genreOptionsPT, ...forroSubgenresPT, ...sertanejoSubgenresPT, ...funkSubgenresPT, ...rockSubgenresPT, ...bregaSubgenresPT, ...pagodeSubgenresPT, ...mpbSubgenresPT, ...eletronicaSubgenresPT, ...lullabySubgenresPT, ...latinaSubgenresPT, ...bluesSubgenres] as const;
// ES genres ordered by sales: balada(4), adoracion(2), cumbia(1), salsa(1), rest by popularity
const genreOptionsES = ["balada", "adoracion", "cumbia", "salsa", "bachata", "ranchera", "pop", "rock", "rnb", "hiphop", "blues", "tango"] as const;
// FR genres ordered by sales: chanson(5), balada(4), rock(1), rest by popularity
const genreOptionsFR = ["chanson", "balada", "rock", "variete", "worship", "pop", "jazz", "rnb", "hiphop", "blues"] as const;
// IT genres ordered by sales: balada(2), rest by popularity
const genreOptionsIT = ["balada", "napoletana", "worship", "lirico", "pop", "jazz", "lullaby", "tarantella", "rock", "blues"] as const;
const genreOptionsENAll = [...genreOptionsEN, ...bluesSubgenres] as const;
const genreOptionsESAll = [...genreOptionsES, ...bluesSubgenres] as const;
const genreOptionsFRAll = [...genreOptionsFR, ...bluesSubgenres] as const;
const genreOptionsITAll = [...genreOptionsIT, ...bluesSubgenres] as const;
const vocalOptions = ["female", "male", "either"] as const;
const isForroSubgenre = (genre: string) => (forroSubgenresPT as readonly string[]).includes(genre);
const isSertanejoSubgenre = (genre: string) => (sertanejoSubgenresPT as readonly string[]).includes(genre);
const isFunkSubgenre = (genre: string) => (funkSubgenresPT as readonly string[]).includes(genre);
const isRockSubgenre = (genre: string) => (rockSubgenresPT as readonly string[]).includes(genre);
const isBregaSubgenre = (genre: string) => (bregaSubgenresPT as readonly string[]).includes(genre);
const isPagodeSubgenre = (genre: string) => (pagodeSubgenresPT as readonly string[]).includes(genre);
const isMpbSubgenre = (genre: string) => (mpbSubgenresPT as readonly string[]).includes(genre);
const isEletronicaSubgenre = (genre: string) => (eletronicaSubgenresPT as readonly string[]).includes(genre);
const isLullabySubgenre = (genre: string) => (lullabySubgenresPT as readonly string[]).includes(genre);
const isLatinaSubgenre = (genre: string) => (latinaSubgenresPT as readonly string[]).includes(genre);
const isBluesSubgenre = (genre: string) => (bluesSubgenres as readonly string[]).includes(genre);

// Helper to render text with **bold** markdown
function renderWithBold(text: string) {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    );
}

// Helper to count words in text
function countWords(text: string): number {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Word counter component
function WordCounter({ text, locale }: { text: string; locale: string }) {
    const count = countWords(text);
    const label = locale === "pt" ? "palavras"
        : locale === "es" ? "palabras"
            : locale === "fr" ? "mots"
                : locale === "it" ? "parole"
                    : "words";

    return (
        <span className="text-xs text-charcoal/40 tabular-nums">
            {count} {label}
        </span>
    );
}

type RecipientOption = (typeof recipientOptions)[number];
type GenreOption =
    | (typeof genreOptionsENAll)[number]
    | (typeof genreOptionsPTAll)[number]
    | (typeof genreOptionsESAll)[number]
    | (typeof genreOptionsFRAll)[number]
    | (typeof genreOptionsITAll)[number];
type VocalOption = (typeof vocalOptions)[number];

// Get delivery date based on plan (for PT/ES/FR/IT) or 7 days (for USD)
function getDeliveryDate(locale: string, plan?: BRLPlanType): string {
    const date = new Date();
    const usesPlanPricing = locale === "pt" || locale === "es" || locale === "fr" || locale === "it";

    // For plan-based locales, calculate based on plan
    if (usesPlanPricing && plan) {
        const daysMap: Record<BRLPlanType, number> = {
            essencial: 7,
            express: 1,
            acelerado: 1,
        };
        date.setDate(date.getDate() + daysMap[plan]);

        if (plan === "acelerado") {
            if (locale === "es") return "hasta 6h";
            if (locale === "fr") return "sous 6h";
            if (locale === "it") return "entro 6h";
            return "até 6h";
        }

        // For express, show localized "within 24h" instead of date
        if (plan === "express") {
            if (locale === "es") return "hasta 24h";
            if (locale === "fr") return "sous 24h";
            if (locale === "it") return "entro 24h";
            return "até 24h"; // pt
        }

        if (locale === "es") {
            return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
        }
        if (locale === "fr") {
            return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        }
        if (locale === "it") {
            return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
        }
        return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    }

    // Default: 7 days
    date.setDate(date.getDate() + 7);

    if (locale === "pt") {
        return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    }
    if (locale === "es") {
        return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    }
    if (locale === "fr") {
        return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    }
    if (locale === "it") {
        return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

import { StepRecap } from "./step-recap";

type GenreAudioSample = {
    genre: string;
    audioUrl: string;
    vocals: string;
};

type SongQuizProps = {
    genreAudioSamples?: GenreAudioSample[];
};

// Compact play button for genre previews
function GenrePlayButton({ audioUrl }: { audioUrl: string }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const playerId = useId();

    // Listen for global event to pause when another player starts
    useEffect(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            if (customEvent.detail !== playerId && audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        };
        window.addEventListener("whatsapp-audio-play", handler);
        return () => window.removeEventListener("whatsapp-audio-play", handler);
    }, [playerId]);

    // Handle audio events
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = () => setIsPlaying(false);
        const handlePause = () => setIsPlaying(false);
        const handlePlay = () => {
            setIsPlaying(true);
            setIsLoading(false);
        };
        const handleWaiting = () => setIsLoading(true);
        const handleCanPlay = () => setIsLoading(false);

        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("waiting", handleWaiting);
        audio.addEventListener("canplay", handleCanPlay);

        return () => {
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("waiting", handleWaiting);
            audio.removeEventListener("canplay", handleCanPlay);
        };
    }, []);

    const toggle = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger parent button click
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            // Dispatch event to pause other players first
            window.dispatchEvent(new CustomEvent("whatsapp-audio-play", { detail: playerId }));
            setIsLoading(true);
            try {
                await audio.play();
            } catch (err) {
                // Play was prevented (e.g., iOS Safari autoplay policy)
                console.warn("Audio play failed:", err);
                setIsLoading(false);
            }
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={isLoading}
            className="w-full py-4 text-left rounded-2xl"
            title={isPlaying ? "Pausar" : "Ouvir amostra"}
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
                <Pause className="w-4 h-4" />
            ) : (
                <Volume2 className="w-4 h-4" />
            )}
            <audio ref={audioRef} src={audioUrl} preload="none" />
        </button>
    );
}

export function SongQuiz({ genreAudioSamples = [] }: SongQuizProps) {
    const t = useTranslations("create.quiz");
    const common = useTranslations("common");
    const locale = useLocale();
    const brand = common("brand");
    const searchParams = useSearchParams();
    const router = useRouter();
    const hasTrackedViewContentRef = useRef(false);
    const hasTrackedAddToCartRef = useRef(false);
    const currency = locale === "pt" ? "BRL" : (locale === "fr" || locale === "it") ? "EUR" : "USD";

    // Check if this locale uses plan-based pricing
    const usesPlanPricing = locale === "pt" || locale === "es" || locale === "fr" || locale === "it";

    // Use locale-specific step configuration
    const STEP_SLUGS = locale === "pt" ? STEP_SLUGS_PT : locale === "es" ? STEP_SLUGS_ES : locale === "fr" ? STEP_SLUGS_FR : locale === "it" ? STEP_SLUGS_IT : STEP_SLUGS_EN;
    const TOTAL_STEPS = locale === "pt" ? TOTAL_STEPS_PT : locale === "es" ? TOTAL_STEPS_ES : locale === "fr" ? TOTAL_STEPS_FR : locale === "it" ? TOTAL_STEPS_IT : TOTAL_STEPS_EN;

    // localStorage key for quiz persistence
    const STORAGE_KEY = `quiz_data_${locale}`;

    // Track if localStorage has been loaded (to prevent hydration mismatch)
    const [isHydrated, setIsHydrated] = useState(false);

    // Selected plan for BRL (default: express)
    const [selectedPlan, setSelectedPlan] = useState<BRLPlanType>("express");
    const isPremiumSixHourPlan = selectedPlan === "acelerado";

    const applyPlanIncludedBumps = useCallback((bumps: OrderBumpSelection): OrderBumpSelection => {
        if (!isPremiumSixHourPlan) return bumps;
        return {
            ...bumps,
            certificate: true,
            lyrics: true,
        };
    }, [isPremiumSixHourPlan]);

    // Price based on plan for plan-based locales
    const getPriceValue = () => {
        if (currency === "BRL") {
            return BRL_PLAN_PRICES_CENTS[selectedPlan] / 100;
        }
        if (currency === "EUR") {
            const planPriceCents = getEurPlanPriceCents(locale, selectedPlan);
            return planPriceCents / 100;
        }
        if (usesPlanPricing) {
            // ES uses USD with plans: $17/$27/$37
            return ES_PLAN_PRICES_CENTS[selectedPlan] / 100;
        }
        return 99;
    };
    const priceValue = getPriceValue();

    // Get initial step from URL slug or default to 1
    const getInitialStep = (): number => {
        const slugParam = searchParams.get("step") as StepSlug | null;
        if (slugParam && (STEP_SLUGS as readonly string[]).includes(slugParam)) {
            return (STEP_SLUGS as readonly string[]).indexOf(slugParam) + 1;
        }
        return 1;
    };

    const [step, setStep] = useState(getInitialStep);
    const [data, setData] = useState<QuizData>({
        recipient: "",
        name: "",
        relationship: "",
        genre: "",
        vocals: "either",
        qualities: "",
        memories: "",
        message: "",
        email: "",
        whatsapp: "",
    });
    const [errors, setErrors] = useState<Partial<QuizData>>({});
    const [quizStartTime] = useState(() => new Date());
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showOrderBumpModal, setShowOrderBumpModal] = useState(false);
    const [orderBumpMode, setOrderBumpMode] = useState<"edit" | "submit">("submit");
    const [orderBumpGenre, setOrderBumpGenre] = useState("");
    const [orderBumps, setOrderBumps] = useState<OrderBumpSelection>({
        fastDelivery: false,
        extraSong: false,
        extraSongData: null,
        genreVariants: [],
        certificate: false,
        lyrics: false,
    });
    const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
    const [orderBumpsReviewed, setOrderBumpsReviewed] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
    const [showPendingOrderDialog, setShowPendingOrderDialog] = useState(false);
    const latestGenreRef = useRef("");

    // Create sample map for genre audio previews (keyed by "genre:vocals")
    const genreAudioMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const sample of genreAudioSamples) {
            map.set(`${sample.genre}:${sample.vocals}`, sample.audioUrl);
        }
        return map;
    }, [genreAudioSamples]);

    // Get audio URL for a genre based on vocals preference
    // If vocals is "female" -> use female, otherwise default to male
    const getGenreAudioUrl = useCallback((genre: string) => {
        const effectiveVocals = data.vocals === "female" ? "female" : "male";
        return genreAudioMap.get(`${genre}:${effectiveVocals}`);
    }, [data.vocals, genreAudioMap]);

    // Base price in cents (based on selected plan for plan-based locales)
    const basePriceInCents = currency === "BRL"
        ? BRL_PLAN_PRICES_CENTS[selectedPlan]
        : currency === "EUR"
            ? getEurPlanPriceCents(locale, selectedPlan) // €69/€99/€129 for FR/IT
            : usesPlanPricing
                ? ES_PLAN_PRICES_CENTS[selectedPlan] // $17/$27/$37 for ES
                : 9900; // $99 for USD (EN)

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (currency === "BRL") return `R$${amount.toFixed(2).replace(".", ",")}`;
        if (currency === "EUR") return `€${amount.toFixed(2)}`;
        return `$${amount.toFixed(2)} USD`;
    };

    // Load saved data from localStorage after hydration (prevents hydration mismatch)
    // Also check for pending order and offer to resume.
    useEffect(() => {
        try {
            const pending = localStorage.getItem(`pending_order_${locale}`);
            if (pending) {
                setPendingOrderId(pending);
                setShowPendingOrderDialog(true);
            }

            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as {
                    data?: QuizData;
                    selectedPlan?: BRLPlanType;
                    orderBumps?: OrderBumpSelection;
                    orderBumpsReviewed?: boolean;
                };
                if (parsed.data) setData(parsed.data);
                if (parsed.selectedPlan) setSelectedPlan(parsed.selectedPlan);
                if (parsed.orderBumps) setOrderBumps(parsed.orderBumps);
                if (typeof parsed.orderBumpsReviewed === "boolean") {
                    setOrderBumpsReviewed(parsed.orderBumpsReviewed);
                }
            }
        } catch (e) {
            console.error("Failed to load quiz data from localStorage:", e);
        }
        setIsHydrated(true);
    }, [STORAGE_KEY, locale]);

    useEffect(() => {
        if (!data.genre) return;
        latestGenreRef.current = data.genre;
        setOrderBumpGenre(data.genre);
    }, [data.genre]);

    // Reset order bumps review when plan changes so the modal is shown again
    const prevPlanRef = useRef(selectedPlan);
    useEffect(() => {
        if (prevPlanRef.current !== selectedPlan) {
            prevPlanRef.current = selectedPlan;
            setOrderBumpsReviewed(false);
        }
    }, [selectedPlan]);

    const pendingOrderFor = (() => {
        const name = data.name?.trim();
        if (name) return name;
        const recipient = data.recipient?.trim();
        if (!recipient) return null;
        try {
            return t(`steps.basics.recipient.options.${recipient}`);
        } catch {
            return recipient;
        }
    })();

    const pendingOrderGenre = (() => {
        const genreKey = data.genre?.trim();
        if (!genreKey) return null;
        try {
            return t(`steps.genre.genre.options.${genreKey}`);
        } catch {
            return genreKey;
        }
    })();

    const pendingOrderPlan = (() => {
        if (!usesPlanPricing) return null;
        const prefix =
            locale === "fr"
                ? "Forfait"
                : locale === "es"
                    ? "Plan"
                    : locale === "it"
                        ? "Piano"
                        : "Plano";
        const name =
            selectedPlan === "essencial"
                ? (locale === "es"
                    ? "Esencial"
                    : locale === "fr"
                        ? "Essentiel"
                        : locale === "it"
                            ? "Essenziale"
                            : "Essencial")
                : selectedPlan === "acelerado"
                    ? "Turbo"
                    : "Express";
        return `${prefix} ${name}`;
    })();

    const effectiveOrderBumps = applyPlanIncludedBumps(orderBumps);

    const pendingExtrasSummary = (() => {
        const labels: string[] = [];
        if (!usesPlanPricing && effectiveOrderBumps.fastDelivery) labels.push(t("orderBump.fastDelivery.title"));
        if ((effectiveOrderBumps.genreVariants?.length ?? 0) > 0) labels.push(t("orderBump.genreVariant.title"));
        if (effectiveOrderBumps.certificate) labels.push(t("orderBump.certificate.title"));
        if (effectiveOrderBumps.lyrics) labels.push(t("orderBump.lyrics.title"));
        if (effectiveOrderBumps.extraSong) labels.push(t("orderBump.extraSong.title"));
        return labels.length > 0 ? labels.join(", ") : null;
    })();

    const pendingExtrasTotalInCents = (() => {
        const isEURLocale = currency === "EUR";
        const showFastDelivery = !usesPlanPricing;
        const fastDeliveryPrice = 4900;
        const genreVariantPrice = locale === "es" ? 999 : isEURLocale ? 2900 : 3990;
        const certificatePrice = locale === "es" ? 999 : isEURLocale ? 1900 : 1990;
        const lyricsPrice = locale === "es" ? 999 : isEURLocale ? 900 : locale === "pt" ? 1490 : 990;
        const extraSongPrice = locale === "es" ? 999 : isEURLocale ? 2900 : currency === "BRL" ? 4990 : 4950;
        const chargeCertificate = effectiveOrderBumps.certificate && !isPremiumSixHourPlan;
        const chargeLyrics = effectiveOrderBumps.lyrics && !isPremiumSixHourPlan;

        return (
            (showFastDelivery && effectiveOrderBumps.fastDelivery ? fastDeliveryPrice : 0) +
            (effectiveOrderBumps.genreVariants?.length ?? 0) * genreVariantPrice +
            (chargeCertificate ? certificatePrice : 0) +
            (chargeLyrics ? lyricsPrice : 0) +
            (effectiveOrderBumps.extraSong ? extraSongPrice : 0)
        );
    })();

    const pendingOrderSubtotalInCents = basePriceInCents + pendingExtrasTotalInCents;
    const pendingOrderTotalInCents = appliedCoupon
        ? applyCouponDiscount(pendingOrderSubtotalInCents, appliedCoupon.discountPercent).finalTotal
        : pendingOrderSubtotalInCents;

    // Initialize session tracking on mount
    useEffect(() => {
        initSessionTracking();
    }, []);

    // Validate step access - redirect to step 1 if data is incomplete for current step
    useEffect(() => {
        // Wait for localStorage to load first to avoid race condition
        if (!isHydrated) return;

        const isDataComplete = (targetStep: number): boolean => {
            if (targetStep <= 1) return true;
            if (targetStep >= 2 && (!data.recipient || (data.recipient !== "group" && !data.name.trim()))) return false;
            if (targetStep >= 3 && !data.genre) return false;
            if (targetStep >= 4 && data.qualities.trim().length < 10) return false;
            // Memories is now optional
            return true;
        };

        if (!isDataComplete(step)) {
            setStep(1);
            // Update URL to reflect step 1
            const newUrl = `/${locale}/create`;
            window.history.replaceState({}, "", newUrl);
        }
    }, [step, data, locale, isHydrated]);

    useEffect(() => {
        if (hasTrackedViewContentRef.current) return;

        window.fbq?.("track", "ViewContent", {
            content_name: "Custom Song",
            content_type: "product",
            value: priceValue,
            currency,
        });
        window.ttq?.track?.("ViewContent", {
            content_id: "custom_song",
            content_name: "Custom Song",
            content_type: "product",
            value: priceValue,
            currency,
        });
        hasTrackedViewContentRef.current = true;
    }, [currency, priceValue]);

    // Create order mutation
    const createOrder = api.songOrder.create.useMutation({
        onSuccess: (result) => {
            // Save orderId so the user can resume checkout without losing their draft.
            try {
                localStorage.setItem(`pending_order_${locale}`, result.orderId);
            } catch (e) {
                console.error("Failed to update localStorage:", e);
            }

            if (!hasTrackedAddToCartRef.current) {
                window.fbq?.("track", "AddToCart", {
                    content_ids: [result.orderId],
                    content_name: "Custom Song",
                    content_type: "product",
                    value: priceValue,
                    currency,
                });
                window.ttq?.track?.("AddToCart", {
                    content_id: result.orderId,
                    content_name: "Custom Song",
                    content_type: "product",
                    value: priceValue,
                    currency,
                });
                hasTrackedAddToCartRef.current = true;
            }
            window.fbq?.("track", "Lead", {
                content_name: "Song Order Quiz",
            });
            window.ttq?.track?.("SubmitForm", {
                content_name: "Song Order Quiz",
            });
            // Use push so browser back button returns to checkout step
            router.push(`/${locale}/order/${result.orderId}`);
        },
        onError: (error) => {
            console.error("Failed to create order:", error);
            setSubmitError(error.message || t("validation.submitError"));
        },
    });

    // Update URL when step changes
    useEffect(() => {
        const slug = STEP_SLUGS[step - 1];
        if (!slug) return;
        const url = new URL(window.location.href);
        url.searchParams.set("step", slug);
        router.replace(url.pathname + url.search, { scroll: false });
    }, [step, router]);

    // Scroll to top on every step change (separate effect to ensure it always runs)
    useEffect(() => {
        // Use setTimeout to ensure the DOM has updated and mobile keyboard is dismissed
        // "instant" behavior ensures the user sees the top immediately without fighting layout shifts
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        }, 50);
    }, [step]);

    // Save quiz data to localStorage when it changes
    useEffect(() => {
        if (typeof window === "undefined") return;
        // Only save if there's meaningful data
        if (data.recipient || data.name) {
            try {
                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({
                        data,
                        selectedPlan,
                        orderBumps,
                        orderBumpsReviewed,
                    })
                );
            } catch (e) {
                console.error("Failed to save quiz data to localStorage:", e);
            }
        }
    }, [data, selectedPlan, orderBumps, orderBumpsReviewed, STORAGE_KEY]);

    const progress = (step / TOTAL_STEPS) * 100;
    const requiresSubgenreSelection = (genre: string) =>
        genre === "blues" || (locale === "pt" && ["forro", "country", "funk", "rock", "brega", "pagode", "mpb", "eletronica", "lullaby", "latina"].includes(genre));

    const updateData = (field: keyof QuizData, value: string) => {
        if (field === "genre") {
            latestGenreRef.current = value;
        }
        setData(prev => {
            // When switching to group, clear name (and effectively keep it clear since input is disabled)
            if (field === "recipient" && value === "group") {
                return { ...prev, [field]: value, name: "" };
            }
            return { ...prev, [field]: value };
        });
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const validateStep = () => {
        const newErrors: Partial<QuizData> = {};

        if (step === 1) {
            if (!data.recipient) newErrors.recipient = t("validation.selectRecipient");
            if (data.recipient !== "group" && !data.name.trim()) newErrors.name = t("validation.enterName");
        } else if (step === 2) {
            if (!data.genre) newErrors.genre = t("validation.selectGenre");
            if (data.genre && requiresSubgenreSelection(data.genre)) {
                newErrors.genre = t("validation.selectSubgenre");
            }
        } else if (step === 3) {
            if (!data.qualities.trim()) {
                newErrors.qualities = t("validation.enterQualities");
            } else if (data.qualities.trim().length < 10) {
                newErrors.qualities = t("validation.qualitiesMinLength");
            }
        } else if (step === 4) {
            // Memories is optional, but if entered, should be at least 10 chars for quality
            if (data.memories.trim() && data.memories.trim().length < 10) {
                newErrors.memories = t("validation.memoriesMinLength");
            }
        } else if (step === 5) {
            // Message is optional, but if entered, should be at least 10 chars for quality
            if (data.message.trim() && data.message.trim().length < 10) {
                newErrors.message = t("validation.messageMinLength");
            }
        } else if (step === TOTAL_STEPS) {
            // Checkout step - validate email
            if (!data.email.trim()) {
                newErrors.email = t("validation.enterEmail");
            } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email)) {
                newErrors.email = t("validation.invalidEmail");
            }
        }
        // Step 6 in PT is "plans" - no validation needed

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const validateAllSteps = () => {
        const newErrors: Partial<QuizData> = {};

        if (!data.recipient) newErrors.recipient = t("validation.selectRecipient");
        if (data.recipient !== "group" && !data.name.trim()) newErrors.name = t("validation.enterName");
        if (!data.genre) newErrors.genre = t("validation.selectGenre");
        if (data.genre && requiresSubgenreSelection(data.genre)) {
            newErrors.genre = t("validation.selectSubgenre");
        }
        if (!data.qualities.trim()) {
            newErrors.qualities = t("validation.enterQualities");
        } else if (data.qualities.trim().length < 10) {
            newErrors.qualities = t("validation.qualitiesMinLength");
        }
        // Memories and Message are now optional
        if (data.memories.trim() && data.memories.trim().length < 10) {
            newErrors.memories = t("validation.memoriesMinLength");
        }
        if (data.message.trim() && data.message.trim().length < 10) {
            newErrors.message = t("validation.messageMinLength");
        }
        if (!data.email.trim()) {
            newErrors.email = t("validation.enterEmail");
        } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email)) {
            newErrors.email = t("validation.invalidEmail");
        }

        setErrors(newErrors);
        return newErrors;
    };

    const getStepForErrors = (newErrors: Partial<QuizData>) => {
        if (newErrors.recipient || newErrors.name) return 1;
        if (newErrors.genre) return 2;
        if (newErrors.qualities) return 3;
        if (newErrors.memories) return 4;
        if (newErrors.message) return 5;
        if (newErrors.email) return TOTAL_STEPS;
        return step;
    };

    const nextStep = () => {
        if (validateStep()) {
            setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
        }
    };

    const prevStep = () => {
        setStep(prev => Math.max(prev - 1, 1));
    };

    const goToStep = (targetStep: number) => {
        setStep(targetStep);
    };

    const openOrderBump = (mode: "edit" | "submit") => {
        setOrderBumpMode(mode);
        setOrderBumpGenre(latestGenreRef.current || data.genre);
        setShowOrderBumpModal(true);
    };

    const saveOrderBumps = (bumps: OrderBumpSelection) => {
        setOrderBumps(bumps);
        setOrderBumpsReviewed(true);
    };

    const submitOrderWithBumps = (bumps: OrderBumpSelection) => {
        const newErrors = validateAllSteps();
        if (Object.keys(newErrors).length > 0) {
            setStep(getStepForErrors(newErrors));
            return;
        }

        // Collect analytics data
        const browserInfo = collectBrowserInfo();
        const trafficSource = collectTrafficSource();
        const sessionAnalytics = collectSessionAnalytics(quizStartTime);
        const planAdjustedBumps = applyPlanIncludedBumps(bumps);

        // Submit order with order bump selections
        createOrder.mutate({
            quizData: {
                recipient: data.recipient as RecipientOption,
                name: data.name,
                genre: data.genre as GenreOption,
                vocals: data.vocals as VocalOption,
                qualities: data.qualities,
                memories: data.memories,
                message: data.message,
                email: data.email,
                whatsapp: data.whatsapp,
            },
            locale: locale as "en" | "pt" | "es" | "fr" | "it",
            currency,
            planType: usesPlanPricing ? selectedPlan : undefined,
            browserInfo,
            trafficSource,
            sessionAnalytics,
            orderBumps: planAdjustedBumps,
            couponCode: appliedCoupon?.code,
        });
    };

    const handleSubmit = () => {
        if (!validateStep()) return;
        if (data.genre && requiresSubgenreSelection(data.genre)) {
            setErrors({ genre: t("validation.selectSubgenre") });
            setStep(2);
            return;
        }
        setSubmitError(null);

        // First time: show extras modal so the user can review the total before paying.
        if (!orderBumpsReviewed) {
            openOrderBump("submit");
            return;
        }

        // Already reviewed: submit directly (extras are visible in the summary).
        submitOrderWithBumps(orderBumps);
    };

    const handleOrderBumpConfirm = (bumps: OrderBumpSelection) => {
        saveOrderBumps(bumps);
        setShowOrderBumpModal(false);

        if (orderBumpMode === "submit") {
            submitOrderWithBumps(bumps);
        }
    };

    return (
        <div className="min-h-screen bg-porcelain">
            {/* Pending order resume dialog */}
            {showPendingOrderDialog && pendingOrderId && (
                <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-5">
                    <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-charcoal/10 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-serif font-bold text-charcoal">
                                    {t("pendingOrder.title")}
                                </h2>
                                <p className="text-sm text-charcoal/60 mt-1">
                                    {t("pendingOrder.subtitle")}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPendingOrderDialog(false)}
                                className="flex items-center justify-center w-9 h-9 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors shrink-0"
                                aria-label={t("pendingOrder.close")}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {(pendingOrderFor || pendingOrderGenre || pendingOrderPlan) && (
                            <div className="mt-5 rounded-2xl border border-charcoal/10 bg-porcelain p-4">
                                <p className="text-xs font-semibold tracking-widest text-charcoal/45 uppercase">
                                    {t("pendingOrder.summaryTitle")}
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs text-charcoal/50">
                                            {t("pendingOrder.summaryFor")}
                                        </p>
                                        <p className="text-sm font-semibold text-charcoal truncate">
                                            {pendingOrderFor || "-"}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-charcoal/50">
                                            {t("pendingOrder.summaryGenre")}
                                        </p>
                                        <p className="text-sm font-semibold text-charcoal truncate">
                                            {pendingOrderGenre || "-"}
                                        </p>
                                    </div>
                                    {pendingOrderPlan ? (
                                        <div className="min-w-0">
                                            <p className="text-xs text-charcoal/50">
                                                {t("pendingOrder.summaryPlan")}
                                            </p>
                                            <p className="text-sm font-semibold text-charcoal truncate">
                                                {pendingOrderPlan}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="min-w-0 col-span-2">
                                            <p className="text-xs text-charcoal/50">
                                                {t("pendingOrder.summaryTotal")}
                                            </p>
                                            <p className="text-sm font-semibold text-charcoal tabular-nums whitespace-nowrap">
                                                {formatPrice(pendingOrderTotalInCents)}
                                            </p>
                                        </div>
                                    )}
                                    {pendingOrderPlan && (
                                        <div className="min-w-0">
                                            <p className="text-xs text-charcoal/50">
                                                {t("pendingOrder.summaryTotal")}
                                            </p>
                                            <p className="text-sm font-semibold text-charcoal tabular-nums whitespace-nowrap">
                                                {formatPrice(pendingOrderTotalInCents)}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-3 text-xs text-charcoal/55 leading-snug">
                                    <span className="font-semibold text-charcoal/60">
                                        {t("pendingOrder.summaryExtras")}:
                                    </span>{" "}
                                    <span>
                                        {pendingExtrasSummary || t("pendingOrder.summaryExtrasNone")}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 space-y-3">
                            <Button
                                type="button"
                                onClick={() => router.replace(`/${locale}/order/${pendingOrderId}`)}
                                variant="aegean" className="w-full py-4 text-left rounded-2xl"
                            >
                                <div className="flex flex-col gap-1">
                                    <span className="text-base font-semibold">
                                        {t("pendingOrder.continuePayment")}
                                    </span>
                                    <span className="text-sm text-white/85 leading-snug">
                                        {t("pendingOrder.continuePaymentHint")}
                                    </span>
                                </div>
                            </Button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowPendingOrderDialog(false);
                                    setStep(TOTAL_STEPS);
                                }}
                                className="w-full px-6 py-4 rounded-2xl bg-charcoal/5 hover:bg-charcoal/10 text-left transition-colors border border-charcoal/10"
                            >
                                <div className="flex flex-col gap-1">
                                    <span className="text-base font-semibold text-dark">
                                        {t("pendingOrder.reviewPlan")}
                                    </span>
                                    <span className="text-sm text-charcoal/60 leading-snug">
                                        {t("pendingOrder.reviewPlanHint")}
                                    </span>
                                </div>
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                localStorage.removeItem(`pending_order_${locale}`);
                                localStorage.removeItem(`quiz_data_${locale}`);
                                localStorage.removeItem("apollo-extra-song-draft");
                                setPendingOrderId(null);
                                setShowPendingOrderDialog(false);
                                setStep(1);
                                setAppliedCoupon(null);
                                setData({
                                    recipient: "",
                                    name: "",
                                    relationship: "",
                                    genre: "",
                                    vocals: "either",
                                    qualities: "",
                                    memories: "",
                                    message: "",
                                    email: "",
                                    whatsapp: "",
                                });
                            }}
                            className="w-full mt-4 py-2 flex flex-col items-center gap-0.5 transition-colors group"
                        >
                            <span className="flex items-center gap-1.5 text-sm font-medium text-[#5B8C6A] group-hover:text-[#4A7356]">
                                <Music className="w-3.5 h-3.5" />
                                {t("pendingOrder.startNew")}
                            </span>
                            <span className="text-xs text-charcoal/40 group-hover:text-charcoal/55">
                                {t("pendingOrder.startNewHint")}
                            </span>
                        </button>

                        <div className="mt-5 rounded-2xl border border-charcoal/10 bg-porcelain p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-charcoal/60 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-charcoal leading-relaxed">
                                    {renderWithBold(t("pendingOrder.note"))}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Bar / Header */}
            <div className="sticky top-0 bg-white z-50 shadow-sm">
                <div className="container mx-auto px-5 py-4">
                    <div className="max-w-xl mx-auto">
                        {step < TOTAL_STEPS ? (
                            <>
                                {/* Progress Track */}
                                <div className="h-1.5 bg-charcoal/10 rounded-full overflow-hidden mb-3">
                                    <motion.div
                                        className="h-full bg-[#4A8E9A] rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                    />
                                </div>

                                {/* Logo + Progress Info - Same Line */}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-charcoal/50">
                                        {t("progress.step")} {step} {t("progress.stepOf")} {TOTAL_STEPS}
                                    </span>
                                    <div className="flex flex-col items-center">
                                        <span className="font-serif text-base font-bold text-charcoal tracking-tight">
                                            {brand}
                                        </span>
                                        <span className="text-[0.55rem] font-semibold tracking-widest text-charcoal/60">
                                            {common("brandByline")}
                                        </span>
                                    </div>
                                    <span className="text-sm text-charcoal/50">
                                        {Math.round(progress)}% {t("progress.complete")}
                                    </span>
                                </div>
                            </>
                        ) : (
                            /* Checkout Step - Just Logo */
                            <div className="flex flex-col items-center justify-center py-2">
                                <span className="font-serif text-xl font-bold text-charcoal tracking-tight">
                                    {brand}
                                </span>
                                <span className="text-[0.65rem] font-semibold tracking-widest text-charcoal/60">
                                    {common("brandByline")}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quiz Content */}
            <div className="container mx-auto px-5 py-10 md:py-16">
                <div className="max-w-xl mx-auto">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <StepBasics
                                key="basics"
                                t={t}
                                data={data}
                                errors={errors}
                                updateData={updateData}
                            />
                        )}
                        {step === 2 && (
                            <StepGenre
                                key="genre"
                                t={t}
                                data={data}
                                errors={errors}
                                updateData={updateData}
                                locale={locale}
                                getGenreAudioUrl={getGenreAudioUrl}
                            />
                        )}
                        {step === 3 && (
                            <StepQualities
                                key="qualities"
                                t={t}
                                data={data}
                                errors={errors}
                                updateData={updateData}
                                locale={locale}
                            />
                        )}
                        {step === 4 && (
                            <StepMemories
                                key="memories"
                                t={t}
                                data={data}
                                errors={errors}
                                updateData={updateData}
                                onEditQualities={() => goToStep(3)}
                                locale={locale}
                            />
                        )}
                        {step === 5 && (
                            <StepMessage
                                key="message"
                                t={t}
                                data={data}
                                errors={errors}
                                updateData={updateData}
                                onEditMemories={() => goToStep(4)}
                                locale={locale}
                            />
                        )}
                        {/* Plans step - for PT and ES (step 6 in their flow) */}
                        {usesPlanPricing && step === 6 && (
                            <StepPlans
                                key="plans"
                                t={t}
                                selectedPlan={selectedPlan}
                                onPlanChange={setSelectedPlan}
                                recipientName={data.name}
                                locale={locale}
                            />
                        )}
                        {/* Checkout step - step 6 for EN, step 7 for PT */}
                        {step === TOTAL_STEPS && (
                            <StepCheckout
                                key="checkout"
                                t={t}
                                data={data}
                                updateData={updateData}
                                onSubmit={handleSubmit}
                                onEditOrderBumps={() => openOrderBump("edit")}
                                errors={errors}
                                setErrors={setErrors}
                                isSubmitting={createOrder.isPending}
                                submitError={submitError}
                                selectedPlan={selectedPlan}
                                onPlanChange={setSelectedPlan}
                                currency={currency}
                                basePriceInCents={basePriceInCents}
                                orderBumps={orderBumps}
                                orderBumpsReviewed={orderBumpsReviewed}
                                appliedCoupon={appliedCoupon}
                                onAppliedCouponChange={setAppliedCoupon}
                                locale={locale}
                                getGenreAudioUrl={getGenreAudioUrl}
                            />
                        )}
                    </AnimatePresence>

                    {/* Navigation */}
                    {step < TOTAL_STEPS ? (
                        <div
                            id="quiz-step-navigation"
                            className="mt-6 flex items-center justify-between gap-4"
                        >
                            <button
                                onClick={prevStep}
                                disabled={step === 1}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-4 rounded-full border-2 border-charcoal/20 text-charcoal text-base font-medium transition-all",
                                    step === 1 ? "opacity-40 cursor-not-allowed" : "hover:border-charcoal/40 hover:bg-charcoal/5 active:scale-[0.98]"
                                )}
                            >
                                <ArrowLeft className="w-5 h-5" />
                                {t("navigation.back")}
                            </button>

                            <Button
                                onClick={nextStep}
                                variant="aegean"
                                className="w-full py-4 text-left rounded-2xl"
                            >
                                {((step === 4 && !data.memories.trim()) || (step === 5 && !data.message.trim()))
                                    ? t("navigation.nextSkipMemories")
                                    : t("navigation.next")}
                                <ArrowRight className="w-5 h-5" />
                            </Button>
                        </div>
                    ) : null}

                    {/* Terms - only show on non-checkout steps */}
                    {step < TOTAL_STEPS ? (
                        <div className="mt-10 text-center">
                            <p className="text-sm text-charcoal/40">
                                {t("navigation.terms")}{" "}
                                <span className="underline">
                                    {t("navigation.termsLink")}
                                </span>{" "}
                                {t("navigation.and")}{" "}
                                <span className="underline">
                                    {t("navigation.privacyLink")}
                                </span>.
                            </p>
                            <p className="text-xs text-charcoal/20 mt-3 tracking-widest uppercase">
                                apollosong.com
                            </p>
                        </div>
                    ) : (
                        <p className="mt-10 text-xs text-charcoal/20 text-center tracking-widest uppercase">
                            apollosong.com
                        </p>
                    )}
                </div>
            </div>

            {/* Order Bump Modal */}
            <OrderBumpModal
                isOpen={showOrderBumpModal}
                onClose={() => setShowOrderBumpModal(false)}
                onConfirm={handleOrderBumpConfirm}
                mode={orderBumpMode}
                initialSelection={applyPlanIncludedBumps(orderBumps)}
                locale={locale}
                currency={currency}
                recipientName={data.name}
                currentGenre={orderBumpGenre || data.genre}
                basePrice={basePriceInCents}
                selectedPlan={selectedPlan}
                isSubmitting={orderBumpMode === "submit" ? createOrder.isPending : false}
                t={t}
            />
        </div>
    );
}

// Step Components

// Grammar fix button component
function GrammarFixButton({
    text,
    onFixed,
    locale,
    disabled,
}: {
    text: string;
    onFixed: (correctedText: string) => void;
    locale: string;
    disabled?: boolean;
}) {
    const [isFixing, setIsFixing] = useState(false);

    const handleFix = async () => {
        console.log("[GrammarFix] Button clicked, text length:", text?.length);
        if (!text || text.trim().length < 10 || isFixing) {
            console.log("[GrammarFix] Skipping - conditions not met");
            return;
        }

        setIsFixing(true);
        try {
            console.log("[GrammarFix] Sending request...");
            const response = await fetch("/api/grammar-fix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, locale }),
            });

            console.log("[GrammarFix] Response status:", response.status);

            if (response.ok) {
                const data = await response.json() as { correctedText: string };
                console.log("[GrammarFix] Got corrected text, changed:", data.correctedText !== text);
                if (data.correctedText && data.correctedText !== text) {
                    onFixed(data.correctedText);
                }
            } else {
                const errorText = await response.text();
                console.error("[GrammarFix] Response not ok:", response.status, errorText);
            }
        } catch (error) {
            console.error("[GrammarFix] Fetch error:", error);
        } finally {
            setIsFixing(false);
        }
    };

    const isDisabled = disabled || isFixing || !text || text.trim().length < 10;

    const buttonText = locale === "pt" ? "Corrigir gramática automaticamente"
        : locale === "es" ? "Corregir gramática automáticamente"
            : locale === "fr" ? "Corriger la grammaire automatiquement"
                : locale === "it" ? "Correggi grammatica automaticamente"
                    : "Auto-fix grammar";

    const loadingText = locale === "pt" ? "Corrigindo..."
        : locale === "es" ? "Corrigiendo..."
            : locale === "fr" ? "Correction..."
                : locale === "it" ? "Correzione..."
                    : "Fixing...";

    return (
        <button
            type="button"
            onClick={() => void handleFix()}
            disabled={isDisabled}
            className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2",
                isFixing
                    ? "bg-[#4A8E9A]/20 text-dark border-[#4A8E9A]/40 cursor-wait"
                    : isDisabled
                        ? "bg-white/60 text-dark/40 border-[#4A8E9A]/20 cursor-not-allowed"
                        : "bg-[#4A8E9A]/10 text-dark border-[#4A8E9A]/30 hover:bg-[#4A8E9A]/20 hover:border-[#4A8E9A]/50"
            )}
            title={buttonText}
        >
            {isFixing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
                <Wand2 className="w-5 h-5" />
            )}
            <span>{isFixing ? loadingText : buttonText}</span>
        </button>
    );
}

// Audio recording section component for story steps
function AudioRecordingSection({
    t,
    status,
    error,
    isProcessing,
    startRecording,
    stopRecording,
    elapsedSeconds,
    remainingSeconds,
    isNearLimit,
}: {
    t: ReturnType<typeof useTranslations>;
    status: TranscriptionStatus;
    error: string | null;
    isProcessing: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    elapsedSeconds: number;
    remainingSeconds: number;
    isNearLimit: boolean;
}) {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <div className="pt-4 border-t border-charcoal/10 space-y-3">
            <p className="text-base text-charcoal/70">{t("audio.prompt")}</p>
            <p className="text-sm text-charcoal/60">
                {t("audio.transcriptionHint").split(/(\*\*[^*]+\*\*)/).map((part, i) => {
                    if (part.startsWith("**") && part.endsWith("**")) {
                        const text = part.slice(2, -2);
                        return <span key={i} className="font-semibold text-dark underline underline-offset-2">{text}</span>;
                    }
                    return part;
                })}
            </p>

            {/* Record/Stop Button */}
            {status === "recording" ? (
                <div className="space-y-3">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl border-2 border-red-500 text-red-600 hover:bg-red-50 text-base font-medium transition-colors"
                        >
                            <Square className="w-5 h-5 fill-red-600" />
                            {t("audio.stopButton")}
                        </button>
                        <span className={cn(
                            "text-base font-mono",
                            isNearLimit ? "text-red-600 font-semibold" : "text-charcoal/70"
                        )}>
                            {formatTime(elapsedSeconds)} / 5:00
                        </span>
                    </div>
                    <p className="text-sm text-charcoal/60">
                        {t("audio.stopToTranscribe").split(/(\*\*[^*]+\*\*)/).map((part, i) => {
                            if (part.startsWith("**") && part.endsWith("**")) {
                                const text = part.slice(2, -2);
                                return <span key={i} className="font-semibold text-dark underline underline-offset-2">{text}</span>;
                            }
                            return part;
                        })}
                    </p>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => void startRecording()}
                    disabled={isProcessing}
                    className={cn(
                        "inline-flex items-center gap-2 h-12 px-5 rounded-2xl border-2 text-base font-medium transition-colors",
                        isProcessing
                            ? "border-charcoal/20 text-charcoal/40 cursor-not-allowed"
                            : "border-[#4A8E9A] text-dark hover:bg-[#4A8E9A]/5"
                    )}
                >
                    <Mic className="w-5 h-5" />
                    {t("audio.recordButton")}
                </button>
            )}

            {/* Time Warning */}
            {status === "recording" && isNearLimit && (
                <div className="p-4 rounded-2xl text-base flex items-center gap-3 bg-amber-50 text-amber-700">
                    <AlertCircle className="w-5 h-5" />
                    <span>{t("audio.timeWarning")}</span>
                </div>
            )}

            {/* Transcription Status */}
            {status !== "idle" && status !== "recording" && (
                <div className={cn(
                    "p-4 rounded-2xl text-base flex items-center gap-3",
                    status === "uploading" && "bg-blue-50 text-blue-700",
                    status === "queued" && "bg-amber-50 text-amber-700",
                    status === "processing" && "bg-amber-50 text-amber-700",
                    status === "completed" && "bg-emerald-50 text-emerald-700",
                    status === "error" && "bg-red-50 text-red-700",
                )}>
                    {(status === "uploading" || status === "queued" || status === "processing") && (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    )}
                    {status === "completed" && <CheckCircle2 className="w-5 h-5" />}
                    {status === "error" && <AlertCircle className="w-5 h-5" />}

                    <span>
                        {status === "uploading" && t("audio.statusUploading")}
                        {status === "queued" && t("audio.statusQueued")}
                        {status === "processing" && t("audio.statusProcessing")}
                        {status === "completed" && t("audio.statusCompleted")}
                        {status === "error" && (
                            error === "NO_SPOKEN_AUDIO"
                                ? t("audio.noSpokenAudio")
                                : (error || t("audio.statusError"))
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}

type StepProps = {
    t: ReturnType<typeof useTranslations>;
    data: QuizData;
    errors: Partial<QuizData>;
    updateData: (field: keyof QuizData, value: string) => void;
    locale?: string;
    onEditQualities?: () => void;
    onEditMemories?: () => void;
    getGenreAudioUrl?: (genre: string) => string | undefined;
};

function StepBasics({ t, data, errors, updateData }: StepProps) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
        >
            <div className="text-center space-y-3">
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {t("steps.basics.title")}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">{t("steps.basics.subtitle")}</p>
            </div>

            {/* Recipient Selection */}
            <div className="space-y-4">
                <label className="block text-base font-semibold text-charcoal">
                    {t("steps.basics.recipient.label")} <span className="text-dark">*</span>
                </label>
                <div className="flex flex-wrap gap-3">
                    {recipientOptions.map(option => (
                        <button
                            key={option}
                            onClick={() => updateData("recipient", option)}
                            className={cn(
                                "px-5 py-3 rounded-full border-2 text-base font-medium transition-all duration-200 active:scale-[0.96]",
                                data.recipient === option
                                    ? "border-[#4A8E9A] bg-[#4A8E9A] text-dark shadow-md"
                                    : "border-charcoal/15 text-charcoal bg-white hover:border-[#4A8E9A]/50 hover:bg-[#4A8E9A]/5 hover:shadow-md"
                            )}
                        >
                            {t(`steps.basics.recipient.options.${option}`)}
                        </button>
                    ))}
                </div>
                {errors.recipient && <p className="text-red-500 text-base">{errors.recipient}</p>}
            </div>

            {/* Relationship Input - Only for "other" recipient, appears BEFORE name */}
            {data.recipient === "other" && (
                <div className="space-y-4">
                    <label className="block text-base font-semibold text-charcoal">
                        {t("steps.basics.relationship.label")} <span className="text-charcoal/40 font-normal">{t("progress.optional")}</span>
                    </label>
                    <input
                        type="text"
                        value={data.relationship}
                        onChange={e => updateData("relationship", e.target.value)}
                        placeholder={t("steps.basics.relationship.placeholder")}
                        className={cn(
                            "w-full px-5 py-4 rounded-2xl border-2 bg-porcelain text-base text-charcoal placeholder:text-charcoal/40",
                            "focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10",
                            "hover:border-[#4A8E9A]/50 hover:shadow-sm transition-all duration-200",
                            "border-charcoal/15"
                        )}
                    />
                </div>
            )}

            {/* Name Input - Hidden for group recipients */}
            {data.recipient !== "group" && (
                <div className="space-y-4">
                    <label className="block text-base font-semibold text-charcoal">
                        {data.recipient === "myself"
                            ? t("steps.basics.name.labelSelf")
                            : t("steps.basics.name.label")}
                    </label>
                    <input
                        type="text"
                        value={data.name}
                        onChange={e => {
                            if (e.target.value.length <= 30) updateData("name", e.target.value);
                        }}
                        maxLength={30}
                        placeholder={
                            data.recipient === "myself"
                                ? t("steps.basics.name.placeholderSelf")
                                : t("steps.basics.name.placeholder")
                        }
                        className={cn(
                            "w-full px-5 py-4 rounded-2xl border-2 bg-porcelain text-base text-charcoal placeholder:text-charcoal/40",
                            "focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10",
                            "hover:border-[#4A8E9A]/50 hover:shadow-sm transition-all duration-200",
                            errors.name ? "border-red-300" : "border-charcoal/15"
                        )}
                    />
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-base text-charcoal/50 italic">
                            {t("steps.basics.name.tip")}
                        </p>
                        <span className={cn(
                            "text-xs font-bold tabular-nums shrink-0",
                            data.name.length >= 25 ? "text-red-500 font-medium" : "text-dark/70"
                        )}>
                            {data.name.length}/30
                        </span>
                    </div>
                    {errors.name && <p className="text-red-500 text-base">{errors.name}</p>}
                </div>
            )}
        </motion.div>
    );
}

function StepGenre({ t, data, errors, updateData, locale, getGenreAudioUrl }: StepProps) {
    const genreOptions = locale === "pt" ? genreOptionsPT : locale === "es" ? genreOptionsES : locale === "fr" ? genreOptionsFR : locale === "it" ? genreOptionsIT : genreOptionsEN;
    const vocalsRef = useRef<HTMLDivElement>(null);
    const forroSubgenreRef = useRef<HTMLDivElement>(null);
    const sertanejoSubgenreRef = useRef<HTMLDivElement>(null);
    const funkSubgenreRef = useRef<HTMLDivElement>(null);
    const rockSubgenreRef = useRef<HTMLDivElement>(null);
    const bregaSubgenreRef = useRef<HTMLDivElement>(null);
    const pagodeSubgenreRef = useRef<HTMLDivElement>(null);
    const mpbSubgenreRef = useRef<HTMLDivElement>(null);
    const eletronicaSubgenreRef = useRef<HTMLDivElement>(null);
    const lullabySubgenreRef = useRef<HTMLDivElement>(null);
    const latinaSubgenreRef = useRef<HTMLDivElement>(null);
    const bluesSubgenreRef = useRef<HTMLDivElement>(null);
    const showForroSubgenres = locale === "pt" && (data.genre === "forro" || isForroSubgenre(data.genre));
    const showSertanejoSubgenres = locale === "pt" && (data.genre === "country" || isSertanejoSubgenre(data.genre));
    const showFunkSubgenres = locale === "pt" && (data.genre === "funk" || isFunkSubgenre(data.genre));
    const showRockSubgenres = locale === "pt" && (data.genre === "rock" || isRockSubgenre(data.genre));
    const showBregaSubgenres = locale === "pt" && (data.genre === "brega" || isBregaSubgenre(data.genre));
    const showPagodeSubgenres = locale === "pt" && (data.genre === "pagode" || isPagodeSubgenre(data.genre));
    const showMpbSubgenres = locale === "pt" && (data.genre === "mpb" || isMpbSubgenre(data.genre));
    const showEletronicaSubgenres = locale === "pt" && (data.genre === "eletronica" || isEletronicaSubgenre(data.genre));
    const showLullabySubgenres = locale === "pt" && (data.genre === "lullaby" || isLullabySubgenre(data.genre));
    const showLatinaSubgenres = locale === "pt" && (data.genre === "latina" || isLatinaSubgenre(data.genre));
    const showBluesSubgenres = data.genre === "blues" || isBluesSubgenre(data.genre);
    const showRnbDescription = locale === "pt" && data.genre === "rnb";
    const showJazzDescription = locale === "pt" && data.genre === "jazz";
    const showAxeDescription = locale === "pt" && data.genre === "axe";
    const showCapoeiraDescription = locale === "pt" && data.genre === "capoeira";
    const requiresSubgenreSelection = (genre: string) =>
        genre === "blues" || (locale === "pt" && ["forro", "country", "funk", "rock", "brega", "pagode", "mpb", "eletronica", "lullaby", "latina"].includes(genre));
    const hasSubgenreError = Boolean(errors.genre) && requiresSubgenreSelection(data.genre);
    const subgenreBlockClass = (highlight: boolean) =>
        cn(
            "rounded-2xl border p-5 space-y-4",
            highlight
                ? "border-red-500 bg-red-50/60 ring-2 ring-red-500/30"
                : "border-[#4A8E9A]/20 bg-[#4A8E9A]/5"
        );

    const handleGenreSelect = (option: string) => {
        if (locale === "pt" && option === "forro") {
            if (!isForroSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                forroSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "country") {
            if (!isSertanejoSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                sertanejoSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "funk") {
            if (!isFunkSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                funkSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "rock") {
            if (!isRockSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                rockSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "brega") {
            if (!isBregaSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                bregaSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "pagode") {
            if (!isPagodeSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                pagodeSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "mpb") {
            if (!isMpbSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                mpbSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "eletronica") {
            if (!isEletronicaSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                eletronicaSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "lullaby") {
            if (!isLullabySubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                lullabySubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (locale === "pt" && option === "latina") {
            if (!isLatinaSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                latinaSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        if (option === "blues") {
            if (!isBluesSubgenre(data.genre)) {
                updateData("genre", option);
            }
            setTimeout(() => {
                bluesSubgenreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            return;
        }
        updateData("genre", option);
        // Delay scroll to give user time to see and click play button
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleForroSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleSertanejoSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleFunkSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleRockSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleBregaSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handlePagodeSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleMpbSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleEletronicaSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleLullabySubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleLatinaSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    const handleBluesSubgenreSelect = (option: string) => {
        updateData("genre", option);
        setTimeout(() => {
            vocalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
        >
            <div className="text-center space-y-3">
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {t("steps.genre.title")}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">{t("steps.genre.subtitle")}</p>
            </div>

            {/* Genre Selection */}
            <div className="space-y-4">
                <label className="block text-base font-semibold text-charcoal">
                    {t("steps.genre.genre.label")} <span className="text-dark">*</span>
                </label>
                <div className="flex flex-wrap gap-3">
                    {genreOptions.map(option => {
                        const isSelected = option === "blues"
                            ? showBluesSubgenres
                            : locale === "pt" && option === "forro"
                                ? showForroSubgenres
                                : locale === "pt" && option === "country"
                                    ? showSertanejoSubgenres
                                    : locale === "pt" && option === "funk"
                                        ? showFunkSubgenres
                                        : locale === "pt" && option === "rock"
                                            ? showRockSubgenres
                                            : locale === "pt" && option === "brega"
                                                ? showBregaSubgenres
                                                : locale === "pt" && option === "pagode"
                                                    ? showPagodeSubgenres
                                                    : locale === "pt" && option === "mpb"
                                                        ? showMpbSubgenres
                                                        : locale === "pt" && option === "eletronica"
                                                            ? showEletronicaSubgenres
                                                            : locale === "pt" && option === "lullaby"
                                                                ? showLullabySubgenres
                                                                : data.genre === option;
                        // Show play button only if this exact genre is selected AND it doesn't have subgenres
                        // Genres with subgenres: blues (all locales), forro/country/funk/rock/brega/pagode/mpb (PT only)
                        const hasSubgenres = option === "blues" || (locale === "pt" && ["forro", "country", "funk", "rock", "brega", "pagode", "mpb", "eletronica", "lullaby", "latina"].includes(option));
                        const showPlayButton = data.genre === option && !hasSubgenres;
                        const audioUrl = getGenreAudioUrl?.(option);
                        return (
                            <div key={option} className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleGenreSelect(option)}
                                    className={cn(
                                        "px-5 py-3 rounded-full border-2 text-base font-medium transition-all duration-200 active:scale-[0.96]",
                                        isSelected
                                            ? "border-[#4A8E9A] bg-[#4A8E9A] text-dark shadow-md"
                                            : "border-charcoal/15 text-charcoal bg-white hover:border-[#4A8E9A]/50 hover:bg-[#4A8E9A]/5 hover:shadow-md"
                                    )}
                                >
                                    {t(`steps.genre.genre.options.${option}`)}
                                </button>
                                {showPlayButton && audioUrl && (
                                    <GenrePlayButton audioUrl={audioUrl} />
                                )}
                            </div>
                        );
                    })}
                </div>
                {showForroSubgenres && (
                    <div
                        ref={forroSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "forro")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.forro.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.forro.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {forroSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleForroSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showSertanejoSubgenres && (
                    <div
                        ref={sertanejoSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "country")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.sertanejo.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.sertanejo.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {sertanejoSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleSertanejoSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showFunkSubgenres && (
                    <div
                        ref={funkSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "funk")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.funk.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.funk.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {funkSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleFunkSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showRockSubgenres && (
                    <div
                        ref={rockSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "rock")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.rock.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.rock.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {rockSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleRockSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showBregaSubgenres && (
                    <div
                        ref={bregaSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "brega")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.brega.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.brega.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {bregaSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleBregaSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showPagodeSubgenres && (
                    <div
                        ref={pagodeSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "pagode")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.pagode.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.pagode.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {pagodeSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handlePagodeSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showMpbSubgenres && (
                    <div
                        ref={mpbSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "mpb")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.mpb.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.mpb.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {mpbSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleMpbSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showEletronicaSubgenres && (
                    <div
                        ref={eletronicaSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "eletronica")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.eletronica.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.eletronica.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {eletronicaSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleEletronicaSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showLullabySubgenres && (
                    <div
                        ref={lullabySubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "lullaby")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.lullaby.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.lullaby.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {lullabySubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleLullabySubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showLatinaSubgenres && (
                    <div
                        ref={latinaSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "latina")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.latina.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.latina.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {latinaSubgenresPT.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleLatinaSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showBluesSubgenres && (
                    <div
                        ref={bluesSubgenreRef}
                        className={subgenreBlockClass(hasSubgenreError && data.genre === "blues")}
                    >
                        <div>
                            <p className="text-sm font-semibold text-charcoal">
                                {t("steps.genre.genre.subgenres.blues.label")}
                            </p>
                            <p className="text-xs text-charcoal/60">
                                {t("steps.genre.genre.subgenres.blues.subtitle")}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {bluesSubgenres.map(option => {
                                const isSubgenreSelected = data.genre === option;
                                const subgenreAudioUrl = getGenreAudioUrl?.(option);
                                return (
                                    <div key={option} className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleBluesSubgenreSelect(option)}
                                            className={cn(
                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                isSubgenreSelected
                                                    ? "border-[#4A8E9A] shadow-md"
                                                    : "border-charcoal/15 hover:border-[#4A8E9A]/50 hover:shadow-md"
                                            )}
                                        >
                                            <p className="text-base font-semibold text-charcoal">
                                                {t(`steps.genre.genre.options.${option}`)}
                                            </p>
                                            <p className="text-sm text-charcoal/60 mt-1">
                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                            </p>
                                        </button>
                                        {isSubgenreSelected && subgenreAudioUrl && (
                                            <GenrePlayButton audioUrl={subgenreAudioUrl} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {showRnbDescription && (
                    <div className="rounded-2xl border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 p-5">
                        <p className="text-sm text-charcoal/80">
                            {renderWithBold(t("steps.genre.genre.subgenres.options.rnb"))}
                        </p>
                    </div>
                )}
                {showJazzDescription && (
                    <div className="rounded-2xl border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 p-5">
                        <p className="text-sm text-charcoal/80">
                            {renderWithBold(t("steps.genre.genre.subgenres.options.jazz"))}
                        </p>
                    </div>
                )}
                {showAxeDescription && (
                    <div className="rounded-2xl border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 p-5">
                        <p className="text-sm text-charcoal/80">
                            {renderWithBold(t("steps.genre.genre.subgenres.options.axe"))}
                        </p>
                    </div>
                )}
                {showCapoeiraDescription && (
                    <div className="rounded-2xl border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 p-5">
                        <p className="text-sm text-charcoal/80">
                            {renderWithBold(t("steps.genre.genre.subgenres.options.capoeira"))}
                        </p>
                    </div>
                )}
                {errors.genre && <p className="text-red-500 text-base">{errors.genre}</p>}
            </div>

            {/* Vocal Preference */}
            <div ref={vocalsRef} className="space-y-4">
                <label className="block text-base font-semibold text-charcoal">
                    {t("steps.genre.vocals.label")}
                </label>
                <p className="text-sm text-charcoal/50 -mt-2">{t("steps.genre.vocals.tip")}</p>
                <div className="flex flex-wrap gap-3">
                    {vocalOptions.map(option => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => updateData("vocals", option)}
                            className={cn(
                                "px-5 py-3 rounded-full border-2 text-base font-medium transition-all duration-200 active:scale-[0.96]",
                                data.vocals === option
                                    ? "border-[#4A8E9A] bg-[#4A8E9A] text-dark shadow-md"
                                    : "border-charcoal/15 text-charcoal bg-white hover:border-[#4A8E9A]/50 hover:bg-[#4A8E9A]/5 hover:shadow-md"
                            )}
                        >
                            {t(`steps.genre.vocals.options.${option}`)}
                        </button>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

function StepQualities({ t, data, errors, updateData, locale }: StepProps) {
    const handleTranscriptionComplete = useCallback((text: string) => {
        updateData("qualities", data.qualities ? data.qualities.trim() + "\n\n" + text : text);
    }, [data.qualities, updateData]);

    const { status, error, isProcessing, startRecording, stopRecording, elapsedSeconds, remainingSeconds, isNearLimit } = useAudioTranscription({
        onTranscriptionComplete: handleTranscriptionComplete,
    });

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
        >
            <div className="text-center space-y-3">
                <span className="text-xs font-bold tracking-widest text-dark uppercase">
                    {t("progress.storyProgress", { current: 1 })}
                </span>
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {data.recipient === "myself" ? t("steps.qualities.titleSelf") : t("steps.qualities.title")}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">
                    {data.recipient === "myself" ? t("steps.qualities.subtitleSelf") : t("steps.qualities.subtitle")}
                </p>
            </div>

            {/* Qualities Textarea */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <label className="block text-base font-semibold text-charcoal">
                        {data.recipient === "myself" ? t("steps.qualities.qualities.labelSelf") : t("steps.qualities.qualities.label")} <span className="text-dark">*</span>
                    </label>
                    <GrammarFixButton
                        text={data.qualities}
                        onFixed={(text) => updateData("qualities", text)}
                        locale={locale || "pt"}
                    />
                </div>
                <textarea
                    value={data.qualities}
                    onChange={e => updateData("qualities", e.target.value)}
                    placeholder={data.recipient === "myself" ? t("steps.qualities.qualities.placeholderSelf") : t("steps.qualities.qualities.placeholder")}
                    rows={5}
                    className={cn(
                        "w-full px-5 py-4 rounded-2xl border-2 bg-porcelain text-base text-charcoal placeholder:text-charcoal/40 resize-none",
                        "focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10",
                        "hover:border-[#4A8E9A]/50 hover:shadow-sm transition-all duration-200",
                        errors.qualities ? "border-red-300" : "border-charcoal/15"
                    )}
                />
                <div className="flex justify-end -mt-1">
                    <WordCounter text={data.qualities} locale={locale || "pt"} />
                </div>
                {errors.qualities && <p className="text-red-500 text-base">{errors.qualities}</p>}

                {/* Audio Recording Section - TEMPORARILY DISABLED
                <AudioRecordingSection
                    t={t}
                    status={status}
                    error={error}
                    isProcessing={isProcessing}
                    startRecording={startRecording}
                    stopRecording={stopRecording}
                    elapsedSeconds={elapsedSeconds}
                    remainingSeconds={remainingSeconds}
                    isNearLimit={isNearLimit}
                />
                */}
            </div>
        </motion.div>
    );
}

function StepMemories({ t, data, errors, updateData, onEditQualities, locale }: StepProps) {
    const handleTranscriptionComplete = useCallback((text: string) => {
        updateData("memories", data.memories ? data.memories.trim() + "\n\n" + text : text);
    }, [data.memories, updateData]);

    const { status, error, isProcessing, startRecording, stopRecording, elapsedSeconds, remainingSeconds, isNearLimit } = useAudioTranscription({
        onTranscriptionComplete: handleTranscriptionComplete,
    });

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
        >
            {/* Recap previous step */}
            {onEditQualities && (
                <StepRecap
                    label={t("steps.qualities.savedLabel") || "Qualities saved"}
                    value={data.qualities}
                    savedText={t("progress.saved")}
                    onEdit={onEditQualities}
                />
            )}
            <div className="text-center space-y-3">
                <span className="text-xs font-bold tracking-widest text-dark uppercase">
                    {t("progress.storyProgress", { current: 2 })}
                </span>
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {data.recipient === "myself" ? t("steps.memories.titleSelf") : t("steps.memories.title")}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">
                    {renderWithBold(data.recipient === "myself" ? t("steps.memories.subtitleSelf") : t("steps.memories.subtitle"))}
                </p>
            </div>

            {/* Memories Textarea */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <label className="block text-base font-semibold text-charcoal">
                        {data.recipient === "myself" ? t("steps.memories.memories.labelSelf") : t("steps.memories.memories.label")}
                    </label>
                    <GrammarFixButton
                        text={data.memories}
                        onFixed={(text) => updateData("memories", text)}
                        locale={locale || "pt"}
                    />
                </div>
                <textarea
                    value={data.memories}
                    onChange={e => updateData("memories", e.target.value)}
                    placeholder={data.recipient === "myself" ? t("steps.memories.memories.placeholderSelf") : t("steps.memories.memories.placeholder")}
                    rows={5}
                    className={cn(
                        "w-full px-5 py-4 rounded-2xl border-2 bg-porcelain text-base text-charcoal placeholder:text-charcoal/40 resize-none",
                        "focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10",
                        "hover:border-[#4A8E9A]/50 hover:shadow-sm transition-all duration-200",
                        errors.memories ? "border-red-300" : "border-charcoal/15"
                    )}
                />
                <div className="flex justify-end -mt-1">
                    <WordCounter text={data.memories} locale={locale || "pt"} />
                </div>
                {errors.memories && <p className="text-red-500 text-base">{errors.memories}</p>}

                {/* Audio Recording Section - TEMPORARILY DISABLED
                <AudioRecordingSection
                    t={t}
                    status={status}
                    error={error}
                    isProcessing={isProcessing}
                    startRecording={startRecording}
                    stopRecording={stopRecording}
                    elapsedSeconds={elapsedSeconds}
                    remainingSeconds={remainingSeconds}
                    isNearLimit={isNearLimit}
                />
                */}
            </div>
        </motion.div>
    );
}

function StepMessage({ t, data, errors, updateData, onEditMemories, locale }: StepProps) {
    const handleTranscriptionComplete = useCallback((text: string) => {
        updateData("message", data.message ? data.message.trim() + "\n\n" + text : text);
    }, [data.message, updateData]);

    const { status, error, isProcessing, startRecording, stopRecording, elapsedSeconds, remainingSeconds, isNearLimit } = useAudioTranscription({
        onTranscriptionComplete: handleTranscriptionComplete,
    });

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
        >
            {/* Recap previous step */}
            {onEditMemories && (
                <StepRecap
                    label={t("steps.memories.savedLabel") || "Memories saved"}
                    value={data.memories}
                    savedText={t("progress.saved")}
                    onEdit={onEditMemories}
                />
            )}
            <div className="text-center space-y-3">
                <span className="text-xs font-bold tracking-widest text-dark uppercase">
                    {t("progress.storyProgress", { current: 3 })}
                </span>
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {data.recipient === "myself" ? t("steps.message.titleSelf") : t("steps.message.title")}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">
                    {data.recipient === "myself" ? t("steps.message.subtitleSelf") : t("steps.message.subtitle")}
                </p>
            </div>

            {/* Message Textarea */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <label className="block text-base font-semibold text-charcoal">
                        {data.recipient === "myself" ? t("steps.message.message.labelSelf") : t("steps.message.message.label")} <span className="text-charcoal/40 font-normal ml-1">{t("progress.optional")}</span>
                    </label>
                    <GrammarFixButton
                        text={data.message}
                        onFixed={(text) => updateData("message", text)}
                        locale={locale || "pt"}
                    />
                </div>
                <textarea
                    value={data.message}
                    onChange={e => updateData("message", e.target.value)}
                    placeholder={data.recipient === "myself" ? t("steps.message.message.placeholderSelf") : t("steps.message.message.placeholder")}
                    rows={5}
                    className={cn(
                        "w-full px-5 py-4 rounded-2xl border-2 bg-porcelain text-base text-charcoal placeholder:text-charcoal/40 resize-none",
                        "focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10",
                        "hover:border-[#4A8E9A]/50 hover:shadow-sm transition-all duration-200",
                        errors.message ? "border-red-300" : "border-charcoal/15"
                    )}
                />
                <div className="flex justify-end -mt-1">
                    <WordCounter text={data.message} locale={locale || "pt"} />
                </div>
                {errors.message && <p className="text-red-500 text-base">{errors.message}</p>}

                {/* Audio Recording Section - TEMPORARILY DISABLED
                <AudioRecordingSection
                    t={t}
                    status={status}
                    error={error}
                    isProcessing={isProcessing}
                    startRecording={startRecording}
                    stopRecording={stopRecording}
                    elapsedSeconds={elapsedSeconds}
                    remainingSeconds={remainingSeconds}
                    isNearLimit={isNearLimit}
                />
                */}
            </div>
        </motion.div>
    );
}

// Plans step component for BRL and ES
type StepPlansProps = {
    t: ReturnType<typeof useTranslations>;
    selectedPlan: BRLPlanType;
    onPlanChange: (plan: BRLPlanType) => void;
    recipientName: string;
    locale?: string;
};

const PLAN_DATA = [
    {
        id: "essencial" as BRLPlanType,
        icon: Clock,
        delivery: { pt: "7 dias", es: "7 días", fr: "7 jours", it: "7 giorni", en: "7 days" },
        priceBRL: 6990,
        priceUSD: 1700, // $17
        priceEUR: 6900, // €69
    },
    {
        id: "express" as BRLPlanType,
        icon: Rocket,
        delivery: { pt: "até 24h", es: "hasta 24h", fr: "sous 24h", it: "entro 24h", en: "within 24h" },
        priceBRL: 9990,
        priceUSD: 2700, // $27
        priceEUR: 9900, // €99
        popular: true,
    },
    {
        id: "acelerado" as BRLPlanType,
        icon: Zap,
        delivery: { pt: "até 6h", es: "hasta 6h", fr: "sous 6h", it: "entro 6h", en: "within 6h" },
        priceBRL: 19990,
        priceUSD: 3700,
        priceEUR: 12900,
        vip: true,
        badge: "⭐ VIP",
    },
];

const renderVipExtrasDescription = (locale: string, planId: BRLPlanType, fallback: string): React.ReactNode => {
    if (!(planId === "acelerado")) return fallback;
    if (locale !== "pt") return fallback;
    return (
        <>
            Tudo do Express + <strong className="font-bold text-charcoal">Experiência de Presente</strong> +{" "}
            <strong className="font-bold text-charcoal">Letra em PDF</strong> +{" "}
            <strong className="font-bold text-charcoal">Playback Karaokê</strong>
        </>
    );
};

function StepPlans({ t, selectedPlan, onPlanChange, recipientName, locale = "pt" }: StepPlansProps) {
    const isBRL = locale === "pt";
    const isEUR = locale === "fr" || locale === "it";
    const availablePlans = PLAN_DATA;
    const scrollToNextButtons = () => {
        if (typeof window === "undefined") return;
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(() => {
            const navigation = document.getElementById("quiz-step-navigation");
            if (navigation) {
                navigation.scrollIntoView({
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                    block: "center",
                });
                return;
            }
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: prefersReducedMotion ? "auto" : "smooth",
            });
        }, 120);
    };

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (isBRL) {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        if (isEUR) {
            return `€${amount.toFixed(2)}`;
        }
        return `$${amount.toFixed(2)} USD`;
    };

    const getPrice = (plan: typeof PLAN_DATA[0]) => isBRL ? plan.priceBRL : isEUR ? getEurPlanPriceCents(locale, plan.id) : plan.priceUSD;
    const getDelivery = (plan: typeof PLAN_DATA[0]) => plan.delivery[locale as keyof typeof plan.delivery] || plan.delivery.en;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
        >
            {/* Header */}
            <div className="text-center space-y-3">
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {locale === "es" ? "Elige tu Plan"
                        : locale === "fr" ? "Choisissez Votre Plan"
                            : locale === "it" ? "Scegli il Tuo Piano"
                                : locale === "en" ? "Choose Your Plan"
                                    : "Escolha Seu Plano"}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">
                    {locale === "es" ? "Selecciona el tiempo de entrega ideal para ti"
                        : locale === "fr" ? "Sélectionnez le délai de livraison idéal pour vous"
                            : locale === "it" ? "Seleziona i tempi di consegna ideali per te"
                                : locale === "en" ? "Select the ideal delivery time for you"
                                    : "Selecione o prazo de entrega ideal para você"}
                </p>
            </div>

            {/* Plan Cards */}
            <div className="space-y-4">
                {availablePlans.map((plan) => {
                    const isSelected = selectedPlan === plan.id;
                    const Icon = plan.icon;

                    const planNames: Record<BRLPlanType, string> = locale === "es"
                        ? { essencial: "Esencial", express: "Express", acelerado: "Turbo" }
                        : locale === "fr"
                            ? { essencial: "Essentiel", express: "Express", acelerado: "Turbo" }
                            : locale === "it"
                                ? { essencial: "Essenziale", express: "Express", acelerado: "Turbo" }
                                : locale === "en"
                                    ? { essencial: "Essential", express: "Express", acelerado: "Turbo" }
                                    : { essencial: "Essencial", express: "Express", acelerado: "Turbo" };

                    const planDescriptions: Record<BRLPlanType, string> = locale === "es"
                        ? {
                            essencial: "Ideal para quienes pueden esperar un poco",
                            express: "Prioridad máxima + Revisiones Ilimitadas + Soporte vía WhatsApp",
                            acelerado: "Todo lo del Express + PDF + Karaoke + Experiencia de Regalo",
                        }
                        : locale === "fr"
                            ? {
                                essencial: "Idéal pour ceux qui peuvent attendre un peu",
                                express: "Priorité maximale + Révisions Illimitées + Support via WhatsApp",
                                acelerado: "Tout l'Express + PDF + Karaoké + Expérience Cadeau",
                            }
                            : locale === "it"
                                ? {
                                    essencial: "Ideale per chi può aspettare un po'",
                                    express: "Massima priorità + Revisioni Illimitate + Supporto via WhatsApp",
                                    acelerado: "Tutto dell'Express + PDF + Karaoke + Esperienza regalo",
                                }
                                : locale === "en"
                                    ? {
                                        essencial: "Ideal for those who can wait a little",
                                        express: "Top priority + Unlimited Revisions + WhatsApp support",
                                        acelerado: "Everything in Express + Lyrics PDF + Karaoke + Gift Experience",
                                    }
                                    : {
                                        essencial: "Ideal para quem pode esperar um pouco mais",
                                        express: "Prioridade máxima + Revisões Ilimitadas + Suporte via WhatsApp",
                                        acelerado: "Tudo do Express + Experiência de Presente + Letra em PDF + Playback Karaokê",
                                    };

                    return (
                        <button
                            key={plan.id}
                            onClick={() => {
                                onPlanChange(plan.id);
                                scrollToNextButtons();
                            }}
                            className={cn(
                                "relative w-full p-5 rounded-2xl border-2 text-left transition-all",
                                isSelected
                                    ? "border-[#4A8E9A] bg-[#4A8E9A]/5 shadow-lg"
                                    : "border-charcoal/10 bg-white hover:border-charcoal/30",
                                plan.popular && !isSelected && "ring-2 ring-amber-400/50",
                                plan.vip && !isSelected && "ring-2 ring-purple-400/50"
                            )}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                                        {t("steps.plans.popular")}
                                    </span>
                                </div>
                            )}
                            {/* VIP Badge */}
                            {plan.vip && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                                        {plan.badge ?? "⭐ VIP"}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-4">
                                {/* Icon */}
                                <div
                                    className={cn(
                                        "p-3 rounded-xl flex-shrink-0",
                                        isSelected
                                            ? "bg-[#4A8E9A] text-dark"
                                            : "bg-charcoal/5 text-charcoal/70"
                                    )}
                                >
                                    <Icon className="w-6 h-6" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-charcoal text-lg">
                                            {planNames[plan.id]}
                                        </h3>
                                        <span className="text-sm text-charcoal/50">
                                            • {locale === "es" ? "Entrega en"
                                                : locale === "fr" ? "Livraison"
                                                    : locale === "en" ? "Delivery"
                                                        : "Entrega em"}{" "}
                                            <strong className="font-bold text-charcoal">{getDelivery(plan)}</strong>
                                        </span>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {renderVipExtrasDescription(locale, plan.id, planDescriptions[plan.id])}
                                    </p>
                                </div>

                                {/* Price + Selection */}
                                <div className="text-right flex-shrink-0">
                                    <div className="text-xl font-bold text-charcoal">
                                        {formatPrice(getPrice(plan))}
                                    </div>
                                    <div
                                        className={cn(
                                            "mt-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ml-auto",
                                            isSelected
                                                ? "bg-[#4A8E9A] border-[#4A8E9A]"
                                                : "border-charcoal/30"
                                        )}
                                    >
                                        {isSelected && <Check className="w-4 h-4 text-white" />}
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Info Box */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium text-green-800">
                            {locale === "es" ? "Garantía de Satisfacción"
                                : locale === "fr" ? "Garantie de Satisfaction"
                                    : locale === "it" ? "Garanzia di Soddisfazione"
                                        : locale === "en" ? "Satisfaction Guarantee"
                                            : "Garantia de Satisfação"}
                        </p>
                        <p className="text-sm text-green-700">
                            {locale === "es" ? "¿No te gustó? Te devolvemos el 100% de tu dinero en hasta 7 días."
                                : locale === "fr" ? "Pas satisfait ? Nous vous remboursons 100% sous 7 jours."
                                    : locale === "it" ? "Non ti piace? Ti rimborsiamo il 100% entro 7 giorni."
                                        : locale === "en" ? "Not satisfied? We'll refund 100% of your money within 7 days."
                                            : "Não gostou? Devolvemos 100% do seu dinheiro em até 7 dias."}
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

type StepCheckoutProps = {
    t: ReturnType<typeof useTranslations>;
    data: QuizData;
    updateData: (field: keyof QuizData, value: string) => void;
    onSubmit: () => void;
    onEditOrderBumps?: () => void;
    errors: { email?: string };
    setErrors: (errors: Partial<QuizData>) => void;
    isSubmitting: boolean;
    submitError: string | null;
    selectedPlan?: BRLPlanType;
    onPlanChange?: (plan: BRLPlanType) => void;
    currency?: string;
    basePriceInCents?: number;
    orderBumps?: OrderBumpSelection;
    orderBumpsReviewed?: boolean;
    appliedCoupon: AppliedCoupon | null;
    onAppliedCouponChange: (coupon: AppliedCoupon | null) => void;
    locale?: string;
    getGenreAudioUrl?: (genre: string) => string | undefined;
};

function StepCheckout({ t, data, updateData, onSubmit, onEditOrderBumps, errors, setErrors, isSubmitting, submitError, selectedPlan, onPlanChange, currency: propCurrency, basePriceInCents, orderBumps, orderBumpsReviewed, appliedCoupon, onAppliedCouponChange, locale: propLocale, getGenreAudioUrl }: StepCheckoutProps) {
    const hookLocale = useLocale();
    const locale = propLocale || hookLocale;
    const currency = propCurrency || (locale === "pt" ? "BRL" : (locale === "fr" || locale === "it") ? "EUR" : "USD");
    const common = useTranslations("common");
    const brand = common("brand");
    const genreOptions = locale === "pt" ? genreOptionsPT : locale === "es" ? genreOptionsES : locale === "fr" ? genreOptionsFR : locale === "it" ? genreOptionsIT : genreOptionsEN;
    const usesPlanPricing = locale === "pt" || locale === "es" || locale === "fr" || locale === "it";
    const bumps = orderBumps ?? {
        fastDelivery: false,
        extraSong: false,
        extraSongData: null,
        genreVariants: [],
        certificate: false,
        lyrics: false,
    };

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (currency === "BRL") return `R$${amount.toFixed(2).replace(".", ",")}`;
        if (currency === "EUR") return `€${amount.toFixed(2)}`;
        return `$${amount.toFixed(2)} USD`;
    };

    const fallbackBasePriceInCents = currency === "BRL"
        ? BRL_PLAN_PRICES_CENTS[selectedPlan ?? "express"]
        : currency === "EUR"
            ? getEurPlanPriceCents(locale, selectedPlan ?? "express")
            : usesPlanPricing
                ? ES_PLAN_PRICES_CENTS[selectedPlan ?? "express"]
                : 9900;
    const basePrice = typeof basePriceInCents === "number" ? basePriceInCents : fallbackBasePriceInCents;

    // Prices in cents (mirrors server pricing)
    const showFastDelivery = !usesPlanPricing;
    const isPremiumSixHourPlan = selectedPlan === "acelerado";
    const isEURLocale = currency === "EUR";
    const fastDeliveryPrice = 4900;
    const genreVariantPrice = locale === "es" ? 999 : isEURLocale ? 2900 : 3990;
    const certificatePrice = locale === "es" ? 999 : isEURLocale ? 1900 : 1990;
    const lyricsPrice = locale === "es" ? 999 : isEURLocale ? 900 : locale === "pt" ? 1490 : 990;
    const extraSongPrice = locale === "es" ? 999 : isEURLocale ? 2900 : currency === "BRL" ? 4990 : 4950;
    const effectiveBumps = isPremiumSixHourPlan
        ? { ...bumps, certificate: true, lyrics: true }
        : bumps;
    const chargeCertificate = effectiveBumps.certificate && !isPremiumSixHourPlan;
    const chargeLyrics = effectiveBumps.lyrics && !isPremiumSixHourPlan;

    const extrasTotal =
        (showFastDelivery && effectiveBumps.fastDelivery ? fastDeliveryPrice : 0) +
        (effectiveBumps.genreVariants?.length ?? 0) * genreVariantPrice +
        (chargeCertificate ? certificatePrice : 0) +
        (chargeLyrics ? lyricsPrice : 0) +
        (effectiveBumps.extraSong ? extraSongPrice : 0);
    const subtotalPrice = basePrice + extrasTotal;
    const discountSummary = appliedCoupon
        ? applyCouponDiscount(subtotalPrice, appliedCoupon.discountPercent)
        : { discountAmount: 0, finalTotal: subtotalPrice };
    const totalPrice = discountSummary.finalTotal;
    const couponDiscountAmount = discountSummary.discountAmount;
    const hasExtras = extrasTotal > 0;
    const hasPricingBreakdown = hasExtras || couponDiscountAmount > 0;
    const includedInPlanText = locale === "pt"
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
    const selectedExtraChips = (() => {
        const chips: { key: string; label: string; priceCents?: number; included?: boolean }[] = [];

        if (showFastDelivery && effectiveBumps.fastDelivery) {
            chips.push({
                key: "fastDelivery",
                label: t("orderBump.fastDelivery.title"),
                priceCents: fastDeliveryPrice,
            });
        }

        if (effectiveBumps.extraSong) {
            const recipientName = effectiveBumps.extraSongData?.recipientName?.trim();
            chips.push({
                key: "extraSong",
                label: recipientName
                    ? `${t("orderBump.extraSong.title")} (${recipientName})`
                    : t("orderBump.extraSong.title"),
                priceCents: extraSongPrice,
            });
        }

        const variantsCount = effectiveBumps.genreVariants?.length ?? 0;
        if (variantsCount > 0) {
            chips.push({
                key: "genreVariants",
                label: `${t("orderBump.genreVariant.title")} (${variantsCount}x)`,
                priceCents: variantsCount * genreVariantPrice,
            });
        }

        if (effectiveBumps.certificate && !isPremiumSixHourPlan) {
            chips.push({
                key: "certificate",
                label: t("orderBump.certificate.title"),
                priceCents: certificatePrice,
            });
        }

        if (effectiveBumps.lyrics && !isPremiumSixHourPlan) {
            chips.push({
                key: "lyrics",
                label: t("orderBump.lyrics.title"),
                priceCents: lyricsPrice,
            });
        }

        if (isPremiumSixHourPlan) {
            chips.push({
                key: "certificate-included",
                label: t("orderBump.certificate.title"),
                included: true,
            });
            chips.push({
                key: "lyrics-included",
                label: t("orderBump.lyrics.title"),
                included: true,
            });
            chips.push({
                key: "karaoke-included",
                label: karaokePlaybackLabel,
                included: true,
            });
        }

        return chips;
    })();
    const planLabel = (() => {
        if (!usesPlanPricing || !selectedPlan) return null;
        const prefix =
            locale === "fr"
                ? "Forfait"
                : locale === "es"
                    ? "Plan"
                    : locale === "it"
                        ? "Piano"
                        : "Plano";
        const name =
            selectedPlan === "essencial"
                ? (locale === "es"
                    ? "Esencial"
                    : locale === "fr"
                        ? "Essentiel"
                        : locale === "it"
                            ? "Essenziale"
                            : "Essencial")
                : selectedPlan === "acelerado"
                    ? "Turbo"
                    : "Express";
        return `${prefix} ${name}`;
    })();
    const checkoutDeliveryWindow = (() => {
        if (selectedPlan === "acelerado") {
            if (locale === "es") return "hasta 6h";
            if (locale === "fr") return "sous 6h";
            if (locale === "it") return "entro 6h";
            return "em até 6h";
        }
        if (selectedPlan === "express") {
            if (locale === "es") return "hasta 24h";
            if (locale === "fr") return "sous 24h";
            if (locale === "it") return "entro 24h";
            return "em até 24h";
        }
        if (locale === "es") return "hasta 7 días";
        if (locale === "fr") return "sous 7 jours";
        if (locale === "it") return "entro 7 giorni";
        return "em até 7 dias";
    })();
    const emailCardRef = useRef<HTMLDivElement>(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [showGenreModal, setShowGenreModal] = useState(false);
    const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
    const [couponInput, setCouponInput] = useState(appliedCoupon?.code ?? "");
    const [couponError, setCouponError] = useState<string | null>(null);
    const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

    const { data: checkoutCouponConfig } = api.songOrder.getCheckoutCouponConfig.useQuery();
    const validateCouponMutation = api.songOrder.validateCoupon.useMutation();
    const couponFieldEnabled = checkoutCouponConfig?.couponFieldEnabled ?? false;

    useEffect(() => {
        setCouponInput(appliedCoupon?.code ?? "");
    }, [appliedCoupon?.code]);

    useEffect(() => {
        if (!couponFieldEnabled && appliedCoupon) {
            onAppliedCouponChange(null);
            setCouponInput("");
            setCouponError(null);
            setCouponSuccess(null);
        }
    }, [appliedCoupon, couponFieldEnabled, onAppliedCouponChange]);

    const couponText = locale === "es"
        ? {
            label: "Cupón de descuento",
            placeholder: "Ingresa tu cupón",
            apply: "Aplicar",
            remove: "Quitar",
            applied: "Cupón aplicado",
            invalid: "Cupón inválido.",
        }
        : locale === "fr"
            ? {
                label: "Code promo",
                placeholder: "Entrez votre code",
                apply: "Appliquer",
                remove: "Retirer",
                applied: "Code appliqué",
                invalid: "Code promo invalide.",
            }
            : locale === "it"
                ? {
                    label: "Codice sconto",
                    placeholder: "Inserisci il codice",
                    apply: "Applica",
                    remove: "Rimuovi",
                    applied: "Codice applicato",
                    invalid: "Codice non valido.",
                }
                : locale === "en"
                    ? {
                        label: "Discount code",
                        placeholder: "Enter your code",
                        apply: "Apply",
                        remove: "Remove",
                        applied: "Code applied",
                        invalid: "Invalid code.",
                    }
                    : {
                        label: "Cupom de desconto",
                        placeholder: "Digite seu cupom",
                        apply: "Aplicar",
                        remove: "Remover",
                        applied: "Cupom aplicado",
                        invalid: "Cupom invalido.",
                    };

    const normalizeCouponInput = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");

    const handleApplyCoupon = async () => {
        if (!couponFieldEnabled) return;
        const normalized = normalizeCouponInput(couponInput);
        if (!normalized || !/^[A-Z0-9_-]{3,32}$/.test(normalized)) {
            setCouponError(couponText.invalid);
            setCouponSuccess(null);
            return;
        }

        try {
            const result = await validateCouponMutation.mutateAsync({ code: normalized });
            onAppliedCouponChange({
                code: result.code,
                discountPercent: result.discountPercent,
            });
            setCouponInput(result.code);
            setCouponError(null);
            setCouponSuccess(`${couponText.applied}: ${result.code} (-${result.discountPercent}%)`);
        } catch (error) {
            const message = error instanceof Error ? error.message : couponText.invalid;
            setCouponError(message);
            setCouponSuccess(null);
            onAppliedCouponChange(null);
        }
    };

    const handleRemoveCoupon = () => {
        onAppliedCouponChange(null);
        setCouponInput("");
        setCouponError(null);
        setCouponSuccess(null);
    };

    // Email domain suggestions based on locale
    const emailDomains = locale === "pt"
        ? ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "uol.com.br", "bol.com.br", "icloud.com"]
        : ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "protonmail.com"];

    // Default country for WhatsApp input based on locale
    const getDefaultCountry = () => {
        switch (locale) {
            case "pt": return "br";
            case "es": return "es";
            case "fr": return "fr";
            case "it": return "it";
            default: return "us";
        }
    };

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    // Detect common email typos (extra letters after .com, .com.br, etc.)
    const detectEmailTypo = (email: string): { hasTypo: boolean; suggestion: string | null; message: string | null } => {
        const lowerEmail = email.toLowerCase().trim();

        // Common domain misspellings
        const domainTypos: Record<string, string> = {
            // Gmail typos
            'gmial.com': 'gmail.com',
            'gmai.com': 'gmail.com',
            'gmali.com': 'gmail.com',
            'gmal.com': 'gmail.com',
            'gamil.com': 'gmail.com',
            'gnail.com': 'gmail.com',
            'gmail.co': 'gmail.com',
            'gmail.cm': 'gmail.com',
            'gmail.om': 'gmail.com',
            // Hotmail typos
            'hotmial.com': 'hotmail.com',
            'hotmal.com': 'hotmail.com',
            'hotmil.com': 'hotmail.com',
            'hotmai.com': 'hotmail.com',
            'hotmair.com': 'hotmail.com',
            'hotmaio.com': 'hotmail.com',
            'hotamil.com': 'hotmail.com',
            'hotmail.co': 'hotmail.com',
            'hotmail.cm': 'hotmail.com',
            'hitmail.com': 'hotmail.com',
            'hotmaill.com': 'hotmail.com',
            // Outlook typos
            'outlok.com': 'outlook.com',
            'outloo.com': 'outlook.com',
            'outlool.com': 'outlook.com',
            'outllok.com': 'outlook.com',
            'outlook.co': 'outlook.com',
            // Yahoo typos
            'yaho.com': 'yahoo.com',
            'yahooo.com': 'yahoo.com',
            'yhoo.com': 'yahoo.com',
            'yahoo.co': 'yahoo.com',
            'yahoo.cm': 'yahoo.com',
            'tahoo.com': 'yahoo.com',
            // Yahoo BR typos
            'yahoo.com.bt': 'yahoo.com.br',
            'yahoo.com.be': 'yahoo.com.br',
            'yahoo.combr': 'yahoo.com.br',
            // UOL typos
            'uol.com.bt': 'uol.com.br',
            'uol.com.be': 'uol.com.br',
            'uol.combr': 'uol.com.br',
            'oul.com.br': 'uol.com.br',
            // Terra typos
            'terra.com.bt': 'terra.com.br',
            'terra.combr': 'terra.com.br',
            // BOL typos
            'bol.com.bt': 'bol.com.br',
            'bol.combr': 'bol.com.br',
            // iCloud typos
            'iclod.com': 'icloud.com',
            'icoud.com': 'icloud.com',
            'icloud.co': 'icloud.com',
        };

        // Check for domain typos
        for (const [typo, correct] of Object.entries(domainTypos)) {
            if (lowerEmail.endsWith('@' + typo)) {
                const suggestion = lowerEmail.replace('@' + typo, '@' + correct);
                return {
                    hasTypo: true,
                    suggestion,
                    message: locale === "pt"
                        ? `Você quis dizer ${suggestion}?`
                        : `Did you mean ${suggestion}?`
                };
            }
        }

        // Common valid TLDs
        const validTLDs = [
            '.com', '.com.br', '.net', '.org', '.edu', '.gov', '.br', '.pt', '.es', '.fr', '.it', '.de', '.uk', '.co.uk',
            '.net.br', '.org.br', '.edu.br', '.gov.br', '.info', '.io', '.co', '.me', '.app', '.dev'
        ];

        // Check if email ends with a valid TLD
        const endsWithValidTLD = validTLDs.some(tld => lowerEmail.endsWith(tld));
        if (endsWithValidTLD) {
            return { hasTypo: false, suggestion: null, message: null };
        }

        // Detect typos like .comx, .comb, .comsd, etc. (extra letters after .com)
        const typoPattern = /\.(com|net|org)[a-z]+$/i;
        if (typoPattern.test(lowerEmail)) {
            const suggestion = lowerEmail.replace(/\.(com|net|org)[a-z]+$/i, '.$1');
            return {
                hasTypo: true,
                suggestion,
                message: locale === "pt"
                    ? `Você quis dizer ${suggestion}?`
                    : `Did you mean ${suggestion}?`
            };
        }

        // Detect typos like .com.bx, .com.brx (extra letters after .com.br)
        const brTypoPattern = /\.com\.br[a-z]+$/i;
        if (brTypoPattern.test(lowerEmail)) {
            const suggestion = lowerEmail.replace(/\.com\.br[a-z]+$/i, '.com.br');
            return {
                hasTypo: true,
                suggestion,
                message: locale === "pt"
                    ? `Você quis dizer ${suggestion}?`
                    : `Did you mean ${suggestion}?`
            };
        }

        // Detect .com.nr instead of .com.br
        if (lowerEmail.endsWith('.com.nr')) {
            const suggestion = lowerEmail.replace('.com.nr', '.com.br');
            return {
                hasTypo: true,
                suggestion,
                message: locale === "pt"
                    ? `Você quis dizer ${suggestion}?`
                    : `Did you mean ${suggestion}?`
            };
        }

        // Detect .con instead of .com
        if (lowerEmail.endsWith('.con')) {
            const suggestion = lowerEmail.replace('.con', '.com');
            return {
                hasTypo: true,
                suggestion,
                message: locale === "pt"
                    ? `Você quis dizer ${suggestion}?`
                    : `Did you mean ${suggestion}?`
            };
        }

        return { hasTypo: false, suggestion: null, message: null };
    };

    const [emailTypoSuggestion, setEmailTypoSuggestion] = useState<string | null>(null);

    const handleEmailChange = (value: string) => {
        updateData("email", value);
        // Clear error when user starts typing valid email
        if (errors.email && emailRegex.test(value)) {
            setErrors({});
        }
        // Show suggestions when @ is typed and there's no domain yet
        const hasAt = value.includes("@");
        const afterAt = value.split("@")[1] || "";
        setShowEmailSuggestions(hasAt && afterAt.length < 10 && !afterAt.includes("."));
    };

    const validateEmailOnBlur = () => {
        setTimeout(() => setShowEmailSuggestions(false), 300);
        const email = data.email.trim();
        if (email && !emailRegex.test(email)) {
            setErrors({ email: t("validation.invalidEmail") });
            setEmailTypoSuggestion(null);
            return;
        }
        // Check for typos even if regex passes
        const typoCheck = detectEmailTypo(email);
        if (typoCheck.hasTypo && typoCheck.suggestion) {
            setEmailTypoSuggestion(typoCheck.suggestion);
        } else {
            setEmailTypoSuggestion(null);
        }
    };

    const acceptEmailSuggestion = () => {
        if (emailTypoSuggestion) {
            updateData("email", emailTypoSuggestion);
            setEmailTypoSuggestion(null);
            setErrors({});
        }
    };

    const selectEmailDomain = (domain: string) => {
        const username = data.email.split("@")[0];
        const newEmail = `${username}@${domain}`;
        updateData("email", newEmail);
        setShowEmailSuggestions(false);
        // Clear error if valid
        if (emailRegex.test(newEmail)) {
            setErrors({});
        }
    };

    const scrollToEmail = () => {
        emailCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const handleSubmitFromCta = () => {
        const email = data.email.trim();
        if (!email) {
            setErrors({ email: t("validation.enterEmail") });
            scrollToEmail();
            return;
        }
        if (!emailRegex.test(email)) {
            setErrors({ email: t("validation.invalidEmail") });
            scrollToEmail();
            return;
        }
        onSubmit();
    };

    const whatYouGet = [
        { key: "song", icon: Music },
        { key: "lyrics", icon: FileText },
        { key: "delivery", icon: Clock },
    ];
    const expectedDeliveryLabel = t("steps.checkout.expectedDelivery").replace(/\s*:\s*$/, "");
    const selectedGenreLabel = (() => {
        const genreKey = (data.genre || "").trim();
        if (!genreKey) return null;
        try {
            return t(`steps.genre.genre.options.${genreKey}`);
        } catch {
            return genreKey;
        }
    })();

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            {/* Header Section */}
            <div className="text-center space-y-4">
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal">
                    {t("steps.checkout.title")}
                </h1>
                <p className="text-base md:text-lg text-charcoal/60">
                    {t("steps.checkout.subtitle").split("{name}")[0]}
                    <span className="font-semibold text-dark">{data.name || t("steps.checkout.someone")}</span>
                    {t("steps.checkout.subtitle").split("{name}")[1]}
                </p>
                {/* Delivery + Genre Badges */}
                <div className="flex justify-center">
                    <div className="flex flex-wrap items-stretch justify-center gap-3">
                        <div className="inline-flex flex-col items-start gap-1 rounded-2xl border border-charcoal/10 bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur">
                            <div className="flex items-center gap-2 text-xs font-semibold text-charcoal/60">
                                <Clock className="w-4 h-4 text-[#2D4739]" />
                                <span>{expectedDeliveryLabel}</span>
                            </div>
                            <span className="text-base font-bold text-charcoal tabular-nums whitespace-nowrap leading-tight">
                                {getDeliveryDate(locale, selectedPlan)}
                            </span>
                        </div>
                        {selectedGenreLabel && (
                            <div className="inline-flex max-w-[18rem] flex-col items-start gap-1 rounded-2xl border border-charcoal/10 bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur">
                                <div className="flex items-center gap-2 text-xs font-semibold text-charcoal/60">
                                    <Music className="w-4 h-4 text-dark" />
                                    <span>{t("steps.checkout.selectedGenre")}</span>
                                </div>
                                <span className="text-base font-bold text-charcoal leading-tight">
                                    {selectedGenreLabel}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Email + CTA Card */}
            <div ref={emailCardRef} className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg space-y-4">
                {/* Email Input */}
                <div className="space-y-3 relative">
                    <label className="block text-base font-bold text-charcoal">
                        {t("steps.checkout.emailLabel")} <span className="text-red-500">* {t("steps.checkout.emailRequired")}</span>
                    </label>
                    <input
                        type="email"
                        value={data.email}
                        onChange={e => handleEmailChange(e.target.value)}
                        onBlur={validateEmailOnBlur}
                        placeholder={t("steps.checkout.emailPlaceholder")}
                        className={cn(
                            "w-full px-5 py-4 rounded-2xl border-2 bg-porcelain text-lg text-charcoal placeholder:text-charcoal/40",
                            "focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10",
                            "transition-all duration-200",
                            errors.email ? "border-red-300" : "border-charcoal/30"
                        )}
                    />
                    {/* Email Domain Suggestions */}
                    {showEmailSuggestions && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-charcoal/10 rounded-xl shadow-lg z-10 overflow-hidden">
                            {emailDomains
                                .filter(domain => {
                                    const afterAt = data.email.split("@")[1] || "";
                                    return domain.toLowerCase().startsWith(afterAt.toLowerCase());
                                })
                                .slice(0, 5)
                                .map(domain => (
                                    <button
                                        key={domain}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => selectEmailDomain(domain)}
                                        className="w-full px-4 py-2.5 text-left text-charcoal hover:bg-[#4A8E9A]/10 transition-colors flex items-center"
                                    >
                                        <span className="text-charcoal/40">{data.email.split("@")[0]}@</span>
                                        <span className="font-medium">{domain}</span>
                                    </button>
                                ))}
                        </div>
                    )}
                    {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}
                    {/* Email Typo Suggestion */}
                    {emailTypoSuggestion && !errors.email && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <span className="text-amber-600 text-sm">
                                {locale === "pt" ? "Você quis dizer" : "Did you mean"}{" "}
                                <strong>{emailTypoSuggestion}</strong>?
                            </span>
                            <button
                                type="button"
                                onClick={acceptEmailSuggestion}
                                className="px-3 py-1 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                            >
                                {locale === "pt" ? "Sim, corrigir" : "Yes, fix it"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEmailTypoSuggestion(null)}
                                className="px-3 py-1 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
                            >
                                {locale === "pt" ? "Não" : "No"}
                            </button>
                        </div>
                    )}
                </div>

                {/* WhatsApp Input - Optional */}
                <div className="space-y-2">
                    <label className="block text-base font-medium text-charcoal">
                        {t("steps.checkout.whatsappLabel")}
                        <span className="text-charcoal/50 text-sm ml-1">({t("steps.checkout.optional")})</span>
                    </label>
                    <PhoneInput
                        defaultCountry={getDefaultCountry()}
                        value={data.whatsapp}
                        onChange={(phone) => updateData("whatsapp", phone)}
                        inputClassName="!w-full !py-4 !text-lg !rounded-r-2xl !border-2 !border-charcoal/30 !bg-white focus:!border-[#4A8E9A] focus:!ring-4 focus:!ring-[#4A8E9A]/10 focus:!outline-none !transition-all !duration-200"
                        countrySelectorStyleProps={{
                            buttonClassName: "!py-4 !px-4 !rounded-l-2xl !border-2 !border-charcoal/30 !border-r-0 !bg-white",
                        }}
                        className="w-full"
                    />
                    <p className="text-sm text-charcoal/60">
                        {t("steps.checkout.whatsappDescription")}
                    </p>
                </div>

                {/* Create My Song Button */}
                <button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white text-lg font-semibold transition-all shadow-lg",
                        isSubmitting
                            ? "bg-[#4A8E9A]/70 cursor-not-allowed"
                            : "bg-[#4A8E9A] hover:bg-[#F0EDE6] active:scale-[0.98]"
                    )}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t("navigation.submitting")}
                        </>
                    ) : (
                        <>
                            <Gift className="w-5 h-5" />
                            {t("navigation.submit")} - {formatPrice(totalPrice)}
                        </>
                    )}
                </button>

                {/* Submit Error */}
                {submitError && (
                    <p className="text-red-500 text-sm text-center">{submitError}</p>
                )}

                {couponFieldEnabled && (
                    <div className="space-y-2 rounded-2xl border border-charcoal/10 bg-porcelain p-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                            <Tag className="w-4 h-4 text-dark" />
                            {couponText.label}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={couponInput}
                                onChange={(event) => {
                                    setCouponInput(event.target.value.toUpperCase());
                                    setCouponError(null);
                                    setCouponSuccess(null);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        void handleApplyCoupon();
                                    }
                                }}
                                placeholder={couponText.placeholder}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-charcoal/20 bg-porcelain text-sm uppercase tracking-wide focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10"
                            />
                            {appliedCoupon ? (
                                <button
                                    type="button"
                                    onClick={handleRemoveCoupon}
                                    className="px-4 py-2.5 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 transition-colors"
                                >
                                    {couponText.remove}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleApplyCoupon()}
                                    disabled={validateCouponMutation.isPending}
                                    className={cn(
                                        "px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                                        validateCouponMutation.isPending
                                            ? "bg-[#4A8E9A]/50 text-white cursor-not-allowed"
                                            : "bg-[#4A8E9A] text-dark hover:bg-[#F0EDE6]"
                                    )}
                                >
                                    {validateCouponMutation.isPending ? "..." : couponText.apply}
                                </button>
                            )}
                        </div>
                        {couponSuccess && (
                            <p className="text-xs font-semibold text-green-700">{couponSuccess}</p>
                        )}
                        {couponError && (
                            <p className="text-xs font-semibold text-red-600">{couponError}</p>
                        )}
                    </div>
                )}

                {/* 30-Day Money Back Guarantee */}
                <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">{t("steps.checkout.guarantee30")}</span>
                </div>
            </div>

            {/* Order Summary Card */}
            <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <Music className="w-5 h-5 text-dark" />
                    <h3 className="font-bold text-charcoal text-lg">
                        {t("steps.checkout.orderSummary.title")}
                    </h3>
                </div>

                {/* Pricing Breakdown (only when there are extras) */}
                {hasPricingBreakdown && (
                    <>
                        <div className="space-y-3 mb-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-semibold text-charcoal">
                                        {t("steps.checkout.orderSummary.customSong")}
                                    </p>
                                    {locale !== "pt" && locale !== "es" && (
                                        <span className="inline-block px-2 py-0.5 text-xs font-semibold text-green-700 bg-green-100 rounded-full mt-1">
                                            {t("steps.checkout.orderSummary.discount")}
                                        </span>
                                    )}
                                </div>
                                <span className="text-lg font-bold text-charcoal tabular-nums">
                                    {formatPrice(basePrice)}
                                </span>
                            </div>

                            {/* Extras */}
                            {showFastDelivery && effectiveBumps.fastDelivery && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-charcoal/70">{t("orderBump.fastDelivery.title")}</span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {formatPrice(fastDeliveryPrice)}
                                    </span>
                                </div>
                            )}
                            {effectiveBumps.extraSong && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-charcoal/70">
                                        {t("orderBump.extraSong.title")}
                                        {effectiveBumps.extraSongData?.recipientName ? ` (${effectiveBumps.extraSongData.recipientName})` : ""}
                                    </span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {formatPrice(extraSongPrice)}
                                    </span>
                                </div>
                            )}
                            {(effectiveBumps.genreVariants?.length ?? 0) > 0 && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-charcoal/70">
                                        {t("orderBump.genreVariant.title")} ({effectiveBumps.genreVariants.length}x)
                                    </span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {formatPrice(effectiveBumps.genreVariants.length * genreVariantPrice)}
                                    </span>
                                </div>
                            )}
                            {effectiveBumps.certificate && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-charcoal/70">{t("orderBump.certificate.title")}</span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {isPremiumSixHourPlan ? includedInPlanText : formatPrice(certificatePrice)}
                                    </span>
                                </div>
                            )}
                            {effectiveBumps.lyrics && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-charcoal/70">{t("orderBump.lyrics.title")}</span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {isPremiumSixHourPlan ? includedInPlanText : formatPrice(lyricsPrice)}
                                    </span>
                                </div>
                            )}
                            {isPremiumSixHourPlan && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-charcoal/70">{karaokePlaybackLabel}</span>
                                    <span className="font-medium text-charcoal tabular-nums">
                                        {includedInPlanText}
                                    </span>
                                </div>
                            )}
                            {appliedCoupon && couponDiscountAmount > 0 && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-green-700">
                                        {couponText.label} ({appliedCoupon.code}) -{appliedCoupon.discountPercent}%
                                    </span>
                                    <span className="font-semibold text-green-700 tabular-nums">
                                        -{formatPrice(couponDiscountAmount)}
                                    </span>
                                </div>
                            )}

                            <div className="border-t border-charcoal/10 pt-3 flex items-center justify-between">
                                <span className="font-semibold text-charcoal">
                                    {t("steps.checkout.orderSummary.total")}
                                </span>
                                <span className="text-xl font-bold text-dark tabular-nums">
                                    {formatPrice(totalPrice)}
                                </span>
                            </div>
                        </div>

                        <div className="border-t border-charcoal/10 my-4" />
                    </>
                )}

                {/* Edit Actions */}
                <div className="space-y-3">
                    {usesPlanPricing && onPlanChange && selectedPlan && planLabel && (
                        <button
                            type="button"
                            onClick={() => setShowPlanModal(true)}
                            className="group w-full rounded-2xl border-2 border-[#2D4739]/25 bg-[#2D4739]/10 hover:bg-[#2D4739]/15 shadow-sm transition-all active:scale-[0.99] text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2D4739]/15"
                        >
                            <div className="flex items-start gap-4 p-4">
                                <div className="mt-0.5 w-10 h-10 rounded-xl bg-[#2D4739] text-white flex items-center justify-center shadow-sm">
                                    <Rocket className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-base font-semibold text-[#2D4739] leading-tight">
                                            {t("steps.checkout.changePlan")}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-[#2D4739] tabular-nums whitespace-nowrap">
                                                {formatPrice(basePrice)}
                                            </span>
                                            <ChevronRight className="w-5 h-5 text-charcoal/30 group-hover:text-charcoal/60 transition-colors" />
                                        </div>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("steps.checkout.changePlanHint", { plan: planLabel })}
                                    </p>
                                </div>
                            </div>
                        </button>
                    )}
                    {selectedGenreLabel && (
                        <button
                            type="button"
                            onClick={() => setShowGenreModal(true)}
                            className="group w-full rounded-2xl border-2 border-[#0F766E]/20 bg-[#0F766E]/10 hover:bg-[#0F766E]/15 shadow-sm transition-all active:scale-[0.99] text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0F766E]/15"
                        >
                            <div className="flex items-start gap-4 p-4">
                                <div className="mt-0.5 w-10 h-10 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shadow-sm">
                                    <Music className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-base font-semibold text-[#0F766E] leading-tight">
                                            {t("steps.checkout.changeGenre")}
                                        </p>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-sm font-semibold text-[#0F766E] truncate max-w-[10rem] sm:max-w-[14rem]">
                                                {selectedGenreLabel}
                                            </span>
                                            <ChevronRight className="w-5 h-5 text-charcoal/30 group-hover:text-charcoal/60 transition-colors flex-shrink-0" />
                                        </div>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("steps.checkout.changeGenreHint")}
                                    </p>
                                </div>
                            </div>
                        </button>
                    )}
                    {onEditOrderBumps && (
                        <button
                            type="button"
                            onClick={onEditOrderBumps}
                            className="group w-full rounded-2xl border-2 border-[#4A8E9A]/25 bg-[#4A8E9A]/10 hover:bg-[#4A8E9A]/15 shadow-sm transition-all active:scale-[0.99] text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4A8E9A]/15"
                        >
                            <div className="flex items-start gap-4 p-4">
                                <div className="p-3 rounded-2xl bg-[#4A8E9A]/10 text-[#4A8E9A] group-hover:bg-[#4A8E9A]/20 transition-colors">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-base font-semibold text-dark leading-tight">
                                            {orderBumpsReviewed || hasExtras
                                                ? t("steps.checkout.orderSummary.editExtras")
                                                : t("steps.checkout.orderSummary.addExtras")}
                                        </p>
                                        <ChevronRight className="w-5 h-5 text-charcoal/30 group-hover:text-charcoal/60 transition-colors" />
                                    </div>
                                    {selectedExtraChips.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {selectedExtraChips.map((extra) => (
                                                <span
                                                    key={extra.key}
                                                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#4A8E9A]/25 bg-white/70 px-2.5 py-1 text-xs font-semibold text-charcoal/70"
                                                >
                                                    <span className="truncate max-w-[9.5rem] sm:max-w-[13rem]">
                                                        {extra.label}
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-charcoal/60 mt-1">
                                            {t("steps.checkout.orderSummary.addExtras")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            <GenreEditModal
                    isOpen={showGenreModal}
                    onClose={() => setShowGenreModal(false)}
                    t={t}
                    locale={locale}
                    currentGenre={data.genre}
                    onSave={(genre) => updateData("genre", genre)}
                    getGenreAudioUrl={getGenreAudioUrl}
                />

                {usesPlanPricing && onPlanChange && selectedPlan && (
                    <PlanEditModal
                        isOpen={showPlanModal}
                        onClose={() => setShowPlanModal(false)}
                        t={t}
                        locale={locale}
                        currentPlan={selectedPlan}
                        onSave={(plan) => onPlanChange(plan)}
                    />
                )}

                {/* Money Back Guarantee */}
                                                                <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
                                                                    {/* Header */}
                                                                    <div className="flex items-center gap-3 mb-5">
                                                                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                                                                        <h3 className="font-bold text-green-800 text-lg">
                                                                            {t("steps.checkout.guarantee.title")}
                                                                        </h3>
                                                                    </div>

                                                                    {/* Guarantee Points */}
                                                                    <div className="space-y-4">
                                                                        <div className="flex items-start gap-3">
                                                                            <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                                                                            <div>
                                                                                <p className="font-semibold text-green-800">{t("steps.checkout.guarantee.refund.title")}</p>
                                                                                <p className="text-sm text-green-700">{t("steps.checkout.guarantee.refund.description")}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start gap-3">
                                                                            <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                                                                            <div>
                                                                                <p className="font-semibold text-green-800">{t("steps.checkout.guarantee.time.title")}</p>
                                                                                <p className="text-sm text-green-700">{t("steps.checkout.guarantee.time.description")}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start gap-3">
                                                                            <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                                                                            <div>
                                                                                <p className="font-semibold text-green-800">{t("steps.checkout.guarantee.riskFree.title")}</p>
                                                                                <p className="text-sm text-green-700">{t("steps.checkout.guarantee.riskFree.description")}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Middle CTA */}
                                                                <div className="text-center space-y-3">
                                                                    <button
                                                                        onClick={handleSubmitFromCta}
                                                                        disabled={isSubmitting}
                                                                        className={cn(
                                                                            "w-full flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white text-lg font-semibold transition-all shadow-lg",
                                                                            isSubmitting
                                                                                ? "bg-[#4A8E9A]/70 cursor-not-allowed"
                                                                                : "bg-[#4A8E9A] hover:bg-[#F0EDE6] active:scale-[0.98]"
                                                                        )}
                                                                    >
                                                                        <Gift className="w-5 h-5" />
                                                                        {t("navigation.submit")} - {formatPrice(totalPrice)}
                                                                    </button>
                                                                    <p className="text-sm text-charcoal/60">
                                                                        {locale === "pt"
                                                                            ? `Pronto para criar algo especial para ${data.name || "quem você ama"}?`
                                                                            : `Ready to create something special for ${data.name || "your loved one"}?`}
                                                                    </p>
                                                                </div>

                                                                {/* What You'll Get */}
                                                                <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-sm">
                                                                    <div className="flex items-center gap-2 mb-5">
                                                                        <Gift className="w-5 h-5 text-dark" />
                                                                        <h3 className="text-lg font-bold text-charcoal">
                                                                            {t("steps.checkout.whatYouGet.title")}
                                                                        </h3>
                                                                    </div>
                                                                    <div className="space-y-4">
                                                                        {whatYouGet.map((item) => (
                                                                            <div key={item.key} className="flex items-start gap-3">
                                                                                <div className="w-2 h-2 rounded-full bg-[#4A8E9A] mt-2 flex-shrink-0" />
                                                                                <div>
                                                                                    <p className="font-semibold text-charcoal">
                                                                                        {t(`steps.checkout.whatYouGet.${item.key}.title`).replace(
                                                                                            "{deliveryTime}",
                                                                                            checkoutDeliveryWindow
                                                                                        )}
                                                                                    </p>
                                                                                    <p className="text-sm text-charcoal/60">
                                                                                        {t(`steps.checkout.whatYouGet.${item.key}.description`).replace(
                                                                                            "{name}",
                                                                                            data.name || t("steps.checkout.someone")
                                                                                        )}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                {/* Why Choose Brand */}
                                                                <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-sm">
                                                                    <div className="flex items-center gap-2 mb-5">
                                                                        <Star className="w-5 h-5 text-dark" />
                                                                        <h3 className="text-lg font-bold text-charcoal">
                                                                            {locale === "pt" ? `Por Que Escolher ${brand}?` : locale === "es" ? `¿Por Qué Elegir ${brand}?` : `Why Choose ${brand}?`}
                                                                        </h3>
                                                                    </div>
                                                                    <div className="space-y-3">
                                                                        {[
                                                                            locale === "pt" ? "+3.000 clientes satisfeitos" : locale === "es" ? "+3,000 clientes satisfechos" : "3,000+ satisfied customers",
                                                                            locale === "pt" ? "100% garantia de satisfação" : locale === "es" ? "100% garantía de satisfacción" : "100% satisfaction guarantee",
                                                                            locale === "pt" ? "Pagamento seguro" : locale === "es" ? "Pago seguro" : "Secure payment processing",
                                                                            locale === "pt"
                                                                                ? `Entregue em ${selectedPlan === "acelerado" ? "até 6h" : (selectedPlan === "express" ? "até 24h" : "até 7 dias")}`
                                                                                : locale === "es"
                                                                                    ? `Entrega en ${selectedPlan === "acelerado" ? "hasta 6h" : (selectedPlan === "express" ? "hasta 24h" : "hasta 7 días")}`
                                                                                    : "Delivered in just 7 days",
                                                                        ].map((item, i) => (
                                                                            <div key={i} className="flex items-center gap-3">
                                                                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                                                                <span className="text-charcoal">{item}</span>
                                                                            </div>
                                                                        ))}
                                                                        {/* WhatsApp Support - text only, no link to avoid friction */}
                                                                        <div className="flex items-center gap-3">
                                                                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#25D366] flex-shrink-0" fill="currentColor">
                                                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                                            </svg>
                                                                            <span className="text-charcoal">
                                                                                {locale === "pt" ? "Suporte exclusivo via WhatsApp: (61) 99579-0193" : locale === "es" ? "Soporte exclusivo por WhatsApp: +55 61 99579-0193" : "Exclusive WhatsApp support: +55 61 99579-0193"}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Testimonials Slider */}
                                                                <TestimonialsSlider locale={locale} />
                                                            </motion.div>
                                                        );
}

                                                        // Testimonials Slider Component
                                                        function TestimonialsSlider({locale}: {locale: string }) {
    const [currentIndex, setCurrentIndex] = useState(0);

                                                        const testimonialsByLocale: Record<string, {name: string; location: string; image: string; quote: string }[]> = {
                                                            pt: [
                                                        {
                                                            name: "Maria Silva",
                                                        location: "São Paulo, SP",
                                                        image: "/images/reviews/avatar-8.webp",
                                                        quote: "Minha mãe chorou quando ouviu a música. Ela disse que foi o presente mais especial que já recebeu em 70 anos de vida. Valeu cada centavo!"
            },
                                                        {
                                                            name: "João Pedro",
                                                        location: "Rio de Janeiro, RJ",
                                                        image: "/images/reviews/avatar-9.webp",
                                                        quote: "Surpreendi minha esposa no nosso aniversário de casamento. Ela não conseguia parar de chorar. Agora tocamos a música toda semana em casa."
            },
                                                        {
                                                            name: "Ana Carolina",
                                                        location: "Belo Horizonte, MG",
                                                        image: "/images/reviews/avatar-20.webp",
                                                        quote: "Perdi meu pai há 2 anos e encomendei uma música em sua memória. A letra capturou exatamente quem ele era. Minha família inteira se emocionou."
            }
                                                        ],
                                                        es: [
                                                        {
                                                            name: "María García",
                                                        location: "Ciudad de México",
                                                        image: "/images/reviews/avatar-8.webp",
                                                        quote: "Mi mamá lloró cuando escuchó la canción. Dijo que fue el regalo más especial que ha recibido en 70 años. ¡Valió cada centavo!"
            },
                                                        {
                                                            name: "Carlos Rodríguez",
                                                        location: "Buenos Aires, Argentina",
                                                        image: "/images/reviews/avatar-9.webp",
                                                        quote: "Sorprendí a mi esposa en nuestro aniversario. No podía dejar de llorar. Ahora escuchamos la canción cada semana en casa."
            },
                                                        {
                                                            name: "Ana Martínez",
                                                        location: "Madrid, España",
                                                        image: "/images/reviews/avatar-20.webp",
                                                        quote: "Perdí a mi padre hace 2 años y encargué una canción en su memoria. La letra capturó exactamente quién era él. Toda mi familia se emocionó."
            }
                                                        ],
                                                        fr: [
                                                        {
                                                            name: "Marie Dubois",
                                                        location: "Paris, France",
                                                        image: "/images/reviews/avatar-8.webp",
                                                        quote: "Ma mère a pleuré quand elle a entendu la chanson. Elle a dit que c'était le cadeau le plus spécial qu'elle ait jamais reçu en 70 ans. Ça valait chaque centime !"
            },
                                                        {
                                                            name: "Jean-Pierre Martin",
                                                        location: "Lyon, France",
                                                        image: "/images/reviews/avatar-9.webp",
                                                        quote: "J'ai surpris ma femme pour notre anniversaire. Elle n'arrêtait pas de pleurer. Maintenant, nous écoutons la chanson chaque semaine à la maison."
            },
                                                        {
                                                            name: "Sophie Laurent",
                                                        location: "Marseille, France",
                                                        image: "/images/reviews/avatar-20.webp",
                                                        quote: "J'ai perdu mon père il y a 2 ans et j'ai commandé une chanson en sa mémoire. Les paroles ont capturé exactement qui il était. Toute ma famille était émue."
            }
                                                        ],
                                                        it: [
                                                        {
                                                            name: "Giulia Rossi",
                                                        location: "Roma, Italia",
                                                        image: "/images/reviews/avatar-8.webp",
                                                        quote: "Mia madre ha pianto quando ha sentito la canzone. Ha detto che era il regalo più speciale che abbia mai ricevuto in 70 anni. Ne è valsa la pena!"
            },
                                                        {
                                                            name: "Marco Bianchi",
                                                        location: "Milano, Italia",
                                                        image: "/images/reviews/avatar-9.webp",
                                                        quote: "Ho sorpreso mia moglie per il nostro anniversario. Non riusciva a smettere di piangere. Ora ascoltiamo la canzone ogni settimana a casa."
            },
                                                        {
                                                            name: "Francesca Romano",
                                                        location: "Napoli, Italia",
                                                        image: "/images/reviews/avatar-20.webp",
                                                        quote: "Ho perso mio padre 2 anni fa e ho ordinato una canzone in sua memoria. Il testo ha catturato esattamente chi era. Tutta la mia famiglia si è commossa."
            }
                                                        ],
                                                        en: [
                                                        {
                                                            name: "Sarah Johnson",
                                                        location: "Austin, TX",
                                                        image: "/images/reviews/avatar-8.webp",
                                                        quote: "My mom cried when she heard the song. She said it was the most special gift she's ever received in 70 years. Worth every penny!"
            },
                                                        {
                                                            name: "Michael Brown",
                                                        location: "Nashville, TN",
                                                        image: "/images/reviews/avatar-9.webp",
                                                        quote: "I surprised my wife on our anniversary. She couldn't stop crying. Now we play the song every week at home. It's become our anthem."
            },
                                                        {
                                                            name: "Emily Davis",
                                                        location: "Denver, CO",
                                                        image: "/images/reviews/avatar-20.webp",
                                                        quote: "I lost my father 2 years ago and ordered a song in his memory. The lyrics captured exactly who he was. My whole family was moved to tears."
            }
                                                        ]
    };

                                                        const testimonials = testimonialsByLocale[locale] ?? testimonialsByLocale.en!;

    const nextTestimonial = () => {
                                                            setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    };

    const prevTestimonial = () => {
                                                            setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    };

                                                        const current = testimonials[currentIndex];

                                                        return (
                                                        <div className="bg-white rounded-3xl p-6 border border-charcoal/10 shadow-lg">
                                                            <div className="text-center mb-6">
                                                                <h3 className="text-xl font-serif font-bold text-charcoal">
                                                                    {locale === "pt" ? "O Que Nossos Clientes Dizem"
                                                                        : locale === "es" ? "Lo Que Dicen Nuestros Clientes"
                                                                            : locale === "fr" ? "Ce Que Disent Nos Clients"
                                                                                : locale === "it" ? "Cosa Dicono i Nostri Clienti"
                                                                                    : "What Our Customers Say"}
                                                                </h3>
                                                            </div>

                                                            <div className="relative">
                                                                {/* Testimonial Content */}
                                                                <div className="text-center px-4">
                                                                    {/* Avatar */}
                                                                    <div className="w-16 h-16 rounded-full bg-[#4A8E9A]/20 mx-auto mb-4 flex items-center justify-center overflow-hidden relative">
                                                                        {current?.image ? (
                                                                            <Image
                                                                                src={current.image}
                                                                                alt={current.name}
                                                                                fill
                                                                                sizes="64px"
                                                                                className="object-cover"
                                                                            />
                                                                        ) : (
                                                                            <span className="text-2xl font-bold text-dark">
                                                                                {current?.name.charAt(0)}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Quote */}
                                                                    <p className="text-charcoal/80 italic mb-4 leading-relaxed">
                                                                        "{current?.quote}"
                                                                    </p>

                                                                    {/* Name & Location */}
                                                                    <p className="font-semibold text-charcoal">{current?.name}</p>
                                                                    <p className="text-sm text-charcoal/50">{current?.location}</p>
                                                                </div>

                                                                {/* Navigation */}
                                                                <div className="flex items-center justify-center gap-4 mt-6">
                                                                    <button
                                                                        onClick={prevTestimonial}
                                                                        className="w-10 h-10 rounded-full bg-charcoal/5 hover:bg-charcoal/10 flex items-center justify-center transition-colors"
                                                                    >
                                                                        <ChevronLeft className="w-5 h-5 text-charcoal/60" />
                                                                    </button>

                                                                    {/* Dots */}
                                                                    <div className="flex gap-2">
                                                                        {testimonials.map((_, i) => (
                                                                            <button
                                                                                key={i}
                                                                                onClick={() => setCurrentIndex(i)}
                                                                                className={cn(
                                                                                    "w-2 h-2 rounded-full transition-colors",
                                                                                    i === currentIndex ? "bg-[#4A8E9A]" : "bg-charcoal/20"
                                                                                )}
                                                                            />
                                                                        ))}
                                                                    </div>

                                                                    <button
                                                                        onClick={nextTestimonial}
                                                                        className="w-10 h-10 rounded-full bg-charcoal/5 hover:bg-charcoal/10 flex items-center justify-center transition-colors"
                                                                    >
                                                                        <ChevronRight className="w-5 h-5 text-charcoal/60" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                );
}

                                                // Review Modal Component
                                                type ReviewModalProps = {
                                                    isOpen: boolean;
    onClose: () => void;
                                                t: ReturnType<typeof useTranslations>;
                                                    data: QuizData;
    updateData: (field: keyof QuizData, value: string) => void;
                                                    locale: string;
};

                                                    function ReviewModal({isOpen, onClose, t, data, updateData, locale}: ReviewModalProps) {
    const [localData, setLocalData] = useState<QuizData>(data);
                                                        const isSelf = localData.recipient === "myself";
                                                        const honoreeName = (localData.name || data.name || "").trim();

    // Reset local data when modal opens
    useEffect(() => {
        if (isOpen) {
                                                            setLocalData(data);
        }
    }, [isOpen, data]);

    const handleSave = () => {
                                                            updateData("qualities", localData.qualities);
                                                        updateData("memories", localData.memories);
                                                        updateData("message", localData.message);
                                                        onClose();
    };

    const updateLocalData = (field: keyof QuizData, value: string) => {
                                                            setLocalData(prev => ({ ...prev, [field]: value }));
    };

                                                        if (!isOpen) return null;

                                                        return (
                                                        <AnimatePresence>
                                                            {isOpen && (
                                                                <>
                                                                    {/* Backdrop */}
                                                                    <motion.div
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        exit={{ opacity: 0 }}
                                                                        className="fixed inset-0 bg-black/50 z-50"
                                                                    />

                                                                    {/* Modal */}
                                                                    <motion.div
                                                                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                                                        className="fixed inset-0 w-full h-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
                                                                    >
                                                                        {/* Header */}
                                                                        <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 bg-porcelain p-5 sm:p-6">
                                                                            <div className="min-w-0">
                                                                                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-charcoal leading-tight">
                                                                                    {t("steps.checkout.modal.title")}
                                                                                </h2>
                                                                                {honoreeName && (
                                                                                    <p className="mt-3 inline-flex max-w-full items-center rounded-full border border-charcoal/10 bg-white px-4 py-2 text-base sm:text-lg font-semibold text-charcoal shadow-sm">
                                                                                        {t("steps.checkout.modal.honoree", { name: honoreeName })}
                                                                                    </p>
                                                                                )}
                                                                                <p className="text-base sm:text-lg text-charcoal/70 mt-3 leading-relaxed">
                                                                                    {t("steps.checkout.modal.subtitle")}
                                                                                </p>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={onClose}
                                                                                className="shrink-0 w-12 h-12 rounded-full bg-white border border-charcoal/10 text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5 transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4A8E9A]/15"
                                                                                aria-label={t("pendingOrder.close")}
                                                                            >
                                                                                <X className="w-6 h-6" />
                                                                            </button>
                                                                        </div>

                                                                        {/* Content - Scrollable */}
                                                                        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
                                                                            {/* Qualities Section */}
                                                                            <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                <h3 className="text-lg sm:text-xl font-semibold text-dark leading-tight">
                                                                                    {isSelf ? t("steps.qualities.titleSelf") : t("steps.qualities.title")}
                                                                                </h3>
                                                                                <div className="space-y-2">
                                                                                    <label htmlFor="review-qualities" className="block text-base font-semibold text-charcoal">
                                                                                        {isSelf ? t("steps.qualities.qualities.labelSelf") : t("steps.qualities.qualities.label")}
                                                                                    </label>
                                                                                    <textarea
                                                                                        id="review-qualities"
                                                                                        value={localData.qualities}
                                                                                        onChange={e => updateLocalData("qualities", e.target.value)}
                                                                                        placeholder={isSelf ? t("steps.qualities.qualities.placeholderSelf") : t("steps.qualities.qualities.placeholder")}
                                                                                        rows={6}
                                                                                        className="w-full px-4 py-4 rounded-2xl border border-charcoal/15 bg-porcelain text-[16px] leading-relaxed text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {/* Memories Section */}
                                                                            <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                <h3 className="text-lg sm:text-xl font-semibold text-dark leading-tight">
                                                                                    {isSelf ? t("steps.memories.titleSelf") : t("steps.memories.title")}
                                                                                </h3>
                                                                                <div className="space-y-2">
                                                                                    <label htmlFor="review-memories" className="block text-base font-semibold text-charcoal">
                                                                                        {isSelf ? t("steps.memories.memories.labelSelf") : t("steps.memories.memories.label")}
                                                                                    </label>
                                                                                    <textarea
                                                                                        id="review-memories"
                                                                                        value={localData.memories}
                                                                                        onChange={e => updateLocalData("memories", e.target.value)}
                                                                                        placeholder={isSelf ? t("steps.memories.memories.placeholderSelf") : t("steps.memories.memories.placeholder")}
                                                                                        rows={6}
                                                                                        className="w-full px-4 py-4 rounded-2xl border border-charcoal/15 bg-porcelain text-[16px] leading-relaxed text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {/* Message Section */}
                                                                            <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                <h3 className="text-lg sm:text-xl font-semibold text-dark leading-tight">
                                                                                    {isSelf ? t("steps.message.titleSelf") : t("steps.message.title")}
                                                                                </h3>
                                                                                <div className="space-y-2">
                                                                                    <label htmlFor="review-message" className="block text-base font-semibold text-charcoal">
                                                                                        {isSelf ? t("steps.message.message.labelSelf") : t("steps.message.message.label")}
                                                                                    </label>
                                                                                    <textarea
                                                                                        id="review-message"
                                                                                        value={localData.message}
                                                                                        onChange={e => updateLocalData("message", e.target.value)}
                                                                                        placeholder={isSelf ? t("steps.message.message.placeholderSelf") : t("steps.message.message.placeholder")}
                                                                                        rows={6}
                                                                                        className="w-full px-4 py-4 rounded-2xl border border-charcoal/15 bg-porcelain text-[16px] leading-relaxed text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:border-[#4A8E9A] focus:ring-4 focus:ring-[#4A8E9A]/10"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Footer */}
                                                                        <div className="border-t border-charcoal/10 bg-porcelain px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:pt-5">
                                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={onClose}
                                                                                    className="w-full py-4 rounded-2xl bg-white border-2 border-charcoal/20 text-charcoal text-base font-semibold hover:border-charcoal/40 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-charcoal/10"
                                                                                >
                                                                                    {t("steps.checkout.modal.cancel")}
                                                                                </button>
                                                                                <Button
                                                                                    type="button"
                                                                                    onClick={handleSave}
                                                                                    variant="aegean"
                                                                                    className="w-full py-4 rounded-2xl font-semibold"
                                                                                >
                                                                                    {t("steps.checkout.modal.save")}
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </motion.div>
                                                                </>
                                                            )}
                                                        </AnimatePresence>
                                                        );
}

                                                        type GenreEditModalProps = {
                                                            isOpen: boolean;
    onClose: () => void;
                                                        t: ReturnType<typeof useTranslations>;
                                                            locale: string;
                                                            currentGenre: string;
    onSave: (genre: string) => void;
    getGenreAudioUrl?: (genre: string) => string | undefined;
};

                                                            function GenreEditModal({isOpen, onClose, t, locale, currentGenre, onSave, getGenreAudioUrl}: GenreEditModalProps) {
    const [draftGenre, setDraftGenre] = useState(currentGenre || "");

    useEffect(() => {
        if (!isOpen) return;
                                                            setDraftGenre(currentGenre || "");
    }, [isOpen, currentGenre]);

                                                            const genreOptions = locale === "pt" ? genreOptionsPT : locale === "es" ? genreOptionsES : locale === "fr" ? genreOptionsFR : locale === "it" ? genreOptionsIT : genreOptionsEN;
    const selectedLabel = (() => {
        const key = (draftGenre || "").trim();
                                                            if (!key) return null;
                                                            try {
            return t(`steps.genre.genre.options.${key}`);
        } catch {
            return key;
        }
    })();

    const getBaseGenre = (genre: string) => {
        const g = (genre || "").trim();
                                                            if (!g) return "";
                                                            if (g === "forro" || isForroSubgenre(g)) return "forro";
                                                            if (g === "country" || isSertanejoSubgenre(g)) return "country";
                                                            if (g === "funk" || isFunkSubgenre(g)) return "funk";
                                                            if (g === "rock" || isRockSubgenre(g)) return "rock";
                                                            if (g === "brega" || isBregaSubgenre(g)) return "brega";
                                                            if (g === "pagode" || isPagodeSubgenre(g)) return "pagode";
                                                            if (g === "mpb" || isMpbSubgenre(g)) return "mpb";
                                                            if (g === "eletronica" || isEletronicaSubgenre(g)) return "eletronica";
                                                            if (g === "lullaby" || isLullabySubgenre(g)) return "lullaby";
                                                            if (g === "latina" || isLatinaSubgenre(g)) return "latina";
                                                            if (g === "blues" || isBluesSubgenre(g)) return "blues";
                                                            return g;
    };

                                                            const baseGenre = getBaseGenre(draftGenre);
    const requiresSubgenreSelection = (genre: string) =>
                                                            genre === "blues" || (locale === "pt" && ["forro", "country", "funk", "rock", "brega", "pagode", "mpb", "eletronica", "lullaby", "latina"].includes(genre));

                                                            const isDraftComplete = Boolean(draftGenre) && !requiresSubgenreSelection(draftGenre);

                                                            const showForroSubgenres = locale === "pt" && baseGenre === "forro";
                                                            const showSertanejoSubgenres = locale === "pt" && baseGenre === "country";
                                                            const showFunkSubgenres = locale === "pt" && baseGenre === "funk";
                                                            const showRockSubgenres = locale === "pt" && baseGenre === "rock";
                                                            const showBregaSubgenres = locale === "pt" && baseGenre === "brega";
                                                            const showPagodeSubgenres = locale === "pt" && baseGenre === "pagode";
                                                            const showMpbSubgenres = locale === "pt" && baseGenre === "mpb";
                                                            const showEletronicaSubgenres = locale === "pt" && baseGenre === "eletronica";
                                                            const showLullabySubgenres = locale === "pt" && baseGenre === "lullaby";
                                                            const showLatinaSubgenres = locale === "pt" && baseGenre === "latina";
                                                            const showBluesSubgenres = baseGenre === "blues";

                                                            if (!isOpen) return null;

                                                            return (
                                                            <AnimatePresence>
                                                                {isOpen && (
                                                                    <>
                                                                        <motion.div
                                                                            initial={{ opacity: 0 }}
                                                                            animate={{ opacity: 1 }}
                                                                            exit={{ opacity: 0 }}
                                                                            className="fixed inset-0 bg-black/50 z-50"
                                                                        />
                                                                        <motion.div
                                                                            initial={{ opacity: 0, scale: 0.98, y: 20 }}
                                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                            exit={{ opacity: 0, scale: 0.98, y: 20 }}
                                                                            className="fixed inset-0 w-full h-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
                                                                        >
                                                                            <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 bg-porcelain p-5 sm:p-6">
                                                                                <div className="min-w-0">
                                                                                    <h2 className="text-2xl sm:text-3xl font-serif font-bold text-charcoal leading-tight">
                                                                                        {t("steps.checkout.changeGenre")}
                                                                                    </h2>
                                                                                    <p className="text-base sm:text-lg text-charcoal/70 mt-2 leading-relaxed">
                                                                                        {t("steps.checkout.changeGenreHint")}
                                                                                    </p>
                                                                                    {selectedLabel && (
                                                                                        <p className="mt-3 inline-flex max-w-full items-center rounded-full border border-charcoal/10 bg-white px-4 py-2 text-base font-semibold text-charcoal shadow-sm">
                                                                                            {t("steps.checkout.selectedGenre")}:{" "}
                                                                                            <span className="ml-2 truncate max-w-[15rem]">{selectedLabel}</span>
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={onClose}
                                                                                    className="shrink-0 w-12 h-12 rounded-full bg-white border border-charcoal/10 text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5 transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4A8E9A]/15"
                                                                                    aria-label={t("pendingOrder.close")}
                                                                                >
                                                                                    <X className="w-6 h-6" />
                                                                                </button>
                                                                            </div>

                                                                            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
                                                                                <div className="space-y-3">
                                                                                    <p className="text-base font-bold text-charcoal">
                                                                                        {t("steps.genre.genre.label")}
                                                                                    </p>
                                                                                    <div className="flex flex-wrap gap-3">
                                                                                        {genreOptions.map((option) => {
                                                                                            const isSelected = option === baseGenre;
                                                                                            const hasSubgenres = option === "blues" || (locale === "pt" && ["forro", "country", "funk", "rock", "brega", "pagode", "mpb", "eletronica", "lullaby", "latina"].includes(option));
                                                                                            const audioUrl = !hasSubgenres && isSelected ? getGenreAudioUrl?.(option) : undefined;

                                                                                            return (
                                                                                                <div key={option} className="flex items-center gap-2">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => setDraftGenre(option)}
                                                                                                        className={cn(
                                                                                                            "px-5 py-3 rounded-full border-2 text-base font-medium transition-all duration-200 active:scale-[0.96]",
                                                                                                            isSelected
                                                                                                                ? "border-[#0F766E] bg-[#0F766E] text-white shadow-md"
                                                                                                                : "border-charcoal/15 text-charcoal bg-white hover:border-[#0F766E]/50 hover:bg-[#0F766E]/5 hover:shadow-md"
                                                                                                        )}
                                                                                                    >
                                                                                                        {t(`steps.genre.genre.options.${option}`)}
                                                                                                    </button>
                                                                                                    {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>

                                                                                {!isDraftComplete && requiresSubgenreSelection(draftGenre) && (
                                                                                    <div className="rounded-2xl border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 p-4">
                                                                                        <p className="text-sm font-semibold text-charcoal">
                                                                                            {t("validation.selectSubgenre")}
                                                                                        </p>
                                                                                    </div>
                                                                                )}

                                                                                {showForroSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.forro.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.forro.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {forroSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showSertanejoSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.sertanejo.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.sertanejo.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {sertanejoSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showFunkSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.funk.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.funk.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {funkSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showRockSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.rock.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.rock.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {rockSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showBregaSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.brega.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.brega.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {bregaSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showPagodeSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.pagode.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.pagode.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {pagodeSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showMpbSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.mpb.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.mpb.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {mpbSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showEletronicaSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.eletronica.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.eletronica.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {eletronicaSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showLullabySubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.lullaby.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.lullaby.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {lullabySubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showLatinaSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.latina.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.latina.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {latinaSubgenresPT.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {showBluesSubgenres && (
                                                                                    <div className="rounded-3xl border border-charcoal/10 bg-porcelain p-5 shadow-sm space-y-4">
                                                                                        <div>
                                                                                            <p className="text-base font-bold text-charcoal">
                                                                                                {t("steps.genre.genre.subgenres.blues.label")}
                                                                                            </p>
                                                                                            <p className="text-sm text-charcoal/60">
                                                                                                {t("steps.genre.genre.subgenres.blues.subtitle")}
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="grid gap-3">
                                                                                            {bluesSubgenres.map((option) => {
                                                                                                const isSelected = draftGenre === option;
                                                                                                const audioUrl = isSelected ? getGenreAudioUrl?.(option) : undefined;
                                                                                                return (
                                                                                                    <div key={option} className="flex items-center gap-3">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => setDraftGenre(option)}
                                                                                                            className={cn(
                                                                                                                "flex-1 rounded-2xl border-2 bg-white p-4 text-left transition-all duration-200",
                                                                                                                isSelected
                                                                                                                    ? "border-[#0F766E] shadow-md"
                                                                                                                    : "border-charcoal/15 hover:border-[#0F766E]/50 hover:shadow-md"
                                                                                                            )}
                                                                                                        >
                                                                                                            <p className="text-base font-semibold text-charcoal">
                                                                                                                {t(`steps.genre.genre.options.${option}`)}
                                                                                                            </p>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderWithBold(t(`steps.genre.genre.subgenres.options.${option}`))}
                                                                                                            </p>
                                                                                                        </button>
                                                                                                        {audioUrl && <GenrePlayButton audioUrl={audioUrl} />}
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            <div className="border-t border-charcoal/10 bg-porcelain px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:pt-5">
                                                                                <div className="grid grid-cols-2 gap-3">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={onClose}
                                                                                        className="w-full py-4 rounded-2xl bg-white border-2 border-charcoal/20 text-charcoal text-base font-semibold hover:border-charcoal/40 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-charcoal/10"
                                                                                    >
                                                                                        {t("steps.checkout.modal.cancel")}
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={!isDraftComplete}
                                                                                        onClick={() => {
                                                                                            if (!isDraftComplete) return;
                                                                                            onSave(draftGenre);
                                                                                            onClose();
                                                                                        }}
                                                                                        className={cn(
                                                                                            "w-full py-4 rounded-2xl text-base font-semibold transition-colors focus:outline-none focus-visible:ring-4",
                                                                                            isDraftComplete
                                                                                                ? "bg-[#0F766E] text-white hover:bg-[#0B5F58] focus-visible:ring-[#0F766E]/20"
                                                                                                : "bg-charcoal/10 text-charcoal/40 cursor-not-allowed focus-visible:ring-charcoal/10"
                                                                                        )}
                                                                                    >
                                                                                        {t("steps.checkout.modal.save")}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    </>
                                                                )}
                                                            </AnimatePresence>
                                                            );
}

                                                            type PlanEditModalProps = {
                                                                isOpen: boolean;
    onClose: () => void;
                                                            t: ReturnType<typeof useTranslations>;
                                                                locale: string;
                                                                currentPlan: BRLPlanType;
    onSave: (plan: BRLPlanType) => void;
};

                                                                function PlanEditModal({isOpen, onClose, t, locale, currentPlan, onSave}: PlanEditModalProps) {
    const [draftPlan, setDraftPlan] = useState<BRLPlanType>(currentPlan);

    useEffect(() => {
        if (!isOpen) return;
                                                                    setDraftPlan(currentPlan);
    }, [isOpen, currentPlan]);

                                                                    const isBRL = locale === "pt";
                                                                    const isEUR = locale === "fr" || locale === "it";
                                                                    const availablePlans = PLAN_DATA;

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
                                                                    if (isBRL) return `R$${amount.toFixed(2).replace(".", ",")}`;
                                                                    if (isEUR) return `€${amount.toFixed(2)}`;
                                                                    return `$${amount.toFixed(2)} USD`;
    };

    const getPrice = (plan: typeof PLAN_DATA[0]) =>
                                                                    isBRL ? plan.priceBRL : isEUR ? getEurPlanPriceCents(locale, plan.id) : plan.priceUSD;
    const getDelivery = (plan: typeof PLAN_DATA[0]) =>
                                                                    plan.delivery[locale as keyof typeof plan.delivery] || plan.delivery.en;

    const planLabel = (() => {
        const prefix =
                                                                    locale === "fr"
                                                                    ? "Forfait"
                                                                    : locale === "es"
                                                                    ? "Plan"
                                                                    : locale === "it"
                                                                    ? "Piano"
                                                                    : "Plano";
                                                                    const name =
                                                                    draftPlan === "essencial"
                                                                    ? (locale === "es"
                                                                    ? "Esencial"
                                                                    : locale === "fr"
                                                                    ? "Essentiel"
                                                                    : locale === "it"
                                                                    ? "Essenziale"
                                                                    : "Essencial")
                                                                    : draftPlan === "acelerado"
                                                                    ? "Turbo"
                                                                    : "Express";
                                                                    return `${prefix} ${name}`;
    })();

                                                                    const planNames: Record<BRLPlanType, string> = locale === "es"
                                                                    ? {essencial: "Esencial", express: "Express", acelerado: "Turbo" }
                                                                    : locale === "fr"
                                                                    ? {essencial: "Essentiel", express: "Express", acelerado: "Turbo" }
                                                                    : locale === "it"
                                                                    ? {essencial: "Essenziale", express: "Express", acelerado: "Turbo" }
                                                                    : locale === "en"
                                                                    ? {essencial: "Essential", express: "Express", acelerado: "Turbo" }
                                                                    : {essencial: "Essencial", express: "Express", acelerado: "Turbo" };

                                                                    const planDescriptions: Record<BRLPlanType, string> = locale === "es"
                                                                    ? {
                                                                        essencial: "Ideal para quienes pueden esperar un poco",
                                                                    express: "Prioridad máxima + Revisiones Ilimitadas + Soporte vía WhatsApp",
                                                                    acelerado: "Todo lo del Express + PDF + Karaoke + Experiencia de Regalo",
        }
                                                                    : locale === "fr"
                                                                    ? {
                                                                        essencial: "Idéal pour ceux qui peuvent attendre un peu",
                                                                    express: "Priorité maximale + Révisions Illimitées + Support via WhatsApp",
                                                                    acelerado: "Tout l'Express + PDF + Karaoké + Expérience Cadeau",
            }
                                                                    : locale === "it"
                                                                    ? {
                                                                        essencial: "Ideale per chi può aspettare un po'",
                                                                    express: "Massima priorità + Revisioni Illimitate + Supporto via WhatsApp",
                                                                    acelerado: "Tutto dell'Express + PDF + Karaoke + Esperienza regalo",
                }
                                                                    : locale === "en"
                                                                    ? {
                                                                        essencial: "Ideal for those who can wait a little",
                                                                    express: "Top priority + Unlimited Revisions + WhatsApp support",
                                                                    acelerado: "Everything in Express + Lyrics PDF + Karaoke + Gift Experience",
                    }
                                                                    : {
                                                                        essencial: "Ideal para quem pode esperar um pouco mais",
                                                                    express: "Prioridade máxima + Revisões Ilimitadas + Suporte via WhatsApp",
                                                                    acelerado: "Tudo do Express + Experiência de Presente + Letra em PDF + Playback Karaokê",
                    };

                                                                    if (!isOpen) return null;

                                                                    return (
                                                                    <AnimatePresence>
                                                                        {isOpen && (
                                                                            <>
                                                                                <motion.div
                                                                                    initial={{ opacity: 0 }}
                                                                                    animate={{ opacity: 1 }}
                                                                                    exit={{ opacity: 0 }}
                                                                                    className="fixed inset-0 bg-black/50 z-50"
                                                                                />
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, scale: 0.98, y: 20 }}
                                                                                    className="fixed inset-0 w-full h-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
                                                                                >
                                                                                    <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 bg-porcelain p-5 sm:p-6">
                                                                                        <div className="min-w-0">
                                                                                            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-charcoal leading-tight">
                                                                                                {t("steps.checkout.changePlan")}
                                                                                            </h2>
                                                                                            <p className="text-base sm:text-lg text-charcoal/70 mt-2 leading-relaxed">
                                                                                                {t("steps.checkout.changePlanModalSubtitle")}
                                                                                            </p>
                                                                                            <p className="mt-3 inline-flex max-w-full items-center rounded-full border border-charcoal/10 bg-white px-4 py-2 text-base font-semibold text-charcoal shadow-sm">
                                                                                                {planLabel}
                                                                                            </p>
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={onClose}
                                                                                            className="shrink-0 w-12 h-12 rounded-full bg-white border border-charcoal/10 text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5 transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4A8E9A]/15"
                                                                                            aria-label={t("pendingOrder.close")}
                                                                                        >
                                                                                            <X className="w-6 h-6" />
                                                                                        </button>
                                                                                    </div>

                                                                                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                                                                                        {availablePlans.map((plan) => {
                                                                                            const isSelected = draftPlan === plan.id;
                                                                                            const Icon = plan.icon;
                                                                                            return (
                                                                                                <button
                                                                                                    key={plan.id}
                                                                                                    type="button"
                                                                                                    onClick={() => setDraftPlan(plan.id)}
                                                                                                    className={cn(
                                                                                                        "relative w-full p-5 rounded-2xl border-2 text-left transition-all",
                                                                                                        isSelected
                                                                                                            ? "border-[#2D4739] bg-[#2D4739]/5 shadow-lg"
                                                                                                            : "border-charcoal/10 bg-white hover:border-charcoal/30",
                                                                                                        plan.popular && !isSelected && "ring-2 ring-amber-400/40",
                                                                                                        plan.vip && !isSelected && "ring-2 ring-purple-400/40"
                                                                                                    )}
                                                                                                >
                                                                                                    {plan.popular && (
                                                                                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                                                                                            <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                                                                                                                {t("steps.plans.popular")}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {plan.vip && (
                                                                                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                                                                                            <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                                                                                                                {plan.badge ?? "⭐ VIP"}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    )}

                                                                                                    <div className="flex items-center gap-4">
                                                                                                        <div
                                                                                                            className={cn(
                                                                                                                "p-3 rounded-xl flex-shrink-0",
                                                                                                                isSelected
                                                                                                                    ? "bg-[#2D4739] text-white"
                                                                                                                    : "bg-charcoal/5 text-charcoal/70"
                                                                                                            )}
                                                                                                        >
                                                                                                            <Icon className="w-6 h-6" />
                                                                                                        </div>

                                                                                                        <div className="flex-1 min-w-0">
                                                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                                                <h3 className="font-bold text-charcoal text-lg">
                                                                                                                    {planNames[plan.id]}
                                                                                                                </h3>
                                                                                                                <span className="text-sm text-charcoal/50">
                                                                                                                    • {locale === "es"
                                                                                                                        ? "Entrega en"
                                                                                                                        : locale === "fr"
                                                                                                                            ? "Livraison"
                                                                                                                            : locale === "it"
                                                                                                                                ? "Consegna"
                                                                                                                                : locale === "en"
                                                                                                                                    ? "Delivery"
                                                                                                                                    : "Entrega em"}{" "}
                                                                                                                    <strong className="font-bold text-charcoal">{getDelivery(plan)}</strong>
                                                                                                                </span>
                                                                                                            </div>
                                                                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                                                                {renderVipExtrasDescription(locale, plan.id, planDescriptions[plan.id])}
                                                                                                            </p>
                                                                                                        </div>

                                                                                                        <div className="text-right flex-shrink-0">
                                                                                                            <div className="text-xl font-bold text-charcoal tabular-nums">
                                                                                                                {formatPrice(getPrice(plan))}
                                                                                                            </div>
                                                                                                            <div
                                                                                                                className={cn(
                                                                                                                    "mt-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ml-auto",
                                                                                                                    isSelected
                                                                                                                        ? "bg-[#2D4739] border-[#2D4739]"
                                                                                                                        : "border-charcoal/30"
                                                                                                                )}
                                                                                                            >
                                                                                                                {isSelected && <Check className="w-4 h-4 text-white" />}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </button>
                                                                                            );
                                                                                        })}
                                                                                    </div>

                                                                                    <div className="border-t border-charcoal/10 bg-porcelain px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:pt-5">
                                                                                        <div className="grid grid-cols-2 gap-3">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={onClose}
                                                                                                className="w-full py-4 rounded-2xl bg-white border-2 border-charcoal/20 text-charcoal text-base font-semibold hover:border-charcoal/40 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-charcoal/10"
                                                                                            >
                                                                                                {t("steps.checkout.modal.cancel")}
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    onSave(draftPlan);
                                                                                                    onClose();
                                                                                                }}
                                                                                                className="w-full py-4 rounded-2xl bg-[#2D4739] text-white text-base font-semibold hover:bg-[#243A2F] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2D4739]/20"
                                                                                            >
                                                                                                {t("steps.checkout.modal.save")}
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </motion.div>
                                                                            </>
                                                                        )}
                                                                    </AnimatePresence>
                                                                    );
}
