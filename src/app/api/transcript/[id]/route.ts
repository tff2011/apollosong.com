import { NextResponse } from "next/server";

export const runtime = "nodejs";

const API_KEY = process.env.ASSEMBLYAI_API_KEY;

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!API_KEY) {
            return NextResponse.json(
                { error: "ASSEMBLYAI_API_KEY not configured" },
                { status: 500 }
            );
        }

        const { id } = await params;

        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: { Authorization: API_KEY },
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("[Transcript] Get failed:", errText);
            return NextResponse.json(
                { error: "Falha ao consultar transcrição.", details: errText },
                { status: 502 }
            );
        }

        const t = (await res.json()) as {
            status: string;
            text?: string;
            error?: string;
        };

        // Handle specific AssemblyAI errors with user-friendly messages
        let userError = t.error ?? null;
        if (t.error?.includes("no spoken audio")) {
            userError = "NO_SPOKEN_AUDIO";
        }

        return NextResponse.json(
            {
                status: t.status,
                text: t.text ?? null,
                error: userError,
            },
            { status: 200 }
        );
    } catch (e) {
        console.error("[Transcript] Unexpected error:", e);
        return NextResponse.json(
            { error: "Erro inesperado no servidor.", details: e instanceof Error ? e.message : String(e) },
            { status: 500 }
        );
    }
}
