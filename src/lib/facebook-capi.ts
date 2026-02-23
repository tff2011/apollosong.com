import "server-only";

import {
    Content,
    CustomData,
    EventRequest,
    ServerEvent,
    UserData,
} from "facebook-nodejs-business-sdk";
import { env } from "~/env";

const PRIMARY_PIXEL_ID = env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
const PRIMARY_ACCESS_TOKEN = env.FACEBOOK_CAPI_ACCESS_TOKEN;
const SECONDARY_PIXEL_ID = env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID_2;
const SECONDARY_ACCESS_TOKEN = env.FACEBOOK_CAPI_ACCESS_TOKEN_2;

type PixelConfig = {
    pixelId: string;
    accessToken: string;
};

function getPixelConfigs(): PixelConfig[] {
    const configs: PixelConfig[] = [];

    if (PRIMARY_PIXEL_ID && PRIMARY_ACCESS_TOKEN) {
        configs.push({ pixelId: PRIMARY_PIXEL_ID, accessToken: PRIMARY_ACCESS_TOKEN });
    }

    if (SECONDARY_PIXEL_ID && SECONDARY_ACCESS_TOKEN) {
        configs.push({ pixelId: SECONDARY_PIXEL_ID, accessToken: SECONDARY_ACCESS_TOKEN });
    }

    return configs;
}

export interface FacebookEventData {
    eventName: string;
    eventId: string;
    orderId?: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    value?: number;
    currency?: string;
    contentIds?: string[];
    userAgent?: string;
    userIp?: string;
    fbc?: string;
    fbp?: string;
    sourceUrl?: string;
}

export async function sendFacebookEvent(data: FacebookEventData): Promise<boolean> {
    const configs = getPixelConfigs();

    if (configs.length === 0) {
        console.warn("[Facebook CAPI] Credenciais nao configuradas");
        return false;
    }

    try {
        const userData = new UserData();

        if (data.email) {
            userData.setEmail(data.email.toLowerCase().trim());
        }
        if (data.phone) {
            const phone = data.phone.replace(/\D/g, "");
            userData.setPhone(phone.startsWith("55") ? phone : `55${phone}`);
        }
        if (data.firstName) {
            userData.setFirstName(data.firstName.toLowerCase().trim());
        }
        if (data.lastName) {
            userData.setLastName(data.lastName.toLowerCase().trim());
        }
        if (data.fbc) {
            userData.setFbc(data.fbc);
        }
        if (data.fbp) {
            userData.setFbp(data.fbp);
        }
        if (data.userIp) {
            userData.setClientIpAddress(data.userIp);
        }
        if (data.userAgent) {
            userData.setClientUserAgent(data.userAgent);
        }
        if (data.orderId) {
            userData.setExternalId(data.orderId);
        }

        const customData = new CustomData();

        if (typeof data.value === "number") {
            customData.setValue(data.value);
        }
        if (data.currency) {
            customData.setCurrency(data.currency.toUpperCase());
        }
        if (data.orderId) {
            customData.setOrderId(data.orderId);
        }
        if (data.contentIds && data.contentIds.length > 0) {
            const contents = data.contentIds.map((id) =>
                new Content().setId(id).setQuantity(1)
            );
            customData.setContents(contents);
            customData.setContentType("product");
        }

        const serverEvent = new ServerEvent()
            .setEventName(data.eventName)
            .setEventTime(Math.floor(Date.now() / 1000))
            .setUserData(userData)
            .setCustomData(customData)
            .setActionSource("website")
            .setEventId(data.eventId);

        if (data.sourceUrl) {
            serverEvent.setEventSourceUrl(data.sourceUrl);
        }

        const results = await Promise.allSettled(
            configs.map(({ accessToken, pixelId }) =>
                new EventRequest(accessToken, pixelId)
                    .setEvents([serverEvent])
                    .execute()
            )
        );

        let sent = false;
        for (const result of results) {
            if (result.status === "fulfilled") {
                sent = true;
                console.log("[Facebook CAPI] Evento enviado:", {
                    eventName: data.eventName,
                    eventId: data.eventId,
                    eventsReceived: result.value?.events_received,
                });
            } else {
                console.error("[Facebook CAPI] Erro:", result.reason);
            }
        }

        return sent;
    } catch (error) {
        console.error("[Facebook CAPI] Erro:", error);
        return false;
    }
}

export async function sendPurchaseEvent(
    data: Omit<FacebookEventData, "eventName" | "eventId"> & { orderId: string }
) {
    return sendFacebookEvent({
        ...data,
        eventName: "Purchase",
        eventId: `purchase_${data.orderId}`,
    });
}
