/**
 * Telegram notification helper for sale alerts
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// Separate group for automation alerts (Suno, revisions, etc.)
const TELEGRAM_AUTOMATION_CHAT_ID = "-5221304809";

interface SaleAlertData {
    orderId: string;
    locale: string;
    recipientName: string;
    recipient: string;
    genre: string;
    vocals: string;
    email: string;
    backupWhatsApp?: string | null;
    currency: string;
    grossAmountCents: number;
    netAmountCents: number; // Already in USD from Stripe balance transaction
    stripeFee: number;
    hasFastDelivery?: boolean;
    hasExtraSong?: boolean;
    genreVariantCount?: number;
    hasCertificate?: boolean;
    hasLyrics?: boolean;
    orderType?: string | null;
    planType?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    deviceType?: string | null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Generic operational alert for delivery/queue failures
 */
export async function sendOperationalAlert(message: string): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("[Telegram] Bot token not configured, skipping operational alert");
        return;
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("[Telegram] Failed to send operational alert:", error);
        }
    } catch (error) {
        console.error("[Telegram] Error sending operational alert:", error);
    }
}

// Cooldown tracking for Suno alerts (prevent spam)
let lastCreditsAlertTime = 0;
const CREDITS_ALERT_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Send Suno credits alert when running low
 */
export async function sendSunoCreditsAlert(credits: number): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping Suno credits alert");
        return;
    }

    // Check cooldown (except for 0 credits - always alert)
    const now = Date.now();
    if (credits > 0 && now - lastCreditsAlertTime < CREDITS_ALERT_COOLDOWN) {
        console.log("[Telegram] Skipping credits alert (cooldown active)");
        return;
    }

    lastCreditsAlertTime = now;

    const isUrgent = credits === 0;
    const emoji = isUrgent ? "🚨" : "⚠️";
    const urgency = isUrgent ? "URGENTE" : "ATENÇÃO";

    const message = `
${emoji} <b>SUNO AI - ${urgency}</b> ${emoji}

💳 <b>Créditos restantes:</b> ${credits}

${isUrgent
            ? "❌ Os créditos do Suno acabaram! Novas músicas não serão geradas até recarregar."
            : "⏰ Os créditos do Suno estão baixos. Considere recarregar em breve."
        }

🔗 <a href="https://suno.com/account">Gerenciar conta Suno</a>
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send Suno credits alert:", error);
        } else {
            console.log("Suno credits alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending Suno credits alert:", error);
    }
}

interface SunoDetectionDiagnosticData {
    orderId: string;
    recipientName: string;
    genre: string;
    phase: string;
    details: {
        expectedUUIDs?: string[];
        existingSongIds?: number;
        menuButtonsFound?: number;
        matchingCards?: number;
        cardTexts?: string[];
        orderCardTexts?: string[]; // Cards specifically for this order with status
        elapsedSeconds?: number;
        mode?: "strict" | "legacy" | "order-scan";
        apiPostResponses?: string[];
    };
}

/**
 * Send Suno detection diagnostic alert for debugging song detection issues
 */
export async function sendSunoDetectionDiagnostic(data: SunoDetectionDiagnosticData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping Suno detection diagnostic");
        return;
    }

    // Determine status indicators with emojis
    const uuidCount = data.details.expectedUUIDs?.length || 0;
    const uuidStatus = uuidCount >= 2 ? "✅" : uuidCount === 1 ? "⚠️" : "❌";

    const menuButtonCount = data.details.menuButtonsFound ?? 0;
    const menuStatus = menuButtonCount >= 2 ? "✅" : menuButtonCount === 1 ? "⚠️" : "❌";

    const apiCount = data.details.apiPostResponses?.length || 0;
    const apiStatus = apiCount > 0 ? "✅" : "❌";

    const isFailure = data.phase.includes("FALHA");
    const isTimeout = data.phase.includes("TIMEOUT");
    const headerEmoji = isFailure ? "❌" : isTimeout ? "⚠️" : "🔍";

    // Show order-specific cards first (most important)
    const orderCardsPreview = data.details.orderCardTexts?.length
        ? `\n\n<b>🎯 Cards DESTA ordem:</b>\n${data.details.orderCardTexts.map((t, i) => `${i + 1}. <code>${escapeHtml(t.slice(0, 70))}</code>`).join("\n")}`
        : "\n\n❌ <b>Nenhum card desta ordem encontrado!</b>";

    const cardTextsPreview = data.details.cardTexts?.length
        ? `\n\n<b>Outros cards na página:</b> ${data.details.cardTexts.length} total`
        : "";

    const apiResponsesPreview = data.details.apiPostResponses?.length
        ? `\n\n<b>API POSTs:</b>\n${data.details.apiPostResponses.slice(0, 5).map(r => `• <code>${escapeHtml(r.slice(0, 80))}</code>`).join("\n")}`
        : "\n\n❌ <b>Nenhum POST capturado</b>";

    // Check if order cards are ready (have duration)
    const orderCardsCount = data.details.orderCardTexts?.length || 0;
    const readyOrderCards = data.details.orderCardTexts?.filter(t => t.startsWith("✅")).length || 0;
    const orderCardsStatus = readyOrderCards >= 2 ? "✅" : orderCardsCount > 0 ? "⏳" : "❌";

    const message = `
