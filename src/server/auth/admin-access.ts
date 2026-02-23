import { type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { formatInTimeZone } from "date-fns-tz";
import { type Session } from "next-auth";
import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
  type AdminRole,
  hasAdminPermission as hasPermissionInRole,
} from "~/lib/admin/permissions";
import { db } from "~/server/db";

export const WORK_SESSION_TZ = "America/Sao_Paulo";

export const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  adminUsername: true,
  adminRole: true,
  adminPermissions: true,
  adminEnabled: true,
} satisfies Prisma.UserSelect;

export type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

const ANY_ADMIN_PROCEDURES = new Set<string>([
  "getCurrentAdmin",
  "getMyWorkSessionStatus",
  "respondToWorkSessionPrompt",
  "startMyWorkSession",
  "pauseMyWorkSession",
  "resumeMyWorkSession",
  "endMyWorkSession",
]);

const SUPER_ADMIN_ONLY_PROCEDURES = new Set<string>([
  "getAdminUsers",
  "createAdminUser",
  "updateAdminUserPermissions",
  "toggleAdminUserEnabled",
  "resetAdminUserPassword",
  "getMyWorkSessionHistory",
  "getTeamWorkSessionHistory",
  "getMonthlyRevenue",
  "getDailyRevenue",
  "getWeeklyRevenue",
  "getRevenueByCountry",
]);

const SUPER_ADMIN_ONLY_DESTRUCTIVE_PROCEDURES = new Set<string>([
  "deletePronunciationCorrection",
  "deleteGenrePrompt",
  "saveGenreAudioSamples",
  "deleteKnowledgeEntry",
  "clearWhatsAppConversation",
  "deleteWhatsAppLabel",
]);

const LEADS_PROCEDURES = [
  "getLeadsPaginated",
  "getLeadById",
  "getFilterOptions",
  "getAutomationNavStats",
  "bulkUpdateStatus",
  "bulkDelete",
  "bulkSendDeliveryEmails",
  "getLeads",
  "updateOrder",
  "completeRevision",
  "getReviewerNames",
  "lockRevision",
  "unlockRevision",
  "generateCorrectedLyrics",
  "saveCorrectedLyrics",
  "deleteOrder",
  "createOrder",
  "generateLyrics",
  "queueLyricsGeneration",
  "updateLyrics",
  "formatLyrics",
  "getLyrics",
  "getSongUploadUrl",
  "confirmSongUpload",
  "confirmRevisionHistorySongUpload",
  "deleteRevisionHistorySongFile",
  "sendSongDeliveryEmail",
  "resendDeliveryEmail",
  "deleteSongFile",
  "getSongDeliveryInfo",
  "updateStreamingVipUrl",
  "markAsPublishedOnDistroKid",
  "generateSongNameSuggestions",
  "generateCoverPrompts",
  "generateCoverImage",
  "setActiveCover",
  "deleteGeneratedCover",
  "toggleCoverApproval",
  "sendStreamingUrgentContactEmail",
  "getRevisionQueueInfo",
  "createStreamingUpsellForSong",
] as const;

const STATS_PROCEDURES = [
  "getStats",
  "getMonthlyRevenue",
  "getDailyRevenue",
  "getWeeklyRevenue",
  "getRevenueByCountry",
] as const;

const CONVERSION_PROCEDURES = [
  "getDailyConversion",
  "getConversion",
  "getCheckoutCouponConfig",
  "updateCheckoutCouponConfig",
  "getDiscountCoupons",
  "createDiscountCoupon",
  "updateDiscountCoupon",
  "deleteDiscountCoupon",
] as const;

const PRONUNCIATION_PROCEDURES = [
  "getPronunciationCorrections",
  "createPronunciationCorrection",
  "updatePronunciationCorrection",
  "deletePronunciationCorrection",
] as const;

const GENRE_PROMPT_PROCEDURES = [
  "getGenrePrompts",
  "createGenrePrompt",
  "updateGenrePrompt",
  "deleteGenrePrompt",
  "syncGenrePromptsFromCode",
] as const;

const AUDIO_SAMPLE_PROCEDURES = [
  "getGenreAudioSamples",
  "saveGenreAudioSamples",
] as const;

const SUNO_EMAIL_PROCEDURES = ["getSunoEmails"] as const;

const TICKET_PROCEDURES = [
  "getTickets",
  "getOrdersByEmail",
  "getNextUnrepliedTicketId",
  "getTicketById",
  "updateTicketStatus",
  "updateTicketPriority",
  "sendTicketReply",
  "regenerateAiResponse",
  "getTicketStats",
  "bulkCloseTickets",
  "bulkGenerateAiResponses",
  "bulkSendAiResponses",
  "triggerEmailPoll",
] as const;

