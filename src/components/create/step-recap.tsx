"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Edit2 } from "lucide-react";

type StepRecapProps = {
    label: string;
    value: string;
    savedText: string;
    onEdit: () => void;
};

export function StepRecap({ label, value, savedText, onEdit }: StepRecapProps) {
    if (!value) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-green-50/80 border border-green-200/60 rounded-xl p-4 mb-6 flex items-start gap-4 shadow-sm"
        >
            <div className="bg-green-100 p-2 rounded-full flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                    {label}
                    <span className="text-[10px] font-normal uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {savedText}
                    </span>
                </p>
                <div className="relative">
                    <p className="text-sm text-green-700/90 line-clamp-2 leading-relaxed italic">
                        "{value}"
                    </p>
                </div>
            </div>
            <button
                onClick={onEdit}
                className="group flex-shrink-0 flex flex-col items-center gap-1 text-green-700 hover:text-green-900 transition-colors pt-1"
            >
                <div className="p-2 rounded-lg group-hover:bg-green-100 transition-colors">
                    <Edit2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity -mt-1">
                    Edit
                </span>
            </button>
        </motion.div>
    );
}
