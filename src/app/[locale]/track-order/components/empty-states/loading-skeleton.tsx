"use client";

import { motion } from "framer-motion";

export function LoadingSkeleton() {
    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-3xl shadow-lg border border-charcoal/10 overflow-hidden">
                <div className="p-6 space-y-5">
                    {/* Status Hero Skeleton */}
                    <div className="rounded-3xl p-6 bg-slate-100 animate-pulse">
                        <div className="flex flex-col items-center gap-4">
                            <div className="h-12 w-48 bg-slate-200 rounded-2xl" />
                            <div className="h-6 w-64 bg-slate-200 rounded-lg" />
                            <div className="h-4 w-40 bg-slate-200 rounded" />
                        </div>
                    </div>

                    {/* Timeline Skeleton */}
                    <div className="py-4">
                        <div className="flex justify-between px-8">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex flex-col items-center gap-2">
                                    <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse" />
                                    <div className="w-16 h-3 bg-slate-200 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Badges Skeleton */}
                    <div className="flex flex-wrap justify-center gap-2">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-8 w-24 bg-slate-200 rounded-full animate-pulse"
                            />
                        ))}
                    </div>

                    {/* Action Card Skeleton */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-slate-200 rounded-full animate-pulse" />
                            <div className="flex-1 space-y-2">
                                <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
                                <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
                            </div>
                        </div>
                    </div>

                    {/* Accordion Skeleton */}
                    <div className="space-y-3">
                        {[1, 2].map((i) => (
                            <div
                                key={i}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
                                        <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
