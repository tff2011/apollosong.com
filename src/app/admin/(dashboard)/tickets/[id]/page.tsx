"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import {
    ArrowLeft,
    Send,
    RefreshCw,
    Sparkles,
    Clock,
    User,
    Mail,
    Tag,
    Package,
    Loader2,
    ExternalLink,
    Phone,
    Code,
    FileText,
    SkipForward,
} from "lucide-react";
import { LeadDetailsDialog } from "~/app/admin/(dashboard)/leads/details-dialog";

const STATUS_OPTIONS = [
    { value: "OPEN", label: "Open", className: "bg-red-100 text-red-700" },
    { value: "WAITING_REPLY", label: "Waiting Reply", className: "bg-amber-100 text-amber-700" },
    { value: "RESOLVED", label: "Resolved", className: "bg-green-100 text-green-700" },
    { value: "CLOSED", label: "Closed", className: "bg-slate-100 text-slate-500" },
];

const PRIORITY_OPTIONS = [
    { value: "LOW", label: "Low" },
    { value: "NORMAL", label: "Normal" },
    { value: "HIGH", label: "High" },
    { value: "URGENT", label: "Urgent" },
];

const ORDER_STATUS_COLORS: Record<string, string> = {
    COMPLETED: "text-green-600 bg-green-50",
    PAID: "text-blue-600 bg-blue-50",
    IN_PROGRESS: "text-amber-600 bg-amber-50",
    REVISION: "text-purple-600 bg-purple-50",
    PENDING: "text-slate-500 bg-slate-50",
    CANCELLED: "text-red-500 bg-red-50",
    REFUNDED: "text-red-500 bg-red-50",
};