${headerEmoji} <b>SUNO DIAGNÓSTICO</b> ${headerEmoji}

📋 <b>Order:</b> <code>${escapeHtml(data.orderId)}</code>
👤 <b>Para:</b> ${escapeHtml(data.recipientName)}
🎵 <b>Gênero:</b> ${escapeHtml(data.genre)}
📍 <b>Fase:</b> ${escapeHtml(data.phase)}

<b>Checklist:</b>
${orderCardsStatus} Cards desta ordem: ${orderCardsCount} (${readyOrderCards} prontas)
${uuidStatus} UUIDs da API: ${uuidCount}${uuidCount > 0 ? `\n   ${data.details.expectedUUIDs!.slice(0, 2).map(u => u.slice(0, 20) + "...").join("\n   ")}` : " - API não retornou IDs!"}
${menuStatus} Botões de menu: ${menuButtonCount}
${apiStatus} POSTs capturados: ${apiCount}

⏱ <b>Tempo:</b> ${data.details.elapsedSeconds || 0}s
🔧 <b>Modo:</b> ${data.details.mode || "unknown"}${orderCardsPreview}${cardTextsPreview}${apiResponsesPreview}
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send Suno detection diagnostic:", error);
        } else {
            console.log("Suno detection diagnostic sent successfully");
        }
    } catch (error) {
        console.error("Error sending Suno detection diagnostic:", error);
    }
}

interface SunoGenerationAlertData {
    orderId: string;
    recipientName: string;
    genre: string;
    success: boolean;
    songsGenerated?: number;
    creditsRemaining?: number;
    error?: string;
    customerEmail?: string | null;
    customerWhatsApp?: string | null;
}

/**
 * Send Suno generation status alert
 */
export async function sendSunoGenerationAlert(data: SunoGenerationAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping Suno generation alert");
        return;
    }

    const emoji = data.success ? "✅" : "❌";
    const status = data.success ? "SUCESSO" : "FALHOU";
    const customerEmail = data.customerEmail ? escapeHtml(data.customerEmail) : "não informado";
    const customerWhatsApp = data.customerWhatsApp ? escapeHtml(data.customerWhatsApp) : "não informado";

    let message = `
${emoji} <b>SUNO - ${status}</b> ${emoji}

🎵 <b>Pedido:</b> <code>${escapeHtml(data.orderId)}</code>
👤 <b>Para:</b> ${escapeHtml(data.recipientName)}
📧 <b>Email:</b> ${customerEmail}
📱 <b>WhatsApp:</b> ${customerWhatsApp}
🎸 <b>Gênero:</b> ${escapeHtml(data.genre)}
`;

    if (data.success) {
        message += `
🎧 <b>Músicas geradas:</b> ${data.songsGenerated || 0}`;
    } else {
        message += `
❌ <b>Erro:</b> ${escapeHtml(data.error || "Erro desconhecido")}`;
    }

    if (data.creditsRemaining !== undefined) {
        message += `
💳 <b>Créditos restantes:</b> ${data.creditsRemaining}`;
    }

    message = message.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send Suno generation alert:", error);
        } else {
            console.log("Suno generation alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending Suno generation alert:", error);
    }
}

