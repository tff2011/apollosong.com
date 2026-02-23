"use client";

import { useState, useCallback, useEffect, useRef, useMemo, type ComponentPropsWithoutRef, type RefObject } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { type RouterOutputs } from "~/trpc/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Loader2, Trash2, Save, Edit2, RotateCcw, Music, RefreshCw, AlertCircle, CheckCircle, CheckCircle2, Check, Clock, Package, Copy, Send, Trash, Gift, FileText, ExternalLink, Download, Link, Wand2, ChevronDown, ChevronUp, ImagePlus, X, Lock, LockOpen, User, MessageSquareText, BarChart3, Play, Pause, Search, History, SpellCheck } from "lucide-react";
import { SongUpload } from "~/components/admin/song-upload";
import { LyricsDiffViewer } from "~/components/admin/lyrics-diff-viewer";
import { AudioPlayer, type AudioPlayerHandle } from "~/components/audio-player";
import { type LyricsChange } from "~/lib/lyrics-corrector";
import { normalizeRevisionHistory } from "~/lib/revision-history";
import { GENRE_NAMES, RELATIONSHIP_NAMES } from "~/lib/lyrics-generator";
import { normalizeVocals } from "~/lib/vocals";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { api } from "~/trpc/react";

// Type definition
type Lead = RouterOutputs["admin"]["getLeadsPaginated"]["items"][number];
type LeadChildOrder = NonNullable<Lead["childOrders"]>[number];

interface LeadDetailsProps {
    lead: Lead;
    open: boolean;
    onClose: () => void;
}

function buildLeadFormData(lead: Lead) {
    return {
        status: lead.status,
        recipient: lead.recipient,
        recipientName: lead.recipientName,
        recipientRelationship: lead.recipientRelationship || "",
        email: lead.email,
        backupWhatsApp: lead.backupWhatsApp || "",
        sunoAccountEmail: lead.sunoAccountEmail || "",
        genre: lead.genre,
        vocals: normalizeVocals(lead.vocals),
        qualities: displayQualities(lead.qualities),
        memories: lead.memories,
        message: lead.message || "",
    };
}

// Compress image on client-side before upload (to avoid Vercel 4.5MB limit)
async function compressImage(file: File, maxSize = 2000, quality = 0.85): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        img.onload = () => {
            // Calculate new dimensions maintaining aspect ratio
            let { width, height } = img;
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                } else {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;

            if (!ctx) {
                reject(new Error("Failed to get canvas context"));
                return;
            }

            // Draw image on canvas
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error("Failed to create blob"));
                        return;
                    }
                    // Create new file from blob
                    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                        type: "image/jpeg",
                        lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                },
                "image/jpeg",
                quality
            );
        };

        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = URL.createObjectURL(file);
    });
}

const ADMIN_NAME_ALIAS_KEY_MAP: Record<string, string> = {
    thiago: "thiago felizola",
};

function normalizeAdminName(name: string | null | undefined): string {
    const normalized = (name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
    return ADMIN_NAME_ALIAS_KEY_MAP[normalized] ?? normalized;
}

function resolveAdminIdentityFromSession(admin: {
    name?: string | null;
    username?: string | null;
    email?: string | null;
} | null | undefined): string {
    const rawName = admin?.name?.trim() ?? "";
    const normalizedName = normalizeAdminName(rawName);
    const isGenericStaffPlaceholder = normalizedName === "funcionario";
    if (rawName && !isGenericStaffPlaceholder) {
        return rawName;
    }

    return admin?.username?.trim() || admin?.email?.trim() || rawName;
}

function hasNameDiacritics(name: string): boolean {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") !== name;
}

function pickPreferredDisplayName(currentName: string | null | undefined, candidateName: string): string {
    if (!currentName) return candidateName;
    const currentHasDiacritics = hasNameDiacritics(currentName);
    const candidateHasDiacritics = hasNameDiacritics(candidateName);

    if (candidateHasDiacritics && !currentHasDiacritics) {
        return candidateName;
    }

    if (candidateHasDiacritics === currentHasDiacritics && candidateName.length > currentName.length) {
        return candidateName;
    }

    return currentName;
}

function capitalizeReviewerName(name: string | null | undefined): string | null {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return null;
    const lower = trimmed.toLocaleLowerCase("pt-BR");
    return lower.replace(/(^|[\s.'-])(\p{L})/gu, (_match, prefix: string, letter: string) => {
        return `${prefix}${letter.toLocaleUpperCase("pt-BR")}`;
    });
}

type AdditionalNoteEntry = {
    timestamp: string;
    text: string;
};

function splitAdditionalNotes(notes: string): { baseNotes: string; additions: AdditionalNoteEntry[] } {
    const trimmed = notes?.trim() ?? "";
    if (!trimmed) return { baseNotes: "", additions: [] };

    const parts = trimmed.split(/\n\n--- Adicionado em /);
    const baseNotes = (parts.shift() ?? "").trim();
    const additions = parts.map((part) => {
        const [timestampLine, ...rest] = part.split("\n");
        const timestamp = (timestampLine ?? "").replace(/ ---$/, "").trim();
        const text = rest.join("\n").trim();
        return { timestamp, text };
    }).filter((note) => note.text.length > 0);

    return { baseNotes, additions };
}

const normalizePlanType = (value: string | null | undefined): string =>
    String(value || "").trim().toLowerCase();

function getLeadDeliveryPlanBadge(
    lead: Pick<Lead, "orderType" | "hasFastDelivery" | "planType" | "parentOrder">
): { label: string; className: string } | null {
    if (lead.orderType === "STREAMING_UPSELL") return null;

    const parentOrder = lead.parentOrder as { planType?: string | null; hasFastDelivery?: boolean } | null | undefined;
    const planType = normalizePlanType(lead.planType);
    const parentPlanType = normalizePlanType(parentOrder?.planType);
    const isTurbo = planType === "acelerado" || parentPlanType === "acelerado";
    const isExpress = !isTurbo && Boolean(
        lead.hasFastDelivery ||
        planType === "express" ||
        parentOrder?.hasFastDelivery ||
        parentPlanType === "express"
    );

    if (isTurbo) {
        return {
            label: "6h",
            className: "bg-violet-100 text-violet-800 border-violet-200",
        };
    }
    if (isExpress) {
        return {
            label: "24h",
            className: "bg-orange-100 text-orange-800 border-orange-200",
        };
    }
    return {
        label: "7 dias",
        className: "bg-slate-100 text-slate-700 border-slate-200",
    };
}

/**
 * Normalize qualities string for display.
 * Handles legacy JSON-array format (e.g. '["text"]' or '[]') and plain strings.
 */
function displayQualities(raw: string | null | undefined): string {
    if (!raw) return "";
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                const joined = parsed.join(", ");
                return joined || "";
            }
        } catch {
            // Not valid JSON, return as-is
        }
    }
    return trimmed;
}

function formatAudioDurationLabel(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "X:XX";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function getAudioDurationLabel(url: string): Promise<string | null> {
    return await new Promise((resolve) => {
        const audio = document.createElement("audio");
        let finished = false;
        let timeoutId: number | null = null;

        const cleanup = () => {
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("durationchange", handleLoadedMetadata);
            audio.removeEventListener("error", handleError);
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            audio.src = "";
        };

        const finish = (value: string | null) => {
            if (finished) return;
            finished = true;
            cleanup();
            resolve(value);
        };

        const handleLoadedMetadata = () => {
            finish(formatAudioDurationLabel(audio.duration));
        };

        const handleError = () => {
            finish(null);
        };

        timeoutId = window.setTimeout(() => {
            finish(null);
        }, 10000);

        audio.preload = "metadata";
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("durationchange", handleLoadedMetadata);
        audio.addEventListener("error", handleError);

        try {
            audio.src = url;
            audio.load();
        } catch {
            finish(null);
        }
    });
}

// Revision Alert Component with expandable lyrics and editable notes
// Revision type badge colors and labels
const REVISION_TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
    PRONUNCIATION: { emoji: "🎤", label: "Pronúncia", color: "bg-purple-100 text-purple-800 border-purple-300" },
    NAME_ERROR: { emoji: "📛", label: "Nome Errado", color: "bg-red-100 text-red-800 border-red-300" },
    LYRICS_ERROR: { emoji: "📝", label: "Erro na Letra", color: "bg-blue-100 text-blue-800 border-blue-300" },
    STYLE_CHANGE: { emoji: "🎨", label: "Mudança de Estilo", color: "bg-orange-100 text-orange-800 border-orange-300" },
    QUALITY_ISSUE: { emoji: "🔊", label: "Qualidade", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    OTHER: { emoji: "❓", label: "Outro", color: "bg-[#111827]/60 text-[#F0EDE6] border-gray-300" },
};

// Revision fault (responsibility) badge colors and labels
const REVISION_FAULT_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
    OUR_FAULT: { emoji: "🆓", label: "Erro Nosso (Grátis)", color: "bg-green-100 text-green-800 border-green-300" },
    CLIENT_FAULT: { emoji: "💰", label: "Erro do Cliente (R$ 39,90)", color: "bg-red-100 text-red-800 border-red-300" },
    UNCLEAR: { emoji: "❓", label: "A Analisar", color: "bg-[#111827]/60 text-[#F0EDE6] border-gray-300" },
};

// Type for revision history entries
type RevisionHistoryEntry = {
    revisionNumber: number;
    requestedAt?: Date | string | null;
    notes?: string | null;
    type?: string | null;
    fault?: string | null;
    faultReason?: string | null;
    melodyPreference?: string | null;
    completedBy?: string | null;
    completedAt?: Date | string | null;
    revisionAudioUrl?: string | null;
    revisionAudioKey?: string | null;
    songFileUrl?: string | null;
    songFileUrl2?: string | null;
    songFileKey?: string | null;
    songFileKey2?: string | null;
    songUploadedAt?: Date | string | null;
    songUploadedAt2?: Date | string | null;
    songDeliveredAt?: Date | string | null;
};

// LocalStorage key for admin name
const ADMIN_NAME_KEY = "admin-revision-name";

function getAdminName(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ADMIN_NAME_KEY);
}

function setAdminName(name: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(ADMIN_NAME_KEY, name);
}

