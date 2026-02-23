import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const DEFAULT_MAX_SKEW_SECONDS = 5 * 60;

type KieCallbackPayload = {
    code?: number;
    msg?: string;
    data?: {
        callbackType?: string;
        task_id?: string;
        taskId?: string;
        data?: unknown[];
    };
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function getTaskId(payload: KieCallbackPayload): string | null {
    const taskId = payload.data?.task_id || payload.data?.taskId;
    if (!taskId || typeof taskId !== "string") return null;
    const normalized = taskId.trim();
    return normalized.length > 0 ? normalized : null;
}

function computeSignature(taskId: string, timestampSeconds: string, secret: string): string {
    const message = `${taskId}.${timestampSeconds}`;
    return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

function isTimestampStale(timestamp: string, maxSkewSeconds: number): boolean {
    const parsed = Number(timestamp);
    if (!Number.isFinite(parsed)) return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.abs(nowSec - parsed) > maxSkewSeconds;
}

export async function POST(req: Request) {
    let payload: KieCallbackPayload;

    try {
        payload = (await req.json()) as KieCallbackPayload;
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const taskId = getTaskId(payload);
    if (!taskId) {
        return NextResponse.json({ error: "Missing task_id in payload" }, { status: 400 });
    }

    const webhookSecret = process.env.KIE_WEBHOOK_HMAC_KEY?.trim();
    if (webhookSecret) {
        const timestamp = req.headers.get("x-webhook-timestamp");
        const receivedSignature = req.headers.get("x-webhook-signature");
        if (!timestamp || !receivedSignature) {
            return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 401 });
        }

        const maxSkewSeconds = parsePositiveInt(
            process.env.KIE_WEBHOOK_MAX_SKEW_SECONDS,
            DEFAULT_MAX_SKEW_SECONDS
        );
        if (isTimestampStale(timestamp, maxSkewSeconds)) {
            return NextResponse.json({ error: "Stale webhook timestamp" }, { status: 401 });
        }

        const expectedSignature = computeSignature(taskId, timestamp, webhookSecret);
        const expectedBuffer = Buffer.from(expectedSignature);
        const receivedBuffer = Buffer.from(receivedSignature);

        if (
            expectedBuffer.length !== receivedBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
        ) {
            return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
        }
    }

    const callbackType = payload.data?.callbackType || "unknown";
    const tracks = Array.isArray(payload.data?.data) ? payload.data!.data.length : 0;

    // Callback is currently observability-only because the worker already resolves
    // and persists final outputs through polling/task flow.
    console.log(
        `[Suno/Kie] Callback received task=${taskId} type=${callbackType} tracks=${tracks} code=${payload.code ?? "n/a"}`
    );

    return NextResponse.json({ status: "received" }, { status: 200 });
}