function formatDate(date: Date | string): string {
    return new Date(date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDateFull(date: Date | string): string {
    return new Date(date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function renderBody(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-indigo-600 underline break-all">$1</a>');
}

function EmailHtmlFrame({ html }: { html: string }) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(200);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const doc = iframe.contentDocument;
        if (!doc) return;

        doc.open();
        doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; color: #334155; line-height: 1.6; overflow-x: hidden; }
            img { max-width: 100%; height: auto; }
            a { color: #4f46e5; }
            table { max-width: 100% !important; }
        </style></head><body>${html}</body></html>`);
        doc.close();

        const resize = () => {
            const body = iframe.contentDocument?.body;
            if (body) {
                setHeight(Math.min(body.scrollHeight + 16, 600));
            }
        };

        iframe.onload = resize;
        setTimeout(resize, 100);
        setTimeout(resize, 500);
    }, [html]);

    return (
        <iframe
            ref={iframeRef}
            sandbox="allow-same-origin"
            className="w-full border-0 rounded-lg bg-[#111827]"
            style={{ height: `${height}px` }}
        />
    );
}

export default function TicketDetailPage() {
    const params = useParams();
    const router = useRouter();
    const ticketId = params.id as string;

    const [replyBody, setReplyBody] = useState("");
    const [isManualMode, setIsManualMode] = useState(false);
    const [dialogOrderId, setDialogOrderId] = useState<string | null>(null);
    const [textViewMsgIds, setTextViewMsgIds] = useState<Set<string>>(new Set());

    const utils = api.useUtils();

    const { data: ticket, isLoading } = api.admin.getTicketById.useQuery(
        { id: ticketId },
        { refetchInterval: 10000 }
    );

    // Fetch all orders from this customer's email
    const { data: emailOrders } = api.admin.getOrdersByEmail.useQuery(
        { email: ticket?.email ?? "" },
        { enabled: !!ticket?.email },
    );

    // Fetch full lead for the order dialog
    const { data: dialogLead } = api.admin.getLeadById.useQuery(
        { id: dialogOrderId! },
        { enabled: !!dialogOrderId },
    );

    const updateStatusMutation = api.admin.updateTicketStatus.useMutation({
        onSuccess: () => {
            toast.success("Status updated");
            utils.admin.getTicketById.invalidate({ id: ticketId });
            utils.admin.getTicketStats.invalidate();
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const updatePriorityMutation = api.admin.updateTicketPriority.useMutation({
        onSuccess: () => {
            toast.success("Priority updated");
            utils.admin.getTicketById.invalidate({ id: ticketId });
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const sendReplyMutation = api.admin.sendTicketReply.useMutation({
        onSuccess: () => {
            toast.success("Reply sent!");
            utils.admin.getTicketStats.invalidate();
            router.push("/admin/tickets");
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const sendAndNextMutation = api.admin.sendTicketReply.useMutation({
        onSuccess: async () => {
            toast.success("Reply sent!");
            utils.admin.getTicketStats.invalidate();
            const next = await utils.admin.getNextUnrepliedTicketId.fetch({ excludeId: ticketId });
            if (next) {
                router.push(`/admin/tickets/${next}`);
            } else {
                toast.info("Nenhum ticket pendente!");
                router.push("/admin/tickets");
            }
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const regenerateMutation = api.admin.regenerateAiResponse.useMutation({
        onSuccess: () => {
            toast.success("AI regeneration queued");
            utils.admin.getTicketById.invalidate({ id: ticketId });
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    // Find the latest inbound message with AI suggestion
    const latestInboundWithAi = ticket?.messages
        ?.filter((m) => m.direction === "INBOUND" && m.aiSuggestedResponse)
        .at(-1);

    const latestInbound = ticket?.messages
        ?.filter((m) => m.direction === "INBOUND")
        .at(-1);

    const hasAnyAiPending = ticket?.messages?.some(
        (m) => m.direction === "INBOUND" && m.aiResponseStatus === "PENDING"
    ) ?? false;

    // Pre-fill reply with AI suggestion
    useEffect(() => {
        if (latestInboundWithAi?.aiResponseStatus === "GENERATED" && !isManualMode && !replyBody) {
            setReplyBody(latestInboundWithAi.aiSuggestedResponse || "");
        }
    }, [latestInboundWithAi?.aiSuggestedResponse, latestInboundWithAi?.aiResponseStatus, isManualMode]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-charcoal/60" />
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="text-center py-16">
                <h2 className="text-xl font-medium text-slate-900">Ticket not found</h2>
                <button onClick={() => router.push("/admin/tickets")} className="mt-4 text-indigo-600 hover:underline">
                    Back to tickets
                </button>
            </div>
        );
    }

    const handleSendReply = (aiStatus: "ACCEPTED" | "MODIFIED" | "REJECTED") => {
        if (!replyBody.trim()) {
            toast.error("Reply body cannot be empty");
            return;
        }

        sendReplyMutation.mutate({
            ticketId: ticket.id,
            body: replyBody,
            aiResponseStatus: aiStatus,
            sourceMessageId: latestInboundWithAi?.id,
        });
    };

    const handleSendAndNext = (aiStatus: "ACCEPTED" | "MODIFIED" | "REJECTED") => {
        if (!replyBody.trim()) {
            toast.error("Reply body cannot be empty");
            return;
        }

        sendAndNextMutation.mutate({
            ticketId: ticket.id,
            body: replyBody,
            aiResponseStatus: aiStatus,
            sourceMessageId: latestInboundWithAi?.id,
        });
    };

    const handleRegenerate = () => {
        if (!latestInbound) return;
        regenerateMutation.mutate({
            ticketId: ticket.id,
            messageId: latestInbound.id,
        });
    };

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => router.push("/admin/tickets")}
                    className="p-2 rounded-lg hover:bg-white transition-colors text-slate-500 hover:text-slate-700"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-900 truncate">
                        {ticket.subject}
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {ticket.email} &middot; {ticket.messages.length} messages
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Conversation Thread */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Messages */}
                    <div className="space-y-3">
                        {ticket.messages.map((msg) => {
                            const isInbound = msg.direction === "INBOUND";
                            return (
                                <div
                                    key={msg.id}
                                    className={`rounded-2xl p-5 ${
                                        isInbound
                                            ? "bg-[#111827] border border-slate-200"
                                            : "bg-indigo-50 border border-indigo-100 ml-8"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                                isInbound ? "bg-slate-200 text-slate-600" : "bg-indigo-200 text-indigo-700"
                                            }`}>
                                                {isInbound ? "C" : "S"}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">
                                                {isInbound ? msg.senderEmail : "Support"}
                                            </span>
                                        </div>
                                        <span className="text-xs text-charcoal/60">
                                            {formatDate(msg.createdAt)}
                                        </span>
                                    </div>
                                    {/* Message body: show HTML by default when available */}
                                    {msg.htmlBody && !textViewMsgIds.has(msg.id) ? (
                                        <EmailHtmlFrame html={msg.htmlBody} />
                                    ) : (
                                        <div
                                            className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: renderBody(msg.body) }}
                                        />
                                    )}

                                    {/* Toggle HTML/Text */}
                                    {msg.htmlBody && (
                                        <button
                                            onClick={() => setTextViewMsgIds((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(msg.id)) next.delete(msg.id);
                                                else next.add(msg.id);
                                                return next;
                                            })}
                                            className="mt-2 flex items-center gap-1 text-[11px] text-charcoal/60 hover:text-indigo-500 transition-colors"
                                        >
                                            {textViewMsgIds.has(msg.id) ? (
                                                <><Code size={12} /> Ver HTML</>
                                            ) : (
                                                <><FileText size={12} /> Ver texto</>
                                            )}
                                        </button>
                                    )}

                                    {/* Show AI suggestion indicator on inbound messages */}
                                    {isInbound && msg.aiResponseStatus && (
                                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                                            <Sparkles size={14} className="text-purple-400" />
                                            <span className="text-xs text-purple-500">
                                                AI: {msg.aiResponseStatus === "PENDING" ? "Generating..." : msg.aiResponseStatus === "GENERATED" ? "Suggestion ready" : msg.aiResponseStatus.toLowerCase()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Reply Area */}
                    <div className="bg-[#111827] rounded-2xl border border-slate-200 p-5 mt-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Send size={16} className="text-indigo-500" />
                            Reply
                        </h3>

                        {/* AI pending indicator */}
                        {hasAnyAiPending && !isManualMode && (
                            <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl mb-4">
                                <Loader2 size={18} className="animate-spin text-purple-500" />
                                <span className="text-sm text-purple-600">AI is generating a suggested response...</span>
                                <button
                                    onClick={() => setIsManualMode(true)}
                                    className="ml-auto text-xs text-purple-500 hover:text-purple-700 underline"
                                >
                                    Write manually
                                </button>
                            </div>
                        )}

                        <textarea
                            ref={(el) => {
                                if (el) {
                                    el.style.height = "auto";
                                    el.style.height = Math.max(120, el.scrollHeight) + "px";
                                }
                            }}
                            value={replyBody}
                            onChange={(e) => {
                                setReplyBody(e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = Math.max(120, e.target.scrollHeight) + "px";
                            }}
                            placeholder="Type your reply..."
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none text-sm overflow-hidden"
                        />

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            {/* AI-assisted buttons */}
                            {latestInboundWithAi?.aiResponseStatus === "GENERATED" && !isManualMode && (
                                <>
                                    <button
                                        onClick={() => handleSendReply("ACCEPTED")}
                                        disabled={sendReplyMutation.isPending || sendAndNextMutation.isPending}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all text-sm font-medium disabled:opacity-60"
                                    >
                                        <Sparkles size={16} />
                                        {sendReplyMutation.isPending ? "Sending..." : "Accept & Send"}
                                    </button>
                                    <button
                                        onClick={() => handleSendAndNext("ACCEPTED")}
                                        disabled={sendReplyMutation.isPending || sendAndNextMutation.isPending}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600/80 text-white rounded-xl hover:bg-green-700 transition-all text-sm font-medium disabled:opacity-60"
                                    >
                                        <SkipForward size={16} />
                                        {sendAndNextMutation.isPending ? "Sending..." : "Send & Next"}
                                    </button>
                                    <button
                                        onClick={() => handleSendReply("MODIFIED")}
                                        disabled={sendReplyMutation.isPending || sendAndNextMutation.isPending}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-sm font-medium disabled:opacity-60"
                                    >
                                        <Send size={16} />
                                        {sendReplyMutation.isPending ? "Sending..." : "Edit & Send"}
                                    </button>
                                </>
                            )}

                            {/* Manual send (hidden while any AI is generating, unless manual mode) */}
                            {(isManualMode || !latestInboundWithAi || latestInboundWithAi.aiResponseStatus !== "GENERATED") && (!hasAnyAiPending || isManualMode) && (
                                <>
                                    <button
                                        onClick={() => handleSendReply("REJECTED")}
                                        disabled={sendReplyMutation.isPending || sendAndNextMutation.isPending || !replyBody.trim()}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-white text-white rounded-xl hover:bg-white transition-all text-sm font-medium disabled:opacity-60"
                                    >
                                        <Send size={16} />
                                        {sendReplyMutation.isPending ? "Sending..." : "Send Reply"}
                                    </button>
                                    <button
                                        onClick={() => handleSendAndNext("REJECTED")}
                                        disabled={sendReplyMutation.isPending || sendAndNextMutation.isPending || !replyBody.trim()}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-white transition-all text-sm font-medium disabled:opacity-60"
                                    >
                                        <SkipForward size={16} />
                                        {sendAndNextMutation.isPending ? "Sending..." : "Send & Next"}
                                    </button>
                                </>
                            )}

                            {/* Regenerate AI */}
                            {latestInbound && (
                                <button
                                    onClick={handleRegenerate}
                                    disabled={regenerateMutation.isPending}
                                    className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-all text-sm"
                                >
                                    <RefreshCw size={16} className={regenerateMutation.isPending ? "animate-spin" : ""} />
                                    Regenerate AI
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Sidebar */}
                <div className="space-y-4">
                    {/* Ticket Info */}
                    <div className="bg-[#111827] rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Ticket Info</h3>

                        <div className="space-y-4">
                            {/* Status */}
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</label>
                                <select
                                    value={ticket.status}
                                    onChange={(e) => updateStatusMutation.mutate({ id: ticket.id, status: e.target.value as any })}
                                    className="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Priority */}
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Priority</label>
                                <select
                                    value={ticket.priority}
                                    onChange={(e) => updatePriorityMutation.mutate({ id: ticket.id, priority: e.target.value as any })}
                                    className="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    {PRIORITY_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Mail size={12} /> Customer
                                </label>
                                <p className="mt-1 text-sm text-slate-700 break-all">{ticket.email}</p>
                            </div>

                            {/* Dates */}
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Clock size={12} /> Created
                                </label>
                                <p className="mt-1 text-sm text-slate-700">{formatDate(ticket.createdAt)}</p>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
                            <button
                                onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: "RESOLVED" })}
                                disabled={ticket.status === "RESOLVED"}
                                className="w-full px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-40"
                            >
                                Resolve
                            </button>
                            <button
                                onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: "CLOSED" })}
                                disabled={ticket.status === "CLOSED"}
                                className="w-full px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Customer Orders */}
                    {emailOrders && emailOrders.length > 0 && (
                        <div className="bg-[#111827] rounded-2xl border border-slate-200 p-5">
                            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                                <Package size={16} className="text-indigo-500" />
                                Pedidos ({emailOrders.length})
                            </h3>
                            <div className="space-y-2">
                                {emailOrders.map((order) => {
                                    const statusColor = ORDER_STATUS_COLORS[order.status] ?? "text-slate-500 bg-slate-50";
                                    const isLinked = ticket.orderId === order.id;
                                    return (
                                        <button
                                            key={order.id}
                                            onClick={() => setDialogOrderId(order.id)}
                                            className={`w-full text-left p-3 rounded-xl border transition-colors hover:bg-indigo-50/50 ${
                                                isLinked ? "border-indigo-200 bg-indigo-50/30" : "border-slate-100"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium text-slate-900 truncate">
                                                    {order.recipientName || "(Sem nome)"}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {order.orderType && order.orderType !== "STANDARD" && (
                                                        <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-50 text-violet-600">
                                                            {order.orderType}
                                                        </span>
                                                    )}
                                                    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${statusColor}`}>
                                                        {order.status}
                                                    </span>
                                                    <ExternalLink className="h-3.5 w-3.5 text-charcoal/70" />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span>{formatDateFull(order.createdAt)}</span>
                                                {order.genre && <span className="text-charcoal/60">{order.genre}</span>}
                                            </div>
                                            {order.backupWhatsApp && (
                                                <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                                                    <Phone className="h-3 w-3" />
                                                    {order.backupWhatsApp}
                                                </div>
                                            )}
                                            {isLinked && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-indigo-100 text-indigo-600">
                                                    vinculado ao ticket
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

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
