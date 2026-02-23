"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface MusicianTipUpsellProps {
    orderId: string;
    email: string;
    locale: string;
    currency: string;
    t: {
        title: string;
        subtitle: string;
        description: string;
        placeholder: string;
        minValue: string;
        maxValue: string;
        button: string;
        processing: string;
        optional: string;
        thankYou: string;
    };
}

export function MusicianTipUpsell({
    orderId,
    email,
    locale,
    currency,
    t,
}: MusicianTipUpsellProps) {
    const router = useRouter();
    const [amount, setAmount] = useState<string>("");
    const [isCreating, setIsCreating] = useState(false);

    // Currency configuration
    const currencyConfig = {
        BRL: { symbol: "R$", min: 10, max: 2950 },
        USD: { symbol: "$", min: 10, max: 2950 },
        EUR: { symbol: "\u20AC", min: 10, max: 2950 },
    }[currency] ?? { symbol: "$", min: 10, max: 2950 };

    const numericAmount = parseFloat(amount) || 0;
    const isBelowMin = amount !== "" && numericAmount < currencyConfig.min;
    const isAboveMax = numericAmount > currencyConfig.max;
    const isValid = numericAmount >= currencyConfig.min && numericAmount <= currencyConfig.max;
    const amountInCents = Math.round(numericAmount * 100);

    const createMusicianTip = api.songOrder.createMusicianTip.useMutation({
        onSuccess: (data) => {
            // Redirect to checkout
            router.push(`/${locale}/order/${data.orderId}`);
        },
        onError: (error) => {
            console.error("Failed to create musician tip:", error);
            setIsCreating(false);
        },
    });

    const handleContribute = async () => {
        if (!isValid) return;
        setIsCreating(true);

        try {
            await createMusicianTip.mutateAsync({
                parentOrderId: orderId,
                email,
                amount: amountInCents,
            });
        } catch (e) {
            console.error("Failed to create musician tip:", e);
        }
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Allow only valid number input
        if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
            setAmount(value);
        }
    };

    return (
        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 rounded-3xl p-5 sm:p-6 border border-orange-200/50 shadow-lg">
            {/* Header */}
            <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-orange-100 flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <Heart className="w-8 h-8 text-rose-500" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-charcoal">
                    {t.title}
                </h3>
                <p className="text-charcoal/70 text-base mt-2">
                    {t.subtitle}
                </p>
            </div>

            {/* Description */}
            <p className="text-charcoal/60 text-center mb-6 leading-relaxed text-base">
                {t.description.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                        <strong key={i} className="font-bold text-charcoal/80">
                            {part.slice(2, -2)}
                        </strong>
                    ) : (
                        part
                    )
                )}
            </p>

            {/* Input */}
            <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/50 font-semibold text-xl">
                    {currencyConfig.symbol}
                </span>
                <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    className={cn(
                        "w-full pl-14 pr-4 py-5 text-3xl font-bold text-center rounded-2xl border-2 transition-colors bg-white focus:outline-none focus:ring-2 focus:ring-orange-300",
                        amount && !isValid
                            ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                            : "border-orange-200 focus:border-orange-400"
                    )}
                    placeholder={t.placeholder}
                />
            </div>

            {/* Value hint / error */}
            <p className={cn(
                "text-center text-base mb-5",
                isBelowMin || isAboveMax ? "text-red-500 font-semibold" : "text-charcoal/60"
            )}>
                {isBelowMin ? t.minValue : isAboveMax ? t.maxValue : `${t.minValue} • ${t.optional}`}
            </p>

            {/* Button */}
            <button
                onClick={handleContribute}
                disabled={!isValid || isCreating}
                className={cn(
                    "w-full py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 active:scale-[0.98]",
                    isValid && !isCreating
                        ? "bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:from-rose-600 hover:to-orange-600 shadow-lg hover:shadow-xl"
                        : "bg-white text-[#1A1A2E]/40 cursor-not-allowed"
                )}
            >
                {isCreating ? (
                    <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        {t.processing}
                    </>
                ) : (
                    <>
                        <Heart className="w-6 h-6" />
                        {t.button}
                    </>
                )}
            </button>
        </div>
    );
}
