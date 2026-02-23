"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Music, Check, Loader2, Guitar, Award, FileText, X, Search, ChevronDown } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "~/components/ui/sheet";
import { cn } from "~/lib/utils";
import { GENRE_NAMES, type SupportedLocale } from "~/lib/lyrics-generator";
import type { BRLPlanType, OrderBumpSelection } from "~/lib/validations/song-order";

const recipientOptions = [
    "husband",
    "wife",
    "boyfriend",
    "girlfriend",
    "children",
    "father",
    "mother",
    "sibling",
    "friend",
    "myself",
    "other",
] as const;

// Genre categories for PT locale (organized display)
const GENRE_CATEGORIES_PT: { key: string; label: string; genres: readonly string[] }[] = [
    { key: "popular", label: "Populares", genres: ["worship", "pop", "samba"] },
    { key: "sertanejo", label: "Sertanejo", genres: ["sertanejo-raiz", "sertanejo-universitario", "sertanejo-romantico"] },
    { key: "forro", label: "Forró", genres: ["forro-pe-de-serra-rapido", "forro-pe-de-serra-lento", "forro-universitario", "forro-eletronico"] },
    { key: "pagode", label: "Pagode", genres: ["pagode-de-mesa", "pagode-romantico", "pagode-universitario"] },
    { key: "funk", label: "Funk", genres: ["funk-carioca", "funk-paulista", "funk-melody"] },
    { key: "mpb", label: "MPB", genres: ["mpb-bossa-nova", "mpb-cancao-brasileira", "mpb-pop", "mpb-intimista"] },
    { key: "rock", label: "Rock", genres: ["rock-classico", "pop-rock-brasileiro", "heavy-metal"] },
    { key: "blues", label: "Blues", genres: ["blues-melancholic", "blues-upbeat"] },
    { key: "brega", label: "Brega", genres: ["brega-romantico", "tecnobrega"] },
    { key: "latina", label: "Latina", genres: ["salsa", "merengue", "bachata", "bolero"] },
    { key: "outros", label: "Outros", genres: ["rnb", "jazz", "hiphop", "axe", "capoeira", "reggae", "lullaby", "tango", "valsa", "musica-classica"] },
];

const genreOptionsEN = ["pop", "country", "rock", "rnb", "jazz", "blues-melancholic", "blues-upbeat", "worship", "hiphop"] as const;
const genreOptionsPT = [
    "worship",
    "pop",
    "sertanejo-raiz",
    "sertanejo-universitario",
    "sertanejo-romantico",
    "rock-classico",
    "pop-rock-brasileiro",
    "heavy-metal",
    "rnb",
    "jazz",
    "blues-melancholic",
    "blues-upbeat",
    "hiphop",
    "funk-carioca",
    "funk-paulista",
    "funk-melody",
    "brega-romantico",
    "tecnobrega",
    "samba",
    "pagode-de-mesa",
    "pagode-romantico",
    "pagode-universitario",
    "forro-pe-de-serra-rapido",
    "forro-pe-de-serra-lento",
    "forro-universitario",
    "forro-eletronico",
    "axe",
    "capoeira",
    "mpb-bossa-nova",
    "mpb-cancao-brasileira",
    "mpb-pop",
    "mpb-intimista",
    "reggae",
    "lullaby",
    "bolero",
    "salsa",
    "merengue",
    "bachata",
    "tango",
    "valsa",
    "musica-classica",
] as const;
const genreOptionsES = ["balada", "adoracion", "bachata", "salsa", "ranchera", "cumbia", "tango", "pop", "rnb", "blues-melancholic", "blues-upbeat", "hiphop", "rock"] as const;
const genreOptionsFR = ["chanson", "balada", "variete", "worship", "pop", "jazz", "blues-melancholic", "blues-upbeat", "rnb", "hiphop", "rock"] as const;

type GenreOption =
    | (typeof genreOptionsEN)[number]
    | (typeof genreOptionsPT)[number]
    | (typeof genreOptionsES)[number]
    | (typeof genreOptionsFR)[number];

interface OrderBumpModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selection: OrderBumpSelection) => void;
    mode?: "edit" | "submit";
    initialSelection?: OrderBumpSelection | null;
    locale: string;
    currency: string;
    recipientName: string;
    currentGenre: string;
    basePrice: number;
    selectedPlan?: BRLPlanType;
    isSubmitting: boolean;
    t: (key: string, params?: Record<string, string>) => string;
}

