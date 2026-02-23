"use client";

import { Clock3, Pause, Play, Square, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { type RouterOutputs, api } from "~/trpc/react";

function formatDateTime(value: Date | null | undefined): string {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatTime(value: Date | null | undefined): string {
    if (!value) return "-";
    return new Date(value).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatWorkedMinutes(value: number | null): string {
    if (value === null) return "-";
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatDateWithWeekday(value: Date): string {
    const weekday = value.toLocaleDateString("pt-BR", { weekday: "long" });
    const normalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const dateLabel = value.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    return `${normalizedWeekday}, ${dateLabel}`;
}

function formatDayKeyWithWeekday(dayKey: string | null | undefined): string {
    if (!dayKey) return "-";

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        return formatDateWithWeekday(new Date(year, month, day, 12, 0, 0));
    }

    const parsed = new Date(dayKey);
    if (!Number.isNaN(parsed.getTime())) {
        return formatDateWithWeekday(parsed);
    }

    return dayKey;
}

function formatWorkSessionStatus(status: string | null | undefined): string {
    if (!status) return "-";

    const labels: Record<string, string> = {
        PENDING_START: "Aguardando início",
        DECLINED: "Não iniciado",
        OPEN: "Em andamento",
        PAUSED: "Pausado",
        CLOSED: "Encerrado",
    };

    return labels[status] ?? status;
}

type DayKeyRecord = {
    dayKey: string | null | undefined;
};

type MyHistoryItem = RouterOutputs["admin"]["getMyWorkSessionHistory"]["items"][number];
type TeamHistoryItem = RouterOutputs["admin"]["getTeamWorkSessionHistory"]["items"][number];

function buildDayStripedRows<T extends DayKeyRecord>(rows: T[]): Array<{ item: T; dayGroupIndex: number; isGroupStart: boolean }> {
    let currentDayKey: string | null | undefined;
    let dayGroupIndex = -1;

    return rows.map((item) => {
        const isGroupStart = item.dayKey !== currentDayKey;
        if (isGroupStart) {
            dayGroupIndex += 1;
            currentDayKey = item.dayKey;
        }

        return {
            item,
            dayGroupIndex,
            isGroupStart,
        };
    });
}

function getDayRowClass(dayGroupIndex: number, isGroupStart: boolean): string {
    const isEvenGroup = dayGroupIndex % 2 === 0;
    const baseTone = isEvenGroup
        ? "bg-[#f1f7ff] hover:bg-[#e8f3ff]"
        : "bg-[#f2fbf3] hover:bg-[#e8f8ea]";
    const dayStartBorder = isGroupStart ? "border-t-2 border-slate-300" : "";
    return `border-b border-slate-100 transition-colors ${baseTone} ${dayStartBorder}`.trim();
}

export default function TimeClockPage() {
    const router = useRouter();
    const utils = api.useUtils();
    const [myHistoryPage, setMyHistoryPage] = useState(1);
    const [teamHistoryPage, setTeamHistoryPage] = useState(1);
    const myHistoryPageSize = 45;
    const teamHistoryPageSize = 120;

    const { data: me } = api.admin.getCurrentAdmin.useQuery();
    const isSuperAdmin = !!me?.isSuperAdmin;
    const { data: status } = api.admin.getMyWorkSessionStatus.useQuery(undefined, {
        enabled: isSuperAdmin,
        refetchInterval: 30000,
    });
    const {
        data: myHistory,
        isLoading: isLoadingMyHistory,
        isFetching: isFetchingMyHistory,
    } = api.admin.getMyWorkSessionHistory.useQuery({
        limit: myHistoryPageSize,
        page: myHistoryPage,
    }, {
        enabled: isSuperAdmin,
    });
    const {
        data: teamHistory,
        isLoading: isLoadingTeamHistory,
        isFetching: isFetchingTeamHistory,
    } = api.admin.getTeamWorkSessionHistory.useQuery(
        { limit: teamHistoryPageSize, page: teamHistoryPage },
        { enabled: isSuperAdmin }
    );

    useEffect(() => {
        if (me && !me.isSuperAdmin) {
            router.replace("/admin/leads");
        }
    }, [me, router]);

    const myHistoryItems: MyHistoryItem[] = myHistory?.items ?? [];
    const teamHistoryItems: TeamHistoryItem[] = teamHistory?.items ?? [];

    const stripedMyHistoryRows = useMemo(() => buildDayStripedRows(myHistoryItems), [myHistoryItems]);
    const stripedTeamHistoryRows = useMemo(() => buildDayStripedRows(teamHistoryItems), [teamHistoryItems]);

    useEffect(() => {
        const totalPages = myHistory?.pagination.totalPages;
        if (totalPages && myHistoryPage > totalPages) {
            setMyHistoryPage(totalPages);
        }
    }, [myHistory?.pagination.totalPages, myHistoryPage]);

    useEffect(() => {
        const totalPages = teamHistory?.pagination.totalPages;
        if (totalPages && teamHistoryPage > totalPages) {
            setTeamHistoryPage(totalPages);
        }
    }, [teamHistory?.pagination.totalPages, teamHistoryPage]);

    const startWorkSession = api.admin.startMyWorkSession.useMutation({
        onSuccess: async () => {
            toast.success("Ponto iniciado.");
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
            ]);
        },
        onError: (error) => toast.error(error.message),
    });

    const pauseWorkSession = api.admin.pauseMyWorkSession.useMutation({
        onSuccess: async () => {
            toast.success("Ponto pausado.");
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
            ]);
        },
        onError: (error) => toast.error(error.message),
    });

    const resumeWorkSession = api.admin.resumeMyWorkSession.useMutation({
        onSuccess: async () => {
            toast.success("Ponto retomado.");
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
            ]);
        },
        onError: (error) => toast.error(error.message),
    });

    const endWorkSession = api.admin.endMyWorkSession.useMutation({
        onSuccess: async () => {
            toast.success("Ponto encerrado.");
            await Promise.all([
                utils.admin.getMyWorkSessionStatus.invalidate(),
                utils.admin.getMyWorkSessionHistory.invalidate(),
                utils.admin.getCurrentAdmin.invalidate(),
                utils.admin.getTeamWorkSessionHistory.invalidate(),
            ]);
        },
        onError: (error) => toast.error(error.message),
    });

    const nowLabel = status?.serverNow
        ? new Date(status.serverNow).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
        : "";

    const isPaused = status?.openWorkSession?.status === "PAUSED";
    const workedMinutesToday = status?.currentWorkedMs === null || status?.currentWorkedMs === undefined
        ? null
        : Math.round(status.currentWorkedMs / 60000);
    const pausedMinutesToday = status?.currentPausedMs === null || status?.currentPausedMs === undefined
        ? null
        : Math.round(status.currentPausedMs / 60000);
    const currentStatus = status?.openWorkSession?.status ?? status?.todayWorkSession?.status;
    const currentDayLabel = status?.serverNow
        ? formatDateWithWeekday(new Date(status.serverNow))
        : (status?.dayLabel ?? "-");
    const isDayClosed = status?.todayWorkSession?.status === "CLOSED";

    if (!me || !isSuperAdmin) {
        return null;
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Clock3 className="h-6 w-6 text-sky-700" />
                    Controle de Ponto
                </h1>
                <p className="text-slate-600 mt-1">Registre entrada/saída e acompanhe o histórico de jornada.</p>
            </div>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle>Status de hoje</CardTitle>
                    <CardDescription>{nowLabel ? `Agora: ${nowLabel}` : ""}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                        <InfoBox label="Dia" value={currentDayLabel} />
                        <InfoBox label="Status" value={formatWorkSessionStatus(currentStatus)} />
                        <InfoBox label="Início" value={formatTime(status?.openWorkSession?.startedAt ?? status?.todayWorkSession?.startedAt)} />
                        <InfoBox label="Trabalhado" value={formatWorkedMinutes(workedMinutesToday)} />
                        <InfoBox label="Pausado" value={formatWorkedMinutes(pausedMinutesToday)} />
                        <InfoBox label="Fim" value={formatTime(status?.todayWorkSession?.endedAt)} />
                    </div>

                    {me?.role === "STAFF" ? (
                        <div className="flex items-center gap-3 flex-wrap">
                            <Button
                                className="bg-emerald-700 hover:bg-emerald-600 text-white"
                                onClick={() => startWorkSession.mutate()}
                                disabled={Boolean(status?.openWorkSession) || isDayClosed || startWorkSession.isPending}
                            >
                                <Play className="h-4 w-4" />
                                {isDayClosed ? "Dia encerrado" : "Iniciar ponto"}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => pauseWorkSession.mutate()}
                                disabled={!status?.openWorkSession || isPaused || pauseWorkSession.isPending}
                            >
                                <Pause className="h-4 w-4" />
                                Pausar
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => resumeWorkSession.mutate()}
                                disabled={!status?.openWorkSession || !isPaused || resumeWorkSession.isPending}
                            >
                                <Play className="h-4 w-4" />
                                Retomar
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => endWorkSession.mutate()}
                                disabled={!status?.openWorkSession || endWorkSession.isPending}
                            >
                                <Square className="h-4 w-4" />
                                Encerrar ponto
                            </Button>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-600">Como administrador geral, você pode acompanhar o ponto da equipe abaixo.</p>
                    )}
                    {me?.role === "STAFF" && isDayClosed ? (
                        <p className="text-xs text-amber-700">
                            O ponto de hoje já foi encerrado e não pode ser iniciado novamente.
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle>Meu histórico</CardTitle>
                    <CardDescription>Últimos registros de entrada e saída.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingMyHistory ? <p className="text-sm text-slate-500">Carregando histórico...</p> : null}

                    {!isLoadingMyHistory && myHistoryItems.length === 0 ? (
                        <p className="text-sm text-slate-500">Sem registros ainda.</p>
                    ) : null}

                    {myHistoryItems.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                        <th className="py-2">Dia</th>
                                        <th className="py-2">Status</th>
                                        <th className="py-2">Início</th>
                                        <th className="py-2">Fim</th>
                                        <th className="py-2">Horas</th>
                                        <th className="py-2">Pausas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stripedMyHistoryRows.map(({ item, dayGroupIndex, isGroupStart }) => (
                                        <tr key={item.id} className={getDayRowClass(dayGroupIndex, isGroupStart)}>
                                            <td className={`py-2 ${isGroupStart ? "font-medium text-slate-800" : "text-slate-700"}`}>{formatDayKeyWithWeekday(item.dayKey)}</td>
                                            <td className="py-2">{formatWorkSessionStatus(item.status)}</td>
                                            <td className="py-2">{formatDateTime(item.startedAt)}</td>
                                            <td className="py-2">{formatDateTime(item.endedAt)}</td>
                                            <td className="py-2">{formatWorkedMinutes(item.workedMinutes)}</td>
                                            <td className="py-2">{formatWorkedMinutes(item.pausedMinutes)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}

                    {myHistory?.pagination && myHistoryItems.length > 0 ? (
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-slate-500">
                                Mostrando {myHistoryItems.length} de {myHistory.pagination.total} registros.
                                Página {myHistory.pagination.page} de {myHistory.pagination.totalPages}.
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMyHistoryPage((prev) => Math.max(1, prev - 1))}
                                    disabled={!myHistory.pagination.hasPrevPage || isFetchingMyHistory}
                                >
                                    Anterior
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMyHistoryPage((prev) => prev + 1)}
                                    disabled={!myHistory.pagination.hasNextPage || isFetchingMyHistory}
                                >
                                    Próxima
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {me?.isSuperAdmin ? (
                <Card className="border-slate-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserCheck className="h-5 w-5 text-indigo-700" />
                            Histórico da Equipe
                        </CardTitle>
                        <CardDescription>Visão completa de ponto dos funcionários, paginada por período.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingTeamHistory ? <p className="text-sm text-slate-500">Carregando equipe...</p> : null}

                        {!isLoadingTeamHistory && teamHistoryItems.length === 0 ? (
                            <p className="text-sm text-slate-500">Nenhum registro encontrado.</p>
                        ) : null}

                        {teamHistoryItems.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-left text-slate-500">
                                            <th className="py-2">Usuário</th>
                                            <th className="py-2">Dia</th>
                                            <th className="py-2">Status</th>
                                            <th className="py-2">Início</th>
                                            <th className="py-2">Fim</th>
                                            <th className="py-2">Horas</th>
                                            <th className="py-2">Pausas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stripedTeamHistoryRows.map(({ item, dayGroupIndex, isGroupStart }) => (
                                            <tr key={item.id} className={getDayRowClass(dayGroupIndex, isGroupStart)}>
                                                <td className="py-2">{item.user.name ?? item.user.adminUsername ?? item.user.email ?? "-"}</td>
                                                <td className={`py-2 ${isGroupStart ? "font-medium text-slate-800" : "text-slate-700"}`}>{formatDayKeyWithWeekday(item.dayKey)}</td>
                                                <td className="py-2">{formatWorkSessionStatus(item.status)}</td>
                                                <td className="py-2">{formatDateTime(item.startedAt)}</td>
                                                <td className="py-2">{formatDateTime(item.endedAt)}</td>
                                                <td className="py-2">{formatWorkedMinutes(item.workedMinutes)}</td>
                                                <td className="py-2">{formatWorkedMinutes(item.pausedMinutes)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        {teamHistory?.pagination && teamHistoryItems.length > 0 ? (
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-slate-500">
                                    Mostrando {teamHistoryItems.length} de {teamHistory.pagination.total} registros.
                                    Página {teamHistory.pagination.page} de {teamHistory.pagination.totalPages}.
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setTeamHistoryPage((prev) => Math.max(1, prev - 1))}
                                        disabled={!teamHistory.pagination.hasPrevPage || isFetchingTeamHistory}
                                    >
                                        Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setTeamHistoryPage((prev) => prev + 1)}
                                        disabled={!teamHistory.pagination.hasNextPage || isFetchingTeamHistory}
                                    >
                                        Próxima
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}

function InfoBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-semibold text-slate-900 mt-1">{value}</p>
        </div>
    );
}
