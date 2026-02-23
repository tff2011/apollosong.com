/**
 * Genre mapping from internal system genres to Suno AI style prompts
 * Each genre is mapped to a descriptive style string that Suno understands
 *
 * Now uses database with in-memory caching (5 minute TTL)
 * Fallback to hardcoded values if database is empty
 */

import { db } from "~/server/db";
import { normalizeVocals, type Vocals } from "~/lib/vocals";

// Cache for genre prompts from database
let genreCache: Map<string, string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Language suffixes for different locales
const LANGUAGE_SUFFIXES: Record<string, string> = {
    pt: "sung in Brazilian Portuguese",
    en: "sung in English",
    es: "sung in Spanish",
    fr: "sung in French",
    it: "sung in Italian",
};

function sanitizeStyleForVocals(baseStyle: string, vocals: Vocals): string {
    if (vocals === "either") return baseStyle;

    const oppositePatterns: RegExp[] = vocals === "female"
        ? [
            /\bmale baritone vocals?\b/gi,
            /\bmale vocals?\b/gi,
            /\bbaritone vocals?\b/gi,
            /\bbaritone\b/gi,
            /\bmale\b/gi,
        ]
        : [
            /\bfemale vocals?\b/gi,
            /\bsoprano lead\b/gi,
            /\bsoprano vocals?\b/gi,
            /\bsoprano\b/gi,
            /\bfemale\b/gi,
        ];

    let style = baseStyle;
    for (const pattern of oppositePatterns) {
        style = style.replace(pattern, "");
    }

    return style
        .replace(/\s+,/g, ",")
        .replace(/,\s*,+/g, ", ")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+\./g, ".")
        .replace(/^,\s*/, "")
        .replace(/,\s*$/, "")
        .trim();
}

