"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Plus, Trash2, Edit2, Save, X, Search, BookOpen } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
    "Pricing",
    "Delivery",
    "Revisions",
    "Genres",
    "Process",
    "Contact",
    "General",
];

const CHANNELS = [
    { value: "BOTH", label: "WhatsApp / E-mail" },
    { value: "EMAIL", label: "E-mail" },
    { value: "WHATSAPP", label: "WhatsApp" },
];

const LOCALES = ["all", "en", "pt", "es", "fr", "it"];

export default function KnowledgePage() {
    const channelLabel = (channel: "BOTH" | "EMAIL" | "WHATSAPP") => {
        if (channel === "BOTH") return "WhatsApp / E-mail";
        if (channel === "EMAIL") return "E-mail";
        return "WhatsApp";
    };

    const [search, setSearch] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form states
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [category, setCategory] = useState("General");
    const [channel, setChannel] = useState<"BOTH" | "EMAIL" | "WHATSAPP">("BOTH");
    const [locale, setLocale] = useState("all");
    const [isActive, setIsActive] = useState(true);

    const utils = api.useUtils();

    const { data: entries, isLoading } = api.admin.getKnowledgeEntries.useQuery();

    const createMutation = api.admin.createKnowledgeEntry.useMutation({
        onSuccess: () => {
            toast.success("Entry created!");
            resetForm();
            utils.admin.getKnowledgeEntries.invalidate();
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const updateMutation = api.admin.updateKnowledgeEntry.useMutation({
        onSuccess: () => {
            toast.success("Entry updated!");
            resetForm();
            utils.admin.getKnowledgeEntries.invalidate();
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const deleteMutation = api.admin.deleteKnowledgeEntry.useMutation({
        onSuccess: () => {
            toast.success("Entry deleted!");
            utils.admin.getKnowledgeEntries.invalidate();
        },
        onError: (e) => toast.error(`Error: ${e.message}`),
    });

    const resetForm = () => {
        setIsCreating(false);
        setEditingId(null);
        setTitle("");
        setContent("");
        setCategory("General");
        setChannel("BOTH");
        setLocale("all");
        setIsActive(true);
    };

    const filteredEntries = entries?.filter((e) =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.content.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase())
    );

    const handleEdit = (entry: NonNullable<typeof entries>[number]) => {
        setEditingId(entry.id);
        setTitle(entry.title);
        setContent(entry.content);
        setCategory(entry.category);
        setChannel(entry.channel);
        setLocale(entry.locale);
        setIsActive(entry.isActive);
        setIsCreating(false);
    };

    const handleSave = () => {
        if (!title.trim() || !content.trim()) {
            toast.error("Title and content are required");
            return;
        }

        if (editingId) {
            updateMutation.mutate({ id: editingId, title, content, category, channel, locale, isActive });
        } else {
            createMutation.mutate({ title, content, category, channel, locale, isActive });
        }
    };

    // Group by category
    const grouped = new Map<string, NonNullable<typeof entries>>();
    if (filteredEntries) {
        for (const entry of filteredEntries) {
            const group = grouped.get(entry.category) || [];
            group.push(entry);
            grouped.set(entry.category, group);
        }
    }

    return (
        <div className="space-y-8 max-w-5xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <BookOpen className="text-indigo-600 h-8 w-8" />
                        Knowledge Base
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Manage support knowledge entries used by AI to generate responses.
                    </p>
                </div>

                <button
                    onClick={() => { setIsCreating(true); setEditingId(null); setTitle(""); setContent(""); setCategory("General"); setChannel("BOTH"); setLocale("all"); setIsActive(true); }}
                    disabled={isCreating || !!editingId}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-white rounded-full hover:bg-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    <Plus size={18} />
                    New Entry
                </button>
            </div>

            {/* Search */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-charcoal/60 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                    type="text"
                    placeholder="Search knowledge entries..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="block w-full pl-11 pr-4 py-4 bg-[#111827] border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                />
            </div>

            {/* Editor Card */}
            {(isCreating || editingId) && (
                <div className="bg-[#111827] rounded-2xl p-8 border border-indigo-100 shadow-xl shadow-indigo-500/5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            {editingId ? <Edit2 size={18} className="text-indigo-500" /> : <Plus size={18} className="text-green-500" />}
                            {editingId ? "Edit Entry" : "New Entry"}
                        </h3>
                        <button onClick={resetForm} className="text-charcoal/60 hover:text-slate-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Title</label>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="e.g. Delivery Times"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Category</label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                >
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Channel</label>
                                <select
                                    value={channel}
                                    onChange={(e) => setChannel(e.target.value as "BOTH" | "EMAIL" | "WHATSAPP")}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                >
                                    {CHANNELS.map((c) => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Locale</label>
                                <select
                                    value={locale}
                                    onChange={(e) => setLocale(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                >
                                    {LOCALES.map((l) => (
                                        <option key={l} value={l}>{l === "all" ? "All Languages" : l.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Content (Markdown)</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={8}
                                placeholder="Write the knowledge content in markdown..."
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y font-mono text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-600">Active (included in AI context)</span>
                            </label>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            onClick={resetForm}
                            className="px-6 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={createMutation.isPending || updateMutation.isPending}
                            className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/20 font-medium disabled:opacity-70"
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? (
                                <span className="animate-pulse">Saving...</span>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Save
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="space-y-6">
                {isLoading ? (
                    <div className="bg-[#111827] border border-slate-200 rounded-3xl p-12 text-center text-charcoal/60">Loading entries...</div>
                ) : !entries || entries.length === 0 ? (
                    <div className="bg-[#111827] border border-slate-200 rounded-3xl p-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="h-8 w-8 text-charcoal/70" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">No entries yet</h3>
                        <p className="text-slate-500 mt-1">Add knowledge base entries to help AI generate better support responses.</p>
                    </div>
                ) : filteredEntries?.length === 0 ? (
                    <div className="bg-[#111827] border border-slate-200 rounded-3xl p-12 text-center text-charcoal/60">No results for &quot;{search}&quot;</div>
                ) : (
                    Array.from(grouped.entries()).map(([cat, items]) => (
                        <div key={cat}>
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-1">{cat}</h2>
                            <div className="bg-[#111827] border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                                {items.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="p-5 hover:bg-slate-50/80 transition-colors group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-medium text-slate-900">{entry.title}</h3>
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase font-medium">
                                                        {entry.locale}
                                                    </span>
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full uppercase font-medium">
                                                        {channelLabel(entry.channel)}
                                                    </span>
                                                    {!entry.isActive && (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-500 rounded-full font-medium">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-500 line-clamp-2">{entry.content}</p>
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                                                <button
                                                    onClick={() => handleEdit(entry)}
                                                    className="p-2 text-charcoal/60 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm("Delete this entry?")) {
                                                            deleteMutation.mutate({ id: entry.id });
                                                        }
                                                    }}
                                                    className="p-2 text-charcoal/60 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
