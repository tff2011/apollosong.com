"use client";

import { useState, useMemo, useRef, useId, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Guitar, Check, Loader2, X, Search, ChevronDown, Music, Mic, FileText, Play, Pause } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// Compact play button for genre previews
function GenrePlayButton({ audioUrl }: { audioUrl: string }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const playerId = useId();

    // Listen for global event to pause when another player starts
    useEffect(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            if (customEvent.detail !== playerId && audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        };
        window.addEventListener("genre-audio-play", handler);
        return () => window.removeEventListener("genre-audio-play", handler);
    }, [playerId]);

    // Handle audio events
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = () => setIsPlaying(false);
        const handlePause = () => setIsPlaying(false);
        const handlePlay = () => {
            setIsPlaying(true);
            setIsLoading(false);
        };
        const handleWaiting = () => setIsLoading(true);
        const handleCanPlay = () => setIsLoading(false);

        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("waiting", handleWaiting);
        audio.addEventListener("canplay", handleCanPlay);

        return () => {
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("waiting", handleWaiting);
            audio.removeEventListener("canplay", handleCanPlay);
        };
    }, []);

    const toggle = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger parent button click
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            // Dispatch event to pause other players first
            window.dispatchEvent(new CustomEvent("genre-audio-play", { detail: playerId }));
            setIsLoading(true);
            try {
                await audio.play();
            } catch (err) {
                console.warn("Audio play failed:", err);
                setIsLoading(false);
            }
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={isLoading}
            className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                isPlaying
                    ? "bg-purple-600 text-white"
                    : "bg-purple-100 text-purple-600 hover:bg-purple-200"
            )}
        >
            {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
                <Pause className="w-5 h-5" />
            ) : (
                <Play className="w-5 h-5 ml-0.5" />
            )}
            <audio ref={audioRef} src={audioUrl} preload="none" />
        </button>
    );
}
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "~/components/ui/sheet";

// Genre categories for better organization
const GENRE_CATEGORIES_PT: Record<string, { label: string; genres: string[] }> = {
    popular: {
        label: "Populares",
        genres: ["worship", "pop", "samba"],
    },
    sertanejo: {
        label: "Sertanejo",
        genres: ["sertanejo-raiz", "sertanejo-universitario", "sertanejo-romantico"],
    },
    forro: {
        label: "Forró",
        genres: ["forro-pe-de-serra-rapido", "forro-pe-de-serra-lento", "forro-universitario", "forro-eletronico"],
    },
    pagode: {
        label: "Pagode",
        genres: ["pagode-de-mesa", "pagode-romantico", "pagode-universitario"],
    },
    funk: {
        label: "Funk",
        genres: ["funk-carioca", "funk-paulista", "funk-melody"],
    },
    mpb: {
        label: "MPB",
        genres: ["mpb-bossa-nova", "mpb-cancao-brasileira", "mpb-pop", "mpb-intimista"],
    },
    rock: {
        label: "Rock",
        genres: ["rock-classico", "pop-rock-brasileiro", "heavy-metal", "jovem-guarda"],
    },
    eletronica: {
        label: "Eletrônica",
        genres: ["eletronica-afro-house", "eletronica-progressive-house", "eletronica-melodic-techno"],
    },
    blues: {
        label: "Blues",
        genres: ["blues-melancholic", "blues-upbeat"],
    },
    brega: {
        label: "Brega",
        genres: ["brega-romantico", "tecnobrega"],
    },
    infantil: {
        label: "Infantil",
        genres: ["lullaby-ninar", "lullaby-animada"],
    },
    latina: {
        label: "Latina",
        genres: ["salsa", "merengue", "bachata", "bolero"],
    },
    outros: {
        label: "Outros",
        genres: ["rnb", "jazz", "hiphop", "axe", "capoeira", "reggae", "valsa"],
    },
};

