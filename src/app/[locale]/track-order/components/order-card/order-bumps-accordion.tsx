"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Gift,
    FileText,
    Headphones,
    Clock,
    Download,
    Copy,
    Check,
    MessageCircle,
    ExternalLink,
    Share2,
    CheckCircle2,
    ChevronDown,
    Pencil,
    Mic2,
    Loader2,
    AlertCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AudioPlayer } from "~/components/audio-player";
import type { TrackOrder, TrackOrderChild } from "../../hooks/use-track-order";
import { getRecipientDisplayName, getGenreDisplayName } from "../../utils/order-helpers";
import { LyricsPdfButton } from "./lyrics-pdf-button";

interface OrderBumpsAccordionProps {
    order: TrackOrder;
    parentOrder?: TrackOrder | null;
    email: string;
    locale: string;
    translations: {
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
        option1: string;
        option2: string;
        status: Record<string, string>;
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
}

export function OrderBumpsAccordion({
    order,
    parentOrder,
    email,
    locale,
    translations,
}: OrderBumpsAccordionProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [songName, setSongName] = useState(order.lyricsPdfSongName ?? "");
    const [songNameFeedback, setSongNameFeedback] = useState<"saved" | "error" | null>(null);

    useEffect(() => {
        setSongName(order.lyricsPdfSongName ?? "");
    }, [order.lyricsPdfSongName]);

    const utils = api.useUtils();
    const updateSongName = api.songOrder.updateLyricsPdfSongName.useMutation({
        onSuccess: () => {
            setSongNameFeedback("saved");
            void utils.songOrder.getByEmail.invalidate();
            setTimeout(() => setSongNameFeedback(null), 3000);
        },
        onError: () => {
            setSongNameFeedback("error");
            setTimeout(() => setSongNameFeedback(null), 3000);
        },
    });

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Certificate logic
    // Always prioritize the current order when certificate was purchased on it.
    // Fallback to parent only when the current order did not purchase certificate.
    const canInheritCertificateFromParent =
        (order.orderType === "GENRE_VARIANT" || order.orderType === "EXTRA_SONG") &&
        !order.hasCertificate &&
        parentOrder?.hasCertificate &&
        parentOrder?.certificateToken;

    const certificateSource = order.hasCertificate
        ? order
        : canInheritCertificateFromParent
            ? parentOrder
            : null;

    const hasCertificate = !!certificateSource?.hasCertificate;
    const certificateToken = certificateSource?.certificateToken;
    const certificateLocale = locale;
    const certificateHasTwoSongs = !!certificateSource?.songFileUrl && !!certificateSource?.songFileUrl2;
    const isCertificateReady = order.status === "COMPLETED" && !!certificateToken;

    // Lyrics logic - only count as purchased if not PENDING
    const hasLyricsUpsell = order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics && child.status !== "PENDING"
    );
    const hasOwnLyricsContent = !!(order.lyrics || order.correctedLyrics);
    const lyricsSource = order.hasLyrics || hasLyricsUpsell
        ? order
        : (order.orderType === "GENRE_VARIANT" || order.orderType === "EXTRA_SONG") && parentOrder?.hasLyrics
            ? parentOrder
            : null;
    const hasLyrics = !!lyricsSource?.hasLyrics || !!hasLyricsUpsell;
    // Use own order ID for PDF when this order has its own lyrics content
    const lyricsOrderId = hasOwnLyricsContent ? order.id : (lyricsSource?.id || order.id);
    const isLyricsReady = order.status === "COMPLETED" && !!(order.lyrics || order.correctedLyrics) && hasLyrics;

    // Streaming logic
    const streamingUpsellOrder = order.childOrders?.find(
        (child: TrackOrderChild) => child.orderType === "STREAMING_UPSELL"
    );
    const hasStreamingUpsell = !!streamingUpsellOrder && streamingUpsellOrder.status !== "PENDING";
    const streamingStatusLabel = streamingUpsellOrder && streamingUpsellOrder.status !== "PENDING"
        ? translations.status[streamingUpsellOrder.status] || streamingUpsellOrder.status
        : "";

    // Karaoke logic
    const karaokeUpsellOrder = order.childOrders?.find(
        (child: TrackOrderChild) => child.orderType === "KARAOKE_UPSELL" && child.status !== "PENDING"
    );
    const hasKaraokeUpsell = order.hasKaraokePlayback || order.childOrders?.some(
        (child: TrackOrderChild) => child.orderType === "KARAOKE_UPSELL" && child.status !== "PENDING"
    );
    const isKaraokeUrlForOrder = (url: string | null | undefined): url is string => {
        if (!url) return false;
        // Ignore accidental Suno song URLs on karaoke child rows.
        return url.includes(`/karaoke/${order.id}/`) || url.includes("/karaoke/");
    };

