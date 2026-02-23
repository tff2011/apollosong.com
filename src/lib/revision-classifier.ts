/**
 * Revision classification service using OpenRouter LLM
 * Automatically classifies revision requests into categories for prioritization
 */

// Use process.env directly for worker compatibility
const env = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_CLASSIFIER_MODEL,
};

export type RevisionType =
    | "PRONUNCIATION"
    | "LYRICS_ERROR"
    | "NAME_ERROR"
    | "STYLE_CHANGE"
    | "QUALITY_ISSUE"
    | "OTHER";

export type RevisionFault =
    | "OUR_FAULT"      // Erro da IA ou do sistema - revisão gratuita
    | "CLIENT_FAULT"   // Erro/esquecimento do cliente - cobrar R$ 39,90
    | "UNCLEAR";       // Não foi possível determinar - análise manual

export interface ClassificationInput {
    revisionNotes: string;
    recipientName: string;
    markedWords?: string; // Words marked by customer in lyrics
    locale?: string;
    // Dados originais do pedido para comparação
    originalQualities?: string;
    originalMemories?: string;
    originalMessage?: string;
}

export interface ClassificationResult {
    type: RevisionType;
    fault: RevisionFault; // Quem é responsável pela revisão
    confidence: "high" | "medium" | "low";
    extractedWords?: string[]; // Words that need pronunciation correction
    summary?: string; // Brief summary of the issue
    faultReason?: string; // Explicação da decisão de responsabilidade
}

const CLASSIFICATION_PROMPT = `Você é um sistema de classificação de revisões para uma empresa que cria músicas personalizadas com IA.

## TAREFA 1: Classifique o TIPO do problema em UMA das categorias:

PRONUNCIATION - Erro de pronúncia de nomes ou palavras específicas (ex: "nome está errado", "pronunciou errado", "falou errado o nome")
NAME_ERROR - Nome do destinatário errado, faltando ou trocado (ex: "esqueceu o nome", "nome errado", "trocou o nome")
LYRICS_ERROR - Erro na letra da música (palavra errada, frase incorreta, informação errada) (ex: "disse X mas era Y", "errou a profissão")
STYLE_CHANGE - Cliente quer estilo/ritmo/gênero diferente (ex: "queria mais animado", "muito lento", "queria outro estilo")
QUALITY_ISSUE - Problema técnico de qualidade do áudio (ex: "som ruim", "muito baixo", "chiado")
OTHER - Outros motivos que não se encaixam nas categorias acima

## TAREFA 2: Avalie de quem é a RESPONSABILIDADE

### PASSO CRÍTICO - VERIFICAÇÃO OBRIGATÓRIA:
Para CADA informação mencionada na reclamação, você DEVE verificar:
1. Essa informação específica (nome, data, profissão, etc.) aparece nos DADOS ORIGINAIS?
2. Se NÃO aparece → CLIENT_FAULT (cliente esqueceu de mencionar)
3. Se SIM aparece mas a IA escreveu diferente → OUR_FAULT (erro da IA)

### PALAVRAS-CHAVE QUE INDICAM CLIENT_FAULT:
Se a reclamação contém estas palavras, PROVAVELMENTE é CLIENT_FAULT:
- "acrescentar", "adicionar", "incluir", "colocar também"
- "esqueci de mencionar", "faltou colocar", "não coloquei"
- "quero mudar para", "prefiro que seja", "mudei de ideia"
- "gostaria de incluir", "pode colocar também"

### OUR_FAULT (Erro nosso - revisão GRATUITA):
- IA escreveu informação DIFERENTE do que o cliente forneceu nos dados originais
- IA inventou dados (datas, nomes, profissões) que NÃO estavam no pedido
- Pronúncia ficou errada mesmo com o nome/palavra correta nos dados originais
- Problema técnico de qualidade do áudio
- IA ignorou instrução EXPLÍCITA que estava nos dados originais

### CLIENT_FAULT (Erro do cliente - cobrar R$ 39,90):
- Cliente quer ADICIONAR informação que NÃO ESTAVA nos dados originais (nomes, datas, fatos)
- Cliente ESQUECEU de mencionar algo importante (não está nos dados originais)
- Cliente ESCREVEU errado no formulário (o erro está nos próprios dados originais)
- Cliente MUDOU DE IDEIA sobre estilo/conteúdo após ver o resultado
- Cliente não gostou mas não há erro técnico identificável

### UNCLEAR (Não está claro):
- Não é possível determinar se a informação estava ou não nos dados originais
- Situação ambígua que precisa análise humana

## DADOS DA REVISÃO:
Nome do destinatário: {recipientName}
Palavras marcadas pelo cliente: {markedWords}
Notas/reclamação do cliente: {revisionNotes}

## DADOS ORIGINAIS DO PEDIDO (o que o cliente escreveu no formulário):
Qualidades/características: {originalQualities}
Memórias/histórias: {originalMemories}
Mensagem adicional: {originalMessage}

## EXEMPLOS DE CLASSIFICAÇÃO:

EXEMPLO 1 - CLIENT_FAULT:
- Reclamação: "Gostaria de acrescentar que ela é mãe do João e da Maria"
- Dados originais: "Ela é carinhosa e dedicada" (NÃO menciona João nem Maria)
- Resultado: CLIENT_FAULT - Os nomes João e Maria NÃO estavam nos dados originais. Cliente esqueceu de mencionar.

EXEMPLO 2 - OUR_FAULT:
- Reclamação: "A música diz que ele tem 53 anos, mas são 54"
- Dados originais: "Ele vai fazer 54 anos" (MENCIONA 54)
- Resultado: OUR_FAULT - A idade 54 estava nos dados originais, mas a IA escreveu 53.

EXEMPLO 3 - CLIENT_FAULT:
- Reclamação: "Quero adicionar que ele é palmeirense"
- Dados originais: "Ele gosta de futebol" (NÃO menciona Palmeiras)
- Resultado: CLIENT_FAULT - A informação "palmeirense" NÃO estava nos dados originais.

## RESPONDA APENAS no formato JSON (sem markdown):
{
  "type": "CATEGORIA",
  "fault": "OUR_FAULT|CLIENT_FAULT|UNCLEAR",
  "confidence": "high|medium|low",
  "extractedWords": ["palavra1", "palavra2"],
  "summary": "Resumo breve do problema",
  "faultReason": "Liste: 1) O que o cliente pediu 2) Se estava nos dados originais (SIM/NÃO) 3) Conclusão"
}`;

