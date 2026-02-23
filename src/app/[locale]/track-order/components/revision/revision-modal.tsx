"use client";

import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "~/components/ui/dialog";
import type { TrackOrder } from "../../hooks/use-track-order";

interface RevisionModalProps {
    order: TrackOrder | null;
    email: string;
    locale: string;
    open: boolean;
    onClose: () => void;
    translations: {
        modalTitle: string;
        modalWarning: string;
        modalDescription: string;
        modalFee: string;
        modalCancel: string;
        modalConfirm: string;
    };
}

export function RevisionModal({
    order,
    email,
    locale,
    open,
    onClose,
    translations,
}: RevisionModalProps) {
    const router = useRouter();

    const handleConfirm = () => {
        if (order) {
            router.push(`/${order.locale || locale}/order/${order.id}/revision?email=${encodeURIComponent(email)}`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif text-charcoal sm:text-3xl">
                        {translations.modalTitle}
                    </DialogTitle>
                    <DialogDescription className="text-lg text-charcoal/70 sm:text-xl">
                        {translations.modalDescription}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                        <p className="text-base text-amber-900 sm:text-lg">
                            {translations.modalFee.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                part.startsWith("**") && part.endsWith("**") ? (
                                    <strong key={i} className="font-bold">
                                        {part.slice(2, -2)}
                                    </strong>
                                ) : (
                                    part
                                )
                            )}
                        </p>
                    </div>
                </div>
                <DialogFooter className="flex-col gap-3 sm:flex-row">
                    <button
                        onClick={handleConfirm}
                        className="w-full h-12 rounded-2xl bg-pink-600 text-lg font-semibold text-white hover:bg-pink-700 active:scale-95 transition-all sm:w-auto sm:px-6 sm:h-14 sm:text-xl min-h-[44px]"
                    >
                        {translations.modalConfirm}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full h-12 rounded-2xl border-2 border-charcoal/20 text-lg font-semibold text-charcoal hover:bg-charcoal/5 active:scale-95 transition-all sm:w-auto sm:px-6 sm:h-14 sm:text-xl min-h-[44px]"
                    >
                        {translations.modalCancel}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
