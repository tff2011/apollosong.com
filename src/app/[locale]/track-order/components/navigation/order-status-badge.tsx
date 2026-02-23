"use client";

import { cn } from "~/lib/utils";
import type { OrderStatus } from "../../utils/order-helpers";

interface OrderStatusBadgeProps {
    status: OrderStatus;
    label: string;
    size?: "sm" | "md";
}

const statusColors: Record<OrderStatus, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
    PAID: "bg-emerald-100 text-emerald-800 border-emerald-200",
    IN_PROGRESS: "bg-violet-100 text-violet-800 border-violet-200",
    COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    REVISION: "bg-orange-100 text-orange-800 border-orange-200",
};

const statusIcons: Record<OrderStatus, string> = {
    PENDING: "⏳",
    PAID: "✓",
    IN_PROGRESS: "🎵",
    COMPLETED: "✓",
    REVISION: "🔄",
};

export function OrderStatusBadge({
    status,
    label,
    size = "sm",
}: OrderStatusBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
                statusColors[status],
                size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
            )}
        >
            <span className="text-[10px]">{statusIcons[status]}</span>
            {label}
        </span>
    );
}
