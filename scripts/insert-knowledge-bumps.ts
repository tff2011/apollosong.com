import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();

  await db.supportKnowledge.create({
    data: {
      title: "Adicionais do Pedido (Order Bumps)",
      category: "FAQ",
      locale: "pt",
      channel: "BOTH",
      isActive: true,
      content: `O cliente pode ter comprado adicionais junto com a música. São 4 opções:

**1. Entrega Rápida (24h) — R$29,90**
A música é entregue em até 24 horas. Ideal para presentes de última hora.

**2. Experiência de Presente — R$19,90**
Criamos uma página exclusiva na internet só pro homenageado. O cliente recebe um link especial para enviar ao homenageado, que ao abrir descobre que a canção foi feita para ele(a) — com uma animação de abertura de presente. NÃO é um PDF, NÃO é a letra impressa, NÃO é um certificado físico. É uma experiência digital interativa acessível pelo link.
Se o cliente comprou a Experiência de Presente, o link da página aparece nos dados do pedido (certificate link). Forneça esse link ao cliente caso ele pergunte.

**3. PDF da Letra Personalizada — R$19,90**
Um arquivo PDF bonito com a letra da música, pronto para imprimir ou emoldurar como recordação. O cliente pode baixar pelo link de acompanhamento do pedido.

**4. Streaming VIP (Spotify) — R$39,90**
A música é distribuída nas plataformas de streaming (Spotify, Apple Music, Deezer, etc). Após a produção, o link do Spotify é enviado por email.

IMPORTANTE: Quando o cliente perguntar sobre valores adicionais cobrados, verifique nos dados do pedido quais adicionais ele comprou antes de responder. Nunca confunda a Experiência de Presente com o PDF da Letra — são produtos completamente diferentes.`,
    },
  });

  console.log("Knowledge entry created successfully.");
  await db.$disconnect();
}

main();
