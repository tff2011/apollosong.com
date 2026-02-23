"use client";

import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { getRecipientDisplayName, getGenreDisplayName } from "../../utils/order-helpers";
import type { TrackOrder } from "../../hooks/use-track-order";

interface RevisionRequestCardProps {
    order: TrackOrder;
    locale: string;
    onRequestRevision: () => void;
    translations: {
        button: string;
        cardTitle: string;
        cardSubtitle: string;
        cardDescription: string;
    };
}

export function RevisionRequestCard({
    order,
    locale,
    onRequestRevision,
    translations,
}: RevisionRequestCardProps) {
    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
    const genreLabel = getGenreDisplayName(order.genre, locale);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-pink-50 via-rose-50 to-pink-50 rounded-2xl p-5 border border-pink-200/60 shadow-sm"
        >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center flex-shrink-0 shadow-inner"
                >
                    <Pencil className="w-6 h-6 text-pink-600" />
                </motion.div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-pink-900">
                        {translations.cardTitle.replace("{name}", recipientName)}
                    </h3>
                    <div className="mt-1 inline-flex items-center rounded-full bg-pink-100/70 px-3 py-1 text-sm font-semibold text-pink-800">
                        {translations.cardSubtitle.replace("{genre}", genreLabel)}
                    </div>
                    <p className="text-sm text-pink-800/80 mt-2">
                        {translations.cardDescription}
                    </p>
                </div>
            </div>
            <div className="mt-4 flex justify-end">
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onRequestRevision}
                    className="px-5 py-3 rounded-xl text-base font-bold bg-pink-600 text-white hover:bg-pink-700 active:scale-95 transition-all shadow-md min-h-[44px]"
                >
                    {translations.button}
                </motion.button>
            </div>
        </motion.div>
    );
}
