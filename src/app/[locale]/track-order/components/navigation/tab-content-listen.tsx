"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Music, Clock, Pencil } from "lucide-react";
import { MusicianTipUpsell } from "~/components/track-order/musician-tip-upsell";
import type { TrackOrder, TrackOrderChild } from "../../hooks/use-track-order";
import type { OrderStatus } from "../../utils/order-helpers";
import { DATE_LOCALES, formatPrice } from "../../utils/order-helpers";
import { format, addDays } from "date-fns";
import { RevisionRequestCard } from "../revision/revision-request-card";
import { RevisionStatusCard } from "../revision/revision-status-card";
import { FinalVersionCard } from "../revision/final-version-card";
import { OrderUpsellsAccordion } from "../order-card/order-upsells-accordion";
import { OrderAudioSection } from "../order-card/order-audio-section";
import { OrderStatusBadge } from "./order-status-badge";

interface TabContentListenProps {
    order: TrackOrder | null;
    locale: string;
    email: string;
    onRefetch: () => void;
    onRequestRevision: (orderId: string) => void;
    translations: {
        songReady: string;
        songsReady: string;
        listenNow: string;
        chooseFavorite: string;
        option1: string;
        option2: string;
        shareSongMessage: string;
        shareButton: string;
        downloadButton: string;
        orderFor: string;
        noSongYet: string;
        noSongDescription: string;
        genreVariant: string;
        status: Record<OrderStatus, string>;
        deliveryEstimate: {
            label: string;
            planExpress: string;
            planStandard: string;
            ready: string;
            pending: string;
        };
        editOrder: {
            title: string;
            description: string;
            cta: string;
        };
        ordered: string;
        pricePaid: string;
        revisionButton?: string;
        streamingButton?: string;
        musicianTip: {
            title: string;
            subtitle: string;
            description: string;
            placeholder: string;
            minValue: string;
            maxValue: string;
            button: string;
            processing: string;
            optional: string;
            thankYou: string;
        };
        revision: {
            button: string;
            cardTitle: string;
            cardSubtitle: string;
            cardDescription: string;
            statusInRevision: string;
            statusDescription: string;
            queuePosition: string;
            queueProcessing: string;
            cancelButton: string;
            cancelConfirmTitle: string;
            cancelConfirmDescription: string;
            cancelConfirmButton: string;
            cancelling: string;
            cancelHelperText: string;
            addNotesButton: string;
            addNotesTitle: string;
            addNotesDescription: string;
            addNotesPlaceholder: string;
            addNotesSend: string;
            addNotesSending: string;
            modalCancel: string;
            existingNotesLabel: string;
            preferredVersionLabel: string;
            melodyPreferenceLabel: string;
            melodyKeepCurrent: string;
            melodySuggestNew: string;
            finalVersionTitle: string;
            finalVersionDescription: string;
        };
        upsellSection: { title: string; description: string };
        genreVariantUpsell: {
            title: string;
            description: string;
            selectStyles: string;
            perStyle: string;
            buyNow: string;
            adding: string;
            total: string;
            alreadyHave: string;
            currentGenre: string;
            selectVoice: string;
            voiceFemale: string;
            voiceMale: string;
            voiceEither: string;
        };
        lyricsUpsell: {
            title: string;
            description: string;
            price: string;
            buyNow: string;
            adding: string;
        };
        streamingVipUpsell: {
            badge?: string;
            title: string;
            description: string;
            bullets: string[];
            buyNow: string;
            adding: string;
        };
        karaokeUpsell: {
            title: string;
            description: string;
            price: string;
            buyNow: string;
            adding: string;
        };
    };
}