/**
 * Send Suno session expired alert
 */
export async function sendSunoSessionAlert(): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping Suno session alert");
        return;
    }

    const message = `
🔐 <b>SUNO AI - SESSÃO EXPIRADA</b> 🔐

A sessão do Suno AI expirou. É necessário atualizar os cookies para continuar gerando músicas.

<b>Passos:</b>
1. Faça login em suno.com no navegador
2. Exporte os cookies usando uma extensão
3. Atualize a variável SUNO_COOKIES_JSON no Coolify
4. Reinicie o worker
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send Suno session alert:", error);
        } else {
            console.log("Suno session alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending Suno session alert:", error);
    }
}

interface MusicianTipAlertData {
    orderId: string;
    parentOrderId: string;
    locale: string;
    email: string;
    currency: string;
    amountCents: number;
    netAmountCents: number;
    stripeFee: number;
}

/**
 * Send Telegram alert for musician tip contributions
 */
export async function sendMusicianTipAlert(data: MusicianTipAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn("Telegram credentials not configured, skipping musician tip alert");
        return;
    }

    const flag = data.locale === "pt" ? "🇧🇷"
        : data.locale === "es" ? "🇪🇸"
            : data.locale === "fr" ? "🇫🇷"
                : data.locale === "it" ? "🇮🇹"
                    : "🇺🇸";

    const grossSymbol = data.currency === "BRL" ? "R$"
        : data.currency === "EUR" ? "€"
            : "$";
    const grossAmount = (data.amountCents / 100).toFixed(2);
    const netUsd = (data.netAmountCents / 100).toFixed(2);
    const feeUsd = (data.stripeFee / 100).toFixed(2);

    const email = escapeHtml(data.email);
    const orderId = escapeHtml(data.orderId);
    const parentOrderId = escapeHtml(data.parentOrderId);

    const message = `
💝 <b>GORJETA MÚSICOS!</b> 💝
${flag}

💰 <b>Contribuição:</b> ${grossSymbol}${grossAmount}
💵 <b>Net:</b> $${netUsd} USD
💳 <b>Fee:</b> $${feeUsd}

📧 <b>Email:</b> ${email}
🔗 <b>Tip ID:</b> <code>${orderId}</code>
🎵 <b>Pedido original:</b> <code>${parentOrderId}</code>

❤️ <i>Obrigado por valorizar nossos músicos!</i>
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send musician tip alert:", error);
        } else {
            console.log("Telegram musician tip alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending musician tip alert:", error);
    }
}

interface RevisionRequestAlertData {
    orderId: string;
    recipientName: string;
    email: string;
    whatsapp?: string | null;
    revisionNotes: string;
    revisionCount: number;
    locale: string;
    revisionType?: string; // PRONUNCIATION, LYRICS_ERROR, NAME_ERROR, STYLE_CHANGE, QUALITY_ISSUE, OTHER
    revisionFault?: string; // OUR_FAULT, CLIENT_FAULT, UNCLEAR
    revisionFaultReason?: string; // Explicação da classificação de responsabilidade
    melodyPreference?: string; // KEEP_CURRENT, SUGGEST_NEW
}

/**
 * Send Telegram alert for revision request
 */
