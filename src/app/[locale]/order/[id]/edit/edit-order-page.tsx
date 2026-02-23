"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Loader2, Save } from "lucide-react";
import { useLocale, useTranslations } from "~/i18n/provider";
import { api, type RouterOutputs } from "~/trpc/react";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import { normalizeEmail } from "~/lib/normalize-email";
import { GENRE_NAMES, RELATIONSHIP_NAMES } from "~/lib/lyrics-generator";
import { genreTypes, recipientTypes, vocalTypes } from "~/lib/validations/song-order";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const GENRE_OPTIONS = {
    en: ["pop", "country", "rock", "rnb", "jazz", "worship", "hiphop"],
    pt: ["worship", "pop", "country", "sertanejo-raiz", "sertanejo-universitario", "sertanejo-romantico", "rock", "jovem-guarda", "rock-classico", "pop-rock-brasileiro", "heavy-metal", "rnb", "jazz", "hiphop", "funk", "funk-carioca", "funk-paulista", "funk-melody", "brega", "brega-romantico", "tecnobrega", "samba", "pagode", "pagode-de-mesa", "pagode-romantico", "pagode-universitario", "forro", "forro-pe-de-serra-rapido", "forro-pe-de-serra-lento", "forro-universitario", "forro-eletronico", "axe", "capoeira", "mpb", "mpb-bossa-nova", "mpb-cancao-brasileira", "mpb-pop", "mpb-intimista", "reggae", "lullaby", "latina", "salsa", "merengue", "bachata", "bolero", "tango", "valsa", "musica-classica"],
    es: ["balada", "adoracion", "bachata", "salsa", "ranchera", "cumbia", "pop", "rnb", "hiphop", "rock", "tango"],
    fr: ["chanson", "balada", "variete", "worship", "pop", "jazz", "rnb", "hiphop", "rock"],
    it: ["balada", "napoletana", "lirico", "worship", "pop", "jazz", "lullaby", "tarantella", "rock"],
} as const;

type EditableOrder = RouterOutputs["songOrder"]["getEditableOrder"];
type StorySource = Pick<
    EditableOrder,
    "recipientName" | "recipient" | "genre" | "vocals" | "qualities" | "memories" | "message"
>;

type RecipientType = (typeof recipientTypes)[number];
type GenreType = (typeof genreTypes)[number];
type VocalType = (typeof vocalTypes)[number];

type StoryDraft = {
    recipientName: string;
    recipient: RecipientType;
    genre: GenreType;
    vocals: VocalType;
    qualities: string;
    memories: string;
    message: string;
};

type GuidedFieldKey = "qualities" | "memories" | "message";
type GuidedAutoBlocks = Record<GuidedFieldKey, string>;

type GuidedQuestionsContent = {
    intro: string;
    sectionTitle: string;
    sectionSubtitle: string;
    defaultRecipient: string;
    items: Array<{
        title: string;
        description: string;
    }>;
    footer: string;
    answerHint: string;
    answerPlaceholder: string;
    autoAddedLabel: string;
    toneLabel: string;
    toneHint: string;
    toneOptions: Record<string, string>;
};

const TONE_KEYS = ["joyful", "emotional", "nostalgic", "grateful", "romantic", "hopeful", "reflective", "playful"] as const;
type ToneKey = (typeof TONE_KEYS)[number];

const toTitleCase = (value: string) =>
    value.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

const buildStoryDraft = (source: StorySource): StoryDraft => ({
    recipientName: toTitleCase(source.recipientName ?? ""),
    recipient: (source.recipient ?? "other") as RecipientType,
    genre: (source.genre ?? "pop") as GenreType,
    vocals: (source.vocals ?? "either") as VocalType,
    qualities: source.qualities ?? "",
    memories: source.memories ?? "",
    message: source.message ?? "",
});

const normalizeStoryDraft = (draft: StoryDraft) => ({
    recipientName: draft.recipientName.trim(),
    recipient: draft.recipient,
    genre: draft.genre,
    vocals: draft.vocals,
    qualities: draft.qualities.trim(),
    memories: draft.memories.trim(),
    message: draft.message.trim(),
});

const STORAGE_KEY_PREFIX = "order-edit-draft";

const isValidDraft = (draft: any): draft is StoryDraft => {
    if (!draft || typeof draft !== "object") return false;
    return (
        typeof draft.recipientName === "string" &&
        recipientTypes.includes(draft.recipient) &&
        genreTypes.includes(draft.genre) &&
        vocalTypes.includes(draft.vocals) &&
        typeof draft.qualities === "string" &&
        typeof draft.memories === "string" &&
        typeof draft.message === "string"
    );
};

