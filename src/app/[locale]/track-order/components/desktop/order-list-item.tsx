"use client";

import { motion } from "framer-motion";
import { format } from "date-fns";
import { Calendar, Clock } from "lucide-react";
import { cn } from "~/lib/utils";
import type { TrackOrder } from "../../hooks/use-track-order";
import type { OrderStatus } from "../../utils/order-helpers";
import {
    getRecipientDisplayName,
    getGenreDisplayName,
    formatPrice,
    DATE_LOCALES,
} from "../../utils/order-helpers";
import { OrderStatusBadge } from "../navigation/order-status-badge";

interface OrderListItemProps {
    order: TrackOrder;
    index: number;
    isSelected: boolean;
    onClick: () => void;
    locale: string;
    translations: {
        status: Record<OrderStatus, string>;
        ordered: string;
    };
}

export function OrderListItem({
    order,
    index,
    isSelected,
    onClick,
    locale,
    translations,
}: OrderListItemProps) {
    const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
    const genreLabel = getGenreDisplayName(order.genre, locale);
    const statusLabel = translations.status[order.status as OrderStatus];

    // Format date and time
    const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES];
    const orderDate = new Date(order.createdAt);
    const formattedDate = format(orderDate, "dd MMM yyyy", { locale: dateLocale });
    const formattedTime = format(orderDate, "HH:mm");

    // Format price
    const displayPrice = order.priceAtOrder && order.priceAtOrder > 0
        ? formatPrice(order.priceAtOrder, order.currency)
        : null;

    return (
        <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={cn(
                "w-full text-left p-4 rounded-xl border transition-all",
                isSelected
                    ? "bg-white border-[#4A8E9A] shadow-md"
                    : "bg-white/50 border-charcoal/10 hover:bg-white hover:border-charcoal/20"
            )}
        >
            {/* Header: Number + Name + Selected indicator */}
            <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-charcoal/10 flex items-center justify-center text-xs font-bold text-charcoal/70 flex-shrink-0">
                        {index + 1}
                    </span>
                    <p className="font-semibold text-charcoal truncate">
                        {recipientName}
                    </p>
                </div>
                {isSelected && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-2 h-2 rounded-full bg-[#4A8E9A] flex-shrink-0 mt-1.5"
                    />
                )}
            </div>

            {/* Genre */}
            <p className="text-sm text-charcoal/60 mb-2 truncate">{genreLabel}</p>

            {/* Date, Time, Price */}
            <div className="flex items-center gap-3 text-xs text-charcoal/50 mb-3">
                <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formattedDate}
                </span>
                <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formattedTime}
                </span>
            </div>

            {/* Price + Status */}
            <div className="flex items-center justify-between gap-2">
                <OrderStatusBadge
                    status={order.status as OrderStatus}
                    label={statusLabel}
                    size="sm"
                />
                {displayPrice && (
                    <span className="text-sm font-medium text-charcoal/70">
                        {displayPrice}
                    </span>
                )}
            </div>
        </motion.button>
    );
}
