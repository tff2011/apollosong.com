/**
 * Lyrics correction service using OpenRouter LLM
 * Compares revision notes with current lyrics and generates AI-corrected version
 */

import { expandAbbreviations } from "~/lib/lyrics-generator";

// Use process.env directly for compatibility
const env = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview",
};

export interface LyricsCorrectionInput {
    lyrics: string;
    revisionNotes: string;
    revisionType: string | null;
    markedWords: string[];
    genre?: string;
    locale?: string;
    revisionHistory?: Array<{
        revisionNumber: number;
        notes: string | null;
        type: string | null;
        fault: string | null;
    }>;
}

export interface LyricsChange {
    original: string;
    corrected: string;
    reason: string;
    type: "phonetic" | "factual" | "spelling" | "style" | "other";
}

export interface LyricsCorrectionResult {
    correctedLyrics: string;  // For Suno - includes ALL corrections (phonetic + factual)
    displayLyrics: string;    // For display/PDF - only factual corrections, no phonetics
    changes: LyricsChange[];
}

type OpenRouterMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

type SupportedLyricsLocale = "pt" | "en" | "es" | "fr" | "it";

const LOCALE_LABELS: Record<SupportedLyricsLocale, string> = {
    pt: "Português Brasileiro",
    en: "English",
    es: "Español",
    fr: "Français",
    it: "Italiano",
};

const PHONETIC_RULES = `
REGRAS DE CORREÇÃO FONÉTICA (Português Brasileiro):

NOMES ITALIANOS:
- "chi" final → "qui" (Bianchi → Biânqui)
- "gn" → "nh" (Agnelli → Anhéli)
- "gl" + vogal → "li" (Tagliamento → Taliamênto)
- "cci" → "tchi" (Cappuccino → Caputchíno)
- Adicione acento circunflexo para marcar vogal fechada/tônica

NOMES INGLESES:
- "Michael" → "Máicol"
- "John" → "Djón"
- "William" → "Uíliam"
- "Catherine" → "Kéterin"
- "George" → "Djórdj"
- "Joseph" → "Djósef"
- "Charles" → "Tchárls"
- "Richard" → "Rítchard"
- "th" inicial → "d" (Thomas → Dómas)
- "-son" → "-sôn" (Jackson → Djécsôn)

NOMES FRANCESES:
- "Jean" → "Jãn"
- "Pierre" → "Piér"
- "Louis" → "Luí"

REGRA GERAL:
- Use acentos agudos (á, é, í, ó, ú) para forçar sílaba tônica aberta
- Use acentos circunflexos (â, ê, ô) para forçar sílaba tônica fechada
- O Suno AI lê português brasileiro, então escreva como soa na pronúncia correta
- Mantenha a estrutura da letra intacta, só mude a grafia dos nomes/palavras com erro de pronúncia
`;

function buildSystemPrompt(genre?: string, revisionType?: string | null, locale?: string): string {
    const genreInstruction = genre
        ? `- O GÊNERO MUSICAL é **${genre}** — todas as correções devem soar naturais para este estilo musical. Use vocabulário, cadência e expressões típicas do gênero. A letra corrigida deve ser CANTÁVEL neste gênero.`
        : "";

    const localeNames: Record<string, string> = {
        pt: "Português Brasileiro",
        en: "English",
        es: "Español",
        fr: "Français",
        it: "Italiano",
    };
    const localeName = locale ? localeNames[locale] ?? locale : null;
    const localeInstruction = localeName
        ? `- O IDIOMA da letra é ${localeName}. TODAS as palavras DEVEM permanecer nesse idioma. NUNCA substitua uma palavra por equivalente em outro idioma (ex: "união" NUNCA deve virar "union", "coração" NUNCA deve virar "corazón"). Se uma palavra já está correta no idioma original, NÃO a altere.`
        : `- DETECTE o idioma da letra original e mantenha TODAS as palavras nesse mesmo idioma. NUNCA substitua palavras por equivalentes em outro idioma.`;

    const phoneticSection = revisionType === "PRONUNCIATION"
        ? `\n${PHONETIC_RULES}`
        : "\n- NÃO invente correções fonéticas a menos que o cliente tenha solicitado explicitamente correção de pronúncia";

    return `Você é um especialista em correção de letras de música para gravação com IA (Suno).
Sua tarefa é analisar as notas de revisão do cliente e corrigir a letra conforme solicitado.

IMPORTANTE:
- Preserve a estrutura original da letra (versos, refrões, pontes, etc.)
- Preserve as tags de seção como [Verso 1], [Refrão], [Ponte], etc.
- MANTENHA O ESQUEMA DE RIMAS — esta é uma LETRA DE MÚSICA, não texto comum. Toda correção DEVE rimar com as linhas adjacentes da mesma forma que o original. Se uma linha rimava com outra, a correção DEVE manter essa rima. Prefira sinônimos que rimem.
- A letra corrigida deve ser CANTÁVEL — mantenha a métrica/número de sílabas similar ao original para que a melodia encaixe
- REGRA CRÍTICA: Só altere o que foi EXPLICITAMENTE mencionado nas notas de revisão. NÃO reescreva versos inteiros. NÃO faça NENHUMA outra alteração. Copie cada linha que não precisa de mudança EXATAMENTE como está.
${localeInstruction}
- PROIBIDO usar qualquer tipo de abreviação. TODAS as palavras devem estar POR EXTENSO (ex: "Senhor" nunca "Sr.", "Senhora" nunca "Sra.", "Dona" nunca "D.", "Doutor" nunca "Dr.", "São" nunca "S.", "Santo" nunca "Sto.", "Santa" nunca "Sta.", "Professor" nunca "Prof.", "Padre" nunca "Pe."). Isso vale para QUALQUER abreviação sem exceção — o Suno AI não interpreta abreviações corretamente.
- NÃO "melhore", "corrija" ou "modernize" trechos que não foram mencionados pelo cliente.
- Para erros factuais (idade, data, nome errado), corrija com a informação correta mantendo a rima
- NÃO corrija ortografia ou acentuação por conta própria. Palavras como "espôsa", "nóis", "véio" etc. podem ter sido escritas INTENCIONALMENTE para guiar a pronúncia do Suno AI. Só corrija ortografia se o CLIENTE pedir explicitamente.
- Retorne a letra completa corrigida
${genreInstruction}
${phoneticSection}`;
}

