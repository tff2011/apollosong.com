"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type RowSelectionState,
} from "@tanstack/react-table";
import { Loader2, ChevronDown, AlertCircle, Music, CheckCircle2, Copy, Mail, MessageCircle, ShoppingCart, RefreshCw, Radio, CloudUpload, Trophy, Clock, CalendarDays, TrendingUp, Users } from "lucide-react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";

import { api } from "~/trpc/react";
import { columns, type Lead, DISTROKID_SUCCESS_MODAL_EVENT, type DistroKidSuccessModalDetail } from "./columns";
import { LeadDetailsDialog } from "./details-dialog";
import { FilterToolbar } from "./filter-toolbar";
import { BulkActionsBar } from "./bulk-actions-bar";
import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { DataTablePagination } from "~/components/ui/data-table-pagination";
import { TableSkeleton } from "~/components/ui/table-skeleton";

const REVIEWER_ALIAS_KEY_MAP: Record<string, string> = {
    thiago: "thiago felizola",
};

const REVIEWER_ALIAS_DISPLAY_NAME_MAP: Record<string, string> = {
    "thiago felizola": "Thiago Felizola",
};

function normalizeReviewerRankingKey(name: string): string {
    const normalized = (name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
    return REVIEWER_ALIAS_KEY_MAP[normalized] ?? normalized;
}

function hasNameDiacritics(name: string): boolean {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") !== name;
}

function pickPreferredReviewerRankingName(
    reviewerKey: string,
    currentName: string | undefined,
    candidateName: string
): string {
    const canonicalName = REVIEWER_ALIAS_DISPLAY_NAME_MAP[reviewerKey];
    if (canonicalName) return canonicalName;
    if (!currentName) return candidateName;

    const currentHasDiacritics = hasNameDiacritics(currentName);
    const candidateHasDiacritics = hasNameDiacritics(candidateName);

    if (candidateHasDiacritics && !currentHasDiacritics) {
        return candidateName;
    }

    if (candidateHasDiacritics === currentHasDiacritics && candidateName.length > currentName.length) {
        return candidateName;
    }

    return currentName;
}

// Locale Revenue Bar Component
function LocaleRevenueBar() {
    const { data: stats, isLoading } = api.admin.getStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000, // 5 minutes - aggregated stats don't change frequently
    });
    const [period, setPeriod] = useState<"today" | "yesterday" | "7days" | "month">("today");

    if (isLoading || !stats) return null;

    const periodOptions = [
        { key: "today", label: "Today", activeColor: "bg-green-500" },
        { key: "yesterday", label: "Yesterday", activeColor: "bg-slate-500" },
        { key: "7days", label: "7 Days", activeColor: "bg-blue-500" },
        { key: "month", label: "This Month", activeColor: "bg-purple-500" },
    ] as const;

    const getLocaleData = () => {
        switch (period) {
            case "today":
                return [
                    { key: "en", emoji: "🇺🇸", label: "EN", value: stats.netTodayEN ?? 0, color: "blue" },
                    { key: "pt", emoji: "🇧🇷", label: "PT", value: stats.netTodayPT ?? 0, color: "green" },
                    { key: "es", emoji: "🇪🇸", label: "ES", value: stats.netTodayES ?? 0, color: "amber" },
                    { key: "fr", emoji: "🇫🇷", label: "FR", value: stats.netTodayFR ?? 0, color: "purple" },
                    { key: "it", emoji: "🇮🇹", label: "IT", value: stats.netTodayIT ?? 0, color: "red" },
                ];
            case "yesterday":
                return [
                    { key: "en", emoji: "🇺🇸", label: "EN", value: stats.netYesterdayEN ?? 0, color: "blue" },
                    { key: "pt", emoji: "🇧🇷", label: "PT", value: stats.netYesterdayPT ?? 0, color: "green" },
                    { key: "es", emoji: "🇪🇸", label: "ES", value: stats.netYesterdayES ?? 0, color: "amber" },
                    { key: "fr", emoji: "🇫🇷", label: "FR", value: stats.netYesterdayFR ?? 0, color: "purple" },
                    { key: "it", emoji: "🇮🇹", label: "IT", value: stats.netYesterdayIT ?? 0, color: "red" },
                ];
            case "7days":
                return [
                    { key: "en", emoji: "🇺🇸", label: "EN", value: stats.net7DaysEN ?? 0, color: "blue" },
                    { key: "pt", emoji: "🇧🇷", label: "PT", value: stats.net7DaysPT ?? 0, color: "green" },
                    { key: "es", emoji: "🇪🇸", label: "ES", value: stats.net7DaysES ?? 0, color: "amber" },
                    { key: "fr", emoji: "🇫🇷", label: "FR", value: stats.net7DaysFR ?? 0, color: "purple" },
                    { key: "it", emoji: "🇮🇹", label: "IT", value: stats.net7DaysIT ?? 0, color: "red" },
                ];
            case "month":
                return [
                    { key: "en", emoji: "🇺🇸", label: "EN", value: stats.netThisMonthEN ?? 0, color: "blue" },
                    { key: "pt", emoji: "🇧🇷", label: "PT", value: stats.netThisMonthPT ?? 0, color: "green" },
                    { key: "es", emoji: "🇪🇸", label: "ES", value: stats.netThisMonthES ?? 0, color: "amber" },
                    { key: "fr", emoji: "🇫🇷", label: "FR", value: stats.netThisMonthFR ?? 0, color: "purple" },
                    { key: "it", emoji: "🇮🇹", label: "IT", value: stats.netThisMonthIT ?? 0, color: "red" },
                ];
        }
    };

    const localeData = getLocaleData();

    const colorMap: Record<string, { bg: string; border: string; text: string; textLight: string }> = {
        blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", textLight: "text-blue-600" },
        green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", textLight: "text-green-600" },
        amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", textLight: "text-amber-600" },
        purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", textLight: "text-purple-600" },
        red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", textLight: "text-red-600" },
    };

    return (
        <div className="flex items-center gap-2 flex-wrap mb-4">
            {/* Period Toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {periodOptions.map((opt) => (
                    <button
                        key={opt.key}
                        onClick={() => setPeriod(opt.key)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                            period === opt.key
                                ? `${opt.activeColor} text-white`
                                : "bg-porcelain text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            {/* Locale Cards */}
            {localeData.map((locale) => {
                const c = colorMap[locale.color]!;
                return (
                    <div
                        key={locale.key}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border ${c.bg} ${c.border}`}
                    >
                        <span className={`text-xs ${c.textLight}`}>{locale.emoji} {locale.label}</span>
                        <span className={`text-sm font-semibold ${c.text}`}>${locale.value.toFixed(0)}</span>
                    </div>
                );
            })}
        </div>
    );
}

// Compact Stats Bar Component
function CompactStatsBar({
    activeStatusFilter,
    activeOrderTypeFilter,
    onToggleSpotifyPendingFilter,
    onToggleSpotifyReadyFilter,
    onToggleMusicianTipFilter,
    onToggleSongsPendingFilter,
    canViewFinancials = true,
    showSpotifyDistroBlocks = true
}: {
    activeStatusFilter: string;
    activeOrderTypeFilter: string;
    onToggleSpotifyPendingFilter: () => void;
    onToggleSpotifyReadyFilter: () => void;
    onToggleMusicianTipFilter: () => void;
    onToggleSongsPendingFilter: () => void;
    canViewFinancials?: boolean;
    showSpotifyDistroBlocks?: boolean;
}) {
    const { data: stats, isLoading } = api.admin.getStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000, // 5 minutes - aggregated stats don't change frequently
    });

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="bg-slate-100 animate-pulse h-12 rounded-lg" />
                ))}
            </div>
        );
    }

    if (!stats) return null;

    const statItems = [
        { label: "Today", value: stats.netToday, orders: stats.ordersToday, color: "green" },
        { label: "Yesterday", value: stats.netYesterday, orders: stats.ordersYesterday, color: "slate" },
        { label: "7 Days", value: stats.netLast7Days, orders: stats.ordersLast7Days, color: "blue" },
        { label: "This Month", value: stats.netThisMonth, orders: stats.ordersThisMonth, color: "purple" },
        { label: "Last Month", value: stats.netLastMonth, orders: stats.ordersLastMonth, color: "amber" },
        { label: "Avg. Ticket", value: stats.averageTicket, color: "orange" },
        { label: "Avg. Daily", value: stats.averageDailyNet ?? 0, days: stats.totalDaysActive ?? 0, color: "teal" },
        { label: "Musician Tips", value: stats.musicianTipNet ?? 0, todayValue: stats.musicianTipToday ?? 0, color: "rose", isMusicianTip: true },
        { label: "Streaming VIP", value: stats.streamingVipNet ?? 0, todayValue: stats.streamingVipNetToday ?? 0, allTimeCount: stats.streamingVipCount ?? 0, todayCount: stats.streamingVipCountToday ?? 0, color: "sky" },
        {
            label: "Delivery Plans",
            turboPercent: stats.turboPercent ?? 0,
            expressPercent: stats.expressPercent ?? 0,
            essencialPercent: stats.essencialPercent ?? 0,
            turboCount: stats.turboCount ?? 0,
            expressCount: stats.expressCount ?? 0,
            essencialCount: stats.essencialCount ?? 0,
            value: 0,
            color: "indigo",
        },
        { label: "🇺🇸", value: stats.ordersEN, isCount: true, isLocale: true, color: "blue" },
        { label: "🇧🇷", value: stats.ordersPT, isCount: true, isLocale: true, color: "green" },
        { label: "🇪🇸", value: stats.ordersES, isCount: true, isLocale: true, color: "amber" },
        { label: "🇫🇷", value: stats.ordersFR, isCount: true, isLocale: true, color: "purple" },
        { label: "🇮🇹", value: stats.ordersIT, isCount: true, isLocale: true, color: "red" },
        { label: "Conversion", value: stats.conversionRate, isPercent: true, color: "emerald" },
        { label: "Spotify Pending", value: stats.pendingStreamingVipCount ?? 0, isCount: true, isSpotifyPending: true, color: "sky" },
        { label: "Spotify Ready", value: stats.readyStreamingVipCount ?? 0, isCount: true, isSpotifyReady: true, color: "emerald" },
        { label: "Songs Pending", value: stats.pendingSongGenerationCount ?? 0, isCount: true, isSongPending: true, color: "violet" },
    ];

    const formatValue = (item: typeof statItems[0]) => {
        if (item.isCount) return item.value;
        if (item.isPercent) return `${item.value.toFixed(1)}%`;
        return formatCurrency(item.value);
    };

    const colorMap: Record<string, { bg: string; border: string; icon: string; label: string; value: string }> = {
        green: { bg: "#f0fdf4", border: "#bbf7d0", icon: "#16a34a", label: "#15803d", value: "#166534" },
        blue: { bg: "#eff6ff", border: "#bfdbfe", icon: "#3b82f6", label: "#1d4ed8", value: "#1e40af" },
        purple: { bg: "#faf5ff", border: "#e9d5ff", icon: "#9333ea", label: "#7e22ce", value: "#6b21a8" },
        amber: { bg: "#fffbeb", border: "#fde68a", icon: "#d97706", label: "#b45309", value: "#92400e" },
        orange: { bg: "#fff7ed", border: "#fed7aa", icon: "#ea580c", label: "#c2410c", value: "#9a3412" },
        emerald: { bg: "#ecfdf5", border: "#a7f3d0", icon: "#10b981", label: "#047857", value: "#065f46" },
        red: { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626", label: "#b91c1c", value: "#991b1b" },
        rose: { bg: "#fff1f2", border: "#fecdd3", icon: "#e11d48", label: "#be123c", value: "#9f1239" },
        sky: { bg: "#f0f9ff", border: "#bae6fd", icon: "#0ea5e9", label: "#0369a1", value: "#075985" },
        indigo: { bg: "#eef2ff", border: "#c7d2fe", icon: "#6366f1", label: "#4338ca", value: "#3730a3" },
        violet: { bg: "#f5f3ff", border: "#ddd6fe", icon: "#8b5cf6", label: "#6d28d9", value: "#5b21b6" },
        slate: { bg: "#f8fafc", border: "#e2e8f0", icon: "#64748b", label: "#475569", value: "#334155" },
        teal: { bg: "#f0fdfa", border: "#99f6e4", icon: "#14b8a6", label: "#0d9488", value: "#0f766e" },
    };
    const defaultColor = colorMap.slate!;

    // Inline group badge
    const GroupBadge = ({ label, color }: { label: string; color: string }) => (
        <span
            className="inline-flex sm:self-stretch items-center justify-center px-2 py-1 sm:px-1.5 rounded-md sm:rounded-l text-[10px] uppercase tracking-wider font-bold text-white shrink-0 whitespace-nowrap [writing-mode:horizontal-tb] sm:[writing-mode:vertical-lr] sm:[transform:rotate(180deg)]"
            style={{ backgroundColor: color, lineHeight: 1 }}
        >
            {label}
        </span>
    );

    // Thin vertical separator between groups on the same row
    const Sep = () => <div className="hidden sm:block w-px self-stretch bg-slate-200 mx-0.5 shrink-0" />;

    return (
        <div className="space-y-2.5 mb-4">
            {canViewFinancials && (
                <div className="flex gap-0 items-stretch">
                    <GroupBadge label="Receita" color="#22c55e" />
                    <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7 gap-2 pl-1.5">
                        {statItems.slice(0, 7).map((item) => {
                            const c = colorMap[item.color] ?? defaultColor;
                            const hasDays = "days" in item && item.days !== undefined;
                            return (
                                <div
                                    key={item.label}
                                    className="flex items-center gap-1.5 rounded-md px-3 py-2 min-w-[150px] min-h-[62px]"
                                    style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}
                                >
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase tracking-wide font-medium leading-none mb-0.5" style={{ color: c.label }}>
                                            {item.label}
                                        </p>
                                        <p className="font-bold truncate leading-tight" style={{ fontSize: "20px", color: c.value }}>
                                            {formatValue(item)}
                                        </p>
                                        {item.orders !== undefined && (
                                            <p className="text-[10px] font-medium leading-none" style={{ color: c.label }}>{item.orders} ord</p>
                                        )}
                                        {hasDays && (
                                            <p className="text-[10px] font-medium leading-none" style={{ color: c.label }}>{(item as { days: number }).days}d</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Row 2: Produtos | Pedidos por Pais | Producao */}
            <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-0 sm:items-stretch">
                {canViewFinancials && (
                    <div className="flex min-w-0 items-stretch gap-1.5 sm:gap-0">
                        {/* Produtos */}
                        <GroupBadge label="Produtos" color="#e11d48" />
                        <div className="flex min-w-0 flex-wrap gap-2 items-stretch pl-0 sm:pl-1.5">
                            {/* Musician Tips */}
                            {(() => {
                                const tipItem = statItems.find(i => i.label === "Musician Tips")!;
                                const c = colorMap[tipItem.color] ?? defaultColor;
                                const isActive = activeOrderTypeFilter === "MUSICIAN_TIP";
                                return (
                                    <button
                                        onClick={onToggleMusicianTipFilter}
                                        className={`flex w-full min-w-0 items-center gap-1 rounded-md px-3 py-2 text-left transition-all cursor-pointer sm:w-auto sm:shrink-0 ${
                                            isActive ? "ring-2 ring-rose-500 shadow-sm" : "hover:ring-1 hover:ring-rose-400"
                                        }`}
                                        style={{ backgroundColor: isActive ? "#ffe4e6" : c.bg, borderWidth: 1, borderColor: isActive ? "#f43f5e" : c.border }}
                                    >
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase tracking-wide font-medium leading-none mb-0.5" style={{ color: c.label }}>Tips</p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                {formatCurrency(tipItem.todayValue as number)} <span className="font-normal text-[10px]">today</span>
                                            </p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                {formatCurrency(tipItem.value)} <span className="font-normal text-[10px]">total</span>
                                            </p>
                                        </div>
                                    </button>
                                );
                            })()}
                            {/* Streaming VIP */}
                            {(() => {
                                const vipItem = statItems.find(i => i.label === "Streaming VIP")!;
                                const c = colorMap[vipItem.color] ?? defaultColor;
                                return (
                                    <div className="flex w-full min-w-0 items-center gap-1 rounded-md px-3 py-2 min-h-[52px] sm:w-auto sm:shrink-0" style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase tracking-wide font-medium leading-none mb-0.5" style={{ color: c.label }}>Stream VIP</p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                {formatCurrency(vipItem.todayValue as number)} ({(vipItem as { todayCount: number }).todayCount}) <span className="font-normal text-[10px]">today</span>
                                            </p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                {formatCurrency(vipItem.value)} ({(vipItem as { allTimeCount: number }).allTimeCount}) <span className="font-normal text-[10px]">total</span>
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* Delivery Plans */}
                            {(() => {
                                const planItem = statItems.find(i => i.label === "Delivery Plans")!;
                                const c = colorMap[planItem.color] ?? defaultColor;
                                return (
                                    <div className="flex w-full min-w-0 items-center gap-1 rounded-md px-3 py-2 min-h-[52px] sm:w-auto sm:shrink-0" style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase tracking-wide font-medium leading-none mb-0.5" style={{ color: c.label }}>Delivery</p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                6h: {(planItem as { turboPercent: number }).turboPercent.toFixed(1)}% ({(planItem as { turboCount: number }).turboCount})
                                            </p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                24h: {(planItem as { expressPercent: number }).expressPercent.toFixed(1)}% ({(planItem as { expressCount: number }).expressCount})
                                            </p>
                                            <p className="font-bold leading-tight break-words" style={{ fontSize: "14px", color: c.value }}>
                                                7d: {(planItem as { essencialPercent: number }).essencialPercent.toFixed(1)}% ({(planItem as { essencialCount: number }).essencialCount})
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <Sep />
                    </div>
                )}

                {canViewFinancials && (
                    <div className="flex min-w-0 items-stretch gap-1.5 sm:gap-0">
                        {/* Pedidos por Pais */}
                        <GroupBadge label="Paises" color="#3b82f6" />
                        <div className="flex min-w-0 flex-wrap gap-2 items-stretch pl-0 sm:pl-1.5">
                            {statItems.filter(i => "isLocale" in i && i.isLocale).map((item) => {
                                const c = colorMap[item.color] ?? defaultColor;
                                return (
                                    <div
                                        key={item.label}
                                        className="flex items-center justify-center gap-1 rounded-md px-2.5 py-2 min-h-[52px] sm:shrink-0"
                                        style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}
                                    >
                                        <span className="text-base leading-none">{item.label}</span>
                                        <span className="font-bold text-base leading-none" style={{ color: c.value }}>{item.value}</span>
                                    </div>
                                );
                            })}
                            {(() => {
                                const convItem = statItems.find(i => i.label === "Conversion")!;
                                const c = colorMap[convItem.color] ?? defaultColor;
                                return (
                                    <div className="flex items-center justify-center gap-1 rounded-md px-2.5 py-2 min-h-[52px] sm:shrink-0" style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
                                        <span className="text-[10px] uppercase font-medium" style={{ color: c.label }}>Conv</span>
                                        <span className="font-bold text-base leading-none" style={{ color: c.value }}>{convItem.value.toFixed(1)}%</span>
                                    </div>
                                );
                            })()}
                        </div>
                        <Sep />
                    </div>
                )}

                {/* Producao */}
                <div className="flex min-w-0 items-stretch gap-1.5 sm:gap-0">
                    <GroupBadge label="Fila" color="#8b5cf6" />
                    <div className="flex min-w-0 flex-wrap gap-2 items-stretch pl-0 sm:pl-1.5">
                        {showSpotifyDistroBlocks && (() => {
                            const pendingItem = statItems.find(i => "isSpotifyPending" in i && i.isSpotifyPending)!;
                            const readyItem = statItems.find(i => "isSpotifyReady" in i && i.isSpotifyReady)!;
                            const cp = colorMap[pendingItem.color] ?? defaultColor;
                            const cr = colorMap[readyItem.color] ?? defaultColor;
                            const isPendingActive = activeStatusFilter === "SPOTIFY_PENDING";
                            const isReadyActive = activeStatusFilter === "SPOTIFY_READY";
                            return (
                                <>
                                    <button
                                        onClick={onToggleSpotifyPendingFilter}
                                        className={`flex w-full min-w-0 items-center gap-1 rounded-md px-2.5 py-2 text-left transition-all cursor-pointer sm:w-auto sm:shrink-0 ${
                                            isPendingActive ? "ring-2 ring-sky-500 shadow-sm" : "hover:ring-1 hover:ring-sky-400"
                                        }`}
                                        style={{ backgroundColor: isPendingActive ? "#e0f2fe" : cp.bg, borderWidth: 1, borderColor: isPendingActive ? "#0ea5e9" : cp.border }}
                                    >
                                        <AlertCircle className="h-4 w-4 shrink-0" style={{ color: cp.icon }} />
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase font-medium leading-none" style={{ color: cp.label }}>Spotify</p>
                                            <p className="font-bold text-base leading-tight" style={{ color: cp.value }}>{pendingItem.value}</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={onToggleSpotifyReadyFilter}
                                        className={`flex w-full min-w-0 items-center gap-1 rounded-md px-2.5 py-2 text-left transition-all cursor-pointer sm:w-auto sm:shrink-0 ${
                                            isReadyActive ? "ring-2 ring-emerald-500 shadow-sm" : "hover:ring-1 hover:ring-emerald-400"
                                        }`}
                                        style={{ backgroundColor: isReadyActive ? "#d1fae5" : cr.bg, borderWidth: 1, borderColor: isReadyActive ? "#10b981" : cr.border }}
                                    >
                                        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: cr.icon }} />
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase font-medium leading-none" style={{ color: cr.label }}>Distro</p>
                                            <p className="font-bold text-base leading-tight" style={{ color: cr.value }}>{readyItem.value}</p>
                                        </div>
                                    </button>
                                </>
                            );
                        })()}
                        {showSpotifyDistroBlocks && <Sep />}
                        {(() => {
                            const songItem = statItems.find(i => "isSongPending" in i && i.isSongPending)!;
                            const c = colorMap[songItem.color] ?? defaultColor;
                            const isActive = activeStatusFilter === "SONGS_PENDING";
                            return (
                                <button
                                    onClick={onToggleSongsPendingFilter}
                                    className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 py-2 transition-all cursor-pointer sm:w-auto sm:shrink-0 ${
                                        isActive ? "ring-2 ring-violet-500 shadow-sm" : "hover:ring-1 hover:ring-violet-400"
                                    }`}
                                    style={{ backgroundColor: isActive ? "#ede9fe" : c.bg, borderWidth: 1, borderColor: isActive ? "#8b5cf6" : c.border }}
                                >
                                    <Music className="h-4 w-4 shrink-0" style={{ color: c.icon }} />
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase font-medium leading-none" style={{ color: c.label }}>Songs</p>
                                        <p className="font-bold text-base leading-tight" style={{ color: c.value }}>{songItem.value}</p>
                                    </div>
                                    <div className="flex flex-col gap-0.5 ml-1">
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-700 border border-violet-300 leading-none">6H: {stats.pendingSongs6h ?? 0}</span>
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 border border-red-300 leading-none">24H: {stats.pendingSongs24h ?? 0}</span>
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-300 leading-none">7D: {stats.pendingSongs7d ?? 0}</span>
                                    </div>
                                </button>
                            );
                        })()}
                    </div>
                </div>
            </div>

        </div>
    );
}