// Base genre mappings (without language suffix)
// These describe the musical style to Suno
export const GENRE_STYLES: Record<string, string> = {
    // Universal genres
    pop: "pop, modern pop, catchy melody, uplifting",
    rock: "rock, electric guitar, energetic, powerful vocals",
    jazz: "classic American jazz, swing rhythm, brass section, alto sax, trumpet, upbeat jazz standards, big band energy",
    blues: "classic American blues, soulful vocals, expressive guitar, blue notes, mid-tempo groove",
    "blues-melancholic": "melancholic American blues, slow tempo, minor key, soulful vocals, crying guitar",
    "blues-upbeat": "upbeat American blues, shuffle groove, bright guitar riffs, feel-good energy",
    worship: "worship, gospel, uplifting spiritual, praise music, inspirational",
    gospel: "worship, gospel, uplifting spiritual, praise music, inspirational",
    rnb: "R&B, soul, smooth vocals, groovy rhythm",
    hiphop: "hip-hop, rap, urban beat, rhythmic flow",
    reggae: "reggae, laid-back groove, island vibes, offbeat rhythm",
    lullaby: "lullaby, soft, gentle, soothing, acoustic, children's music",
    "lullaby-ninar": "Lullaby for children, slow tempo, soft and gentle melody, warm acoustic instruments, calm and soothing atmosphere, sweet vocal, simple repetitive melody, bedtime song",
    "lullaby-animada": "Upbeat children's song, cheerful and playful melody, catchy rhythm, simple happy lyrics, bright and fun atmosphere, energetic vocal, family friendly",

    // Brazilian genres (PT)
    country: "sertanejo, Brazilian country, romantic acoustic, viola caipira",
    sertanejo: "sertanejo, Brazilian country, romantic acoustic, viola caipira",
    funk: "Brazilian funk, baile funk, heavy bass, urban energy",
    "funk-carioca": "funk carioca, baile funk, raw rhythm, heavy bass, Rio de Janeiro vibe",
    "funk-paulista": "Brazilian funk paulista (mandelão / ritmo de fluxo), 150 BPM, beat minimalista e repetitivo, grave 808 muito forte (sub estourado/clipado), kick curto e seco, clap/snare seco, toms/rimshots, hi-hats rápidos, lead monofônico agressivo (synth tipo serrilhado), sirenes/FX curtos, vocal chops, mix limpa e alta (loud compressed), foco no sub e no punch, vibe de fluxo de rua em São Paulo, som automotivo, multidão cantando junto",
    "funk-melody": "funk melody, melodic Brazilian funk, romantic, sung choruses, emotional vibe",
    brega: "brega, Brazilian romantic pop, emotive, direct lyrics, northern Brazil vibe",
    "brega-romantico": "brega romantico, emotional, romantic, heartfelt melodies, popular Brazilian",
    tecnobrega: "tecnobrega, electronic brega, danceable beats, energetic, Para party vibe",
    mpb: "classic MPB / Brazilian singer-songwriter, poetic, acoustic guitar and piano, organic and timeless",
    bossa: "classic bossa nova, Brazilian jazz, smooth acoustic guitar, sophisticated and intimate",
    "mpb-bossa-nova": "Classic Brazilian bossa nova. Soft, intimate vocals, relaxed and elegant. Nylon-string acoustic guitar with bossa nova rhythm, upright bass, light brushed drums, subtle piano. Jazz-influenced harmony, warm and airy sound. Mid tempo (120-140 BPM). Avoid pop production, EDM elements, heavy drums, or vocal exaggeration.",
    "mpb-cancao-brasileira": "Classic MPB / Brazilian singer-songwriter (cancao). Emotional but restrained vocals, poetic storytelling. Acoustic guitar and piano as core instruments, light strings and subtle percussion. Rich harmonic progressions, organic and timeless sound. Slow to mid tempo (80-100 BPM). Avoid commercial pop structure, EDM drops, or electronic dominance.",
    "mpb-pop": "Pop MPB (Brazilian pop with MPB harmony). Emotional verses with a catchy chorus. Acoustic guitar, clean electric guitar, melodic bass, modern soft drums, light piano or pads. Clear pop song structure, warm and romantic tone. Mid tempo (95-115 BPM). Avoid EDM drops, trap beats, or aggressive electronic sounds.",
    "mpb-intimista": "Brazilian indie folk, soft romantic acoustic song. Intimate, gentle, conversational vocals. Minimalist arrangement with acoustic guitar fingerpicking, light piano, subtle strings. Warm, cozy atmosphere, emotional but restrained. Slow to mid tempo (70-80 BPM). Simple melody, poetic lyrics, natural phrasing, no vocal exaggeration. Organic, intimate love song storytelling style.",
    "jovem-guarda": "1960s Brazilian Jovem Guarda, upbeat rock and roll, romantic ballad moments, vintage Brazilian pop rock, electric guitar with reverb, simple drum beat, simple bass line, handclaps, acoustic guitar breaks, catchy chorus with \"o-o-o\" and \"la-la-la\" backing vocals, nostalgic and joyful, celebration song, wedding tribute, AM radio sound quality, mono recording feel, passionate delivery",
    samba: "samba, Brazilian rhythm, percussion, festive, celebratory",
    pagode: "pagode, pagode de mesa, traditional Rio pagode, nylon-string banjo, tantan, repique de mao, pandeiro, cavaquinho, 7-string acoustic bass guitar, warm live roda vibe, laid-back swing, conversational",
    "pagode-de-mesa": "pagode de mesa, raiz, traditional Rio pagode, nylon-string banjo, tantan, repique de mao, pandeiro, cavaquinho, 7-string acoustic bass guitar, warm live roda vibe, organic and intimate",
    "pagode-romantico": "pagode romantico 90s, smoother mid-tempo groove, romantic melodies, polished radio-friendly production, keyboards, brass section, warm vocals, love and heartbreak tone",
    "pagode-universitario": "pagode moderno brasileiro",
    forro: "forro, Brazilian northeastern music, accordion, zabumba, festive",
    "forro-pe-de-serra-rapido": "forro pe de serra, traditional Brazilian forro, accordion lead, zabumba drum, triangle percussion, baiao rhythm, authentic Northeastern Brazil sound, sertao storytelling, upbeat danceable energy, festive",
    "forro-pe-de-serra-lento": "slow traditional Brazilian forro, warm nostalgic contemplative mood, acoustic accordion lead with expressive melodic phrasing, soft zabumba, subtle triangle, gentle nylon-string guitar, restrained acoustic bass, slow relaxed tempo 70-85 BPM, organic live intimate production, natural emotional vocals, storytelling delivery, simple poetic lyrics about time longing home quiet love, calm Sunday afternoon countryside feeling, no modern or electronic elements",
    "forro-universitario": "forro universitario, modern acoustic forro, nylon guitar, light percussion, youthful romantic, softer arrangements, urban forro, catchy melody",
    "forro-eletronico": "forro eletronico, electronic forro, keyboard, synths, electric guitar, saxophone, electronic drums, pop structure, danceable party music, romantic lyrics, catchy chorus, Northeastern Brazil festa sound",
    "sertanejo-raiz": "sertanejo raiz modao de viola",
    "sertanejo-universitario": "Brazilian Sertanejo Universitario modern radio style, emotional and energetic, modern sertanejo arrangement with acoustic guitar, electric guitar, bass and full drum kit, catchy chorus, clear pop structure, contemporary production, lyrics about love nightlife relationships and emotions, mid tempo 95-120 BPM, avoid rustic viola-only arrangements or EDM trap dominance",
    "sertanejo-romantico": "Brazilian Sertanejo Romantico, emotional and heartfelt, melodic arrangement with acoustic guitar, viola caipira, piano and soft strings, strong emotional delivery, romantic and nostalgic atmosphere, slow to mid tempo 75-100 BPM, lyrics about love longing heartbreak and devotion, avoid party-focused lyrics EDM elements or upbeat pop dominance",
    "rock-classico": "classic rock, vintage guitars, iconic riffs, timeless anthems",
    "pop-rock-brasileiro": "brazilian pop rock acoustic, live bar vibe, acoustic guitar strumming with percussive feel, warm pop rock drum groove, electric bass supportive, subtle electric guitar accents with chorus, lively, anthem chorus, catchy hooks, bright acoustic presence, stage ambiance, energetic yet intimate, 120-130 BPM, original composition in Brazilian pop rock style",
    "heavy-metal": "heavy metal, distorted guitars, intense drums, powerful vocals, high energy",
    axe: "Brazilian axe music, high energy carnival sound, upbeat and danceable, driving percussion, timbau drums, surdo bass drum, repique, caixa snare, agogo bells, shakers, brass section with trumpets and trombones, punchy horn stabs, electric guitar rhythmic strumming, synth layers, powerful vocals, call and response with crowd, anthemic chorus, sing-along melody, trio eletrico energy, Salvador Bahia carnival vibe, 90s axe style, feel-good party music, summer beach energy, infectious groove, handclaps, gang vocals in chorus, celebratory atmosphere, baiano swing",
    capoeira: "capoeira, afro-brazilian rhythm, berimbau lead, atabaque, pandeiro, handclaps, call and response chants, roda vibe, percussive and energetic",
    "musica-classica": "Romantic opera aria, bel canto, dramatic operatic lead, full symphony orchestra, lush strings legato, woodwinds counter-melody, timpani swells, harp arpeggios, slow rubato adagio, wide dynamic range, concert hall reverb, cinematic but strictly classical, no drums, no synth",
    valsa: "Emotional Brazilian waltz in 3/4 time, led by expressive piano and sweeping string arrangements. Gentle acoustic bass supports the rhythm while warm lead vocals deliver a narrative, heartfelt melody. Romantic, nostalgic, and elegant, with gradual dynamic growth from verse to chorus.",
    eletronica: "electronic music, modern dance, melodic synths, warm pads, emotional groove",
    "eletronica-afro-house": "Afro House electronic track, 122 BPM, organic african percussion, deep warm bass, emotional melodic hook, spiritual vocal mantra, hypnotic and repetitive, sunset vibe",
    "eletronica-progressive-house": "Progressive House track, 126 BPM, uplifting melodic hook, clean synths, emotional lead vocal, smooth progressive build, modern electronic pop house",
    "eletronica-melodic-techno": "Melodic Techno track, 124 BPM, cinematic atmosphere, emotional synth arpeggio, minimal vocal phrase, deep driving bass, epic and futuristic",
    latina: "latin music, warm rhythmic groove, expressive percussion, romantic and danceable",
    bolero: "Classic romantic orchestral bolero (1950s/60s Latin), slow steady 4/4 bolero groove around 76 BPM with brushed snare, soft rim clicks, maracas and subtle bongos, intimate nylon-string guitar arpeggios and warm upright bass, lush cinematic string orchestra that starts delicate in the verses and swells into a dramatic full-bodied chorus, emotional male baritone/tenor lead vocal with heartfelt phrasing and gentle vibrato, minimal processing with vintage plate reverb, late-section soft backing harmonies, brief instrumental interlude with expressive cantabile solo violin, passionate orchestral climax, warm analog recording feel, timeless and nostalgic, fade out with guitar and strings, no synths, no electronic drums, no modern pop or trap elements",

    // Latin genres (ES)
    balada: "romantic ballad, emotional, slow tempo, heartfelt vocals",
    adoracion: "worship, Latin worship, alabanza, spiritual, uplifting",
    salsa: "Romantic salsa song, lively latin rhythm, expressive brass section, emotional vocal performance, warm and danceable groove, classic latin salsa style",
    merengue: "Upbeat merengue song, fast and joyful rhythm, festive latin percussion, energetic vocal, happy and celebratory atmosphere, traditional merengue style",
    bachata: "Romantic bachata song, emotional guitar melodies, smooth latin rhythm, heartfelt vocal, intimate and passionate atmosphere, modern bachata style",
    ranchera: "ranchera, Mexican regional, mariachi style, emotional",
    cumbia: "cumbia, Latin American rhythm, festive, danceable, accordion",
    tango: "Traditional Argentine tango (tango cancion), orquesta tipica: bandoneon lead, piano marcato and rhythmic, staccato violins with occasional legato swells, double bass pulse, subtle guitar. 2/4 feel (marcato en dos), 124 BPM, D minor. Dramatic, nocturnal, bittersweet, smoky Buenos Aires milonga vibe. Expressive lead vocals, theatrical phrasing, rubato, strong dynamics, short vintage room reverb. Short instrumental intro and bandoneon outro. No modern drum kit, no synths, no pop/EDM elements",

    // French genres (FR)
    chanson: "chanson francaise, French ballad, poetic, classic French style",
    variete: "variete francaise, French pop variety, melodic, accessible",

    // Italian genres (IT)
    napoletana: "canzone napoletana, Neapolitan song, romantic Italian, mandolin",
    lirico: "lirico, operatic style, classical Italian, dramatic vocals",
    tarantella: "tarantella, Italian folk dance, festive, fast tempo, accordion",
};