export async function sendRevisionRequestAlert(data: RevisionRequestAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping revision request alert");
        return;
    }

    const flag = data.locale === "pt" ? "🇧🇷"
        : data.locale === "es" ? "🇪🇸"
            : data.locale === "fr" ? "🇫🇷"
                : data.locale === "it" ? "🇮🇹"
                    : "🇺🇸";

    const email = escapeHtml(data.email);
    const recipientName = escapeHtml(data.recipientName);
    const orderId = escapeHtml(data.orderId);
    const notes = escapeHtml(data.revisionNotes.substring(0, 500)); // Limit notes length
    const whatsappLine = data.whatsapp
        ? `\n📱 <b>WhatsApp:</b> ${escapeHtml(data.whatsapp)}`
        : "";

    // Revision type emoji and label
    const typeEmojis: Record<string, string> = {
        PRONUNCIATION: "🎤",
        NAME_ERROR: "📛",
        LYRICS_ERROR: "📝",
        STYLE_CHANGE: "🎨",
        QUALITY_ISSUE: "🔊",
        OTHER: "❓",
    };
    const typeLabels: Record<string, string> = {
        PRONUNCIATION: "Pronúncia",
        NAME_ERROR: "Nome Errado",
        LYRICS_ERROR: "Erro na Letra",
        STYLE_CHANGE: "Mudança de Estilo",
        QUALITY_ISSUE: "Qualidade",
        OTHER: "Outro",
    };
    const typeEmoji = data.revisionType ? typeEmojis[data.revisionType] || "❓" : "❓";
    const typeLabel = data.revisionType ? typeLabels[data.revisionType] || "Não classificado" : "Não classificado";
    const typeLine = data.revisionType
        ? `\n${typeEmoji} <b>Tipo:</b> ${typeLabel}`
        : "";

    // Revision fault (responsibility) emoji and label
    const faultEmojis: Record<string, string> = {
        OUR_FAULT: "🆓",
        CLIENT_FAULT: "💰",
        UNCLEAR: "❓",
    };
    const faultLabels: Record<string, string> = {
        OUR_FAULT: "ERRO NOSSO (Grátis)",
        CLIENT_FAULT: "ERRO DO CLIENTE (R$ 39,90)",
        UNCLEAR: "A ANALISAR",
    };
    const faultEmoji = data.revisionFault ? faultEmojis[data.revisionFault] || "❓" : "";
    const faultLabel = data.revisionFault ? faultLabels[data.revisionFault] || "" : "";
    const faultLine = data.revisionFault
        ? `\n${faultEmoji} <b>Responsabilidade:</b> ${faultLabel}`
        : "";
    const faultReasonLine = data.revisionFaultReason
        ? `\n💬 <i>${escapeHtml(data.revisionFaultReason.substring(0, 200))}</i>`
        : "";

    // Melody preference line
    const melodyLabels: Record<string, string> = {
        KEEP_CURRENT: "🎵 Manter melodia atual",
        SUGGEST_NEW: "🎶 Quer 2 novas melodias",
    };
    const melodyLine = data.melodyPreference && melodyLabels[data.melodyPreference]
        ? `\n${melodyLabels[data.melodyPreference]}`
        : "";

    const message = `
🔄 <b>PEDIDO DE REVISÃO!</b> 🔄
${flag}${typeLine}${faultLine}${melodyLine}${faultReasonLine}

🎵 <b>Pedido:</b> <code>${orderId}</code>
👤 <b>Para:</b> ${recipientName}
📧 <b>Email:</b> ${email}${whatsappLine}
🔢 <b>Revisão #:</b> ${data.revisionCount}/4

📝 <b>O que precisa corrigir:</b>
<i>${notes}</i>
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send revision request alert:", error);
        } else {
            console.log("Telegram revision request alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending revision request alert:", error);
    }
}

interface RevisionCompletedAlertData {
    orderId: string;
    recipientName: string;
    email: string;
    locale: string;
    revisionCount: number;
}

/**
 * Send Telegram alert when revision is completed by admin
 */
export async function sendRevisionCompletedAlert(data: RevisionCompletedAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping revision completed alert");
        return;
    }

    const flag = data.locale === "pt" ? "BR"
        : data.locale === "es" ? "ES"
            : data.locale === "fr" ? "FR"
                : data.locale === "it" ? "IT"
                    : "US";

    const email = escapeHtml(data.email);
    const recipientName = escapeHtml(data.recipientName);
    const orderId = escapeHtml(data.orderId);

    const message = `
REVISAO CONCLUIDA!
${flag}

Pedido: <code>${orderId}</code>
Para: ${recipientName}
Email: ${email}
Revisao #: ${data.revisionCount}

Email de entrega enviado ao cliente!
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send revision completed alert:", error);
        } else {
            console.log("Telegram revision completed alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending revision completed alert:", error);
    }
}

interface DelayedOrderAlertData {
    orderId: string;
    recipientName: string;
    email: string;
    locale: string;
    orderType: string;
    daysSincePayment: number;
    hasFastDelivery: boolean;
}

