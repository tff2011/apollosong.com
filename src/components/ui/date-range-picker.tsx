"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "~/components/ui/popover";

interface DateRangePickerProps {
    from: Date | undefined;
    to: Date | undefined;
    onSelect: (range: DateRange | undefined) => void;
    className?: string;
    placeholder?: string;
}

export function DateRangePicker({
    from,
    to,
    onSelect,
    className,
    placeholder = "Pick a date range",
}: DateRangePickerProps) {
    const [open, setOpen] = React.useState(false);

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(undefined);
    };

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant="outline"
                        className={cn(
                            "w-[260px] justify-start text-left font-normal",
                            !from && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {from ? (
                            to ? (
                                <>
                                    {format(from, "LLL dd")} - {format(to, "LLL dd, y")}
                                </>
                            ) : (
                                format(from, "LLL dd, y")
                            )
                        ) : (
                            <span>{placeholder}</span>
                        )}
                        {(from || to) && (
                            <X
                                className="ml-auto h-4 w-4 text-muted-foreground hover:text-foreground"
                                onClick={handleClear}
                            />
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={from}
                        selected={{ from, to }}
                        onSelect={(range) => {
                            onSelect(range);
                            if (range?.from && range?.to) {
                                setOpen(false);
                            }
                        }}
                        numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
