"use client";

import { useEffect, useMemo, useState } from "react";
import { Headphones, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { type Locale } from "~/i18n/config";
import { cn } from "~/lib/utils";
import { getGenreAudioEntries, getGenreDisplayName } from "~/lib/genre-audio";

const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
    { value: "pt", label: "Português" },
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "it", label: "Italiano" },
];

type VocalType = "male" | "female";

// Structure: { locale: { genre: { male: url, female: url } } }
type FormValues = Record<Locale, Record<string, Record<VocalType, string>>>;

const emptyValues: FormValues = LOCALE_OPTIONS.reduce((acc, locale) => {
    acc[locale.value] = {};
    return acc;
}, {} as FormValues);

export default function AudioSamplesPage() {
    const [activeLocale, setActiveLocale] = useState<Locale>("pt");
    const [formValues, setFormValues] = useState<FormValues>(emptyValues);

    const utils = api.useUtils();
    const { data: samples, isLoading } = api.admin.getGenreAudioSamples.useQuery();

    const saveMutation = api.admin.saveGenreAudioSamples.useMutation({
        onSuccess: (result) => {
            toast.success(`Salvo! ${result.saved} atualizados, ${result.cleared} limpos.`);
            utils.admin.getGenreAudioSamples.invalidate();
        },
        onError: (e) => toast.error(`Erro: ${e.message}`),
    });

    useEffect(() => {
        if (!samples) return;

        const nextValues: FormValues = LOCALE_OPTIONS.reduce((acc, locale) => {
            acc[locale.value] = {};
            return acc;
        }, {} as FormValues);

        for (const sample of samples) {
            const localeKey = sample.locale as Locale;
            if (!nextValues[localeKey]) continue;
            if (!nextValues[localeKey][sample.genre]) {
                nextValues[localeKey][sample.genre] = { male: "", female: "" };
            }
            const vocals = sample.vocals as VocalType;
            const genreEntry = nextValues[localeKey][sample.genre];
            if (genreEntry) {
                genreEntry[vocals] = sample.audioUrl;
            }
        }

        setFormValues(nextValues);
    }, [samples]);

    const entries = useMemo(() => getGenreAudioEntries(activeLocale), [activeLocale]);
    // Count as filled if at least one vocal type has audio
    const filledCount = useMemo(() => {
        return entries.filter((entry) => {
            const genreData = formValues[activeLocale]?.[entry.id];
            return (genreData?.male ?? "").trim().length > 0 || (genreData?.female ?? "").trim().length > 0;
        }).length;
    }, [entries, formValues, activeLocale]);

    const handleChange = (genre: string, vocals: VocalType, value: string) => {
        setFormValues((prev) => ({
            ...prev,
            [activeLocale]: {
                ...prev[activeLocale],
                [genre]: {
                    ...prev[activeLocale]?.[genre],
                    [vocals]: value,
                },
            },
        }));
    };

    const handleSave = async () => {
        const maleSamples = entries.map((entry) => ({
            genre: entry.id as Parameters<typeof saveMutation.mutate>[0]["samples"][number]["genre"],
            audioUrl: formValues[activeLocale]?.[entry.id]?.male ?? "",
        }));

        const femaleSamples = entries.map((entry) => ({
            genre: entry.id as Parameters<typeof saveMutation.mutate>[0]["samples"][number]["genre"],
            audioUrl: formValues[activeLocale]?.[entry.id]?.female ?? "",
        }));

        // Save both male and female samples
        await Promise.all([
            saveMutation.mutateAsync({ locale: activeLocale, vocals: "male", samples: maleSamples }),
            saveMutation.mutateAsync({ locale: activeLocale, vocals: "female", samples: femaleSamples }),
        ]);
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Headphones className="text-emerald-600 h-8 w-8" />
                        Amostras de áudio por gênero
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-light">
                        Cadastre os links de áudio que aparecem na nova sessão da Home. Preencha todos os gêneros e subgêneros do idioma.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => utils.admin.getGenreAudioSamples.invalidate()}
                        className="flex items-center gap-2 px-5 py-3 bg-[#111827] border border-slate-200 text-slate-700 rounded-full hover:bg-slate-50 transition-all shadow-sm hover:shadow font-medium"
                        title="Recarregar dados"
                    >
                        <RefreshCw size={18} />
                        Recarregar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveMutation.isPending || isLoading}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-white rounded-full hover:bg-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        <Save size={18} />
                        {saveMutation.isPending ? "Salvando..." : "Salvar alterações"}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {LOCALE_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setActiveLocale(option.value)}
                        className={cn(
                            "px-4 py-2.5 rounded-full text-sm font-semibold transition-all",
                            activeLocale === option.value
                                ? "bg-emerald-600 text-white shadow-md"
                                : "bg-porcelain text-slate-600 border border-slate-200 hover:bg-slate-50"
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
                <span>
                    {filledCount}/{entries.length} preenchidos
                </span>
                <span>
                    Idioma ativo: <strong className="text-slate-700">{LOCALE_OPTIONS.find((l) => l.value === activeLocale)?.label}</strong>
                </span>
            </div>

            {isLoading ? (
                <div className="p-12 text-center text-charcoal/60">Carregando amostras...</div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {entries.map((entry) => {
                        const genreData = formValues[activeLocale]?.[entry.id] ?? { male: "", female: "" };
                        const maleValue = genreData.male ?? "";
                        const femaleValue = genreData.female ?? "";
                        const hasAnyAudio = maleValue.trim().length > 0 || femaleValue.trim().length > 0;
                        const displayName = getGenreDisplayName(entry.id, activeLocale);
                        const parentLabel = entry.parent ? getGenreDisplayName(entry.parent, activeLocale) : null;

                        return (
                            <div
                                key={entry.id}
                                className={cn(
                                    "rounded-2xl border p-5 bg-[#111827]",
                                    hasAnyAudio ? "border-slate-200" : "border-amber-200 bg-amber-50/60"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-lg font-semibold text-slate-900">{displayName}</p>
                                        <p className="text-xs text-charcoal/60">{entry.id}</p>
                                        {parentLabel && (
                                            <p className="text-sm text-slate-600 mt-1">
                                                Subgênero de {parentLabel}
                                            </p>
                                        )}
                                    </div>
                                    {!hasAnyAudio && (
                                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                                            Sem áudio
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 space-y-3">
                                    {/* Male vocal input */}
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-blue-600 flex items-center gap-1.5">
                                            <span className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">♂</span>
                                            Masculino
                                        </label>
                                        <input
                                            type="url"
                                            inputMode="url"
                                            placeholder="https://exemplo.com/audio-male.mp3"
                                            value={maleValue}
                                            onChange={(event) => handleChange(entry.id, "male", event.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                        />
                                        {maleValue.trim().length > 0 && (
                                            <a
                                                href={maleValue}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                                            >
                                                Abrir áudio
                                            </a>
                                        )}
                                    </div>

                                    {/* Female vocal input */}
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-pink-600 flex items-center gap-1.5">
                                            <span className="w-4 h-4 rounded-full bg-pink-100 flex items-center justify-center text-[10px]">♀</span>
                                            Feminino
                                        </label>
                                        <input
                                            type="url"
                                            inputMode="url"
                                            placeholder="https://exemplo.com/audio-female.mp3"
                                            value={femaleValue}
                                            onChange={(event) => handleChange(entry.id, "female", event.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm"
                                        />
                                        {femaleValue.trim().length > 0 && (
                                            <a
                                                href={femaleValue}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-600 hover:text-pink-700"
                                            >
                                                Abrir áudio
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
