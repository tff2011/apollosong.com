"use client";

import { RefreshCw, Mail, Music, Clock, User } from "lucide-react";
import { api } from "~/trpc/react";

export default function SunoEmailsPage() {
    const utils = api.useUtils();
    const { data: sunoEmails, isLoading } = api.admin.getSunoEmails.useQuery();

    const formatDate = (date: Date | string | null) => {
        if (!date) return "—";
        return new Date(date).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const totalSongs = sunoEmails?.reduce((acc, email) => acc + email.songsGenerated, 0) ?? 0;

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Mail className="text-blue-600 h-8 w-8" />
                        Contas Suno AI
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Emails das contas Suno usadas na automacao
                    </p>
                </div>

                <button
                    onClick={() => utils.admin.getSunoEmails.invalidate()}
                    className="flex items-center gap-2 px-5 py-3 bg-[#111827] border border-slate-200 text-slate-700 rounded-full hover:bg-slate-50 transition-all shadow-sm hover:shadow font-medium"
                    title="Recarregar dados"
                >
                    <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    Recarregar
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#111827] rounded-xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-blue-50">
                            <User className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{sunoEmails?.length ?? 0}</p>
                            <p className="text-sm text-slate-500">Contas Utilizadas</p>
                        </div>
                    </div>
                </div>

                <div className="bg-[#111827] rounded-xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-emerald-50">
                            <Music className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{totalSongs}</p>
                            <p className="text-sm text-slate-500">Total de Musicas</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Emails List */}
            <div className="bg-[#111827] rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-800">Historico de Contas</h2>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center text-charcoal/60">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                        Carregando...
                    </div>
                ) : !sunoEmails || sunoEmails.length === 0 ? (
                    <div className="p-12 text-center text-charcoal/60">
                        <Mail className="h-12 w-12 mx-auto mb-3 text-charcoal/70" />
                        <p className="font-medium text-slate-600">Nenhuma conta encontrada</p>
                        <p className="text-sm">As contas aparecerao aqui apos processar pedidos.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {sunoEmails.map((item, index) => (
                            <div key={item.email} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-lg font-bold">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-800">{item.email}</p>
                                        <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                            <span className="flex items-center gap-1">
                                                <Music size={14} />
                                                {item.songsGenerated} musica{item.songsGenerated !== 1 ? "s" : ""}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock size={14} />
                                                Ultimo uso: {formatDate(item.lastUsed)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                                        {item.songsGenerated} geradas
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
