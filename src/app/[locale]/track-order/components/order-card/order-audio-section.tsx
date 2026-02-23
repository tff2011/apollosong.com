"use client";

import { motion } from "framer-motion";
import { Headphones } from "lucide-react";
import { AudioPlayer } from "~/components/audio-player";
import type { TrackOrder } from "../../hooks/use-track-order";
import { getRecipientDisplayName, getGenreDisplayName } from "../../utils/order-helpers";

interface OrderAudioSectionProps {
    order: TrackOrder;
    locale: string;
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
        revisionButton?: string;
        streamingButton?: string;
    };
    defaultOpen?: boolean;
    hideHeader?: boolean;
    hideGenreBadge?: boolean;
    onRequestRevision?: () => void;
    onRequestStreaming?: () => void;
}

export function OrderAudioSection({
    order,
    locale,
    translations,
    hideHeader,
    hideGenreBadge,
    onRequestRevision,
    onRequestStreaming,
}: OrderAudioSectionProps) {
    // Check if revision is available (callback provided means parent already verified eligibility)
    const canRequestRevision = !!onRequestRevision;
    const canRequestStreaming = !!onRequestStreaming;
    const hasTwoSongs = !!order.songFileUrl && !!order.songFileUrl2;
    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
    const genreLabel = getGenreDisplayName(order.genre, locale);
    const songTitle = translations.orderFor.replace("{name}", recipientName);

    return (
        <div className="space-y-4">
            {/* Header - can be hidden when context is already clear */}
            {!hideHeader && (
                <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/50">
                    <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"
                    >
                        <Headphones className="w-5 h-5 text-emerald-600" />
                    </motion.div>
                    <div>
                        <p className="text-base font-bold text-emerald-700">
                            {hasTwoSongs ? translations.songsReady : translations.songReady}
                        </p>
                        <p className="text-sm text-emerald-600/70">
                            {hasTwoSongs ? translations.chooseFavorite : translations.listenNow}
                        </p>
                    </div>
                </div>
            )}

            {/* Audio Players */}
            <div className="space-y-4">
                {hasTwoSongs ? (
                    <>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-charcoal/70 flex items-center gap-2">
                                {translations.option1}
                                {!hideGenreBadge && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                        {genreLabel}
                                    </span>
                                )}
                            </p>
                            <AudioPlayer
                                src={order.songFileUrl!}
                                title={`${songTitle} - ${translations.option1}`}
                                showDownload={true}
                                variant="compact-light"
                                downloadLabel={translations.downloadButton}
                                showRevisionButton={canRequestRevision}
                                revisionLabel={translations.revisionButton}
                                onRequestRevision={onRequestRevision}
                                showStreamingButton={canRequestStreaming}
                                streamingLabel={translations.streamingButton}
                                onRequestStreaming={onRequestStreaming}
                            />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-charcoal/70 flex items-center gap-2">
                                {translations.option2}
                                {!hideGenreBadge && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                        {genreLabel}
                                    </span>
                                )}
                            </p>
                            <AudioPlayer
                                src={order.songFileUrl2!}
                                title={`${songTitle} - ${translations.option2}`}
                                showDownload={true}
                                variant="compact-light"
                                downloadLabel={translations.downloadButton}
                                showRevisionButton={canRequestRevision}
                                revisionLabel={translations.revisionButton}
                                onRequestRevision={onRequestRevision}
                                showStreamingButton={canRequestStreaming}
                                streamingLabel={translations.streamingButton}
                                onRequestStreaming={onRequestStreaming}
                            />
                        </div>
                    </>
                ) : (
                    <AudioPlayer
                        src={order.songFileUrl || order.songFileUrl2 || ""}
                        title={songTitle}
                        showDownload={true}
                        variant="compact-light"
                        downloadLabel={translations.downloadButton}
                        showRevisionButton={canRequestRevision}
                        revisionLabel={translations.revisionButton}
                        onRequestRevision={onRequestRevision}
                        showStreamingButton={canRequestStreaming}
                        streamingLabel={translations.streamingButton}
                        onRequestStreaming={onRequestStreaming}
                    />
                )}
            </div>
        </div>
    );
}
