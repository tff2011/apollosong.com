"use client";

import { motion } from "framer-motion";
import { Gift, Package, Sparkles, Music } from "lucide-react";
import { GenreVariantUpsell } from "~/components/track-order/genre-variant-upsell";
import { KaraokeUpsell } from "~/components/track-order/karaoke-upsell";
import { LyricsUpsell } from "~/components/track-order/lyrics-upsell";
import { StreamingVipUpsell } from "~/components/track-order/streaming-vip-upsell";
import { MusicianTipUpsell } from "~/components/track-order/musician-tip-upsell";
import type { TrackOrder, TrackOrderChild } from "../../hooks/use-track-order";
import { getGenreDisplayName, getRecipientDisplayName } from "../../utils/order-helpers";
import { OrderBumpsAccordion } from "../order-card/order-bumps-accordion";
import { OrderStatusBadge } from "./order-status-badge";
import type { OrderStatus } from "../../utils/order-helpers";

interface TabContentExtrasProps {
    order: TrackOrder | null;
    email: string;
    locale: string;
    translations: {
        purchased: string;
        available: string;
        noPurchased: string;
        noAvailable: string;
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
        upsellSection: { title: string; description: string };
        genreVariant: string;
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
        option1: string;
        option2: string;
        status: Record<OrderStatus, string>;
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
    };
}

export function TabContentExtras({
    order,
    email,
    locale,
    translations,
}: TabContentExtrasProps) {
    if (!order) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-charcoal/5 flex items-center justify-center mb-4">
                    <Gift className="w-8 h-8 text-charcoal/30" />
                </div>
                <p className="text-charcoal/50">{translations.noAvailable}</p>
            </div>
        );
    }

    const parentOrder = order.parentOrderId ? null : null;
    const genreName = getGenreDisplayName(order.genre, locale);
    const genreLabel = translations.genreVariant.replace(
        "{genre}",
        genreName
    );

    // Check what upsells are already purchased
    const hasLyricsUpsell = order.hasLyrics || order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics
    );
    const hasStreamingUpsell = order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "STREAMING_UPSELL" && child.status !== "PENDING"
    );
    const hasKaraokeUpsell = order.hasKaraokePlayback || order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "KARAOKE_UPSELL" && child.status !== "PENDING"
    );
    // Karaoke: only show for COMPLETED orders when the current song still has Kie IDs available.
    // For PAID/IN_PROGRESS we still allow pre-purchase (generation happens after song completion).
    // Hide if Kie IDs expired (12-day safety margin on 14-day Kie expiry).
    const KIE_EXPIRY_DAYS = 12;
    const hasKieIdsForCurrentSong = Boolean(order.songFileUrl && order.kieTaskId && order.kieAudioId1);
    const kieIdsExpired = order.songUploadedAt
        ? Date.now() - new Date(order.songUploadedAt).getTime() > KIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        : false; // No upload yet = not expired, allow pre-purchase
    const showKaraoke = !hasKaraokeUpsell && order.status !== "PENDING" && !kieIdsExpired && (
        order.status !== "COMPLETED" || hasKieIdsForCurrentSong
    );

    // Can show genre variant?
    const canShowGenreVariant = order.orderType === "MAIN" || order.orderType === "EXTRA_SONG";

    // Check if order has bumps
    const hasBumps = order.hasCertificate || order.hasLyrics || hasStreamingUpsell || hasKaraokeUpsell;

    // Check if has available upsells
    const hasAvailableUpsells = (order.status === "COMPLETED" && (
        canShowGenreVariant || !hasLyricsUpsell || !hasStreamingUpsell
    )) || showKaraoke;

    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
    const statusLabel = translations.status[order.status as OrderStatus] || order.status;

    return (
        <div className="px-4 py-6 space-y-6 pb-24">
            {/* Order Context Header */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-charcoal/10 p-4"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <Music className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-charcoal truncate">
                            {recipientName}
                        </p>
                        <p className="text-sm text-charcoal/60">
                            {getGenreDisplayName(order.genre, locale)}
                        </p>
                    </div>
                    <OrderStatusBadge
                        status={order.status as OrderStatus}
                        label={statusLabel}
                    />
                </div>
            </motion.div>

            {/* Musician Tip - First item */}
            {order.status === "COMPLETED" && (order.songFileUrl || order.songFileUrl2) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                >
                    <MusicianTipUpsell
                        orderId={order.id}
                        email={email}
                        locale={locale}
                        currency={order.currency}
                        t={translations.musicianTip}
                    />
                </motion.div>
            )}

            {/* Purchased Services */}
            {hasBumps && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Package className="w-5 h-5 text-charcoal/50" />
                        <h3 className="font-semibold text-charcoal">{translations.purchased}</h3>
                    </div>
                    <OrderBumpsAccordion
                        order={order}
                        parentOrder={parentOrder}
                        email={email}
                        locale={locale}
                        translations={{
                            ...translations.orderBumps,
                            option1: translations.option1,
                            option2: translations.option2,
                            status: translations.status,
                        }}
                    />
                </motion.div>
            )}

            {/* Available Services */}
            {hasAvailableUpsells && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        <h3 className="font-semibold text-charcoal">{translations.available}</h3>
                    </div>
                    <div className="space-y-4">
                        {/* Streaming VIP */}
                        {!hasStreamingUpsell && (
                            <StreamingVipUpsell
                                orderId={order.id}
                                email={email}
                                locale={locale}
                                currency={order.currency}
                                recipientName={recipientName}
                                genreLabel={genreLabel}
                                genreName={genreName}
                                t={translations.streamingVipUpsell}
                            />
                        )}

                        {/* Genre Variant */}
                        {canShowGenreVariant && (
                            <GenreVariantUpsell
                                orderId={order.id}
                                email={email}
                                currentGenre={order.genre}
                                existingVariants={
                                    order.childOrders
                                        .filter((child: TrackOrderChild) => child.orderType === "GENRE_VARIANT")
                                        .map((child: TrackOrderChild) => child.genre)
                                        .filter((g: string | null): g is string => g !== null)
                                }
                                locale={locale}
                                currency={order.currency}
                                recipientName={recipientName}
                                hasLyrics={!!order.lyrics}
                                t={translations.genreVariantUpsell}
                            />
                        )}

                        {/* Karaoke */}
                        {showKaraoke && (
                            <KaraokeUpsell
                                orderId={order.id}
                                email={email}
                                locale={locale}
                                currency={order.currency}
                                recipientName={recipientName}
                                genreLabel={genreLabel}
                                t={translations.karaokeUpsell}
                            />
                        )}

                        {/* Lyrics */}
                        {!hasLyricsUpsell && (
                            <LyricsUpsell
                                orderId={order.id}
                                email={email}
                                locale={locale}
                                currency={order.currency}
                                recipientName={recipientName}
                                genreLabel={genreLabel}
                                t={translations.lyricsUpsell}
                            />
                        )}
                    </div>
                </motion.div>
            )}

            {/* Empty state if nothing available */}
            {!hasBumps && !hasAvailableUpsells && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-charcoal/5 flex items-center justify-center mb-4">
                        <Gift className="w-8 h-8 text-charcoal/30" />
                    </div>
                    <p className="text-charcoal/50">{translations.noAvailable}</p>
                </div>
            )}
        </div>
    );
}
