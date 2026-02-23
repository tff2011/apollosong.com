"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { AlertCircle, Pencil, Zap, Music, Guitar, FileText, ChevronDown, User, Mic, Heart, BookOpen, MessageSquare, Check, X, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { GENRE_NAMES } from "~/lib/lyrics-generator";
import type { TrackOrder } from "../../hooks/use-track-order";
import { getGenreDisplayName, getRecipientDisplayName, getRecipientLabel } from "../../utils/order-helpers";

interface OrderActionsProps {
    order: TrackOrder;
    locale: string;
    searchedEmail: string;
    onRefetch?: () => void;
    hideBadges?: boolean;
    hideEditOrder?: boolean;
    translations: {
        pendingPayment: {
            title: string;
            description: string;
            cta: string;
        };
        editOrder: {
            title: string;
            description: string;
            cta: string;
        };
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
    };
}

export function OrderActions({
    order,
    locale,
    searchedEmail,
    onRefetch,
    hideBadges,
    hideEditOrder,
    translations,
}: OrderActionsProps) {
    const [isReviewExpanded, setIsReviewExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showSavedMessage, setShowSavedMessage] = useState(false);

    // Edit form state
    const [editRecipientName, setEditRecipientName] = useState(order.recipientName || "");
    const [editGenre, setEditGenre] = useState(order.genre || "");
    const [editVocals, setEditVocals] = useState<"MALE" | "FEMALE" | "EITHER">(() => {
        const vocals = order.vocals?.toUpperCase();
        if (vocals === "MALE" || vocals === "FEMALE" || vocals === "EITHER") {
            return vocals;
        }
        return "EITHER";
    });
    const [editQualities, setEditQualities] = useState("");
    const [editMemories, setEditMemories] = useState(order.memories || "");
    const [editMessage, setEditMessage] = useState(order.message || "");

    // Normalize qualities string for display (handles legacy JSON-array format)
    const normalizeQualities = (raw: string | null | undefined): string => {
        if (!raw) return "";
        const trimmed = raw.trim();
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.join(", ");
            } catch {
                // Not valid JSON
            }
        }
        return trimmed;
    };
    const qualitiesText = normalizeQualities(order.qualities);

    // Initialize editQualities from normalized qualities
    useEffect(() => {
        if (qualitiesText) {
            setEditQualities(qualitiesText);
        }
    }, []);

    const hasSong = !!order.songFileUrl || !!order.songFileUrl2;
    const canEditOrder =
        (order.orderType === "MAIN" || order.orderType === "GENRE_VARIANT" || order.orderType === "EXTRA_SONG") &&
        (order.status === "PAID" || (order.status === "IN_PROGRESS" && !hasSong));

    // Update mutation
    const updateMutation = api.songOrder.updatePendingOrderInfo.useMutation({
        onSuccess: () => {
            setIsEditing(false);
            setShowSavedMessage(true);
            setTimeout(() => setShowSavedMessage(false), 3000);
            onRefetch?.();
        },
    });

    // Get vocals label
    const getVocalsLabel = (vocals?: string | null) => {
        if (!vocals) return null;
        switch (vocals.toUpperCase()) {
            case "FEMALE": return translations.reviewInfo.vocalsFemale;
            case "MALE": return translations.reviewInfo.vocalsMale;
            case "EITHER": return translations.reviewInfo.vocalsEither;
            default: return vocals;
        }
    };

    const handleSave = () => {
        updateMutation.mutate({
            orderId: order.id,
            email: searchedEmail,
            recipientName: editRecipientName,
            genre: editGenre,
            vocals: editVocals,
            qualities: editQualities.trim(),
            memories: editMemories,
            message: editMessage,
        });
    };

    const handleCancel = () => {
        // Reset to original values
        setEditRecipientName(order.recipientName || "");
        setEditGenre(order.genre || "");
        const vocals = order.vocals?.toUpperCase();
        setEditVocals(
            vocals === "MALE" || vocals === "FEMALE" || vocals === "EITHER"
                ? vocals
                : "EITHER"
        );
        setEditQualities(qualitiesText);
        setEditMemories(order.memories || "");
        setEditMessage(order.message || "");
        setIsEditing(false);
    };

    // Get available genres
    const genreOptions = Object.entries(GENRE_NAMES).map(([key, names]) => ({
        value: key,
        label: names[locale as keyof typeof names] || names.en || key,
    }));

    return (
        <div className="space-y-3">
            {/* Order Type Badges */}
            {!hideBadges && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {order.orderType === "MAIN" && (
                        <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold"
                        >
                            {translations.labelMainOrder}
                        </motion.span>
                    )}
                    {order.orderType === "GENRE_VARIANT" && (
                        <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 text-violet-800 text-sm font-semibold"
                        >
                            {translations.labelGenreExtra}
                        </motion.span>
                    )}
                    {order.hasFastDelivery && (
                        <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold"
                        >
                            <Zap className="w-4 h-4" />
                            {translations.fastDelivery}
                        </motion.span>
                    )}
                    {order.orderType === "EXTRA_SONG" && (
                        <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-sm font-semibold"
                        >
                            <Music className="w-4 h-4" />
                            {translations.extraSong}
                        </motion.span>
                    )}
                    <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-sm font-semibold"
                    >
                        <Guitar className="w-4 h-4" />
                        {getGenreDisplayName(order.genre, locale)}
                    </motion.span>
                </div>
            )}

            {/* Pending Payment Action */}
            {/* Don't show for EXTRA_SONG bump orders (priceAtOrder = 0) - they're paid via the parent MAIN order */}
            {order.status === "PENDING" && !(order.orderType === "EXTRA_SONG" && order.parentOrderId && order.priceAtOrder === 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
                >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-rose-800">
                                    {translations.pendingPayment.title}
                                </p>
                                <p className="text-sm text-rose-700/80 mt-1">
                                    {translations.pendingPayment.description}
                                </p>
                            </div>
                        </div>
                        <Link
                            href={`/${order.locale || locale}/order/${order.id}`}
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 active:scale-95 transition-all shadow-sm min-h-[44px]"
                        >
                            {translations.pendingPayment.cta}
                        </Link>
                    </div>
                </motion.div>
            )}

            {/* Review Info Section (for PENDING orders, but not for EXTRA_SONG bump orders) */}
            {order.status === "PENDING" && !(order.orderType === "EXTRA_SONG" && order.parentOrderId && order.priceAtOrder === 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden"
                >
                    <button
                        onClick={() => setIsReviewExpanded(!isReviewExpanded)}
                        className="w-full p-4 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4 text-slate-600" />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-slate-800">
                                    {translations.reviewInfo.title}
                                </p>
                                <p className="text-sm text-slate-600 mt-0.5">
                                    {translations.reviewInfo.description}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-600">
                                {isReviewExpanded ? translations.reviewInfo.hide : translations.reviewInfo.cta}
                            </span>
                            <motion.div
                                animate={{ rotate: isReviewExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ChevronDown className="w-5 h-5 text-slate-500" />
                            </motion.div>
                        </div>
                    </button>

                    <AnimatePresence>
                        {isReviewExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3">
                                    {/* Success message */}
                                    {showSavedMessage && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium"
                                        >
                                            <Check className="w-4 h-4" />
                                            {translations.reviewInfo.saved}
                                        </motion.div>
                                    )}

                                    {/* Edit/Save/Cancel buttons */}
                                    <div className="flex justify-end gap-2">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={handleCancel}
                                                    disabled={updateMutation.isPending}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors disabled:opacity-50"
                                                >
                                                    <X className="w-4 h-4" />
                                                    {translations.reviewInfo.cancel}
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={updateMutation.isPending}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                                >
                                                    {updateMutation.isPending ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            {translations.reviewInfo.saving}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="w-4 h-4" />
                                                            {translations.reviewInfo.save}
                                                        </>
                                                    )}
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                            >
                                                <Pencil className="w-4 h-4" />
                                                {translations.reviewInfo.edit}
                                            </button>
                                        )}
                                    </div>

                                    {/* Recipient */}
                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                        <User className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{translations.reviewInfo.recipient}</p>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editRecipientName}
                                                    onChange={(e) => setEditRecipientName(e.target.value)}
                                                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                                />
                                            ) : (
                                                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                                                    {getRecipientDisplayName(order.recipientName, order.recipient, locale)}
                                                    <span className="font-normal text-slate-500"> ({getRecipientLabel(order.recipient, locale)})</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Genre */}
                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                        <Guitar className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{translations.reviewInfo.genre}</p>
                                            {isEditing ? (
                                                <select
                                                    value={editGenre}
                                                    onChange={(e) => setEditGenre(e.target.value)}
                                                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                                                >
                                                    {genreOptions.map((genre) => (
                                                        <option key={genre.value} value={genre.value}>
                                                            {genre.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                                                    {getGenreDisplayName(order.genre, locale)}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Vocals */}
                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                        <Mic className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{translations.reviewInfo.vocals}</p>
                                            {isEditing ? (
                                                <div className="flex flex-wrap gap-2 mt-1.5">
                                                    {(["FEMALE", "MALE", "EITHER"] as const).map((vocal) => (
                                                        <button
                                                            key={vocal}
                                                            onClick={() => setEditVocals(vocal)}
                                                            className={cn(
                                                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                                                editVocals === vocal
                                                                    ? "bg-amber-500 text-white"
                                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                            )}
                                                        >
                                                            {getVocalsLabel(vocal)}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm font-semibold text-slate-800 mt-0.5">{getVocalsLabel(order.vocals)}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Qualities */}
                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                        <Heart className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{translations.reviewInfo.qualities}</p>
                                            {isEditing ? (
                                                <textarea
                                                    value={editQualities}
                                                    onChange={(e) => setEditQualities(e.target.value)}
                                                    placeholder={translations.reviewInfo.qualitiesPlaceholder}
                                                    rows={3}
                                                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                                                />
                                            ) : qualitiesText ? (
                                                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">
                                                    {qualitiesText}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-slate-500 mt-0.5 italic">{translations.reviewInfo.noQualities}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Memories */}
                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                        <BookOpen className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{translations.reviewInfo.memories}</p>
                                            {isEditing ? (
                                                <textarea
                                                    value={editMemories}
                                                    onChange={(e) => setEditMemories(e.target.value)}
                                                    placeholder={translations.reviewInfo.memoriesPlaceholder}
                                                    rows={3}
                                                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                                                />
                                            ) : order.memories ? (
                                                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{order.memories}</p>
                                            ) : (
                                                <p className="text-sm text-slate-500 mt-0.5 italic">{translations.reviewInfo.noMemories}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Message */}
                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                        <MessageSquare className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{translations.reviewInfo.message}</p>
                                            {isEditing ? (
                                                <textarea
                                                    value={editMessage}
                                                    onChange={(e) => setEditMessage(e.target.value)}
                                                    placeholder={translations.reviewInfo.messagePlaceholder}
                                                    rows={3}
                                                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                                                />
                                            ) : order.message ? (
                                                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{order.message}</p>
                                            ) : (
                                                <p className="text-sm text-slate-500 mt-0.5 italic">{translations.reviewInfo.noMessage}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* Edit Order Action */}
            {canEditOrder && !hideEditOrder && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-4 shadow-[0_18px_40px_-24px_rgba(194,101,0,0.75)] ring-1 ring-amber-200/70"
                >
                    <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-300/35 blur-2xl" />
                    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-full border border-amber-300 bg-amber-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <Pencil className="w-4 h-4 text-amber-700" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-[#7C3D1D] text-[15px] leading-tight">
                                    {translations.editOrder.title}
                                </p>
                                <p className="text-sm text-[#4A6FA5] mt-1 leading-snug">
                                    {translations.editOrder.description}
                                </p>
                            </div>
                        </div>
                        <Link
                            href={`/${order.locale || locale}/order/${order.id}/edit?email=${encodeURIComponent(searchedEmail)}`}
                            className="inline-flex w-full sm:w-auto items-center justify-center px-5 py-2.5 rounded-xl bg-[#4A8E9A] text-dark font-semibold hover:bg-[#F0EDE6] active:scale-95 transition-all shadow-[0_10px_20px_-12px_rgba(60,36,21,0.95)] min-h-[44px]"
                        >
                            {translations.editOrder.cta}
                        </Link>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
