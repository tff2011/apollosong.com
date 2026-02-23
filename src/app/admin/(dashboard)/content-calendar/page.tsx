"use client";

import { useState, useEffect, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { PostDialog } from "./post-dialog";

type Platform = "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
type Status = "DRAFT" | "APPROVED" | "PUBLISHED" | "OVERDUE";
type ViewMode = "month" | "week";

interface PostWithAssets {
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

const PLATFORM_COLORS: Record<Platform, string> = {
  TIKTOK: "bg-stone-800 text-white",
  INSTAGRAM: "bg-gradient-to-r from-pink-500 to-purple-500 text-white",
  YOUTUBE: "bg-red-600 text-white",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

const STATUS_RING: Record<Status, string> = {
  DRAFT: "ring-stone-300",
  APPROVED: "ring-emerald-400",
  PUBLISHED: "ring-blue-400",
  OVERDUE: "ring-red-400",
};

const STATUS_LABELS: Record<Status, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  PUBLISHED: "Publicado",
  OVERDUE: "Atrasado",
};

const STATUS_BADGE_COLORS: Record<Status, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  APPROVED: "bg-emerald-100 text-emerald-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  OVERDUE: "bg-red-100 text-red-700",
};

export default function ContentCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PostWithAssets | null>(null);
  const [newPostDate, setNewPostDate] = useState<Date | undefined>(undefined);

  const utils = api.useUtils();

  // Compute date range based on view mode
  const { from, to } = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return {
        from: startOfWeek(monthStart, { weekStartsOn: 0 }),
        to: endOfWeek(monthEnd, { weekStartsOn: 0 }),
      };
    }
    return {
      from: startOfWeek(currentDate, { weekStartsOn: 0 }),
      to: endOfWeek(currentDate, { weekStartsOn: 0 }),
    };
  }, [currentDate, viewMode]);

  const { data: posts, isLoading } = api.contentCalendar.getPostsByDateRange.useQuery(
    {
      from,
      to,
      platform: platformFilter !== "ALL" ? (platformFilter as Platform) : undefined,
      status: statusFilter !== "ALL" ? (statusFilter as Status) : undefined,
    },
    { refetchInterval: 30000 }
  );

  const { data: statsData } = api.contentCalendar.getStats.useQuery({ from, to });

  const markOverdue = api.contentCalendar.markOverduePosts.useMutation({
    onSuccess: () => void utils.contentCalendar.getPostsByDateRange.invalidate(),
  });

  // Mark overdue posts on mount
  useEffect(() => {
    void markOverdue.mutateAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build stats
  const stats = useMemo(() => {
    const result = { total: 0, DRAFT: 0, APPROVED: 0, PUBLISHED: 0, OVERDUE: 0 };
    if (!statsData) return result;
    for (const row of statsData) {
      result[row.status] += row._count;
      result.total += row._count;
    }
    return result;
  }, [statsData]);

  // Days grid
  const days = useMemo(() => eachDayOfInterval({ start: from, end: to }), [from, to]);

  // Group posts by day
  const postsByDay = useMemo(() => {
    const map = new Map<string, PostWithAssets[]>();
    if (!posts) return map;
    for (const post of posts) {
      const key = format(new Date(post.scheduledAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post as PostWithAssets);
    }
    return map;
  }, [posts]);

  const navigate = (dir: "prev" | "next") => {
    if (viewMode === "month") {
      setCurrentDate(dir === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    } else {
      setCurrentDate(dir === "prev" ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleDayClick = (day: Date) => {
    setEditingPost(null);
    setNewPostDate(day);
    setDialogOpen(true);
  };

  const handlePostClick = (post: PostWithAssets, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPost(post);
    setNewPostDate(undefined);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    void utils.contentCalendar.getPostsByDateRange.invalidate();
    void utils.contentCalendar.getStats.invalidate();
  };

  const headerLabel =
    viewMode === "month"
      ? format(currentDate, "MMMM yyyy", { locale: ptBR })
      : `${format(from, "dd MMM", { locale: ptBR })} - ${format(to, "dd MMM yyyy", { locale: ptBR })}`;

  const weekDayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-stone-800">
          Calendário de Conteúdo
        </h1>
        <Button
          onClick={() => {
            setEditingPost(null);
            setNewPostDate(new Date());
            setDialogOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1" /> Novo Post
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[130px]">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="TIKTOK">TikTok</SelectItem>
            <SelectItem value="INSTAGRAM">Instagram</SelectItem>
            <SelectItem value="YOUTUBE">YouTube</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
            <SelectItem value="APPROVED">Aprovado</SelectItem>
            <SelectItem value="PUBLISHED">Publicado</SelectItem>
            <SelectItem value="OVERDUE">Atrasado</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => navigate("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="text-xs px-3">
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-sm font-semibold text-stone-700 capitalize min-w-0 sm:min-w-[160px] text-center">
          {headerLabel}
        </span>

        <div className="flex rounded-full border border-stone-200 overflow-hidden">
          <button
            onClick={() => setViewMode("month")}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              viewMode === "month"
                ? "bg-emerald-600 text-white"
                : "bg-porcelain text-stone-600 hover:bg-stone-50"
            )}
          >
            Mês
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors",
              viewMode === "week"
                ? "bg-emerald-600 text-white"
                : "bg-porcelain text-stone-600 hover:bg-stone-50"
            )}
          >
            Semana
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Total", value: stats.total, color: "bg-stone-100 text-stone-700" },
          { label: "Rascunho", value: stats.DRAFT, color: STATUS_BADGE_COLORS.DRAFT },
          { label: "Aprovado", value: stats.APPROVED, color: STATUS_BADGE_COLORS.APPROVED },
          { label: "Publicado", value: stats.PUBLISHED, color: STATUS_BADGE_COLORS.PUBLISHED },
          { label: "Atrasado", value: stats.OVERDUE, color: STATUS_BADGE_COLORS.OVERDUE },
        ].map((s) => (
          <span
            key={s.label}
            className={cn("text-xs font-medium px-3 py-1 rounded-full", s.color)}
          >
            {s.value} {s.label}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
        </div>
      ) : (
        <div className="bg-[#111827] rounded-lg border border-stone-200 overflow-x-auto shadow-sm">
          <div className="min-w-[680px]">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-stone-200">
              {weekDayNames.map((name) => (
                <div
                  key={name}
                  className="py-2 text-center text-xs font-semibold text-stone-500 uppercase tracking-wider"
                >
                  {name}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayPosts = postsByDay.get(key) ?? [];
              const inMonth = viewMode === "month" ? isSameMonth(day, currentDate) : true;
              const today = isToday(day);
              const maxVisible = viewMode === "month" ? 3 : 5;
              const visiblePosts = dayPosts.slice(0, maxVisible);
              const overflow = dayPosts.length - maxVisible;

              return (
                <div
                  key={key}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "border-b border-r border-stone-100 p-1.5 cursor-pointer hover:bg-stone-50 transition-colors",
                    viewMode === "month" ? "min-h-[100px]" : "min-h-[180px]",
                    !inMonth && "bg-stone-50/50"
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                        today
                          ? "bg-emerald-600 text-white"
                          : inMonth
                            ? "text-stone-700"
                            : "text-stone-300"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* Post pills */}
                  <div className="space-y-0.5">
                    {visiblePosts.map((post) => (
                      <PostPill
                        key={post.id}
                        post={post}
                        viewMode={viewMode}
                        onClick={(e) => handlePostClick(post, e)}
                      />
                    ))}
                    {overflow > 0 && (
                      <div className="text-[10px] text-stone-400 pl-1">
                        +{overflow} mais
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dialog */}
      <PostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        post={editingPost}
        defaultDate={newPostDate}
        onSaved={handleSaved}
      />
    </div>
  );
}

function PostPill({
  post,
  viewMode,
  onClick,
}: {
  post: PostWithAssets;
  viewMode: ViewMode;
  onClick: (e: React.MouseEvent) => void;
}) {
  const time = format(new Date(post.scheduledAt), "HH:mm");
  const firstImageAsset = post.assets.find((a) => a.fileType.startsWith("image/"));

  if (viewMode === "week") {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded-md p-1.5 text-xs cursor-pointer ring-1 ring-inset transition-shadow hover:shadow-sm",
          PLATFORM_COLORS[post.platform],
          STATUS_RING[post.status]
        )}
      >
        <div className="flex items-start gap-1.5">
          {firstImageAsset && (
            <img
              src={firstImageAsset.fileUrl}
              alt=""
              className="w-8 h-8 rounded object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{post.title}</div>
            <div className="opacity-75 text-[10px]">
              {time} · {PLATFORM_LABELS[post.platform]}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Month view — compact pill
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] leading-tight truncate cursor-pointer ring-1 ring-inset transition-shadow hover:shadow-sm",
        PLATFORM_COLORS[post.platform],
        STATUS_RING[post.status]
      )}
      title={`${post.title} · ${time} · ${PLATFORM_LABELS[post.platform]} · ${STATUS_LABELS[post.status]}`}
    >
      {post.title}
    </div>
  );
}
