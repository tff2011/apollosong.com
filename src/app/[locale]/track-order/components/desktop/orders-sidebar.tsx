"use client";

import { motion } from "framer-motion";
import type { TrackOrder } from "../../hooks/use-track-order";
import type { OrderStatus } from "../../utils/order-helpers";
import { OrderListItem } from "./order-list-item";

interface OrdersSidebarProps {
    orders: TrackOrder[];
    selectedId: string | undefined;
    onSelect: (index: number) => void;
    locale: string;
    translations: {
        title: string;
        selectOrder: string;
        status: Record<OrderStatus, string>;
        ordered: string;
    };
}

export function OrdersSidebar({
    orders,
    selectedId,
    onSelect,
    locale,
    translations,
}: OrdersSidebarProps) {
    return (
        <aside className="max-h-[calc(100vh-280px)] overflow-y-auto border-r border-charcoal/10 pr-4 pt-6 sticky top-4">
            <motion.h2
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg font-serif font-bold text-charcoal mb-4"
            >
                {translations.title}
            </motion.h2>

            {orders.length === 0 ? (
                <p className="text-sm text-charcoal/50">{translations.selectOrder}</p>
            ) : (
                <div className="space-y-2">
                    {orders.map((order, index) => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <OrderListItem
                                order={order}
                                index={index}
                                isSelected={selectedId === order.id}
                                onClick={() => onSelect(index)}
                                locale={locale}
                                translations={{
                                    status: translations.status,
                                    ordered: translations.ordered,
                                }}
                            />
                        </motion.div>
                    ))}
                </div>
            )}
        </aside>
    );
}
