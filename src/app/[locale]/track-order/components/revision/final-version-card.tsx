"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { getRecipientDisplayName } from "../../utils/order-helpers";
import type { TrackOrder } from "../../hooks/use-track-order";

interface FinalVersionCardProps {
    order: TrackOrder;
    locale: string;
    translations: {
        finalVersionTitle: string;
        finalVersionDescription: string;
    };
}

export function FinalVersionCard({
    order,
    locale,
    translations,
}: FinalVersionCardProps) {
    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 rounded-2xl p-5 border border-emerald-200/60 shadow-sm"
        >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-emerald-900">
                            {translations.finalVersionTitle}
                        </h3>
                        <span className="inline-flex items-center rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            {order.revisionCount}/4
                        </span>
                    </div>
                    <p className="text-sm text-emerald-800/80 mt-2">
                        {translations.finalVersionDescription.replace("{name}", recipientName)}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
