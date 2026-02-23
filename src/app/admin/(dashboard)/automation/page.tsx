"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RefreshCw, Music, CheckCircle, XCircle, Loader2, Zap, Eye, Copy, Clock, TrendingUp, User, MinusCircle, Ban } from "lucide-react";
import { GENRE_NAMES } from "~/lib/lyrics-generator";
import { api } from "~/trpc/react";
import { LeadDetailsDialog } from "../leads/details-dialog";

type PendingOrder = {
    id: string;
    recipientName: string;
    genre: string;
    vocals: string;
    locale: string;
    createdAt: string;
    paymentCompletedAt: string | null;
    hasFastDelivery: boolean;
    planType?: string | null;
    parentOrder?: {
        hasFastDelivery?: boolean;
        planType?: string | null;
    } | null;
    email: string;
    backupWhatsApp: string | null;
    musicPrompt: string | null;
    sunoAccountEmail?: string | null;
    songFileUrl?: string | null;
    songFileUrl2?: string | null;
};

type TriggerResponse = {
    mode: "local" | "queue";
    orders: PendingOrder[];
    workerActiveOrderIds?: string[];
    sunoAccountEmail?: string | null;
    automationMetrics?: {
        workerStartedAt: string | null;
        workerHeartbeatAt: string | null;
        workerOnline: boolean;
        workerState: "offline" | "idle" | "processing";
        runtimeHours: number;
        songsGenerated: number;
        avgSongsPerHour: number;
        usingEstimatedWindow: boolean;
        lastHourSuccessCount: number;
        lastHourFailureCount: number;
        parallelActive: number;
        parallelLimit: number;
        queueWaiting: number;
        queueDelayed: number;
    };
    recentOrders?: Array<{
        id: string;
        recipientName: string;
        email: string;
        locale: string;
        sunoAccountEmail?: string | null;
        processedAt: string;
        songsGenerated: number;
        deliverySent: boolean;
    }>;
};

type AutomationMetrics = NonNullable<TriggerResponse["automationMetrics"]>;

const VOCALS_LABELS: Record<string, string> = {
    male: "♂ Masc",
    female: "♀ Fem",
    either: "⚥ Qualquer",
};

type ProcessingStatus = "idle" | "processing" | "success" | "partial" | "error" | "ignored";
type ProcessOutcome = "success" | "partial" | "error" | "ignored";

type OrderStatus = {
    status: ProcessingStatus;
    message?: string;
    songUrls?: string[];
};

type ProcessingEvent = {
    timestamp: number;
    success: boolean;
};

type RecentOrder = {
    id: string;
    recipientName: string;
    email: string;
    locale: string;
    sunoAccountEmail?: string | null;
    processedAt: number;
    songsGenerated: number;
    deliverySent?: boolean;
};

const CLAIMED_BY_OTHER_ACCOUNT_ERROR = "Order already claimed by another Suno account";
const AUTOMATION_LOCK_STORAGE_KEY = "admin-suno-automation-lock";
const AUTOMATION_LOCK_EVENT = "suno-automation-lock-change";

const TURBO_AUTOMATION_DELAY_MS = 3 * 60 * 60 * 1000;
const EXPRESS_AUTOMATION_DELAY_MS = 8 * 60 * 60 * 1000;
const ESSENTIAL_AUTOMATION_DELAY_MS = 36 * 60 * 60 * 1000;

const normalizePlanType = (value?: string | null) => String(value || "").trim().toLowerCase();
const isTurboPlanType = (value?: string | null) => normalizePlanType(value) === "acelerado";
const isExpressPlanType = (value?: string | null) => {
    const normalized = normalizePlanType(value);
    return normalized === "express";
};
const isEssentialPlanType = (value?: string | null) => normalizePlanType(value) === "essencial";

const getPaidAtMs = (order: PendingOrder) => {
    const paidAt = order.paymentCompletedAt ? new Date(order.paymentCompletedAt) : new Date(order.createdAt);
    return paidAt.getTime();
};

const isTurboOrder = (order: PendingOrder) => {
    return Boolean(
        isTurboPlanType(order.planType) ||
        isTurboPlanType(order.parentOrder?.planType)
    );
};

