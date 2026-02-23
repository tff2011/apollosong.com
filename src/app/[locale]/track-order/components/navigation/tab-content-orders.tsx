"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Search, X } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { TrackOrder } from "../../hooks/use-track-order";
import type { OrderStatus } from "../../utils/order-helpers";
import { getRecipientDisplayName, getGenreDisplayName, formatPrice, DATE_LOCALES } from "../../utils/order-helpers";
import { OrderStatusBadge } from "./order-status-badge";

interface TabContentOrdersProps {
    orders: TrackOrder[];
    currentIndex: number;
    onIndexChange: (index: number) => void;
    locale: string;
    translations: {
        orderFor: string;
        status: Record<OrderStatus, string>;
        statusShort?: Partial<Record<OrderStatus, string>>;
    };
}

interface OrderEntry {
    order: TrackOrder;
    index: number;
    recipientName: string;
    genreLabel: string;
    orderDate: string;
    orderTime: string;
    orderPrice: string | null;
    statusKey: OrderStatus;
    statusLabel: string;
    searchableText: string;
}

const ordersTabCopy = {
    pt: {
        summaryTitle: (count: number) => `Você tem ${count} pedidos neste e-mail`,
        summaryHint: "Toque em qualquer pedido para abrir os detalhes completos abaixo.",
        compactHint: "Use \"Trocar pedido\" para navegar rápido quando há muitos pedidos.",
        currentOrder: (index: number, total: number) => `Pedido atual ${index} de ${total}`,
        orderLabel: (index: number, total: number) => `Pedido ${index} de ${total}`,
        open: "Abrir",
        selected: "Selecionado",
        changeOrder: "Trocar pedido",
        previous: "Pedido anterior",
        next: "Próximo pedido",
        pickerTitle: "Selecionar pedido",
        pickerSubtitle: (count: number) => `${count} pedidos encontrados para este e-mail`,
        searchPlaceholder: "Buscar por nome, gênero ou número do pedido",
        noResults: "Nenhum pedido encontrado com esse termo.",
        moreOrdersHint: (count: number) => `+${count} pedidos disponíveis no seletor`,
        viewAll: "Ver todos",
    },
    en: {
        summaryTitle: (count: number) => `You have ${count} orders on this email`,
        summaryHint: "Tap any order to open full details below.",
        compactHint: "Use \"Change order\" for quick navigation when you have many orders.",
        currentOrder: (index: number, total: number) => `Current order ${index} of ${total}`,
        orderLabel: (index: number, total: number) => `Order ${index} of ${total}`,
        open: "Open",
        selected: "Selected",
        changeOrder: "Change order",
        previous: "Previous order",
        next: "Next order",
        pickerTitle: "Select order",
        pickerSubtitle: (count: number) => `${count} orders found for this email`,
        searchPlaceholder: "Search by name, genre, or order number",
        noResults: "No orders found for this search.",
        moreOrdersHint: (count: number) => `+${count} more orders available in picker`,
        viewAll: "View all",
    },
    es: {
        summaryTitle: (count: number) => `Tienes ${count} pedidos en este correo`,
        summaryHint: "Toca cualquier pedido para abrir los detalles completos abajo.",
        compactHint: "Usa \"Cambiar pedido\" para navegar rápido cuando tienes muchos pedidos.",
        currentOrder: (index: number, total: number) => `Pedido actual ${index} de ${total}`,
        orderLabel: (index: number, total: number) => `Pedido ${index} de ${total}`,
        open: "Abrir",
        selected: "Seleccionado",
        changeOrder: "Cambiar pedido",
        previous: "Pedido anterior",
        next: "Siguiente pedido",
        pickerTitle: "Seleccionar pedido",
        pickerSubtitle: (count: number) => `${count} pedidos encontrados para este correo`,
        searchPlaceholder: "Buscar por nombre, género o número de pedido",
        noResults: "No se encontraron pedidos con esa búsqueda.",
        moreOrdersHint: (count: number) => `+${count} pedidos más disponibles en el selector`,
        viewAll: "Ver todos",
    },
    fr: {
        summaryTitle: (count: number) => `Vous avez ${count} commandes sur cet e-mail`,
        summaryHint: "Appuyez sur une commande pour ouvrir les détails complets ci-dessous.",
        compactHint: "Utilisez \"Changer de commande\" pour naviguer vite avec beaucoup de commandes.",
        currentOrder: (index: number, total: number) => `Commande actuelle ${index} sur ${total}`,
        orderLabel: (index: number, total: number) => `Commande ${index} sur ${total}`,
        open: "Ouvrir",
        selected: "Sélectionnée",
        changeOrder: "Changer de commande",
        previous: "Commande précédente",
        next: "Commande suivante",
        pickerTitle: "Sélectionner une commande",
        pickerSubtitle: (count: number) => `${count} commandes trouvées pour cet e-mail`,
        searchPlaceholder: "Rechercher par nom, genre ou numéro",
        noResults: "Aucune commande trouvée pour cette recherche.",
        moreOrdersHint: (count: number) => `+${count} commandes disponibles dans le sélecteur`,
        viewAll: "Voir tout",
    },
    it: {
        summaryTitle: (count: number) => `Hai ${count} ordini in questa email`,
        summaryHint: "Tocca un ordine per aprire i dettagli completi qui sotto.",
        compactHint: "Usa \"Cambia ordine\" per navigare velocemente quando hai molti ordini.",
        currentOrder: (index: number, total: number) => `Ordine attuale ${index} di ${total}`,
        orderLabel: (index: number, total: number) => `Ordine ${index} di ${total}`,
        open: "Apri",
        selected: "Selezionato",
        changeOrder: "Cambia ordine",
        previous: "Ordine precedente",
        next: "Ordine successivo",
        pickerTitle: "Seleziona ordine",
        pickerSubtitle: (count: number) => `${count} ordini trovati per questa email`,
        searchPlaceholder: "Cerca per nome, genere o numero ordine",
        noResults: "Nessun ordine trovato con questa ricerca.",
        moreOrdersHint: (count: number) => `+${count} ordini disponibili nel selettore`,
        viewAll: "Vedi tutti",
    },
} as const;