export function EditOrderPageClient({ orderId }: { orderId: string }) {
    const t = useTranslations("order-edit");
    const quiz = useTranslations("create.quiz");
    const common = useTranslations("common");
    const locale = useLocale();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [emailInput, setEmailInput] = useState("");
    const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [storyDraft, setStoryDraft] = useState<StoryDraft | null>(null);
    const [storySnapshot, setStorySnapshot] = useState<StoryDraft | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [showErrors, setShowErrors] = useState(false);
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    const [showEmailForm, setShowEmailForm] = useState(true);
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [showSavedDialog, setShowSavedDialog] = useState(false);
    const [savedChanges, setSavedChanges] = useState<string[]>([]);
    const [guidedAnswers, setGuidedAnswers] = useState<string[]>([]);
    const [selectedTones, setSelectedTones] = useState<ToneKey[]>([]);
    const [guidedAutoLockedFields, setGuidedAutoLockedFields] = useState<Record<GuidedFieldKey, boolean>>({
        qualities: false,
        memories: false,
        message: false,
    });
    const [guidedAutoBlocks, setGuidedAutoBlocks] = useState<GuidedAutoBlocks>({
        qualities: "",
        memories: "",
        message: "",
    });
    const preSnapshotRef = useRef<StoryDraft | null>(null);
    const guidedAutoBlocksRef = useRef<GuidedAutoBlocks>({
        qualities: "",
        memories: "",
        message: "",
    });

    const initialEmailParam = useMemo(() => searchParams.get("email"), [searchParams]);
    const invalidEmailMessage = t("email.invalid");
    const notFoundMessage = t("email.notFound");
    const notEditableMessage = t("email.notEditable");
    const genericErrorMessage = t("email.error");
    const guidedQuestions = t.raw("form.guidedQuestions") as GuidedQuestionsContent;
    const draftStorageKey = useMemo(() => {
        if (!submittedEmail) return null;
        return `${STORAGE_KEY_PREFIX}:${orderId}:${submittedEmail}`;
    }, [orderId, submittedEmail]);

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
    }, [initialEmailParam, submittedEmail]);

    useEffect(() => {
        if (!draftStorageKey || !submittedEmail) return;
        try {
            const raw = localStorage.getItem(draftStorageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                orderId: string;
                email: string;
                draft: StoryDraft;
            };
            if (!parsed || parsed.orderId !== orderId || parsed.email !== submittedEmail) return;
            if (!isValidDraft(parsed.draft)) return;
            setStoryDraft(parsed.draft);
            setShowEmailForm(false);
        } catch {
            return;
        }
    }, [draftStorageKey, orderId, submittedEmail]);

    const {
        data: order,
        error: lookupErrorObj,
        isLoading: isLookupLoading,
        isFetching: isLookupFetching,
    } =
        api.songOrder.getEditableOrder.useQuery(
            {
                orderId,
                email: submittedEmail ?? "",
            },
            {
                enabled: Boolean(submittedEmail),
                retry: false,
                staleTime: 60 * 1000,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
            }
        );

    useEffect(() => {
        if (!order || !submittedEmail) return;
        const nextKey = `${order.id}:${submittedEmail}`;
        if (loadedKey === nextKey) return;
        const baseDraft = buildStoryDraft(order);
        setStoryDraft((current) => current ?? baseDraft);
        setStorySnapshot(baseDraft);
        setLoadedKey(nextKey);
        setLookupError(null);
        setSaveStatus("idle");
        setSaveError(null);
        setShowErrors(false);
        setShowEmailForm(false);
        setGuidedAnswers(new Array(guidedQuestions.items.length).fill(""));
        setGuidedAutoLockedFields({
            qualities: false,
            memories: false,
            message: false,
        });
        guidedAutoBlocksRef.current = {
            qualities: "",
            memories: "",
            message: "",
        };
        setGuidedAutoBlocks({
            qualities: "",
            memories: "",
            message: "",
        });
    }, [guidedQuestions.items.length, loadedKey, order, submittedEmail]);

    useEffect(() => {
        if (!lookupErrorObj) return;
        const code = lookupErrorObj.data?.code ?? lookupErrorObj.shape?.data?.code;
        if (code === "NOT_FOUND") {
            setLookupError(notFoundMessage);
        } else if (code === "BAD_REQUEST") {
            setLookupError(notEditableMessage);
        } else {
            setLookupError(genericErrorMessage);
        }
        setShowEmailForm(true);
    }, [genericErrorMessage, lookupErrorObj, notEditableMessage, notFoundMessage]);

    useEffect(() => {
        if (!draftStorageKey || !submittedEmail || !storyDraft) return;
        const payload = {
            orderId,
            email: submittedEmail,
            draft: storyDraft,
            updatedAt: new Date().toISOString(),
        };
        try {
            localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        } catch {
            return;
        }
    }, [draftStorageKey, orderId, storyDraft, submittedEmail]);

    const DIFF_FIELDS = ["recipientName", "recipient", "genre", "vocals", "qualities", "memories", "message"] as const;

    const updateStoryDetails = api.songOrder.updateStoryDetails.useMutation({
        onSuccess: (data) => {
            const nextDraft = buildStoryDraft(data);
            const oldSnap = preSnapshotRef.current;
            if (oldSnap) {
                const oldNorm = normalizeStoryDraft(oldSnap);
                const newNorm = normalizeStoryDraft(nextDraft);
                const changed = DIFF_FIELDS.filter(
                    (key) => oldNorm[key] !== newNorm[key]
                ).map((key) => t(`form.savedDialog.fields.${key}`));
                setSavedChanges(changed);
            }
            preSnapshotRef.current = null;
            setStoryDraft(nextDraft);
            setStorySnapshot(nextDraft);
            setSaveStatus("saved");
            setSaveError(null);
            setShowErrors(false);
            setShowSavedDialog(true);
        },
        onError: (error) => {
            const code = error.data?.code ?? error.shape?.data?.code;
            if (code === "TOO_MANY_REQUESTS") {
                setSaveError(t("form.cooldown"));
            } else {
                setSaveError(t("form.error"));
            }
            setSaveStatus("error");
        },
    });

    const normalizedDraft = useMemo(
        () => (storyDraft ? normalizeStoryDraft(storyDraft) : null),
        [storyDraft]
    );
    const normalizedSnapshot = useMemo(
        () => (storySnapshot ? normalizeStoryDraft(storySnapshot) : null),
        [storySnapshot]
    );

    const isRecipientNameInvalid = Boolean(
        normalizedDraft &&
            normalizedDraft.recipient !== "group" &&
            normalizedDraft.recipientName.length === 0
    );
    const isQualitiesInvalid = Boolean(
        normalizedDraft && normalizedDraft.qualities.length < 10
    );
    const isMemoriesInvalid = Boolean(
        normalizedDraft && normalizedDraft.memories.length < 10
    );
    const isStoryValid = Boolean(
        normalizedDraft && !isRecipientNameInvalid && !isQualitiesInvalid && !isMemoriesInvalid
    );
    const isStoryUnchanged = normalizedDraft && normalizedSnapshot
        ? JSON.stringify(normalizedDraft) === JSON.stringify(normalizedSnapshot)
        : true;

    const isSaving = updateStoryDetails.isPending;

    const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalized = normalizeEmail(emailInput);
        if (!EMAIL_REGEX.test(normalized)) {
            setEmailError(t("email.invalid"));
            return;
        }
        setEmailError(null);
        setLookupError(null);
        setSaveStatus("idle");
        setSaveError(null);
        setShowErrors(false);
        setShowEmailForm(true);
        setEmailInput(normalized);
        setSubmittedEmail(normalized);
        setStoryDraft(null);
        setStorySnapshot(null);
        setLoadedKey(null);
        setGuidedAnswers(new Array(guidedQuestions.items.length).fill(""));
        setGuidedAutoLockedFields({
            qualities: false,
            memories: false,
            message: false,
        });
        guidedAutoBlocksRef.current = {
            qualities: "",
            memories: "",
            message: "",
        };
        setGuidedAutoBlocks({
            qualities: "",
            memories: "",
            message: "",
        });
    };

    const handleStoryFieldChange = <K extends keyof StoryDraft>(field: K, value: StoryDraft[K]) => {
        setStoryDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
        if (field === "qualities" || field === "memories" || field === "message") {
            setGuidedAutoLockedFields((previous) => ({
                ...previous,
                [field]: true,
            }));
        }
        setSaveStatus("idle");
        setSaveError(null);
    };

    const handleSaveStory = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!normalizedDraft || !submittedEmail) return;
        setShowErrors(true);
        if (!isStoryValid) {
            setSaveError(t("form.required"));
            return;
        }
        if (isStoryUnchanged) {
            return;
        }
        preSnapshotRef.current = storySnapshot;
        updateStoryDetails.mutate({
            orderId,
            email: submittedEmail,
            recipientName: normalizedDraft.recipientName,
            recipient: normalizedDraft.recipient,
            genre: normalizedDraft.genre,
            vocals: normalizedDraft.vocals,
            qualities: normalizedDraft.qualities,
            memories: normalizedDraft.memories,
            message: normalizedDraft.message || null,
        });
    };

    const handleTrackOrderClick = () => {
        if (!isStoryUnchanged) {
            setShowUnsavedDialog(true);
            return;
        }
        router.push(trackOrderUrl);
    };

    const genreOptionsForLocale =
        (GENRE_OPTIONS[locale as keyof typeof GENRE_OPTIONS] ?? GENRE_OPTIONS.en) as readonly string[];
    const genreOptions = useMemo(() => {
        if (!normalizedDraft) return genreOptionsForLocale;
        if (genreOptionsForLocale.includes(normalizedDraft.genre)) {
            return genreOptionsForLocale;
        }
        return [normalizedDraft.genre, ...genreOptionsForLocale];
    }, [genreOptionsForLocale, normalizedDraft]);

    const recipientLabel = quiz("steps.basics.recipient.label");
    const nameLabel = normalizedDraft?.recipient === "myself"
        ? quiz("steps.basics.name.labelSelf")
        : normalizedDraft?.recipient === "group"
        ? quiz("steps.basics.name.labelGroup")
        : quiz("steps.basics.name.label");
    const namePlaceholder = normalizedDraft?.recipient === "myself"
        ? quiz("steps.basics.name.placeholderSelf")
        : normalizedDraft?.recipient === "group"
        ? quiz("steps.basics.name.placeholderGroup")
        : quiz("steps.basics.name.placeholder");

    const qualitiesLabel = normalizedDraft?.recipient === "myself"
        ? quiz("steps.qualities.qualities.labelSelf")
        : quiz("steps.qualities.qualities.label");
    const qualitiesPlaceholder = normalizedDraft?.recipient === "myself"
        ? quiz("steps.qualities.qualities.placeholderSelf")
        : quiz("steps.qualities.qualities.placeholder");

    const memoriesLabel = normalizedDraft?.recipient === "myself"
        ? quiz("steps.memories.memories.labelSelf")
        : quiz("steps.memories.memories.label");
    const memoriesPlaceholder = normalizedDraft?.recipient === "myself"
        ? quiz("steps.memories.memories.placeholderSelf")
        : quiz("steps.memories.memories.placeholder");

    const messageLabel = normalizedDraft?.recipient === "myself"
        ? quiz("steps.message.message.labelSelf")
        : quiz("steps.message.message.label");
    const messagePlaceholder = normalizedDraft?.recipient === "myself"
        ? quiz("steps.message.message.placeholderSelf")
        : quiz("steps.message.message.placeholder");

    const genreLabel = quiz("steps.genre.genre.label");
    const vocalsLabel = quiz("steps.genre.vocals.label");

    useEffect(() => {
        const expectedLength = guidedQuestions.items.length;
        setGuidedAnswers((previous) => {
            if (previous.length === expectedLength) return previous;
            const next = new Array(expectedLength).fill("");
            previous.forEach((answer, index) => {
                if (index < next.length) next[index] = answer;
            });
            return next;
        });
    }, [guidedQuestions.items.length]);

    const getRelationshipLabel = (recipient: RecipientType) =>
        RELATIONSHIP_NAMES[recipient]?.[locale] || recipient;
    const getGenreLabel = (genre: GenreType) =>
        GENRE_NAMES[genre]?.[locale] || genre.charAt(0).toUpperCase() + genre.slice(1);

    const recipientNameForPrompt =
        normalizedDraft?.recipientName.trim() || guidedQuestions.defaultRecipient;
    const withRecipientName = (text: string) =>
        text.replace(/\{name\}/g, recipientNameForPrompt);
    const pageTitle = normalizedDraft?.recipientName.trim()
        ? t("titleWithRecipient", { name: normalizedDraft.recipientName.trim() })
        : t("title");
    const hasGuidedAnswer = guidedAnswers.some((answer) => answer.trim().length > 0) || selectedTones.length > 0;
    const stage1Title = t("stages.step1.title");
    const stage1Subtitle = t("stages.step1.subtitle");
    const stage2Title = normalizedDraft?.recipientName
        ? t("stages.step2.title", { name: normalizedDraft.recipientName })
        : t("stages.step2.titleFallback");
    const stage2Subtitle = t("stages.step2.subtitle");
    const stage3Title = t("stages.step3.title");
    const stage3Subtitle = t("stages.step3.subtitle");

    const mergeGuidedAutoBlock = (current: string, previousAuto: string, nextAuto: string) => {
        let base = current.trim();
        const previousTrimmed = previousAuto.trim();
        const nextTrimmed = nextAuto.trim();

        if (previousTrimmed) {
            if (base === previousTrimmed) {
                base = "";
            } else if (base.endsWith(`\n\n${previousTrimmed}`)) {
                base = base.slice(0, -(`\n\n${previousTrimmed}`).length).trim();
            } else if (base.startsWith(`${previousTrimmed}\n\n`)) {
                base = base.slice((`${previousTrimmed}\n\n`).length).trim();
            } else {
                base = base.replace(previousTrimmed, "").replace(/\n{3,}/g, "\n\n").trim();
            }
        }

        if (!nextTrimmed) return base;
        if (!base) return nextTrimmed;
        if (base.includes(nextTrimmed)) return base;
        return `${base}\n\n${nextTrimmed}`;
    };

    const handleToneToggle = (tone: ToneKey) => {
        setSelectedTones((prev) =>
            prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
        );
        setSaveStatus("idle");
        setSaveError(null);
    };

    const handleGuidedAnswerChange = (index: number, value: string) => {
        setGuidedAnswers((previous) =>
            previous.map((currentValue, currentIndex) =>
                currentIndex === index ? value : currentValue
            )
        );
        setSaveStatus("idle");
        setSaveError(null);
    };

    useEffect(() => {
        const hasPreviousAuto = Object.values(guidedAutoBlocksRef.current).some(
            (value) => value.trim().length > 0
        );
        if (!hasGuidedAnswer && !hasPreviousAuto) return;
        const answers = guidedAnswers.map((answer) => answer.trim());
        const toneText = selectedTones.length > 0
            ? `[Tom desejado para a homenagem: ${selectedTones.map((t) => guidedQuestions.toneOptions[t]).join(", ")}]`
            : "";
        const nextAutoBlocks: GuidedAutoBlocks = {
            qualities: [answers[1], answers[4], answers[5]].filter(Boolean).join("\n\n"),
            memories: [answers[0], answers[2], answers[3], answers[6]].filter(Boolean).join("\n\n"),
            message: [toneText, answers[7], answers[3], answers[6], answers[4]].filter(Boolean).join("\n\n"),
        };
        const previousAutoBlocks = guidedAutoBlocksRef.current;

        setStoryDraft((previous) => {
            if (!previous) return previous;
            const nextDraft = {
                ...previous,
                qualities: guidedAutoLockedFields.qualities
                    ? previous.qualities
                    : mergeGuidedAutoBlock(previous.qualities, previousAutoBlocks.qualities, nextAutoBlocks.qualities),
                memories: guidedAutoLockedFields.memories
                    ? previous.memories
                    : mergeGuidedAutoBlock(previous.memories, previousAutoBlocks.memories, nextAutoBlocks.memories),
                message: guidedAutoLockedFields.message
                    ? previous.message
                    : mergeGuidedAutoBlock(previous.message, previousAutoBlocks.message, nextAutoBlocks.message),
            };
            if (
                nextDraft.qualities === previous.qualities &&
                nextDraft.memories === previous.memories &&
                nextDraft.message === previous.message
            ) {
                return previous;
            }
            return nextDraft;
        });
        guidedAutoBlocksRef.current = nextAutoBlocks;
        setGuidedAutoBlocks(nextAutoBlocks);
        setSaveStatus("idle");
        setSaveError(null);
    }, [guidedAnswers, guidedAutoLockedFields, hasGuidedAnswer, selectedTones, guidedQuestions.toneOptions]);

    const showBrandByline = locale !== "en";
    const trackOrderUrl = submittedEmail
        ? `/${locale}/track-order?email=${encodeURIComponent(submittedEmail)}`
        : `/${locale}/track-order`;

    return (
        <div className="min-h-screen bg-porcelain">
            <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16 pt-8 sm:gap-6 sm:px-5 sm:pt-16">
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
                    <h1 className="text-2xl font-serif font-semibold text-charcoal sm:text-3xl">
                        {pageTitle}
                    </h1>
                    <p className="text-base text-charcoal/70 sm:text-lg">
                        {t("subtitle")}
                    </p>
                </header>

                {showEmailForm && (
                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8">
                        <div>
                            <h2 className="text-xl font-semibold text-charcoal sm:text-2xl">
                                {t("email.title")}
                            </h2>
                            <p className="mt-1 text-base text-charcoal/70 sm:text-lg">
                                {t("email.subtitle")}
                            </p>
                        </div>

                        <form className="mt-6 space-y-4" onSubmit={handleEmailSubmit}>
                            <div className="space-y-2">
                                <label className="text-lg font-semibold text-charcoal sm:text-xl">
                                    {t("email.label")}
                                </label>
                                <Input
                                    type="email"
                                    value={emailInput}
                                    onChange={(event) => setEmailInput(event.target.value)}
                                    placeholder={t("email.placeholder")}
                                    autoComplete="email"
                                className={cn(
                                    "!h-12 rounded-2xl border-charcoal/20 !text-lg sm:!h-14 md:!text-xl",
                                    emailError ? "border-red-400" : ""
                                )}
                                />
                            </div>

                            {(emailError || lookupError) && (
                                <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                                    <AlertCircle className="mt-0.5 h-5 w-5" />
                                    <p className="text-sm sm:text-base">
                                        {emailError || lookupError}
                                    </p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="h-12 w-full rounded-2xl bg-[#4A8E9A] text-lg font-semibold text-white hover:bg-[#F0EDE6] sm:h-14 sm:text-xl"
                                disabled={isLookupLoading || isLookupFetching}
                            >
                                {isLookupLoading || isLookupFetching ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        {t("email.checking")}
                                    </span>
                                ) : (
                                    t("email.button")
                                )}
                            </Button>
                        </form>

                        {storyDraft && !lookupError && (
                            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 sm:text-base">
                                <CheckCircle2 className="h-5 w-5" />
                                <span>
                                    {storyDraft.recipientName ? `${storyDraft.recipientName} • ` : ""}
                                    {getGenreLabel(storyDraft.genre)}
                                </span>
                            </div>
                        )}
                    </section>
                )}

                {!order && submittedEmail && !showEmailForm && (isLookupLoading || isLookupFetching) && (
                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-6 shadow-sm sm:p-8">
                        <div>
                            <h2 className="text-xl font-semibold text-charcoal sm:text-2xl">
                                {t("email.title")}
                            </h2>
                            <p className="mt-1 text-base text-charcoal/70 sm:text-lg">
                                {t("email.subtitle")}
                            </p>
                        </div>
                        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-charcoal/10 bg-white px-4 py-3 text-charcoal/70">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-base sm:text-lg">{t("email.checking")}</span>
                        </div>
                    </section>
                )}

                {order && submittedEmail && !showEmailForm && (
                    <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700/70">
                                        {t("email.confirmedLabel")}
                                    </p>
                                    <p className="text-lg font-semibold text-emerald-900 sm:text-xl">
                                        {submittedEmail}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 rounded-2xl border-emerald-200 text-base font-semibold text-emerald-900 hover:bg-emerald-100 sm:h-12"
                                onClick={() => setShowEmailForm(true)}
                            >
                                {t("email.change")}
                            </Button>
                        </div>
                    </section>
                )}

                {order && storyDraft && (
                    <section className="rounded-3xl border border-charcoal/10 bg-white/90 p-4 shadow-sm sm:p-8">
                        <form className="space-y-5" onSubmit={handleSaveStory}>
                            {/* Step 1 — Basic fields */}
                            <div className="rounded-2xl border border-[#E8DDD3] bg-porcelain p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4A8E9A] text-lg font-bold text-white shadow-[0_10px_20px_-12px_rgba(60,36,21,0.9)]">
                                        1
                                    </div>
                                    <div>
                                        <h2 className="mt-1 text-xl font-semibold text-charcoal sm:text-2xl">
                                            {stage1Title}
                                        </h2>
                                    </div>
                                </div>
                                <div className="mt-4 rounded-xl border border-charcoal/10 bg-white p-4">
                                    <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-charcoal sm:text-base md:flex-1 md:flex md:items-end">
                                                {nameLabel}
                                            </label>
                                            <Input
                                                type="text"
                                                value={storyDraft.recipientName}
                                                onChange={(event) => handleStoryFieldChange("recipientName", toTitleCase(event.target.value))}
                                                placeholder={namePlaceholder}
                                                maxLength={100}
                                                className={cn(
                                                    "!h-12 rounded-xl border-charcoal/15 bg-porcelain !text-lg focus-visible:ring-[#4A8E9A]/30 sm:!h-14 sm:!text-xl",
                                                    showErrors && isRecipientNameInvalid ? "border-red-400" : ""
                                                )}
                                            />
                                            {showErrors && isRecipientNameInvalid && (
                                                <p className="text-sm text-red-600">
                                                    {t("validation.required")}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-charcoal sm:text-base md:flex-1 md:flex md:items-end">
                                                {recipientLabel}
                                            </label>
                                            <select
                                                value={storyDraft.recipient}
                                                onChange={(event) =>
                                                    handleStoryFieldChange("recipient", event.target.value as RecipientType)
                                                }
                                                className="h-12 w-full rounded-xl border border-charcoal/15 bg-porcelain px-3 text-lg text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/30 sm:h-14 sm:text-xl"
                                            >
                                                {recipientTypes.map((recipient) => (
                                                    <option key={recipient} value={recipient}>
                                                        {getRelationshipLabel(recipient)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-charcoal sm:text-base md:flex-1 md:flex md:items-end">
                                                {genreLabel}
                                            </label>
                                            <select
                                                value={storyDraft.genre}
                                                onChange={(event) =>
                                                    handleStoryFieldChange("genre", event.target.value as GenreType)
                                                }
                                                className="h-12 w-full rounded-xl border border-charcoal/15 bg-porcelain px-3 text-lg text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/30 sm:h-14 sm:text-xl"
                                            >
                                                {genreOptions.map((genre) => (
                                                    <option key={genre} value={genre}>
                                                        {getGenreLabel(genre as GenreType)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-charcoal sm:text-base md:flex-1 md:flex md:items-end">
                                                {vocalsLabel}
                                            </label>
                                            <select
                                                value={storyDraft.vocals}
                                                onChange={(event) =>
                                                    handleStoryFieldChange("vocals", event.target.value as VocalType)
                                                }
                                                className="h-12 w-full rounded-xl border border-charcoal/15 bg-porcelain px-3 text-lg text-charcoal focus:outline-none focus:ring-2 focus:ring-[#4A8E9A]/30 sm:h-14 sm:text-xl"
                                            >
                                                {vocalTypes.map((voice) => (
                                                    <option key={voice} value={voice}>
                                                        {quiz(`steps.genre.vocals.options.${voice}`)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step 2 — Guided questions */}
                            <div className="rounded-2xl border border-[#E8DDD3] bg-porcelain p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4A8E9A] text-lg font-bold text-white shadow-[0_10px_20px_-12px_rgba(60,36,21,0.9)]">
                                        2
                                    </div>
                                    <div>
                                        <h3 className="mt-1 text-xl font-semibold text-charcoal sm:text-2xl">
                                            {stage2Title}
                                        </h3>
                                    </div>
                                </div>

                                {/* Tone selector */}
                                <div className="mt-4 rounded-xl border border-charcoal/10 bg-white p-4">
                                    <p className="text-base font-semibold text-charcoal sm:text-lg">
                                        {guidedQuestions.toneLabel}
                                    </p>
                                    <p className="mt-1 text-sm text-charcoal/60">
                                        {guidedQuestions.toneHint}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {TONE_KEYS.map((tone) => (
                                            <button
                                                key={tone}
                                                type="button"
                                                onClick={() => handleToneToggle(tone)}
                                                className={cn(
                                                    "rounded-full border px-4 py-2 text-sm font-medium transition-all sm:text-base",
                                                    selectedTones.includes(tone)
                                                        ? "border-[#4A8E9A] bg-[#4A8E9A] text-dark shadow-[0_4px_12px_-4px_rgba(60,36,21,0.5)]"
                                                        : "border-charcoal/15 bg-porcelain text-charcoal/70 hover:border-[#4A8E9A]/40 hover:text-charcoal"
                                                )}
                                            >
                                                {guidedQuestions.toneOptions[tone]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-3 space-y-3">
                                    {guidedQuestions.items.map((question, index) => (
                                        <div
                                            key={`${question.title}-${index}`}
                                            className="rounded-xl border border-charcoal/10 bg-white p-4"
                                        >
                                            <p className="text-base font-semibold text-charcoal sm:text-lg">
                                                {question.title}
                                            </p>
                                            <p className="mt-1 text-sm leading-relaxed text-charcoal/70 sm:text-base">
                                                {withRecipientName(question.description)}
                                            </p>
                                            <Textarea
                                                value={guidedAnswers[index] ?? ""}
                                                onChange={(event) => handleGuidedAnswerChange(index, event.target.value)}
                                                placeholder={guidedQuestions.answerPlaceholder}
                                                rows={3}
                                                maxLength={5000}
                                                className="mt-2 rounded-xl border-charcoal/15 bg-porcelain text-lg text-charcoal placeholder:text-charcoal/40 focus-visible:ring-[#4A8E9A]/30 md:text-xl"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-charcoal/50 sm:text-base">
                                    {guidedQuestions.answerHint}
                                </p>
                            </div>

                            {/* Story textareas */}
                            <div className="mt-5 rounded-2xl border border-[#E8DDD3] bg-porcelain p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4A8E9A] text-lg font-bold text-white shadow-[0_10px_20px_-12px_rgba(60,36,21,0.9)]">
                                        3
                                    </div>
                                    <div>
                                        <h3 className="mt-1 text-xl font-semibold text-charcoal sm:text-2xl">
                                            {stage3Title}
                                        </h3>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-3">
                                    <div className="rounded-xl border border-charcoal/10 bg-white p-4">
                                        <label className="text-base font-semibold text-charcoal sm:text-lg">
                                            {qualitiesLabel}
                                        </label>
                                        {guidedAutoBlocks.qualities.trim().length > 0 && (
                                            <div className="mt-2 rounded-lg border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 px-3 py-2.5">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A2E]/70 sm:text-sm">
                                                    {guidedQuestions.autoAddedLabel}
                                                </p>
                                                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/80 sm:text-base">
                                                    {guidedAutoBlocks.qualities}
                                                </p>
                                            </div>
                                        )}
                                        <Textarea
                                            value={storyDraft.qualities}
                                            onChange={(event) => handleStoryFieldChange("qualities", event.target.value)}
                                            placeholder={qualitiesPlaceholder}
                                            rows={4}
                                            maxLength={5000}
                                            className={cn(
                                                "mt-2 rounded-xl border-charcoal/15 bg-porcelain text-lg focus-visible:ring-[#4A8E9A]/30 md:text-xl",
                                                showErrors && isQualitiesInvalid ? "border-red-400" : ""
                                            )}
                                        />
                                        {showErrors && isQualitiesInvalid && (
                                            <p className="mt-1 text-sm text-red-600">
                                                {t("validation.minChars", { count: 10 })}
                                            </p>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-charcoal/10 bg-white p-4">
                                        <label className="text-base font-semibold text-charcoal sm:text-lg">
                                            {memoriesLabel}
                                        </label>
                                        {guidedAutoBlocks.memories.trim().length > 0 && (
                                            <div className="mt-2 rounded-lg border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 px-3 py-2.5">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A2E]/70 sm:text-sm">
                                                    {guidedQuestions.autoAddedLabel}
                                                </p>
                                                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/80 sm:text-base">
                                                    {guidedAutoBlocks.memories}
                                                </p>
                                            </div>
                                        )}
                                        <Textarea
                                            value={storyDraft.memories}
                                            onChange={(event) => handleStoryFieldChange("memories", event.target.value)}
                                            placeholder={memoriesPlaceholder}
                                            rows={4}
                                            maxLength={5000}
                                            className={cn(
                                                "mt-2 rounded-xl border-charcoal/15 bg-porcelain text-lg focus-visible:ring-[#4A8E9A]/30 md:text-xl",
                                                showErrors && isMemoriesInvalid ? "border-red-400" : ""
                                            )}
                                        />
                                        {showErrors && isMemoriesInvalid && (
                                            <p className="mt-1 text-sm text-red-600">
                                                {t("validation.minChars", { count: 10 })}
                                            </p>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-charcoal/10 bg-white p-4">
                                        <label className="text-base font-semibold text-charcoal sm:text-lg">
                                            {messageLabel}
                                        </label>
                                        {guidedAutoBlocks.message.trim().length > 0 && (
                                            <div className="mt-2 rounded-lg border border-[#4A8E9A]/20 bg-[#4A8E9A]/5 px-3 py-2.5">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A2E]/70 sm:text-sm">
                                                    {guidedQuestions.autoAddedLabel}
                                                </p>
                                                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/80 sm:text-base">
                                                    {guidedAutoBlocks.message}
                                                </p>
                                            </div>
                                        )}
                                        <Textarea
                                            value={storyDraft.message}
                                            onChange={(event) => handleStoryFieldChange("message", event.target.value)}
                                            placeholder={messagePlaceholder}
                                            rows={3}
                                            maxLength={5000}
                                            className="mt-2 rounded-xl border-charcoal/15 bg-porcelain text-lg focus-visible:ring-[#4A8E9A]/30 md:text-xl"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 rounded-xl border border-[#EACAA8] bg-gradient-to-r from-[#FFF9F3] to-[#FFEFDE] px-4 py-3 text-sm text-[#7A3F1F] sm:text-base">
                                    {t("form.helper")}
                                </div>
                            </div>

                            {saveError && (
                                <div className="mt-5 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                                    <AlertCircle className="mt-0.5 h-5 w-5" />
                                    <p className="text-sm sm:text-base">{saveError}</p>
                                </div>
                            )}

                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <Button
                                    type="submit"
                                    className="h-12 flex-1 rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 sm:h-14 sm:text-lg"
                                    disabled={isSaving || isStoryUnchanged}
                                >
                                    {isSaving ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            {t("form.saving")}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <Save className="h-5 w-5" />
                                            {t("form.save")}
                                        </span>
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 flex-1 rounded-2xl border-charcoal/20 text-base font-semibold text-charcoal hover:bg-charcoal/5 sm:h-14 sm:text-lg"
                                    onClick={handleTrackOrderClick}
                                >
                                    {t("form.backToTrack")}
                                </Button>
                            </div>

                            {showErrors && !isStoryValid && (
                                <p className="mt-3 text-center text-sm text-red-600 sm:text-base">
                                    {t("form.required")}
                                </p>
                            )}
                        </form>
                    </section>
                )}
            </div>

            <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
                <DialogContent className="rounded-3xl border-charcoal/10 bg-white/95">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-2xl text-charcoal">
                            {t("unsaved.title")}
                        </DialogTitle>
                        <DialogDescription className="text-base text-charcoal/70 sm:text-lg">
                            {t("unsaved.description")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-12 rounded-2xl border-charcoal/20 text-base font-semibold text-charcoal sm:h-14 sm:text-lg"
                            onClick={() => setShowUnsavedDialog(false)}
                        >
                            {t("unsaved.stay")}
                        </Button>
                        <Button
                            type="button"
                            className="h-12 rounded-2xl bg-[#4A8E9A] text-base font-semibold text-white hover:bg-[#F0EDE6] sm:h-14 sm:text-lg"
                            onClick={() => {
                                setShowUnsavedDialog(false);
                                router.push(trackOrderUrl);
                            }}
                        >
                            {t("unsaved.leave")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showSavedDialog} onOpenChange={setShowSavedDialog}>
                <DialogContent className="rounded-3xl border-charcoal/10 bg-white/95">
                    <DialogHeader className="flex flex-col items-center text-center">
                        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                            <Check className="h-8 w-8 animate-[scale-in_0.3s_ease-out] text-emerald-600" />
                        </div>
                        <DialogTitle className="text-2xl text-charcoal">
                            {t("form.savedDialog.title")}
                        </DialogTitle>
                        <DialogDescription className="text-base text-charcoal/70 sm:text-lg">
                            {t("form.savedDialog.subtitle")}
                        </DialogDescription>
                    </DialogHeader>
                    {savedChanges.length > 0 && (
                        <div className="mt-2 space-y-2">
                            <p className="text-sm font-semibold text-charcoal/70">
                                {t("form.savedDialog.changed")}
                            </p>
                            <ul className="space-y-1">
                                {savedChanges.map((label) => (
                                    <li
                                        key={label}
                                        className="flex items-center gap-2 text-sm text-charcoal sm:text-base"
                                    >
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        {label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <DialogFooter className="mt-4 sm:justify-center">
                        <Button
                            type="button"
                            className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 sm:h-14 sm:w-auto sm:min-w-[160px] sm:text-lg"
                            onClick={() => setShowSavedDialog(false)}
                        >
                            {t("form.savedDialog.close")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