export function OrderBumpModal({
    isOpen,
    onClose,
    onConfirm,
    mode = "submit",
    initialSelection = null,
    locale,
    currency,
    recipientName,
    currentGenre,
    basePrice,
    selectedPlan,
    isSubmitting,
    t,
}: OrderBumpModalProps) {
    const [fastDelivery, setFastDelivery] = useState(false);
    const [wantsGenreVariants, setWantsGenreVariants] = useState(false);
    const [genreVariants, setGenreVariants] = useState<GenreOption[]>([]);
    const [genreVariantSelect, setGenreVariantSelect] = useState("");
    const [certificate, setCertificate] = useState(false);
    const [lyrics, setLyrics] = useState(false);
    const [extraSong, setExtraSong] = useState(false);
    const [extraSongRecipientName, setExtraSongRecipientName] = useState("");
    const [extraSongRecipient, setExtraSongRecipient] = useState("");
    const [extraSongQualities, setExtraSongQualities] = useState("");
    const [extraSongGenre, setExtraSongGenre] = useState<GenreOption | "">("");
    const [extraSongVocals, setExtraSongVocals] = useState<"female" | "male" | "either">("either");
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [genreSheetOpen, setGenreSheetOpen] = useState(false);
    const [genreSearch, setGenreSearch] = useState("");
    const [extraSongGenreSheetOpen, setExtraSongGenreSheetOpen] = useState(false);
    const [extraSongGenreSearch, setExtraSongGenreSearch] = useState("");
    const isPremiumSixHourPlan = selectedPlan === "acelerado";

    // LocalStorage key for persisting extra song form data
    const EXTRA_SONG_STORAGE_KEY = "apollo-extra-song-draft";

    // Initialize form with any prior selection (used for "Edit extras" flows).
    useEffect(() => {
        if (!isOpen) return;

        const selection = initialSelection;
        setFastDelivery(selection?.fastDelivery ?? false);
        setCertificate(isPremiumSixHourPlan ? true : (selection?.certificate ?? false));
        setLyrics(isPremiumSixHourPlan ? true : (selection?.lyrics ?? false));
        setExtraSong(selection?.extraSong ?? false);

        const initialGenreVariants = (selection?.genreVariants ?? []) as GenreOption[];
        setGenreVariants(initialGenreVariants);
        setWantsGenreVariants(initialGenreVariants.length > 0);
        setGenreVariantSelect("");

        // Pre-fill extra song details when available.
        const extra = selection?.extraSongData;
        if (extra && extra.sameRecipient === false) {
            if (extra.recipientName) setExtraSongRecipientName(extra.recipientName);
            if (extra.recipient) setExtraSongRecipient(extra.recipient);
            if (extra.qualities) setExtraSongQualities(extra.qualities);
            if (extra.genre) setExtraSongGenre(extra.genre as GenreOption);
            if (extra.vocals) setExtraSongVocals(extra.vocals);
        }

        setFormErrors({});
        setGenreSheetOpen(false);
        setGenreSearch("");
        setExtraSongGenreSheetOpen(false);
        setExtraSongGenreSearch("");
    }, [isOpen, initialSelection, isPremiumSixHourPlan]);

    // Load saved extra song data from localStorage on mount
    useEffect(() => {
        if (!isOpen) return;
        // If we already have an initial selection, prefer it over any older draft.
        if (initialSelection?.extraSongData && initialSelection.extraSongData.sameRecipient === false) return;
        try {
            const saved = localStorage.getItem(EXTRA_SONG_STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved) as {
                    recipientName?: string;
                    recipient?: string;
                    qualities?: string;
                    genre?: string;
                    vocals?: "female" | "male" | "either";
                };
                if (data.recipientName) setExtraSongRecipientName(data.recipientName);
                if (data.recipient) setExtraSongRecipient(data.recipient);
                if (data.qualities) setExtraSongQualities(data.qualities);
                if (data.genre) setExtraSongGenre(data.genre as GenreOption);
                if (data.vocals) setExtraSongVocals(data.vocals);
            }
        } catch {
            // Ignore parse errors
        }
    }, [isOpen]);

    // Save extra song data to localStorage when it changes
    useEffect(() => {
        if (!extraSong) return;
        const data = {
            recipientName: extraSongRecipientName,
            recipient: extraSongRecipient,
            qualities: extraSongQualities,
            genre: extraSongGenre,
            vocals: extraSongVocals,
        };
        try {
            localStorage.setItem(EXTRA_SONG_STORAGE_KEY, JSON.stringify(data));
        } catch {
            // Ignore storage errors
        }
    }, [extraSong, extraSongRecipientName, extraSongRecipient, extraSongQualities, extraSongGenre, extraSongVocals]);

    // Clear localStorage when form is submitted
    const clearExtraSongStorage = () => {
        try {
            localStorage.removeItem(EXTRA_SONG_STORAGE_KEY);
        } catch {
            // Ignore errors
        }
    };

    const isPt = locale === "pt";
    const genreOptions =
        isPt ? genreOptionsPT :
            locale === "es" ? genreOptionsES :
                locale === "fr" ? genreOptionsFR :
                    genreOptionsEN;

    // Plan-based locales (PT, ES, FR, IT) don't need fast delivery option - it's in the plan selection
    const usesPlanPricing = locale === "pt" || locale === "es" || locale === "fr" || locale === "it";
    const showFastDelivery = !usesPlanPricing;

    // Prices in cents
    const fastDeliveryPrice = 4900; // $49 (USD only - not shown for plan-based locales)
    const isEURLocale = locale === "fr" || locale === "it";
    const genreVariantPrice = locale === "es" ? 999 : isEURLocale ? 2900 : 3990; // ES: $9.99, FR/IT: €29, others: R$39,90 / $39.90
    const certificatePrice = locale === "es" ? 999 : isEURLocale ? 1900 : 1990; // ES: $9.99, FR/IT: €19, others: R$19,90 / $19.90
    const lyricsPrice = locale === "es" ? 999 : isEURLocale ? 900 : locale === "pt" ? 1490 : 990; // ES: $9.99, FR/IT: €9, PT: R$14,90, others: $9.90
    const extraSongPrice = locale === "es" ? 999 : isEURLocale ? 2900 : currency === "BRL" ? 4990 : 4950; // ES: $9.99, FR/IT: €29, BRL: R$49,90, others: $49.50
    const includedInPlanText = locale === "pt"
        ? "Incluído no plano"
        : locale === "es"
            ? "Incluido en el plan"
            : locale === "fr"
                ? "Inclus dans le forfait"
                : locale === "it"
                    ? "Incluso nel piano"
                    : "Included in plan";

    // Calculate total
    const calculateTotal = () => {
        let total = basePrice;
        // Fast delivery only for USD
        if (showFastDelivery && fastDelivery) total += fastDeliveryPrice;
        // Genre variants
        total += genreVariants.length * genreVariantPrice;
        // Certificate and lyrics
        if (certificate && !isPremiumSixHourPlan) total += certificatePrice;
        if (lyrics && !isPremiumSixHourPlan) total += lyricsPrice;
        if (extraSong) total += extraSongPrice;
        return total;
    };

    // Toggle genre variant selection
    const toggleGenreVariant = (genre: GenreOption) => {
        setGenreVariants(prev =>
            prev.includes(genre)
                ? prev.filter(g => g !== genre)
                : [...prev, genre]
        );
    };

    // Format price for display
    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (currency === "BRL") {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        if (currency === "EUR") {
            return `€${amount.toFixed(2)}`;
        }
        return `$${amount.toFixed(2)}`;
    };

    const primaryLabel =
        mode === "edit" ? t("orderBump.saveExtras") : t("navigation.submit");

    // Validate form before submit
    const validateForm = () => {
        const errors: Record<string, string> = {};

        // Extra song is always for a different person, so all fields are required
        if (extraSong) {
            if (!extraSongRecipientName.trim()) {
                errors.recipientName = "Required";
            }
            if (!extraSongRecipient) {
                errors.recipient = "Required";
            }
            if (!extraSongQualities.trim() || extraSongQualities.length < 10) {
                errors.qualities = "Min 10 characters";
            }
            if (!extraSongGenre) {
                errors.genre = "Required";
            }
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleConfirm = () => {
        if (!validateForm()) return;

        const selection: OrderBumpSelection = {
            // Fast delivery only for USD
            fastDelivery: showFastDelivery ? fastDelivery : false,
            extraSong,
            // Extra song is always for a different person
            extraSongData: extraSong
                ? {
                    sameRecipient: false,
                    recipientName: extraSongRecipientName,
                    recipient: extraSongRecipient as typeof recipientOptions[number],
                    qualities: extraSongQualities,
                    genre: extraSongGenre as GenreOption,
                    vocals: extraSongVocals,
                }
                : null,
            genreVariants: wantsGenreVariants ? genreVariants : [],
            certificate: isPremiumSixHourPlan ? true : certificate,
            lyrics: isPremiumSixHourPlan ? true : lyrics,
        };

        // Clear saved draft after successful submission
        clearExtraSongStorage();
        onConfirm(selection);
    };

    const handleContinueWithout = () => {
        onConfirm({
            fastDelivery: false,
            extraSong: false,
            extraSongData: null,
            genreVariants: [],
            certificate: isPremiumSixHourPlan,
            lyrics: isPremiumSixHourPlan,
        });
    };

    // Get translated recipient options
    const getRecipientLabel = (key: string) => {
        try {
            return t(`steps.basics.recipient.options.${key}`);
        } catch {
            return key;
        }
    };

    // Get translated genre options
    const getGenreLabel = (key: string) => {
        if (!key) return "";
        const translationKey = `steps.genre.genre.options.${key}`;
        const label = t(translationKey);
        if (label && label !== translationKey && !label.startsWith("steps.genre.genre.options.")) {
            return label;
        }
        const normalizedKey = key === "gospel" ? "worship" : key;
        const localeKey = locale as SupportedLocale;
        return GENRE_NAMES[normalizedKey]?.[localeKey] || GENRE_NAMES[key]?.[localeKey] || key;
    };

    const sortLocale = locale === "pt" ? "pt-BR" : locale;
    const emptyVariantLabel = locale === "pt" ? "Sem opcoes" : "No options";
    const removeVariantLabel = locale === "pt" ? "Remover" : "Remove";
    const genreOptionsSorted = genreOptions
        .map(option => ({
            value: option,
            label: getGenreLabel(option),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, sortLocale, { sensitivity: "base" }));
    const variantOptions = genreOptionsSorted.filter(option => option.value !== currentGenre);
    const variantSelectOptions = variantOptions.filter(option => !genreVariants.includes(option.value));
    const selectedVariantOptions = [...genreVariants].sort((a, b) =>
        getGenreLabel(a).localeCompare(getGenreLabel(b), sortLocale, { sensitivity: "base" })
    );
    const currentGenreLabel = getGenreLabel(currentGenre);

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent
                className="w-full max-w-[calc(100vw-2rem)] sm:max-w-lg overflow-y-auto overflow-x-hidden bg-porcelain pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
                aria-describedby={undefined}
            >
                <DialogHeader className="text-center">
                    <DialogTitle className="text-2xl font-serif text-charcoal">
                        {t("orderBump.title")}
                    </DialogTitle>
                    <DialogDescription className="text-charcoal/60">
                        {t("orderBump.subtitle")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Fast Delivery Option - Only for USD */}
                    {showFastDelivery && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <button
                                type="button"
                                onClick={() => setFastDelivery(!fastDelivery)}
                                className={cn(
                                    "w-full p-4 rounded-xl border-2 transition-all text-left",
                                    fastDelivery
                                        ? "border-[#4A8E9A] bg-[#4A8E9A]/5"
                                        : "border-charcoal/10 hover:border-charcoal/20 bg-white"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                            fastDelivery
                                                ? "border-[#4A8E9A] bg-[#4A8E9A]"
                                                : "border-charcoal/30"
                                        )}
                                    >
                                        {fastDelivery && <Check className="w-4 h-4 text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Zap className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                            <span className="font-semibold text-charcoal">
                                                {t("orderBump.fastDelivery.title")}
                                            </span>
                                        </div>
                                        <p className="text-sm text-charcoal/60 mt-1">
                                            {t("orderBump.fastDelivery.description")}
                                        </p>
                                    </div>
                                    <span className="font-bold text-dark">
                                        {t("orderBump.fastDelivery.price")}
                                    </span>
                                </div>
                            </button>
                        </motion.div>
                    )}

                    {/* Extra Song Option - R$49,90 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                    >
                        <button
                            type="button"
                            onClick={() => setExtraSong(!extraSong)}
                            className={cn(
                                "w-full p-4 rounded-xl border-2 transition-all text-left",
                                extraSong
                                    ? "border-[#4A8E9A] bg-[#4A8E9A]/5"
                                    : "border-charcoal/10 hover:border-charcoal/20 bg-white"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                        extraSong
                                            ? "border-[#4A8E9A] bg-[#4A8E9A]"
                                            : "border-charcoal/30"
                                    )}
                                >
                                    {extraSong && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Music className="w-5 h-5 text-green-600 flex-shrink-0" />
                                        <span className="font-semibold text-charcoal">
                                            {t("orderBump.extraSong.title")}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded-full">
                                            {t("orderBump.extraSong.badge")}
                                        </span>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("orderBump.extraSong.description")}
                                    </p>
                                </div>
                                <span className="font-bold text-dark">
                                    {t("orderBump.extraSong.price")}
                                </span>
                            </div>
                        </button>

                        {/* Extra Song Details Form */}
                        <AnimatePresence>
                            {extraSong && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-4 p-4 bg-white rounded-xl border border-charcoal/10 space-y-4">
                                        <p className="text-sm font-medium text-charcoal">
                                            {t("orderBump.extraSong.forWho")}
                                        </p>

                                        {/* Form for the other person */}
                                        <div className="space-y-3">
                                                    {/* Recipient Name */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-charcoal mb-1">
                                                            {t("orderBump.extraSong.form.recipientName")}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={extraSongRecipientName}
                                                            onChange={(e) =>
                                                                setExtraSongRecipientName(e.target.value)
                                                            }
                                                            placeholder={t(
                                                                "orderBump.extraSong.form.recipientNamePlaceholder"
                                                            )}
                                                            className={cn(
                                                                "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/50",
                                                                formErrors.recipientName
                                                                    ? "border-red-500"
                                                                    : "border-charcoal/20"
                                                            )}
                                                        />
                                                        {formErrors.recipientName && (
                                                            <p className="text-xs text-red-500 mt-1">
                                                                {formErrors.recipientName}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Relationship */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-charcoal mb-1">
                                                            {t("orderBump.extraSong.form.relationship")}
                                                        </label>
                                                        <Select
                                                            value={extraSongRecipient}
                                                            onValueChange={setExtraSongRecipient}
                                                        >
                                                            <SelectTrigger
                                                                className={cn(
                                                                    "w-full",
                                                                    formErrors.recipient && "border-red-500"
                                                                )}
                                                            >
                                                                <SelectValue
                                                                    placeholder={t(
                                                                        "orderBump.extraSong.form.relationshipPlaceholder"
                                                                    )}
                                                                />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {recipientOptions.map((option) => (
                                                                    <SelectItem key={option} value={option}>
                                                                        {getRecipientLabel(option)}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {formErrors.recipient && (
                                                            <p className="text-xs text-red-500 mt-1">
                                                                {formErrors.recipient}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Qualities */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-charcoal mb-1">
                                                            {t("orderBump.extraSong.form.qualities")}
                                                        </label>
                                                        <textarea
                                                            value={extraSongQualities}
                                                            onChange={(e) =>
                                                                setExtraSongQualities(e.target.value)
                                                            }
                                                            placeholder={t(
                                                                "orderBump.extraSong.form.qualitiesPlaceholder"
                                                            )}
                                                            rows={3}
                                                            className={cn(
                                                                "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/50 resize-none",
                                                                formErrors.qualities
                                                                    ? "border-red-500"
                                                                    : "border-charcoal/20"
                                                            )}
                                                        />
                                                        {formErrors.qualities && (
                                                            <p className="text-xs text-red-500 mt-1">
                                                                {formErrors.qualities}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Genre */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-charcoal mb-1">
                                                            {t("orderBump.extraSong.form.genre")}
                                                        </label>

                                                        {/* PT locale: Sheet picker with categories */}
                                                        {isPt ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExtraSongGenreSheetOpen(true)}
                                                                    className={cn(
                                                                        "w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 bg-white hover:border-[#4A8E9A]/50 transition-all text-left",
                                                                        formErrors.genre ? "border-red-500" : "border-charcoal/15"
                                                                    )}
                                                                >
                                                                    <span className={cn(
                                                                        "text-sm",
                                                                        extraSongGenre ? "text-charcoal" : "text-charcoal/60"
                                                                    )}>
                                                                        {extraSongGenre ? getGenreLabel(extraSongGenre) : t("orderBump.extraSong.form.genre")}
                                                                    </span>
                                                                    <ChevronDown className="w-4 h-4 text-charcoal/40" />
                                                                </button>

                                                                {/* Genre selection Sheet */}
                                                                <Sheet open={extraSongGenreSheetOpen} onOpenChange={setExtraSongGenreSheetOpen}>
                                                                    <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0">
                                                                        <div className="flex flex-col h-full">
                                                                            {/* Header with search */}
                                                                            <div className="sticky top-0 bg-white border-b border-charcoal/10 p-4 space-y-3">
                                                                                <SheetHeader>
                                                                                    <SheetTitle className="text-xl font-serif text-charcoal">
                                                                                        Escolher Estilo Musical
                                                                                    </SheetTitle>
                                                                                </SheetHeader>
                                                                                <div className="relative">
                                                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal/40" />
                                                                                    <input
                                                                                        type="text"
                                                                                        value={extraSongGenreSearch}
                                                                                        onChange={(e) => setExtraSongGenreSearch(e.target.value)}
                                                                                        placeholder="Buscar estilo..."
                                                                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-charcoal/15 text-base focus:outline-none focus:border-[#4A8E9A] focus:ring-2 focus:ring-[#4A8E9A]/20"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {/* Scrollable genre list */}
                                                                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                                                                {GENRE_CATEGORIES_PT.map(category => {
                                                                                    const filteredGenres = category.genres.filter(g => {
                                                                                        if (!extraSongGenreSearch.trim()) return true;
                                                                                        const label = getGenreLabel(g);
                                                                                        return label.toLowerCase().includes(extraSongGenreSearch.toLowerCase());
                                                                                    });
                                                                                    if (filteredGenres.length === 0) return null;

                                                                                    return (
                                                                                        <div key={category.key}>
                                                                                            <p className="text-xs font-bold text-dark uppercase tracking-wider mb-2">
                                                                                                {category.label}
                                                                                            </p>
                                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                                {filteredGenres.map(genre => (
                                                                                                    <button
                                                                                                        key={genre}
                                                                                                        type="button"
                                                                                                        onClick={() => {
                                                                                                            setExtraSongGenre(genre as GenreOption);
                                                                                                            setExtraSongGenreSheetOpen(false);
                                                                                                            setExtraSongGenreSearch("");
                                                                                                        }}
                                                                                                        className={cn(
                                                                                                            "px-3 py-3 rounded-xl border text-sm font-medium transition-all text-left",
                                                                                                            extraSongGenre === genre
                                                                                                                ? "border-[#4A8E9A] bg-[#4A8E9A] text-dark"
                                                                                                                : "border-charcoal/15 text-charcoal bg-white hover:border-[#4A8E9A]/50 hover:bg-[#4A8E9A]/5"
                                                                                                        )}
                                                                                                    >
                                                                                                        {getGenreLabel(genre)}
                                                                                                    </button>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                                {/* No results */}
                                                                                {extraSongGenreSearch.trim() && GENRE_CATEGORIES_PT.every(cat =>
                                                                                    cat.genres.every(g =>
                                                                                        !getGenreLabel(g).toLowerCase().includes(extraSongGenreSearch.toLowerCase())
                                                                                    )
                                                                                ) && (
                                                                                    <p className="text-center text-charcoal/50 py-8">
                                                                                        Nenhum estilo encontrado
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </SheetContent>
                                                                </Sheet>
                                                            </>
                                                        ) : (
                                                            /* Other locales: Original Select */
                                                            <Select
                                                                value={extraSongGenre || undefined}
                                                                onValueChange={(value) => setExtraSongGenre(value as GenreOption)}
                                                            >
                                                                <SelectTrigger
                                                                    className={cn(
                                                                        "w-full",
                                                                        formErrors.genre && "border-red-500"
                                                                    )}
                                                                >
                                                                    <SelectValue placeholder={t("orderBump.extraSong.form.genre")} />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {genreOptionsSorted.map(({ value, label }) => (
                                                                        <SelectItem key={value} value={value}>
                                                                            {label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        )}

                                                        {formErrors.genre && (
                                                            <p className="text-xs text-red-500 mt-1">
                                                                {formErrors.genre}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Vocals */}
                                                    <div>
                                                        <label className="block text-sm font-medium text-charcoal mb-1">
                                                            {t("orderBump.extraSong.form.vocals")}
                                                        </label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExtraSongVocals("female")}
                                                                className={cn(
                                                                    "p-2.5 rounded-lg border-2 text-center transition-all text-sm",
                                                                    extraSongVocals === "female"
                                                                        ? "border-[#4A8E9A] bg-[#4A8E9A]/5 font-medium"
                                                                        : "border-charcoal/10 hover:border-charcoal/20"
                                                                )}
                                                            >
                                                                {t("orderBump.extraSong.form.vocalsFemale")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setExtraSongVocals("male")}
                                                                className={cn(
                                                                    "p-2.5 rounded-lg border-2 text-center transition-all text-sm",
                                                                    extraSongVocals === "male"
                                                                        ? "border-[#4A8E9A] bg-[#4A8E9A]/5 font-medium"
                                                                        : "border-charcoal/10 hover:border-charcoal/20"
                                                                )}
                                                            >
                                                                {t("orderBump.extraSong.form.vocalsMale")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setExtraSongVocals("either")}
                                                                className={cn(
                                                                    "p-2.5 rounded-lg border-2 text-center transition-all text-sm",
                                                                    extraSongVocals === "either"
                                                                        ? "border-[#4A8E9A] bg-[#4A8E9A]/5 font-medium"
                                                                        : "border-charcoal/10 hover:border-charcoal/20"
                                                                )}
                                                            >
                                                                {t("orderBump.extraSong.form.vocalsEither")}
                                                            </button>
                                                        </div>
                                                    </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Genre Variant Option - R$39,90 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (wantsGenreVariants) {
                                    setGenreVariants([]); // Clear selection when untoggling
                                    setGenreVariantSelect("");
                                }
                                setWantsGenreVariants(!wantsGenreVariants);
                            }}
                            className={cn(
                                "w-full p-4 rounded-xl border-2 transition-all text-left",
                                wantsGenreVariants
                                    ? "border-[#4A8E9A] bg-[#4A8E9A]/5"
                                    : "border-charcoal/10 hover:border-charcoal/20 bg-white"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                        wantsGenreVariants
                                            ? "border-[#4A8E9A] bg-[#4A8E9A]"
                                            : "border-charcoal/30"
                                    )}
                                >
                                    {wantsGenreVariants && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Guitar className="w-5 h-5 text-purple-600 flex-shrink-0" />
                                        <span className="font-semibold text-charcoal">
                                            {t("orderBump.genreVariant.title")}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full">
                                            {t("orderBump.genreVariant.badge")}
                                        </span>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("orderBump.genreVariant.description", { name: recipientName })}
                                    </p>
                                </div>
                                <span className="font-bold text-dark text-right text-sm sm:text-base flex-shrink-0">
                                    {t("orderBump.genreVariant.price")}
                                    <span className="text-xs font-normal text-charcoal/50 block">
                                        {t("orderBump.genreVariant.perGenre")}
                                    </span>
                                </span>
                            </div>
                        </button>

                        {/* Genre Selection */}
                        <AnimatePresence>
                            {wantsGenreVariants && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-3 pt-3 px-4 pb-4 border-l-2 border-charcoal/10 ml-7 space-y-3">
                                        {/* Current genre - highlighted */}
                                        <div>
                                            <p className="text-xs font-medium text-charcoal/60 mb-1.5">
                                                {t("orderBump.genreVariant.youWillReceive")}
                                            </p>
                                            <div className="mb-3">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-semibold border-green-500 text-green-700 bg-green-50">
                                                    <Check className="w-3.5 h-3.5" />
                                                    {currentGenreLabel}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Additional genres */}
                                        <div className="space-y-3">
                                            <p className="text-xs font-medium text-charcoal/60">
                                                {t("orderBump.genreVariant.addMore")}
                                            </p>

                                            {/* Warning when no genres selected */}
                                            {genreVariants.length === 0 && (
                                                <p className="text-xs font-medium text-red-600">
                                                    {t("orderBump.genreVariant.selectWarning")}
                                                </p>
                                            )}

                                            {/* PT locale: Sheet picker with categories */}
                                            {isPt ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => setGenreSheetOpen(true)}
                                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-charcoal/15 bg-white hover:border-[#4A8E9A]/50 transition-all text-left"
                                                    >
                                                        <span className="text-sm text-charcoal/60">
                                                            {t("orderBump.genreVariant.addMore")}
                                                        </span>
                                                        <ChevronDown className="w-4 h-4 text-charcoal/40" />
                                                    </button>

                                                    {/* Genre selection Sheet */}
                                                    <Sheet open={genreSheetOpen} onOpenChange={setGenreSheetOpen}>
                                                        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0">
                                                            <div className="flex flex-col h-full">
                                                                {/* Header with search */}
                                                                <div className="sticky top-0 bg-white border-b border-charcoal/10 p-4 space-y-3">
                                                                    <SheetHeader>
                                                                        <SheetTitle className="text-xl font-serif text-charcoal">
                                                                            Escolher Estilo Musical
                                                                        </SheetTitle>
                                                                    </SheetHeader>
                                                                    <div className="relative">
                                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal/40" />
                                                                        <input
                                                                            type="text"
                                                                            value={genreSearch}
                                                                            onChange={(e) => setGenreSearch(e.target.value)}
                                                                            placeholder="Buscar estilo..."
                                                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-charcoal/15 text-base focus:outline-none focus:border-[#4A8E9A] focus:ring-2 focus:ring-[#4A8E9A]/20"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Scrollable genre list */}
                                                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                                                    {GENRE_CATEGORIES_PT.map(category => {
                                                                        const filteredGenres = category.genres.filter(g => {
                                                                            // Exclude current genre and already selected
                                                                            if (g === currentGenre || genreVariants.includes(g as GenreOption)) return false;
                                                                            // Search filter
                                                                            if (!genreSearch.trim()) return true;
                                                                            const label = getGenreLabel(g);
                                                                            return label.toLowerCase().includes(genreSearch.toLowerCase());
                                                                        });
                                                                        if (filteredGenres.length === 0) return null;

                                                                        return (
                                                                            <div key={category.key}>
                                                                                <p className="text-xs font-bold text-dark uppercase tracking-wider mb-2">
                                                                                    {category.label}
                                                                                </p>
                                                                                <div className="grid grid-cols-2 gap-2">
                                                                                    {filteredGenres.map(genre => (
                                                                                        <button
                                                                                            key={genre}
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                setGenreVariants(prev => [...prev, genre as GenreOption]);
                                                                                                setGenreSheetOpen(false);
                                                                                                setGenreSearch("");
                                                                                            }}
                                                                                            className="px-3 py-3 rounded-xl border border-charcoal/15 text-sm font-medium text-charcoal bg-white hover:border-[#4A8E9A]/50 hover:bg-[#4A8E9A]/5 transition-all text-left"
                                                                                        >
                                                                                            {getGenreLabel(genre)}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    {/* No results */}
                                                                    {genreSearch.trim() && GENRE_CATEGORIES_PT.every(cat =>
                                                                        cat.genres.every(g =>
                                                                            g === currentGenre ||
                                                                            genreVariants.includes(g as GenreOption) ||
                                                                            !getGenreLabel(g).toLowerCase().includes(genreSearch.toLowerCase())
                                                                        )
                                                                    ) && (
                                                                        <p className="text-center text-charcoal/50 py-8">
                                                                            Nenhum estilo encontrado
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </SheetContent>
                                                    </Sheet>
                                                </>
                                            ) : (
                                                /* Other locales: Original Select */
                                                <Select
                                                    value={genreVariantSelect || undefined}
                                                    onValueChange={(value) => {
                                                        setGenreVariantSelect(value);
                                                        if (!value) return;
                                                        setGenreVariants(prev => (
                                                            prev.includes(value as GenreOption) ? prev : [...prev, value as GenreOption]
                                                        ));
                                                        setGenreVariantSelect("");
                                                    }}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder={t("orderBump.genreVariant.addMore")} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {variantSelectOptions.length > 0 ? (
                                                            variantSelectOptions.map(({ value, label }) => (
                                                                <SelectItem key={value} value={value}>
                                                                    {label}
                                                                </SelectItem>
                                                            ))
                                                        ) : (
                                                            <SelectItem value="__empty" disabled>
                                                                {emptyVariantLabel}
                                                            </SelectItem>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            )}

                                            {/* Selected genres chips */}
                                            {selectedVariantOptions.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedVariantOptions.map((genre) => (
                                                        <span
                                                            key={genre}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold border-blue-400 text-blue-700 bg-blue-50"
                                                        >
                                                            {getGenreLabel(genre)}
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleGenreVariant(genre)}
                                                                className="text-blue-400 hover:text-blue-700"
                                                                aria-label={removeVariantLabel}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Certificate Option - R$19,90 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (isPremiumSixHourPlan) return;
                                setCertificate(!certificate);
                            }}
                            className={cn(
                                "w-full p-4 rounded-xl border-2 transition-all text-left",
                                (certificate || isPremiumSixHourPlan)
                                    ? "border-[#4A8E9A] bg-[#4A8E9A]/5"
                                    : "border-charcoal/10 hover:border-charcoal/20 bg-white",
                                isPremiumSixHourPlan && "cursor-default"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                        (certificate || isPremiumSixHourPlan)
                                            ? "border-[#4A8E9A] bg-[#4A8E9A]"
                                            : "border-charcoal/30"
                                    )}
                                >
                                    {(certificate || isPremiumSixHourPlan) && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Award className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                        <span className="font-semibold text-charcoal">
                                            {t("orderBump.certificate.title")}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                                            {t("orderBump.certificate.badge")}
                                        </span>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("orderBump.certificate.description")}
                                    </p>
                                </div>
                                <span className="font-bold text-dark">
                                    {isPremiumSixHourPlan ? includedInPlanText : t("orderBump.certificate.price")}
                                </span>
                            </div>
                        </button>
                    </motion.div>

                    {/* Lyrics PDF Option - R$9,90 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (isPremiumSixHourPlan) return;
                                setLyrics(!lyrics);
                            }}
                            className={cn(
                                "w-full p-4 rounded-xl border-2 transition-all text-left",
                                (lyrics || isPremiumSixHourPlan)
                                    ? "border-[#4A8E9A] bg-[#4A8E9A]/5"
                                    : "border-charcoal/10 hover:border-charcoal/20 bg-white",
                                isPremiumSixHourPlan && "cursor-default"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                        (lyrics || isPremiumSixHourPlan)
                                            ? "border-[#4A8E9A] bg-[#4A8E9A]"
                                            : "border-charcoal/30"
                                    )}
                                >
                                    {(lyrics || isPremiumSixHourPlan) && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                        <span className="font-semibold text-charcoal">
                                            {t("orderBump.lyrics.title")}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">
                                            {t("orderBump.lyrics.badge")}
                                        </span>
                                    </div>
                                    <p className="text-sm text-charcoal/60 mt-1">
                                        {t("orderBump.lyrics.description")}
                                    </p>
                                </div>
                                <span className="font-bold text-dark">
                                    {isPremiumSixHourPlan ? includedInPlanText : t("orderBump.lyrics.price")}
                                </span>
                            </div>
                        </button>
                    </motion.div>

                    {/* Order Total */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35 }}
                        className="pt-4 border-t border-charcoal/10"
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-charcoal">
                                {t("orderBump.total")}
                            </span>
                            <span className="text-2xl font-bold text-dark">
                                {formatPrice(calculateTotal())}
                            </span>
                        </div>
                    </motion.div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                    <Button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        className="w-full h-auto py-6 text-base font-semibold bg-[#4A8E9A] hover:bg-[#F0EDE6] text-white rounded-xl"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                {locale === "pt" ? "Processando..." : "Processing..."}
                            </>
                        ) : (
                            `${primaryLabel} • ${formatPrice(calculateTotal())}`
                        )}
                    </Button>
	                    {(mode === "edit" ||
	                        (showFastDelivery && fastDelivery) ||
	                        genreVariants.length > 0 ||
	                        (certificate && !isPremiumSixHourPlan) ||
	                        (lyrics && !isPremiumSixHourPlan) ||
	                        extraSong) && (
	                        <Button
	                            variant="outline"
	                            onClick={handleContinueWithout}
	                            disabled={isSubmitting}
	                            className="w-full h-auto py-6 text-base font-semibold rounded-xl border-2 border-[#2D4739]/50 bg-[#2D4739]/10 text-[#2D4739] hover:bg-[#2D4739]/20 hover:text-[#2D4739] shadow-sm transition-all active:scale-[0.99]"
	                        >
	                            {mode === "edit"
	                                ? `${t("orderBump.clearExtras")} • ${formatPrice(basePrice)}`
	                                : `${t("orderBump.continueWithout")} • ${formatPrice(basePrice)}`}
	                        </Button>
	                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