export function TabContentListen({
    order,
    locale,
    email,
    onRefetch,
    onRequestRevision,
    translations,
}: TabContentListenProps) {
    const upsellsRef = useRef<HTMLDivElement>(null);

    if (!order) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-charcoal/5 flex items-center justify-center mb-4">
                    <Music className="w-8 h-8 text-charcoal/30" />
                </div>
                <p className="text-charcoal/50">{translations.noSongYet}</p>
            </div>
        );
    }

    const hasSong = !!order.songFileUrl || !!order.songFileUrl2;

    // Revision logic
    const canRequestRevision =
        order.status === "COMPLETED" &&
        hasSong &&
        (order.orderType === "MAIN" || order.orderType === "EXTRA_SONG" || order.orderType === "GENRE_VARIANT") &&
        order.revisionCount < 10;

    const showFinalVersion =
        order.status === "COMPLETED" &&
        hasSong &&
        (order.orderType === "MAIN" || order.orderType === "EXTRA_SONG" || order.orderType === "GENRE_VARIANT") &&
        order.revisionCount >= 10;

    // Check if streaming upsell is available
    const hasStreamingUpsell = order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "STREAMING_UPSELL" && child.status !== "PENDING"
    );
    const canShowStreamingShortcut = order.status === "COMPLETED" && !hasStreamingUpsell;

    const scrollToUpsells = () => {
        upsellsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // Show "song not ready" message when no song or status is not COMPLETED/REVISION
    const showSongContent = hasSong && (order.status === "COMPLETED" || order.status === "REVISION");
    const isPremiumSixHourPlan = order.planType === "acelerado";
    const sixHourPlanLabel = locale === "pt"
        ? "Turbo"
        : locale === "es"
            ? "Turbo"
            : locale === "fr"
                ? "Accéléré"
                : locale === "it"
                    ? "Accelerato"
                    : "Accelerated";
    const getWithinHoursText = (hours: number) => {
        if (locale === "pt") return `até ${hours}h`;
        if (locale === "es") return `hasta ${hours}h`;
        if (locale === "fr") return `sous ${hours}h`;
        if (locale === "it") return `entro ${hours}h`;
        return `within ${hours}h`;
    };

    // Get delivery estimate text
    const getDeliveryText = (): string | null => {
        if (order.status === "COMPLETED" || order.status === "REVISION") return null;
        const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES];

        // Check if order has fast delivery (express)
        const isExpress = order.hasFastDelivery;
        const planLabel = isPremiumSixHourPlan
            ? sixHourPlanLabel
            : isExpress
                ? translations.deliveryEstimate.planExpress
                : translations.deliveryEstimate.planStandard;

        if (order.status === "PENDING") {
            return translations.deliveryEstimate.pending.replace("{plan}", planLabel);
        }

        if (isPremiumSixHourPlan) {
            return `${getWithinHoursText(6)} • ${planLabel}`;
        }

        const daysToAdd = isExpress ? 1 : 7;
        const estimatedDate = addDays(new Date(order.createdAt), daysToAdd);
        const formattedDate = format(estimatedDate, "dd/MM/yy", { locale: dateLocale });

        return translations.deliveryEstimate.ready
            .replace("{date}", formattedDate)
            .replace("{plan}", planLabel);
    };

    const deliveryText = getDeliveryText();

    // Check if order can be edited (PENDING or PAID status)
    const canEdit = order.status === "PENDING" || order.status === "PAID";

    // Get status label safely
    const statusKey = order.status as OrderStatus;
    const statusLabel = translations.status[statusKey] || order.status;

    // Format order date and time
    const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES];
    const orderDate = format(new Date(order.createdAt), "dd/MM/yyyy", { locale: dateLocale });
    const orderTime = format(new Date(order.createdAt), "HH:mm", { locale: dateLocale });
    const orderPrice = formatPrice(order.priceAtOrder || 0, order.currency);

    if (!showSongContent) {
        return (
            <div className="px-4 py-6 space-y-5 pb-24">
                {/* Edit Order Card - Moved to top as it's important */}
                {canEdit && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-4 shadow-[0_18px_40px_-24px_rgba(194,101,0,0.75)] ring-1 ring-amber-200/70 sm:p-5"
                    >
                        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-300/35 blur-2xl" />
                        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className="w-11 h-11 rounded-full border border-amber-300 bg-amber-100 flex items-center justify-center flex-shrink-0 shadow-sm sm:w-12 sm:h-12">
                                    <Pencil className="w-5 h-5 text-amber-700" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-[#7C3D1D] text-[15px] leading-tight sm:text-sm">
                                        {translations.editOrder.title}
                                    </h3>
                                    <p className="text-[13px] text-[#4A6FA5] mt-1 leading-snug sm:text-xs">
                                        {translations.editOrder.description}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={`/${locale}/create?edit=${order.id}`}
                                className="inline-flex w-full flex-shrink-0 items-center justify-center rounded-xl bg-[#4A8E9A] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-12px_rgba(60,36,21,0.95)] transition-all hover:bg-[#F0EDE6] active:scale-95 min-h-[44px] sm:w-auto"
                            >
                                {translations.editOrder.cta}
                            </Link>
                        </div>
                    </motion.div>
                )}

                {/* Status and Info */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: canEdit ? 0.1 : 0 }}
                    className="bg-white rounded-2xl border border-charcoal/10 p-5"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"
                        >
                            <Music className="w-6 h-6 text-violet-500" />
                        </motion.div>
                        <div>
                            <p className="font-semibold text-charcoal">{translations.noSongYet}</p>
                            <p className="text-sm text-charcoal/60">{translations.noSongDescription}</p>
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex justify-center mb-4">
                        <OrderStatusBadge
                            status={statusKey}
                            label={statusLabel}
                        />
                    </div>

                    {/* Delivery Estimate - Highlighted */}
                    {deliveryText && (
                        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium mb-4">
                            <Clock className="w-4 h-4" />
                            {deliveryText}
                        </div>
                    )}

                    {/* Order Details: Date, Time, Price */}
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-charcoal/60">
                        <span>{orderDate} • {orderTime}</span>
                        <span>•</span>
                        <span className="font-semibold text-charcoal">{orderPrice}</span>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="px-4 py-6 space-y-6 pb-24">
            {/* Audio Section with buttons */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <OrderAudioSection
                    order={order}
                    locale={locale}
                    hideHeader={true}
                    hideGenreBadge={true}
                    translations={{
                        songReady: translations.songReady,
                        songsReady: translations.songsReady,
                        listenNow: translations.listenNow,
                        chooseFavorite: translations.chooseFavorite,
                        option1: translations.option1,
                        option2: translations.option2,
                        shareSongMessage: translations.shareSongMessage,
                        shareButton: translations.shareButton,
                        downloadButton: translations.downloadButton,
                        orderFor: translations.orderFor,
                        revisionButton: translations.revisionButton,
                        streamingButton: translations.streamingButton,
                    }}
                    onRequestRevision={canRequestRevision ? () => onRequestRevision(order.id) : undefined}
                    onRequestStreaming={canShowStreamingShortcut ? scrollToUpsells : undefined}
                />
            </motion.div>

            {/* Musician Tip */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
            >
                <MusicianTipUpsell
                    orderId={order.id}
                    email={email}
                    locale={locale}
                    currency={order.currency}
                    t={translations.musicianTip}
                />
            </motion.div>

            {/* Revision Section */}
            {order.status === "REVISION" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                >
                    <RevisionStatusCard
                        order={order}
                        email={email}
                        onSuccess={onRefetch}
                        translations={translations.revision}
                    />
                </motion.div>
            )}

            {showFinalVersion && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                >
                    <FinalVersionCard
                        order={order}
                        locale={locale}
                        translations={translations.revision}
                    />
                </motion.div>
            )}

            {canRequestRevision && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                >
                    <RevisionRequestCard
                        order={order}
                        locale={locale}
                        onRequestRevision={() => onRequestRevision(order.id)}
                        translations={translations.revision}
                    />
                </motion.div>
            )}

            {/* Upsells Accordion */}
            {order.status === "COMPLETED" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <OrderUpsellsAccordion
                        order={order}
                        email={email}
                        locale={locale}
                        scrollRef={upsellsRef}
                        translations={{
                            sectionTitle: translations.upsellSection.title,
                            sectionDescription: translations.upsellSection.description,
                            genreVariant: translations.genreVariant,
                            genreVariantUpsell: translations.genreVariantUpsell,
                            lyricsUpsell: translations.lyricsUpsell,
                            streamingVipUpsell: translations.streamingVipUpsell,
                            karaokeUpsell: translations.karaokeUpsell,
                        }}
                    />
                </motion.div>
            )}
        </div>
    );
}
