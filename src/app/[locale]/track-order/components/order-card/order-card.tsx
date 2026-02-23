"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { addDays, format } from "date-fns";
import Link from "next/link";
import { Clock, Zap, Sparkles } from "lucide-react";
import { MusicianTipUpsell } from "~/components/track-order/musician-tip-upsell";
import { cn } from "~/lib/utils";
import type { TrackOrder, TrackOrderChild } from "../../hooks/use-track-order";
import type { OrderStatus } from "../../utils/order-helpers";
import {
    getGenreDisplayName,
    getRecipientDisplayName,
    getStatusHeroBackground,
    renderOrderDate,
    formatPrice,
    getExtraSongPrice,
    getGenreVariantPrice,
    DATE_LOCALES,
} from "../../utils/order-helpers";
import { OrderStatusHero } from "./order-status-hero";
import { OrderTimeline } from "./order-timeline";
import { OrderActions } from "./order-actions";
import { OrderAudioSection } from "./order-audio-section";
import { OrderBumpsAccordion } from "./order-bumps-accordion";
import { OrderUpsellsAccordion } from "./order-upsells-accordion";
import { RevisionRequestCard } from "../revision/revision-request-card";
import { RevisionStatusCard } from "../revision/revision-status-card";
import { FinalVersionCard } from "../revision/final-version-card";

interface OrderCardProps {
    order: TrackOrder;
    ordersList: TrackOrder[];
    index: number;
    locale: string;
    email: string;
    onRefetch: () => void;
    onRequestRevision: (orderId: string) => void;
    translations: {
        results: {
            orderFor: string;
            status: Record<OrderStatus, string>;
            deliveryEstimate: {
                label: string;
                planExpress: string;
                planStandard: string;
                ready: string;
                pending: string;
            };
            pendingPayment: { title: string; description: string; cta: string };
            editOrder: { title: string; description: string; cta: string };
            reviewInfo: {
                title: string;
                description: string;
                cta: string;
                hide: string;
                recipient: string;
                genre: string;
                vocals: string;
                vocalsFemale: string;
                vocalsMale: string;
                vocalsEither: string;
                qualities: string;
                memories: string;
                message: string;
                noQualities: string;
                noMemories: string;
                noMessage: string;
                edit: string;
                save: string;
                saving: string;
                cancel: string;
                saved: string;
                qualitiesPlaceholder: string;
                memoriesPlaceholder: string;
                messagePlaceholder: string;
            };
            fastDelivery: string;
            extraSong: string;
            labelMainOrder: string;
            labelGenreExtra: string;
            songReady: string;
            songsReady: string;
            listenNow: string;
            chooseFavorite: string;
            option1: string;
            option2: string;
            genreVariant: string;
            shareSongMessage: string;
            shareButton: string;
            downloadButton: string;
            revisionButton?: string;
            streamingButton?: string;
            orderBumps: {
                title: string;
                certificate: string;
                chooseOption: string;
                certificateDesc: string;
                openCertificate: string;
                copyLink: string;
                copiedLink: string;
                shareWhatsApp: string;
                whatsAppMessage: string;
                lyrics: string;
                lyricsDesc: string;
                downloadLyrics: string;
                streamingVip: string;
                streamingVipDesc: string;
                streamingVipListen: string;
                streamingVipListenFallback: string;
                streamingShare: string;
                streamingShareSuccess: string;
                pendingDesc: string;
                pending: string;
                songNameLabel: string;
                songNamePlaceholder: string;
                songNameSave: string;
                songNameSaving: string;
                songNameSaved: string;
                songNameError: string;
                karaoke: string;
                karaokeProcessing: string;
                karaokeReady: string;
                downloadKaraoke: string;
            };
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
            revisionCompletedBadge?: string;
        };
        timeline: {
            pendingPayment: string;
            ordered: string;
            processing: string;
            ready: string;
        };
    };
}