/**
 * Send Telegram alert for delayed orders that should have been delivered
 */
export async function sendDelayedOrderAlert(orders: DelayedOrderAlertData[]): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping delayed order alert");
        return;
    }

    if (orders.length === 0) return;

    const orderLines = orders.map((o) => {
        const flag = o.locale === "pt" ? "🇧🇷"
            : o.locale === "es" ? "🇪🇸"
                : o.locale === "fr" ? "🇫🇷"
                    : o.locale === "it" ? "🇮🇹"
                        : "🇺🇸";
        const delivery = o.hasFastDelivery ? "⚡24h" : "📦7d";
        const type = o.orderType === "MAIN" ? "" : ` (${o.orderType})`;
        return `${flag} <code>${escapeHtml(o.orderId.slice(-8))}</code> - ${escapeHtml(o.recipientName)}${type} - ${o.daysSincePayment}d - ${delivery}`;
    }).join("\n");

    const message = `
⚠️ <b>PEDIDOS ATRASADOS!</b> ⚠️

Encontrados <b>${orders.length}</b> pedido(s) com música pronta mas não entregues:

${orderLines}

🔧 Verifique o worker de auto-delivery ou envie manualmente.
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send delayed order alert:", error);
        } else {
            console.log("Telegram delayed order alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending delayed order alert:", error);
    }
}

interface PendingOrderAlertData {
    orderId: string;
    recipientName: string;
    email: string;
    locale: string;
    status: string;
    hasFastDelivery: boolean;
    hasLyrics: boolean;
    hasSong: boolean;
    hoursSincePayment: number;
    hoursLate: number;
}

/**
 * Send daily Telegram alert for orders pending lyrics/music generation
 * Excludes STREAMING_UPSELL orders (manual process)
 */
export async function sendDailyPendingOrdersAlert(orders: PendingOrderAlertData[]): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping daily pending orders alert");
        return;
    }

    if (orders.length === 0) return;

    // Sort by hours late descending (most urgent first)
    const sortedOrders = [...orders].sort((a, b) => b.hoursLate - a.hoursLate);

    const orderLines = sortedOrders.map((o) => {
        const flag = o.locale === "pt" ? "🇧🇷"
            : o.locale === "es" ? "🇪🇸"
                : o.locale === "fr" ? "🇫🇷"
                    : o.locale === "it" ? "🇮🇹"
                        : "🇺🇸";
        const delivery = o.hasFastDelivery ? "⚡12h" : "📦48h";
        const lyricsIcon = o.hasLyrics ? "✅" : "❌";
        const songIcon = o.hasSong ? "✅" : "❌";
        const hoursLateRounded = Math.round(o.hoursLate);
        return `${flag} ${escapeHtml(o.recipientName)} - <b>${hoursLateRounded}h</b> atraso ${delivery}\n   📧 ${escapeHtml(o.email)}\n   Letra: ${lyricsIcon} | Música: ${songIcon}`;
    }).join("\n\n");

    const criticalCount = sortedOrders.filter(o => o.hoursLate > 48).length;
    const urgentHeader = criticalCount > 0
        ? `\n\n🔴 <b>${criticalCount} pedido(s) com mais de 48h de atraso!</b>`
        : "";

    const message = `
📊 <b>RELATÓRIO DIÁRIO - PEDIDOS ATRASADOS</b> 📊
${urgentHeader}

Total: <b>${orders.length}</b> pedido(s) aguardando processamento

${orderLines}

🔧 Verifique o worker de letras e o Suno.
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send daily pending orders alert:", error);
        } else {
            console.log("Telegram daily pending orders alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending daily pending orders alert:", error);
    }
}

interface NewTicketAlertData {
    ticketId: string;
    email: string;
    subject: string;
    bodySnippet: string;
    orderId?: string | null;
    isReply: boolean;
}

/**
 * Send Telegram alert for new support ticket or customer reply
 */