/**
 * Load genre prompts from database into cache
 */
async function loadGenreCache(): Promise<void> {
    try {
        const prompts = await db.genrePrompt.findMany({
            where: { isActive: true },
        });

        genreCache = new Map();
        for (const p of prompts) {
            // Key format: "genre:locale"
            genreCache.set(`${p.genre}:${p.locale}`, p.prompt);
        }
        cacheTime = Date.now();
    } catch (error) {
        console.error("[genre-mapping] Failed to load genre cache from database:", error);
        // Keep using fallback if database fails
        genreCache = null;
    }
}

/**
 * Clear the genre cache (call this when prompts are updated)
 */
export function clearGenreCache(): void {
    genreCache = null;
    cacheTime = 0;
}

/**
 * Get the Suno style prompt for a given genre, locale, and vocal type
 * @param genre - Internal genre key (e.g., "pop", "sertanejo")
 * @param locale - Locale for language (e.g., "pt", "en")
 * @param vocals - Vocal type ("male", "female", or "either")
 * @returns Style prompt string for Suno
 */
export async function getSunoStylePrompt(genre: string, locale: string, vocals?: string): Promise<string> {
    // Reload cache if expired or not loaded
    if (!genreCache || Date.now() - cacheTime > CACHE_TTL) {
        await loadGenreCache();
    }

    // Try to get from database cache: first locale-specific, then "all", then fallback
    let baseStyle: string | undefined;
    if (genreCache) {
        baseStyle = genreCache.get(`${genre}:${locale}`) || genreCache.get(`${genre}:all`);
    }

    const languageSuffix = LANGUAGE_SUFFIXES[locale] || LANGUAGE_SUFFIXES.en;
    const resolvedBaseStyle =
        baseStyle ??
        GENRE_STYLES[genre] ??
        GENRE_STYLES.pop ??
        "pop, modern pop, catchy melody, uplifting";

    const normalizedVocals = normalizeVocals(vocals);
    const sanitizedBaseStyle = sanitizeStyleForVocals(resolvedBaseStyle, normalizedVocals);

    // Add explicit vocal constraints to reduce drift to the opposite vocal type.
    let vocalSuffix = "";
    if (normalizedVocals === "male") {
        vocalSuffix = ", male lead vocals only, no female lead vocals";
    } else if (normalizedVocals === "female") {
        vocalSuffix = ", female lead vocals only, no male lead vocals";
    }

    return `${sanitizedBaseStyle}, ${languageSuffix}${vocalSuffix}`;
}

