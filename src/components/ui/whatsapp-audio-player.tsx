"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import Image from "next/image";

// Global event for coordinating audio playback - only one plays at a time
const AUDIO_PLAY_EVENT = "whatsapp-audio-play";

interface WhatsappAudioPlayerProps {
    src: string;
    avatar?: string;
    duration?: string; // Optional override, otherwise derived from audio metadata
    compact?: boolean; // Smaller version for tight spaces
}

export function WhatsappAudioPlayer({ src, avatar, duration, compact }: WhatsappAudioPlayerProps) {
    const playerId = useId(); // Unique ID for this player instance
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState("0:00");
    const [totalDuration, setTotalDuration] = useState(duration ?? "0:00");
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false); // Ref to avoid stale closure

    // Listen for other players starting - pause this one if another starts
    useEffect(() => {
        const handleOtherPlay = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            if (customEvent.detail !== playerId) {
                // Another player started, pause this one
                const audio = audioRef.current;
                if (audio && !audio.paused) {
                    audio.pause();
                    setIsPlaying(false);
                }
            }
        };

        window.addEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
        return () => window.removeEventListener(AUDIO_PLAY_EVENT, handleOtherPlay);
    }, [playerId]);

    // Emit event when this player starts playing
    const emitPlayEvent = useCallback(() => {
        window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: playerId }));
    }, [playerId]);

    useEffect(() => {
        if (duration) {
            setTotalDuration(duration);
        }
    }, [duration]);

    const togglePlay = async () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            setIsLoading(true);
            try {
                // Pause all other players first
                emitPlayEvent();
                // Safari iOS: may need to load first
                if (audio.readyState < 2) {
                    audio.load();
                }
                await audio.play();
                setIsPlaying(true);
            } catch (error) {
                console.error("[WhatsappAudioPlayer] Play failed:", error);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handlePlayFromTap = async () => {
        const audio = audioRef.current;
        if (!audio || isPlaying) return;
        setIsLoading(true);
        try {
            // Pause all other players first
            emitPlayEvent();
            // Safari iOS: may need to load first
            if (audio.readyState < 2) {
                audio.load();
            }
            await audio.play();
            setIsPlaying(true);
        } catch (error) {
            console.error("[WhatsappAudioPlayer] Play from tap failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateDuration = () => {
            if (duration) return;
            if (!Number.isFinite(audio.duration)) return;
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            setTotalDuration(`${minutes}:${seconds < 10 ? "0" : ""}${seconds}`);
        };

        const updatedTime = () => {
            // Don't update while dragging
            if (isDraggingRef.current) return;

            const current = audio.currentTime;
            const dur = audio.duration;
            if (dur) {
                setProgress((current / dur) * 100);
            }

            const minutes = Math.floor(current / 60);
            const seconds = Math.floor(current % 60);
            setCurrentTime(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime("0:00");
        };

        const handleCanPlay = () => {
            setIsLoading(false);
        };

        const handleWaiting = () => {
            setIsLoading(true);
        };

        audio.addEventListener("timeupdate", updatedTime);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("loadedmetadata", updateDuration);
        audio.addEventListener("durationchange", updateDuration);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("waiting", handleWaiting);
        updateDuration();

        return () => {
            audio.removeEventListener("timeupdate", updatedTime);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("loadedmetadata", updateDuration);
            audio.removeEventListener("durationchange", updateDuration);
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("waiting", handleWaiting);
        };
    }, [duration, src]);

    // Calculate position from mouse/touch event
    const getPositionFromEvent = useCallback((clientX: number) => {
        const progressBar = progressRef.current;
        if (!progressBar) return 0;

        const rect = progressBar.getBoundingClientRect();
        const position = (clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(1, position));
    }, []);

    // Seek to position
    const seekToPosition = useCallback((position: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(audio.duration)) return;

        const newTime = position * audio.duration;
        if (Number.isFinite(newTime)) {
            audio.currentTime = newTime;
            setProgress(position * 100);
        }
    }, []);

    // Handle drag start (mouse/touch)
    const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();

        setIsDragging(true);
        isDraggingRef.current = true;

        const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
        const position = getPositionFromEvent(clientX);
        setProgress(position * 100);
    }, [getPositionFromEvent]);

    // Handle drag move
    const handleDragMove = useCallback((clientX: number) => {
        if (!isDraggingRef.current) return;

        const position = getPositionFromEvent(clientX);
        setProgress(position * 100);

        // Update time display while dragging
        const audio = audioRef.current;
        if (audio && Number.isFinite(audio.duration)) {
            const time = position * audio.duration;
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            setCurrentTime(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
        }
    }, [getPositionFromEvent]);

    // Handle drag end
    const handleDragEnd = useCallback((clientX: number) => {
        if (!isDraggingRef.current) return;

        setIsDragging(false);
        isDraggingRef.current = false;

        const position = getPositionFromEvent(clientX);
        seekToPosition(position);
    }, [getPositionFromEvent, seekToPosition]);

    // Global mouse/touch event listeners for dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            handleDragMove(e.clientX);
        };

        const handleMouseUp = (e: MouseEvent) => {
            handleDragEnd(e.clientX);
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches[0]) {
                handleDragMove(e.touches[0].clientX);
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            const touch = e.changedTouches[0];
            if (touch) {
                handleDragEnd(touch.clientX);
            }
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

    // Handle click on progress bar (instant seek)
    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const clientX = e.clientX;
        const position = getPositionFromEvent(clientX);
        seekToPosition(position);
    }, [getPositionFromEvent, seekToPosition]);

    return (
        <div className="flex items-start gap-3 max-w-md w-full" onClick={handlePlayFromTap}>
            {avatar && (
                <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-white">
                    <Image src={avatar} alt="Avatar" fill sizes="48px" className="object-cover" />
                </div>
            )}

            <div className={`flex-1 bg-[#d9fdd3] rounded-2xl rounded-tl-none relative shadow-sm border border-black/5 cursor-pointer ${compact ? 'p-2.5' : 'p-3 sm:p-4'}`}>
                {/* Triangle for speech bubble */}
                <div className="absolute top-0 -left-2 w-0 h-0
                     border-t-[10px] border-t-[#d9fdd3]
                     border-l-[10px] border-l-transparent
                     drop-shadow-sm filter"
                    style={{ filter: "drop-shadow(-1px 1px 0px rgba(0,0,0,0.05))" }}
                />

                <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3 sm:gap-4'}`}>
                    {/* Play Button */}
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            togglePlay();
                        }}
                        className={`flex-shrink-0 flex items-center justify-center rounded-full bg-[#25d366] text-white shadow-md hover:bg-[#20bd5a] active:scale-95 transition-all ${compact ? 'w-11 h-11' : 'w-14 h-14 sm:w-16 sm:h-16'}`}
                        aria-label={isPlaying ? "Pausar" : "Tocar"}
                    >
                        {isLoading ? (
                            <Loader2 className={`animate-spin ${compact ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'}`} />
                        ) : isPlaying ? (
                            <Pause className={`fill-white ${compact ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'}`} />
                        ) : (
                            <Play className={`fill-white ml-0.5 ${compact ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'}`} />
                        )}
                    </button>

                    <div className={`flex-1 flex flex-col justify-center min-w-0 ${compact ? 'gap-1.5' : 'gap-2'}`}>
                        {/* Progress Bar with touch-friendly thumb */}
                        <div
                            ref={progressRef}
                            className={`relative w-full bg-gray-300/70 rounded-full cursor-pointer select-none ${compact ? 'h-2' : 'h-2.5 sm:h-3'}`}
                            onClick={handleProgressClick}
                            onMouseDown={handleDragStart}
                            onTouchStart={handleDragStart}
                        >
                            {/* Progress fill */}
                            <div
                                className={`absolute top-0 left-0 h-full bg-[#25d366] rounded-full ${isDragging ? '' : 'transition-all duration-100'}`}
                                style={{ width: `${progress}%` }}
                            />
                            {/* Always visible thumb - larger hit area for dragging */}
                            <div
                                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 bg-[#25d366] rounded-full shadow-md border-2 border-white cursor-grab active:cursor-grabbing ${isDragging ? 'scale-125' : ''} ${compact ? 'w-4 h-4' : 'w-5 h-5 sm:w-6 sm:h-6'} transition-transform`}
                                style={{ left: `${Math.min(Math.max(progress, 3), 97)}%` }}
                            />
                            {/* Invisible touch area for easier grabbing */}
                            <div
                                className="absolute -inset-4"
                                onMouseDown={handleDragStart}
                                onTouchStart={handleDragStart}
                            />
                        </div>

                        {/* Time display */}
                        <div className={`flex items-center justify-between text-[#1A1A2E]/60 font-medium leading-none px-1 ${compact ? 'text-xs' : 'text-sm sm:text-base'}`}>
                            <span>{currentTime}</span>
                            <span>{totalDuration}</span>
                        </div>
                    </div>
                </div>
                <audio ref={audioRef} src={src} preload="metadata" playsInline />
            </div>
        </div>
    );
}
