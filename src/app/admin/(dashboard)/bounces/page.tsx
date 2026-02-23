"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { MailWarning, Check, ChevronLeft, ChevronRight, ExternalLink, Copy, Archive } from "lucide-react";

const BOUNCE_TYPE_BADGES: Record<string, { label: string; className: string }> = {
    hard: { label: "Hard", className: "bg-red-100 text-red-700" },
    soft: { label: "Soft", className: "bg-amber-100 text-amber-700" },
    unknown: { label: "Unknown", className: "bg-slate-100 text-slate-500" },
};

function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatDayHeader(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00Z");
    return d.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
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
    return `${diffDays}d`;
}

function buildWhatsAppMessage(bounce: {
    bouncedEmail: string;
    locale?: string | null;
    order?: {
        recipientName?: string;
        locale?: string | null;
        email?: string;
        status?: string;
    } | null;
}): string {
    const locale = bounce.locale || bounce.order?.locale || "pt";
    const email = bounce.order?.email || bounce.bouncedEmail;
    const recipientName = bounce.order?.recipientName || "";
    const trackingUrl = locale === "pt"
        ? `https://www.apollosong.com/pt/track-order?email=${encodeURIComponent(email)}`
        : locale === "es"
        ? `https://www.apollosong.com/es/track-order?email=${encodeURIComponent(email)}`
        : `https://www.apollosong.com/track-order?email=${encodeURIComponent(email)}`;

    if (locale === "pt") {
        return `Olá! Aqui é a equipe da Apollo Song (Apollo Song). 🎵

Estou entrando em contato pelo WhatsApp porque o email *${email}* que você usou na sua compra pelo site não está recebendo nossas mensagens (o email voltou ou a caixa está cheia).

${recipientName ? `Localizei o seu pedido da canção para *${recipientName}*! ` : ""}${bounce.order?.status === "COMPLETED" ? "Sua música já está pronta e esperando por você! 🎶" : "Sua música está sendo preparada com muito carinho!"}

Para ouvir, baixar e acompanhar tudo sobre a sua Apollo Song, acesse o seu link exclusivo de acompanhamento:
${trackingUrl}

Nesse link você vai encontrar:
✅ O *Player de Música* para ouvir sua canção
✅ O botão *Baixar MP3* para guardar para sempre
✅ Opções extras como *PDF da Letra* para emoldurar e *Lançamento no Spotify*

Depois que acessar, me conta aqui se conseguiu ouvir direitinho? 🙏😊`;
    }

    if (locale === "es") {
        return `¡Hola! Somos el equipo de Apollo Song (Apollo Song). 🎵

Me comunico por WhatsApp porque el email *${email}* que usaste en tu compra en nuestro sitio no está recibiendo nuestros mensajes (el email rebotó o la bandeja está llena).

${recipientName ? `Encontré tu pedido de la canción para *${recipientName}*! ` : ""}${bounce.order?.status === "COMPLETED" ? "¡Tu música ya está lista y esperándote! 🎶" : "¡Tu música se está preparando con mucho cariño!"}

Para escuchar, descargar y seguir todo sobre tu Apollo Song, accede a tu link exclusivo:
${trackingUrl}

En este link encontrarás:
✅ El *Reproductor de Música* para escuchar tu canción
✅ El botón *Descargar MP3* para guardarla para siempre
✅ Opciones extras como *PDF de la Letra* y *Lanzamiento en Spotify*

Después de acceder, ¿me cuentas si pudiste escucharla bien? 🙏😊`;
    }

    // English (default)
    return `Hi! This is the Apollo Song team. 🎵

I'm reaching out via WhatsApp because the email *${email}* you used for your purchase on our website isn't receiving our messages (the email bounced or the inbox is full).

${recipientName ? `I found your order for the song for *${recipientName}*! ` : ""}${bounce.order?.status === "COMPLETED" ? "Your song is ready and waiting for you! 🎶" : "Your song is being crafted with love!"}

To listen, download, and track everything about your custom song, access your exclusive tracking link:
${trackingUrl}

In this link you'll find:
✅ The *Music Player* to listen to your song
✅ The *Download MP3* button to keep it forever
✅ Extra options like *Lyrics PDF* and *Spotify Release*

After you access it, could you let me know if you were able to listen to it? 🙏😊`;
}

