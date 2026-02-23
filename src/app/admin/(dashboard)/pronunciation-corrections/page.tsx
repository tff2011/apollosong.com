"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Plus, Trash2, Edit2, Save, X, Search, Mic, Volume2 } from "lucide-react";
import { toast } from "sonner";

export default function PronunciationCorrectionsPage() {
    const [search, setSearch] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form states
    const [original, setOriginal] = useState("");
    const [replacement, setReplacement] = useState("");

    const utils = api.useUtils();

    const { data: corrections, isLoading } = api.admin.getPronunciationCorrections.useQuery();

    const createMutation = api.admin.createPronunciationCorrection.useMutation({
        onSuccess: () => {
            toast.success("Correção adicionada com sucesso!");
            setIsCreating(false);
            setOriginal("");
            setReplacement("");
            utils.admin.getPronunciationCorrections.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const updateMutation = api.admin.updatePronunciationCorrection.useMutation({
        onSuccess: () => {
            toast.success("Correção atualizada!");
            setEditingId(null);
            setOriginal("");
            setReplacement("");
            utils.admin.getPronunciationCorrections.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const deleteMutation = api.admin.deletePronunciationCorrection.useMutation({
        onSuccess: () => {
            toast.success("Correção removida!");
            utils.admin.getPronunciationCorrections.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const filteredCorrections = corrections?.filter(c =>
        c.original.toLowerCase().includes(search.toLowerCase()) ||
        c.replacement.toLowerCase().includes(search.toLowerCase())
    );

    const handleEdit = (c: { id: string, original: string, replacement: string }) => {
        setEditingId(c.id);
        setOriginal(c.original);
        setReplacement(c.replacement);
        setIsCreating(false);
    };

    const handleSave = () => {
        if (!original.trim() || !replacement.trim()) {
            toast.error("Preencha todos os campos");
            return;
        }

        if (editingId) {
            updateMutation.mutate({ id: editingId, original, replacement });
        } else {
            createMutation.mutate({ original, replacement });
        }
    };

    const handleCancel = () => {
        setIsCreating(false);
        setEditingId(null);
        setOriginal("");
        setReplacement("");
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Mic className="text-indigo-600 h-8 w-8" />
                        Correções de Pronúncia
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Gerencie como o Suno AI deve pronunciar nomes e palavras específicas.
                    </p>
                </div>

                <button
                    onClick={() => { setIsCreating(true); setEditingId(null); setOriginal(""); setReplacement(""); }}
                    disabled={isCreating || !!editingId}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-white rounded-full hover:bg-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    <Plus size={18} />
                    Nova Correção
                </button>
            </div>

            {/* Search */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-charcoal/60 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                    type="text"
                    placeholder="Buscar correções..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="block w-full pl-11 pr-4 py-4 bg-[#111827] border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                />
            </div>

            {/* Editor Card (Create/Edit) */}
            {(isCreating || editingId) && (
                <div className="bg-[#111827] rounded-2xl p-8 border border-indigo-100 shadow-xl shadow-indigo-500/5 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            {editingId ? <Edit2 size={18} className="text-indigo-500" /> : <Plus size={18} className="text-green-500" />}
                            {editingId ? "Editar Correção" : "Adicionar Nova Correção"}
                        </h3>
                        <button onClick={handleCancel} className="text-charcoal/60 hover:text-slate-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Original (O que o usuário escreve)</label>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Ex: Lucia"
                                value={original}
                                onChange={(e) => setOriginal(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Substituição (Para o Suno ler)</label>
                            <input
                                type="text"
                                placeholder="Ex: Lúcia"
                                value={replacement}
                                onChange={(e) => setReplacement(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            />
                            <p className="text-xs text-charcoal/60 flex items-center gap-1">
                                <Volume2 size={12} />
                                Use acentos fonéticos para guiar a IA (ex: "Leví" ao invés de "Levi")
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            onClick={handleCancel}
                            className="px-6 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={createMutation.isPending || updateMutation.isPending}
                            className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/20 font-medium disabled:opacity-70"
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? (
                                <span className="animate-pulse">Salvando...</span>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Salvar Alterações
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="bg-[#111827] border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="p-12 text-center text-charcoal/60">Carregando correções...</div>
                ) : !corrections || corrections.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Mic className="h-8 w-8 text-charcoal/70" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Nenhuma correção encontrada</h3>
                        <p className="text-slate-500 mt-1">Adicione a primeira correção fonética para o sistema.</p>
                    </div>
                ) : filteredCorrections?.length === 0 ? (
                    <div className="p-12 text-center text-charcoal/60">Nenhum resultado para "{search}"</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        <div className="grid grid-cols-12 px-6 py-4 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <div className="col-span-5">Original</div>
                            <div className="col-span-1 flex items-center justify-center text-charcoal/70">→</div>
                            <div className="col-span-5">Substituição Fonética</div>
                            <div className="col-span-1 text-right">Ações</div>
                        </div>
                        {filteredCorrections?.map((correction) => (
                            <div
                                key={correction.id}
                                className="grid grid-cols-12 px-6 py-5 items-center hover:bg-slate-50/80 transition-colors group"
                            >
                                <div className="col-span-5 font-medium text-slate-900 text-lg">
                                    "{correction.original}"
                                </div>
                                <div className="col-span-1 flex items-center justify-center text-indigo-200 group-hover:text-indigo-400 transition-colors">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                </div>
                                <div className="col-span-5 font-medium text-indigo-600 text-lg">
                                    "{correction.replacement}"
                                </div>
                                <div className="col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleEdit(correction)}
                                        className="p-2 text-charcoal/60 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        title="Editar"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (confirm("Tem certeza que deseja excluir esta correção?")) {
                                                deleteMutation.mutate({ id: correction.id });
                                            }
                                        }}
                                        className="p-2 text-charcoal/60 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Excluir"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
