"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DateRangePicker } from "~/components/ui/date-range-picker";

interface FilterState {
    search: string;
    searchMode: string;
    status: string;
    revisionType: string;
    revisionFault: string;
    melodyPreference: string;
    genre: string;
    vocals: string;
    locale: string;
    plan: string;
    upsell: string;
    recoveryEmail: string;
    source: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
}

interface StatusOption {
    value: string;
    count: number;
}

interface FilterToolbarProps {
    filters: FilterState;
    onFiltersChange: (filters: Partial<FilterState>) => void;
    onReset: () => void;
    statusOptions: StatusOption[];
    genreOptions: string[];
    sourceOptions: string[];
    isLoading?: boolean;
}

const UPSELL_OPTIONS = [
    { value: "LYRICS", label: "Lyrics PDF" },
    { value: "CERTIFICATE", label: "Certificate" },
    { value: "EXTRA_SONG", label: "Extra Song" },
    { value: "GENRE_VARIANT", label: "Genre Variant" },
    { value: "STREAMING", label: "Streaming VIP" },
] as const;

function UpsellMultiFilter({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    const selected = useMemo(() => {
        if (!value || value === "ALL" || value === "ANY") return new Set<string>();
        return new Set(value.split(","));
    }, [value]);

    const isAny = value === "ANY";
    const hasSelection = selected.size > 0 || isAny;

    const toggle = (key: string) => {
        const next = new Set(selected);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        onChange(next.size === 0 ? "ALL" : [...next].join(","));
    };

    const label = isAny
        ? "Any Upsell"
        : selected.size === 0
        ? "All Upsells"
        : selected.size === 1
        ? UPSELL_OPTIONS.find((o) => selected.has(o.value))?.label ?? "Upsell"
        : `${selected.size} Upsells`;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <Button
                    variant="outline"
                    className={cn(
                        "h-10 w-full sm:w-[170px] justify-between text-left font-normal",
                        hasSelection && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]"
                    )}
                >
                    <span className="truncate">{label}</span>
                    <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px] sm:w-[180px]">
                <DropdownMenuCheckboxItem
                    checked={!hasSelection}
                    onCheckedChange={() => onChange("ALL")}
                    className="pl-8"
                >
                    All Upsells
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={isAny}
                    onCheckedChange={() => onChange(isAny ? "ALL" : "ANY")}
                    className="pl-8"
                >
                    Any Upsell
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {UPSELL_OPTIONS.map((opt) => (
                    <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={selected.has(opt.value)}
                        onCheckedChange={() => {
                            if (isAny) {
                                onChange(opt.value);
                            } else {
                                toggle(opt.value);
                            }
                        }}
                        className="pl-8"
                    >
                        {opt.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function FilterToolbar({
    filters,
    onFiltersChange,
    onReset,
    statusOptions,
    genreOptions,
    sourceOptions,
    isLoading,
}: FilterToolbarProps) {
    const [searchInput, setSearchInput] = useState(filters.search);

    // Sync searchInput with filters.search when filters change externally (e.g., URL change)
    useEffect(() => {
        setSearchInput(filters.search);
    }, [filters.search]);

    // Debounced search (300ms delay)
    useEffect(() => {
        const timer = setTimeout(() => {
            // Clean up search input (remove mailto: prefix if present)
            const cleanedSearch = searchInput.replace(/^mailto:/i, "").trim();
            if (cleanedSearch !== filters.search) {
                onFiltersChange({ search: cleanedSearch });
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput, filters.search, onFiltersChange]);

    const hasActiveFilters =
        filters.search ||
        (filters.searchMode && filters.searchMode !== "ALL") ||
        (filters.status && filters.status !== "ALL") ||
        (filters.revisionType && filters.revisionType !== "ALL") ||
        (filters.revisionFault && filters.revisionFault !== "ALL") ||
        (filters.melodyPreference && filters.melodyPreference !== "ALL") ||
        filters.genre ||
        filters.vocals ||
        filters.locale ||
        (filters.plan && filters.plan !== "ALL") ||
        (filters.upsell && filters.upsell !== "ALL") ||
        (filters.recoveryEmail && filters.recoveryEmail !== "ALL") ||
        filters.source ||
        filters.dateFrom ||
        filters.dateTo;

    return (
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-center p-4 bg-[#111827] rounded-lg border shadow-sm">
            {/* Search Input */}
            <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder={filters.searchMode === "SPOTIFY_SONG_NAME"
                        ? "Search Spotify song name..."
                        : "Search email, recipient, song name, lyrics..."}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                    disabled={isLoading}
                />
            </div>

            {/* Search Mode */}
            <Select
                value={filters.searchMode || "ALL"}
                onValueChange={(v) => onFiltersChange({ searchMode: v })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[220px]", filters.searchMode && filters.searchMode !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="Search In" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Search Fields</SelectItem>
                    <SelectItem value="SPOTIFY_SONG_NAME">Spotify Song Name Only</SelectItem>
                </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select
                value={filters.status || "ALL"}
                onValueChange={(v) => onFiltersChange({
                    status: v,
                    revisionType: v === "REVISION" ? filters.revisionType : "ALL",
                    revisionFault: v === "REVISION" ? filters.revisionFault : "ALL",
                    melodyPreference: v === "REVISION" ? filters.melodyPreference : "ALL",
                })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[160px]", filters.status && filters.status !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    {statusOptions.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                            {s.value === "STUCK"
                                ? "SEM MUSICA"
                                : s.value === "NO_LYRICS"
                                    ? "SEM LETRA"
                                    : s.value === "SPOTIFY_READY"
                                        ? "PRONTO P/ DISTROKID"
                                        : s.value === "SPOTIFY_PENDING"
                                            ? "SPOTIFY PENDENTE"
                                            : s.value === "SPOTIFY_IN_DISTRIBUTION"
                                                ? "SPOTIFY EM DISTRIBUIÇÃO"
                                                : s.value === "SPOTIFY_PUBLISHED"
                                                    ? "SPOTIFY PUBLICADOS"
                                                    : s.value === "SONGS_PENDING"
                                                        ? "SONGS PENDENTES"
                                                        : s.value} ({s.count})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Revision Type Filter - Only shows when status is REVISION */}
            {filters.status === "REVISION" && (
                <Select
                    value={filters.revisionType || "ALL"}
                    onValueChange={(v) => onFiltersChange({ revisionType: v })}
                    disabled={isLoading}
                >
                    <SelectTrigger className={cn("w-full sm:w-[160px]", filters.revisionType && filters.revisionType !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                        <SelectValue placeholder="Tipo de Revisão" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Todos os Tipos</SelectItem>
                        <SelectItem value="PRONUNCIATION">🎤 Pronúncia</SelectItem>
                        <SelectItem value="LYRICS_ERROR">📝 Letra</SelectItem>
                        <SelectItem value="NAME_ERROR">📛 Nome</SelectItem>
                        <SelectItem value="STYLE_CHANGE">🎨 Estilo</SelectItem>
                        <SelectItem value="QUALITY_ISSUE">🔊 Qualidade</SelectItem>
                        <SelectItem value="OTHER">❓ Outro</SelectItem>
                    </SelectContent>
                </Select>
            )}

            {/* Revision Fault Filter - Only shows when status is REVISION */}
            {filters.status === "REVISION" && (
                <Select
                    value={filters.revisionFault || "ALL"}
                    onValueChange={(v) => onFiltersChange({ revisionFault: v })}
                    disabled={isLoading}
                >
                    <SelectTrigger className={cn("w-full sm:w-[180px]", filters.revisionFault && filters.revisionFault !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                        <SelectValue placeholder="Responsabilidade" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Todas</SelectItem>
                        <SelectItem value="OUR_FAULT">🆓 Erro Nosso</SelectItem>
                        <SelectItem value="CLIENT_FAULT">💰 Erro Cliente</SelectItem>
                        <SelectItem value="UNCLEAR">❓ A Analisar</SelectItem>
                    </SelectContent>
                </Select>
            )}

            {/* Melody Preference Filter - Only shows when status is REVISION */}
            {filters.status === "REVISION" && (
                <Select
                    value={filters.melodyPreference || "ALL"}
                    onValueChange={(v) => onFiltersChange({ melodyPreference: v })}
                    disabled={isLoading}
                >
                    <SelectTrigger className={cn("w-full sm:w-[220px]", filters.melodyPreference && filters.melodyPreference !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                        <SelectValue placeholder="Fluxo de Melodia" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Todos os Fluxos</SelectItem>
                        <SelectItem value="KEEP_CURRENT">🎵 Manual: Manter Melodia</SelectItem>
                        <SelectItem value="SUGGEST_NEW">🎶 Automação: 2 Novas Melodias</SelectItem>
                        <SelectItem value="UNSET">❓ Sem preferência</SelectItem>
                    </SelectContent>
                </Select>
            )}

            {/* Genre Filter */}
            <Select
                value={filters.genre || "all"}
                onValueChange={(v) => onFiltersChange({ genre: v === "all" ? "" : v })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[130px]", filters.genre && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="All Genres" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Genres</SelectItem>
                    {genreOptions.map((g) => (
                        <SelectItem key={g} value={g}>
                            {g.charAt(0).toUpperCase() + g.slice(1)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Vocals Filter */}
            <Select
                value={filters.vocals || "all"}
                onValueChange={(v) => onFiltersChange({ vocals: v === "all" ? "" : v })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[120px]", filters.vocals && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="All Vocals" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Vocals</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="either">Either</SelectItem>
                </SelectContent>
            </Select>

            {/* Locale Filter */}
            <Select
                value={filters.locale || "all"}
                onValueChange={(v) => onFiltersChange({ locale: v === "all" ? "" : v })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[130px]", filters.locale && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="All Languages" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    <SelectItem value="en">🇺🇸 English</SelectItem>
                    <SelectItem value="pt">🇧🇷 Português</SelectItem>
                    <SelectItem value="es">🇪🇸 Español</SelectItem>
                    <SelectItem value="fr">🇫🇷 Français</SelectItem>
                    <SelectItem value="it">🇮🇹 Italiano</SelectItem>
                </SelectContent>
            </Select>

            {/* Plan Filter */}
            <Select
                value={filters.plan || "ALL"}
                onValueChange={(v) => onFiltersChange({ plan: v })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[140px]", filters.plan && filters.plan !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="All Plans" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Plans</SelectItem>
                    <SelectItem value="ESSENTIAL">Essencial</SelectItem>
                    <SelectItem value="EXPRESS">Express</SelectItem>
                    <SelectItem value="TURBO">Turbo</SelectItem>
                </SelectContent>
            </Select>

            {/* Upsell Filter (multi-select) */}
            <UpsellMultiFilter
                value={filters.upsell || "ALL"}
                onChange={(v) => onFiltersChange({ upsell: v })}
                disabled={isLoading}
            />

            {/* Recovery Email Filter */}
            <Select
                value={filters.recoveryEmail || "ALL"}
                onValueChange={(v) => onFiltersChange({ recoveryEmail: v })}
                disabled={isLoading}
            >
                <SelectTrigger className={cn("w-full sm:w-[190px]", filters.recoveryEmail && filters.recoveryEmail !== "ALL" && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                    <SelectValue placeholder="Recovery Emails" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Recovery</SelectItem>
                    <SelectItem value="ANY">Any Recovery</SelectItem>
                    <SelectItem value="CART">Cart Abandonment</SelectItem>
                    <SelectItem value="STREAMING">Streaming VIP</SelectItem>
                </SelectContent>
            </Select>

            {/* Source Filter (UTM) */}
            {sourceOptions.length > 0 && (
                <Select
                    value={filters.source || "all"}
                    onValueChange={(v) => onFiltersChange({ source: v === "all" ? "" : v })}
                    disabled={isLoading}
                >
                    <SelectTrigger className={cn("w-full sm:w-[140px]", filters.source && "border-[#C9A84C] bg-[#C9A84C]/5 text-[#F0EDE6]")}>
                        <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {sourceOptions.map((s) => (
                            <SelectItem key={s} value={s}>
                                {s}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            {/* Date Range Picker */}
            <DateRangePicker
                from={filters.dateFrom}
                to={filters.dateTo}
                onSelect={(range) =>
                    onFiltersChange({
                        dateFrom: range?.from,
                        dateTo: range?.to,
                    })
                }
            />

            {/* Reset Button */}
            {hasActiveFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                </Button>
            )}
        </div>
    );
}
