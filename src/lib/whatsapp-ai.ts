/**
 * WhatsApp AI response orchestrator
 * Uses OpenRouter + SupportKnowledge + order lookup
 * Mirrors the ticket AI worker pattern in all-workers.ts
 */

import { db } from "~/server/db";
import { buildPhoneCandidates } from "~/lib/phone-matching";
import { GENRE_NAMES } from "~/lib/lyrics-generator";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_SUPPORT_MODEL = process.env.OPENROUTER_SUPPORT_MODEL || "google/gemini-3-flash-preview";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://apollosong.com";
const NORMALIZED_SITE_URL = SITE_URL.replace(/\/+$/, "");
const WHATSAPP_AI_HTTP_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.WHATSAPP_AI_HTTP_TIMEOUT_MS || "", 10);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : 30_000;
})();

interface GenerateResponseInput {
  conversationId: string;
  waId: string;
  locale: string;
}

function normalizeWhatsAppLocale(locale: string): "pt" | "en" | "es" | "fr" | "it" {
  const value = (locale || "").toLowerCase().trim();
  if (value.startsWith("pt")) return "pt";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("it")) return "it";
  return "en";
}

type WhatsAppLocale = "pt" | "en" | "es" | "fr" | "it";

function getLocalePrefix(locale: WhatsAppLocale): string {
  return locale !== "en" ? `/${locale}` : "";
}

function resolveLinkLocaleFromWaId(locale: WhatsAppLocale, waId: string): WhatsAppLocale {
  const digits = (waId || "").replace(/\D/g, "");
  if (digits.startsWith("55")) return "pt";
  return locale;
}

function normalizeOrderLocale(locale: string | null | undefined): WhatsAppLocale | null {
  const value = (locale || "").toLowerCase().trim();
  if (!value) return null;
  if (value.startsWith("pt")) return "pt";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("it")) return "it";
  if (value.startsWith("en")) return "en";
  return null;
}

function pickLinkLocaleFromOrders(orders: Array<{ locale: string | null; createdAt: Date | string }>): WhatsAppLocale | null {
  if (orders.length === 0) return null;

  const sorted = [...orders].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    const safeATime = Number.isFinite(aTime) ? aTime : 0;
    const safeBTime = Number.isFinite(bTime) ? bTime : 0;
    return safeBTime - safeATime;
  });

  for (const order of sorted) {
    const locale = normalizeOrderLocale(order.locale);
    if (locale) return locale;
  }

  return null;
}

function buildTrackOrderBase(locale: WhatsAppLocale): string {
  return `${NORMALIZED_SITE_URL}${getLocalePrefix(locale)}/track-order`;
}