// Display names for each genre
export const GENRE_DISPLAY_NAMES: Record<string, string> = {
    pop: "Pop",
    rock: "Rock",
    jazz: "Jazz",
    blues: "American Blues",
    "blues-melancholic": "American Blues (Melancholic)",
    "blues-upbeat": "American Blues (Upbeat)",
    worship: "Worship/Gospel",
    gospel: "Gospel",
    rnb: "R&B",
    hiphop: "Hip-Hop",
    reggae: "Reggae",
    lullaby: "Lullaby",
    "lullaby-ninar": "Lullaby (Soothing)",
    "lullaby-animada": "Kids Song (Upbeat)",
    country: "Sertanejo",
    sertanejo: "Sertanejo",
    funk: "Funk",
    "funk-carioca": "Funk Carioca",
    "funk-paulista": "Funk Paulista",
    "funk-melody": "Funk Melody",
    brega: "Brega",
    "brega-romantico": "Brega Romantico",
    tecnobrega: "Tecnobrega",
    mpb: "MPB",
    "mpb-bossa-nova": "MPB / Bossa Nova (Classica)",
    "mpb-cancao-brasileira": "MPB Classica / Cancao Brasileira",
    "mpb-pop": "Pop MPB (Radiofonica)",
    "mpb-intimista": "MPB Intimista / Folk-Pop Brasileiro",
    bossa: "Bossa Nova",
    "jovem-guarda": "Jovem Guarda",
    samba: "Samba",
    pagode: "Pagode",
    "pagode-de-mesa": "Pagode de Mesa (Raiz)",
    "pagode-romantico": "Pagode Romantico (Anos 90)",
    "pagode-universitario": "Pagode Universitario / Novo Pagode",
    forro: "Forro",
    "forro-pe-de-serra-rapido": "Forro Pe-de-Serra (Dançante)", // Tradicional animado
    "forro-pe-de-serra-lento": "Forro Pe-de-Serra (Lento)", // Contemplativo nostálgico 70-85 BPM
    "forro-universitario": "Forro Universitario",
    "forro-eletronico": "Forro Eletronico",
    "sertanejo-raiz": "Sertanejo Raiz",
    "sertanejo-universitario": "Sertanejo Universitario",
    "sertanejo-romantico": "Sertanejo Romantico",
    "rock-classico": "Rock Classico",
    "pop-rock-brasileiro": "Pop Rock Brasileiro",
    "heavy-metal": "Heavy Metal",
    axe: "Axe",
    capoeira: "Capoeira",
    "musica-classica": "Musica Classica",
    valsa: "Valsa",
    eletronica: "Eletronica",
    "eletronica-afro-house": "Eletronica - Afro House",
    "eletronica-progressive-house": "Eletronica - Progressive House",
    "eletronica-melodic-techno": "Eletronica - Melodic Techno",
    latina: "Musica Latina",
    bolero: "Bolero",
    balada: "Balada",
    adoracion: "Adoracion",
    bachata: "Bachata",
    salsa: "Salsa",
    merengue: "Merengue",
    ranchera: "Ranchera",
    cumbia: "Cumbia",
    tango: "Tango",
    chanson: "Chanson Francaise",
    variete: "Variete Francaise",
    napoletana: "Canzone Napoletana",
    lirico: "Lirico",
    tarantella: "Tarantella",
};

