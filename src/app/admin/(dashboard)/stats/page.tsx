"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    PieChart,
    Pie,
    Cell,
} from "recharts";
import { Loader2, DollarSign, ShoppingBag, TrendingUp, Clock, Music, Globe, Sparkles, Users, Heart, Headphones, Repeat } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";

// Locale Revenue Bar Component
type LocaleRevenueStats = {
    netTodayEN?: number; netTodayPT?: number; netTodayES?: number; netTodayFR?: number; netTodayIT?: number;
    netYesterdayEN?: number; netYesterdayPT?: number; netYesterdayES?: number; netYesterdayFR?: number; netYesterdayIT?: number;
    net7DaysEN?: number; net7DaysPT?: number; net7DaysES?: number; net7DaysFR?: number; net7DaysIT?: number;
    netThisMonthEN?: number; netThisMonthPT?: number; netThisMonthES?: number; netThisMonthFR?: number; netThisMonthIT?: number;
};

function LocaleRevenueBar({ stats }: { stats: LocaleRevenueStats }) {
    const [period, setPeriod] = useState<"today" | "yesterday" | "7days" | "month">("today");

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

    const colorClasses: Record<string, { bg: string; border: string; text: string; textLight: string }> = {
        blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", textLight: "text-blue-600" },
        green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", textLight: "text-green-600" },
        amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", textLight: "text-amber-600" },
        purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", textLight: "text-purple-600" },
        red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", textLight: "text-red-600" },
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
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
                const c = colorClasses[locale.color]!;
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

const GENRE_COLORS: Record<string, string> = {
    // Universal
    pop: "#8884d8",
    country: "#82ca9d",
    rock: "#ffc658",
    rnb: "#ff7c43",
    jazz: "#a4de6c",
    blues: "#2563eb",
    "blues-melancholic": "#1e3a8a",
    "blues-upbeat": "#60a5fa",
    worship: "#d0ed57",
    hiphop: "#83a6ed",
    reggae: "#10b981",
    lullaby: "#f472b6",
    // Brazilian (PT)
    funk: "#f43f5e",
    "funk-carioca": "#fb7185",
    "funk-paulista": "#be123c",
    "funk-melody": "#f9a8d4",
    brega: "#e11d48",
    "brega-romantico": "#fb7185",
    tecnobrega: "#f97316",
    samba: "#8dd1e1",
    pagode: "#ffb6c1",
    "pagode-de-mesa": "#fecdd3",
    "pagode-romantico": "#fda4af",
    "pagode-universitario": "#fb7185",
    forro: "#f59e0b",
    "forro-pe-de-serra": "#f59e0b", // Legacy
    "forro-pe-de-serra-rapido": "#f59e0b",
    "forro-pe-de-serra-lento": "#ea580c",
    "forro-universitario": "#fbbf24",
    "forro-eletronico": "#d97706",
    "sertanejo-raiz": "#16a34a",
    "sertanejo-universitario": "#4ade80",
    "sertanejo-romantico": "#22c55e",
    "rock-classico": "#a3a3a3",
    "pop-rock-brasileiro": "#0f766e",
    "heavy-metal": "#525252",
    axe: "#ef4444",
    capoeira: "#9333ea",
    mpb: "#6366f1",
    "mpb-bossa-nova": "#2dd4bf",
    "mpb-cancao-brasileira": "#818cf8",
    "mpb-pop": "#f59e0b",
    "mpb-intimista": "#94a3b8",
    bossa: "#14b8a6",
    "jovem-guarda": "#0ea5e9",
    // Latin (ES)
    latina: "#38bdf8",
    salsa: "#f97316",
    merengue: "#22c55e",
    bachata: "#ec4899",
    bolero: "#f97316",
    cumbia: "#84cc16",
    ranchera: "#a855f7",
    balada: "#06b6d4",
    // French (FR)
    chanson: "#3b82f6",
    variete: "#8b5cf6",
    // Italian (IT)
    tarantella: "#dc2626",
    napoletana: "#f97316",
    lirico: "#7c3aed",
};

const genreLabels: Record<string, string> = {
    // Universal
    pop: "Pop",
    country: "Country/Sertanejo",
    rock: "Rock",
    rnb: "R&B/Black",
    jazz: "Jazz",
    blues: "American Blues",
    "blues-melancholic": "American Blues (Melancholic)",
    "blues-upbeat": "American Blues (Upbeat)",
    worship: "Worship/Gospel",
    hiphop: "Rap",
    reggae: "Reggae",
    lullaby: "Lullaby",
    // Brazilian (PT)
    funk: "Funk",
    "funk-carioca": "Funk Carioca",
    "funk-paulista": "Funk Paulista",
    "funk-melody": "Funk Melody",
    brega: "Brega",
    "brega-romantico": "Brega Romântico",
    tecnobrega: "Tecnobrega",
    samba: "Samba",
    pagode: "Pagode",
    "pagode-de-mesa": "Pagode de Mesa (Raiz)",
    "pagode-romantico": "Pagode Romântico (Anos 90)",
    "pagode-universitario": "Pagode Universitário / Novo Pagode",
    forro: "Forró",
    "sertanejo-raiz": "Sertanejo Raiz",
    "sertanejo-universitario": "Sertanejo Universitário",
    "sertanejo-romantico": "Sertanejo Romântico",
    "forro-pe-de-serra": "Forró Pé-de-Serra", // Legacy
    "forro-pe-de-serra-rapido": "Forró Pé-de-Serra (Dançante)",
    "forro-pe-de-serra-lento": "Forró Pé-de-Serra (Lento)",
    "forro-universitario": "Forró Universitário",
    "forro-eletronico": "Forró Eletrônico",
    "rock-classico": "Rock Clássico",
    "pop-rock-brasileiro": "Pop Rock Brasileiro",
    "heavy-metal": "Heavy Metal",
    axe: "Axé",
    capoeira: "Capoeira",
    mpb: "MPB",
    "mpb-bossa-nova": "MPB / Bossa Nova (Clássica)",
    "mpb-cancao-brasileira": "MPB Clássica / Canção Brasileira",
    "mpb-pop": "Pop MPB (Radiofônica)",
    "mpb-intimista": "MPB Intimista / Folk-Pop Brasileiro",
    bossa: "Bossa Nova",
    "jovem-guarda": "Jovem Guarda",
    // Latin (ES)
    latina: "Música Latina",
    salsa: "Salsa",
    merengue: "Merengue",
    bachata: "Bachata",
    bolero: "Bolero",
    cumbia: "Cumbia",
    ranchera: "Ranchera",
    balada: "Balada",
    // French (FR)
    chanson: "Chanson Française",
    variete: "Variété Française",
    // Italian (IT)
    tarantella: "Tarantella",
    napoletana: "Canzone Napoletana",
    lirico: "Lirico (Opera)",
};

const getGenreLabel = (genre: string) => genreLabels[genre] ?? genre;

const LOCALE_LABELS: Record<string, { emoji: string; name: string }> = {
    all: { emoji: "🌍", name: "All" },
    en: { emoji: "🇺🇸", name: "English" },
    pt: { emoji: "🇧🇷", name: "Português" },
    es: { emoji: "🇪🇸", name: "Español" },
    fr: { emoji: "🇫🇷", name: "Français" },
    it: { emoji: "🇮🇹", name: "Italiano" },
};

export default function StatsPage() {
    const { data: stats, isLoading } = api.admin.getStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000, // 5 minutes - aggregated stats don't change frequently
    });
    const [genreLocaleFilter, setGenreLocaleFilter] = useState<string>("all");

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!stats) return <div>Failed to load stats</div>;

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
    const formatRatioPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
    const kpiValueClass = "text-xl font-bold leading-none sm:text-2xl tabular-nums whitespace-nowrap";
    const kpiCardHeaderClass = "flex flex-row items-center justify-between space-y-0 pb-0";
    const kpiCardContentClass = "pt-0 space-y-0";
    const kpiCardClass = "gap-0";
    const headlineAbStats = stats.headlineAbStats;
    const headlineAbTotalTrackedLeads = headlineAbStats.variantA.leads + headlineAbStats.variantB.leads;
    const headlineAbLift = headlineAbStats.liftBvsA;
    const headlineAbLiftClass = headlineAbLift > 0
        ? "text-emerald-700"
        : headlineAbLift < 0
            ? "text-rose-700"
            : "text-slate-700";
    const headlineAbSignificance = headlineAbStats.significance;
    const headlineAbResultText = !headlineAbSignificance
        ? "Insufficient data"
        : headlineAbSignificance.isSignificant
            ? headlineAbSignificance.winner
                ? `Statistically significant winner: ${headlineAbSignificance.winner}`
                : "Statistically significant tie"
            : "No statistically significant winner yet";
    const headlineAbResultClass = !headlineAbSignificance
        ? "text-slate-700"
        : headlineAbSignificance.isSignificant
            ? "text-emerald-700"
            : "text-amber-700";

    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold tracking-tight">Statistics</h2>

            {/* Locale Revenue by Period */}
            <LocaleRevenueBar stats={stats} />

            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <Card className={`border-green-200 bg-green-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-green-800">Today</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-green-700`}>
                            {formatCurrency(stats.netToday)}
                        </div>
                        <p className="text-xs text-green-600">{stats.ordersToday} orders</p>
                    </CardContent>
                </Card>
                <Card className={kpiCardClass}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium">Yesterday</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={kpiValueClass}>
                            {formatCurrency(stats.netYesterday)}
                        </div>
                        <p className="text-xs text-muted-foreground">{stats.ordersYesterday} orders</p>
                    </CardContent>
                </Card>
                <Card className={`border-blue-200 bg-blue-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-blue-800">Last 7 Days</CardTitle>
                        <DollarSign className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-blue-700`}>
                            {formatCurrency(stats.netLast7Days)}
                        </div>
                        <p className="text-xs text-blue-600">{stats.ordersLast7Days} orders</p>
                    </CardContent>
                </Card>
                <Card className={`border-purple-200 bg-purple-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-purple-800">This Month</CardTitle>
                        <DollarSign className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-purple-700`}>
                            {formatCurrency(stats.netThisMonth)}
                        </div>
                        <p className="text-xs text-purple-600">{stats.ordersThisMonth} orders</p>
                    </CardContent>
                </Card>
                <Card className={`border-amber-200 bg-amber-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-amber-800">Last Month</CardTitle>
                        <DollarSign className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-amber-700`}>
                            {formatCurrency(stats.netLastMonth)}
                        </div>
                        <p className="text-xs text-amber-600">{stats.ordersLastMonth} orders</p>
                    </CardContent>
                </Card>
                <Card className={kpiCardClass}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass}`}>+{stats.totalOrders}</div>
                        <p className="text-xs text-muted-foreground">Completed orders</p>
                    </CardContent>
                </Card>
                <Card className={`border-orange-200 bg-orange-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-orange-800">Avg. Ticket</CardTitle>
                        <DollarSign className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-orange-700`}>
                            {formatCurrency(stats.averageTicket)}
                        </div>
                        <p className="text-xs text-orange-600">AOV (net)</p>
                    </CardContent>
                </Card>
                <Card className={`border-rose-200 bg-rose-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-rose-800">Musician Tips</CardTitle>
                        <Music className="h-4 w-4 text-rose-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-rose-700`}>
                            {formatCurrency(stats.musicianTipNet ?? 0)}
                        </div>
                        <p className="text-xs text-rose-600">Net USD</p>
                    </CardContent>
                </Card>
                <Card className={`border-emerald-200 bg-emerald-50 ${kpiCardClass}`}>
                    <CardHeader className={kpiCardHeaderClass}>
                        <CardTitle className="text-sm font-medium text-emerald-800">Conversion</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent className={kpiCardContentClass}>
                        <div className={`${kpiValueClass} text-emerald-700`}>
                            {stats.conversionRate.toFixed(1)}%
                        </div>
                        <p className="text-xs text-emerald-600">Form to paid</p>
                    </CardContent>
                </Card>
            </div>

            {/* Home Headline A/B Test */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        Home Headline A/B Test ({headlineAbStats.periodDays} days)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Metade dos visitantes vê a headline A e metade vê a B. Comparamos qual converte mais.
                    </p>
                </CardHeader>
                <CardContent>
                    {headlineAbTotalTrackedLeads > 0 ? (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                                    <p className="text-xs font-semibold text-blue-800">Variant A</p>
                                    <p className="mt-1 text-xs italic text-blue-600">
                                        &ldquo;Tudo Que Você Nunca Conseguiu Dizer… Agora Em Uma Canção.&rdquo;
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-blue-700">
                                        {formatRatioPercent(headlineAbStats.variantA.conversionRate)}
                                    </p>
                                    <p className="text-xs text-blue-700">
                                        {headlineAbStats.variantA.converted} converted / {headlineAbStats.variantA.leads} leads
                                    </p>
                                    <p className="mt-1 text-[10px] text-blue-500">
                                        De {headlineAbStats.variantA.leads} visitantes, {headlineAbStats.variantA.converted} compraram
                                    </p>
                                </div>
                                <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
                                    <p className="text-xs font-semibold text-violet-800">Variant B</p>
                                    <p className="mt-1 text-xs italic text-violet-600">
                                        &ldquo;Faça Alguém Chorar de Emoção Em Até 7 Dias&rdquo;
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-violet-700">
                                        {formatRatioPercent(headlineAbStats.variantB.conversionRate)}
                                    </p>
                                    <p className="text-xs text-violet-700">
                                        {headlineAbStats.variantB.converted} converted / {headlineAbStats.variantB.leads} leads
                                    </p>
                                    <p className="mt-1 text-[10px] text-violet-500">
                                        De {headlineAbStats.variantB.leads} visitantes, {headlineAbStats.variantB.converted} compraram
                                    </p>
                                </div>
                            </div>

                            {headlineAbStats.unknown.leads > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                    <span className="font-medium">Sem variante definida:</span> {headlineAbStats.unknown.converted} converted / {headlineAbStats.unknown.leads} leads
                                    ({formatRatioPercent(headlineAbStats.unknown.conversionRate)})
                                    <p className="mt-1 text-[10px] text-slate-500">
                                        Visitantes que entraram antes do teste ou por link direto, sem headline A/B atribuída.
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Lift (B - A)</p>
                                    <p className={`text-lg font-bold ${headlineAbLiftClass}`}>
                                        {headlineAbLift >= 0 ? "+" : ""}
                                        {formatRatioPercent(headlineAbLift)}
                                    </p>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        Quanto a versão B converte a mais (ou a menos) que a A em pontos percentuais.
                                    </p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">p-value</p>
                                    <p className="text-lg font-bold text-slate-700">
                                        {headlineAbSignificance ? headlineAbSignificance.pValue.toFixed(6) : "-"}
                                    </p>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        Chance de a diferença ser puro acaso. Abaixo de 0.05 = resultado confiável.
                                    </p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Result</p>
                                    <p className={`text-sm font-bold ${headlineAbResultClass}`}>
                                        {headlineAbResultText}
                                    </p>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        Se o p-value for &lt; 0.05, podemos declarar um vencedor com confiança estatística.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-6">
                            No A/B data available for this period
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Revenue (Last 30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.chartData}
                                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" tickFormatter={(str) => {
                                        const date = new Date(str);
                                        return `${date.getMonth() + 1}/${date.getDate()}`;
                                    }} />
                                    <YAxis tickFormatter={(val) => `$${val}`} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <Tooltip
                                        formatter={(value?: number) => [`$${(value ?? 0).toFixed(2)}`, "Revenue"]}
                                        labelFormatter={(label) => new Date(label).toDateString()}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="#8884d8"
                                        fillOpacity={1}
                                        fill="url(#colorRevenue)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Daily Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.chartData}>
                                    <XAxis dataKey="date"
                                        tickFormatter={(str) => {
                                            const date = new Date(str);
                                            return `${date.getDate()}`; // Just Day
                                        }}
                                    />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip
                                        labelFormatter={(label) => new Date(label).toDateString()}
                                    />
                                    <Bar dataKey="orders" fill="#adfa1d" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Hourly Sales Distribution */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        Sales by Hour (São Paulo Time)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.hourlyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11 }}
                                    interval={1}
                                />
                                <YAxis allowDecimals={false} />
                                <Tooltip
                                    formatter={(value) => [`${value} orders`]}
                                    labelFormatter={(label) => `${label}`}
                                    contentStyle={{
                                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "8px",
                                    }}
                                />
                                <Bar
                                    dataKey="orders"
                                    fill="#3b82f6"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                        Distribution of all completed orders by hour of day (GMT-3)
                    </p>
                </CardContent>
            </Card>

            {/* Genre and Language Statistics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {/* Genre Distribution */}
                <Card className="col-span-3">
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
                        <CardTitle className="flex items-center gap-2">
                            <Music className="h-5 w-5 text-muted-foreground" />
                            Orders by Genre
                        </CardTitle>
                        <Select value={genreLocaleFilter} onValueChange={setGenreLocaleFilter}>
                            <SelectTrigger className="w-full sm:w-[140px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(LOCALE_LABELS).map(([key, { emoji, name }]) => (
                                    <SelectItem key={key} value={key}>
                                        <span className="flex items-center gap-2">
                                            <span>{emoji}</span>
                                            <span>{name}</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const filteredGenreStats = stats.genreStatsByLocale?.[genreLocaleFilter] ?? stats.genreStats;
                            return filteredGenreStats.length > 0 ? (
                                <div className="flex flex-col lg:flex-row items-center gap-6">
                                    <div className="h-[280px] w-full lg:w-1/2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={filteredGenreStats}
                                                    dataKey="count"
                                                    nameKey="genre"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={100}
                                                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                                                    labelLine={false}
                                                >
                                                    {filteredGenreStats.map((entry) => (
                                                        <Cell
                                                            key={entry.genre}
                                                            fill={GENRE_COLORS[entry.genre] ?? "#94a3b8"}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value) => [value ?? 0, "orders"]}
                                                    labelFormatter={(label) => getGenreLabel(String(label))}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="w-full lg:w-1/2 space-y-2">
                                        {filteredGenreStats.map((item) => {
                                            const total = filteredGenreStats.reduce((acc, g) => acc + g.count, 0);
                                            const percent = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0";
                                            return (
                                                <div key={item.genre} className="flex items-center gap-3">
                                                    <div
                                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: GENRE_COLORS[item.genre] ?? "#94a3b8" }}
                                                    />
                                                    <span className="flex-1 text-sm">{getGenreLabel(item.genre)}</span>
                                                    <span className="text-sm font-medium">{item.count}</span>
                                                    <span className="text-sm text-muted-foreground w-12 text-right">
                                                        {percent}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-8">No genre data available</p>
                            );
                        })()}
                    </CardContent>
                </Card>

                {/* Language Distribution */}
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5 text-muted-foreground" />
                            Orders by Language
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const totalLang = stats.ordersEN + stats.ordersPT + stats.ordersES + stats.ordersFR + stats.ordersIT;
                            const localeData = [
                                { key: "en", emoji: "🇺🇸", name: "English", count: stats.ordersEN, color: "bg-blue-500" },
                                { key: "pt", emoji: "🇧🇷", name: "Português", count: stats.ordersPT, color: "bg-green-500" },
                                { key: "es", emoji: "🇪🇸", name: "Español", count: stats.ordersES, color: "bg-amber-500" },
                                { key: "fr", emoji: "🇫🇷", name: "Français", count: stats.ordersFR, color: "bg-purple-500" },
                                { key: "it", emoji: "🇮🇹", name: "Italiano", count: stats.ordersIT, color: "bg-red-500" },
                            ].sort((a, b) => b.count - a.count);

                            return (
                                <div className="space-y-4">
                                    {localeData.map((locale) => {
                                        const percent = totalLang > 0 ? ((locale.count / totalLang) * 100).toFixed(1) : "0";
                                        return (
                                            <div key={locale.key}>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="flex items-center gap-2">
                                                        <span className="text-lg">{locale.emoji}</span>
                                                        {locale.name}
                                                    </span>
                                                    <span className="font-medium">
                                                        {locale.count} ({percent}%)
                                                    </span>
                                                </div>
                                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${locale.color} rounded-full transition-all duration-500`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Total */}
                                    <div className="pt-4 border-t mt-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-muted-foreground">Total Orders</span>
                                            <span className="text-2xl font-bold">{totalLang}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>
            </div>

            {/* Order Bumps Ranking */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                        Order Bumps Ranking
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {stats.orderBumpStats && stats.orderBumpStats.length > 0 ? (
                        <div className="space-y-4">
                            {(() => {
                                const maxCount = Math.max(...stats.orderBumpStats.map(b => b.count), 1);
                                const totalBumps = stats.orderBumpStats.reduce((acc, b) => acc + b.count, 0);
                                return stats.orderBumpStats.map((bump, index) => {
                                    const percent = totalBumps > 0 ? ((bump.count / totalBumps) * 100).toFixed(1) : "0";
                                    const barWidth = maxCount > 0 ? (bump.count / maxCount) * 100 : 0;
                                    return (
                                        <div key={bump.name} className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl font-bold text-muted-foreground w-8">
                                                        #{index + 1}
                                                    </span>
                                                    <span className="font-medium">{bump.name}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-lg font-bold">{bump.count}</span>
                                                    <span className="text-sm text-muted-foreground ml-2">
                                                        ({percent}%)
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${barWidth}%`,
                                                        backgroundColor: bump.color,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                            <div className="pt-4 border-t mt-6 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Total Order Bumps Sold</span>
                                    <span className="text-2xl font-bold">
                                        {stats.orderBumpStats.reduce((acc, b) => acc + b.count, 0)}
                                    </span>
                                </div>
                                {stats.bumpAdoptionRate !== undefined && (
                                    <div className="flex justify-between items-center bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                                        <div>
                                            <span className="text-sm font-medium text-emerald-800">Bump Adoption Rate</span>
                                            <p className="text-xs text-emerald-600">
                                                {stats.customersWithAnyBump} of {stats.totalMainOrders} customers bought at least 1 bump
                                            </p>
                                        </div>
                                        <span className="text-2xl font-bold text-emerald-700">
                                            {stats.bumpAdoptionRate.toFixed(1)}%
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No order bump data available</p>
                    )}
                </CardContent>
            </Card>

            {/* Customer Rankings Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Top Spenders */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <DollarSign className="h-5 w-5 text-green-600" />
                            Top Spenders
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {stats.topSpenders && stats.topSpenders.length > 0 ? (
                            <div className="space-y-3">
                                {stats.topSpenders.map((customer, index) => (
                                    <div key={customer.email} className="flex items-center gap-3">
                                        <span className={`text-sm font-bold w-5 ${index === 0 ? "text-amber-500" : index === 1 ? "text-charcoal/60" : index === 2 ? "text-amber-700" : "text-charcoal/70"}`}>
                                            #{index + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                                            {customer.whatsapp && (
                                                <a
                                                    href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-[10px] text-green-600 hover:underline"
                                                >
                                                    {customer.whatsapp}
                                                </a>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-green-600">${customer.totalSpent.toFixed(0)}</p>
                                            <p className="text-[10px] text-muted-foreground">{customer.orderCount} orders</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-4 text-sm">No data</p>
                        )}
                    </CardContent>
                </Card>

                {/* Top Tip Donors */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Heart className="h-5 w-5 text-rose-500" />
                            Top Tip Donors
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {stats.topTipDonors && stats.topTipDonors.length > 0 ? (
                            <div className="space-y-3">
                                {stats.topTipDonors.map((customer, index) => (
                                    <div key={customer.email} className="flex items-center gap-3">
                                        <span className={`text-sm font-bold w-5 ${index === 0 ? "text-amber-500" : index === 1 ? "text-charcoal/60" : index === 2 ? "text-amber-700" : "text-charcoal/70"}`}>
                                            #{index + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                                            {customer.whatsapp && (
                                                <a
                                                    href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-[10px] text-green-600 hover:underline"
                                                >
                                                    {customer.whatsapp}
                                                </a>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-rose-500">${customer.totalTips.toFixed(0)}</p>
                                            <p className="text-[10px] text-muted-foreground">{customer.tipCount} tips</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-4 text-sm">No tips yet</p>
                        )}
                    </CardContent>
                </Card>

                {/* Top Streaming Buyers */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Headphones className="h-5 w-5 text-cyan-500" />
                            Top Spotify Buyers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {stats.topStreamingBuyers && stats.topStreamingBuyers.length > 0 ? (
                            <div className="space-y-3">
                                {stats.topStreamingBuyers.map((customer, index) => (
                                    <div key={customer.email} className="flex items-center gap-3">
                                        <span className={`text-sm font-bold w-5 ${index === 0 ? "text-amber-500" : index === 1 ? "text-charcoal/60" : index === 2 ? "text-amber-700" : "text-charcoal/70"}`}>
                                            #{index + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                                            {customer.whatsapp && (
                                                <a
                                                    href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-[10px] text-green-600 hover:underline"
                                                >
                                                    {customer.whatsapp}
                                                </a>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-cyan-500">${customer.totalSpent.toFixed(0)}</p>
                                            <p className="text-[10px] text-muted-foreground">{customer.purchaseCount} songs</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-4 text-sm">No streaming buyers</p>
                        )}
                    </CardContent>
                </Card>

                {/* Repeat Customers */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Repeat className="h-5 w-5 text-purple-500" />
                            Repeat Customers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {stats.repeatCustomers && stats.repeatCustomers.length > 0 ? (
                            <div className="space-y-3">
                                {stats.repeatCustomers.map((customer, index) => (
                                    <div key={customer.email} className="flex items-center gap-3">
                                        <span className={`text-sm font-bold w-5 ${index === 0 ? "text-amber-500" : index === 1 ? "text-charcoal/60" : index === 2 ? "text-amber-700" : "text-charcoal/70"}`}>
                                            #{index + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                                            {customer.whatsapp && (
                                                <a
                                                    href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-[10px] text-green-600 hover:underline"
                                                >
                                                    {customer.whatsapp}
                                                </a>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-purple-500">{customer.orderCount}</p>
                                            <p className="text-[10px] text-muted-foreground">songs</p>
                                        </div>
                                    </div>
                                ))}
                                {stats.repeatCustomerRate !== undefined && (
                                    <div className="pt-3 mt-3 border-t">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-muted-foreground">Repeat Rate</span>
                                            <span className="font-bold text-purple-600">{stats.repeatCustomerRate.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-4 text-sm">No repeat customers</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
