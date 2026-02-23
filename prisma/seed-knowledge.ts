import { PrismaClient, SupportKnowledgeChannel } from "@prisma/client";

const db = new PrismaClient();

const entries = [
    {
        title: "Pricing (USD)",
        content: `- Standard song: $99 USD
- Fast delivery (12h): +$39 USD
- Extra song (different style): +$49 USD
- Genre variant: +$49 USD
- Lyrics PDF (frameable): +$19 USD
- Certificate of authorship: +$19 USD
- Streaming VIP (Spotify/Instagram/TikTok): +$79 USD`,
        category: "Pricing",
        locale: "en",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Pricing (BRL)",
        content: `- Plano Essencial: R$ 97
- Plano Acelerado (48h): R$ 147
- Plano Express (12h): R$ 197
- Musica extra: +R$ 79
- Variante de genero: +R$ 79
- PDF das letras (emoldurar): +R$ 29
- Certificado de autoria: +R$ 29
- Streaming VIP (Spotify/Instagram/TikTok): +R$ 129`,
        category: "Pricing",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Delivery Times",
        content: `- Standard delivery: up to 7 days (usually 2-4 days)
- Fast delivery / Acelerado: up to 48 hours
- Express delivery: up to 12 hours
- The customer receives the song via email with 2 options to choose from
- After payment, lyrics are generated first, then the music is produced`,
        category: "Delivery",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Revision Policy",
        content: `- Customers can request up to 4 revisions
- If the error is ours (pronunciation, wrong name, wrong lyrics): revision is FREE
- If the error is the customer's (forgot info, changed mind): revision costs R$39.90 / $9.90
- Revision types: pronunciation, lyrics error, name error, style change, quality issue
- Each revision generates new song options`,
        category: "Revisions",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Available Genres",
        content: `Universal: Pop, Rock, Classic Rock, Heavy Metal, R&B, Jazz, Blues, Worship/Gospel, Hip-Hop, Funk, Reggae, Lullaby
Brazilian: Sertanejo (Raiz/Universitario/Romantico), Samba, Pagode (Mesa/Romantico/Universitario), Forro (Pe-de-Serra/Universitario/Eletronico), Axe, MPB, Bossa Nova, Funk Carioca/Paulista/Melody, Brega, Tecnobrega, Jovem Guarda, Capoeira
Latin: Salsa, Bachata, Cumbia, Ranchera, Balada, Adoracion
French: Chanson Francaise, Variete
Italian: Napoletana, Lirico, Tarantella`,
        category: "Genres",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "How It Works",
        content: `1. Customer completes a quiz: recipient, genre, vocals, qualities, memories, personal message
2. Customer pays via Stripe (credit card or PIX for Brazil)
3. AI generates personalized lyrics based on the quiz
4. Professional AI music production creates the song
5. Customer receives 2 song options via email
6. Customer can request revisions if needed`,
        category: "Process",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Contact",
        content: `- WhatsApp: +55 61 99579-0193
- Email: support@apollosong.com
- Website: https://apollosong.com`,
        category: "Contact",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Refund Policy",
        content: `- We offer a satisfaction guarantee
- If the customer is not satisfied after revisions, we can discuss a refund
- Refunds are processed through Stripe
- The customer should contact us via email or WhatsApp to request a refund`,
        category: "General",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
];

async function main() {
    console.log("Seeding knowledge base...");

    for (const entry of entries) {
        await db.supportKnowledge.create({
            data: entry,
        });
        console.log(`  Created: ${entry.title} (${entry.locale})`);
    }

    console.log(`Done! ${entries.length} entries created.`);
}

main()
    .catch(console.error)
    .finally(() => db.$disconnect());
