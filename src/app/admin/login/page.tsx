"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Crown } from "lucide-react";

export default function AdminLogin() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const result = await signIn("credentials", {
                username,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("Usuário ou senha inválidos.");
            } else {
                router.push("/admin");
                router.refresh();
            }
        } catch (err) {
            setError("Erro inesperado ao fazer login.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white text-slate-50 relative overflow-hidden">
            {/* Background Gradient Effect */}
            <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-[100px]" />
            <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[100px]" />

            <div className="z-10 w-full max-w-md p-8">
                <div className="flex flex-col items-center mb-10">
                    <div className="h-16 w-16 rounded-full border-2 border-amber-500/50 flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                        <Crown className="h-8 w-8 text-amber-400" />
                    </div>
                    <h1 className="text-3xl font-sans text-white tracking-wide font-bold">Apollo Song</h1>
                    <p className="text-charcoal/60 text-sm mt-2 font-light">Acesso ao painel administrativo</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 backdrop-blur-sm bg-white/5 p-8 rounded-2xl border border-white/10 shadow-2xl">
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-wider text-amber-500 font-semibold ml-1">Usuário</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-dark/5 border border-dark/10 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-sans text-sm"
                            placeholder="seu-usuario"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-wider text-amber-500 font-semibold ml-1">Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-dark/5 border border-dark/10 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-sans text-sm"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-900/40 border border-red-900/50 text-red-200 text-xs text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-medium py-3 rounded-lg transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Entrando...
                            </>
                        ) : (
                            "Entrar no painel"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
