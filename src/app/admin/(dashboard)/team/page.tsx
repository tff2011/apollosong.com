"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Shield, Users, RefreshCw, KeyRound, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
    ADMIN_PERMISSIONS,
    ADMIN_PERMISSION_METADATA,
    type AdminPermission,
} from "~/lib/admin/permissions";
import { api } from "~/trpc/react";

export default function TeamPage() {
    const utils = api.useUtils();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [pixKey, setPixKey] = useState("");
    const [permissions, setPermissions] = useState<AdminPermission[]>(["LEADS"]);

    const [permissionDrafts, setPermissionDrafts] = useState<Record<string, AdminPermission[]>>({});
    const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
    const [pixKeyDrafts, setPixKeyDrafts] = useState<Record<string, string>>({});

    const { data: users, isLoading, error, refetch, isFetching } = api.admin.getAdminUsers.useQuery(undefined, {
        retry: false,
    });

    useEffect(() => {
        if (!users) return;

        const nextDrafts: Record<string, AdminPermission[]> = {};
        const nextPixDrafts: Record<string, string> = {};
        for (const user of users) {
            nextDrafts[user.id] = user.adminPermissions as AdminPermission[];
            nextPixDrafts[user.id] = user.pixKey ?? "";
        }
        setPermissionDrafts(nextDrafts);
        setPixKeyDrafts(nextPixDrafts);
    }, [users]);

    const createUser = api.admin.createAdminUser.useMutation({
        onSuccess: async () => {
            toast.success("Funcionário criado com sucesso.");
            setName("");
            setEmail("");
            setUsername("");
            setPassword("");
            setPixKey("");
            setPermissions(["LEADS"]);
            await utils.admin.getAdminUsers.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const updatePermissions = api.admin.updateAdminUserPermissions.useMutation({
        onSuccess: async () => {
            toast.success("Permissões atualizadas.");
            await utils.admin.getAdminUsers.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const updatePixKey = api.admin.updateAdminUserPixKey.useMutation({
        onSuccess: async () => {
            toast.success("Chave PIX atualizada.");
            await utils.admin.getAdminUsers.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const toggleEnabled = api.admin.toggleAdminUserEnabled.useMutation({
        onSuccess: async (_data, variables) => {
            toast.success(variables.enabled ? "Usuário ativado." : "Usuário desativado.");
            await utils.admin.getAdminUsers.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const resetPassword = api.admin.resetAdminUserPassword.useMutation({
        onSuccess: async (_data, variables) => {
            toast.success("Senha redefinida com sucesso.");
            setPasswordDrafts((current) => ({ ...current, [variables.userId]: "" }));
            await utils.admin.getAdminUsers.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const deleteUser = api.admin.deleteAdminUser.useMutation({
        onSuccess: async (_data, variables) => {
            toast.success("Usuário excluído com sucesso.");
            setPermissionDrafts((current) => {
                const next = { ...current };
                delete next[variables.userId];
                return next;
            });
            setPasswordDrafts((current) => {
                const next = { ...current };
                delete next[variables.userId];
                return next;
            });
            setPixKeyDrafts((current) => {
                const next = { ...current };
                delete next[variables.userId];
                return next;
            });
            await utils.admin.getAdminUsers.invalidate();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const nonSuperAdmins = useMemo(() => {
        return (users ?? []).filter((user) => user.adminRole !== "SUPER_ADMIN");
    }, [users]);

    const superAdmins = useMemo(() => {
        return (users ?? []).filter((user) => user.adminRole === "SUPER_ADMIN");
    }, [users]);

    const togglePermission = (current: AdminPermission[], permission: AdminPermission): AdminPermission[] => {
        if (current.includes(permission)) {
            return current.filter((value) => value !== permission);
        }
        return [...current, permission];
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Users className="h-6 w-6 text-sky-700" />
                        Gestão de Usuários do Painel
                    </h1>
                    <p className="text-slate-600 mt-1">Crie funcionários, escolha permissões e controle acesso ao admin.</p>
                </div>
            </div>

            {error ? (
                <Card className="border-red-200 bg-red-50/50">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-sm font-semibold text-red-700">Falha ao carregar funcionários</p>
                                <p className="text-sm text-red-600">{error.message}</p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    void refetch();
                                }}
                                disabled={isFetching}
                                className="border-red-200 text-red-700 hover:bg-red-100"
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                                Tentar novamente
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <UserPlus className="h-5 w-5 text-emerald-700" />
                        Novo Funcionário
                    </CardTitle>
                    <CardDescription>
                        O administrador geral define usuário, senha e módulos que o funcionário pode acessar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" />
                        <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail (opcional)" />
                        <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Usuário" />
                        <Input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Senha"
                        />
                        <Input
                            value={pixKey}
                            onChange={(event) => setPixKey(event.target.value)}
                            placeholder="Chave PIX (opcional)"
                        />
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Permissões iniciais</p>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {ADMIN_PERMISSIONS.map((permission) => (
                                <label
                                    key={permission}
                                    className="flex items-start gap-2 rounded-md border border-slate-200 bg-[#111827] p-3"
                                >
                                    <Checkbox
                                        checked={permissions.includes(permission)}
                                        onCheckedChange={() => {
                                            setPermissions((current) => togglePermission(current, permission));
                                        }}
                                    />
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-800">
                                            {ADMIN_PERMISSION_METADATA[permission].label}
                                        </span>
                                        <span className="block text-xs text-slate-500">
                                            {ADMIN_PERMISSION_METADATA[permission].description}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <Button
                        className="bg-emerald-700 hover:bg-emerald-600 text-white"
                        onClick={() => {
                            if (!name.trim() || !username.trim() || !password.trim()) {
                                toast.error("Preencha nome, usuário e senha.");
                                return;
                            }

                            createUser.mutate({
                                name: name.trim(),
                                email: email.trim() ? email.trim() : undefined,
                                username: username.trim(),
                                password,
                                permissions,
                                pixKey: pixKey.trim() ? pixKey.trim() : undefined,
                            });
                        }}
                        disabled={createUser.isPending}
                    >
                        {createUser.isPending ? "Criando..." : "Criar funcionário"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Shield className="h-5 w-5 text-amber-700" />
                        Administrador Geral
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {superAdmins.map((user) => (
                        <div key={user.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <p className="font-semibold text-amber-900">{user.name ?? "Administrador"}</p>
                            <p className="text-sm text-amber-800">@{user.adminUsername ?? "admin"}</p>
                            <p className="text-sm text-amber-700">{user.email ?? "Sem e-mail"}</p>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-slate-900">Funcionários</CardTitle>
                    <CardDescription>Atualize permissões, ative/desative usuário e redefina senhas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {isLoading ? <p className="text-sm text-slate-500">Carregando usuários...</p> : null}

                    {!isLoading && !error && nonSuperAdmins.length === 0 ? (
                        <p className="text-sm text-slate-500">Nenhum funcionário cadastrado ainda.</p>
                    ) : null}

                    {nonSuperAdmins.map((user) => {
                        const draftPermissions = permissionDrafts[user.id] ?? (user.adminPermissions as AdminPermission[]);
                        const currentPermissions = user.adminPermissions as AdminPermission[];
                        const currentPixKey = user.pixKey ?? "";
                        const draftPixKey = pixKeyDrafts[user.id] ?? currentPixKey;
                        const hasPermissionChanges =
                            draftPermissions.length !== currentPermissions.length ||
                            draftPermissions.some((permission) => !currentPermissions.includes(permission));
                        const hasPixKeyChanges = draftPixKey.trim() !== currentPixKey.trim();

                        return (
                            <div key={user.id} className="rounded-xl border border-slate-200 bg-[#111827] p-4 space-y-4">
                                <div className="flex items-start justify-between flex-wrap gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">{user.name ?? user.adminUsername ?? "Funcionário"}</p>
                                        <p className="text-sm text-slate-600">@{user.adminUsername ?? "sem-usuario"}</p>
                                        <p className="text-sm text-slate-500">{user.email ?? "Sem e-mail"}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold px-2 py-1 rounded ${user.adminEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                                            {user.adminEnabled ? "Ativo" : "Inativo"}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                toggleEnabled.mutate({ userId: user.id, enabled: !user.adminEnabled });
                                            }}
                                            disabled={toggleEnabled.isPending}
                                        >
                                            <Power className="h-4 w-4" />
                                            {user.adminEnabled ? "Desativar" : "Ativar"}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                            onClick={() => {
                                                const label = user.adminUsername ? `@${user.adminUsername}` : (user.name ?? "este usuário");
                                                const confirmed = confirm(`Excluir ${label}? Esta ação remove o usuário permanentemente.`);
                                                if (!confirmed) return;
                                                deleteUser.mutate({ userId: user.id });
                                            }}
                                            disabled={deleteUser.isPending}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Excluir
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {ADMIN_PERMISSIONS.map((permission) => (
                                        <label key={`${user.id}-${permission}`} className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                                            <Checkbox
                                                checked={draftPermissions.includes(permission)}
                                                onCheckedChange={() => {
                                                    setPermissionDrafts((current) => ({
                                                        ...current,
                                                        [user.id]: togglePermission(draftPermissions, permission),
                                                    }));
                                                }}
                                            />
                                            <span>
                                                <span className="block text-sm font-semibold text-slate-800">{ADMIN_PERMISSION_METADATA[permission].label}</span>
                                                <span className="block text-xs text-slate-500">{ADMIN_PERMISSION_METADATA[permission].description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            updatePermissions.mutate({
                                                userId: user.id,
                                                permissions: draftPermissions,
                                            });
                                        }}
                                        disabled={!hasPermissionChanges || updatePermissions.isPending}
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Salvar permissões
                                    </Button>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            placeholder="Chave PIX"
                                            value={draftPixKey}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setPixKeyDrafts((current) => ({ ...current, [user.id]: value }));
                                            }}
                                            className="w-64"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                updatePixKey.mutate({
                                                    userId: user.id,
                                                    pixKey: draftPixKey.trim() ? draftPixKey.trim() : undefined,
                                                });
                                            }}
                                            disabled={!hasPixKeyChanges || updatePixKey.isPending}
                                        >
                                            Salvar chave PIX
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="password"
                                            placeholder="Nova senha"
                                            value={passwordDrafts[user.id] ?? ""}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setPasswordDrafts((current) => ({ ...current, [user.id]: value }));
                                            }}
                                            className="w-48"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                const nextPassword = passwordDrafts[user.id]?.trim();
                                                if (!nextPassword || nextPassword.length < 6) {
                                                    toast.error("A nova senha deve ter no mínimo 6 caracteres.");
                                                    return;
                                                }
                                                resetPassword.mutate({
                                                    userId: user.id,
                                                    newPassword: nextPassword,
                                                });
                                            }}
                                            disabled={resetPassword.isPending}
                                        >
                                            <KeyRound className="h-4 w-4" />
                                            Redefinir senha
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
}
