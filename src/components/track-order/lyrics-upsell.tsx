"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface LyricsUpsellProps {
    orderId: string;
    email: string;
    locale: string;
    currency: string;
    recipientName?: string;
    genreLabel?: string;
    t: {
        title: string;
        description: string;
        price: string;
        buyNow: string;
        adding: string;
    };
}

export function LyricsUpsell({
    orderId,
    email,
    locale,
    currency,
    recipientName,
    genreLabel,
    t,
}: LyricsUpsellProps) {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);

    // Price for lyrics upsell (different from checkout price)
    const price = currency === "BRL" ? 1990 : 990; // R$19,90 / $9.90

    const createLyricsUpsell = api.songOrder.createLyricsUpsell.useMutation({
        onSuccess: (data) => {
            // Redirect to checkout
            router.push(`/${locale}/order/${data.orderId}`);
        },
        onError: (error) => {
            console.error("Failed to create lyrics upsell:", error);
            setIsCreating(false);
        },
    });

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (currency === "BRL") {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        return `$${amount.toFixed(2)}`;
    };

    const replaceName = (text: string) =>
        recipientName ? text.replace("{name}", recipientName) : text;
    const title = replaceName(t.title);
    const description = replaceName(t.description);

    // Render markdown bold (**text**) as <strong>
    const renderBold = (text: string, className?: string) =>
        text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
                <strong key={i} className={className}>
                    {part.slice(2, -2)}
                </strong>
            ) : (
                part
            )
        );

    const handleBuyNow = async () => {
        setIsCreating(true);

        try {
            await createLyricsUpsell.mutateAsync({
                parentOrderId: orderId,
                email,
            });
        } catch (e) {
            console.error("Failed to create lyrics upsell:", e);
        }
    };

    return (
        <div className="mt-6 pt-6 border-t border-charcoal/10">
            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 rounded-3xl p-5 sm:p-6 border border-amber-200/60 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                        <FileText className="w-7 h-7 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-amber-900">
                            {renderBold(title, "font-extrabold")}
                        </h3>
                        {genreLabel && (
                            <div className="mt-2 inline-flex items-center rounded-full bg-amber-100/70 px-3 py-1 text-sm font-semibold text-amber-800">
                                {genreLabel}
                            </div>
                        )}
                        <p className="text-base text-amber-800/80 mt-2">
                            {renderBold(description, "font-bold text-amber-900")}
                        </p>
                    </div>
                    <div className="sm:text-right">
                        <span className="inline-flex items-center rounded-2xl bg-white/70 px-4 py-2 text-amber-700 shadow-sm text-base font-bold">
                            {formatPrice(price)}
                        </span>
                    </div>
                </div>

                {/* Buy button */}
                <div className="mt-5 flex justify-end">
                    <button
                        onClick={handleBuyNow}
                        disabled={isCreating}
                        className={cn(
                            "px-5 py-3 rounded-2xl text-base font-bold transition-all",
                            isCreating
                                ? "bg-amber-400 text-white cursor-not-allowed"
                                : "bg-amber-600 hover:bg-amber-700 text-white shadow-md"
                        )}
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                                {t.adding}
                            </>
                        ) : (
                            t.buyNow
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
