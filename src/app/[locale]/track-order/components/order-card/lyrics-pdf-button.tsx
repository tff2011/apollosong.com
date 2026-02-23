"use client";

import { useState, useCallback } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { cn } from "~/lib/utils";

interface LyricsPdfButtonProps {
    orderId: string;
    size: "A4" | "A3";
    locale: string;
}

export function LyricsPdfButton({ orderId, size, locale }: LyricsPdfButtonProps) {
    const [status, setStatus] = useState<"idle" | "loading" | "generating" | "error">("idle");

    const fetchAndDownload = useCallback(async (): Promise<boolean> => {
        const pdfUrl = `/api/frameable-lyrics/${orderId}?size=${size}`;
        const res = await fetch(pdfUrl, {
            headers: { "Accept": "application/pdf" },
        });

        if (res.status === 202) return false; // still generating

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const disposition = res.headers.get("Content-Disposition");
        const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
        const filename = filenameMatch?.[1] || `letra-${size.toLowerCase()}.pdf`;

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }, [orderId, size]);

    const handleDownload = useCallback(async () => {
        setStatus("loading");

        try {
            const downloaded = await fetchAndDownload();
            if (downloaded) {
                setStatus("idle");
                return;
            }

            // PDF is being generated — poll until ready (max ~60s)
            setStatus("generating");
            const maxAttempts = 12;
            for (let i = 0; i < maxAttempts; i++) {
                await new Promise((r) => setTimeout(r, 5000));
                const ready = await fetchAndDownload();
                if (ready) {
                    setStatus("idle");
                    return;
                }
            }
            // Timed out — let user retry manually
            setStatus("error");
        } catch (err) {
            console.error("PDF download error:", err);
            setStatus("error");
        }
    }, [fetchAndDownload]);

    const getMessage = () => {
        if (locale === "pt") {
            if (status === "loading") return "Baixando...";
            if (status === "generating") return "Gerando PDF...";
            if (status === "error") return "Erro - Tentar novamente";
            return `PDF ${size}`;
        }
        if (status === "loading") return "Downloading...";
        if (status === "generating") return "Generating PDF...";
        if (status === "error") return "Error - Retry";
        return `PDF ${size}`;
    };

    const isDisabled = status === "loading" || status === "generating";

    return (
        <button
            onClick={handleDownload}
            disabled={isDisabled}
            className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                status === "error"
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : size === "A4"
                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                        : "bg-purple-500 hover:bg-purple-600 text-white",
                isDisabled && "opacity-70 cursor-wait",
                !isDisabled && "active:scale-95"
            )}
        >
            {status === "loading" || status === "generating" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === "error" ? (
                <RefreshCw className="w-4 h-4" />
            ) : (
                <Download className="w-4 h-4" />
            )}
            {getMessage()}
        </button>
    );
}