function normalizeApolloLocaleInLinks(text: string, locale: WhatsAppLocale): string {
  const targetSite = `${NORMALIZED_SITE_URL}${getLocalePrefix(locale)}`;
  return text.replace(
    /https?:\/\/(?:www\.)?apollosong\.com\/(?:pt|en|es|fr|it)(?=\/|\?|#|$)/gi,
    targetSite,
  );
}

function formatGenreForLocale(genre: string | null, locale: WhatsAppLocale): string {
  if (!genre) return "N/A";
  const key = String(genre).trim().toLowerCase();
  const translated = GENRE_NAMES[key]?.[locale];
  if (translated) return translated;
  return genre;
}

const WHATSAPP_CLASSIFICATIONS = [
  "PEDIDO_STATUS",
  "PAGAMENTO",
  "REVISAO",
  "TECNICO",
  "COMERCIAL",
  "OUTROS",
] as const;

type WhatsAppClassification = typeof WHATSAPP_CLASSIFICATIONS[number];

function normalizeClassification(raw?: string | null): WhatsAppClassification | null {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return WHATSAPP_CLASSIFICATIONS.includes(normalized as WhatsAppClassification)
    ? (normalized as WhatsAppClassification)
    : null;
}

function normalizeForMatch(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isLinkAccessIssueMessage(lastCustomerMessage: string): boolean {
  const text = normalizeForMatch(lastCustomerMessage);
  if (!text) return false;

  if (/(nao abre|link nao abre|cant open|cannot open|doesnt open|doesn't open|no abre|ouvre pas|non si apre)/.test(text)) {
    return true;
  }

  const hasIssueSignal = /(nao funciona|nao consigo|erro|problema|travou|falha|not working|error|no funciona|ne fonctionne|non funziona)/.test(text);
  const hasAccessTarget = /(link|site|pagina|page|track-order|download|arquivo|pdf|abrir|acessar|acesso|enlace|lien)/.test(text);
  return hasIssueSignal && hasAccessTarget;
}

function buildLinkAccessFallback(locale: WhatsAppLocale, trackingLink: string): string {
  const templates: Record<WhatsAppLocale, string> = {
    pt: `Entendi. Vamos resolver esse acesso agora.\n\n1) Copie e cole este link direto no navegador (Chrome/Safari): ${trackingLink}\n2) Se não abrir, teste em outro navegador ou troque entre Wi-Fi e 4G/5G.\n3) Me diga qual erro aparece na tela para eu te orientar no próximo passo.`,
    en: `Understood. Let's fix the access issue now.\n\n1) Copy and paste this link directly in your browser (Chrome/Safari): ${trackingLink}\n2) If it still does not open, try another browser or switch between Wi-Fi and mobile data.\n3) Tell me the exact error shown on screen so I can guide your next step.`,
    es: `Entendido. Vamos resolver el acceso ahora.\n\n1) Copia y pega este enlace directamente en el navegador (Chrome/Safari): ${trackingLink}\n2) Si no abre, prueba otro navegador o cambia entre Wi-Fi y datos móviles.\n3) Dime el error exacto que aparece en pantalla para guiarte en el siguiente paso.`,
    fr: `Compris. On va regler l'acces maintenant.\n\n1) Copiez et collez ce lien directement dans le navigateur (Chrome/Safari) : ${trackingLink}\n2) Si ca ne s'ouvre pas, essayez un autre navigateur ou basculez entre Wi-Fi et donnees mobiles.\n3) Dites-moi le message d'erreur exact affiche a l'ecran pour que je vous guide.`,
    it: `Capito. Risolviamo subito il problema di accesso.\n\n1) Copia e incolla questo link direttamente nel browser (Chrome/Safari): ${trackingLink}\n2) Se non si apre, prova un altro browser o passa tra Wi-Fi e rete mobile.\n3) Dimmi l'errore esatto che compare sullo schermo cosi ti guido nel prossimo passo.`,
  };

  return templates[locale];
}

function enforceLinkAccessTechnicalFocus(
  aiResponse: string,
  lastCustomerMessage: string,
  locale: WhatsAppLocale,
  trackingLink: string,
): string {
  if (!isLinkAccessIssueMessage(lastCustomerMessage)) {
    return aiResponse;
  }

  const normalizedResponse = normalizeForMatch(aiResponse);
  const mentionsOffTopicSales = /(pdf da letra|r\$\s*19|pix|spotify|streaming vip|quadro|emoldur|revisao|solicitar revisao)/.test(normalizedResponse);
  const hasTechnicalGuidance = /(copie|cole|navegador|chrome|safari|teste|tente|wifi|wi fi|4g|5g|erro|mensagem de erro|link|abrir|acessar|browser|open|access|enlace|lien)/.test(normalizedResponse);

  if (!hasTechnicalGuidance || mentionsOffTopicSales) {
    return buildLinkAccessFallback(locale, trackingLink);
  }

  return aiResponse;
}

function isGenericPrimarySongPricingQuestion(lastCustomerMessage: string, locale: "pt" | "en" | "es" | "fr" | "it"): boolean {
  if (locale !== "pt") return false;
  const text = (lastCustomerMessage || "").toLowerCase();
  if (!text) return false;

  const asksPriceOrPlan = /(valor|pre[çc]o|planos?|quanto\s+(custa|fica|é)|qual\s+o\s+valor|quais?\s+os?\s+planos?)/i.test(text);
  if (!asksPriceOrPlan) return false;

  // Avoid forcing base plans when the customer asks for a specific add-on price.
  const addOnKeywords = /(spotify|streaming|pdf|letra|revis[aã]o|taxa|g[eê]nero|dupla emo[cç][aã]o|adicional|upgrade|cupom|desconto|pix|boleto)/i;
  return !addOnKeywords.test(text);
}

function ensurePrimaryPlansPricing(aiResponse: string, lastCustomerMessage: string, locale: "pt" | "en" | "es" | "fr" | "it"): string {
  if (!isGenericPrimarySongPricingQuestion(lastCustomerMessage, locale)) {
    return aiResponse;
  }

  const hasEssentialPlan = /69[\.,]90/.test(aiResponse);
  const hasExpressPlan = /99[\.,]90/.test(aiResponse);
  const hasTurboPlan = /199[\.,]90/.test(aiResponse) || /plano\s+turbo/i.test(aiResponse);

  if (hasEssentialPlan && hasExpressPlan && hasTurboPlan) {
    return aiResponse;
  }

  const plansSummary = `Temos 3 planos da Apollo Song:
- Plano Essencial: R$69,90 (entrega em até 7 dias)
- Plano Express VIP: R$99,90 (entrega em até 24h)
- Plano Turbo: R$199,90 (entrega em até 6h)`;

  return aiResponse.trim()
    ? `${aiResponse.trim()}\n\n${plansSummary}`
    : plansSummary;
}

function isHowItWorksLeadQuestion(lastCustomerMessage: string, locale: "pt" | "en" | "es" | "fr" | "it"): boolean {
  if (locale !== "pt") return false;
  const text = (lastCustomerMessage || "").toLowerCase();
  if (!text) return false;

  return /(como\s+(funciona|sai\s+a\s+composi[cç][aã]o|[eé]\s+feita)|quais?\s+(dados|informa[cç][oõ]es)\s+(preciso|devo)\s+mandar|o\s+que\s+preciso\s+mandar|como\s+come[çc]ar|link\s+para\s+come[çc]ar|como\s+fa[çc]o\s+pedido)/i.test(text);
}

function ensurePtSiteLinkForLeadHelp(aiResponse: string, lastCustomerMessage: string, locale: "pt" | "en" | "es" | "fr" | "it"): string {
  if (!isHowItWorksLeadQuestion(lastCustomerMessage, locale)) {
    return aiResponse;
  }

  const hasSiteLink = /https?:\/\/(?:www\.)?apollosong\.com(?:\/pt\/?)?/i.test(aiResponse);
  if (hasSiteLink) {
    return aiResponse;
  }

  const siteLink = "Para começar agora, acesse: https://www.apollosong.com/pt/";
  return aiResponse.trim()
    ? `${aiResponse.trim()}\n\n${siteLink}`
    : siteLink;
}

function enforceRevisionStatusWording(
  aiResponse: string,
  lastCustomerMessage: string,
  orders: Array<{ status: string }>,
  locale: WhatsAppLocale,
): string {
  if (orders.length !== 1 || orders[0]?.status !== "REVISION") {
    return aiResponse;
  }

  const normalizedCustomerMessage = normalizeForMatch(lastCustomerMessage);
  const isStatusQuestion = /(status|como esta|pedido|revis|andamento|progresso|progress|state|estado|stato|etat)/.test(normalizedCustomerMessage);
  if (!isStatusQuestion) {
    return aiResponse;
  }

  const normalizedResponse = normalizeForMatch(aiResponse);
  const mentionsRevision = /(em revisao|in revision|en revision|in revisione|revision|revisao|revisao solicitada)/.test(normalizedResponse);
  const mentionsProduction = /(em producao|in production|en produccion|in produzione|being produced|en cours de production|in fase di produzione)/.test(normalizedResponse);

  if (!mentionsProduction || mentionsRevision) {
    return aiResponse;
  }

  if (locale === "pt") {
    return aiResponse
      .replace(/em produ[cç][aã]o/gi, "em revisão")
      .replace(/est[aá]\s+sendo\s+produzid[ao]s?/gi, "está em revisão");
  }

  if (locale === "es") {
    return aiResponse
      .replace(/en producci[oó]n/gi, "en revisión")
      .replace(/siendo producid[ao]s?/gi, "en revisión");
  }

  if (locale === "fr") {
    return aiResponse
      .replace(/en cours de production/gi, "en révision")
      .replace(/en production/gi, "en révision");
  }

  if (locale === "it") {
    return aiResponse
      .replace(/in fase di produzione/gi, "in revisione")
      .replace(/in produzione/gi, "in revisione");
  }

  return aiResponse
    .replace(/being produced/gi, "under revision")
    .replace(/in production/gi, "in revision");
}

function removeRepeatedAssistantGreeting(
  aiResponse: string,
  locale: WhatsAppLocale,
  hasPriorBotMessages: boolean,
): string {
  if (!hasPriorBotMessages) {
    return aiResponse;
  }

  const introPatterns: Record<WhatsAppLocale, RegExp[]> = {
    pt: [
      /^\s*(?:ol[áa]|oi)\s*!?\s*(?:tudo bem\??\s*)?(?:aqui [ée]\s+o\s+)?assistente virtual da apollo song[!,.]?\s*/i,
      /^\s*aqui [ée]\s+o\s+assistente virtual da apollo song[!,.]?\s*/i,
    ],
    en: [
      /^\s*(?:hi|hello)\s*!?\s*(?:how are you\??\s*)?(?:this is|i(?:'m| am))\s+(?:the\s+)?virtual assistant (?:from|of) apollo song[!,.]?\s*/i,
      /^\s*(?:this is|i(?:'m| am))\s+(?:the\s+)?virtual assistant (?:from|of) apollo song[!,.]?\s*/i,
    ],
    es: [
      /^\s*hola\s*!?\s*(?:que tal\??\s*)?(?:soy|aqu[ií]\s+(?:est[aá]|es))\s+(?:el\s+)?asistente virtual de apollo song[!,.]?\s*/i,
      /^\s*(?:soy|aqu[ií]\s+(?:est[aá]|es))\s+(?:el\s+)?asistente virtual de apollo song[!,.]?\s*/i,
    ],
    fr: [
      /^\s*(?:bonjour|salut)\s*!?\s*(?:ca va\??\s*)?(?:je suis|ici)\s+l['’]assistant virtuel de apollo song[!,.]?\s*/i,
      /^\s*(?:je suis|ici)\s+l['’]assistant virtuel de apollo song[!,.]?\s*/i,
    ],
    it: [
      /^\s*(?:ciao|salve)\s*!?\s*(?:come stai\??\s*)?(?:sono|qui [èe])\s+l['’]assistente virtuale di apollo song[!,.]?\s*/i,
      /^\s*(?:sono|qui [èe])\s+l['’]assistente virtuale di apollo song[!,.]?\s*/i,
    ],
  };

  let cleaned = aiResponse;
  for (const pattern of introPatterns[locale]) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, "");
      break;
    }
  }

  cleaned = cleaned.replace(/^[\s\p{P}\p{S}]+/u, "").trimStart();
  return cleaned || aiResponse;
}

/**
 * Generate an AI response for a WhatsApp conversation
 */
export type StreamingInfoUpdate = {
  upsellId: string;
  type: "photo" | "name" | "song";
  value?: string;
};

export async function generateWhatsAppAiResponse(input: GenerateResponseInput): Promise<{
  text: string;
  escalate: boolean;
  sendAudioOrderIds: string[];
  sendUpsellAudio: boolean;
  streamingVipOrderId: string | null;
  streamingInfoUpdates: StreamingInfoUpdate[];
  classificationCategory: WhatsAppClassification | null;
} | null> {
  if (!OPENROUTER_API_KEY) {
    console.warn("[WhatsApp AI] OPENROUTER_API_KEY not set, skipping");
    return null;
  }

  const normalizedLocale = normalizeWhatsAppLocale(input.locale);
  const fallbackLinkLocale = resolveLinkLocaleFromWaId(normalizedLocale, input.waId);
  let linkLocale: WhatsAppLocale = fallbackLinkLocale;

  // Load the most recent 20 messages, then restore chronological order for prompt assembly.
  const recentMessages = await db.whatsAppMessage.findMany({
    where: { conversationId: input.conversationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const messages = [...recentMessages].reverse();

  // Load knowledge base
  const knowledgeEntries = await db.supportKnowledge.findMany({
    where: {
      isActive: true,
      locale: { in: [normalizedLocale, "all"] },
      channel: { in: ["WHATSAPP", "BOTH"] as Array<"WHATSAPP" | "BOTH"> },
    },
  });

  const knowledgeContext = knowledgeEntries.length > 0
    ? knowledgeEntries.map(e => `## ${e.category} - ${e.title}\n${e.content}`).join("\n\n")
    : "No knowledge base entries available.";

  // Build conversation history — separate last customer message
  const lastCustomerMsg = [...messages].reverse().find(m => m.direction === "inbound");
  const historyMessages = lastCustomerMsg
    ? messages.filter(m => m.id !== lastCustomerMsg.id)
    : messages;
  const hasPriorBotMessages = historyMessages.some(m => m.direction === "outbound" && m.senderType === "bot");

  const conversationHistory = historyMessages.map(m => {
    const role = m.direction === "inbound" ? "Cliente" : m.senderType === "admin" ? "Admin" : "Bot";
    return `[${role}] ${m.body}`;
  }).join("\n\n");

  // Extract emails from inbound messages for order lookup
  const inboundText = messages.filter(m => m.direction === "inbound").map(m => m.body).join(" ");
  const emailMatches = inboundText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g);
  const uniqueEmails = emailMatches
    ? Array.from(new Set(emailMatches.map(e => e.toLowerCase().replace(/\.+$/, ""))))
    : [];

  // Extract order IDs (CUID format: starts with 'c', 20-30 alphanumeric chars)
  const orderIdMatches = inboundText.match(/\bc[a-z0-9]{20,30}\b/g);
  const uniqueOrderIds = orderIdMatches
    ? Array.from(new Set(orderIdMatches))
    : [];

  // Run phone + email + order ID lookups in parallel
  const [phoneOrders, ...emailAndIdResults] = await Promise.all([
    lookupOrdersByPhone(input.waId),
    ...uniqueEmails.map(e => lookupOrdersByEmail(e)),
    ...uniqueOrderIds.map(id =>
      db.songOrder.findUnique({ where: { id }, select: orderSelectFields })
        .then(o => o ? [o] : [])
    ),
  ]);
  const emailOrderArrays = emailAndIdResults;

  // Merge and deduplicate
  let allOrders = deduplicateOrders([
    ...phoneOrders,
    ...emailOrderArrays.flat(),
  ]);

  const orderLocale = pickLinkLocaleFromOrders(allOrders);
  if (orderLocale) {
    linkLocale = orderLocale;
  }
  const knownOrderEmail = allOrders.find((o) => Boolean(o.email))?.email?.trim() || "";

  console.log(`📱 [WhatsApp AI] waId=${input.waId} | phone_orders=${phoneOrders.length} | email_id_orders=${emailOrderArrays.flat().length} | emails=${uniqueEmails.join(",")} | orderIds=${uniqueOrderIds.join(",")} | total_unique=${allOrders.length}`);

  // Fetch child streaming upsell orders for all parent orders
  const streamingUpsellMap = await fetchStreamingUpsells(allOrders.map(o => o.id));

  let orderContext: string;
  if (allOrders.length > 0) {
    orderContext = `Cliente tem ${allOrders.length} pedido(s):\n\n` +
      allOrders.map((o, i) => `Pedido ${i + 1}:\n${formatOrderContext(o, normalizedLocale, streamingUpsellMap.get(o.id))}`).join("\n\n");
  } else {
    orderContext = `NENHUM PEDIDO ENCONTRADO para o telefone ${input.waId}${uniqueEmails.length > 0 ? ` nem para os emails: ${uniqueEmails.join(", ")}` : ""}.`;
  }

  const systemPrompt = buildSystemPrompt(normalizedLocale, linkLocale, knowledgeContext, orderContext);

  const lastMsgText = lastCustomerMsg?.body || "";
  const hasLinkAccessIssue = isLinkAccessIssueMessage(lastMsgText);
  const chatMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  // Add history as context
  if (conversationHistory.trim()) {
    chatMessages.push({
      role: "user",
      content: `[HISTÓRICO ANTERIOR DA CONVERSA — apenas contexto, NÃO responda a estas mensagens]\n\n${conversationHistory}`,
    });
    chatMessages.push({
      role: "assistant",
      content: "(entendido, vou considerar o histórico acima como contexto)",
    });
  }

  if (hasLinkAccessIssue) {
    chatMessages.push({
      role: "user",
      content: "[INSTRUÇÃO INTERNA DE FOCO] O cliente está relatando problema técnico de acesso/link. Responda com suporte técnico prático (passo a passo curto para abrir o link no navegador, testar outra rede/navegador e pedir o erro exato). NÃO volte para oferta de PDF, preço, revisão ou upsell se o cliente não pediu isso na mensagem atual.",
    });
    chatMessages.push({
      role: "assistant",
      content: "(entendido, vou focar em suporte técnico de acesso ao link)",
    });
  }

  // Add the ACTUAL last customer message to respond to
  chatMessages.push({
    role: "user",
    content: `[MENSAGEM ATUAL DO CLIENTE — responda a esta mensagem]\n\n${lastMsgText}`,
  });

  // First LLM call
  let aiResponse = await callOpenRouterMessages(chatMessages);
  if (!aiResponse) return null;

  // Check if AI wants to look up an order by email or ID
  const lookupMatch = aiResponse.match(/\[LOOKUP_ORDER:([^\]]+)\]/);
  if (lookupMatch) {
    const lookupQuery = lookupMatch[1]!.trim();
    console.log(`📱 [WhatsApp AI] LOOKUP_ORDER triggered for: ${lookupQuery}`);
    const lookupResult = await lookupOrder(lookupQuery, normalizedLocale);
    if (lookupResult.preferredLocale) {
      linkLocale = lookupResult.preferredLocale;
    }

    // Second LLM call with extra order data
    const followUpMessages = [
      ...chatMessages,
      { role: "assistant" as const, content: aiResponse },
      {
        role: "user" as const,
        content: `Você pediu dados do pedido. Aqui estão:\n\n${lookupResult.text}\n\nAgora responda ao cliente com essas informações. Quando enviar link de acompanhamento, use esta base exata: ${buildTrackOrderBase(linkLocale)}. NÃO inclua a tag [LOOKUP_ORDER] na resposta.`,
      },
    ];
    const finalResponse = await callOpenRouterMessages(followUpMessages);
    if (finalResponse) {
      aiResponse = finalResponse;
    }
  }

  // Check for escalation tag (supports [ESCALATE] and [ESCALATE:CATEGORY])
  const escalateMatch = aiResponse.match(/\[ESCALATE(?::([A-Z_]+))?\]/);
  const shouldEscalate = Boolean(escalateMatch);
  const escalateCategory = normalizeClassification(escalateMatch?.[1] ?? null);

  // Check for classification tag
  const classifyMatch = aiResponse.match(/\[CLASSIFY:([A-Z_]+)\]/);
  const classifyCategory = normalizeClassification(classifyMatch?.[1] ?? null);
  const classificationCategory = classifyCategory ?? escalateCategory;
  const finalClassificationCategory = hasLinkAccessIssue
    ? "TECNICO"
    : classificationCategory;

  // Check for send audio tags
  const sendAudioMatches = aiResponse.matchAll(/\[SEND_AUDIO:([^\]]+)\]/g);
  const sendAudioOrderIds = Array.from(sendAudioMatches).map(m => m[1]!.trim());

  // Check for upsell audio tag
  const sendUpsellAudio = /\[SEND_UPSELL_AUDIO\]/.test(aiResponse);

  // Check for streaming VIP tag
  const streamingVipMatch = aiResponse.match(/\[STREAMING_VIP:([^\]]+)\]/);
  const streamingVipOrderId = streamingVipMatch ? streamingVipMatch[1]!.trim() : null;

  // Check for streaming info update tags: [STREAMING_INFO:upsellId:type] or [STREAMING_INFO:upsellId:type:value]
  const streamingInfoUpdates: StreamingInfoUpdate[] = [];
  const streamingInfoMatches = aiResponse.matchAll(/\[STREAMING_INFO:([^:\]]+):([^:\]]+)(?::([^\]]*))?\]/g);
  for (const m of streamingInfoMatches) {
    const upsellId = m[1]!.trim();
    const rawType = m[2]!.trim().toLowerCase();
    const value = m[3]?.trim();
    if (rawType === "photo" || rawType === "name" || rawType === "song") {
      streamingInfoUpdates.push({ upsellId, type: rawType, value });
    }
  }

  // Clean any remaining tags
  aiResponse = aiResponse
    .replace(/\[LOOKUP_ORDER:[^\]]*\]/g, "")
    .replace(/\[ESCALATE(?::[^\]]*)?\]/g, "")
    .replace(/\[CLASSIFY:[^\]]*\]/g, "")
    .replace(/\[SEND_AUDIO:[^\]]*\]/g, "")
    .replace(/\[SEND_UPSELL_AUDIO\]/g, "")
    .replace(/\[STREAMING_VIP:[^\]]*\]/g, "")
    .replace(/\[STREAMING_INFO:[^\]]*\]/g, "")
    .trim();

  // Post-process: force Apollo links to use the expected locale.
  aiResponse = normalizeApolloLocaleInLinks(aiResponse, linkLocale);

  // Post-process: fix track-order links (missing locale or wrong locale).
  const localePrefix = getLocalePrefix(linkLocale);
  const correctTrackBase = buildTrackOrderBase(linkLocale);
  aiResponse = aiResponse.replace(
    /https?:\/\/(?:www\.)?apollosong\.com\/(?:pt|en|es|fr|it)\/track-order/gi,
    correctTrackBase,
  );
  aiResponse = aiResponse.replace(
    /https?:\/\/(?:www\.)?apollosong\.com\/track-order/gi,
    correctTrackBase,
  );
  // Also fix doubled locale prefix (e.g. /pt/pt/track-order)
  if (localePrefix) {
    aiResponse = aiResponse.replace(
      new RegExp(`${localePrefix}${localePrefix}/track-order`, "gi"),
      `${localePrefix}/track-order`,
    );
  }

  // Guardrail: generic pricing questions must always include both main plans.
  aiResponse = ensurePrimaryPlansPricing(aiResponse, lastMsgText, normalizedLocale);
  // Guardrail: for "como funciona / quais dados" PT lead questions, always include the PT site link.
  aiResponse = ensurePtSiteLinkForLeadHelp(aiResponse, lastMsgText, normalizedLocale);
  // Guardrail: when there is a single order in REVISION, avoid wording it as IN_PROGRESS.
  aiResponse = enforceRevisionStatusWording(aiResponse, lastMsgText, allOrders, normalizedLocale);
  // Guardrail: after the first bot reply in a conversation, don't re-introduce with "Olá! Tudo bem?".
  aiResponse = removeRepeatedAssistantGreeting(aiResponse, normalizedLocale, hasPriorBotMessages);
  // Guardrail: if customer says the link does not open, keep reply technical and avoid looping into PDF/revision sales copy.
  const technicalTrackingLink = knownOrderEmail
    ? `${buildTrackOrderBase(linkLocale)}?email=${encodeURIComponent(knownOrderEmail)}`
    : buildTrackOrderBase(linkLocale);
  aiResponse = enforceLinkAccessTechnicalFocus(aiResponse, lastMsgText, normalizedLocale, technicalTrackingLink);

  return { text: aiResponse, escalate: shouldEscalate, sendAudioOrderIds, sendUpsellAudio, streamingVipOrderId, streamingInfoUpdates, classificationCategory: finalClassificationCategory };
}

