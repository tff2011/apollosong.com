import "server-only";

import { createHash } from "crypto";
import { env } from "~/env";

const PIXEL_ID = env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
const ACCESS_TOKEN = env.TIKTOK_CAPI_ACCESS_TOKEN;
const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

type TikTokEventUser = {
    email?: string[];
    external_id?: string[];
    ip?: string;
    user_agent?: string;
};

export interface TikTokEventData {
    eventName: string;
    eventId: string;
    orderId?: string;
    email?: string;
    value?: number;
    currency?: string;
    userAgent?: string;
    userIp?: string;
    sourceUrl?: string;
}

function hashValue(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function buildUserData(data: TikTokEventData): TikTokEventUser {
    const user: TikTokEventUser = {};

    if (data.email) {
        user.email = [hashValue(normalizeEmail(data.email))];
    }

    if (data.orderId) {
        user.external_id = [hashValue(data.orderId)];
    }

    if (data.userIp) {
        user.ip = data.userIp;
    }

    if (data.userAgent) {
        user.user_agent = data.userAgent;
    }

    return user;
}

export async function sendTikTokEvent(data: TikTokEventData): Promise<boolean> {
    if (!PIXEL_ID || !ACCESS_TOKEN) {
        console.warn("[TikTok CAPI] Credenciais nao configuradas");
        return false;
    }

    const user = buildUserData(data);
    const properties: Record<string, unknown> = {};

    if (typeof data.value === "number") {
        properties.value = data.value;
    }
    if (data.currency) {
        properties.currency = data.currency.toUpperCase();
    }
    if (data.orderId) {
        properties.content_id = data.orderId;
        properties.content_type = "product";
        properties.order_id = data.orderId;
        properties.contents = [
            {
                content_id: data.orderId,
                content_type: "product",
                quantity: 1,
            },
        ];
    }

    const eventPayload: Record<string, unknown> = {
        event: data.eventName,
        event_id: data.eventId,
        event_time: Math.floor(Date.now() / 1000),
    };

    if (Object.keys(user).length > 0) {
        eventPayload.user = user;
    }
    if (Object.keys(properties).length > 0) {
        eventPayload.properties = properties;
    }
    if (data.sourceUrl) {
        eventPayload.page = { url: data.sourceUrl };
    }

    const payload: Record<string, unknown> = {
        event_source: "web",
        event_source_id: PIXEL_ID,
        data: [eventPayload],
    };

    try {
        const response = await fetch(TIKTOK_EVENTS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Access-Token": ACCESS_TOKEN,
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => null);
        const resultCode = result?.code;
        const hasErrorCode =
            typeof resultCode === "number"
                ? resultCode !== 0
                : typeof resultCode === "string"
                    ? resultCode !== "0"
                    : false;

        if (!response.ok || hasErrorCode) {
            console.error("[TikTok CAPI] Erro:", result ?? response.statusText);
            return false;
        }

        console.log("[TikTok CAPI] Evento enviado:", {
            eventName: data.eventName,
            eventId: data.eventId,
            requestId: result?.request_id,
        });

        return true;
    } catch (error) {
        console.error("[TikTok CAPI] Erro:", error);
        return false;
    }
}

export async function sendTikTokPurchaseEvent(
    data: Omit<TikTokEventData, "eventName" | "eventId"> & { orderId: string }
) {
    return sendTikTokEvent({
        ...data,
        eventName: "Purchase",
        eventId: `purchase_${data.orderId}`,
    });
}
