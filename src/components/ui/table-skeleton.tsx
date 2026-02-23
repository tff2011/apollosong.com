"use client";

import { Skeleton } from "~/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";

interface TableSkeletonProps {
    rows?: number;
    columns?: number;
    showCheckbox?: boolean;
}

export function TableSkeleton({
    rows = 10,
    columns = 6,
    showCheckbox = true,
}: TableSkeletonProps) {
    const totalColumns = showCheckbox ? columns + 1 : columns;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {showCheckbox && (
                        <TableHead className="w-[40px]">
                            <Skeleton className="h-4 w-4" />
                        </TableHead>
                    )}
                    {Array.from({ length: columns }).map((_, i) => (
                        <TableHead key={i}>
                            <Skeleton className="h-4 w-20" />
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                        {showCheckbox && (
                            <TableCell>
                                <Skeleton className="h-4 w-4" />
                            </TableCell>
                        )}
                        {Array.from({ length: columns }).map((_, colIndex) => (
                            <TableCell key={colIndex}>
                                <Skeleton
                                    className={`h-4 ${
                                        colIndex === 0 ? "w-16" : colIndex === columns - 1 ? "w-8" : "w-24"
                                    }`}
                                />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