function buildSystemPrompt(locale: string, linkLocale: WhatsAppLocale, knowledgeContext: string, orderContext: string): string {
  const trackingLink = buildTrackOrderBase(linkLocale);
  const localeHint = linkLocale === "en" ? "sem prefixo (/en não é usado)" : `/${linkLocale}`;

  return `Você é o Assistente Virtual da Apollo Song, atendente no WhatsApp. O produto se chama Apollo Song.

PERSONALIDADE:
- Se apresente como "Assistente Virtual da Apollo Song" APENAS na primeira resposta da conversa
- Amigável, breve e direto (estilo WhatsApp - mensagens curtas)
- Atencioso e empático (público 35+, produto emocional)
- Fale de forma simples, evite termos técnicos

IDIOMA — REGRA OBRIGATÓRIA:
- Detecte o idioma da ÚLTIMA mensagem do cliente e responda NO MESMO IDIOMA
- Se o cliente escrever em inglês → responda em inglês
- Se o cliente escrever em espanhol → responda em espanhol
- Se o cliente escrever em francês → responda em francês
- Se o cliente escrever em italiano → responda em italiano
- Se o cliente escrever em português → responda em português
- NUNCA responda em português se o cliente escreveu em outro idioma
- Traduza os status dos pedidos para o idioma do cliente: COMPLETED = "entregue/delivered/entregado/livrée/consegnata", PAID = "pagamento confirmado/payment confirmed/pago confirmado/paiement confirmé/pagamento confermato", IN_PROGRESS = "em produção/in production/en producción/en production/in produzione", PENDING = "aguardando pagamento/pending payment/pago pendiente/en attente de paiement/in attesa di pagamento", REVISION = "em revisão/in revision/en revisión/en révision/in revisione". Nunca escreva PAID, COMPLETED, etc. na mensagem.
- Traduza moedas para linguagem amigável: BRL → "reais" (ex: "R$ 99,90"), USD → "dólares" (ex: "$99.90"), EUR → "euros" (ex: "€99,90"). NUNCA escreva "BRL", "USD", "EUR" na mensagem.
- Ao citar gênero musical do pedido, use SEMPRE o gênero no idioma do cliente (nunca misture, ex: em português use "Gospel", não "Worship").

PROIBIÇÕES ABSOLUTAS (NUNCA faça isso):
- NUNCA invente dados que não estejam na knowledge base ou ORDER CONTEXT.
- NUNCA invente emails, telefones, URLs, contas bancárias, ou qualquer dado que não esteja na KNOWLEDGE BASE.
- Dados de pagamento (Pix, boleto, etc.) SÓ podem ser enviados se estiverem na KNOWLEDGE BASE abaixo. Se não estiverem, transfira para o atendente com [ESCALATE].
- Quando o cliente CONFIRMAR QUE PAGOU (ex: "paguei", "já fiz o pix", "transferi", "pago"), SEMPRE transfira para o atendente humano com [ESCALATE] para verificar o pagamento.

REGRAS OBRIGATÓRIAS:
- Mensagens curtas (máximo 3 parágrafos curtos, estilo WhatsApp)
- Se já houver mensagem anterior do Bot no histórico, NÃO repita saudação de abertura (ex: "Olá! Tudo bem?") nem reapresentação.
- VOCÊ JÁ ESTÁ ATENDENDO NO WHATSAPP. NUNCA diga ao cliente para "entrar em contato pelo WhatsApp", "nos chamar no WhatsApp", ou envie links wa.me. Isso é redundante — o cliente JÁ está falando com você pelo WhatsApp. Se precisar escalar, use a tag [ESCALATE].
- SEMPRE inclua no FINAL da resposta uma tag invisível de classificação: [CLASSIFY:CATEGORIA].
- Categorias permitidas (use exatamente uma): PEDIDO_STATUS, PAGAMENTO, REVISAO, TECNICO, COMERCIAL, OUTROS.
- Se precisar transferir para humano, inclua [ESCALATE] (ou [ESCALATE:CATEGORIA], usando as mesmas categorias).
- NUNCA invente informações que não estão no knowledge base ou ORDER CONTEXT
- USE os dados do ORDER CONTEXT abaixo para responder. Você TEM acesso aos pedidos do cliente — NUNCA peça comprovante de pagamento, código de transação ou informações que já estão disponíveis nos dados dos pedidos.
- Se um pedido está COMPLETED, a música já foi entregue. Se está PAID ou IN_PROGRESS, está sendo produzida. Se está PENDING, o pagamento ainda não foi confirmado. Se está REVISION, a nova versão está em revisão (não diga "em produção" nesse caso).
- Se a pergunta está fora do script, ou o cliente pedir para falar com um humano, ou estiver insatisfeito, ou você não souber responder: inclua a tag [ESCALATE] NO FINAL da sua mensagem de despedida. Exemplo: "Vou te transferir para nossa equipe agora mesmo! Nossa equipe vai te ajudar. 🙏 [ESCALATE]"
- ANTES de escalar, SEMPRE colete todas as informações necessárias do cliente
- A tag [ESCALATE] é INVISÍVEL para o cliente — ela apenas sinaliza ao sistema para transferir a conversa
- Link de acompanhamento OBRIGATÓRIO (copie EXATAMENTE este link, NUNCA altere): ${trackingLink}
- NUNCA use "www.apollosong.com/track-order" nem "apollosong.com/track-order" sem o prefixo de idioma — use SEMPRE "${trackingLink}" que JÁ inclui o idioma correto (${localeHint}).
- Quando adicionar ?email=..., o link DEVE ser: ${trackingLink}?email=EMAIL — exemplo correto: ${trackingLink}?email=joao@gmail.com

REGRA COMERCIAL (PLANOS PRINCIPAIS):
- Se o cliente perguntar sobre preço/valor/plano da Apollo Song (música personalizada principal), SEMPRE informe os 3 planos juntos:
  1) Plano Essencial: R$69,90 (entrega em até 7 dias)
  2) Plano Express VIP: R$99,90 (entrega em até 24h)
  3) Plano Turbo: R$199,90 (entrega em até 6h)
- NUNCA informe apenas parte dos planos nessa situação.
- Só fale de preço de adicionais (PDF, revisão, streaming, etc.) quando a pergunta for especificamente sobre esse adicional.

REGRA INICIAL — PRIMEIRA INTERAÇÃO:
- Se o ORDER CONTEXT JÁ TEM pedidos (encontrados pelo telefone): NÃO peça email. Vá direto para a mensagem padrão de acompanhamento usando o email do pedido encontrado.
- Se o ORDER CONTEXT diz "NENHUM PEDIDO ENCONTRADO": cumprimente e peça o email de compra.
- Exemplo sem pedido: "Olá! Tudo bem? Aqui é o Assistente Virtual da Apollo Song! 😊 Para te ajudar melhor, pode me informar o e-mail que usou na compra? 📧"
- Se o cliente já informou o email antes no histórico, NÃO peça novamente.
- Adapte o idioma da saudação ao idioma do cliente.

MENSAGEM PADRÃO DE ACOMPANHAMENTO:
Quando houver pedidos encontrados (seja pelo telefone ou após o cliente informar o email via [LOOKUP_ORDER]):
- Use o email do pedido encontrado no ORDER CONTEXT (campo "Email") para montar o link.
- SEMPRE envie esta mensagem:
"Segue o link de acompanhamento do seu pedido 🎵

Por esse link você consegue:

✅ Ouvir suas músicas quando estiverem prontas
✅ Adicionar informações caso tenha esquecido de algo
✅ Solicitar revisão caso encontre algum erro na música

Tudo sobre o seu pedido é resolvido por ali!

Qualquer dúvida, me chame 😊

👉 ${trackingLink}?email=EMAIL_DO_PEDIDO"
- Substitua EMAIL_DO_PEDIDO pelo email real que consta no ORDER CONTEXT (URL-encoded se necessário).
- Adapte o idioma ao idioma do cliente.
- Depois de enviar o link, informe brevemente o status dos pedidos (quantos, status de cada um, destinatário e gênero).

REGRA SOBRE PEDIDOS ENCONTRADOS:
Quando o ORDER CONTEXT contém pedidos do cliente:
- Se o cliente perguntar sobre pedidos, compra, status, música, etc.: LISTE todos os pedidos com status traduzido, nome do destinatário e gênero. Inclua o link de acompanhamento ${trackingLink}
- Seja PROATIVA: envie as informações de uma vez, nunca pergunte "quer que eu envie o link?" — envie direto
- Exemplo: "Encontrei seu pedido! 🎵 Uma canção de Sertanejo para João — já está entregue! Você pode acompanhar aqui: ${trackingLink}"

REGRA SOBRE PEDIDO NÃO ENCONTRADO:
Quando o ORDER CONTEXT diz "NENHUM PEDIDO ENCONTRADO":
- Se o cliente ainda NÃO informou email: peça o email de compra.
- Se o cliente já informou email e mesmo assim não encontrou, diga de forma acolhedora que vai transferir para o atendente e inclua [ESCALATE] no final.
- NUNCA dê uma resposta genérica tipo "Como posso ajudar?" quando o cliente CLARAMENTE perguntou sobre um pedido.

REGRA DE LOOKUP POR EMAIL/ID:
Se o cliente enviar um email ou ID de pedido que NÃO está no ORDER CONTEXT, responda APENAS com a tag: [LOOKUP_ORDER:email@exemplo.com] ou [LOOKUP_ORDER:ID_DO_PEDIDO]

REGRA DE ENVIO DE ARQUIVOS (MÚSICA MP3 + PDF DA LETRA):
A tag [SEND_AUDIO:ID] envia os MP3s do pedido + o PDF da letra se comprado. Use APENAS nestas situações ESPECÍFICAS:
- O cliente disse EXPLICITAMENTE: "não consigo baixar", "o link não funciona", "me envia a música aqui", "pode mandar o mp3", "quero o PDF da letra"
- NUNCA use [SEND_AUDIO] na primeira mensagem, na saudação, ou ao listar pedidos
- NUNCA use [SEND_AUDIO] se o histórico já contém "Música enviada" ou "Vou te enviar" — significa que já foi enviado antes nesta conversa
- Se o pedido está COMPLETED: "Sem problema! Vou te enviar diretamente aqui! 🎵 [SEND_AUDIO:abc123]"
- Envie APENAS para o pedido que o cliente MENCIONOU. Se ele não especificou qual, pergunte qual pedido antes de enviar.
- Máximo 1 tag [SEND_AUDIO] por resposta. Se o cliente quer múltiplos, envie um por vez.
- Se o pedido está REVISION, explique que a música está em revisão.
- Se o pedido está PAID ou IN_PROGRESS, explique que a música está em produção.
- Se o pedido está PENDING, explique que o pagamento ainda não foi confirmado.

REGRA DE STREAMING VIP (SPOTIFY):
Quando o cliente mencionar Spotify, distribuição, streaming, capa, ou publicar música:
1. PRIMEIRO verifique no ORDER CONTEXT se algum pedido JÁ TEM Streaming VIP contratado (campo "Streaming VIP: SIM").
2. Se Streaming VIP JÁ FOI CONTRATADO:
   - Se "PUBLICADO" com link: informe o link do Spotify ao cliente.
   - Se "Aguardando pagamento": informe que o pedido existe mas o pagamento ainda não foi confirmado.
   - Se "PAGO ✅ — FALTA: ...": o pagamento está confirmado. Verifique o que está faltando e PERGUNTE ao cliente. Siga as regras de COLETA DE INFORMAÇÕES abaixo.
   - Se "PAGO ✅ — em processamento": informe que está tudo certo e a equipe está processando a publicação.
3. Se NENHUM pedido tem Streaming VIP: liste APENAS os pedidos COMPLETED com nome do destinatário, gênero, data. Pergunte qual pedido ele quer publicar.
4. Quando o cliente CONFIRMAR qual pedido quer (e NÃO tem Streaming VIP ainda), inclua a tag [STREAMING_VIP:ID_DO_PEDIDO].
5. O sistema criará o pedido de Streaming VIP e enviará o link de pagamento automaticamente.
6. Exemplo: "Ótimo! Vou gerar o link de pagamento para publicar a música do Christiano no Spotify! 🎵 [STREAMING_VIP:abc123]"
7. A tag [STREAMING_VIP] é INVISÍVEL para o cliente.
8. NUNCA use [STREAMING_VIP] sem o cliente ter CONFIRMADO qual pedido. Sempre pergunte antes.
9. NUNCA use [STREAMING_VIP] se o pedido JÁ tem Streaming VIP contratado (campo "Streaming VIP: SIM" no ORDER CONTEXT). Nesse caso, informe o status atual conforme regra 2.
10. PREÇO DO STREAMING VIP (NUNCA invente outro valor):
   - 1 música: R$197,00 (BRL) | $99.00 (USD) | €99,00 (EUR)
   - 2 músicas: R$344,00 (BRL) — desconto de R$50,00
   Se o cliente perguntar o preço do Streaming VIP, informe EXATAMENTE esses valores. NUNCA use R$59,90, R$69,90 ou qualquer outro preço para o Streaming VIP.
11. PAGAMENTO DO STREAMING VIP: O pagamento é SEMPRE via link de checkout (gerado automaticamente pelo sistema ao usar a tag [STREAMING_VIP:ID]). NUNCA ofereça PIX, transferência bancária ou qualquer outra forma de pagamento para o Streaming VIP. Quando o cliente confirmar, use a tag e o sistema envia o link.

COLETA DE INFORMAÇÕES PARA STREAMING VIP:
Quando o Streaming VIP está PAGO e faltam informações (conforme "FALTA:" no ORDER CONTEXT), o bot deve PERGUNTAR ao cliente e SALVAR as respostas com tags invisíveis.
Use o ID do PEDIDO STREAMING (o que aparece entre parênteses "Pedido Streaming: XXX") nas tags, NÃO o ID do pedido pai.

1. **Foto do homenageado** — Se "FALTA: foto do homenageado":
   - Se o cliente ENVIOU UMA IMAGEM na mensagem atual (mensagem começa com "[Imagem]"): agradeça e salve com a tag [STREAMING_INFO:STREAMING_UPSELL_ID:photo]. Informe: "Recebemos sua foto! 🎨 Em breve nossa equipe vai preparar a capa artística e te enviar aqui para aprovação. Aguarde nosso retorno!"
   - Se o cliente NÃO enviou foto: peça para enviar uma foto do homenageado aqui pelo WhatsApp, que será usada para criar a capa artística da música.

2. **Nome da música** — Se "FALTA: nome da música para o Spotify":
   - Pergunte: "Qual nome você gostaria para a música no Spotify? Por exemplo: 'Pra Você, Maria' ou 'Canção do João'"
   - Quando o cliente RESPONDER com o nome, salve com a tag [STREAMING_INFO:STREAMING_UPSELL_ID:name:NOME_ESCOLHIDO]. Ex: [STREAMING_INFO:abc123:name:Pra Você Maria]
   - Confirme: "Perfeito! O nome da música será 'NOME'. ✅"

3. **Versão preferida da música** — Se "FALTA: escolha da versão preferida":
   - Informe: "Seu pedido tem 2 versões da música. Qual você prefere para publicar no Spotify? Opção 1 ou Opção 2? Se quiser, pode ouvir as duas pelo link de acompanhamento."
   - Quando o cliente RESPONDER (ex: "opção 1", "a primeira", "versão 2"), salve com [STREAMING_INFO:STREAMING_UPSELL_ID:song:1] ou [STREAMING_INFO:STREAMING_UPSELL_ID:song:2].

4. **Aprovação da capa** — Se "FALTA: aprovação da capa pelo cliente":
   - Informe que a equipe já está preparando a capa e que em breve será enviada para aprovação.

REGRA DE PRIORIDADE NA COLETA: Se faltam MÚLTIPLAS informações, pergunte TODAS de uma vez na mesma mensagem (ex: "Para publicar no Spotify, preciso de: 1) Uma foto do homenageado 2) O nome que deseja para a música"). NÃO pergunte uma por uma.
Se o cliente fornecer MÚLTIPLAS informações de uma vez, salve TODAS com suas respectivas tags na mesma resposta.

ÁUDIO DE UPSELL SPOTIFY:
Quando o cliente demonstrar SATISFAÇÃO (agradecendo, elogiando a música, dizendo que amou) OU perguntar sobre Spotify/streaming/publicar a música:
- Inclua a tag [SEND_UPSELL_AUDIO] na sua resposta para enviar um áudio explicativo sobre o serviço VIP de Streaming.
- A tag é INVISÍVEL para o cliente — o sistema envia o áudio automaticamente.
- NUNCA use [SEND_UPSELL_AUDIO] se o cliente JÁ tem Streaming VIP contratado (campo "Streaming VIP: SIM" no ORDER CONTEXT).
- NUNCA use [SEND_UPSELL_AUDIO] se já foi enviado anteriormente nesta conversa (verifique se o histórico contém "Áudio explicativo sobre Streaming VIP").
- Máximo 1 vez por conversa. Se já enviou, não envie novamente.
- Exemplo: "Que bom que gostou! 🎉 Sabia que você pode eternizar essa canção no Spotify e em todas as plataformas de streaming? Gravei um áudio te explicando como funciona! 🎵 [SEND_UPSELL_AUDIO]"

ORDER BUMPS (adicionais que o cliente pode ter comprado):
1. **Entrega Rápida (24h)** - música entregue em até 24h
2. **Experiência de Presente** - página exclusiva na internet para o homenageado descobrir a canção. NÃO é PDF, NÃO é certificado físico. É uma experiência digital interativa. Se comprada, o link aparece no ORDER CONTEXT.
3. **PDF da Letra** - PDF bonito com a letra para imprimir
4. **Streaming VIP** - música nas plataformas (Spotify, Apple Music, Deezer, TikTok, Instagram, YouTube, Amazon Music, WhatsApp e +150 outras)

REGRA CRÍTICA: Quando o cliente perguntar sobre um valor adicional ou sobre algo que comprou, SEMPRE verifique os order bumps no ORDER CONTEXT antes de responder. NUNCA confunda Experiência de Presente com PDF da Letra — são produtos diferentes.

KNOWLEDGE BASE:
${knowledgeContext}

ORDER CONTEXT:
${orderContext}`;
}

