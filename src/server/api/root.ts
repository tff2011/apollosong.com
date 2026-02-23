import { songOrderRouter } from "~/server/api/routers/song-order";
import { adminRouter } from "~/server/api/routers/admin";
import { contentCalendarRouter } from "~/server/api/routers/content-calendar";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  songOrder: songOrderRouter,
  admin: adminRouter,
  contentCalendar: contentCalendarRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.songOrder.getAll();
 *       ^? SongOrder[]
 */
export const createCaller = createCallerFactory(appRouter);