function normalizeSupportedLyricsLocale(locale?: string | null): SupportedLyricsLocale | null {
    const value = (locale || "").toLowerCase().trim();
    if (value.startsWith("pt")) return "pt";
    if (value.startsWith("en")) return "en";
    if (value.startsWith("es")) return "es";
    if (value.startsWith("fr")) return "fr";
    if (value.startsWith("it")) return "it";
    return null;
}

function uniqueNormalizedTerms(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    const out: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        if (typeof value !== "string") continue;
        const normalized = value.trim().toLowerCase();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }

    return out;
}

function buildLocaleIntegrityRewritePrompt(
    correctedLyrics: string,
    displayLyrics: string,
    locale: SupportedLyricsLocale
): string {
    const localeName = LOCALE_LABELS[locale];
    return `IDIOMA ALVO: ${localeName}

Você receberá duas versões da mesma letra:
1) correctedLyrics (versão para geração musical)
2) displayLyrics (versão para PDF/email)

TAREFA:
- Reescrever APENAS onde houver mistura de idioma fora de ${localeName}.
- Mantenha significado, rima, métrica e estrutura de linhas.
- Não remova nem adicione estrofes.
- NÃO altere conteúdo entre colchetes [ ... ] (isso é metadado estrutural e pode estar em qualquer idioma).
- Nomes próprios, marcas, siglas e números podem permanecer.
- Termos estrangeiros consagrados no vocabulário musical local podem permanecer quando soam naturais no texto.

RETORNE APENAS JSON no formato:
{
  "correctedLyrics": "...",
  "displayLyrics": "...",
  "detectedForeignTerms": ["termo1", "termo2"]
}

---correctedLyrics---
${correctedLyrics}
---fim---

---displayLyrics---
${displayLyrics}
---fim---`;
}

function buildLocaleIntegrityValidationPrompt(
    correctedLyrics: string,
    displayLyrics: string,
    locale: SupportedLyricsLocale
): string {
    const localeName = LOCALE_LABELS[locale];
    return `IDIOMA ALVO: ${localeName}

Valide se existe qualquer termo fora do idioma alvo.

REGRAS DE VALIDAÇÃO:
- Ignore qualquer conteúdo entre colchetes [ ... ].
- Nomes próprios, marcas, siglas e números são permitidos.
- Classifique cada termo suspeito de outro idioma com um tipo:
  - intrusion: troca indevida de idioma que deve ser corrigida.
  - loanword: empréstimo linguístico aceitável no contexto musical local.
  - proper_noun: nome próprio (pessoa, lugar, obra).
  - brand: marca/plataforma/produto.
  - acronym: sigla.
  - unclassified: caso duvidoso.
- Use "intrusion" APENAS quando for mistura indevida de idioma.
- Não reescreva nada.

RETORNE APENAS JSON no formato:
{
  "correctedDetectedLanguage": "pt|en|es|fr|it|mixed|unknown",
  "displayDetectedLanguage": "pt|en|es|fr|it|mixed|unknown",
  "correctedFindings": [
    {
      "term": "termo1",
      "classification": "intrusion|loanword|proper_noun|brand|acronym|unclassified"
    }
  ],
  "displayFindings": [
    {
      "term": "termo1",
      "classification": "intrusion|loanword|proper_noun|brand|acronym|unclassified"
    }
  ]
}

---correctedLyrics---
${correctedLyrics}
---fim---

---displayLyrics---
${displayLyrics}
---fim---`;
}

