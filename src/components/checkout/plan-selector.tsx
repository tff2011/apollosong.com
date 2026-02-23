"use client";

import { useRef } from "react";
import { Clock, Rocket, Zap, Check, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { useTranslations } from "~/i18n/provider";
import type { BRLPlanType } from "~/lib/validations/song-order";

type Plan = {
    id: BRLPlanType;
    icon: React.ReactNode;
    deliveryKey: "7days" | "24h" | "6h";
    priceBRL: number;
    priceUSD: number;
    priceEUR: number;
    popular?: boolean;
    vip?: boolean;
    badge?: string;
};

// Delivery text by locale
const DELIVERY_TEXT = {
    pt: { "7days": "7 dias", "24h": "até 24h", "6h": "até 6h" },
    es: { "7days": "7 días", "24h": "hasta 24h", "6h": "hasta 6h" },
    fr: { "7days": "7 jours", "24h": "sous 24h", "6h": "sous 6h" },
    it: { "7days": "7 giorni", "24h": "entro 24h", "6h": "entro 6h" },
} as const;

const FR_PLAN_PRICES = {
    essencial: 6900,
    express: 9900,
    acelerado: 12900,
} as const;

const PLANS: Plan[] = [
    {
        id: "essencial",
        icon: <Clock className="w-6 h-6" />,
        deliveryKey: "7days",
        priceBRL: 6990,
        priceUSD: 1700, // $17
        priceEUR: 6900, // €69 (IT)
    },
    {
        id: "express",
        icon: <Rocket className="w-6 h-6" />,
        deliveryKey: "24h",
        priceBRL: 9990,
        priceUSD: 2700, // $27
        priceEUR: 9900, // €99 (IT)
        popular: true,
    },
    {
        id: "acelerado",
        icon: <Zap className="w-6 h-6" />,
        deliveryKey: "6h",
        priceBRL: 19990,
        priceUSD: 3700,
        priceEUR: 12900,
        vip: true,
        badge: "⭐ VIP",
    },
];

type PlanSelectorProps = {
    selectedPlan: BRLPlanType;
    onPlanChange: (plan: BRLPlanType) => void;
    onConfirm: () => void;
    isUpdating?: boolean;
    hasExtraSong?: boolean;
    currency?: string;
    locale?: string;
};

export function PlanSelector({
    selectedPlan,
    onPlanChange,
    onConfirm,
    isUpdating = false,
    hasExtraSong = false,
    currency = "BRL",
    locale = "pt",
}: PlanSelectorProps) {
    const t = useTranslations("checkout.plans");
    const isBRL = currency === "BRL";
    const isEUR = currency === "EUR";
    const isFR = locale === "fr";
    const continueButtonRef = useRef<HTMLButtonElement>(null);
    const availablePlans = PLANS;
    const scrollToContinueButton = () => {
        if (typeof window === "undefined") return;
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(() => {
            continueButtonRef.current?.scrollIntoView({
                behavior: prefersReducedMotion ? "auto" : "smooth",
                block: "center",
            });
        }, 120);
    };

    const formatPrice = (cents: number) => {
        const amount = cents / 100;
        if (isBRL) {
            return `R$${amount.toFixed(2).replace(".", ",")}`;
        }
        if (isEUR) {
            return `€${amount.toFixed(2)}`;
        }
        return `$${amount.toFixed(2)} USD`;
    };

    const getPrice = (plan: Plan) => isBRL ? plan.priceBRL : isEUR ? (isFR ? FR_PLAN_PRICES[plan.id] : plan.priceEUR) : plan.priceUSD;
    const getDelivery = (plan: Plan) => {
        const localeKey = locale === "fr" ? "fr" : locale === "es" ? "es" : locale === "it" ? "it" : "pt";
        return DELIVERY_TEXT[localeKey][plan.deliveryKey];
    };
    const renderPlanDescription = (plan: Plan, fallback: string): React.ReactNode => {
        if (!(locale === "pt" && plan.id === "acelerado")) return fallback;
        return (
            <>
                Tudo do Express + <strong className="font-bold text-charcoal">Experiência de Presente</strong> +{" "}
                <strong className="font-bold text-charcoal">Letra em PDF</strong> +{" "}
                <strong className="font-bold text-charcoal">Playback Karaokê</strong>
            </>
        );
    };

    const extraSongPrice = isBRL ? 4990 : 990; // R$49,90 or $9.90
    const selectedPlanData =
        availablePlans.find((p) => p.id === selectedPlan) ??
        availablePlans.find((p) => p.id === "express") ??
        availablePlans[0]!;
    const totalPrice = getPrice(selectedPlanData) + (hasExtraSong ? extraSongPrice : 0);

    return (
        <div className="space-y-6">
            {/* Title */}
            <div className="text-center">
                <h2 className="text-2xl font-serif font-bold text-charcoal">
                    {t("title")}
                </h2>
                <p className="text-charcoal/60 mt-1">{t("subtitle")}</p>
            </div>

            {/* Plan Cards */}
            <div className={cn(
                "grid grid-cols-1 gap-4 max-w-3xl mx-auto",
                "md:grid-cols-3"
            )}>
                {availablePlans.map((plan) => {
                    const isSelected = selectedPlan === plan.id;
                    const planName = t(`${plan.id}.name`);
                    const planDescription = t(`${plan.id}.description`);

                    return (
                        <button
                            key={plan.id}
                            onClick={() => {
                                onPlanChange(plan.id);
                                scrollToContinueButton();
                            }}
                            disabled={isUpdating}
                            className={cn(
                                "relative p-5 rounded-2xl border-2 text-left transition-all",
                                isSelected
                                    ? "border-[#4A8E9A] bg-[#4A8E9A]/5 shadow-lg"
                                    : "border-charcoal/10 bg-white hover:border-charcoal/30",
                                plan.popular && !isSelected && "ring-2 ring-amber-400/50",
                                plan.vip && !isSelected && "ring-2 ring-purple-400/50",
                                isUpdating && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {/* Popular Badge */}
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                                        {t("mostPopular")}
                                    </span>
                                </div>
                            )}
                            {/* VIP Badge */}
                            {plan.vip && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                                        {plan.badge ?? "⭐ VIP"}
                                    </span>
                                </div>
                            )}

                            {/* Content */}
                            <div className="space-y-3 pt-1">
                                {/* Icon & Name */}
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            "p-2 rounded-xl",
                                            isSelected
                                                ? "bg-[#4A8E9A] text-dark"
                                                : "bg-charcoal/5 text-charcoal/70"
                                        )}
                                    >
                                        {plan.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-charcoal">{planName}</h3>
                                        <p className="text-xs text-charcoal/50">
                                            {t("deliveryIn")}{" "}
                                            <strong className="font-bold text-charcoal">{getDelivery(plan)}</strong>
                                        </p>
                                    </div>
                                </div>

                                {/* Price */}
                                <div className="text-2xl font-bold text-charcoal">
                                    {formatPrice(getPrice(plan))}
                                </div>

                                {/* Description */}
                                <p className="text-sm text-charcoal/60">
                                    {renderPlanDescription(plan, planDescription)}
                                </p>

                                {/* Selection Indicator */}
                                <div
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all",
                                        isSelected
                                            ? "bg-[#4A8E9A] text-dark"
                                            : "bg-charcoal/5 text-charcoal/60"
                                    )}
                                >
                                    {isSelected ? (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {t("selected")}
                                        </>
                                    ) : (
                                        t("select")
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Extra Song Notice */}
            {hasExtraSong && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-green-800">
                        {t("extraSongIncluded")} (+{formatPrice(extraSongPrice)})
                    </p>
                </div>
            )}

            {/* Total & Continue Button */}
            <div className="bg-white border border-charcoal/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-charcoal/60">{t("total")}</span>
                    <span className="text-2xl font-bold text-charcoal">
                        {formatPrice(totalPrice)}
                    </span>
                </div>

                <button
                    ref={continueButtonRef}
                    onClick={onConfirm}
                    disabled={isUpdating}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white text-lg font-semibold transition-all shadow-lg",
                        isUpdating
                            ? "bg-[#4A8E9A]/70 cursor-not-allowed"
                            : "bg-[#4A8E9A] hover:bg-[#F0EDE6] active:scale-[0.98]"
                    )}
                >
                    {isUpdating ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t("updating")}
                        </>
                    ) : (
                        t("continueToPayment")
                    )}
                </button>
            </div>
        </div>
    );
}
