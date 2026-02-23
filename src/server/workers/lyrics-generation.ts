import "dotenv/config";

import IORedis from "ioredis";
import { Worker } from "bullmq";
import { db } from "../db";

// Import shared constants, types, and prompt builders from the lib
import {
    GENRE_NAMES,
    GENRE_INSTRUCTIONS,
    type LyricsInput,
    type SupportedLocale,
    getLocale,
    generateLyrics as generateLyricsWithRules,
} from "../../lib/lyrics-generator";
import { normalizeVocals } from "../../lib/vocals";
import { getSunoStylePrompt } from "../services/suno/genre-mapping";

// ============= CONFIG =============
const QUEUE_NAME = "lyrics-generation";
const LYRICS_SUPPORTED_ORDER_TYPES = new Set(["MAIN", "EXTRA_SONG", "GENRE_VARIANT"]);
const REDIS_URL = process.env.REDIS_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";

// Validate required environment variables
if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
}
if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for lyrics generation worker");
}

// ============= PRISMA =============
//db imported from ../db

// ============= REDIS =============
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ============= TYPES =============
type LyricsGenerationJob = {
    orderId: string;
};

// ============= LYRICS ADAPTATION FOR GENRE VARIANTS =============
async function adaptLyricsForGenre(
    originalLyrics: string,
    originalGenre: string,
    targetGenre: string,
    locale: string
): Promise<string> {
    const lang = getLocale(locale);
    const originalGenreName = GENRE_NAMES[originalGenre]?.[lang] || originalGenre;
    const targetGenreName = GENRE_NAMES[targetGenre]?.[lang] || targetGenre;
    const targetInstructions = GENRE_INSTRUCTIONS[targetGenre]?.[lang] || GENRE_INSTRUCTIONS.pop![lang];

    const prompts: Record<SupportedLocale, string> = {
        pt: `Você é um letrista profissional especializado em adaptação de músicas entre gêneros.

TAREFA:
Adapte sutilmente a letra abaixo, originalmente escrita para ${originalGenreName}, para o gênero ${targetGenreName}.

REGRAS IMPORTANTES:
1. MANTENHA 100% da história, mensagem emocional e essência da letra original
2. PRESERVE a estrutura (versos, refrão, ponte) - mesma quantidade de linhas
3. PRESERVE todos os nomes próprios mencionados
4. Faça APENAS adaptações sutis necessárias para:
   - Usar vocabulário e expressões típicas de ${targetGenreName}
   - Ajustar rimas que funcionem melhor com a melodia de ${targetGenreName}
   - Adaptar referências culturais ao estilo ${targetGenreName}
5. NÃO reescreva a letra - apenas ajuste palavras e expressões onde necessário
6. Se uma linha já funciona bem para ${targetGenreName}, MANTENHA ela igual

INSTRUÇÕES DO GÊNERO ${targetGenreName.toUpperCase()}:
${targetInstructions}

LETRA ORIGINAL (${originalGenreName}):
${originalLyrics}

FORMATO DE SAÍDA:
Retorne APENAS a letra adaptada, com os mesmos rótulos de seção [Verso 1], [Refrão], etc.
Não inclua explicações - apenas a letra adaptada.`,

        es: `Eres un letrista profesional especializado en adaptar canciones entre géneros.

TAREA:
Adapta sutilmente la letra a continuación, originalmente escrita para ${originalGenreName}, al género ${targetGenreName}.

REGLAS IMPORTANTES:
1. MANTÉN el 100% de la historia, mensaje emocional y esencia de la letra original
2. PRESERVA la estructura (versos, estribillo, puente) - misma cantidad de líneas
3. PRESERVA todos los nombres propios mencionados
4. Haz SOLO adaptaciones sutiles necesarias para:
   - Usar vocabulario y expresiones típicas de ${targetGenreName}
   - Ajustar rimas que funcionen mejor con la melodía de ${targetGenreName}
   - Adaptar referencias culturales al estilo ${targetGenreName}
5. NO reescribas la letra - solo ajusta palabras y expresiones donde sea necesario
6. Si una línea ya funciona bien para ${targetGenreName}, MANTENLA igual

INSTRUCCIONES DEL GÉNERO ${targetGenreName.toUpperCase()}:
${targetInstructions}

LETRA ORIGINAL (${originalGenreName}):
${originalLyrics}

FORMATO DE SALIDA:
Devuelve SOLO la letra adaptada, con las mismas etiquetas de sección [Verso 1], [Estribillo], etc.
No incluyas explicaciones - solo la letra adaptada.`,

        fr: `Tu es un parolier professionnel spécialisé dans l'adaptation de chansons entre genres.

TÂCHE:
Adapte subtilement les paroles ci-dessous, originalement écrites pour ${originalGenreName}, au genre ${targetGenreName}.

RÈGLES IMPORTANTES:
1. GARDE 100% de l'histoire, du message émotionnel et de l'essence des paroles originales
2. PRÉSERVE la structure (couplets, refrain, pont) - même nombre de lignes
3. PRÉSERVE tous les noms propres mentionnés
4. Fais UNIQUEMENT les adaptations subtiles nécessaires pour:
   - Utiliser le vocabulaire et les expressions typiques de ${targetGenreName}
   - Ajuster les rimes qui fonctionnent mieux avec la mélodie de ${targetGenreName}
   - Adapter les références culturelles au style ${targetGenreName}
5. NE réécris PAS les paroles - ajuste seulement les mots et expressions où nécessaire
6. Si une ligne fonctionne déjà bien pour ${targetGenreName}, GARDE-la telle quelle

INSTRUCTIONS DU GENRE ${targetGenreName.toUpperCase()}:
${targetInstructions}

PAROLES ORIGINALES (${originalGenreName}):
${originalLyrics}

FORMAT DE SORTIE:
Retourne UNIQUEMENT les paroles adaptées, avec les mêmes étiquettes de section [Couplet 1], [Refrain], etc.
N'inclus pas d'explications - seulement les paroles adaptées.`,

        it: `Sei un paroliere professionista specializzato nell'adattare canzoni tra generi.

COMPITO:
Adatta sottilmente i testi qui sotto, originariamente scritti per ${originalGenreName}, al genere ${targetGenreName}.

REGOLE IMPORTANTI:
1. MANTIENI il 100% della storia, messaggio emotivo ed essenza dei testi originali
2. PRESERVA la struttura (strofe, ritornello, ponte) - stesso numero di righe
3. PRESERVA tutti i nomi propri menzionati
4. Fai SOLO adattamenti sottili necessari per:
   - Usare vocabolario ed espressioni tipiche di ${targetGenreName}
   - Aggiustare rime che funzionano meglio con la melodia di ${targetGenreName}
   - Adattare riferimenti culturali allo stile ${targetGenreName}
5. NON riscrivere i testi - aggiusta solo parole ed espressioni dove necessario
6. Se una riga funziona già bene per ${targetGenreName}, MANTIENILA uguale

ISTRUZIONI DEL GENERE ${targetGenreName.toUpperCase()}:
${targetInstructions}

TESTI ORIGINALI (${originalGenreName}):
${originalLyrics}

FORMATO DI OUTPUT:
Restituisci SOLO i testi adattati, con le stesse etichette di sezione [Strofa 1], [Ritornello], ecc.
Non includere spiegazioni - solo i testi adattati.`,

        en: `You are a professional lyricist specialized in adapting songs between genres.

TASK:
Subtly adapt the lyrics below, originally written for ${originalGenreName}, to the ${targetGenreName} genre.

IMPORTANT RULES:
1. KEEP 100% of the story, emotional message, and essence of the original lyrics
2. PRESERVE the structure (verses, chorus, bridge) - same number of lines
3. PRESERVE all proper names mentioned
4. Make ONLY subtle adaptations necessary to:
   - Use vocabulary and expressions typical of ${targetGenreName}
   - Adjust rhymes that work better with ${targetGenreName} melody
   - Adapt cultural references to ${targetGenreName} style
5. DO NOT rewrite the lyrics - only adjust words and expressions where necessary
6. If a line already works well for ${targetGenreName}, KEEP it the same

${targetGenreName.toUpperCase()} GENRE INSTRUCTIONS:
${targetInstructions}

ORIGINAL LYRICS (${originalGenreName}):
${originalLyrics}

OUTPUT FORMAT:
Return ONLY the adapted lyrics, with the same section labels [Verse 1], [Chorus], etc.
Do not include explanations - just the adapted lyrics.`,
    };

    const systemMessages: Record<SupportedLocale, string> = {
        pt: "Você é um letrista profissional que faz adaptações sutis de letras entre gêneros musicais, preservando a essência e história original.",
        es: "Eres un letrista profesional que hace adaptaciones sutiles de letras entre géneros musicales, preservando la esencia e historia original.",
        fr: "Tu es un parolier professionnel qui fait des adaptations subtiles de paroles entre genres musicaux, en préservant l'essence et l'histoire originale.",
        it: "Sei un paroliere professionista che fa adattamenti sottili di testi tra generi musicali, preservando l'essenza e la storia originale.",
        en: "You are a professional lyricist who makes subtle adaptations of lyrics between musical genres, preserving the original essence and story.",
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://apollosong.com",
            "X-Title": "ApolloSong Lyrics Adapter",
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
                {
                    role: "system",
                    content: systemMessages[lang],
                },
                {
                    role: "user",
                    content: prompts[lang],
                },
            ],
            temperature: 0.6,
            max_tokens: 2000,
            top_p: 0.9,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error during lyrics adaptation: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };

    if (data.error) {
        throw new Error(`OpenRouter API error: ${data.error.message}`);
    }

    const adaptedLyrics = data.choices?.[0]?.message?.content?.trim();

    if (!adaptedLyrics) {
        throw new Error("No adapted lyrics returned from OpenRouter API");
    }

    return adaptedLyrics;
}