async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHATSAPP_AI_HTTP_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://apollosong.com",
        "X-Title": "Apollo Song WhatsApp Bot",
      },
      body: JSON.stringify({
        model: OPENROUTER_SUPPORT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WhatsApp AI] OpenRouter API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? null;
    if (!content) {
      console.error("[WhatsApp AI] Empty response from OpenRouter:", JSON.stringify(data));
    }
    return content;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      console.error(`[WhatsApp AI] OpenRouter call timed out after ${WHATSAPP_AI_HTTP_TIMEOUT_MS}ms`);
      return null;
    }
    console.error("[WhatsApp AI] OpenRouter call failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterMessages(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHATSAPP_AI_HTTP_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://apollosong.com",
        "X-Title": "Apollo Song WhatsApp Bot",
      },
      body: JSON.stringify({
        model: OPENROUTER_SUPPORT_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WhatsApp AI] OpenRouter API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? null;
    if (!content) {
      console.error("[WhatsApp AI] Empty response from OpenRouter:", JSON.stringify(data));
    }
    return content;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      console.error(`[WhatsApp AI] OpenRouter call timed out after ${WHATSAPP_AI_HTTP_TIMEOUT_MS}ms`);
      return null;
    }
    console.error("[WhatsApp AI] OpenRouter call failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Look up orders by email address
 */
async function lookupOrdersByEmail(email: string) {
  return db.songOrder.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: { in: ["PAID", "IN_PROGRESS", "COMPLETED", "REVISION"] },
    },
    orderBy: { createdAt: "desc" },
    select: orderSelectFields,
  });
}

