"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Play, Pause, Volume2, VolumeX, Download, Loader2, RefreshCw, Radio } from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}
import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

// Native range input for mobile - much smoother than Radix Slider on touch devices
interface MobileSeekSliderProps {
    value: number;
    max: number;
    onChange: (value: number) => void;
    onCommit: (value: number) => void;
    className?: string;
    trackClassName?: string;
}

function MobileSeekSlider({ value, max, onChange, onCommit, className, trackClassName }: MobileSeekSliderProps) {
    const progress = max > 0 ? (value / max) * 100 : 0;

    return (
        <div className={cn("relative w-full h-8 flex items-center", className)}>
            {/* Custom styled track background */}
            <div className={cn("absolute h-2.5 w-full rounded-full bg-slate-300", trackClassName)}>
                <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${progress}%` }}
                />
            </div>
            {/* Thumb indicator */}
            <div
                className="absolute w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-lg pointer-events-none"
                style={{ left: `calc(${progress}% - 12px)` }}
            />
            {/* Native range input - invisible but handles all touch interactions */}
            <input
                type="range"
                min={0}
                max={max || 100}
                step={0.1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ touchAction: "pan-x" }}
            />
        </div>
    );
}

export interface AudioPlayerHandle {
    togglePlay: () => void;
    pause: () => void;
    play: () => void;
    isPlaying: boolean;
}

interface AudioPlayerProps {
    src: string;
    title?: string;
    showDownload?: boolean;
    showSpeedControl?: boolean;
    className?: string;
    variant?: "default" | "compact" | "compact-light";
    shareUrl?: string;
    shareMessage?: string;
    shareLabel?: string;
    downloadLabel?: string;
    onPlayingChange?: (isPlaying: boolean) => void;
    showRevisionButton?: boolean;
    revisionLabel?: string;
    onRequestRevision?: () => void;
    showStreamingButton?: boolean;
    streamingLabel?: string;
    onRequestStreaming?: () => void;
}

function formatTime(seconds: number): string {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer({
    src,
    title,
    showDownload = true,
    showSpeedControl = false,
    className,
    variant = "default",
    shareUrl,
    shareMessage,
    shareLabel = "Share",
    downloadLabel = "Download",
    onPlayingChange,
    showRevisionButton = false,
    revisionLabel = "Revisão",
    onRequestRevision,
    showStreamingButton = false,
    streamingLabel = "Lançar",
    onRequestStreaming,
}, ref) {

    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1);

    // Seeking state to prevent timeupdate conflicts during drag
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekValue, setSeekValue] = useState(0);

    // Detect mobile for using native range input (smoother on touch)
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    }, []);

    // Notify parent when playing state changes
    useEffect(() => {
        onPlayingChange?.(isPlaying);
    }, [isPlaying, onPlayingChange]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            // Don't update currentTime while user is dragging the slider
            if (!isSeeking) {
                setCurrentTime(audio.currentTime);
            }
        };
        const handleDurationChange = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };
        const handleEnded = () => setIsPlaying(false);
        const handleCanPlay = () => setIsLoading(false);
        const handleCanPlayThrough = () => setIsLoading(false);
        const handleLoadedMetadata = () => {
            // Safari often only fires loadedmetadata, not canplay
            setIsLoading(false);
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };
        const handleLoadedData = () => setIsLoading(false);
        const handleWaiting = () => setIsLoading(true);
        const handlePlaying = () => {
            setIsLoading(false);
            setIsPlaying(true);
        };
        const handlePause = () => setIsPlaying(false);
        const handleError = (e: Event) => {
            console.error("[AudioPlayer] Error loading audio:", e);
            setIsLoading(false); // Don't keep spinner forever on error
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("durationchange", handleDurationChange);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("canplaythrough", handleCanPlayThrough);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("loadeddata", handleLoadedData);
        audio.addEventListener("waiting", handleWaiting);
        audio.addEventListener("playing", handlePlaying);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("error", handleError);

        // Safari iOS: may need to trigger load manually
        // Setting a small timeout to allow loading to start
        const safariTimeout = setTimeout(() => {
            if (isLoading) {
                setIsLoading(false); // Don't block UI forever
            }
        }, 3000);

        return () => {
            clearTimeout(safariTimeout);
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("durationchange", handleDurationChange);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("canplaythrough", handleCanPlayThrough);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("loadeddata", handleLoadedData);
            audio.removeEventListener("waiting", handleWaiting);
            audio.removeEventListener("playing", handlePlaying);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("error", handleError);
        };
    }, [isLoading, isSeeking]);

    const togglePlay = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            try {
                setIsLoading(true);
                // Safari iOS: may need to load first
                if (audio.readyState < 2) {
                    audio.load();
                }
                await audio.play();
                setIsPlaying(true);
            } catch (error) {
                console.error("[AudioPlayer] Play failed:", error);
                // On Safari, user interaction is required - the error is expected on first try
                // But we should still allow the button to be clicked again
            } finally {
                setIsLoading(false);
            }
        }
    }, [isPlaying]);

    const pause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        setIsPlaying(false);
    }, []);

    const play = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return;
        try {
            if (audio.readyState < 2) {
                audio.load();
            }
            await audio.play();
            setIsPlaying(true);
        } catch (error) {
            console.error("[AudioPlayer] Play failed:", error);
        }
    }, []);

    // Expose controls via ref
    useImperativeHandle(ref, () => ({
        togglePlay,
        pause,
        play,
        isPlaying,
    }), [togglePlay, pause, play, isPlaying]);

    // Called during drag - only update visual, don't seek audio yet
    const handleSeek = useCallback((value: number[]) => {
        if (value[0] === undefined) return;
        setIsSeeking(true);
        setSeekValue(value[0]);
    }, []);

    // Called when user releases slider - commit the seek
    const handleSeekCommit = useCallback((value: number[]) => {
        const audio = audioRef.current;
        if (!audio || value[0] === undefined) return;
        audio.currentTime = value[0];
        setCurrentTime(value[0]);
        setIsSeeking(false);
    }, []);

    const handleVolumeChange = useCallback((value: number[]) => {
        const audio = audioRef.current;
        if (!audio || value[0] === undefined) return;
        audio.volume = value[0];
        setVolume(value[0]);
        setIsMuted(value[0] === 0);
    }, []);

    const toggleMute = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isMuted) {
            audio.volume = volume || 0.5;
            setIsMuted(false);
        } else {
            audio.volume = 0;
            setIsMuted(true);
        }
    }, [isMuted, volume]);

    const changePlaybackRate = useCallback((rate: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.playbackRate = rate;
        setPlaybackRate(rate);
    }, []);

    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = useCallback(() => {
        setIsDownloading(true);
        const fileName = title ? `${title}.mp3` : "song.mp3";

        try {
            // Use a same-origin download endpoint to ensure one-click downloads
            // even on Samsung Internet and in-app browsers.
            const downloadUrl = `/api/download-audio?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(fileName)}`;
            window.location.href = downloadUrl;
        } catch {
            // Fallback: open in new tab
            window.open(src, "_blank");
        } finally {
            setTimeout(() => setIsDownloading(false), 1000);
        }
    }, [src, title]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    if (variant === "compact") {
        return (
            <div className={cn("flex flex-col gap-2 rounded-lg bg-slate-800/90 p-3", className)}>
                <audio ref={audioRef} src={src} preload="metadata" playsInline />

                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={togglePlay}
                        className="h-10 w-10 rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 flex-shrink-0"
                    >
                        {isPlaying ? (
                            <Pause className="h-5 w-5" />
                        ) : (
                            <Play className="h-5 w-5 ml-0.5" />
                        )}
                    </Button>

                    <div className="flex-1 min-w-0">
                        {title && (
                            <p className="text-sm font-medium text-slate-200 truncate">{title}</p>
                        )}
                        <Slider
                            value={[isSeeking ? seekValue : currentTime]}
                            max={duration || 100}
                            step={0.1}
                            onValueChange={handleSeek}
                            onValueCommit={handleSeekCommit}
                            className="cursor-pointer mt-1.5 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-amber-500 [&_.bg-primary]:bg-amber-500"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between pl-[52px]">
                    <span className="text-xs text-slate-300 tabular-nums font-medium">
                        {formatTime(isSeeking ? seekValue : currentTime)} / {formatTime(duration)}
                    </span>
                    <div className="flex items-center gap-2">
                        {showSpeedControl && (
                            <div className="flex items-center gap-1 mr-2">
                                {[1, 1.5, 2].map((rate) => (
                                    <button
                                        key={rate}
                                        onClick={() => changePlaybackRate(rate)}
                                        className={cn(
                                            "px-1.5 py-0.5 text-xs rounded font-medium transition-colors",
                                            playbackRate === rate
                                                ? "bg-amber-500 text-slate-900"
                                                : "text-slate-400 hover:text-amber-400 hover:bg-slate-700/50"
                                        )}
                                    >
                                        {rate}x
                                    </button>
                                ))}
                            </div>
                        )}
                        {showDownload && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-slate-700/50"
                            >
                                {isDownloading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                ) : (
                                    <Download className="h-3.5 w-3.5 mr-1" />
                                )}
                                Download
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (variant === "compact-light") {
        return (
            <div className={cn("rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-4", className)}>
                <audio ref={audioRef} src={src} preload="metadata" playsInline />

                {/* Row 1: Play button + Title/Time */}
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={togglePlay}
                        disabled={isLoading && !isPlaying}
                        className={cn(
                            "h-14 w-14 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 flex-shrink-0 shadow-lg transition-all",
                            isPlaying && "ring-4 ring-emerald-200"
                        )}
                    >
                        {isLoading && !isPlaying ? (
                            <Loader2 className="h-7 w-7 animate-spin" />
                        ) : isPlaying ? (
                            <Pause className="h-7 w-7" />
                        ) : (
                            <Play className="h-7 w-7 ml-1" />
                        )}
                    </Button>

                    <div className="flex-1 min-w-0">
                        {title && (
                            <p className="text-base font-semibold text-gray-900 leading-tight">
                                {title}
                            </p>
                        )}
                        <p className="text-sm font-medium text-emerald-700 mt-1 tabular-nums">
                            {formatTime(isSeeking ? seekValue : currentTime)} / {formatTime(duration)}
                        </p>
                    </div>
                </div>

                {/* Row 2: Progress slider with extra touch padding */}
                <div className="mt-4 py-2 -mx-1 px-1">
                    {isMobile ? (
                        <MobileSeekSlider
                            value={isSeeking ? seekValue : currentTime}
                            max={duration || 100}
                            onChange={(v) => {
                                setIsSeeking(true);
                                setSeekValue(v);
                            }}
                            onCommit={(v) => {
                                const audio = audioRef.current;
                                if (audio) {
                                    audio.currentTime = v;
                                    setCurrentTime(v);
                                }
                                setIsSeeking(false);
                            }}
                            trackClassName="bg-emerald-200"
                        />
                    ) : (
                        <Slider
                            value={[isSeeking ? seekValue : currentTime]}
                            max={duration || 100}
                            step={0.1}
                            onValueChange={handleSeek}
                            onValueCommit={handleSeekCommit}
                            className={cn(
                                "cursor-pointer touch-pan-x",
                                "[&_[data-slot=slider-track]]:h-2.5",
                                "[&_[data-slot=slider-track]]:bg-emerald-200",
                                "[&_[data-slot=slider-thumb]]:size-6",
                                "[&_[data-slot=slider-thumb]]:bg-emerald-600",
                                "[&_[data-slot=slider-thumb]]:border-2",
                                "[&_[data-slot=slider-thumb]]:border-white",
                                "[&_[data-slot=slider-thumb]]:shadow-lg",
                                "[&_[data-slot=slider-range]]:bg-emerald-500"
                            )}
                        />
                    )}
                </div>

                {/* Row 3: Action buttons as rectangles with labels */}
                <div className="flex flex-wrap justify-center gap-3 mt-4">
                    {shareUrl && (
                        <a
                            href={`https://wa.me/?text=${encodeURIComponent(shareMessage ? shareMessage + " " + shareUrl : shareUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 transition-colors shadow-md"
                        >
                            <WhatsAppIcon className="h-5 w-5 text-white" />
                            <span className="text-sm font-semibold text-white">{shareLabel}</span>
                        </a>
                    )}
                    {showDownload && (
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-800 transition-colors shadow-md disabled:opacity-50"
                        >
                            {isDownloading ? (
                                <Loader2 className="h-5 w-5 text-white animate-spin" />
                            ) : (
                                <Download className="h-5 w-5 text-white" />
                            )}
                            <span className="text-sm font-semibold text-white">{downloadLabel}</span>
                        </button>
                    )}
                    {showRevisionButton && onRequestRevision && (
                        <button
                            onClick={onRequestRevision}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 transition-colors shadow-md"
                        >
                            <RefreshCw className="h-5 w-5 text-white" />
                            <span className="text-sm font-semibold text-white">{revisionLabel}</span>
                        </button>
                    )}
                    {showStreamingButton && onRequestStreaming && (
                        <button
                            onClick={onRequestStreaming}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] transition-colors shadow-md"
                        >
                            <Radio className="h-5 w-5 text-white" />
                            <span className="text-sm font-semibold text-white">{streamingLabel}</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={cn("rounded-xl bg-slate-800/50 border border-slate-700 p-6", className)}>
            <audio ref={audioRef} src={src} preload="metadata" playsInline />

            {/* Title */}
            {title && (
                <h3 className="text-lg font-semibold text-slate-200 mb-4 text-center">{title}</h3>
            )}

            {/* Main Controls */}
            <div className="flex items-center justify-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={togglePlay}
                    disabled={isLoading && !isPlaying}
                    className="h-14 w-14 rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                >
                    {isLoading && !isPlaying ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                    ) : isPlaying ? (
                        <Pause className="h-7 w-7" />
                    ) : (
                        <Play className="h-7 w-7 ml-1" />
                    )}
                </Button>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 mb-4">
                <Slider
                    value={[isSeeking ? seekValue : currentTime]}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={handleSeek}
                    onValueCommit={handleSeekCommit}
                    className="cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                    <span>{formatTime(isSeeking ? seekValue : currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Volume & Download */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleMute}
                        className="h-8 w-8 text-slate-400 hover:text-slate-200"
                    >
                        {isMuted ? (
                            <VolumeX className="h-4 w-4" />
                        ) : (
                            <Volume2 className="h-4 w-4" />
                        )}
                    </Button>
                    <Slider
                        value={[isMuted ? 0 : volume]}
                        max={1}
                        step={0.01}
                        onValueChange={handleVolumeChange}
                        className="w-24 cursor-pointer"
                    />
                </div>

                {showDownload && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        className="text-xs"
                    >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download
                    </Button>
                )}
            </div>
        </div>
    );
});