export async function sendNewTicketAlert(data: NewTicketAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping new ticket alert");
        return;
    }

    const emoji = data.isReply ? "💬" : "📩";
    const label = data.isReply ? "RESPOSTA DO CLIENTE" : "NOVO TICKET";

    const snippet = escapeHtml(data.bodySnippet.substring(0, 200));
    const orderLine = data.orderId
        ? `\n🎵 <b>Pedido:</b> <code>${escapeHtml(data.orderId)}</code>`
        : "";

    const message = `
${emoji} <b>${label}</b> ${emoji}

🎫 <b>ID:</b> <code>${escapeHtml(data.ticketId)}</code>
📧 <b>Email:</b> ${escapeHtml(data.email)}
📝 <b>Assunto:</b> ${escapeHtml(data.subject)}${orderLine}

💬 <i>${snippet}${data.bodySnippet.length > 200 ? "..." : ""}</i>
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send new ticket alert:", error);
        } else {
            console.log("Telegram new ticket alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending new ticket alert:", error);
    }
}

/**
 * Send alert when CAPTCHA is detected during Suno automation
 */
export async function sendCaptchaAlert(): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping CAPTCHA alert");
        return;
    }

    const message = `
🚨 <b>SUNO AI - CAPTCHA DETECTADO!</b> 🚨

A automação foi pausada pois um CAPTCHA apareceu.

👉 <b>Ação necessária:</b>
Resolva o CAPTCHA manualmente na janela do navegador para continuar.

<i>O script continuará automaticamente assim que o CAPTCHA sumir.</i>
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send CAPTCHA alert:", error);
        } else {
            console.log("Telegram CAPTCHA alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending CAPTCHA alert:", error);
    }
}

interface BounceAlertData {
    bouncedEmail: string;
    bounceReason: string;
    bounceType: string;
    orderId?: string | null;
    orderStatus?: string | null;
    recipientName?: string | null;
    backupWhatsApp?: string | null;
    locale?: string | null;
}

/**
 * Send Telegram alert when a bounce is detected for a paid customer
 */