const GENRE_CATEGORIES_EN: Record<string, { label: string; genres: string[] }> = {
    popular: {
        label: "Popular",
        genres: ["pop", "worship", "rock", "country"],
    },
    styles: {
        label: "Styles",
        genres: ["rnb", "jazz", "hiphop"],
    },
    blues: {
        label: "Blues",
        genres: ["blues-melancholic", "blues-upbeat"],
    },
    brazilian: {
        label: "Brazilian",
        genres: ["mpb-bossa-nova", "mpb-cancao-brasileira", "mpb-pop", "mpb-intimista"],
    },
};

// Genre labels for display
const genreLabelsEN: Record<string, string> = {
    pop: "Pop",
    country: "Country",
    rock: "Rock",
    "jovem-guarda": "Jovem Guarda",
    "rock-classico": "Classic Rock",
    "pop-rock-brasileiro": "Brazilian Pop Rock",
    "heavy-metal": "Heavy Metal",
    eletronica: "Electronic",
    "eletronica-afro-house": "Afro House",
    "eletronica-progressive-house": "Progressive House",
    "eletronica-melodic-techno": "Melodic Techno",
    latina: "Latin Music",
    salsa: "Salsa",
    merengue: "Merengue",
    bachata: "Bachata",
    bolero: "Bolero",
    rnb: "R&B / Soul",
    jazz: "Jazz",
    blues: "American Blues",
    "blues-melancholic": "American Blues (Melancholic)",
    "blues-upbeat": "American Blues (Upbeat)",
    mpb: "MPB",
    bossa: "Bossa Nova",
    worship: "Worship / Gospel",
    hiphop: "Hip-Hop / Rap",
    funk: "Funk",
    "funk-carioca": "Funk Carioca",
    "funk-paulista": "Funk Paulista",
    "funk-melody": "Funk Melody",
    brega: "Brega",
    "brega-romantico": "Brega Romantico",
    tecnobrega: "Tecnobrega",
    samba: "Samba",
    pagode: "Pagode",
    "pagode-de-mesa": "Pagode de Mesa (Roots)",
    "pagode-romantico": "Pagode Romantico (90s)",
    "pagode-universitario": "Pagode Universitario",
    "sertanejo-raiz": "Sertanejo Raiz",
    "sertanejo-universitario": "Sertanejo Universitario",
    "sertanejo-romantico": "Sertanejo Romantico",
    "forro-pe-de-serra": "Forro Pe-de-Serra", // Legacy
    "forro-pe-de-serra-rapido": "Forro Pe-de-Serra (Dancante)",
    "forro-pe-de-serra-lento": "Forro Pe-de-Serra (Lento)",
    "forro-universitario": "Forro Universitario",
    "forro-eletronico": "Forro Eletronico",
    "mpb-bossa-nova": "MPB / Bossa Nova",
    "mpb-cancao-brasileira": "MPB Classica",
    "mpb-pop": "Pop MPB",
    "mpb-intimista": "MPB Intimista",
    axe: "Axe",
    capoeira: "Capoeira",
    reggae: "Reggae",
    lullaby: "Lullaby",
    "lullaby-ninar": "Lullaby (Soothing)",
    "lullaby-animada": "Kids Song (Upbeat)",
    valsa: "Waltz",
};

