"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Search, MessageSquare, ChevronLeft, ChevronRight, RefreshCw, Reply, Mail, Phone, ExternalLink, Copy, X, Package, XCircle, Sparkles, Send, Loader2, CheckSquare } from "lucide-react";
import { LeadDetailsDialog } from "~/app/admin/(dashboard)/leads/details-dialog";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
    OPEN: { label: "Open", className: "bg-red-100 text-red-700" },
    WAITING_REPLY: { label: "Waiting", className: "bg-amber-100 text-amber-700" },
    RESOLVED: { label: "Resolved", className: "bg-green-100 text-green-700" },
    CLOSED: { label: "Closed", className: "bg-slate-100 text-slate-500" },
};

const ORDER_STATUS_COLORS: Record<string, string> = {
    COMPLETED: "text-green-600 bg-green-50",
    PAID: "text-blue-600 bg-blue-50",
    IN_PROGRESS: "text-amber-600 bg-amber-50",
    REVISION: "text-purple-600 bg-purple-50",
    PENDING: "text-slate-500 bg-slate-50",
    CANCELLED: "text-red-500 bg-red-50",
    REFUNDED: "text-red-500 bg-red-50",
};

const AI_STATUS_BADGES: Record<string, { label: string; className: string }> = {
    PENDING: { label: "AI Pending", className: "bg-purple-100 text-purple-600" },
    GENERATED: { label: "AI Ready", className: "bg-indigo-100 text-indigo-600" },
    ACCEPTED: { label: "Sent", className: "bg-green-100 text-green-600" },
    MODIFIED: { label: "Modified", className: "bg-blue-100 text-blue-600" },
    REJECTED: { label: "Manual", className: "bg-slate-100 text-slate-500" },
};

function formatDateTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDateFull(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function timeAgo(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "agora";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d`;
    return d.toLocaleDateString("pt-BR");
}

function getDateGroup(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // Start of current week (Monday)
    const weekStart = new Date(todayStart);
    const dayOfWeek = todayStart.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - mondayOffset);

    // Last week
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    if (d >= todayStart) return "Hoje";
    if (d >= yesterdayStart) return "Ontem";
    if (d >= weekStart) return "Esta semana";
    if (d >= lastWeekStart) return "Semana passada";

    // Group by month
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const month = monthNames[d.getMonth()]!;
    const year = d.getFullYear();
    if (year === now.getFullYear()) return month;
    return `${month} ${year}`;
}

function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => {
        toast.success(`${label} copiado!`);
    });
}

function AiPreviewTooltip({ text, children }: { text: string; children: React.ReactNode }) {
    const [show, setShow] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>({});
    const ref = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!show || !ref.current || !tooltipRef.current) return;
        const rect = ref.current.getBoundingClientRect();
        const tt = tooltipRef.current;
        const ttH = tt.scrollHeight;
        const ttW = tt.offsetWidth;
        const pad = 8;

        const spaceAbove = rect.top - pad;
        const spaceBelow = window.innerHeight - rect.bottom - pad;

        let top: number;
        let maxH: number;
        if (spaceAbove >= ttH) {
            top = rect.top - ttH - 4;
            maxH = ttH;
        } else if (spaceAbove >= spaceBelow) {
            maxH = spaceAbove;
            top = pad;
        } else {
            top = rect.bottom + 4;
            maxH = spaceBelow;
        }

        let left = rect.right - ttW;
        if (left < pad) left = pad;
        if (left + ttW > window.innerWidth - pad) left = window.innerWidth - ttW - pad;

        setStyle({ position: "fixed", top, left, maxHeight: maxH, overflow: maxH < ttH ? "auto" : "visible" });
    }, [show]);

    return (
        <div ref={ref} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            {children}
            {show && createPortal(
                <div
                    ref={tooltipRef}
                    className="z-[9999] w-[600px] bg-[#111827] border border-slate-200 rounded-xl shadow-2xl p-4 animate-in fade-in duration-150"
                    style={style}
                    onMouseEnter={() => setShow(true)}
                    onMouseLeave={() => setShow(false)}
                >
                    <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider mb-2">AI Response Preview</div>
                    <div className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</div>
                </div>,
                document.body,
            )}
        </div>
    );
}

const GRID_COLS = "grid-cols-[30px_70px_1fr_1.2fr_150px_100px_40px_40px_60px_30px_90px_30px]";

export default function TicketsPage() {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("OPEN");
    const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Order picker + dialog state
    const [pickerEmail, setPickerEmail] = useState<string | null>(null);
    const [dialogOrderId, setDialogOrderId] = useState<string | null>(null);

    const utils = api.useUtils();

    const { data, isLoading } = api.admin.getTickets.useQuery({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter as any,
        priority: priorityFilter as any,
    }, {
        refetchInterval: 60000,
    });

    const { data: stats } = api.admin.getTicketStats.useQuery(undefined, {
        refetchInterval: 60000,
    });

    const pollMutation = api.admin.triggerEmailPoll.useMutation({
        onSuccess: () => {
            setTimeout(() => {
                void utils.admin.getTickets.invalidate();
                void utils.admin.getTicketStats.invalidate();
            }, 3000);
        },
    });

    const closeMutation = api.admin.updateTicketStatus.useMutation({
        onSuccess: () => {
            toast.success("Ticket fechado");
            void utils.admin.getTickets.invalidate();
            void utils.admin.getTicketStats.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const bulkCloseMutation = api.admin.bulkCloseTickets.useMutation({
        onSuccess: (result) => {
            toast.success(`${result.closedCount} ticket(s) fechados`);
            setSelectedIds(new Set());
            void utils.admin.getTickets.invalidate();
            void utils.admin.getTicketStats.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const bulkGenerateMutation = api.admin.bulkGenerateAiResponses.useMutation({
        onSuccess: (result) => {
            toast.success(`AI enfileirado: ${result.enqueuedCount} | Pulados: ${result.skippedCount}`);
            setSelectedIds(new Set());
            void utils.admin.getTickets.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const bulkSendMutation = api.admin.bulkSendAiResponses.useMutation({
        onSuccess: (result) => {
            toast.success(`Enviados: ${result.sentCount} | Erros: ${result.errorCount} | Pulados: ${result.skippedCount}`);
            if (result.errors.length > 0) {
                toast.error(result.errors.join("\n"));
            }
            setSelectedIds(new Set());
            void utils.admin.getTickets.invalidate();
            void utils.admin.getTicketStats.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    // Fetch orders for picker
    const { data: pickerOrders, isLoading: pickerLoading } = api.admin.getOrdersByEmail.useQuery(
        { email: pickerEmail! },
        { enabled: !!pickerEmail },
    );

    // Fetch full lead for dialog
    const { data: dialogLead } = api.admin.getLeadById.useQuery(
        { id: dialogOrderId! },
        { enabled: !!dialogOrderId },
    );

    const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

    // Group tickets by date
    const groupedTickets = useMemo(() => {
        if (!data?.items) return [];
        const groups: Array<{ label: string; tickets: typeof data.items }> = [];
        let currentLabel = "";
        for (const ticket of data.items) {
            const label = getDateGroup(ticket.createdAt);
            if (label !== currentLabel) {
                currentLabel = label;
                groups.push({ label, tickets: [] });
            }
            groups[groups.length - 1]!.tickets.push(ticket);
        }
        return groups;
    }, [data?.items]);

    function handleOpenOrder(email: string, orderId: string | null) {
        setPickerEmail(email);
        setDialogOrderId(null);
    }

    function handlePickOrder(orderId: string) {
        setPickerEmail(null);
        setDialogOrderId(orderId);
    }

    return (
        <div className="space-y-6 w-full pb-20">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <MessageSquare className="text-indigo-600 h-8 w-8" />
                        Support Tickets
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Manage customer support emails and AI-suggested responses.
                    </p>
                </div>
                <button
                    onClick={() => pollMutation.mutate()}
                    disabled={pollMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                    <RefreshCw className={`h-4 w-4 ${pollMutation.isPending ? "animate-spin" : ""}`} />
                    {pollMutation.isPending ? "Checking..." : "Check Emails"}
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                    {([
                    { key: "OPEN", label: "Nao lido", count: stats?.open, color: "red" },
                    { key: "WAITING_REPLY", label: "Waiting", count: stats?.waitingReply, color: "amber" },
                    { key: "CLOSED", label: "Closed", count: stats?.closed, color: "slate" },
                    { key: "ALL", label: "Todos", count: undefined, color: "slate" },
                ] as const).map((tab) => {
                    const active = statusFilter === tab.key;
                    const colorMap = {
                        red: { border: "border-red-500", text: "text-red-600", badge: "bg-red-100 text-red-700" },
                        amber: { border: "border-amber-500", text: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
                        slate: { border: "border-slate-500", text: "text-slate-600", badge: "bg-slate-100 text-slate-500" },
                    };
                    const c = colorMap[tab.color];
                    return (
                        <button
                            key={tab.key}
                            onClick={() => { setStatusFilter(tab.key); setPage(1); setSelectedIds(new Set()); }}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                                active
                                    ? `${c.border} ${c.text}`
                                    : "border-transparent text-charcoal/60 hover:text-slate-600 hover:border-slate-300"
                            }`}
                        >
                            {tab.label}
                            {tab.count != null && tab.count > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    active ? c.badge : "bg-slate-100 text-charcoal/60"
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                    })}
                </div>
            </div>

            {/* Search + Priority */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-charcoal/60 group-focus-within:text-indigo-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by email, subject, or ticket ID..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                        className="block w-full pl-11 pr-4 py-3 bg-[#111827] border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                    />
                </div>
                <select
                    value={priorityFilter}
                    onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                    className="px-4 py-3 bg-[#111827] border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                >
                    <option value="ALL">All Priority</option>
                    <option value="URGENT">Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Low</option>
                </select>
            </div>

            {/* Table */}
            <div className="lg:hidden space-y-4">
                {isLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-[#111827] p-8 text-center text-charcoal/60">
                        Loading tickets...
                    </div>
                ) : !data || data.items.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-[#111827] p-10 text-center">
                        <MessageSquare className="h-8 w-8 text-charcoal/70 mx-auto mb-2" />
                        <p className="text-slate-500">No tickets found</p>
                    </div>
                ) : (
                    groupedTickets.map((group) => (
                        <div key={group.label} className="space-y-2">
                            <div className="px-1">
                                <span className="text-xs font-semibold text-slate-600">{group.label}</span>
                                <span className="text-xs text-charcoal/60 ml-1">({group.tickets.length})</span>
                            </div>
                            <div className="space-y-2">
                                {group.tickets.map((ticket) => {
                                    const lastMsg = ticket.messages[0];
                                    const statusBadge = STATUS_BADGES[ticket.status] ?? { label: ticket.status, className: "bg-slate-100 text-slate-500" };
                                    const aiStatus = lastMsg?.aiResponseStatus;
                                    const aiBadge = aiStatus ? AI_STATUS_BADGES[aiStatus] : null;
                                    const hasReply = (ticket as any).hasReply;
                                    const unread = !hasReply && ticket.status !== "CLOSED";
                                    const whatsapp = ticket.order?.backupWhatsApp;
                                    const isSelected = selectedIds.has(ticket.id);

                                    return (
                                        <div
                                            key={ticket.id}
                                            className={`rounded-xl border bg-[#111827] p-3 shadow-sm ${isSelected ? "border-indigo-300 ring-2 ring-indigo-200" : "border-slate-200"} ${unread ? "bg-indigo-50/30" : ""}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <button
                                                        onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                                                        className={`block text-left text-sm truncate ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}
                                                    >
                                                        {ticket.subject}
                                                    </button>
                                                    <button
                                                        onClick={() => copyToClipboard(ticket.email, "Email")}
                                                        className="text-xs text-slate-500 truncate hover:text-indigo-600"
                                                    >
                                                        {ticket.email}
                                                    </button>
                                                </div>
                                                <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${statusBadge.className}`}>
                                                    {statusBadge.label}
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                <span>{formatDateTime(ticket.createdAt)}</span>
                                                <span>•</span>
                                                <span>{timeAgo(ticket.createdAt)}</span>
                                                <span>•</span>
                                                <span>{ticket._count.messages} msg</span>
                                                {aiBadge ? (
                                                    <>
                                                        <span>•</span>
                                                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${aiBadge.className}`}>
                                                            {aiBadge.label}
                                                        </span>
                                                    </>
                                                ) : null}
                                            </div>

                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {
                                                            setSelectedIds((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(ticket.id)) {
                                                                    next.delete(ticket.id);
                                                                } else {
                                                                    next.add(ticket.id);
                                                                }
                                                                return next;
                                                            });
                                                        }}
                                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    Selecionar
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    {whatsapp ? (
                                                        <button
                                                            onClick={() => copyToClipboard(whatsapp, "WhatsApp")}
                                                            className="text-xs text-green-700 hover:text-green-800"
                                                        >
                                                            {whatsapp}
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                                                    >
                                                        Abrir
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="hidden lg:block bg-[#111827] border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="p-12 text-center text-charcoal/60">Loading tickets...</div>
                ) : !data || data.items.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="h-8 w-8 text-charcoal/70" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">No tickets found</h3>
                        <p className="text-slate-500 mt-1">Tickets will appear here when customers email support.</p>
                    </div>
                ) : (
                    <>
                        {/* Header row */}
                        <div className={`grid ${GRID_COLS} px-5 py-3 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100`}>
                            <div className="flex items-center justify-center">
                                <input
                                    type="checkbox"
                                    checked={data.items.length > 0 && data.items.every((t) => selectedIds.has(t.id))}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedIds(new Set(data.items.map((t) => t.id)));
                                        } else {
                                            setSelectedIds(new Set());
                                        }
                                    }}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                            <div>Status</div>
                            <div>Email</div>
                            <div>Subject</div>
                            <div>Recebido</div>
                            <div>WhatsApp</div>
                            <div className="text-center">Msg</div>
                            <div className="text-center">Re</div>
                            <div>AI</div>
                            <div></div>
                            <div className="text-right">Pedido</div>
                            <div></div>
                        </div>
                        {/* Grouped rows */}
                        {groupedTickets.map((group) => (
                            <div key={group.label}>
                                {/* Date separator */}
                                <div className="px-5 py-2 bg-slate-50 border-y border-slate-100 sticky top-0 z-10">
                                    <span className="text-xs font-semibold text-slate-600">{group.label}</span>
                                    <span className="text-xs text-charcoal/60 ml-2">({group.tickets.length})</span>
                                </div>
                                {/* Tickets in group */}
                                <div className="divide-y divide-slate-50">
                                    {group.tickets.map((ticket) => {
                                        const lastMsg = ticket.messages[0];
                                        const statusBadge = STATUS_BADGES[ticket.status] ?? { label: ticket.status, className: "bg-slate-100 text-slate-500" };
                                        const aiStatus = lastMsg?.aiResponseStatus;
                                        const aiBadge = aiStatus ? AI_STATUS_BADGES[aiStatus] : null;
                                        const hasReply = (ticket as any).hasReply;
                                        const whatsapp = ticket.order?.backupWhatsApp;
                                        const unread = !hasReply && ticket.status !== "CLOSED";

                                        return (
                                            <div
                                                key={ticket.id}
                                                onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                                                className={`grid ${GRID_COLS} px-5 py-3 items-center hover:bg-indigo-50/30 transition-colors cursor-pointer group ${unread ? "bg-indigo-50/20" : ""} ${selectedIds.has(ticket.id) ? "bg-indigo-50/40" : ""}`}
                                            >
                                                {/* Checkbox */}
                                                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(ticket.id)}
                                                        onChange={() => {
                                                            setSelectedIds((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(ticket.id)) {
                                                                    next.delete(ticket.id);
                                                                } else {
                                                                    next.add(ticket.id);
                                                                }
                                                                return next;
                                                            });
                                                        }}
                                                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                </div>
                                                {/* Status */}
                                                <div>
                                                    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${statusBadge.className}`}>
                                                        {statusBadge.label}
                                                    </span>
                                                </div>
                                                {/* Email - click to copy */}
                                                <div
                                                    className={`text-sm truncate pr-2 hover:text-indigo-600 transition-colors ${unread ? "text-slate-900 font-semibold" : "text-slate-500"}`}
                                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(ticket.email, "Email"); }}
                                                    title={`Click to copy: ${ticket.email}`}
                                                >
                                                    <span className="inline-flex items-center gap-1">
                                                        <Copy className="h-3 w-3 text-charcoal/70 group-hover:text-charcoal/60 flex-shrink-0" />
                                                        <span className="truncate">{ticket.email}</span>
                                                    </span>
                                                </div>
                                                {/* Subject */}
                                                <div className={`text-sm truncate pr-2 ${unread ? "font-semibold text-slate-900" : "font-normal text-slate-500"}`}>
                                                    {ticket.subject}
                                                </div>
                                                {/* Date received */}
                                                <div className="text-xs text-slate-500">
                                                    <span>{formatDateTime(ticket.createdAt)}</span>
                                                    <span className="text-charcoal/60 ml-1">({timeAgo(ticket.createdAt)})</span>
                                                </div>
                                                {/* WhatsApp - click to copy */}
                                                <div className="text-xs text-slate-500 truncate">
                                                    {whatsapp ? (
                                                        <span
                                                            className="inline-flex items-center gap-1 hover:text-green-600 transition-colors cursor-pointer"
                                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(whatsapp, "WhatsApp"); }}
                                                            title={`Click to copy: ${whatsapp}`}
                                                        >
                                                            <Phone className="h-3 w-3 text-green-500 flex-shrink-0" />
                                                            <span className="truncate">{whatsapp}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-charcoal/70">--</span>
                                                    )}
                                                </div>
                                                {/* Message count */}
                                                <div className="text-center text-sm text-slate-500">
                                                    {ticket._count.messages}
                                                </div>
                                                {/* Reply status */}
                                                <div className="text-center">
                                                    {hasReply ? (
                                                        <Reply className="h-4 w-4 text-green-500 mx-auto" />
                                                    ) : (
                                                        <Mail className="h-4 w-4 text-red-400 mx-auto" />
                                                    )}
                                                </div>
                                                {/* AI */}
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    {aiBadge && aiStatus === "GENERATED" && lastMsg?.aiSuggestedResponse ? (
                                                        <AiPreviewTooltip text={lastMsg.aiSuggestedResponse}>
                                                            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full cursor-default ${aiBadge.className}`}>
                                                                {aiBadge.label}
                                                            </span>
                                                        </AiPreviewTooltip>
                                                    ) : aiBadge ? (
                                                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${aiBadge.className}`}>
                                                            {aiBadge.label}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {/* Order modal icon */}
                                                <div className="text-center">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleOpenOrder(ticket.email, ticket.orderId); }}
                                                        className="p-1 rounded hover:bg-indigo-100 transition-colors"
                                                        title="Ver pedidos"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5 text-indigo-500" />
                                                    </button>
                                                </div>
                                                {/* Order info */}
                                                <div className="text-right text-xs text-slate-500 truncate">
                                                    {ticket.order ? (
                                                        <span className={`font-medium ${
                                                            ticket.order.status === "COMPLETED" ? "text-green-600" :
                                                            ticket.order.status === "PAID" ? "text-blue-600" :
                                                            ticket.order.status === "IN_PROGRESS" ? "text-amber-600" :
                                                            "text-charcoal/60"
                                                        }`}>
                                                            {ticket.order.recipientName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-charcoal/70">--</span>
                                                    )}
                                                </div>
                                                {/* Quick close */}
                                                <div className="text-center">
                                                    {ticket.status !== "CLOSED" && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                closeMutation.mutate({ id: ticket.id, status: "CLOSED" });
                                                            }}
                                                            className="p-1 rounded hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
                                                            title="Fechar ticket"
                                                        >
                                                            <XCircle className="h-3.5 w-3.5 text-charcoal/60 hover:text-red-500" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Pagination */}
            {(totalPages >= 1 || (data?.total ?? 0) > 0) && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-slate-500">
                            Pagina {page} de {totalPages} ({data?.total} tickets)
                        </span>
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); setSelectedIds(new Set()); }}
                            className="px-2 py-1 text-sm bg-[#111827] border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                            {[20, 50, 100].map((n) => (
                                <option key={n} value={n}>{n} / page</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setPage(p => Math.max(1, p - 1)); setSelectedIds(new Set()); }}
                            disabled={page <= 1}
                            className="px-3 py-2 rounded-lg border border-slate-200 bg-porcelain text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setSelectedIds(new Set()); }}
                            disabled={page >= totalPages}
                            className="px-3 py-2 rounded-lg border border-slate-200 bg-porcelain text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 bg-white text-white px-3 py-3 rounded-xl shadow-2xl">
                    <span className="text-sm font-medium">
                        <CheckSquare className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                        {selectedIds.size} selecionados
                    </span>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-charcoal/60 hover:text-white transition-colors px-2 py-1"
                    >
                        Limpar
                    </button>
                    <div className="hidden sm:block w-px h-5 bg-slate-700" />
                    <button
                        onClick={() => bulkGenerateMutation.mutate({ ticketIds: Array.from(selectedIds) })}
                        disabled={bulkGenerateMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                        {bulkGenerateMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Gerar IA
                    </button>
                    <button
                        onClick={() => bulkSendMutation.mutate({ ticketIds: Array.from(selectedIds) })}
                        disabled={bulkSendMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                        {bulkSendMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Send className="h-3.5 w-3.5" />
                        )}
                        Enviar Todos
                    </button>
                    <div className="hidden sm:block w-px h-5 bg-slate-700" />
                    <button
                        onClick={() => bulkCloseMutation.mutate({ ticketIds: Array.from(selectedIds) })}
                        disabled={bulkCloseMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                        {bulkCloseMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5" />
                        )}
                        Fechar
                    </button>
                </div>
            )}

            {/* Order Picker Modal */}
            {pickerEmail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPickerEmail(null)}>
                    <div className="bg-[#111827] rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Pedidos</h3>
                                <p className="text-sm text-slate-500 mt-0.5">{pickerEmail}</p>
                            </div>
                            <button onClick={() => setPickerEmail(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                                <X className="h-5 w-5 text-charcoal/60" />
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            {pickerLoading ? (
                                <div className="p-12 text-center text-charcoal/60">Buscando pedidos...</div>
                            ) : !pickerOrders || pickerOrders.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Package className="h-8 w-8 text-charcoal/70 mx-auto mb-2" />
                                    <p className="text-slate-500">Nenhum pedido encontrado para este email.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {pickerOrders.map((order) => {
                                        const statusColor = ORDER_STATUS_COLORS[order.status] ?? "text-slate-500 bg-slate-50";
                                        return (
                                            <button
                                                key={order.id}
                                                onClick={() => handlePickOrder(order.id)}
                                                className="w-full px-6 py-4 text-left hover:bg-indigo-50/50 transition-colors flex items-center gap-4"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-slate-900 truncate">
                                                            {order.recipientName || "(Sem nome)"}
                                                        </span>
                                                        <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${statusColor}`}>
                                                            {order.status}
                                                        </span>
                                                        {order.orderType && order.orderType !== "STANDARD" && (
                                                            <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-50 text-violet-600">
                                                                {order.orderType}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                                        <span>{formatDateFull(order.createdAt)}</span>
                                                        {order.genre && <span className="text-charcoal/60">{order.genre}</span>}
                                                        {order.vocals && <span className="text-charcoal/60">{order.vocals}</span>}
                                                        {order.canViewFinancials && order.priceAtOrder != null && (
                                                            <span className="font-medium text-slate-600">
                                                                {order.currency === "BRL" ? "R$" : order.currency === "EUR" ? "\u20AC" : "$"}
                                                                {(order.priceAtOrder / 100).toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {order.backupWhatsApp && (
                                                        <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                                                            <Phone className="h-3 w-3" />
                                                            {order.backupWhatsApp}
                                                        </div>
                                                    )}
                                                </div>
                                                <ExternalLink className="h-4 w-4 text-charcoal/70 flex-shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Order Details Dialog */}
            {dialogLead && (
                <LeadDetailsDialog
                    lead={dialogLead}
                    open={!!dialogOrderId}
                    onClose={() => setDialogOrderId(null)}
                />
            )}
        </div>
    );
}
