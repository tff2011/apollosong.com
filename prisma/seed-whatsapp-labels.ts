import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const PREDEFINED_LABELS = [
  { slug: "urgente", name: "Urgente", color: "#ef4444", emoji: "\u{1F534}" },
  { slug: "aguardando-cliente", name: "Aguardando Cliente", color: "#eab308", emoji: "\u{1F7E1}" },
  { slug: "resolvido", name: "Resolvido", color: "#22c55e", emoji: "\u{1F7E2}" },
  { slug: "vip-streaming", name: "VIP / Streaming", color: "#3b82f6", emoji: "\u{1F535}" },
  { slug: "pedido-status", name: "Pedido / Status", color: "#22c55e", emoji: "\u{1F7E2}" },
  { slug: "pagamento", name: "Pagamento", color: "#f59e0b", emoji: "\u{1F7E1}" },
  { slug: "revisao", name: "Revisão", color: "#8b5cf6", emoji: "\u{1F7E3}" },
  { slug: "tecnico", name: "Técnico", color: "#64748b", emoji: "\u{1F539}" },
  { slug: "comercial", name: "Comercial", color: "#0ea5e9", emoji: "\u{1F535}" },
  { slug: "follow-up", name: "Follow-up", color: "#a855f7", emoji: "\u{1F7E3}" },
  { slug: "aguardando-capa", name: "Aguardando Capa", color: "#f97316", emoji: "\u{1F7E0}" },
];

async function main() {
  for (const label of PREDEFINED_LABELS) {
    await db.whatsAppLabel.upsert({
      where: { slug: label.slug },
      update: { name: label.name, color: label.color, emoji: label.emoji, isPredefined: true },
      create: { ...label, isPredefined: true },
    });
    console.log(`Upserted label: ${label.name}`);
  }
  console.log("Done seeding WhatsApp labels.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