const isExpressOrder = (order: PendingOrder) => {
    return Boolean(
        order.hasFastDelivery ||
        isExpressPlanType(order.planType) ||
        order.parentOrder?.hasFastDelivery ||
        isExpressPlanType(order.parentOrder?.planType)
    );
};

const isEssentialOrder = (order: PendingOrder) => {
    if (isTurboOrder(order) || isExpressOrder(order)) return false;
    return isEssentialPlanType(order.planType) || isEssentialPlanType(order.parentOrder?.planType);
};

const getAutomationDelayWindowMs = (order: PendingOrder) => {
    if (isTurboOrder(order)) return TURBO_AUTOMATION_DELAY_MS;
    if (isExpressOrder(order)) return EXPRESS_AUTOMATION_DELAY_MS;
    if (isEssentialOrder(order)) return ESSENTIAL_AUTOMATION_DELAY_MS;
    return 0;
};

const getAutomationDelayMs = (order: PendingOrder, nowMs: number) => {
    const delayWindowMs = getAutomationDelayWindowMs(order);
    if (delayWindowMs <= 0) return 0;
    const eligibleAtMs = getPaidAtMs(order) + delayWindowMs;
    return Math.max(0, eligibleAtMs - nowMs);
};

const getPlanBadge = (order: PendingOrder) => {
    if (isTurboOrder(order)) return "⚡ 6h";
    if (isExpressOrder(order)) return "⚡ 24h";
    if (isEssentialOrder(order)) return "7 dias";
    return "Padrão";
};