// Locale mapping for each genre
export const GENRE_LOCALES: Record<string, string> = {
    // Universal genres
    pop: "all",
    rock: "all",
    jazz: "all",
    blues: "all",
    "blues-melancholic": "all",
    "blues-upbeat": "all",
    worship: "all",
    gospel: "all",
    rnb: "all",
    hiphop: "all",
    reggae: "all",
    lullaby: "all",
    "lullaby-ninar": "pt",
    "lullaby-animada": "pt",
    "rock-classico": "all",
    "heavy-metal": "all",
    // Brazilian genres (PT)
    country: "pt",
    sertanejo: "pt",
    funk: "pt",
    "funk-carioca": "pt",
    "funk-paulista": "pt",
    "funk-melody": "pt",
    brega: "pt",
    "brega-romantico": "pt",
    tecnobrega: "pt",
    mpb: "pt",
    bossa: "pt",
    "mpb-bossa-nova": "pt",
    "mpb-cancao-brasileira": "pt",
    "mpb-pop": "pt",
    "mpb-intimista": "pt",
    "jovem-guarda": "pt",
    samba: "pt",
    pagode: "pt",
    "pagode-de-mesa": "pt",
    "pagode-romantico": "pt",
    "pagode-universitario": "pt",
    forro: "pt",
    "forro-pe-de-serra-rapido": "pt",
    "forro-pe-de-serra-lento": "pt",
    "forro-universitario": "pt",
    "forro-eletronico": "pt",
    "sertanejo-raiz": "pt",
    "sertanejo-universitario": "pt",
    "sertanejo-romantico": "pt",
    "pop-rock-brasileiro": "pt",
    axe: "pt",
    capoeira: "pt",
    "musica-classica": "pt",
    valsa: "pt",
    eletronica: "pt",
    "eletronica-afro-house": "pt",
    "eletronica-progressive-house": "pt",
    "eletronica-melodic-techno": "pt",
    latina: "pt",
    bolero: "all",
    // Latin genres (ES)
    balada: "es",
    adoracion: "es",
    bachata: "all",
    salsa: "all",
    merengue: "all",
    ranchera: "es",
    cumbia: "es",
    tango: "all",
    // French genres (FR)
    chanson: "fr",
    variete: "fr",
    // Italian genres (IT)
    napoletana: "it",
    lirico: "it",
    tarantella: "it",
};

/**
 * Get genre display name for logging/debugging
 */
export function getGenreDisplayName(genre: string): string {
    return GENRE_DISPLAY_NAMES[genre] || genre;
}

/**
 * All supported genres
 */
export const SUPPORTED_GENRES = Object.keys(GENRE_STYLES);
