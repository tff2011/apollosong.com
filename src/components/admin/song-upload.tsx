"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Music, X, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

interface SongUploadProps {
    orderId: string;
    currentUrl?: string | null;
    onUploadComplete: (url: string) => void;
    slot?: 1 | 2;
    label?: string;
    /** If set, saves to revisionHistory entry instead of main songFileUrl */
    revisionNumber?: number;
}

type UploadState = "idle" | "uploading" | "success" | "error";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function SongUpload({ orderId, currentUrl, onUploadComplete, slot = 1, label, revisionNumber }: SongUploadProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadState, setUploadState] = useState<UploadState>("idle");
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getUploadUrl = api.admin.getSongUploadUrl.useMutation();
    const confirmUpload = api.admin.confirmSongUpload.useMutation();
    const confirmRevisionUpload = api.admin.confirmRevisionHistorySongUpload.useMutation();

    const uploadFile = useCallback(async (file: File) => {
        // Validate file
        if (!file.name.toLowerCase().endsWith('.mp3')) {
            setErrorMessage("Apenas arquivos MP3 são permitidos");
            setUploadState("error");
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setErrorMessage("Arquivo muito grande (máx. 50MB)");
            setUploadState("error");
            return;
        }

        setSelectedFile(file);
        setUploadState("uploading");
        setUploadProgress(0);
        setErrorMessage(null);

        try {
            // 1. Get presigned upload URL
            const { uploadUrl, publicUrl, key } = await getUploadUrl.mutateAsync({
                orderId,
                fileName: file.name,
                slot,
            });

            // 2. Upload file to R2 using XMLHttpRequest for progress tracking
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener("progress", (event) => {
                    if (event.lengthComputable) {
                        const progress = Math.round((event.loaded / event.total) * 100);
                        setUploadProgress(progress);
                    }
                });

                xhr.addEventListener("load", () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed with status ${xhr.status}`));
                    }
                });

                xhr.addEventListener("error", () => {
                    reject(new Error("Upload failed"));
                });

                xhr.open("PUT", uploadUrl);
                xhr.setRequestHeader("Content-Type", "audio/mpeg");
                xhr.send(file);
            });

            // 3. Confirm upload in database
            if (revisionNumber !== undefined) {
                await confirmRevisionUpload.mutateAsync({
                    orderId,
                    revisionNumber,
                    songFileUrl: publicUrl,
                    songFileKey: key,
                    slot,
                });
            } else {
                await confirmUpload.mutateAsync({
                    orderId,
                    songFileUrl: publicUrl,
                    songFileKey: key,
                    slot,
                });
            }

            setUploadState("success");
            onUploadComplete(publicUrl);
        } catch (error) {
            console.error("Upload error:", error);
            setErrorMessage(error instanceof Error ? error.message : "Upload failed");
            setUploadState("error");
        }
    }, [orderId, slot, revisionNumber, getUploadUrl, confirmUpload, confirmRevisionUpload, onUploadComplete]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0]) {
            void uploadFile(files[0]);
        }
    }, [uploadFile]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0 && files[0]) {
            void uploadFile(files[0]);
        }
    }, [uploadFile]);

    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const resetUpload = useCallback(() => {
        setUploadState("idle");
        setUploadProgress(0);
        setSelectedFile(null);
        setErrorMessage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    // If there's already a file uploaded and we're not in the middle of uploading a new one
    if (currentUrl && uploadState === "idle") {
        return (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                {label && (
                    <p className="text-xs font-medium text-amber-500 mb-2">{label}</p>
                )}
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                        <Check className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">Arquivo enviado</p>
                        <p className="text-xs text-slate-400 truncate">{currentUrl.split('/').pop()}</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClick}
                        className="text-xs"
                    >
                        Substituir
                    </Button>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,audio/mpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Label */}
            {label && (
                <p className="text-xs font-medium text-amber-500">{label}</p>
            )}
            {/* Drop Zone */}
            <div
                onClick={uploadState === "idle" || uploadState === "error" ? handleClick : undefined}
                onDrop={uploadState === "idle" || uploadState === "error" ? handleDrop : undefined}
                onDragOver={uploadState === "idle" || uploadState === "error" ? handleDragOver : undefined}
                onDragLeave={uploadState === "idle" || uploadState === "error" ? handleDragLeave : undefined}
                className={cn(
                    "relative rounded-lg border-2 border-dashed p-8 transition-all",
                    uploadState === "idle" || uploadState === "error"
                        ? "cursor-pointer hover:border-amber-500/50 hover:bg-slate-800/50"
                        : "cursor-default",
                    isDragOver
                        ? "border-amber-500 bg-amber-500/10"
                        : uploadState === "error"
                        ? "border-red-500/50 bg-red-500/5"
                        : uploadState === "success"
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-slate-700 bg-slate-800/30"
                )}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,audio/mpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className="flex flex-col items-center justify-center text-center">
                    {uploadState === "idle" && (
                        <>
                            <div className={cn(
                                "mb-4 flex h-14 w-14 items-center justify-center rounded-full transition-colors",
                                isDragOver ? "bg-amber-500/20" : "bg-slate-700"
                            )}>
                                <Upload className={cn(
                                    "h-6 w-6",
                                    isDragOver ? "text-amber-500" : "text-slate-400"
                                )} />
                            </div>
                            <p className="text-sm font-medium text-slate-200">
                                Arraste o MP3 aqui
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                ou clique para selecionar
                            </p>
                            <p className="mt-3 text-xs text-slate-500">
                                Formato: MP3 (máx. 50MB)
                            </p>
                        </>
                    )}

                    {uploadState === "uploading" && (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
                                <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                            </div>
                            <p className="text-sm font-medium text-slate-200">
                                Enviando...
                            </p>
                            {selectedFile && (
                                <p className="mt-1 text-xs text-slate-400 truncate max-w-xs">
                                    {selectedFile.name}
                                </p>
                            )}
                            {/* Progress Bar */}
                            <div className="mt-4 w-full max-w-xs">
                                <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                                    <div
                                        className="h-full bg-amber-500 transition-all duration-300"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                                <p className="mt-2 text-xs text-slate-400 text-center">
                                    {uploadProgress}%
                                </p>
                            </div>
                        </>
                    )}

                    {uploadState === "success" && (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                                <Check className="h-6 w-6 text-emerald-500" />
                            </div>
                            <p className="text-sm font-medium text-emerald-400">
                                Upload concluído!
                            </p>
                            {selectedFile && (
                                <p className="mt-1 text-xs text-slate-400 truncate max-w-xs">
                                    {selectedFile.name}
                                </p>
                            )}
                        </>
                    )}

                    {uploadState === "error" && (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <p className="text-sm font-medium text-red-400">
                                Erro no upload
                            </p>
                            {errorMessage && (
                                <p className="mt-1 text-xs text-red-400/80">
                                    {errorMessage}
                                </p>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    resetUpload();
                                }}
                                className="mt-4 text-xs"
                            >
                                Tentar novamente
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
