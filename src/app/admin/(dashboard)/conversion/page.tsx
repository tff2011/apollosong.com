"use client";

import { api } from "~/trpc/react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Loader2 } from "lucide-react";
import {
    FunnelChart,
    Funnel,
    LabelList,
    Cell,
    ResponsiveContainer,
    Tooltip,
} from "recharts";

const FUNNEL_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e"];

export default function ConversionPage() {
    const { data: conversion, isLoading } = api.admin.getConversion.useQuery();

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!conversion) return <div>Failed to load conversion data</div>;

    const funnelData = [
        {
            name: "Started Quiz",
            value: conversion.totalInteractions,
            fill: FUNNEL_COLORS[0],
        },
        {
            name: "Completed Quiz",
            value: conversion.quizCompleted,
            fill: FUNNEL_COLORS[1],
        },
        {
            name: "Purchased",
            value: conversion.paid,
            fill: FUNNEL_COLORS[2],
        },
    ];

    // Calculate conversion rates for each step
    const quizCompletionRate = conversion.totalInteractions > 0
        ? (conversion.quizCompleted / conversion.totalInteractions) * 100
        : 0;
    const purchaseRate = conversion.quizCompleted > 0
        ? (conversion.paid / conversion.quizCompleted) * 100
        : 0;

    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold tracking-tight">Conversion Funnel</h2>

            {/* Visual Funnel Chart */}
            <Card>
                <CardContent className="pt-6">
                    <div className="h-[300px] sm:h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <FunnelChart>
                                <Tooltip
                                    formatter={(value) => [
                                        `${value} users`,
                                    ]}
                                    contentStyle={{
                                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "8px",
                                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                    }}
                                />
                                <Funnel
                                    dataKey="value"
                                    data={funnelData}
                                    isAnimationActive
                                    animationDuration={800}
                                >
                                    <LabelList
                                        position="right"
                                        fill="#374151"
                                        stroke="none"
                                        dataKey="name"
                                        fontSize={14}
                                        fontWeight={600}
                                    />
                                    <LabelList
                                        position="center"
                                        fill="#fff"
                                        stroke="none"
                                        dataKey="value"
                                        fontSize={24}
                                        fontWeight={700}
                                    />
                                    {funnelData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Funnel>
                            </FunnelChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Conversion Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                    title="Quiz Completion"
                    subtitle="Started → Completed"
                    rate={quizCompletionRate}
                    from={conversion.totalInteractions}
                    to={conversion.quizCompleted}
                    color="purple"
                />
                <MetricCard
                    title="Purchase Rate"
                    subtitle="Completed → Purchased"
                    rate={purchaseRate}
                    from={conversion.quizCompleted}
                    to={conversion.paid}
                    color="green"
                />
                <MetricCard
                    title="Overall Conversion"
                    subtitle="Started → Purchased"
                    rate={conversion.conversionRate}
                    from={conversion.totalInteractions}
                    to={conversion.paid}
                    color="blue"
                    highlight
                />
            </div>

            {/* Step-by-Step Breakdown */}
            <div className="grid gap-4 md:grid-cols-3">
                <StepCard
                    step={1}
                    title="Started Quiz"
                    value={conversion.totalInteractions}
                    description="Users who began the quiz"
                    color="bg-blue-500"
                />
                <StepCard
                    step={2}
                    title="Completed Quiz"
                    value={conversion.quizCompleted}
                    description="Users who finished all questions"
                    color="bg-purple-500"
                    dropoff={conversion.totalInteractions - conversion.quizCompleted}
                    dropoffPercent={conversion.totalInteractions > 0
                        ? ((conversion.totalInteractions - conversion.quizCompleted) / conversion.totalInteractions) * 100
                        : 0
                    }
                />
                <StepCard
                    step={3}
                    title="Purchased"
                    value={conversion.paid}
                    description="Users who completed payment"
                    color="bg-green-500"
                    dropoff={conversion.quizCompleted - conversion.paid}
                    dropoffPercent={conversion.quizCompleted > 0
                        ? ((conversion.quizCompleted - conversion.paid) / conversion.quizCompleted) * 100
                        : 0
                    }
                />
            </div>
        </div>
    );
}

function MetricCard({
    title,
    subtitle,
    rate,
    from,
    to,
    color,
    highlight,
}: {
    title: string;
    subtitle: string;
    rate: number;
    from: number;
    to: number;
    color: "purple" | "green" | "blue";
    highlight?: boolean;
}) {
    const colorClasses = {
        purple: "text-purple-600",
        green: "text-green-600",
        blue: "text-blue-600",
    };

    return (
        <Card className={highlight ? "border-2 border-green-200 bg-green-50/50" : ""}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">{title}</CardTitle>
                <CardDescription>{subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className={`text-4xl font-bold ${colorClasses[color]}`}>
                    {rate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    {from} → {to}
                </p>
            </CardContent>
        </Card>
    );
}

function StepCard({
    step,
    title,
    value,
    description,
    color,
    dropoff,
    dropoffPercent,
}: {
    step: number;
    title: string;
    value: number;
    description: string;
    color: string;
    dropoff?: number;
    dropoffPercent?: number;
}) {
    return (
        <div className={`p-5 rounded-xl text-white shadow-lg ${color}`}>
            <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-sm font-bold">
                    {step}
                </span>
                <h3 className="font-semibold">{title}</h3>
            </div>
            <div className="text-4xl font-bold">{value}</div>
            <p className="text-sm opacity-80 mt-1">{description}</p>
            {dropoff !== undefined && dropoffPercent !== undefined && dropoff > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20 text-sm">
                    <span className="opacity-75">Dropoff: </span>
                    <span className="font-semibold">{dropoff} users ({dropoffPercent.toFixed(1)}%)</span>
                </div>
            )}
        </div>
    );
}