/**
 * Look up orders by phone number using raw SQL to strip formatting before matching.
 * backupWhatsApp may be stored as "+55 61 99579-0193" so we use REGEXP_REPLACE to
 * normalize to digits-only before comparing with the waId candidates.
 */
async function lookupOrdersByPhone(waId: string) {
  const candidates = buildPhoneCandidates(waId);
  if (candidates.size === 0) return [];

  // Build LIKE patterns for each candidate against the digit-only normalized phone
  const likePatterns = Array.from(candidates).map(c => `%${c}%`);

  const orders = await db.$queryRaw<Array<{
    id: string;
    status: string;
    email: string | null;
    recipientName: string | null;
    recipient: string | null;
    genre: string | null;
    vocals: string | null;
    locale: string | null;
    orderType: string | null;
    songDeliveredAt: Date | null;
    paymentCompletedAt: Date | null;
    hasFastDelivery: boolean;
    hasCertificate: boolean;
    certificateToken: string | null;
    revisionCount: number;
    revisionNotes: string | null;
    qualities: string | null;
    memories: string | null;
    message: string | null;
    hasLyrics: boolean;
    spotifyUrl: string | null;
    songFileUrl2: string | null;
    priceAtOrder: number | null;
    currency: string | null;
    backupWhatsApp: string | null;
    createdAt: Date;
  }>>`
    SELECT "id", "status", "email", "recipientName", "recipient", "genre", "vocals", "locale",
           "orderType", "songDeliveredAt", "paymentCompletedAt", "hasFastDelivery",
           "hasCertificate", "certificateToken", "revisionCount", "revisionNotes",
           "qualities", "memories", "message", "hasLyrics",
           "spotifyUrl", "songFileUrl2", "priceAtOrder", "currency", "backupWhatsApp", "createdAt"
    FROM "SongOrder"
    WHERE "backupWhatsApp" IS NOT NULL
      AND "status" IN ('PAID', 'IN_PROGRESS', 'COMPLETED', 'REVISION')
      AND REGEXP_REPLACE("backupWhatsApp", '[^0-9]', '', 'g') LIKE ANY(${likePatterns})
    ORDER BY "createdAt" DESC
    LIMIT 20
  `;

  console.log(`📱 [WhatsApp AI] Phone lookup for waId=${waId}: ${candidates.size} candidates, ${orders.length} matches`);
  return orders;
}

