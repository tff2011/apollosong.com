"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X, Loader2, Image, Film, AlertCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

interface ContentAssetUploadProps {
  postId: string;
  assets: Array<{
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string;
  }>;
  onAssetAdded: () => void;
  onAssetDeleted: () => void;
}

type UploadState = "idle" | "uploading" | "error";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];
const ACCEPT_STRING = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm";

export function ContentAssetUpload({
  postId,
  assets,
  onAssetAdded,
  onAssetDeleted,
}: ContentAssetUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrl = api.contentCalendar.getAssetUploadUrl.useMutation();
  const confirmUpload = api.contentCalendar.confirmAssetUpload.useMutation();
  const deleteAsset = api.contentCalendar.deleteAsset.useMutation();

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setErrorMessage("Formato não suportado. Use: JPG, PNG, WebP, GIF, MP4, MOV, WebM");
        setUploadState("error");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage("Arquivo muito grande (máx. 200MB)");
        setUploadState("error");
        return;
      }

      setUploadState("uploading");
      setUploadProgress(0);
      setErrorMessage(null);

      try {
        const { uploadUrl, publicUrl, key } = await getUploadUrl.mutateAsync({
          postId,
          fileName: file.name,
          contentType: file.type,
        });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed with status ${xhr.status}`));
          });
          xhr.addEventListener("error", () => reject(new Error("Upload failed")));
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });

        await confirmUpload.mutateAsync({
          postId,
          fileUrl: publicUrl,
          fileKey: key,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });

        setUploadState("idle");
        setUploadProgress(0);
        onAssetAdded();
      } catch (error) {
        console.error("Upload error:", error);
        setErrorMessage(error instanceof Error ? error.message : "Upload failed");
        setUploadState("error");
      }

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [postId, getUploadUrl, confirmUpload, onAssetAdded]
  );

  const handleDelete = useCallback(
    async (assetId: string) => {
      setDeletingId(assetId);
      try {
        await deleteAsset.mutateAsync({ id: assetId });
        onAssetDeleted();
      } catch (err) {
        console.error("Delete error:", err);
      } finally {
        setDeletingId(null);
      }
    },
    [deleteAsset, onAssetDeleted]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadFile(file);
    },
    [uploadFile]
  );

  const isImage = (type: string) => type.startsWith("image/");

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500">Assets</p>

      {/* Existing assets grid */}
      {assets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="relative group rounded-lg border border-stone-200 bg-[#0A0E1A] overflow-hidden aspect-square"
            >
              {isImage(asset.fileType) ? (
                <img
                  src={asset.fileUrl}
                  alt={asset.fileName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50 p-2">
                  <Film className="h-6 w-6 text-stone-400 mb-1" />
                  <span className="text-[10px] text-stone-500 truncate w-full text-center">
                    {asset.fileName}
                  </span>
                </div>
              )}
              <button
                onClick={() => void handleDelete(asset.id)}
                disabled={deletingId === asset.id}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                {deletingId === asset.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div
        onClick={uploadState !== "uploading" ? () => fileInputRef.current?.click() : undefined}
        onDrop={uploadState !== "uploading" ? handleDrop : undefined}
        onDragOver={
          uploadState !== "uploading"
            ? (e) => {
                e.preventDefault();
                setIsDragOver(true);
              }
            : undefined
        }
        onDragLeave={
          uploadState !== "uploading"
            ? (e) => {
                e.preventDefault();
                setIsDragOver(false);
              }
            : undefined
        }
        className={cn(
          "relative rounded-lg border-2 border-dashed p-4 transition-all text-center",
          uploadState !== "uploading" ? "cursor-pointer hover:border-emerald-400" : "cursor-default",
          isDragOver
            ? "border-emerald-500 bg-emerald-50"
            : uploadState === "error"
              ? "border-red-300 bg-red-50/50"
              : "border-stone-300 bg-stone-50/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_STRING}
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploadState === "idle" && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1">
              <Image className="h-4 w-4 text-stone-400" />
              <Film className="h-4 w-4 text-stone-400" />
            </div>
            <p className="text-xs text-stone-500">
              Arraste ou clique para enviar
            </p>
            <p className="text-[10px] text-stone-400">
              Imagens e vídeos (máx. 200MB)
            </p>
          </div>
        )}

        {uploadState === "uploading" && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />
            <div className="w-full max-w-xs">
              <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-stone-500">{uploadProgress}%</p>
            </div>
          </div>
        )}

        {uploadState === "error" && (
          <div className="flex flex-col items-center gap-1">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <p className="text-xs text-red-500">{errorMessage}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setUploadState("idle");
                setErrorMessage(null);
              }}
              className="mt-1 text-[10px] h-6"
            >
              Tentar novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
