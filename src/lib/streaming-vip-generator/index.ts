/**
 * Streaming VIP generator service using OpenRouter LLM
 * Generates song name suggestions and cover art prompts
 */

const env = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_SUPPORT_MODEL || "openai/gpt-4.1-mini",
};

export interface SongNameInput {
    lyrics: string;
    recipientName: string;
    genre: string;
    locale: string;
}

export interface CoverPromptsInput {
    lyrics: string;
    recipientName: string;
    genre: string;
    qualities: string;
    locale: string;
    songName?: string;
    customPrompt?: string;
}

export interface CoverPromptsResult {
    cartoon: string;
    photo: string;
    photoImproved: string;
}

function normalizeCoverPromptValue(value: string | null | undefined, fallback: string): string {
    const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
    return cleaned || fallback;
}

function normalizeSuggestedName(rawName: string): string {
    return rawName
        .replace(/^(?:[-*•]\s*|\d+[\.\-\)\]]\s*)/, "")
        .replace(/^["']+|["']+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getRecipientPrefix(recipientName: string): string {
    return recipientName
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(" ");
}

function withRecipientPrefix(name: string, recipientPrefix: string): string {
    const cleaned = normalizeSuggestedName(name);
    if (!cleaned) return "";
    if (!recipientPrefix) return cleaned;

    const escapedPrefix = recipientPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactPrefixRegex = new RegExp(`^${escapedPrefix}\\s*-\\s*`, "i");
    if (exactPrefixRegex.test(cleaned)) {
        return cleaned.replace(exactPrefixRegex, `${recipientPrefix} - `);
    }

    const existingPrefixMatch = cleaned.match(/^(.+?)\s-\s(.+)$/);
    if (existingPrefixMatch?.[2]) {
        return `${recipientPrefix} - ${existingPrefixMatch[2].trim()}`;
    }

    return `${recipientPrefix} - ${cleaned}`;
}

function dedupeSuggestions(names: string[], recipientPrefix: string): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();

    for (const rawName of names) {
        const normalized = withRecipientPrefix(rawName, recipientPrefix);
        if (!normalized || normalized.length > 100) continue;

        const key = normalized
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(normalized);

        if (unique.length >= 5) break;
    }

    return unique;
}

/**
 * Call OpenRouter API with given messages
 */