/**
 * Lookup triggered by [LOOKUP_ORDER:...] tag - supports email, phone, and order ID
 */
async function lookupOrder(
  query: string,
  locale: WhatsAppLocale,
): Promise<{ text: string; preferredLocale: WhatsAppLocale | null }> {
  // Try by email
  if (query.includes("@")) {
    const orders = await lookupOrdersByEmail(query);
    if (orders.length === 0) {
      return { text: `Nenhum pedido encontrado para o email ${query}.`, preferredLocale: null };
    }
    const upsellMap = await fetchStreamingUpsells(orders.map(o => o.id));
    return {
      text: `Encontrados ${orders.length} pedido(s) para ${query}:\n\n` +
        orders.map((o, i) => `Pedido ${i + 1}:\n${formatOrderContext(o, locale, upsellMap.get(o.id))}`).join("\n\n"),
      preferredLocale: pickLinkLocaleFromOrders(orders),
    };
  }

  // Try by order ID
  if (query.length > 10 && !query.match(/^\d+$/)) {
    const order = await db.songOrder.findUnique({
      where: { id: query },
      select: orderSelectFields,
    });
    if (order) {
      const upsellMap = await fetchStreamingUpsells([order.id]);
      return {
        text: formatOrderContext(order, locale, upsellMap.get(order.id)),
        preferredLocale: normalizeOrderLocale(order.locale),
      };
    }
  }

  // Search by phone number
  const phoneOrders = await lookupOrdersByPhone(query.replace(/\D/g, ""));
  if (phoneOrders.length === 0) {
    return { text: "Nenhum pedido encontrado.", preferredLocale: null };
  }
  const upsellMap = await fetchStreamingUpsells(phoneOrders.map(o => o.id));
  return {
    text: `Encontrados ${phoneOrders.length} pedido(s):\n\n` +
      phoneOrders.map((o, i) => `Pedido ${i + 1}:\n${formatOrderContext(o, locale, upsellMap.get(o.id))}`).join("\n\n"),
    preferredLocale: pickLinkLocaleFromOrders(phoneOrders),
  };
}