const genreLabelsPT: Record<string, string> = {
    pop: "Pop",
    country: "Sertanejo",
    rock: "Rock",
    "jovem-guarda": "Jovem Guarda",
    "rock-classico": "Rock Clássico",
    "pop-rock-brasileiro": "Pop Rock Brasileiro",
    "heavy-metal": "Heavy Metal",
    eletronica: "Eletrônica",
    "eletronica-afro-house": "Afro House",
    "eletronica-progressive-house": "Progressive House",
    "eletronica-melodic-techno": "Melodic Techno",
    latina: "Música Latina",
    salsa: "Salsa",
    merengue: "Merengue",
    bachata: "Bachata",
    bolero: "Bolero",
    rnb: "Black Music / Soul",
    jazz: "Jazz",
    blues: "Blues Americano",
    "blues-melancholic": "Blues Americano (Melancólico)",
    "blues-upbeat": "Blues Americano (Alto Astral)",
    mpb: "MPB",
    "mpb-bossa-nova": "Bossa Nova",
    "mpb-cancao-brasileira": "MPB Clássica",
    "mpb-pop": "MPB Pop",
    "mpb-intimista": "MPB Intimista",
    bossa: "Bossa Nova",
    worship: "Gospel",
    hiphop: "Rap / Hip-Hop",
    funk: "Funk",
    "funk-carioca": "Funk Carioca",
    "funk-paulista": "Funk Paulista",
    "funk-melody": "Funk Melody",
    brega: "Brega",
    "brega-romantico": "Brega Romântico",
    tecnobrega: "Tecnobrega",
    samba: "Samba",
    pagode: "Pagode",
    "pagode-de-mesa": "Pagode de Mesa",
    "pagode-romantico": "Pagode Romântico",
    "pagode-universitario": "Pagode Universitário",
    forro: "Forró",
    "sertanejo-raiz": "Sertanejo Raiz",
    "sertanejo-universitario": "Sertanejo Universitário",
    "sertanejo-romantico": "Sertanejo Romântico",
    "forro-pe-de-serra": "Forró Pé-de-Serra", // Legacy
    "forro-pe-de-serra-rapido": "Forró Pé-de-Serra (Dançante)",
    "forro-pe-de-serra-lento": "Forró Pé-de-Serra (Lento)",
    "forro-universitario": "Forró Universitário",
    "forro-eletronico": "Forró Eletrônico",
    axe: "Axé",
    capoeira: "Capoeira",
    reggae: "Reggae",
    lullaby: "Infantil",
    "lullaby-ninar": "Canções de Ninar",
    "lullaby-animada": "Infantil Animada",
    valsa: "Valsa",
};

interface GenreVariantUpsellProps {
    orderId: string;
    email: string;
    currentGenre: string;
    existingVariants: string[];
    locale: string;
    currency: string;
    recipientName?: string;
    hasLyrics?: boolean;
    t: {
        title: string;
        description: string;
        selectStyles: string;
        perStyle: string;
        buyNow: string;
        adding: string;
        total: string;
        alreadyHave: string;
        currentGenre: string;
        selectVoice: string;
        voiceFemale: string;
        voiceMale: string;
        voiceEither: string;
        lyricsOptionLabel?: string;
        lyricsOptionSame?: string;
        lyricsOptionSameDesc?: string;
        lyricsOptionAdapt?: string;
        lyricsOptionAdaptDesc?: string;
    };
}

