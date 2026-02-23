"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, Pencil, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import type { TrackOrder } from "../../hooks/use-track-order";

interface RevisionStatusCardProps {
    order: TrackOrder;
    email: string;
    onSuccess: () => void;
    translations: {
        statusInRevision: string;
        statusDescription: string;
        queuePosition: string;
        queueProcessing: string;
        cancelButton: string;
        cancelConfirmTitle: string;
        cancelConfirmDescription: string;
        cancelConfirmButton: string;
        cancelling: string;
        cancelHelperText: string;
        addNotesButton: string;
        addNotesTitle: string;
        addNotesDescription: string;
        addNotesPlaceholder: string;
        addNotesSend: string;
        addNotesSending: string;
        modalCancel: string;
        existingNotesLabel: string;
        preferredVersionLabel: string;
        melodyPreferenceLabel: string;
        melodyKeepCurrent: string;
        melodySuggestNew: string;
    };
}

export function RevisionStatusCard({
    order,
    email,
    onSuccess,
    translations,
}: RevisionStatusCardProps) {
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [showNotesDialog, setShowNotesDialog] = useState(false);
    const [additionalNotes, setAdditionalNotes] = useState("");

    const cancelMutation = api.songOrder.cancelRevision.useMutation({
        onSuccess: () => {
            setShowCancelConfirm(false);
            onSuccess();
        },
    });

    const appendNotesMutation = api.songOrder.appendRevisionNotes.useMutation({
        onSuccess: () => {
            setShowNotesDialog(false);
            setAdditionalNotes("");
            onSuccess();
        },
    });

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 rounded-xl border-l-4 border-l-amber-500 border border-amber-200/50 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-amber-800">
                            {translations.statusInRevision} #{order.revisionCount}
                        </h3>
                        {order.revisionQueuePosition && (
                            <div className="mt-1 inline-flex items-center gap-2">
                                <span className="text-sm font-semibold text-amber-700">
                                    {order.revisionQueuePosition <= 10
                                        ? translations.queuePosition.replace("{position}", String(order.revisionQueuePosition))
                                        : translations.queueProcessing}
                                </span>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Description */}
                <div className="px-4 pb-4">
                    <p className="text-sm text-amber-800 leading-relaxed">
                        {translations.statusDescription}
                    </p>
                </div>

                {/* Actions */}
                <div className="px-4 py-4 bg-amber-100/50 border-t border-amber-200/50">
                    <p className="text-sm font-medium text-amber-700 mb-3 text-center">
                        {translations.cancelHelperText}
                    </p>
                    <div className="flex flex-col gap-2">
                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => setShowNotesDialog(true)}
                            className="w-full text-sm text-emerald-800 font-bold py-3 px-4 rounded-xl border-2 border-emerald-400 bg-emerald-50 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2 min-h-[48px]"
                        >
                            <Pencil className="w-4 h-4" />
                            {translations.addNotesButton}
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => setShowCancelConfirm(true)}
                            className="w-full text-sm text-amber-800 font-bold py-3 px-4 rounded-xl border-2 border-amber-400 bg-amber-100 hover:bg-amber-200 transition-all flex items-center justify-center min-h-[48px]"
                        >
                            {translations.cancelButton}
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            {/* Cancel Confirmation Dialog */}
            <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <DialogContent className="sm:max-w-lg p-6 sm:p-8">
                    <DialogHeader className="space-y-3">
                        <DialogTitle className="font-serif text-2xl sm:text-3xl text-charcoal">
                            {translations.cancelConfirmTitle}
                        </DialogTitle>
                        <DialogDescription className="text-base sm:text-lg text-charcoal/70 leading-relaxed">
                            {translations.cancelConfirmDescription}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
                        <Button
                            variant="outline"
                            onClick={() => setShowCancelConfirm(false)}
                            disabled={cancelMutation.isPending}
                            className="rounded-2xl text-base font-semibold px-6 py-3 h-auto border-2 min-h-[44px]"
                        >
                            {translations.modalCancel}
                        </Button>
                        <Button
                            onClick={() => cancelMutation.mutate({ orderId: order.id, email })}
                            disabled={cancelMutation.isPending}
                            className="bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-base font-semibold px-6 py-3 h-auto min-h-[44px]"
                        >
                            {cancelMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    {translations.cancelling}
                                </>
                            ) : (
                                translations.cancelConfirmButton
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Notes Dialog */}
            <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
                <DialogContent className="sm:max-w-lg p-6 sm:p-8 max-h-[90vh] overflow-y-auto overflow-x-hidden">
                    <DialogHeader className="space-y-3">
                        <DialogTitle className="font-serif text-2xl sm:text-3xl text-charcoal">
                            {translations.addNotesTitle}
                        </DialogTitle>
                        <DialogDescription className="text-base sm:text-lg text-charcoal/70 leading-relaxed">
                            {translations.addNotesDescription}
                        </DialogDescription>
                    </DialogHeader>

                    {order.revisionNotes && (
                        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 max-w-full overflow-x-hidden">
                            <p className="text-sm font-semibold text-amber-800 mb-2">
                                {translations.existingNotesLabel}
                            </p>
                            {order.melodyPreference && (
                                <p className="text-sm text-amber-900 mb-2">
                                    <span className="font-semibold">{translations.melodyPreferenceLabel}:</span>{" "}
                                    {order.melodyPreference === "KEEP_CURRENT"
                                        ? translations.melodyKeepCurrent
                                        : translations.melodySuggestNew}
                                </p>
                            )}
                            <p className="text-sm text-amber-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                {order.revisionNotes}
                            </p>
                        </div>
                    )}

                    <div className="mt-4">
                        <textarea
                            value={additionalNotes}
                            onChange={(e) => setAdditionalNotes(e.target.value)}
                            placeholder={translations.addNotesPlaceholder}
                            rows={4}
                            className="w-full rounded-xl border-2 border-charcoal/20 focus:border-emerald-500 focus:ring-emerald-500 p-4 text-base resize-none"
                        />
                    </div>
                    <DialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
                        <Button
                            variant="outline"
                            onClick={() => setShowNotesDialog(false)}
                            disabled={appendNotesMutation.isPending}
                            className="rounded-2xl text-base font-semibold px-6 py-3 h-auto border-2 min-h-[44px]"
                        >
                            {translations.modalCancel}
                        </Button>
                        <Button
                            onClick={() => appendNotesMutation.mutate({
                                orderId: order.id,
                                email,
                                additionalNotes: additionalNotes.trim(),
                            })}
                            disabled={appendNotesMutation.isPending || !additionalNotes.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-base font-semibold px-6 py-3 h-auto min-h-[44px]"
                        >
                            {appendNotesMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    {translations.addNotesSending}
                                </>
                            ) : (
                                translations.addNotesSend
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
