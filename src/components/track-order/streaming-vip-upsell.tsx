"use client";

import { useState, useCallback, useEffect, useMemo, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Sparkles, ChevronLeft, ChevronRight, X, ImageIcon, Check, Tag } from "lucide-react";

// Spotify Logo SVG Component
function SpotifyIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
    );
}
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { WhatsappAudioPlayer } from "~/components/ui/whatsapp-audio-player";

const COVER_IMAGES = [
    "/images/capas/capa-ex-1.webp",
    "/images/capas/capa-ex-2.webp",
    "/images/capas/capa-ex-3.webp",
    "/images/capas/capa-ex-4.webp",
];

interface StreamingVipUpsellProps {
    orderId: string;
    email: string;
    locale: string;
    currency: string;
    recipientName?: string;
    genreLabel?: string;
    genreName?: string;
    scrollRef?: RefObject<HTMLDivElement | null>;
    t: {
        badge?: string;
        title: string;
        description: string;
        bullets: string[];
        buyNow: string;
        adding: string;
        // Translations for quantity selector
        quantity1?: string;
        quantity2?: string;
        selectQuantity?: string;
        bothDiscount?: string;
        purchaseRemaining?: string;
        confirmPurchase?: string;
    };
}

export function StreamingVipUpsell({
    orderId,
    email,
    locale,
    currency,
    recipientName,
    genreLabel,
    genreName,
    scrollRef,
    t,
}: StreamingVipUpsellProps) {
    const router = useRouter();
    const [loadingAction, setLoadingAction] = useState<"single" | "bundle" | null>(null);
    const [selectedQuantity, setSelectedQuantity] = useState<"1" | "2">("1");
    const [selectedBundleParentId, setSelectedBundleParentId] = useState("");
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isCreatingSingle = loadingAction === "single";
    const isCreatingBundle = loadingAction === "bundle";
    const isCreatingAny = loadingAction !== null;

    // Query to get streaming slots status
    const { data: slotsStatus, isLoading: isLoadingSlots } = api.songOrder.getStreamingSlotsStatus.useQuery(
        { orderId },
        { staleTime: 30000 }
    );
    const { data: bundleCandidatesData } = api.songOrder.getStreamingBundleCandidates.useQuery(
        { orderId, email },
        {
            staleTime: 30000,
            enabled: hasValidEmail,
        }
    );

    // Handle keyboard navigation in lightbox
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (lightboxIndex === null) return;
        if (e.key === "Escape") {
            setLightboxIndex(null);
        } else if (e.key === "ArrowLeft") {
            setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : COVER_IMAGES.length - 1));
        } else if (e.key === "ArrowRight") {
            setLightboxIndex((prev) => (prev !== null && prev < COVER_IMAGES.length - 1 ? prev + 1 : 0));
        }
    }, [lightboxIndex]);

    useEffect(() => {
        if (lightboxIndex !== null) {
            document.addEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [lightboxIndex, handleKeyDown]);

    const createStreamingUpsell = api.songOrder.createStreamingUpsell.useMutation({
        onSuccess: (data) => {
            const orderIds = data.orderIds?.length ? data.orderIds : [data.orderId];
            if (orderIds.length > 1) {
                const orderIdsParam = encodeURIComponent(orderIds.join(","));
                router.push(`/${locale}/order/${data.orderId}?orderIds=${orderIdsParam}`);
                return;
            }
            router.push(`/${locale}/order/${data.orderId}`);
        },
        onError: (error) => {
            console.error("Failed to create streaming upsell:", error);
            setLoadingAction(null);
        },
    });
    const createStreamingBundle = api.songOrder.createStreamingUpsellBundle.useMutation({
        onSuccess: (data) => {
            const orderIds = data.orderIds?.length ? data.orderIds : [data.orderId];
            if (orderIds.length > 1) {
                const orderIdsParam = encodeURIComponent(orderIds.join(","));
                router.push(`/${locale}/order/${data.orderId}?orderIds=${orderIdsParam}`);
                return;
            }
            router.push(`/${locale}/order/${data.orderId}`);
        },
        onError: (error) => {
            console.error("Failed to create streaming bundle:", error);
            setLoadingAction(null);
        },
    });

    const bundleCandidates = bundleCandidatesData?.candidates ?? [];
    const hasCrossOrderBundle = bundleCandidates.length > 0;

    const bundleTitle = locale === "pt"
        ? "Promo 2 músicas (pedidos diferentes)"
        : locale === "es"
        ? "Promo 2 canciones (pedidos distintos)"
        : locale === "fr"
        ? "Promo 2 chansons (commandes différentes)"
        : locale === "it"
        ? "Promo 2 canzoni (ordini diversi)"
        : "2-song promo (different orders)";
    const bundleSubtitle = locale === "pt"
        ? "Escolha outra música da sua lista e pague o combo promocional."
        : locale === "es"
        ? "Elige otra canción de tu lista y paga el combo promocional."
        : locale === "fr"
        ? "Choisissez une autre chanson de votre liste et payez le combo promotionnel."
        : locale === "it"
        ? "Scegli un'altra canzone dalla tua lista e paga il combo promozionale."
        : "Choose another song from your list and pay the promotional combo.";
    const bundleSelectLabel = locale === "pt"
        ? "Selecione a outra música:"
        : locale === "es"
        ? "Selecciona la otra canción:"
        : locale === "fr"
        ? "Sélectionnez l'autre chanson :"
        : locale === "it"
        ? "Seleziona l'altra canzone:"
        : "Select the other song:";
    const bundleButtonLabel = locale === "pt"
        ? "Comprar combo de 2 músicas"
        : locale === "es"
        ? "Comprar combo de 2 canciones"
        : locale === "fr"
        ? "Acheter le combo 2 chansons"
        : locale === "it"
        ? "Acquista combo 2 canzoni"
        : "Buy 2-song combo";
    const sameGenreSuffix = locale === "pt"
        ? "(mesmo gênero)"
        : locale === "es"
        ? "(mismo género)"
        : locale === "fr"
        ? "(même genre)"
        : locale === "it"
        ? "(stesso genere)"
        : "(same genre)";
    const currentGenreLabel = locale === "pt"
        ? "Gênero desta música:"
        : locale === "es"
        ? "Género de esta canción:"
        : locale === "fr"
        ? "Genre de cette chanson :"
        : locale === "it"
        ? "Genere di questa canzone:"
        : "Genre of this song:";
    const noSameGenreLabel = locale === "pt"
        ? "Ainda não há outra música elegível com este mesmo gênero. Se surgir outra opção neste gênero, ela aparecerá aqui."
        : locale === "es"
        ? "Aún no hay otra canción elegible con este mismo género. Si aparece otra opción en este género, la mostraremos aquí."
        : locale === "fr"
        ? "Il n'y a pas encore d'autre chanson éligible avec ce même genre. Si une autre option apparaît dans ce genre, elle sera affichée ici."
        : locale === "it"
        ? "Non c'è ancora un'altra canzone idonea con questo stesso genere. Se appare un'altra opzione in questo genere, la mostreremo qui."
        : "There isn't another eligible song with the same genre yet. If another option appears in this genre, we'll show it here.";

    const fullStreamingPrice = currency === "BRL" ? 19700 : currency === "EUR" ? 9900 : 9900;
    const discountedStreamingPrice =
        currency === "BRL"
            ? 14700
            : currency === "EUR"
            ? 6700
            : 7500;
    const crossBundlePrice =
        (slotsStatus?.fullPrice ?? fullStreamingPrice) +
        (slotsStatus?.discountedPrice ?? discountedStreamingPrice);

    const formatReadableGenre = useCallback((genre: string) => {
        return genre
            .replace(/-/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }, []);

    const formatCandidateLabel = useCallback((candidate: { recipientName: string; genre: string; createdAt: Date }) => {
        const candidateDate = new Date(candidate.createdAt).toLocaleDateString(
            locale === "pt"
                ? "pt-BR"
                : locale === "es"
                ? "es-ES"
                : locale === "fr"
                ? "fr-FR"
                : locale === "it"
                ? "it-IT"
                : "en-US"
        );
        const readableGenre = formatReadableGenre(candidate.genre);
        return `${candidate.recipientName.trim()} • ${readableGenre} • ${candidateDate}`;
    }, [formatReadableGenre, locale]);

    const normalizeGenreKey = useCallback((value: string) => {
        return value
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }, []);
    const normalizedCurrentGenre = useMemo(
        () => normalizeGenreKey(genreName ?? ""),
        [genreName, normalizeGenreKey]
    );

    const bundleOptions = useMemo(() => {
        const options = bundleCandidates.map((candidate) => {
            const candidateKey = normalizeGenreKey(candidate.genre);
            const isSameGenre = !!normalizedCurrentGenre && candidateKey === normalizedCurrentGenre;
            return {
                id: candidate.id,
                isSameGenre,
                genre: formatReadableGenre(candidate.genre),
                label: `${formatCandidateLabel(candidate)}${isSameGenre ? ` ${sameGenreSuffix}` : ""}`,
            };
        });

        options.sort((a, b) => Number(b.isSameGenre) - Number(a.isSameGenre));
        return options;
    }, [bundleCandidates, formatCandidateLabel, formatReadableGenre, normalizedCurrentGenre, normalizeGenreKey, sameGenreSuffix]);

    const hasSameGenreBundleCandidate = bundleOptions.some((option) => option.isSameGenre);
    const selectedBundleOption = bundleOptions.find((option) => option.id === selectedBundleParentId);

    useEffect(() => {
        if (!hasCrossOrderBundle) {
            setSelectedBundleParentId("");
            return;
        }

        if (!selectedBundleParentId || !bundleOptions.some((option) => option.id === selectedBundleParentId)) {
            setSelectedBundleParentId(bundleOptions[0]?.id ?? "");
        }
    }, [bundleOptions, hasCrossOrderBundle, selectedBundleParentId]);

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

    const replaceName = (text: string) =>
        recipientName ? text.replace("{name}", recipientName) : text;
    const title = replaceName(t.title);
    const description = replaceName(t.description);
    const bullets = (t.bullets ?? []).map(replaceName);
    const buyNowWithGenre = useMemo(() => {
        if (!genreName) return t.buyNow;
        return locale === "pt"
            ? `${t.buyNow} • Gênero: ${genreName}`
            : locale === "es"
            ? `${t.buyNow} • Género: ${genreName}`
            : locale === "fr"
            ? `${t.buyNow} • Genre : ${genreName}`
            : locale === "it"
            ? `${t.buyNow} • Genere: ${genreName}`
            : `${t.buyNow} • Genre: ${genreName}`;
    }, [genreName, locale, t.buyNow]);

    const bundleGenresLabel = useMemo(() => {
        if (!genreName || !selectedBundleOption?.genre) return "";
        const sameGenre = normalizeGenreKey(genreName) === normalizeGenreKey(selectedBundleOption.genre);

        if (!sameGenre) {
            return locale === "pt"
                ? `Combo com gêneros diferentes: ${genreName} + ${selectedBundleOption.genre}`
                : locale === "es"
                ? `Combo con géneros diferentes: ${genreName} + ${selectedBundleOption.genre}`
                : locale === "fr"
                ? `Combo avec genres différents : ${genreName} + ${selectedBundleOption.genre}`
                : locale === "it"
                ? `Combo con generi diversi: ${genreName} + ${selectedBundleOption.genre}`
                : `Bundle with different genres: ${genreName} + ${selectedBundleOption.genre}`;
        }

        return locale === "pt"
            ? `Combo no mesmo gênero: ${genreName} + ${selectedBundleOption.genre}`
            : locale === "es"
            ? `Combo en el mismo género: ${genreName} + ${selectedBundleOption.genre}`
            : locale === "fr"
            ? `Combo dans le même genre : ${genreName} + ${selectedBundleOption.genre}`
            : locale === "it"
            ? `Combo nello stesso genere: ${genreName} + ${selectedBundleOption.genre}`
            : `Bundle in the same genre: ${genreName} + ${selectedBundleOption.genre}`;
    }, [genreName, locale, normalizeGenreKey, selectedBundleOption?.genre]);

    const sameOrderGenreHint = useMemo(() => {
        const suffix = genreName ? `: ${genreName}` : "";
        return locale === "pt"
            ? `Mesmo pedido • mesmo gênero${suffix}`
            : locale === "es"
            ? `Mismo pedido • mismo género${suffix}`
            : locale === "fr"
            ? `Même commande • même genre${suffix}`
            : locale === "it"
            ? `Stesso ordine • stesso genere${suffix}`
            : `Same order • same genre${suffix}`;
    }, [genreName, locale]);

    const confirmPurchaseGenreSuffix = useMemo(() => {
        if (!genreName) return "";
        if (selectedQuantity === "2") {
            return locale === "pt"
                ? ` • Mesmo gênero: ${genreName}`
                : locale === "es"
                ? ` • Mismo género: ${genreName}`
                : locale === "fr"
                ? ` • Même genre : ${genreName}`
                : locale === "it"
                ? ` • Stesso genere: ${genreName}`
                : ` • Same genre: ${genreName}`;
        }
        return locale === "pt"
            ? ` • Gênero: ${genreName}`
            : locale === "es"
            ? ` • Género: ${genreName}`
            : locale === "fr"
            ? ` • Genre : ${genreName}`
            : locale === "it"
            ? ` • Genere: ${genreName}`
            : ` • Genre: ${genreName}`;
    }, [genreName, locale, selectedQuantity]);

    // Render markdown bold (**text**) as <strong>
    const renderBold = (text: string, className?: string) =>
        text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
                <strong key={i} className={className}>
                    {part.slice(2, -2)}
                </strong>
            ) : (
                part
            )
        );

    const handleBuyNow = async (overrideQuantity?: "1" | "2") => {
        const qty = overrideQuantity ?? selectedQuantity;
        if (!qty || isCreatingAny) return;

        setLoadingAction("single");

        try {
            await createStreamingUpsell.mutateAsync({
                parentOrderId: orderId,
                email,
                quantity: qty,
            });
        } catch (e) {
            console.error("Failed to create streaming upsell:", e);
            setLoadingAction(null);
        }
    };
    const handleBuyBundle = async () => {
        if (!selectedBundleParentId || isCreatingAny) return;

        setLoadingAction("bundle");

        try {
            await createStreamingBundle.mutateAsync({
                email,
                parentOrderIds: [orderId, selectedBundleParentId],
            });
        } catch (e) {
            console.error("Failed to create streaming bundle:", e);
            setLoadingAction(null);
        }
    };

    const handleSelectQuantity = (quantity: "1" | "2") => {
        setSelectedQuantity(quantity);
    };

    // Fallback translations
    const getText = (key: keyof typeof t, fallback: string) => {
        return t[key] ?? fallback;
    };

    const defaultTranslations = {
        quantity1: locale === "pt" ? "1 música" : locale === "es" ? "1 canción" : locale === "fr" ? "1 chanson" : locale === "it" ? "1 canzone" : "1 song",
        quantity2: locale === "pt" ? "2 músicas" : locale === "es" ? "2 canciones" : locale === "fr" ? "2 chansons" : locale === "it" ? "2 canzoni" : "2 songs",
        selectQuantity: locale === "pt" ? "Quantas músicas colocar no Spotify?" : locale === "es" ? "¿Cuántas canciones poner en Spotify?" : locale === "fr" ? "Combien de chansons sur Spotify?" : locale === "it" ? "Quante canzoni su Spotify?" : "How many songs to put on Spotify?",
        bothDiscount: locale === "pt" ? "Economize {discount}!" : locale === "es" ? "¡Ahorre {discount}!" : locale === "fr" ? "Économisez {discount}!" : locale === "it" ? "Risparmia {discount}!" : "Save {discount}!",
        purchaseRemaining: locale === "pt" ? "Adicionar a outra música" : locale === "es" ? "Agregar la otra canción" : locale === "fr" ? "Ajouter l'autre chanson" : locale === "it" ? "Aggiungi l'altra canzone" : "Add the other song",
        confirmPurchase: locale === "pt" ? "Continuar para Pagamento" : locale === "es" ? "Continuar al Pago" : locale === "fr" ? "Continuer vers le Paiement" : locale === "it" ? "Continua al Pagamento" : "Continue to Payment",
    };

    // Calculate display values
    const hasTwoSongs = slotsStatus?.hasTwoSongs ?? false;
    const slot1Purchased = slotsStatus?.slot1?.purchased ?? false;
    const slot2Purchased = slotsStatus?.slot2?.purchased ?? false;

    // Determine available options
    const canBuySlot1 = !slot1Purchased;
    const canBuySlot2 = hasTwoSongs && !slot2Purchased;
    const canBuyBoth = hasTwoSongs && !slot1Purchased && !slot2Purchased;

    // Get prices
    const slot1Price = slotsStatus?.slot1?.price ?? (currency === "BRL" ? 19700 : 9900);
    const slot2Price = slotsStatus?.slot2?.price ?? (currency === "BRL" ? 14700 : 7500);
    const bothPrice = slotsStatus?.bothPrice ?? (slot1Price + slot2Price);
    const discount = slotsStatus?.discount ?? 0;

    // If only one song, show simple UI
    const showSimpleUI = !hasTwoSongs || (slot1Purchased && !canBuySlot2) || (slot2Purchased && !canBuySlot1);

    // Loading state
    if (isLoadingSlots) {
        return (
            <div id="streaming-vip" className="mt-6 pt-6 border-t border-charcoal/10 scroll-mt-24">
                <div className="bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 rounded-3xl p-5 sm:p-6 border border-sky-200/60 shadow-lg">
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={scrollRef} id="streaming-vip" className="scroll-mt-24">
            <div className="bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 rounded-3xl p-5 sm:p-6 border border-sky-200/60 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0 shadow-lg">
                        <SpotifyIcon className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            {t.badge && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {t.badge}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-sky-900 mt-2">
                            {renderBold(title, "font-extrabold")}
                        </h3>
                        {genreLabel && (
                            <div className="mt-2 inline-flex items-center rounded-full bg-sky-100/80 px-3 py-1 text-sm font-semibold text-sky-800">
                                {genreLabel}
                            </div>
                        )}
                        <p className="text-base text-sky-800/80 mt-2">
                            {renderBold(description, "font-bold text-sky-900")}
                        </p>
                    </div>
                    {showSimpleUI && (
                        <div className="sm:text-right">
                            <span className="inline-flex items-center rounded-2xl bg-white/70 px-4 py-2 text-sky-700 shadow-sm text-base font-bold">
                                {formatPrice(canBuySlot1 ? slot1Price : slot2Price)}
                            </span>
                        </div>
                    )}
                </div>

                {bullets.length > 0 && (
                    <ul className="mt-5 space-y-2 text-base text-sky-800/80">
                        {bullets.map((bullet, index) => (
                            <li key={`${bullet}-${index}`} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                                <span>{renderBold(bullet, "font-bold text-sky-900")}</span>
                            </li>
                        ))}
                    </ul>
                )}

                {/* Cover Art Examples - Compact */}
                <div className="mt-4 flex items-center gap-3">
                    <div className="flex -space-x-2">
                        {COVER_IMAGES.map((src, index) => (
                            <button
                                key={src}
                                onClick={() => setLightboxIndex(index)}
                                className="relative w-10 h-10 rounded-lg overflow-hidden ring-2 ring-white shadow-md hover:scale-110 hover:z-10 transition-transform cursor-zoom-in"
                            >
                                <Image
                                    src={src}
                                    alt={`Cover ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                />
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setLightboxIndex(0)}
                        className="text-sm text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1 hover:underline"
                    >
                        <ImageIcon className="w-4 h-4" />
                        {locale === "pt" ? "Ver exemplos de capas" : locale === "es" ? "Ver ejemplos" : locale === "fr" ? "Voir exemples" : locale === "it" ? "Vedi esempi" : "View examples"}
                    </button>
                </div>

                {locale === "pt" && (
                    <div className="mt-5 pt-5 border-t border-sky-200/70">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold uppercase tracking-wide text-sky-700">
                                Como funciona
                            </span>
                            <span className="text-lg animate-bounce">👇</span>
                            <span className="h-px flex-1 bg-sky-200" />
                        </div>
                        <p className="text-base text-sky-800/80 mt-2">
                            Ouça o audio explicativo e entenda o passo a passo em poucos segundos.
                        </p>
                        <div className="mt-3">
                            <WhatsappAudioPlayer
                                src="https://pub-b085b85804204c82b96e15ec554b0940.r2.dev/upsell-spotify.mp3"
                            />
                        </div>
                    </div>
                )}

                {/* Purchase Options */}
                <div className="mt-5">
                    {showSimpleUI ? (
                        // Simple UI for single song or one remaining
                        <div className="flex justify-end">
                            <button
                                onClick={() => handleBuyNow("1")}
                                disabled={isCreatingAny}
                                className={cn(
                                    "px-5 py-3 rounded-2xl text-base font-bold transition-all",
                                    isCreatingAny
                                        ? "bg-sky-400 text-white cursor-not-allowed"
                                        : "bg-sky-600 hover:bg-sky-700 text-white shadow-md"
                                )}
                            >
                                {isCreatingSingle ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                                        {t.adding}
                                    </>
                                ) : (
                                    slot1Purchased || slot2Purchased
                                        ? getText("purchaseRemaining", defaultTranslations.purchaseRemaining)
                                        : buyNowWithGenre
                                )}
                            </button>
                        </div>
                    ) : (
                        // Two-song quantity selector UI
                        <div className="space-y-3">
                            {/* 2 songs option - highlighted with discount */}
                            {canBuyBoth && (
                                <button
                                    onClick={() => handleSelectQuantity("2")}
                                    disabled={isCreatingAny}
                                    className={cn(
                                        "w-full p-4 rounded-2xl border-2 text-left transition-all relative",
                                        selectedQuantity === "2"
                                            ? "border-sky-500 bg-sky-100 ring-2 ring-sky-500/30"
                                            : "border-sky-300 bg-sky-50 hover:bg-sky-100"
                                    )}
                                >
                                    {/* Discount badge */}
                                    <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                                        <Tag className="w-3 h-3" />
                                        {(getText("bothDiscount", defaultTranslations.bothDiscount) as string).replace("{discount}", formatPrice(discount))}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                                selectedQuantity === "2"
                                                    ? "border-sky-500 bg-sky-500"
                                                    : "border-sky-400"
                                            )}>
                                                {selectedQuantity === "2" && <Check className="w-4 h-4 text-white" />}
                                            </div>
                                            <div>
                                                <span className="font-bold text-sky-900 text-base">
                                                    {getText("quantity2", defaultTranslations.quantity2)}
                                                </span>
                                                <p className="text-sm text-sky-700/70 mt-0.5">
                                                    {locale === "pt" ? "Melhor custo-benefício" : locale === "es" ? "Mejor relación calidad-precio" : locale === "fr" ? "Meilleur rapport qualité-prix" : locale === "it" ? "Miglior rapporto qualità-prezzo" : "Best value"}
                                                </p>
                                                <p className="text-xs text-sky-800/80 mt-0.5 font-medium">
                                                    {sameOrderGenreHint}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-sky-900 text-lg">
                                                {formatPrice(bothPrice)}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            )}

                            {/* 1 song option */}
                            <button
                                onClick={() => handleSelectQuantity("1")}
                                disabled={isCreatingAny}
                                className={cn(
                                    "w-full p-4 rounded-2xl border-2 text-left transition-all",
                                    selectedQuantity === "1"
                                        ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/30"
                                        : "border-sky-200 bg-white hover:border-sky-400 hover:bg-sky-50"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                            selectedQuantity === "1"
                                                ? "border-sky-500 bg-sky-500"
                                                : "border-sky-300"
                                        )}>
                                            {selectedQuantity === "1" && <Check className="w-4 h-4 text-white" />}
                                        </div>
                                        <span className="font-bold text-sky-900 text-base">
                                            {getText("quantity1", defaultTranslations.quantity1)}
                                        </span>
                                    </div>
                                    <span className="font-bold text-sky-900 text-lg">
                                        {formatPrice(slot1Price)}
                                    </span>
                                </div>
                            </button>

                            {/* Confirm Purchase Button - only shows when quantity is selected */}
                            {selectedQuantity && (
                                <button
                                    onClick={() => handleBuyNow()}
                                    disabled={isCreatingAny}
                                    className={cn(
                                        "w-full py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2",
                                        isCreatingAny
                                            ? "bg-sky-400 text-white cursor-not-allowed"
                                            : "bg-sky-600 hover:bg-sky-700 text-white shadow-lg hover:shadow-xl"
                                    )}
                                >
                                    {isCreatingSingle ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            {t.adding}
                                        </>
                                    ) : (
                                        <>
                                            {getText("confirmPurchase", defaultTranslations.confirmPurchase)}
                                            {" - "}
                                            {formatPrice(selectedQuantity === "2" ? bothPrice : slot1Price)}
                                            {confirmPurchaseGenreSuffix}
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Cross-order bundle promo */}
                    {hasCrossOrderBundle && (
                        <div className="mt-4 pt-4 border-t border-sky-200/70 space-y-3">
                            <div>
                                <p className="text-sm font-bold text-sky-900">
                                    {bundleTitle}
                                </p>
                                <p className="text-sm text-sky-800/70 mt-1">
                                    {bundleSubtitle}
                                </p>
                                {genreName && (
                                    <p className="text-xs text-sky-800/80 mt-1">
                                        <span className="font-semibold">{currentGenreLabel}</span> {genreName}
                                    </p>
                                )}
                                {genreName && !hasSameGenreBundleCandidate && (
                                    <p className="text-xs text-sky-700/70 mt-1">
                                        {noSameGenreLabel}
                                    </p>
                                )}
                            </div>

                            <label className="block text-sm font-semibold text-sky-800" htmlFor={`bundle-other-order-${orderId}`}>
                                {bundleSelectLabel}
                            </label>
                            <select
                                id={`bundle-other-order-${orderId}`}
                                value={selectedBundleParentId}
                                onChange={(event) => setSelectedBundleParentId(event.target.value)}
                                disabled={isCreatingAny}
                                className="w-full rounded-xl border border-sky-300 bg-white px-3 py-3 text-sm text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500"
                            >
                                {bundleOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={handleBuyBundle}
                                disabled={!selectedBundleParentId || isCreatingAny}
                                className={cn(
                                    "w-full py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2",
                                    !selectedBundleParentId || isCreatingAny
                                        ? "bg-sky-400 text-white cursor-not-allowed"
                                        : "bg-sky-600 hover:bg-sky-700 text-white shadow-lg hover:shadow-xl"
                                )}
                            >
                                {isCreatingBundle ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        {t.adding}
                                    </>
                                ) : (
                                    <>
                                        {bundleButtonLabel}
                                        {" - "}
                                        {formatPrice(crossBundlePrice)}
                                    </>
                                )}
                            </button>
                            {bundleGenresLabel && (
                                <p className="text-xs text-sky-700/80 text-center -mt-1">
                                    {bundleGenresLabel}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox Modal */}
            {lightboxIndex !== null && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
                    onClick={() => setLightboxIndex(null)}
                >
                    <button
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-6 h-6 text-white" />
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : COVER_IMAGES.length - 1));
                        }}
                        className="absolute left-4 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Previous"
                    >
                        <ChevronLeft className="w-7 h-7 text-white" />
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxIndex((prev) => (prev !== null && prev < COVER_IMAGES.length - 1 ? prev + 1 : 0));
                        }}
                        className="absolute right-4 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Next"
                    >
                        <ChevronRight className="w-7 h-7 text-white" />
                    </button>

                    <div
                        className="relative w-[90vw] h-[90vw] max-w-[500px] max-h-[500px] rounded-3xl overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Image
                            src={COVER_IMAGES[lightboxIndex]!}
                            alt={`Cover art example ${lightboxIndex + 1}`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 500px) 90vw, 500px"
                            priority
                        />
                    </div>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium">
                        {lightboxIndex + 1} / {COVER_IMAGES.length}
                    </div>
                </div>
            )}
        </div>
    );
}
