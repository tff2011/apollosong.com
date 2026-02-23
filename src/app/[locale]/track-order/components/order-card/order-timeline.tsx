"use client";

import { motion } from "framer-motion";
import { cn } from "~/lib/utils";
import type { OrderStatus } from "../../utils/order-helpers";
import { Check } from "lucide-react";

interface TimelineStep {
    key: string;
    label: string;
    isActive: boolean;
    isCompleted: boolean;
    isUpcoming: boolean;
}

interface OrderTimelineProps {
    status: OrderStatus;
    labels: {
        pendingPayment: string;
        ordered: string;
        processing: string;
        ready: string;
    };
}

export function OrderTimeline({ status, labels }: OrderTimelineProps) {
    const steps: TimelineStep[] = [
        {
            key: "ordered",
            label: status === "PENDING" ? labels.pendingPayment : labels.ordered,
            isActive: status === "PENDING",
            isCompleted: status !== "PENDING",
            isUpcoming: false,
        },
        {
            key: "processing",
            label: labels.processing,
            isActive: status === "PAID" || status === "IN_PROGRESS" || status === "REVISION",
            isCompleted: status === "COMPLETED",
            isUpcoming: status === "PENDING",
        },
        {
            key: "ready",
            label: labels.ready,
            isActive: status === "COMPLETED",
            isCompleted: status === "COMPLETED",
            isUpcoming: status !== "COMPLETED",
        },
    ];

    // Connector fill: how much of each connector is filled
    const getConnectorFill = (index: number) => {
        const current = steps[index]!;
        const next = steps[index + 1];
        if (!next) return 0;
        if (current.isCompleted && next.isCompleted) return 100;
        if (current.isCompleted && next.isActive) return 50;
        if (current.isActive && !current.isCompleted) return 0;
        return 0;
    };

    return (
        <div className="w-full py-6 px-6 sm:px-8">
            {/* Circles row with connectors */}
            <div className="relative grid grid-cols-3">
                {/* Connector lines - positioned between circles */}
                {[0, 1].map((i) => (
                    <div
                        key={`conn-${i}`}
                        className="absolute top-[18px] h-0.5 -translate-y-1/2"
                        style={{
                            left: `${(i * 33.33) + 16.67}%`,
                            right: `${100 - ((i + 1) * 33.33) - 16.67 + 33.33}%`,
                            width: `${33.33 - 2}%`,
                            marginLeft: "1%",
                        }}
                    >
                        <div className="h-full w-full rounded-full bg-charcoal/8" />
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${getConnectorFill(i)}%` }}
                            transition={{ duration: 0.8, delay: i * 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                        />
                    </div>
                ))}

                {/* Steps */}
                {steps.map((step, index) => (
                    <div key={step.key} className="flex flex-col items-center gap-2">
                        {/* Circle */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: index * 0.12, duration: 0.35 }}
                            className={cn(
                                "relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 z-10",
                                step.isCompleted
                                    ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                                    : step.isActive
                                        ? "bg-white border-emerald-500 text-emerald-600 shadow-md shadow-emerald-500/15"
                                        : "bg-white border-charcoal/15 text-charcoal/30"
                            )}
                        >
                            {step.isCompleted ? (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.15 + (index * 0.1), type: "spring", stiffness: 300, damping: 20 }}
                                >
                                    <Check className="w-4.5 h-4.5" strokeWidth={2.5} />
                                </motion.div>
                            ) : step.isActive ? (
                                <div className="relative flex items-center justify-center w-full h-full">
                                    <motion.div
                                        className="absolute inset-0 bg-emerald-100 rounded-full"
                                        animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                    <span className="relative z-10">{index + 1}</span>
                                </div>
                            ) : (
                                <span>{index + 1}</span>
                            )}
                        </motion.div>

                        {/* Label */}
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.25 + (index * 0.1) }}
                            className={cn(
                                "text-[11px] sm:text-xs font-medium text-center leading-snug",
                                step.isCompleted
                                    ? "text-emerald-700"
                                    : step.isActive
                                        ? "text-charcoal"
                                        : "text-charcoal/40"
                            )}
                        >
                            {step.label}
                        </motion.span>
                    </div>
                ))}
            </div>
        </div>
    );
}
