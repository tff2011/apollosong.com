export const ADMIN_ROLES = ["SUPER_ADMIN", "STAFF"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "LEADS",
  "STATS",
  "CONVERSION",
  "TICKETS",
  "WHATSAPP",
  "BOUNCES",
  "KNOWLEDGE",
  "PRONUNCIATION",
  "GENRE_PROMPTS",
  "AUDIO_SAMPLES",
  "SUNO_EMAILS",
  "CONTENT_CALENDAR",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_METADATA: Record<
  AdminPermission,
  { label: string; description: string }
> = {
  LEADS: {
    label: "Pedidos e Leads",
    description: "Acesso ao fluxo de pedidos, letras, entregas e revisões.",
  },
  STATS: {
    label: "Inteligência",
    description: "Visualizar métricas e relatórios de receita.",
  },
  CONVERSION: {
    label: "Funil",
    description: "Visualizar dados de conversão e desempenho do funil.",
  },
  TICKETS: {
    label: "E-mails (tickets)",
    description: "Atender tickets e enviar respostas por e-mail.",
  },
  WHATSAPP: {
    label: "WhatsApp",
    description: "Gerenciar conversas, rótulos e respostas no WhatsApp.",
  },
  BOUNCES: {
    label: "Bounces",
    description: "Ver e resolver problemas de e-mail devolvido.",
  },
  KNOWLEDGE: {
    label: "Knowledge Base",
    description: "Editar base de conhecimento do suporte.",
  },
  PRONUNCIATION: {
    label: "Correções",
    description: "Gerenciar correções de pronúncia para geração de músicas.",
  },
  GENRE_PROMPTS: {
    label: "Gêneros",
    description: "Gerenciar prompts e configurações de gêneros.",
  },
  AUDIO_SAMPLES: {
    label: "Áudios",
    description: "Gerenciar amostras de áudio por gênero.",
  },
  SUNO_EMAILS: {
    label: "Suno Emails",
    description: "Visualizar contas de e-mail disponíveis para Suno.",
  },
  CONTENT_CALENDAR: {
    label: "Calendário de Conteúdo",
    description: "Gerenciar planejamento e assets de conteúdo social.",
  },
};

type AdminPathRule = {
  prefix: string;
  permission?: AdminPermission;
  superAdminOnly?: boolean;
  allowAnyAdmin?: boolean;
};

const ADMIN_PATH_RULES: AdminPathRule[] = [
  { prefix: "/admin/team", superAdminOnly: true },
  { prefix: "/admin/time-clock", superAdminOnly: true },
  { prefix: "/admin/leads", permission: "LEADS" },
  { prefix: "/admin/automation", superAdminOnly: true },
  { prefix: "/admin/stats", superAdminOnly: true },
  { prefix: "/admin/conversion", permission: "CONVERSION" },
  { prefix: "/admin/coupons", permission: "CONVERSION" },
  { prefix: "/admin/tickets", permission: "TICKETS" },
  { prefix: "/admin/whatsapp", permission: "WHATSAPP" },
  { prefix: "/admin/bounces", permission: "BOUNCES" },
  { prefix: "/admin/knowledge", permission: "KNOWLEDGE" },
  { prefix: "/admin/pronunciation-corrections", permission: "PRONUNCIATION" },
  { prefix: "/admin/genre-prompts", permission: "GENRE_PROMPTS" },
  { prefix: "/admin/audio-samples", permission: "AUDIO_SAMPLES" },
  { prefix: "/admin/suno-emails", permission: "SUNO_EMAILS" },
  { prefix: "/admin/content-calendar", permission: "CONTENT_CALENDAR" },
];

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return "/";
  const noQuery = trimmed.split("?")[0] ?? trimmed;
  const noHash = noQuery.split("#")[0] ?? noQuery;
  if (noHash.length > 1 && noHash.endsWith("/")) {
    return noHash.slice(0, -1);
  }
  return noHash;
}

function resolveRule(pathname: string): AdminPathRule | null {
  const normalized = normalizePathname(pathname);
  return (
    ADMIN_PATH_RULES.find((rule) => normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)) ?? null
  );
}

export function isSuperAdmin(role: AdminRole): boolean {
  return role === "SUPER_ADMIN";
}

export function hasAdminPermission(
  role: AdminRole,
  permissions: AdminPermission[],
  permission: AdminPermission
): boolean {
  if (isSuperAdmin(role)) return true;
  return permissions.includes(permission);
}

export function canAccessAdminPath(
  role: AdminRole,
  permissions: AdminPermission[],
  pathname: string
): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === "/admin" || normalized === "/admin/login") {
    return true;
  }

  const rule = resolveRule(normalized);
  if (!rule) {
    return isSuperAdmin(role);
  }

  if (rule.superAdminOnly) {
    return isSuperAdmin(role);
  }

  if (rule.allowAnyAdmin) {
    return true;
  }

  if (rule.permission) {
    return hasAdminPermission(role, permissions, rule.permission);
  }

  return false;
}

export function getDefaultAdminPath(role: AdminRole, permissions: AdminPermission[]): string {
  const orderedPaths: string[] = [
    "/admin/leads",
    "/admin/stats",
    "/admin/conversion",
    "/admin/coupons",
    "/admin/tickets",
    "/admin/whatsapp",
    "/admin/bounces",
    "/admin/knowledge",
    "/admin/pronunciation-corrections",
    "/admin/genre-prompts",
    "/admin/audio-samples",
    "/admin/suno-emails",
    "/admin/content-calendar",
    "/admin/time-clock",
    "/admin/team",
  ];

  for (const path of orderedPaths) {
    if (canAccessAdminPath(role, permissions, path)) {
      return path;
    }
  }

  return "/admin/time-clock";
}