    // Build canonical karaoke options (parent + child), deduping equal URLs.
    const karaokeOptions = Array.from(
        new Set(
            [
                order.karaokeFileUrl,
                karaokeUpsellOrder?.songFileUrl,
                karaokeUpsellOrder?.songFileUrl2,
            ].filter(isKaraokeUrlForOrder)
        )
    );
    const karaokeOption1Url = karaokeOptions[0] ?? null;
    const karaokeOption2Url = karaokeOptions[1] ?? null;
    const isKaraokeReady = hasKaraokeUpsell && karaokeOptions.length > 0 && (
        order.karaokeStatus === "completed" || karaokeUpsellOrder?.status === "COMPLETED"
    );
    const isKaraokeProcessing = hasKaraokeUpsell && !isKaraokeReady && (
        order.karaokeStatus === "pending" ||
        order.karaokeStatus === "processing" ||
        karaokeUpsellOrder?.status === "PAID" ||
        karaokeUpsellOrder?.status === "IN_PROGRESS"
    );
    const isKaraokeFailed = hasKaraokeUpsell && !isKaraokeReady && order.karaokeStatus === "failed";

    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
    const genreLabel = getGenreDisplayName(order.genre, locale);
    const bumpsCount = [hasCertificate, hasLyrics, hasStreamingUpsell, hasKaraokeUpsell].filter(Boolean).length;

    if (bumpsCount === 0) return null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 rounded-xl border-l-4 border-l-emerald-500 border border-emerald-200/50">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                    <p className="text-lg font-bold text-emerald-700 flex items-center gap-2">
                        {translations.title}
                        <span className="text-base font-normal text-emerald-600/80">({bumpsCount})</span>
                    </p>
                </div>
                <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg"
                >
                    <ChevronDown className="w-6 h-6 text-white" strokeWidth={3} />
                </motion.div>
            </div>