// ============= PRONUNCIATION CORRECTION HELPER =============
async function applyPronunciationCorrections(text: string): Promise<string> {
    try {
        const corrections = await db.pronunciationCorrection.findMany();

        // Sort by length (descending) to handle subsets correctly (e.g. replace "New York" before "New")
        corrections.sort((a, b) => b.original.length - a.original.length);

        const wordChars = "[\\p{L}\\p{M}\\p{N}_]";
        let correctedText = text.normalize("NFC");
        for (const { original, replacement } of corrections) {
            const normalizedOriginal = original.normalize("NFC");
            const normalizedReplacement = replacement.normalize("NFC");
            // Escape special regex chars
            const escapedOriginal = normalizedOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Match whole words/phrases using Unicode-aware boundaries
            const regex = new RegExp(`(?<!${wordChars})${escapedOriginal}(?!${wordChars})`, "giu");
            correctedText = correctedText.replace(regex, normalizedReplacement);
        }
        return correctedText;
    } catch (error) {
        console.error("Failed to apply pronunciation corrections:", error);
        return text; // Return original text on error to fail gracefully
    }
}

// ============= LYRICS GENERATION =============
async function generateLyrics(
    input: LyricsInput
): Promise<{ lyrics: string; displayLyrics: string; musicPrompt: string; prompt: string }> {
    const pronunciationCorrections = await db.pronunciationCorrection.findMany({
        select: { original: true, replacement: true },
    });

    return generateLyricsWithRules({
        ...input,
        pronunciationCorrections,
    });
}