export function GenreVariantUpsell({
    orderId,
    email,
    currentGenre,
    existingVariants,
    locale,
    currency,
    recipientName,
    hasLyrics = false,
    t,
}: GenreVariantUpsellProps) {
    const router = useRouter();
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    const [selectedVocals, setSelectedVocals] = useState<"female" | "male" | "either">("either");
    const [lyricsOption, setLyricsOption] = useState<"same" | "adapt">("same");
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const genreLabels = locale === "pt" ? genreLabelsPT : genreLabelsEN;
    const genreCategories = locale === "pt" ? GENRE_CATEGORIES_PT : GENRE_CATEGORIES_EN;

    // Fetch audio samples for genre previews
    const { data: audioSamples } = api.songOrder.getGenreAudioSamples.useQuery();

    // Build a map of genre -> audioUrl (prefer "either" vocals, then any available)
    const genreAudioMap = useMemo(() => {
        const map: Record<string, string> = {};
        if (!audioSamples) return map;

        // Filter samples for the current locale
        const localeSamples = audioSamples.filter(s => s.locale === locale);

        // Group by genre
        for (const sample of localeSamples) {
            // Prefer "either" vocals, but use any available
            if (!map[sample.genre] || sample.vocals === "either") {
                map[sample.genre] = sample.audioUrl;
            }
        }
        return map;
    }, [audioSamples, locale]);

    // Get all available genres (flatten from categories)
    const allGenres = useMemo(() => {
        const genres = new Set<string>();
        Object.values(genreCategories).forEach(cat => {
            cat.genres.forEach(g => genres.add(g));
        });
        return Array.from(genres);
    }, [genreCategories]);

    // Allow repurchasing any genre (including current and existing variants)
    // Each purchase generates a new unique lyrics
    const unavailableGenres = useMemo(
        () => new Set<string>(),
        []
    );

    // Filter genres based on search
    const filteredCategories = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return genreCategories;

        const filtered: Record<string, { label: string; genres: string[] }> = {};
        Object.entries(genreCategories).forEach(([key, cat]) => {
            const matchingGenres = cat.genres.filter(genre => {
                const label = genreLabels[genre] || genre;
                return label.toLowerCase().includes(query) && !unavailableGenres.has(genre);
            });
            if (matchingGenres.length > 0) {
                filtered[key] = { ...cat, genres: matchingGenres };
            }
        });
        return filtered;
    }, [searchQuery, genreCategories, genreLabels, unavailableGenres]);

    const getPricePerVariant = () => {
        if (currency === "BRL") return 4990;
        if (locale === "es") return 999;
        if (currency === "EUR") return 2900;
        return 3990;
    };

    const pricePerVariant = getPricePerVariant();
    const totalPrice = selectedGenres.length * pricePerVariant;

    const createVariant = api.songOrder.createGenreVariant.useMutation({
        onSuccess: (data) => {
            router.push(`/${locale}/order/${data.orderId}`);
        },
        onError: (error) => {
            console.error("Failed to create genre variant:", error);
            setIsCreating(false);
        },
    });

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (currency === "BRL") {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        return `$${amount.toFixed(2)}`;
    };

    const replaceName = (text: string) =>
        recipientName ? text.replace("{name}", recipientName) : text;
    const title = replaceName(t.title);
    const description = replaceName(t.description);

    const renderBold = (text: string, className?: string) =>
        text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
                <strong key={i} className={className}>
                    {part.slice(2, -2)}
                </strong>
            ) : (
                part
            )
        );

    const toggleGenre = (genre: string) => {
        setSelectedGenres(prev =>
            prev.includes(genre)
                ? prev.filter(g => g !== genre)
                : [...prev, genre]
        );
    };

    const handleBuyNow = async () => {
        if (selectedGenres.length === 0) return;
        setIsCreating(true);
        try {
            await createVariant.mutateAsync({
                parentOrderId: orderId,
                genres: selectedGenres as any,
                email,
                vocals: selectedVocals,
                lyricsOption: hasLyrics ? lyricsOption : undefined,
            });
        } catch (e) {
            console.error("Failed to create genre variants:", e);
        }
    };

    // Check if there are any available genres
    const hasAvailableGenres = allGenres.some(g => !unavailableGenres.has(g));
    if (!hasAvailableGenres) {
        return null;
    }

    const searchPlaceholder = locale === "pt" ? "Buscar estilo..." : "Search style...";
    const closeLabel = locale === "pt" ? "Fechar" : "Close";
    const confirmLabel = locale === "pt" ? "Confirmar" : "Confirm";
    const selectedLabel = locale === "pt" ? "selecionado(s)" : "selected";

    return (
        <div className="mt-6 pt-6 border-t border-charcoal/10">
            <div className="bg-gradient-to-br from-purple-50 via-fuchsia-50 to-amber-50 rounded-3xl p-5 sm:p-6 border border-purple-200/60 shadow-lg">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-100 to-fuchsia-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                        <Guitar className="w-7 h-7 text-purple-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-purple-900">
                            {renderBold(title, "font-extrabold")}
                        </h3>
                        <p className="text-base text-purple-800/80 mt-2">
                            {renderBold(description, "font-bold text-purple-900")}
                        </p>
                    </div>
                    <div className="sm:text-right">
                        <span className="inline-flex flex-col items-end rounded-2xl bg-white/70 px-4 py-2 text-purple-700 shadow-sm">
                            <span className="text-base font-bold">
                                {formatPrice(pricePerVariant)}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                                {t.perStyle}
                            </span>
                        </span>
                    </div>
                </div>

                {/* Already owned */}
                {existingVariants.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-purple-200/70">
                        <p className="text-sm font-semibold text-purple-700 mb-3">
                            {t.alreadyHave}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-4 py-2 rounded-full bg-purple-200 text-purple-800 text-sm font-semibold">
                                {genreLabels[currentGenre] || currentGenre} ({t.currentGenre})
                            </span>
                            {existingVariants.map(genre => (
                                <span
                                    key={genre}
                                    className="px-4 py-2 rounded-full bg-purple-200 text-purple-800 text-sm font-semibold flex items-center gap-1"
                                >
                                    {genreLabels[genre] || genre}
                                    <Check className="w-4 h-4" />
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Genre Selection */}
                <div className="mt-5 pt-5 border-t border-purple-200/70">
                    <p className="text-sm font-semibold text-purple-700 mb-3">
                        {t.selectStyles}
                    </p>

                    {/* Selected genres chips */}
                    {selectedGenres.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {selectedGenres.map(genre => (
                                <button
                                    key={genre}
                                    onClick={() => toggleGenre(genre)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-600 text-white text-base font-semibold hover:bg-purple-700 transition-colors shadow-sm"
                                >
                                    {genreLabels[genre] || genre}
                                    <X className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Open picker button */}
                    <Sheet open={isOpen} onOpenChange={setIsOpen}>
                        <SheetTrigger asChild>
                            <button
                                className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-2xl bg-white border-2 border-purple-200 hover:border-purple-400 transition-colors text-left shadow-sm"
                                disabled={isCreating}
                            >
                                <div className="flex items-center gap-3">
                                    <Music className="w-6 h-6 text-purple-500" />
                                    <span className="text-base font-medium text-purple-900">
                                        {selectedGenres.length > 0
                                            ? `${selectedGenres.length} ${selectedLabel}`
                                            : t.selectStyles}
                                    </span>
                                </div>
                                <ChevronDown className="w-5 h-5 text-purple-500" />
                            </button>
                        </SheetTrigger>
                        <SheetContent
                            side="bottom"
                            className="h-[85vh] rounded-t-3xl bg-gradient-to-b from-purple-50 to-white p-0"
                        >
                            <SheetHeader className="px-5 pt-6 pb-4 border-b border-purple-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
                                <SheetTitle className="text-xl font-bold text-purple-900 text-center">
                                    {t.selectStyles}
                                </SheetTitle>
                                {/* Search */}
                                <div className="relative mt-3">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={searchPlaceholder}
                                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-purple-50 border border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-200 focus:outline-none text-base text-purple-900 placeholder:text-purple-400"
                                    />
                                </div>
                            </SheetHeader>

                            {/* Genre list by category */}
                            <div className="overflow-y-auto flex-1 px-4 py-4" style={{ maxHeight: "calc(85vh - 180px)" }}>
                                {Object.entries(filteredCategories).map(([key, category]) => {
                                    const availableInCategory = category.genres.filter(
                                        g => !unavailableGenres.has(g)
                                    );
                                    if (availableInCategory.length === 0) return null;

                                    return (
                                        <div key={key} className="mb-6">
                                            <h4 className="text-sm font-bold text-purple-600 uppercase tracking-wider mb-3 px-1">
                                                {category.label}
                                            </h4>
                                            <div className="grid grid-cols-1 gap-2">
                                                {availableInCategory.map(genre => {
                                                    const isSelected = selectedGenres.includes(genre);
                                                    const audioUrl = genreAudioMap[genre];
                                                    return (
                                                        <div key={genre} className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => toggleGenre(genre)}
                                                                className={cn(
                                                                    "flex-1 flex items-center justify-between px-5 py-4 rounded-2xl text-left transition-all text-lg font-medium",
                                                                    isSelected
                                                                        ? "bg-purple-600 text-white shadow-lg scale-[1.02]"
                                                                        : "bg-porcelain text-purple-900 border border-purple-100 hover:border-purple-300 hover:bg-purple-50"
                                                                )}
                                                            >
                                                                <span>{genreLabels[genre] || genre}</span>
                                                                {isSelected && (
                                                                    <Check className="w-6 h-6" />
                                                                )}
                                                            </button>
                                                            {audioUrl && (
                                                                <GenrePlayButton audioUrl={audioUrl} />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}

                                {Object.keys(filteredCategories).length === 0 && (
                                    <div className="text-center py-12 text-purple-400">
                                        <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p className="text-lg">
                                            {locale === "pt"
                                                ? "Nenhum estilo encontrado"
                                                : "No styles found"}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Footer with confirm button */}
                            <div className="sticky bottom-0 px-5 py-4 bg-white/95 backdrop-blur-sm border-t border-purple-100">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-lg font-bold transition-colors shadow-lg"
                                >
                                    {selectedGenres.length > 0
                                        ? `${confirmLabel} (${selectedGenres.length})`
                                        : closeLabel}
                                </button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Voice Selection + Lyrics Option + Buy button - only show when genres selected */}
                {selectedGenres.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-purple-200/70 space-y-5">
                        {/* Voice Selection */}
                        <div>
                            <p className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
                                <Mic className="w-4 h-4" />
                                {t.selectVoice}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {(["female", "male", "either"] as const).map((voice) => (
                                    <button
                                        key={voice}
                                        onClick={() => setSelectedVocals(voice)}
                                        className={cn(
                                            "px-4 py-3 rounded-xl text-sm font-medium transition-all",
                                            selectedVocals === voice
                                                ? "bg-purple-600 text-white shadow-md"
                                                : "bg-porcelain text-purple-800 border border-purple-200 hover:border-purple-400"
                                        )}
                                    >
                                        {voice === "female" ? t.voiceFemale : voice === "male" ? t.voiceMale : t.voiceEither}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Lyrics Option - only show if parent has lyrics */}
                        {hasLyrics && t.lyricsOptionLabel && (
                            <div>
                                <p className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    {t.lyricsOptionLabel}
                                </p>
                                <div className="grid grid-cols-1 gap-2">
                                    {(["same", "adapt"] as const).map((option) => (
                                        <button
                                            key={option}
                                            onClick={() => setLyricsOption(option)}
                                            className={cn(
                                                "px-4 py-3 rounded-xl text-left transition-all",
                                                lyricsOption === option
                                                    ? "bg-purple-600 text-white shadow-md"
                                                    : "bg-porcelain text-purple-800 border border-purple-200 hover:border-purple-400"
                                            )}
                                        >
                                            <span className="font-medium">
                                                {option === "same" ? t.lyricsOptionSame : t.lyricsOptionAdapt}
                                            </span>
                                            <span className={cn(
                                                "block text-xs mt-0.5",
                                                lyricsOption === option ? "text-purple-200" : "text-purple-500"
                                            )}>
                                                {option === "same" ? t.lyricsOptionSameDesc : t.lyricsOptionAdaptDesc}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Buy button */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <span className="text-xl font-bold text-purple-900">
                                {t.total} {formatPrice(totalPrice)}
                            </span>
                            <button
                                onClick={handleBuyNow}
                                disabled={isCreating}
                                className={cn(
                                    "px-8 py-4 rounded-2xl text-lg font-bold transition-all shadow-lg",
                                    isCreating
                                        ? "bg-purple-400 text-white cursor-not-allowed"
                                        : "bg-purple-600 hover:bg-purple-700 text-white hover:shadow-xl hover:scale-[1.02]"
                                )}
                            >
                                {isCreating ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                                        {t.adding}
                                    </>
                                ) : (
                                    t.buyNow
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