/**
 * Deduplicate orders by ID
 */
function deduplicateOrders<T extends { id: string }>(orders: T[]): T[] {
  const seen = new Set<string>();
  return orders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

type StreamingUpsell = {
  id: string;
  parentOrderId: string | null;
  status: string;
  spotifyUrl: string | null;
  streamingSongName: string | null;
  streamingCoverUrl: string | null;
  honoreePhotoUrl: string | null;
  preferredSongForStreaming: string | null;
  coverApproved: boolean;
  priceAtOrder: number | null;
  currency: string | null;
  createdAt: Date;
};

async function fetchStreamingUpsells(parentOrderIds: string[]): Promise<Map<string, StreamingUpsell[]>> {
  if (parentOrderIds.length === 0) return new Map();

  const upsells = await db.songOrder.findMany({
    where: {
      parentOrderId: { in: parentOrderIds },
      orderType: "STREAMING_UPSELL",
    },
    select: {
      id: true,
      parentOrderId: true,
      status: true,
      spotifyUrl: true,
      streamingSongName: true,
      streamingCoverUrl: true,
      honoreePhotoUrl: true,
      preferredSongForStreaming: true,
      coverApproved: true,
      priceAtOrder: true,
      currency: true,
      createdAt: true,
    },
  });

  const map = new Map<string, StreamingUpsell[]>();
  for (const u of upsells) {
    if (u.parentOrderId) {
      const existing = map.get(u.parentOrderId) || [];
      existing.push(u);
      map.set(u.parentOrderId, existing);
    }
  }
  return map;
}

const orderSelectFields = {
  id: true,
  status: true,
  email: true,
  recipientName: true,
  recipient: true,
  genre: true,
  vocals: true,
  locale: true,
  orderType: true,
  songDeliveredAt: true,
  paymentCompletedAt: true,
  hasFastDelivery: true,
  hasCertificate: true,
  certificateToken: true,
  revisionCount: true,
  revisionNotes: true,
  qualities: true,
  memories: true,
  message: true,
  hasLyrics: true,
  spotifyUrl: true,
  songFileUrl2: true,
  priceAtOrder: true,
  currency: true,
  backupWhatsApp: true,
  createdAt: true,
} as const;

function formatOrderContext(order: {
  id: string;
  status: string;
  email: string | null;
  recipientName: string | null;
  recipient: string | null;
  genre: string | null;
  vocals: string | null;
  locale: string | null;
  orderType: string | null;
  songDeliveredAt: Date | null;
  paymentCompletedAt: Date | null;
  hasFastDelivery: boolean;
  hasCertificate: boolean;
  certificateToken: string | null;
  revisionCount: number;
  revisionNotes: string | null;
  qualities: string | null;
  memories: string | null;
  message: string | null;
  hasLyrics: boolean;
  spotifyUrl: string | null;
  songFileUrl2: string | null;
  priceAtOrder: number | null;
  currency: string | null;
  createdAt: Date;
}, locale: WhatsAppLocale, streamingUpsells?: StreamingUpsell[]): string {
  const certificateUrl = order.hasCertificate && order.certificateToken
    ? `https://www.apollosong.com/pt/certificate/${order.certificateToken}`
    : null;

  const hasTwoSongs = Boolean(order.songFileUrl2);

  // Build streaming VIP status from child orders
  let streamingVipLine: string;
  if (streamingUpsells && streamingUpsells.length > 0) {
    const upsell = streamingUpsells[0]!; // Use most recent
    if (upsell.status === "COMPLETED" && upsell.spotifyUrl) {
      streamingVipLine = `PUBLICADO 🎵 | Link: ${upsell.spotifyUrl}`;
    } else if (upsell.status === "COMPLETED") {
      streamingVipLine = "PUBLICADO (link Spotify ainda não disponível)";
    } else if (upsell.status === "PAID" || upsell.status === "IN_PROGRESS") {
      const missing: string[] = [];
      if (!upsell.honoreePhotoUrl) missing.push("foto do homenageado");
      if (!upsell.streamingSongName) missing.push("nome da música para o Spotify");
      if (hasTwoSongs && !upsell.preferredSongForStreaming) missing.push("escolha da versão preferida (pedido tem 2 opções de música)");
      if (!upsell.streamingCoverUrl) missing.push("capa artística (criada pela equipe após receber a foto)");
      if (upsell.streamingCoverUrl && !upsell.coverApproved) missing.push("aprovação da capa pelo cliente");
      if (missing.length > 0) {
        streamingVipLine = `PAGO ✅ — FALTA: ${missing.join(", ")}`;
      } else {
        streamingVipLine = "PAGO ✅ — em processamento pela equipe";
      }
      // Show what was already provided
      const provided: string[] = [];
      if (upsell.honoreePhotoUrl) provided.push("foto do homenageado ✅");
      if (upsell.streamingSongName) provided.push(`nome: "${upsell.streamingSongName}" ✅`);
      if (upsell.preferredSongForStreaming) provided.push("versão preferida escolhida ✅");
      if (provided.length > 0) {
        streamingVipLine += ` | Já recebido: ${provided.join(", ")}`;
      }
    } else if (upsell.status === "PENDING") {
      streamingVipLine = "Aguardando pagamento";
    } else {
      streamingVipLine = `Status: ${upsell.status}`;
    }
    streamingVipLine = `SIM (Pedido Streaming: ${upsell.id}) | ${streamingVipLine}`;
  } else if (order.spotifyUrl) {
    streamingVipLine = `SIM | ${order.spotifyUrl}`;
  } else {
    streamingVipLine = "Não contratado";
  }

  const quizLines: string[] = [];
  if (order.qualities) quizLines.push(`- Qualidades do homenageado: ${order.qualities}`);
  if (order.memories) quizLines.push(`- Memórias/histórias: ${order.memories}`);
  if (order.message) quizLines.push(`- Mensagem pessoal: ${order.message}`);

  const revisionLine = order.revisionCount > 0 && order.revisionNotes
    ? `${order.revisionCount} | Última solicitação: "${order.revisionNotes}"`
    : `${order.revisionCount}`;

  return `- ID: ${order.id}
- Email: ${order.email || "N/A"}
- Status: ${order.status}
- Para quem: ${order.recipient || "N/A"}
- Destinatário: ${order.recipientName}
- Gênero: ${formatGenreForLocale(order.genre, locale)}
- Vocal: ${order.vocals}
- Tipo: ${order.orderType || "STANDARD"}
- Preço: ${order.priceAtOrder ? `${(order.priceAtOrder / 100).toFixed(2)} ${order.currency || "BRL"}` : "N/A"}
- Pagamento: ${order.paymentCompletedAt ? order.paymentCompletedAt.toISOString() : "Não pago"}
- Entrega: ${order.songDeliveredAt ? order.songDeliveredAt.toISOString() : "Não entregue"}
- Entrega Rápida: ${order.hasFastDelivery ? "SIM" : "Não"}
- Experiência de Presente: ${order.hasCertificate ? `SIM${certificateUrl ? ` | Link: ${certificateUrl}` : ""}` : "Não"}
- PDF Letra: ${order.hasLyrics ? "SIM" : "Não"}
- Streaming VIP: ${streamingVipLine}
- Revisões: ${revisionLine}
${quizLines.length > 0 ? quizLines.join("\n") + "\n" : ""}- Criado: ${order.createdAt.toISOString()}`;
}
