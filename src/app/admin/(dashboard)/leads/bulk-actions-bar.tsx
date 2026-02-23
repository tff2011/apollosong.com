"use client";

import { Loader2, Trash2, ChevronDown, X, Mail } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/react";

const STATUSES = [
    "PENDING",
    "PAID",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
] as const;

interface BulkActionsBarProps {
    selectedCount: number;
    selectedIds: string[];
    onClearSelection: () => void;
}

export function BulkActionsBar({
    selectedCount,
    selectedIds,
    onClearSelection,
}: BulkActionsBarProps) {
    const utils = api.useUtils();

    const bulkUpdate = api.admin.bulkUpdateStatus.useMutation({
        onSuccess: (data) => {
            alert(`Updated ${data.updatedCount} orders`);
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            onClearSelection();
        },
        onError: (error) => {
            alert(`Error: ${error.message}`);
        },
    });

    const bulkDelete = api.admin.bulkDelete.useMutation({
        onSuccess: (data) => {
            alert(`Deleted ${data.deletedCount} orders`);
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            onClearSelection();
        },
        onError: (error) => {
            alert(`Error: ${error.message}`);
        },
    });

    const bulkSendEmails = api.admin.bulkSendDeliveryEmails.useMutation({
        onSuccess: (data) => {
            const message = `Sent: ${data.successCount}, Errors: ${data.errorCount}, Skipped: ${data.skippedCount}`;
            if (data.errorCount > 0) {
                alert(`${message}\n\nFirst errors:\n${data.errors.join("\n")}`);
            } else {
                alert(message);
            }
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            onClearSelection();
        },
        onError: (error) => {
            alert(`Error: ${error.message}`);
        },
    });

    const handleBulkStatusChange = (status: (typeof STATUSES)[number]) => {
        bulkUpdate.mutate({ ids: selectedIds, status });
    };

    const handleBulkDelete = () => {
        if (
            confirm(
                `Are you sure you want to delete ${selectedCount} orders? This cannot be undone.`
            )
        ) {
            bulkDelete.mutate({ ids: selectedIds });
        }
    };

    const handleBulkSendEmails = () => {
        if (
            confirm(
                `Send delivery emails to ${selectedCount} selected orders?\n\nOnly IN_PROGRESS orders with uploaded songs will receive emails.`
            )
        ) {
            bulkSendEmails.mutate({ ids: selectedIds });
        }
    };

    const isPending = bulkUpdate.isPending || bulkDelete.isPending || bulkSendEmails.isPending;

    return (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-3">
                <span className="font-medium text-amber-900">
                    {selectedCount} selected
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearSelection}
                    className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                </Button>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="default"
                    size="sm"
                    onClick={handleBulkSendEmails}
                    disabled={isPending}
                    className="bg-green-600 hover:bg-green-700"
                >
                    {bulkSendEmails.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                        <Mail className="h-4 w-4 mr-1" />
                    )}
                    Send Delivery Emails
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            className="bg-[#111827]"
                        >
                            {bulkUpdate.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            Change Status
                            <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {STATUSES.map((status) => (
                            <DropdownMenuItem
                                key={status}
                                onClick={() => handleBulkStatusChange(status)}
                            >
                                {status}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={isPending}
                >
                    {bulkDelete.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    Delete
                </Button>
            </div>
        </div>
    );
}
