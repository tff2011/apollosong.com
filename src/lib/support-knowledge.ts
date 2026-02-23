import { db } from "~/server/db";
import type { SupportKnowledgeChannel } from "@prisma/client";

export async function getActiveKnowledge(locale?: string | null, channel: SupportKnowledgeChannel = "BOTH") {
    const entries = await db.supportKnowledge.findMany({
        where: {
            isActive: true,
            locale: { in: locale ? [locale, "all"] : ["all"] },
            channel: { in: [channel, "BOTH"] },
        },
        orderBy: { category: "asc" },
    });

    return entries;
}

export function formatKnowledgeForPrompt(
    entries: Array<{ title: string; content: string; category: string }>
): string {
    if (entries.length === 0) return "";

    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
        const group = grouped.get(entry.category) || [];
        group.push(entry);
        grouped.set(entry.category, group);
    }

    const sections: string[] = [];
    for (const [category, items] of grouped) {
        sections.push(`## ${category}`);
        for (const item of items) {
            sections.push(`### ${item.title}\n${item.content}`);
        }
    }

    return sections.join("\n\n");
}
