"use client";

import { motion } from "framer-motion";
import { Music, Headphones, Gift } from "lucide-react";
import { cn } from "~/lib/utils";

export type TabId = "orders" | "listen" | "extras" | "help";

// WhatsApp icon component
function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}

interface BottomTabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    ordersCount?: number;
    hasUpsells?: boolean;
    hasCompletedOrder?: boolean;
    whatsAppMessage?: string;
    customerEmail?: string;
    translations: {
        orders: string;
        listen: string;
        extras: string;
        help: string;
    };
}

const TABS = [
    { id: "orders" as const, icon: Music },
    { id: "listen" as const, icon: Headphones },
    { id: "extras" as const, icon: Gift },
];

const WHATSAPP_NUMBER = "5561995790193";

export function BottomTabBar({
    activeTab,
    onTabChange,
    ordersCount = 0,
    hasUpsells = false,
    hasCompletedOrder = false,
    whatsAppMessage = "Olá! Preciso de ajuda com meu pedido de música personalizada.",
    customerEmail,
    translations,
}: BottomTabBarProps) {
    const ordersBadgeText = ordersCount > 99 ? "99+" : String(ordersCount);
    const fullMessage = customerEmail
        ? `${whatsAppMessage}\n\nEmail: ${customerEmail}`
        : whatsAppMessage;
    const whatsAppUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(fullMessage)}`;

    return (
        <nav className="fixed bottom-0 inset-x-0 bg-[#2D2D2D] pb-[env(safe-area-inset-bottom)] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-around h-16">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const isDisabled = tab.id === "listen" && !hasCompletedOrder;
                    const label = translations[tab.id];

                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                if (isDisabled) return;
                                // Scroll to top when switching to listen or extras tabs
                                if (tab.id === "listen" || tab.id === "extras") {
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }
                                onTabChange(tab.id);
                            }}
                            disabled={isDisabled}
                            className={cn(
                                "relative flex flex-col items-center gap-1 px-4 py-2 min-w-[64px] min-h-[44px] transition-colors",
                                isActive
                                    ? "text-[#A0845E]"
                                    : isDisabled
                                        ? "text-white/20 cursor-not-allowed"
                                        : "text-white/60 hover:text-white/80"
                            )}
                        >
                            <div className="relative">
                                <tab.icon className="w-7 h-7" />
                                {/* Numeric badge for orders */}
                                {tab.id === "orders" && ordersCount > 0 && (
                                    <motion.span
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-[#4A8E9A] text-dark text-[10px] font-bold leading-none flex items-center justify-center border border-[#2D2D2D]"
                                        aria-label={`${ordersCount} orders`}
                                    >
                                        {ordersBadgeText}
                                    </motion.span>
                                )}
                                {/* Badge for upsells */}
                                {tab.id === "extras" && hasUpsells && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-[#2D2D2D]"
                                    />
                                )}
                            </div>
                            <span className="text-xs font-semibold">{label}</span>
                            {/* Active indicator */}
                            {isActive && (
                                <motion.div
                                    layoutId="tab-indicator"
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-[#A0845E] rounded-full"
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            )}
                        </button>
                    );
                })}

                {/* WhatsApp Help Button - Forces WhatsApp app on in-app browsers */}
                <button
                    onClick={() => {
                        const userAgent = navigator.userAgent;
                        const isAndroid = /Android/i.test(userAgent);
                        const isInAppBrowser = /Instagram|FBAN|FBAV|Twitter|Line|Snapchat|TikTok/i.test(userAgent);

                        if (isAndroid && isInAppBrowser) {
                            // Android in-app: use intent to open WhatsApp app directly
                            const intentUrl = `intent://send/?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(fullMessage)}#Intent;scheme=whatsapp;package=com.whatsapp;end`;
                            window.location.href = intentUrl;
                        } else {
                            // iOS in-app, regular browsers: window.open works better than target="_blank"
                            window.open(whatsAppUrl, "_blank", "noopener,noreferrer");
                        }
                    }}
                    className="relative flex flex-col items-center gap-1 px-4 py-2 min-w-[64px] min-h-[44px] transition-colors text-[#25D366] hover:text-[#5BF78F]"
                >
                    <WhatsAppIcon className="w-7 h-7" />
                    <span className="text-xs font-semibold">{translations.help}</span>
                </button>
            </div>
        </nav>
    );
}