function normalizeDetectedLanguage(value: unknown): SupportedLyricsLocale | "mixed" | "unknown" {
    if (typeof value !== "string") return "unknown";
    const normalized = value.trim().toLowerCase();
    if (normalized.startsWith("pt")) return "pt";
    if (normalized.startsWith("en")) return "en";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("it")) return "it";
    if (normalized === "mixed" || normalized === "misto" || normalized === "misto/unknown") return "mixed";
    return "unknown";
}

type LocaleIntegrityFindingClassification =
    | "intrusion"
    | "loanword"
    | "proper_noun"
    | "brand"
    | "acronym"
    | "unclassified";

type LocaleIntegrityFinding = {
    term: string;
    classification: LocaleIntegrityFindingClassification;
};

function normalizeFindingClassification(value: unknown): LocaleIntegrityFindingClassification {
    if (typeof value !== "string") return "unclassified";
    const normalized = value.trim().toLowerCase();

    if (["intrusion", "foreign", "outside_language", "code_switch"].includes(normalized)) return "intrusion";
    if (["loanword", "emprestimo", "borrowed_term", "music_loanword"].includes(normalized)) return "loanword";
    if (["proper_noun", "nome_proprio", "person_name", "place_name"].includes(normalized)) return "proper_noun";
    if (["brand", "marca", "platform"].includes(normalized)) return "brand";
    if (["acronym", "sigla", "abbreviation"].includes(normalized)) return "acronym";
    return "unclassified";
}

