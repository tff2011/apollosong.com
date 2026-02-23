"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { formatInTimeZone } from "date-fns-tz";
import { type RouterOutputs, api } from "~/trpc/react";
import { Eye, Music, Loader2, Link2, Mail, Radio, Heart, Send, CheckCircle2, Lock, LockOpen, CloudUpload, MessageCircle, ImagePlus, Mic2 } from "lucide-react";

// Spotify icon component
const SpotifyIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
);
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { useState, useEffect, type ReactNode } from "react";
import { LeadDetailsDialog } from "./details-dialog";
import { toast } from "sonner";

// Type based on the return of getLeadsPaginated.items
export type Lead = RouterOutputs["admin"]["getLeadsPaginated"]["items"][number];
type LeadChildOrder = NonNullable<Lead["childOrders"]>[number];

type OrderTypeBadgeMeta = {
    label: string;
    orderBumpLabel?: string;
    pluralLabel?: string;
    className: string;
};

const ORDER_TYPE_BADGE_META: Record<string, OrderTypeBadgeMeta> = {
    MAIN: {
        label: "Main Order",
        className: "bg-slate-100 text-slate-800 border-slate-200",
    },
    EXTRA_SONG: {
        label: "Extra Song",
        orderBumpLabel: "OB: Extra Song",
        pluralLabel: "Extra Songs",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    GENRE_VARIANT: {
        label: "Genre Variant",
        orderBumpLabel: "OB: Genre Variant",
        pluralLabel: "Genre Variants",
        className: "bg-violet-100 text-violet-800 border-violet-200",
    },
    STREAMING_UPSELL: {
        label: "Streaming VIP",
        orderBumpLabel: "OB: Streaming VIP",
        pluralLabel: "Streaming VIP",
        className: "bg-sky-100 text-sky-800 border-sky-200",
    },
    LYRICS_UPSELL: {
        label: "Lyrics PDF",
        orderBumpLabel: "OB: Lyrics PDF",
        pluralLabel: "Lyrics PDFs",
        className: "bg-indigo-100 text-indigo-800 border-indigo-200",
    },
    KARAOKE_UPSELL: {
        label: "Karaoke",
        orderBumpLabel: "OB: Karaoke",
        pluralLabel: "Karaoke",
        className: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
    },
    MUSICIAN_TIP: {
        label: "Musician Tip",
        orderBumpLabel: "OB: Musician Tip",
        pluralLabel: "Musician Tips",
        className: "bg-rose-100 text-rose-800 border-rose-200",
    },
    FAST_DELIVERY: {
        label: "Fast Delivery",
        orderBumpLabel: "OB: Fast Delivery",
        pluralLabel: "Fast Delivery",
        className: "bg-amber-100 text-amber-800 border-amber-200",
    },
};

const ORDER_TYPE_BADGE_BASE_CLASS =
    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border";

const formatUnknownOrderType = (orderType: string): string =>
    orderType
        .toLowerCase()
        .split("_")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");

const getOrderTypeBadgeMeta = (orderType: string): OrderTypeBadgeMeta => {
    const mapped = ORDER_TYPE_BADGE_META[orderType];
    if (mapped) return mapped;

    const label = formatUnknownOrderType(orderType);
    return {
        label,
        orderBumpLabel: `OB: ${label}`,
        pluralLabel: `${label}s`,
        className: "bg-zinc-100 text-zinc-700 border-zinc-200",
    };
};

const getOrderTypeCountLabel = (orderType: string, count: number): string => {
    const meta = getOrderTypeBadgeMeta(orderType);
    if (count === 1) return meta.label;
    return meta.pluralLabel ?? `${meta.label}s`;
};

const normalizePlanType = (value: string | null | undefined): string =>
    String(value || "").trim().toLowerCase();

const getDeliveryPlanBadge = (
    lead: Pick<Lead, "hasFastDelivery" | "planType" | "parentOrder">
): { label: string; className: string } => {
    const parentOrder = lead.parentOrder as { planType?: string | null; hasFastDelivery?: boolean } | null | undefined;
    const planType = normalizePlanType(lead.planType);
    const parentPlanType = normalizePlanType(parentOrder?.planType);
    const isTurbo = planType === "acelerado" || parentPlanType === "acelerado";
    const isExpress = !isTurbo && Boolean(
        lead.hasFastDelivery ||
        planType === "express" ||
        parentOrder?.hasFastDelivery ||
        parentPlanType === "express"
    );

    if (isTurbo) {
        return {
            label: "Prazo 6h",
            className: "bg-violet-100 text-violet-800 border-violet-300",
        };
    }
    if (isExpress) {
        return {
            label: "Prazo 24h",
            className: "bg-rose-100 text-rose-800 border-rose-300",
        };
    }
    return {
        label: "Prazo 7 dias",
        className: "bg-slate-100 text-slate-600 border-slate-300",
    };
};

export const DISTROKID_SUCCESS_MODAL_EVENT = "distrokid-success-modal-change";

export type DistroKidSuccessModalDetail = {
    open: boolean;
    songName?: string;
    recipientName?: string;
    email?: string | null;
    backupWhatsApp?: string | null;
};

// Genre translations based on order locale
type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";
const genreTranslations: Record<string, Record<SupportedLocale, string>> = {
    // Universal genres
    pop: { en: "Pop", pt: "Pop", es: "Pop", fr: "Pop", it: "Pop" },
    rock: { en: "Rock", pt: "Rock", es: "Rock", fr: "Rock", it: "Rock" },
    "jovem-guarda": { en: "Jovem Guarda", pt: "Jovem Guarda", es: "Jovem Guarda", fr: "Jovem Guarda", it: "Jovem Guarda" },
    "rock-classico": { en: "Classic Rock", pt: "Rock Clássico", es: "Rock Clásico", fr: "Rock Classique", it: "Rock Classico" },
    "pop-rock-brasileiro": { en: "Brazilian Pop Rock", pt: "Pop Rock Brasileiro", es: "Pop Rock Brasileño", fr: "Pop Rock Brésilien", it: "Pop Rock Brasiliano" },
    "heavy-metal": { en: "Heavy Metal", pt: "Heavy Metal", es: "Heavy Metal", fr: "Heavy Metal", it: "Heavy Metal" },
    rnb: { en: "R&B", pt: "Black Music", es: "R&B / Soul", fr: "R&B / Soul", it: "R&B / Soul" },
    worship: { en: "Worship", pt: "Gospel", es: "Adoración", fr: "Louange", it: "Adorazione" },
    gospel: { en: "Worship", pt: "Gospel", es: "Adoración", fr: "Louange", it: "Adorazione" },
    hiphop: { en: "Hip-Hop", pt: "Rap", es: "Reggaetón / Hip-Hop", fr: "Rap Français", it: "Hip-Hop / Rap" },
    funk: { en: "Funk", pt: "Funk", es: "Funk", fr: "Funk", it: "Funk" },
    "funk-carioca": { en: "Funk Carioca", pt: "Funk Carioca", es: "Funk Carioca", fr: "Funk Carioca", it: "Funk Carioca" },
    "funk-paulista": { en: "Funk Paulista", pt: "Funk Paulista", es: "Funk Paulista", fr: "Funk Paulista", it: "Funk Paulista" },
    "funk-melody": { en: "Funk Melody", pt: "Funk Melody", es: "Funk Melody", fr: "Funk Melody", it: "Funk Melody" },
    brega: { en: "Brega", pt: "Brega", es: "Brega", fr: "Brega", it: "Brega" },
    "brega-romantico": { en: "Brega Romantico", pt: "Brega Romântico", es: "Brega Romántico", fr: "Brega Romantique", it: "Brega Romantico" },
    tecnobrega: { en: "Tecnobrega", pt: "Tecnobrega", es: "Tecnobrega", fr: "Tecnobrega", it: "Tecnobrega" },
    jazz: { en: "Jazz", pt: "Jazz", es: "Jazz", fr: "Jazz", it: "Jazz" },
    blues: { en: "American Blues", pt: "Blues Americano", es: "Blues Americano", fr: "Blues Américain", it: "Blues Americano" },
    "blues-melancholic": { en: "American Blues (Melancholic)", pt: "Blues Americano (Melancólico)", es: "Blues Americano (Melancólico)", fr: "Blues Américain (Mélancolique)", it: "Blues Americano (Malinconico)" },
    "blues-upbeat": { en: "American Blues (Upbeat)", pt: "Blues Americano (Alto Astral)", es: "Blues Americano (Animado)", fr: "Blues Américain (Enjoué)", it: "Blues Americano (Solare)" },
    country: { en: "Country", pt: "Sertanejo", es: "Country", fr: "Country", it: "Country" },
    reggae: { en: "Reggae", pt: "Reggae", es: "Reggae", fr: "Reggae", it: "Reggae" },
    lullaby: { en: "Lullaby", pt: "Canção de Ninar", es: "Canción de Cuna", fr: "Berceuse", it: "Ninna Nanna" },
    latina: { en: "Latin Music", pt: "Música Latina", es: "Música Latina", fr: "Musique Latine", it: "Musica Latina" },
    bolero: { en: "Bolero", pt: "Bolero", es: "Bolero", fr: "Bolero", it: "Bolero" },
    // Brazilian genres
    samba: { en: "Samba", pt: "Samba", es: "Samba", fr: "Samba", it: "Samba" },
    pagode: { en: "Pagode", pt: "Pagode", es: "Pagode", fr: "Pagode", it: "Pagode" },
    "pagode-de-mesa": { en: "Pagode de Mesa (Roots)", pt: "Pagode de Mesa (Raiz)", es: "Pagode de Mesa (Raiz)", fr: "Pagode de Mesa (Raiz)", it: "Pagode de Mesa (Raiz)" },
    "pagode-romantico": { en: "Pagode Romantico (90s)", pt: "Pagode Romântico (Anos 90)", es: "Pagode Romântico (Anos 90)", fr: "Pagode Romântico (Anos 90)", it: "Pagode Romântico (Anos 90)" },
    "pagode-universitario": { en: "Pagode Universitario / Novo Pagode", pt: "Pagode Universitário / Novo Pagode", es: "Pagode Universitário / Novo Pagode", fr: "Pagode Universitário / Novo Pagode", it: "Pagode Universitário / Novo Pagode" },
    forro: { en: "Forró", pt: "Forró", es: "Forró", fr: "Forró", it: "Forró" },
    "sertanejo-raiz": { en: "Sertanejo Raiz", pt: "Sertanejo Raiz", es: "Sertanejo Raiz", fr: "Sertanejo Raiz", it: "Sertanejo Raiz" },
    "sertanejo-universitario": { en: "Sertanejo Universitário", pt: "Sertanejo Universitário", es: "Sertanejo Universitário", fr: "Sertanejo Universitário", it: "Sertanejo Universitário" },
    "sertanejo-romantico": { en: "Sertanejo Romântico", pt: "Sertanejo Romântico", es: "Sertanejo Romântico", fr: "Sertanejo Romântico", it: "Sertanejo Romântico" },
    "forro-pe-de-serra": { en: "Forró Pé-de-Serra", pt: "Forró Pé-de-Serra", es: "Forró Pé-de-Serra", fr: "Forró Pé-de-Serra", it: "Forró Pé-de-Serra" }, // Legacy
    "forro-pe-de-serra-rapido": { en: "Forró Pé-de-Serra (Dançante)", pt: "Forró Pé-de-Serra (Dançante)", es: "Forró Pé-de-Serra (Bailable)", fr: "Forró Pé-de-Serra (Dansant)", it: "Forró Pé-de-Serra (Ballabile)" },
    "forro-pe-de-serra-lento": { en: "Forró Pé-de-Serra (Slow)", pt: "Forró Pé-de-Serra (Lento)", es: "Forró Pé-de-Serra (Lento)", fr: "Forró Pé-de-Serra (Lent)", it: "Forró Pé-de-Serra (Lento)" },
    "forro-universitario": { en: "Forró Universitário", pt: "Forró Universitário", es: "Forró Universitário", fr: "Forró Universitário", it: "Forró Universitário" },
    "forro-eletronico": { en: "Forró Eletrônico", pt: "Forró Eletrônico", es: "Forró Eletrônico", fr: "Forró Eletrônico", it: "Forró Eletrônico" },
    axe: { en: "Axé", pt: "Axé", es: "Axé", fr: "Axé", it: "Axé" },
    mpb: { en: "MPB", pt: "MPB", es: "MPB", fr: "MPB", it: "MPB" },
    "mpb-bossa-nova": { en: "MPB / Bossa Nova (Classic)", pt: "MPB / Bossa Nova (Clássica)", es: "MPB / Bossa Nova (Clásica)", fr: "MPB / Bossa Nova (Classique)", it: "MPB / Bossa Nova (Classica)" },
    "mpb-cancao-brasileira": { en: "Classic MPB / Brazilian Song", pt: "MPB Clássica / Canção Brasileira", es: "MPB Clásica / Canción Brasileña", fr: "MPB Classique / Chanson Brésilienne", it: "MPB Classica / Canzone Brasiliana" },
    "mpb-pop": { en: "Pop MPB", pt: "Pop MPB (Radiofônica)", es: "Pop MPB", fr: "Pop MPB", it: "Pop MPB" },
    "mpb-intimista": { en: "Intimate MPB / Brazilian Folk-Pop", pt: "MPB Intimista / Folk-Pop Brasileiro", es: "MPB Intimista / Folk-Pop Brasileño", fr: "MPB Intimiste / Folk-Pop Brésilien", it: "MPB Intimista / Folk-Pop Brasiliano" },
    bossa: { en: "Bossa Nova", pt: "Bossa Nova", es: "Bossa Nova", fr: "Bossa Nova", it: "Bossa Nova" },
    // Latin genres
    salsa: { en: "Salsa", pt: "Salsa", es: "Salsa", fr: "Salsa", it: "Salsa" },
    merengue: { en: "Merengue", pt: "Merengue", es: "Merengue", fr: "Merengue", it: "Merengue" },
    bachata: { en: "Bachata", pt: "Bachata", es: "Bachata", fr: "Bachata", it: "Bachata" },
    cumbia: { en: "Cumbia", pt: "Cumbia", es: "Cumbia", fr: "Cumbia", it: "Cumbia" },
    ranchera: { en: "Ranchera", pt: "Ranchera", es: "Ranchera", fr: "Ranchera", it: "Ranchera" },
    balada: { en: "Romantic Ballad", pt: "Balada Romântica", es: "Balada Romántica", fr: "Ballade Romantique", it: "Ballata Romantica" },
    // French genres
    chanson: { en: "French Chanson", pt: "Chanson Francesa", es: "Chanson Francesa", fr: "Chanson Française", it: "Chanson Francese" },
    variete: { en: "French Variété", pt: "Variété Francesa", es: "Variété Francesa", fr: "Variété Française", it: "Variété Francese" },
    // Italian genres
    tarantella: { en: "Tarantella", pt: "Tarantela", es: "Tarantela", fr: "Tarentelle", it: "Tarantella" },
    napoletana: { en: "Neapolitan Song", pt: "Canção Napolitana", es: "Canción Napolitana", fr: "Chanson Napolitaine", it: "Canzone Napoletana" },
    lirico: { en: "Operatic", pt: "Lírico", es: "Lírico", fr: "Lyrique", it: "Lirico" },
};

const getGenreLabel = (genre: string | null, locale: string | null): string => {
    if (!genre) return "—";
    const loc: SupportedLocale = locale === "pt" ? "pt" : locale === "es" ? "es" : locale === "fr" ? "fr" : locale === "it" ? "it" : "en";
    return genreTranslations[genre]?.[loc] ?? genre;
};

const getPreferredSongChoiceLabel = (revisionNotes: string | null | undefined): string | null => {
    if (!revisionNotes) return null;

    const patterns = [
        /vers[aã]o preferida:\s*([^\n]+)/i,
        /preferred version:\s*([^\n]+)/i,
    ];

    for (const pattern of patterns) {
        const match = revisionNotes.match(pattern);
        const value = match?.[1]?.trim();
        if (value) return value;
    }

    return null;
};

// Checkbox column for row selection
const selectColumn: ColumnDef<Lead> = {
    id: "select",
    size: 32,
    header: ({ table }) => (
        <Checkbox
            checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="translate-y-[2px]"
        />
    ),
    cell: ({ row }) => (
        <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-[2px]"
        />
    ),
    enableSorting: false,
    enableHiding: false,
};

// Row number column
const rowNumberColumn: ColumnDef<Lead> = {
    id: "rowNumber",
    size: 40,
    header: () => <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">#</span>,
    cell: ({ row, table }) => {
        // Get the pagination state to calculate the actual row number
        const { pageIndex, pageSize } = table.getState().pagination;
        const rowNumber = pageIndex * pageSize + row.index + 1;
        return (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-sm font-semibold tabular-nums text-slate-800 ring-1 ring-slate-200/80">
                {rowNumber}
            </span>
        );
    },
    enableSorting: false,
    enableHiding: false,
};

// Base columns without checkbox
export const baseColumns: ColumnDef<Lead>[] = [
    rowNumberColumn,
    {
        accessorKey: "createdAt",
        size: 90,
        header: "Date",
        cell: ({ row }) => {
            const createdAt = new Date(row.original.createdAt);
            const paidAt = row.original.paymentCompletedAt ? new Date(row.original.paymentCompletedAt) : null;
            const isPaid = row.original.status === "PAID" || row.original.status === "IN_PROGRESS" || row.original.status === "COMPLETED" || row.original.status === "REVISION";

            return (
                <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-700">
                        {formatInTimeZone(createdAt, "America/Sao_Paulo", "MMM d, yyyy")}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                        {formatInTimeZone(createdAt, "America/Sao_Paulo", "HH:mm")}
                    </span>
                    {isPaid && paidAt && (
                        <span className="text-[10px] text-green-600 mt-0.5" title="Data do pagamento">
                            💰 {formatInTimeZone(paidAt, "America/Sao_Paulo", "MMM d, HH:mm")}
                        </span>
                    )}
                </div>
            );
        },
    },
    {
        accessorKey: "locale",
        size: 32,
        header: "",
        cell: ({ row }) => {
            const locale = row.original.locale;
            const flags: Record<string, { emoji: string; title: string }> = {
                pt: { emoji: "🇧🇷", title: "Português" },
                es: { emoji: "🇪🇸", title: "Español" },
                fr: { emoji: "🇫🇷", title: "Français" },
                it: { emoji: "🇮🇹", title: "Italiano" },
                en: { emoji: "🇺🇸", title: "English" },
            };
            const flag = flags[locale ?? "en"] ?? flags.en!;
            return <span className="text-lg" title={flag!.title}>{flag!.emoji}</span>;
        },
    },
    {
        accessorKey: "email",
        size: 180,
        header: "Contact",
        cell: ({ row }) => {
            const method = row.original.paymentMethod;
            const price = row.original.priceAtOrder;
            const currency = row.original.currency;
            const canViewFinancials = row.original.canViewFinancials ?? false;

            const paymentLabels: Record<string, { icon: string; label: string }> = {
                card: { icon: "💳", label: "Card" },
                pix: { icon: "⚡", label: "PIX" },
                boleto: { icon: "📄", label: "Boleto" },
            };
            const paymentInfo = method ? paymentLabels[method] || { icon: "💰", label: method } : null;

            const symbols: Record<string, string> = { BRL: "R$", EUR: "€", USD: "$" };
            const symbol = symbols[currency ?? "USD"] ?? "$";
            let priceText = canViewFinancials && price ? `${symbol}${(price / 100).toFixed(2)}` : null;

            // Fix for Supabase import orders - fixed price
            if (canViewFinancials && (row.original.utmSource === "supabase-import" || row.original.utmSource === "supabase-convertido")) {
                priceText = "R$47.00";
            }

            const copyToClipboard = (text: string, label: string) => {
                navigator.clipboard.writeText(text);
                toast.success(`${label} copiado!`, { duration: 1500 });
            };

            return (
                <div className="flex flex-col gap-1 max-w-full overflow-hidden">
                    <span
                        className="font-mono text-xs text-slate-700 cursor-pointer hover:text-blue-600 hover:underline truncate"
                        onClick={() => copyToClipboard(row.original.email ?? "", "Email")}
                        title={row.original.email ?? "Clique para copiar email"}
                    >
                        {row.original.email}
                    </span>
                    <span
                        className="font-mono text-[10px] text-charcoal/60 cursor-pointer hover:text-blue-500 hover:underline truncate"
                        onClick={() => copyToClipboard(row.original.id, "Order ID")}
                        title={row.original.id}
                    >
                        {row.original.id}
                    </span>
                    {row.original.backupWhatsApp ? (
                        <span
                            className="text-[11px] text-slate-500 cursor-pointer hover:text-green-600 hover:underline"
                            onClick={() => copyToClipboard(row.original.backupWhatsApp ?? "", "WhatsApp")}
                            title="Clique para copiar WhatsApp"
                        >
                            {row.original.backupWhatsApp}
                        </span>
                    ) : (
                        <span className="text-[11px] text-orange-400">sem whatsapp</span>
                    )}
                    {(paymentInfo || priceText) && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            {paymentInfo && (
                                <span>{paymentInfo.icon} {paymentInfo.label}</span>
                            )}
                            {paymentInfo && priceText && <span className="text-charcoal/70">•</span>}
                            {priceText && (
                                <span className="font-mono font-medium text-emerald-600">{priceText}</span>
                            )}
                        </div>
                    )}
                    {row.original.couponCode && (
                        <span className="text-[11px] font-medium text-violet-600">
                            🏷️ {row.original.couponCode}
                            {row.original.couponDiscountPercent
                                ? ` (-${row.original.couponDiscountPercent}%)`
                                : row.original.couponDiscountAmount
                                    ? ` (-${symbol}${(row.original.couponDiscountAmount / 100).toFixed(2)})`
                                    : ""}
                        </span>
                    )}
                </div>
            );
        },
    },
    {
        accessorKey: "utmSource",
        size: 150,
        header: "UTM",
        cell: ({ row }) => {
            const source = row.original.utmSource;
            const medium = row.original.utmMedium;
            const campaign = row.original.utmCampaign;

            if (!source && !medium && !campaign) {
                return <span className="text-[10px] text-charcoal/60">—</span>;
            }

            // Build full tooltip
            const tooltipParts = [];
            if (source) tooltipParts.push(`src: ${source}`);
            if (medium) tooltipParts.push(`med: ${medium}`);
            if (campaign) tooltipParts.push(`camp: ${campaign}`);
            const tooltip = tooltipParts.join("\n");

            return (
                <div className="flex flex-col gap-0.5 max-w-full overflow-hidden" title={tooltip}>
                    {source && (
                        <span className="text-xs font-medium text-slate-700 truncate">
                            {source}
                        </span>
                    )}
                    {medium && (
                        <span className="text-[10px] text-slate-500 truncate">
                            {medium}
                        </span>
                    )}
                    {campaign && (
                        <span className="text-[10px] text-blue-600 font-mono truncate leading-tight">
                            {campaign}
                        </span>
                    )}
                </div>
            );
        },
    },
    {
        id: "songInfo",
        size: 150,
        header: "Song",
        cell: ({ row }) => {
            const name = row.original.recipientName || "—";
            const relationship = row.original.recipient;
            const genre = getGenreLabel(row.original.genre, row.original.locale);
            const vocals = row.original.vocals;

            const vocalsLabel = vocals === "male" ? "♂" : vocals === "female" ? "♀" : vocals === "either" ? "⚥" : null;
            const vocalsTitle = vocals === "male" ? "Male vocals" : vocals === "female" ? "Female vocals" : vocals === "either" ? "Either vocals" : "";

            return (
                <div className="flex flex-col gap-0.5 max-w-full overflow-hidden">
                    <span className="font-semibold text-slate-800 leading-tight truncate capitalize" title={name}>{name}</span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        {relationship && (
                            <>
                                <span className="capitalize">{relationship}</span>
                                <span className="text-charcoal/70">•</span>
                            </>
                        )}
                        <span className="text-violet-600 font-medium">{genre}</span>
                        {vocalsLabel && (
                            <>
                                <span className="text-charcoal/70">•</span>
                                <span className="text-slate-600" title={vocalsTitle}>{vocalsLabel}</span>
                            </>
                        )}
                    </div>
                </div>
            );
        },
    },
    {
        accessorKey: "status",
        size: 170,
        header: "Status",
        cell: ({ row }) => {
            const status = row.getValue("status") as string;
            const revisionType = row.original.revisionType;
            const revisionFault = row.original.revisionFault;
            const revisionCount = row.original.revisionCount ?? 0;
            const revisionLockedBy = row.original.revisionLockedBy;
            const revisionLockedAt = row.original.revisionLockedAt;
            const revisionRequestedAt = row.original.revisionRequestedAt;
            const revisionCompletedBy = row.original.revisionCompletedBy;
            const supabasePaidAt = row.original.supabasePaidAt;
            const isSupabaseLead = row.original.sessionId?.startsWith("supabase:");

            const sunoAccountEmail = row.original.sunoAccountEmail;
            const deliveryPlanBadge = getDeliveryPlanBadge(row.original);

            // Streaming VIP ready for DistroKid check
            const orderType = row.original.orderType;
            const streamingSongName = row.original.streamingSongName;
            const streamingCoverUrl = row.original.streamingCoverUrl;
            const preferredSongForStreaming = row.original.preferredSongForStreaming;
            const coverApproved = row.original.coverApproved;
            const isStreamingReadyForDistroKid =
                orderType === "STREAMING_UPSELL" &&
                status === "PAID" &&
                !!streamingSongName &&
                !!streamingCoverUrl &&
                !!coverApproved &&
                !!preferredSongForStreaming;

            // Calculate waiting time for revision
            const getWaitingTime = () => {
                if (status !== "REVISION" || !revisionRequestedAt) return null;
                const start = new Date(revisionRequestedAt).getTime();
                const elapsed = Date.now() - start;
                const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
                const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                if (days > 0) return `${days}d ${hours}h`;
                return `${hours}h`;
            };
            const waitingTime = getWaitingTime();
            const waitingDays = revisionRequestedAt
                ? Math.floor((Date.now() - new Date(revisionRequestedAt).getTime()) / (1000 * 60 * 60 * 24))
                : 0;

            // Revision type config
            const REVISION_TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
                PRONUNCIATION: { emoji: "🎤", label: "Pronúncia", color: "bg-purple-100 text-purple-800 border-purple-300" },
                NAME_ERROR: { emoji: "📛", label: "Nome", color: "bg-red-100 text-red-800 border-red-300" },
                LYRICS_ERROR: { emoji: "📝", label: "Letra", color: "bg-amber-100 text-amber-800 border-amber-300" },
                STYLE_CHANGE: { emoji: "🎨", label: "Estilo", color: "bg-cyan-100 text-cyan-800 border-cyan-300" },
                QUALITY_ISSUE: { emoji: "🔊", label: "Qualidade", color: "bg-slate-100 text-slate-800 border-slate-300" },
                OTHER: { emoji: "❓", label: "Outro", color: "bg-[#111827]/60 text-[#F0EDE6] border-gray-300" },
            };

            // Revision fault (responsibility) config
            const REVISION_FAULT_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
                OUR_FAULT: { emoji: "🆓", label: "Grátis", color: "bg-green-100 text-green-800 border-green-300" },
                CLIENT_FAULT: { emoji: "💰", label: "R$39,90", color: "bg-red-100 text-red-800 border-red-300" },
                UNCLEAR: { emoji: "❓", label: "Analisar", color: "bg-[#111827]/60 text-[#F0EDE6] border-gray-300" },
            };

            const STATUS_LABELS: Record<string, string> = {
                PAID: "Pago",
                COMPLETED: "Concluído",
                PENDING: "Pendente",
                IN_PROGRESS: "Em produção",
                REVISION: "Revisão",
                CANCELLED: "Cancelado",
                REFUNDED: "Reembolsado",
                STUCK: "Travado",
                NO_LYRICS: "Sem letra",
                SPOTIFY_READY: "Distro pronto",
                SPOTIFY_PENDING: "Distro pendente",
                SONGS_PENDING: "Música pendente",
            };
            const statusLabel = STATUS_LABELS[status] ?? status;

            const STATUS_STYLE: Record<string, { bg: string; border: string; text: string }> = {
                PAID: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
                COMPLETED: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900" },
                PENDING: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900" },
                IN_PROGRESS: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-900" },
                REVISION: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-900" },
                CANCELLED: { bg: "bg-red-50", border: "border-red-200", text: "text-red-900" },
                REFUNDED: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-900" },
                STUCK: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-800" },
                NO_LYRICS: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-800" },
                SPOTIFY_READY: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900" },
                SPOTIFY_PENDING: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-900" },
                SONGS_PENDING: { bg: "bg-fuchsia-50", border: "border-fuchsia-200", text: "text-fuchsia-900" },
            };
            const statusStyle = STATUS_STYLE[status] ?? { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-800" };

            const revisionConfig = revisionType ? REVISION_TYPE_CONFIG[revisionType] : null;
            const faultConfig = revisionFault ? REVISION_FAULT_CONFIG[revisionFault] : null;

            // Format lock time for tooltip
            const lockTimeFormatted = revisionLockedAt
                ? formatInTimeZone(new Date(revisionLockedAt), "America/Sao_Paulo", "dd/MM HH:mm")
                : null;

            const statusBadgeClass = `${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`;
            const statusTagClasses =
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border";
            const waitingBadgeClass =
                waitingDays >= 3
                    ? "bg-rose-100 text-rose-900"
                    : waitingDays >= 1
                        ? "bg-amber-100 text-amber-900"
                        : "bg-sky-100 text-sky-900";

            return (
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`${statusTagClasses} ${statusBadgeClass}`}>
                            <span>{statusLabel}</span>
                            {status === "REVISION" && revisionCount > 0 ? (
                                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{`#${revisionCount}`}</span>
                            ) : revisionCount > 0 ? (
                                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{`${revisionCount} rev.`}</span>
                            ) : null}
                            {status === "REVISION" && waitingTime && (
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${waitingBadgeClass}`}
                                    title={`Tempo em revisão: ${waitingTime}`}
                                >
                                    {waitingTime}
                                </span>
                            )}
                        </span>
                        {orderType !== "STREAMING_UPSELL" && (
                            <span
                                className={`${statusTagClasses} ${deliveryPlanBadge.className}`}
                            >
                                {deliveryPlanBadge.label}
                            </span>
                        )}
                        {isSupabaseLead && (
                            <span
                                className={`${statusTagClasses} ${supabasePaidAt
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : "bg-slate-100 text-slate-600 border-slate-300"
                                }`}
                                title={supabasePaidAt ? "Pago no Supabase" : "Não pago no Supabase"}
                            >
                                Supabase {supabasePaidAt ? "Pago" : "Pendente"}
                            </span>
                        )}
                        {revisionCount > 0 && status !== "REVISION" && (
                            <span
                                className={`${statusTagClasses} border-amber-300 bg-amber-100 text-amber-900`}
                                title={`${revisionCount} revisão(ões) já realizada(s) - ${revisionCompletedBy || "Antigo"}`}
                            >
                                {revisionCount} revisões
                                <span className="font-bold text-amber-950">• {revisionCompletedBy || "Antigo"}</span>
                            </span>
                        )}
                        {status === "REVISION" && revisionLockedBy && (
                            <span
                                className={`${statusTagClasses} border-amber-300 bg-amber-50 text-amber-900`}
                                title={`Travado por ${revisionLockedBy} às ${lockTimeFormatted}`}
                            >
                                <Lock className="h-3.5 w-3.5 shrink-0" />
                                <span>Travado por</span>
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 whitespace-nowrap">
                                    {revisionLockedBy}
                                </span>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {status === "IN_PROGRESS" && orderType !== "STREAMING_UPSELL" && sunoAccountEmail && (
                            <span className="inline-flex max-w-[220px] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                {sunoAccountEmail}
                            </span>
                        )}
                        {status === "REVISION" && revisionConfig && (
                            <span
                                className={`${statusTagClasses} ${revisionConfig.color}`}
                                title={`Tipo: ${revisionConfig.label}`}
                            >
                                <span>{revisionConfig.emoji}</span>
                                <span>{revisionConfig.label}</span>
                            </span>
                        )}
                        {status === "REVISION" && faultConfig && (
                            <span
                                className={`${statusTagClasses} ${faultConfig.color}`}
                                title={`Responsabilidade: ${faultConfig.label}`}
                            >
                                <span>{faultConfig.emoji}</span>
                                <span>{faultConfig.label}</span>
                            </span>
                        )}
                        {isStreamingReadyForDistroKid && row.original.parentOrder?.status !== "REVISION" && (
                            <span
                                className={`${statusTagClasses} border-emerald-300 bg-emerald-50 text-emerald-900`}
                                title="Todos os dados preenchidos: nome, capa e música selecionada"
                            >
                                <span>🚀</span>
                                <span>Pronto para DistroKid</span>
                            </span>
                        )}
                        {orderType === "STREAMING_UPSELL" && status === "PAID" && !!streamingCoverUrl && !coverApproved && row.original.parentOrder?.status !== "REVISION" && (
                            <span
                                className={`${statusTagClasses} border-amber-300 bg-amber-50 text-amber-900`}
                                title="Capa enviada, aguardando aprovação do cliente via WhatsApp"
                            >
                                <span>⏳</span>
                                <span>Aguardando aprovação da capa</span>
                            </span>
                        )}
                        {orderType === "STREAMING_UPSELL" && row.original.parentOrder?.status === "REVISION" && (
                            <span
                                className={`${statusTagClasses} border-pink-300 bg-pink-50 text-pink-900`}
                                title="A música original está em revisão. Aguarde a conclusão antes de publicar."
                            >
                                <span>⏸️</span>
                                <span>Música em revisão</span>
                            </span>
                        )}
                        {orderType === "STREAMING_UPSELL" && status === "PAID" && !isStreamingReadyForDistroKid && (
                            <>
                                {!preferredSongForStreaming && (
                                    <span className={`${statusTagClasses} border-amber-300 bg-amber-50 text-amber-900`}>
                                        <span>❌</span> <span>Falta música preferida</span>
                                    </span>
                                )}
                                {!streamingSongName && (
                                    <span className={`${statusTagClasses} border-orange-300 bg-orange-50 text-orange-900`}>
                                        <span>❌</span> <span>Falta escolher nome</span>
                                    </span>
                                )}
                                {!streamingCoverUrl && (
                                    <span className={`${statusTagClasses} border-red-300 bg-red-50 text-red-900`}>
                                        <span>❌</span> <span>Falta capa</span>
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            );
        },
    },
    {
        id: "revisionFlow",
        size: 170,
        header: "Fluxo Revisão",
        cell: ({ row }) => {
            const status = row.original.status;
            const melodyPreference = row.original.melodyPreference;

            if (status !== "REVISION") {
                return <span className="text-[10px] text-charcoal/60">—</span>;
            }

            const preferredChoiceLabel = getPreferredSongChoiceLabel(row.original.revisionNotes);
            const preferredChoiceDisplay = preferredChoiceLabel && preferredChoiceLabel.length > 36
                ? `${preferredChoiceLabel.slice(0, 36)}...`
                : preferredChoiceLabel;

            if (melodyPreference === "KEEP_CURRENT") {
                return (
                    <div className="flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-900">
                            🎵 Manual
                        </span>
                        <span className="text-[11px] font-medium text-blue-800">
                            Manter melodia
                            {preferredChoiceDisplay ? ` (${preferredChoiceDisplay})` : ""}
                        </span>
                    </div>
                );
            }

            if (melodyPreference === "SUGGEST_NEW") {
                return (
                    <div className="flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-900">
                            🎶 Automação
                        </span>
                        <span className="text-[11px] font-medium text-violet-800">
                            2 novas melodias
                        </span>
                    </div>
                );
            }

            return (
                <div className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        ❓ Sem definição
                    </span>
                    <span className="text-[11px] font-medium text-slate-600">
                        Revisar manualmente
                    </span>
                </div>
            );
        },
    },
    {
        id: "recoveryEmails",
        size: 60,
        header: "Follow-up",
        cell: ({ row }) => {
            const sentEmails = row.original.sentEmails ?? [];
            const childOrders = row.original.childOrders ?? [];
            const recoveryEmails = sentEmails.filter((email) => email.template === "CART_ABANDONMENT");
            const streamingEmails = sentEmails.filter((email) => email.template === "STREAMING_VIP_REMINDER");
            const childStreamingEmails = childOrders.flatMap((child) =>
                (child.sentEmails ?? []).filter((email) => email.template === "STREAMING_VIP_REMINDER")
            );
            const streamingAllEmails = [...streamingEmails, ...childStreamingEmails];

            // Musician tip reminder emails (from MUSICIAN_TIP child orders)
            const musicianTipEmails = childOrders
                .filter((child) => child.orderType === "MUSICIAN_TIP")
                .flatMap((child) => (child.sentEmails ?? []).filter((email) => email.template === "MUSICIAN_TIP_REMINDER"));

            if (recoveryEmails.length === 0 && streamingAllEmails.length === 0 && musicianTipEmails.length === 0) {
                return <span className="text-[10px] text-charcoal/60">—</span>;
            }

            const formatLastSent = (emails: { createdAt: Date | string }[]) => {
                if (emails.length === 0 || !emails[0]) return null;
                const latest = emails.reduce((max, email) => {
                    const current = new Date(email.createdAt);
                    return current > max ? current : max;
                }, new Date(emails[0].createdAt));
                return formatInTimeZone(latest, "America/Sao_Paulo", "MMM d, HH:mm");
            };

            const recoveryLast = formatLastSent(recoveryEmails);
            const streamingLast = formatLastSent(streamingAllEmails);
            const streamingChildOnly = streamingEmails.length === 0 && childStreamingEmails.length > 0;
            const musicianTipLast = formatLastSent(musicianTipEmails);

            return (
                <div className="flex items-center gap-2">
                    {recoveryEmails.length > 0 && (
                        <div
                            className="relative"
                            title={recoveryLast ? `Email de recuperação enviado ${recoveryEmails.length}x - último ${recoveryLast}` : `Email de recuperação enviado ${recoveryEmails.length}x`}
                        >
                            <Mail className="h-4 w-4 text-amber-600" />
                            {recoveryEmails.length > 1 && (
                                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center">
                                    {recoveryEmails.length}
                                </span>
                            )}
                        </div>
                    )}
                    {streamingAllEmails.length > 0 && (
                        <div
                            className="relative"
                            title={
                                streamingLast
                                    ? `Email Streaming VIP enviado ${streamingAllEmails.length}x - último ${streamingLast}${streamingChildOnly ? " (child order)" : ""}`
                                    : `Email Streaming VIP enviado ${streamingAllEmails.length}x`
                            }
                        >
                            <Radio className="h-4 w-4 text-sky-600" />
                            {streamingAllEmails.length > 1 && (
                                <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center">
                                    {streamingAllEmails.length}
                                </span>
                            )}
                        </div>
                    )}
                    {musicianTipEmails.length > 0 && (
                        <div
                            className="relative"
                            title={
                                musicianTipLast
                                    ? `Lembrete doação músicos enviado ${musicianTipEmails.length}x - último ${musicianTipLast}`
                                    : `Lembrete doação músicos enviado ${musicianTipEmails.length}x`
                            }
                        >
                            <Heart className="h-4 w-4 text-rose-500" />
                            {musicianTipEmails.length > 1 && (
                                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center">
                                    {musicianTipEmails.length}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            );
        },
    },
    {
        accessorKey: "lyricsStatus",
        size: 32,
        header: "",
        cell: ({ row }) => {
            const lyricsStatus = row.original.lyricsStatus;

            if (lyricsStatus === "completed") {
                return (
                    <span title="Lyrics generated">
                        <Music className="h-4 w-4 text-emerald-600" />
                    </span>
                );
            }
            if (lyricsStatus === "generating") {
                return (
                    <span title="Generating lyrics...">
                        <Music className="h-4 w-4 text-amber-500 animate-pulse" />
                    </span>
                );
            }
            if (lyricsStatus === "failed") {
                return (
                    <span title="Lyrics generation failed">
                        <Music className="h-4 w-4 text-red-500" />
                    </span>
                );
            }
            return null;
        },
    },
    {
        id: "spotifyLink",
        size: 32,
        header: "",
        cell: ({ row }) => {
            const spotifyUrl = row.original.spotifyUrl;
            const streamingSongName = row.original.streamingSongName;

            if (!spotifyUrl) return null;

            return (
                <a
                    href={spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={streamingSongName ? `Ouvir "${streamingSongName}" no Spotify` : "Abrir no Spotify"}
                    className="group flex items-center justify-center w-8 h-8 rounded-full bg-[#1DB954]/10 hover:bg-[#1DB954] transition-all duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <SpotifyIcon className="h-4 w-4 text-[#1DB954] group-hover:text-white transition-colors" />
                </a>
            );
        },
    },
    {
        accessorKey: "orderType",
        size: 130,
        header: "Type",
        cell: ({ row }) => {
            const orderType = row.original.orderType;
            const orderTypeMeta = getOrderTypeBadgeMeta(orderType);
            const hasFastDelivery = row.original.hasFastDelivery;
            const hasCertificate = row.original.hasCertificate;
            const hasLyrics = row.original.hasLyrics;
            const childOrders = row.original.childOrders;
            const parentOrder = row.original.parentOrder;
            const streamingSongName = row.original.streamingSongName;
            const preferredSongForStreaming = row.original.preferredSongForStreaming;
            const orderBumpLabel = orderTypeMeta.orderBumpLabel ?? `OB: ${orderTypeMeta.label}`;

            // Child order (order bump) - show specific type
            if (orderType !== "MAIN") {
                // Determine which option was chosen
                const preferredOption = preferredSongForStreaming
                    ? preferredSongForStreaming === parentOrder?.songFileUrl
                        ? "1"
                        : preferredSongForStreaming === parentOrder?.songFileUrl2
                            ? "2"
                            : null
                    : null;

                return (
                    <div className="flex flex-col gap-1">
                        <span className={`${ORDER_TYPE_BADGE_BASE_CLASS} ${orderTypeMeta.className}`}>
                            {orderBumpLabel}
                        </span>
                        {parentOrder && (
                            <span className="text-[10px] text-slate-500">
                                Parent: {parentOrder.recipientName}
                            </span>
                        )}
                        {orderType === "STREAMING_UPSELL" && (
                            <span className="text-[10px] text-slate-500">
                                {streamingSongName ? (
                                    <>
                                        &ldquo;{streamingSongName}&rdquo;
                                        {preferredOption && (
                                            <span className="ml-1 text-green-600 font-medium">(Opção {preferredOption})</span>
                                        )}
                                    </>
                                ) : preferredOption ? (
                                    <span className="text-green-600">Opção {preferredOption} escolhida</span>
                                ) : (
                                    <span className="text-amber-600">Aguardando escolha</span>
                                )}
                            </span>
                        )}
                    </div>
                );
            }

            // Main order with possible add-ons - show mapped badges by type
            const badges: ReactNode[] = [
                <span key="main" className={`${ORDER_TYPE_BADGE_BASE_CLASS} ${getOrderTypeBadgeMeta("MAIN").className}`}>
                    {getOrderTypeBadgeMeta("MAIN").label}
                </span>,
            ];

            if (hasFastDelivery) {
                badges.push(
                    <span key="fast-main" className={`${ORDER_TYPE_BADGE_BASE_CLASS} ${getOrderTypeBadgeMeta("FAST_DELIVERY").className}`}>
                        {getOrderTypeBadgeMeta("FAST_DELIVERY").label}
                    </span>
                );
            }

            if (hasCertificate) {
                badges.push(
                    <span key="cert" className={`${ORDER_TYPE_BADGE_BASE_CLASS} bg-yellow-100 text-yellow-800 border-yellow-200`}>
                        Certificate
                    </span>
                );
            }

            if (hasLyrics) {
                badges.push(
                    <span key="lyrics" className={`${ORDER_TYPE_BADGE_BASE_CLASS} ${getOrderTypeBadgeMeta("LYRICS_UPSELL").className}`}>
                        Lyrics PDF
                    </span>
                );
            }

            // Show each child order type as separate badge
            if (childOrders && childOrders.length > 0) {
                const childTypeCounts = childOrders.reduce<Record<string, number>>((acc, child: LeadChildOrder) => {
                    const childType = child.orderType ?? "UNKNOWN";
                    acc[childType] = (acc[childType] ?? 0) + 1;
                    return acc;
                }, {});

                const orderedChildTypes = ["EXTRA_SONG", "GENRE_VARIANT", "STREAMING_UPSELL", "LYRICS_UPSELL", "KARAOKE_UPSELL", "MUSICIAN_TIP", "FAST_DELIVERY"];
                const renderedTypes = new Set<string>();

                const appendChildBadge = (childType: string, count: number) => {
                    if (count <= 0) return;
                    badges.push(
                        <span key={`child-${childType}`} className={`${ORDER_TYPE_BADGE_BASE_CLASS} ${getOrderTypeBadgeMeta(childType).className}`}>
                            +{count} {getOrderTypeCountLabel(childType, count)}
                        </span>
                    );
                    renderedTypes.add(childType);
                };

                for (const childType of orderedChildTypes) {
                    appendChildBadge(childType, childTypeCounts[childType] ?? 0);
                }

                for (const [childType, count] of Object.entries(childTypeCounts)) {
                    if (renderedTypes.has(childType)) continue;
                    appendChildBadge(childType, count);
                }
            }

            return <div className="flex flex-col gap-1">{badges}</div>;
        },
    },
    {
        accessorKey: "stripeNetAmount",
        size: 70,
        header: "Net (USD)",
        cell: ({ row }) => {
            const canViewFinancials = row.original.canViewFinancials ?? false;
            if (!canViewFinancials) {
                return <span className="text-[10px] text-charcoal/60">—</span>;
            }

            const net = row.original.stripeNetAmount;
            const isPaid = row.original.status === "PAID" || row.original.status === "IN_PROGRESS" || row.original.status === "COMPLETED";

            // stripeNetAmount is already in USD cents from Stripe balance transaction
            if (isPaid && net !== null) {
                const netUsd = net / 100;
                return (
                    <span className="font-mono text-xs font-semibold text-green-700">
                        ${netUsd.toFixed(2)}
                    </span>
                );
            }

            return <span className="text-[10px] text-charcoal/60">—</span>;
        },
    },
    {
        id: "actions",
        size: 120,
        header: "",
        cell: ({ row }) => <ActionsCell lead={row.original} />,
    },
];

// Columns with checkbox for row selection
export const columns: ColumnDef<Lead>[] = [selectColumn, ...baseColumns];

// Helper to check if urgent email was sent (localStorage)
const URGENT_EMAIL_SENT_KEY = "streaming-urgent-emails-sent";

function getUrgentEmailsSent(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const stored = localStorage.getItem(URGENT_EMAIL_SENT_KEY);
        return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
        return new Set();
    }
}

function markUrgentEmailSent(orderId: string) {
    if (typeof window === "undefined") return;
    try {
        const sent = getUrgentEmailsSent();
        sent.add(orderId);
        localStorage.setItem(URGENT_EMAIL_SENT_KEY, JSON.stringify([...sent]));
    } catch {
        // Ignore localStorage errors
    }
}

function ActionsCell({ lead }: { lead: Lead }) {
    const [showDetails, setShowDetails] = useState(false);
    const [isSendingUrgentEmail, setIsSendingUrgentEmail] = useState(false);
    const [urgentEmailSent, setUrgentEmailSent] = useState(false);
    const utils = api.useUtils();

    // Check localStorage on mount
    useEffect(() => {
        setUrgentEmailSent(getUrgentEmailsSent().has(lead.id));
    }, [lead.id]);

    // Mutation for sending urgent contact email
    const sendUrgentEmailMutation = api.admin.sendStreamingUrgentContactEmail.useMutation({
        onSuccess: (data) => {
            markUrgentEmailSent(lead.id);
            setUrgentEmailSent(true);
            toast.success("Email enviado!", {
                description: `Email de contato urgente enviado para ${data.email}`,
            });
        },
        onError: (error) => {
            toast.error("Erro ao enviar email", {
                description: error.message,
            });
        },
        onSettled: () => {
            setIsSendingUrgentEmail(false);
        },
    });

    // Cover approval mutation
    const toggleCoverApproval = api.admin.toggleCoverApproval.useMutation({
        onSuccess: (data) => {
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success(data.approved ? "Capa aprovada!" : "Aprovação removida");
        },
        onError: (error) => {
            toast.error("Erro ao atualizar aprovação", {
                description: error.message,
            });
        },
    });

    const triggerKaraokeGenerationMutation = api.admin.triggerKaraokeUpsellGeneration.useMutation({
        onSuccess: async (data) => {
            await Promise.all([
                utils.admin.getLeadsPaginated.invalidate(),
                utils.admin.getStats.invalidate(),
                utils.admin.getFilterOptions.invalidate(),
            ]);

            if (data.alreadyQueued) {
                toast.info("Karaokê já está em processamento", {
                    description: `Job ${data.jobId} (${data.jobState})`,
                });
                return;
            }

            toast.success("Geração de karaokê iniciada", {
                description: `Job ${data.jobId} enfileirado com sucesso.`,
            });
        },
        onError: (error) => {
            toast.error("Erro ao gerar karaokê", {
                description: error.message,
            });
        },
    });

    // Show approve cover button for STREAMING_UPSELL + PAID + has cover + not approved yet
    const canApproveCover =
        lead.orderType === "STREAMING_UPSELL" &&
        lead.status === "PAID" &&
        !!lead.streamingCoverUrl &&
        !lead.coverApproved &&
        lead.parentOrder?.status !== "REVISION";

    // Show urgent email button for STREAMING_UPSELL + PAID status
    const canSendUrgentEmail = lead.orderType === "STREAMING_UPSELL" && lead.status === "PAID";
    const hasStreamingVipPendingInfo =
        lead.orderType === "STREAMING_UPSELL" &&
        lead.status === "PAID" &&
        (
            !lead.preferredSongForStreaming ||
            !lead.streamingSongName ||
            !lead.streamingCoverUrl ||
            !lead.coverApproved
        );

    const handleSendUrgentEmail = () => {
        if (isSendingUrgentEmail) return;
        setIsSendingUrgentEmail(true);
        sendUrgentEmailMutation.mutate({ orderId: lead.id });
    };

    // DistroKid Upload Handler
    const [isUploadingDistroKid, setIsUploadingDistroKid] = useState(false);

    // Check if order is eligible for DistroKid upload
    // Must be STREAMING_UPSELL with status PAID and all required fields filled (ready for DistroKid)
    const canUploadDistroKid =
        lead.orderType === "STREAMING_UPSELL" &&
        lead.status === "PAID" &&
        !!lead.streamingSongName &&
        !!lead.streamingCoverUrl &&
        !!lead.coverApproved &&
        !!lead.preferredSongForStreaming;

    const canGenerateKaraokeNow =
        lead.orderType === "KARAOKE_UPSELL" &&
        (lead.status === "PAID" || lead.status === "IN_PROGRESS" || lead.status === "COMPLETED");
    const karaokeParentSongReady = !!lead.parentOrder?.songFileUrl;
    const karaokeParentHasKieIds = !!(lead.parentOrder?.kieTaskId && lead.parentOrder?.kieAudioId1);
    const karaokeGenerateDisabled = !karaokeParentSongReady || !karaokeParentHasKieIds || triggerKaraokeGenerationMutation.isPending;

    // Get parent order info for WhatsApp message
    const parentRecipientName = lead.parentOrder?.recipientName || lead.recipientName || "";

    const handleUploadDistroKid = async () => {
        if (isUploadingDistroKid) return;

        // Confirmation
        if (!confirm("Iniciar upload automático para o DistroKid? Em dev abre o browser; em produção enfileira no worker.")) return;

        setIsUploadingDistroKid(true);
        toast.info("Iniciando automação DistroKid...", {
            description: "Baixando arquivos e abrindo o browser. Aguarde...",
        });
        try {
            const response = await fetch("/api/admin/distrokid/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: lead.id }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (data.mode === "local") {
                    toast.success("Upload concluído!", {
                        description: data.message || "Upload enviado com sucesso para o DistroKid.",
                    });
                    const detail: DistroKidSuccessModalDetail = {
                        open: true,
                        songName: lead.streamingSongName || "a música",
                        recipientName: parentRecipientName,
                        email: lead.email,
                        backupWhatsApp: lead.backupWhatsApp,
                    };
                    window.dispatchEvent(new CustomEvent<DistroKidSuccessModalDetail>(DISTROKID_SUCCESS_MODAL_EVENT, { detail }));
                } else {
                    toast.success("Upload enfileirado!", {
                        description: data.message || "O worker vai processar o envio.",
                    });

                    // Queue mode: refresh immediately.
                    await Promise.all([
                        utils.admin.getLeadsPaginated.invalidate(),
                        utils.admin.getStats.invalidate(),
                        utils.admin.getFilterOptions.invalidate(),
                    ]);
                }
            } else {
                toast.error("Erro no upload", {
                    description: data.error || "Erro desconhecido",
                });
            }
        } catch (error) {
            toast.error("Erro de conexão", {
                description: "Verifique o terminal do Next.js para mais detalhes.",
            });
        } finally {
            setIsUploadingDistroKid(false);
        }
    };

    const handleCopyTrackOrderUrl = () => {
        const trackOrderUrl = `https://www.apollosong.com/${lead.locale || "pt"}/track-order?email=${encodeURIComponent(lead.email || "")}`;
        navigator.clipboard.writeText(trackOrderUrl);
        toast.success("Link copiado!", {
            description: "URL do track-order copiada para a área de transferência.",
        });
    };

    const handleCopyTrackOrderWhatsApp = () => {
        const trackOrderUrl = `https://www.apollosong.com/${lead.locale || "pt"}/track-order?email=${encodeURIComponent(lead.email || "")}`;
        const message = `Olá! Segue o link de acompanhamento do seu pedido 🎵

Por esse link você consegue:

✅ Ouvir suas músicas quando estiverem prontas
✅ Adicionar informações caso tenha esquecido de algo
✅ Solicitar revisão caso encontre algum erro na música

Tudo sobre o seu pedido é resolvido por ali!

Qualquer dúvida, me chame 😊

👉 ${trackOrderUrl}`;
        navigator.clipboard.writeText(message);
        toast.success("Mensagem WhatsApp copiada!", {
            description: "Cole no WhatsApp para enviar ao cliente.",
        });
    };

    const getStreamingVipResumeUrl = () => `https://www.apollosong.com/${lead.locale || "pt"}/order/${lead.id}/success`;

    const getStreamingVipPendingSteps = (): string[] => {
        const pending: string[] = [];
        if (!lead.preferredSongForStreaming) pending.push("escolher a música preferida");
        if (!lead.streamingSongName) pending.push("escolher o nome da música");
        if (!lead.streamingCoverUrl) pending.push("enviar a foto para capa");
        if (lead.streamingCoverUrl && !lead.coverApproved) pending.push("aprovar a capa");
        return pending;
    };

    const handleCopyStreamingVipResumeUrl = () => {
        const resumeUrl = getStreamingVipResumeUrl();
        navigator.clipboard.writeText(resumeUrl);
        toast.success("Link de finalização do Streaming VIP copiado!", {
            description: "Envie ao cliente para concluir os dados pendentes.",
        });
    };

    const handleCopyStreamingVipResumeWhatsApp = () => {
        const resumeUrl = getStreamingVipResumeUrl();
        const pendingSteps = getStreamingVipPendingSteps();
        const pendingBlock = pendingSteps.length > 0
            ? `\n\nAinda falta:\n${pendingSteps.map((step) => `• ${step}`).join("\n")}`
            : "";
        const message = `Oi! Para finalizar seu Streaming VIP, acesse este link:${pendingBlock}

👉 ${resumeUrl}

Assim que concluir, seguimos com o processo pra você 🎵`;

        navigator.clipboard.writeText(message);
        toast.success("Mensagem de finalização Streaming VIP copiada!", {
            description: "Cole no WhatsApp para enviar ao cliente.",
        });
    };

    const handleGenerateKaraokeNow = () => {
        if (karaokeGenerateDisabled) return;
        triggerKaraokeGenerationMutation.mutate({ orderId: lead.id });
    };

    return (
        <>
            <div className="flex justify-end gap-1 whitespace-nowrap">
                {canApproveCover && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCoverApproval.mutate({ orderId: lead.id, approved: true })}
                        disabled={toggleCoverApproval.isPending}
                        className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50"
                        title="Aprovar capa do cliente"
                    >
                        {toggleCoverApproval.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <ImagePlus className="h-5 w-5" />
                        )}
                    </Button>
                )}
                {canSendUrgentEmail && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSendUrgentEmail}
                        disabled={isSendingUrgentEmail}
                        className={urgentEmailSent
                            ? "text-green-500 hover:text-green-700 hover:bg-green-50"
                            : "text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                        }
                        title={urgentEmailSent ? "Email já enviado (clique para reenviar)" : "Enviar email pedindo contato urgente"}
                    >
                        {isSendingUrgentEmail ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : urgentEmailSent ? (
                            <CheckCircle2 className="h-5 w-5" />
                        ) : (
                            <Send className="h-5 w-5" />
                        )}
                    </Button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                            title="Copiar link do Track Order"
                        >
                            <Link2 className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleCopyTrackOrderUrl}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Copiar só o link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCopyTrackOrderWhatsApp}>
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Copiar mensagem p/ WhatsApp
                        </DropdownMenuItem>
                        {hasStreamingVipPendingInfo && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleCopyStreamingVipResumeUrl}>
                                    <Link2 className="mr-2 h-4 w-4 text-sky-600" />
                                    Copiar link finalização VIP
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleCopyStreamingVipResumeWhatsApp}>
                                    <MessageCircle className="mr-2 h-4 w-4 text-sky-600" />
                                    Copiar msg finalização VIP
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                {canUploadDistroKid && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleUploadDistroKid}
                        disabled={isUploadingDistroKid}
                        className="text-sky-600 hover:text-sky-800 hover:bg-sky-50"
                        title="Upload para DistroKid"
                    >
                        {isUploadingDistroKid ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <CloudUpload className="h-5 w-5" />
                        )}
                    </Button>
                )}
                {canGenerateKaraokeNow && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateKaraokeNow}
                        disabled={karaokeGenerateDisabled}
                        className="text-fuchsia-600 hover:text-fuchsia-800 hover:bg-fuchsia-50 disabled:text-charcoal/70"
                        title={
                            !karaokeParentSongReady
                                ? "Aguardando música principal ficar pronta"
                                : !karaokeParentHasKieIds
                                    ? "Pedido principal sem Kie IDs. Gere/recupere os Kie IDs do áudio principal antes de criar o karaokê."
                                    : "Gerar versão instrumental (karaokê) agora"
                        }
                    >
                        {triggerKaraokeGenerationMutation.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Mic2 className="h-5 w-5" />
                        )}
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(true)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                >
                    <Eye className="h-5 w-5 mr-1" />
                    View
                </Button>
            </div>

            {showDetails && (
                <LeadDetailsDialog
                    lead={lead}
                    open={showDetails}
                    onClose={() => setShowDetails(false)}
                />
            )}
        </>
    );
}
