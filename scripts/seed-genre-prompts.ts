/**
 * Seed script to import genre prompts from hardcoded values to the database
 * Run with: npx tsx scripts/seed-genre-prompts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Base genre mappings (from genre-mapping.ts)
const GENRE_STYLES: Record<string, string> = {
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

    // Brazilian genres (PT)
    country: "sertanejo, Brazilian country, romantic acoustic, viola caipira",
    sertanejo: "sertanejo, Brazilian country, romantic acoustic, viola caipira",
    funk: "Brazilian funk, baile funk, heavy bass, urban energy",
    "funk-carioca": "funk carioca, baile funk, raw rhythm, heavy bass, Rio de Janeiro vibe",
    "funk-paulista": "funk paulista, heavy bass, aggressive groove, car audio, urban attitude",
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
    "forro-pe-de-serra": "forro pe de serra, traditional Brazilian forro, accordion lead, zabumba drum, triangle percussion, baiao rhythm, authentic Northeastern Brazil sound, sertao storytelling", // Legacy
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
    valsa: "Emotional Brazilian waltz in 3/4 time, led by expressive piano and sweeping string arrangements. Gentle acoustic bass supports the rhythm while warm male vocals deliver a narrative, heartfelt melody. Romantic, nostalgic, and elegant, with gradual dynamic growth from verse to chorus.",

    // Latin genres (ES)
    balada: "romantic ballad, emotional, slow tempo, heartfelt vocals",
    adoracion: "worship, Latin worship, alabanza, spiritual, uplifting",
    bachata: "bachata, Dominican rhythm, romantic, guitar-driven",
    salsa: "salsa, Latin rhythm, brass, energetic, danceable",
    ranchera: "ranchera, Mexican regional, mariachi style, emotional",
    cumbia: "cumbia, Latin American rhythm, festive, danceable, accordion",

    // French genres (FR)
    chanson: "chanson francaise, French ballad, poetic, classic French style",
    variete: "variete francaise, French pop variety, melodic, accessible",

    // Italian genres (IT)
    napoletana: "canzone napoletana, Neapolitan song, romantic Italian, mandolin",
    lirico: "lirico, operatic style, classical Italian, dramatic vocals",
    tarantella: "tarantella, Italian folk dance, festive, fast tempo, accordion",
};

// Locale mapping for each genre
const GENRE_LOCALES: Record<string, string> = {
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
    "rock-classico": "all",
    "pop-rock-brasileiro": "pt",
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
    "forro-pe-de-serra": "pt", // Legacy
    "forro-pe-de-serra-rapido": "pt",
    "forro-pe-de-serra-lento": "pt",
    "forro-universitario": "pt",
    "forro-eletronico": "pt",
    "sertanejo-raiz": "pt",
    "sertanejo-universitario": "pt",
    "sertanejo-romantico": "pt",
    axe: "pt",
    capoeira: "pt",
    valsa: "pt",

    // Latin genres (ES)
    balada: "es",
    adoracion: "es",
    bachata: "es",
    salsa: "es",
    ranchera: "es",
    cumbia: "es",

    // French genres (FR)
    chanson: "fr",
    variete: "fr",

    // Italian genres (IT)
    napoletana: "it",
    lirico: "it",
    tarantella: "it",
};

// Display names for genres
const GENRE_DISPLAY_NAMES: Record<string, string> = {
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
    "forro-pe-de-serra": "Forro Pe-de-Serra", // Legacy
    "forro-pe-de-serra-rapido": "Forro Pe-de-Serra (Dancante)",
    "forro-pe-de-serra-lento": "Forro Pe-de-Serra (Lento)",
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
    valsa: "Valsa",
    balada: "Balada",
    adoracion: "Adoracion",
    bachata: "Bachata",
    salsa: "Salsa",
    ranchera: "Ranchera",
    cumbia: "Cumbia",
    chanson: "Chanson Francaise",
    variete: "Variete Francaise",
    napoletana: "Canzone Napoletana",
    lirico: "Lirico",
    tarantella: "Tarantella",
};

async function seedGenrePrompts() {
    console.log("Starting genre prompts seed...\n");

    let created = 0;
    let updated = 0;

    for (const [genre, prompt] of Object.entries(GENRE_STYLES)) {
        const displayName = GENRE_DISPLAY_NAMES[genre] || genre;
        const locale = GENRE_LOCALES[genre] || "all";

        try {
            const result = await prisma.genrePrompt.upsert({
                where: {
                    genre_locale: {
                        genre,
                        locale,
                    },
                },
                create: {
                    genre,
                    locale,
                    prompt,
                    displayName,
                    isActive: true,
                },
                update: {
                    prompt,
                    displayName,
                },
            });

            // Check if it was created or updated
            const existing = await prisma.genrePrompt.findUnique({
                where: { id: result.id },
            });

            if (existing && existing.createdAt.getTime() === existing.updatedAt.getTime()) {
                created++;
                console.log(`  [+] Created: ${genre} -> ${displayName}`);
            } else {
                updated++;
                console.log(`  [~] Updated: ${genre} -> ${displayName}`);
            }
        } catch (error) {
            console.error(`  [!] Error with ${genre}:`, error);
        }
    }

    console.log(`\nSeed completed!`);
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Total: ${Object.keys(GENRE_STYLES).length}`);
}

seedGenrePrompts()
    .catch((error) => {
        console.error("Seed failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
