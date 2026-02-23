#!/usr/bin/env node
/**
 * Script to classify existing revisions that don't have a revisionType yet
 * Usage: node scripts/classify-revisions.mjs [--dry-run] [--limit N]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_CLASSIFIER_MODEL || "google/gemini-2.0-flash-001";

const CLASSIFICATION_PROMPT = `Você é um sistema de classificação de revisões para uma empresa que cria músicas personalizadas.

Analise esta solicitação de revisão e classifique em UMA das categorias:

PRONUNCIATION - Erro de pronúncia de nomes ou palavras específicas (ex: "nome está errado", "pronunciou errado", "falou errado o nome")
NAME_ERROR - Nome do destinatário errado, faltando ou trocado (ex: "esqueceu o nome", "nome errado", "trocou o nome")
LYRICS_ERROR - Erro na letra da música (palavra errada, frase incorreta, informação errada) (ex: "disse X mas era Y", "errou a profissão")
STYLE_CHANGE - Cliente quer estilo/ritmo/gênero diferente (ex: "queria mais animado", "muito lento", "queria outro estilo")
QUALITY_ISSUE - Problema técnico de qualidade do áudio (ex: "som ruim", "muito baixo", "chiado")
OTHER - Outros motivos que não se encaixam nas categorias acima

DADOS DA REVISÃO:
Nome do destinatário: {recipientName}
Palavras marcadas pelo cliente: {markedWords}
Notas do cliente: {revisionNotes}

RESPONDA APENAS no formato JSON:
{
  "type": "CATEGORIA",
  "confidence": "high|medium|low",
  "extractedWords": ["palavra1", "palavra2"],
  "summary": "Resumo breve do problema em português"
}

Se o cliente marcou palavras específicas ou mencionou pronúncia/nome, a confiança deve ser "high".
Se não está claro o motivo exato, use "low".
Em extractedWords, liste apenas palavras que precisam de correção de pronúncia (se aplicável).`;

async function classifyRevision(input) {
    if (!OPENROUTER_API_KEY) {
        console.log("  [WARN] No API key, using fallback");
        return fallbackClassification(input);
    }

    try {
        const prompt = CLASSIFICATION_PROMPT
            .replace("{recipientName}", input.recipientName || "N/A")
            .replace("{markedWords}", input.markedWords || "Nenhuma")
            .replace("{revisionNotes}", input.revisionNotes || "N/A");

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://apollosong.com",
                "X-Title": "ApolloSong Revision Classifier",
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 200,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log("  [ERROR] API error:", errorText);
            return fallbackClassification(input);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.log("  [ERROR] No content in response");
            return fallbackClassification(input);
        }

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.log("  [ERROR] Could not parse JSON from:", content);
            return fallbackClassification(input);
        }

        const result = JSON.parse(jsonMatch[0]);

        const validTypes = ["PRONUNCIATION", "LYRICS_ERROR", "NAME_ERROR", "STYLE_CHANGE", "QUALITY_ISSUE", "OTHER"];
        if (!validTypes.includes(result.type)) {
            result.type = "OTHER";
        }

        return result;
    } catch (error) {
        console.log("  [ERROR]", error.message);
        return fallbackClassification(input);
    }
}

function fallbackClassification(input) {
    const notes = (input.revisionNotes || "").toLowerCase();
    const markedWords = (input.markedWords || "").toLowerCase();

    if (notes.includes("pronúncia") || notes.includes("pronuncia") || notes.includes("pronunciou") ||
        notes.includes("falou errado") || notes.includes("disse errado") || markedWords.length > 0) {
        return { type: "PRONUNCIATION", confidence: markedWords.length > 0 ? "high" : "medium", summary: "Possível erro de pronúncia" };
    }
    if (notes.includes("nome errado") || notes.includes("nome trocado") || notes.includes("esqueceu o nome")) {
        return { type: "NAME_ERROR", confidence: "medium", summary: "Possível erro no nome" };
    }
    if (notes.includes("letra errada") || notes.includes("palavra errada") || notes.includes("errou") || notes.includes("trocou")) {
        return { type: "LYRICS_ERROR", confidence: "medium", summary: "Possível erro na letra" };
    }
    if (notes.includes("estilo") || notes.includes("ritmo") || notes.includes("gênero") || notes.includes("diferente")) {
        return { type: "STYLE_CHANGE", confidence: "medium", summary: "Mudança de estilo" };
    }
    if (notes.includes("qualidade") || notes.includes("som ruim") || notes.includes("áudio") || notes.includes("chiado")) {
        return { type: "QUALITY_ISSUE", confidence: "medium", summary: "Problema de qualidade" };
    }
    return { type: "OTHER", confidence: "low", summary: "Classificação não determinada" };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;

    console.log("\n=== Classificando Revisões Existentes ===\n");
    console.log(`Modo: ${dryRun ? "DRY-RUN (não salva)" : "REAL (vai salvar)"}`);
    if (limit) console.log(`Limite: ${limit} pedidos`);
    console.log("");

    // Find orders with REVISION status that don't have revisionType
    const orders = await prisma.songOrder.findMany({
        where: {
            status: "REVISION",
            revisionType: null,
        },
        select: {
            id: true,
            recipientName: true,
            revisionNotes: true,
            revisionRequestedAt: true,
            email: true,
        },
        orderBy: { revisionRequestedAt: "desc" },
        take: limit,
    });

    console.log(`Encontrados: ${orders.length} pedidos sem classificação\n`);

    if (orders.length === 0) {
        // Show all revision orders
        const allRevisions = await prisma.songOrder.findMany({
            where: { status: "REVISION" },
            select: {
                id: true,
                recipientName: true,
                revisionType: true,
                revisionNotes: true,
            },
        });
        console.log("Todas as revisões existentes:");
        for (const order of allRevisions) {
            console.log(`  - ${order.id}: ${order.recipientName} [${order.revisionType || "SEM TIPO"}]`);
            if (order.revisionNotes) {
                console.log(`    Notas: ${order.revisionNotes.substring(0, 100)}...`);
            }
        }
        return;
    }

    for (const order of orders) {
        console.log(`\n--- Pedido: ${order.id} ---`);
        console.log(`Destinatário: ${order.recipientName}`);
        console.log(`Email: ${order.email}`);
        console.log(`Notas: ${order.revisionNotes?.substring(0, 200) || "(sem notas)"}...`);

        // Extract marked words from notes
        const markedWordsMatch = order.revisionNotes?.match(/Words with errors in lyrics:\s*([^\n]+)/i)
            || order.revisionNotes?.match(/Palavras com erros na letra:\s*([^\n]+)/i);
        const markedWords = markedWordsMatch?.[1]?.trim() || undefined;

        if (markedWords) {
            console.log(`Palavras marcadas: ${markedWords}`);
        }

        const classification = await classifyRevision({
            revisionNotes: order.revisionNotes || "",
            recipientName: order.recipientName,
            markedWords,
        });

        console.log(`\n  => Tipo: ${classification.type}`);
        console.log(`  => Confiança: ${classification.confidence}`);
        console.log(`  => Resumo: ${classification.summary}`);
        if (classification.extractedWords?.length > 0) {
            console.log(`  => Palavras: ${classification.extractedWords.join(", ")}`);
        }

        if (!dryRun) {
            await prisma.songOrder.update({
                where: { id: order.id },
                data: { revisionType: classification.type },
            });
            console.log(`  [SAVED] revisionType = ${classification.type}`);
        } else {
            console.log(`  [DRY-RUN] Não salvou`);
        }
    }

    console.log("\n=== Concluído ===\n");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
