"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, Edit2, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { type LyricsChange, computeLineDiff, computeWordDiff } from "~/lib/lyrics-corrector";
import { toast } from "sonner";

interface LyricsDiffViewerProps {
    originalLyrics: string;
    correctedLyrics: string;
    changes: LyricsChange[];
    onAccept: (lyrics: string) => void;
    onReject: () => void;
    isAccepting?: boolean;
}

const CHANGE_TYPE_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
    phonetic: { label: "Fonética", color: "bg-purple-100 text-purple-800 border-purple-200", emoji: "🗣️" },
    factual: { label: "Fato", color: "bg-blue-100 text-blue-800 border-blue-200", emoji: "📋" },
    spelling: { label: "Ortografia", color: "bg-yellow-100 text-yellow-800 border-yellow-200", emoji: "✏️" },
    style: { label: "Estilo", color: "bg-pink-100 text-pink-800 border-pink-200", emoji: "🎨" },
    other: { label: "Outro", color: "bg-[#111827]/60 text-[#F0EDE6] border-[#C9A84C]/15", emoji: "📝" },
};

function applyApprovedChangesToLyrics(
    correctedLyrics: string,
    changes: LyricsChange[],
    approvedChanges: boolean[]
): string {
    if (changes.length === 0) return correctedLyrics;

    let nextLyrics = correctedLyrics;
    for (const [idx, change] of changes.entries()) {
        if (approvedChanges[idx]) continue;
        if (!change.corrected || change.corrected === change.original) continue;
        nextLyrics = nextLyrics.split(change.corrected).join(change.original);
    }
    return nextLyrics;
}

function HighlightedLine({
    original,
    corrected,
    isChanged,
    side,
}: {
    original: string;
    corrected: string;
    isChanged: boolean;
    side: "left" | "right";
}) {
    if (!isChanged) {
        return <span className="text-slate-700">{side === "left" ? original : corrected}</span>;
    }

    const { originalWords, correctedWords } = computeWordDiff(original, corrected);
    const words = side === "left" ? originalWords : correctedWords;

    // Check how many words actually changed — if most/all changed, the line was
    // completely rewritten. In that case, just show the text with a subtle
    // underline instead of painting every single word green/red.
    const totalWords = words.filter((w) => !/^\s*$/.test(w.text)).length;
    const changedWords = words.filter((w) => !/^\s*$/.test(w.text) && (w.isRemoved || w.isAdded)).length;
    const isFullRewrite = totalWords > 0 && changedWords / totalWords > 0.7;

    if (isFullRewrite) {
        const text = side === "left" ? original : corrected;
        return (
            <span className={side === "left"
                ? "text-red-700 decoration-red-300 underline decoration-wavy decoration-1 underline-offset-2"
                : "text-green-700 decoration-green-300 underline decoration-wavy decoration-1 underline-offset-2"
            }>
                {text}
            </span>
        );
    }

    return (
        <>
            {words.map((word, idx) => {
                if (/^\s+$/.test(word.text)) {
                    return <span key={idx}>{word.text}</span>;
                }
                if (side === "left" && word.isRemoved) {
                    return (
                        <span key={idx} className="bg-red-200 text-red-800 px-0.5 rounded line-through">
                            {word.text}
                        </span>
                    );
                }
                if (side === "right" && word.isAdded) {
                    return (
                        <span key={idx} className="bg-green-200 text-green-800 px-0.5 rounded font-semibold">
                            {word.text}
                        </span>
                    );
                }
                return <span key={idx}>{word.text}</span>;
            })}
        </>
    );
}

