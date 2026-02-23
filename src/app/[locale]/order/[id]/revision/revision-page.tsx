"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Music, FileText, ArrowLeft, Mic, Square, Phone, Headphones, Check, ClipboardList, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "~/i18n/provider";
import { api } from "~/trpc/react";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "~/components/ui/dialog";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { cn } from "~/lib/utils";
import { normalizeEmail } from "~/lib/normalize-email";
import Link from "next/link";
import { GENRE_NAMES } from "~/lib/lyrics-generator";
import { AudioPlayer } from "~/components/audio-player";
import { normalizeRevisionHistory } from "~/lib/revision-history";

type TranscriptionStatus = "idle" | "recording" | "uploading" | "queued" | "processing" | "completed" | "error";
type RevisionAudioMeta = {
    audioUrl: string;
    audioKey: string;
};
type RevisionHistoryTrackEntry = {
    revisionNumber: number;
    songFileUrl?: string | null;
    songFileUrl2?: string | null;
};
type MelodyChoice = {
    id: string;
    url: string;
    optionNumber: "1" | "2";
    versionLabel: string;
    choiceLabel: string;
    isCurrentVersion: boolean;
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const getGenreDisplayName = (genre: string | null, locale: string): string => {
    if (!genre) return "";
    const genreData = GENRE_NAMES[genre];
    if (!genreData) return genre.charAt(0).toUpperCase() + genre.slice(1);
    return genreData[locale as keyof typeof genreData] || genreData.en || genre;
};

// localStorage key for persisting form data
const getStorageKey = (orderId: string) => `revision-draft-${orderId}`;

interface RevisionDraft {
    revisionNotes: string;
    whatsappInput: string;
    selectedSongVersion: string | null;
    melodyPreference: "KEEP_CURRENT" | "SUGGEST_NEW" | null;
}

export function RevisionPageClient({ orderId }: { orderId: string }) {
    const t = useTranslations("revision");
    const common = useTranslations("common");
    const locale = useLocale();
    const searchParams = useSearchParams();

    const [emailInput, setEmailInput] = useState("");
    const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [revisionNotes, setRevisionNotes] = useState("");
    const [showEmailForm, setShowEmailForm] = useState(true);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    // WhatsApp contact state
    const [whatsappInput, setWhatsappInput] = useState("");
    const [whatsappError, setWhatsappError] = useState<string | null>(null);

    // Song version selection state
    const [selectedSongVersion, setSelectedSongVersion] = useState<string | null>(null);
    const [songVersionError, setSongVersionError] = useState<string | null>(null);

    // Melody preference state
    const [melodyPreference, setMelodyPreference] = useState<"KEEP_CURRENT" | "SUGGEST_NEW" | null>(null);
    const [melodyPreferenceError, setMelodyPreferenceError] = useState<string | null>(null);
    const melodyPreferenceRef = useRef<HTMLDivElement>(null);

    // Revision notes error state
    const [revisionNotesError, setRevisionNotesError] = useState<string | null>(null);
    const revisionNotesRef = useRef<HTMLTextAreaElement>(null);

    // Refs for scroll-to-field on validation error
    const songVersionRef = useRef<HTMLDivElement>(null);
    const whatsappRef = useRef<HTMLDivElement>(null);

    // Get default country based on locale
    const getDefaultCountry = () => {
        switch (locale) {
            case "pt": return "br";
            case "es": return "es";
            case "fr": return "fr";
            case "it": return "it";
            default: return "us";
        }
    };

    // Restore draft from localStorage on mount (only notes and whatsapp, not selections)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(getStorageKey(orderId));
            if (saved) {
                const draft = JSON.parse(saved) as RevisionDraft;
                if (draft.revisionNotes) setRevisionNotes(draft.revisionNotes);
                if (draft.whatsappInput) setWhatsappInput(draft.whatsappInput);
                // Don't restore selections - user should choose fresh each time
            }
        } catch (e) {
            console.error("Failed to restore revision draft:", e);
        }
        setHydrated(true);
    }, [orderId]);

    // Save draft to localStorage on changes
    useEffect(() => {
        if (!hydrated) return;
        try {
            const draft: RevisionDraft = {
                revisionNotes,
                whatsappInput,
                selectedSongVersion,
                melodyPreference,
            };
            localStorage.setItem(getStorageKey(orderId), JSON.stringify(draft));
        } catch (e) {
            console.error("Failed to save revision draft:", e);
        }
    }, [orderId, revisionNotes, whatsappInput, selectedSongVersion, melodyPreference, hydrated]);

    // Audio transcription states
    const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>("idle");
    const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
    const [revisionAudioMeta, setRevisionAudioMeta] = useState<RevisionAudioMeta | null>(null);
    const [recordedAudioPreviewUrl, setRecordedAudioPreviewUrl] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isNearLimit, setIsNearLimit] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const MAX_RECORDING_SECONDS = 300; // 5 minutes
    const WARNING_THRESHOLD_SECONDS = 240; // 4 minutes
    const AUDIO_RECORDING_BITRATE = 48_000; // Keep voice uploads lightweight for R2 storage

    const initialEmailParam = useMemo(() => searchParams.get("email"), [searchParams]);
    const invalidEmailMessage = t("emailInvalid");
    const notFoundMessage = t("notFound");

    const showBrandByline = locale !== "en";
    const trackOrderUrl = submittedEmail
        ? `/${locale}/track-order?email=${encodeURIComponent(submittedEmail)}`
        : `/${locale}/track-order`;

    // Cleanup polling and recording timer on unmount
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        return () => {
            if (recordedAudioPreviewUrl) {
                URL.revokeObjectURL(recordedAudioPreviewUrl);
            }
        };
    }, [recordedAudioPreviewUrl]);

    // Poll for transcription status
    const pollTranscription = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/transcript/${id}`);
            const data = await res.json() as { status: string; text?: string | null; error?: string | null };

            if (data.status === "completed" && data.text) {
                setTranscriptionStatus("completed");
                const transcribedText = data.text;
                setRevisionNotes(prev => {
                    if (!prev.trim()) return transcribedText;
                    return prev.trim() + "\n\n" + transcribedText;
                });
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
            } else if (data.status === "error" || data.error) {
                setTranscriptionStatus("error");
                setTranscriptionError(data.error || t("transcriptionErrorDefault"));
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
            } else if (data.status === "queued") {
                setTranscriptionStatus("queued");
            } else if (data.status === "processing") {
                setTranscriptionStatus("processing");
            }
        } catch (err) {
            console.error("Polling error:", err);
            setTranscriptionStatus("error");
            setTranscriptionError(t("transcriptionPollingError"));
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        }
    }, [t]);

    // Upload audio and start transcription
    const uploadAndTranscribe = useCallback(async (audioBlob: Blob) => {
        setTranscriptionStatus("uploading");
        setTranscriptionError(null);
        setRevisionAudioMeta(null);

        try {
            const formData = new FormData();
            formData.append("file", audioBlob, "audio.webm");
            formData.append("storeInR2", "true");
            formData.append("orderId", orderId);

            const res = await fetch("/api/transcribe", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json() as {
                    error?: string;
                    audioUrl?: string | null;
                    audioKey?: string | null;
                };
                if (errData.audioUrl && errData.audioKey) {
                    setRevisionAudioMeta({
                        audioUrl: errData.audioUrl,
                        audioKey: errData.audioKey,
                    });
                }
                throw new Error(errData.error || t("uploadFailed"));
            }

            const data = await res.json() as {
                transcriptId?: string | null;
                status?: string;
                text?: string | null;
                audioUrl?: string | null;
                audioKey?: string | null;
            };
            if (data.audioUrl && data.audioKey) {
                setRevisionAudioMeta({
                    audioUrl: data.audioUrl,
                    audioKey: data.audioKey,
                });
            }
            if ((data.status === "completed" || !!data.text) && data.text) {
                setTranscriptionStatus("completed");
                const transcribedText = data.text;
                setRevisionNotes(prev => {
                    if (!prev.trim()) return transcribedText;
                    return prev.trim() + "\n\n" + transcribedText;
                });
                return;
            }

            const transcriptId = data.transcriptId;
            if (transcriptId) {
                setTranscriptionStatus("queued");
                pollingIntervalRef.current = setInterval(() => {
                    void pollTranscription(transcriptId);
                }, 2000);
                return;
            }

            throw new Error(t("transcriptionErrorDefault"));
        } catch (err) {
            console.error("Upload error:", err);
            setTranscriptionStatus("error");
            setTranscriptionError(err instanceof Error ? err.message : t("uploadErrorDefault"));
        }
    }, [pollTranscription, t, orderId]);

    // Stop recording timer
    const stopRecordingTimer = useCallback(() => {
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        setElapsedSeconds(0);
        setIsNearLimit(false);
    }, []);

    // Start recording
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: "audio/webm",
                audioBitsPerSecond: AUDIO_RECORDING_BITRATE,
            });

            audioChunksRef.current = [];
            setElapsedSeconds(0);
            setIsNearLimit(false);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
                const previewUrl = URL.createObjectURL(audioBlob);
                setRecordedAudioPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return previewUrl;
                });
                stream.getTracks().forEach(track => track.stop());
                stopRecordingTimer();
                void uploadAndTranscribe(audioBlob);
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setTranscriptionStatus("recording");
            setTranscriptionError(null);

            // Start timer
            let seconds = 0;
            recordingTimerRef.current = setInterval(() => {
                seconds += 1;
                setElapsedSeconds(seconds);

                // Warning at 4 minutes
                if (seconds >= WARNING_THRESHOLD_SECONDS) {
                    setIsNearLimit(true);
                }

                // Auto-stop at 5 minutes
                if (seconds >= MAX_RECORDING_SECONDS) {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                        mediaRecorderRef.current.stop();
                    }
                }
            }, 1000);
        } catch (err) {
            console.error("Recording error:", err);
            setTranscriptionStatus("error");
            setTranscriptionError(t("microphoneError"));
        }
    }, [uploadAndTranscribe, stopRecordingTimer, t, AUDIO_RECORDING_BITRATE]);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    // Auto-fill email from URL
    useEffect(() => {
        if (submittedEmail) return;
        if (!initialEmailParam) return;
        const normalizedEmail = normalizeEmail(decodeURIComponent(initialEmailParam));
        setEmailInput(normalizedEmail);
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            setEmailError(invalidEmailMessage);
            return;
        }
        setSubmittedEmail(normalizedEmail);
        setShowEmailForm(false);
    }, [initialEmailParam, submittedEmail, invalidEmailMessage]);

    // Fetch order data
    const {
        data: order,
        isLoading,
        error: orderError,
    } = api.songOrder.getOrderForRevision.useQuery(
        { orderId, email: submittedEmail! },
        {
            enabled: !!submittedEmail,
            retry: false,
        }
    );

    const melodyChoices = useMemo<MelodyChoice[]>(() => {
        if (!order) return [];

        const options: MelodyChoice[] = [];
        const pushOption = (
            url: string | null | undefined,
            optionNumber: "1" | "2",
            revisionNumber: number,
            isCurrentVersion: boolean
        ) => {
            if (!url) return;
            const versionLabel = revisionNumber === 0
                ? (isCurrentVersion ? "Originais (atual)" : "Originais")
                : (isCurrentVersion ? `Revisão #${revisionNumber} (atual)` : `Revisão #${revisionNumber}`);
            const choiceLabel = `${versionLabel} - Opção ${optionNumber}`;
            options.push({
                id: `${isCurrentVersion ? "current" : `history-${revisionNumber}`}-option-${optionNumber}`,
                url,
                optionNumber,
                versionLabel,
                choiceLabel,
                isCurrentVersion,
            });
        };

        // Always include the current delivered version first.
        pushOption(order.songFileUrl, "1", order.revisionCount, true);
        pushOption(order.songFileUrl2, "2", order.revisionCount, true);

        const history = normalizeRevisionHistory(order.revisionHistory, {
            revisionCount: order.revisionCount,
        }) as RevisionHistoryTrackEntry[];

        for (const entry of [...history].sort((a, b) => b.revisionNumber - a.revisionNumber)) {
            // Current version already represented by current song urls above.
            if (entry.revisionNumber >= order.revisionCount) continue;
            pushOption(entry.songFileUrl, "1", entry.revisionNumber, false);
            pushOption(entry.songFileUrl2, "2", entry.revisionNumber, false);
        }

        return options;
    }, [order]);

    const hasMelodyChoices = melodyChoices.length > 0;
    const selectedMelodyChoice = useMemo(
        () => melodyChoices.find((choice) => choice.id === selectedSongVersion) ?? null,
        [melodyChoices, selectedSongVersion]
    );

    // Pre-fill WhatsApp from order (database value takes priority over localStorage)
    const hasPrefilledWhatsApp = useRef(false);
    useEffect(() => {
        if (order?.backupWhatsApp && !hasPrefilledWhatsApp.current) {
            setWhatsappInput(order.backupWhatsApp);
            hasPrefilledWhatsApp.current = true;
        }
    }, [order?.backupWhatsApp]);

    // Auto-select song version when there's only one available historical media.
    useEffect(() => {
        if (melodyPreference === "KEEP_CURRENT" && melodyChoices.length === 1 && !selectedSongVersion) {
            setSelectedSongVersion(melodyChoices[0]!.id);
        }
    }, [melodyPreference, melodyChoices, selectedSongVersion]);

    // Auto-scroll to step 2 (melody preference) when notes reach 10 characters
    const hasScrolledToStep2 = useRef(false);
    useEffect(() => {
        if (
            hasMelodyChoices &&
            revisionNotes.trim().length >= 10 &&
            !hasScrolledToStep2.current &&
            melodyPreferenceRef.current
        ) {
            hasScrolledToStep2.current = true;
            // Small delay to let the section render
            setTimeout(() => {
                melodyPreferenceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    }, [revisionNotes, hasMelodyChoices]);

    // Auto-scroll to step 3 (song version) when melody preference is "KEEP_CURRENT"
    const hasScrolledToStep3 = useRef(false);
    useEffect(() => {
        if (
            melodyPreference === "KEEP_CURRENT" &&
            !hasScrolledToStep3.current &&
            songVersionRef.current
        ) {
            hasScrolledToStep3.current = true;
            setTimeout(() => {
                songVersionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    }, [melodyPreference]);

    // Auto-scroll to step 4 (WhatsApp) when form is ready
    // - If "SUGGEST_NEW": scroll after melody preference (skip song version)
    // - If "KEEP_CURRENT": scroll after song version is selected
    const hasScrolledToStep4 = useRef(false);
    useEffect(() => {
        const shouldScroll = melodyPreference === "SUGGEST_NEW" ||
            (melodyPreference === "KEEP_CURRENT" && selectedSongVersion);

        if (
            shouldScroll &&
            !hasScrolledToStep4.current &&
            whatsappRef.current
        ) {
            hasScrolledToStep4.current = true;
            setTimeout(() => {
                whatsappRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
        }
    }, [melodyPreference, selectedSongVersion]);

    // Submit revision request
    const requestRevision = api.songOrder.requestRevision.useMutation({
        onSuccess: (data) => {
            // Clear draft from localStorage on successful submit
            try {
                localStorage.removeItem(getStorageKey(orderId));
            } catch (e) {
                console.error("Failed to clear revision draft:", e);
            }
            setQueuePosition(data.queuePosition);
            setSubmitSuccess(true);
        },
    });

    // Additional notes state (for adding more info after submission)
    const [additionalNotes, setAdditionalNotes] = useState("");
    const [showAdditionalNotesForm, setShowAdditionalNotesForm] = useState(false);
    const [additionalNotesSuccess, setAdditionalNotesSuccess] = useState(false);

    // Append additional notes mutation
    const appendNotes = api.songOrder.appendRevisionNotes.useMutation({
        onSuccess: () => {
            setAdditionalNotes("");
            setAdditionalNotesSuccess(true);
            setShowAdditionalNotesForm(false);
        },
    });

    const handleAppendNotes = () => {
        if (!additionalNotes.trim() || !submittedEmail) return;
        appendNotes.mutate({
            orderId,
            email: submittedEmail,
            additionalNotes: additionalNotes.trim(),
        });
    };

    const handleEmailSubmit = (e: FormEvent) => {
        e.preventDefault();
        setEmailError(null);
        const normalizedEmail = normalizeEmail(emailInput);
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            setEmailError(invalidEmailMessage);
            return;
        }
        setSubmittedEmail(normalizedEmail);
        setShowEmailForm(false);
    };

    // Scroll to element and flash it for attention
    const scrollToAndFlash = useCallback((element: HTMLElement | null) => {
        if (!element) return;
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // Add flash animation
        element.classList.add("animate-flash-attention");
        setTimeout(() => {
            element.classList.remove("animate-flash-attention");
        }, 2000);
    }, []);

    // Validate and show confirmation dialog
    const handleSubmit = () => {
        if (!submittedEmail) return;

        // Validate revision notes (item 1) - most important field
        if (revisionNotes.trim().length < 10) {
            setRevisionNotesError(t("notesRequired"));
            scrollToAndFlash(revisionNotesRef.current);
            revisionNotesRef.current?.focus();
            return;
        }
        setRevisionNotesError(null);

        // Validate melody preference (item 2) - required when there are melodies to choose from
        if (hasMelodyChoices && !melodyPreference) {
            setMelodyPreferenceError(t("melodyPreferenceRequired"));
            scrollToAndFlash(melodyPreferenceRef.current);
            return;
        }
        setMelodyPreferenceError(null);

        // Validate song version selection (item 3) - required when keeping current melodies
        if (melodyPreference === "KEEP_CURRENT" && hasMelodyChoices && !selectedSongVersion) {
            setSongVersionError(t("songVersionRequired"));
            scrollToAndFlash(songVersionRef.current);
            return;
        }
        setSongVersionError(null);

        // Validate WhatsApp - required if not already in order
        const trimmedWhatsapp = whatsappInput.trim();
        if (!order?.backupWhatsApp && !trimmedWhatsapp) {
            setWhatsappError(t("whatsappRequired"));
            scrollToAndFlash(whatsappRef.current);
            return;
        }
        setWhatsappError(null);

        // Show confirmation dialog
        setShowConfirmDialog(true);
    };

    // Actually submit after confirmation
    const handleConfirmSubmit = () => {
        if (!submittedEmail) return;

        const finalNotes = revisionNotes.trim();
        const trimmedWhatsapp = whatsappInput.trim();
        const selectedOption = selectedMelodyChoice;

        requestRevision.mutate({
            orderId,
            email: submittedEmail,
            revisionNotes: finalNotes,
            whatsapp: trimmedWhatsapp || undefined,
            preferredSongVersion:
                selectedOption?.isCurrentVersion
                    ? selectedOption.optionNumber
                    : undefined,
            preferredSongChoiceLabel: selectedOption?.choiceLabel,
            preferredSongChoiceUrl: selectedOption?.url,
            melodyPreference: melodyPreference || undefined,
            revisionAudioUrl: revisionAudioMeta?.audioUrl,
            revisionAudioKey: revisionAudioMeta?.audioKey,
        });

        setShowConfirmDialog(false);
    };

    // Success state
    if (submitSuccess) {
        return (
            <div className="min-h-screen bg-porcelain">
                <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 pt-10 sm:pt-16">
                    <header className="space-y-6 text-center">
                        <div className="flex justify-center">
                            <div className="flex flex-col items-start leading-tight select-none">
                                <span className="font-serif text-2xl md:text-3xl font-bold text-dark tracking-tight">
                                    {common("brand")}
                                </span>
                                {showBrandByline && (
                                    <span className="text-[0.65rem] md:text-xs font-semibold tracking-widest text-dark/60">
                                        {common("brandByline")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </header>

                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8 text-center">
                        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h1 className="text-2xl font-serif font-semibold text-charcoal mb-4 sm:text-3xl">
                            {t("successTitle")}
                        </h1>
                        <p className="text-lg text-charcoal/70 mb-4 sm:text-xl">
                            {t("successDescription")}
                        </p>
                        {queuePosition !== null && queuePosition > 1 && queuePosition <= 10 && (
                            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-100 text-violet-800 mb-8">
                                <span className="text-lg font-semibold sm:text-xl">
                                    {t("queuePosition").replace("{position}", String(queuePosition))}
                                </span>
                            </div>
                        )}
                        <div className={queuePosition !== null && queuePosition > 1 && queuePosition <= 10 ? "" : "mt-4"}>
                            <Link
                                href={trackOrderUrl}
                                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[#4A8E9A] text-lg font-semibold text-white hover:bg-[#F0EDE6] transition-colors sm:h-14 sm:text-xl"
                            >
                                <ArrowLeft className="w-5 h-5" />
                                {t("backToTrackOrder")}
                            </Link>
                        </div>
                    </section>

                    {/* Additional notes section */}
                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8">
                        {additionalNotesSuccess ? (
                            <div className="text-center">
                                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-6 h-6 text-emerald-600" />
                                </div>
                                <p className="text-charcoal/70 mb-4">{t("additionalNotesSent")}</p>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setAdditionalNotesSuccess(false);
                                        setShowAdditionalNotesForm(true);
                                    }}
                                    className="text-charcoal/70"
                                >
                                    {t("addMoreInfo")}
                                </Button>
                            </div>
                        ) : showAdditionalNotesForm ? (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-charcoal">
                                    {t("additionalNotesTitle")}
                                </h3>
                                <Textarea
                                    value={additionalNotes}
                                    onChange={(e) => setAdditionalNotes(e.target.value)}
                                    placeholder={t("additionalNotesPlaceholder")}
                                    rows={4}
                                    className="w-full"
                                />
                                <div className="flex gap-3 justify-end">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowAdditionalNotesForm(false);
                                            setAdditionalNotes("");
                                        }}
                                    >
                                        {t("cancel")}
                                    </Button>
                                    <Button
                                        onClick={handleAppendNotes}
                                        disabled={!additionalNotes.trim() || appendNotes.isPending}
                                        className="bg-[#4A8E9A] hover:bg-[#F0EDE6] text-white"
                                    >
                                        {appendNotes.isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            t("sendAdditionalNotes")
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-charcoal/70 mb-4">{t("forgotSomething")}</p>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowAdditionalNotesForm(true)}
                                    className="text-charcoal"
                                >
                                    <FileText className="w-4 h-4 mr-2" />
                                    {t("addMoreInfo")}
                                </Button>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        );
    }

    // Email form
    if (showEmailForm || !submittedEmail) {
        return (
            <div className="min-h-screen bg-porcelain">
                <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 pt-10 sm:pt-16">
                    <header className="space-y-6 text-center">
                        <div className="flex justify-center">
                            <div className="flex flex-col items-start leading-tight select-none">
                                <span className="font-serif text-2xl md:text-3xl font-bold text-dark tracking-tight">
                                    {common("brand")}
                                </span>
                                {showBrandByline && (
                                    <span className="text-[0.65rem] md:text-xs font-semibold tracking-widest text-dark/60">
                                        {common("brandByline")}
                                    </span>
                                )}
                            </div>
                        </div>
                        <h1 className="text-3xl font-serif font-semibold text-charcoal sm:text-4xl">
                            {t("title")}
                        </h1>
                    </header>

                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8">
                        <form onSubmit={handleEmailSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-base font-semibold text-charcoal sm:text-lg">
                                    {t("emailLabel")}
                                </label>
                                <Input
                                    type="email"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    placeholder={t("emailPlaceholder")}
                                    autoComplete="email"
                                    className={cn(
                                        "h-12 rounded-2xl border-charcoal/20 text-lg sm:h-14 md:text-xl",
                                        emailError && "border-red-400"
                                    )}
                                />
                            </div>

                            {emailError && (
                                <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                                    <AlertCircle className="mt-0.5 h-5 w-5" />
                                    <p className="text-base sm:text-lg">{emailError}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="h-12 w-full rounded-2xl bg-[#4A8E9A] text-lg font-semibold text-white hover:bg-[#F0EDE6] sm:h-14 sm:text-xl"
                            >
                                {t("continue")}
                            </Button>
                        </form>
                    </section>
                </div>
            </div>
        );
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-porcelain">
                <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 pt-10 sm:pt-16">
                    <header className="space-y-6 text-center">
                        <div className="flex justify-center">
                            <div className="flex flex-col items-start leading-tight select-none">
                                <span className="font-serif text-2xl md:text-3xl font-bold text-dark tracking-tight">
                                    {common("brand")}
                                </span>
                                {showBrandByline && (
                                    <span className="text-[0.65rem] md:text-xs font-semibold tracking-widest text-dark/60">
                                        {common("brandByline")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </header>

                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8">
                        <div className="flex items-center justify-center gap-3 text-charcoal/70">
                            <Loader2 className="h-6 w-6 animate-spin text-[#1A1A2E]" />
                            <span className="text-lg sm:text-xl">{t("loading")}</span>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    // Special state - revision already requested (show success-like message)
    const isAlreadyRequested = orderError?.message === "REVISION_ALREADY_REQUESTED";
    if (isAlreadyRequested) {
        return (
            <div className="min-h-screen bg-porcelain">
                <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 pt-10 sm:pt-16">
                    <header className="space-y-6 text-center">
                        <div className="flex justify-center">
                            <div className="flex flex-col items-start leading-tight select-none">
                                <span className="font-serif text-2xl md:text-3xl font-bold text-dark tracking-tight">
                                    {common("brand")}
                                </span>
                                {showBrandByline && (
                                    <span className="text-[0.65rem] md:text-xs font-semibold tracking-widest text-dark/60">
                                        {common("brandByline")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </header>

                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8 text-center">
                        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h1 className="text-2xl font-serif font-semibold text-charcoal mb-4 sm:text-3xl">
                            {t("alreadyRequestedTitle")}
                        </h1>
                        <p className="text-lg text-charcoal/70 mb-8 sm:text-xl">
                            {t("alreadyRequestedDescription")}
                        </p>
                        <Link
                            href={trackOrderUrl}
                            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[#4A8E9A] text-lg font-semibold text-white hover:bg-[#F0EDE6] transition-colors sm:h-14 sm:text-xl"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            {t("backToTrackOrder")}
                        </Link>
                    </section>
                </div>
            </div>
        );
    }

    // Error state - order not found or not eligible
    if (orderError || !order) {
        return (
            <div className="min-h-screen bg-porcelain">
                <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 pt-10 sm:pt-16">
                    <header className="space-y-6 text-center">
                        <div className="flex justify-center">
                            <div className="flex flex-col items-start leading-tight select-none">
                                <span className="font-serif text-2xl md:text-3xl font-bold text-dark tracking-tight">
                                    {common("brand")}
                                </span>
                                {showBrandByline && (
                                    <span className="text-[0.65rem] md:text-xs font-semibold tracking-widest text-dark/60">
                                        {common("brandByline")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </header>

                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8 text-center">
                        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                            <AlertCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h1 className="text-2xl font-serif font-semibold text-charcoal mb-4 sm:text-3xl">
                            {t("errorTitle")}
                        </h1>
                        <p className="text-lg text-charcoal/70 mb-8 sm:text-xl">
                            {orderError?.message || notFoundMessage}
                        </p>
                        <Link
                            href={trackOrderUrl}
                            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[#4A8E9A] text-lg font-semibold text-white hover:bg-[#F0EDE6] transition-colors sm:h-14 sm:text-xl"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            {t("backToTrackOrder")}
                        </Link>
                    </section>
                </div>
            </div>
        );
    }

    // Main revision form
    return (
        <div className="min-h-screen bg-porcelain">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-[calc(12rem+env(safe-area-inset-bottom))] pt-10 sm:pt-16">
                <header className="space-y-6 text-center">
                    <div className="flex justify-center">
                        <div className="flex flex-col items-start leading-tight select-none">
                            <span className="font-serif text-2xl md:text-3xl font-bold text-dark tracking-tight">
                                {common("brand")}
                            </span>
                            {showBrandByline && (
                                <span className="text-[0.65rem] md:text-xs font-semibold tracking-widest text-dark/60">
                                    {common("brandByline")}
                                </span>
                            )}
                        </div>
                    </div>
                    <h1 className="text-3xl font-serif font-semibold text-charcoal sm:text-4xl">
                        {t("title")}
                    </h1>
                    <p className="text-lg text-charcoal/70 sm:text-xl">
                        {t("subtitle").replace("{name}", order.recipientName)}
                    </p>
                    <div className="flex items-center justify-center gap-2">
                        <span className="px-4 py-1.5 rounded-full bg-violet-100 text-violet-800 text-base font-medium sm:text-lg">
                            {getGenreDisplayName(order.genre, locale)}
                        </span>
                        <span className="px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-base font-medium sm:text-lg">
                            {t("revisionNumber").replace("{n}", String(order.revisionCount + 1))}
                        </span>
                    </div>
                </header>

                {/* Reference Cards - Original Text and Lyrics */}
                <div className="space-y-3">
                    {/* Original Text Card */}
                    {(order.qualities || order.memories || order.message) && (
                        <details className="group rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
                            <summary className="flex items-center justify-between cursor-pointer list-none">
                                <h3 className="font-semibold text-charcoal flex items-center gap-2 text-base sm:text-lg">
                                    <ClipboardList className="w-5 h-5 text-violet-600" />
                                    {t("originalTextTitle")}
                                </h3>
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-charcoal/5 group-hover:bg-charcoal/10 transition-colors">
                                    <ChevronDown className="w-5 h-5 text-charcoal/70 transition-transform group-open:rotate-180" />
                                </div>
                            </summary>
                            <div className="mt-4 space-y-4">
                                {order.qualities && (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-charcoal/70">{t("originalQualities")}</p>
                                        <p className="text-charcoal bg-slate-50 p-3 rounded-xl whitespace-pre-wrap text-sm border border-slate-100">
                                            {order.qualities}
                                        </p>
                                    </div>
                                )}
                                {order.memories && (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-charcoal/70">{t("originalMemories")}</p>
                                        <p className="text-charcoal bg-slate-50 p-3 rounded-xl whitespace-pre-wrap text-sm border border-slate-100">
                                            {order.memories}
                                        </p>
                                    </div>
                                )}
                                {order.message && (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-charcoal/70">{t("originalMessage")}</p>
                                        <p className="text-charcoal bg-slate-50 p-3 rounded-xl whitespace-pre-wrap text-sm border border-slate-100">
                                            {order.message}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </details>
                    )}

                    {/* Current Lyrics Card */}
                    {order.lyrics && (
                        <details className="group rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
                            <summary className="flex items-center justify-between cursor-pointer list-none">
                                <h3 className="font-semibold text-charcoal flex items-center gap-2 text-base sm:text-lg">
                                    <Music className="w-5 h-5 text-violet-600" />
                                    {t("currentLyricsLabel")}
                                </h3>
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-charcoal/5 group-hover:bg-charcoal/10 transition-colors">
                                    <ChevronDown className="w-5 h-5 text-charcoal/70 transition-transform group-open:rotate-180" />
                                </div>
                            </summary>
                            <div className="mt-4 bg-slate-50 rounded-xl p-4 max-h-80 overflow-y-auto border border-slate-100">
                                <p className="whitespace-pre-wrap text-base text-charcoal leading-relaxed">
                                    {order.lyrics.replace(/\[.*?\]/g, '')}
                                </p>
                            </div>
                        </details>
                    )}
                </div>

                {/* Form Card */}
                <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8">
                    <div className="space-y-6">
                        {/* Revision Notes Textarea */}
                        <div className={cn(
                            "space-y-3 pl-4 border-l-4 transition-colors",
                            revisionNotes.trim().length >= 10
                                ? "border-l-emerald-400"
                                : "border-l-red-400"
                        )}>
                            <label className="text-lg font-semibold text-charcoal flex items-center gap-3 sm:text-xl">
                                {revisionNotes.trim().length >= 10 ? (
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white flex-shrink-0">
                                        <Check className="w-5 h-5" />
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-pink-100 text-pink-700 text-base font-bold flex-shrink-0">1</span>
                                )}
                                <FileText className="w-6 h-6 text-pink-600" />
                                {t("notesLabel")}
                                {revisionNotes.trim().length < 10 && (
                                    <span className="text-red-500 font-normal text-sm">({t("required")})</span>
                                )}
                            </label>
                            <p className="text-base text-charcoal/60 sm:text-lg">
                                {t("notesDescription")}
                            </p>
                            <Textarea
                                ref={revisionNotesRef}
                                value={revisionNotes}
                                onChange={(e) => {
                                    setRevisionNotes(e.target.value);
                                    if (revisionNotesError) setRevisionNotesError(null);
                                }}
                                placeholder={t("notesPlaceholder")}
                                rows={5}
                                className={cn(
                                    "rounded-2xl border-charcoal/20 text-lg md:text-xl min-h-[150px]",
                                    revisionNotesError && "border-red-400 border-2"
                                )}
                            />
                            {revisionNotesError ? (
                                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 animate-pulse">
                                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                    <p className="text-base font-semibold sm:text-lg">{revisionNotesError}</p>
                                </div>
                            ) : (
                                <p className="text-sm text-charcoal/50 sm:text-base">
                                    {t("notesMinLength")}
                                </p>
                            )}

                            {/* Audio Recording Section */}
                            <div className="pt-4 border-t border-charcoal/10 space-y-3">
                                <p className="text-base text-charcoal/70 sm:text-lg">{t("audioOption")}</p>

                                {/* Record Button */}
                                {transcriptionStatus === "recording" ? (
                                    <div className="flex items-center gap-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={stopRecording}
                                            className="h-12 rounded-2xl border-red-500 text-red-600 hover:bg-red-50 text-base sm:h-14 sm:text-lg"
                                        >
                                            <Square className="w-5 h-5 mr-2 fill-red-600" />
                                            {t("stopRecording")}
                                        </Button>
                                        <span className={cn(
                                            "text-base font-mono sm:text-lg",
                                            isNearLimit ? "text-red-600 font-semibold" : "text-charcoal/70"
                                        )}>
                                            {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")} / 5:00
                                        </span>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void startRecording()}
                                        disabled={transcriptionStatus !== "idle" && transcriptionStatus !== "completed" && transcriptionStatus !== "error"}
                                        className="h-12 rounded-2xl border-pink-500 text-pink-600 hover:bg-pink-50 text-base sm:h-14 sm:text-lg"
                                    >
                                        <Mic className="w-5 h-5 mr-2" />
                                        {t("recordAudio")}
                                    </Button>
                                )}

                                {/* Time Warning */}
                                {transcriptionStatus === "recording" && isNearLimit && (
                                    <div className="p-4 rounded-2xl text-base flex items-center gap-3 bg-amber-50 text-amber-700 sm:text-lg">
                                        <AlertCircle className="w-5 h-5" />
                                        <span>{t("timeWarning")}</span>
                                    </div>
                                )}

                                {recordedAudioPreviewUrl && (
                                    <div className="rounded-2xl border border-charcoal/10 bg-slate-50 p-3 space-y-2">
                                        <p className="text-sm font-medium text-charcoal/70 sm:text-base">
                                            {t("audioPreviewLabel")}
                                        </p>
                                        <AudioPlayer
                                            src={recordedAudioPreviewUrl}
                                            title="Áudio da revisão"
                                            variant="compact"
                                            showDownload={false}
                                            showSpeedControl={true}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Transcription Status */}
                            {transcriptionStatus !== "idle" && transcriptionStatus !== "recording" && (
                                <div className={cn(
                                    "p-4 rounded-2xl text-base flex items-center gap-3 sm:text-lg",
                                    transcriptionStatus === "uploading" && "bg-blue-50 text-blue-700",
                                    transcriptionStatus === "queued" && "bg-amber-50 text-amber-700",
                                    transcriptionStatus === "processing" && "bg-amber-50 text-amber-700",
                                    transcriptionStatus === "completed" && "bg-emerald-50 text-emerald-700",
                                    transcriptionStatus === "error" && "bg-red-50 text-red-700",
                                )}>
                                    {(transcriptionStatus === "uploading" || transcriptionStatus === "queued" || transcriptionStatus === "processing") && (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    )}
                                    {transcriptionStatus === "completed" && <CheckCircle2 className="w-5 h-5" />}
                                    {transcriptionStatus === "error" && <AlertCircle className="w-5 h-5" />}

                                    <span>
                                        {transcriptionStatus === "uploading" && t("statusUploading")}
                                        {transcriptionStatus === "queued" && t("statusQueued")}
                                        {transcriptionStatus === "processing" && t("statusProcessing")}
                                        {transcriptionStatus === "completed" && t("statusCompleted")}
                                        {transcriptionStatus === "error" && (transcriptionError || t("statusError"))}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Melody Preference - shows after notes are filled (step 2) */}
                        {hasMelodyChoices && revisionNotes.trim().length >= 10 && (
                            <div ref={melodyPreferenceRef} className={cn(
                                "space-y-3 pl-4 border-l-4 transition-colors animate-in fade-in slide-in-from-top-4 duration-300",
                                melodyPreference
                                    ? "border-l-emerald-400"
                                    : "border-l-red-400"
                            )}>
                                <label className="text-lg font-semibold text-charcoal flex items-center gap-3 sm:text-xl">
                                    {melodyPreference ? (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white flex-shrink-0">
                                            <Check className="w-5 h-5" />
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-base font-bold flex-shrink-0">2</span>
                                    )}
                                    <Music className="w-6 h-6 text-purple-600" />
                                    {t("melodyPreferenceLabel")}
                                    {!melodyPreference && <span className="text-red-500">*</span>}
                                </label>
                                <p className="text-base text-charcoal/60 sm:text-lg">
                                    {t("melodyPreferenceDescription")}
                                </p>

                                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                                    {/* Keep Current Melody */}
                                    <div
                                        onClick={() => {
                                            setMelodyPreference("KEEP_CURRENT");
                                            setMelodyPreferenceError(null);
                                        }}
                                        className={cn(
                                            "relative rounded-2xl border-2 p-4 cursor-pointer transition-all",
                                            melodyPreference === "KEEP_CURRENT"
                                                ? "border-purple-500 bg-purple-50 shadow-md"
                                                : "border-charcoal/20 bg-white hover:border-purple-300 hover:bg-purple-50/50"
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5 flex-shrink-0",
                                                melodyPreference === "KEEP_CURRENT"
                                                    ? "border-purple-500 bg-purple-500"
                                                    : "border-charcoal/30"
                                            )}>
                                                {melodyPreference === "KEEP_CURRENT" && (
                                                    <Check className="w-4 h-4 text-white" />
                                                )}
                                            </div>
                                            <div>
                                                <p className={cn(
                                                    "font-semibold text-base sm:text-lg",
                                                    melodyPreference === "KEEP_CURRENT" ? "text-purple-700" : "text-charcoal"
                                                )}>
                                                    {t("melodyKeepCurrent")}
                                                </p>
                                                <p className="text-sm text-charcoal/60 mt-1">
                                                    {t("melodyKeepCurrentDescription")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Suggest New Melodies */}
                                    <div
                                        onClick={() => {
                                            setMelodyPreference("SUGGEST_NEW");
                                            setMelodyPreferenceError(null);
                                            // Reset song version when choosing new melodies (not needed)
                                            setSelectedSongVersion(null);
                                        }}
                                        className={cn(
                                            "relative rounded-2xl border-2 p-4 cursor-pointer transition-all",
                                            melodyPreference === "SUGGEST_NEW"
                                                ? "border-purple-500 bg-purple-50 shadow-md"
                                                : "border-charcoal/20 bg-white hover:border-purple-300 hover:bg-purple-50/50"
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5 flex-shrink-0",
                                                melodyPreference === "SUGGEST_NEW"
                                                    ? "border-purple-500 bg-purple-500"
                                                    : "border-charcoal/30"
                                            )}>
                                                {melodyPreference === "SUGGEST_NEW" && (
                                                    <Check className="w-4 h-4 text-white" />
                                                )}
                                            </div>
                                            <div>
                                                <p className={cn(
                                                    "font-semibold text-base sm:text-lg",
                                                    melodyPreference === "SUGGEST_NEW" ? "text-purple-700" : "text-charcoal"
                                                )}>
                                                    {t("melodySuggestNew")}
                                                </p>
                                                <p className="text-sm text-charcoal/60 mt-1">
                                                    {t("melodySuggestNewDescription")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {melodyPreferenceError && (
                                    <p className="text-red-600 text-base sm:text-lg">{melodyPreferenceError}</p>
                                )}
                            </div>
                        )}

                        {/* Song Version Selector - shows only when KEEP_CURRENT is selected (step 3) */}
                        {hasMelodyChoices && revisionNotes.trim().length >= 10 && melodyPreference === "KEEP_CURRENT" && (
                            <div ref={songVersionRef} className={cn(
                                "space-y-3 pl-4 border-l-4 transition-colors animate-in fade-in slide-in-from-top-4 duration-300",
                                selectedSongVersion
                                    ? "border-l-emerald-400"
                                    : "border-l-red-400"
                            )}>
                                <label className="text-lg font-semibold text-charcoal flex items-center gap-3 sm:text-xl">
                                    {selectedSongVersion ? (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white flex-shrink-0">
                                            <Check className="w-5 h-5" />
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-base font-bold flex-shrink-0">3</span>
                                    )}
                                    <Headphones className="w-6 h-6 text-blue-600" />
                                    {t("songVersionLabel")}
                                    {!selectedSongVersion && <span className="text-red-500">*</span>}
                                </label>
                                <p className="text-base text-charcoal/60 sm:text-lg">
                                    {t("songVersionDescription")}
                                </p>

                                <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                                    <span className="text-base font-medium sm:text-lg">{t("songVersionWarning")}</span>
                                </div>

                                <div className="space-y-3">
                                    {melodyChoices.map((choice) => (
                                        <div
                                            key={choice.id}
                                            onClick={() => {
                                                setSelectedSongVersion(choice.id);
                                                setSongVersionError(null);
                                            }}
                                            className={cn(
                                                "relative rounded-2xl border-2 p-4 cursor-pointer transition-all",
                                                selectedSongVersion === choice.id
                                                    ? "border-blue-500 bg-blue-50 shadow-md"
                                                    : "border-charcoal/20 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-3 gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className={cn(
                                                        "font-semibold text-base sm:text-lg",
                                                        selectedSongVersion === choice.id ? "text-blue-700" : "text-charcoal"
                                                    )}>
                                                        {choice.versionLabel}
                                                    </span>
                                                    <span className="text-sm text-charcoal/60">
                                                        {t("songVersionOption").replace("{n}", choice.optionNumber)}
                                                    </span>
                                                </div>
                                                <div className={cn(
                                                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0",
                                                    selectedSongVersion === choice.id
                                                        ? "border-blue-500 bg-blue-500"
                                                        : "border-charcoal/30"
                                                )}>
                                                    {selectedSongVersion === choice.id && (
                                                        <Check className="w-4 h-4 text-white" />
                                                    )}
                                                </div>
                                            </div>
                                            <AudioPlayer
                                                src={choice.url}
                                                title={choice.choiceLabel}
                                                variant="compact"
                                                showDownload={false}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {songVersionError && (
                                    <p className="text-red-600 text-base sm:text-lg">{songVersionError}</p>
                                )}
                            </div>
                        )}

                        {/* WhatsApp Contact - shows after melody preference is selected */}
                        {/* If SUGGEST_NEW: show immediately after melody preference */}
                        {/* If KEEP_CURRENT: show after song version is selected */}
                        {!order.backupWhatsApp && ((hasMelodyChoices && revisionNotes.trim().length >= 10 && (melodyPreference === "SUGGEST_NEW" || (melodyPreference === "KEEP_CURRENT" && selectedSongVersion))) || (!hasMelodyChoices && revisionNotes.trim().length >= 10)) && (
                            <div ref={whatsappRef} className={cn(
                                "space-y-3 pl-4 border-l-4 transition-colors animate-in fade-in slide-in-from-top-4 duration-300",
                                (whatsappInput.trim() || order.backupWhatsApp)
                                    ? "border-l-emerald-400"
                                    : "border-l-red-400"
                            )}>
                                <label className="text-lg font-semibold text-charcoal flex items-center gap-3 sm:text-xl">
                                    {(whatsappInput.trim() || order.backupWhatsApp) ? (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white flex-shrink-0">
                                            <Check className="w-5 h-5" />
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-base font-bold flex-shrink-0">
                                            {/* Step number: 2 if no melody choices, 3 if SUGGEST_NEW, 4 if KEEP_CURRENT */}
                                            {!hasMelodyChoices ? "2" : melodyPreference === "SUGGEST_NEW" ? "3" : "4"}
                                        </span>
                                    )}
                                    <Phone className="w-6 h-6 text-emerald-600" />
                                    {t("whatsappLabel")}
                                    {!order.backupWhatsApp && !whatsappInput.trim() && <span className="text-red-500">*</span>}
                                </label>
                                <p className="text-base text-charcoal/60 sm:text-lg">
                                    {t("whatsappDescription")}
                                </p>
                                <PhoneInput
                                    defaultCountry={getDefaultCountry()}
                                    value={whatsappInput}
                                    onChange={(phone) => {
                                        setWhatsappInput(phone);
                                        setWhatsappError(null);
                                    }}
                                    inputClassName={cn(
                                        "!w-full !py-3 !text-lg !rounded-r-2xl !border-charcoal/20 sm:!text-xl",
                                        whatsappError && "!border-red-400"
                                    )}
                                    countrySelectorStyleProps={{
                                        buttonClassName: "!py-3 !px-3 !rounded-l-2xl !border-charcoal/20",
                                    }}
                                    className="w-full"
                                />
                                {whatsappError && (
                                    <p className="text-red-600 text-base sm:text-lg">{whatsappError}</p>
                                )}
                            </div>
                        )}

                        {/* Error message */}
                        {requestRevision.error && (
                            <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                                <AlertCircle className="mt-0.5 h-5 w-5" />
                                <p className="text-base sm:text-lg">{requestRevision.error.message}</p>
                            </div>
                        )}

                    </div>
                </section>

                {/* Info Box */}
                <div className="rounded-2xl bg-amber-50 px-5 py-4 text-base text-amber-900 sm:text-lg">
                    <p className="font-bold mb-2 text-lg sm:text-xl">{t("infoTitle")}</p>
                    <p>
                        {t("infoLine1")}
                        <span className="font-bold">{t("infoTime")}</span>
                        {t("infoLine2")}
                        <span className="font-bold text-red-600">{t("infoWarning")}</span>
                        {t("infoLine3")}
                        <span className="font-bold text-red-600">{t("infoFee")}</span>
                        {t("infoLine4")}
                        <span className="font-bold text-emerald-600">{t("infoFree")}</span>.
                    </p>
                </div>
            </div>

            {/* Floating Submit Button */}
            {(() => {
                // Check if form is complete
                const notesComplete = revisionNotes.trim().length >= 10;
                const melodyComplete = !hasMelodyChoices || melodyPreference;
                // Song version only required when KEEP_CURRENT is selected
                const songVersionComplete = melodyPreference !== "KEEP_CURRENT" || selectedSongVersion;
                const whatsappComplete = !!(order.backupWhatsApp || whatsappInput.trim());
                const isFormComplete = notesComplete && melodyComplete && songVersionComplete && whatsappComplete;

                return (
                    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-charcoal/10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
                        <div className="mx-auto max-w-3xl px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-4 sm:flex-row sm:gap-6 sm:pt-5 sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                            <Button
                                onClick={handleSubmit}
                                disabled={requestRevision.isPending}
                                className="h-14 rounded-2xl bg-emerald-600 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-wait sm:h-14 sm:text-xl shadow-lg order-1 sm:order-2 sm:flex-1"
                            >
                                {requestRevision.isPending ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        {t("submitting")}
                                    </span>
                                ) : (
                                    t("submit")
                                )}
                            </Button>
                            <Link
                                href={trackOrderUrl}
                                className="inline-flex items-center justify-center h-12 px-6 rounded-2xl bg-red-500 text-base font-semibold text-white hover:bg-red-600 transition-colors sm:h-14 sm:text-lg order-2 sm:order-1"
                            >
                                {t("cancel")}
                            </Link>
                        </div>
                    </div>
                );
            })()}

            {/* Confirmation Dialog */}
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif text-charcoal sm:text-3xl">
                            {t("confirmTitle")}
                        </DialogTitle>
                        <DialogDescription className="text-lg text-charcoal/70 sm:text-xl">
                            {t("confirmDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {/* Revision Notes */}
                        <div>
                            <p className="text-base font-semibold text-charcoal mb-2 sm:text-lg">{t("notesLabel")}</p>
                            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 max-h-32 overflow-y-auto">
                                <p className="text-base text-charcoal whitespace-pre-wrap sm:text-lg">{revisionNotes}</p>
                            </div>
                        </div>

                        {/* Selected Song Version */}
                        {selectedMelodyChoice && (
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50 border border-blue-200">
                                <Headphones className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                <div>
                                    <p className="text-base font-semibold text-blue-800 sm:text-lg">
                                        {selectedMelodyChoice.choiceLabel}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Melody Preference */}
                        {melodyPreference && (
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-purple-50 border border-purple-200">
                                <Music className="w-5 h-5 text-purple-600 flex-shrink-0" />
                                <div>
                                    <p className="text-base font-semibold text-purple-800 sm:text-lg">
                                        {melodyPreference === "KEEP_CURRENT" ? t("melodyKeepCurrent") : t("melodySuggestNew")}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* WhatsApp */}
                        {!order.backupWhatsApp && whatsappInput && (
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                                <Phone className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                                <div>
                                    <p className="text-base font-semibold text-emerald-800 sm:text-lg">
                                        {whatsappInput}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex-col gap-3 sm:flex-row">
                        <button
                            onClick={() => setShowConfirmDialog(false)}
                            className="w-full h-12 rounded-2xl border-2 border-charcoal/20 text-lg font-semibold text-charcoal hover:bg-charcoal/5 transition-colors sm:w-auto sm:px-6 sm:h-14 sm:text-xl"
                        >
                            {t("confirmCancel")}
                        </button>
                        <button
                            onClick={handleConfirmSubmit}
                            disabled={requestRevision.isPending}
                            className="w-full h-12 rounded-2xl bg-pink-600 text-lg font-semibold text-white hover:bg-pink-700 transition-colors disabled:opacity-50 sm:w-auto sm:px-6 sm:h-14 sm:text-xl"
                        >
                            {requestRevision.isPending ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    {t("submitting")}
                                </span>
                            ) : (
                                t("confirmSubmit")
                            )}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
