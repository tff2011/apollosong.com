/**
 * Seed the SupportKnowledge table with the detailed Apollo Song knowledge base.
 * Safe to run multiple times - deletes all existing entries and recreates.
 *
 * Usage:
 *   npx tsx prisma/seed-knowledge-v2.ts
 */
import "dotenv/config";
import { PrismaClient, SupportKnowledgeChannel } from "@prisma/client";

const db = new PrismaClient();

const entries: Array<{ title: string; content: string; category: string; locale: string; channel: SupportKnowledgeChannel }> = [
    // ============ LINKS IMPORTANTES ============
    {
        title: "Links Importantes",
        content: `- Site para solicitar nova música (PT): https://apollosong.com/pt
- Site para solicitar nova música (EN): https://apollosong.com
- Link de RASTREAMENTO: use SEMPRE o link fornecido nas instruções do sistema (já inclui o idioma correto). NUNCA copie links de rastreamento deste documento.`,
        category: "Links",
        locale: "all",
        channel: SupportKnowledgeChannel.WHATSAPP,
    },
    {
        title: "Links Importantes",
        content: `- Site para solicitar nova música (PT): https://apollosong.com/pt
- Site para solicitar nova música (EN): https://apollosong.com
- Link de RASTREAMENTO do pedido (PT): https://www.apollosong.com/pt/track-order
- Link de RASTREAMENTO do pedido (EN): https://www.apollosong.com/track-order
- Para rastrear com email do cliente: https://www.apollosong.com/pt/track-order?email=EMAIL_DO_CLIENTE`,
        category: "Links",
        locale: "all",
        channel: SupportKnowledgeChannel.EMAIL,
    },
    {
        title: "Redes Sociais",
        content: `- Instagram: https://www.instagram.com/cancaodivinabr/
- TikTok: https://tiktok.com/@cancao.divina
- Youtube: https://www.youtube.com/@ApolloSongOfficial`,
        category: "Links",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },

    // ============ FUNIL DE VENDAS ============
    {
        title: "Cliente já comprou mas ainda NÃO recebeu a música",
        content: `- Perguntar o e-mail de compra e fornecer o LINK DE ACOMPANHAMENTO (use o link fornecido nas instruções do sistema + ?email=EMAIL_DO_CLIENTE).
- Se ele não consegue ouvir ou baixar a MP3: ver entrada "Cliente não consegue baixar ou ouvir a música".
- Se quiser comprar outra música para outra pessoa: fornecer link da página inicial.
- Se quiser outra música para a MESMA pessoa (mudar gênero): pode comprar pelo link de acompanhamento, instruir a descer a página até o card TURBINE A MÚSICA na cor ROXA.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Cliente acabou de comprar e esqueceu de adicionar algo",
        content: `- Instruir a clicar no botão LARANJA "EDITAR INFORMAÇÕES" dentro do link de acompanhamento.
- Neste botão ele insere máximo de detalhes: datas, locais, memórias, viagens marcantes.
- Quanto mais informações melhor fica a letra, não tem limite de palavras.
- Incentive com pelo menos 5 perguntas úteis para estimular a contar a história do homenageado.
- Se ele não achar o botão laranja (música já em criação): dizer que ainda é possível mas vai atrasar 1 dia, e passar pro supervisor humano resolver.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Cliente precisa de ajuda com pedido de música personalizada",
        content: `- Enviar o link de acompanhamento.
- Instruir que nesse link ele vai ouvir as músicas quando prontas.
- Pode editar informações para adicionar algo que faltou.
- Induzir a revisar tudo: datas, nomes, para que a música fique perfeita e evite revisões futuras.
- Quanto mais informações fornecer, melhor. Peça para fazer com calma.
- Se não forneceu email, pedir email de compra.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Cliente recebeu a música e veio agradecer",
        content: `- Agradecer e perguntar se ele tem vídeo filmado do homenageado.
- Se quiser nos enviar, ficamos muito gratos. Perguntar se podemos compartilhar nas redes sociais.
- SEMPRE oferecer o serviço VIP de Streaming (Spotify + todas as plataformas):
  - Valores: R$197,00 para uma música ou R$344,00 para duas músicas.
  - Prazo: 1 a 4 dias corridos após envio de todas as informações.
  - Plataformas: Spotify, Apple Music, Deezer, TikTok, Instagram, YouTube Music, YouTube, Amazon Music, WhatsApp e +150 outras. INCLUI redes sociais.
  - Qualquer pergunta diferente desses valores: passar pro humano negociar.
  - Onde comprar: pelo link de acompanhamento, clicar no botão "LANÇAR NO SPOTIFY" no Player de Música, depois "Continuar para Pagamento".
- Após oferecer o VIP, enviar link do Instagram e pedir para seguir de forma simpática.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Cliente recebeu a música mas quer alterar algo (revisão)",
        content: `- Deve obrigatoriamente preencher o formulário de revisão no LINK DE ACOMPANHAMENTO.
- Instruir a clicar em "Revisão" no player que toca a música, preencher o formulário e clicar em Enviar.
- Se o cliente não conseguir, passar pro humano ajudar.
- Se for erro NOSSO: 100% grátis.
- Se for erro do CLIENTE: taxa de R$39,90, só paga após a revisão ficar 100% do jeito que ele quer.
- Se não concordar com a taxa: passar pro humano resolver.
- Se insistir em enviar informações por email/WhatsApp ao invés do form: instruir novamente a preencher no site.
- Prazo: 24h até 48h no máximo.
- Se tiver urgência e precisar antes: passar pro humano resolver.
- Se recebeu a música de OUTRA pessoa: passar IMEDIATAMENTE pro humano resolver.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Cliente comprou o serviço VIP do Spotify",
        content: `- Avisar que nas próximas 24h nossa equipe vai entrar em contato para sugerir a Capa da música e fornecer mais informações.
- Passar pro humano atender.
- Prazo de publicação nas plataformas: 1 a 4 dias corridos após o envio de todas as informações necessárias (foto, nome, versão).
- A música vai para TODAS as plataformas: Spotify, Apple Music, Deezer, TikTok, Instagram, YouTube Music, YouTube, Amazon Music, WhatsApp e +150 outras. SIM, inclui redes sociais.
- Tempo que a música fica nas plataformas: PARA SEMPRE (indeterminado), em todas as plataformas.
- Se deu erro no pagamento: passar pro humano ajudar.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Cliente ainda NÃO comprou",
        content: `- Explicar como funciona:
  "A Apollo Song da Apollo Song não é uma música pronta. Cada canção é escrita do zero, a partir da história que você nos conta. Por isso toca tão fundo o coração de quem recebe."
- Processo todo feito pelo site (use o link do sistema com o idioma correto).
- Link de acompanhamento: use SEMPRE o link fornecido nas instruções do sistema (já inclui o idioma correto).
- Planos: R$69,90 (entrega em até 7 dias) ou R$99,90 (entrega em 24h).
- Se já comprou: pedir email.
- Se quer mais informações: enviar link do site.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },

    // ============ PERGUNTAS FREQUENTES ============
    {
        title: "Como a canção é criada e o que a torna única?",
        content: `Diferente de presentes genéricos, cada Apollo Song nasce da história do cliente. Letristas e produtores profissionais transformam sentimentos em versos e melodias com qualidade de rádio. É um processo artesanal feito com amor para garantir uma memória eterna e emocionante.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Para quais ocasiões fazem músicas?",
        content: `Praticamente qualquer ocasião especial: Aniversários, Casamentos, Chá Revelação, Chá de Bebê/Fraldas, Chá de Casa Nova, Bodas (prata/ouro/diamante), Dia das Mães/Pais, Formaturas, Aposentadorias, Homenagens Póstumas (in memoriam), Pedidos de Casamento, Batizados, Eventos Religiosos, Reconciliações, Pedidos de Perdão, Superação de Doenças, Agradecimentos e muito mais. Se vem do coração, transformamos em música!`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Fazem músicas para empresas?",
        content: `Sim! Criamos jingles, músicas para campanhas publicitárias, hinos de empresas, trilhas para vídeos institucionais, músicas para eventos corporativos (convenções, confraternizações, premiações) e presentes para colaboradores ou clientes. Podemos fazer um orçamento personalizado — basta nos informar os detalhes.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Posso homenagear casais, famílias ou mais de uma pessoa?",
        content: `Sim! Pode criar canções para casais, irmãos, amigos ou grupos. Com a opção Dupla Emoção (+R$49,90), pode criar uma segunda música personalizada — seja para a mesma pessoa com história diferente, ou para outra pessoa especial. Selecionar essa opção no checkout.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Posso escolher o estilo musical?",
        content: `Sim! Temos mais de 50 estilos musicais. O cliente escolhe o gênero no quiz do site. Veja todos:

🎵 SERTANEJO
- Sertanejo (padrão)
- Sertanejo Raiz (modão de viola)
- Sertanejo Universitário (moderno, rádio)
- Sertanejo Romântico (lento, emocional)

🎵 MPB
- MPB Clássica / Canção Brasileira (poética, violão e piano)
- Bossa Nova Clássica (jazz brasileiro, intimista)
- Pop MPB (radiofônica, refrão marcante)
- MPB Intimista / Folk-Pop Brasileiro (acústico, suave)

🎵 PAGODE
- Pagode (padrão)
- Pagode de Mesa / Raiz (roda tradicional)
- Pagode Romântico (anos 90, polido)
- Pagode Universitário / Novo Pagode (moderno)

🎵 FORRÓ
- Forró (padrão)
- Forró Pé-de-Serra Dançante (tradicional, animado)
- Forró Pé-de-Serra Lento (contemplativo, nostálgico)
- Forró Universitário (acústico, romântico)
- Forró Eletrônico (teclado, synths, festa)

🎵 FUNK
- Funk Carioca (baile funk, Rio de Janeiro)
- Funk Paulista (mandelão, 150 BPM)
- Funk Melody (melódico, romântico)

🎵 SAMBA
- Samba (percussão, festivo)

🎵 BREGA
- Brega (romântico popular, norte do Brasil)
- Brega Romântico (emocional, sentimental)
- Tecnobrega (eletrônico, dançante, Pará)

🎵 GOSPEL / WORSHIP
- Gospel / Worship (louvor, espiritual, inspiracional)

🎵 ROCK
- Rock (guitarra, energético)
- Rock Clássico (vintage, riffs icônicos)
- Heavy Metal (guitarras distorcidas, intenso)

🎵 POP
- Pop (moderno, melodia cativante)

🎵 AXÉ
- Axé (carnaval baiano, alta energia, percussão)

🎵 CAPOEIRA
- Capoeira (berimbau, atabaque, roda)

🎵 JOVEM GUARDA
- Jovem Guarda (rock anos 60 brasileiro, nostálgico)

🎵 MÚSICA PARA CRIANÇAS
- Ninar (suave, calmante, acústico)
- Infantil Animada (alegre, divertida, dançante)

🎵 JAZZ
- Jazz (swing, big band, saxofone)

🎵 BLUES
- Blues (clássico americano, soulful)
- Blues Melancólico (lento, tom menor)
- Blues Animado (shuffle, feel-good)

🎵 R&B / SOUL
- R&B (groove, vocais suaves)

🎵 HIP-HOP / RAP
- Hip-Hop (batida urbana, flow rítmico)

🎵 REGGAE
- Reggae (vibes relaxadas, ritmo offbeat)

🎵 ELETRÔNICA
- Eletrônica (synths, pads, groove moderno)
- Afro House (percussão africana, espiritual)
- Progressive House (uplifting, pop house)
- Melodic Techno (cinematográfico, futurista)

🎵 MÚSICA CLÁSSICA
- Música Clássica / Ópera (orquestra sinfônica, bel canto)

🎵 VALSA
- Valsa (3/4, piano, cordas, romântica)

🎵 MÚSICA LATINA
- Salsa (ritmo latino, metais, dançante)
- Bachata (guitarra romântica, intimista)
- Merengue (rápido, festivo, alegre)
- Tango (bandoneón, dramático, Buenos Aires)
- Música Latina (groove rítmico, percussão)

O cliente escolhe o gênero durante o quiz no site. Se já comprou e quer trocar: pode editar no link de acompanhamento (se ainda não recebeu) ou pagar taxa de R$49,90 por gênero adicional (se já recebeu).`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Quanto custa e em quanto tempo recebo?",
        content: `- Plano Essencial: R$69,90 (entrega em até 7 dias)
- Plano Express VIP: R$99,90 (entrega em até 24h + suporte prioritário)
Ambas entregam música completa, profissional e personalizada.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Como recebo a música?",
        content: `A música chega por e-mail como presente digital em MP3. O cliente recebe um link eterno para ouvir e compartilhar. Pode tocar em festas, casamentos, cultos ou reuniões familiares — a música é dele para sempre. Avisamos por e-mail quando estiver pronto.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Posso colocar no Spotify?",
        content: `Sim! Serviço Distribuição Streaming VIP por R$197,00 (disponível após a música pronta). Prazo de publicação: 1 a 4 dias corridos após envio de todas as informações (foto, nome da música, versão preferida). Fica no Spotify, Apple Music, Deezer, TikTok, Instagram, YouTube Music, YouTube, Amazon Music, WhatsApp e +150 plataformas. SIM, inclui redes sociais (Instagram, TikTok, YouTube). A música fica PARA SEMPRE nas plataformas, em nome do cliente! Para 2 músicas: R$344,00.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Dá pra colocar a voz do cliente na música?",
        content: `Não. Ainda não oferecemos este serviço, num futuro breve sim.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Como baixar o PDF da Letra para emoldurar?",
        content: `ATENÇÃO: O PDF da letra é um produto PAGO à parte (R$19,90). NÃO está incluído no pedido da música.
- Se o cliente JÁ COMPROU o PDF: está disponível no link de acompanhamento.
- Se o cliente NÃO comprou o PDF: instruir a comprar pelo link de acompanhamento, descendo a página até o final no card LARANJA, valor R$19,90.
- NUNCA diga ao cliente que ele vai "encontrar a letra" ou "visualizar a letra" se ele não comprou o PDF. A letra só fica disponível para quem comprou.
- Se comprou PDF + VIP Spotify: dentro do PDF da letra vai aparecer um QRCODE com link da música para escanear e ouvir.
- Se não conseguir comprar: passar pro humano resolver.
- VERIFIQUE nos dados do pedido se o campo "lyricsPdf" está true antes de dizer que ele já tem a letra.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "E se o cliente não gostar da letra ou melodia?",
        content: `Reescrevemos e refazemos a letra e melodia até ele ficar 100% satisfeito, sem custos extras.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Dá pra alterar o gênero musical?",
        content: `- Se ainda não recebeu: sim, sem custo. Entrar no link de acompanhamento e clicar em "Editar Pedido". Se não conseguir, chamar humano.
- Se já recebeu: taxa de R$49,90 por gênero adicional. Solicitar no link de acompanhamento. Se não conseguir, passar pro humano.`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Como assistir vídeos de homenagens?",
        content: `Pelo canal do YouTube: https://www.youtube.com/@ApolloSongOfficial
Ou TikTok: https://tiktok.com/@cancao.divina
Ou Instagram: https://www.instagram.com/cancaodivinabr/`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },

    {
        title: "Cliente não consegue baixar ou ouvir a música",
        content: `Passo a passo para ajudar:
1. Enviar o link de acompanhamento (use o link fornecido nas instruções do sistema + ?email=EMAIL_DO_CLIENTE).
2. Instruir a clicar no botão PLAY no player para ouvir a música.
3. Para baixar o MP3: clicar no botão "Baixar MP3" que fica logo abaixo do player.
4. Se estiver no celular e o download não funciona: tentar abrir o link pelo navegador (Chrome ou Safari) em vez de clicar direto no app de email.
5. Se mesmo assim não funcionar: tentar por um computador/notebook.
6. Se nada funcionar: transferir para atendente humano usando [ESCALATE].`,
        category: "FAQ",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },

    // ============ PRICING (updated) ============
    {
        title: "Preços (BRL)",
        content: `- Plano Essencial: R$69,90 (entrega em até 7 dias)
- Plano Express VIP: R$99,90 (entrega em até 24h)
- Dupla Emoção (2a música): +R$49,90
- Gênero adicional: +R$49,90
- PDF das letras (emoldurar): +R$19,90
- Revisão (erro do cliente): R$39,90
- Streaming VIP (1 música): R$197,00
- Streaming VIP (2 músicas): R$344,00`,
        category: "Preços",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Pricing (USD)",
        content: `- Standard song: $99 USD (delivery in up to 7 days)
- Express VIP: $139 USD (delivery in 24h)
- Extra song (different style): +$49 USD
- Genre variant: +$49 USD
- Lyrics PDF (frameable): +$19 USD
- Revision (customer's fault): $9.90 USD
- Streaming VIP (Spotify etc): +$79 USD`,
        category: "Pricing",
        locale: "en",
        channel: SupportKnowledgeChannel.BOTH,
    },

    // ============ GENERAL ============
    {
        title: "Política de Revisões",
        content: `- Clientes podem solicitar revisões pelo link de acompanhamento.
- Erro nosso (pronúncia, nome errado, letra errada): revisão 100% GRÁTIS.
- Erro do cliente (esqueceu info, mudou de ideia): revisão custa R$39,90, paga só após aprovar.
- Prazo de revisão: 24h a 48h.
- Se não concordar com a taxa: passar pro humano.
- Urgência (precisa antes de 24h): passar pro humano.`,
        category: "Políticas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Política de Reembolso",
        content: `- Oferecemos garantia de satisfação.
- Se o cliente não ficar satisfeito após revisões, podemos discutir reembolso.
- Reembolsos processados via Stripe.
- Deve entrar em contato para solicitar.`,
        category: "Políticas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Contato (Email)",
        content: `- WhatsApp: +55 61 99579-0193
- Email: support@apollosong.com
- Site: https://apollosong.com`,
        category: "Contato",
        locale: "all",
        channel: SupportKnowledgeChannel.EMAIL,
    },
    {
        title: "Contato (WhatsApp)",
        content: `- Email: support@apollosong.com
- Site: https://apollosong.com
NUNCA forneça número de telefone ou WhatsApp ao cliente — ele JÁ está falando pelo WhatsApp. Se precisar escalar, use [ESCALATE].`,
        category: "Contato",
        locale: "all",
        channel: SupportKnowledgeChannel.WHATSAPP,
    },
    {
        title: "Cliente quer alterar o email do pedido",
        content: `IMPORTANTE: Esta regra SÓ se aplica se o cliente TEM pedido no ORDER CONTEXT. Se "No orders found", use a regra "Pedido não encontrado no sistema".

Quando o cliente TEM pedido e quer trocar o email:
- SEMPRE perguntar qual é o NOVO email que ele deseja usar.
- Não passar pro humano sem antes coletar o novo email.
- Depois de obter o novo email: passar pro humano resolver a troca.
- Se o cliente quiser alterar outros dados (nome, telefone, etc): perguntar os dados novos antes de passar pro humano.
- REGRA: antes de escalar pro supervisor, SEMPRE colete todas as informações necessárias do cliente para que o supervisor possa resolver sem precisar perguntar de novo.`,
        category: "Funil de Vendas",
        locale: "pt",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Regra de Coleta de Informações antes de Escalar",
        content: `IMPORTANTE: Antes de passar qualquer caso para o supervisor humano, SEMPRE colete todas as informações necessárias do cliente:
- Se quer trocar email: perguntar o novo email.
- Se quer trocar dados: perguntar os novos dados.
- Se tem problema com pagamento: perguntar detalhes do erro.
- Se quer revisão mas não preencheu o formulário: instruir a preencher primeiro.
NUNCA passe para o humano um caso incompleto. O supervisor não deve precisar repetir perguntas que a IA poderia ter feito.`,
        category: "Regras",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Regra de Ouro",
        content: `NUNCA invente nada diferente do roteiro. Se for alguma pergunta fora do script, diga que vai passar para o supervisor responder e peça para o cliente aguardar atendimento. Responda: "Vou passar para nosso supervisor que vai te ajudar com isso. Aguarde que entraremos em contato assim que possível."`,
        category: "Regras",
        locale: "all",
        channel: SupportKnowledgeChannel.BOTH,
    },
    {
        title: "Pedido não encontrado no sistema (PRIORIDADE MÁXIMA)",
        content: `REGRA PRIORITÁRIA (sobrepõe todas as outras regras de escalação e coleta de dados):
Quando o cliente está buscando um pedido/música (diz que comprou, pagou, não recebeu, não encontrou, música feita por outra pessoa, pedido feito em outro email, etc.) MAS o ORDER CONTEXT mostra "No orders found":
- NÃO peça nome do destinatário, número do pedido, comprovante, CPF, ou qualquer dado para investigar.
- NÃO tente localizar o pedido nem escale para supervisor.
- NÃO sugira que o pedido pode estar em outro email.
- APENAS peça o EMAIL usado na compra para poder localizar o pedido. Se o cliente já informou o email e mesmo assim não encontrou, transfira para o atendente usando [ESCALATE].
- Esta regra NÃO se aplica quando o cliente tem pedidos no ORDER CONTEXT — nesses casos, use os dados disponíveis para ajudar.
- Esta regra NÃO se aplica a dúvidas gerais sem relação com pedido (preços, como funciona, etc.) — responda normalmente.`,
        category: "Regras",
        locale: "all",
        channel: SupportKnowledgeChannel.WHATSAPP,
    },
    {
        title: "Pagamento via Pix",
        content: `Dados para pagamento via Pix:
- Chave Pix (CPF): 011.103.041-29
- Nome: Thiago Felizola
- Valor: conforme o produto/serviço solicitado (veja tabela de preços)

REGRA IMPORTANTE SOBRE PAGAMENTO:
- Envie os dados do Pix ao cliente quando ele confirmar que quer pagar.
- Informe o valor correto com base no produto (use a tabela de preços da knowledge base).
- Após enviar os dados do Pix, diga ao cliente para avisar quando o pagamento for feito.
- Quando o cliente CONFIRMAR QUE PAGOU (ex: "paguei", "já fiz o pix", "transferi"), SEMPRE transfira para o atendente humano para verificar e processar: inclua [ESCALATE] na resposta.
- Exemplo após pagamento: "Perfeito! Vou verificar o pagamento e já te dou um retorno! 🙏 [ESCALATE]"`,
        category: "Pagamento",
        locale: "all",
        channel: SupportKnowledgeChannel.WHATSAPP,
    },
];

async function main() {
    console.log("Deleting old knowledge base entries...");
    const deleted = await db.supportKnowledge.deleteMany();
    console.log(`  Deleted ${deleted.count} old entries.`);

    console.log("\nSeeding new knowledge base...");
    for (const entry of entries) {
        await db.supportKnowledge.create({ data: entry });
        console.log(`  + [${entry.locale}] ${entry.category} - ${entry.title}`);
    }

    console.log(`\nDone! ${entries.length} entries created.`);
}

main()
    .catch(console.error)
    .finally(() => db.$disconnect());