function RevisionAlert({
    revisionCount,
    revisionRequestedAt,
    revisionNotes,
    revisionType,
    revisionFault,
    revisionFaultReason,
    melodyPreference,
    lyrics,
    correctedLyrics: savedCorrectedLyrics,
    orderId,
    email,
    locale,
    onSaveNotes,
    isSaving,
    onCompleteRevision,
    isCompletingRevision,
    revisionLockedBy,
    revisionLockedAt,
    currentAdminName,
    onLock,
    onUnlock,
    isLocking,
    revisionHistory,
    genre,
    revisionAudioUrl,
    songFileUrl,
    songFileUrl2,
}: {
    revisionCount: number;
    revisionRequestedAt: Date | string | null;
    revisionNotes: string;
    revisionType?: string | null;
    revisionFault?: string | null;
    revisionFaultReason?: string | null;
    melodyPreference?: string | null;
    lyrics: string | null;
    correctedLyrics?: string | null;
    orderId: string;
    email: string;
    locale: string;
    genre: string;
    onSaveNotes: (notes: string) => void;
    isSaving?: boolean;
    onCompleteRevision: () => void;
    isCompletingRevision?: boolean;
    revisionLockedBy?: string | null;
    revisionLockedAt?: Date | string | null;
    currentAdminName?: string | null;
    onLock: (adminName: string) => void;
    onUnlock: () => void;
    isLocking?: boolean;
    revisionHistory?: RevisionHistoryEntry[] | null;
    revisionAudioUrl?: string | null;
    songFileUrl?: string | null;
    songFileUrl2?: string | null;
}) {
    const utils = api.useUtils();
    const [showLyrics, setShowLyrics] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [notesDraft, setNotesDraft] = useState(revisionNotes);
    const [adminName, setAdminNameState] = useState<string | null>(null);
    const [showNamePrompt, setShowNamePrompt] = useState(false);
    const [nameInput, setNameInput] = useState("");

    // Lyrics correction state
    const [showDiffView, setShowDiffView] = useState(false);
    const [correctedLyrics, setCorrectedLyrics] = useState<string | null>(null);
    const [displayLyrics, setDisplayLyrics] = useState<string | null>(null);
    const [changes, setChanges] = useState<LyricsChange[]>([]);

    // Generate corrected lyrics mutation
    const generateCorrectionMutation = api.admin.generateCorrectedLyrics.useMutation({
        onSuccess: (data) => {
            setCorrectedLyrics(data.correctedLyrics);
            setDisplayLyrics(data.displayLyrics);
            setChanges(data.changes);
            setShowDiffView(true);
            toast.success("Correção gerada com sucesso!");
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao gerar correção");
        },
    });

    // Save corrected lyrics mutation
    const saveCorrectionMutation = api.admin.saveCorrectedLyrics.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getLyrics.invalidate({ orderId });
            setShowDiffView(false);
            toast.success("Letra corrigida salva!");
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao salvar correção");
        },
    });

    const handleGenerateCorrection = () => {
        generateCorrectionMutation.mutate({ orderId });
    };

    const handleAcceptCorrection = (lyricsToSave: string) => {
        // For PRONUNCIATION revisions, displayLyrics is different (no phonetics)
        // For all other types, display = corrected
        // correctedLyrics pronunciation dictionary is re-applied on the server during save
        const finalDisplayLyrics = revisionType === "PRONUNCIATION"
            ? (displayLyrics || undefined)
            : lyricsToSave;

        saveCorrectionMutation.mutate({
            orderId,
            correctedLyrics: lyricsToSave,
            displayLyrics: finalDisplayLyrics,
        });
    };

    const handleRejectCorrection = () => {
        setShowDiffView(false);
        setCorrectedLyrics(null);
        setDisplayLyrics(null);
        setChanges([]);
    };

    // Load admin name from localStorage (refresh when lock changes)
    useEffect(() => {
        setAdminNameState(getAdminName());
    }, [revisionLockedBy]);

    const effectiveReviewerName = currentAdminName?.trim() || adminName?.trim() || "";

    // Check if current admin is the one who locked
    const isLockedByMe = !!revisionLockedBy && !!effectiveReviewerName
        && normalizeAdminName(revisionLockedBy) === normalizeAdminName(effectiveReviewerName);

    const handleLock = () => {
        const adminNameToUse = effectiveReviewerName;
        if (!adminNameToUse) {
            setShowNamePrompt(true);
            return;
        }
        onLock(adminNameToUse);
    };

    const handleNameSubmit = () => {
        if (nameInput.trim()) {
            setAdminName(nameInput.trim());
            setAdminNameState(nameInput.trim());
            setShowNamePrompt(false);
            onLock(nameInput.trim());
        }
    };

    const handleChangeName = () => {
        setNameInput(adminName ?? "");
        setShowNamePrompt(true);
    };

    // Parse marked words from revision notes
    // Format: "Palavras com erro na letra: word1, word2, word3\n\nrest of notes"
    const parseMarkedWords = (notes: string): string[] => {
        const match = notes.match(/Palavras com erro na letra:\s*([^\n]+)/i);
        if (!match || !match[1]) return [];
        return match[1].split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
    };

    const markedWords = parseMarkedWords(revisionNotes);

    // Extract preferred song choice from notes and clean notes
    const preferredChoiceMeta = useMemo(() => {
        const labelMatch = revisionNotes.match(/^(?:vers[aã]o preferida|preferred version):\s*(.+)$/im);
        const urlMatch = revisionNotes.match(/^(?:url da vers[aã]o|preferred version url):\s*(.+)$/im);

        const preferredChoiceLabel = labelMatch?.[1]?.trim() || null;
        const preferredChoiceUrlFromNotes = urlMatch?.[1]?.trim() || null;

        const preferredVersionMatch = preferredChoiceLabel?.match(/(?:op[cç][aã]o|option)\s*([12])/i);
        const preferredVersion = preferredVersionMatch?.[1] === "1" || preferredVersionMatch?.[1] === "2"
            ? preferredVersionMatch[1]
            : null;

        const fallbackUrl = preferredVersion === "2"
            ? songFileUrl2 ?? null
            : preferredVersion === "1"
                ? songFileUrl ?? null
                : null;

        const preferredChoiceUrl = preferredChoiceUrlFromNotes || fallbackUrl;

        const cleanedNotes = revisionNotes
            .replace(/^(?:vers[aã]o preferida|preferred version):[^\n]*\n?/gim, "")
            .replace(/^(?:url da vers[aã]o|preferred version url):[^\n]*\n?/gim, "")
            .trim();

        return {
            preferredChoiceLabel,
            preferredChoiceUrl,
            cleanedNotes,
        };
    }, [revisionNotes, songFileUrl, songFileUrl2]);

    // Preferred option duration
    const [preferredDuration, setPreferredDuration] = useState<string | null>(null);
    useEffect(() => {
        const url = preferredChoiceMeta.preferredChoiceUrl;
        if (!url) { setPreferredDuration(null); return; }
        let cancelled = false;
        void getAudioDurationLabel(url).then((d) => { if (!cancelled) setPreferredDuration(d); });
        return () => { cancelled = true; };
    }, [preferredChoiceMeta.preferredChoiceUrl]);

    const cleanedNotes = preferredChoiceMeta.cleanedNotes;
    const { baseNotes, additions } = useMemo(() => splitAdditionalNotes(cleanedNotes), [cleanedNotes]);
    const displayNotes = baseNotes || cleanedNotes;
    const normalizedRevisionHistory = useMemo(
        () => normalizeRevisionHistory(revisionHistory, { revisionCount }) as unknown as RevisionHistoryEntry[],
        [revisionHistory, revisionCount]
    );

    // Highlight marked words in lyrics
    const renderLyricsWithHighlights = (lyricsText: string, words: string[]) => {
        if (words.length === 0) return lyricsText;

        // Remove Suno tags
        const cleanLyrics = lyricsText.replace(/\[.*?\]/g, "");

        return cleanLyrics.split("\n").map((line, lineIdx) => (
            <div key={lineIdx} className={!line.trim() ? "h-3" : ""}>
                {line.split(/(\s+)/).map((segment, segIdx) => {
                    if (/^\s+$/.test(segment)) return <span key={segIdx}>{segment}</span>;
                    // Remove punctuation for comparison and do exact match
                    const cleanSegment = segment.toLowerCase().replace(/[.,!?;:'"()]/g, "");
                    const isMarked = words.some(w => cleanSegment === w);
                    return (
                        <span
                            key={segIdx}
                            className={isMarked ? "bg-red-200 text-red-800 font-semibold px-0.5 rounded" : ""}
                        >
                            {segment}
                        </span>
                    );
                })}
            </div>
        ));
    };

    const handleSave = () => {
        if (!isLockedByMe) {
            toast.error("Trave a revisão com seu nome para editar.");
            return;
        }
        onSaveNotes(notesDraft);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setNotesDraft(revisionNotes);
        setIsEditing(false);
    };

    return (
        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-lg font-semibold text-amber-800">
                                Revisão Solicitada #{revisionCount}
                            </h4>
                            {revisionType && REVISION_TYPE_CONFIG[revisionType] && (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border ${REVISION_TYPE_CONFIG[revisionType].color}`}>
                                    {REVISION_TYPE_CONFIG[revisionType].emoji} {REVISION_TYPE_CONFIG[revisionType].label}
                                </span>
                            )}
                            {revisionFault && REVISION_FAULT_CONFIG[revisionFault] && (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border ${REVISION_FAULT_CONFIG[revisionFault].color}`}>
                                    {REVISION_FAULT_CONFIG[revisionFault].emoji} {REVISION_FAULT_CONFIG[revisionFault].label}
                                </span>
                            )}
                            {melodyPreference && (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border ${melodyPreference === "KEEP_CURRENT" ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-purple-100 text-purple-800 border-purple-300"}`}>
                                    {melodyPreference === "KEEP_CURRENT" ? "🎵 Manter Melodia" : "🎶 2 Novas Melodias"}
                                </span>
                            )}
                            {preferredChoiceMeta.preferredChoiceLabel && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border bg-blue-100 text-blue-800 border-blue-300">
                                    🎧 {preferredChoiceMeta.preferredChoiceLabel}{preferredDuration ? ` (${preferredDuration})` : ""}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {revisionRequestedAt && (
                                <span className="text-base text-amber-600">
                                    {formatInTimeZone(new Date(revisionRequestedAt), "America/Sao_Paulo", "dd/MM/yyyy HH:mm")}
                                </span>
                            )}
                            {!isEditing && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={!isLockedByMe}
                                    title={!isLockedByMe ? "Trave a revisão com seu nome para editar" : "Editar notas"}
                                    onClick={() => setIsEditing(true)}
                                    className="h-7 px-2 text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                                >
                                    <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {isEditing ? (
                        <div className="space-y-2">
                            <Textarea
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                rows={6}
                                className="bg-[#111827] border-amber-300 focus:border-amber-500 text-sm"
                                placeholder="Notas da revisão..."
                            />
                            <p className="text-xs text-amber-600">
                                Adicione informações extras que o cliente mandou pelo WhatsApp
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Save className="h-3.5 w-3.5" />
                                    )}
                                    Salvar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancel}
                                    disabled={isSaving}
                                    className="border-amber-300 text-amber-700 hover:bg-amber-100"
                                >
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p className="text-base text-amber-900 whitespace-pre-wrap leading-relaxed font-semibold">{displayNotes || "—"}</p>
                        </div>
                    )}

                    {!isEditing && additions.length > 0 && (
                        <div className="bg-white/70 border border-amber-200 rounded-lg p-3 mt-3">
                            <p className="text-xs font-semibold text-amber-700 mb-2">
                                Notas adicionais ({additions.length})
                            </p>
                            <div className="space-y-2">
                                {additions.map((note, index) => (
                                    <div key={index} className="rounded-md border border-amber-100 bg-amber-50/60 p-2">
                                        <p className="text-[11px] text-amber-700">
                                            Adicionado em {note.timestamp}
                                        </p>
                                        <p className="text-sm text-amber-900 whitespace-pre-wrap">{note.text}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {revisionAudioUrl && !isEditing && (
                        <div className="bg-[#111827] border border-amber-200 rounded-lg p-3 mt-3 space-y-2">
                            <p className="text-xs font-semibold text-amber-700">
                                Áudio enviado pelo cliente
                            </p>
                            <TrackedAudioPlayer
                                src={revisionAudioUrl}
                                title={`Revisão #${revisionCount} - áudio do cliente`}
                                variant="compact"
                                showDownload={true}
                                showSpeedControl={true}
                            />
                        </div>
                    )}

                    {/* Fault Reason - AI Explanation */}
                    {revisionFaultReason && !isEditing && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-3">
                            <p className="text-sm font-medium text-slate-500 mb-2">Justificativa da IA:</p>
                            <p className="text-base text-slate-700 leading-relaxed">{revisionFaultReason}</p>
                        </div>
                    )}

                    {/* Previous Revisions History */}
                    {normalizedRevisionHistory.length > 0 && !isEditing && (
                        <details className="mt-4 bg-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2">
                                <History className="h-4 w-4" />
                                Histórico de Revisões Anteriores ({normalizedRevisionHistory.length})
                            </summary>
                            <div className="px-4 pb-4 space-y-3">
                                {[...normalizedRevisionHistory]
                                    .sort((a, b) => b.revisionNumber - a.revisionNumber)
                                    .map((entry, index) => {
                                    const { baseNotes: historyBaseNotes, additions: historyAdditions } = splitAdditionalNotes(entry.notes ?? "");
                                    const historyNotes = historyBaseNotes || entry.notes || "—";
                                    const historyCompletedBy = capitalizeReviewerName(entry.completedBy);

                                    return (
                                        <div key={index} className="bg-[#111827] border border-slate-200 rounded-lg p-3 mt-3">
                                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                                <span className="text-sm font-semibold text-slate-800">
                                                    {entry.revisionNumber === 0 ? "Entrega Original" : `Revisão #${entry.revisionNumber}`}
                                                </span>
                                                {entry.type && (() => {
                                                    const config = REVISION_TYPE_CONFIG[entry.type];
                                                    return config ? (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
                                                            {config.emoji} {config.label}
                                                        </span>
                                                    ) : null;
                                                })()}
                                                {entry.fault && (() => {
                                                    const config = REVISION_FAULT_CONFIG[entry.fault];
                                                    return config ? (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
                                                            {config.emoji} {config.label}
                                                        </span>
                                                    ) : null;
                                                })()}
                                                {entry.melodyPreference && (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${entry.melodyPreference === "KEEP_CURRENT" ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-purple-100 text-purple-800 border-purple-300"}`}>
                                                        {entry.melodyPreference === "KEEP_CURRENT" ? "🎵 Manter" : "🎶 Novas Melodias"}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2">{historyNotes}</p>
                                            {historyAdditions.length > 0 && (
                                                <div className="mt-2 space-y-2">
                                                    {historyAdditions.map((note, noteIndex) => (
                                                        <div key={noteIndex} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                                            <p className="text-[11px] text-slate-500">
                                                                Adicionado em {note.timestamp}
                                                            </p>
                                                            <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.text}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {entry.requestedAt && (
                                                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                                                        <Clock className="h-3 w-3" />
                                                        Solicitado {formatInTimeZone(new Date(entry.requestedAt), "America/Sao_Paulo", "dd/MM/yyyy HH:mm")}
                                                    </span>
                                                )}
                                                {historyCompletedBy && (
                                                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                                        <User className="h-3 w-3" />
                                                        Revisado por {historyCompletedBy}
                                                        {entry.completedAt && ` • ${formatInTimeZone(new Date(entry.completedAt), "America/Sao_Paulo", "dd/MM/yyyy HH:mm")}`}
                                                    </span>
                                                )}
                                            </div>
                                            {entry.faultReason && (
                                                <p className="text-xs text-slate-500 mt-2 italic">IA: {entry.faultReason}</p>
                                            )}
                                            {entry.revisionAudioUrl && (
                                                <div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
                                                    <p className="text-xs font-medium text-slate-600">Áudio enviado pelo cliente:</p>
                                                    <TrackedAudioPlayer
                                                        src={entry.revisionAudioUrl}
                                                        title={`${entry.revisionNumber === 0 ? "Original" : `Revisão #${entry.revisionNumber}`} - áudio do cliente`}
                                                        variant="compact"
                                                        showDownload={true}
                                                        showSpeedControl={true}
                                                    />
                                                </div>
                                            )}
                                            {(entry.songFileUrl || entry.songFileUrl2) && (
                                                <div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
                                                    <p className="text-xs font-medium text-slate-600">Músicas desta versão:</p>
                                                    {entry.songFileUrl && (
                                                        <div className="space-y-1">
                                                            <span className="text-xs text-slate-500">Opção 1:</span>
                                                            <TrackedAudioPlayer
                                                                src={entry.songFileUrl}
                                                                title={`${entry.revisionNumber === 0 ? "Original" : `Revisão #${entry.revisionNumber}`} — Opção 1`}
                                                                variant="compact"
                                                                showDownload={true}
                                                                showSpeedControl={true}
                                                            />
                                                        </div>
                                                    )}
                                                    {entry.songFileUrl2 && (
                                                        <div className="space-y-1">
                                                            <span className="text-xs text-slate-500">Opção 2:</span>
                                                            <TrackedAudioPlayer
                                                                src={entry.songFileUrl2}
                                                                title={`${entry.revisionNumber === 0 ? "Original" : `Revisão #${entry.revisionNumber}`} — Opção 2`}
                                                                variant="compact"
                                                                showDownload={true}
                                                                showSpeedControl={true}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                    })}
                            </div>
                        </details>
                    )}

                    {/* AI Lyrics Correction Section */}
                    {lyrics && !isEditing && (
                        <div className="pt-4 border-t border-amber-200 mt-4 space-y-4">
                            {/* Generate Correction Button */}
                            {!showDiffView && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-4">
                                        <Button
                                            size="lg"
                                            onClick={handleGenerateCorrection}
                                            disabled={generateCorrectionMutation.isPending || !revisionNotes}
                                            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-all duration-200 text-base"
                                        >
                                            {generateCorrectionMutation.isPending ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                                    Gerando Correção...
                                                </>
                                            ) : (
                                                <>
                                                    <Wand2 className="h-5 w-5 mr-2" />
                                                    Gerar Correção com IA
                                                </>
                                            )}
                                        </Button>
                                        {savedCorrectedLyrics && (
                                            <span className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-medium">
                                                Correção já salva
                                            </span>
                                        )}
                                    </div>
                                    {/* WhatsApp charge buttons - always visible */}
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const trackOrderUrl = `https://apollosong.com/${locale || "pt"}/track-order?email=${encodeURIComponent(email)}`;
                                                const genreName = GENRE_NAMES[genre as keyof typeof GENRE_NAMES]?.pt || genre;
                                                const message = `Olá! 🎵

Sua música foi revisada e corrigida com sucesso!

A revisão já está disponível no link de acompanhamento do pedido:
${trackOrderUrl}

Como a revisão envolveu mudança de gênero musical (${genreName}), há uma taxa de *R$ 49,90*.

Para efetuar o pagamento, faça o PIX para:
📱 *CPF:* 011.103.041-29
👤 *Nome:* Thiago Felizola

Se já efetuou o pagamento, por favor desconsidere esta mensagem.

Obrigado pela compreensão! 🙏`;
                                                navigator.clipboard.writeText(message);
                                                toast.success("Mensagem copiada!");
                                            }}
                                            className="h-8 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                        >
                                            <Copy className="h-3.5 w-3.5 mr-1" />
                                            Cobrar WhatsApp (Gênero R$ 49,90)
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const trackOrderUrl = `https://apollosong.com/${locale || "pt"}/track-order?email=${encodeURIComponent(email)}`;
                                                const message = `Olá! 🎵

Sua música foi revisada e corrigida com sucesso!

A revisão já está disponível no link de acompanhamento do pedido:
${trackOrderUrl}

Como a revisão foi necessária devido a informações incorretas ou ausentes no formulário original, há uma taxa de *R$ 39,90*.

Para efetuar o pagamento, faça o PIX para:
📱 *CPF:* 011.103.041-29
👤 *Nome:* Thiago Felizola

Se já efetuou o pagamento, por favor desconsidere esta mensagem.

Obrigado pela compreensão! 🙏`;
                                                navigator.clipboard.writeText(message);
                                                toast.success("Mensagem copiada!");
                                            }}
                                            className="h-8 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                        >
                                            <Copy className="h-3.5 w-3.5 mr-1" />
                                            Cobrar WhatsApp (Info errada R$ 39,90)
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Diff Viewer */}
                            {showDiffView && correctedLyrics && (
                                <LyricsDiffViewer
                                    originalLyrics={lyrics}
                                    correctedLyrics={correctedLyrics}
                                    changes={changes}
                                    onAccept={handleAcceptCorrection}
                                    onReject={handleRejectCorrection}
                                    isAccepting={saveCorrectionMutation.isPending}
                                />
                            )}

                            {/* Expandable Lyrics Section (only show when diff is not visible) */}
                            {!showDiffView && markedWords.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setShowLyrics(!showLyrics)}
                                        className="flex items-center gap-2 text-base font-medium text-amber-700 hover:text-amber-900 transition-colors"
                                    >
                                        {showLyrics ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                        {showLyrics ? "Esconder letra" : "Ver letra com destaques"}
                                        <span className="text-sm bg-red-200 text-red-700 px-2 py-0.5 rounded">
                                            {markedWords.length} palavra(s) marcada(s)
                                        </span>
                                    </button>
                                    {showLyrics && (
                                        <div className="mt-3 p-4 bg-[#111827] rounded-lg border border-amber-200 max-h-72 overflow-y-auto">
                                            <div className="text-base text-slate-700 leading-relaxed">
                                                {renderLyricsWithHighlights(lyrics, markedWords)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

// Revision Waiting Timer Component - shows how long order has been waiting for revision
function RevisionWaitingTimer({ revisionRequestedAt }: { revisionRequestedAt: Date | string }) {
    const [elapsed, setElapsed] = useState(() => {
        const start = new Date(revisionRequestedAt).getTime();
        return Date.now() - start;
    });

    useEffect(() => {
        const interval = setInterval(() => {
            const start = new Date(revisionRequestedAt).getTime();
            setElapsed(Date.now() - start);
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [revisionRequestedAt]);

    const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
    const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));

    // Determine urgency color based on waiting time
    const isUrgent = days >= 2;
    const isWarning = days >= 1 && !isUrgent;

    // Format the time string
    const timeString = days > 0
        ? `${days} dia${days !== 1 ? "s" : ""} e ${hours} hora${hours !== 1 ? "s" : ""}`
        : hours > 0
            ? `${hours} hora${hours !== 1 ? "s" : ""} e ${minutes} minuto${minutes !== 1 ? "s" : ""}`
            : `${minutes} minuto${minutes !== 1 ? "s" : ""}`;

    return (
        <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 ${isUrgent
                    ? "bg-red-50 border-red-300 text-red-700"
                    : isWarning
                        ? "bg-amber-50 border-amber-300 text-amber-700"
                        : "bg-blue-50 border-blue-300 text-blue-700"
                }`}
        >
            <Clock className={`h-5 w-5 ${isUrgent ? "animate-pulse" : ""}`} />
            <span className="text-sm font-medium">
                O cliente está há <span className="font-bold">{timeString}</span> aguardando
            </span>
        </div>
    );
}

// Revision Credits Editor Component
function RevisionCreditsEditor({
    orderId,
    currentCount,
}: {
    orderId: string;
    currentCount: number;
}) {
    const utils = api.useUtils();
    const [count, setCount] = useState(currentCount);
    const [isEditing, setIsEditing] = useState(false);

    const updateMutation = api.admin.updateOrder.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            setIsEditing(false);
            toast.success("Créditos de revisão atualizados");
        },
        onError: () => {
            toast.error("Erro ao atualizar créditos");
            setCount(currentCount);
        },
    });

    const handleSave = () => {
        updateMutation.mutate({ id: orderId, revisionCount: count });
    };

    const handleCancel = () => {
        setCount(currentCount);
        setIsEditing(false);
    };

    const remaining = Math.max(0, 10 - count);

    return (
        <div className="flex items-center justify-between py-2">
            <Label className="text-sm text-slate-600">Revisões Usadas</Label>
            {isEditing ? (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                        <button
                            onClick={() => setCount(Math.max(0, count - 1))}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-[#111827] border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-lg"
                            disabled={count <= 0}
                        >
                            −
                        </button>
                        <span className="w-8 text-center font-bold text-slate-800">{count}</span>
                        <button
                            onClick={() => setCount(Math.min(10, count + 1))}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-[#111827] border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-lg"
                            disabled={count >= 10}
                        >
                            +
                        </button>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        className="p-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                        {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                    </button>
                    <button
                        onClick={handleCancel}
                        disabled={updateMutation.isPending}
                        className="p-1.5 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-50"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors group"
                >
                    <span className="font-bold text-slate-800">{count}/10</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${remaining > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {remaining > 0 ? `${remaining} restante${remaining > 1 ? "s" : ""}` : "esgotado"}
                    </span>
                    <Edit2 className="h-3.5 w-3.5 text-charcoal/60 group-hover:text-slate-600" />
                </button>
            )}
        </div>
    );
}

type AudioStateChangeHandler = (
    isPlaying: boolean,
    url: string,
    title: string,
    playerRef: RefObject<AudioPlayerHandle | null>,
) => void;

type TrackedAudioPlayerProps = Omit<ComponentPropsWithoutRef<typeof AudioPlayer>, "onPlayingChange"> & {
    onAudioStateChange?: AudioStateChangeHandler;
};

function TrackedAudioPlayer({ onAudioStateChange, src, title, ...props }: TrackedAudioPlayerProps) {
    const playerRef = useRef<AudioPlayerHandle>(null);

    return (
        <AudioPlayer
            ref={playerRef}
            src={src}
            title={title}
            {...props}
            onPlayingChange={(playing) => {
                onAudioStateChange?.(playing, src, title ?? "Música", playerRef);
            }}
        />
    );
}

export function LeadDetailsDialog({ lead, open, onClose }: LeadDetailsProps) {
    const utils = api.useUtils();
    const [isEditing, setIsEditing] = useState(false);
    const [isGeneratingSong, setIsGeneratingSong] = useState(false);
    const [showLockPrompt, setShowLockPrompt] = useState(false);
    const [showCloseRevisionLockDialog, setShowCloseRevisionLockDialog] = useState(false);
    const [lockNameInput, setLockNameInput] = useState("");
    const [currentAdminName, setCurrentAdminName] = useState<string | null>(null);
    const [showAdminRevisionDialog, setShowAdminRevisionDialog] = useState(false);
    const [adminRevisionNotes, setAdminRevisionNotes] = useState("");
    const [adminPreferredSongVersion, setAdminPreferredSongVersion] = useState<"1" | "2" | undefined>(undefined);
    const [adminMelodyPreference, setAdminMelodyPreference] = useState<"KEEP_CURRENT" | "SUGGEST_NEW" | undefined>(undefined);

    useEffect(() => {
        setCurrentAdminName(getAdminName());
    }, []);

    const currentAdmin = api.admin.getCurrentAdmin.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });
    const isCurrentAdminSuperAdmin = !!currentAdmin.data?.isSuperAdmin;
    const sessionAdminName = useMemo(
        () => resolveAdminIdentityFromSession(currentAdmin.data),
        [currentAdmin.data?.email, currentAdmin.data?.name, currentAdmin.data?.username]
    );
    const shouldShowDeliveryTab = lead.orderType !== "LYRICS_UPSELL";
    const deliveryPlanBadge = getLeadDeliveryPlanBadge(lead);

    useEffect(() => {
        if (!sessionAdminName) return;
        if (normalizeAdminName(currentAdminName) === normalizeAdminName(sessionAdminName)) return;
        setCurrentAdminName(sessionAdminName);
        setAdminName(sessionAdminName);
    }, [currentAdminName, sessionAdminName]);

    // Tab and audio state for floating player
    // Default tab: "delivery" for STREAMING_UPSELL, "revision" for REVISION status, otherwise "core"
    const [currentTab, setCurrentTab] = useState(
        lead.orderType === "STREAMING_UPSELL" && shouldShowDeliveryTab ? "delivery" :
            lead.status === "REVISION" ? "revision" : "core"
    );
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
    const [playingAudioTitle, setPlayingAudioTitle] = useState<string | null>(null);
    const activeAudioRef = useRef<RefObject<AudioPlayerHandle | null> | null>(null);
    const isTabSwitchingRef = useRef(false);

    // Handle tab change - preserve audio state when switching away from delivery or revision
    const handleTabChange = useCallback((newTab: string) => {
        if ((currentTab === "delivery" || currentTab === "revision") && isAudioPlaying) {
            // Mark that we're intentionally switching tabs while audio is playing
            isTabSwitchingRef.current = true;
            // Keep audio state, let floating player take over
            setTimeout(() => {
                isTabSwitchingRef.current = false;
            }, 100);
        }
        setCurrentTab(newTab);
    }, [currentTab, isAudioPlaying]);

    // Query for song delivery info (for revision tab audio players)
    const deliveryInfoForRevision = api.admin.getSongDeliveryInfo.useQuery(
        { orderId: lead.id },
        {
            enabled: open,
            refetchOnWindowFocus: true,
            refetchInterval: (query) => {
                const status = (query.state.data as { status?: Lead["status"] } | undefined)?.status ?? lead.status;
                return status === "REVISION" ? 1000 : false;
            },
            refetchIntervalInBackground: false,
            staleTime: 0,
        }
    );

    const effectiveRevisionStatus = (deliveryInfoForRevision.data?.status ?? lead.status) as Lead["status"];
    const effectiveRevisionLockedBy = deliveryInfoForRevision.data?.revisionLockedBy ?? lead.revisionLockedBy;
    const effectiveRevisionLockedAt = deliveryInfoForRevision.data?.revisionLockedAt ?? lead.revisionLockedAt;

    const effectiveAdminName = sessionAdminName || currentAdminName?.trim() || "";
    const lockOwnershipName = sessionAdminName || (currentAdmin.isFetched ? currentAdminName?.trim() || "" : "");
    const hasAdminIdentity = lockOwnershipName.length > 0;
    const isRevisionLockedByMe = !!effectiveRevisionLockedBy && hasAdminIdentity
        && normalizeAdminName(effectiveRevisionLockedBy) === normalizeAdminName(lockOwnershipName);
    const isRevisionLockedByAnotherAdmin = effectiveRevisionStatus === "REVISION"
        && !!effectiveRevisionLockedBy
        && hasAdminIdentity
        && !isRevisionLockedByMe
        && !isCurrentAdminSuperAdmin;
    const shouldBlockRevisionContent = effectiveRevisionStatus === "REVISION"
        && !!effectiveRevisionLockedBy
        && !isRevisionLockedByMe
        && !isCurrentAdminSuperAdmin;
    const canUnlockRevision = isRevisionLockedByMe || isCurrentAdminSuperAdmin;
    const leadRevisionCompletedBy = capitalizeReviewerName(lead.revisionCompletedBy);
    const leadRevisionLockedBy = capitalizeReviewerName(effectiveRevisionLockedBy);

    useEffect(() => {
        if (!open || !isRevisionLockedByAnotherAdmin) {
            return;
        }
        toast.error(`Revisão travada por ${leadRevisionLockedBy ?? effectiveRevisionLockedBy}.`);
        onClose();
    }, [
        effectiveRevisionLockedBy,
        isRevisionLockedByAnotherAdmin,
        leadRevisionLockedBy,
        onClose,
        open,
    ]);

    useEffect(() => {
        if (!shouldShowDeliveryTab && currentTab === "delivery") {
            setCurrentTab(effectiveRevisionStatus === "REVISION" ? "revision" : "core");
        }
    }, [currentTab, effectiveRevisionStatus, shouldShowDeliveryTab]);

    // Audio state change handler - ignore pause events during tab switch
    const handleAudioStateChange = useCallback<AudioStateChangeHandler>((playing, url, title, playerRef) => {
        if (!playing && isTabSwitchingRef.current) {
            // Ignore pause events triggered by tab switch - keep audio playing in floating player
            return;
        }
        if (playing) {
            activeAudioRef.current = playerRef;
            setPlayingAudioUrl(url);
            setPlayingAudioTitle(title);
            setIsAudioPlaying(true);
            return;
        }
        if (activeAudioRef.current !== playerRef) return;
        setIsAudioPlaying(false);
    }, []);

    // Query for revision queue position (only when in REVISION status)
    const revisionQueueInfo = api.admin.getRevisionQueueInfo.useQuery(
        { orderId: lead.id },
        { enabled: effectiveRevisionStatus === "REVISION" }
    );

    // Query for reviewer names (for quick-select buttons in lock gate)
    const reviewerNames = api.admin.getReviewerNames.useQuery(undefined, {
        enabled: effectiveRevisionStatus === "REVISION" && !effectiveRevisionLockedBy,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });
    const quickSelectReviewerNames = useMemo(() => {
        const merged = new Map<string, { name: string; count: number }>();

        for (const reviewer of reviewerNames.data ?? []) {
            const displayName = reviewer.name?.trim();
            if (!displayName) continue;

            const normalizedKey = normalizeAdminName(displayName);
            if (!normalizedKey) continue;

            const existing = merged.get(normalizedKey);
            if (existing) {
                existing.count += reviewer.count;
                existing.name = pickPreferredDisplayName(existing.name, displayName);
                continue;
            }

            merged.set(normalizedKey, {
                name: displayName,
                count: reviewer.count,
            });
        }

        return Array.from(merged.values())
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.name.localeCompare(b.name, "pt-BR");
            });
    }, [reviewerNames.data]);

    // Check if revision needs to be locked before viewing
    const needsLockGate = effectiveRevisionStatus === "REVISION" && !effectiveRevisionLockedBy;

    // Form State
    const [formData, setFormData] = useState(() => buildLeadFormData(lead));

    const canOpenAdminRevision = lead.status === "COMPLETED" &&
        (lead.orderType === "MAIN" || lead.orderType === "EXTRA_SONG" || lead.orderType === "GENRE_VARIANT") &&
        (lead.revisionCount ?? 0) < 10;
    const hasTwoSongOptions = Boolean(lead.songFileUrl2);

    // Mutations
    const updateOrder = api.admin.updateOrder.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            setIsEditing(false);
            toast.success("Order Updated", {
                description: "Lead details have been successfully saved.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao salvar alterações", {
                description: error.message,
            });
        },
    });

    const deleteOrder = api.admin.deleteOrder.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            toast.success("Order Deleted", {
                description: "The lead has been permanently removed.",
            });
            onClose();
        },
    });

    const updateRevisionNotes = api.admin.updateOrder.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Notas da revisão atualizadas", {
                description: "As informações adicionais foram salvas.",
            });
        },
    });

    const createAdminRevision = api.songOrder.requestRevision.useMutation({
        onSuccess: (data) => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            void utils.admin.getLeadById.invalidate({ id: lead.id });
            setShowAdminRevisionDialog(false);
            setAdminRevisionNotes("");
            setAdminPreferredSongVersion(undefined);
            setAdminMelodyPreference(undefined);
            setCurrentTab("revision");
            toast.success("Revisão aberta pelo admin", {
                description: `Pedido movido para REVISION. Posição na fila: #${data.queuePosition}.`,
            });
        },
        onError: (error) => {
            toast.error("Erro ao abrir revisão", {
                description: error.message,
            });
        },
    });

    const completeRevision = api.admin.completeRevision.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            onClose();
            toast.success("Revisao concluida com sucesso!", {
                description: "Email de entrega enviado ao cliente. Status alterado para COMPLETED.",
                duration: 5000,
            });
        },
        onError: (error) => {
            toast.error("Erro ao concluir revisão", {
                description: error.message,
            });
        },
    });

    const lockRevision = api.admin.lockRevision.useMutation({
        onSuccess: (data) => {
            if (data.lockedBy) {
                setAdminName(data.lockedBy);
                setCurrentAdminName(data.lockedBy);
            }
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getLeadById.invalidate({ id: lead.id });
            toast.success("Revisao travada", {
                description: `Voce travou esta revisao. Outros admins nao podem editar.`,
            });
        },
        onError: (error) => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getLeadById.invalidate({ id: lead.id });
            toast.error("Erro ao travar revisao", {
                description: error.message,
            });
        },
    });

    const unlockRevision = api.admin.unlockRevision.useMutation({
        onSuccess: () => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getLeadById.invalidate({ id: lead.id });
            toast.success("Revisao destravada", {
                description: "A revisao agora esta disponivel para outros admins.",
            });
        },
        onError: (error) => {
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getLeadById.invalidate({ id: lead.id });
            toast.error("Erro ao destravar revisao", {
                description: error.message,
            });
        },
    });

    const handleLockRevision = (adminName: string) => {
        const resolvedAdminName = sessionAdminName || adminName.trim();
        if (!resolvedAdminName) {
            toast.error("Não foi possível identificar seu usuário para travar a revisão.");
            return;
        }
        setAdminName(resolvedAdminName);
        setCurrentAdminName(resolvedAdminName);
        lockRevision.mutate({ orderId: lead.id, adminName: resolvedAdminName });
    };

    const handleUnlockRevision = () => {
        if (!effectiveRevisionLockedBy) return;
        const effectiveAdminName = sessionAdminName || currentAdminName?.trim() || "";
        if (!effectiveAdminName) {
            toast.error("Informe seu nome para destravar a revisão.");
            setShowLockPrompt(true);
            return;
        }
        if (!canUnlockRevision) {
            toast.error(`Revisão travada por ${leadRevisionLockedBy ?? effectiveRevisionLockedBy}.`);
            return;
        }
        if (!currentAdminName) {
            setAdminName(effectiveAdminName);
            setCurrentAdminName(effectiveAdminName);
        }
        unlockRevision.mutate({ orderId: lead.id, adminName: effectiveAdminName });
    };

    const handleRequestClose = useCallback(() => {
        if (effectiveRevisionStatus === "REVISION" && isRevisionLockedByMe) {
            setShowCloseRevisionLockDialog(true);
            return;
        }
        onClose();
    }, [effectiveRevisionStatus, isRevisionLockedByMe, onClose]);

    const handleCloseKeepLocked = useCallback(() => {
        setShowCloseRevisionLockDialog(false);
        onClose();
    }, [onClose]);

    const handleCloseUnlockAndExit = useCallback(() => {
        const effectiveAdminName = sessionAdminName || currentAdminName?.trim() || "";
        if (!effectiveAdminName) {
            toast.error("Informe seu nome para destravar a revisão.");
            return;
        }
        if (!canUnlockRevision) {
            toast.error(`Revisão travada por ${leadRevisionLockedBy ?? effectiveRevisionLockedBy}.`);
            return;
        }
        if (!currentAdminName) {
            setAdminName(effectiveAdminName);
            setCurrentAdminName(effectiveAdminName);
        }
        unlockRevision.mutate(
            { orderId: lead.id, adminName: effectiveAdminName },
            {
                onSuccess: () => {
                    setShowCloseRevisionLockDialog(false);
                    onClose();
                },
            }
        );
    }, [canUnlockRevision, currentAdminName, effectiveRevisionLockedBy, lead.id, leadRevisionLockedBy, onClose, sessionAdminName, unlockRevision]);

    const handleSaveRevisionNotes = (notes: string) => {
        updateRevisionNotes.mutate({
            id: lead.id,
            revisionNotes: notes,
        });
    };

    const handleCompleteRevision = () => {
        if (!effectiveRevisionLockedBy) {
            toast.error("Trave a revisão antes de concluir.");
            setShowLockPrompt(true);
            return;
        }
        if (!effectiveAdminName) {
            toast.error("Informe seu nome para concluir a revisão.");
            setShowLockPrompt(true);
            return;
        }
        if (normalizeAdminName(effectiveRevisionLockedBy) !== normalizeAdminName(effectiveAdminName)) {
            toast.error(`Revisão travada por ${leadRevisionLockedBy ?? effectiveRevisionLockedBy}.`);
            return;
        }
        if (confirm("Marcar revisao como concluida e enviar email ao cliente?")) {
            completeRevision.mutate({
                orderId: lead.id,
                adminName: effectiveAdminName,
            });
        }
    };

    const handleOpenAdminRevisionDialog = () => {
        setAdminRevisionNotes("");
        setAdminPreferredSongVersion(undefined);
        setAdminMelodyPreference(undefined);
        setShowAdminRevisionDialog(true);
    };

    const handleCreateAdminRevision = () => {
        const notes = adminRevisionNotes.trim();
        if (notes.length < 10) {
            toast.error("Detalhes insuficientes", {
                description: "Cole pelo menos 10 caracteres com as instruções da revisão.",
            });
            return;
        }

        createAdminRevision.mutate({
            orderId: lead.id,
            email: lead.email,
            revisionNotes: notes,
            preferredSongVersion: adminPreferredSongVersion,
            melodyPreference: adminMelodyPreference,
        });
    };

    const handleSave = () => {
        const normalizedGenre = formData.genre.trim();
        if (!normalizedGenre) {
            toast.error("Gênero obrigatório", {
                description: "Selecione um gênero da lista ou digite um gênero personalizado.",
            });
            return;
        }

        updateOrder.mutate({
            id: lead.id,
            status: formData.status as Lead["status"],
            recipient: formData.recipient,
            recipientName: formData.recipientName,
            recipientRelationship: formData.recipientRelationship || null,
            email: formData.email,
            backupWhatsApp: formData.backupWhatsApp || null,
            sunoAccountEmail: formData.sunoAccountEmail || null,
            genre: normalizedGenre,
            vocals: normalizeVocals(formData.vocals),
            qualities: formData.qualities,
            memories: formData.memories,
            message: formData.message,
        });
    };

    const handleDelete = () => {
        if (confirm("Are you sure you want to delete this order? This cannot be undone.")) {
            deleteOrder.mutate({ id: lead.id });
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setFormData(buildLeadFormData(lead));
    };

    useEffect(() => {
        if (!open) return;
        setIsEditing(false);
        setFormData(buildLeadFormData(lead));
    }, [lead.id, open]);

    const handleCopyPaymentLink = () => {
        const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://apollosong.com";
        const locale = lead.locale || "pt";
        // Some child orders (order bumps) have priceAtOrder=0 because they're included in a parent/wrapper order.
        // Copy a payable checkout link to avoid Stripe "minimum charge amount" errors.
        const payableOrderId = lead.priceAtOrder > 0 ? lead.id : lead.parentOrderId ?? lead.id;
        const paymentLink = `${baseUrl}/${locale}/order/${payableOrderId}`;

        void navigator.clipboard.writeText(paymentLink);
        toast.success("Link Copiado!", {
            description:
                payableOrderId !== lead.id
                    ? "Link do pedido principal copiado para a área de transferência."
                    : "Link de pagamento copiado para a área de transferência.",
        });
    };

    const handleGenerateSong = async () => {
        setIsGeneratingSong(true);
        toast.info("Iniciando Automação", {
            description: "Gerando músicas no Suno AI... Isso pode levar alguns minutos.",
            duration: 10000,
        });

        try {
            const res = await fetch("/api/admin/suno/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: lead.id }),
            });

            const data = await res.json();

            if (data.success) {
                toast.success("Músicas Geradas!", {
                    description: `${data.songsGenerated} música(s) gerada(s) e enviadas para R2. Créditos: ${data.creditsRemaining ?? "N/A"}`,
                    duration: 8000,
                });
                void utils.admin.getLeadsPaginated.invalidate();
            } else {
                toast.error("Erro na Geração", {
                    description: data.error || "Erro desconhecido",
                    duration: 8000,
                });
            }
        } catch (error) {
            toast.error("Erro de Conexão", {
                description: error instanceof Error ? error.message : "Falha ao conectar com o servidor",
            });
        } finally {
            setIsGeneratingSong(false);
        }
    };

    const formatCurrency = (cents: number | null | undefined, currency = "USD") => {
        if (cents === null || cents === undefined) return "—";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
        }).format(cents / 100);
    };

    const formatDuration = (ms: number | null | undefined) => {
        if (!ms) return "—";
        const seconds = Math.round(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleRequestClose()}>
            <DialogContent
                className="!top-0 !left-0 !h-dvh !max-h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-hidden flex flex-col bg-white !rounded-none border-0 p-4 sm:!max-w-none sm:!rounded-none"
                showCloseButton={false}
            >
                <Dialog
                    open={showCloseRevisionLockDialog}
                    onOpenChange={(next) => {
                        if (unlockRevision.isPending && !next) return;
                        setShowCloseRevisionLockDialog(next);
                    }}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Fechar revisão travada?</DialogTitle>
                            <DialogDescription>
                                Esta revisão está travada no seu nome. Deseja destravar para liberar a fila ou manter travada e sair?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={handleCloseKeepLocked}
                                disabled={unlockRevision.isPending}
                            >
                                Manter travado e sair
                            </Button>
                            <Button
                                onClick={handleCloseUnlockAndExit}
                                disabled={unlockRevision.isPending}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                                {unlockRevision.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <LockOpen className="h-4 w-4 mr-2" />
                                )}
                                Destravar e sair
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={showAdminRevisionDialog}
                    onOpenChange={(next) => {
                        if (createAdminRevision.isPending && !next) return;
                        setShowAdminRevisionDialog(next);
                        if (!next) {
                            setAdminRevisionNotes("");
                            setAdminPreferredSongVersion(undefined);
                            setAdminMelodyPreference(undefined);
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Abrir Revisão da Música (Admin)</DialogTitle>
                            <DialogDescription>
                                Cole abaixo os detalhes enviados pelo cliente para abrir a revisão sem passar pelo front do cliente.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            {hasTwoSongOptions && (
                                <div className="space-y-2">
                                    <Label htmlFor="admin-preferred-version">Versão preferida (opcional)</Label>
                                    <Select
                                        value={adminPreferredSongVersion ?? "none"}
                                        onValueChange={(value) =>
                                            setAdminPreferredSongVersion(value === "none" ? undefined : value as "1" | "2")
                                        }
                                    >
                                        <SelectTrigger id="admin-preferred-version">
                                            <SelectValue placeholder="Selecione a opção preferida" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Não informar</SelectItem>
                                            <SelectItem value="1">Opção 1</SelectItem>
                                            <SelectItem value="2">Opção 2</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {lead.songFileUrl && (
                                <div className="space-y-2">
                                    <Label htmlFor="admin-melody-preference">Preferência de melodia (opcional)</Label>
                                    <Select
                                        value={adminMelodyPreference ?? "none"}
                                        onValueChange={(value) =>
                                            setAdminMelodyPreference(
                                                value === "none" ? undefined : value as "KEEP_CURRENT" | "SUGGEST_NEW"
                                            )
                                        }
                                    >
                                        <SelectTrigger id="admin-melody-preference">
                                            <SelectValue placeholder="Selecione a preferência" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Não informar</SelectItem>
                                            <SelectItem value="KEEP_CURRENT">🎵 Manter melodia</SelectItem>
                                            <SelectItem value="SUGGEST_NEW">🎶 2 novas melodias</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="admin-revision-notes">Detalhes da revisão</Label>
                                <Textarea
                                    id="admin-revision-notes"
                                    value={adminRevisionNotes}
                                    onChange={(e) => setAdminRevisionNotes(e.target.value)}
                                    placeholder="Ex: O cliente pediu para corrigir a pronúncia do nome Kamilla para Kámila e ajustar o verso 2..."
                                    rows={10}
                                    className="resize-y"
                                />
                                <p className="text-xs text-slate-500">
                                    Mínimo de 10 caracteres. Esse texto será salvo em <code>revisionNotes</code>.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowAdminRevisionDialog(false)}
                                    disabled={createAdminRevision.isPending}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleCreateAdminRevision}
                                    disabled={createAdminRevision.isPending || adminRevisionNotes.trim().length < 10}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    {createAdminRevision.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                    )}
                                    Abrir Revisão
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Header */}
                <DialogHeader className="flex-shrink-0 border-b pb-4 space-y-3">
                    {/* Row 1: Title + Metadata + Actions */}
                    <div className="flex items-start justify-between">
                        <div>
                            <DialogTitle className="text-2xl font-bold text-slate-900">
                                🎵 {lead.recipientName}
                            </DialogTitle>
                            <DialogDescription className="flex items-center gap-2 text-sm mt-1 flex-wrap">
                                <button
                                    onClick={() => {
                                        void navigator.clipboard.writeText(lead.id);
                                        toast.success("ID copiado!", { description: lead.id });
                                    }}
                                    className="font-mono text-xs text-charcoal/60 hover:text-slate-600 hover:bg-slate-100 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                    title="Clique para copiar"
                                >
                                    {lead.id}
                                </button>
                                <span className="text-charcoal/70">•</span>
                                <button
                                    onClick={() => {
                                        void navigator.clipboard.writeText(lead.email);
                                        toast.success("Email copiado!", { description: lead.email });
                                    }}
                                    className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                    title="Clique para copiar"
                                >
                                    {lead.email}
                                </button>
                                {lead.backupWhatsApp && (
                                    <>
                                        <span className="text-charcoal/70">•</span>
                                        <button
                                            onClick={() => {
                                                void navigator.clipboard.writeText(lead.backupWhatsApp!);
                                                toast.success("WhatsApp copiado!", { description: lead.backupWhatsApp });
                                            }}
                                            className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                            title="Clique para copiar"
                                        >
                                            📱 {lead.backupWhatsApp}
                                        </button>
                                        <a
                                            href={`https://wa.me/${lead.backupWhatsApp!.replace(/\D/g, "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-green-600 hover:text-green-800 hover:bg-green-50 px-1 py-0.5 rounded transition-colors"
                                            title="Abrir conversa no WhatsApp"
                                        >
                                            💬
                                        </a>
                                    </>
                                )}
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Revision Waiting Timer */}
                            {effectiveRevisionStatus === "REVISION" && lead.revisionRequestedAt && (
                                <RevisionWaitingTimer revisionRequestedAt={lead.revisionRequestedAt} />
                            )}
                            {!isEditing && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsEditing(true)}
                                >
                                    <Edit2 className="h-5 w-5 text-slate-500 hover:text-blue-600" />
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRequestClose}
                                className="h-12 w-12 rounded-full bg-red-100 hover:bg-red-200"
                            >
                                <X className="h-8 w-8 text-red-600" />
                            </Button>
                        </div>
                    </div>

                    {/* Row 2: Badges + Revision Area */}
                    <div className="flex items-center justify-between gap-4">
                        {/* Left: Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge className={getStatusColor(formData.status)}>
                                {formData.status}
                            </Badge>
                            {lead.orderType === "EXTRA_SONG" && (
                                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                                    Order Bump
                                </Badge>
                            )}
                            {lead.orderType === "STREAMING_UPSELL" && (
                                <Badge variant="outline" className="bg-sky-100 text-sky-800 border-sky-200">
                                    Streaming VIP
                                </Badge>
                            )}
                            {deliveryPlanBadge && (
                                <Badge variant="outline" className={deliveryPlanBadge.className}>
                                    {deliveryPlanBadge.label}
                                </Badge>
                            )}
                            {formData.genre && (
                                <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                                    {formData.genre}
                                </Badge>
                            )}
                            {formData.vocals && (
                                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                                    {formData.vocals === "male" ? "Voz Masculina" : formData.vocals === "female" ? "Voz Feminina" : "Qualquer Voz"}
                                </Badge>
                            )}
                            {/* Revision Classification Labels - grouped together */}
                            {(lead.revisionType || lead.revisionFault || lead.melodyPreference) && (
                                <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-300">
                                    {lead.revisionType && REVISION_TYPE_CONFIG[lead.revisionType] && (() => {
                                        const config = REVISION_TYPE_CONFIG[lead.revisionType!]!;
                                        return (
                                            <Badge variant="outline" className={config.color}>
                                                {config.emoji} {config.label}
                                            </Badge>
                                        );
                                    })()}
                                    {lead.revisionFault && REVISION_FAULT_CONFIG[lead.revisionFault] && (() => {
                                        const config = REVISION_FAULT_CONFIG[lead.revisionFault!]!;
                                        return (
                                            <Badge variant="outline" className={config.color}>
                                                {config.emoji} {config.label}
                                            </Badge>
                                        );
                                    })()}
                                    {lead.melodyPreference && (
                                        <Badge variant="outline" className={lead.melodyPreference === "KEEP_CURRENT" ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-purple-100 text-purple-800 border-purple-300"}>
                                            {lead.melodyPreference === "KEEP_CURRENT" ? "🎵 Manter Melodia" : "🎶 2 Novas Melodias"}
                                        </Badge>
                                    )}
                                </div>
                            )}
                            {/* Revision Completed By - shows who finished the revision */}
                            {formData.status === "COMPLETED" && leadRevisionCompletedBy && (
                                <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-300">
                                    ✓ Revisado por {leadRevisionCompletedBy}
                                </Badge>
                            )}
                        </div>

                        {/* Right: Revision area */}
                        {effectiveRevisionStatus === "REVISION" && (
                            <div className={`flex items-center gap-4 px-4 py-2 rounded-xl border-2 ${effectiveRevisionLockedBy
                                    ? "bg-amber-50 border-amber-300"
                                    : "bg-red-50 border-red-300 ring-2 ring-red-400 ring-offset-2"
                                }`}>
                                {/* Queue Position - BIG */}
                                {revisionQueueInfo.data?.position && (
                                    <div className="flex flex-col items-center pr-4 border-r-2 border-amber-200">
                                        <span className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold">Posição na Fila</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-black text-amber-600">{revisionQueueInfo.data.position}</span>
                                            <span className="text-sm text-amber-500 font-medium">de {revisionQueueInfo.data.total}</span>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4 text-amber-600" />
                                    <span className="font-semibold text-amber-800">Revisão #{lead.revisionCount || 1}</span>
                                </div>
                                <span className="text-amber-300">|</span>
                                {/* Compact lock status */}
                                {effectiveRevisionLockedBy ? (
                                    <button
                                        onClick={handleUnlockRevision}
                                        disabled={unlockRevision.isPending || !canUnlockRevision}
                                        title={!canUnlockRevision ? "Somente quem travou (ou super admin) pode destravar" : "Destravar revisão"}
                                        className="flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-900 disabled:opacity-50"
                                    >
                                        {unlockRevision.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Lock className="h-4 w-4" />
                                        )}
                                        <span className="font-medium">{leadRevisionLockedBy ?? effectiveRevisionLockedBy}</span>
                                        {effectiveRevisionLockedAt && (
                                            <span className="text-xs text-orange-500">
                                                ({formatInTimeZone(new Date(effectiveRevisionLockedAt), "America/Sao_Paulo", "HH:mm")})
                                            </span>
                                        )}
                                    </button>
                                ) : showLockPrompt ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={lockNameInput}
                                            onChange={(e) => setLockNameInput(e.target.value)}
                                            placeholder="Seu nome"
                                            className="h-7 w-28 text-sm"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && lockNameInput.trim()) {
                                                    handleLockRevision(lockNameInput.trim());
                                                    setShowLockPrompt(false);
                                                    setLockNameInput("");
                                                }
                                                if (e.key === "Escape") {
                                                    setShowLockPrompt(false);
                                                    setLockNameInput("");
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                if (lockNameInput.trim()) {
                                                    handleLockRevision(lockNameInput.trim());
                                                    setShowLockPrompt(false);
                                                    setLockNameInput("");
                                                }
                                            }}
                                            disabled={!lockNameInput.trim() || lockRevision.isPending}
                                            className="h-7 bg-orange-500 hover:bg-orange-600 text-white text-xs px-2"
                                        >
                                            {lockRevision.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                                        </Button>
                                        <button
                                            onClick={() => { setShowLockPrompt(false); setLockNameInput(""); }}
                                            className="text-charcoal/60 hover:text-slate-600 text-sm"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="lg"
                                            onClick={() => {
                                                setShowLockPrompt(true);
                                                if (effectiveAdminName) {
                                                    setLockNameInput(effectiveAdminName);
                                                }
                                            }}
                                            className="h-10 bg-red-500 hover:bg-red-600 text-white px-6 font-bold text-base animate-pulse shadow-lg shadow-red-500/50"
                                        >
                                            <Lock className="h-5 w-5 mr-2" />
                                            TRAVAR AGORA
                                        </Button>
                                        <span className="text-xs text-red-600 font-medium">
                                            ⚠️ Não travado!
                                        </span>
                                    </div>
                                )}
                                {lead.revisionNotes && (
                                    <>
                                        <span className="text-amber-300">|</span>
                                        <Button
                                            size="lg"
                                            onClick={handleCompleteRevision}
                                            disabled={completeRevision.isPending || !isRevisionLockedByMe}
                                            title={!isRevisionLockedByMe ? "Trave a revisão com seu nome para concluir" : undefined}
                                            className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white px-6 font-bold text-base shadow-lg shadow-emerald-500/50"
                                        >
                                            {completeRevision.isPending ? (
                                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                            ) : (
                                                <CheckCircle className="h-5 w-5 mr-2" />
                                            )}
                                            Marcar como Concluído
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                        {formData.status !== "REVISION" && canOpenAdminRevision && (
                            <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50">
                                <span className="text-sm text-amber-700">
                                    Recebeu pedido de ajuste por WhatsApp, email ou suporte?
                                </span>
                                <Button
                                    size="sm"
                                    onClick={handleOpenAdminRevisionDialog}
                                    disabled={createAdminRevision.isPending}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    {createAdminRevision.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                    )}
                                    Abrir Revisão (Admin)
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Lock Gate - Must lock revision before viewing content */}
                {needsLockGate ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="max-w-md w-full p-8 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 shadow-lg">
                            <div className="text-center space-y-6">
                                <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
                                    <Lock className="h-10 w-10 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-amber-900">Trave a Revisão</h3>
                                    <p className="text-amber-700 mt-2">
                                        Para visualizar e trabalhar nesta revisão, você precisa travá-la primeiro.
                                    </p>
                                </div>

                                {/* Quick select reviewer buttons */}
                                {quickSelectReviewerNames.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-amber-600 font-medium">Clique no seu nome:</p>
                                        <div className="flex flex-wrap gap-2 justify-center">
                                            {quickSelectReviewerNames.map((reviewer) => (
                                                <Button
                                                    key={reviewer.name}
                                                    onClick={() => handleLockRevision(reviewer.name)}
                                                    disabled={lockRevision.isPending}
                                                    className="bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 shadow-sm"
                                                >
                                                    {lockRevision.isPending ? (
                                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                                    ) : (
                                                        <User className="h-4 w-4 mr-1" />
                                                    )}
                                                    {reviewer.name}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Manual name input */}
                                <div className="space-y-2">
                                    <p className="text-sm text-amber-600 font-medium">
                                        {quickSelectReviewerNames.length > 0 ? "Ou digite um novo nome:" : "Digite seu nome:"}
                                    </p>
                                    <div className="flex gap-2">
                                        <Input
                                            value={lockNameInput}
                                            onChange={(e) => setLockNameInput(e.target.value)}
                                            placeholder="Seu nome"
                                            className="flex-1 border-amber-300 focus:border-amber-500 focus:ring-amber-500"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && lockNameInput.trim()) {
                                                    handleLockRevision(lockNameInput.trim());
                                                    setLockNameInput("");
                                                }
                                            }}
                                        />
                                        <Button
                                            onClick={() => {
                                                if (lockNameInput.trim()) {
                                                    handleLockRevision(lockNameInput.trim());
                                                    setLockNameInput("");
                                                }
                                            }}
                                            disabled={!lockNameInput.trim() || lockRevision.isPending}
                                            className="bg-amber-600 hover:bg-amber-700 text-white"
                                        >
                                            {lockRevision.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Lock className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : shouldBlockRevisionContent ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="max-w-md w-full p-8 bg-red-50 rounded-2xl border-2 border-red-200 shadow-lg text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                                <Lock className="h-8 w-8 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-red-800">Revisão em uso</h3>
                            <p className="text-red-700">
                                Esta revisão está travada por <strong>{leadRevisionLockedBy ?? effectiveRevisionLockedBy}</strong>.
                            </p>
                            <p className="text-sm text-red-600">
                                Apenas o revisor que travou (ou super admin) pode acessar esta modal.
                            </p>
                            <Button
                                variant="outline"
                                className="border-red-300 text-red-700 hover:bg-red-100"
                                onClick={onClose}
                            >
                                Fechar
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Tabs Content */
                    <Tabs
                        value={currentTab}
                        onValueChange={handleTabChange}
                        className="flex-1 overflow-hidden flex flex-col"
                    >
                        <TabsList className="flex w-full flex-shrink-0 items-stretch gap-1.5 rounded-xl bg-slate-100 p-1.5">
                            <TabsTrigger
                                value="core"
                                className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition-all hover:bg-white/60 hover:text-slate-900 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
                            >
                                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <span className="sr-only sm:not-sr-only sm:inline">Informações do Pedido</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="lyrics"
                                className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm ${lead.correctedLyrics
                                        ? "bg-green-100 text-green-700 hover:bg-green-200 data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
                                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                    }`}
                            >
                                <Music className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <span className="sr-only sm:not-sr-only sm:inline">Letra</span>
                                {lead.correctedLyrics && (
                                    <span className="hidden items-center gap-1 rounded-full bg-green-200 px-1.5 py-0.5 text-xs text-green-800 data-[state=active]:bg-green-600 data-[state=active]:text-white md:flex">
                                        <Check className="h-3 w-3" />
                                        Revisada
                                    </span>
                                )}
                            </TabsTrigger>
                            {(lead.revisionCount ?? 0) > 0 && (
                                <TabsTrigger
                                    value="revision"
                                    className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-100 px-2 py-2 text-xs font-medium text-amber-700 transition-all hover:bg-amber-200 data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
                                >
                                    <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    <span className="sr-only sm:not-sr-only sm:inline">Revisão</span>
                                </TabsTrigger>
                            )}
                            {shouldShowDeliveryTab && (
                                <TabsTrigger
                                    value="delivery"
                                    className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition-all hover:bg-white/60 hover:text-slate-900 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
                                >
                                    <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    <span className="sr-only sm:not-sr-only sm:inline">Entrega</span>
                                    {isAudioPlaying && (
                                        <span className="ml-1 hidden items-center gap-1 sm:flex">
                                            <span className="w-1.5 h-3 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                                            <span className="w-1.5 h-4 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                                            <span className="w-1.5 h-2 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            <TabsTrigger
                                value="dados"
                                className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition-all hover:bg-white/60 hover:text-slate-900 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
                            >
                                <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <span className="sr-only sm:not-sr-only sm:inline">Dados Técnicos</span>
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-4 flex-1 overflow-x-hidden overflow-y-auto pr-0 sm:pr-2">
                            {/* Tab 1: Core Info */}
                            <TabsContent value="core" className="mt-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* LEFT COLUMN - Informações básicas */}
                                    <div className="space-y-4">
                                        <InfoCard title="Destinatário">
                                            <Field
                                                label="Tipo"
                                                value={formData.recipient}
                                                isEditing={isEditing}
                                                onChange={(v) => setFormData((p) => ({ ...p, recipient: v }))}
                                            />
                                            <Field
                                                label="Nome"
                                                value={formData.recipientName}
                                                isEditing={isEditing}
                                                onChange={(v) => setFormData((p) => ({ ...p, recipientName: v }))}
                                            />
                                            {(formData.recipient === "other" || formData.recipientRelationship) && (
                                                <Field
                                                    label="Relação"
                                                    value={formData.recipientRelationship}
                                                    isEditing={isEditing}
                                                    onChange={(v) => setFormData((p) => ({ ...p, recipientRelationship: v }))}
                                                />
                                            )}
                                        </InfoCard>

                                        <InfoCard title="Cliente">
                                            <Field
                                                label="Email"
                                                value={formData.email}
                                                isEditing={isEditing}
                                                onChange={(v) => setFormData((p) => ({ ...p, email: v }))}
                                            />
                                            <Field
                                                label="WhatsApp"
                                                value={formData.backupWhatsApp}
                                                isEditing={isEditing}
                                                onChange={(v) => setFormData((p) => ({ ...p, backupWhatsApp: v }))}
                                            />
                                            <Field
                                                label="Conta Suno"
                                                value={formData.sunoAccountEmail}
                                                isEditing={isEditing}
                                                onChange={(v) => setFormData((p) => ({ ...p, sunoAccountEmail: v }))}
                                            />
                                        </InfoCard>

                                        <InfoCard title="Preferências">
                                            <Field
                                                label="Gênero"
                                                value={formData.genre}
                                                isEditing={isEditing}
                                                onChange={(v) => setFormData((p) => ({ ...p, genre: v }))}
                                                options={Object.keys(GENRE_NAMES)}
                                                optionLabels={Object.fromEntries(
                                                    Object.entries(GENRE_NAMES).map(([key, names]) => [key, names.pt || key])
                                                )}
                                                allowCustomOption
                                                customOptionLabel="Outro (digitar manualmente)"
                                                customInputPlaceholder="Ex.: Reggaeton romântico cristão"
                                            />
	                                            <Field
	                                                label="Voz"
	                                                value={formData.vocals}
	                                                isEditing={isEditing}
	                                                onChange={(v) => setFormData((p) => ({ ...p, vocals: normalizeVocals(v) }))}
	                                                options={["male", "female", "either"]}
	                                                optionLabels={{
	                                                    male: "Masculina",
	                                                    female: "Feminina",
	                                                    either: "Qualquer",
	                                                }}
	                                            />
	                                        </InfoCard>

                                        <InfoCard title="Dados do Pedido">
                                            <DisplayField label="Idioma" value={lead.locale} />
                                            <DisplayField label="Moeda" value={lead.currency} />
                                            <DisplayField label="Tipo" value={lead.orderType} />
                                            <DisplayField
                                                label="Criado em"
                                                value={formatInTimeZone(new Date(lead.createdAt), "America/Sao_Paulo", "dd/MM/yyyy 'às' HH:mm")}
                                            />
                                            {lead.orderType === "MAIN" && (
                                                <RevisionCreditsEditor
                                                    orderId={lead.id}
                                                    currentCount={lead.revisionCount ?? 0}
                                                />
                                            )}
                                        </InfoCard>

                                        {/* Linked Orders */}
                                        {(lead.parentOrder || (lead.childOrders && lead.childOrders.length > 0)) && (
                                            <InfoCard title="Pedidos Vinculados">
                                                {lead.parentOrder && (
                                                    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-200 last:border-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-slate-500">Pedido Pai:</span>
                                                            <span className="text-sm font-medium text-slate-800">
                                                                {lead.parentOrder.recipientName}
                                                            </span>
                                                        </div>
                                                        <span className="font-mono text-xs text-slate-500">
                                                            {lead.parentOrder.id.slice(0, 8)}...
                                                        </span>
                                                    </div>
                                                )}
                                                {lead.childOrders && lead.childOrders.length > 0 && (
                                                    <div className="space-y-2">
                                                        <span className="text-xs text-slate-500 block mb-2">
                                                            Pedidos Filhos ({lead.childOrders.length}):
                                                        </span>
                                                        {lead.childOrders.map((child: LeadChildOrder) => (
                                                            <div
                                                                key={child.id}
                                                                className="flex items-center justify-between gap-4 py-2 px-3 rounded bg-[#111827] border border-slate-200"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                                                                        {child.orderType === "EXTRA_SONG"
                                                                            ? "Música Extra"
                                                                            : child.orderType === "STREAMING_UPSELL"
                                                                                ? "Streaming VIP"
                                                                                : child.orderType}
                                                                    </Badge>
                                                                    <span className="text-sm font-medium text-slate-800">
                                                                        {child.recipientName}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge className={getStatusColor(child.status)} variant="outline">
                                                                        {child.status}
                                                                    </Badge>
                                                                    <span className="font-mono text-xs text-slate-500">
                                                                        {child.id.slice(0, 8)}...
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </InfoCard>
                                        )}
                                    </div>

                                    {/* RIGHT COLUMN - Conteúdo da música */}
                                    <div className="space-y-4">
                                        <ContentCard
                                            title="Qualidades & Características"
                                            value={formData.qualities}
                                            isEditing={isEditing}
                                            onChange={(v) => setFormData((p) => ({ ...p, qualities: v }))}
                                        />
                                        <ContentCard
                                            title="Memórias & Histórias"
                                            value={formData.memories}
                                            isEditing={isEditing}
                                            onChange={(v) => setFormData((p) => ({ ...p, memories: v }))}
                                        />
                                        <ContentCard
                                            title="Mensagem Pessoal"
                                            value={formData.message}
                                            isEditing={isEditing}
                                            onChange={(v) => setFormData((p) => ({ ...p, message: v }))}
                                            optional
                                        />

                                        {/* WhatsApp enrichment questions button */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const name = formData.recipientName || "o homenageado";
                                                const rel = formData.recipient || "";
                                                const relMap: Record<string, string> = {
                                                    husband: "seu marido",
                                                    wife: "sua esposa",
                                                    boyfriend: "seu namorado",
                                                    girlfriend: "sua namorada",
                                                    children: "seu(sua) filho(a)",
                                                    father: "seu pai",
                                                    mother: "sua mãe",
                                                    sibling: "seu(sua) irmão/irmã",
                                                    friend: "seu(sua) amigo(a)",
                                                    myself: "você",
                                                    group: "o grupo",
                                                    other: "essa pessoa",
                                                };
                                                const quem = relMap[rel] || "essa pessoa";

                                                const message = `Olá! 😊 Estamos preparando a música para *${name}* com muito carinho! Para deixar a letra ainda mais especial e personalizada, preciso de mais alguns detalhes:

🌍 *De onde vem a história?*
1️⃣ Onde *${name}* nasceu e cresceu? Qual a data de nascimento? Tem algum detalhe da infância ou da cidade que marcou ${quem}?

💼 *O caminho que trilhou*
2️⃣ Qual a profissão ou carreira de *${name}*? Teve alguma conquista, luta ou virada profissional marcante?

✈️ *Caminhos e aventuras*
3️⃣ Tem alguma viagem ou aventura inesquecível que vocês viveram juntos? Onde foi, o que aconteceu, por que foi tão especial?

💎 *O momento que mudou tudo*
4️⃣ Qual foi o momento mais forte entre vocês? Aquele que se pudesse voltar no tempo, viveria de novo? (onde foi, o que sentiram)

🗣️ *A marca registrada*
5️⃣ *${name}* tem algum apelido carinhoso? Tem alguma frase, mania ou expressão que sempre fala?

📸 *A cena que resume tudo*
6️⃣ Se pudesse congelar *${name}* em uma única imagem, qual seria? (Ex: "dançando na cozinha", "rezando de madrugada", "consertando tudo em casa")

🏠 *O lugar de vocês*
7️⃣ Existe algum lugar que é sagrado pra vocês? (uma rua, uma cidade, um cantinho da casa, uma praia...)

_Quanto mais detalhes, mais única e emocionante a música vai ficar!_ 🎵`;

                                                void navigator.clipboard.writeText(message);
                                                toast.success("Perguntas copiadas!", {
                                                    description: "Cole no WhatsApp do cliente",
                                                });
                                            }}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                                        >
                                            <MessageSquareText className="h-4 w-4" />
                                            Copiar perguntas de enriquecimento (WhatsApp)
                                        </button>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Tab 3: Lyrics - forceMount keeps edit state when switching tabs */}
                            <TabsContent
                                value="lyrics"
                                className="mt-0 data-[state=inactive]:hidden"
                                forceMount
                            >
                                <LyricsTab orderId={lead.id} />
                            </TabsContent>

                            {/* Tab 4: Delivery - forceMount keeps audio playing when switching tabs */}
                            {shouldShowDeliveryTab && (
                                <TabsContent
                                    value="delivery"
                                    className="mt-0 data-[state=inactive]:hidden"
                                    forceMount
                                >
                                    <DeliveryTab
                                        orderId={lead.id}
                                        onAudioStateChange={handleAudioStateChange}
                                    />
                                </TabsContent>
                            )}

                            {/* Tab: Revision - Side by Side Layout - forceMount keeps audio playing */}
                            {(lead.revisionCount ?? 0) > 0 && (
                                <TabsContent
                                    value="revision"
                                    className="mt-0 data-[state=inactive]:hidden"
                                    forceMount
                                >
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* LEFT: Revision Info */}
                                        <div className="space-y-4">
                                            <RevisionAlert
                                                revisionCount={lead.revisionCount || 1}
                                                revisionRequestedAt={lead.revisionRequestedAt}
                                                revisionNotes={lead.revisionNotes || ""}
                                                revisionType={lead.revisionType}
                                                revisionFault={lead.revisionFault}
                                                revisionFaultReason={lead.revisionFaultReason}
                                                melodyPreference={lead.melodyPreference}
                                                lyrics={lead.lyrics}
                                                correctedLyrics={lead.correctedLyrics}
                                                orderId={lead.id}
                                                email={lead.email}
                                                locale={lead.locale}
                                                onSaveNotes={handleSaveRevisionNotes}
                                                isSaving={updateRevisionNotes.isPending}
                                                onCompleteRevision={handleCompleteRevision}
                                                isCompletingRevision={completeRevision.isPending}
                                                revisionLockedBy={leadRevisionLockedBy ?? effectiveRevisionLockedBy}
                                                revisionLockedAt={effectiveRevisionLockedAt}
                                                currentAdminName={effectiveAdminName}
                                                onLock={handleLockRevision}
                                                onUnlock={handleUnlockRevision}
                                                isLocking={lockRevision.isPending || unlockRevision.isPending}
                                                revisionHistory={lead.revisionHistory as RevisionHistoryEntry[] | null}
                                                genre={lead.genre}
                                                revisionAudioUrl={lead.revisionAudioUrl}
                                                songFileUrl={lead.songFileUrl}
                                                songFileUrl2={lead.songFileUrl2}
                                            />

                                            {/* Audio players moved to Entrega tab */}
                                        </div>

                                        {/* RIGHT: Original Content */}
                                        <div className="space-y-4">
                                            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5">
                                                <div className="flex items-center gap-2 mb-5">
                                                    <FileText className="h-6 w-6 text-blue-600" />
                                                    <h4 className="text-lg font-semibold text-blue-800">Informações Fornecidas pelo Cliente no Pedido Inicial</h4>
                                                </div>
                                                <div className="space-y-5">
                                                    {/* Qualities */}
                                                    <div className="bg-[#111827] rounded-lg p-4 border border-blue-100">
                                                        <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">Qualidades e Características</p>
                                                        <p className="text-base text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                            {displayQualities(lead.qualities) || "—"}
                                                        </p>
                                                    </div>

                                                    {/* Memories */}
                                                    <div className="bg-[#111827] rounded-lg p-4 border border-blue-100">
                                                        <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">Memórias e Histórias</p>
                                                        <p className="text-base text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                            {lead.memories || "—"}
                                                        </p>
                                                    </div>

                                                    {/* Message */}
                                                    {lead.message && (
                                                        <div className="bg-[#111827] rounded-lg p-4 border border-blue-100">
                                                            <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">Mensagem Adicional</p>
                                                            <p className="text-base text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                                {lead.message}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Recipient & Genre Info */}
                                                    <div className="bg-[#111827] rounded-lg p-4 border border-blue-100">
                                                        <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-3">Informações do Pedido</p>
                                                        <div className="grid grid-cols-2 gap-3 text-base">
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Para:</span>
                                                                <span className="font-medium text-slate-800">{lead.recipientName}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Relação:</span>
                                                                <span className="font-medium text-slate-800">
                                                                    {lead.recipient === "other" && lead.recipientRelationship
                                                                        ? lead.recipientRelationship
                                                                        : RELATIONSHIP_NAMES[lead.recipient as keyof typeof RELATIONSHIP_NAMES]?.pt || lead.recipient}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Gênero:</span>
                                                                <span className="font-medium text-slate-800">{GENRE_NAMES[lead.genre as keyof typeof GENRE_NAMES]?.pt || lead.genre}</span>
                                                            </div>
	                                                            <div className="flex justify-between">
	                                                                <span className="text-slate-500">Voz:</span>
	                                                                <span className="font-medium text-slate-800">
	                                                                    {normalizeVocals(lead.vocals) === "male" ? "Masculina" : normalizeVocals(lead.vocals) === "female" ? "Feminina" : "Qualquer"}
	                                                                </span>
	                                                            </div>
	                                                        </div>
	                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            )}

                            {/* Tab: Dados (Payment + Analytics + Technical) */}
                            <TabsContent value="dados" className="mt-0 space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Payment */}
                                    {isCurrentAdminSuperAdmin && (
                                        <InfoCard title="Pagamento" highlight>
                                            <DisplayField
                                                label="Valor Bruto"
                                                value={
                                                    lead.utmSource === "supabase-import" || lead.utmSource === "supabase-convertido"
                                                        ? "R$47.00"
                                                        : formatCurrency(lead.priceAtOrder, lead.currency)
                                                }
                                            />
                                            <DisplayField
                                                label="Taxa Stripe"
                                                value={
                                                    lead.stripeFee
                                                        ? `-${formatCurrency(lead.stripeFee, lead.currency)}`
                                                        : "—"
                                                }
                                                className="text-red-600"
                                            />
                                            <DisplayField
                                                label="Valor Líquido"
                                                value={formatCurrency(lead.stripeNetAmount, lead.currency)}
                                                className="text-green-600 font-bold"
                                            />
                                            <DisplayField
                                                label="ID Pagamento"
                                                value={lead.stripePaymentIntentId}
                                                mono
                                            />
                                            <DisplayField
                                                label="Pago em"
                                                value={
                                                    lead.paymentCompletedAt
                                                        ? formatInTimeZone(new Date(lead.paymentCompletedAt), "America/Sao_Paulo", "PPpp")
                                                        : "—"
                                                }
                                            />
                                        </InfoCard>
                                    )}

                                    {/* UTM & Referrer */}
                                    <InfoCard title="Origem do Tráfego">
                                        <DisplayField label="Fonte UTM" value={lead.utmSource} />
                                        <DisplayField label="Meio UTM" value={lead.utmMedium} />
                                        <DisplayField label="Campanha UTM" value={lead.utmCampaign} />
                                        <DisplayField label="Referência" value={lead.referrerDomain} />
                                        <DisplayField
                                            label="Página de Entrada"
                                            value={lead.landingPage}
                                            truncate
                                        />
                                    </InfoCard>

                                    {(lead.sessionId?.startsWith("supabase:") ||
                                        lead.supabasePaidAt ||
                                        lead.supabaseOrderStatus ||
                                        lead.supabaseOrderId ||
                                        lead.supabaseTransactionId) && (
                                            <InfoCard title="Supabase">
                                                <DisplayField
                                                    label="Pago no Supabase"
                                                    value={
                                                        lead.supabasePaidAt
                                                            ? formatInTimeZone(new Date(lead.supabasePaidAt), "America/Sao_Paulo", "PPpp")
                                                            : "Não"
                                                    }
                                                />
                                                <DisplayField label="Status Supabase" value={lead.supabaseOrderStatus} />
                                                <DisplayField label="Order ID Supabase" value={lead.supabaseOrderId} mono />
                                                <DisplayField label="Transaction ID Supabase" value={lead.supabaseTransactionId} mono />
                                            </InfoCard>
                                        )}

                                    {/* Session */}
                                    <InfoCard title="Sessão">
                                        <DisplayField
                                            label="Visualizações"
                                            value={lead.pageViewCount?.toString()}
                                        />
                                        <DisplayField
                                            label="Tempo no Site"
                                            value={formatDuration(lead.timeOnSiteMs)}
                                        />
                                        <DisplayField
                                            label="Duração Quiz"
                                            value={formatDuration(lead.quizDurationMs)}
                                        />
                                        <DisplayField label="FBC" value={lead.fbc} mono />
                                        <DisplayField label="FBP" value={lead.fbp} mono />
                                    </InfoCard>

                                    {/* Browser & Device */}
                                    <InfoCard title="Navegador">
                                        <DisplayField label="Nome" value={lead.browserName} />
                                        <DisplayField label="Versão" value={lead.browserVersion} />
                                        <DisplayField label="Idioma" value={lead.language} />
                                    </InfoCard>

                                    <InfoCard title="Dispositivo">
                                        <DisplayField
                                            label="Sistema"
                                            value={
                                                lead.osName
                                                    ? `${lead.osName} ${lead.osVersion || ""}`
                                                    : undefined
                                            }
                                        />
                                        <DisplayField label="Tipo" value={lead.deviceType} />
                                        <DisplayField
                                            label="Tela"
                                            value={
                                                lead.screenWidth
                                                    ? `${lead.screenWidth}x${lead.screenHeight}`
                                                    : undefined
                                            }
                                        />
                                    </InfoCard>

                                    {/* Network */}
                                    <InfoCard title="Rede">
                                        <DisplayField label="IP" value={lead.userIp} />
                                        <DisplayField label="Fuso Horário" value={lead.timezone} />
                                        <DisplayField
                                            label="ID Sessão"
                                            value={lead.sessionId}
                                            mono
                                            truncate
                                        />
                                    </InfoCard>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                )}

                {/* Floating Audio Player - persists across tabs */}
                {playingAudioUrl && (
                    <div className="fixed bottom-24 right-8 z-[9999] bg-white rounded-xl shadow-2xl border border-dark/10 p-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    const activePlayer = activeAudioRef.current?.current;
                                    if (!activePlayer) return;
                                    if (isAudioPlaying) {
                                        activePlayer.pause();
                                    } else {
                                        activePlayer.play();
                                    }
                                }}
                                className="h-10 w-10 rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 flex items-center justify-center"
                            >
                                {isAudioPlaying ? (
                                    <Pause className="h-5 w-5" />
                                ) : (
                                    <Play className="h-5 w-5 ml-0.5" />
                                )}
                            </button>
                            <div className="max-w-[200px]">
                                <p className="text-sm font-medium text-white truncate">{playingAudioTitle ?? "Música tocando"}</p>
                                <p className="text-xs text-charcoal/60">{isAudioPlaying ? "Tocando..." : "Pausado"}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                const activePlayer = activeAudioRef.current?.current;
                                if (activePlayer) {
                                    activePlayer.pause();
                                }
                                activeAudioRef.current = null;
                                setIsAudioPlaying(false);
                                setPlayingAudioUrl(null);
                                setPlayingAudioTitle(null);
                            }}
                            className="h-8 w-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-charcoal/70 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* Fixed Footer with Actions */}
                <div className="flex-shrink-0 border-t pt-4 mt-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Label className="text-sm text-slate-500">Status:</Label>
                        {isEditing ? (
                            <Select
                                value={formData.status}
                                onValueChange={(val) =>
                                    setFormData((prev) => ({ ...prev, status: val as Lead["status"] }))
                                }
                            >
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PENDING">PENDING</SelectItem>
                                    <SelectItem value="PAID">PAID</SelectItem>
                                    <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                                    <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                                    <SelectItem value="REVISION">REVISION</SelectItem>
                                    <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                                    <SelectItem value="REFUNDED">REFUNDED</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            <Badge className={getStatusColor(formData.status)}>
                                {formData.status}
                            </Badge>
                        )}
                    </div>

                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleCancel}
                                    disabled={updateOrder.isPending}
                                >
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={updateOrder.isPending}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {updateOrder.isPending ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-2" />
                                    )}
                                    Save Changes
                                </Button>
                            </>
                        ) : (
                            <>
                                {formData.status === "PENDING" && (
                                    <Button
                                        variant="outline"
                                        onClick={handleCopyPaymentLink}
                                        className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                                    >
                                        <Link className="h-4 w-4 mr-2" />
                                        Copy Payment Link
                                    </Button>
                                )}
                                {formData.status === "PAID" && lead.lyricsStatus === "completed" && !lead.songFileUrl && (
                                    <Button
                                        variant="outline"
                                        onClick={handleGenerateSong}
                                        disabled={isGeneratingSong}
                                        className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300"
                                    >
                                        {isGeneratingSong ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Wand2 className="h-4 w-4 mr-2" />
                                        )}
                                        {isGeneratingSong ? "Gerando..." : "Gerar Música"}
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => setIsEditing(true)}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={handleDelete}
                                    disabled={deleteOrder.isPending}
                                >
                                    {deleteOrder.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// --- HELPER COMPONENTS ---

function InfoCard({
    title,
    children,
    highlight,
}: {
    title: string;
    children: React.ReactNode;
    highlight?: boolean;
}) {
    return (
        <div
            className={`p-5 rounded-lg border ${highlight ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
                }`}
        >
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                {title}
            </h4>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function Field({
    label,
    value,
    isEditing,
    onChange,
    options,
    optionLabels,
    allowCustomOption,
    customOptionLabel,
    customInputPlaceholder,
}: {
    label: string;
    value: string | null | undefined;
    isEditing: boolean;
    onChange: (val: string) => void;
    options?: string[];
    optionLabels?: Record<string, string>;
    allowCustomOption?: boolean;
    customOptionLabel?: string;
    customInputPlaceholder?: string;
}) {
    const CUSTOM_OPTION_VALUE = "__custom__";
    const hasOptions = Boolean(options && options.length > 0);
    const normalizedValue = value || "";
    const isUnknownOption = hasOptions ? !options!.includes(normalizedValue) : false;
    const [isCustomMode, setIsCustomMode] = useState(Boolean(allowCustomOption && normalizedValue && isUnknownOption));

    useEffect(() => {
        if (!allowCustomOption || !hasOptions) return;
        const nextValue = value || "";
        if (!nextValue) return;
        setIsCustomMode(!options!.includes(nextValue));
    }, [allowCustomOption, hasOptions, options, value]);

    if (isEditing) {
        return (
            <div className="space-y-1">
                <Label className="text-sm text-slate-500">{label}</Label>
                {options ? (
                    allowCustomOption ? (
                        <div className="space-y-2">
                            <Select
                                value={isCustomMode ? CUSTOM_OPTION_VALUE : normalizedValue}
                                onValueChange={(nextValue) => {
                                    if (nextValue === CUSTOM_OPTION_VALUE) {
                                        setIsCustomMode(true);
                                        if (!normalizedValue || options.includes(normalizedValue)) {
                                            onChange("");
                                        }
                                        return;
                                    }

                                    setIsCustomMode(false);
                                    onChange(nextValue);
                                }}
                            >
                                <SelectTrigger className="h-10 bg-porcelain text-base">
                                    <SelectValue placeholder={`Select ${label}`} />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {options.map((opt) => (
                                        <SelectItem key={opt} value={opt} className="text-base">
                                            {optionLabels?.[opt] || opt}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value={CUSTOM_OPTION_VALUE} className="text-base">
                                        {customOptionLabel || "Outro (personalizado)"}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            {isCustomMode && (
                                <Input
                                    value={normalizedValue}
                                    onChange={(e) => onChange(e.target.value)}
                                    className="h-10 bg-porcelain text-base"
                                    placeholder={customInputPlaceholder || `Digite um ${label.toLowerCase()} personalizado`}
                                />
                            )}
                        </div>
                    ) : (
                        <Select value={value || ""} onValueChange={onChange}>
                            <SelectTrigger className="h-10 bg-porcelain text-base">
                                <SelectValue placeholder={`Select ${label}`} />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                {options.map((opt) => (
                                    <SelectItem key={opt} value={opt} className="text-base">
                                        {optionLabels?.[opt] || opt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )
                ) : (
                    <Input
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value)}
                        className="h-10 bg-porcelain text-base"
                    />
                )}
            </div>
        );
    }

    return <DisplayField label={label} value={optionLabels?.[value || ""] || value} />;
}

function DisplayField({
    label,
    value,
    mono,
    truncate,
    className,
}: {
    label: string;
    value: string | null | undefined;
    mono?: boolean;
    truncate?: boolean;
    className?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 w-full overflow-hidden">
            <span className="text-sm text-slate-500 flex-shrink-0 whitespace-nowrap">{label}</span>
            <span
                className={`text-base text-right min-w-0 block flex-1 ${mono ? "font-mono text-sm" : ""} ${truncate ? "truncate" : ""
                    } ${className || "text-slate-800"}`}
                title={truncate && value ? value : undefined}
            >
                {value || "—"}
            </span>
        </div>
    );
}

function ContentCard({
    title,
    value,
    isEditing,
    onChange,
    optional,
}: {
    title: string;
    value: string | null | undefined;
    isEditing: boolean;
    onChange: (val: string) => void;
    optional?: boolean;
}) {
    if (isEditing) {
        return (
            <div className="p-5 rounded-lg border bg-[#111827]">
                <Label className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                    {title} {optional && <span className="text-charcoal/60">(optional)</span>}
                </Label>
                <Textarea
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    className="min-h-[150px] mt-2 text-base"
                    placeholder={optional ? "Optional..." : "Required..."}
                />
            </div>
        );
    }

    if (!value && optional) return null;

    return (
        <div className="p-5 rounded-lg border bg-slate-50">
            <Label className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                {title}
            </Label>
            <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap">
                {value || "—"}
            </p>
        </div>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case "PAID":
            return "bg-green-100 text-green-800 border-green-200";
        case "COMPLETED":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "PENDING":
            return "bg-amber-100 text-amber-800 border-amber-200";
        case "IN_PROGRESS":
            return "bg-purple-100 text-purple-800 border-purple-200";
        case "REVISION":
            return "bg-pink-100 text-pink-800 border-pink-200";
        case "CANCELLED":
            return "bg-red-100 text-red-800 border-red-200";
        case "REFUNDED":
            return "bg-orange-100 text-orange-800 border-orange-200";
        default:
            return "bg-slate-100 text-slate-700";
    }
}

// --- LYRICS DISPLAY WITH DIFF HIGHLIGHTS ---
function LyricsDisplayWithDiff({
    originalLyrics,
    correctedLyrics,
    displayLyrics,
    viewMode,
    searchTerm,
}: {
    originalLyrics: string;
    correctedLyrics: string | null;
    displayLyrics?: string | null;
    viewMode: "corrected" | "original" | "display";
    searchTerm: string;
}) {
    // Display mode - show displayLyrics as plain text (no diff)
    if (viewMode === "display" && displayLyrics) {
        return (
            <pre className="whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-left text-slate-700 sm:text-center sm:text-lg">
                {searchTerm ? (
                    displayLyrics.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === searchTerm.toLowerCase() ? (
                            <mark key={i} className="bg-yellow-300 text-slate-900 rounded px-0.5">{part}</mark>
                        ) : (
                            <span key={i}>{part}</span>
                        )
                    )
                ) : (
                    displayLyrics
                )}
            </pre>
        );
    }

    // If no corrected lyrics, just show original with search highlight
    if (!correctedLyrics) {
        return (
            <pre className="whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-left text-slate-700 sm:text-center sm:text-lg">
                {searchTerm ? (
                    originalLyrics.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === searchTerm.toLowerCase() ? (
                            <mark key={i} className="bg-yellow-300 text-slate-900 rounded px-0.5">{part}</mark>
                        ) : (
                            <span key={i}>{part}</span>
                        )
                    )
                ) : (
                    originalLyrics
                )}
            </pre>
        );
    }

    // Compute line-by-line diff
    const origLines = originalLyrics.split("\n");
    const corrLines = correctedLyrics.split("\n");
    const maxLines = Math.max(origLines.length, corrLines.length);

    // Highlight words that changed within a line
    const highlightChanges = (original: string, corrected: string, side: "original" | "corrected") => {
        if (original === corrected) {
            return <span>{side === "original" ? original : corrected}</span>;
        }

        const origWords = original.split(/(\s+)/);
        const corrWords = corrected.split(/(\s+)/);

        if (side === "original") {
            return (
                <>
                    {origWords.map((word, idx) => {
                        if (/^\s+$/.test(word)) return <span key={idx}>{word}</span>;
                        const existsInCorrected = corrWords.includes(word);
                        if (!existsInCorrected) {
                            return (
                                <span key={idx} className="bg-red-200 text-red-800 px-0.5 rounded line-through decoration-2">
                                    {word}
                                </span>
                            );
                        }
                        return <span key={idx}>{word}</span>;
                    })}
                </>
            );
        } else {
            return (
                <>
                    {corrWords.map((word, idx) => {
                        if (/^\s+$/.test(word)) return <span key={idx}>{word}</span>;
                        const existsInOriginal = origWords.includes(word);
                        if (!existsInOriginal) {
                            return (
                                <span key={idx} className="bg-green-200 text-green-800 px-0.5 rounded font-semibold">
                                    {word}
                                </span>
                            );
                        }
                        return <span key={idx}>{word}</span>;
                    })}
                </>
            );
        }
    };

    const lines: Array<{ original: string; corrected: string; isChanged: boolean }> = [];
    for (let i = 0; i < maxLines; i++) {
        const origLine = origLines[i] ?? "";
        const corrLine = corrLines[i] ?? "";
        lines.push({
            original: origLine,
            corrected: corrLine,
            isChanged: origLine !== corrLine,
        });
    }

    return (
        <pre className="whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-left text-slate-700 sm:text-center sm:text-lg">
            {lines.map((line, idx) => {
                const isChanged = line.isChanged;
                const displayText = viewMode === "corrected" ? line.corrected : line.original;

                if (!isChanged) {
                    // No change - just display, with search highlight if needed
                    if (searchTerm) {
                        return (
                            <div key={idx}>
                                {displayText.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                                        <mark key={i} className="bg-yellow-300 text-slate-900 rounded px-0.5">{part}</mark>
                                    ) : (
                                        <span key={i}>{part}</span>
                                    )
                                )}
                            </div>
                        );
                    }
                    return <div key={idx}>{displayText || "\u00A0"}</div>;
                }

                // Changed line - show with highlights
                return (
                    <div key={idx} className={viewMode === "corrected" ? "rounded bg-green-50 px-1 sm:-mx-2 sm:px-2" : "rounded bg-red-50 px-1 sm:-mx-2 sm:px-2"}>
                        {highlightChanges(line.original, line.corrected, viewMode as "original" | "corrected")}
                    </div>
                );
            })}
        </pre>
    );
}

// --- LYRICS TAB COMPONENT ---
function LyricsTab({ orderId }: { orderId: string }) {
    const utils = api.useUtils();
    const [isEditingLyrics, setIsEditingLyrics] = useState(false);
    const [editedLyrics, setEditedLyrics] = useState("");
    const [editedMusicPrompt, setEditedMusicPrompt] = useState("");
    const [lyricsSearch, setLyricsSearch] = useState("");
    const [lyricsViewMode, setLyricsViewMode] = useState<"corrected" | "original" | "display">("corrected");
    const [editingVersion, setEditingVersion] = useState<"original" | "corrected" | "display" | null>(null);
    const [showVersionPicker, setShowVersionPicker] = useState(false);

    // Fetch lyrics data
	    const { data: lyricsData, isLoading, refetch } = api.admin.getLyrics.useQuery(
	        { orderId },
	        { refetchOnWindowFocus: false }
	    );

	    const normalizedLyricsVocals = useMemo(
	        () => normalizeVocals(lyricsData?.vocals),
	        [lyricsData?.vocals]
	    );

	    // Generate lyrics mutation (synchronous)
	    const generateLyrics = api.admin.generateLyrics.useMutation({
	        onSuccess: () => {
	            void refetch();
	            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Lyrics Generated", {
                description: "Song lyrics have been generated successfully.",
            });
        },
        onError: (error) => {
            void refetch();
            toast.error("Generation Failed", {
                description: error.message,
            });
        },
    });

    // Queue lyrics mutation (async via worker)
    const queueLyrics = api.admin.queueLyricsGeneration.useMutation({
        onSuccess: (data) => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Queued to Worker", {
                description: data.message,
            });
        },
        onError: (error) => {
            toast.error("Queue Failed", {
                description: error.message,
            });
        },
    });

    // Update lyrics mutation
    const updateLyrics = api.admin.updateLyrics.useMutation({
        onSuccess: () => {
            void refetch();
            setIsEditingLyrics(false);
            toast.success("Lyrics Updated", {
                description: "Song lyrics have been saved.",
            });
        },
        onError: (error) => {
            toast.error("Save Failed", {
                description: error.message,
            });
        },
    });

    // Format lyrics mutation (AI organizes formatting only)
    const formatLyrics = api.admin.formatLyrics.useMutation({
        onSuccess: (data) => {
            // Update the lyrics with the formatted version
            updateLyrics.mutate({ orderId, lyrics: data.formattedLyrics });
            toast.success("Letra organizada!", {
                description: "A formatação da letra foi organizada pela IA.",
            });
        },
        onError: (error) => {
            toast.error("Falha ao organizar", {
                description: error.message,
            });
        },
    });

    const handleFormatLyrics = () => {
        if (!lyricsData?.lyrics) return;
        formatLyrics.mutate({ lyrics: lyricsData.lyrics });
    };

    // Apply pronunciation corrections from dictionary to lyrics
    const applyPronunciation = api.admin.applyPronunciationToLyrics.useMutation({
        onSuccess: (data) => {
            if (data.applied === 0) {
                toast.info("Nenhuma correção encontrada", {
                    description: "A letra já está com a pronúncia correta.",
                });
                return;
            }
            void refetch();
            toast.success(`Pronúncia corrigida!`, {
                description: `${data.applied} correção(ões) aplicada(s) na letra.`,
            });
        },
        onError: (error) => {
            toast.error("Falha ao aplicar pronúncia", {
                description: error.message,
            });
        },
    });

    const handleApplyPronunciation = () => {
        if (!lyricsData?.lyrics) return;
        applyPronunciation.mutate({ orderId });
    };

    const handleGenerate = () => {
        generateLyrics.mutate({ orderId });
    };

    const handleQueue = () => {
        queueLyrics.mutate({ orderId });
    };

    const handleStartEdit = () => {
        // If multiple versions exist, show version picker dialog
        if (lyricsData?.lyrics && (lyricsData?.correctedLyrics || lyricsData?.displayLyrics)) {
            setShowVersionPicker(true);
        } else {
            // Only original exists, go directly to editing
            setEditedLyrics(lyricsData?.lyrics || "");
            setEditedMusicPrompt(lyricsData?.musicPrompt || "");
            setEditingVersion("original");
            setIsEditingLyrics(true);
        }
    };

    const handleVersionSelected = (version: "original" | "corrected" | "display") => {
        const lyricsToEdit = version === "original"
            ? lyricsData?.lyrics || ""
            : version === "display"
            ? lyricsData?.displayLyrics || lyricsData?.correctedLyrics || ""
            : lyricsData?.correctedLyrics || "";
        setEditedLyrics(lyricsToEdit);
        setEditedMusicPrompt(lyricsData?.musicPrompt || "");
        setEditingVersion(version);
        setShowVersionPicker(false);
        setIsEditingLyrics(true);
    };

    const handleSaveLyrics = () => {
        updateLyrics.mutate({
            orderId,
            lyrics: editingVersion === "original" ? editedLyrics : undefined,
            correctedLyrics: editingVersion === "corrected" ? editedLyrics : undefined,
            displayLyrics: editingVersion === "display" ? editedLyrics : undefined,
            musicPrompt: editingVersion !== "display" ? editedMusicPrompt : undefined,
        });
    };

    const handleCancelEdit = () => {
        setIsEditingLyrics(false);
        setEditedLyrics("");
        setEditedMusicPrompt("");
        setEditingVersion(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-charcoal/60" />
            </div>
        );
    }

    const status = lyricsData?.lyricsStatus || "pending";
    const hasLyrics = !!lyricsData?.lyrics;
    const isGenerating = status === "generating" || generateLyrics.isPending;
    const isQueueing = queueLyrics.isPending;
    const isFromParent = !!(lyricsData as { isFromParent?: boolean } | undefined)?.isFromParent;

    return (
        <div className="space-y-6">
            {/* Version Picker Dialog */}
            <Dialog open={showVersionPicker} onOpenChange={setShowVersionPicker}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Qual versão deseja editar?</DialogTitle>
                        <DialogDescription>
                            Este pedido possui múltiplas versões da letra. Escolha qual deseja editar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => handleVersionSelected("original")}
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            Letra Original
                        </Button>
                        <Button
                            onClick={() => handleVersionSelected("corrected")}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Letra Revisada
                        </Button>
                        {lyricsData?.displayLyrics && (
                            <Button
                                variant="outline"
                                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                onClick={() => handleVersionSelected("display")}
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                PDF/Email
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Status Banner */}
            <div className={`p-4 rounded-lg border flex items-center justify-between ${isFromParent ? "bg-violet-50 border-violet-200" :
                    status === "completed" ? "bg-green-50 border-green-200" :
                        status === "failed" ? "bg-red-50 border-red-200" :
                            status === "generating" ? "bg-blue-50 border-blue-200" :
                                "bg-amber-50 border-amber-200"
                }`}>
                <div className="flex items-center gap-3">
                    {isFromParent && <FileText className="h-5 w-5 text-violet-600" />}
                    {!isFromParent && status === "completed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    {!isFromParent && status === "failed" && <AlertCircle className="h-5 w-5 text-red-600" />}
                    {!isFromParent && status === "generating" && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                    {!isFromParent && status === "pending" && <Clock className="h-5 w-5 text-amber-600" />}
                    <div>
                        <p className="font-semibold text-sm">
                            {isFromParent && "Letra do Pedido Original"}
                            {!isFromParent && status === "completed" && "Lyrics Generated"}
                            {!isFromParent && status === "failed" && "Generation Failed"}
                            {!isFromParent && status === "generating" && "Generating Lyrics..."}
                            {!isFromParent && status === "pending" && "Awaiting Generation"}
                        </p>
                        {isFromParent && (
                            <p className="text-xs text-violet-600">
                                Esta letra vem do pedido pai
                            </p>
                        )}
                        {!isFromParent && lyricsData?.lyricsGeneratedAt && status === "completed" && (
                            <p className="text-xs text-slate-500">
                                Generated on {formatInTimeZone(new Date(lyricsData.lyricsGeneratedAt), "America/Sao_Paulo", "PPpp")}
                            </p>
                        )}
                        {!isFromParent && lyricsData?.lyricsError && status === "failed" && (
                            <p className="text-xs text-red-600 mt-1">
                                {lyricsData.lyricsError}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    {!isFromParent && !isEditingLyrics && (
                        <>
                            <Button
                                size="sm"
                                variant={hasLyrics ? "outline" : "default"}
                                onClick={handleGenerate}
                                disabled={isGenerating || isQueueing}
                                className={hasLyrics ? "" : "bg-blue-600 hover:bg-blue-700"}
                            >
                                {isGenerating ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                {hasLyrics ? "Regenerate" : "Generate"}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleQueue}
                                disabled={isGenerating || isQueueing}
                                title="Queue to worker for async generation"
                            >
                                {isQueueing ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4 mr-2" />
                                )}
                                Queue
                            </Button>
                            {hasLyrics && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleStartEdit}
                                >
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                            )}
                        </>
                    )}
                    {isFromParent && hasLyrics && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                void navigator.clipboard.writeText(lyricsData?.lyrics || "");
                                toast.success("Letra copiada!");
                            }}
                            className="border-violet-300 text-violet-700 hover:bg-violet-100"
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar
                        </Button>
                    )}
                </div>
            </div>

            {/* Song Info Summary - hide for streaming upsell */}
            {lyricsData && !isFromParent && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Recipient</p>
                        <p className="font-medium text-sm mt-1">{lyricsData.recipientName}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Relationship</p>
                        <p className="font-medium text-sm mt-1">
                            {lyricsData.recipient === "other" && lyricsData.recipientRelationship
                                ? lyricsData.recipientRelationship
                                : RELATIONSHIP_NAMES[lyricsData.recipient]?.[(lyricsData.locale as "en" | "pt" | "es" | "fr" | "it") || "en"] || lyricsData.recipient}
                        </p>
                    </div>
                    <div
                        className="p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => {
                            void navigator.clipboard.writeText(lyricsData.genre);
                            toast.success("Genre copiado!", { description: lyricsData.genre });
                        }}
                        title="Clique para copiar"
                    >
                        <p className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            Genre
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                        <p className="font-medium text-sm mt-1">
                            {GENRE_NAMES[lyricsData.genre]?.[(lyricsData.locale as "en" | "pt" | "es" | "fr" | "it") || "en"] || lyricsData.genre}
                        </p>
                    </div>
	                    <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
	                        <p className="text-xs text-sky-600 uppercase tracking-wider">Vocals</p>
	                        <p className="font-medium text-sm mt-1">
	                            {normalizedLyricsVocals === "female" ? "🎤 Female Voice" :
	                                normalizedLyricsVocals === "male" ? "🎤 Male Voice" :
	                                    "🎤 Any Voice"}
	                        </p>
	                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Language</p>
                        <p className="font-medium text-sm mt-1">
                            {lyricsData.locale === "pt" ? "Português" :
                                lyricsData.locale === "es" ? "Español" :
                                    lyricsData.locale === "fr" ? "Français" :
                                        lyricsData.locale === "it" ? "Italiano" : "English"}
                        </p>
                    </div>
                </div>
            )}

            {/* Lyrics Content */}
            {isEditingLyrics ? (
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {editingVersion === "corrected" ? "Letra Revisada" : editingVersion === "display" ? "Letra PDF/Email" : "Letra Original"}
                            </label>
                            <Badge variant={editingVersion === "corrected" ? "default" : "secondary"} className={`text-xs ${editingVersion === "display" ? "bg-purple-100 text-purple-700" : ""}`}>
                                {editingVersion === "corrected" ? "Revisada" : editingVersion === "display" ? "PDF/Email" : "Original"}
                            </Badge>
                        </div>
                        <Textarea
                            value={editedLyrics}
                            onChange={(e) => setEditedLyrics(e.target.value)}
                            className="min-h-[300px] font-mono text-sm"
                            placeholder="Enter song lyrics..."
                        />
                    </div>
                    {editingVersion !== "display" && (
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                            Music Production Prompt (for Suno AI)
                        </label>
                        <Textarea
                            value={editedMusicPrompt}
                            onChange={(e) => setEditedMusicPrompt(e.target.value)}
                            className="min-h-[100px] font-mono text-sm"
                            placeholder="Music production prompt describing genre, BPM, instruments, mood..."
                        />
                    </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={handleCancelEdit}
                            disabled={updateLyrics.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveLyrics}
                            disabled={updateLyrics.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {updateLyrics.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                </div>
            ) : hasLyrics ? (
                <div className="flex flex-col gap-4 xl:flex-row">
                    {/* Lyrics Section */}
                    <div className="min-w-0 flex-1 rounded-lg border bg-[#111827] p-4 sm:p-6">
                        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Music className="h-5 w-5 text-violet-600" />
                                <h4 className="font-bold text-slate-800">Generated Lyrics</h4>
                                {lyricsData?.correctedLyrics && (
                                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 border border-green-200">
                                        Correção disponível
                                    </span>
                                )}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {/* View mode toggle - only show when corrected lyrics exist */}
                                {lyricsData?.correctedLyrics && (
                                    <div className="flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5">
                                        <button
                                            onClick={() => setLyricsViewMode("corrected")}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${lyricsViewMode === "corrected"
                                                    ? "bg-porcelain text-green-700 shadow-sm"
                                                    : "text-slate-500 hover:text-slate-700"
                                                }`}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            Corrigida
                                        </button>
                                        {lyricsData?.displayLyrics && (
                                            <button
                                                onClick={() => setLyricsViewMode("display")}
                                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${lyricsViewMode === "display"
                                                        ? "bg-porcelain text-purple-700 shadow-sm"
                                                        : "text-slate-500 hover:text-slate-700"
                                                    }`}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                PDF/Email
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setLyricsViewMode("original")}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${lyricsViewMode === "original"
                                                    ? "bg-porcelain text-red-700 shadow-sm"
                                                    : "text-slate-500 hover:text-slate-700"
                                                }`}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            Original
                                        </button>
                                    </div>
                                )}
                                {/* Search input */}
                                <div className="relative w-full sm:w-56">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal/60" />
                                    <input
                                        type="text"
                                        value={lyricsSearch}
                                        onChange={(e) => setLyricsSearch(e.target.value)}
                                        placeholder="Buscar na letra..."
                                        className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-8 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    />
                                    {lyricsSearch && (
                                        <button
                                            onClick={() => setLyricsSearch("")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-charcoal/60 hover:text-slate-600"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                {lyricsSearch && (
                                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                                        {(lyricsData?.lyrics?.toLowerCase().split(lyricsSearch.toLowerCase()).length || 1) - 1} encontrado(s)
                                    </span>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleFormatLyrics}
                                    disabled={formatLyrics.isPending || updateLyrics.isPending}
                                    className="h-8 px-2 text-xs"
                                    title="Organizar formatação da letra com IA (não altera conteúdo)"
                                >
                                    {formatLyrics.isPending || updateLyrics.isPending ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                        <Wand2 className="h-3.5 w-3.5 sm:mr-1" />
                                    )}
                                    <span className="hidden sm:inline">Organizar</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleApplyPronunciation}
                                    disabled={applyPronunciation.isPending || !lyricsData?.lyrics}
                                    className="h-8 px-2 text-xs"
                                    title="Aplicar correções de pronúncia do dicionário na letra"
                                >
                                    {applyPronunciation.isPending ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                        <SpellCheck className="h-3.5 w-3.5 sm:mr-1" />
                                    )}
                                    <span className="hidden sm:inline">Pronúncia</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const textToCopy = lyricsViewMode === "corrected" && lyricsData?.correctedLyrics
                                            ? lyricsData.correctedLyrics
                                            : lyricsViewMode === "display" && lyricsData?.displayLyrics
                                                ? lyricsData.displayLyrics
                                                : lyricsData?.lyrics || "";
                                        void navigator.clipboard.writeText(textToCopy);
                                        const label = lyricsViewMode === "corrected" && lyricsData?.correctedLyrics
                                            ? "Letra corrigida copiada!"
                                            : lyricsViewMode === "display" && lyricsData?.displayLyrics
                                                ? "Letra display (PDF) copiada!"
                                                : "Letra copiada!";
                                        toast.success(label, { description: "Copiada para a área de transferência." });
                                    }}
                                    className={`h-8 px-2 text-xs ${lyricsViewMode === "corrected" && lyricsData?.correctedLyrics ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100" : lyricsViewMode === "display" && lyricsData?.displayLyrics ? "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100" : ""}`}
                                >
                                    <Copy className="h-3.5 w-3.5 sm:mr-1" />
                                    <span className="hidden sm:inline">
                                        {lyricsViewMode === "corrected" && lyricsData?.correctedLyrics ? "Copiar Corrigida" : lyricsViewMode === "display" ? "Copiar PDF/Email" : "Copiar Letra"}
                                    </span>
                                </Button>
                            </div>
                        </div>
                        {/* Lyrics display with diff highlights */}
                        <LyricsDisplayWithDiff
                            originalLyrics={lyricsData?.lyrics || ""}
                            correctedLyrics={lyricsData?.correctedLyrics || null}
                            displayLyrics={lyricsData?.displayLyrics || null}
                            viewMode={lyricsViewMode}
                            searchTerm={lyricsSearch}
                        />
                    </div>

                    {/* Music Production Prompt */}
                    {lyricsData?.musicPrompt && (
                        <div className="w-full shrink-0 self-start rounded-lg border bg-gradient-to-b from-violet-50 to-purple-50 p-4 xl:w-[320px] 2xl:w-[20%]">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-base">🎵</span>
                                    <h4 className="font-bold text-slate-800 text-sm">Music Prompt</h4>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(lyricsData?.musicPrompt || "");
                                        toast.success("Prompt copiado!", { description: "O prompt de música foi copiado para a área de transferência." });
                                    }}
                                    className="h-7 px-2 text-xs"
                                >
                                    <Copy className="h-3 w-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Copiar</span>
                                </Button>
                            </div>
                            <p className="text-xs text-slate-500 mb-2">(for Suno AI)</p>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                {lyricsData.musicPrompt}
                            </p>

                            {/* Audio Players */}
                            {(lyricsData.songFileUrl || lyricsData.songFileUrl2) && (
                                <div className="mt-4 pt-4 border-t border-violet-200 space-y-3">
                                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Áudios</p>
                                    {lyricsData.songFileUrl && (
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500">Opção 1</p>
                                            <AudioPlayer
                                                src={lyricsData.songFileUrl}
                                                title={`${lyricsData.recipientName} - Opção 1`}
                                                showDownload={true}
                                                showSpeedControl={true}
                                                variant="compact"
                                            />
                                        </div>
                                    )}
                                    {lyricsData.songFileUrl2 && (
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500">Opção 2</p>
                                            <AudioPlayer
                                                src={lyricsData.songFileUrl2}
                                                title={`${lyricsData.recipientName} - Opção 2`}
                                                showDownload={true}
                                                showSpeedControl={true}
                                                variant="compact"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-12 rounded-lg border-2 border-dashed border-slate-200 text-center">
                    <Music className="h-12 w-12 text-charcoal/70 mx-auto mb-4" />
                    <p className="text-slate-500">No lyrics generated yet</p>
                    <p className="text-sm text-charcoal/60 mt-1">
                        Click "Generate Lyrics" to create personalized song lyrics
                    </p>
                </div>
            )}

            {/* Debug: Show prompt if available */}
            {lyricsData?.lyricsPrompt && (
                <details className="mt-6">
                    <summary className="text-xs text-charcoal/60 cursor-pointer hover:text-slate-600">
                        View Generation Prompt (Debug)
                    </summary>
                    <pre className="mt-2 p-4 bg-slate-100 rounded text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap">
                        {lyricsData.lyricsPrompt}
                    </pre>
                </details>
            )}
        </div>
    );
}

// --- DELIVERY TAB COMPONENT ---
interface DeliveryTabProps {
    orderId: string;
    onAudioStateChange?: AudioStateChangeHandler;
}

function DeliveryTab({ orderId, onAudioStateChange }: DeliveryTabProps) {
    const utils = api.useUtils();
    const [spotifyUrlDraft, setSpotifyUrlDraft] = useState("");
    const [streamingSongNameDraft, setStreamingSongNameDraft] = useState("");
    const [preferredOptionDurations, setPreferredOptionDurations] = useState<{ option1: string | null; option2: string | null }>({
        option1: null,
        option2: null,
    });

    // Streaming VIP automation states
    const [songNameSuggestions, setSongNameSuggestions] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        const saved = localStorage.getItem(`streaming-vip-names-${orderId}`);
        return saved ? JSON.parse(saved) as string[] : [];
    });
    const [coverPrompts, setCoverPrompts] = useState<{ cartoon: string; photo?: string; photoImproved?: string } | null>(() => {
        if (typeof window === "undefined") return null;
        const saved = localStorage.getItem(`streaming-vip-cover-${orderId}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as { cartoon?: string; photo?: string; photoImproved?: string };
                if (parsed.cartoon && parsed.cartoon.length > 10) {
                    return { cartoon: parsed.cartoon, photo: parsed.photo, photoImproved: parsed.photoImproved };
                }
                localStorage.removeItem(`streaming-vip-cover-${orderId}`);
            } catch {
                localStorage.removeItem(`streaming-vip-cover-${orderId}`);
            }
        }
        return null;
    });
    const [coverCustomPrompt, setCoverCustomPrompt] = useState<string>(() => {
        if (typeof window === "undefined") return "";
        return localStorage.getItem(`streaming-vip-custom-prompt-${orderId}`) ?? "";
    });
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);
    const [copiedPromptType, setCopiedPromptType] = useState<"cartoon" | "photo" | "photoImproved" | null>(null);
    const [generatedCovers, setGeneratedCovers] = useState<Partial<Record<"cartoon" | "photo" | "photoImproved", string>>>(() => {
        if (typeof window === "undefined") return {};
        const saved = localStorage.getItem(`streaming-vip-gen-covers-${orderId}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as Record<string, string>;
                return {
                    cartoon: parsed.cartoon,
                    photo: parsed.photo,
                    photoImproved: parsed.photoImproved,
                };
            }
            catch { return {}; }
        }
        return {};
    });
    const [uploadingCoverType, setUploadingCoverType] = useState<"cartoon" | "photo" | "photoImproved" | null>(null);
    const [dragOverCoverType, setDragOverCoverType] = useState<"cartoon" | "photo" | "photoImproved" | null>(null);

    // Song replace states (show upload without deleting current song)
    // "prev-1" / "prev-2" = replacing in the "versão anterior" section
    const [replacingSlot, setReplacingSlot] = useState<Set<string>>(new Set());

    // Cover upload states
    const [isUploadingCover, setIsUploadingCover] = useState(false);
    const [isDeletingCover, setIsDeletingCover] = useState(false);
    const [isDragOverCover, setIsDragOverCover] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);

    // Honoree photo upload states
    const [isUploadingHonoreePhoto, setIsUploadingHonoreePhoto] = useState(false);
    const [isDeletingHonoreePhoto, setIsDeletingHonoreePhoto] = useState(false);
    const [isDragOverHonoreePhoto, setIsDragOverHonoreePhoto] = useState(false);
    const honoreePhotoInputRef = useRef<HTMLInputElement>(null);

    // Lightbox for honoree photo
    const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);

    // Fetch delivery info
    const { data: deliveryData, isLoading, refetch } = api.admin.getSongDeliveryInfo.useQuery(
        { orderId },
        { refetchOnWindowFocus: false }
    );

    useEffect(() => {
        if (deliveryData?.spotifyUrl !== undefined) {
            setSpotifyUrlDraft(deliveryData.spotifyUrl || "");
        }
        if (deliveryData?.streamingSongName !== undefined) {
            setStreamingSongNameDraft(deliveryData.streamingSongName || "");
        }
    }, [deliveryData?.spotifyUrl, deliveryData?.streamingSongName]);

    useEffect(() => {
        const option1Url = deliveryData?.parentOrder?.songFileUrl;
        const option2Url = deliveryData?.parentOrder?.songFileUrl2;
        let isCancelled = false;

        setPreferredOptionDurations({
            option1: null,
            option2: null,
        });

        if (!option1Url && !option2Url) return;

        void (async () => {
            const [option1Duration, option2Duration] = await Promise.all([
                option1Url ? getAudioDurationLabel(option1Url) : Promise.resolve(null),
                option2Url ? getAudioDurationLabel(option2Url) : Promise.resolve(null),
            ]);

            if (isCancelled) return;
            setPreferredOptionDurations({
                option1: option1Duration,
                option2: option2Duration,
            });
        })();

        return () => {
            isCancelled = true;
        };
    }, [deliveryData?.parentOrder?.songFileUrl, deliveryData?.parentOrder?.songFileUrl2]);

    const updateStreamingVipUrl = api.admin.updateStreamingVipUrl.useMutation({
        onSuccess: () => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Dados atualizados!", {
                description: "Os dados do Streaming VIP foram salvos com sucesso.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao salvar dados", {
                description: error.message,
            });
        },
    });

    const handleOpenSpotifySearch = useCallback((songName: string) => {
        if (!songName.trim()) {
            toast.error("Nome da música não definido");
            return;
        }
        // Copy search term with artist to clipboard
        const searchTerm = `${songName} ApolloSong.com`;
        void navigator.clipboard.writeText(searchTerm);
        toast.success("Termo copiado!", {
            description: `"${searchTerm}" — Cole na busca do Spotify (Ctrl+V)`,
        });
        // Open Spotify search page
        window.open("https://open.spotify.com/search", "_blank");
    }, []);

    const updatePreferredSongVersion = api.admin.updateOrder.useMutation({
        onSuccess: () => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Versão preferida atualizada!", {
                description: "A versão preferida da música foi definida com sucesso.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao atualizar versão", {
                description: error.message,
            });
        },
    });

    // Toggle cover approval mutation
    const toggleCoverApproval = api.admin.toggleCoverApproval.useMutation({
        onSuccess: (data) => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success(data.approved ? "Capa aprovada!" : "Aprovação removida");
        },
        onError: (error) => {
            toast.error("Erro ao atualizar aprovação", {
                description: error.message,
            });
        },
    });

    // Mark as published on DistroKid mutation
    const markAsPublished = api.admin.markAsPublishedOnDistroKid.useMutation({
        onSuccess: () => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Publicado na DistroKid!", {
                description: "Status alterado para IN_PROGRESS.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao marcar como publicado", {
                description: error.message,
            });
        },
    });

    // Create streaming upsell for a specific song
    const [createdStreamingUrls, setCreatedStreamingUrls] = useState<{ slot1?: string; slot2?: string }>({});
    const createStreamingUpsell = api.admin.createStreamingUpsellForSong.useMutation({
        onSuccess: (data, variables) => {
            const slot = variables.songSlot;
            setCreatedStreamingUrls(prev => ({
                ...prev,
                [slot === "1" ? "slot1" : "slot2"]: data.checkoutUrl,
            }));
            void navigator.clipboard.writeText(data.checkoutUrl);

            if (data.alreadyExists) {
                toast.info("Streaming VIP já existe!", {
                    description: `Status: ${data.status}. Link copiado!`,
                });
            } else {
                toast.success("Streaming VIP criado!", {
                    description: `Link de checkout copiado! ${data.isDiscounted ? "(Preço com desconto)" : ""}`,
                });
            }
        },
        onError: (error) => {
            toast.error("Erro ao criar Streaming VIP", {
                description: error.message,
            });
        },
    });

    // Send delivery email mutation
    const sendDeliveryEmail = api.admin.sendSongDeliveryEmail.useMutation({
        onSuccess: () => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Email Enviado!", {
                description: "O email de entrega foi enviado para o cliente.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao Enviar", {
                description: error.message,
            });
        },
    });

    // Resend delivery email mutation (for COMPLETED orders only)
    const resendDeliveryEmail = api.admin.resendDeliveryEmail.useMutation({
        onSuccess: () => {
            void refetch();
            toast.success("Email Reenviado!", {
                description: "O email de entrega foi reenviado para o cliente.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao Reenviar", {
                description: error.message,
            });
        },
    });

    // Delete song file mutation
    const deleteSongFile = api.admin.deleteSongFile.useMutation({
        onSuccess: () => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Arquivo Removido", {
                description: "O arquivo MP3 foi removido.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao Remover", {
                description: error.message,
            });
        },
    });

    // Delete revision history song file mutation
    const deleteRevisionSong = api.admin.deleteRevisionHistorySongFile.useMutation({
        onSuccess: () => {
            void refetch();
            toast.success("Arquivo Removido", {
                description: "O arquivo da revisão foi removido.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao Remover", {
                description: error.message,
            });
        },
    });

    const handleDeleteRevisionSong = useCallback((revisionNumber: number, slot: 1 | 2) => {
        if (confirm(`Remover o MP3 da Opção ${slot} da Revisão #${revisionNumber}? O arquivo será apagado do R2.`)) {
            deleteRevisionSong.mutate({ orderId, revisionNumber, slot });
        }
    }, [orderId, deleteRevisionSong]);

    const handleUploadComplete = useCallback(() => {
        void refetch();
        void utils.admin.getLeadsPaginated.invalidate();
        setReplacingSlot(new Set());
        toast.success("Upload Concluído!", {
            description: "O arquivo MP3 foi enviado com sucesso.",
        });
    }, [refetch, utils.admin.getLeadsPaginated]);

    // Cover upload handler
    const processCoverFile = useCallback(async (file: File) => {
        // Validate file type
        if (!file.type.startsWith("image/")) {
            toast.error("Arquivo inválido", {
                description: "Por favor, selecione uma imagem (PNG, JPG, etc.)",
            });
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Arquivo muito grande", {
                description: "O tamanho máximo é 10MB.",
            });
            return;
        }

        setIsUploadingCover(true);

        try {
            // Square crop on client-side (keep original resolution)
            const compressedFile = await new Promise<File>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const size = Math.min(img.width, img.height);
                    const sx = (img.width - size) / 2;
                    const sy = (img.height - size) / 2;
                    const canvas = document.createElement("canvas");
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) { reject(new Error("Canvas context failed")); return; }
                    ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) { reject(new Error("Blob failed")); return; }
                            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
                        },
                        "image/jpeg",
                        0.85
                    );
                };
                img.onerror = () => reject(new Error("Failed to load image"));
                img.src = URL.createObjectURL(file);
            });
            console.log(`[Upload] Original: ${(file.size / 1024 / 1024).toFixed(2)}MB -> Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);

            const formData = new FormData();
            formData.append("file", compressedFile);
            formData.append("orderId", orderId);

            const response = await fetch("/api/admin/upload-cover", {
                method: "POST",
                body: formData,
            });

            const data = await response.json() as {
                success?: boolean;
                error?: string;
                compressionRatio?: string;
                originalSize?: number;
                compressedSize?: number;
            };

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Erro ao fazer upload");
            }

            toast.success("Capa enviada!", {
                description: `Comprimida em ${data.compressionRatio} (${Math.round((data.originalSize || 0) / 1024)}KB → ${Math.round((data.compressedSize || 0) / 1024)}KB)`,
            });

            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
        } catch (error) {
            toast.error("Erro ao enviar capa", {
                description: error instanceof Error ? error.message : "Erro desconhecido",
            });
        } finally {
            setIsUploadingCover(false);
            // Reset input so same file can be selected again
            if (coverInputRef.current) {
                coverInputRef.current.value = "";
            }
        }
    }, [orderId, refetch, utils.admin.getLeadsPaginated]);

    const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processCoverFile(file);
    }, [processCoverFile]);

    const handleCoverDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverCover(false);

        const file = e.dataTransfer.files[0];
        if (!file) return;
        await processCoverFile(file);
    }, [processCoverFile]);

    const handleCoverDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverCover(true);
    }, []);

    const handleCoverDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverCover(false);
    }, []);

    const handleDeleteCover = useCallback(async () => {
        if (!confirm("Deletar a capa? O arquivo será removido do R2.")) return;

        setIsDeletingCover(true);
        try {
            const response = await fetch(`/api/admin/upload-cover?orderId=${orderId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json() as { error?: string };
                throw new Error(data.error ?? "Erro ao deletar capa");
            }

            toast.success("Capa deletada!");
            await refetch();
            await utils.admin.getLeadsPaginated.invalidate();
        } catch (error) {
            toast.error("Erro ao deletar capa", {
                description: error instanceof Error ? error.message : "Erro desconhecido",
            });
        } finally {
            setIsDeletingCover(false);
        }
    }, [orderId, refetch, utils.admin.getLeadsPaginated]);

    // Honoree photo upload handlers
    const processHonoreePhotoFile = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error("Arquivo inválido", {
                description: "Por favor, selecione uma imagem (PNG, JPG, etc.)",
            });
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error("Arquivo muito grande", {
                description: "O tamanho máximo é 10MB.",
            });
            return;
        }

        setIsUploadingHonoreePhoto(true);

        try {
            const compressedFile = await compressImage(file, 1500, 0.85);

            const formData = new FormData();
            formData.append("file", compressedFile);
            formData.append("orderId", orderId);

            const response = await fetch("/api/admin/upload-honoree-photo", {
                method: "POST",
                body: formData,
            });

            const data = await response.json() as {
                success?: boolean;
                error?: string;
            };

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Erro ao fazer upload");
            }

            toast.success("Foto do homenageado enviada!");
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
        } catch (error) {
            toast.error("Erro ao enviar foto", {
                description: error instanceof Error ? error.message : "Erro desconhecido",
            });
        } finally {
            setIsUploadingHonoreePhoto(false);
            if (honoreePhotoInputRef.current) {
                honoreePhotoInputRef.current.value = "";
            }
        }
    }, [orderId, refetch, utils.admin.getLeadsPaginated]);

    const handleHonoreePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processHonoreePhotoFile(file);
    }, [processHonoreePhotoFile]);

    const handleHonoreePhotoDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverHonoreePhoto(false);

        const file = e.dataTransfer.files[0];
        if (!file) return;
        await processHonoreePhotoFile(file);
    }, [processHonoreePhotoFile]);

    const handleHonoreePhotoDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverHonoreePhoto(true);
    }, []);

    const handleHonoreePhotoDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverHonoreePhoto(false);
    }, []);

    const handleDeleteHonoreePhoto = useCallback(async () => {
        if (!confirm("Deletar a foto do homenageado? O arquivo será removido.")) return;

        setIsDeletingHonoreePhoto(true);
        try {
            const response = await fetch(`/api/admin/upload-honoree-photo?orderId=${orderId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json() as { error?: string };
                throw new Error(data.error ?? "Erro ao deletar foto");
            }

            toast.success("Foto deletada!");
            await refetch();
            await utils.admin.getLeadsPaginated.invalidate();
        } catch (error) {
            toast.error("Erro ao deletar foto", {
                description: error instanceof Error ? error.message : "Erro desconhecido",
            });
        } finally {
            setIsDeletingHonoreePhoto(false);
        }
    }, [orderId, refetch, utils.admin.getLeadsPaginated]);

    const handleCopyLink = useCallback((url: string) => {
        void navigator.clipboard.writeText(url);
        toast.success("Link Copiado!", {
            description: "O link da música foi copiado para a área de transferência.",
        });
    }, []);

    const handleCopyPreferredVersionWhatsApp = useCallback(() => {
        // Try email-based name extraction first (the email belongs to the customer/buyer)
        const emailLocal = (deliveryData?.email || "").split("@")[0] || "";
        const emailName = emailLocal
            .replace(/[0-9]+/g, "")
            .replace(/[._-]/g, " ")
            .trim()
            .split(/\s+/)[0] || "";
        const cleanEmailName = emailName.length >= 3
            ? emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase()
            : "";
        // Fallback to recipientName (the song honoree)
        const recipientName = (deliveryData?.recipientName || deliveryData?.parentOrder?.recipientName || "").trim();
        const recipientFirstName = recipientName.split(/\s+/)[0] || "";
        const firstName = cleanEmailName || recipientFirstName;
        const option1Duration = preferredOptionDurations.option1 ?? "X:XX";
        const option2Duration = preferredOptionDurations.option2 ?? "X:XX";
        const hasOption2 = !!deliveryData?.parentOrder?.songFileUrl2;
        const greeting = firstName ? `Oi, ${firstName}!` : "Oi!";

        const message = hasOption2
            ? `${greeting}

Qual música você prefere para seguirmos?
A opção 1 com minutagem ${option1Duration} ou a opção 2 com minutagem ${option2Duration}?

Me responde: opção 1 ou opção 2.`
            : `${greeting}

Qual música você prefere para seguirmos?
A opção 1 está com minutagem ${option1Duration}.

Me responde se podemos seguir com ela.`;

        void navigator.clipboard.writeText(message);
        toast.success("Mensagem copiada!", {
            description: "Cole no WhatsApp do cliente",
        });
    }, [
        deliveryData?.email,
        deliveryData?.parentOrder?.recipientName,
        deliveryData?.parentOrder?.songFileUrl2,
        deliveryData?.recipientName,
        preferredOptionDurations.option1,
        preferredOptionDurations.option2,
    ]);

    const handleSendEmail = useCallback(() => {
        // Using window.confirm explicitly to avoid potential shadowing issues
        if (window.confirm("Enviar email de entrega para o cliente? O status será alterado para COMPLETED.")) {
            sendDeliveryEmail.mutate({ orderId });
        }
    }, [orderId, sendDeliveryEmail]);

    const handleDelete = useCallback((slot: 1 | 2) => {
        if (confirm(`Remover o arquivo MP3 da Opção ${slot}? Esta ação não pode ser desfeita.`)) {
            deleteSongFile.mutate({ orderId, slot });
        }
    }, [orderId, deleteSongFile]);

    const handleSaveSpotifyUrl = useCallback(() => {
        updateStreamingVipUrl.mutate({
            orderId,
            spotifyUrl: spotifyUrlDraft.trim(),
            streamingSongName: streamingSongNameDraft.trim(),
        });
    }, [orderId, spotifyUrlDraft, streamingSongNameDraft, updateStreamingVipUrl]);

    // Streaming VIP automation mutations
    const generateSongNames = api.admin.generateSongNameSuggestions.useMutation({
        onSuccess: (data) => {
            setSongNameSuggestions(data.suggestions);
            localStorage.setItem(`streaming-vip-names-${orderId}`, JSON.stringify(data.suggestions));
            toast.success("Sugestões geradas!", {
                description: "5 sugestões de nome foram criadas com base na letra.",
            });
        },
        onError: (error) => {
            toast.error("Erro ao gerar sugestões", {
                description: error.message,
            });
        },
    });

    const generateCover = api.admin.generateCoverPrompts.useMutation({
        onSuccess: (data) => {
            if (data.cartoon && data.cartoon.length > 10) {
                const nextPrompts = {
                    cartoon: data.cartoon,
                    photo: data.photo,
                    photoImproved: data.photoImproved,
                };
                setCoverPrompts(nextPrompts);
                localStorage.setItem(`streaming-vip-cover-${orderId}`, JSON.stringify(nextPrompts));
                toast.success("Prompts gerados!", {
                    description: "3 prompts para cover foram criados.",
                });
            } else {
                toast.error("Prompts inválidos", {
                    description: "Os prompts gerados estão vazios. Tente novamente.",
                });
            }
        },
        onError: (error) => {
            toast.error("Erro ao gerar prompts", {
                description: error.message,
            });
        },
    });

    const autoGenerateCoverPrompts = useCallback(() => {
        generateCover.mutate({
            orderId,
            customPrompt: coverCustomPrompt.trim() || undefined,
        });
    }, [coverCustomPrompt, generateCover, orderId]);

    const saveStreamingSongNameAndRefreshCover = useCallback((afterSuccess?: () => void) => {
        const nextSongName = streamingSongNameDraft.trim();
        if (!nextSongName) return;

        updateStreamingVipUrl.mutate(
            {
                orderId,
                streamingSongName: nextSongName,
            },
            {
                onSuccess: () => {
                    autoGenerateCoverPrompts();
                    afterSuccess?.();
                },
            }
        );
    }, [autoGenerateCoverPrompts, orderId, streamingSongNameDraft, updateStreamingVipUrl]);

    const handleCopySongName = useCallback((name: string, index: number) => {
        void navigator.clipboard.writeText(name);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
        toast.success("Nome copiado!");
    }, []);

    const handleCopyAllSongNames = useCallback(() => {
        const formatted = songNameSuggestions
            .map((name, i) => `${i + 1}. ${name}`)
            .join("\n");
        void navigator.clipboard.writeText(formatted);
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
        toast.success("Todas as sugestões copiadas!");
    }, [songNameSuggestions]);

    const handleCopyPrompt = useCallback((prompt: string, type: "cartoon" | "photo" | "photoImproved") => {
        void navigator.clipboard.writeText(prompt);
        setCopiedPromptType(type);
        setTimeout(() => setCopiedPromptType(null), 2000);
        toast.success("Prompt copiado!");
    }, []);

    const setActiveCover = api.admin.setActiveCover.useMutation({
        onSuccess: () => {
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Capa oficial atualizada!");
        },
        onError: (err) => toast.error("Erro", { description: err.message }),
    });

    const handleSetActiveCover = useCallback((type: "cartoon" | "photo" | "photoImproved") => {
        const url = generatedCovers[type];
        if (!url) return;
        const key = `covers/${orderId}-cover-${type}.jpg`;
        // Strip cache-busting param for the DB URL
        const cleanUrl = url.split("?")[0]!;
        setActiveCover.mutate({ orderId, url: cleanUrl, key });
    }, [generatedCovers, orderId, setActiveCover]);

    const handleCoverTypeUpload = useCallback(async (file: File, promptType: "cartoon" | "photo" | "photoImproved") => {
        if (!file.type.startsWith("image/")) {
            toast.error("Arquivo inválido", { description: "Selecione uma imagem." });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Arquivo muito grande", { description: "Máximo 10MB." });
            return;
        }
        setUploadingCoverType(promptType);
        try {
            // Square crop on client-side (keep original resolution)
            const compressedFile = await new Promise<File>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const size = Math.min(img.width, img.height);
                    const sx = (img.width - size) / 2;
                    const sy = (img.height - size) / 2;
                    const canvas = document.createElement("canvas");
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) { reject(new Error("Canvas context failed")); return; }
                    ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) { reject(new Error("Blob failed")); return; }
                            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
                        },
                        "image/jpeg",
                        0.85
                    );
                };
                img.onerror = () => reject(new Error("Failed to load image"));
                img.src = URL.createObjectURL(file);
            });
            const formData = new FormData();
            formData.append("file", compressedFile);
            formData.append("orderId", orderId);
            formData.append("promptType", promptType);
            const response = await fetch("/api/admin/upload-cover", { method: "POST", body: formData });
            const data = await response.json() as { success?: boolean; error?: string; url?: string };
            if (!response.ok || !data.success) throw new Error(data.error || "Erro ao fazer upload");
            setGeneratedCovers(prev => {
                const next = { ...prev, [promptType]: data.url };
                localStorage.setItem(`streaming-vip-gen-covers-${orderId}`, JSON.stringify(next));
                return next;
            });
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Capa enviada!");
        } catch (error) {
            toast.error("Erro ao enviar capa", { description: error instanceof Error ? error.message : "Erro desconhecido" });
        } finally {
            setUploadingCoverType(null);
        }
    }, [orderId, refetch, utils.admin.getLeadsPaginated]);

    const deleteGeneratedCover = api.admin.deleteGeneratedCover.useMutation({
        onSuccess: (_data, variables) => {
            setGeneratedCovers(prev => {
                const next = { ...prev, [variables.promptType]: undefined };
                localStorage.setItem(`streaming-vip-gen-covers-${orderId}`, JSON.stringify(next));
                return next;
            });
            void refetch();
            void utils.admin.getLeadsPaginated.invalidate();
            toast.success("Capa deletada do R2!");
        },
        onError: (error) => {
            toast.error("Erro ao deletar capa", { description: error.message });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-charcoal/60" />
            </div>
        );
    }

    const isStreamingUpsell = deliveryData?.orderType === "STREAMING_UPSELL";
    const hasSpotifyUrl = !!deliveryData?.spotifyUrl;
    const streamingStatusLabel = hasSpotifyUrl
        ? "Publicado no Spotify"
        : deliveryData?.status === "IN_PROGRESS"
            ? "Em distribuição (aguardando Spotify)"
            : "Aguardando envio para distribuição";
    const hasCoverHumanReviewRequest = Boolean(
        deliveryData?.coverHumanReviewRequested && !deliveryData?.coverApproved
    );
    const coverHumanReviewRequestedAt = deliveryData?.coverHumanReviewRequestedAt
        ? formatInTimeZone(new Date(deliveryData.coverHumanReviewRequestedAt), "America/Sao_Paulo", "PPpp")
        : null;
    const coverReviewWhatsAppDigits = (deliveryData?.backupWhatsApp ?? "").replace(/\D/g, "");
    const coverReviewWhatsAppUrl = coverReviewWhatsAppDigits.length >= 10
        ? `https://wa.me/${coverReviewWhatsAppDigits}`
        : null;

    if (isStreamingUpsell) {
        return (
            <div className="space-y-4">
                {/* 1. Status Banner */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${hasSpotifyUrl ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
                    }`}>
                    <div className="flex items-center gap-3">
                        {hasSpotifyUrl ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                            <Clock className="h-5 w-5 text-amber-600" />
                        )}
                        <div>
                            <p className="font-semibold text-sm">
                                {streamingStatusLabel}
                            </p>
                            {deliveryData?.songDeliveredAt && (
                                <p className="text-xs text-slate-500">
                                    Atualizado em {formatInTimeZone(new Date(deliveryData.songDeliveredAt), "America/Sao_Paulo", "PPpp")}
                                </p>
                            )}
                        </div>
                    </div>
                    <Badge className={hasSpotifyUrl ? "bg-green-100 text-green-800 border-green-200" : "bg-amber-100 text-amber-800 border-amber-200"}>
                        {deliveryData?.status}
                    </Badge>
                </div>

                {hasCoverHumanReviewRequest && (
                    <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-2">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-red-800">
                                    Cliente solicitou revisão humana da capa automática.
                                </p>
                                <p className="text-xs text-red-700">
                                    {coverHumanReviewRequestedAt
                                        ? `Pedido feito em ${coverHumanReviewRequestedAt}.`
                                        : "Pedido registrado pelo cliente no fluxo de Streaming VIP."} Fale com ele no WhatsApp para alinhar as mudanças da capa antes de publicar.
                                </p>
                            </div>
                        </div>
                        {coverReviewWhatsAppUrl ? (
                            <Button size="sm" asChild className="bg-red-600 hover:bg-red-700 text-white">
                                <a href={coverReviewWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    Falar com cliente no WhatsApp
                                </a>
                            </Button>
                        ) : (
                            <p className="text-xs text-red-700">
                                WhatsApp não encontrado neste pedido. Atualize o número para entrar em contato.
                            </p>
                        )}
                    </div>
                )}

                {/* 2. Recipient Info */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Destinatário</p>
                            <p className="font-semibold text-lg mt-1">{deliveryData?.recipientName}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Email do Cliente</p>
                            <p className="font-mono text-sm mt-1">{deliveryData?.email}</p>
                        </div>
                    </div>
                </div>

                {/* Spotify URL - shown when IN_PROGRESS or COMPLETED */}
                {(deliveryData?.status === "IN_PROGRESS" || deliveryData?.status === "COMPLETED") && (
                    <div className="p-4 rounded-lg border border-[#282828] bg-[#121212] space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="h-5 w-5 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                                <Label className="text-white font-semibold">Link do Spotify</Label>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => handleOpenSpotifySearch(deliveryData?.streamingSongName || "")}
                                className="bg-[#1DB954] hover:bg-[#1ed760] text-white border-0"
                            >
                                <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                                Buscar no Spotify
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={spotifyUrlDraft}
                                onChange={(e) => setSpotifyUrlDraft(e.target.value)}
                                placeholder="https://open.spotify.com/track/..."
                                className="flex-1 bg-[#282828] border-[#404040] text-white placeholder:text-[#727272]"
                            />
                            <Button
                                onClick={handleSaveSpotifyUrl}
                                disabled={updateStreamingVipUrl.isPending}
                            >
                                {updateStreamingVipUrl.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                Salvar
                            </Button>
                            {hasSpotifyUrl && (
                                <Button variant="outline" asChild>
                                    <a href={deliveryData?.spotifyUrl!} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-[#b3b3b3]">
                            Ao salvar o link, o status muda para COMPLETED.
                        </p>

                        {/* WhatsApp message for publishing notification */}
                        <button
                            type="button"
                            onClick={() => {
                                const songName = deliveryData?.streamingSongName || "sua música";
                                const recipientName = deliveryData?.recipientName || deliveryData?.parentOrder?.recipientName || "";
                                const artigo = recipientName.toLowerCase().endsWith("a") ? "a" : "o";
                                const paraQuem = recipientName ? ` para ${artigo} *${recipientName}*` : "";

                                const message = `Olá! 🎉

Temos uma ótima notícia! A música *"${songName}"*${paraQuem} foi publicada com sucesso nas plataformas de streaming! 🎵

Ela já está disponível no Spotify, Apple Music, Deezer, TikTok, Instagram, YouTube Music, Amazon Music e muitas outras plataformas.

⏰ *Importante:* A música pode levar de *1 a 4 dias* para aparecer nas buscas das plataformas. Isso é normal e faz parte do processo de distribuição.

Assim que estiver disponível nas buscas, você poderá encontrá-la pesquisando pelo nome *"${songName}"*.

Qualquer dúvida, estamos à disposição! 💜`;

                                void navigator.clipboard.writeText(message);
                                toast.success("Mensagem copiada!", {
                                    description: "Cole no WhatsApp",
                                });
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#282828] border border-[#404040] rounded-lg hover:bg-[#333333] transition-colors"
                        >
                            <Copy className="h-4 w-4" />
                            Copiar mensagem de publicação (WhatsApp)
                        </button>
                    </div>
                )}

                {/* 3. Preferred Song Version (Step 1) */}
                {(() => {
                    // Check if preferredSongForStreaming is invalid (doesn't match any parent song URL)
                    const preferredUrl = deliveryData?.preferredSongForStreaming;
                    const isValidPreference = preferredUrl && (
                        preferredUrl === deliveryData?.parentOrder?.songFileUrl ||
                        preferredUrl === deliveryData?.parentOrder?.songFileUrl2
                    );
                    const isInvalidPreference = preferredUrl && !isValidPreference;
                    const preferenceOptionNumber = preferredUrl
                        ? preferredUrl === deliveryData?.parentOrder?.songFileUrl
                            ? "1"
                            : preferredUrl === deliveryData?.parentOrder?.songFileUrl2
                                ? "2"
                                : "?"
                        : null;

                    return (
                        <div className={`p-4 rounded-lg border space-y-3 ${isValidPreference
                                ? "border-green-200 bg-green-50"
                                : isInvalidPreference
                                    ? "border-red-200 bg-red-50"
                                    : "border-amber-200 bg-amber-50"
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${isValidPreference ? "bg-green-500" : isInvalidPreference ? "bg-red-500" : "bg-amber-500"
                                        }`}>1</span>
                                    <span className={`font-semibold ${isValidPreference ? "text-green-800" : isInvalidPreference ? "text-red-800" : "text-amber-800"
                                        }`}>
                                        {preferredUrl
                                            ? `Versão preferida: Opção ${preferenceOptionNumber}`
                                            : "Selecionar versão preferida"
                                        }
                                    </span>
                                    {isInvalidPreference && (
                                        <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
                                            URL inválida
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {deliveryData?.parentOrder?.songFileUrl && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleCopyPreferredVersionWhatsApp}
                                            className="text-emerald-700 hover:bg-emerald-100"
                                        >
                                            <MessageSquareText className="h-4 w-4 mr-1" />
                                            Copiar WhatsApp
                                        </Button>
                                    )}
                                    {/* Sync button - appears when preference is invalid */}
                                    {isInvalidPreference && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                updatePreferredSongVersion.mutate({
                                                    id: orderId,
                                                    preferredSongForStreaming: null,
                                                });
                                            }}
                                            disabled={updatePreferredSongVersion.isPending}
                                            className="text-red-700 hover:bg-red-100"
                                        >
                                            {updatePreferredSongVersion.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <RefreshCw className="h-4 w-4 mr-1" />
                                                    Sincronizar
                                                </>
                                            )}
                                        </Button>
                                    )}
                                    {/* Switch button - appears when preference is valid and has 2 songs */}
                                    {isValidPreference && deliveryData.parentOrder?.songFileUrl2 && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                const newVersion = preferredUrl === deliveryData.parentOrder?.songFileUrl
                                                    ? deliveryData.parentOrder?.songFileUrl2
                                                    : deliveryData.parentOrder?.songFileUrl;
                                                if (newVersion) {
                                                    updatePreferredSongVersion.mutate({
                                                        id: orderId,
                                                        preferredSongForStreaming: newVersion,
                                                    });
                                                }
                                            }}
                                            disabled={updatePreferredSongVersion.isPending}
                                            className="text-green-700 hover:bg-green-100"
                                        >
                                            {updatePreferredSongVersion.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <RefreshCw className="h-4 w-4 mr-1" />
                                                    Trocar
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {isValidPreference && preferredUrl ? (
                                <>
                                    <TrackedAudioPlayer
                                        src={preferredUrl}
                                        title="Versão escolhida"
                                        showDownload={true}
                                        showSpeedControl={true}
                                        variant="compact"
                                        onAudioStateChange={onAudioStateChange}
                                    />
                                </>
                            ) : (
                                deliveryData?.parentOrder?.songFileUrl && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 p-2 bg-[#111827] rounded border border-amber-200">
                                            <div className="flex-1">
                                                <TrackedAudioPlayer
                                                    src={deliveryData.parentOrder.songFileUrl}
                                                    title="Opção 1"
                                                    showDownload={false}
                                                    showSpeedControl={true}
                                                    variant="compact"
                                                    onAudioStateChange={onAudioStateChange}
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => updatePreferredSongVersion.mutate({
                                                    id: orderId,
                                                    preferredSongForStreaming: deliveryData.parentOrder!.songFileUrl!,
                                                })}
                                                disabled={updatePreferredSongVersion.isPending}
                                                className="border-amber-400 text-amber-700 hover:bg-amber-100"
                                            >
                                                {updatePreferredSongVersion.isPending ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    "Usar"
                                                )}
                                            </Button>
                                        </div>
                                        {deliveryData.parentOrder.songFileUrl2 && (
                                            <div className="flex items-center gap-2 p-2 bg-[#111827] rounded border border-amber-200">
                                                <div className="flex-1">
                                                    <TrackedAudioPlayer
                                                        src={deliveryData.parentOrder.songFileUrl2}
                                                        title="Opção 2"
                                                        showDownload={false}
                                                        showSpeedControl={true}
                                                        variant="compact"
                                                        onAudioStateChange={onAudioStateChange}
                                                    />
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => updatePreferredSongVersion.mutate({
                                                        id: orderId,
                                                        preferredSongForStreaming: deliveryData.parentOrder!.songFileUrl2!,
                                                    })}
                                                    disabled={updatePreferredSongVersion.isPending}
                                                    className="border-amber-400 text-amber-700 hover:bg-amber-100"
                                                >
                                                    {updatePreferredSongVersion.isPending ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        "Usar"
                                                    )}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    );
                })()}

                {/* 2. Song Name + Cover Prompts side by side */}
                <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-lg border space-y-3 ${streamingSongNameDraft.trim()
                            ? "border-green-200 bg-green-50"
                            : "border-sky-200 bg-sky-50"
                        }`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${streamingSongNameDraft.trim() ? "bg-green-500" : "bg-sky-500"
                                    }`}>2</span>
                                <Label className={streamingSongNameDraft.trim() ? "text-green-800 font-semibold" : "text-sky-800 font-semibold"}>
                                    Nome da Música
                                </Label>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateSongNames.mutate({ orderId })}
                                disabled={generateSongNames.isPending}
                                className={streamingSongNameDraft.trim()
                                    ? "border-green-300 text-green-700 hover:bg-green-100"
                                    : "border-sky-300 text-sky-700 hover:bg-sky-100"
                                }
                            >
                                {generateSongNames.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Wand2 className="h-4 w-4" />
                                )}
                                Gerar Sugestões
                            </Button>
                        </div>

                        <div className="flex gap-2">
                            <Input
                                value={streamingSongNameDraft}
                                onChange={(e) => setStreamingSongNameDraft(e.target.value)}
                                placeholder="Ex: Oração do Coração"
                                className="flex-1"
                            />
                            <Button
                                onClick={() => {
                                    if (streamingSongNameDraft.trim()) {
                                        saveStreamingSongNameAndRefreshCover();
                                    }
                                }}
                                disabled={!streamingSongNameDraft.trim() || updateStreamingVipUrl.isPending || streamingSongNameDraft === deliveryData?.streamingSongName}
                                size="sm"
                                className={streamingSongNameDraft.trim() && streamingSongNameDraft !== deliveryData?.streamingSongName
                                    ? "bg-green-600 hover:bg-green-700"
                                    : ""
                                }
                            >
                                {updateStreamingVipUrl.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                Salvar
                            </Button>
                        </div>

                        {songNameSuggestions.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {songNameSuggestions.map((name, index) => (
                                        <Button
                                            key={index}
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setStreamingSongNameDraft(name);
                                                toast.success("Nome selecionado!");
                                            }}
                                            className={`text-xs ${streamingSongNameDraft.trim()
                                                ? "border-green-200 hover:bg-green-100"
                                                : "border-sky-200 hover:bg-sky-100"
                                                }`}
                                        >
                                            {name}
                                        </Button>
                                    ))}
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        const genre = deliveryData?.genre || deliveryData?.parentOrder?.genre || "";
                                        const genreName = GENRE_NAMES[genre as keyof typeof GENRE_NAMES]?.pt || genre;
                                        const recipientName = deliveryData?.recipientName || deliveryData?.parentOrder?.recipientName || "";
                                        const text = `Sugestão de nome da música para ${recipientName} no gênero ${genreName}:\n\n${songNameSuggestions.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
                                        void navigator.clipboard.writeText(text);
                                        toast.success("Copiado para WhatsApp!");
                                    }}
                                    className="text-xs text-slate-500 hover:text-slate-700"
                                >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copiar lista para WhatsApp
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Cover Art Prompts (helper tool) */}
                    <div className="p-4 rounded-lg border border-purple-200 bg-purple-50 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Gift className="h-5 w-5 text-purple-600" />
                                <Label className="text-purple-800 font-semibold">Prompts para Cover</Label>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateCover.mutate({ orderId, customPrompt: coverCustomPrompt.trim() || undefined })}
                                disabled={generateCover.isPending}
                                className="border-purple-300 text-purple-700 hover:bg-purple-100"
                            >
                                {generateCover.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                                Gerar
                            </Button>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-purple-700">Instruções extras para a capa (opcional)</label>
                            <textarea
                                value={coverCustomPrompt}
                                onChange={(e) => {
                                    setCoverCustomPrompt(e.target.value);
                                    localStorage.setItem(`streaming-vip-custom-prompt-${orderId}`, e.target.value);
                                }}
                                placeholder="Ex: remova o texto, use fundo azul, inclua flores..."
                                className="mt-1 w-full rounded border border-purple-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-charcoal/60 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-300"
                                rows={2}
                            />
                        </div>
                        {coverPrompts && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {/* CARTOON */}
                                <div className="bg-[#111827] rounded border border-purple-200 p-2 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-purple-700 uppercase">Cartoon</span>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleCopyPrompt(coverPrompts.cartoon, "cartoon")}
                                                className="h-6 px-2"
                                            >
                                                {copiedPromptType === "cartoon" ? (
                                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                ) : (
                                                    <Copy className="h-3 w-3" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{coverPrompts.cartoon}</p>
                                </div>
                                {/* FOTO ORIGINAL */}
                                {coverPrompts.photo && (
                                    <div className="bg-[#111827] rounded border border-purple-200 p-2 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-purple-700 uppercase">Foto Original (Pose Original)</span>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleCopyPrompt(coverPrompts.photo!, "photo")}
                                                    className="h-6 px-2"
                                                >
                                                    {copiedPromptType === "photo" ? (
                                                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                    ) : (
                                                        <Copy className="h-3 w-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{coverPrompts.photo}</p>
                                    </div>
                                )}
                                {/* FOTO ORIGINAL (POSE MELHORADA) */}
                                {coverPrompts.photoImproved && (
                                    <div className="bg-[#111827] rounded border border-purple-200 p-2 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-purple-700 uppercase">Foto Original (Pose Melhorada)</span>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleCopyPrompt(coverPrompts.photoImproved!, "photoImproved")}
                                                    className="h-6 px-2"
                                                >
                                                    {copiedPromptType === "photoImproved" ? (
                                                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                    ) : (
                                                        <Copy className="h-3 w-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{coverPrompts.photoImproved}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        {!coverPrompts && !generateCover.isPending && (
                            <p className="text-sm text-purple-600">
                                Gere prompts para criar a capa no gerador de imagens.
                            </p>
                        )}
                        <p className="text-[11px] text-purple-700 bg-purple-100 border border-purple-200 rounded px-2 py-1">
                            Geração de capa por IA no admin foi desativada. A capa automática é gerada uma única vez no fluxo do cliente.
                        </p>

                        {/* WhatsApp message for cover suggestions */}
                        <button
                            type="button"
                            onClick={() => {
                                const songName = streamingSongNameDraft || deliveryData?.streamingSongName || "a música";
                                const recipientName = deliveryData?.recipientName || deliveryData?.parentOrder?.recipientName || "";
                                const paraQuem = recipientName ? ` para *${recipientName}*` : "";

                                const message = `Segue a sugestão de capa para a música *"${songName}"*${paraQuem}!

O que achou, pode ser esta capa? 😊`;

                                void navigator.clipboard.writeText(message);
                                toast.success("Mensagem copiada!", {
                                    description: "Cole no WhatsApp",
                                });
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                        >
                            <Copy className="h-3 w-3" />
                            Enviar capa (WhatsApp)
                        </button>
                    </div>
                </div>

                {/* 3. Cover Art & Honoree Photo */}
                <div className={`p-4 rounded-lg border space-y-3 ${deliveryData?.streamingCoverUrl
                        ? "border-green-200 bg-green-50"
                        : "border-pink-200 bg-pink-50"
                    }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${deliveryData?.streamingCoverUrl ? "bg-green-500" : "bg-pink-500"
                                }`}>3</span>
                            <Label className={deliveryData?.streamingCoverUrl ? "text-green-800 font-semibold" : "text-pink-800 font-semibold"}>
                                Capa Streaming
                            </Label>
                            <span className="text-xs text-pink-600 bg-pink-100 px-1.5 py-0.5 rounded">Obrigatório</span>
                        </div>
                        {deliveryData?.streamingCoverUrl && (
                            <a
                                href={deliveryData.streamingCoverUrl}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-[#111827] border border-green-300 rounded hover:bg-green-100 transition-colors"
                            >
                                <Download className="h-3 w-3" />
                            </a>
                        )}
                    </div>

                    {/* Foto do Homenageado - inline */}
                    <div className="flex items-center gap-3 pb-2 border-b border-green-200/50">
                        <div
                            className={`relative shrink-0 rounded-lg border-2 transition-colors ${deliveryData?.honoreePhotoUrl
                                    ? isDragOverHonoreePhoto ? "border-blue-500 bg-blue-100" : "border-blue-200"
                                    : isDragOverHonoreePhoto ? "border-blue-500 bg-blue-100" : "border-dashed border-gray-300"
                                }`}
                            onDrop={(e) => void handleHonoreePhotoDrop(e)}
                            onDragOver={handleHonoreePhotoDragOver}
                            onDragLeave={handleHonoreePhotoDragLeave}
                        >
                            {deliveryData?.honoreePhotoUrl ? (
                                <img
                                    src={deliveryData.honoreePhotoUrl}
                                    alt="Foto do homenageado"
                                    className="w-16 h-16 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setExpandedPhotoUrl(deliveryData.honoreePhotoUrl!)}
                                />
                            ) : (
                                <div
                                    className="w-16 h-16 flex flex-col items-center justify-center cursor-pointer hover:bg-[#111827]/60 rounded-lg"
                                    onClick={() => honoreePhotoInputRef.current?.click()}
                                >
                                    <User className="h-5 w-5 text-[#F0EDE6]/40" />
                                    <span className="text-[9px] text-[#F0EDE6]/40 mt-0.5">Foto</span>
                                </div>
                            )}
                            {isDragOverHonoreePhoto && (
                                <div className="absolute inset-0 flex items-center justify-center bg-blue-500/80 rounded-lg">
                                    <span className="text-white font-medium text-[10px]">Soltar</span>
                                </div>
                            )}
                        </div>
                        <input
                            ref={honoreePhotoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handleHonoreePhotoUpload(e)}
                            className="hidden"
                        />
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-xs font-semibold text-[#F0EDE6]/70">Foto Homenageado</span>
                            <div className="flex items-center gap-1.5">
                                {deliveryData?.honoreePhotoUrl ? (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => honoreePhotoInputRef.current?.click()}
                                            disabled={isUploadingHonoreePhoto || isDeletingHonoreePhoto}
                                            className="h-6 px-2 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-100"
                                        >
                                            {isUploadingHonoreePhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void handleDeleteHonoreePhoto()}
                                            disabled={isUploadingHonoreePhoto || isDeletingHonoreePhoto}
                                            className="h-6 px-2 text-[10px] border-red-300 text-red-700 hover:bg-red-100"
                                        >
                                            {isDeletingHonoreePhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        </Button>
                                    </>
                                ) : (
                                    <span className="text-[10px] text-[#F0EDE6]/40">Arraste ou clique</span>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const name = deliveryData?.recipientName || "o homenageado";
                                        const msg = `Olá! 😊 Para criar a *capa da música* de *${name}* nas plataformas de streaming, precisamos de uma *foto bem nítida* do rosto do homenageado.

📸 *Dicas para a melhor foto:*
• Foto de rosto bem iluminada (luz natural é ideal)
• Fundo limpo ou simples
• Sem óculos escuros ou acessórios cobrindo o rosto
• Pode ser uma selfie ou foto de celular, desde que tenha boa qualidade

_A foto será usada como base para criar uma arte personalizada para a capa do álbum_ 🎨`;
                                        void navigator.clipboard.writeText(msg);
                                        toast.success("Mensagem copiada!", { description: "Cole no WhatsApp do cliente" });
                                    }}
                                    className="h-6 px-2 text-[10px] border-green-300 text-green-700 hover:bg-green-100"
                                    title="Copiar mensagem solicitando foto (WhatsApp)"
                                >
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {deliveryData?.streamingCoverUrl ? (
                        <div className="flex flex-col items-center gap-3">
                            <div
                                className={`relative p-1 rounded-lg border-2 border-dashed transition-colors ${isDragOverCover
                                        ? "border-green-500 bg-green-100"
                                        : "border-transparent"
                                    }`}
                                onDrop={(e) => void handleCoverDrop(e)}
                                onDragOver={handleCoverDragOver}
                                onDragLeave={handleCoverDragLeave}
                            >
                                <img
                                    src={deliveryData.streamingCoverUrl}
                                    alt="Capa do álbum"
                                    className="w-28 h-28 object-cover rounded-lg border border-green-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setExpandedPhotoUrl(deliveryData.streamingCoverUrl!)}
                                />
                                {isDragOverCover && (
                                    <div className="absolute inset-1 flex items-center justify-center bg-green-500/80 rounded-lg">
                                        <span className="text-white font-medium text-xs">Soltar</span>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={coverInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => void handleCoverUpload(e)}
                                className="hidden"
                                id="cover-upload-replace"
                            />
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => coverInputRef.current?.click()}
                                    disabled={isUploadingCover || isDeletingCover}
                                    className="border-green-300 text-green-700 hover:bg-green-100"
                                >
                                    {isUploadingCover ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleDeleteCover()}
                                    disabled={isUploadingCover || isDeletingCover}
                                    className="border-red-300 text-red-700 hover:bg-red-100"
                                >
                                    {isDeletingCover ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            {/* Cover approval button */}
                            {deliveryData?.coverApproved ? (
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 border border-green-300 rounded">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Aprovada pelo cliente
                                    </span>
                                    <button
                                        onClick={() => toggleCoverApproval.mutate({ orderId, approved: false })}
                                        disabled={toggleCoverApproval.isPending}
                                        className="text-xs text-[#F0EDE6]/40 hover:text-red-500 underline"
                                    >
                                        Desfazer
                                    </button>
                                </div>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => toggleCoverApproval.mutate({ orderId, approved: true })}
                                    disabled={toggleCoverApproval.isPending}
                                    className="border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
                                >
                                    {toggleCoverApproval.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4 mr-1" />
                                    )}
                                    Marcar capa como aprovada
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div>
                            <input
                                ref={coverInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => void handleCoverUpload(e)}
                                className="hidden"
                                id="cover-upload"
                            />
                            <div
                                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${isDragOverCover
                                        ? "border-pink-500 bg-pink-100"
                                        : "border-pink-300 bg-white hover:bg-pink-50"
                                    } ${isUploadingCover ? "pointer-events-none opacity-70" : ""}`}
                                onClick={() => coverInputRef.current?.click()}
                                onDrop={(e) => void handleCoverDrop(e)}
                                onDragOver={handleCoverDragOver}
                                onDragLeave={handleCoverDragLeave}
                            >
                                {isUploadingCover ? (
                                    <>
                                        <Loader2 className="h-8 w-8 animate-spin text-pink-500 mb-2" />
                                        <span className="text-xs font-medium text-pink-700">Enviando...</span>
                                    </>
                                ) : (
                                    <>
                                        <ImagePlus className={`h-8 w-8 mb-1 ${isDragOverCover ? "text-pink-600" : "text-pink-400"}`} />
                                        <span className="text-xs font-medium text-pink-700 text-center">
                                            {isDragOverCover ? "Solte aqui" : "Arraste a capa"}
                                        </span>
                                        <span className="text-xs text-pink-400 mt-1">3000x3000px</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Cover thumbnails grid - 3 boxes */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {(["cartoon", "photo", "photoImproved"] as const).map((type) => {
                            const url = generatedCovers[type];
                            const labels = {
                                cartoon: "Cartoon",
                                photo: "Foto Original",
                                photoImproved: "Foto Melhorada",
                            } as const;
                            const isActive = url && deliveryData?.streamingCoverKey === `covers/${orderId}-cover-${type}.jpg`;
                            const isDragging = dragOverCoverType === type;
                            const isUploading = uploadingCoverType === type;
                            const isBusy = isUploading;
                            return (
                                <div
                                    key={type}
                                    className="flex flex-col items-center gap-1"
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDragOverCoverType(null);
                                        const file = e.dataTransfer.files[0];
                                        if (file) void handleCoverTypeUpload(file, type);
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverCoverType(type); }}
                                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverCoverType(null); }}
                                >
                                    {isBusy ? (
                                        <div className="w-full aspect-square flex items-center justify-center rounded-lg border-2 border-dashed border-purple-300 bg-purple-50">
                                            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                                        </div>
                                    ) : url ? (
                                        <div className="relative w-full">
                                            <img
                                                src={url}
                                                alt={`Cover ${labels[type]}`}
                                                className={`w-full aspect-square object-cover rounded-lg border-2 cursor-pointer hover:opacity-80 transition-all ${isDragging ? "border-green-500 bg-green-100 opacity-60" :
                                                        isActive ? "border-green-500 ring-2 ring-green-300" : "border-[#C9A84C]/15"
                                                    }`}
                                                onClick={() => setExpandedPhotoUrl(url)}
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteGeneratedCover.mutate({ orderId, promptType: type });
                                                }}
                                                disabled={deleteGeneratedCover.isPending}
                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 text-[10px] font-bold shadow"
                                                title="Deletar do R2"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={`w-full aspect-square flex items-center justify-center rounded-lg border-2 border-dashed transition-colors ${isDragging ? "border-green-500 bg-green-100" : "border-gray-300 bg-[#111827]/30"
                                            }`}>
                                            <ImagePlus className={`h-5 w-5 ${isDragging ? "text-green-500" : "text-gray-300"}`} />
                                        </div>
                                    )}
                                    <span className={`text-[10px] font-semibold uppercase ${isActive ? "text-green-700" : "text-[#F0EDE6]/50"}`}>
                                        {labels[type]}
                                    </span>
                                    {url && !isActive && (
                                        <button
                                            type="button"
                                            onClick={() => handleSetActiveCover(type)}
                                            disabled={setActiveCover.isPending}
                                            className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            {setActiveCover.isPending ? "..." : "Usar"}
                                        </button>
                                    )}
                                    {isActive && (
                                        <span className="text-[10px] text-green-600 font-medium">✓ Oficial</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Lightbox for expanded photo/cover */}
                {expandedPhotoUrl && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setExpandedPhotoUrl(null)}
                    >
                        <div className="absolute top-4 right-4 flex items-center gap-3">
                            <a
                                href={expandedPhotoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="text-white hover:text-gray-300 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Download className="h-8 w-8" />
                            </a>
                            <button
                                className="text-white hover:text-gray-300 transition-colors"
                                onClick={() => setExpandedPhotoUrl(null)}
                            >
                                <X className="h-8 w-8" />
                            </button>
                        </div>
                        <img
                            src={expandedPhotoUrl}
                            alt="Foto expandida"
                            className="max-w-full max-h-full object-contain rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )}

                {/* 6. DistroKid Publication Action - only show when ready (all fields filled + cover approved) */}
                {deliveryData?.status === "PAID" &&
                    deliveryData?.preferredSongForStreaming &&
                    deliveryData?.streamingCoverUrl &&
                    deliveryData?.coverApproved &&
                    deliveryData?.streamingSongName && (
                        <div className="p-4 rounded-lg border border-orange-200 bg-orange-50 space-y-3">
                            <div className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-orange-600" />
                                <span className="font-semibold text-orange-800">Publicar na DistroKid</span>
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                                <div className={`flex items-center gap-1 ${deliveryData?.preferredSongForStreaming ? "text-green-700" : "text-orange-700"}`}>
                                    {deliveryData?.preferredSongForStreaming ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                    <span>Versão</span>
                                </div>
                                <div className={`flex items-center gap-1 ${deliveryData?.streamingCoverUrl ? "text-green-700" : "text-orange-700"}`}>
                                    {deliveryData?.streamingCoverUrl ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                    <span>Capa</span>
                                </div>
                                <div className={`flex items-center gap-1 ${deliveryData?.coverApproved ? "text-green-700" : "text-orange-700"}`}>
                                    {deliveryData?.coverApproved ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                    <span>Aprovação</span>
                                </div>
                                <div className={`flex items-center gap-1 ${streamingSongNameDraft.trim() ? "text-green-700" : "text-orange-700"}`}>
                                    {streamingSongNameDraft.trim() ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                    <span>Nome</span>
                                </div>
                            </div>

                            {deliveryData?.parentOrder?.status === "REVISION" && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>A música original está em revisão. Aguarde a conclusão antes de publicar.</span>
                                </div>
                            )}

                            <Button
                                onClick={() => {
                                    if (streamingSongNameDraft.trim() && streamingSongNameDraft !== deliveryData?.streamingSongName) {
                                        saveStreamingSongNameAndRefreshCover(() => {
                                            markAsPublished.mutate({ orderId });
                                        });
                                    } else {
                                        markAsPublished.mutate({ orderId });
                                    }
                                }}
                                disabled={
                                    !deliveryData?.preferredSongForStreaming ||
                                    !deliveryData?.streamingCoverUrl ||
                                    !deliveryData?.coverApproved ||
                                    !streamingSongNameDraft.trim() ||
                                    markAsPublished.isPending ||
                                    updateStreamingVipUrl.isPending ||
                                    deliveryData?.parentOrder?.status === "REVISION"
                                }
                                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                            >
                                {markAsPublished.isPending || updateStreamingVipUrl.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Marcar como Publicado
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

            </div>
        );
    }

    const hasSong1 = !!deliveryData?.songFileUrl;
    const hasSong2 = !!deliveryData?.songFileUrl2;
    const hasAnySong = hasSong1 || hasSong2;
    const isDelivered = !!deliveryData?.songDeliveredAt;
    const latestRevisionBy = capitalizeReviewerName(deliveryData?.revisionCompletedBy);
    const deliveryRevisionLockedBy = capitalizeReviewerName(deliveryData?.revisionLockedBy);
    const sunoAccountEmailLabel = deliveryData?.sunoAccountEmail?.trim() || null;
    const currentRevisionLabel = (deliveryData?.revisionCount ?? 0) > 0 ? `Revisão #${deliveryData?.revisionCount}` : null;
    const formatHistoryTimestamp = (value?: Date | string | null, pattern = "dd/MM HH:mm") => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return formatInTimeZone(date, "America/Sao_Paulo", pattern);
    };
    const resolveHistoryDeliveredAt = ({
        entry,
        isOriginals,
        revNum,
        revCount,
    }: {
        entry?: RevisionHistoryEntry;
        isOriginals: boolean;
        revNum: number;
        revCount: number;
    }) => {
        const directDeliveredAt = entry?.completedAt ?? entry?.songDeliveredAt;
        if (directDeliveredAt) return directDeliveredAt;
        if (isOriginals) {
            return entry?.songUploadedAt
                ?? entry?.songUploadedAt2
                ?? deliveryData?.songUploadedAt
                ?? deliveryData?.songUploadedAt2
                ?? deliveryData?.songDeliveredAt
                ?? null;
        }
        if (revNum === revCount - 1) {
            return deliveryData?.songDeliveredAt ?? null;
        }
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Status Banner */}
            <div className={`p-4 rounded-lg border flex items-center justify-between ${isDelivered ? "bg-green-50 border-green-200" :
                    hasAnySong ? "bg-blue-50 border-blue-200" :
                        "bg-amber-50 border-amber-200"
                }`}>
                <div className="flex items-center gap-3">
                    {isDelivered && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    {hasAnySong && !isDelivered && <Package className="h-5 w-5 text-blue-600" />}
                    {!hasAnySong && !isDelivered && <Clock className="h-5 w-5 text-amber-600" />}
                    <div>
                        <p className="font-semibold text-sm">
                            {isDelivered && "Entregue ao Cliente"}
                            {hasAnySong && !isDelivered && `${hasSong1 && hasSong2 ? "2 Músicas Prontas" : "1 Música Pronta"} para Envio`}
                            {!hasAnySong && !isDelivered && "Aguardando Upload"}
                        </p>
                        {deliveryData?.songDeliveredAt && (
                            <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                Enviado em {formatInTimeZone(new Date(deliveryData.songDeliveredAt), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss")}
                                {latestRevisionBy && <span>• Revisado por {latestRevisionBy}</span>}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {deliveryData?.sunoAccountEmail && (
                        <Badge className="bg-violet-100 text-violet-800 border-violet-200">
                            🎵 {deliveryData.sunoAccountEmail}
                        </Badge>
                    )}
                    <Badge className={
                        isDelivered ? "bg-green-100 text-green-800 border-green-200" :
                            hasAnySong ? "bg-blue-100 text-blue-800 border-blue-200" :
                                "bg-amber-100 text-amber-800 border-amber-200"
                    }>
                        {deliveryData?.status}
                    </Badge>
                </div>
            </div>

            {/* Recipient Info */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Destinatário</p>
                        <p className="font-semibold text-lg mt-1">{deliveryData?.recipientName}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Email do Cliente</p>
                        <p className="font-mono text-sm mt-1">{deliveryData?.email}</p>
                    </div>
                </div>
            </div>

            {/* REVISION MODE: Upload on top, previous songs below */}
            {deliveryData?.status === "REVISION" ? (
                <>
                    {/* Detect if admin has uploaded new songs for THIS revision */}
                    {(() => {
                        const revCount = deliveryData?.revisionCount ?? 0;
                        const history = normalizeRevisionHistory(deliveryData?.revisionHistory, { revisionCount: revCount }) as unknown as RevisionHistoryEntry[];
                        const historyMap = new Map(history.map((e) => [e.revisionNumber, e]));
                        // Snapshot of the previous version (before THIS revision was requested).
                        const previousSnapshot = historyMap.get(revCount - 1) ?? (history.length > 0 ? history[history.length - 1] : undefined);
                        const revisionRequestedAtMs = deliveryData?.revisionRequestedAt
                            ? new Date(deliveryData.revisionRequestedAt).getTime()
                            : null;

                        // Same semantics used in completeRevision/sendSongDeliveryEmail:
                        // true = song was updated during THIS revision.
                        // false/null = not updated (or uncertain), so show empty upload slot.
                        const getSlotUpdatedState = (slot: 1 | 2): boolean | null => {
                            const currentUrl = slot === 2 ? deliveryData?.songFileUrl2 : deliveryData?.songFileUrl;
                            if (!currentUrl) return false;

                            const snapshotKey = slot === 2 ? "songFileUrl2" : "songFileUrl";
                            if (previousSnapshot && Object.prototype.hasOwnProperty.call(previousSnapshot, snapshotKey)) {
                                const prevUrl = previousSnapshot[snapshotKey as keyof RevisionHistoryEntry];
                                if (typeof prevUrl === "string") return prevUrl !== currentUrl;
                                if (prevUrl === null) return true;
                            }

                            const uploadedAt = slot === 2 ? deliveryData?.songUploadedAt2 : deliveryData?.songUploadedAt;
                            if (revisionRequestedAtMs && uploadedAt) {
                                return new Date(uploadedAt).getTime() > revisionRequestedAtMs;
                            }

                            return null;
                        };

                        const song1IsNew = getSlotUpdatedState(1) === true;
                        const song2IsNew = getSlotUpdatedState(2) === true;

                        return (
                            <>
                                {/* Upload / Player area for current revision */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Slot 1 */}
                                    <div className="space-y-2 p-4 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50">
                                        <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-2 flex-wrap">
                                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">1</span>
                                            Opção 1 — Revisão #{revCount}
                                            {deliveryRevisionLockedBy && <span className="text-xs text-amber-500 font-normal">por {deliveryRevisionLockedBy}</span>}
                                            {hasSong1 && deliveryData?.songUploadedAt && (
                                                <span className="text-xs text-amber-500 font-normal">
                                                    upload {formatInTimeZone(new Date(deliveryData.songUploadedAt), "America/Sao_Paulo", "dd/MM HH:mm")}
                                                </span>
                                            )}
                                        </h4>
                                        {!replacingSlot.has("new-1") && song1IsNew ? (
                                            <div className="space-y-2">
                                                <TrackedAudioPlayer
                                                    src={deliveryData.songFileUrl!}
                                                    title={`Opção 1 - ${deliveryData.recipientName}`}
                                                    showDownload={true}
                                                    showSpeedControl={true}
                                                    variant="compact"
                                                    onAudioStateChange={onAudioStateChange}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => handleCopyLink(deliveryData.songFileUrl!)} className="flex-1 text-xs border-slate-300 hover:border-slate-400 hover:bg-slate-50">
                                                        <Copy className="h-3 w-3 mr-1" /> Copiar Link
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => setReplacingSlot((prev) => { const next = new Set(prev); next.add("new-1"); return next; })} className="border-amber-200 text-amber-600 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-300" title="Substituir música">
                                                        <RefreshCw className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => handleDelete(1)} disabled={deleteSongFile.isPending} className="border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300">
                                                        <Trash className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <SongUpload orderId={orderId} onUploadComplete={handleUploadComplete} slot={1} label="Arraste o novo MP3 aqui" />
                                        )}
                                    </div>
                                    {/* Slot 2 */}
                                    <div className="space-y-2 p-4 rounded-lg border-2 border-dashed border-violet-300 bg-violet-50">
                                        <h4 className="text-sm font-semibold text-violet-800 flex items-center gap-2 flex-wrap">
                                            <span className="w-6 h-6 rounded-full bg-violet-500 text-white text-xs flex items-center justify-center font-bold">2</span>
                                            Opção 2 — Revisão #{revCount}
                                            <span className="text-xs text-violet-400 font-normal">(opcional)</span>
                                            {deliveryRevisionLockedBy && <span className="text-xs text-violet-500 font-normal">por {deliveryRevisionLockedBy}</span>}
                                            {hasSong2 && deliveryData?.songUploadedAt2 && (
                                                <span className="text-xs text-violet-500 font-normal">
                                                    upload {formatInTimeZone(new Date(deliveryData.songUploadedAt2), "America/Sao_Paulo", "dd/MM HH:mm")}
                                                </span>
                                            )}
                                        </h4>
                                        {!replacingSlot.has("new-2") && song2IsNew ? (
                                            <div className="space-y-2">
                                                <TrackedAudioPlayer
                                                    src={deliveryData.songFileUrl2!}
                                                    title={`Opção 2 - ${deliveryData.recipientName}`}
                                                    showDownload={true}
                                                    showSpeedControl={true}
                                                    variant="compact"
                                                    onAudioStateChange={onAudioStateChange}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => handleCopyLink(deliveryData.songFileUrl2!)} className="flex-1 text-xs border-slate-300 hover:border-slate-400 hover:bg-slate-50">
                                                        <Copy className="h-3 w-3 mr-1" /> Copiar Link
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => setReplacingSlot((prev) => { const next = new Set(prev); next.add("new-2"); return next; })} className="border-violet-200 text-violet-600 hover:text-violet-700 hover:bg-violet-50 hover:border-violet-300" title="Substituir música">
                                                        <RefreshCw className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => handleDelete(2)} disabled={deleteSongFile.isPending} className="border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300">
                                                        <Trash className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <SongUpload orderId={orderId} onUploadComplete={handleUploadComplete} slot={2} label="Arraste o novo MP3 aqui" />
                                        )}
                                    </div>
                                </div>

                                {/* Previous revisions + Originals (revCount down to 0) */}
                                {(() => {
                                    if (revCount < 1) return null;
                                    // Build list from revCount-1 down to 0
                                    // Entry 0 = originals, Entry N (N>=1) = songs after revision N
                                    const revisions = Array.from({ length: revCount }, (_, i) => revCount - 1 - i);
                                    return revisions.map((revNum) => {
                                        const rawEntry = historyMap.get(revNum);
                                        const isOriginals = revNum === 0;
                                        // For "Músicas Originais" on first revision only: if snapshot is missing or has no song URLs
                                        // (old revision before feature), fall back to current songFileUrl (which ARE the originals)
                                        // Only safe for revCount===1 since current songs haven't been replaced yet
                                        const entry = (isOriginals && revCount === 1 && (!rawEntry || (!rawEntry.songFileUrl && !rawEntry.songFileUrl2)))
                                            ? {
                                                ...(rawEntry ?? {}),
                                                revisionNumber: 0,
                                                songFileUrl: deliveryData?.songFileUrl ?? null,
                                                songFileUrl2: deliveryData?.songFileUrl2 ?? null,
                                                songFileKey: deliveryData?.songFileKey ?? null,
                                                songFileKey2: deliveryData?.songFileKey2 ?? null,
                                                songUploadedAt: deliveryData?.songUploadedAt ?? null,
                                                songUploadedAt2: deliveryData?.songUploadedAt2 ?? null,
                                                songDeliveredAt: deliveryData?.songDeliveredAt ?? null,
                                                completedBy: (rawEntry?.completedBy as string | null | undefined) ?? deliveryData?.revisionCompletedBy ?? null,
                                                completedAt: (rawEntry?.completedAt as Date | string | null | undefined) ?? deliveryData?.revisionCompletedAt ?? null,
                                            } as RevisionHistoryEntry
                                            : rawEntry;
                                        const hasSongs = entry?.songFileUrl || entry?.songFileUrl2;
                                        const boxLabel = isOriginals
                                            ? "Músicas Originais"
                                            : `Revisão #${revNum}`;
                                        const option1UploadedAt = entry?.songUploadedAt ??
                                            (revNum === revCount - 1 && entry?.songFileUrl === deliveryData?.songFileUrl ? deliveryData?.songUploadedAt : null);
                                        const option2UploadedAt = entry?.songUploadedAt2 ??
                                            (revNum === revCount - 1 && entry?.songFileUrl2 === deliveryData?.songFileUrl2 ? deliveryData?.songUploadedAt2 : null);
                                        const deliveredAt = resolveHistoryDeliveredAt({ entry, isOriginals, revNum, revCount });
                                        const deliveredAtLabel = formatHistoryTimestamp(deliveredAt);
                                        const option1UploadedAtLabel = formatHistoryTimestamp(option1UploadedAt);
                                        const option2UploadedAtLabel = formatHistoryTimestamp(option2UploadedAt);
                                        const completedBy = capitalizeReviewerName(entry?.completedBy);
                                        return (
                                            <details key={revNum} className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden" open={revNum === revCount - 1}>
                                                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2 flex-wrap">
                                                    <History className="h-4 w-4" />
                                                    {boxLabel}
                                                    {deliveredAtLabel && <span>• Entrega: {deliveredAtLabel}</span>}
                                                    {isOriginals && sunoAccountEmailLabel && <span>• Suno: {sunoAccountEmailLabel}</span>}
                                                    {!isOriginals && completedBy && <span>• Por: {completedBy}</span>}
                                                    {!hasSongs && <span className="text-[10px] text-charcoal/60 ml-1">(sem registro)</span>}
                                                </summary>
                                    <div className="px-4 pb-3 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] text-slate-500">Opção 1</span>
                                                    {option1UploadedAtLabel && (
                                                        <span className="text-[10px] text-charcoal/60">{option1UploadedAtLabel}</span>
                                                    )}
                                                </div>
                                                {entry?.songFileUrl ? (
                                                    <div className="space-y-1">
                                                        <TrackedAudioPlayer
                                                            src={entry.songFileUrl}
                                                            title={`${boxLabel} Opção 1 - ${deliveryData?.recipientName}`}
                                                            showDownload={true}
                                                            showSpeedControl={true}
                                                            variant="compact"
                                                            onAudioStateChange={onAudioStateChange}
                                                        />
                                                        <Button variant="outline" size="sm" onClick={() => handleDeleteRevisionSong(revNum, 1)} disabled={deleteRevisionSong.isPending} className="h-6 text-[10px] border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-300">
                                                            <Trash className="h-3 w-3 mr-1" /> Remover
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <SongUpload orderId={orderId} onUploadComplete={handleUploadComplete} slot={1} revisionNumber={revNum} label="" />
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] text-slate-500">Opção 2</span>
                                                    {option2UploadedAtLabel && (
                                                        <span className="text-[10px] text-charcoal/60">{option2UploadedAtLabel}</span>
                                                    )}
                                                </div>
                                                {entry?.songFileUrl2 ? (
                                                    <div className="space-y-1">
                                                        <TrackedAudioPlayer
                                                            src={entry.songFileUrl2}
                                                            title={`${boxLabel} Opção 2 - ${deliveryData?.recipientName}`}
                                                            showDownload={true}
                                                            showSpeedControl={true}
                                                            variant="compact"
                                                            onAudioStateChange={onAudioStateChange}
                                                        />
                                                        <Button variant="outline" size="sm" onClick={() => handleDeleteRevisionSong(revNum, 2)} disabled={deleteRevisionSong.isPending} className="h-6 text-[10px] border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-300">
                                                            <Trash className="h-3 w-3 mr-1" /> Remover
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <SongUpload orderId={orderId} onUploadComplete={handleUploadComplete} slot={2} revisionNumber={revNum} label="" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </details>
                                        );
                                    });
                                })()}
                            </>
                        );
                    })()}
                </>
            ) : (
                /* NORMAL MODE: Standard upload/player layout */
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Option 1 */}
                        <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-[#111827]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
                                        <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">1</span>
                                        Opção 1
                                        {currentRevisionLabel && <span className="text-sm text-slate-600 font-semibold">• {currentRevisionLabel}</span>}
                                    </h4>
                                    <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-600 flex-wrap">
                                        {hasSong1 && deliveryData?.songUploadedAt && (
                                            <span>
                                                {formatInTimeZone(new Date(deliveryData.songUploadedAt), "America/Sao_Paulo", "dd/MM HH:mm")}
                                            </span>
                                        )}
                                        {latestRevisionBy && <span>• por {latestRevisionBy}</span>}
                                    </div>
                                </div>
                            </div>

                            {hasSong1 ? (
                                <div className="space-y-3">
                                    <TrackedAudioPlayer
                                        src={deliveryData.songFileUrl!}
                                        title={`Opção 1 - ${deliveryData.recipientName}`}
                                        showDownload={true}
                                        showSpeedControl={true}
                                        variant="compact"
                                        onAudioStateChange={onAudioStateChange}
                                    />
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleCopyLink(deliveryData.songFileUrl!)}
                                            className="flex-1 text-xs border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                                        >
                                            <Copy className="h-3 w-3 mr-1" />
                                            Copiar Link
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(1)}
                                            disabled={deleteSongFile.isPending}
                                            className="border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300"
                                        >
                                            <Trash className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    {/* Create Streaming VIP Button */}
                                    {deliveryData.orderType !== "STREAMING_UPSELL" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => createStreamingUpsell.mutate({ orderId, songSlot: "1" })}
                                            disabled={createStreamingUpsell.isPending}
                                            className="w-full text-xs border-sky-300 text-sky-700 hover:border-sky-400 hover:bg-sky-50"
                                        >
                                            {createStreamingUpsell.isPending && createStreamingUpsell.variables?.songSlot === "1" ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                                <Music className="h-3 w-3 mr-1" />
                                            )}
                                            {createdStreamingUrls.slot1 ? "Link Copiado! Clicar p/ Copiar" : "Criar Streaming VIP"}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <SongUpload
                                    orderId={orderId}
                                    currentUrl={deliveryData?.songFileUrl}
                                    onUploadComplete={handleUploadComplete}
                                    slot={1}
                                    label="Arraste o MP3 aqui"
                                />
                            )}
                        </div>

                        {/* Option 2 */}
                        <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-[#111827]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
                                        <span className="w-6 h-6 rounded-full bg-violet-500 text-white text-xs flex items-center justify-center font-bold">2</span>
                                        Opção 2
                                        <span className="text-xs text-charcoal/60 font-normal">(opcional)</span>
                                        {currentRevisionLabel && <span className="text-sm text-slate-600 font-semibold">• {currentRevisionLabel}</span>}
                                    </h4>
                                    <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-600 flex-wrap">
                                        {hasSong2 && deliveryData?.songUploadedAt2 && (
                                            <span>
                                                {formatInTimeZone(new Date(deliveryData.songUploadedAt2), "America/Sao_Paulo", "dd/MM HH:mm")}
                                            </span>
                                        )}
                                        {latestRevisionBy && <span>• por {latestRevisionBy}</span>}
                                    </div>
                                </div>
                            </div>

                            {hasSong2 ? (
                                <div className="space-y-3">
                                    <TrackedAudioPlayer
                                        src={deliveryData.songFileUrl2!}
                                        title={`Opção 2 - ${deliveryData.recipientName}`}
                                        showDownload={true}
                                        showSpeedControl={true}
                                        variant="compact"
                                        onAudioStateChange={onAudioStateChange}
                                    />
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleCopyLink(deliveryData.songFileUrl2!)}
                                            className="flex-1 text-xs border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                                        >
                                            <Copy className="h-3 w-3 mr-1" />
                                            Copiar Link
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(2)}
                                            disabled={deleteSongFile.isPending}
                                            className="border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300"
                                        >
                                            <Trash className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    {/* Create Streaming VIP Button */}
                                    {deliveryData.orderType !== "STREAMING_UPSELL" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => createStreamingUpsell.mutate({ orderId, songSlot: "2" })}
                                            disabled={createStreamingUpsell.isPending}
                                            className="w-full text-xs border-sky-300 text-sky-700 hover:border-sky-400 hover:bg-sky-50"
                                        >
                                            {createStreamingUpsell.isPending && createStreamingUpsell.variables?.songSlot === "2" ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                                <Music className="h-3 w-3 mr-1" />
                                            )}
                                            {createdStreamingUrls.slot2 ? "Link Copiado! Clicar p/ Copiar" : "Criar Streaming VIP"}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <SongUpload
                                    orderId={orderId}
                                    currentUrl={deliveryData?.songFileUrl2}
                                    onUploadComplete={handleUploadComplete}
                                    slot={2}
                                    label="Arraste o MP3 aqui"
                                />
                            )}
                        </div>
                    </div>

                    {/* Song Version History - for non-revision orders that had revisions */}
                    {(() => {
                        const revCount = deliveryData?.revisionCount ?? 0;
                        if (revCount < 1) return null;
                        const history = normalizeRevisionHistory(deliveryData?.revisionHistory, { revisionCount: revCount }) as unknown as RevisionHistoryEntry[];
                        const historyMap = new Map(history.map((e) => [e.revisionNumber, e]));
                        // Show all revisions from revCount-1 down to 0
                        const revisions = Array.from({ length: revCount }, (_, i) => revCount - 1 - i);
                        return (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                                    <History className="h-4 w-4" />
                                    Versões Anteriores
                                </h4>
                                {revisions.map((revNum) => {
                                    const rawEntry = historyMap.get(revNum);
                                    const isOriginals = revNum === 0;
                                    const entry = (isOriginals && revCount === 1 && (!rawEntry || (!rawEntry.songFileUrl && !rawEntry.songFileUrl2)))
                                        ? {
                                            ...(rawEntry ?? {}),
                                            revisionNumber: 0,
                                            songFileUrl: deliveryData?.songFileUrl ?? null,
                                            songFileUrl2: deliveryData?.songFileUrl2 ?? null,
                                            songFileKey: deliveryData?.songFileKey ?? null,
                                            songFileKey2: deliveryData?.songFileKey2 ?? null,
                                            songUploadedAt: deliveryData?.songUploadedAt ?? null,
                                            songUploadedAt2: deliveryData?.songUploadedAt2 ?? null,
                                            songDeliveredAt: deliveryData?.songDeliveredAt ?? null,
                                            completedBy: (rawEntry?.completedBy as string | null | undefined) ?? deliveryData?.revisionCompletedBy ?? null,
                                            completedAt: (rawEntry?.completedAt as Date | string | null | undefined) ?? deliveryData?.revisionCompletedAt ?? null,
                                        } as RevisionHistoryEntry
                                        : rawEntry;
                                    const hasSongs = entry?.songFileUrl || entry?.songFileUrl2;
                                    const boxLabel = isOriginals ? "Músicas Originais" : `Revisão #${revNum}`;
                                    const deliveredAtLabel = formatHistoryTimestamp(
                                        resolveHistoryDeliveredAt({ entry, isOriginals, revNum, revCount })
                                    );
                                    const option1UploadedAtLabel = formatHistoryTimestamp(entry?.songUploadedAt);
                                    const option2UploadedAtLabel = formatHistoryTimestamp(entry?.songUploadedAt2);
                                    const completedBy = capitalizeReviewerName(entry?.completedBy);
                                    return (
                                        <details key={revNum} className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                                            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2 flex-wrap">
                                                <History className="h-4 w-4" />
                                                {boxLabel}
                                                {deliveredAtLabel && <span>• Entrega: {deliveredAtLabel}</span>}
                                                {isOriginals && sunoAccountEmailLabel && <span>• Suno: {sunoAccountEmailLabel}</span>}
                                                {!isOriginals && completedBy && <span>• Por: {completedBy}</span>}
                                                {!hasSongs && <span className="text-[10px] text-charcoal/60 ml-1">(sem registro)</span>}
                                            </summary>
                                            <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {entry?.songFileUrl ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] text-slate-500">Opção 1</span>
                                                            {option1UploadedAtLabel && (
                                                                <span className="text-[10px] text-charcoal/60">{option1UploadedAtLabel}</span>
                                                            )}
                                                        </div>
                                                        <TrackedAudioPlayer
                                                            src={entry.songFileUrl}
                                                            title={`${boxLabel} — Opção 1`}
                                                            variant="compact"
                                                            showDownload={true}
                                                            showSpeedControl={true}
                                                        />
                                                        <Button variant="outline" size="sm" onClick={() => handleDeleteRevisionSong(revNum, 1)} disabled={deleteRevisionSong.isPending} className="h-6 text-[10px] border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-300">
                                                            <Trash className="h-3 w-3 mr-1" /> Remover
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] text-slate-500">Opção 1</span>
                                                            {option1UploadedAtLabel && (
                                                                <span className="text-[10px] text-charcoal/60">{option1UploadedAtLabel}</span>
                                                            )}
                                                        </div>
                                                        <SongUpload orderId={orderId} onUploadComplete={handleUploadComplete} slot={1} revisionNumber={revNum} label="" />
                                                    </div>
                                                )}
                                                {entry?.songFileUrl2 ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] text-slate-500">Opção 2</span>
                                                            {option2UploadedAtLabel && (
                                                                <span className="text-[10px] text-charcoal/60">{option2UploadedAtLabel}</span>
                                                            )}
                                                        </div>
                                                        <TrackedAudioPlayer
                                                            src={entry.songFileUrl2}
                                                            title={`${boxLabel} — Opção 2`}
                                                            variant="compact"
                                                            showDownload={true}
                                                            showSpeedControl={true}
                                                        />
                                                        <Button variant="outline" size="sm" onClick={() => handleDeleteRevisionSong(revNum, 2)} disabled={deleteRevisionSong.isPending} className="h-6 text-[10px] border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-300">
                                                            <Trash className="h-3 w-3 mr-1" /> Remover
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] text-slate-500">Opção 2</span>
                                                            {option2UploadedAtLabel && (
                                                                <span className="text-[10px] text-charcoal/60">{option2UploadedAtLabel}</span>
                                                            )}
                                                        </div>
                                                        <SongUpload orderId={orderId} onUploadComplete={handleUploadComplete} slot={2} revisionNumber={revNum} label="" />
                                                    </div>
                                                )}
                                            </div>
                                        </details>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </>
            )}

            {/* Send Email Button - show if has song AND (not delivered OR status is IN_PROGRESS for re-delivery) */}
            {hasAnySong && (!isDelivered || deliveryData?.status === "IN_PROGRESS") && (
                <Button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={sendDeliveryEmail.isPending}
                    className={`w-full text-white ${isDelivered ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}`}
                >
                    {sendDeliveryEmail.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4 mr-2" />
                    )}
                    {isDelivered ? "Reenviar" : "Enviar"} {hasSong1 && hasSong2 ? "2 Opções" : "Música"} para Cliente
                </Button>
            )}

            {deliveryData?.status === "COMPLETED" && (
                <Button
                    type="button"
                    onClick={() => {
                        if (window.confirm("Reenviar o email de entrega com as músicas prontas para o cliente?")) {
                            resendDeliveryEmail.mutate({ orderId });
                        }
                    }}
                    disabled={resendDeliveryEmail.isPending}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                >
                    {resendDeliveryEmail.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4 mr-2" />
                    )}
                    Reenviar Email de Músicas Prontas
                </Button>
            )}

            {/* Certificate and Lyrics Order Bumps */}
            {(deliveryData?.hasCertificate || deliveryData?.hasLyrics) && (
                <div className="p-4 rounded-lg border border-violet-200 bg-violet-50">
                    <div className="flex items-center gap-2 mb-4">
                        <Gift className="h-4 w-4 text-violet-600" />
                        <h4 className="text-sm font-semibold text-violet-800">Order Bumps</h4>
                    </div>
                    <div className="space-y-3">
                        {/* Certificate Link */}
                        {deliveryData?.hasCertificate && (
                            <div className="flex items-center justify-between gap-4 p-3 bg-[#111827] rounded-lg border border-amber-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                        <Gift className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-slate-800">Experiência de Presente</p>
                                        <p className="text-xs text-slate-500">
                                            {deliveryData.certificateToken
                                                ? `Token: ${deliveryData.certificateToken}`
                                                : "Token não gerado"}
                                        </p>
                                    </div>
                                </div>
                                {deliveryData.certificateToken && (
                                    <a
                                        href={`/${deliveryData.locale || "pt"}/certificate/${deliveryData.certificateToken}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        Abrir
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Lyrics PDF Links */}
                        {deliveryData?.hasLyrics && (
                            <div className="flex items-center justify-between gap-4 p-3 bg-[#111827] rounded-lg border border-purple-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-slate-800">Letra da Música (PDF)</p>
                                        <p className="text-xs text-slate-500">
                                            {deliveryData.lyrics
                                                ? `${deliveryData.lyrics.length} caracteres`
                                                : "Letra não gerada"}
                                        </p>
                                    </div>
                                </div>
                                {deliveryData.lyrics && (
                                    <div className="flex gap-2">
                                        {deliveryData.lyricsPdfA4Url ? (
                                            <a
                                                href={deliveryData.lyricsPdfA4Url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                                            >
                                                <Download className="w-3 h-3" />
                                                A4
                                            </a>
                                        ) : (
                                            <a
                                                href={`/api/frameable-lyrics/${deliveryData.id}?size=A4`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                                title="PDF ainda não gerado - clique para gerar"
                                            >
                                                <Download className="w-3 h-3" />
                                                A4
                                            </a>
                                        )}
                                        {deliveryData.lyricsPdfA3Url ? (
                                            <a
                                                href={deliveryData.lyricsPdfA3Url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                                            >
                                                <Download className="w-3 h-3" />
                                                A3
                                            </a>
                                        ) : (
                                            <a
                                                href={`/api/frameable-lyrics/${deliveryData.id}?size=A3`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                                title="PDF ainda não gerado - clique para gerar"
                                            >
                                                <Download className="w-3 h-3" />
                                                A3
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
