import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { StorageService } from "~/lib/storage";
import { assertAdminPermission, assertSuperAdmin, requireAdminUserFromSession } from "~/server/auth/admin-access";

const ContentPlatformEnum = z.enum(["TIKTOK", "INSTAGRAM", "YOUTUBE"]);
const ContentPostStatusEnum = z.enum(["DRAFT", "APPROVED", "PUBLISHED", "OVERDUE"]);

const contentCalendarProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const adminUser = await requireAdminUserFromSession(ctx.session);
  assertAdminPermission(adminUser, "CONTENT_CALENDAR");

  return next({
    ctx: {
      ...ctx,
      adminUser,
    },
  });
});

export const contentCalendarRouter = createTRPCRouter({
  // ============= QUERIES =============

  getPostsByDateRange: contentCalendarProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
        platform: ContentPlatformEnum.optional(),
        status: ContentPostStatusEnum.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        scheduledAt: { gte: input.from, lte: input.to },
      };
      if (input.platform) where.platform = input.platform;
      if (input.status) where.status = input.status;

      return ctx.db.contentPost.findMany({
        where,
        include: { assets: { orderBy: { sortOrder: "asc" } } },
        orderBy: { scheduledAt: "asc" },
      });
    }),

  getPost: contentCalendarProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.contentPost.findUnique({
        where: { id: input.id },
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      });
    }),

  getStats: contentCalendarProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const posts = await ctx.db.contentPost.groupBy({
        by: ["platform", "status"],
        where: {
          scheduledAt: { gte: input.from, lte: input.to },
        },
        _count: true,
      });
      return posts;
    }),

  // ============= MUTATIONS =============

  createPost: contentCalendarProcedure
    .input(
      z.object({
        title: z.string().min(1),
        caption: z.string().optional(),
        platform: ContentPlatformEnum,
        scheduledAt: z.date(),
        notes: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.contentPost.create({
        data: {
          title: input.title,
          caption: input.caption ?? null,
          platform: input.platform,
          scheduledAt: input.scheduledAt,
          notes: input.notes ?? null,
          tags: input.tags,
        },
        include: { assets: true },
      });
    }),

  updatePost: contentCalendarProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        caption: z.string().nullable().optional(),
        platform: ContentPlatformEnum.optional(),
        scheduledAt: z.date().optional(),
        notes: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        publishedUrl: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.contentPost.update({
        where: { id },
        data,
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      });
    }),

  deletePost: contentCalendarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertSuperAdmin(ctx.adminUser);

      // Get assets to delete from R2
      const assets = await ctx.db.contentPostAsset.findMany({
        where: { postId: input.id },
      });

      // Delete files from R2
      for (const asset of assets) {
        try {
          await StorageService.deleteFile(asset.fileKey);
        } catch (err) {
          console.error(`Failed to delete R2 file ${asset.fileKey}:`, err);
        }
      }

      // Delete post (cascades to assets in DB)
      await ctx.db.contentPost.delete({ where: { id: input.id } });
      return { success: true };
    }),

  updateStatus: contentCalendarProcedure
    .input(
      z.object({
        id: z.string(),
        status: ContentPostStatusEnum,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = { status: input.status };
      if (input.status === "PUBLISHED") {
        data.publishedAt = new Date();
      }
      return ctx.db.contentPost.update({
        where: { id: input.id },
        data,
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      });
    }),

  markOverduePosts: contentCalendarProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.db.contentPost.updateMany({
      where: {
        status: { in: ["DRAFT", "APPROVED"] },
        scheduledAt: { lt: new Date() },
      },
      data: { status: "OVERDUE" },
    });
    return { count: result.count };
  }),

  // ============= ASSET MANAGEMENT =============

  getAssetUploadUrl: contentCalendarProcedure
    .input(
      z.object({
        postId: z.string(),
        fileName: z.string(),
        contentType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const ext = input.fileName.split(".").pop() ?? "bin";
      const key = `content-calendar/${input.postId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const uploadUrl = await StorageService.getUploadUrl(key, input.contentType);
      const publicUrl = await StorageService.getReadUrl(key);
      return { uploadUrl, publicUrl, key };
    }),

  confirmAssetUpload: contentCalendarProcedure
    .input(
      z.object({
        postId: z.string(),
        fileUrl: z.string(),
        fileKey: z.string(),
        fileName: z.string(),
        fileType: z.string(),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const maxSort = await ctx.db.contentPostAsset.aggregate({
        where: { postId: input.postId },
        _max: { sortOrder: true },
      });
      return ctx.db.contentPostAsset.create({
        data: {
          postId: input.postId,
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize ?? null,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
    }),

  deleteAsset: contentCalendarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertSuperAdmin(ctx.adminUser);

      const asset = await ctx.db.contentPostAsset.findUnique({
        where: { id: input.id },
      });
      if (!asset) return { success: false };

      try {
        await StorageService.deleteFile(asset.fileKey);
      } catch (err) {
        console.error(`Failed to delete R2 file ${asset.fileKey}:`, err);
      }

      await ctx.db.contentPostAsset.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
