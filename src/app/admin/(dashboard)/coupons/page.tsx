"use client";

import { useMemo, useState } from "react";
import { Edit2, Percent, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

type CouponFormState = {
    code: string;
    discountPercent: number;
    maxUses: string;
    isActive: boolean;
};

const DEFAULT_FORM: CouponFormState = {
    code: "",
    discountPercent: 10,
    maxUses: "",
    isActive: true,
};

function parseMaxUses(raw: string): number | null {
    const cleaned = raw.trim();
    if (!cleaned) return null;
    const value = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

export default function AdminCouponsPage() {
    const utils = api.useUtils();
    const [search, setSearch] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<CouponFormState>(DEFAULT_FORM);

    const { data: config, isLoading: isConfigLoading } = api.admin.getCheckoutCouponConfig.useQuery();
    const { data: coupons, isLoading: isCouponsLoading } = api.admin.getDiscountCoupons.useQuery();

    const updateConfigMutation = api.admin.updateCheckoutCouponConfig.useMutation({
        onSuccess: async () => {
            toast.success("Configuracao do checkout atualizada.");
            await utils.admin.getCheckoutCouponConfig.invalidate();
        },
        onError: (error) => toast.error(error.message),
    });

    const createCouponMutation = api.admin.createDiscountCoupon.useMutation({
        onSuccess: async () => {
            toast.success("Cupom criado com sucesso.");
            resetForm();
            await utils.admin.getDiscountCoupons.invalidate();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateCouponMutation = api.admin.updateDiscountCoupon.useMutation({
        onSuccess: async () => {
            toast.success("Cupom atualizado.");
            resetForm();
            await utils.admin.getDiscountCoupons.invalidate();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteCouponMutation = api.admin.deleteDiscountCoupon.useMutation({
        onSuccess: async () => {
            toast.success("Cupom removido.");
            await utils.admin.getDiscountCoupons.invalidate();
        },
        onError: (error) => toast.error(error.message),
    });

    const filteredCoupons = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return coupons ?? [];
        return (coupons ?? []).filter((coupon) => coupon.code.toLowerCase().includes(query));
    }, [coupons, search]);

    const resetForm = () => {
        setIsCreating(false);
        setEditingId(null);
        setForm(DEFAULT_FORM);
    };

    const startCreate = () => {
        setEditingId(null);
        setIsCreating(true);
        setForm(DEFAULT_FORM);
    };

    const startEdit = (coupon: {
        id: string;
        code: string;
        discountPercent: number;
        maxUses: number | null;
        isActive: boolean;
    }) => {
        setIsCreating(false);
        setEditingId(coupon.id);
        setForm({
            code: coupon.code,
            discountPercent: coupon.discountPercent,
            maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
            isActive: coupon.isActive,
        });
    };

    const saveCoupon = () => {
        const normalizedCode = form.code.trim().toUpperCase();
        if (!normalizedCode) {
            toast.error("Informe o codigo do cupom.");
            return;
        }
        if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedCode)) {
            toast.error("Codigo invalido. Use apenas letras, numeros, - ou _.");
            return;
        }
        if (form.discountPercent < 1 || form.discountPercent > 100) {
            toast.error("Desconto deve ficar entre 1% e 100%.");
            return;
        }

        const parsedMaxUses = parseMaxUses(form.maxUses);
        if (form.maxUses.trim() && parsedMaxUses === null) {
            toast.error("Limite de usos invalido.");
            return;
        }

        const payload = {
            code: normalizedCode,
            discountPercent: form.discountPercent,
            maxUses: parsedMaxUses,
            isActive: form.isActive,
        };

        if (editingId) {
            updateCouponMutation.mutate({
                id: editingId,
                ...payload,
            });
            return;
        }

        createCouponMutation.mutate(payload);
    };

    const isSaving = createCouponMutation.isPending || updateCouponMutation.isPending;
    const isFieldEnabled = config?.couponFieldEnabled ?? false;

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Percent className="text-orange-600 h-8 w-8" />
                        Cupons de desconto
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Ative o campo de cupom no checkout e gerencie campanhas sazonais.
                    </p>
                </div>

                <button
                    onClick={startCreate}
                    disabled={isCreating || !!editingId}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-white rounded-full hover:bg-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    <Plus size={18} />
                    Novo cupom
                </button>
            </div>

            <div className="bg-[#111827] rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                            Campo de cupom no checkout
                        </p>
                        <p className="text-slate-700 mt-1">
                            {isFieldEnabled
                                ? "Ativo: clientes podem inserir cupom."
                                : "Inativo: campo oculto no checkout."}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            updateConfigMutation.mutate({
                                couponFieldEnabled: !isFieldEnabled,
                            })
                        }
                        disabled={isConfigLoading || updateConfigMutation.isPending}
                        className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            isFieldEnabled ? "bg-emerald-600" : "bg-slate-300"
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                        title="Alternar campo de cupom no checkout"
                    >
                        <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-[#111827] shadow ring-0 transition ${
                                isFieldEnabled ? "translate-x-7" : "translate-x-0"
                            }`}
                        />
                    </button>
                </div>
            </div>

            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-charcoal/60 group-focus-within:text-orange-500 transition-colors" />
                </div>
                <input
                    type="text"
                    placeholder="Buscar cupom por codigo..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="block w-full pl-11 pr-4 py-4 bg-[#111827] border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm"
                />
            </div>

            {(isCreating || editingId) && (
                <div className="bg-[#111827] rounded-2xl p-8 border border-orange-100 shadow-xl shadow-orange-500/5 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            {editingId ? (
                                <>
                                    <Edit2 size={18} className="text-orange-500" />
                                    Editar cupom
                                </>
                            ) : (
                                <>
                                    <Plus size={18} className="text-emerald-500" />
                                    Criar cupom
                                </>
                            )}
                        </h3>
                        <button onClick={resetForm} className="text-charcoal/60 hover:text-slate-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">
                                Codigo
                            </label>
                            <input
                                autoFocus
                                type="text"
                                value={form.code}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        code: event.target.value.toUpperCase(),
                                    }))
                                }
                                placeholder="CARNA10"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">
                                Desconto (%)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={form.discountPercent}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        discountPercent: Number.parseInt(event.target.value || "0", 10),
                                    }))
                                }
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">
                                Max usos (opcional)
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={form.maxUses}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        maxUses: event.target.value,
                                    }))
                                }
                                placeholder="Sem limite"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-6">
                        <button
                            type="button"
                            onClick={() =>
                                setForm((current) => ({
                                    ...current,
                                    isActive: !current.isActive,
                                }))
                            }
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                form.isActive ? "bg-emerald-600" : "bg-slate-300"
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#111827] shadow ring-0 transition ${
                                    form.isActive ? "translate-x-5" : "translate-x-0"
                                }`}
                            />
                        </button>
                        <span className="text-sm text-slate-600">{form.isActive ? "Cupom ativo" : "Cupom inativo"}</span>
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            onClick={resetForm}
                            className="px-6 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={saveCoupon}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-8 py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all shadow-lg hover:shadow-orange-500/20 font-medium disabled:opacity-70"
                        >
                            {isSaving ? (
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

            <div className="bg-[#111827] border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                {isCouponsLoading ? (
                    <div className="p-12 text-center text-charcoal/60">Carregando cupons...</div>
                ) : filteredCoupons.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Percent className="h-8 w-8 text-charcoal/70" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">Nenhum cupom encontrado</h3>
                        <p className="text-slate-500 mt-1">Crie um cupom para comecar uma nova campanha.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <th className="px-6 py-4 text-left">Codigo</th>
                                    <th className="px-4 py-4 text-left">Desconto</th>
                                    <th className="px-4 py-4 text-left">Usos</th>
                                    <th className="px-4 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-right">Acoes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredCoupons.map((coupon) => {
                                    const usagePercent =
                                        coupon.maxUses && coupon.maxUses > 0
                                            ? Math.min(100, Math.round((coupon.usedCount / coupon.maxUses) * 100))
                                            : 0;

                                    return (
                                        <tr key={coupon.id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-orange-700">
                                                    {coupon.code}
                                                </code>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="font-semibold text-slate-900">{coupon.discountPercent}%</span>
                                            </td>
                                            <td className="px-4 py-4 min-w-[220px]">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span className="font-semibold text-emerald-700">{coupon.paidCount} pagos</span>
                                                        {coupon.usedCount > coupon.paidCount && (
                                                            <span className="text-charcoal/60">
                                                                + {coupon.usedCount - coupon.paidCount} pendentes
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500">
                                                        {coupon.maxUses
                                                            ? `${coupon.usedCount}/${coupon.maxUses} total`
                                                            : `${coupon.usedCount} total (sem limite)`}
                                                    </p>
                                                    {coupon.maxUses ? (
                                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                            <div
                                                                className={`h-full ${
                                                                    usagePercent >= 100 ? "bg-rose-500" : "bg-emerald-500"
                                                                }`}
                                                                style={{ width: `${usagePercent}%` }}
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        coupon.isActive
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : "bg-slate-100 text-slate-600"
                                                    }`}
                                                >
                                                    {coupon.isActive ? "Ativo" : "Inativo"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => startEdit(coupon)}
                                                        className="p-2 text-charcoal/60 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                                                        title="Editar"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`Excluir cupom ${coupon.code}?`)) {
                                                                deleteCouponMutation.mutate({ id: coupon.id });
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
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