export function LyricsDiffViewer({
    originalLyrics,
    correctedLyrics,
    changes,
    onAccept,
    onReject,
    isAccepting = false,
}: LyricsDiffViewerProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedLyrics, setEditedLyrics] = useState(correctedLyrics);
    const [confirmedEditedLyrics, setConfirmedEditedLyrics] = useState<string | null>(null);
    const [showChanges, setShowChanges] = useState(true);
    const [approvedChanges, setApprovedChanges] = useState<boolean[]>(() => changes.map(() => true));

    useEffect(() => {
        setApprovedChanges(changes.map(() => true));
        setEditedLyrics(correctedLyrics);
        setConfirmedEditedLyrics(null);
        setIsEditing(false);
    }, [changes, correctedLyrics]);

    const approvedCount = approvedChanges.filter(Boolean).length;
    const previewLyrics = useMemo(
        () => applyApprovedChangesToLyrics(correctedLyrics, changes, approvedChanges),
        [correctedLyrics, changes, approvedChanges]
    );
    const activeLyrics = isEditing ? editedLyrics : (confirmedEditedLyrics ?? previewLyrics);

    const lineDiffs = computeLineDiff(originalLyrics, activeLyrics);
    const changedLinesCount = lineDiffs.filter((d) => d.isChanged).length;

    const handleCopyLyrics = () => {
        navigator.clipboard.writeText(activeLyrics);
        toast.success("Letra corrigida copiada!");
    };

    const handleAccept = () => {
        onAccept(activeLyrics);
    };

    const handleToggleChange = (index: number, approved: boolean) => {
        setApprovedChanges((prev) => {
            const next = [...prev];
            next[index] = approved;
            return next;
        });
        setConfirmedEditedLyrics(null);
    };

    return (
        <div className="space-y-4">
            {/* Header with summary */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">
                        Comparação de Letras
                    </span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {changedLinesCount} linha{changedLinesCount !== 1 ? "s" : ""} alterada{changedLinesCount !== 1 ? "s" : ""}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyLyrics}
                        className="h-7 text-xs"
                    >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copiar Corrigida
                    </Button>
                    {!isEditing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setEditedLyrics(confirmedEditedLyrics ?? previewLyrics);
                                setIsEditing(true);
                            }}
                            className="h-7 text-xs"
                        >
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Editar
                        </Button>
                    )}
                </div>
            </div>

            {/* Side-by-side comparison or edit mode */}
            {isEditing ? (
                <div className="space-y-2">
                    <Textarea
                        value={editedLyrics}
                        onChange={(e) => setEditedLyrics(e.target.value)}
                        rows={20}
                        className="font-mono text-sm"
                        placeholder="Edite a letra corrigida..."
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setEditedLyrics(confirmedEditedLyrics ?? previewLyrics);
                                setIsEditing(false);
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                setConfirmedEditedLyrics(editedLyrics);
                                setIsEditing(false);
                            }}
                        >
                            Confirmar Edição
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto border rounded-lg">
                    {/* Original column */}
                    <div className="border-r">
                        <div className="sticky top-0 bg-red-50 px-3 py-2 border-b border-red-100">
                            <span className="text-sm font-medium text-red-700">
                                Letra Original
                            </span>
                        </div>
                        <div className="p-3 space-y-0.5 text-sm font-mono">
                            {lineDiffs.map((diff, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "py-0.5 px-1 rounded-sm min-h-[1.5rem]",
                                        diff.isChanged && "bg-red-50"
                                    )}
                                >
                                    <HighlightedLine
                                        original={diff.original}
                                        corrected={diff.corrected}
                                        isChanged={diff.isChanged}
                                        side="left"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Corrected column */}
                    <div>
                        <div className="sticky top-0 bg-green-50 px-3 py-2 border-b border-green-100">
                            <span className="text-sm font-medium text-green-700">
                                Letra Corrigida
                            </span>
                        </div>
                        <div className="p-3 space-y-0.5 text-sm font-mono">
                            {lineDiffs.map((diff, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "py-0.5 px-1 rounded-sm min-h-[1.5rem]",
                                        diff.isChanged && "bg-green-50"
                                    )}
                                >
                                    <HighlightedLine
                                        original={diff.original}
                                        corrected={diff.corrected}
                                        isChanged={diff.isChanged}
                                        side="right"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Changes list */}
            {changes.length > 0 && (
                <div className="border rounded-lg">
                    <button
                        onClick={() => setShowChanges(!showChanges)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                        <span className="text-sm font-medium text-slate-700">
                            Lista de Mudanças ({changes.length})
                        </span>
                        <span className="text-xs text-slate-500">
                            {approvedCount} aprovada{approvedCount !== 1 ? "s" : ""} • {changes.length - approvedCount} removida{changes.length - approvedCount !== 1 ? "s" : ""}
                        </span>
                        {showChanges ? (
                            <ChevronUp className="h-4 w-4 text-slate-500" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                        )}
                    </button>
                    {showChanges && (
                        <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                            {changes.map((change, idx) => {
                                const config = CHANGE_TYPE_CONFIG[change.type] ?? CHANGE_TYPE_CONFIG.other!;
                                const isApproved = approvedChanges[idx] ?? true;
                                const isLongChange = change.original.length > 60 || change.corrected.length > 60;
                                return (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "rounded-lg border",
                                            isApproved
                                                ? "border-green-200"
                                                : "border-slate-200 opacity-80"
                                        )}
                                    >
                                        {/* Header: type badge + action buttons */}
                                        <div className={cn(
                                            "flex items-center justify-between px-3 py-1.5 rounded-t-lg",
                                            isApproved ? "bg-green-50" : "bg-slate-50"
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "shrink-0 text-xs px-2 py-0.5 rounded border",
                                                    config.color
                                                )}>
                                                    {config.emoji} {config.label}
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {change.reason}
                                                </span>
                                            </div>
                                            <div className="shrink-0 flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant={isApproved ? "default" : "outline"}
                                                    disabled={isEditing || isAccepting}
                                                    onClick={() => handleToggleChange(idx, true)}
                                                    className={cn(
                                                        "h-6 px-2 text-xs",
                                                        isApproved && "bg-green-600 hover:bg-green-700 text-white"
                                                    )}
                                                    title={isEditing ? "Saia do modo edição para alterar sugestões" : "Aprovar sugestão"}
                                                >
                                                    <Check className="h-3 w-3 mr-0.5" />
                                                    Aprovar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant={!isApproved ? "destructive" : "outline"}
                                                    disabled={isEditing || isAccepting}
                                                    onClick={() => handleToggleChange(idx, false)}
                                                    className="h-6 px-2 text-xs"
                                                    title={isEditing ? "Saia do modo edição para alterar sugestões" : "Remover sugestão"}
                                                >
                                                    <X className="h-3 w-3 mr-0.5" />
                                                    Remover
                                                </Button>
                                            </div>
                                        </div>
                                        {/* Content: original → corrected */}
                                        <div className={cn(
                                            "px-3 py-2 text-sm",
                                            isLongChange ? "space-y-1.5" : ""
                                        )}>
                                            {isLongChange ? (
                                                <>
                                                    <div className="bg-red-50 text-red-800 px-2 py-1.5 rounded border border-red-100 text-xs leading-relaxed line-through decoration-1 whitespace-pre-wrap">
                                                        {change.original}
                                                    </div>
                                                    <div className="text-center text-slate-400 text-xs">↓</div>
                                                    <div className="bg-green-50 text-green-800 px-2 py-1.5 rounded border border-green-100 text-xs leading-relaxed font-medium whitespace-pre-wrap">
                                                        {change.corrected}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded line-through text-xs">
                                                        {change.original}
                                                    </span>
                                                    <span className="text-slate-400">→</span>
                                                    <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium text-xs">
                                                        {change.corrected}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                    variant="outline"
                    onClick={onReject}
                    disabled={isAccepting}
                    className="text-slate-600 border-slate-300"
                >
                    <X className="h-4 w-4 mr-1" />
                    Rejeitar
                </Button>
                <Button
                    onClick={handleAccept}
                    disabled={isAccepting}
                    className="bg-green-600 hover:bg-green-700 text-white"
                >
                    {isAccepting ? (
                        <>
                            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                            Salvando...
                        </>
                    ) : (
                        <>
                            <Check className="h-4 w-4 mr-1" />
                            Aceitar Correções
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
