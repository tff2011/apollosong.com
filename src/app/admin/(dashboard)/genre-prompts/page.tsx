"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Plus, Trash2, Edit2, Save, X, Search, Music, Copy, Check, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const LOCALES = [
    { value: "all", label: "Universal" },
    { value: "pt", label: "Portugues" },
    { value: "en", label: "English" },
    { value: "es", label: "Espanol" },
    { value: "fr", label: "Francais" },
    { value: "it", label: "Italiano" },
];

export default function GenrePromptsPage() {
    const [search, setSearch] = useState("");
    const [filterLocale, setFilterLocale] = useState<string>("ALL");
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form states
    const [genre, setGenre] = useState("");
    const [locale, setLocale] = useState("all");
    const [displayName, setDisplayName] = useState("");
    const [prompt, setPrompt] = useState("");
    const [isActive, setIsActive] = useState(true);

    const utils = api.useUtils();

    const { data: prompts, isLoading } = api.admin.getGenrePrompts.useQuery();

    const createMutation = api.admin.createGenrePrompt.useMutation({
        onSuccess: () => {
            toast.success("Prompt de genero adicionado!");
            resetForm();
            utils.admin.getGenrePrompts.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const updateMutation = api.admin.updateGenrePrompt.useMutation({
        onSuccess: () => {
            toast.success("Prompt atualizado!");
            resetForm();
            utils.admin.getGenrePrompts.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const deleteMutation = api.admin.deleteGenrePrompt.useMutation({
        onSuccess: () => {
            toast.success("Prompt removido!");
            utils.admin.getGenrePrompts.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    const syncMutation = api.admin.syncGenrePromptsFromCode.useMutation({
        onSuccess: (result) => {
            if (result.created === 0 && result.updated === 0) {
                toast.info("Nenhuma alteracao encontrada. Banco ja esta sincronizado.");
            } else {
                toast.success(`Sync completo! ${result.created} criados, ${result.updated} atualizados.`);
            }
            utils.admin.getGenrePrompts.invalidate();
        },
        onError: (e) => toast.error(`Erro no sync: ${e.message}`),
    });

    const filteredPrompts = prompts?.filter(p => {
        const matchesSearch =
            p.genre.toLowerCase().includes(search.toLowerCase()) ||
            p.displayName.toLowerCase().includes(search.toLowerCase()) ||
            p.prompt.toLowerCase().includes(search.toLowerCase());
        const matchesLocale = filterLocale === "ALL" || p.locale === filterLocale;
        return matchesSearch && matchesLocale;
    });

    const resetForm = () => {
        setIsCreating(false);
        setEditingId(null);
        setGenre("");
        setLocale("all");
        setDisplayName("");
        setPrompt("");
        setIsActive(true);
    };

    const handleEdit = (p: {
        id: string;
        genre: string;
        locale: string;
        displayName: string;
        prompt: string;
        isActive: boolean;
    }) => {
        setEditingId(p.id);
        setGenre(p.genre);
        setLocale(p.locale);
        setDisplayName(p.displayName);
        setPrompt(p.prompt);
        setIsActive(p.isActive);
        setIsCreating(false);
    };

    const handleCopyPrompt = async (prompt: string) => {
        await navigator.clipboard.writeText(prompt);
        toast.success("Prompt copiado!");
    };

    const handleSave = () => {
        if (!genre.trim() || !locale.trim() || !displayName.trim() || !prompt.trim()) {
            toast.error("Preencha todos os campos");
            return;
        }

        if (editingId) {
            updateMutation.mutate({ id: editingId, genre, locale, displayName, prompt, isActive });
        } else {
            createMutation.mutate({ genre, locale, displayName, prompt, isActive });
        }
    };

    const truncatePrompt = (text: string, maxLength = 60) => {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + "...";
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Music className="text-purple-600 h-8 w-8" />
                        Prompts do Suno AI
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Prompts de estilo musical usados na <strong>automacao do Suno</strong> para gerar as musicas. Nao afeta os generos exibidos no quiz do cliente.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                        className="flex items-center gap-2 px-5 py-3 bg-[#111827] border border-slate-200 text-slate-700 rounded-full hover:bg-slate-50 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        title="Sincronizar generos do codigo com o banco de dados"
                    >
                        <RefreshCw size={18} className={syncMutation.isPending ? "animate-spin" : ""} />
                        {syncMutation.isPending ? "Sincronizando..." : "Sync do Codigo"}
                    </button>
                    <button
                        onClick={() => { setIsCreating(true); setEditingId(null); resetForm(); setIsCreating(true); }}
                        disabled={isCreating || !!editingId}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-white rounded-full hover:bg-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        <Plus size={18} />
                        Novo Prompt
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative group flex-1">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-charcoal/60 group-focus-within:text-purple-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar por genero, nome ou prompt..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="block w-full pl-11 pr-4 py-4 bg-[#111827] border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm"
                    />
                </div>
                <select
                    value={filterLocale}
                    onChange={(e) => setFilterLocale(e.target.value)}
                    className="w-full md:w-auto px-4 py-4 bg-[#111827] border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm md:min-w-[160px]"
                >
                    <option value="ALL">Todos Idiomas</option>
                    {LOCALES.map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                </select>
            </div>

            {/* Editor Card (Create/Edit) */}
            {(isCreating || editingId) && (
                <div className="bg-[#111827] rounded-2xl p-8 border border-purple-100 shadow-xl shadow-purple-500/5 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            {editingId ? <Edit2 size={18} className="text-purple-500" /> : <Plus size={18} className="text-green-500" />}
                            {editingId ? "Editar Prompt de Genero" : "Adicionar Novo Prompt"}
                        </h3>
                        <button onClick={resetForm} className="text-charcoal/60 hover:text-slate-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Genre Slug</label>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Ex: sertanejo-universitario"
                                value={genre}
                                onChange={(e) => setGenre(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Locale</label>
                            <select
                                value={locale}
                                onChange={(e) => setLocale(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            >
                                {LOCALES.map(l => (
                                    <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Display Name</label>
                            <input
                                type="text"
                                placeholder="Ex: Sertanejo Universitario"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 mb-6">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Prompt para Suno</label>
                        <textarea
                            placeholder="Ex: Brazilian Sertanejo Universitario modern radio style, emotional and energetic..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                        />
                        <p className="text-xs text-charcoal/60">
                            Descreva o estilo musical em ingles. Nao inclua idioma ou tipo de vocal - isso e adicionado automaticamente.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 mb-8">
                        <button
                            type="button"
                            onClick={() => setIsActive(!isActive)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${isActive ? "bg-purple-600" : "bg-slate-200"}`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#111827] shadow ring-0 transition duration-200 ease-in-out ${isActive ? "translate-x-5" : "translate-x-0"}`}
                            />
                        </button>
                        <span className="text-sm text-slate-600 flex items-center gap-2">
                            {isActive ? <Check size={16} className="text-green-500" /> : <XCircle size={16} className="text-charcoal/60" />}
                            {isActive ? "Ativo" : "Inativo"}
                        </span>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={resetForm}
                            className="px-6 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={createMutation.isPending || updateMutation.isPending}
                            className="flex items-center gap-2 px-8 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all shadow-lg hover:shadow-purple-500/20 font-medium disabled:opacity-70"
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? (
                                <span className="animate-pulse">Salvando...</span>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Salvar
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Stats */}
            {prompts && (
                <div className="flex gap-4 text-sm text-slate-500">
                    <span>{prompts.length} prompts cadastrados</span>
                    <span className="text-charcoal/70">|</span>
                    <span>{prompts.filter(p => p.isActive).length} ativos</span>
                    <span className="text-charcoal/70">|</span>
                    <span>{filteredPrompts?.length} exibidos</span>
                </div>
            )}

            {/* List */}
            <div className="bg-[#111827] border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="p-12 text-center text-charcoal/60">Carregando prompts...</div>
                ) : !prompts || prompts.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Music className="h-8 w-8 text-charcoal/70" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Nenhum prompt encontrado</h3>
                        <p className="text-slate-500 mt-1">Execute o script de seed para importar os prompts existentes.</p>
                    </div>
                ) : filteredPrompts?.length === 0 ? (
                    <div className="p-12 text-center text-charcoal/60">Nenhum resultado para os filtros aplicados</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <th className="px-6 py-4 text-left">Genero</th>
                                    <th className="px-4 py-4 text-left">Locale</th>
                                    <th className="px-4 py-4 text-left">Display Name</th>
                                    <th className="px-4 py-4 text-left">Prompt</th>
                                    <th className="px-4 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-right">Acoes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredPrompts?.map((p) => (
                                    <tr
                                        key={p.id}
                                        className={`hover:bg-slate-50/80 transition-colors group ${!p.isActive ? "opacity-50" : ""}`}
                                    >
                                        <td className="px-6 py-4">
                                            <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-purple-700">
                                                {p.genre}
                                            </code>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                p.locale === "all" ? "bg-slate-100 text-slate-700" :
                                                p.locale === "pt" ? "bg-green-100 text-green-700" :
                                                p.locale === "en" ? "bg-blue-100 text-blue-700" :
                                                p.locale === "es" ? "bg-yellow-100 text-yellow-700" :
                                                p.locale === "fr" ? "bg-indigo-100 text-indigo-700" :
                                                "bg-red-100 text-red-700"
                                            }`}>
                                                {p.locale.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 font-medium text-slate-900">
                                            {p.displayName}
                                        </td>
                                        <td className="px-4 py-4 text-slate-500 text-sm max-w-md">
                                            <span title={p.prompt}>{truncatePrompt(p.prompt)}</span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {p.isActive ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                    Ativo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                                                    Inativo
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => handleEdit(p)}
                                                    className="p-2 text-charcoal/60 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleCopyPrompt(p.prompt)}
                                                    className="p-2 text-charcoal/60 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Copiar prompt"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Tem certeza que deseja excluir o prompt "${p.displayName}"?`)) {
                                                            deleteMutation.mutate({ id: p.id });
                                                        }
                                                    }}
                                                    className="p-2 text-charcoal/60 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