function copyMessage(bounce: Parameters<typeof buildWhatsAppMessage>[0]) {
    const msg = buildWhatsAppMessage(bounce);
    void navigator.clipboard.writeText(msg).then(() => {
        toast.success("Mensagem copiada!");
    });
}

export default function BouncesPage() {
    const [resolved, setResolved] = useState(false);
    const [onlyPaidOrders, setOnlyPaidOrders] = useState(true);
    const [paymentMethod, setPaymentMethod] = useState<"all" | "pix" | "card">("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [page, setPage] = useState(1);
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [resolveNote, setResolveNote] = useState("");

    const utils = api.useUtils();

    const { data, isLoading } = api.admin.getEmailBounces.useQuery({
        resolved,
        onlyPaidOrders,
        paymentMethod,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: 50,
    }, {
        refetchInterval: 30000,
    });

    const { data: stats } = api.admin.getEmailBounceStats.useQuery(undefined, {
        refetchInterval: 30000,
    });

    const resolveMutation = api.admin.resolveEmailBounce.useMutation({
        onSuccess: () => {
            setResolvingId(null);
            setResolveNote("");
            void utils.admin.getEmailBounces.invalidate();
            void utils.admin.getEmailBounceStats.invalidate();
        },
    });

    const handleResolve = (id: string) => {
        resolveMutation.mutate({ id, note: resolveNote || undefined });
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <MailWarning className="h-7 w-7 text-red-600" />
                <h1 className="text-2xl font-bold text-slate-800">Email Bounces</h1>
                {stats && stats.unresolvedWithOrder > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        {stats.unresolvedWithOrder}
                    </span>
                )}
            </div>
            <p className="text-sm text-slate-500 mb-6">
                Emails que voltaram (NDR/bounce). Clientes pagos que nao receberam o email precisam ser contatados via WhatsApp.
            </p>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6 items-end">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Status</label>
                    <select
                        value={resolved ? "resolved" : "unresolved"}
                        onChange={(e) => { setResolved(e.target.value === "resolved"); setPage(1); }}
                        className="px-3 py-2 rounded-lg border border-stone-200 bg-porcelain text-sm"
                    >
                        <option value="unresolved">Nao resolvidos</option>
                        <option value="resolved">Resolvidos</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Filtro</label>
                    <select
                        value={onlyPaidOrders ? "paid" : "all"}
                        onChange={(e) => { setOnlyPaidOrders(e.target.value === "paid"); setPage(1); }}
                        className="px-3 py-2 rounded-lg border border-stone-200 bg-porcelain text-sm"
                    >
                        <option value="paid">Somente pedidos pagos</option>
                        <option value="all">Todos os bounces</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Pagamento</label>
                    <select
                        value={paymentMethod}
                        onChange={(e) => { setPaymentMethod(e.target.value as "all" | "pix" | "card"); setPage(1); }}
                        className="px-3 py-2 rounded-lg border border-stone-200 bg-porcelain text-sm"
                    >
                        <option value="all">Todos</option>
                        <option value="pix">PIX</option>
                        <option value="card">Cartao</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">De</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                        className="px-3 py-2 rounded-lg border border-stone-200 bg-porcelain text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Ate</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                        className="px-3 py-2 rounded-lg border border-stone-200 bg-porcelain text-sm"
                    />
                </div>
                {(dateFrom || dateTo) && (
                    <button
                        onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                        className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 underline"
                    >
                        Limpar datas
                    </button>
                )}
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="text-center py-12 text-charcoal/60">Carregando...</div>
            ) : !data || data.total === 0 ? (
                <div className="text-center py-16">
                    <MailWarning className="h-12 w-12 text-charcoal/70 mx-auto mb-3" />
                    <p className="text-charcoal/60">Nenhum bounce encontrado</p>
                </div>
            ) : (
                <>
                    {/* Email-grouped list */}
                    <div className="space-y-3">
                        {(() => {
                            // Flatten all bounces from all days and group by email
                            const allBounces = Object.values(data.grouped).flat();
                            const grouped = new Map<string, typeof allBounces>();
                            for (const b of allBounces) {
                                const key = b.bouncedEmail.toLowerCase();
                                if (!grouped.has(key)) grouped.set(key, []);
                                grouped.get(key)!.push(b);
                            }
                            // Sort groups by most recent bounce
                            const sortedGroups = Array.from(grouped.entries()).sort(([, a], [, b]) =>
                                new Date(b[0]!.detectedAt).getTime() - new Date(a[0]!.detectedAt).getTime()
                            );
                            return sortedGroups.map(([email, group]) => {
                                const first = group[0]!;
                                const whatsappNumber = group.find((b) => b.backupWhatsApp || b.order?.backupWhatsApp)?.backupWhatsApp
                                    || group.find((b) => b.order?.backupWhatsApp)?.order?.backupWhatsApp;
                                const whatsappClean = whatsappNumber?.replace(/[^0-9+]/g, "").replace("+", "");
                                // DDI-only numbers (<=4 digits) are not valid
                                const hasValidWhatsApp = !!whatsappClean && whatsappClean.replace("+", "").length > 4;
                                const hasOrder = group.some((b) => b.orderId);
                                const allResolved = group.every((b) => b.resolved);
                                const unresolvedIds = group.filter((b) => !b.resolved).map((b) => b.id);
                                // Dedupe orders by id
                                const uniqueOrders = Array.from(
                                    new Map(group.filter((b) => b.order).map((b) => [b.order!.id, b.order!])).values()
                                );

                                return (
                                    <div
                                        key={email}
                                        className={`bg-[#111827] rounded-xl border p-4 ${hasOrder ? "border-red-200" : "border-stone-200"}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                {/* Top row: email + count */}
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-mono text-sm font-medium text-slate-800 truncate">
                                                        {first.bouncedEmail}
                                                    </span>
                                                    {group.length > 1 && (
                                                        <span className="bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                                                            {group.length}x
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-charcoal/60">
                                                        {timeAgo(first.detectedAt)}
                                                    </span>
                                                </div>

                                                {/* Bounce records */}
                                                <div className={`${group.length > 1 ? "space-y-1.5 mb-2" : "mb-2"}`}>
                                                    {group.map((b) => {
                                                        const typeBadge = BOUNCE_TYPE_BADGES[b.bounceType] || BOUNCE_TYPE_BADGES.unknown!;
                                                        return (
                                                            <div key={b.id} className={`flex items-start gap-2 ${group.length > 1 ? "pl-2 border-l-2 border-slate-100" : ""}`}>
                                                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${typeBadge.className}`}>
                                                                    {typeBadge.label}
                                                                </span>
                                                                <p className="text-xs text-slate-500 line-clamp-1 flex-1">
                                                                    {b.bounceReason}
                                                                </p>
                                                                <span className="text-[10px] text-charcoal/60 flex-shrink-0">
                                                                    {formatDate(b.detectedAt)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Order info (deduplicated) */}
                                                {uniqueOrders.length > 0 && (
                                                    <div className="space-y-1">
                                                        {uniqueOrders.map((order) => (
                                                            <div key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                                                                <span>
                                                                    <span className="text-charcoal/60">Pedido:</span>{" "}
                                                                    <span className="font-mono">{order.id.slice(-8)}</span>
                                                                    {" "}
                                                                    <span className={`font-semibold ${
                                                                        order.status === "COMPLETED" ? "text-green-600" :
                                                                        order.status === "PAID" ? "text-blue-600" :
                                                                        order.status === "IN_PROGRESS" ? "text-amber-600" :
                                                                        "text-slate-500"
                                                                    }`}>
                                                                        {order.status}
                                                                    </span>
                                                                </span>
                                                                <span>
                                                                    <span className="text-charcoal/60">Para:</span>{" "}
                                                                    {order.recipientName}
                                                                </span>
                                                                {order.genre && (
                                                                    <span>
                                                                        <span className="text-charcoal/60">Genero:</span>{" "}
                                                                        {order.genre}
                                                                    </span>
                                                                )}
                                                                {order.paymentMethod && (
                                                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                                                        order.paymentMethod === "pix"
                                                                            ? "bg-green-100 text-green-700"
                                                                            : "bg-blue-100 text-blue-700"
                                                                    }`}>
                                                                        {order.paymentMethod === "pix" ? "PIX" : "Cartao"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* WhatsApp + copy message */}
                                                {hasValidWhatsApp && (
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <button
                                                            onClick={() => {
                                                                void navigator.clipboard.writeText(whatsappNumber!).then(() => {
                                                                    toast.success("Numero copiado!");
                                                                });
                                                            }}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                                                            title="Copiar numero"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                            WhatsApp: {whatsappNumber}
                                                        </button>
                                                        <button
                                                            onClick={() => copyMessage(first)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                                                            title="Copiar mensagem padrao para WhatsApp"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                            Copiar msg
                                                        </button>
                                                    </div>
                                                )}
                                                {!hasValidWhatsApp && hasOrder && !allResolved && (
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[10px] text-red-400">
                                                            {whatsappNumber ? `Apenas DDI (${whatsappNumber})` : "Sem WhatsApp cadastrado"}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                for (const id of unresolvedIds) {
                                                                    resolveMutation.mutate({ id, note: "Sem WhatsApp valido para contato" });
                                                                }
                                                            }}
                                                            disabled={resolveMutation.isPending}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-medium hover:bg-slate-200 transition-colors"
                                                            title="Arquivar - sem como contatar"
                                                        >
                                                            <Archive className="h-3 w-3" />
                                                            Arquivar
                                                        </button>
                                                    </div>
                                                )}
                                                {!hasValidWhatsApp && hasOrder && allResolved && (
                                                    <span className="inline-block mt-2 text-[10px] text-red-400">
                                                        {whatsappNumber ? `Apenas DDI (${whatsappNumber})` : "Sem WhatsApp cadastrado"}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Resolve button - resolves ALL bounces in group */}
                                            {!allResolved && unresolvedIds.length > 0 && (
                                                <div className="flex-shrink-0">
                                                    {resolvingId === unresolvedIds[0] ? (
                                                        <div className="flex flex-col gap-2">
                                                            <input
                                                                type="text"
                                                                placeholder="Nota (opcional)"
                                                                value={resolveNote}
                                                                onChange={(e) => setResolveNote(e.target.value)}
                                                                className="px-2 py-1 text-xs border border-stone-200 rounded w-40"
                                                                autoFocus
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        for (const id of unresolvedIds) handleResolve(id);
                                                                    }
                                                                    if (e.key === "Escape") { setResolvingId(null); setResolveNote(""); }
                                                                }}
                                                            />
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => {
                                                                        for (const id of unresolvedIds) handleResolve(id);
                                                                    }}
                                                                    disabled={resolveMutation.isPending}
                                                                    className="flex-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                                                                >
                                                                    Confirmar{unresolvedIds.length > 1 ? ` (${unresolvedIds.length})` : ""}
                                                                </button>
                                                                <button
                                                                    onClick={() => { setResolvingId(null); setResolveNote(""); }}
                                                                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                                                                >
                                                                    X
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setResolvingId(unresolvedIds[0]!)}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors border border-green-200"
                                                        >
                                                            <Check className="h-3 w-3" />
                                                            Resolvido{unresolvedIds.length > 1 ? ` (${unresolvedIds.length})` : ""}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {allResolved && (
                                                <div className="flex-shrink-0 text-xs text-green-600">
                                                    <Check className="h-4 w-4 inline mr-1" />
                                                    Resolvido
                                                    {first.resolvedNote && (
                                                        <span className="block text-[10px] text-charcoal/60 mt-0.5">
                                                            {first.resolvedNote}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>

                    {/* Pagination */}
                    {data.totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 mt-8">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#111827] border border-stone-200 text-sm text-slate-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </button>
                            <span className="text-sm text-slate-500">
                                Pagina {page} de {data.totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                                disabled={page === data.totalPages}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#111827] border border-stone-200 text-sm text-slate-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Proximo
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