const BOUNCE_PROCEDURES = [
  "getEmailBounces",
  "resolveEmailBounce",
  "getEmailBounceStats",
] as const;

const KNOWLEDGE_PROCEDURES = [
  "getKnowledgeEntries",
  "createKnowledgeEntry",
  "updateKnowledgeEntry",
  "deleteKnowledgeEntry",
] as const;

const WHATSAPP_PROCEDURES = [
  "getWhatsAppConversations",
  "getWhatsAppMessages",
  "markWhatsAppConversationRead",
  "markWhatsAppConversationUnread",
  "startWhatsAppConversation",
  "sendWhatsAppReply",
  "sendWhatsAppOrderSongs",
  "sendWhatsAppOrderLyricsPdfA4",
  "claimWhatsAppConversation",
  "heartbeatWhatsAppConversation",
  "releaseWhatsAppConversation",
  "toggleWhatsAppBot",
  "clearWhatsAppConversation",
  "getWhatsAppStats",
  "getWhatsAppLabels",
  "createWhatsAppLabel",
  "deleteWhatsAppLabel",
  "setConversationLabel",
] as const;

const ADMIN_PROCEDURE_PERMISSIONS = new Map<string, AdminPermission[]>();

for (const procedure of LEADS_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["LEADS"]);
}

for (const procedure of STATS_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["STATS", "LEADS"]);
}

for (const procedure of CONVERSION_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["CONVERSION", "LEADS"]);
}

for (const procedure of PRONUNCIATION_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["PRONUNCIATION"]);
}

for (const procedure of GENRE_PROMPT_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["GENRE_PROMPTS"]);
}

for (const procedure of AUDIO_SAMPLE_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["AUDIO_SAMPLES"]);
}

for (const procedure of SUNO_EMAIL_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["SUNO_EMAILS"]);
}

for (const procedure of TICKET_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["TICKETS"]);
}

for (const procedure of BOUNCE_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["BOUNCES"]);
}

for (const procedure of KNOWLEDGE_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["KNOWLEDGE"]);
}

for (const procedure of WHATSAPP_PROCEDURES) {
  ADMIN_PROCEDURE_PERMISSIONS.set(procedure, ["WHATSAPP"]);
}

export function normalizeAdminUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function toAdminPermissions(values: string[]): AdminPermission[] {
  const allowed = new Set<string>(ADMIN_PERMISSIONS);
  return values.filter((value): value is AdminPermission => allowed.has(value));
}

export function isSuperAdmin(user: Pick<AdminUserRecord, "adminRole">): boolean {
  return user.adminRole === "SUPER_ADMIN";
}

export function hasAdminPermission(
  user: Pick<AdminUserRecord, "adminRole" | "adminPermissions">,
  permission: AdminPermission
): boolean {
  return hasPermissionInRole(
    user.adminRole as AdminRole,
    toAdminPermissions(user.adminPermissions as unknown as string[]),
    permission
  );
}

export async function getAdminUserById(userId: string): Promise<AdminUserRecord | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  });
}

export async function requireAdminUserFromSession(session: Session | null): Promise<AdminUserRecord> {
  const userId = session?.user?.id;

  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login para continuar." });
  }

  const adminUser = await getAdminUserById(userId);

  if (!adminUser || !adminUser.adminEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso administrativo não autorizado." });
  }

  return adminUser;
}

export function assertAdminPermission(
  user: Pick<AdminUserRecord, "adminRole" | "adminPermissions">,
  permission: AdminPermission
): void {
  if (!hasAdminPermission(user, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para esta área." });
  }
}

export function assertSuperAdmin(user: Pick<AdminUserRecord, "adminRole">): void {
  if (!isSuperAdmin(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o administrador geral pode realizar esta ação." });
  }
}

export function assertAccessToAdminProcedure(
  user: Pick<AdminUserRecord, "adminRole" | "adminPermissions">,
  fullPath: string
): void {
  const procedureName = fullPath.split(".").pop() ?? fullPath;

  if (ANY_ADMIN_PROCEDURES.has(procedureName)) {
    return;
  }

  if (SUPER_ADMIN_ONLY_PROCEDURES.has(procedureName)) {
    assertSuperAdmin(user);
    return;
  }

  if (SUPER_ADMIN_ONLY_DESTRUCTIVE_PROCEDURES.has(procedureName)) {
    assertSuperAdmin(user);
    return;
  }

  const permissions = ADMIN_PROCEDURE_PERMISSIONS.get(procedureName);
  if (permissions) {
    const allowed = permissions.some((permission) => hasAdminPermission(user, permission));
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para esta ação." });
    }
    return;
  }

  if (!isSuperAdmin(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para esta ação." });
  }
}

export function buildWorkSessionDayKey(now: Date = new Date()): string {
  return formatInTimeZone(now, WORK_SESSION_TZ, "yyyy-MM-dd");
}
