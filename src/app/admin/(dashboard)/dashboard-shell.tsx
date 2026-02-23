"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clock3, Crown, LogOut, Menu, Pause, Play } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "~/components/ui/sheet";
import { canAccessAdminPath } from "~/lib/admin/permissions";
import { api } from "~/trpc/react";

const AUTOMATION_LOCK_STORAGE_KEY = "admin-suno-automation-lock";
const AUTOMATION_LOCK_EVENT = "suno-automation-lock-change";

export function DashboardShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const utils = api.useUtils();

    const [isAutomationLocked, setIsAutomationLocked] = useState(false);
    const [workPromptOpen, setWorkPromptOpen] = useState(false);
    const [workElapsedTick, setWorkElapsedTick] = useState(() => Date.now());
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const { data: me } = api.admin.getCurrentAdmin.useQuery(undefined, {
        refetchInterval: 30000,
    });

    const role = me?.role ?? "STAFF";
    const permissions = me?.permissions ?? [];

    const canAccessLeads = canAccessAdminPath(role, permissions, "/admin/leads");
    const canAccessStats = canAccessAdminPath(role, permissions, "/admin/stats");
    const canAccessConversion = canAccessAdminPath(role, permissions, "/admin/conversion");
    const canAccessCoupons = canAccessAdminPath(role, permissions, "/admin/coupons");
    const canAccessAutomation = canAccessAdminPath(role, permissions, "/admin/automation");
    const canAccessTickets = canAccessAdminPath(role, permissions, "/admin/tickets");
    const canAccessWhatsApp = canAccessAdminPath(role, permissions, "/admin/whatsapp");
    const canAccessBounces = canAccessAdminPath(role, permissions, "/admin/bounces");
    const canAccessKnowledge = canAccessAdminPath(role, permissions, "/admin/knowledge");
    const canAccessPronunciation = canAccessAdminPath(role, permissions, "/admin/pronunciation-corrections");
    const canAccessGenres = canAccessAdminPath(role, permissions, "/admin/genre-prompts");
    const canAccessAudioSamples = canAccessAdminPath(role, permissions, "/admin/audio-samples");
    const canAccessSunoEmails = canAccessAdminPath(role, permissions, "/admin/suno-emails");
    const canAccessContentCalendar = canAccessAdminPath(role, permissions, "/admin/content-calendar");
    const canAccessTimeClock = canAccessAdminPath(role, permissions, "/admin/time-clock");
    const canAccessTeam = canAccessAdminPath(role, permissions, "/admin/team");
    const canUseWorkClockInHeader = role === "STAFF";
    const shouldLockOperations = isAutomationLocked && canAccessAutomation;

    const { data: ticketStats } = api.admin.getTicketStats.useQuery(undefined, {
        refetchInterval: 30000,
        enabled: canAccessTickets,
    });
    const { data: bounceStats } = api.admin.getEmailBounceStats.useQuery(undefined, {
        refetchInterval: 30000,
        enabled: canAccessBounces,
    });
    const { data: waStats } = api.admin.getWhatsAppStats.useQuery(undefined, {
        refetchInterval: 30000,
        enabled: canAccessWhatsApp,
    });
    const { data: automationNavStats } = api.admin.getAutomationNavStats.useQuery(undefined, {
        refetchInterval: 30000,
        enabled: canAccessAutomation,
    });

    const { data: workStatus } = api.admin.getMyWorkSessionStatus.useQuery(undefined, {
        enabled: canUseWorkClockInHeader,
        refetchInterval: 60000,
    });

    const respondToPrompt = api.admin.respondToWorkSessionPrompt.useMutation({
        onSuccess: async () => {
            setWorkPromptOpen(false);
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
            ]);
        },
    });

    const endWorkSession = api.admin.endMyWorkSession.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
            ]);
        },
    });

    const startWorkSession = api.admin.startMyWorkSession.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
            ]);
        },
    });

    const pauseWorkSession = api.admin.pauseMyWorkSession.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
            ]);
        },
    });

    const resumeWorkSession = api.admin.resumeMyWorkSession.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
            ]);
        },
    });

    useEffect(() => {
        const readLockState = () => {
            try {
                setIsAutomationLocked(sessionStorage.getItem(AUTOMATION_LOCK_STORAGE_KEY) === "true");
            } catch {
                setIsAutomationLocked(false);
            }
        };

        const handleLockChange = (event: Event) => {
            const detail = (event as CustomEvent<boolean>).detail;
            if (typeof detail === "boolean") {
                setIsAutomationLocked(detail);
                return;
            }
            readLockState();
        };

        readLockState();
        window.addEventListener(AUTOMATION_LOCK_EVENT, handleLockChange);
        window.addEventListener("storage", readLockState);
        return () => {
            window.removeEventListener(AUTOMATION_LOCK_EVENT, handleLockChange);
            window.removeEventListener("storage", readLockState);
        };
    }, []);

    useEffect(() => {
        if (!me) return;

        const currentPath = pathname || "/admin";
        if (!canAccessAdminPath(role, permissions, currentPath)) {
            router.replace(me.defaultPath);
        }
    }, [me, pathname, permissions, role, router]);

    useEffect(() => {
        if (!me || !canAccessAutomation) return;
        if (shouldLockOperations && pathname !== "/admin/automation") {
            router.replace("/admin/automation");
        }
    }, [pathname, router, me, canAccessAutomation, shouldLockOperations]);

    useEffect(() => {
        if (!workStatus?.shouldPromptStart) return;
        setWorkPromptOpen(true);
    }, [workStatus?.dayKey, workStatus?.shouldPromptStart]);

    useEffect(() => {
        const startedAt = workStatus?.openWorkSession?.startedAt;
        if (!startedAt) return;

        setWorkElapsedTick(Date.now());
        const timer = window.setInterval(() => {
            setWorkElapsedTick(Date.now());
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, [workStatus?.openWorkSession?.startedAt]);

    const handleLogout = async () => {
        await signOut({ callbackUrl: "/admin/login" });
    };

    const startedAtLabel = useMemo(() => {
        if (!workStatus?.openWorkSession?.startedAt) return null;
        return new Date(workStatus.openWorkSession.startedAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }, [workStatus?.openWorkSession?.startedAt]);

    const elapsedWorkLabel = useMemo(() => {
        const startedAt = workStatus?.openWorkSession?.startedAt;
        if (!startedAt) return null;

        const startedAtMs = new Date(startedAt).getTime();
        if (!Number.isFinite(startedAtMs)) return null;

        const totalPausedMs = Math.max(0, workStatus?.openWorkSession?.totalPausedMs ?? 0);
        const pausedAtRaw = workStatus?.openWorkSession?.pausedAt;
        const pausedAtMs = pausedAtRaw ? new Date(pausedAtRaw).getTime() : null;
        const currentPauseWindowMs = pausedAtMs && Number.isFinite(pausedAtMs)
            ? Math.max(0, workElapsedTick - pausedAtMs)
            : 0;

        const elapsedMs = Math.max(0, workElapsedTick - startedAtMs - totalPausedMs - currentPauseWindowMs);
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }, [
        workStatus?.openWorkSession?.startedAt,
        workStatus?.openWorkSession?.totalPausedMs,
        workStatus?.openWorkSession?.pausedAt,
        workElapsedTick,
    ]);

    const promptNowLabel = workStatus?.serverNow
        ? new Date(workStatus.serverNow).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
        : "";
    const isWorkPaused = workStatus?.openWorkSession?.status === "PAUSED";
    const isWorkDayClosed = workStatus?.todayWorkSession?.status === "CLOSED";
    const workDayLabel = useMemo(() => {
        if (!workStatus?.serverNow || !workStatus?.dayLabel) return workStatus?.dayLabel ?? "";
        const weekday = new Date(workStatus.serverNow).toLocaleDateString("pt-BR", { weekday: "long" });
        const normalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        return `${normalizedWeekday}, ${workStatus.dayLabel}`;
    }, [workStatus?.dayLabel, workStatus?.serverNow]);

    const operationLinks = [
        canAccessLeads ? { href: "/admin/leads", label: "Orders & Leads", active: pathname === "/admin/leads" || pathname === "/admin" } : null,
        canAccessStats ? { href: "/admin/stats", label: "Intelligence", active: pathname === "/admin/stats" } : null,
        canAccessConversion ? { href: "/admin/conversion", label: "Funnel", active: pathname === "/admin/conversion" } : null,
        canAccessCoupons ? { href: "/admin/coupons", label: "Cupons", active: pathname === "/admin/coupons" } : null,
        canAccessAutomation
            ? {
                href: "/admin/automation",
                label: `Automation (${automationNavStats?.songsPending ?? 0})`,
                active: pathname === "/admin/automation",
            }
            : null,
    ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

    const helpDeskLinks = [
        canAccessTickets
            ? {
                href: "/admin/tickets",
                label: `E-mails${ticketStats?.total ? ` (${ticketStats.total})` : ""}`,
                active: pathname.startsWith("/admin/tickets"),
            }
            : null,
        canAccessWhatsApp
            ? {
                href: "/admin/whatsapp",
                label: `WhatsApp${waStats?.active24h ? ` (${waStats.active24h})` : ""}`,
                active: pathname === "/admin/whatsapp",
            }
            : null,
        canAccessBounces
            ? {
                href: "/admin/bounces",
                label: `Bounces${bounceStats?.unresolvedWithOrder ? ` (${bounceStats.unresolvedWithOrder})` : ""}`,
                active: pathname === "/admin/bounces",
            }
            : null,
        canAccessKnowledge
            ? {
                href: "/admin/knowledge",
                label: "Knowledge",
                active: pathname === "/admin/knowledge",
            }
            : null,
    ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

    const productionLinks = [
        canAccessPronunciation
            ? {
                href: "/admin/pronunciation-corrections",
                label: "Corrections",
                active: pathname === "/admin/pronunciation-corrections",
            }
            : null,
        canAccessGenres
            ? {
                href: "/admin/genre-prompts",
                label: "Genres",
                active: pathname === "/admin/genre-prompts",
            }
            : null,
        canAccessAudioSamples
            ? {
                href: "/admin/audio-samples",
                label: "Audio Samples",
                active: pathname === "/admin/audio-samples",
            }
            : null,
        canAccessSunoEmails
            ? {
                href: "/admin/suno-emails",
                label: "Suno Emails",
                active: pathname === "/admin/suno-emails",
            }
            : null,
    ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

    const marketingLinks = [
        canAccessContentCalendar
            ? {
                href: "/admin/content-calendar",
                label: "Calendario",
                active: pathname === "/admin/content-calendar",
            }
            : null,
    ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

    const teamLinks = [
        canAccessTimeClock
            ? {
                href: "/admin/time-clock",
                label: "Ponto",
                active: pathname === "/admin/time-clock",
            }
            : null,
        canAccessTeam
            ? {
                href: "/admin/team",
                label: "Usuários",
                active: pathname === "/admin/team",
            }
            : null,
    ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

    const navigationGroups: Array<{
        key: "operations" | "helpdesk" | "production" | "marketing" | "team";
        title: string;
        links: Array<{ href: string; label: string; active: boolean }>;
        variant?: "helpdesk" | "marketing" | "team";
        disabled?: boolean;
    }> = [
        {
            key: "operations",
            title: "Operations",
            links: operationLinks,
            disabled: shouldLockOperations,
        },
        {
            key: "helpdesk",
            title: "Help Desk",
            links: helpDeskLinks,
            variant: "helpdesk",
            disabled: shouldLockOperations,
        },
        {
            key: "production",
            title: "Production",
            links: productionLinks,
            disabled: shouldLockOperations,
        },
        {
            key: "marketing",
            title: "Marketing",
            links: marketingLinks,
            variant: "marketing",
            disabled: shouldLockOperations,
        },
        {
            key: "team",
            title: "Equipe",
            links: teamLinks,
            variant: "team",
        },
    ];

    const mobilePrimaryLinks = [
        canAccessLeads
            ? {
                href: "/admin/leads",
                label: "Leads",
                active: pathname === "/admin" || pathname.startsWith("/admin/leads"),
            }
            : null,
        canAccessTickets
            ? {
                href: "/admin/tickets",
                label: "Tickets",
                active: pathname.startsWith("/admin/tickets"),
            }
            : null,
        canAccessWhatsApp
            ? {
                href: "/admin/whatsapp",
                label: "WhatsApp",
                active: pathname === "/admin/whatsapp",
            }
            : null,
        canAccessAutomation
            ? {
                href: "/admin/automation",
                label: "Automation",
                active: pathname === "/admin/automation",
            }
            : null,
    ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

    const currentMobileSectionLabel =
        navigationGroups
            .flatMap((group) => group.links)
            .find((item) => item.active)?.label ?? "Painel";

    const desktopGroupStyles: Record<
        "operations" | "helpdesk" | "production" | "marketing" | "team",
        { label: string; nav: string }
    > = {
        operations: {
            label: "text-[10px] font-semibold uppercase tracking-[0.22em] text-charcoal/50 pl-1",
            nav: "inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white/80 backdrop-blur-sm px-1.5 py-1 shadow-[0_8px_22px_-16px_rgba(15,23,42,0.45)]",
        },
        helpdesk: {
            label: "text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-400 pl-1",
            nav: "inline-flex flex-wrap items-center gap-1 rounded-xl border border-indigo-200/80 bg-indigo-50/80 backdrop-blur-sm px-1.5 py-1 shadow-[0_8px_22px_-16px_rgba(55,48,163,0.25)]",
        },
        production: {
            label: "text-[10px] font-semibold uppercase tracking-[0.22em] text-charcoal/50 pl-1",
            nav: "inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white/80 backdrop-blur-sm px-1.5 py-1 shadow-[0_8px_22px_-16px_rgba(15,23,42,0.45)]",
        },
        marketing: {
            label: "text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-500 pl-1",
            nav: "inline-flex flex-wrap items-center gap-1 rounded-xl border border-emerald-200/80 bg-emerald-50/90 backdrop-blur-sm px-1.5 py-1 shadow-[0_8px_22px_-16px_rgba(6,95,70,0.3)]",
        },
        team: {
            label: "text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-500 pl-1",
            nav: "inline-flex flex-wrap items-center gap-1 rounded-xl border border-sky-200/80 bg-sky-50/90 backdrop-blur-sm px-1.5 py-1 shadow-[0_8px_22px_-16px_rgba(2,132,199,0.3)]",
        },
    };

    return (
        <div className="min-h-screen w-full bg-porcelain">
            <header className="fixed top-0 left-0 right-0 h-14 lg:h-16 bg-white z-50 flex items-center justify-between px-3 lg:px-6 shadow-md border-b border-dark/10">
                <div className="hidden lg:flex items-center gap-2">
                    <Crown className="h-5 w-5 text-terracotta-400" />
                    <span className="text-dark font-bold text-lg uppercase">
                        <span className="bg-gradient-to-r from-aegean to-dark bg-clip-text text-transparent">Apollo</span>
                        <span className="text-dark/80 normal-case font-normal">Admin</span>
                    </span>
                </div>

                <div className="flex items-center gap-2 lg:hidden">
                    <Crown className="h-4 w-4 text-terracotta-400" />
                    <div className="leading-tight">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark/80">Apollo Admin</p>
                        <p className="text-[11px] font-medium text-dark">{currentMobileSectionLabel}</p>
                    </div>
                </div>

                <div className="hidden lg:flex items-center gap-4">
                    {canUseWorkClockInHeader && workStatus ? (
                        workStatus.openWorkSession && startedAtLabel ? (
                            <div className={`hidden lg:flex items-center gap-3 rounded-xl px-3 py-1.5 shadow-sm ${
                                isWorkPaused
                                    ? "border border-terracotta-300/70 bg-terracotta-950/60"
                                    : "border border-emerald-300/70 bg-emerald-950/60"
                            }`}>
                                <div className="flex flex-col leading-tight">
                                    <span className={`text-xs font-semibold uppercase tracking-wide ${
                                        isWorkPaused ? "text-terracotta-50" : "text-emerald-50"
                                    }`}>
                                        {isWorkPaused ? `Ponto pausado (iniciado às ${startedAtLabel})` : `Ponto aberto às ${startedAtLabel}`}
                                    </span>
                                    {workDayLabel ? (
                                        <span className={`text-[11px] ${isWorkPaused ? "text-terracotta-100" : "text-emerald-100"}`}>
                                            Dia: {workDayLabel}
                                        </span>
                                    ) : null}
                                    {elapsedWorkLabel ? (
                                        <span className={`text-[12px] font-semibold tracking-wide ${
                                            isWorkPaused ? "text-dark" : "text-emerald-50"
                                        }`}>
                                            Tempo trabalhado: {elapsedWorkLabel}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    {isWorkPaused ? (
                                        <Button
                                            size="sm"
                                            className="h-7 bg-sky-500 hover:bg-sky-400 text-dark font-semibold px-2.5 text-xs"
                                            onClick={() => resumeWorkSession.mutate()}
                                            disabled={resumeWorkSession.isPending || endWorkSession.isPending}
                                        >
                                            <Play className="h-3.5 w-3.5 mr-1" />
                                            Retomar
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            className="h-7 bg-terracotta-300 hover:bg-terracotta-200 text-terracotta-950 font-semibold px-2.5 text-xs"
                                            onClick={() => pauseWorkSession.mutate()}
                                            disabled={pauseWorkSession.isPending || endWorkSession.isPending}
                                        >
                                            <Pause className="h-3.5 w-3.5 mr-1" />
                                            Pausar
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        className="h-7 bg-emerald-500 hover:bg-emerald-400 text-dark font-semibold px-2.5 text-xs"
                                        onClick={() => endWorkSession.mutate()}
                                        disabled={endWorkSession.isPending || pauseWorkSession.isPending || resumeWorkSession.isPending}
                                    >
                                        Encerrar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="hidden lg:flex items-center gap-2 rounded-xl px-3 py-1.5 shadow-sm border border-slate-300/70 bg-dark/5">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-100">
                                    {isWorkDayClosed ? "Dia encerrado" : "Ponto não iniciado"}
                                </span>
                                <Button
                                    size="sm"
                                    className="h-7 bg-emerald-500 hover:bg-emerald-400 text-dark font-semibold px-2.5 text-xs"
                                    onClick={() => startWorkSession.mutate()}
                                    disabled={isWorkDayClosed || startWorkSession.isPending}
                                >
                                    <Play className="h-3.5 w-3.5 mr-1" />
                                    {isWorkDayClosed ? "Indisponível" : "Iniciar"}
                                </Button>
                            </div>
                        )
                    ) : null}

                    <span className="text-sm text-charcoal/70 font-light hidden sm:inline-block">
                        {me?.name ? `Olá, ${me.name}` : "Painel administrativo"}
                    </span>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-charcoal/70 hover:text-dark transition-all text-xs uppercase tracking-wider font-semibold border border-dark/5 hover:border-white/20"
                    >
                        <LogOut size={14} />
                        <span>Logout</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 lg:hidden">
                    <button
                        onClick={handleLogout}
                        aria-label="Fazer logout"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-dark/80"
                    >
                        <LogOut size={16} />
                    </button>

                    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <button
                                aria-label="Abrir menu administrativo"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-dark/80"
                            >
                                <Menu size={18} />
                            </button>
                        </SheetTrigger>
                        <SheetContent
                            side="left"
                            className="w-[92vw] max-w-[360px] border-r border-dark/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-slate-50 p-0"
                        >
                            <div className="flex h-full flex-col">
                                <SheetHeader className="border-b border-dark/10 bg-white/60 px-4 py-4 text-left">
                                    <SheetTitle className="text-base font-semibold text-slate-50">Menu Administrativo</SheetTitle>
                                    <p className="text-xs text-charcoal/70">
                                        {me?.name ? `Logado como ${me.name}` : "Selecione um módulo"}
                                    </p>
                                </SheetHeader>
                                <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
                                    {canUseWorkClockInHeader && workStatus ? (
                                        <div className="rounded-xl border border-dark/10 bg-dark/5 p-3">
                                            <p className="mb-2 text-[11px] uppercase tracking-wider text-charcoal/70">Ponto</p>
                                            {workStatus.openWorkSession ? (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-slate-100">
                                                        {isWorkPaused ? "Pausado" : "Em andamento"} {startedAtLabel ? `desde ${startedAtLabel}` : ""}
                                                    </p>
                                                    {elapsedWorkLabel ? (
                                                        <p className="text-xs font-semibold text-emerald-300">Tempo: {elapsedWorkLabel}</p>
                                                    ) : null}
                                                    <div className="flex gap-2">
                                                        {isWorkPaused ? (
                                                            <Button
                                                                size="sm"
                                                                className="h-8 bg-sky-500 hover:bg-sky-400 text-dark text-xs"
                                                                onClick={() => resumeWorkSession.mutate()}
                                                                disabled={resumeWorkSession.isPending || endWorkSession.isPending}
                                                            >
                                                                Retomar
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                className="h-8 bg-terracotta-300 hover:bg-terracotta-200 text-terracotta-950 text-xs"
                                                                onClick={() => pauseWorkSession.mutate()}
                                                                disabled={pauseWorkSession.isPending || endWorkSession.isPending}
                                                            >
                                                                Pausar
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            className="h-8 bg-emerald-500 hover:bg-emerald-400 text-dark text-xs"
                                                            onClick={() => endWorkSession.mutate()}
                                                            disabled={endWorkSession.isPending || pauseWorkSession.isPending || resumeWorkSession.isPending}
                                                        >
                                                            Encerrar
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-dark/80">
                                                        {isWorkDayClosed ? "Dia encerrado" : "Ponto não iniciado"}
                                                    </p>
                                                    <Button
                                                        size="sm"
                                                        className="h-8 bg-emerald-500 hover:bg-emerald-400 text-dark text-xs"
                                                        onClick={() => startWorkSession.mutate()}
                                                        disabled={isWorkDayClosed || startWorkSession.isPending}
                                                    >
                                                        {isWorkDayClosed ? "Indisponível" : "Iniciar ponto"}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}

                                    {navigationGroups
                                        .filter((group) => group.links.length > 0)
                                        .map((group) => (
                                            <div key={group.key} className="space-y-2">
                                                <p className={`px-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                                    group.variant === "helpdesk"
                                                        ? "text-indigo-200"
                                                        : group.variant === "marketing"
                                                        ? "text-emerald-200"
                                                        : group.variant === "team"
                                                        ? "text-sky-200"
                                                        : "text-charcoal/70"
                                                }`}>{group.title}</p>
                                                <div className="space-y-1.5 rounded-xl border border-dark/10 bg-dark/5 p-2">
                                                    {group.links.map((item) => (
                                                        <NavLink
                                                            key={item.href}
                                                            href={item.href}
                                                            label={item.label}
                                                            isActive={item.active}
                                                            variant={group.variant}
                                                            disabled={group.disabled}
                                                            fullWidth
                                                            tone="mobileDark"
                                                            onNavigate={() => setMobileMenuOpen(false)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </header>

            <div className="pt-[4.5rem] lg:pt-24 px-3 sm:px-4 md:px-6 pb-24 lg:pb-12 w-full">
                <div className="mb-5 lg:hidden">
                    {mobilePrimaryLinks.length > 0 ? (
                        <nav className="flex items-center gap-2 overflow-x-auto pb-2">
                            {mobilePrimaryLinks.map((item) => (
                                <NavLink
                                    key={item.href}
                                    href={item.href}
                                    label={item.label}
                                    isActive={item.active}
                                    disabled={shouldLockOperations && item.href !== "/admin/automation"}
                                />
                            ))}
                        </nav>
                    ) : null}

                    {canUseWorkClockInHeader && workStatus ? (
                        <div className="rounded-xl border border-slate-200 bg-[#111827] p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                        {workStatus.openWorkSession ? (isWorkPaused ? "Ponto pausado" : "Ponto aberto") : "Ponto"}
                                    </p>
                                    <p className="text-sm font-semibold text-slate-800">
                                        {workStatus.openWorkSession && startedAtLabel
                                            ? `Iniciado às ${startedAtLabel}`
                                            : (isWorkDayClosed ? "Dia encerrado" : "Não iniciado")}
                                    </p>
                                    {elapsedWorkLabel ? (
                                        <p className="text-xs font-semibold text-emerald-700">Tempo: {elapsedWorkLabel}</p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    {workStatus.openWorkSession ? (
                                        <>
                                            {isWorkPaused ? (
                                                <Button
                                                    size="sm"
                                                    className="h-8 bg-sky-500 hover:bg-sky-400 text-dark px-2.5 text-xs"
                                                    onClick={() => resumeWorkSession.mutate()}
                                                    disabled={resumeWorkSession.isPending || endWorkSession.isPending}
                                                >
                                                    Retomar
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="h-8 bg-terracotta-300 hover:bg-terracotta-200 text-terracotta-950 px-2.5 text-xs"
                                                    onClick={() => pauseWorkSession.mutate()}
                                                    disabled={pauseWorkSession.isPending || endWorkSession.isPending}
                                                >
                                                    Pausar
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                className="h-8 bg-emerald-500 hover:bg-emerald-400 text-dark px-2.5 text-xs"
                                                onClick={() => endWorkSession.mutate()}
                                                disabled={endWorkSession.isPending || pauseWorkSession.isPending || resumeWorkSession.isPending}
                                            >
                                                Encerrar
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            size="sm"
                                            className="h-8 bg-emerald-500 hover:bg-emerald-400 text-dark px-2.5 text-xs"
                                            onClick={() => startWorkSession.mutate()}
                                            disabled={isWorkDayClosed || startWorkSession.isPending}
                                        >
                                            {isWorkDayClosed ? "Indisponível" : "Iniciar"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="mb-8 hidden lg:flex items-end gap-5 flex-wrap">
                    {navigationGroups
                        .filter((group) => group.links.length > 0)
                        .map((group) => {
                            const style = desktopGroupStyles[group.key];
                            return (
                                <div key={group.key} className="flex flex-col gap-1">
                                    <span className={style.label}>{group.title}</span>
                                    <nav className={style.nav}>
                                        {group.links.map((item) => (
                                            <NavLink
                                                key={item.href}
                                                href={item.href}
                                                label={item.label}
                                                isActive={item.active}
                                                variant={group.variant}
                                                disabled={group.disabled}
                                            />
                                        ))}
                                    </nav>
                                </div>
                            );
                        })}
                </div>

                {children}
            </div>

            {mobilePrimaryLinks.length > 0 ? (
                <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur">
                    <nav className="grid grid-cols-4 gap-1 px-2 py-2">
                        {mobilePrimaryLinks.slice(0, 4).map((item) => (
                            <NavLink
                                key={item.href}
                                href={item.href}
                                label={item.label}
                                isActive={item.active}
                                disabled={shouldLockOperations && item.href !== "/admin/automation"}
                                fullWidth
                            />
                        ))}
                    </nav>
                </div>
            ) : null}

            <Dialog
                open={workPromptOpen}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) return;
                    setWorkPromptOpen(nextOpen);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Clock3 className="h-5 w-5 text-emerald-600" />
                            Registrar início do ponto
                        </DialogTitle>
                        <DialogDescription>
                            {`Agora é ${promptNowLabel}. Você está começando a trabalhar hoje (${workStatus?.dayLabel})?`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => respondToPrompt.mutate({ startNow: false })}
                            disabled={respondToPrompt.isPending}
                        >
                            Não
                        </Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-500 text-dark"
                            onClick={() => respondToPrompt.mutate({ startNow: true })}
                            disabled={respondToPrompt.isPending}
                        >
                            Sim, começar agora
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function NavLink({
    href,
    label,
    isActive,
    variant,
    disabled,
    fullWidth,
    tone,
    onNavigate,
}: {
    href: string;
    label: string;
    isActive: boolean;
    variant?: "helpdesk" | "marketing" | "team";
    disabled?: boolean;
    fullWidth?: boolean;
    tone?: "default" | "mobileDark";
    onNavigate?: () => void;
}) {
    const isMobileDark = tone === "mobileDark";

    const base = isMobileDark
        ? variant === "helpdesk"
            ? isActive
                ? "bg-indigo-500 text-dark border-indigo-400/80 shadow-sm shadow-indigo-900/40"
                : "bg-indigo-950/45 text-indigo-100 border-indigo-400/25 hover:bg-indigo-900/60 hover:border-indigo-300/45 hover:text-dark"
            : variant === "marketing"
            ? isActive
                ? "bg-emerald-500 text-dark border-emerald-400/80 shadow-sm shadow-emerald-900/40"
                : "bg-emerald-950/45 text-emerald-100 border-emerald-400/25 hover:bg-emerald-900/60 hover:border-emerald-300/45 hover:text-dark"
            : variant === "team"
            ? isActive
                ? "bg-sky-500 text-dark border-sky-400/80 shadow-sm shadow-sky-900/40"
                : "bg-sky-950/45 text-sky-100 border-sky-400/25 hover:bg-sky-900/60 hover:border-sky-300/45 hover:text-dark"
            : isActive
                ? "bg-porcelain text-slate-900 border-white/90 shadow-sm shadow-slate-900/20"
                : "bg-dark/5 text-slate-100 border-slate-600/60 hover:bg-white hover:border-slate-400/70 hover:text-dark"
        : variant === "helpdesk"
        ? isActive
            ? "bg-indigo-600 text-dark border-indigo-600/70 shadow-sm shadow-indigo-200/60"
            : "text-indigo-600/80 border-transparent hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        : variant === "marketing"
        ? isActive
            ? "bg-emerald-600 text-dark border-emerald-600/70 shadow-sm shadow-emerald-200/60"
            : "text-emerald-600/85 border-transparent hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
        : variant === "team"
        ? isActive
            ? "bg-sky-600 text-dark border-sky-600/70 shadow-sm shadow-sky-200/60"
            : "text-sky-700/85 border-transparent hover:border-sky-200 hover:bg-sky-100 hover:text-sky-800"
        : isActive
            ? "bg-white text-dark border-slate-900/70 shadow-sm shadow-slate-200/70"
            : "text-slate-600/90 border-transparent hover:border-slate-300 hover:bg-white hover:text-slate-900";

    const sizeClasses = isMobileDark
        ? "px-3.5 py-2.5 rounded-xl text-sm font-semibold"
        : "px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold";

    const disabledClasses = disabled
        ? isMobileDark
            ? "cursor-not-allowed opacity-45 pointer-events-none"
            : "cursor-not-allowed opacity-60 pointer-events-none"
        : "";

    return (
        <Link
            href={href}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onClick={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onNavigate?.();
            }}
            className={`inline-flex items-center justify-center border transition-all duration-200 ${sizeClasses} ${base} ${fullWidth ? "w-full min-w-0" : ""} ${disabledClasses}`}
        >
            {label}
        </Link>
    );
}
