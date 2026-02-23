import { type NextRequest, NextResponse } from "next/server";

/**
 * API endpoint to proxy audio downloads with proper headers.
 * This works around limitations in in-app browsers (Instagram, Facebook, etc.)
 * that don't support blob downloads or the download attribute.
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get("url");
    const filename = request.nextUrl.searchParams.get("filename") ?? "song.mp3";
    const fallbackFilename = filename
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "song.mp3";

    if (!url) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // Validate URL is from allowed domains (R2, etc.)
    const allowedDomains = [
        "pub-",  // R2 public buckets
        "r2.cloudflarestorage.com",
        "apollosong.com",
        "apollosong.com",
        "localhost",
    ];

    const isAllowed = allowedDomains.some(domain => url.includes(domain));
    if (!isAllowed) {
        return NextResponse.json({ error: "Invalid URL domain" }, { status: 403 });
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return NextResponse.json(
                { error: "Failed to fetch audio file" },
                { status: response.status }
            );
        }

        const audioBuffer = await response.arrayBuffer();

        // Return with headers that force download in any browser
        return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                "Content-Length": audioBuffer.byteLength.toString(),
                "Cache-Control": "no-cache",
            },
        });
    } catch (error) {
        console.error("Download proxy error:", error);
        return NextResponse.json(
            { error: "Failed to download audio" },
            { status: 500 }
        );
    }
}