function RevisionStatsBar() {
    const { data: stats, isLoading } = api.admin.getStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) return null;
    if (!stats) return null;

    const reviewerStats = stats.reviewerStats ?? [];
    const reviewerStatsToday = stats.reviewerStatsToday ?? [];
    const reviewerStatsYesterday = stats.reviewerStatsYesterday ?? [];
    const reviewerStatsLast7Days = stats.reviewerStatsLast7Days ?? [];
    const reviewerStatsWorkedDayAverage = stats.reviewerStatsWorkedDayAverage ?? [];

    const totalRevised = reviewerStats.reduce((sum, r) => sum + r.count, 0);
    const todayRevised = reviewerStatsToday.reduce((sum, r) => sum + r.count, 0);
    const yesterdayRevised = reviewerStatsYesterday.reduce((sum, r) => sum + r.count, 0);
    const last7DaysRevised = reviewerStatsLast7Days.reduce((sum, r) => sum + r.count, 0);

    const reviewerMap = new Map<string, { name: string; total: number; today: number; yesterday: number; workedDays: number }>();

    const ensureReviewerItem = (rawName: string) => {
        const candidateName = rawName?.trim();
        if (!candidateName) return null;

        const reviewerKey = normalizeReviewerRankingKey(candidateName);
        if (!reviewerKey) return null;

        const existing = reviewerMap.get(reviewerKey);
        const preferredName = pickPreferredReviewerRankingName(reviewerKey, existing?.name, candidateName);

        const item = existing ?? {
            name: preferredName,
            total: 0,
            today: 0,
            yesterday: 0,
            workedDays: 0,
        };

        if (item.name !== preferredName) {
            item.name = preferredName;
        }

        reviewerMap.set(reviewerKey, item);
        return item;
    };

    for (const reviewer of reviewerStats) {
        const item = ensureReviewerItem(reviewer.name);
        if (!item) continue;
        item.total += reviewer.count;
    }

    for (const reviewer of reviewerStatsToday) {
        const item = ensureReviewerItem(reviewer.name);
        if (!item) continue;
        item.today += reviewer.count;
    }

    for (const reviewer of reviewerStatsYesterday) {
        const item = ensureReviewerItem(reviewer.name);
        if (!item) continue;
        item.yesterday += reviewer.count;
    }

    for (const reviewer of reviewerStatsWorkedDayAverage) {
        const item = ensureReviewerItem(reviewer.name);
        if (!item) continue;
        item.workedDays += reviewer.workedDays;
    }

    const mergedReviewerStats = Array.from(reviewerMap.values()).map((reviewer) => ({
        ...reviewer,
        averagePerWorkedDay: reviewer.workedDays > 0 ? reviewer.total / reviewer.workedDays : 0,
    })).sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.today !== a.today) return b.today - a.today;
        return b.yesterday - a.yesterday;
    });

    const leaderboardReviewers = mergedReviewerStats.slice(0, 5);
    const podiumConfig: Record<number, { emoji: string; gradient: string; border: string; accentText: string; badgeBg: string }> = {
        0: { emoji: "🥇", gradient: "from-amber-50 to-orange-50", border: "border-amber-200", accentText: "text-amber-700", badgeBg: "bg-amber-100" },
        1: { emoji: "🥈", gradient: "from-slate-50 to-gray-50", border: "border-slate-200", accentText: "text-slate-600", badgeBg: "bg-slate-100" },
        2: { emoji: "🥉", gradient: "from-orange-50 to-yellow-50", border: "border-yellow-200", accentText: "text-yellow-700", badgeBg: "bg-yellow-100" },
    };

    const defaultCardStyle = { gradient: "from-white to-slate-50", border: "border-slate-150", accentText: "text-slate-500", badgeBg: "bg-slate-100" };

    const StatCard = ({
        title,
        value,
        subtitle,
        icon,
        tone,
    }: {
        title: string;
        value: number;
        subtitle: string;
        icon: React.ReactNode;
        tone: "pending" | "ok" | "today" | "yesterday" | "last7";
    }) => {
        const toneStyles: Record<string, { bg: string; iconBg: string; valueColor: string; subtitleColor: string }> = {
            pending: { bg: "bg-amber-50", iconBg: "bg-amber-100", valueColor: "text-amber-800", subtitleColor: "text-amber-600" },
            ok: { bg: "bg-emerald-50", iconBg: "bg-emerald-100", valueColor: "text-emerald-800", subtitleColor: "text-emerald-600" },
            today: { bg: "bg-orange-50", iconBg: "bg-orange-100", valueColor: "text-orange-800", subtitleColor: "text-orange-600" },
            yesterday: { bg: "bg-violet-50", iconBg: "bg-violet-100", valueColor: "text-violet-800", subtitleColor: "text-violet-600" },
            last7: { bg: "bg-cyan-50", iconBg: "bg-cyan-100", valueColor: "text-cyan-800", subtitleColor: "text-cyan-600" },
        };
        const s = toneStyles[tone]!;
        return (
            <div className={`${s.bg} flex flex-1 items-center gap-3 rounded-xl px-3.5 py-3 min-w-[140px]`}>
                <div className={`${s.iconBg} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <p className={`text-2xl font-bold leading-tight ${s.valueColor}`}>{value.toLocaleString("pt-BR")}</p>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${s.subtitleColor} mt-0.5 leading-tight`}>{title}</p>
                </div>
            </div>
        );
    };

    // Calculate max total for bar width
    const maxTotal = mergedReviewerStats.length > 0 ? mergedReviewerStats[0]!.total : 1;

    return (
        <div className="space-y-3 mb-4">
            {/* Summary Stats Row */}
            <div className="flex flex-wrap gap-2">
                <StatCard
                    title="Pendentes"
                    value={stats.pendingRevisionsCount ?? 0}
                    subtitle="fila aguardando revisão"
                    icon={<Clock className="h-4.5 w-4.5 text-amber-600" />}
                    tone="pending"
                />
                <StatCard
                    title="Total revisados"
                    value={totalRevised}
                    subtitle="total de concluídas"
                    icon={<CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />}
                    tone="ok"
                />
                <StatCard
                    title="Hoje"
                    value={todayRevised}
                    subtitle="revisões hoje"
                    icon={<TrendingUp className="h-4.5 w-4.5 text-orange-600" />}
                    tone="today"
                />
                <StatCard
                    title="Ontem"
                    value={yesterdayRevised}
                    subtitle="revisões ontem"
                    icon={<CalendarDays className="h-4.5 w-4.5 text-violet-600" />}
                    tone="yesterday"
                />
                <StatCard
                    title="7 dias"
                    value={last7DaysRevised}
                    subtitle="revisões concluídas"
                    icon={<TrendingUp className="h-4.5 w-4.5 text-cyan-600" />}
                    tone="last7"
                />
            </div>

            {/* Reviewers Section */}
            {mergedReviewerStats.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-porcelain overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                        <Users className="h-4 w-4 text-charcoal/60" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revisores</h4>
                        <span className="ml-auto text-[10px] font-medium text-charcoal/60 uppercase tracking-wider">
                            {mergedReviewerStats.length} revisores
                        </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {mergedReviewerStats.map((reviewer, index) => {
                            const podium = podiumConfig[index];
                            const style = podium ?? defaultCardStyle;
                            const barWidth = maxTotal > 0 ? Math.max((reviewer.total / maxTotal) * 100, 4) : 4;

                            return (
                                <div
                                    key={reviewer.name}
                                    className={`group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50/60`}
                                >
                                    {/* Rank badge */}
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.badgeBg}`}>
                                        {podium ? (
                                            <span className="text-sm">{podium.emoji}</span>
                                        ) : (
                                            <span className="text-[11px] font-bold text-charcoal/60">#{index + 1}</span>
                                        )}
                                    </div>

                                    {/* Name + progress bar */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="truncate text-sm font-semibold text-slate-800">{reviewer.name}</span>
                                            <span className={`text-lg font-bold tabular-nums ${style.accentText}`}>
                                                {reviewer.total.toLocaleString("pt-BR")}
                                            </span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    index === 0 ? "bg-amber-400" :
                                                    index === 1 ? "bg-slate-400" :
                                                    index === 2 ? "bg-yellow-400" :
                                                    "bg-slate-300"
                                                }`}
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Metrics */}
                                    <div className="flex shrink-0 items-center gap-4">
                                        <div className="text-center">
                                            <p className="text-sm font-bold tabular-nums text-orange-600">{reviewer.today}</p>
                                            <p className="text-[9px] font-medium uppercase tracking-wider text-charcoal/60">Hoje</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold tabular-nums text-violet-600">{reviewer.yesterday}</p>
                                            <p className="text-[9px] font-medium uppercase tracking-wider text-charcoal/60">Ontem</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold tabular-nums text-emerald-600">
                                                {reviewer.averagePerWorkedDay.toLocaleString("pt-BR", {
                                                    minimumFractionDigits: 1,
                                                    maximumFractionDigits: 1,
                                                })}
                                            </p>
                                            <p className="text-[9px] font-medium uppercase tracking-wider text-charcoal/60">Média/dia</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// Revenue Chart Component (Daily + Monthly tabs)
type RevenueView = "daily" | "weekly" | "monthly" | "orders" | "conversion" | "byCountry";

function RevenueChart() {
    const [view, setView] = useState<RevenueView>("daily");
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

    const showMonthSelector = view === "daily" || view === "orders" || view === "conversion";

    const { data: dailyData, isLoading: dailyLoading } = api.admin.getDailyRevenue.useQuery({
        year: selectedYear,
        month: selectedMonth,
    });

    const { data: monthlyData, isLoading: monthlyLoading } = api.admin.getMonthlyRevenue.useQuery(undefined, {
        staleTime: 10 * 60 * 1000,
    });

    const { data: weeklyData, isLoading: weeklyLoading } = api.admin.getWeeklyRevenue.useQuery(undefined, {
        enabled: view === "weekly",
        staleTime: 10 * 60 * 1000,
    });

    const { data: conversionData, isLoading: conversionLoading } = api.admin.getDailyConversion.useQuery({
        year: selectedYear,
        month: selectedMonth,
    }, {
        enabled: view === "conversion",
    });

    const { data: countryData, isLoading: countryLoading } = api.admin.getRevenueByCountry.useQuery(undefined, {
        enabled: view === "byCountry",
        staleTime: 10 * 60 * 1000,
    });

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const availableMonths: { year: number; month: number; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        availableMonths.push({
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        });
    }

    const isLoading =
        view === "daily" || view === "orders" ? dailyLoading :
        view === "monthly" ? monthlyLoading :
        view === "weekly" ? weeklyLoading :
        view === "conversion" ? conversionLoading :
        view === "byCountry" ? countryLoading :
        false;

    const viewTitles: Record<RevenueView, string> = {
        daily: "Daily Net Revenue",
        weekly: "Weekly Net Revenue",
        monthly: "Monthly Net Revenue",
        orders: "Daily Orders",
        conversion: "Daily Conversion Rate",
        byCountry: "Revenue by Country",
    };

    const tabs: { key: RevenueView; label: string; color: string }[] = [
        { key: "daily", label: "Daily", color: "bg-green-500" },
        { key: "weekly", label: "Weekly", color: "bg-blue-500" },
        { key: "monthly", label: "Monthly", color: "bg-purple-500" },
        { key: "orders", label: "Orders", color: "bg-lime-500" },
        { key: "conversion", label: "Conversion", color: "bg-rose-500" },
        { key: "byCountry", label: "By Country", color: "bg-amber-500" },
    ];

    const tooltipStyle = {
        backgroundColor: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
        padding: "8px 12px",
    };
    const defaultChartInitialDimension = { width: 800, height: 280 };
    const tallChartInitialDimension = { width: 800, height: 320 };
    const chartMargin = { top: 20, right: 12, left: 4, bottom: 5 };

    return (
        <div className="bg-[#111827] rounded-lg border p-4 sm:p-6 mb-4">
            {/* Header with tabs and controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div className="flex flex-col gap-3 min-w-0">
                    <div className="flex flex-wrap rounded-lg border border-slate-200 bg-[#111827] p-1 gap-1.5">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setView(tab.key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                    view === tab.key
                                        ? `${tab.color} text-white`
                                        : "bg-porcelain text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 break-words">
                        {viewTitles[view]}
                    </h3>
                </div>

                {showMonthSelector ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2 w-full sm:w-auto justify-between sm:justify-center">
                                {monthNames[selectedMonth - 1]} {selectedYear}
                                <ChevronDown className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                            {availableMonths.map((m) => (
                                <DropdownMenuItem
                                    key={`${m.year}-${m.month}`}
                                    onClick={() => {
                                        setSelectedYear(m.year);
                                        setSelectedMonth(m.month);
                                    }}
                                    className={
                                        m.year === selectedYear && m.month === selectedMonth
                                            ? "bg-slate-100 font-medium"
                                            : ""
                                    }
                                >
                                    {m.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : view === "weekly" ? (
                    <span className="text-xs sm:text-sm text-slate-500">
                        Last 12 weeks: <span className="font-bold text-blue-600">{formatCurrency(weeklyData?.totalNet ?? 0)}</span>
                    </span>
                ) : view === "monthly" ? (
                    <span className="text-xs sm:text-sm text-slate-500">
                        All-time: <span className="font-bold text-green-600">{formatCurrency(monthlyData?.totalNet ?? 0)}</span>
                    </span>
                ) : view === "byCountry" ? (
                    <span className="text-xs sm:text-sm text-slate-500">
                        All-time: <span className="font-bold text-amber-600">{formatCurrency(countryData?.totalNet ?? 0)}</span>
                    </span>
                ) : null}
            </div>

            {/* Chart area */}
            {isLoading ? (
                <div className="h-[280px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : view === "daily" && dailyData ? (
                <>
                    <div className="h-[280px]">
                        {(() => {
                            const chartData = dailyData.dailyData.map((d) => ({
                                day: d.day,
                                net: d.isToday ? null : d.net,
                                netToday: d.isToday ? d.net : null,
                                isToday: d.isToday,
                            }));

                            return (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    minWidth={1}
                                    minHeight={1}
                                    initialDimension={defaultChartInitialDimension}
                                >
                                    <LineChart data={chartData} margin={chartMargin}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="day"
                                            tick={{ fontSize: 12, fill: "#64748b" }}
                                            tickLine={false}
                                            axisLine={{ stroke: "#e2e8f0" }}
                                        />
                                        <YAxis
                                            tickFormatter={(val) => `$${val}`}
                                            tick={{ fontSize: 12, fill: "#64748b" }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={60}
                                            domain={[0, "auto"]}
                                        />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const isToday = payload[0]?.payload?.isToday;
                                                const netValue = payload[0]?.payload?.netToday ?? payload[0]?.payload?.net;
                                                if (netValue === null || netValue === undefined) return null;
                                                return (
                                                    <div style={tooltipStyle}>
                                                        <p style={{ margin: 0, fontWeight: 500, color: "#334155" }}>
                                                            Day {label}{isToday ? " (today)" : ""}
                                                        </p>
                                                        <p style={{ margin: 0, color: isToday ? "#f59e0b" : "#22c55e" }}>
                                                            {isToday ? "Partial" : "Net Revenue"} : {formatCurrency(netValue as number)}
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="net"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            dot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }}
                                            activeDot={{ r: 6, fill: "#22c55e", strokeWidth: 2, stroke: "white" }}
                                            connectNulls={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="netToday"
                                            stroke="transparent"
                                            strokeWidth={0}
                                            dot={(props) => {
                                                const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: { netToday?: number | null } };
                                                if (cx === undefined || cy === undefined || !payload?.netToday) return <></>;
                                                return (
                                                    <g>
                                                        <circle cx={cx} cy={cy} r={6} fill="#f59e0b" stroke="#fbbf24" strokeWidth={2} />
                                                        <text x={cx} y={cy - 12} textAnchor="middle" fill="#f59e0b" fontSize={11} fontWeight={600}>
                                                            {formatCurrency(payload.netToday)}
                                                        </text>
                                                    </g>
                                                );
                                            }}
                                            activeDot={{ r: 8, fill: "#f59e0b", strokeWidth: 2, stroke: "white" }}
                                            connectNulls={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            );
                        })()}
                    </div>
                    <div className="flex justify-end mt-4 pt-4 border-t">
                        <div className="text-right">
                            <span className="text-sm text-slate-500">Total Net: </span>
                            <span className="text-xl font-bold text-green-600">{formatCurrency(dailyData.totalNet)}</span>
                        </div>
                    </div>
                </>
            ) : view === "weekly" && weeklyData ? (
                <div className="h-[280px]">
                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={1}
                        minHeight={1}
                        initialDimension={defaultChartInitialDimension}
                    >
                        <BarChart data={weeklyData.weeks} margin={chartMargin}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={{ stroke: "#e2e8f0" }}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                                tick={{ fontSize: 12, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null;
                                    const item = payload[0]?.payload as { label: string; net: number; isCurrent: boolean } | undefined;
                                    if (!item) return null;
                                    return (
                                        <div style={tooltipStyle}>
                                            <p style={{ margin: 0, fontWeight: 500, color: "#334155" }}>
                                                {item.label}{item.isCurrent ? " (current)" : ""}
                                            </p>
                                            <p style={{ margin: 0, color: item.isCurrent ? "#f59e0b" : "#3b82f6", fontWeight: 600 }}>
                                                {formatCurrency(item.net)}
                                            </p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar
                                dataKey="net"
                                radius={[4, 4, 0, 0]}
                                fill="#3b82f6"
                                shape={((props: unknown) => {
                                    const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: { isCurrent?: boolean } };
                                    return (
                                        <rect
                                            x={x} y={y} width={width} height={height}
                                            rx={4} ry={4}
                                            fill={payload?.isCurrent ? "#f59e0b" : "#3b82f6"}
                                        />
                                    );
                                }) as never}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : view === "monthly" && monthlyData && monthlyData.months.length > 0 ? (
                <div className="h-[280px]">
                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={1}
                        minHeight={1}
                        initialDimension={defaultChartInitialDimension}
                    >
                        <BarChart data={monthlyData.months} margin={chartMargin}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={{ stroke: "#e2e8f0" }}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 12, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null;
                                    const item = payload[0]?.payload as { label: string; net: number; isCurrent: boolean } | undefined;
                                    if (!item) return null;
                                    return (
                                        <div style={tooltipStyle}>
                                            <p style={{ margin: 0, fontWeight: 500, color: "#334155" }}>
                                                {item.label}{item.isCurrent ? " (partial)" : ""}
                                            </p>
                                            <p style={{ margin: 0, color: item.isCurrent ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                                                {formatCurrency(item.net)}
                                            </p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar
                                dataKey="net"
                                radius={[4, 4, 0, 0]}
                                fill="#22c55e"
                                shape={((props: unknown) => {
                                    const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: { isCurrent?: boolean } };
                                    return (
                                        <rect
                                            x={x} y={y} width={width} height={height}
                                            rx={4} ry={4}
                                            fill={payload?.isCurrent ? "#f59e0b" : "#22c55e"}
                                        />
                                    );
                                }) as never}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : view === "orders" && dailyData ? (
                <>
                    <div className="h-[280px]">
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            minWidth={1}
                            minHeight={1}
                            initialDimension={defaultChartInitialDimension}
                        >
                            <BarChart data={dailyData.dailyData} margin={chartMargin}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="day"
                                    tick={{ fontSize: 12, fill: "#64748b" }}
                                    tickLine={false}
                                    axisLine={{ stroke: "#e2e8f0" }}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 12, fill: "#64748b" }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={40}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload as { day: number; orders: number; isToday: boolean } | undefined;
                                        if (!item) return null;
                                        return (
                                            <div style={tooltipStyle}>
                                                <p style={{ margin: 0, fontWeight: 500, color: "#334155" }}>
                                                    Day {label}{item.isToday ? " (today)" : ""}
                                                </p>
                                                <p style={{ margin: 0, color: "#84cc16", fontWeight: 600 }}>
                                                    {item.orders} order{item.orders !== 1 ? "s" : ""}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar
                                    dataKey="orders"
                                    radius={[4, 4, 0, 0]}
                                    fill="#84cc16"
                                    shape={((props: unknown) => {
                                        const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: { isToday?: boolean } };
                                        return (
                                            <rect
                                                x={x} y={y} width={width} height={height}
                                                rx={4} ry={4}
                                                fill={payload?.isToday ? "#f59e0b" : "#84cc16"}
                                            />
                                        );
                                    }) as never}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-end mt-4 pt-4 border-t">
                        <div className="text-right">
                            <span className="text-sm text-slate-500">Total Orders: </span>
                            <span className="text-xl font-bold text-lime-600">
                                {dailyData.dailyData.reduce((sum, d) => sum + d.orders, 0)}
                            </span>
                        </div>
                    </div>
                </>
            ) : view === "conversion" && conversionData ? (
                <>
                    <div className="h-[280px]">
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            minWidth={1}
                            minHeight={1}
                            initialDimension={defaultChartInitialDimension}
                        >
                            <LineChart data={conversionData.dailyData} margin={chartMargin}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="day"
                                    tick={{ fontSize: 12, fill: "#64748b" }}
                                    tickLine={false}
                                    axisLine={{ stroke: "#e2e8f0" }}
                                />
                                <YAxis
                                    tickFormatter={(val) => `${val}%`}
                                    tick={{ fontSize: 12, fill: "#64748b" }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={50}
                                    domain={[0, "auto"]}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const item = payload[0]?.payload as { day: number; quizzes: number; paid: number; rate: number; isToday: boolean } | undefined;
                                        if (!item) return null;
                                        return (
                                            <div style={tooltipStyle}>
                                                <p style={{ margin: 0, fontWeight: 500, color: "#334155" }}>
                                                    Day {label}{item.isToday ? " (today)" : ""}
                                                </p>
                                                <p style={{ margin: 0, color: "#e11d48", fontWeight: 600 }}>
                                                    {item.rate.toFixed(1)}%
                                                </p>
                                                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                                                    {item.paid} paid / {item.quizzes} quizzes
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="rate"
                                    stroke="#e11d48"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: "#e11d48", strokeWidth: 0 }}
                                    activeDot={{ r: 6, fill: "#e11d48", strokeWidth: 2, stroke: "white" }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-end mt-4 pt-4 border-t">
                        <div className="text-right">
                            <span className="text-sm text-slate-500">Avg Rate: </span>
                            <span className="text-xl font-bold text-rose-600">{conversionData.avgRate.toFixed(1)}%</span>
                        </div>
                    </div>
                </>
            ) : view === "byCountry" && countryData && countryData.months.length > 0 ? (
                <div className="h-[320px]">
                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={1}
                        minHeight={1}
                        initialDimension={tallChartInitialDimension}
                    >
                        <BarChart data={countryData.months} margin={chartMargin}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={{ stroke: "#e2e8f0" }}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                                tick={{ fontSize: 12, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null;
                                    const item = payload[0]?.payload as { label: string; en: number; pt: number; es: number; fr: number; it: number; total: number } | undefined;
                                    if (!item) return null;
                                    return (
                                        <div style={tooltipStyle}>
                                            <p style={{ margin: 0, fontWeight: 500, color: "#334155" }}>{item.label}</p>
                                            <p style={{ margin: 0, fontWeight: 600, color: "#334155" }}>{formatCurrency(item.total)}</p>
                                            {item.en > 0 && <p style={{ margin: 0, fontSize: 12, color: "#3b82f6" }}>EN: {formatCurrency(item.en)}</p>}
                                            {item.pt > 0 && <p style={{ margin: 0, fontSize: 12, color: "#22c55e" }}>PT: {formatCurrency(item.pt)}</p>}
                                            {item.es > 0 && <p style={{ margin: 0, fontSize: 12, color: "#f59e0b" }}>ES: {formatCurrency(item.es)}</p>}
                                            {item.fr > 0 && <p style={{ margin: 0, fontSize: 12, color: "#a855f7" }}>FR: {formatCurrency(item.fr)}</p>}
                                            {item.it > 0 && <p style={{ margin: 0, fontSize: 12, color: "#ef4444" }}>IT: {formatCurrency(item.it)}</p>}
                                        </div>
                                    );
                                }}
                            />
                            <Legend />
                            <Bar dataKey="en" stackId="a" fill="#3b82f6" name="EN" />
                            <Bar dataKey="pt" stackId="a" fill="#22c55e" name="PT" />
                            <Bar dataKey="es" stackId="a" fill="#f59e0b" name="ES" />
                            <Bar dataKey="fr" stackId="a" fill="#a855f7" name="FR" />
                            <Bar dataKey="it" stackId="a" fill="#ef4444" name="IT" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : null}
        </div>
    );
}

type StatsTab = "orders" | "revisions" | "spotify" | "distrokid";
const statsTabs: Array<{
    key: StatsTab;
    label: string;
    icon: typeof ShoppingCart;
    activeClass: string;
    inactiveClass: string;
}> = [
    { key: "revisions", label: "Revisões", icon: RefreshCw, activeClass: "bg-sky-700 text-white border-sky-700", inactiveClass: "text-slate-600 hover:bg-sky-50 hover:text-sky-700" },
    { key: "spotify", label: "Spotify", icon: Radio, activeClass: "bg-sky-700 text-white border-sky-700", inactiveClass: "text-slate-600 hover:bg-sky-50 hover:text-sky-700" },
    { key: "distrokid", label: "DistroKid", icon: CloudUpload, activeClass: "bg-emerald-700 text-white border-emerald-700", inactiveClass: "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700" },
    { key: "orders", label: "Pedidos Apollo", icon: ShoppingCart, activeClass: "bg-white text-white border-slate-900", inactiveClass: "text-slate-600 hover:bg-slate-100 hover:text-slate-900" },
];

// Default filter values
const DEFAULT_FILTERS = {
    page: 1,
    pageSize: 20,
    search: "",
    searchMode: "ALL",
    status: "ALL",
    revisionType: "ALL",
    revisionFault: "ALL",
    melodyPreference: "ALL",
    genre: "",
    vocals: "",
    locale: "",
    plan: "ALL",
    upsell: "ALL",
    recoveryEmail: "ALL",
    reviewedBy: "",
    orderType: "",
    source: "",
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
};

function LeadsPageContent() {
    const searchParams = useSearchParams();
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [isDistroKidSuccessModalOpen, setIsDistroKidSuccessModalOpen] = useState(false);
    const [distroKidSuccessModalData, setDistroKidSuccessModalData] = useState<DistroKidSuccessModalDetail | null>(null);
    const [distroKidMessageCopied, setDistroKidMessageCopied] = useState(false);
    const [mobileLeadDetails, setMobileLeadDetails] = useState<Lead | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const utils = api.useUtils();
    const { data: currentAdmin, isLoading: isCurrentAdminLoading } = api.admin.getCurrentAdmin.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });
    useEffect(() => {
        setIsHydrated(true);
    }, []);

    const canAccessFinancials = !!currentAdmin?.isSuperAdmin;
    // Keep first client render equal to SSR to avoid hydration mismatch in permission-gated blocks.
    const canViewFinancials = isHydrated && canAccessFinancials;
    const rawStatsTab = (searchParams.get("statsTab") as StatsTab) || "orders";
    const activeStatsTab: StatsTab = rawStatsTab;
    const visibleStatsTabs = statsTabs;
    const formatBRL = (value: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    // Parse filters from URL
    const filters = useMemo(() => {
        const page = parseInt(searchParams.get("page") ?? "1", 10);
        const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
        const search = searchParams.get("search") ?? "";
        const searchModeParam = searchParams.get("searchMode");
        const searchMode = searchModeParam === "SPOTIFY_SONG_NAME" ? "SPOTIFY_SONG_NAME" : "ALL";
        const status = searchParams.get("status") ?? "ALL";
        const revisionType = searchParams.get("revisionType") ?? "ALL";
        const revisionFault = searchParams.get("revisionFault") ?? "ALL";
        const melodyPreference = searchParams.get("melodyPreference") ?? "ALL";
        const genre = searchParams.get("genre") ?? "";
        const vocals = searchParams.get("vocals") ?? "";
        const locale = searchParams.get("locale") ?? "";
        const plan = searchParams.get("plan") ?? "ALL";
        const upsell = searchParams.get("upsell") ?? "ALL";
        const recoveryEmail = searchParams.get("recoveryEmail") ?? "ALL";
        const reviewedBy = searchParams.get("reviewedBy") ?? "";
        const orderType = searchParams.get("orderType") ?? "";
        const source = searchParams.get("source") ?? "";
        const dateFromStr = searchParams.get("dateFrom");
        const dateToStr = searchParams.get("dateTo");

        return {
            page: isNaN(page) ? 1 : page,
            pageSize: isNaN(pageSize) ? 20 : pageSize,
            search,
            searchMode,
            status,
            revisionType,
            revisionFault,
            melodyPreference,
            genre,
            vocals,
            locale,
            plan,
            upsell,
            recoveryEmail,
            reviewedBy,
            orderType,
            source,
            dateFrom: dateFromStr ? new Date(dateFromStr) : undefined,
            dateTo: dateToStr ? new Date(dateToStr) : undefined,
        };
    }, [searchParams]);

    // Update URL with new filters
    const setFilters = (newFilters: Partial<typeof filters>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(newFilters).forEach(([key, value]) => {
            const keepRevisionMelodyParam =
                activeStatsTab === "revisions" &&
                key === "melodyPreference" &&
                value === "ALL";

            if (keepRevisionMelodyParam) {
                params.set(key, "ALL");
                return;
            }

            if (value === undefined || value === "" || value === DEFAULT_FILTERS[key as keyof typeof DEFAULT_FILTERS]) {
                params.delete(key);
            } else if (value instanceof Date) {
                params.set(key, value.toISOString());
            } else {
                params.set(key, String(value));
            }
        });

        // Reset to page 1 when filters change (except page itself)
        if (!("page" in newFilters)) {
            params.set("page", "1");
        }

        window.history.pushState(null, "", `?${params.toString()}`);
        // Force re-render by triggering state update
        window.dispatchEvent(new PopStateEvent("popstate"));
    };

    const resetFilters = () => {
        window.history.pushState(null, "", window.location.pathname);
        window.dispatchEvent(new PopStateEvent("popstate"));
    };

    useEffect(() => {
        if (isCurrentAdminLoading) return;
        return;
    }, [isCurrentAdminLoading, rawStatsTab, searchParams]);

    useEffect(() => {
        const defaultStatusByTab: Partial<Record<StatsTab, "REVISION" | "SPOTIFY_PENDING" | "SPOTIFY_READY">> = {
            revisions: "REVISION",
            spotify: "SPOTIFY_PENDING",
            distrokid: "SPOTIFY_READY",
        };
        const allowedStatusesByTab: Partial<Record<StatsTab, string[]>> = {
            revisions: ["REVISION"],
            spotify: ["SPOTIFY_PENDING", "SPOTIFY_IN_DISTRIBUTION", "SPOTIFY_PUBLISHED"],
            distrokid: ["SPOTIFY_READY"],
        };

        const requiredStatus = defaultStatusByTab[activeStatsTab];
        const allowedStatuses = allowedStatusesByTab[activeStatsTab];
        const shouldDefaultRevisionMelody =
            activeStatsTab === "revisions" && !searchParams.has("melodyPreference");

        if (!requiredStatus || !allowedStatuses) {
            return;
        }

        const needsStatusUpdate = !allowedStatuses.includes(filters.status);
        if (!needsStatusUpdate && !shouldDefaultRevisionMelody) {
            return;
        }

        const params = new URLSearchParams(searchParams.toString());

        if (needsStatusUpdate) {
            params.set("status", requiredStatus);

            (Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>).forEach((key) => {
                if (key === "page") return;
                params.delete(key);
            });

            if (activeStatsTab === "revisions") {
                params.set("melodyPreference", "ALL");
            }

            params.set("page", "1");

            window.history.pushState(null, "", params.toString() ? `?${params.toString()}` : window.location.pathname);
            window.dispatchEvent(new PopStateEvent("popstate"));
            return;
        }

        if (shouldDefaultRevisionMelody && activeStatsTab === "revisions") {
            params.set("melodyPreference", "ALL");
            window.history.pushState(null, "", params.toString() ? `?${params.toString()}` : window.location.pathname);
            window.dispatchEvent(new PopStateEvent("popstate"));
        }
    }, [activeStatsTab, filters.status, searchParams]);

    useEffect(() => {
        const handleModalState = (event: Event) => {
            const customEvent = event as CustomEvent<DistroKidSuccessModalDetail>;
            const detail = customEvent.detail;
            if (detail?.open) {
                setDistroKidSuccessModalData(detail);
                setDistroKidMessageCopied(false);
                setIsDistroKidSuccessModalOpen(true);
                return;
            }

            setIsDistroKidSuccessModalOpen(false);
        };

        window.addEventListener(DISTROKID_SUCCESS_MODAL_EVENT, handleModalState as EventListener);
        return () => {
            window.removeEventListener(DISTROKID_SUCCESS_MODAL_EVENT, handleModalState as EventListener);
        };
    }, []);

    const getDistroKidWhatsAppMessage = () => {
        const songName = distroKidSuccessModalData?.songName || "a música";
        const recipientName = distroKidSuccessModalData?.recipientName || "cliente";
        const artigo = recipientName.toLowerCase().endsWith("a") ? "a" : "o";

        return `Boa notícia! 🎉

A música *"${songName}"* para ${artigo} *${recipientName}* foi enviada para distribuição e está a caminho das plataformas de streaming!

Em *1 a 4 dias*, ela deve aparecer no Spotify, Apple Music, Amazon Music, Deezer e outras plataformas.

Para encontrar, basta buscar por *"${songName}"* do artista *ApolloSong.com* no Spotify ou na plataforma que preferir 🔍

Assim que estiver no ar, te aviso com o link para você compartilhar! 🎵`;
    };

    const handleCopyDistroKidMessage = () => {
        void navigator.clipboard.writeText(getDistroKidWhatsAppMessage());
        setDistroKidMessageCopied(true);
        toast.success("Mensagem copiada!");
        setTimeout(() => setDistroKidMessageCopied(false), 2000);
    };

    const closeDistroKidSuccessModal = () => {
        setIsDistroKidSuccessModalOpen(false);
        setDistroKidSuccessModalData(null);
        void Promise.all([
            utils.admin.getLeadsPaginated.invalidate(),
            utils.admin.getStats.invalidate(),
            utils.admin.getFilterOptions.invalidate(),
        ]);
    };

    const { data: stats } = api.admin.getStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });
    const revisionTotalCount = stats?.pendingRevisionsCount ?? 0;
    const revisionKeepCurrentCount = stats?.pendingRevisionsKeepCurrentCount ?? 0;
    const revisionSuggestNewCount = stats?.pendingRevisionsSuggestNewCount ?? 0;
    const revisionKeepCurrentPercent =
        revisionTotalCount > 0 ? Math.round((revisionKeepCurrentCount / revisionTotalCount) * 100) : 0;
    const revisionSuggestNewPercent =
        revisionTotalCount > 0 ? Math.round((revisionSuggestNewCount / revisionTotalCount) * 100) : 0;
    const shouldShowStatsPanel =
        canViewFinancials ||
        activeStatsTab === "revisions" ||
        activeStatsTab === "spotify" ||
        activeStatsTab === "distrokid";

    // Main data query
    const shouldAutoRefreshLeads =
        (filters.status === "SPOTIFY_READY" ||
            filters.status === "SPOTIFY_PENDING" ||
            filters.status === "SPOTIFY_IN_DISTRIBUTION" ||
            filters.status === "SPOTIFY_PUBLISHED") &&
        !isDistroKidSuccessModalOpen;

    const { data, isLoading, isFetching } = api.admin.getLeadsPaginated.useQuery(
        {
            page: filters.page,
            pageSize: filters.pageSize,
            search: filters.search || undefined,
            searchMode: filters.searchMode === "ALL" ? undefined : filters.searchMode as "SPOTIFY_SONG_NAME",
            status: filters.status === "ALL" ? undefined : filters.status as "PENDING" | "PAID" | "IN_PROGRESS" | "COMPLETED" | "REVISION" | "CANCELLED" | "REFUNDED" | "STUCK" | "NO_LYRICS" | "SPOTIFY_READY" | "SPOTIFY_PENDING" | "SPOTIFY_IN_DISTRIBUTION" | "SPOTIFY_PUBLISHED" | "SONGS_PENDING",
            revisionType: filters.revisionType === "ALL" ? undefined : filters.revisionType as "PRONUNCIATION" | "LYRICS_ERROR" | "NAME_ERROR" | "STYLE_CHANGE" | "QUALITY_ISSUE" | "OTHER",
            revisionFault: filters.revisionFault === "ALL" ? undefined : filters.revisionFault as "OUR_FAULT" | "CLIENT_FAULT" | "UNCLEAR",
            melodyPreference: filters.melodyPreference === "ALL" ? undefined : filters.melodyPreference as "KEEP_CURRENT" | "SUGGEST_NEW" | "UNSET",
            genre: filters.genre || undefined,
            vocals: (filters.vocals || undefined) as "male" | "female" | "either" | undefined,
            locale: (filters.locale || undefined) as "en" | "pt" | "es" | "fr" | "it" | undefined,
            plan: filters.plan === "ALL" ? undefined : filters.plan as "ESSENTIAL" | "EXPRESS" | "TURBO",
            upsell: filters.upsell === "ALL" ? undefined : filters.upsell as "ANY" | "LYRICS" | "CERTIFICATE" | "EXTRA_SONG" | "GENRE_VARIANT" | "STREAMING",
            recoveryEmail: filters.recoveryEmail === "ALL" ? undefined : filters.recoveryEmail as "ANY" | "CART" | "STREAMING",
            reviewedBy: filters.reviewedBy || undefined,
            orderType: filters.orderType ? filters.orderType as "MUSICIAN_TIP" : undefined,
            source: filters.source || undefined,
            excludeSource: "supabase-import",
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
        },
        {
            placeholderData: (prev) => prev, // Keep previous data while fetching
            staleTime: 2 * 60 * 1000, // 2 minutes
            refetchInterval: shouldAutoRefreshLeads ? 5000 : false,
            refetchIntervalInBackground: true,
        }
    );

    // Filter options query
    const { data: filterOptions } = api.admin.getFilterOptions.useQuery(undefined, {
        staleTime: 60_000, // 1 minute
    });

    // Table instance
    const table = useReactTable({
        data: data?.items ?? [],
        columns,
        getCoreRowModel: getCoreRowModel(),
        onRowSelectionChange: setRowSelection,
        state: {
            rowSelection,
            columnVisibility: {
                stripeNetAmount: canViewFinancials,
            },
        },
        getRowId: (row: Lead) => row.id,
    });

    // Get selected IDs
    const selectedIds = useMemo(
        () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
        [rowSelection]
    );

    const mobileStatusStyles: Record<string, string> = {
        PAID: "bg-emerald-100 text-emerald-800",
        COMPLETED: "bg-sky-100 text-sky-800",
        PENDING: "bg-amber-100 text-amber-800",
        IN_PROGRESS: "bg-violet-100 text-violet-800",
        REVISION: "bg-rose-100 text-rose-800",
        CANCELLED: "bg-red-100 text-red-800",
        REFUNDED: "bg-red-100 text-red-800",
        STUCK: "bg-slate-200 text-slate-800",
        NO_LYRICS: "bg-slate-200 text-slate-800",
        SPOTIFY_READY: "bg-blue-100 text-blue-800",
        SPOTIFY_PENDING: "bg-indigo-100 text-indigo-800",
        SPOTIFY_IN_DISTRIBUTION: "bg-amber-100 text-amber-800",
        SPOTIFY_PUBLISHED: "bg-emerald-100 text-emerald-800",
        SONGS_PENDING: "bg-fuchsia-100 text-fuchsia-800",
    };

    const setStatsTab = (tab: StatsTab) => {
        const targetTab = tab;
        const params = new URLSearchParams(searchParams.toString());
        if (targetTab !== "orders") {
            params.set("statsTab", targetTab);
        } else {
            params.delete("statsTab");
        }

        if (targetTab === "revisions") {
            (Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>).forEach((key) => {
                if (key === "status") return;
                params.delete(key);
            });
            params.set("status", "REVISION");
            params.set("melodyPreference", "ALL");
            params.set("page", "1");
        } else if (targetTab === "spotify") {
            (Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>).forEach((key) => {
                if (key === "status") return;
                params.delete(key);
            });
            params.set("status", "SPOTIFY_PENDING");
            params.set("page", "1");
        } else if (targetTab === "distrokid") {
            (Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>).forEach((key) => {
                if (key === "status") return;
                params.delete(key);
            });
            params.set("status", "SPOTIFY_READY");
            params.set("page", "1");
        } else {
            // Voltar para abas de pedidos: remove filtros específicos de revisão
            (Object.keys(DEFAULT_FILTERS) as Array<keyof typeof DEFAULT_FILTERS>).forEach((key) => {
                if (key === "search" || key === "searchMode" || key === "page" || key === "pageSize" || key === "genre" || key === "vocals" || key === "locale" || key === "plan" || key === "upsell" || key === "recoveryEmail" || key === "source") {
                    return;
                }

                params.delete(key);
            });

            if (params.get("status") === "REVISION") {
                params.delete("status");
            }
            params.set("page", "1");
        }
        window.history.pushState(null, "", params.toString() ? `?${params.toString()}` : window.location.pathname);
        window.dispatchEvent(new PopStateEvent("popstate"));
        setRowSelection({});
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                        Orders Management
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {data?.pagination.totalCount ?? 0} total records
                    </p>
                </div>
            </div>

            {/* Source tabs for lead statistics */}
            <section className="rounded-xl border border-slate-200 bg-[#111827] shadow-sm">
                <div className={`flex flex-col gap-3 px-5 py-3 border-b border-slate-200 sm:flex-row ${canViewFinancials ? "sm:items-center sm:justify-between" : "sm:justify-end"}`}>
                    {canViewFinancials ? (
                        <div>
                            <h3 className="text-xl font-semibold text-slate-900">Estatísticas de Pedidos</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Filtre por origem para comparar o desempenho</p>
                        </div>
                    ) : null}
                    <div className="w-full sm:w-auto">
                        <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1 gap-2">
                            {visibleStatsTabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setStatsTab(tab.key)}
                                className={`group inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 border ${
                                    activeStatsTab === tab.key ? tab.activeClass : tab.inactiveClass
                                }`}
                            >
                                <tab.icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${activeStatsTab === tab.key ? "scale-105" : "group-hover:scale-105"}`} />
                                {tab.label}
                                {tab.key === "spotify" &&
                                    stats?.pendingStreamingVipCount != null &&
                                    stats.pendingStreamingVipCount > 0 && (
                                        <span
                                            className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                activeStatsTab === "spotify" ? "bg-sky-900/40 text-sky-50" : "bg-sky-100 text-sky-700"
                                            }`}
                                        >
                                            {stats.pendingStreamingVipCount}
                                        </span>
                                    )}
                                {tab.key === "revisions" &&
                                    stats?.pendingRevisionsCount != null &&
                                    stats.pendingRevisionsCount > 0 && (
                                        <span
                                            className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                activeStatsTab === "revisions" ? "bg-amber-900/40 text-amber-50" : "bg-amber-100 text-amber-700"
                                            }`}
                                        >
                                            {stats.pendingRevisionsCount}
                                        </span>
                                    )}
                                {tab.key === "distrokid" &&
                                    stats?.readyStreamingVipCount != null &&
                                    stats.readyStreamingVipCount > 0 && (
                                        <span
                                            className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                activeStatsTab === "distrokid" ? "bg-emerald-900/40 text-emerald-50" : "bg-emerald-100 text-emerald-700"
                                            }`}
                                        >
                                            {stats.readyStreamingVipCount}
                                        </span>
                                        )}
                            </button>
                        ))}
                        </div>
                    </div>
                </div>
                {shouldShowStatsPanel ? (
                <div className="space-y-3 px-5 py-4">
                    {activeStatsTab === "orders" && (
                        <>
                            {canViewFinancials && <LocaleRevenueBar />}
                            <CompactStatsBar
                                activeStatusFilter={filters.status}
                                activeOrderTypeFilter={filters.orderType}
                                onToggleSpotifyPendingFilter={() => {
                                    if (filters.status === "SPOTIFY_PENDING") {
                                        resetFilters();
                                    } else {
                                        setFilters({ ...DEFAULT_FILTERS, status: "SPOTIFY_PENDING" });
                                    }
                                }}
                                onToggleSpotifyReadyFilter={() => {
                                    if (filters.status === "SPOTIFY_READY") {
                                        resetFilters();
                                    } else {
                                        setFilters({ ...DEFAULT_FILTERS, status: "SPOTIFY_READY" });
                                    }
                                }}
                                onToggleMusicianTipFilter={() => {
                                    if (filters.orderType === "MUSICIAN_TIP") {
                                        resetFilters();
                                    } else {
                                        setFilters({ ...DEFAULT_FILTERS, orderType: "MUSICIAN_TIP" });
                                    }
                                }}
                                onToggleSongsPendingFilter={() => {
                                    if (filters.status === "SONGS_PENDING") {
                                        resetFilters();
                                    } else {
                                        setFilters({ ...DEFAULT_FILTERS, status: "SONGS_PENDING" });
                                    }
                                }}
                                canViewFinancials={canViewFinancials}
                                showSpotifyDistroBlocks={false}
                            />

                            {activeStatsTab === "orders" && canViewFinancials && <RevenueChart />}
                        </>
                    )}
                    {activeStatsTab === "revisions" && (
                        <div className="space-y-3">
                            <RevisionStatsBar />
                            <div className="grid gap-2 sm:grid-cols-3">
                                <button
                                    onClick={() => setFilters({ melodyPreference: "ALL" })}
                                    className={`rounded-lg border px-3 py-2 text-left transition ${
                                        filters.melodyPreference === "ALL"
                                            ? "border-slate-400 bg-slate-100 ring-2 ring-slate-400/60"
                                            : "border-slate-200 bg-white hover:bg-slate-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Fila</p>
                                        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                                            {revisionTotalCount}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-800">Todas as revisões</p>
                                </button>
                                <button
                                    onClick={() => setFilters({ melodyPreference: "KEEP_CURRENT" })}
                                    className={`rounded-lg border px-3 py-2 text-left transition ${
                                        filters.melodyPreference === "KEEP_CURRENT"
                                            ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400/60"
                                            : "border-blue-200 bg-blue-50/50 hover:bg-blue-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">Manual</p>
                                        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800">
                                            {revisionKeepCurrentCount}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-blue-900">Manter melodia (opção 1/2)</p>
                                    <p className="text-xs font-medium text-blue-700">{revisionKeepCurrentPercent}% do total</p>
                                </button>
                                <button
                                    onClick={() => setFilters({ melodyPreference: "SUGGEST_NEW" })}
                                    className={`rounded-lg border px-3 py-2 text-left transition ${
                                        filters.melodyPreference === "SUGGEST_NEW"
                                            ? "border-violet-400 bg-violet-50 ring-2 ring-violet-400/60"
                                            : "border-violet-200 bg-violet-50/50 hover:bg-violet-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] uppercase tracking-wide text-violet-700 font-semibold">Automação</p>
                                        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-violet-200 px-2 py-0.5 text-xs font-bold text-violet-800">
                                            {revisionSuggestNewCount}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-violet-900">2 novas melodias</p>
                                    <p className="text-xs font-medium text-violet-700">{revisionSuggestNewPercent}% do total</p>
                                </button>
                            </div>
                        </div>
                    )}
                    {activeStatsTab === "spotify" && (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <button
                                onClick={() => setFilters({ status: "SPOTIFY_PENDING" })}
                                className={`group inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                                    filters.status === "SPOTIFY_PENDING"
                                        ? "border-sky-300 bg-sky-50 ring-2 ring-sky-500 shadow-sm"
                                        : "border-sky-200 bg-sky-50/70 hover:bg-sky-50"
                                }`}
                            >
                                <Radio className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-wide text-sky-700 font-medium">Spotify</p>
                                    <p className="text-2xl font-bold text-sky-900">{stats?.pendingStreamingVipCount ?? 0}</p>
                                    <p className="text-xs text-sky-700">Pendentes</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setFilters({ status: "SPOTIFY_IN_DISTRIBUTION" })}
                                className={`group inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                                    filters.status === "SPOTIFY_IN_DISTRIBUTION"
                                        ? "border-amber-300 bg-amber-50 ring-2 ring-amber-500 shadow-sm"
                                        : "border-amber-200 bg-amber-50/70 hover:bg-amber-50"
                                }`}
                            >
                                <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-wide text-amber-700 font-medium">Spotify</p>
                                    <p className="text-2xl font-bold text-amber-900">{stats?.inDistributionStreamingVipCount ?? 0}</p>
                                    <p className="text-xs text-amber-700">Em distribuição</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setFilters({ status: "SPOTIFY_PUBLISHED" })}
                                className={`group inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                                    filters.status === "SPOTIFY_PUBLISHED"
                                        ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-500 shadow-sm"
                                        : "border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50"
                                }`}
                            >
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-medium">Spotify</p>
                                    <p className="text-2xl font-bold text-emerald-900">{stats?.publishedStreamingVipCount ?? 0}</p>
                                    <p className="text-xs text-emerald-700">Publicados</p>
                                </div>
                            </button>
                        </div>
                    )}
                    {activeStatsTab === "distrokid" && (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <div
                                className={`group inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-left ${
                                    filters.status === "SPOTIFY_READY"
                                        ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-500 shadow-sm"
                                        : "border-emerald-200 bg-emerald-50/70"
                                }`}
                            >
                                <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-medium">DistroKid</p>
                                    <p className="text-2xl font-bold text-emerald-900">{stats?.readyStreamingVipCount ?? 0}</p>
                                    <p className="text-xs text-emerald-700">Prontos</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                ) : null}
            </section>

            {/* Filter Toolbar */}
            <FilterToolbar
                filters={{
                    search: filters.search,
                    searchMode: filters.searchMode,
                    status: filters.status,
                    revisionType: filters.revisionType,
                    revisionFault: filters.revisionFault,
                    melodyPreference: filters.melodyPreference,
                    genre: filters.genre,
                    vocals: filters.vocals,
                    locale: filters.locale,
                    plan: filters.plan,
                    upsell: filters.upsell,
                    recoveryEmail: filters.recoveryEmail,
                    source: filters.source,
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                }}
                onFiltersChange={setFilters}
                onReset={resetFilters}
                statusOptions={filterOptions?.statusCounts ?? []}
                genreOptions={filterOptions?.genres ?? []}
                sourceOptions={filterOptions?.sources ?? []}
                isLoading={isLoading}
            />

            {/* Bulk Actions Bar (shown when rows selected) */}
            {selectedIds.length > 0 && (
                <BulkActionsBar
                    selectedCount={selectedIds.length}
                    selectedIds={selectedIds}
                    onClearSelection={() => setRowSelection({})}
                />
            )}

            {/* Mobile list */}
            <div className="lg:hidden space-y-3">
                {isLoading ? (
                    <div className="rounded-xl border bg-[#111827] p-6 text-center text-slate-500">Carregando pedidos...</div>
                ) : !data?.items?.length ? (
                    <div className="rounded-xl border bg-[#111827] p-6 text-center text-slate-500">Nenhum resultado encontrado.</div>
                ) : (
                    data.items.map((lead) => {
                        const statusClass = mobileStatusStyles[lead.status] ?? "bg-slate-200 text-slate-800";
                        const isSelected = !!rowSelection[lead.id];
                        const localeFlag: Record<string, string> = {
                            pt: "🇧🇷",
                            en: "🇺🇸",
                            es: "🇪🇸",
                            fr: "🇫🇷",
                            it: "🇮🇹",
                        };

                        return (
                            <div
                                key={lead.id}
                                className={`rounded-xl border bg-[#111827] p-3 shadow-sm ${isSelected ? "border-amber-300 ring-2 ring-amber-200" : "border-slate-200"}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">
                                            {lead.recipientName || "Sem nome"}
                                        </p>
                                        <p className="text-xs text-slate-500 truncate">{lead.email || "Sem email"}</p>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                                        {lead.status}
                                    </span>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                                        <p className="text-charcoal/60">Data</p>
                                        <p className="font-medium text-slate-700">
                                            {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                                        <p className="text-charcoal/60">Idioma</p>
                                        <p className="font-medium text-slate-700">
                                            {localeFlag[lead.locale ?? "en"] ?? "🌐"} {lead.locale?.toUpperCase() ?? "EN"}
                                        </p>
                                    </div>
                                    <div className="col-span-2 rounded-lg bg-slate-50 px-2 py-1.5">
                                        <p className="text-charcoal/60">WhatsApp</p>
                                        <p className="font-medium text-slate-700 truncate">{lead.backupWhatsApp || "não informado"}</p>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                            checked={isSelected}
                                            onChange={(event) => {
                                                const checked = event.target.checked;
                                                setRowSelection((prev) => {
                                                    const next = { ...prev };
                                                    if (checked) {
                                                        next[lead.id] = true;
                                                    } else {
                                                        delete next[lead.id];
                                                    }
                                                    return next;
                                                });
                                            }}
                                        />
                                        Selecionar
                                    </label>
                                    <Button
                                        size="sm"
                                        className="h-8 bg-white hover:bg-white text-white text-xs"
                                        onClick={() => setMobileLeadDetails(lead)}
                                    >
                                        Abrir pedido
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Desktop table */}
            <div className="relative hidden lg:block border rounded-md bg-[#111827] shadow-sm overflow-x-auto w-full">
                {/* Loading overlay for refetch */}
                {isFetching && !isLoading && (
                    <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {isLoading ? (
                    <TableSkeleton rows={filters.pageSize} columns={6} showCheckbox />
                ) : (
                    <Table className="w-full table-fixed">
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <TableHead
                                            key={header.id}
                                            style={{ width: header.getSize() }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                        className={row.getIsSelected() ? "bg-amber-50" : ""}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={table.getVisibleFlatColumns().length}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        No results found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {mobileLeadDetails ? (
                <LeadDetailsDialog
                    lead={mobileLeadDetails}
                    open={!!mobileLeadDetails}
                    onClose={() => setMobileLeadDetails(null)}
                />
            ) : null}

            <Dialog
                open={isDistroKidSuccessModalOpen}
                onOpenChange={(open) => {
                    if (!open) closeDistroKidSuccessModal();
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-700">
                            <CheckCircle2 className="h-5 w-5" />
                            Upload Concluído!
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            A música <strong>{distroKidSuccessModalData?.songName || "a música"}</strong> foi enviada para o DistroKid.
                        </p>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-slate-500" />
                                <span className="font-medium text-slate-700">{distroKidSuccessModalData?.email || "—"}</span>
                            </div>
                            {distroKidSuccessModalData?.backupWhatsApp && (
                                <div className="flex items-center gap-2 text-sm">
                                    <MessageCircle className="h-4 w-4 text-green-600" />
                                    <span className="font-medium text-slate-700">{distroKidSuccessModalData.backupWhatsApp}</span>
                                </div>
                            )}
                        </div>

                        <p className="text-sm text-slate-500">Copie a mensagem abaixo para avisar o cliente:</p>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                                {getDistroKidWhatsAppMessage()}
                            </pre>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleCopyDistroKidMessage}
                                className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                                {distroKidMessageCopied ? (
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                ) : (
                                    <Copy className="h-4 w-4 mr-2" />
                                )}
                                {distroKidMessageCopied ? "Copiado!" : "Copiar Mensagem"}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={closeDistroKidSuccessModal}
                            >
                                Fechar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Pagination */}
            {data?.pagination && (
                <DataTablePagination
                    page={data.pagination.page}
                    pageSize={data.pagination.pageSize}
                    totalCount={data.pagination.totalCount}
                    totalPages={data.pagination.totalPages}
                    onPageChange={(page) => setFilters({ page })}
                    onPageSizeChange={(pageSize) => setFilters({ pageSize, page: 1 })}
                />
            )}
        </div>
    );
}

export default function LeadsPage() {
    return (
        <Suspense fallback={<TableSkeleton rows={20} columns={6} showCheckbox />}>
            <LeadsPageContent />
        </Suspense>
    );
}