export function OrderCard({
    order,
    ordersList,
    index,
    locale,
    email,
    onRefetch,
    onRequestRevision,
    translations,
}: OrderCardProps) {
    const { results, revision, musicianTip, upsellSection, genreVariantUpsell, lyricsUpsell, streamingVipUpsell, karaokeUpsell, timeline } = translations;

    const hasSong = !!order.songFileUrl || !!order.songFileUrl2;
    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
    const genreLabel = getGenreDisplayName(order.genre, locale);
    const statusLabel = results.status[order.status as OrderStatus] || order.status;

    // Get vocals label
    const getVocalsLabel = () => {
        if (!order.vocals) return undefined;
        switch (order.vocals.toLowerCase()) {
            case "female":
                return results.reviewInfo.vocalsFemale;
            case "male":
                return results.reviewInfo.vocalsMale;
            case "either":
                return results.reviewInfo.vocalsEither;
            default:
                return undefined;
        }
    };
    const vocalsLabel = getVocalsLabel();

    // Get parent order for GENRE_VARIANT or EXTRA_SONG
    const parentOrder = order.parentOrderId
        ? ordersList.find((parent) => parent.id === order.parentOrderId)
        : null;

    // Display price calculation
    const getDisplayPriceCents = () => {
        if (order.priceAtOrder && order.priceAtOrder > 0) return order.priceAtOrder;
        if (order.orderType === "EXTRA_SONG") {
            return getExtraSongPrice(order.currency, order.locale);
        }
        if (order.orderType === "GENRE_VARIANT") {
            const parentOrderType = parentOrder?.orderType || null;
            const useUpsell = parentOrderType === "GENRE_VARIANT";
            return getGenreVariantPrice(order.currency, order.locale, useUpsell);
        }
        return null;
    };

    const displayPriceCents = getDisplayPriceCents();

    // Render order date + time
    const orderDateDisplay = renderOrderDate(new Date(order.createdAt), locale);
    const orderTimeDisplay = format(new Date(order.createdAt), "HH:mm");

    // Order type label for hero
    const orderTypeLabel =
        order.orderType === "MAIN" ? results.labelMainOrder :
        order.orderType === "GENRE_VARIANT" ? results.labelGenreExtra :
        order.orderType === "EXTRA_SONG" ? results.extraSong :
        undefined;

    // Can show revision?
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

    // Can edit order?
    const canEditOrder =
        (order.orderType === "MAIN" || order.orderType === "GENRE_VARIANT" || order.orderType === "EXTRA_SONG") &&
        (order.status === "PAID" || (order.status === "IN_PROGRESS" && !hasSong));

    // Can show streaming upsell shortcut?
    const upsellsRef = useRef<HTMLDivElement>(null);
    const hasStreamingUpsell = order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "STREAMING_UPSELL" && child.status !== "PENDING"
    );
    const canShowStreamingShortcut = order.status === "COMPLETED" && !hasStreamingUpsell;

    const scrollToUpsells = () => {
        upsellsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

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
    const fastDeliveryLabel = isPremiumSixHourPlan
        ? (locale === "pt"
            ? "Entrega 6h"
            : locale === "es"
                ? "Entrega 6h"
                : locale === "fr"
                    ? "Livraison 6h"
                    : locale === "it"
                        ? "Consegna 6h"
                        : "6h delivery")
        : results.fastDelivery;

    const getWithinHoursText = (hours: number) => {
        if (locale === "pt") return `até ${hours}h`;
        if (locale === "es") return `hasta ${hours}h`;
        if (locale === "fr") return `sous ${hours}h`;
        if (locale === "it") return `entro ${hours}h`;
        return `within ${hours}h`;
    };

    // Delivery estimate
    const getDeliveryText = (): string | null => {
        if (order.status === "COMPLETED" || order.status === "REVISION") return null;
        const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES];

        const isExpress = order.hasFastDelivery;
        const planLabel = isPremiumSixHourPlan
            ? sixHourPlanLabel
            : isExpress
                ? results.deliveryEstimate.planExpress
                : results.deliveryEstimate.planStandard;

        if (order.status === "PENDING") {
            return results.deliveryEstimate.pending.replace("{plan}", planLabel);
        }

        if (isPremiumSixHourPlan) {
            return `${getWithinHoursText(6)} • ${planLabel}`;
        }

        const daysToAdd = isExpress ? 1 : 7;
        const estimatedDate = addDays(new Date(order.createdAt), daysToAdd);
        const formattedDate = format(estimatedDate, "dd/MM/yy", { locale: dateLocale });

        return results.deliveryEstimate.ready
            .replace("{date}", formattedDate)
            .replace("{plan}", planLabel);
    };

    const deliveryText = getDeliveryText();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-3xl shadow-xl border border-charcoal/10 overflow-hidden"
        >
            <div className="p-5 sm:p-6 space-y-5">
                {/* Unified Info Block: Hero + Timeline + Delivery + Badges */}
                <div className={cn(
                    "rounded-3xl overflow-hidden",
                    getStatusHeroBackground(order.status)
                )}>
                    {/* Status Hero */}
                    <OrderStatusHero
                        locale={locale}
                        status={order.status as OrderStatus}
                        statusLabel={statusLabel}
                        recipientName={recipientName}
                        genreLabel={genreLabel}
                        vocalsLabel={vocalsLabel}
                        orderDate={orderDateDisplay}
                        orderTime={orderTimeDisplay}
                        orderTypeLabel={orderTypeLabel}
                        revisionCount={order.revisionCount}
                        revisionCompletedAt={order.revisionCompletedAt}
                        revisionCompletedLabel={order.revisionCount && order.revisionCount > 0 ? translations.revision?.revisionCompletedBadge?.replace("{number}", String(order.revisionCount)) : undefined}
                    />

                    {/* Timeline (for non-completed orders) */}
                    {order.status !== "COMPLETED" && order.status !== "REVISION" && (
                        <OrderTimeline
                            status={order.status as OrderStatus}
                            labels={timeline}
                        />
                    )}

                    {/* Delivery Estimate */}
                    {deliveryText && (
                        <div className="flex items-center justify-center gap-2 mx-5 mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
                            <Clock className="w-4 h-4" />
                            {deliveryText}
                        </div>
                    )}

                    {/* Extra Badges (fast delivery only — order type moved to hero) */}
                    {order.hasFastDelivery && (
                        <div className={cn(
                            "flex flex-wrap items-center justify-center gap-2 px-5",
                            canEditOrder ? "pb-4" : "pb-5"
                        )}>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold">
                                <Zap className="w-4 h-4" />
                                {fastDeliveryLabel}
                            </span>
                        </div>
                    )}

                    {/* Edit Order CTA — inside unified block for maximum visibility */}
                    {canEditOrder && (
                        <div className="mx-4 mb-4 rounded-2xl border border-[#4A8E9A]/20 bg-white p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                                <motion.div
                                    animate={{ scale: [1, 1.15, 1] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4A8E9A]/10"
                                >
                                    <Sparkles className="h-5 w-5 text-[#1A1A2E]" />
                                </motion.div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-semibold leading-tight text-charcoal">
                                        {results.editOrder.title}
                                    </p>
                                    <p className="mt-1 text-sm leading-snug text-charcoal/60">
                                        {results.editOrder.description}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={`/${order.locale || locale}/order/${order.id}/edit?email=${encodeURIComponent(email)}`}
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4A8E9A] px-5 py-3 text-base font-semibold text-white shadow-[0_10px_20px_-12px_rgba(60,36,21,0.8)] transition-all hover:bg-[#F0EDE6] active:scale-[0.97]"
                            >
                                {results.editOrder.cta}
                            </Link>
                        </div>
                    )}
                </div>

                {/* Actions (without badges/edit, already shown in unified block) */}
                <OrderActions
                    order={order}
                    locale={locale}
                    searchedEmail={email}
                    onRefetch={onRefetch}
                    hideBadges
                    hideEditOrder
                    translations={{
                        pendingPayment: results.pendingPayment,
                        editOrder: results.editOrder,
                        reviewInfo: results.reviewInfo,
                        fastDelivery: fastDeliveryLabel,
                        extraSong: results.extraSong,
                        labelMainOrder: results.labelMainOrder,
                        labelGenreExtra: results.labelGenreExtra,
                    }}
                />

                {/* Audio Section (for completed orders) */}
                {hasSong && order.status === "COMPLETED" && (
                    <OrderAudioSection
                        order={order}
                        locale={locale}
                        hideHeader={true}
                        translations={{
                            songReady: results.songReady,
                            songsReady: results.songsReady,
                            listenNow: results.listenNow,
                            chooseFavorite: results.chooseFavorite,
                            option1: results.option1,
                            option2: results.option2,
                            shareSongMessage: results.shareSongMessage,
                            shareButton: results.shareButton,
                            downloadButton: results.downloadButton,
                            orderFor: results.orderFor,
                            revisionButton: results.revisionButton,
                            streamingButton: results.streamingButton,
                        }}
                        onRequestRevision={canRequestRevision ? () => onRequestRevision(order.id) : undefined}
                        onRequestStreaming={canShowStreamingShortcut ? scrollToUpsells : undefined}
                    />
                )}

                {/* Musician Tip */}
                {order.status === "COMPLETED" && hasSong && (
                    <MusicianTipUpsell
                        orderId={order.id}
                        email={email}
                        locale={locale}
                        currency={order.currency}
                        t={musicianTip}
                    />
                )}

                {/* Revision Section */}
                {order.status === "REVISION" && (
                    <RevisionStatusCard
                        order={order}
                        email={email}
                        onSuccess={onRefetch}
                        translations={revision}
                    />
                )}

                {showFinalVersion && (
                    <FinalVersionCard
                        order={order}
                        locale={locale}
                        translations={revision}
                    />
                )}

                {canRequestRevision && (
                    <RevisionRequestCard
                        order={order}
                        locale={locale}
                        onRequestRevision={() => onRequestRevision(order.id)}
                        translations={revision}
                    />
                )}

                {/* Order Bumps Accordion - only show for paid orders */}
                {order.status !== "PENDING" && (
                    <OrderBumpsAccordion
                        order={order}
                        parentOrder={parentOrder}
                        email={email}
                        locale={locale}
                        translations={{
                            ...results.orderBumps,
                            option1: results.option1,
                            option2: results.option2,
                            status: results.status,
                        }}
                    />
                )}

                {/* Upsells Accordion - show for paid, in-progress, and completed orders */}
                {(order.status === "PAID" || order.status === "IN_PROGRESS" || order.status === "COMPLETED") && (
                    <OrderUpsellsAccordion
                        order={order}
                        email={email}
                        locale={locale}
                        scrollRef={upsellsRef}
                        translations={{
                            sectionTitle: upsellSection.title,
                            sectionDescription: upsellSection.description,
                            genreVariant: results.genreVariant,
                            genreVariantUpsell,
                            lyricsUpsell,
                            streamingVipUpsell,
                            karaokeUpsell,
                        }}
                    />
                )}
            </div>
        </motion.div>
    );
}