const formatDelayShort = (ms: number) => {
    const safeMs = Math.max(0, ms);
    const totalMinutes = Math.ceil(safeMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `${totalMinutes}min`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}min`;
};

// Beep sound functions using Web Audio API
const playBeep = (frequency: number, duration: number, type: OscillatorType = "sine") => {
    try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.warn("Audio not supported:", e);
    }
};

const playSuccessBeep = () => {
    playBeep(880, 0.15, "sine"); // A5 note
    setTimeout(() => playBeep(1108, 0.2, "sine"), 150); // C#6 note - happy sound
};

const playErrorBeep = () => {
    playBeep(220, 0.3, "sawtooth"); // Low A - error sound
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function AutomationPage() {
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<"local" | "queue">("local");
    const [orderStatuses, setOrderStatuses] = useState<Record<string, OrderStatus>>({});
    const [isProcessingAll, setIsProcessingAll] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [processingHistory, setProcessingHistory] = useState<ProcessingEvent[]>([]);
    const [sessionStartTime] = useState<number>(Date.now());
    const [sunoAccountEmail, setSunoAccountEmail] = useState<string | null>(null);
    const [isAutomationLocked, setIsAutomationLocked] = useState(false);
    const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
    const [automationMetrics, setAutomationMetrics] = useState<AutomationMetrics | null>(null);
    const [workerActiveOrderIds, setWorkerActiveOrderIds] = useState<string[]>([]);
    const stopRequestedRef = useRef(false);
    const errorCooldownUntilRef = useRef<Record<string, number>>({});
    const workerActiveOrderIdsSet = useMemo(() => new Set(workerActiveOrderIds), [workerActiveOrderIds]);
    const actionableOrders = useMemo(
        () => pendingOrders.filter(order => orderStatuses[order.id]?.status !== "ignored"),
        [pendingOrders, orderStatuses]
    );
    const nowMs = Date.now();
    const localRunnableOrders = useMemo(
        () => actionableOrders.filter((order) => getAutomationDelayMs(order, nowMs) === 0),
        [actionableOrders, nowMs]
    );
    const hasActiveProcessing = useMemo(
        () => Object.values(orderStatuses).some(status => status.status === "processing"),
        [orderStatuses]
    );

    // Fetch full lead data when an order is selected for viewing
    const { data: selectedLead } = api.admin.getLeadById.useQuery(
        { id: selectedOrderId! },
        { enabled: !!selectedOrderId }
    );

    // Calculate stats from processing history
    const getProcessingStats = () => {
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;

        // Stats últimos 60 min
        const recentEvents = processingHistory.filter(e => e.timestamp > oneHourAgo);
        const successCount = recentEvents.filter(e => e.success).length;
        const errorCount = recentEvents.filter(e => !e.success).length;

        // Tempo de execução em horas
        const uptimeMs = now - sessionStartTime;
        const uptimeHours = uptimeMs / (60 * 60 * 1000);

        // Média por hora (total de eventos de sucesso / horas rodando)
        const totalSuccess = processingHistory.filter(e => e.success).length;
        const totalErrors = processingHistory.filter(e => !e.success).length;
        const avgPerHour = uptimeHours > 0 ? totalSuccess / uptimeHours : 0;

        return {
            successCount,
            errorCount,
            total: recentEvents.length,
            uptimeHours,
            totalSuccess,
            totalErrors,
            avgPerHour
        };
    };

    const formatUptime = (hours: number) => {
        if (hours < 1) {
            return `${Math.floor(hours * 60)}min`;
        }
        return `${hours.toFixed(1)}h`;
    };

    const stats = getProcessingStats();
    const apiRuntimeHours = automationMetrics?.runtimeHours ?? 0;
    const apiAvgSongsPerHour = automationMetrics?.avgSongsPerHour ?? 0;
    const apiSongsGenerated = automationMetrics?.songsGenerated ?? 0;
    const lastHourSuccessCount = automationMetrics?.lastHourSuccessCount ?? stats.successCount;
    const lastHourFailureCount = automationMetrics?.lastHourFailureCount ?? stats.errorCount;
    const parallelActive = automationMetrics?.parallelActive ?? (hasActiveProcessing ? 1 : 0);
    const parallelLimit = automationMetrics?.parallelLimit ?? (mode === "local" ? 1 : 0);
    const queueWaiting = automationMetrics?.queueWaiting ?? 0;
    const queueDelayed = automationMetrics?.queueDelayed ?? 0;
    const workerOnline = automationMetrics?.workerOnline ?? (mode === "local");
    const workerState = automationMetrics?.workerState ?? (parallelActive > 0 ? "processing" : "idle");
    const workerStateLabel = workerState === "processing"
        ? "Processando"
        : workerState === "idle"
        ? "Online (ocioso)"
        : "Offline";
    const workerStateClass = workerState === "processing"
        ? "text-emerald-600"
        : workerState === "idle"
        ? "text-blue-600"
        : "text-red-600";

    const syncAutomationLock = (locked: boolean) => {
        setIsAutomationLocked(locked);
        try {
            sessionStorage.setItem(AUTOMATION_LOCK_STORAGE_KEY, locked ? "true" : "false");
            window.dispatchEvent(new CustomEvent(AUTOMATION_LOCK_EVENT, { detail: locked }));
        } catch {
            // Ignore storage errors
        }
    };

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(AUTOMATION_LOCK_STORAGE_KEY);
            if (stored === "true") {
                setIsAutomationLocked(true);
            }
        } catch {
            // Ignore storage errors
        }
    }, []);

    useEffect(() => {
        if (mode !== "local" && isAutomationLocked) {
            syncAutomationLock(false);
        }
    }, [mode, isAutomationLocked]);

    useEffect(() => {
        if (mode !== "local") return;
        if (isAutomationLocked) return;
        if (!isProcessingAll && !hasActiveProcessing) return;
        syncAutomationLock(true);
    }, [hasActiveProcessing, isAutomationLocked, isProcessingAll, mode]);

    // Lock persists until user stops manually to avoid breaking automation.

    const fetchPendingOrders = useCallback(async (options?: { silent?: boolean }) => {
        if (!options?.silent) {
            setLoading(true);
        }
        try {
            const res = await fetch("/api/admin/suno/trigger");
            const data: TriggerResponse = await res.json();
            const uniqueOrders = Array.isArray(data.orders)
                ? Array.from(new Map(data.orders.map((order) => [order.id, order])).values())
                : [];
            setPendingOrders(uniqueOrders);
            setMode(data.mode);
            setWorkerActiveOrderIds(Array.isArray(data.workerActiveOrderIds) ? data.workerActiveOrderIds : []);
            setSunoAccountEmail(data.sunoAccountEmail ?? null);
            setAutomationMetrics(data.automationMetrics ?? null);
            if (Array.isArray(data.recentOrders)) {
                const recentMap = new Map<string, RecentOrder>();
                data.recentOrders.forEach((order) => {
                    recentMap.set(order.id, {
                        id: order.id,
                        recipientName: order.recipientName,
                        email: order.email,
                        locale: order.locale,
                        sunoAccountEmail: order.sunoAccountEmail ?? null,
                        processedAt: new Date(order.processedAt).getTime(),
                        songsGenerated: order.songsGenerated,
                        deliverySent: order.deliverySent,
                    });
                });
                setRecentOrders(Array.from(recentMap.values()));
            }
            return uniqueOrders;
        } catch (error) {
            console.error("Failed to fetch pending orders:", error);
            return [];
        } finally {
            if (!options?.silent) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchPendingOrders();
    }, [fetchPendingOrders]);

    const shouldAutoRefresh = useMemo(
        () => mode === "queue" || isProcessingAll || hasActiveProcessing || isAutomationLocked,
        [hasActiveProcessing, isAutomationLocked, isProcessingAll, mode]
    );

    useEffect(() => {
        if (!shouldAutoRefresh) return;
        const intervalId = window.setInterval(() => {
            void fetchPendingOrders({ silent: true });
        }, 30_000);
        return () => window.clearInterval(intervalId);
    }, [fetchPendingOrders, shouldAutoRefresh]);

    const processOrder = async (
        orderId: string,
        orderSnapshotOverride?: PendingOrder,
        forceImmediate = false
    ): Promise<ProcessOutcome> => {
        const orderSnapshot = orderSnapshotOverride ?? pendingOrders.find(order => order.id === orderId);
        if (mode === "local") {
            syncAutomationLock(true);
        }
        setOrderStatuses(prev => ({
            ...prev,
            [orderId]: {
                status: "processing",
                message: forceImmediate
                    ? "Priorizando processamento imediato..."
                    : "Gerando música no Suno AI...",
            }
        }));

        try {
            const res = await fetch("/api/admin/suno/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, forceImmediate }),
            });

            const data = await res.json() as {
                success: boolean;
                error?: string;
                message?: string;
                mode?: "local" | "queue";
                songsGenerated?: number;
                songsUploaded?: number;
                songsAvailable?: number;
                songUrls?: string[];
                creditsRemaining?: number;
                deliverySent?: boolean;
                deliveryError?: string;
                sunoAccountEmail?: string | null;
            };

            if (data.success) {
                const responseMode = data.mode ?? mode;
                if (responseMode === "queue") {
                    setOrderStatuses(prev => ({
                        ...prev,
                        [orderId]: {
                            status: "success",
                            message: data.message || (
                                forceImmediate
                                    ? "Pedido priorizado para processamento imediato."
                                    : "Pedido enfileirado para geração via API."
                            ),
                        }
                    }));
                    // In queue mode, generation happens in background worker.
                    // Keep order in list until URLs are persisted and refresh updates it.
                    void fetchPendingOrders({ silent: true });
                    return "success";
                }

                const songsAvailable = data.songsAvailable ?? data.songsGenerated ?? 0;
                const songsUploaded = data.songsUploaded ?? data.songsGenerated ?? 0;
                const hasAllSongs = songsAvailable >= 2;
                setOrderStatuses(prev => ({
                    ...prev,
                    [orderId]: {
                        status: hasAllSongs ? "success" : "partial",
                        message: hasAllSongs
                            ? `${songsAvailable} música(s) prontas! Créditos: ${data.creditsRemaining ?? "N/A"}`
                            : `Parcial: ${songsAvailable}/2 música(s) disponíveis (+${songsUploaded} agora). Aguardando a segunda.`,
                        songUrls: data.songUrls,
                    }
                }));
                if (hasAllSongs) {
                    // Remove from pending list
                    setPendingOrders(prev => prev.filter(o => o.id !== orderId));
                }
                if (hasAllSongs && orderSnapshot) {
                    setRecentOrders(prev => {
                        const next: RecentOrder[] = [{
                            id: orderSnapshot.id,
                            recipientName: orderSnapshot.recipientName,
                            email: orderSnapshot.email,
                            locale: orderSnapshot.locale,
                            sunoAccountEmail: data.sunoAccountEmail ?? orderSnapshot.sunoAccountEmail ?? null,
                            processedAt: Date.now(),
                            songsGenerated: songsAvailable,
                            deliverySent: data.deliverySent,
                        }, ...prev.filter((item) => item.id !== orderSnapshot.id)];
                        return next.slice(0, 10);
                    });
                }
                if (hasAllSongs) {
                    // Play success beep and record event
                    playSuccessBeep();
                    setProcessingHistory(prev => [...prev, { timestamp: Date.now(), success: true }]);
                    delete errorCooldownUntilRef.current[orderId];
                } else {
                    void fetchPendingOrders({ silent: true });
                }
                return hasAllSongs ? "success" : "partial";
            } else {
                const isClaimedByOtherAccount = data.error === CLAIMED_BY_OTHER_ACCOUNT_ERROR;
                setOrderStatuses(prev => ({
                    ...prev,
                    [orderId]: {
                        status: isClaimedByOtherAccount ? "ignored" : "error",
                        message: isClaimedByOtherAccount
                            ? "Pedido já está sendo processado por outra conta."
                            : data.error || "Erro desconhecido"
                    }
                }));
                if (isClaimedByOtherAccount) {
                    return "ignored";
                }
                // Play error beep and record event
                playErrorBeep();
                setProcessingHistory(prev => [...prev, { timestamp: Date.now(), success: false }]);
                return "error";
            }
        } catch (error) {
            setOrderStatuses(prev => ({
                ...prev,
                [orderId]: { status: "error", message: error instanceof Error ? error.message : "Erro de conexão" }
            }));
            // Play error beep and record event
            playErrorBeep();
            setProcessingHistory(prev => [...prev, { timestamp: Date.now(), success: false }]);
            return "error";
        }
    };

    const processAllOrders = async () => {
        if (mode !== "local") return;

        stopRequestedRef.current = false;
        syncAutomationLock(true);
        setIsProcessingAll(true);

        const partialRetryDelayMs = 20_000;
        const betweenOrdersDelayMs = 2000;
        const idlePollDelayMs = 15_000;
        const errorCooldownMs = 10 * 60_000;

        try {
            // Continuous mode:
            // Always pick the currently-highest-priority pending order (6h/24h first),
            // so new Turbo/Express orders that arrive mid-run will be processed next.
            while (!stopRequestedRef.current) {
                const latest = await fetchPendingOrders({ silent: true });
                if (stopRequestedRef.current) break;

                const now = Date.now();
                const candidates = latest.filter((order) => {
                    const cooldownUntil = errorCooldownUntilRef.current[order.id] ?? 0;
                    const delayMs = getAutomationDelayMs(order, now);
                    return now >= cooldownUntil && delayMs === 0;
                });

                if (candidates.length === 0) {
                    await sleep(idlePollDelayMs);
                    continue;
                }

                const nextOrder = candidates[0];
                if (!nextOrder) {
                    await sleep(idlePollDelayMs);
                    continue;
                }
                let outcome = await processOrder(nextOrder.id, nextOrder);

                // Avoid getting stuck on a repeatedly failing order at the top of the list.
                if (outcome === "error") {
                    errorCooldownUntilRef.current[nextOrder.id] = Date.now() + errorCooldownMs;
                }

                while (outcome === "partial" && !stopRequestedRef.current) {
                    await sleep(partialRetryDelayMs);
                    if (stopRequestedRef.current) break;
                    await fetchPendingOrders({ silent: true });
                    outcome = await processOrder(nextOrder.id, nextOrder);

                    if (outcome === "error") {
                        errorCooldownUntilRef.current[nextOrder.id] = Date.now() + errorCooldownMs;
                        break;
                    }
                }

                await sleep(betweenOrdersDelayMs);
            }
        } finally {
            setIsProcessingAll(false);
            if (stopRequestedRef.current) {
                syncAutomationLock(false);
            }
        }
    };

    const handleStopAutomation = () => {
        stopRequestedRef.current = true;
        setIsProcessingAll(false);
        syncAutomationLock(false);
    };

    const enqueueAll = async () => {
        try {
            const res = await fetch("/api/admin/suno/trigger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ processAll: true }),
            });

            const data = await res.json();

            if (data.success) {
                alert(`${data.enqueued?.length || 0} pedidos enfileirados para processamento!`);
                fetchPendingOrders();
            } else {
                alert(`Erro: ${data.error}`);
            }
        } catch (error) {
            alert(`Erro: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "N/A";
        return new Date(dateStr).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatProcessedAt = (timestamp: number) =>
        new Date(timestamp).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Automação Suno AI</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Gerar músicas para pedidos pagos com letras prontas
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {sunoAccountEmail && (
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            <User size={12} />
                            {sunoAccountEmail}
                        </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        mode === "local"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                    }`}>
                        {mode === "local" ? "Modo Local" : "Modo Redis/BullMQ"}
                    </span>

                    {isAutomationLocked && (
                        <button
                            onClick={handleStopAutomation}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                            <Ban size={16} />
                            Parar automação
                        </button>
                    )}
                    <button
                        onClick={() => { void fetchPendingOrders(); }}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Pedidos Pendentes */}
                <div className="bg-[#111827] rounded-xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-amber-50">
                            <Music className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{actionableOrders.length}</p>
                            <p className="text-sm text-slate-500">Pedidos Pendentes</p>
                        </div>
                    </div>
                </div>

                {/* API Rodando */}
                <div className="bg-[#111827] rounded-xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-blue-50">
                            <Clock className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{formatUptime(apiRuntimeHours)}</p>
                            <p className="text-sm text-slate-500">API Rodando</p>
                            <p className="text-[11px] text-charcoal/60 mt-0.5">
                                {automationMetrics?.usingEstimatedWindow ? "Estimado (janelas 3h/8h/36h)" : "Desde o start do worker"}
                            </p>
                            <p className={`text-[11px] mt-0.5 font-medium ${workerStateClass}`}>
                                Worker: {workerStateLabel}{workerOnline ? "" : " (sem heartbeat)"}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                {parallelActive} rodando em paralelo
                                {parallelLimit > 0 ? ` (limite: ${parallelLimit})` : ""}
                            </p>
                            {mode === "queue" && (
                                <p className="text-[11px] text-charcoal/60 mt-0.5">
                                    fila: {queueWaiting} aguardando • {queueDelayed} com delay
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Últimos 60min */}
                <div className="bg-[#111827] rounded-xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-green-50">
                            <Zap className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">
                                <span className="text-green-600">{lastHourSuccessCount}</span>
                                {" "}
                                <span className="text-charcoal/60">/</span>
                                {" "}
                                <span className="text-red-500">{lastHourFailureCount}</span>
                            </p>
                            <p className="text-sm text-slate-500">Últimos 60min (✓/✗)</p>
                        </div>
                    </div>
                </div>

                {/* API músicas/h */}
                <div className="bg-[#111827] rounded-xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-purple-50">
                            <TrendingUp className="h-6 w-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{apiAvgSongsPerHour.toFixed(1)}</p>
                            <p className="text-sm text-slate-500">API músicas/h</p>
                            <p className="text-[11px] text-charcoal/60 mt-0.5">{apiSongsGenerated} músicas no período</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Button */}
            {actionableOrders.length > 0 && (
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Zap className="h-5 w-5" />
                                Iniciar Automação
                            </h2>
                            <p className="text-blue-100 text-sm mt-1">
                                {mode === "local"
                                    ? "Processar pedidos diretamente (abrirá browser)"
                                    : "Enfileirar pedidos no Redis para processamento"}
                            </p>
                        </div>

                        <button
                            onClick={mode === "local" ? processAllOrders : enqueueAll}
                            disabled={isProcessingAll || (mode === "local" && localRunnableOrders.length === 0)}
                            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-porcelain text-blue-600 font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                            {isProcessingAll ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Processando...
                                </>
                            ) : (
                                <>
                                    <Play size={20} />
                                    {mode === "local"
                                        ? localRunnableOrders.length > 0
                                            ? `Processar ${localRunnableOrders.length} Pedido(s)`
                                            : "Aguardando janela de plano"
                                        : `Enfileirar ${actionableOrders.length} Pedido(s)`}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Orders List */}
            <div className="bg-[#111827] rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-800">Pedidos Aguardando Geração</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Ordem da fila: menor delay do plano, depois prioridade (6h/24h), depois pagamento mais antigo.
                    </p>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-charcoal/60">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                        Carregando...
                    </div>
                ) : pendingOrders.length === 0 ? (
                    <div className="p-12 text-center text-charcoal/60">
                        <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
                        <p className="font-medium text-slate-600">Nenhum pedido pendente!</p>
                        <p className="text-sm">Todos os pedidos pagos já têm músicas geradas.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {pendingOrders.map((order, index) => {
                            const status = orderStatuses[order.id];
                            const songsAvailable = Number(Boolean(order.songFileUrl)) + Number(Boolean(order.songFileUrl2));
                            const delayMs = getAutomationDelayMs(order, nowMs);
                            const isWaitingDelay = delayMs > 0;
                            const isLocalRunningNow = status?.status === "processing";
                            const isWorkerRunningNow = mode === "queue" && workerActiveOrderIdsSet.has(order.id);
                            const isRunningNow = isLocalRunningNow || isWorkerRunningNow;
                            const isEnqueuedNow = mode === "queue" && !isWorkerRunningNow && status?.status === "success";
                            const planBadge = getPlanBadge(order);

                            return (
                                <div
                                    key={order.id}
                                    className={`px-6 py-4 flex items-center justify-between transition-colors ${
                                        isWorkerRunningNow
                                            ? "bg-emerald-100/70 ring-2 ring-inset ring-emerald-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]"
                                            : isLocalRunningNow
                                            ? "bg-blue-50/80 ring-1 ring-inset ring-blue-200"
                                            : isEnqueuedNow
                                            ? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-200"
                                            : "hover:bg-slate-50"
                                    }`}
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`h-10 w-10 shrink-0 rounded-full text-white flex items-center justify-center text-lg font-bold ${
                                            isWorkerRunningNow
                                                ? "bg-emerald-600 animate-pulse"
                                                : isLocalRunningNow
                                                ? "bg-blue-600"
                                                : isEnqueuedNow
                                                ? "bg-emerald-600"
                                                : "bg-white"
                                        }`}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="font-medium text-slate-800">{order.recipientName}</span>
                                                {isWorkerRunningNow && (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-200 text-emerald-900 font-semibold inline-flex items-center gap-1">
                                                        <Loader2 size={12} className="animate-spin" />
                                                        Worker executando
                                                    </span>
                                                )}
                                                {isLocalRunningNow && !isWorkerRunningNow && (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-semibold">
                                                        Rodando agora
                                                    </span>
                                                )}
                                                {isEnqueuedNow && (
                                                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-semibold">
                                                        Enfileirado
                                                    </span>
                                                )}
                                                <span className="px-2 py-0.5 rounded text-xs bg-violet-100 text-violet-700 font-medium">
                                                    {GENRE_NAMES[order.genre]?.pt || order.genre}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                    order.vocals === "female" ? "bg-pink-100 text-pink-700" :
                                                    order.vocals === "male" ? "bg-blue-100 text-blue-700" :
                                                    "bg-slate-100 text-slate-600"
                                                }`}>
                                                    {VOCALS_LABELS[order.vocals] || order.vocals}
                                                </span>
                                                <span className="text-xs text-charcoal/60 uppercase">
                                                    {order.locale}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                    isExpressOrder(order)
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-slate-100 text-slate-600"
                                                }`}>
                                                    {planBadge}
                                                </span>
                                                {isWaitingDelay && (
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                                        ⏳ Inicia em {formatDelayShort(delayMs)}
                                                    </span>
                                                )}
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                    order.sunoAccountEmail ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                                                }`}>
                                                    {order.sunoAccountEmail ? `Suno: ${order.sunoAccountEmail}` : "Suno: livre"}
                                                </span>
                                                {songsAvailable > 0 && (
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                                                        🎵 {songsAvailable}/2
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                📧 {order.email}
                                                {order.backupWhatsApp && (
                                                    <span className="ml-3">📱 {order.backupWhatsApp}</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-charcoal/60 mt-0.5 font-mono">
                                                {order.id} • Pago: {formatDate(order.paymentCompletedAt)}
                                            </div>

                                            {/* Music Prompt */}
                                            {order.musicPrompt && (
                                                <div className="mt-1.5 flex items-center gap-1.5 max-w-2xl">
                                                    <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-md truncate flex-1" title={order.musicPrompt}>
                                                        🎵 {order.musicPrompt}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            void navigator.clipboard.writeText(order.musicPrompt!);
                                                        }}
                                                        className="p-1 rounded hover:bg-purple-100 text-purple-500 hover:text-purple-700 transition-colors shrink-0"
                                                        title="Copiar prompt"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Status message */}
                                            {status && (
                                                <div className={`mt-2 text-sm flex items-center gap-2 ${
                                                    status.status === "processing" ? "text-blue-600" :
                                                    status.status === "success" ? "text-green-600" :
                                                    status.status === "partial" ? "text-amber-600" :
                                                    status.status === "ignored" ? "text-slate-500" :
                                                    status.status === "error" ? "text-red-600" : ""
                                                }`}>
                                                    {status.status === "processing" && <Loader2 size={14} className="animate-spin" />}
                                                    {status.status === "success" && <CheckCircle size={14} />}
                                                    {status.status === "partial" && <Clock size={14} />}
                                                    {status.status === "ignored" && <MinusCircle size={14} />}
                                                    {status.status === "error" && <XCircle size={14} />}
                                                    {status.message}
                                                </div>
                                            )}
                                            {!status && isWorkerRunningNow && (
                                                <div className="mt-2 text-sm flex items-center gap-2 text-emerald-700">
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Worker processando este pedido agora
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setSelectedOrderId(order.id)}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                                            title="Ver detalhes do pedido"
                                        >
                                            <Eye size={16} />
                                        </button>
                                        <button
                                            onClick={() => processOrder(order.id, undefined, true)}
                                            disabled={
                                                status?.status === "processing" ||
                                                isWorkerRunningNow ||
                                                status?.status === "ignored" ||
                                                isProcessingAll
                                            }
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={
                                                isWorkerRunningNow
                                                    ? "Pedido já está sendo processado no worker"
                                                    : mode === "local" && isWaitingDelay
                                                    ? "Clique para furar a fila e processar agora"
                                                    : undefined
                                            }
                                        >
                                            {status?.status === "processing" ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Play size={16} />
                                            )}
                                            Processar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {recentOrders.length > 0 && (
                <div className="bg-[#111827] rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-semibold text-slate-800">Processados recentemente (sessão)</h2>
                        <span className="text-xs text-charcoal/60">{recentOrders.length}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {recentOrders.map((order) => (
                            <div key={order.id} className="px-6 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-slate-800">{order.recipientName}</span>
                                        <span className="text-xs text-slate-500">{order.email}</span>
                                        {order.sunoAccountEmail && (
                                            <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">
                                                Suno: {order.sunoAccountEmail}
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium">
                                            +{order.songsGenerated} músicas
                                        </span>
                                        {order.deliverySent && (
                                            <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">
                                                Entregue
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-charcoal/60 mt-1 font-mono truncate">
                                        {order.id}
                                    </div>
                                </div>
                                <div className="text-xs text-slate-500 whitespace-nowrap">
                                    {formatProcessedAt(order.processedAt)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h3 className="font-semibold text-amber-800 mb-2">Como funciona:</h3>
                <ul className="text-sm text-amber-700 space-y-1">
                    <li>• <strong>Modo Local:</strong> Processa diretamente no browser (para testes). Abrirá o Chromium.</li>
                    <li>• <strong>Modo Redis:</strong> Enfileira no BullMQ para o worker processar em background.</li>
                    <li>• Para ativar modo local, defina <code className="bg-amber-100 px-1 rounded">SUNO_LOCAL_MODE=true</code> no .env</li>
                    <li>• Cada pedido gera 2 músicas e faz upload automático para o R2.</li>
                </ul>
            </div>

            {/* Lead Details Dialog */}
            {selectedLead && (
                <LeadDetailsDialog
                    lead={selectedLead}
                    open={!!selectedOrderId}
                    onClose={() => setSelectedOrderId(null)}
                />
            )}
        </div>
    );
}