            {/* Content */}
            <div className="space-y-4">
                        {/* Certificate */}
                        {hasCertificate && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                    "rounded-2xl p-4 border shadow-sm",
                                    isCertificateReady
                                        ? "bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border-amber-200/60"
                                        : "bg-slate-50 border-slate-200"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                        isCertificateReady
                                            ? "bg-gradient-to-br from-amber-100 to-orange-100"
                                            : "bg-slate-200"
                                    )}>
                                        <Gift className={cn(
                                            "w-5 h-5",
                                            isCertificateReady ? "text-amber-600" : "text-slate-400"
                                        )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={cn(
                                            "font-bold",
                                            isCertificateReady ? "text-amber-900" : "text-slate-700"
                                        )}>
                                            {translations.certificate}
                                        </h4>
                                        {isCertificateReady ? (
                                            <p className="text-sm text-amber-800/80 mt-1">
                                                {translations.certificateDesc.replace("{name}", recipientName)}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {translations.pendingDesc}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {isCertificateReady && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {certificateHasTwoSongs ? (
                                            <div className="w-full space-y-2">
                                                <p className="text-xs text-amber-700 font-medium">{translations.chooseOption}</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[1, 2].map((num) => (
                                                        <div key={num} className="flex flex-col gap-2 p-2 bg-amber-50/50 rounded-xl border border-amber-200/50">
                                                            <span className="text-xs font-bold text-amber-800">
                                                                {num === 1 ? translations.option1 : translations.option2}
                                                            </span>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => handleCopy(
                                                                        `${window.location.origin}/${certificateLocale}/certificate/${certificateToken}?song=${num}`,
                                                                        `${order.id}-${num}`
                                                                    )}
                                                                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 active:scale-95 transition-all"
                                                                >
                                                                    {copiedId === `${order.id}-${num}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                                </button>
                                                                <a
                                                                    href={`https://wa.me/?text=${encodeURIComponent(
                                                                        translations.whatsAppMessage.replace("{name}", recipientName) +
                                                                        " " +
                                                                        `${window.location.origin}/${certificateLocale}/certificate/${certificateToken}?song=${num}`
                                                                    )}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg text-xs font-bold bg-green-500 hover:bg-green-600 text-white active:scale-95 transition-all"
                                                                >
                                                                    <MessageCircle className="w-3 h-3" />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleCopy(
                                                        `${window.location.origin}/${certificateLocale}/certificate/${certificateToken}`,
                                                        order.id
                                                    )}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 active:scale-95 transition-all"
                                                >
                                                    {copiedId === order.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                    {copiedId === order.id ? translations.copiedLink : translations.copyLink}
                                                </button>
                                                <a
                                                    href={`https://wa.me/?text=${encodeURIComponent(
                                                        translations.whatsAppMessage.replace("{name}", recipientName) +
                                                        " " +
                                                        `${window.location.origin}/${certificateLocale}/certificate/${certificateToken}`
                                                    )}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-green-500 hover:bg-green-600 text-white active:scale-95 transition-all"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    {translations.shareWhatsApp}
                                                </a>
                                                <a
                                                    href={`/${certificateLocale}/certificate/${certificateToken}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white active:scale-95 transition-all"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    {translations.openCertificate}
                                                </a>
                                            </>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Lyrics */}
                        {hasLyrics && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className={cn(
                                    "rounded-2xl p-4 border shadow-sm",
                                    isLyricsReady
                                        ? "bg-gradient-to-br from-purple-50 via-indigo-50 to-violet-50 border-purple-200/60"
                                        : "bg-slate-50 border-slate-200"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                        isLyricsReady
                                            ? "bg-gradient-to-br from-purple-100 to-indigo-100"
                                            : "bg-slate-200"
                                    )}>
                                        <FileText className={cn(
                                            "w-5 h-5",
                                            isLyricsReady ? "text-purple-600" : "text-slate-400"
                                        )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={cn(
                                            "font-bold",
                                            isLyricsReady ? "text-purple-900" : "text-slate-700"
                                        )}>
                                            {translations.lyrics}
                                        </h4>
                                        {isLyricsReady ? (
                                            <p className="text-sm text-purple-800/80 mt-1">
                                                {translations.lyricsDesc
                                                    .replace("{name}", recipientName)
                                                    .replace("{genre}", genreLabel)}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {translations.pendingDesc}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {isLyricsReady && (
                                    <div className="mt-4 space-y-3">
                                        <div>
                                            <label className="text-xs font-semibold text-purple-700 flex items-center gap-1 mb-1">
                                                <Pencil className="w-3 h-3" />
                                                {translations.songNameLabel}
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={songName}
                                                    onChange={(e) => setSongName(e.target.value)}
                                                    placeholder={translations.songNamePlaceholder}
                                                    maxLength={100}
                                                    className="flex-1 px-3 py-1.5 rounded-lg border border-purple-200 bg-porcelain text-sm text-purple-900 placeholder:text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                                                />
                                                <button
                                                    onClick={() => updateSongName.mutate({ orderId: order.id, email, songName })}
                                                    disabled={updateSongName.isPending}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 active:scale-95 transition-all"
                                                >
                                                    {updateSongName.isPending ? translations.songNameSaving : translations.songNameSave}
                                                </button>
                                            </div>
                                            {songNameFeedback === "saved" && (
                                                <p className="text-xs text-emerald-600 mt-1">{translations.songNameSaved}</p>
                                            )}
                                            {songNameFeedback === "error" && (
                                                <p className="text-xs text-red-600 mt-1">{translations.songNameError}</p>
                                            )}
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <LyricsPdfButton orderId={lyricsOrderId} size="A4" locale={locale} />
                                            <LyricsPdfButton orderId={lyricsOrderId} size="A3" locale={locale} />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Streaming VIP */}
                        {hasStreamingUpsell && streamingUpsellOrder && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className={cn(
                                    "rounded-2xl p-4 border shadow-sm",
                                    streamingUpsellOrder.status === "COMPLETED"
                                        ? "bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 border-sky-200/60"
                                        : "bg-slate-50 border-slate-200"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                        streamingUpsellOrder.status === "COMPLETED"
                                            ? "bg-gradient-to-br from-sky-100 to-blue-100"
                                            : "bg-slate-200"
                                    )}>
                                        <Headphones className={cn(
                                            "w-5 h-5",
                                            streamingUpsellOrder.status === "COMPLETED"
                                                ? "text-sky-600"
                                                : "text-slate-400"
                                        )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={cn(
                                            "font-bold",
                                            streamingUpsellOrder.status === "COMPLETED" ? "text-sky-900" : "text-slate-700"
                                        )}>
                                            {translations.streamingVip}
                                        </h4>
                                        <div className={cn(
                                            "flex items-center gap-2 mt-0.5 text-xs font-bold uppercase tracking-wider",
                                            streamingUpsellOrder.status === "COMPLETED" ? "text-sky-700/70" : "text-slate-500/70"
                                        )}>
                                            <span className="truncate">{recipientName}</span>
                                            <span className={cn(
                                                "w-1 h-1 rounded-full",
                                                streamingUpsellOrder.status === "COMPLETED" ? "bg-sky-700/30" : "bg-slate-400/30"
                                            )} />
                                            <span className="truncate">{genreLabel}</span>
                                        </div>
                                        <p className={cn(
                                            "text-sm mt-1",
                                            streamingUpsellOrder.status === "COMPLETED" ? "text-sky-800/80" : "text-slate-500"
                                        )}>
                                            {translations.streamingVipDesc.replace("{status}", streamingStatusLabel)}
                                        </p>
                                    </div>
                                </div>
                                {streamingUpsellOrder.spotifyUrl && (
                                    <div className="mt-4 flex flex-col sm:flex-row items-center gap-3 p-3 bg-white/60 rounded-xl border border-sky-200/50">
                                        {streamingUpsellOrder.streamingCoverUrl && (
                                            <div className="flex-shrink-0">
                                                <img
                                                    src={streamingUpsellOrder.streamingCoverUrl}
                                                    alt={streamingUpsellOrder.streamingSongName || "Album cover"}
                                                    className="w-16 h-16 rounded-lg object-cover shadow-sm"
                                                />
                                            </div>
                                        )}
                                        <div className="flex-1 flex flex-col items-center sm:items-start gap-2 text-center sm:text-left">
                                            {streamingUpsellOrder.streamingSongName && (
                                                <h5 className="text-sm font-bold text-sky-900">
                                                    {streamingUpsellOrder.streamingSongName}
                                                </h5>
                                            )}
                                            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                                                <a
                                                    href={streamingUpsellOrder.spotifyUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#1DB954] hover:bg-[#1ed760] text-white active:scale-95 transition-all"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    {translations.streamingVipListenFallback}
                                                </a>
                                                <button
                                                    onClick={async () => {
                                                        const shareData = {
                                                            title: streamingUpsellOrder.streamingSongName || "Song",
                                                            url: streamingUpsellOrder.spotifyUrl!,
                                                        };
                                                        if (navigator.share) {
                                                            try {
                                                                await navigator.share(shareData);
                                                            } catch {
                                                                // User cancelled
                                                            }
                                                        } else {
                                                            await navigator.clipboard.writeText(streamingUpsellOrder.spotifyUrl!);
                                                            alert(translations.streamingShareSuccess);
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-sky-100 hover:bg-sky-200 text-sky-700 active:scale-95 transition-all"
                                                >
                                                    <Share2 className="w-3.5 h-3.5" />
                                                    {translations.streamingShare}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Karaoke */}
                        {hasKaraokeUpsell && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className={cn(
                                    "rounded-2xl p-4 border shadow-sm",
                                    isKaraokeReady
                                        ? "bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 border-violet-200/60"
                                        : isKaraokeFailed
                                        ? "bg-red-50 border-red-200"
                                        : "bg-slate-50 border-slate-200"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                        isKaraokeReady
                                            ? "bg-gradient-to-br from-violet-100 to-purple-100"
                                            : isKaraokeFailed
                                            ? "bg-red-100"
                                            : "bg-slate-200"
                                    )}>
                                        <Mic2 className={cn(
                                            "w-5 h-5",
                                            isKaraokeReady ? "text-violet-600"
                                            : isKaraokeFailed ? "text-red-500"
                                            : "text-slate-400"
                                        )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={cn(
                                            "font-bold",
                                            isKaraokeReady ? "text-violet-900"
                                            : isKaraokeFailed ? "text-red-700"
                                            : "text-slate-700"
                                        )}>
                                            {translations.karaoke}
                                        </h4>
                                        {isKaraokeProcessing && (
                                            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                {translations.karaokeProcessing}
                                            </p>
                                        )}
                                        {isKaraokeReady && (
                                            <p className="text-sm text-violet-800/80 mt-1">
                                                {translations.karaokeReady}
                                            </p>
                                        )}
                                        {isKaraokeFailed && (
                                            <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                WhatsApp: +55 61 99579-0193
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {isKaraokeReady && karaokeOption1Url && (
                                    <div className="mt-4 space-y-4">
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-charcoal/70 flex items-center gap-2">
                                                {translations.option1}
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                                    {genreLabel}
                                                </span>
                                            </p>
                                            <AudioPlayer
                                                src={karaokeOption1Url}
                                                title={`${translations.karaoke} - ${recipientName} - ${genreLabel} - ${translations.option1}`}
                                                showDownload={true}
                                                variant="compact-light"
                                                downloadLabel={translations.downloadKaraoke}
                                            />
                                        </div>
                                        {karaokeOption2Url && (
                                            <div className="space-y-2">
                                                <p className="text-sm font-medium text-charcoal/70 flex items-center gap-2">
                                                    {translations.option2}
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                                        {genreLabel}
                                                    </span>
                                                </p>
                                                <AudioPlayer
                                                    src={karaokeOption2Url}
                                                    title={`${translations.karaoke} - ${recipientName} - ${genreLabel} - ${translations.option2}`}
                                                    showDownload={true}
                                                    variant="compact-light"
                                                    downloadLabel={translations.downloadKaraoke}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </div>
                </div>
    );
}
