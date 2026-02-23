"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic2, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface KaraokeUpsellProps {
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

export function KaraokeUpsell({
  orderId,
  email,
  locale,
  currency,
  recipientName,
  genreLabel,
  t,
}: KaraokeUpsellProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const price = currency === "BRL" ? 4990
    : locale === "es" ? 999
    : currency === "EUR" ? 1900
    : 1990;

  const createKaraokeUpsell = api.songOrder.createKaraokeUpsell.useMutation({
    onSuccess: (data) => {
      router.push(`/${locale}/order/${data.orderId}`);
    },
    onError: (error) => {
      console.error("Failed to create karaoke upsell:", error);
      setIsCreating(false);
    },
  });

  const formatPrice = (cents: number) => {
    const amount = cents / 100;
    if (currency === "BRL") {
      return `R$${amount.toFixed(2).replace(".", ",")}`;
    }
    if (currency === "EUR") {
      return `€${amount.toFixed(2).replace(".", ",")}`;
    }
    return `$${amount.toFixed(2)}`;
  };

  const replaceName = (text: string) =>
    recipientName ? text.replace("{name}", recipientName) : text;
  const title = replaceName(t.title);
  const description = replaceName(t.description);

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
      await createKaraokeUpsell.mutateAsync({
        parentOrderId: orderId,
        email,
      });
    } catch (e) {
      console.error("Failed to create karaoke upsell:", e);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-charcoal/10">
      <div className="bg-gradient-to-br from-rose-50 via-pink-50 to-orange-50 rounded-3xl p-5 sm:p-6 border border-rose-200/60 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center flex-shrink-0 shadow-inner">
            <Mic2 className="w-7 h-7 text-rose-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-rose-900">
              {renderBold(title, "font-extrabold")}
            </h3>
            {genreLabel && (
              <div className="mt-2 inline-flex items-center rounded-full bg-rose-100/70 px-3 py-1 text-sm font-semibold text-rose-800">
                {genreLabel}
              </div>
            )}
            <p className="text-base text-rose-800/80 mt-2">
              {renderBold(description, "font-bold text-rose-900")}
            </p>
          </div>
          <div className="sm:text-right">
            <span className="inline-flex items-center rounded-2xl bg-white/70 px-4 py-2 text-rose-700 shadow-sm text-base font-bold">
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
                ? "bg-rose-400 text-white cursor-not-allowed"
                : "bg-rose-600 hover:bg-rose-700 text-white shadow-md"
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