async function callOpenRouter(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; maxTokens?: number; title: string }
): Promise<string> {
    if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY not configured");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://apollosong.com",
            "X-Title": `ApolloSong ${options.title}`,
        },
        body: JSON.stringify({
            model: env.OPENROUTER_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 500,
            top_p: 0.9,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };

    if (data.error) {
        throw new Error(`OpenRouter API error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("No content returned from OpenRouter API");
    }

    return content.trim();
}

/**
 * Generate 5 song name suggestions based on lyrics
 */
export async function generateSongNameSuggestions(input: SongNameInput): Promise<string[]> {
    const recipientPrefix = getRecipientPrefix(input.recipientName ?? "");

    const systemPrompt = input.locale === "pt"
        ? "Você é um especialista em criar nomes de músicas emocionantes, específicos e memoráveis para plataformas de streaming."
        : input.locale === "es"
            ? "Eres un experto en crear nombres de canciones emotivos, específicos y memorables para plataformas de streaming."
            : input.locale === "fr"
                ? "Vous êtes un expert en création de noms de chansons émouvants, spécifiques et mémorables pour les plateformes de streaming."
                : input.locale === "it"
                    ? "Sei un esperto nella creazione di nomi di canzoni emozionanti, specifici e memorabili per le piattaforme di streaming."
                    : "You are an expert in creating emotional, specific, and memorable song names for streaming platforms.";

    const userPrompt = input.locale === "pt"
        ? `CONTEXTO:
- Letra da música:
${input.lyrics}

- Nome do homenageado: ${input.recipientName}
- Gênero musical: ${input.genre}

TAREFA:
Gere 5 sugestões de nomes para esta música personalizada, com alto nível de criatividade e especificidade.

REQUISITOS:
1. OBRIGATÓRIO: Todos os nomes DEVEM começar com o primeiro e segundo nome (se houver) do homenageado "${recipientPrefix}" seguido de " - " e depois o título criativo. Exemplo: "${recipientPrefix} - Oração do Coração"
2. A parte do título (depois do " - ") deve ter 3 a 6 palavras.
3. Cada sugestão deve explorar um ângulo diferente da canção (ex: intimista, poético, espiritual, cinematográfico, pop).
4. Use elementos concretos da letra (imagem, ação, cenário, promessa, símbolo), evitando abstrações vagas.
5. Evite nomes genéricos/repetitivos como: "Meu Eterno Amor", "Nossa História", "Amor Sem Fim", "Luz e União", "Dona do Coração".
6. Não repetir estrutura sintática nos 5 títulos (evite começar todos com "Meu", "Nosso", "Para", etc.).
7. Apropriados para plataformas de streaming (Spotify, Apple Music), soando naturais e memoráveis.

FORMATO DE SAÍDA:
Retorne APENAS um array JSON com 5 strings, sem explicações:
["${recipientPrefix} - Título 1", "${recipientPrefix} - Título 2", "${recipientPrefix} - Título 3", "${recipientPrefix} - Título 4", "${recipientPrefix} - Título 5"]`
        : input.locale === "es"
            ? `CONTEXTO:
- Letra de la canción:
${input.lyrics}

- Nombre del homenajeado: ${input.recipientName}
- Género musical: ${input.genre}

TAREA:
Genera 5 sugerencias de nombres para esta canción personalizada, con alto nivel de creatividad y especificidad.

REQUISITOS:
1. OBLIGATORIO: Todos los nombres DEBEN comenzar con el primer y segundo nombre (si existe) del homenajeado "${recipientPrefix}" seguido de " - " y luego el título creativo. Ejemplo: "${recipientPrefix} - Oración del Corazón"
2. La parte del título (después del " - ") debe tener 3 a 6 palabras.
3. Cada sugerencia debe explorar un ángulo distinto de la canción (ej.: íntimo, poético, espiritual, cinematográfico, pop).
4. Usa elementos concretos de la letra (imagen, acción, escenario, promesa, símbolo), evitando abstracciones vagas.
5. Evita nombres genéricos o repetitivos como: "Mi Eterno Amor", "Nuestra Historia", "Amor Sin Fin", "Luz y Unión", "Dueña del Corazón".
6. No repitas la misma estructura sintáctica en los 5 títulos (evita empezar todos con "Mi", "Nuestro", "Para", etc.).
7. Deben ser apropiados para plataformas de streaming (Spotify, Apple Music), con un sonido natural y memorable.

FORMATO DE SALIDA:
Devuelve SOLO un array JSON con 5 strings, sin explicaciones:
["${recipientPrefix} - Título 1", "${recipientPrefix} - Título 2", "${recipientPrefix} - Título 3", "${recipientPrefix} - Título 4", "${recipientPrefix} - Título 5"]`
            : input.locale === "fr"
                ? `CONTEXTE:
- Paroles de la chanson:
${input.lyrics}

- Nom de la personne honorée: ${input.recipientName}
- Genre musical: ${input.genre}

TÂCHE:
Génère 5 suggestions de noms pour cette chanson personnalisée, avec un haut niveau de créativité et de précision.

EXIGENCES:
1. OBLIGATOIRE: Tous les noms DOIVENT commencer par le prénom et le nom (si disponible) de la personne honorée "${recipientPrefix}" suivi de " - " puis le titre créatif. Exemple: "${recipientPrefix} - Prière du Cœur"
2. La partie du titre (après " - ") doit contenir 3 à 6 mots.
3. Chaque suggestion doit explorer un angle différent de la chanson (ex.: intime, poétique, spirituel, cinématographique, pop).
4. Utilise des éléments concrets des paroles (image, action, décor, promesse, symbole), en évitant les abstractions vagues.
5. Évite les noms génériques/répétitifs comme: "Mon Amour Éternel", "Notre Histoire", "Amour Sans Fin", "Lumière et Union", "Reine de Mon Cœur".
6. Ne répète pas la même structure syntaxique dans les 5 titres (évite de tous commencer par "Mon", "Notre", "Pour", etc.).
7. Les titres doivent être adaptés aux plateformes de streaming (Spotify, Apple Music), naturels et mémorables.

FORMAT DE SORTIE:
Retourne UNIQUEMENT un tableau JSON avec 5 strings, sans explications:
["${recipientPrefix} - Titre 1", "${recipientPrefix} - Titre 2", "${recipientPrefix} - Titre 3", "${recipientPrefix} - Titre 4", "${recipientPrefix} - Titre 5"]`
                : input.locale === "it"
                    ? `CONTESTO:
- Testo della canzone:
${input.lyrics}

- Nome dell'omaggiato: ${input.recipientName}
- Genere musicale: ${input.genre}

COMPITO:
Genera 5 suggerimenti di nomi per questa canzone personalizzata, con alto livello di creatività e specificità.

REQUISITI:
1. OBBLIGATORIO: Tutti i nomi DEVONO iniziare con il primo e secondo nome (se presente) dell'omaggiato "${recipientPrefix}" seguito da " - " e poi il titolo creativo. Esempio: "${recipientPrefix} - Preghiera del Cuore"
2. La parte del titolo (dopo " - ") deve avere da 3 a 6 parole.
3. Ogni suggerimento deve esplorare un'angolazione diversa della canzone (es.: intima, poetica, spirituale, cinematografica, pop).
4. Usa elementi concreti del testo (immagine, azione, scenario, promessa, simbolo), evitando astrazioni vaghe.
5. Evita nomi generici/ripetitivi come: "Il Mio Amore Eterno", "La Nostra Storia", "Amore Senza Fine", "Luce e Unione", "Regina del Cuore".
6. Non ripetere la stessa struttura sintattica nei 5 titoli (evita di iniziare tutti con "Mio", "Nostro", "Per", ecc.).
7. Devono essere adatti alle piattaforme di streaming (Spotify, Apple Music), con un suono naturale e memorabile.

FORMATO DI USCITA:
Restituisci SOLO un array JSON con 5 stringhe, senza spiegazioni:
["${recipientPrefix} - Titolo 1", "${recipientPrefix} - Titolo 2", "${recipientPrefix} - Titolo 3", "${recipientPrefix} - Titolo 4", "${recipientPrefix} - Titolo 5"]`
                    : `CONTEXT:
- Song lyrics:
${input.lyrics}

- Honoree name: ${input.recipientName}
- Music genre: ${input.genre}

TASK:
Generate 5 name suggestions for this personalized song with a high level of creativity and specificity.

REQUIREMENTS:
1. MANDATORY: All names MUST start with the honoree's first and second names (if available) "${recipientPrefix}" followed by " - " and then the creative title. Example: "${recipientPrefix} - Prayer of the Heart"
2. The title part (after " - ") must be 3 to 6 words.
3. Each suggestion should explore a different angle of the song (e.g., intimate, poetic, spiritual, cinematic, pop).
4. Use concrete elements from the lyrics (image, action, setting, promise, symbol), avoiding vague abstractions.
5. Avoid generic/repetitive names such as: "My Eternal Love", "Our Story", "Endless Love", "Light and Union", "Queen of My Heart".
6. Do not repeat the same syntactic structure across all 5 titles (avoid starting all with "My", "Our", "For", etc.).
7. Must be appropriate for streaming platforms (Spotify, Apple Music), sounding natural and memorable.

OUTPUT FORMAT:
Return ONLY a JSON array with 5 strings, no explanations:
["${recipientPrefix} - Title 1", "${recipientPrefix} - Title 2", "${recipientPrefix} - Title 3", "${recipientPrefix} - Title 4", "${recipientPrefix} - Title 5"]`;

    const response = await callOpenRouter(systemPrompt, userPrompt, {
        temperature: 0.95,
        maxTokens: 300,
        title: "Song Name Generator",
    });

    // Parse JSON array from response
    try {
        // Try to extract JSON array from response (in case LLM added extra text)
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const names = JSON.parse(jsonMatch[0]) as string[];
            if (Array.isArray(names) && names.length > 0) {
                const deduped = dedupeSuggestions(names, recipientPrefix);
                if (deduped.length > 0) return deduped;
            }
        }
        throw new Error("Invalid response format");
    } catch {
        // If parsing fails, try to extract names line by line
        const lines = response.split("\n").filter(line => line.trim());
        const names = lines
            .map(line => normalizeSuggestedName(line))
            .filter(name => name.length > 0 && name.length < 100);
        if (names.length > 0) {
            const deduped = dedupeSuggestions(names, recipientPrefix);
            if (deduped.length > 0) return deduped;
        }
        throw new Error("Failed to parse song name suggestions");
    }
}

/**
 * Generate fixed cover prompts for admin workflow
 * (cartoon + original photo with original pose + original photo with improved pose).
 */
export async function generateCoverPrompts(input: CoverPromptsInput): Promise<CoverPromptsResult> {
    const songTitle = normalizeCoverPromptValue(input.songName, "Homenagem Especial");
    const recipientName = normalizeCoverPromptValue(input.recipientName, "Pessoa homenageada");
    const genre = normalizeCoverPromptValue(input.genre, "pop");
    const qualities = normalizeCoverPromptValue(input.qualities, "amor, gratidão e celebração");
    const customInstruction = normalizeCoverPromptValue(input.customPrompt, "");
    const customSuffix = customInstruction
        ? ` Additional creative direction from admin: ${customInstruction}.`
        : "";

    const photo = `Using the attached original photo of ${recipientName}, create a premium 1:1 (square) music cover for the song "${songTitle}". Keep the photo original and recognizable (same faces and identities, no face replacement, no extra people). If the attached photo contains more than one person, keep ALL original people visible and recognizable; do not remove, crop out, blur, merge, or replace anyone. Preserve the original relative position, pose, and spacing of each person exactly as in the provided photo; do not swap people, relocate them, or recompose the group layout. Place the title "${songTitle}" clearly on the cover with readable typography, strong contrast, and safe margins for streaming thumbnails. Keep ${recipientName} as the central focus when possible while preserving every original person in the frame, add tasteful cinematic lighting/color grading aligned with ${genre}, and include minimal symbolic accents inspired by ${qualities} without cluttering the frame. Keep the scene grounded in real life with natural perspective and a warm celebratory mood. IMPORTANT: Do NOT use halo/aureole around the head, angel wings, floating clouds, heavenly gates, ascension rays, or any funeral/memorial visual language. If faith appears in the theme, use subtle earthly symbols instead of supernatural saint-like imagery. Final result must look professional and release-ready for Spotify/Apple Music.${customSuffix}`;

    const photoImproved = `Using the attached original photo of ${recipientName}, create a premium 1:1 (square) music cover for the song "${songTitle}". Keep all faces and identities exactly the same people from the original photo (no face swap, no replacement, no extra people). If the attached photo contains more than one person, keep ALL original people visible and recognizable. You may improve pose, posture, and overall body language to create a more flattering and expressive composition, but keep each person's face, identity, and age characteristics faithful to the original. Keep the same group coherence and natural interaction while refining framing and visual balance. Place the title "${songTitle}" clearly on the cover with readable typography, strong contrast, and safe margins for streaming thumbnails. Apply cinematic lighting/color grading aligned with ${genre}, add minimal symbolic accents inspired by ${qualities}, and keep a warm celebratory tone. IMPORTANT: Do NOT use halo/aureole around the head, angel wings, floating clouds, heavenly gates, ascension rays, or funeral/memorial visual language. Final result must look professional and release-ready for Spotify/Apple Music.${customSuffix}`;

    // Keep this EXACTLY aligned with the fixed backend cartoon prompt used in song-order router.
    const cartoon = `Using the attached photo of ${recipientName}, create a 1:1 format cartoon-style album cover for "${songTitle}" in a vibrant, stylized 3D digital art style reminiscent of high-end animation. Keep all original people from the photo visible and recognizable; do not remove, replace, merge, or add extra faces. ${recipientName} should appear as a charismatic main character in a symbolic visual world inspired by ${qualities}, with dynamic composition and premium streaming-quality finish. Use bold shapes, rich textures, and a cohesive palette aligned with ${genre}. Place the title "${songTitle}" clearly with excellent readability and safe margins for thumbnails, leaving a clean title-safe area while preserving emotional warmth and celebration.`;

    return { cartoon, photo, photoImproved };
}
