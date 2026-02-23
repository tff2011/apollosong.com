"use client";

import { type RefObject } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronDown } from "lucide-react";
import { GenreVariantUpsell } from "~/components/track-order/genre-variant-upsell";
import { KaraokeUpsell } from "~/components/track-order/karaoke-upsell";
import { LyricsUpsell } from "~/components/track-order/lyrics-upsell";
import { StreamingVipUpsell } from "~/components/track-order/streaming-vip-upsell";
import type { TrackOrder, TrackOrderChild } from "../../hooks/use-track-order";
import { getGenreDisplayName, getRecipientDisplayName } from "../../utils/order-helpers";

interface OrderUpsellsAccordionProps {
    order: TrackOrder;
    email: string;
    locale: string;
    scrollRef?: RefObject<HTMLDivElement | null>;
    translations: {
        sectionTitle: string;
        sectionDescription: string;
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
    };
}

export function OrderUpsellsAccordion({
    order,
    email,
    locale,
    scrollRef,
    translations,
}: OrderUpsellsAccordionProps) {
    // Check what upsells are already purchased
    const hasLyricsUpsell = order.hasLyrics || order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics && child.status !== "PENDING"
    );
    const hasStreamingUpsell = order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "STREAMING_UPSELL" && child.status !== "PENDING"
    );
    const hasKaraokeUpsell = order.hasKaraokePlayback || order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "KARAOKE_UPSELL" && child.status !== "PENDING"
    );

    // Show for MAIN, EXTRA_SONG, or GENRE_VARIANT order types
    // GENRE_VARIANT can create sibling variants under the same parent
    const canShowGenreVariant = order.orderType === "MAIN" || order.orderType === "EXTRA_SONG" || order.orderType === "GENRE_VARIANT";

    // For GENRE_VARIANT, use parentOrderId to create siblings; otherwise use order.id
    const genreVariantParentId = order.orderType === "GENRE_VARIANT" && order.parentOrderId
        ? order.parentOrderId
        : order.id;

    // Streaming VIP and Lyrics upsell only make sense for completed orders
    const isCompleted = order.status === "COMPLETED";
    const showStreaming = isCompleted && !hasStreamingUpsell;
    const showLyrics = isCompleted && !hasLyricsUpsell;
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

    // Count available upsells
    const upsellCount = [
        canShowGenreVariant,
        showLyrics,
        showStreaming,
        showKaraoke,
    ].filter(Boolean).length;

    // Don't render if no upsells available
    if (upsellCount === 0) return null;

    const genreName = getGenreDisplayName(order.genre, locale);
    const genreLabel = translations.genreVariant.replace(
        "{genre}",
        genreName
    );

    const recipientDisplayName = getRecipientDisplayName(order.recipientName, order.recipient, locale);

    return (
        <div className="space-y-4 pt-4 mt-2 border-t border-slate-200/80">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 bg-sky-50 rounded-xl border-l-4 border-l-sky-500 border border-sky-200/70 shadow-[0_10px_24px_-20px_rgba(2,132,199,0.6)]">
                <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0"
                >
                    <Sparkles className="w-5 h-5 text-sky-700" />
                </motion.div>
                <div className="flex-1">
                    <p className="text-lg font-bold text-sky-900 flex items-center gap-2">
                        {translations.sectionTitle}
                        <span className="text-base font-normal text-sky-700/80">({upsellCount})</span>
                    </p>
                    <p className="text-sm text-sky-800/80">
                        {translations.sectionDescription}
                    </p>
                </div>
                <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center shadow-lg"
                >
                    <ChevronDown className="w-6 h-6 text-white" strokeWidth={3} />
                </motion.div>
            </div>

            {/* Upsells */}
            <div className="space-y-4">
                {/* Streaming VIP Upsell - most expensive, show first (only for completed orders) */}
                {showStreaming && (
                    <StreamingVipUpsell
                        orderId={order.id}
                        email={email}
                        locale={locale}
                        currency={order.currency}
                        recipientName={recipientDisplayName}
                        genreLabel={genreLabel}
                        genreName={genreName}
                        scrollRef={scrollRef}
                        t={translations.streamingVipUpsell}
                    />
                )}

                {/* Karaoke Upsell */}
                {showKaraoke && (
                    <KaraokeUpsell
                        orderId={order.id}
                        email={email}
                        locale={locale}
                        currency={order.currency}
                        recipientName={recipientDisplayName}
                        genreLabel={genreLabel}
                        t={translations.karaokeUpsell}
                    />
                )}

                {/* Genre Variant Upsell */}
                {canShowGenreVariant && (
                    <GenreVariantUpsell
                        orderId={genreVariantParentId}
                        email={email}
                        currentGenre={order.genre}
                        existingVariants={
                            order.orderType === "GENRE_VARIANT"
                                ? [order.genre].filter((g): g is string => g !== null)
                                : order.childOrders
                                    .filter((child: TrackOrderChild) => child.orderType === "GENRE_VARIANT")
                                    .map((child: TrackOrderChild) => child.genre)
                                    .filter((g: string | null): g is string => g !== null)
                        }
                        locale={locale}
                        currency={order.currency}
                        recipientName={recipientDisplayName}
                        hasLyrics={!!order.lyrics}
                        t={translations.genreVariantUpsell}
                    />
                )}

                {/* Lyrics Upsell (only for completed orders) */}
                {showLyrics && (
                    <LyricsUpsell
                        orderId={order.id}
                        email={email}
                        locale={locale}
                        currency={order.currency}
                        recipientName={recipientDisplayName}
                        genreLabel={genreLabel}
                        t={translations.lyricsUpsell}
                    />
                )}
            </div>
        </div>
    );
}