/**
 * Classifies a revision request using AI
 */
export async function classifyRevision(
    input: ClassificationInput
): Promise<ClassificationResult> {
    // Error if no API key or model configured
    if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_MODEL) {
        throw new Error("[RevisionClassifier] Missing OPENROUTER_API_KEY or OPENROUTER_CLASSIFIER_MODEL");
    }

    try {
        const prompt = CLASSIFICATION_PROMPT
            .replace("{recipientName}", input.recipientName || "N/A")
            .replace("{markedWords}", input.markedWords || "Nenhuma")
            .replace("{revisionNotes}", input.revisionNotes || "N/A")
            .replace("{originalQualities}", input.originalQualities || "Não disponível")
            .replace("{originalMemories}", input.originalMemories || "Não disponível")
            .replace("{originalMessage}", input.originalMessage || "Não fornecida");

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://apollosong.com",
                "X-Title": "ApolloSong Revision Classifier",
            },
            body: JSON.stringify({
                model: env.OPENROUTER_MODEL,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.1, // Low temperature for consistent classification
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`[RevisionClassifier] API error: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error("[RevisionClassifier] No content in response");
        }

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`[RevisionClassifier] Could not parse JSON from: ${content}`);
        }

        const result = JSON.parse(jsonMatch[0]) as ClassificationResult;

        // Validate type
        const validTypes: RevisionType[] = [
            "PRONUNCIATION",
            "LYRICS_ERROR",
            "NAME_ERROR",
            "STYLE_CHANGE",
            "QUALITY_ISSUE",
            "OTHER",
        ];

        if (!validTypes.includes(result.type)) {
            console.warn("[RevisionClassifier] Invalid type:", result.type);
            result.type = "OTHER";
        }

        // Validate confidence
        if (!["high", "medium", "low"].includes(result.confidence)) {
            result.confidence = "medium";
        }

        // Validate fault
        const validFaults: RevisionFault[] = ["OUR_FAULT", "CLIENT_FAULT", "UNCLEAR"];
        if (!result.fault || !validFaults.includes(result.fault)) {
            console.warn("[RevisionClassifier] Invalid or missing fault:", result.fault);
            result.fault = "UNCLEAR";
        }

        console.log("[RevisionClassifier] Classification result:", result);
        return result;
    } catch (error) {
        console.error("[RevisionClassifier] Error:", error);
        throw error;
    }
}

/**
 * Get emoji for revision type (for Telegram alerts)
 */
export function getRevisionTypeEmoji(type: RevisionType): string {
    const emojis: Record<RevisionType, string> = {
        PRONUNCIATION: "🎤",
        NAME_ERROR: "📛",
        LYRICS_ERROR: "📝",
        STYLE_CHANGE: "🎨",
        QUALITY_ISSUE: "🔊",
        OTHER: "❓",
    };
    return emojis[type] || "❓";
}

/**
 * Get display label for revision type (localized)
 */
export function getRevisionTypeLabel(
    type: RevisionType,
    locale: string = "pt"
): string {
    const labels: Record<RevisionType, Record<string, string>> = {
        PRONUNCIATION: {
            pt: "Pronúncia",
            en: "Pronunciation",
            es: "Pronunciación",
            fr: "Prononciation",
            it: "Pronuncia",
        },
        NAME_ERROR: {
            pt: "Nome Errado",
            en: "Name Error",
            es: "Error de Nombre",
            fr: "Erreur de Nom",
            it: "Errore Nome",
        },
        LYRICS_ERROR: {
            pt: "Erro na Letra",
            en: "Lyrics Error",
            es: "Error en Letra",
            fr: "Erreur Paroles",
            it: "Errore Testo",
        },
        STYLE_CHANGE: {
            pt: "Mudança de Estilo",
            en: "Style Change",
            es: "Cambio de Estilo",
            fr: "Changement Style",
            it: "Cambio Stile",
        },
        QUALITY_ISSUE: {
            pt: "Qualidade",
            en: "Quality Issue",
            es: "Problema Calidad",
            fr: "Problème Qualité",
            it: "Problema Qualità",
        },
        OTHER: {
            pt: "Outro",
            en: "Other",
            es: "Otro",
            fr: "Autre",
            it: "Altro",
        },
    };

    return labels[type]?.[locale] || labels[type]?.["pt"] || type;
}

/**
 * Get priority level for revision type (for queue ordering)
 */
export function getRevisionPriority(type: RevisionType): number {
    const priorities: Record<RevisionType, number> = {
        PRONUNCIATION: 1, // Highest - can be automated
        NAME_ERROR: 2,    // High - usually simple fix
        LYRICS_ERROR: 3,  // Medium - needs manual review
        QUALITY_ISSUE: 4, // Medium - needs technical check
        STYLE_CHANGE: 5,  // Low - complex, may need re-negotiation
        OTHER: 6,         // Lowest - needs manual triage
    };
    return priorities[type] || 6;
}

/**
 * Get emoji for revision fault (for Telegram alerts)
 */
export function getRevisionFaultEmoji(fault: RevisionFault): string {
    const emojis: Record<RevisionFault, string> = {
        OUR_FAULT: "🆓",      // Free revision
        CLIENT_FAULT: "💰",   // Paid revision
        UNCLEAR: "❓",        // Needs manual review
    };
    return emojis[fault] || "❓";
}

/**
 * Get display label for revision fault (localized)
 */
export function getRevisionFaultLabel(
    fault: RevisionFault,
    locale: string = "pt"
): string {
    const labels: Record<RevisionFault, Record<string, string>> = {
        OUR_FAULT: {
            pt: "Erro Nosso (Grátis)",
            en: "Our Fault (Free)",
            es: "Error Nuestro (Gratis)",
            fr: "Notre Erreur (Gratuit)",
            it: "Errore Nostro (Gratis)",
        },
        CLIENT_FAULT: {
            pt: "Erro do Cliente (R$ 39,90)",
            en: "Client Fault ($9.90)",
            es: "Error del Cliente ($9.90)",
            fr: "Erreur Client (9,90€)",
            it: "Errore Cliente (€9,90)",
        },
        UNCLEAR: {
            pt: "A Analisar",
            en: "To Analyze",
            es: "Por Analizar",
            fr: "À Analyser",
            it: "Da Analizzare",
        },
    };

    return labels[fault]?.[locale] || labels[fault]?.["pt"] || fault;
}