export async function sendBounceAlert(data: BounceAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn("Telegram credentials not configured, skipping bounce alert");
        return;
    }

    const hasPaidOrder = !!data.orderId;
    const emoji = hasPaidOrder ? "🚨" : "⚠️";
    const urgency = hasPaidOrder ? "BOUNCE - CLIENTE PAGOU!" : "BOUNCE DETECTADO";

    const flag = data.locale === "pt" ? "🇧🇷"
        : data.locale === "es" ? "🇪🇸"
            : data.locale === "fr" ? "🇫🇷"
                : data.locale === "it" ? "🇮🇹"
                    : data.locale ? "🇺🇸"
                        : "";

    const whatsappLine = data.backupWhatsApp
        ? `\n📱 <b>WhatsApp:</b> ${escapeHtml(data.backupWhatsApp)}`
        : "\n📱 <b>WhatsApp:</b> ❌ não preencheu";

    const orderLine = data.orderId
        ? `\n🎵 <b>Pedido:</b> <code>${escapeHtml(data.orderId)}</code> (${escapeHtml(data.orderStatus || "?")})`
        : "";

    const recipientLine = data.recipientName
        ? `\n👤 <b>Para:</b> ${escapeHtml(data.recipientName)}`
        : "";

    const message = `
${emoji} <b>${urgency}</b> ${emoji}
${flag}

📧 <b>Email:</b> ${escapeHtml(data.bouncedEmail)}
❌ <b>Motivo:</b> ${escapeHtml(data.bounceReason.substring(0, 300))}
📋 <b>Tipo:</b> ${escapeHtml(data.bounceType)}${orderLine}${recipientLine}${whatsappLine}

${hasPaidOrder ? "⚡ <b>Contate o cliente via WhatsApp!</b>" : "📝 Sem pedido pago associado."}
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send bounce alert:", error);
        } else {
            console.log("Telegram bounce alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending bounce alert:", error);
    }
}

export async function sendSaleAlert(data: SaleAlertData): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn("Telegram credentials not configured, skipping alert");
        return;
    }

    const flag = data.locale === "pt" ? "🇧🇷"
        : data.locale === "es" ? "🇪🇸"
            : data.locale === "fr" ? "🇫🇷"
                : data.locale === "it" ? "🇮🇹"
                    : "🇺🇸";
    const netUsd = (data.netAmountCents / 100).toFixed(2);
    const grossAmount = (data.grossAmountCents / 100).toFixed(2);
    const grossSymbol = data.currency === "BRL" ? "R$"
        : data.currency === "EUR" ? "€"
            : "$";
    const feeUsd = (data.stripeFee / 100).toFixed(2);

    // Format recipient type
    const recipientLabels: Record<string, string> = {
        husband: "Husband",
        wife: "Wife",
        children: "Children",
        father: "Father",
        mother: "Mother",
        sibling: "Sibling",
        friend: "Friend",
        myself: "Myself",
        group: "Group",
        other: "Other",
    };

    // Format genre
    const genreLabels: Record<string, string> = {
        // Universal
        pop: "Pop",
        country: "Country",
        rock: "Rock",
        "jovem-guarda": "Jovem Guarda",
        "rock-classico": "Rock Clássico",
        "pop-rock-brasileiro": "Pop Rock Brasileiro",
        "heavy-metal": "Heavy Metal",
        eletronica: "Eletrônica",
        "eletronica-afro-house": "Eletrônica - Afro House",
        "eletronica-progressive-house": "Eletrônica - Progressive House",
        "eletronica-melodic-techno": "Eletrônica - Melodic Techno",
        latina: "Música Latina",
        salsa: "Salsa",
        merengue: "Merengue",
        bachata: "Bachata",
        bolero: "Bolero",
        rnb: "R&B",
        jazz: "Jazz",
        worship: "Worship",
        hiphop: "Rap",
        funk: "Funk",
        "funk-carioca": "Funk Carioca",
        "funk-paulista": "Funk Paulista",
        "funk-melody": "Funk Melody",
        brega: "Brega",
        "brega-romantico": "Brega Romântico",
        tecnobrega: "Tecnobrega",
        reggae: "Reggae",
        lullaby: "Infantil",
        "lullaby-ninar": "Infantil - Canções de Ninar",
        "lullaby-animada": "Infantil - Animada",
        // Brazilian (PT)
        samba: "Samba",
        pagode: "Pagode",
        "pagode-de-mesa": "Pagode de Mesa (Raiz)",
        "pagode-romantico": "Pagode Romântico (Anos 90)",
        "pagode-universitario": "Pagode Universitário / Novo Pagode",
        forro: "Forró",
        "sertanejo-raiz": "Sertanejo Raiz",
        "sertanejo-universitario": "Sertanejo Universitário",
        "sertanejo-romantico": "Sertanejo Romântico",
        "forro-pe-de-serra": "Forró Pé-de-Serra", // Legacy
        "forro-pe-de-serra-rapido": "Forró Pé-de-Serra (Dançante)",
        "forro-pe-de-serra-lento": "Forró Pé-de-Serra (Lento)",
        "forro-universitario": "Forró Universitário",
        "forro-eletronico": "Forró Eletrônico",
        axe: "Axé",
        mpb: "MPB",
        "mpb-bossa-nova": "MPB / Bossa Nova (Clássica)",
        "mpb-cancao-brasileira": "MPB Clássica / Canção Brasileira",
        "mpb-pop": "Pop MPB (Radiofônica)",
        "mpb-intimista": "MPB Intimista / Folk-Pop Brasileiro",
        bossa: "Bossa Nova",
        // Latin (ES)
        cumbia: "Cumbia",
        ranchera: "Ranchera",
        balada: "Balada",
        adoracion: "Adoración (Worship Latino)",
        // French (FR)
        chanson: "Chanson Française",
        variete: "Variété Française",
        // Italian (IT)
        napoletana: "Canzone Napoletana",
        lirico: "Lirico (Opera)",
        tarantella: "Tarantella",
    };

    // Format vocals
    const vocalsLabels: Record<string, string> = {
        female: "Female",
        male: "Male",
        either: "No Preference",
    };

    // Build extras line
    const extras: string[] = [];
    if (data.planType === "acelerado") {
        extras.push("🚀 Plano Turbo 6h");
    } else if (data.planType === "express") {
        extras.push("⚡ Plano Express 24h");
    } else if (data.planType === "essencial") {
        extras.push("🗓️ Plano Essencial 7 dias");
    } else if (data.hasFastDelivery) {
        extras.push("⚡ Fast Delivery");
    }
    if (data.hasExtraSong) extras.push("🎵 Extra Song");
    if (data.genreVariantCount && data.genreVariantCount > 0) {
        extras.push(`🎸 ${data.genreVariantCount} Genre Variant${data.genreVariantCount > 1 ? "s" : ""}`);
    }
    if (data.hasCertificate) extras.push("🎖️ Certificate");
    if (data.hasLyrics) extras.push("📜 Lyrics");
    if (data.orderType === "STREAMING_UPSELL") extras.push("🚀 Streaming VIP (Spotify/IG/TikTok)");
    const extrasLine = extras.length > 0 ? `\n🎁 <b>Extras:</b> ${extras.join(", ")}` : "";

    // Build UTM line
    let utmLine = "";
    if (data.utmSource || data.utmMedium || data.utmCampaign) {
        const utmParts: string[] = [];
        if (data.utmSource) utmParts.push(`src=${escapeHtml(data.utmSource)}`);
        if (data.utmMedium) utmParts.push(`med=${escapeHtml(data.utmMedium)}`);
        if (data.utmCampaign) utmParts.push(`camp=${escapeHtml(data.utmCampaign)}`);
        utmLine = `\n📊 <b>UTM:</b> ${utmParts.join(" | ")}`;
    }

    const recipientLabel = escapeHtml(
        recipientLabels[data.recipient] || data.recipient
    );
    const genreLabel = escapeHtml(genreLabels[data.genre] || data.genre);
    const vocalsLabel = escapeHtml(vocalsLabels[data.vocals] || data.vocals);
    const recipientName = escapeHtml(data.recipientName);
    const email = escapeHtml(data.email);
    const whatsApp = data.backupWhatsApp ? escapeHtml(data.backupWhatsApp) : "não preencheu";
    const deviceType = escapeHtml(data.deviceType || "Unknown");
    const orderId = escapeHtml(data.orderId);

    const message = `