function parseLocaleIntegrityFindings(values: unknown): LocaleIntegrityFinding[] {
    if (!Array.isArray(values)) return [];

    const out: LocaleIntegrityFinding[] = [];
    const seen = new Set<string>();

    for (const item of values) {
        let term = "";
        let classification: LocaleIntegrityFindingClassification = "unclassified";

        if (typeof item === "string") {
            term = item.trim();
            classification = "intrusion";
        } else if (item && typeof item === "object") {
            const rawTerm = (item as Record<string, unknown>).term;
            if (typeof rawTerm === "string") {
                term = rawTerm.trim();
            }
            classification = normalizeFindingClassification(
                (item as Record<string, unknown>).classification
            );
        }

        if (!term) continue;
        const key = `${term.toLowerCase()}::${classification}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ term, classification });
    }

    return out;
}

function parseLocaleIntegrityRewriteResponse(content: string): {
    correctedLyrics: string;
    displayLyrics: string;
    detectedForeignTerms: string[];
} {
    const cleanContent = cleanPotentialJson(content);
    const parsed = JSON.parse(cleanContent) as {
        correctedLyrics?: unknown;
        displayLyrics?: unknown;
        detectedForeignTerms?: unknown;
    };

    if (typeof parsed.correctedLyrics !== "string" || !parsed.correctedLyrics.trim()) {
        throw new Error("Invalid locale integrity response: missing correctedLyrics");
    }
    if (typeof parsed.displayLyrics !== "string" || !parsed.displayLyrics.trim()) {
        throw new Error("Invalid locale integrity response: missing displayLyrics");
    }

    return {
        correctedLyrics: parsed.correctedLyrics,
        displayLyrics: parsed.displayLyrics,
        detectedForeignTerms: uniqueNormalizedTerms(parsed.detectedForeignTerms),
    };
}

function parseLocaleIntegrityValidationResponse(content: string): {
    correctedDetectedLanguage: SupportedLyricsLocale | "mixed" | "unknown";
    displayDetectedLanguage: SupportedLyricsLocale | "mixed" | "unknown";
    correctedFindings: LocaleIntegrityFinding[];
    displayFindings: LocaleIntegrityFinding[];
} {
    const cleanContent = cleanPotentialJson(content);
    const parsed = JSON.parse(cleanContent) as {
        correctedDetectedLanguage?: unknown;
        displayDetectedLanguage?: unknown;
        correctedFindings?: unknown;
        displayFindings?: unknown;
        correctedForeignTerms?: unknown; // backward compatibility
        displayForeignTerms?: unknown; // backward compatibility
    };

    const correctedFindings =
        parseLocaleIntegrityFindings(parsed.correctedFindings).length > 0
            ? parseLocaleIntegrityFindings(parsed.correctedFindings)
            : parseLocaleIntegrityFindings(parsed.correctedForeignTerms);
    const displayFindings =
        parseLocaleIntegrityFindings(parsed.displayFindings).length > 0
            ? parseLocaleIntegrityFindings(parsed.displayFindings)
            : parseLocaleIntegrityFindings(parsed.displayForeignTerms);

    return {
        correctedDetectedLanguage: normalizeDetectedLanguage(parsed.correctedDetectedLanguage),
        displayDetectedLanguage: normalizeDetectedLanguage(parsed.displayDetectedLanguage),
        correctedFindings,
        displayFindings,
    };
}

async function enforceLocaleIntegrity(
    correctedLyrics: string,
    displayLyrics: string,
    locale: SupportedLyricsLocale
): Promise<{
    correctedLyrics: string;
    displayLyrics: string;
    detectedForeignTerms: string[];
}> {
    const messages: OpenRouterMessage[] = [
        {
            role: "system",
            content: `Você é um auditor linguístico de letras musicais. Garanta consistência total de idioma sem degradar musicalidade.`,
        },
        {
            role: "user",
            content: buildLocaleIntegrityRewritePrompt(correctedLyrics, displayLyrics, locale),
        },
    ];

    const { content } = await requestOpenRouter(messages, {
        jsonMode: true,
        temperature: 0,
        maxTokens: 7000,
        timeoutMs: 25000,
    });

    return parseLocaleIntegrityRewriteResponse(content);
}

async function validateLocaleIntegrity(
    correctedLyrics: string,
    displayLyrics: string,
    locale: SupportedLyricsLocale
): Promise<{
    correctedDetectedLanguage: SupportedLyricsLocale | "mixed" | "unknown";
    displayDetectedLanguage: SupportedLyricsLocale | "mixed" | "unknown";
    correctedFindings: LocaleIntegrityFinding[];
    displayFindings: LocaleIntegrityFinding[];
}> {
    const messages: OpenRouterMessage[] = [
        {
            role: "system",
            content: `Você é um validador linguístico estrito para letras musicais.`,
        },
        {
            role: "user",
            content: buildLocaleIntegrityValidationPrompt(correctedLyrics, displayLyrics, locale),
        },
    ];

    const { content } = await requestOpenRouter(messages, {
        jsonMode: true,
        temperature: 0,
        maxTokens: 3500,
        timeoutMs: 20000,
    });

    return parseLocaleIntegrityValidationResponse(content);
}

function buildCorrectionPrompt(input: LyricsCorrectionInput): string {
    const markedWordsSection = input.markedWords.length > 0
        ? `\n\nPALAVRAS MARCADAS PELO CLIENTE: ${input.markedWords.join(", ")}`
        : "";

    const revisionTypeLabels: Record<string, string> = {
        PRONUNCIATION: "Erro de pronúncia (nome/palavra pronunciado errado)",
        LYRICS_ERROR: "Erro na letra (palavra errada, frase incorreta)",
        NAME_ERROR: "Nome do destinatário errado ou faltando",
        STYLE_CHANGE: "Cliente quer estilo/ritmo diferente",
        QUALITY_ISSUE: "Problema de qualidade do áudio",
        OTHER: "Outros motivos",
    };

    const revisionTypeDesc = input.revisionType && revisionTypeLabels[input.revisionType]
        ? `\n\nTIPO DE REVISÃO: ${revisionTypeLabels[input.revisionType]}`
        : "";

    const genreSection = input.genre
        ? `\n\nGÊNERO MUSICAL: ${input.genre}`
        : "";

    const historySection = input.revisionHistory && input.revisionHistory.length > 0
        ? `\n\nHISTÓRICO DE REVISÕES ANTERIORES:\n${input.revisionHistory.map(r => {
            const typeLabel = r.type && revisionTypeLabels[r.type] ? revisionTypeLabels[r.type] : r.type ?? "N/A";
            const faultLabel = r.fault ?? "N/A";
            return `- Revisão #${r.revisionNumber} (${typeLabel}): "${r.notes ?? "Sem notas"}" [Causa: ${faultLabel}]`;
        }).join("\n")}`
        : "";

    const isPronunciation = input.revisionType === "PRONUNCIATION";

    const phoneticClassification = isPronunciation
        ? `\n   - "phonetic": adicionou acentos para corrigir pronúncia (ex: "Michael" → "Máicol")`
        : "";

    const typeOptions = isPronunciation
        ? "phonetic|factual|spelling|style|other"
        : "factual|spelling|style|other";

    return `LETRA ORIGINAL:
${input.lyrics}
${revisionTypeDesc}${genreSection}${historySection}
NOTAS DE REVISÃO DO CLIENTE:
${input.revisionNotes}
${markedWordsSection}

INSTRUÇÕES:
1. Leia as notas de revisão e faça SOMENTE o que o cliente pediu — nada mais
2. Corrija a letra aplicando APENAS as correções solicitadas pelo cliente — nenhuma outra
3. Mantenha a estrutura e formatação original — copie cada linha que não precisa de mudança EXATAMENTE como está, caractere por caractere, incluindo acentos e grafias intencionais (ex: "espôsa", "nóis")
4. RIMAS: Isto é uma LETRA DE MÚSICA. Toda correção DEVE rimar com as linhas adjacentes. Se o verso original rimava "amar" com "lugar", a correção precisa manter essa rima. Use sinônimos que rimem. A letra deve ser CANTÁVEL.
5. MÉTRICA: Mantenha o número de sílabas similar ao original para que a melodia encaixe
6. NÃO abrevie, reformule, modernize ou "melhore" nenhum trecho que o cliente não mencionou
7. NÃO corrija ortografia ou acentuação que o cliente NÃO mencionou. Grafias "incorretas" podem ser intencionais para o Suno AI cantar corretamente.
8. Classifique cada mudança com o "type" adequado:${phoneticClassification}
   - "factual": mudou informação (ex: corrigir data, trocar nome)
   - "spelling": corrigiu ortografia simples
   - "style": mudança de estilo solicitada
   - "other": outros

FORMATO DE RESPOSTA (JSON):
{
    "correctedLyrics": "... letra corrigida completa ...",
    "changes": [
        {
            "original": "texto original",
            "corrected": "texto corrigido",
            "reason": "motivo da correção",
            "type": "${typeOptions}"
        }
    ]
}

Retorne APENAS o JSON, sem explicações adicionais.`;
}

function cleanPotentialJson(content: string): string {
    let cleanContent = content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

    // Keep only the JSON object when the model adds extra text around it
    const firstBrace = cleanContent.indexOf("{");
    const lastBrace = cleanContent.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanContent = cleanContent.slice(firstBrace, lastBrace + 1);
    }

    // Fix invalid JSON escape sequences
    cleanContent = cleanContent.replace(
        /\\([^"\\/bfnrtu])/g,
        (match, char) => {
            // If it looks like a missing newline (uppercase letter after \)
            if (/[A-Z]/.test(char)) {
                return "\\n" + char;
            }
            // Otherwise escape the backslash
            return "\\\\" + char;
        }
    );

    // Remove trailing commas that LLMs sometimes add
    cleanContent = cleanContent.replace(/,\s*([}\]])/g, "$1");

    return cleanContent;
}

function parseCorrectionResponse(content: string): LyricsCorrectionResult {
    const cleanContent = cleanPotentialJson(content);
    const parsed = JSON.parse(cleanContent) as Partial<LyricsCorrectionResult>;

    if (!parsed.correctedLyrics || typeof parsed.correctedLyrics !== "string") {
        throw new Error("Invalid response: missing correctedLyrics");
    }

    return {
        correctedLyrics: parsed.correctedLyrics,
        displayLyrics: typeof parsed.displayLyrics === "string" ? parsed.displayLyrics : "",
        changes: Array.isArray(parsed.changes) ? parsed.changes as LyricsChange[] : [],
    };
}

function calculateMaxTokens(lyricsLength: number): number {
    const estimated = Math.ceil(lyricsLength * 1.5 + 500) * 0.4 + 4000;
    return Math.max(8000, Math.min(estimated, 16000));
}

function isProbablyTruncatedLyrics(original: string, corrected: string): boolean {
    const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
    const originalNormalized = normalize(original);
    const correctedNormalized = normalize(corrected);

    if (!correctedNormalized) return true;
    if (!originalNormalized) return false;

    // Ignore tiny inputs to avoid false positives.
    if (originalNormalized.length < 120) return false;

    const originalLines = original.split("\n").filter((line) => line.trim().length > 0).length;
    const correctedLines = corrected.split("\n").filter((line) => line.trim().length > 0).length;
    const charRatio = correctedNormalized.length / originalNormalized.length;
    const lineRatio = originalLines > 0 ? correctedLines / originalLines : 1;

    // Severe truncation: both dimensions collapsed
    if (charRatio < 0.55 && lineRatio < 0.55) return true;

    // Partial truncation: either dimension significantly short (e.g. last verse cut)
    if (charRatio < 0.70 || lineRatio < 0.70) return true;

    return false;
}

function extractOpenRouterMessageContent(message: {
    content?: unknown;
    tool_calls?: Array<{ function?: { arguments?: unknown } }>;
}): string | null {
    const content = message.content;

    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        const chunks = content.map((part) => {
            if (typeof part === "string") return part;
            if (!part || typeof part !== "object") return "";

            const text = Reflect.get(part, "text");
            if (typeof text === "string") return text;

            const nestedContent = Reflect.get(part, "content");
            if (typeof nestedContent === "string") return nestedContent;

            const value = Reflect.get(part, "value");
            if (typeof value === "string") return value;

            const jsonPayload = Reflect.get(part, "json");
            if (jsonPayload !== undefined) {
                try {
                    return JSON.stringify(jsonPayload);
                } catch {
                    return "";
                }
            }

            return "";
        }).filter(Boolean);

        if (chunks.length > 0) {
            return chunks.join("");
        }
    }

    const toolArgs = message.tool_calls
        ?.map((toolCall) => toolCall?.function?.arguments)
        .filter((args): args is string => typeof args === "string" && args.trim().length > 0);

    if (toolArgs && toolArgs.length > 0) {
        return toolArgs.join("\n");
    }

    return null;
}

async function requestOpenRouter(
    messages: OpenRouterMessage[],
    options: {
        temperature: number;
        maxTokens: number;
        jsonMode?: boolean;
        timeoutMs?: number;
    }
): Promise<{ content: string; finishReason: string }> {
    const timeoutMs = options.timeoutMs ?? 45000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://apollosong.com",
                "X-Title": "ApolloSong Lyrics Corrector",
            },
            body: JSON.stringify({
                model: env.OPENROUTER_MODEL,
                messages,
                ...(options.jsonMode
                    ? {
                        response_format: { type: "json_object" },
                        plugins: [{ id: "response-healing" }],
                        provider: { require_parameters: true },
                    }
                    : {}),
                temperature: options.temperature,
                max_tokens: options.maxTokens,
            }),
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
        choices?: Array<{
            message?: {
                content?: unknown;
                refusal?: unknown;
                tool_calls?: Array<{ function?: { arguments?: unknown } }>;
            };
            text?: unknown;
            finish_reason?: unknown;
        }>;
        error?: unknown;
    };

    const choice = data.choices?.[0];
    const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
    const messageContent = choice?.message ? extractOpenRouterMessageContent(choice.message) : null;
    if (typeof messageContent === "string" && messageContent.trim().length > 0) {
        return { content: messageContent, finishReason };
    }

    if (typeof choice?.text === "string" && choice.text.trim().length > 0) {
        return { content: choice.text, finishReason };
    }
    const refusal = typeof choice?.message?.refusal === "string" ? choice.message.refusal : null;
    const providerError = (
        data.error &&
        typeof data.error === "object" &&
        "message" in data.error &&
        typeof (data.error as { message?: unknown }).message === "string"
    )
        ? (data.error as { message: string }).message
        : null;
    const detailParts = [
        `finish_reason=${finishReason}`,
        refusal ? `refusal=${refusal.slice(0, 160)}` : null,
        providerError ? `error=${providerError.slice(0, 200)}` : null,
    ].filter(Boolean);
    throw new Error(`No content in OpenRouter response${detailParts.length ? ` (${detailParts.join("; ")})` : ""}`);
}

function isTransientOpenRouterError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
    return (
        message.includes("timed out") ||
        message.includes("fetch failed") ||
        message.includes("openrouter api error: 429") ||
        message.includes("openrouter api error: 500") ||
        message.includes("openrouter api error: 502") ||
        message.includes("openrouter api error: 503") ||
        message.includes("openrouter api error: 504")
    );
}

export async function generateCorrectedLyrics(
    input: LyricsCorrectionInput
): Promise<LyricsCorrectionResult> {
    if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const correctionMessages: OpenRouterMessage[] = [
        {
            role: "system",
            content: buildSystemPrompt(input.genre, input.revisionType, input.locale),
        },
        {
            role: "user",
            content: buildCorrectionPrompt(input),
        },
    ];

    const maxTokens = calculateMaxTokens(input.lyrics.length);

    const { content, finishReason } = await requestOpenRouter(correctionMessages, {
        jsonMode: true,
        temperature: 0.5,
        maxTokens,
        timeoutMs: 45000,
    });

    // Check finish_reason BEFORE parsing — if the model hit the token limit,
    // the JSON is almost certainly incomplete and would cause a confusing parse error.
    if (finishReason === "length") {
        throw new Error(
            `Correction response truncated by token limit (finish_reason=length, max_tokens=${maxTokens}). Please generate again.`
        );
    }

    const result = parseCorrectionResponse(content);
    result.correctedLyrics = expandAbbreviations(result.correctedLyrics);

    const heuristicTruncated = isProbablyTruncatedLyrics(input.lyrics, result.correctedLyrics);

    if (heuristicTruncated) {
        if (finishReason === "stop") {
            // Model naturally finished (stop) but lyrics are shorter — the correction
            // legitimately produced fewer lines. Accept with a warning.
            console.warn(
                `[lyrics-corrector] Heuristic flagged truncation but finish_reason=stop. Accepting result as legitimate.`
            );
        } else {
            throw new Error("Correction response came back truncated. Please generate again.");
        }
    }

    if (!Array.isArray(result.changes)) {
        result.changes = [];
    }

    // Validate each change
    result.changes = result.changes.filter((change): change is LyricsChange => {
        return (
            typeof change.original === "string" &&
            typeof change.corrected === "string" &&
            typeof change.reason === "string" &&
            ["phonetic", "factual", "spelling", "style", "other"].includes(change.type)
        );
    });

    // Generate displayLyrics (for PDF/email — no phonetic corrections)
    if (input.revisionType === "PRONUNCIATION") {
        // For pronunciation revisions: start from original and apply only non-phonetic changes
        const hasNewAccents = (original: string, corrected: string): boolean => {
            const accentPattern = /[áàâãéèêíìîóòôõúùûç]/gi;
            const originalAccents = (original.match(accentPattern) || []).join("").toLowerCase();
            const correctedAccents = (corrected.match(accentPattern) || []).join("").toLowerCase();
            return correctedAccents.length > originalAccents.length ||
                   (correctedAccents !== originalAccents && correctedAccents.length > 0);
        };

        let displayLyrics = input.lyrics;
        const safeChanges = result.changes.filter(c => {
            if (c.type === "phonetic") return false;
            if (hasNewAccents(c.original, c.corrected)) {
                console.log(`[lyrics-corrector] Filtering phonetic change: "${c.original}" → "${c.corrected}" (was classified as ${c.type})`);
                return false;
            }
            return true;
        });

        for (const change of safeChanges) {
            displayLyrics = displayLyrics.split(change.original).join(change.corrected);
        }
        result.displayLyrics = expandAbbreviations(displayLyrics);
    } else {
        // For all other revision types: display = corrected (no phonetic filtering needed)
        result.displayLyrics = expandAbbreviations(result.correctedLyrics);
    }

    const localeForIntegrity = normalizeSupportedLyricsLocale(input.locale);
    if (localeForIntegrity) {
        try {
            const initialLocaleValidation = await validateLocaleIntegrity(
                result.correctedLyrics,
                result.displayLyrics,
                localeForIntegrity
            );
            const initialFindings = [...initialLocaleValidation.correctedFindings, ...initialLocaleValidation.displayFindings];
            const initialIntrusionTerms = Array.from(new Set(
                initialFindings
                    .filter((finding) => finding.classification === "intrusion")
                    .map((finding) => finding.term.trim())
                    .filter(Boolean)
            ));

            const initialCorrectedLang = initialLocaleValidation.correctedDetectedLanguage;
            const initialDisplayLang = initialLocaleValidation.displayDetectedLanguage;
            const initialCorrectedMismatch = initialCorrectedLang !== "unknown" && initialCorrectedLang !== localeForIntegrity;
            const initialDisplayMismatch = initialDisplayLang !== "unknown" && initialDisplayLang !== localeForIntegrity;
            const initialHardMismatch = initialCorrectedMismatch || initialDisplayMismatch;
            const shouldRewriteForLocale = initialIntrusionTerms.length > 0 || initialHardMismatch;

            if (shouldRewriteForLocale) {
                const localeRewrite = await enforceLocaleIntegrity(
                    result.correctedLyrics,
                    result.displayLyrics,
                    localeForIntegrity
                );

                result.correctedLyrics = expandAbbreviations(localeRewrite.correctedLyrics);
                result.displayLyrics = expandAbbreviations(localeRewrite.displayLyrics);

                if (localeRewrite.detectedForeignTerms.length > 0) {
                    console.warn(
                        `[lyrics-corrector] Locale rewrite adjusted foreign terms for ${localeForIntegrity}: ${localeRewrite.detectedForeignTerms.join(", ")}`
                    );
                }

                const localeValidation = await validateLocaleIntegrity(
                    result.correctedLyrics,
                    result.displayLyrics,
                    localeForIntegrity
                );
                const allFindings = [...localeValidation.correctedFindings, ...localeValidation.displayFindings];
                const intrusionTerms = Array.from(new Set(
                    allFindings
                        .filter((finding) => finding.classification === "intrusion")
                        .map((finding) => finding.term.trim())
                        .filter(Boolean)
                ));

                const correctedLang = localeValidation.correctedDetectedLanguage;
                const displayLang = localeValidation.displayDetectedLanguage;
                const correctedMismatch = correctedLang !== "unknown" && correctedLang !== localeForIntegrity;
                const displayMismatch = displayLang !== "unknown" && displayLang !== localeForIntegrity;
                const hardMismatch = correctedMismatch || displayMismatch;

                if (hardMismatch && intrusionTerms.length > 0) {
                    throw new Error(
                        `A validação detectou idioma incorreto. corrected=${correctedLang}, display=${displayLang}, esperado=${localeForIntegrity}, termos=${intrusionTerms.join(", ")}.`
                    );
                }

                if (hardMismatch && intrusionTerms.length === 0) {
                    console.warn(
                        `[lyrics-corrector] Language detector flagged mismatch without intrusions: corrected=${correctedLang}, display=${displayLang}, expected=${localeForIntegrity}`
                    );
                }

                if (intrusionTerms.length > 0) {
                    throw new Error(
                        `A correção IA manteve termos fora do idioma ${LOCALE_LABELS[localeForIntegrity]} (${intrusionTerms.join(", ")}). Gere novamente ou ajuste manualmente.`
                    );
                }
            }
        } catch (error) {
            if (isTransientOpenRouterError(error)) {
                console.warn(
                    `[lyrics-corrector] Locale integrity checks skipped due to transient provider issue: ${error instanceof Error ? error.message : String(error)}`
                );
            } else {
                throw error;
            }
        }
    }

    return result;
}

/**
 * Compute line-by-line diff between original and corrected lyrics
 */
export interface LineDiff {
    lineNumber: number;
    original: string;
    corrected: string;
    isChanged: boolean;
}

export function computeLineDiff(original: string, corrected: string): LineDiff[] {
    const origLines = original.split("\n");
    const corrLines = corrected.split("\n");
    const maxLines = Math.max(origLines.length, corrLines.length);

    const diffs: LineDiff[] = [];
    for (let i = 0; i < maxLines; i++) {
        const origLine = origLines[i] ?? "";
        const corrLine = corrLines[i] ?? "";
        diffs.push({
            lineNumber: i + 1,
            original: origLine,
            corrected: corrLine,
            isChanged: origLine !== corrLine,
        });
    }

    return diffs;
}

/**
 * Find word-level differences within a line
 */
export interface WordDiff {
    text: string;
    isChanged: boolean;
    isAdded: boolean;
    isRemoved: boolean;
}

export function computeWordDiff(original: string, corrected: string): {
    originalWords: WordDiff[];
    correctedWords: WordDiff[];
} {
    // Split into tokens keeping whitespace as separate entries
    const origTokens = original.split(/(\s+)/);
    const corrTokens = corrected.split(/(\s+)/);

    // Extract only the actual words (skip whitespace) for LCS
    const origWords = origTokens.filter((t) => !/^\s*$/.test(t));
    const corrWords = corrTokens.filter((t) => !/^\s*$/.test(t));

    // LCS (Longest Common Subsequence) to find positional matches
    const m = origWords.length;
    const n = corrWords.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (origWords[i - 1] === corrWords[j - 1]) {
                dp[i]![j] = dp[i - 1]![j - 1]! + 1;
            } else {
                dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
            }
        }
    }

    // Backtrack to find which word indices are in the LCS
    const origInLcs = new Set<number>();
    const corrInLcs = new Set<number>();
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (origWords[i - 1] === corrWords[j - 1]) {
            origInLcs.add(i - 1);
            corrInLcs.add(j - 1);
            i--; j--;
        } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
            i--;
        } else {
            j--;
        }
    }

    // Map back to token arrays (which include whitespace)
    let origWordIdx = 0;
    const originalWords: WordDiff[] = origTokens.map((token) => {
        if (/^\s*$/.test(token)) {
            return { text: token, isChanged: false, isAdded: false, isRemoved: false };
        }
        const inLcs = origInLcs.has(origWordIdx);
        origWordIdx++;
        return { text: token, isChanged: !inLcs, isAdded: false, isRemoved: !inLcs };
    });

    let corrWordIdx = 0;
    const correctedWords: WordDiff[] = corrTokens.map((token) => {
        if (/^\s*$/.test(token)) {
            return { text: token, isChanged: false, isAdded: false, isRemoved: false };
        }
        const inLcs = corrInLcs.has(corrWordIdx);
        corrWordIdx++;
        return { text: token, isChanged: !inLcs, isAdded: !inLcs, isRemoved: false };
    });

    return { originalWords, correctedWords };
}
