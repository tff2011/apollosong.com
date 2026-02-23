"use client";

import { motion } from "framer-motion";
import { format } from "date-fns";
import {
    CheckCircle2,
    Loader2,
    Clock,
    AlertCircle,
    Pencil,
    Sparkles,
    RotateCcw,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { DATE_LOCALES } from "../../utils/order-helpers";
import type { OrderStatus } from "../../utils/order-helpers";
import { getStatusHeroGradient } from "../../utils/order-helpers";

interface OrderStatusHeroProps {
    locale: string;
    status: OrderStatus;
    statusLabel: string;
    recipientName: string;
    genreLabel: string;
    vocalsLabel?: string;
    orderDate: React.ReactNode;
    orderTime?: string;
    orderPrice?: string;
    orderNumber?: number;
    orderTypeLabel?: string;
    revisionCount?: number;
    revisionCompletedAt?: Date | string | null;
    revisionCompletedLabel?: string;
}

const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
        case "PENDING":
            return AlertCircle;
        case "PAID":
            return Clock;
        case "IN_PROGRESS":
            return Loader2;
        case "COMPLETED":
            return CheckCircle2;
        case "REVISION":
            return Pencil;
        default:
            return Clock;
    }
};

const getStatusAnimation = (status: OrderStatus) => {
    switch (status) {
        case "PENDING":
            return {
                scale: [1, 1.02, 1],
                transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const }
            };
        case "PAID":
            return {
                scale: [1, 1.02, 1],
                transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const }
            };
        case "IN_PROGRESS":
            return {};
        case "COMPLETED":
            return {
                scale: [1, 1.05, 1],
                transition: { duration: 0.5, repeat: 0 }
            };
        case "REVISION":
            return {};
        default:
            return {};
    }
};

export function OrderStatusHero({
    locale,
    status,
    statusLabel,
    recipientName,
    genreLabel,
    vocalsLabel,
    orderDate,
    orderTime,
    orderPrice,
    orderNumber,
    orderTypeLabel,
    revisionCount,
    revisionCompletedAt,
    revisionCompletedLabel,
}: OrderStatusHeroProps) {
    const Icon = getStatusIcon(status);
    const animation = getStatusAnimation(status);
    const isCompleted = status === "COMPLETED";
    const isInProgress = status === "IN_PROGRESS";
    const hasCompletedRevision = isCompleted && !!revisionCount && revisionCount > 0 && !!revisionCompletedAt;
    const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES];
    const revisionCompletedAtLabel = hasCompletedRevision
        ? `${format(new Date(revisionCompletedAt!), "dd/MM/yyyy", { locale: dateLocale })} • ${format(new Date(revisionCompletedAt!), "HH:mm")}`
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden p-6 text-center"
        >
            {/* Order Number Badge */}
            {orderNumber && (
                <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#4A8E9A] text-dark flex items-center justify-center text-sm font-bold shadow-md">
                    {orderNumber}
                </div>
            )}
            {/* Decorative elements for completed status */}
            {isCompleted && (
                <>
                    <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="absolute top-4 left-6"
                    >
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="absolute top-6 right-8"
                    >
                        <Sparkles className="w-4 h-4 text-emerald-300" />
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4, duration: 0.4 }}
                        className="absolute bottom-8 left-10"
                    >
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                    </motion.div>
                </>
            )}

            {/* Order Type Label */}
            {orderTypeLabel && (
                <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2"
                >
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/70 text-xs font-semibold text-charcoal/70 tracking-wide uppercase">
                        {orderTypeLabel}
                    </span>
                </motion.div>
            )}

            {/* Status Badge */}
            <motion.div
                animate={animation}
                className={cn(
                    "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-white font-bold text-lg shadow-lg bg-gradient-to-r",
                    getStatusHeroGradient(status)
                )}
            >
                <Icon className={cn("w-6 h-6", isInProgress && "animate-spin")} />
                <span>{statusLabel}</span>
            </motion.div>

            {/* Revision Completed Badge */}
            {hasCompletedRevision && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-4 flex items-center justify-center gap-2 text-sm text-violet-600"
                >
                    <div className="h-px w-8 bg-violet-300/50" />
                    <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="font-medium">{revisionCompletedLabel || `Revisão #${revisionCount} concluída`}</span>
                        </div>
                        {revisionCompletedAtLabel && (
                            <span className="text-xs text-violet-500">
                                {revisionCompletedAtLabel}
                            </span>
                        )}
                    </div>
                    <div className="h-px w-8 bg-violet-300/50" />
                </motion.div>
            )}

            {/* Song Info */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-5 space-y-1"
            >
                <p className="text-xl font-bold text-charcoal flex items-center justify-center gap-2">
                    <span className="text-2xl">🎵</span>
                    <span>Música para {recipientName}</span>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
                        {genreLabel}
                    </span>
                    {vocalsLabel && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                            <span className="text-slate-400">{locale === "pt" ? "Voz" : locale === "es" ? "Voz" : locale === "fr" ? "Voix" : locale === "it" ? "Voce" : "Voice"}</span>
                            {vocalsLabel}
                        </span>
                    )}
                    <span className="text-xs text-charcoal/50">•</span>
                    <span className="text-xs text-charcoal/50">
                        {orderDate}
                        {orderTime && (
                            <>
                                {" "}
                                <span className="text-charcoal/40">
                                    {locale === "pt" ? "às" : locale === "es" ? "a las" : locale === "fr" ? "à" : locale === "it" ? "alle" : "at"}
                                </span>
                                {" "}<span className="font-semibold text-charcoal/50">{orderTime}</span>
                            </>
                        )}
                    </span>
                    {orderPrice && (
                        <>
                            <span className="text-xs text-charcoal/50">•</span>
                            <span className="text-xs font-semibold text-charcoal">{orderPrice}</span>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