${flag} <b>NOVA VENDA!</b> ${flag}

💰 <b>Net:</b> $${netUsd} USD
💳 <b>Gross:</b> ${grossSymbol}${grossAmount} | Fee: $${feeUsd}
${extrasLine}
👤 <b>Para:</b> ${recipientName} (${recipientLabel})
🎵 <b>Gênero:</b> ${genreLabel}
🎤 <b>Vocal:</b> ${vocalsLabel}
📧 <b>Email:</b> ${email}
📲 <b>WhatsApp:</b> ${whatsApp}
📱 <b>Device:</b> ${deviceType}${utmLine}

🔗 <b>Order ID:</b> <code>${orderId}</code>
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send Telegram alert:", error);
        } else {
            console.log("Telegram sale alert sent successfully");
        }
    } catch (error) {
        console.error("Error sending Telegram alert:", error);
    }
}

/**
 * Send a quick Telegram update when a customer saves their WhatsApp number
 */
export async function sendWhatsAppUpdateAlert(data: {
    orderId: string;
    backupWhatsApp: string;
}): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return;
    }

    const message = `📲 <b>WhatsApp atualizado</b>\n${escapeHtml(data.backupWhatsApp)}\n\n🆔 <code>${data.orderId}</code>`;

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send WhatsApp update alert:", error);
        }
    } catch (error) {
        console.error("Error sending WhatsApp update alert:", error);
    }
}

/**
 * Send Telegram alert when lyrics generation fails after all retries
 */
export async function sendLyricsFailureAlert(data: { orderId: string; attempts: number; error: string }): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;

    const message = `
🚨 <b>FALHA NA GERAÇÃO DE LETRA</b> 🚨

📋 <b>Pedido:</b> <code>${escapeHtml(data.orderId)}</code>
🔄 <b>Tentativas:</b> ${data.attempts}
❌ <b>Erro:</b> ${escapeHtml(data.error.slice(0, 200))}

⚠️ Este pedido precisa de atenção manual!
`.trim();

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: TELEGRAM_AUTOMATION_CHAT_ID,
                    text: message,
                    parse_mode: "HTML",
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("Failed to send lyrics failure alert:", error);
        }
    } catch (error) {
        console.error("Error sending lyrics failure alert:", error);
    }
}