/** Show the picker dialog for 8+ orders */
const PICKER_THRESHOLD = 8;

export function TabContentOrders({
    orders,
    currentIndex,
    onIndexChange,
    locale,
    translations,
}: TabContentOrdersProps) {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

    const copy = ordersTabCopy[locale as keyof typeof ordersTabCopy] ?? ordersTabCopy.en;
    const showPickerButton = orders.length >= PICKER_THRESHOLD;

    const orderEntries = useMemo<OrderEntry[]>(() => {
        const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES];

        return orders.map((order, index) => {
            const recipientName = getRecipientDisplayName(order.recipientName, order.recipient, locale);
            const genreLabel = getGenreDisplayName(order.genre, locale);
            const orderDate = format(new Date(order.createdAt), "dd/MM/yyyy", { locale: dateLocale });
            const orderTime = format(new Date(order.createdAt), "HH:mm", { locale: dateLocale });
            const hasPrice = order.priceAtOrder && order.priceAtOrder > 0;
            const orderPrice = hasPrice ? formatPrice(order.priceAtOrder, order.currency) : null;
            const statusKey = order.status as OrderStatus;
            const statusLabel = translations.statusShort?.[statusKey] || translations.status[statusKey];

            return {
                order,
                index,
                recipientName,
                genreLabel,
                orderDate,
                orderTime,
                orderPrice,
                statusKey,
                statusLabel,
                searchableText: `${index + 1} ${recipientName} ${genreLabel} ${orderDate}`.toLowerCase(),
            };
        });
    }, [orders, locale, translations.status, translations.statusShort]);

    const filteredEntries = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return orderEntries;
        return orderEntries.filter((entry) => entry.searchableText.includes(query));
    }, [orderEntries, searchQuery]);

    const selectOrder = (index: number) => {
        onIndexChange(index);
        setIsPickerOpen(false);
        setSearchQuery("");
    };

    // Auto-scroll to selected card
    const scrollToSelected = useCallback(() => {
        const card = cardRefs.current.get(currentIndex);
        if (card && scrollRef.current) {
            const container = scrollRef.current;
            const cardLeft = card.offsetLeft;
            const cardWidth = card.offsetWidth;
            const containerWidth = container.offsetWidth;
            const scrollTarget = cardLeft - (containerWidth / 2) + (cardWidth / 2);
            container.scrollTo({ left: scrollTarget, behavior: "smooth" });
        }
    }, [currentIndex]);

    useEffect(() => {
        scrollToSelected();
    }, [scrollToSelected]);

    // No scroll strip needed for 0 or 1 order
    if (orders.length <= 1) {
        return null;
    }

    return (
        <div className="py-3">
            {/* Horizontal scroll strip */}
            <div className="relative">
                <div
                    ref={scrollRef}
                    className="flex gap-2.5 overflow-x-auto px-4 pb-3 scrollbar-hide snap-x snap-mandatory"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                >
                    {orderEntries.map((entry) => {
                        const isActive = entry.index === currentIndex;

                        return (
                            <button
                                key={entry.order.id}
                                ref={(el) => {
                                    if (el) cardRefs.current.set(entry.index, el);
                                }}
                                type="button"
                                onClick={() => onIndexChange(entry.index)}
                                className={cn(
                                    "flex-shrink-0 snap-start rounded-2xl border-2 p-3 text-left transition-all w-[160px]",
                                    isActive
                                        ? "bg-white border-[#4A8E9A] shadow-lg shadow-[#4A8E9A]/10"
                                        : "bg-white/70 border-charcoal/10 active:scale-[0.97]"
                                )}
                            >
                                {/* Top row: number + status */}
                                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                    <span className={cn(
                                        "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                                        isActive ? "bg-[#4A8E9A] text-dark" : "bg-charcoal/10 text-charcoal/70"
                                    )}>
                                        {entry.index + 1}
                                    </span>
                                    <OrderStatusBadge
                                        status={entry.statusKey}
                                        label={entry.statusLabel}
                                    />
                                </div>

                                {/* Recipient name */}
                                <p className="truncate text-sm font-semibold text-charcoal leading-tight">
                                    {entry.recipientName}
                                </p>

                                {/* Genre */}
                                <p className="truncate text-xs text-charcoal/55 leading-tight mt-0.5">
                                    {entry.genreLabel}
                                </p>

                                {/* Price */}
                                {entry.orderPrice && (
                                    <p className="text-xs font-semibold text-charcoal/70 mt-1.5">
                                        {entry.orderPrice}
                                    </p>
                                )}
                            </button>
                        );
                    })}

                    {/* "View all" card for 8+ orders */}
                    {showPickerButton && (
                        <button
                            type="button"
                            onClick={() => setIsPickerOpen(true)}
                            className="flex-shrink-0 snap-start rounded-2xl border-2 border-dashed border-charcoal/20 bg-charcoal/[0.03] p-3 w-[120px] flex flex-col items-center justify-center gap-1.5 active:scale-[0.97] transition-all"
                        >
                            <Search className="h-5 w-5 text-charcoal/40" />
                            <span className="text-xs font-semibold text-charcoal/60">
                                {copy.viewAll}
                            </span>
                        </button>
                    )}
                </div>

                {/* Fade edges to hint at scrollability */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-[#0A0E1A] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-[#0A0E1A] to-transparent" />
            </div>

            {/* Picker Dialog for 8+ orders */}
            <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                <DialogContent className="max-w-[calc(100%-1rem)] overflow-hidden rounded-2xl p-0">
                    <DialogHeader className="px-4 pt-4 pb-2 text-left">
                        <DialogTitle className="font-serif text-xl text-charcoal">
                            {copy.pickerTitle}
                        </DialogTitle>
                        <DialogDescription className="text-charcoal/60">
                            {copy.pickerSubtitle(orders.length)}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-4 pb-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-charcoal/40" />
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder={copy.searchPlaceholder}
                                className="h-10 rounded-xl border-charcoal/15 bg-white pl-9 pr-10 text-charcoal placeholder:text-charcoal/45"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-charcoal/45 hover:bg-charcoal/5"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[55vh] space-y-2 overflow-y-auto px-4 pb-4">
                        {filteredEntries.length === 0 ? (
                            <p className="rounded-xl border border-charcoal/10 bg-charcoal/[0.03] px-3 py-4 text-sm text-charcoal/60">
                                {copy.noResults}
                            </p>
                        ) : (
                            filteredEntries.map((entry) => {
                                const isActive = entry.index === currentIndex;

                                return (
                                    <button
                                        key={entry.order.id}
                                        type="button"
                                        onClick={() => selectOrder(entry.index)}
                                        className={cn(
                                            "w-full rounded-xl border p-3 text-left transition-all",
                                            isActive
                                                ? "border-[#4A8E9A] bg-[#4A8E9A]/10"
                                                : "border-charcoal/10 bg-white"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-charcoal">
                                                    {entry.recipientName}
                                                </p>
                                                <p className="truncate text-xs text-charcoal/60">
                                                    {entry.genreLabel}
                                                </p>
                                            </div>
                                            {isActive ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A1A2E]">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {copy.selected}
                                                </span>
                                            ) : (
                                                <span className="text-xs font-semibold text-charcoal/55">
                                                    {copy.orderLabel(entry.index + 1, orders.length)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-2 text-xs text-charcoal/50">
                                            {entry.orderDate} {entry.orderTime}
                                            {entry.orderPrice && (
                                                <>
                                                    {" • "}
                                                    <span className="font-semibold text-charcoal">
                                                        {entry.orderPrice}
                                                    </span>
                                                </>
                                            )}
                                        </p>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
