"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Calendar } from "~/components/ui/calendar";
import { ContentAssetUpload } from "~/components/admin/content-asset-upload";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

type Platform = "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
type Status = "DRAFT" | "APPROVED" | "PUBLISHED" | "OVERDUE";

interface PostData {
  id: string;
  title: string;
  caption: string | null;
  platform: Platform;
  status: Status;
  scheduledAt: Date;
  publishedAt: Date | null;
  publishedUrl: string | null;
  notes: string | null;
  tags: string[];
  assets: Array<{
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string;
  }>;
}

interface PostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: PostData | null;
  defaultDate?: Date;
  onSaved: () => void;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

const STATUS_LABELS: Record<Status, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  PUBLISHED: "Publicado",
  OVERDUE: "Atrasado",
};

const STATUS_COLORS: Record<Status, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  APPROVED: "bg-emerald-100 text-emerald-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  OVERDUE: "bg-red-100 text-red-700",
};

export function PostDialog({
  open,
  onOpenChange,
  post,
  defaultDate,
  onSaved,
}: PostDialogProps) {
  const isEdit = !!post;

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("TIKTOK");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("12:00");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const utils = api.useUtils();
  const createPost = api.contentCalendar.createPost.useMutation();
  const updatePost = api.contentCalendar.updatePost.useMutation();
  const updateStatus = api.contentCalendar.updateStatus.useMutation();
  const deletePost = api.contentCalendar.deletePost.useMutation();

  // Refetch post data when editing
  const { data: freshPost } = api.contentCalendar.getPost.useQuery(
    { id: post?.id ?? "" },
    { enabled: isEdit && open }
  );

  const currentPost = freshPost ?? post;

  useEffect(() => {
    if (open) {
      if (currentPost) {
        setTitle(currentPost.title);
        setPlatform(currentPost.platform);
        const d = new Date(currentPost.scheduledAt);
        setDate(d);
        setTime(format(d, "HH:mm"));
        setCaption(currentPost.caption ?? "");
        setNotes(currentPost.notes ?? "");
        setTags(currentPost.tags);
        setPublishedUrl(currentPost.publishedUrl ?? "");
      } else {
        setTitle("");
        setPlatform("TIKTOK");
        setDate(defaultDate ?? new Date());
        setTime("12:00");
        setCaption("");
        setNotes("");
        setTags([]);
        setTagInput("");
        setPublishedUrl("");
      }
    }
  }, [open, currentPost, defaultDate]);

  const buildScheduledAt = () => {
    if (!date) return new Date();
    const [h, m] = time.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h ?? 12, m ?? 0, 0, 0);
    return d;
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const scheduledAt = buildScheduledAt();

    if (isEdit && post) {
      await updatePost.mutateAsync({
        id: post.id,
        title: title.trim(),
        platform,
        scheduledAt,
        caption: caption.trim() || null,
        notes: notes.trim() || null,
        tags,
        publishedUrl: publishedUrl.trim() || null,
      });
    } else {
      await createPost.mutateAsync({
        title: title.trim(),
        platform,
        scheduledAt,
        caption: caption.trim() || undefined,
        notes: notes.trim() || undefined,
        tags,
      });
    }

    onSaved();
    onOpenChange(false);
  };

  const handleStatusChange = async (newStatus: Status) => {
    if (!post) return;
    await updateStatus.mutateAsync({ id: post.id, status: newStatus });
    onSaved();
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm("Tem certeza que deseja excluir este post?")) return;
    await deletePost.mutateAsync({ id: post.id });
    onSaved();
    onOpenChange(false);
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const isSaving = createPost.isPending || updatePost.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-[#111827]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isEdit ? "Editar Post" : "Novo Post"}</DialogTitle>
            {isEdit && currentPost && (
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  STATUS_COLORS[currentPost.status]
                )}
              >
                {STATUS_LABELS[currentPost.status]}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">
              Título *
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do post"
            />
          </div>

          {/* Platform + Date + Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">
                Plataforma
              </label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TIKTOK">TikTok</SelectItem>
                  <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                  <SelectItem value="YOUTUBE">YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">
                Data
              </label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal h-9 text-sm"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-stone-400" />
                    {date ? format(date, "dd/MM/yy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setCalendarOpen(false);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">
                Hora
              </label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">
              Legenda
            </label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Texto da legenda..."
              rows={3}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">
              Tags
            </label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Adicionar tag..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTag} className="h-9">
                +
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 text-xs cursor-pointer hover:bg-red-100"
                    onClick={() => removeTag(tag)}
                  >
                    {tag}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">
              Notas internas
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas..."
              rows={2}
            />
          </div>

          {/* Published URL (edit only) */}
          {isEdit && (
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">
                URL publicada
              </label>
              <Input
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}

          {/* Assets (edit only — need post ID for uploads) */}
          {isEdit && post && currentPost && (
            <ContentAssetUpload
              postId={post.id}
              assets={currentPost.assets}
              onAssetAdded={() => void utils.contentCalendar.getPost.invalidate({ id: post.id })}
              onAssetDeleted={() => void utils.contentCalendar.getPost.invalidate({ id: post.id })}
            />
          )}
        </div>

        {/* Status actions (edit only) */}
        {isEdit && currentPost && (
          <div className="flex gap-2 flex-wrap border-t border-stone-100 pt-3">
            {currentPost.status !== "DRAFT" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStatusChange("DRAFT")}
                disabled={updateStatus.isPending}
                className="text-xs"
              >
                Voltar p/ Rascunho
              </Button>
            )}
            {(currentPost.status === "DRAFT" || currentPost.status === "OVERDUE") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStatusChange("APPROVED")}
                disabled={updateStatus.isPending}
                className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                Aprovar
              </Button>
            )}
            {currentPost.status === "APPROVED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStatusChange("PUBLISHED")}
                disabled={updateStatus.isPending}
                className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                Marcar Publicado
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <div className="flex w-full justify-between">
            <div>
              {isEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete()}
                  disabled={deletePost.isPending}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={!title.trim() || isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {isEdit ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