// ============= WORKER =============
const worker = new Worker<LyricsGenerationJob>(
    QUEUE_NAME,
    async (job) => {
        const { orderId } = job.data;

        console.log(`🎵 Starting lyrics generation for order ${orderId}`);

        // Fetch order data
        const order = await db.songOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                recipientName: true,
                recipient: true,
                genre: true,
                vocals: true,
                qualities: true,
                memories: true,
                message: true,
                locale: true,
                status: true,
                lyrics: true,
                lyricsStatus: true,
                orderType: true,
                parentOrderId: true,
                keepParentLyrics: true,
                adaptFromParentLyrics: true,
            },
        });

        if (!order) {
            console.log(`Order ${orderId} not found, skipping lyrics generation`);
            return;
        }

        if (!LYRICS_SUPPORTED_ORDER_TYPES.has(order.orderType)) {
            console.log(`[Lyrics Worker] Order ${orderId} type=${order.orderType} does not require lyrics generation, skipping`);
            return;
        }

        // Only generate for paid orders
        if (order.status !== "PAID" && order.status !== "IN_PROGRESS" && order.status !== "COMPLETED") {
            console.log(`Order ${orderId} status is ${order.status}, skipping lyrics generation`);
            return;
        }

        // Skip if already completed
        if (order.lyricsStatus === "completed") {
            console.log(`Order ${orderId} already has completed lyrics, skipping`);
            return;
        }

        const isGenreVariant = order.orderType === "GENRE_VARIANT";
        const isExtraSong = order.orderType === "EXTRA_SONG";

        // For EXTRA_SONG, fetch parent lyrics to avoid repetition
        let parentLyrics: string | undefined;
        if (isExtraSong && order.parentOrderId) {
            const parentOrder = await db.songOrder.findUnique({
                where: { id: order.parentOrderId },
                select: { lyrics: true },
            });
            if (parentOrder?.lyrics) {
                parentLyrics = parentOrder.lyrics;
                console.log(`[Lyrics Worker] Found parent lyrics for EXTRA_SONG ${orderId}, will avoid repetition`);
            }
        }

        // GENRE_VARIANT with keepParentLyrics: Only generate musicPrompt
        if (isGenreVariant && order.keepParentLyrics && order.lyrics) {
            console.log(`[Lyrics Worker] GENRE_VARIANT with keepParentLyrics - generating musicPrompt only for ${orderId}`);

            await db.songOrder.update({
                where: { id: orderId },
                data: { lyricsStatus: "generating", lyricsError: null },
            });

            try {
                const musicPrompt = await getSunoStylePrompt(order.genre, order.locale || "pt", order.vocals);

                await db.songOrder.update({
                    where: { id: orderId },
                    data: {
                        musicPrompt,
                        lyricsStatus: "completed",
                        lyricsGeneratedAt: new Date(),
                        lyricsError: null,
                    },
                });

                console.log(`✅ GENRE_VARIANT musicPrompt generated (lyrics kept from parent) for order ${orderId}`);
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                console.error(`❌ Failed to generate musicPrompt for order ${orderId}:`, errorMessage);

                await db.songOrder.update({
                    where: { id: orderId },
                    data: {
                        lyricsStatus: "failed",
                        lyricsError: errorMessage,
                    },
                });

                throw error;
            }
        }

        // GENRE_VARIANT with adaptFromParentLyrics: Adapt lyrics from parent
        if (isGenreVariant && order.adaptFromParentLyrics && order.parentOrderId) {
            console.log(`[Lyrics Worker] GENRE_VARIANT with adaptFromParentLyrics - adapting lyrics for ${orderId}`);

            // Fetch parent lyrics for adaptation
            const parentOrder = await db.songOrder.findUnique({
                where: { id: order.parentOrderId },
                select: { lyrics: true, correctedLyrics: true, genre: true },
            });

            const parentLyricsToAdapt = parentOrder?.correctedLyrics ?? parentOrder?.lyrics;
            const parentGenre = parentOrder?.genre;

            if (parentLyricsToAdapt && parentGenre) {
                await db.songOrder.update({
                    where: { id: orderId },
                    data: { lyricsStatus: "generating", lyricsError: null },
                });

                try {
                    // Adapt lyrics for the new genre
                    const adaptedLyrics = await adaptLyricsForGenre(
                        parentLyricsToAdapt,
                        parentGenre,
                        order.genre,
                        order.locale
                    );

                    // Apply pronunciation corrections to adapted lyrics
                    const correctedAdaptedLyrics = await applyPronunciationCorrections(adaptedLyrics);

                    // Get musicPrompt from DB/hardcoded
                    const musicPrompt = await getSunoStylePrompt(order.genre, order.locale || "pt", order.vocals);

                    await db.songOrder.update({
                        where: { id: orderId },
                        data: {
                            lyrics: correctedAdaptedLyrics,
                            displayLyrics: adaptedLyrics,
                            musicPrompt,
                            lyricsStatus: "completed",
                            lyricsGeneratedAt: new Date(),
                            lyricsError: null,
                        },
                    });

                    console.log(`✅ GENRE_VARIANT lyrics adapted from parent for order ${orderId}`);
                    return;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    console.error(`❌ Failed to adapt lyrics for order ${orderId}:`, errorMessage);

                    await db.songOrder.update({
                        where: { id: orderId },
                        data: {
                            lyricsStatus: "failed",
                            lyricsError: errorMessage,
                        },
                    });

                    throw error;
                }
            } else {
                console.log(`[Lyrics Worker] Parent lyrics not found for adaptation, falling back to generating from scratch for ${orderId}`);
            }
        }

        // MAIN, GENRE_VARIANT (default), and EXTRA_SONG orders: Generate full lyrics from scratch
        await db.songOrder.update({
            where: { id: orderId },
            data: { lyricsStatus: "generating", lyricsError: null },
        });

        try {
	            const result = await generateLyrics({
	                recipientName: order.recipientName,
	                recipient: order.recipient,
	                genre: order.genre,
	                vocals: normalizeVocals(order.vocals),
	                qualities: order.qualities,
	                memories: order.memories,
	                message: order.message,
	                locale: order.locale,
	                avoidLyrics: parentLyrics,
	            });

            await db.songOrder.update({
                where: { id: orderId },
                data: {
                    lyrics: result.lyrics,
                    displayLyrics: result.displayLyrics,
                    musicPrompt: result.musicPrompt,
                    lyricsStatus: "completed",
                    lyricsGeneratedAt: new Date(),
                    lyricsError: null,
                },
            });

            console.log(
                isGenreVariant
                    ? `✅ GENRE_VARIANT lyrics generated from scratch for order ${orderId}`
                    : `✅ Lyrics generation completed for order ${orderId}`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`❌ Failed to generate lyrics for order ${orderId}:`, errorMessage);

            await db.songOrder.update({
                where: { id: orderId },
                data: {
                    lyricsStatus: "failed",
                    lyricsError: errorMessage,
                },
            });

            throw error;
        }
    },
    {
        connection,
        concurrency: 3,
        limiter: {
            max: 10,
            duration: 60000,
        },
    }
);

worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed for order ${job.data.orderId}`);
});

worker.on("failed", (job, error) => {
    console.error(`❌ Job ${job?.id} failed for order ${job?.data.orderId}:`, error.message);
});

worker.on("ready", () => {
    console.log("🚀 Lyrics generation worker started and ready");
});

// ============= SHUTDOWN =============
const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.close();
    await connection.quit();
    await db.$disconnect();
};

process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
});
