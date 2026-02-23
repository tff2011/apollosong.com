/**
 * Lyrics generation service using OpenRouter LLM
 */

// Use process.env directly for worker compatibility (workers run outside Next.js context)
const env = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview",
};

export interface LyricsInput {
    recipientName: string;
    recipient: string; // relationship type: husband, wife, children, father, mother, sibling, friend, myself, other
    genre: string; // pop, country, rock, rnb, jazz, worship, hiphop, samba, pagode
    vocals: string; // female, male, either
    qualities: string; // What makes them special
    memories: string; // Shared memories/stories
    message?: string | null; // Optional personal message
    locale: string; // en, pt
    pronunciationCorrections?: Array<{ original: string; replacement: string }>;
    avoidLyrics?: string; // Lyrics from parent order to avoid repetition (for EXTRA_SONG)
}

export interface LyricsResult {
    lyrics: string;
    displayLyrics: string;
    musicPrompt: string;
    prompt: string;
}

// Genre name translations (exported for UI)
export const GENRE_NAMES: Record<string, { en: string; pt: string; es: string; fr: string; it: string }> = {
    // Universal genres
    pop: { en: "Pop", pt: "Pop", es: "Pop", fr: "Pop", it: "Pop" },
    rock: { en: "Rock", pt: "Rock", es: "Rock", fr: "Rock", it: "Rock" },
    rnb: { en: "R&B", pt: "Black Music", es: "R&B", fr: "R&B / Soul", it: "R&B / Soul" },
    worship: { en: "Worship/Gospel", pt: "Gospel", es: "Adoración", fr: "Louange", it: "Adorazione / Gospel" },
    gospel: { en: "Worship/Gospel", pt: "Gospel", es: "Adoración", fr: "Louange", it: "Adorazione / Gospel" },
    hiphop: { en: "Hip-Hop", pt: "Rap", es: "Reggaetón / Hip-Hop", fr: "Rap Français", it: "Rap / Hip-Hop" },
    jazz: { en: "Jazz", pt: "Jazz", es: "Jazz", fr: "Jazz", it: "Jazz" },
    blues: { en: "American Blues", pt: "Blues Americano", es: "Blues Americano", fr: "Blues Américain", it: "Blues Americano" },
    "blues-melancholic": { en: "American Blues (Melancholic)", pt: "Blues Americano (Melancólico)", es: "Blues Americano (Melancólico)", fr: "Blues Américain (Mélancolique)", it: "Blues Americano (Malinconico)" },
    "blues-upbeat": { en: "American Blues (Upbeat)", pt: "Blues Americano (Alto Astral)", es: "Blues Americano (Animado)", fr: "Blues Américain (Enjoué)", it: "Blues Americano (Solare)" },
    // English-specific
    country: { en: "Country", pt: "Sertanejo", es: "Ranchera", fr: "Country", it: "Country" },
    // Portuguese-specific (Brazil)
    sertanejo: { en: "Sertanejo", pt: "Sertanejo", es: "Sertanejo", fr: "Sertanejo", it: "Sertanejo" },
    funk: { en: "Funk", pt: "Funk", es: "Funk", fr: "Funk", it: "Funk" },
    "funk-carioca": { en: "Funk Carioca", pt: "Funk Carioca", es: "Funk Carioca", fr: "Funk Carioca", it: "Funk Carioca" },
    "funk-paulista": { en: "Funk Paulista", pt: "Funk Paulista", es: "Funk Paulista", fr: "Funk Paulista", it: "Funk Paulista" },
    "funk-melody": { en: "Funk Melody", pt: "Funk Melody", es: "Funk Melody", fr: "Funk Melody", it: "Funk Melody" },
    brega: { en: "Brega", pt: "Brega", es: "Brega", fr: "Brega", it: "Brega" },
    "brega-romantico": { en: "Brega Romantico", pt: "Brega Romântico", es: "Brega Romántico", fr: "Brega Romantique", it: "Brega Romantico" },
    tecnobrega: { en: "Tecnobrega", pt: "Tecnobrega", es: "Tecnobrega", fr: "Tecnobrega", it: "Tecnobrega" },
    samba: { en: "Samba", pt: "Samba", es: "Samba", fr: "Samba", it: "Samba" },
    pagode: { en: "Pagode", pt: "Pagode", es: "Pagode", fr: "Pagode", it: "Pagode" },
    "pagode-de-mesa": { en: "Pagode de Mesa (Roots)", pt: "Pagode de Mesa (Raiz)", es: "Pagode de Mesa (Raiz)", fr: "Pagode de Mesa (Raiz)", it: "Pagode de Mesa (Raiz)" },
    "pagode-romantico": { en: "Pagode Romantico (90s)", pt: "Pagode Romântico (Anos 90)", es: "Pagode Romântico (Anos 90)", fr: "Pagode Romântico (Anos 90)", it: "Pagode Romântico (Anos 90)" },
    "pagode-universitario": { en: "Pagode Universitario / Novo Pagode", pt: "Pagode Universitário / Novo Pagode", es: "Pagode Universitário / Novo Pagode", fr: "Pagode Universitário / Novo Pagode", it: "Pagode Universitário / Novo Pagode" },
    forro: { en: "Forró", pt: "Forró", es: "Forró", fr: "Forró", it: "Forró" },
    "forro-pe-de-serra-rapido": { en: "Forró Pé-de-Serra (Dançante)", pt: "Forró Pé-de-Serra (Dançante)", es: "Forró Pé-de-Serra (Bailable)", fr: "Forró Pé-de-Serra (Dansant)", it: "Forró Pé-de-Serra (Ballabile)" },
    "forro-pe-de-serra-lento": { en: "Forró Pé-de-Serra (Slow)", pt: "Forró Pé-de-Serra (Lento)", es: "Forró Pé-de-Serra (Lento)", fr: "Forró Pé-de-Serra (Lent)", it: "Forró Pé-de-Serra (Lento)" },
    "forro-universitario": { en: "Forró Universitário", pt: "Forró Universitário", es: "Forró Universitário", fr: "Forró Universitário", it: "Forró Universitário" },
    "forro-eletronico": { en: "Forró Eletrônico", pt: "Forró Eletrônico", es: "Forró Eletrônico", fr: "Forró Eletrônico", it: "Forró Eletrônico" },
    "sertanejo-raiz": { en: "Sertanejo Raiz", pt: "Sertanejo Raiz", es: "Sertanejo Raiz", fr: "Sertanejo Raiz", it: "Sertanejo Raiz" },
    "sertanejo-universitario": { en: "Sertanejo Universitário", pt: "Sertanejo Universitário", es: "Sertanejo Universitário", fr: "Sertanejo Universitário", it: "Sertanejo Universitário" },
    "sertanejo-romantico": { en: "Sertanejo Romântico", pt: "Sertanejo Romântico", es: "Sertanejo Romântico", fr: "Sertanejo Romântico", it: "Sertanejo Romântico" },
    "rock-classico": { en: "Classic Rock", pt: "Rock Clássico", es: "Rock Clásico", fr: "Rock Classique", it: "Rock Classico" },
    "pop-rock-brasileiro": { en: "Brazilian Pop Rock", pt: "Pop Rock Brasileiro", es: "Pop Rock Brasileño", fr: "Pop Rock Brésilien", it: "Pop Rock Brasiliano" },
    "heavy-metal": { en: "Heavy Metal", pt: "Heavy Metal", es: "Heavy Metal", fr: "Heavy Metal", it: "Heavy Metal" },
    axe: { en: "Axé", pt: "Axé", es: "Axé", fr: "Axé", it: "Axé" },
    capoeira: { en: "Capoeira", pt: "Capoeira", es: "Capoeira", fr: "Capoeira", it: "Capoeira" },
    reggae: { en: "Reggae", pt: "Reggae", es: "Reggae", fr: "Reggae", it: "Reggae" },
    lullaby: { en: "Lullaby", pt: "Infantil", es: "Canción de Cuna", fr: "Berceuse", it: "Ninna Nanna" },
    "lullaby-ninar": { en: "Lullaby (Soothing)", pt: "Canções de Ninar (Suave & Aconchegante)", es: "Canción de Cuna (Suave)", fr: "Berceuse (Douce)", it: "Ninna Nanna (Dolce)" },
    "lullaby-animada": { en: "Kids Song (Upbeat)", pt: "Infantil Animada (Divertida & Energética)", es: "Canción Infantil (Animada)", fr: "Chanson Enfant (Enjouée)", it: "Canzone per Bambini (Vivace)" },
    mpb: { en: "MPB", pt: "MPB", es: "MPB", fr: "MPB", it: "MPB" },
    "mpb-bossa-nova": { en: "MPB / Bossa Nova (Classic)", pt: "MPB / Bossa Nova (Clássica)", es: "MPB / Bossa Nova (Clásica)", fr: "MPB / Bossa Nova (Classique)", it: "MPB / Bossa Nova (Classica)" },
    "mpb-cancao-brasileira": { en: "Classic MPB / Brazilian Song", pt: "MPB Clássica / Canção Brasileira", es: "MPB Clásica / Canción Brasileña", fr: "MPB Classique / Chanson Brésilienne", it: "MPB Classica / Canzone Brasiliana" },
    "mpb-pop": { en: "Pop MPB", pt: "Pop MPB (Radiofônica)", es: "Pop MPB", fr: "Pop MPB", it: "Pop MPB" },
    "mpb-intimista": { en: "Intimate MPB / Brazilian Folk-Pop", pt: "MPB Intimista / Folk-Pop Brasileiro", es: "MPB Intimista / Folk-Pop Brasileño", fr: "MPB Intimiste / Folk-Pop Brésilien", it: "MPB Intimista / Folk-Pop Brasiliano" },
    bossa: { en: "Bossa Nova", pt: "Bossa Nova", es: "Bossa Nova", fr: "Bossa Nova", it: "Bossa Nova" },
    "jovem-guarda": { en: "Jovem Guarda", pt: "Jovem Guarda", es: "Jovem Guarda", fr: "Jovem Guarda", it: "Jovem Guarda" },
    "musica-classica": { en: "Classical Music", pt: "Música Clássica", es: "Música Clásica", fr: "Musique Classique", it: "Musica Classica" },
    eletronica: { en: "Electronic", pt: "Música Eletrônica", es: "Música Electrónica", fr: "Musique Électronique", it: "Musica Elettronica" },
    "eletronica-afro-house": { en: "Afro House", pt: "Afro House (Emocional & Orgânico)", es: "Afro House", fr: "Afro House", it: "Afro House" },
    "eletronica-progressive-house": { en: "Progressive House", pt: "Progressive House (Melódico & Inspirador)", es: "Progressive House", fr: "Progressive House", it: "Progressive House" },
    "eletronica-melodic-techno": { en: "Melodic Techno", pt: "Melodic Techno (Cinematográfico & Intenso)", es: "Melodic Techno", fr: "Melodic Techno", it: "Melodic Techno" },
    latina: { en: "Latin Music", pt: "Música Latina", es: "Música Latina", fr: "Musique Latine", it: "Musica Latina" },
    bolero: { en: "Bolero", pt: "Bolero", es: "Bolero", fr: "Bolero", it: "Bolero" },
    // Spanish-specific (Latin)
    adoracion: { en: "Worship", pt: "Adoração", es: "Adoración", fr: "Adoration", it: "Adorazione" },
    salsa: { en: "Salsa", pt: "Salsa", es: "Salsa", fr: "Salsa", it: "Salsa" },
    bachata: { en: "Bachata", pt: "Bachata", es: "Bachata", fr: "Bachata", it: "Bachata" },
    merengue: { en: "Merengue", pt: "Merengue", es: "Merengue", fr: "Merengue", it: "Merengue" },
    cumbia: { en: "Cumbia", pt: "Cumbia", es: "Cumbia", fr: "Cumbia", it: "Cumbia" },
    ranchera: { en: "Ranchera", pt: "Ranchera", es: "Ranchera / Regional Mexicano", fr: "Ranchera", it: "Ranchera" },
    balada: { en: "Romantic Ballad", pt: "Balada Romântica", es: "Balada Romántica", fr: "Ballade Romantique", it: "Ballata Romantica" },
    tango: { en: "Tango", pt: "Tango", es: "Tango", fr: "Tango", it: "Tango" },
    valsa: { en: "Waltz", pt: "Valsa", es: "Vals", fr: "Valse", it: "Valzer" },
    // French-specific
    chanson: { en: "French Chanson", pt: "Chanson Francesa", es: "Chanson Francesa", fr: "Chanson Française", it: "Chanson Francese" },
    variete: { en: "French Pop", pt: "Variété Francesa", es: "Variété Francesa", fr: "Variété Française", it: "Variété Francese" },
    // Italian-specific
    tarantella: { en: "Tarantella", pt: "Tarantela", es: "Tarantela", fr: "Tarentelle", it: "Tarantella" },
    napoletana: { en: "Neapolitan Song", pt: "Canção Napolitana", es: "Canción Napolitana", fr: "Chanson Napolitaine", it: "Canzone Napoletana" },
    lirico: { en: "Operatic/Lyrical", pt: "Lírico / Ópera", es: "Lírico / Ópera", fr: "Lyrique / Opéra", it: "Lirico / Opera" },
};

// Relationship name translations (exported for UI)
export const RELATIONSHIP_NAMES: Record<string, { en: string; pt: string; es: string; fr: string; it: string }> = {
    husband: { en: "Husband", pt: "Marido", es: "Esposo", fr: "Mari", it: "Marito" },
    wife: { en: "Wife", pt: "Esposa", es: "Esposa", fr: "Épouse", it: "Moglie" },
    boyfriend: { en: "Boyfriend", pt: "Namorado", es: "Novio", fr: "Petit ami", it: "Fidanzato" },
    girlfriend: { en: "Girlfriend", pt: "Namorada", es: "Novia", fr: "Petite amie", it: "Fidanzata" },
    children: { en: "Children", pt: "Filhos", es: "Hijos", fr: "Enfants", it: "Figli" },
    father: { en: "Father", pt: "Pai", es: "Padre", fr: "Père", it: "Padre" },
    mother: { en: "Mother", pt: "Mãe", es: "Madre", fr: "Mère", it: "Madre" },
    sibling: { en: "Sibling", pt: "Irmão/Irmã", es: "Hermano/a", fr: "Frère/Sœur", it: "Fratello/Sorella" },
    friend: { en: "Friend", pt: "Amigo(a)", es: "Amigo/a", fr: "Ami(e)", it: "Amico/a" },
    myself: { en: "Myself", pt: "Eu mesmo(a)", es: "Yo mismo/a", fr: "Moi-même", it: "Me stesso/a" },
    other: { en: "Someone Special", pt: "Alguém Especial", es: "Alguien Especial", fr: "Quelqu'un de Spécial", it: "Qualcuno di Speciale" },
    group: { en: "Group of People", pt: "Grupo de Pessoas", es: "Grupo de Personas", fr: "Groupe de Personnes", it: "Gruppo di Persone" },
};

// Genre-specific instructions for the LLM
// Each genre has culturally-specific prompts per locale
export const GENRE_INSTRUCTIONS: Record<string, { en: string; pt: string; es: string; fr: string; it: string }> = {
    pop: {
        en: "Write in a modern pop style with catchy hooks, memorable melodies, and upbeat energy. Use contemporary language and relatable themes. Structure should have strong, singable choruses.",
        pt: "Escreva em estilo pop moderno com refrões cativantes, melodias memoráveis e energia animada. Use linguagem contemporânea brasileira e temas relacionáveis. A estrutura deve ter refrões fortes e cantáveis.",
        es: "Escribe en estilo pop moderno con estribillos pegadizos, melodías memorables y energía animada. Usa lenguaje contemporáneo latinoamericano y temas con los que la gente se identifique. La estructura debe tener coros fuertes y cantables. Piensa en artistas como Shakira, Juanes, o Luis Fonsi.",
        fr: "Écris dans un style pop moderne avec des accroches mémorables, des mélodies entraînantes et une énergie positive. Utilise un langage contemporain français et des thèmes universels. La structure doit avoir des refrains forts et faciles à chanter. Pense au style de Stromae, Angèle, ou Louane.",
        it: "Scrivi in stile pop moderno italiano con ritornelli orecchiabili, melodie memorabili ed energia positiva. Usa un linguaggio contemporaneo italiano e temi universali. La struttura deve avere ritornelli forti e facili da cantare. Pensa allo stile di Tiziano Ferro, Laura Pausini, o Eros Ramazzotti.",
    },
    country: {
        en: "Write in a country music style with storytelling elements, rustic imagery, and heartfelt emotion. Use down-to-earth language, references to family values, and acoustic warmth. Include vivid imagery of life moments.",
        pt: "Escreva em estilo SERTANEJO brasileiro com elementos de narrativa, romance e emoção sincera. Use linguagem do interior do Brasil, referências a valores familiares, amor verdadeiro e saudade. Inclua imagens de vida no campo, festas juninas, e momentos do coração. O tom deve ser típico de músicas sertanejas como de artistas como Chitãozinho & Xororó, Zezé Di Camargo, ou sertanejo universitário.",
        es: "Escribe en estilo RANCHERA / REGIONAL MEXICANO con narrativa emotiva, imágenes del campo y sentimiento profundo. Usa lenguaje tradicional mexicano, referencias a la familia, el amor verdadero y la tierra. Incluye imágenes de charros, la vida rural y los valores tradicionales. Piensa en Vicente Fernández, Pedro Infante, o Pepe Aguilar. El tono debe ser de mariachi con trompetas y guitarras.",
        fr: "Écris dans un style country/folk avec des éléments narratifs, des images rustiques et une émotion sincère. Utilise un langage terre-à-terre, des références aux valeurs familiales et une chaleur acoustique. Inclus des images vivantes de moments de vie.",
        it: "Scrivi in stile country/folk con elementi narrativi, immagini rustiche ed emozione sincera. Usa un linguaggio semplice, riferimenti ai valori familiari e calore acustico. Includi immagini vivide di momenti di vita.",
    },
    rock: {
        en: "Write in a rock style with powerful emotions, dynamic energy, and anthemic quality. Use strong, impactful language and build to emotional peaks. Can range from tender ballad to powerful chorus.",
        pt: "Escreva em estilo rock brasileiro com emoções poderosas, energia dinâmica e qualidade antêmica. Use linguagem forte e impactante, construindo para picos emocionais. Pode variar de balada terna a refrão poderoso. Pense no estilo de bandas como Legião Urbana, Titãs, ou Jota Quest.",
        es: "Escribe en estilo rock con emociones poderosas, energía dinámica y calidad de himno. Usa lenguaje fuerte e impactante, construyendo hacia clímax emocionales. Puede variar desde balada tierna hasta coro poderoso. Piensa en Maná, Soda Stereo, o Enanitos Verdes.",
        fr: "Écris dans un style rock avec des émotions puissantes, une énergie dynamique et une qualité d'hymne. Utilise un langage fort et impactant, construisant vers des sommets émotionnels. Peut aller de la ballade tendre au refrain puissant. Pense au style de Téléphone, Noir Désir, ou Indochine.",
        it: "Scrivi in stile rock italiano con emozioni potenti, energia dinamica e qualità epica. Usa un linguaggio forte e d'impatto, costruendo verso picchi emotivi. Può variare dalla ballata tenera al ritornello potente. Pensa allo stile di Vasco Rossi, Ligabue, o Zucchero.",
    },
    "rock-classico": {
        en: "Write in a classic rock style with timeless riffs, strong hooks, and anthemic energy. Keep it bold and memorable.",
        pt: "Escreva em estilo ROCK CLÁSSICO com riffs marcantes, letras fortes e identidade atemporal. O tom deve ser poderoso e memorável.",
        es: "Escribe en estilo ROCK CLÁSICO con riffs icónicos, letras fuertes e identidad atemporal. Tono potente y memorable.",
        fr: "Écris dans un style ROCK CLASSIQUE avec des riffs marquants, des paroles fortes et une identité intemporelle. Ton puissant et mémorable.",
        it: "Scrivi in stile ROCK CLASSICO con riff iconici, testi forti e identità senza tempo. Tono potente e memorabile.",
    },
    "pop-rock-brasileiro": {
        en: "Write in a Brazilian pop rock acoustic style with a live bar vibe. Keep it lively and intimate, with catchy hooks and an anthem-like chorus.",
        pt: "Escreva em estilo POP ROCK BRASILEIRO acústico, com clima de bar ao vivo. Violão com batida percussiva, groove pop rock quente, baixo de apoio, guitarras sutis com chorus, refrão hino e ganchos marcantes. Energia íntima e vibrante.",
        es: "Escribe en estilo POP ROCK BRASILEÑO acústico, con ambiente de bar en vivo. Mantén un tono energético e íntimo, con ganchos pegadizos y coro tipo himno.",
        fr: "Écris dans un style POP ROCK BRÉSILIEN acoustique, ambiance bar live. Garde une énergie intime et vivante, avec des hooks accrocheurs et un refrain hymnique.",
        it: "Scrivi in stile POP ROCK BRASILIANO acustico, con atmosfera da live bar. Mantieni energia intima e vivace, con hook orecchiabili e ritornello da inno.",
    },
    "heavy-metal": {
        en: "Write in a heavy metal style with aggressive guitars, intense energy, and powerful vocals. Keep it dramatic and high-impact.",
        pt: "Escreva em estilo HEAVY METAL com guitarras pesadas, energia intensa e atitude marcante. O clima deve ser dramático e potente.",
        es: "Escribe en estilo HEAVY METAL con guitarras pesadas, energía intensa y actitud marcada. Clima dramático y potente.",
        fr: "Écris dans un style HEAVY METAL avec des guitares lourdes, une énergie intense et une attitude marquée. Ambiance dramatique et puissante.",
        it: "Scrivi in stile HEAVY METAL con chitarre pesanti, energia intensa e attitudine decisa. Atmosfera drammatica e potente.",
    },
    rnb: {
        en: "Write in an R&B style with smooth, soulful vibes and romantic undertones. Use poetic language, emotional depth, and sensual imagery. Focus on love, devotion, and heartfelt expression.",
        pt: "Escreva em estilo BLACK MUSIC brasileiro com vibes suaves e cheias de alma, com tons românticos. Use linguagem poética brasileira, profundidade emocional e expressão sensual. Foque em amor, devoção e expressão sincera. Pense em artistas como Seu Jorge, Tiago Iorc, IZA, Ludmilla, ou Gloria Groove. O estilo deve ter groove, sensualidade e emoção genuína.",
        es: "Escribe en estilo R&B con vibraciones suaves y llenas de soul, con tonos románticos. Usa lenguaje poético, profundidad emocional e imágenes sensuales. Enfócate en amor, devoción y expresión sincera. Piensa en artistas como Romeo Santos en sus baladas o Prince Royce.",
        fr: "Écris dans un style R&B/Soul avec des vibes douces et pleines d'âme, avec des tons romantiques. Utilise un langage poétique, de la profondeur émotionnelle et des images sensuelles. Concentre-toi sur l'amour, la dévotion et l'expression sincère. Pense à des artistes comme Aya Nakamura, Dadju, ou Tayc.",
        it: "Scrivi in stile R&B/Soul con vibrazioni morbide e piene d'anima, con toni romantici. Usa un linguaggio poetico, profondità emotiva e immagini sensuali. Concentrati sull'amore, la devozione e l'espressione sincera.",
    },
    jazz: {
        en: "Write in a classic AMERICAN JAZZ style with swing rhythm and upbeat energy. Think Frank Sinatra, Ella Fitzgerald, Louis Armstrong - sophisticated but with swing and life. Use elegant phrasing but keep the energy lively, not sleepy. The lyrics should feel like they could be sung in a 1950s New York jazz club with a big band.",
        pt: "Escreva em estilo JAZZ AMERICANO CLÁSSICO com ritmo de swing e energia animada. NÃO escreva em estilo bossa nova ou MPB - queremos jazz americano como Frank Sinatra, Ella Fitzgerald, Louis Armstrong. Use linguagem sofisticada mas com swing e vida, não melancólico ou suave demais. Pense em standards de jazz clássico dos anos 50, com metais, ritmo dançante e uma atmosfera de clube de jazz de Nova York. As letras devem ter balanço e energia, não contemplação quieta.",
        es: "Escribe en estilo JAZZ AMERICANO CLÁSICO con ritmo de swing y energía animada. Piensa en Frank Sinatra, Ella Fitzgerald, Louis Armstrong - sofisticado pero con swing y vida. Usa frases elegantes pero mantén la energía viva, no soñolienta. Las letras deben sentirse como si pudieran cantarse en un club de jazz de Nueva York en los años 50 con una big band.",
        fr: "Écris dans un style JAZZ AMÉRICAIN CLASSIQUE avec rythme swing et énergie entraînante. Pense à Frank Sinatra, Ella Fitzgerald, Louis Armstrong - sophistiqué mais avec du swing et de la vie. Utilise des phrases élégantes mais garde l'énergie vive, pas endormie. Les paroles doivent donner l'impression de pouvoir être chantées dans un club de jazz new-yorkais des années 50 avec un big band.",
        it: "Scrivi in stile JAZZ AMERICANO CLASSICO con ritmo swing ed energia vivace. Pensa a Frank Sinatra, Ella Fitzgerald, Louis Armstrong - sofisticato ma con swing e vita. Usa frasi eleganti ma mantieni l'energia viva, non sonnolenta. I testi devono sembrare come se potessero essere cantati in un jazz club di New York degli anni '50 con una big band.",
    },
    blues: {
        en: "Write in a classic AMERICAN BLUES style with soulful, expressive vocals, blue notes, and a guitar-centered sound. Keep it heartfelt and authentic, with honest, simple storytelling and a call-and-response feel.",
        pt: "Escreva em estilo BLUES AMERICANO clássico, com voz soul e expressiva, notas blues e guitarra em destaque. Mantenha autenticidade e emoção sincera, com narrativa simples e clima de call-and-response.",
        es: "Escribe en estilo BLUES AMERICANO clásico, con voz soul y expresiva, notas blues y guitarra protagonista. Mantén autenticidad y emoción sincera, con narrativa simple y sensación de call-and-response.",
        fr: "Écris dans un style BLUES AMÉRICAIN classique, avec une voix soul et expressive, des blue notes et une guitare mise en avant. Garde une émotion sincère et une narration simple, avec un esprit de call-and-response.",
        it: "Scrivi in stile BLUES AMERICANO classico, con voce soul ed espressiva, blue notes e chitarra in primo piano. Mantieni autenticità ed emozione sincera, con narrazione semplice e call-and-response.",
    },
    "blues-melancholic": {
        en: "Write in a MELANCHOLIC AMERICAN BLUES style: slow to mid tempo, minor-key mood, introspective and aching emotion. Use sparse, expressive guitar licks and tender, soulful phrasing.",
        pt: "Escreva em BLUES AMERICANO melancólico: andamento lento a médio, clima em tonalidade menor, emoção introspectiva e dolorida. Use guitarra expressiva e fraseado soul delicado.",
        es: "Escribe en BLUES AMERICANO melancólico: tempo lento a medio, atmósfera en tonalidad menor, emoción introspectiva y dolorida. Usa guitarra expresiva y fraseo soul delicado.",
        fr: "Écris en BLUES AMÉRICAIN mélancolique : tempo lent à moyen, ambiance en tonalité mineure, émotion introspective et douloureuse. Utilise une guitare expressive et un phrasé soul délicat.",
        it: "Scrivi in BLUES AMERICANO malinconico: tempo lento o medio, atmosfera in tonalità minore, emozione introspettiva e dolorosa. Usa chitarra espressiva e fraseggio soul delicato.",
    },
    "blues-upbeat": {
        en: "Write in an UPBEAT AMERICAN BLUES style: shuffle or swing groove, bright guitar riffs, lively rhythm section, and a feel-good, uplifting tone. Keep it energetic and joyful.",
        pt: "Escreva em BLUES AMERICANO animado: groove shuffle/swing, riffs de guitarra vivos, base rítmica pulsante e tom alto astral. Mantenha energia e alegria.",
        es: "Escribe en BLUES AMERICANO animado: groove shuffle/swing, riffs de guitarra vivos, base rítmica enérgica y tono optimista. Mantén energía y alegría.",
        fr: "Écris en BLUES AMÉRICAIN enjoué : groove shuffle/swing, riffs de guitare vifs, section rythmique dynamique et ton lumineux. Garde de l'énergie et de la joie.",
        it: "Scrivi in BLUES AMERICANO vivace: groove shuffle/swing, riff di chitarra energici, sezione ritmica brillante e tono solare. Mantieni energia e gioia.",
    },
    mpb: {
        en: "Write in a Brazilian MPB style with sophisticated, poetic language and metaphorical imagery.",
        pt: "Escreva em estilo MPB (Música Popular Brasileira) com linguagem sofisticada, poética e metafórica. Use fraseado elegante e temas atemporais brasileiros. As letras devem ter a sofisticação de compositores como Chico Buarque, Caetano Veloso, Gilberto Gil, ou Djavan. Incorpore a melancolia suave, o romantismo e a poesia típica da MPB popular.",
        es: "Escribe en estilo MPB brasileño (Música Popular Brasileña) con lenguaje sofisticado, poético y metafórico. Usa frases elegantes y temas atemporales.",
        fr: "Écris dans un style MPB brésilien (Musique Populaire Brésilienne) avec un langage sophistiqué, poétique et métaphorique. Utilise des phrases élégantes et des thèmes intemporels.",
        it: "Scrivi in stile MPB brasiliano (Musica Popolare Brasiliana) con un linguaggio sofisticato, poetico e metaforico. Usa frasi eleganti e temi senza tempo.",
    },
    bossa: {
        en: "Write in a Bossa Nova style with gentle, poetic language and subtle imagery.",
        pt: "Escreva em estilo BOSSA NOVA com leveza, poesia e o balanço do mar. Use linguagem suave, imagens do Rio de Janeiro, amor e natureza. O tom deve ser de 'brisa, barco e violão', como Tom Jobim, Vinicius de Moraes e João Gilberto. As letras devem ser sussurradas, íntimas e cheias de charme carioca.",
        es: "Escribe en estilo BOSSA NOVA con lenguaje suave, poético e imágenes sutiles. Usa ligereza, poesía y el balanceo del mar. El tono debe ser de brisa, barco y guitarra.",
        fr: "Écris dans un style BOSSA NOVA avec légèreté, poésie et le balancement de la mer. Utilise un langage doux, des images de Rio de Janeiro, d'amour et de nature. Le ton doit être de brise, bateau et guitare.",
        it: "Scrivi in stile BOSSA NOVA con leggerezza, poesia e il dondolio del mare. Usa un linguaggio dolce, immagini di Rio de Janeiro, amore e natura. Il tono deve essere di brezza, barca e chitarra.",
    },
    "mpb-bossa-nova": {
        en: "Write in a classic Brazilian bossa nova style with soft, intimate delivery and elegant phrasing. Keep it relaxed, poetic, and sophisticated.",
        pt: "Escreva em estilo BOSSA NOVA clássica, elegante e sofisticada, com voz suave e intimista. Use imagens do Rio, amor e natureza, com tom calmo e refinado.",
        es: "Escribe en estilo BOSSA NOVA clásica con entrega suave e íntima y frases elegantes. Mantén un tono relajado, poético y sofisticado.",
        fr: "Écris dans un style BOSSA NOVA classique avec une interprétation douce et intime et des phrases élégantes. Garde un ton détendu, poétique et sophistiqué.",
        it: "Scrivi in stile BOSSA NOVA classica con interpretazione dolce e intima e frasi eleganti. Mantieni un tono rilassato, poetico e sofisticato.",
    },
    "mpb-cancao-brasileira": {
        en: "Write in classic MPB / Brazilian singer-songwriter style with poetic storytelling and emotional depth. Keep it restrained and timeless.",
        pt: "Escreva em MPB clássica / canção brasileira, com letras poéticas, profundidade emocional e narrativa forte. O tom deve ser contido e atemporal.",
        es: "Escribe en estilo MPB clásica / canción brasileña con narrativa poética y profundidad emocional. Mantén un tono sobrio y atemporal.",
        fr: "Écris dans un style MPB classique / chanson brésilienne avec récit poétique et profondeur émotionnelle. Garde un ton sobre et intemporel.",
        it: "Scrivi in stile MPB classica / canzone brasiliana con narrazione poetica e profondità emotiva. Mantieni un tono sobrio e senza tempo.",
    },
    "mpb-pop": {
        en: "Write in a pop MPB style: modern and accessible, with a catchy chorus, direct emotion, and warm romantic tone.",
        pt: "Escreva em Pop MPB, moderno e acessível, com refrão marcante e emoção direta. Use estrutura pop e tom romântico.",
        es: "Escribe en estilo Pop MPB: moderno y accesible, con estribillo pegadizo, emoción directa y tono romántico.",
        fr: "Écris dans un style Pop MPB : moderne et accessible, avec refrain accrocheur, émotion directe et ton romantique.",
        it: "Scrivi in stile Pop MPB: moderno e accessibile, con ritornello orecchiabile, emozione diretta e tono romantico.",
    },
    "mpb-intimista": {
        en: "Write in an intimate MPB / Brazilian folk-pop style with conversational vocals, minimalist feel, and everyday-life lyrics.",
        pt: "Escreva em MPB intimista / folk-pop brasileiro, com voz próxima da conversa, arranjo simples e letras do cotidiano.",
        es: "Escribe en estilo MPB intimista / folk-pop brasileño, con voz conversacional, arreglo simple y letras del día a día.",
        fr: "Écris dans un style MPB intimiste / folk-pop brésilien, avec voix conversationnelle, arrangement simple et paroles du quotidien.",
        it: "Scrivi in stile MPB intimista / folk-pop brasiliano, con voce conversazionale, arrangiamento semplice e testi del quotidiano.",
    },
    "jovem-guarda": {
        en: "Write in a 1960s Brazilian Jovem Guarda style: upbeat rock and roll with romantic ballad moments. Keep the language simple and charming, with a nostalgic, joyful feel. Use a very catchy chorus and include backing-vocal hooks like \"o-o-o\" and \"la-la-la\". Think vintage Brazilian pop rock with a Wanderléa vibe and passionate delivery. Keep a celebratory, tribute-like tone (wedding vibe when it fits).",
        pt: "Escreva no estilo JOVEM GUARDA dos anos 60: pop rock brasileiro com energia de rock and roll e momentos de balada romântica. Use linguagem simples e encantadora, com clima nostálgico e alegre. Crie refrões muito cativantes e inclua vocalizações de apoio como \"ô-ô-ô\" e \"lá-lá-lá\". Pense no pop rock brasileiro vintage com vibe de Wanderléa e entrega apaixonada. Mantenha um tom de homenagem e celebração (com clima de casamento quando fizer sentido).",
        es: "Escribe en estilo JOVEM GUARDA brasileño de los años 60: pop rock con energía de rock and roll y momentos de balada romántica. Lenguaje simple y encantador, clima nostálgico y alegre. Usa estribillos muy pegadizos e incluye vocalizaciones de apoyo como \"o-o-o\" y \"la-la-la\". Piensa en el pop rock brasileño vintage con vibra de Wanderléa y entrega apasionada. Mantén un tono de homenaje y celebración (con vibra de boda cuando encaje).",
        fr: "Écris dans le style JOVEM GUARDA brésilien des années 60 : pop rock avec énergie rock and roll et moments de ballade romantique. Langage simple et charmant, ambiance nostalgique et joyeuse. Utilise des refrains très accrocheurs et ajoute des vocalises d'accompagnement comme \"o-o-o\" et \"la-la-la\". Pense au pop rock brésilien vintage avec une vibe à la Wanderléa et une interprétation passionnée. Garde un ton de célébration et d'hommage (ambiance mariage quand c'est pertinent).",
        it: "Scrivi nello stile JOVEM GUARDA brasiliano degli anni '60: pop rock con energia rock and roll e momenti da ballata romantica. Linguaggio semplice e affascinante, atmosfera nostalgica e gioiosa. Usa ritornelli molto orecchiabili e inserisci vocalizzi di supporto come \"o-o-o\" e \"la-la-la\". Pensa al pop rock brasiliano vintage con vibe alla Wanderléa e interpretazione appassionata. Mantieni un tono celebrativo e di omaggio (vibe di matrimonio quando ha senso).",
    },
    worship: {
        en: "Write in a worship/gospel style with spiritual depth, gratitude, and reverence. Reference faith, blessings, and divine love. Use uplifting, hopeful language that celebrates both the person and their spiritual journey.",
        pt: "Escreva em estilo GOSPEL brasileiro com profundidade espiritual, gratidão e reverência a Deus. Faça referência à fé cristã, bênçãos, graça e amor divino. Use linguagem edificante e esperançosa que celebra a pessoa e sua jornada espiritual. Pense no estilo de artistas como Aline Barros, Fernandinho, Gabriela Rocha, ou Anderson Freire. Inclua referências bíblicas de forma natural.",
        es: "Escribe en estilo de ADORACIÓN / MÚSICA CRISTIANA con profundidad espiritual, gratitud y reverencia a Dios. Haz referencia a la fe cristiana, bendiciones, gracia y amor divino. Usa lenguaje edificante y esperanzador que celebra a la persona y su camino espiritual. Piensa en artistas como Marcos Witt, Jesús Adrián Romero, Christine D'Clario, o Marcela Gándara. Incluye referencias bíblicas de forma natural.",
        fr: "Écris dans un style de LOUANGE / GOSPEL avec profondeur spirituelle, gratitude et révérence envers Dieu. Fais référence à la foi chrétienne, aux bénédictions, à la grâce et à l'amour divin. Utilise un langage édifiant et plein d'espoir qui célèbre la personne et son parcours spirituel. Inclus des références bibliques de manière naturelle.",
        it: "Scrivi in stile ADORAZIONE / GOSPEL italiano con profondità spirituale, gratitudine e riverenza verso Dio. Fai riferimento alla fede cristiana, alle benedizioni, alla grazia e all'amore divino. Usa un linguaggio edificante e pieno di speranza che celebra la persona e il suo percorso spirituale. Includi riferimenti biblici in modo naturale.",
    },
    gospel: {
        en: "Write in a worship/gospel style with spiritual depth, gratitude, and reverence. Reference faith, blessings, and divine love. Use uplifting, hopeful language that celebrates both the person and their spiritual journey.",
        pt: "Escreva em estilo GOSPEL brasileiro com profundidade espiritual, gratidão e reverência a Deus. Faça referência à fé cristã, bênçãos, graça e amor divino. Use linguagem edificante e esperançosa que celebra a pessoa e sua jornada espiritual. Pense no estilo de artistas como Aline Barros, Fernandinho, Gabriela Rocha, ou Anderson Freire. Inclua referências bíblicas de forma natural.",
        es: "Escribe en estilo de ADORACIÓN / MÚSICA CRISTIANA con profundidad espiritual, gratitud y reverencia a Dios. Haz referencia a la fe cristiana, bendiciones, gracia y amor divino. Usa lenguaje edificante y esperanzador que celebra a la persona y su camino espiritual. Piensa en artistas como Marcos Witt, Jesús Adrián Romero, Christine D'Clario, o Marcela Gándara. Incluye referencias bíblicas de forma natural.",
        fr: "Écris dans un style de LOUANGE / GOSPEL avec profondeur spirituelle, gratitude et révérence envers Dieu. Fais référence à la foi chrétienne, aux bénédictions, à la grâce et à l'amour divin. Utilise un langage édifiant et plein d'espoir qui célèbre la personne et son parcours spirituel. Inclus des références bibliques de manière naturelle.",
        it: "Scrivi in stile ADORAZIONE / GOSPEL italiano con profondità spirituale, gratitudine e riverenza verso Dio. Fai riferimento alla fede cristiana, alle benedizioni, alla grazia e all'amore divino. Usa un linguaggio edificante e pieno di speranza che celebra la persona e il suo percorso spirituale. Includi riferimenti biblici in modo naturale.",
    },
    hiphop: {
        en: "Write in a hip-hop style with rhythmic flow, clever wordplay, and personal storytelling. Use contemporary slang appropriately, internal rhymes, and authentic expression. Balance swagger with genuine emotion.",
        pt: "Escreva em estilo RAP BRASILEIRO com fluxo rítmico, jogos de palavras inteligentes e narrativa pessoal. Use gírias brasileiras contemporâneas apropriadamente, rimas internas e expressão autêntica. O estilo deve ser como Emicida, Racionais MC's, Projota, ou Criolo - com consciência social mas também emoção genuína. Equilibre atitude com sentimento verdadeiro. As rimas devem ser afiadas e o flow natural.",
        es: "Escribe en estilo REGGAETÓN / HIP-HOP LATINO con flow rítmico, juegos de palabras inteligentes y narrativa personal. Usa jerga latina contemporánea apropiadamente, rimas internas y expresión auténtica. Piensa en artistas como Bad Bunny (en sus canciones emotivas), Residente, o Calle 13. Equilibra el swagger con emoción genuina. Las rimas deben ser afiladas y el flow natural, mezclando ritmos latinos con hip-hop.",
        fr: "Écris dans un style RAP FRANÇAIS avec flow rythmique, jeux de mots intelligents et narration personnelle. Utilise l'argot français contemporain approprié, des rimes internes et une expression authentique. Pense à des artistes comme Nekfeu, Bigflo & Oli, Orelsan, ou Grand Corps Malade (slam). Équilibre l'attitude avec une émotion sincère. Les rimes doivent être affûtées et le flow naturel.",
        it: "Scrivi in stile RAP / HIP-HOP italiano con flow ritmico, giochi di parole intelligenti e narrazione personale. Usa slang italiano contemporaneo appropriato, rime interne ed espressione autentica. Pensa ad artisti come Caparezza, Jovanotti, o Fabri Fibra. Equilibra l'attitudine con emozione sincera. Le rime devono essere affilate e il flow naturale.",
    },
    funk: {
        en: "Write in a Brazilian funk style with strong beats, urban energy, and catchy hooks. Keep the rhythm direct and dance-driven.",
        pt: "Escreva em estilo FUNK brasileiro com batida forte, energia urbana e refrões diretos. O foco deve ser no ritmo e na vibe de baile.",
        es: "Escribe en estilo FUNK brasileño con ritmo fuerte, energía urbana y ganchos pegadizos. Vibe bailable.",
        fr: "Écris dans un style FUNK brésilien avec un rythme fort, une énergie urbaine et des accroches entraînantes.",
        it: "Scrivi in stile FUNK brasiliano con ritmo forte, energia urbana e ritornelli orecchiabili.",
    },
    "funk-carioca": {
        en: "Write in a Funk Carioca style with raw Rio de Janeiro beats, direct lyrics, and baile funk energy.",
        pt: "Escreva em estilo FUNK CARIOCA com batida raiz do Rio, direta e intensa, feita para baile e energia urbana.",
        es: "Escribe en estilo FUNK CARIOCA con ritmo crudo de Río, letras directas y energía de baile.",
        fr: "Écris dans un style FUNK CARIOCA avec des beats bruts de Rio, des paroles directes et une énergie de baile.",
        it: "Scrivi in stile FUNK CARIOCA con beat grezzi di Rio, testi diretti ed energia da baile.",
    },
    "funk-paulista": {
        en: "Write in a Funk Paulista style with heavy bass, aggressive groove, and street/car culture attitude.",
        pt: "Escreva em estilo FUNK PAULISTA com som pesado e grave, foco em impacto, rua, carro e atitude.",
        es: "Escribe en estilo FUNK PAULISTA con bajo pesado, groove agresivo y actitud callejera.",
        fr: "Écris dans un style FUNK PAULISTA avec basses lourdes, groove agressif et attitude urbaine.",
        it: "Scrivi in stile FUNK PAULISTA con bassi pesanti, groove aggressivo e attitudine di strada.",
    },
    "funk-melody": {
        en: "Write in a Funk Melody style with melodic, romantic vibe, sung choruses, and emotional tone.",
        pt: "Escreva em estilo FUNK MELODY com clima melódico e romântico, refrões cantados e tom emocional.",
        es: "Escribe en estilo FUNK MELODY con vibra melódica y romántica, coros cantados y tono emocional.",
        fr: "Écris dans un style FUNK MELODY avec une vibe mélodique et romantique, refrains chantés et ton émotionnel.",
        it: "Scrivi in stile FUNK MELODY con vibe melodica e romantica, ritornelli cantati e tono emotivo.",
    },
    brega: {
        en: "Write in a Brazilian brega style: romantic, emotive, and direct, with popular appeal.",
        pt: "Escreva em estilo BREGA brasileiro, romântico, emotivo e direto. Linguagem popular e sentimento intenso.",
        es: "Escribe en estilo BREGA brasileño, romántico, emotivo y directo. Lenguaje popular y sentimiento intenso.",
        fr: "Écris dans un style BREGA brésilien, romantique, émotif et direct. Langage populaire et sentiment intense.",
        it: "Scrivi in stile BREGA brasiliano, romantico, emotivo e diretto. Linguaggio popolare e sentimento intenso.",
    },
    "brega-romantico": {
        en: "Write in a Brega Romântico style: sentimental, romantic melodies with heartfelt lyrics.",
        pt: "Escreva em estilo BREGA ROMÂNTICO com melodias sentimentais e letras apaixonadas.",
        es: "Escribe en estilo BREGA ROMÁNTICO con melodías sentimentales y letras apasionadas.",
        fr: "Écris dans un style BREGA ROMANTIQUE avec des mélodies sentimentales et des paroles passionnées.",
        it: "Scrivi in stile BREGA ROMANTICO con melodie sentimentali e testi appassionati.",
    },
    tecnobrega: {
        en: "Write in a Tecnobrega style: electronic beats, danceable energy, and party vibe.",
        pt: "Escreva em estilo TECNOBREGA com batida eletrônica, clima dançante e energia de festa.",
        es: "Escribe en estilo TECNOBREGA con beat electrónico, energía bailable y ambiente de fiesta.",
        fr: "Écris dans un style TECNOBREGA avec beat électronique, énergie dansante et ambiance de fête.",
        it: "Scrivi in stile TECNOBREGA con beat elettronico, energia ballabile e atmosfera da festa.",
    },
    samba: {
        en: "Write in a Brazilian samba style with joyful celebration, rhythmic cadence, and carnival spirit. Use vibrant imagery, playful language, and infectious happiness. Celebrate life and love with Brazilian warmth.",
        pt: "Escreva em estilo SAMBA brasileiro autêntico com celebração alegre, cadência rítmica e espírito de carnaval. Use imagens vibrantes do Brasil, linguagem divertida e felicidade contagiante. Celebre a vida e o amor com calor brasileiro. Pense em compositores como Zeca Pagodinho, Beth Carvalho, Martinho da Vila, ou Arlindo Cruz. Inclua a malandragem carioca e o jeitinho brasileiro.",
        es: "Escribe en estilo SAMBA brasileño con celebración alegre, cadencia rítmica y espíritu de carnaval. Usa imágenes vibrantes, lenguaje divertido y felicidad contagiosa.",
        fr: "Écris dans un style SAMBA brésilien avec une célébration joyeuse, une cadence rythmique et un esprit de carnaval. Utilise des images vibrantes, un langage ludique et un bonheur contagieux.",
        it: "Scrivi in stile SAMBA brasiliano con celebrazione gioiosa, cadenza ritmica e spirito di carnevale. Usa immagini vibranti, linguaggio giocoso e felicità contagiosa. Celebra la vita e l'amore con calore brasiliano.",
    },
    pagode: {
        en: "Write in a traditional Brazilian pagode style with roda de pagode vibe, nylon-string banjo, tantan, repique de mão, and cavaquinho. Lyrics should talk about everyday life, gatherings, parties, and social chronicles with warm, conversational language.",
        pt: "Escreva em estilo PAGODE brasileiro tradicional com clima de roda, banjo de nylon, tantã, repique de mão e cavaquinho. As letras devem falar do cotidiano, encontros, festas e crônicas sociais, com linguagem simples e calorosa. Pense em Fundo de Quintal, Zeca Pagodinho, Beth Carvalho, Almir Guineto ou Jorge Aragão.",
        es: "Escribe en estilo PAGODE brasileño tradicional con ambiente de roda, banjo de nylon, tantán, repique de mano y cavaquinho. Las letras deben hablar del día a día, reuniones, fiestas y crónicas sociales, con lenguaje cálido y conversacional.",
        fr: "Écris dans un style PAGODE brésilien traditionnel avec ambiance de roda, banjo nylon, tantã, repique de mão et cavaquinho. Les paroles doivent parler du quotidien, des rencontres, des fêtes et de chroniques sociales, avec un langage chaleureux et naturel.",
        it: "Scrivi in stile PAGODE brasiliano tradizionale con atmosfera di roda, banjo in nylon, tantã, repique de mão e cavaquinho. I testi devono parlare del quotidiano, incontri, feste e cronache sociali, con un linguaggio caldo e colloquiale.",
    },
    "pagode-de-mesa": {
        en: "Write in a Pagode de Mesa (roots) style from the Rio suburbs, with nylon-string banjo, tantan, repique de mão, pandeiro, and cavaquinho. Lyrics should feel like a backyard roda: everyday life, celebrations, friendship, and social chronicles. Think Fundo de Quintal and Zeca Pagodinho.",
        pt: "Escreva em estilo PAGODE DE MESA (RAIZ), típico dos subúrbios do Rio e das rodas do Cacique de Ramos. Use banjo de nylon, tantã, repique de mão, pandeiro e cavaquinho. As letras devem falar do cotidiano, festas, amizade e crônicas sociais, com clima de roda e conversa. Pense em Fundo de Quintal, Zeca Pagodinho, Beth Carvalho, Almir Guineto e Jorge Aragão.",
        es: "Escribe en estilo PAGODE DE MESA (raíz), típico de los suburbios de Río y las rodas. Usa banjo de nylon, tantán, repique de mano, pandeiro y cavaquinho. Las letras deben hablar del cotidiano, fiestas, amistad y crónicas sociales, con clima de roda y conversación.",
        fr: "Écris dans le style PAGODE DE MESA (racines), typique des banlieues de Rio et des rodas. Utilise banjo nylon, tantã, repique de mão, pandeiro et cavaquinho. Les paroles parlent du quotidien, des fêtes, de l'amitié et des chroniques sociales, avec un esprit de roda et de conversation.",
        it: "Scrivi nello stile PAGODE DE MESA (radici), tipico delle periferie di Rio e delle rodas. Usa banjo in nylon, tantã, repique de mão, pandeiro e cavaquinho. I testi parlano della vita quotidiana, feste, amicizia e cronache sociali, con clima di roda e conversazione.",
    },
    "pagode-romantico": {
        en: "Write in 90s Pagode Romantico style: smoother groove, pop-friendly production, keyboards and brass, and lyrics fully focused on love, longing, and heartbreak. Keep the tempo more cadenced and radio-friendly. Think Raça Negra, Só Pra Contrariar, Exaltasamba, and Katinguelê.",
        pt: "Escreva em estilo PAGODE ROMÂNTICO (anos 90), com groove mais cadenciado e produção pop mais polida. Traga teclados e sopros no imaginário, e letras totalmente focadas em amor, romance, desilusão e saudade. O tom deve ser radiofônico e emotivo. Pense em Raça Negra, Só Pra Contrariar, Molejo, Art Popular, Exaltasamba e Katinguelê.",
        es: "Escribe en estilo PAGODE ROMÁNTICO de los años 90, con groove más cadenciado y producción más pop. Imagina teclados y metales, y letras totalmente enfocadas en amor, romance, desilusión y nostalgia. Tono radiofónico y emotivo.",
        fr: "Écris dans un style PAGODE ROMANTIQUE des années 90, avec groove plus cadencé et production plus pop. Imagine des claviers et des cuivres, et des paroles centrées sur l'amour, le romantisme, la désillusion et la nostalgie. Ton radio-friendly et émouvant.",
        it: "Scrivi in stile PAGODE ROMANTICO anni 90, con groove più cadenzato e produzione più pop. Immagina tastiere e fiati, e testi totalmente incentrati su amore, romanticismo, delusione e nostalgia. Tono radiofonico ed emotivo.",
    },
    "pagode-universitario": {
        en: "Write in a Pagode Universitario / Novo Pagode style: modern arrangements, pop-friendly hooks, and blends of pagode with sertanejo, pop, and hints of funk. Lyrics can mention parties, social media, detachment, and modern romance. Think Thiaguinho, Sorriso Maroto, Ferrugem, Dilsinho, and Mumuzinho.",
        pt: "Escreva em estilo PAGODE UNIVERSITÁRIO / NOVO PAGODE, com arranjos modernos e refrões pop. Misture elementos de pagode com sertanejo universitário, pop e até funk. As letras podem falar de baladas, redes sociais, desapego e romantismo moderno. Pense em Thiaguinho, Sorriso Maroto, Ferrugem, Dilsinho, Mumuzinho e Ludmilla (Numanice).",
        es: "Escribe en estilo PAGODE UNIVERSITARIO / NOVO PAGODE con arreglos modernos y ganchos pop. Mezcla pagode con sertanejo, pop y toques de funk. Letras sobre fiestas, redes sociales, desapego y romance moderno.",
        fr: "Écris dans un style PAGODE UNIVERSITÁRIO / NOVO PAGODE avec des arrangements modernes et des accroches pop. Mélange pagode avec sertanejo, pop et des touches de funk. Paroles sur les sorties, les réseaux sociaux, le détachement et le romantisme moderne.",
        it: "Scrivi in stile PAGODE UNIVERSITÁRIO / NOVO PAGODE con arrangiamenti moderni e hook pop. Mescola pagode con sertanejo, pop e tocchi di funk. Testi su feste, social network, distacco e romanticismo moderno.",
    },
    forro: {
        en: "Write in a Brazilian Forró style, focusing on dance, romance, and joyful countryside vibes.",
        pt: "Escreva em estilo FORRÓ brasileiro ou Piseiro, com ritmo dançante, alegria e romance. Misture a simplicidade e a poesia do interior com a animação das festas. Use metáforas sobre o sertão, a lua, o xote e o baião para falar de amor e união. Pense em Luiz Gonzaga, Falamansa ou Wesley Safadão. Deve ser uma música que dê vontade de dançar junto.",
        es: "Escribe en estilo FORRÓ brasileño, enfocándote en baile, romance y vibras alegres del campo.",
        fr: "Écris dans un style FORRÓ brésilien, en mettant l'accent sur la danse, la romance et les vibrations joyeuses de la campagne.",
        it: "Scrivi in stile FORRÓ brasiliano, concentrandoti su danza, romanticismo e vibrazioni gioiose della campagna. Ritmo ballabile e allegro.",
    },
    "forro-pe-de-serra-rapido": {
        // Dançante, animado, festivo - tradicional mas alegre
        en: "Write in a traditional Brazilian Forró Pé-de-Serra style. Use accordion (sanfona), zabumba, and triangle as the core sound. Keep it rootsy, rustic, and culturally authentic, with UPBEAT DANCEABLE energy. Focus on community dances, celebration, and joyful moments.",
        pt: "Escreva em estilo FORRÓ PÉ-DE-SERRA DANÇANTE, tradicional e festivo. Baseie-se em sanfona, zabumba e triângulo. Mantenha o clima ANIMADO de festa do interior, com xote e baião. Energia alegre e dançante.",
        es: "Escribe en estilo FORRÓ PÉ-DE-SERRA tradicional BAILABLE, con acordeón, zabumba y triángulo. Mantén energía festiva, alegre y danzante.",
        fr: "Écris dans un style FORRÓ PÉ-DE-SERRA traditionnel DANSANT, avec accordéon, zabumba et triangle. Garde une énergie festive, joyeuse et dansante.",
        it: "Scrivi in stile FORRÓ PÉ-DE-SERRA tradizionale BALLABILE, con fisarmonica, zabumba e triangolo. Mantieni energia festiva, allegra e danzante.",
    },
    "forro-pe-de-serra-lento": {
        // Lento, contemplativo, nostálgico - 70-85 BPM
        en: "Write in a SLOW, contemplative Forró Pé-de-Serra style. Focus on nostalgia, longing, quiet love, and the beauty of a slow life. Use simple, poetic imagery about time, home, and memories. Think calm Sunday afternoon in the countryside. Gentle and melancholic.",
        pt: "Escreva em estilo FORRÓ PÉ-DE-SERRA LENTO e contemplativo. Foque em nostalgia, saudade, amor tranquilo e a beleza da vida simples. Use imagens poéticas sobre tempo, lar e memórias. Pense em tarde calma de domingo no interior. Gentil e melancólico.",
        es: "Escribe en estilo FORRÓ PÉ-DE-SERRA LENTO y contemplativo. Enfócate en nostalgia, añoranza, amor tranquilo y la belleza de la vida simple. Usa imágenes poéticas sobre tiempo, hogar y memorias. Gentil y melancólico.",
        fr: "Écris dans un style FORRÓ PÉ-DE-SERRA LENT et contemplatif. Concentre-toi sur la nostalgie, le désir, l'amour tranquille et la beauté de la vie simple. Utilise des images poétiques sur le temps, le foyer et les souvenirs. Doux et mélancolique.",
        it: "Scrivi in stile FORRÓ PÉ-DE-SERRA LENTO e contemplativo. Concentrati su nostalgia, desiderio, amore tranquillo e la bellezza della vita semplice. Usa immagini poetiche su tempo, casa e ricordi. Gentile e malinconico.",
    },
    "forro-universitario": {
        en: "Write in a Forró Universitário style: a modern, lighter, youthful take on forró with acoustic guitar and pop-friendly arrangements. Blend tradition with urban language and a catchy romantic feel.",
        pt: "Escreva em estilo FORRÓ UNIVERSITÁRIO, misturando tradição com linguagem urbana. Arranjos mais leves, jovens e românticos, com clima dançante e refrões fáceis de cantar.",
        es: "Escribe en estilo FORRÓ UNIVERSITARIO, moderno y ligero, con lenguaje urbano y arreglos más suaves. Mantén el baile y el romance.",
        fr: "Écris dans un style FORRÓ UNIVERSITÁRIO, moderne et léger, avec un langage urbain et des arrangements plus doux. Garde l'esprit dansant et romantique.",
        it: "Scrivi in stile FORRÓ UNIVERSITÁRIO, moderno e leggero, con linguaggio urbano e arrangiamenti più soft. Mantieni il carattere danzante e romantico.",
    },
    "forro-eletronico": {
        en: "Write in a Forró Eletrônico style: commercial, high-energy, keyboard/synth driven, electronic drums, and pop structures. Big event/festival vibe with strong, catchy choruses.",
        pt: "Escreva em estilo FORRÓ ELETRÔNICO, comercial e de grandes eventos. Use teclado/synth, bateria eletrônica e estrutura pop. Refrões fortes e clima de festa.",
        es: "Escribe en estilo FORRÓ ELECTRÓNICO, comercial y de grandes eventos, con teclado/synth y batería electrónica. Estructura pop y estribillos fuertes.",
        fr: "Écris dans un style FORRÓ ÉLECTRONIQUE, commercial et de grands événements, avec clavier/synthé et batterie électronique. Structure pop et refrains forts.",
        it: "Scrivi in stile FORRÓ ELETTRONICO, commerciale e da grandi eventi, con tastiere/synth e batteria elettronica. Struttura pop e ritornelli forti.",
    },
    "sertanejo-raiz": {
        en: "Write in a traditional Sertanejo Raiz style with narrative lyrics, viola caipira, rural imagery, family values, and cultural roots.",
        pt: "Escreva em estilo SERTANEJO RAIZ com letras narrativas, viola caipira, temas rurais, família e tradição. O tom deve ser clássico e autêntico.",
        es: "Escribe en estilo SERTANEJO RAIZ tradicional con letras narrativas, viola caipira e imágenes rurales. Mantén un tono clásico y auténtico.",
        fr: "Écris dans un style SERTANEJO RAIZ traditionnel avec des paroles narratives, viola caipira et images rurales. Ton classique et authentique.",
        it: "Scrivi in stile SERTANEJO RAIZ tradizionale con testi narrativi, viola caipira e immagini rurali. Tono classico e autentico.",
    },
    "sertanejo-universitario": {
        en: "Write in a Sertanejo Universitário style: urban-friendly, direct language, strong catchy choruses, pop structure with Brazilian country identity.",
        pt: "Escreva em estilo SERTANEJO UNIVERSITÁRIO, com linguagem direta, refrões fortes e estrutura pop, mantendo a identidade sertaneja.",
        es: "Escribe en estilo SERTANEJO UNIVERSITARIO con lenguaje directo, coros fuertes y estructura pop, manteniendo identidad sertaneja.",
        fr: "Écris dans un style SERTANEJO UNIVERSITÁRIO avec un langage direct, des refrains forts et une structure pop, en gardant l'identité sertaneja.",
        it: "Scrivi in stile SERTANEJO UNIVERSITÁRIO con linguaggio diretto, ritornelli forti e struttura pop, mantenendo l'identità sertaneja.",
    },
    "sertanejo-romantico": {
        en: "Write in a Sertanejo Romântico style focused on emotion, relationships, longing, and love. Use melodic arrangements and intense, heartfelt delivery.",
        pt: "Escreva em estilo SERTANEJO ROMÂNTICO com foco em emoção, relacionamento, saudade e amor. Arranjos melódicos e interpretação intensa.",
        es: "Escribe en estilo SERTANEJO ROMÁNTICO con foco en emoción, relación, nostalgia y amor. Arreglos melódicos e interpretación intensa.",
        fr: "Écris dans un style SERTANEJO ROMANTIQUE centré sur l'émotion, les relations, la nostalgie et l'amour. Arrangements mélodiques et interprétation intense.",
        it: "Scrivi in stile SERTANEJO ROMANTICO con focus su emozione, relazione, nostalgia e amore. Arrangiamenti melodici e interpretazione intensa.",
    },
    axe: {
        en: "Write in a Brazilian Axé style with high energy, carnival vibes, and sun-soaked happiness.",
        pt: "Escreva em estilo AXÉ MUSIC (anos 90) com energia alta de carnaval baiano e clima de trio elétrico. As letras devem ser alegres, celebratórias e dançantes, com refrão antêmico e fácil de cantar, chamadas e respostas com a galera e swing baiano contagiante. Traga a vibe de verão, praia e Salvador, com linguagem simples e direta, clima feel-good e festa. Pense em Ivete Sangalo, Chiclete com Banana ou Banda Eva. Celebre a pessoa homenageada como se ela fosse o sol da festa.",
        es: "Escribe en estilo AXÉ brasileño con alta energía, vibras de carnaval y felicidad soleada.",
        fr: "Écris dans un style AXÉ brésilien avec une haute énergie, des vibrations de carnaval et un bonheur ensoleillé.",
        it: "Scrivi in stile AXÉ brasiliano con alta energia, vibrazioni di carnevale e felicità solare. Ritornelli contagiosi e celebrazione totale.",
    },
    capoeira: {
        en: "Write in a Brazilian capoeira style with berimbau-led rhythm, call-and-response chants, and a percussive groove. Keep it energetic, communal, and chant-like.",
        pt: "Escreva em estilo CAPOEIRA brasileiro com ritmo guiado pelo berimbau, atabaque e palmas, com chamadas e respostas típicas da roda. Mantenha energia coletiva, versos curtos, repetição e clima de jogo e celebração.",
        es: "Escribe en estilo CAPOEIRA brasileña con ritmo del berimbau, atabaque y palmas, con cantos de llamada y respuesta. Mantén energía comunitaria, versos cortos, repetición y ambiente de roda.",
        fr: "Écris dans un style CAPOEIRA brésilien avec rythme au berimbau, atabaque et palmas, en mode appel-réponse. Garde une énergie collective, des vers courts, la répétition et l'ambiance de roda.",
        it: "Scrivi in stile CAPOEIRA brasiliano con ritmo guidato dal berimbau, atabaque e palmas, con canti di chiamata e risposta. Mantieni energia collettiva, versi brevi, ripetizione e atmosfera da roda.",
    },
    reggae: {
        en: "Write in a Reggae style with laid-back vibes, steady rhythm, and positive messages.",
        pt: "Escreva em estilo REGGAE com vibe relaxada (estilo Natiruts, Maneva ou Armandinho). A letra deve passar paz, amor, positividade, conexão com a natureza e boas energias. Use uma linguagem mais leve, \"good vibes\", falando sobre sentimentos verdadeiros, brisa do mar e tranquilidade. Crie uma atmosfera de paz e gratidão pela vida da pessoa.",
        es: "Escribe en estilo REGGAE con vibras relajadas, ritmo constante y mensajes positivos. Transmite paz, amor, positividad y conexión con la naturaleza.",
        fr: "Écris dans un style REGGAE avec des vibes décontractées, un rythme régulier et des messages positifs. Transmets paix, amour, positivité et connexion avec la nature.",
        it: "Scrivi in stile REGGAE con vibrazioni rilassate, ritmo costante e messaggi positivi. Trasmetti pace, amore, positività e connessione con la natura.",
    },
    lullaby: {
        en: "Write a soothing Lullaby for a child, with gentle rhymes, soft imagery, and comforting words.",
        pt: "Escreva uma CANÇÃO DE NINAR (Infantil) doce, suave e reconfortante. Use diminutivos carinhosos, imagens de sonhos, anjinhos, estrelas e proteção divina. O tom deve ser de puro amor, proteção e ternura, perfeito para fazer uma criança dormir ou para declarar o amor de um pai/mãe. A linguagem deve ser simples, inocente e extremamente afetuosa.",
        es: "Escribe una CANCIÓN DE CUNA dulce, suave y reconfortante. Usa diminutivos cariñosos, imágenes de sueños, angelitos, estrellas y protección divina. El tono debe ser de puro amor, protección y ternura, perfecto para hacer dormir a un niño o para declarar el amor de un padre/madre. El lenguaje debe ser simple, inocente y extremadamente afectuoso.",
        fr: "Écris une BERCEUSE douce, apaisante et réconfortante. Utilise des diminutifs affectueux, des images de rêves, de petits anges, d'étoiles et de protection divine. Le ton doit être d'amour pur, de protection et de tendresse, parfait pour endormir un enfant ou pour déclarer l'amour d'un parent. Le langage doit être simple, innocent et extrêmement affectueux.",
        it: "Scrivi una NINNA NANNA dolce, rilassante e confortante. Usa diminutivi affettuosi, immagini di sogni, angioletti, stelle e protezione divina. Il tono deve essere di puro amore, protezione e tenerezza, perfetto per far addormentare un bambino o per dichiarare l'amore di un genitore. Il linguaggio deve essere semplice, innocente ed estremamente affettuoso.",
    },
    "lullaby-ninar": {
        en: "Write a soothing lullaby: slow tempo, gentle and repetitive melody, warm acoustic instruments, calm bedtime atmosphere, tender and protective tone.",
        pt: "Escreva uma canção de ninar suave e aconchegante: ritmo lento, melodia simples e repetitiva, instrumentos leves, clima de carinho e segurança, voz doce e protetora.",
        es: "Escribe una canción de cuna suave y acogedora: tempo lento, melodía simple y repetitiva, instrumentos cálidos, clima de cariño y seguridad, voz dulce.",
        fr: "Écris une berceuse douce et réconfortante : tempo lent, mélodie simple et répétitive, instruments chaleureux, climat de tendresse et de sécurité, voix douce.",
        it: "Scrivi una ninna nanna dolce e accogliente: tempo lento, melodia semplice e ripetitiva, strumenti caldi, clima di affetto e sicurezza, voce dolce.",
    },
    "lullaby-animada": {
        en: "Write an upbeat children's song: cheerful, playful, catchy rhythm, simple positive lyrics, energetic and family-friendly.",
        pt: "Escreva uma música infantil animada: alegre, divertida, com ritmo contagiante, letras simples e positivas, clima de brincadeira e imaginação.",
        es: "Escribe una canción infantil animada: alegre, divertida, con ritmo pegadizo, letras simples y positivas, clima de juego e imaginación.",
        fr: "Écris une chanson pour enfants entraînante : joyeuse, ludique, rythme accrocheur, paroles simples et positives, ambiance de jeu et d'imagination.",
        it: "Scrivi una canzone per bambini vivace: allegra, giocosa, ritmo orecchiabile, testi semplici e positivi, atmosfera di gioco e immaginazione.",
    },
    "musica-classica": {
        en: "Write in a classical/operatic Romantic-era aria style with elevated, poetic language, grand imagery, and dramatic emotion. Keep it timeless and formal; avoid modern slang.",
        pt: "Escreva em estilo de música clássica/ária romântica (bel canto), com linguagem elevada, poética e dramática. Use imagens grandiosas e emoção atemporal; evite gírias modernas.",
        es: "Escribe en estilo de música clásica/aria romántica (bel canto), con lenguaje elevado, poético y dramático. Usa imágenes grandiosas y emoción atemporal; evita jerga moderna.",
        fr: "Écris dans un style de musique classique/aria romantique (bel canto), avec un langage élevé, poétique et dramatique. Utilise des images grandioses et une émotion intemporelle; évite l'argot moderne.",
        it: "Scrivi in stile musica classica/aria romantica (bel canto), con linguaggio elevato, poetico e drammatico. Usa immagini grandiose ed emozione senza tempo; evita slang moderno.",
    },
    eletronica: {
        en: "Write in a modern electronic music style with danceable groove, warm synths, and an emotional melodic core. Keep it cinematic and uplifting.",
        pt: "Escreva em estilo de música eletrônica moderna com groove dançante, sintetizadores quentes e um núcleo melódico emocional. Mantenha clima cinematográfico e inspirador.",
        es: "Escribe en estilo de música electrónica moderna con groove bailable, sintetizadores cálidos y un núcleo melódico emocional. Mantén un clima cinematográfico e inspirador.",
        fr: "Écris dans un style de musique électronique moderne avec un groove dansant, des synthés chaleureux et un noyau mélodique émotionnel. Garde un climat cinématographique et inspirant.",
        it: "Scrivi in stile di musica elettronica moderna con groove ballabile, synth caldi e un nucleo melodico emozionale. Mantieni un clima cinematografico e ispiratore.",
    },
    "eletronica-afro-house": {
        en: "Write in Afro House style: hypnotic, groove-driven, warm and spiritual. Use short mantra-like phrases and an emotional, uplifting tone.",
        pt: "Escreva em estilo Afro House: hipnótico, groove envolvente, quente e espiritual. Use frases curtas em forma de mantra e um tom emocional e inspirador.",
        es: "Escribe en estilo Afro House: hipnótico, con groove envolvente, cálido y espiritual. Usa frases cortas tipo mantra y un tono emocional e inspirador.",
        fr: "Écris dans un style Afro House : hypnotique, groove enveloppant, chaud et spirituel. Utilise des phrases courtes type mantra et un ton émotionnel et inspirant.",
        it: "Scrivi in stile Afro House: ipnotico, groove avvolgente, caldo e spirituale. Usa frasi brevi tipo mantra e un tono emozionale e ispiratore.",
    },
    "eletronica-progressive-house": {
        en: "Write in Progressive House style: melodic, uplifting, with a sense of journey and emotional build. Aim for a strong, memorable chorus.",
        pt: "Escreva em estilo Progressive House: melódico, inspirador, com sensação de jornada e construção emocional. Busque um refrão marcante.",
        es: "Escribe en estilo Progressive House: melódico, inspirador, con sensación de viaje y construcción emocional. Busca un estribillo fuerte.",
        fr: "Écris dans un style Progressive House : mélodique, inspirant, avec une sensation de voyage et de montée émotionnelle. Vise un refrain marquant.",
        it: "Scrivi in stile Progressive House: melodico, ispiratore, con senso di viaggio e crescendo emotivo. Punta a un ritornello memorabile.",
    },
    "eletronica-melodic-techno": {
        en: "Write in Melodic Techno style: deep, cinematic, intense. Use futuristic imagery, epic synth atmosphere, and a focused, dramatic vocal line.",
        pt: "Escreva em estilo Melodic Techno: profundo, cinematográfico e intenso. Use imagens futuristas, atmosfera épica e um vocal pontual e dramático.",
        es: "Escribe en estilo Melodic Techno: profundo, cinematográfico e intenso. Usa imágenes futuristas, atmósfera épica y un vocal puntual y dramático.",
        fr: "Écris dans un style Melodic Techno : profond, cinématographique et intense. Utilise des images futuristes, une atmosphère épique et un vocal ponctuel et dramatique.",
        it: "Scrivi in stile Melodic Techno: profondo, cinematografico e intenso. Usa immagini futuriste, atmosfera epica e un vocal puntuale e drammatico.",
    },
    latina: {
        en: "Write in a Latin music style with warm rhythmic groove, expressive percussion, and romantic, danceable energy.",
        pt: "Escreva em estilo de MÚSICA LATINA com ritmo marcado, percussões expressivas e clima quente, romântico e dançante.",
        es: "Escribe en estilo de MÚSICA LATINA con ritmo marcado, percusión expresiva y un clima cálido, romántico y bailable.",
        fr: "Écris dans un style de MUSIQUE LATINE avec un rythme marqué, des percussions expressives et une ambiance chaude, romantique et dansante.",
        it: "Scrivi in stile MUSICA LATINA con ritmo marcato, percussioni espressive e atmosfera calda, romantica e ballabile.",
    },
    bolero: {
        en: "Write in a classic romantic orchestral bolero style (1950s/60s Latin): slow steady 4/4 groove around 76 BPM, brushed snare, rim clicks, maracas, subtle bongos, nylon-string guitar arpeggios, upright bass, and lush cinematic strings that grow into a dramatic chorus. Keep it timeless, nostalgic, and emotionally intense.",
        pt: "Escreva em estilo BOLERO orquestral romântico clássico (Latino anos 1950/60): groove lento em 4/4 por volta de 76 BPM, caixa com vassourinhas, rim clicks, maracas, bongôs sutis, arpejos de violão de nylon, contrabaixo acústico e cordas cinematográficas que crescem até um refrão dramático. O tom deve ser atemporal, nostálgico e emocionalmente intenso.",
        es: "Escribe en estilo BOLERO orquestal romántico clásico (Latino de los años 50/60): groove lento en 4/4 alrededor de 76 BPM, redoblante con escobillas, rim clicks, maracas, bongós sutiles, arpegios de guitarra de nylon, contrabajo y cuerdas cinematográficas que crecen hacia un coro dramático. Mantén un tono atemporal, nostálgico y emocional.",
        fr: "Écris dans un style BOLÉRO orchestral romantique classique (Latino années 50/60) : groove lent en 4/4 autour de 76 BPM, caisse claire aux balais, rim clicks, maracas, bongos subtils, arpèges de guitare nylon, contrebasse et cordes cinématographiques qui montent vers un refrain dramatique. Garde un ton intemporel, nostalgique et très émotionnel.",
        it: "Scrivi in stile BOLERO orchestrale romantico classico (latino anni 50/60): groove lento in 4/4 intorno a 76 BPM, rullante con spazzole, rim click, maracas, bonghi delicati, arpeggi di chitarra nylon, contrabbasso e archi cinematografici che crescono verso un ritornello drammatico. Mantieni un tono senza tempo, nostalgico e molto emotivo.",
    },
    // Spanish-specific genres
    salsa: {
        en: "Write in a Salsa style with passionate energy, romantic themes, and dance rhythm. Use Caribbean warmth and celebratory spirit.",
        pt: "Escreva em estilo SALSA com energia apaixonada, temas românticos e ritmo dançante. Use calor caribenho e espírito de celebração.",
        es: "Escribe en estilo SALSA con energía apasionada, temas románticos y ritmo bailable. Usa el calor caribeño, expresiones de amor intenso y espíritu de celebración. Piensa en artistas como Marc Anthony, Héctor Lavoe, Celia Cruz, o Gilberto Santa Rosa. Las letras deben tener sabor latino, pasión y alegría de vivir. Incluye referencias al baile, al amor apasionado y a la fiesta.",
        fr: "Écris dans un style SALSA avec une énergie passionnée, des thèmes romantiques et un rythme de danse. Utilise la chaleur caribéenne et l'esprit de célébration.",
        it: "Scrivi in stile SALSA con energia appassionata, temi romantici e ritmo ballabile. Usa il calore caraibico e lo spirito di celebrazione. Passione e gioia di vivere.",
    },
    merengue: {
        en: "Write in a Merengue style with fast, joyful rhythm, festive percussion, and celebratory energy. Keep it upbeat and danceable.",
        pt: "Escreva em estilo MERENGUE com ritmo acelerado, percussão festiva e energia alegre. Clima animado, popular e dançante.",
        es: "Escribe en estilo MERENGUE con ritmo rápido, percusión festiva y energía alegre. Mantén un clima animado y bailable.",
        fr: "Écris dans un style MERENGUE avec un rythme rapide, des percussions festives et une énergie joyeuse. Ambiance entraînante et dansante.",
        it: "Scrivi in stile MERENGUE con ritmo veloce, percussioni festive ed energia gioiosa. Atmosfera allegra e ballabile.",
    },
    bachata: {
        en: "Write in a Bachata style with romantic, sensual themes and heartfelt emotion. Use poetic language about love and longing.",
        pt: "Escreva em estilo BACHATA com temas românticos, sensuais e emoção sincera. Use linguagem poética sobre amor e saudade.",
        es: "Escribe en estilo BACHATA con temas románticos, sensuales y emoción profunda. Usa lenguaje poético sobre amor, deseo y nostalgia. Piensa en artistas como Romeo Santos, Prince Royce, o Aventura. Las letras deben tener esa melancolía romántica característica de la bachata, hablando de amor verdadero, corazones rotos y pasión. El tono debe ser íntimo y emotivo.",
        fr: "Écris dans un style BACHATA avec des thèmes romantiques, sensuels et une émotion sincère. Utilise un langage poétique sur l'amour et la nostalgie.",
        it: "Scrivi in stile BACHATA con temi romantici, sensuali ed emozione sincera. Usa un linguaggio poetico sull'amore e la nostalgia. Tono intimo ed emotivo.",
    },
    cumbia: {
        en: "Write in a Cumbia style with festive energy, catchy rhythms, and joyful celebration.",
        pt: "Escreva em estilo CUMBIA com energia festiva, ritmos cativantes e celebração alegre.",
        es: "Escribe en estilo CUMBIA con energía festiva, ritmos pegadizos y celebración alegre. Usa lenguaje popular latinoamericano, referencias a la fiesta, el baile y la alegría de vivir. Piensa en Los Ángeles Azules, Selena, o Grupo Niche. Las letras deben ser fáciles de cantar, con estribillos repetitivos y contagiosos. El tono debe ser de fiesta popular y felicidad.",
        fr: "Écris dans un style CUMBIA avec une énergie festive, des rythmes entraînants et une célébration joyeuse.",
        it: "Scrivi in stile CUMBIA con energia festiva, ritmi orecchiabili e celebrazione gioiosa. Ritornelli contagiosi e atmosfera di festa popolare.",
    },
    ranchera: {
        en: "Write in a Ranchera/Mariachi style with passionate storytelling, deep emotion, and Mexican cultural imagery.",
        pt: "Escreva em estilo RANCHERA/Mariachi com narrativa apaixonada, emoção profunda e imagens culturais mexicanas.",
        es: "Escribe en estilo RANCHERA / REGIONAL MEXICANO con narrativa apasionada, emoción profunda y orgullo mexicano. Usa lenguaje tradicional, referencias a la tierra, el amor verdadero, el honor y la familia. Piensa en Vicente Fernández, José Alfredo Jiménez, Pedro Infante, o Pepe Aguilar. Las letras deben tener ese sentimiento de mariachi, con trompetas en el corazón, amor intenso y a veces dolor profundo. El tono debe ser de hombre/mujer de campo con valores tradicionales.",
        fr: "Écris dans un style RANCHERA/Mariachi avec une narration passionnée, une émotion profonde et des images culturelles mexicaines.",
        it: "Scrivi in stile RANCHERA/Mariachi con narrazione appassionata, emozione profonda e immagini culturali messicane. Amore intenso e valori tradizionali.",
    },
    balada: {
        en: "Write a Romantic Ballad with deep emotion, poetic language, and timeless love themes.",
        pt: "Escreva uma BALADA ROMÂNTICA com emoção profunda, linguagem poética e temas de amor atemporais.",
        es: "Escribe una BALADA ROMÁNTICA con emoción profunda, lenguaje poético y temas de amor atemporales. Piensa en artistas como Luis Miguel, José José, Alejandro Fernández, o Laura Pausini en español. Las letras deben ser elegantes, emotivas y hablar del amor verdadero, la devoción y los sentimientos más profundos. El tono debe ser de declaración de amor sincera y apasionada.",
        fr: "Écris une BALLADE ROMANTIQUE avec une émotion profonde, un langage poétique et des thèmes d'amour intemporels.",
        it: "Scrivi una BALLATA ROMANTICA italiana con emozione profonda, linguaggio poetico e temi d'amore senza tempo. Pensa ad artisti come Laura Pausini, Eros Ramazzotti, Andrea Bocelli, o Tiziano Ferro. Le parole devono essere eleganti, emotive e parlare dell'amore vero, della devozione e dei sentimenti più profondi. Il tono deve essere di una dichiarazione d'amore sincera e appassionata.",
    },
    tango: {
        en: "Write in an authentic Argentine TANGO CANCIÓN style, like a dramatic confession or monologue set to music. The tone must be theatrical, bittersweet, and deeply emotional — think Carlos Gardel, Enrique Santos Discépolo, Homero Manzi. Use the honoree's real life story as the core narrative, but frame it through tango's poetic lens: cobblestone streets, dim streetlights, smoky cafés, the cry of the bandoneón (NEVER accordion/sanfona, NEVER say bellows/fole — the bandoneón sighs, cries, weeps, or laments). Weave in urban imagery — corners, nights, rain, shadows — as metaphors for life's struggles and triumphs. The lyrics should feel like a porteño telling someone's life story at a milonga. Use strong emotional contrast: tenderness vs. grit, nostalgia vs. celebration. Keep language poetic and vivid, with short punchy lines alternating with longer flowing ones. The chorus should be anthemic and emotionally powerful.",
        pt: "Escreva em estilo autêntico de TANGO CANCIÓN argentino, como uma confissão dramática ou monólogo musicado. O tom deve ser teatral, agridoce e profundamente emocional — pense em Carlos Gardel, Discépolo, Homero Manzi. Use a história real do homenageado como narrativa central, mas enquadre tudo pela lente poética do tango: ruas de paralelepípedo, postes de luz, cafés enfumaçados, o choro do bandoneón (NUNCA sanfona/acordeão, NUNCA dizer fole — o bandoneón suspira, chora, geme ou lamenta). Teça imagens urbanas — esquinas, noites, chuva, sombras — como metáforas das lutas e conquistas da vida. A letra deve soar como um portenho contando a saga de alguém numa milonga. Use contrastes emocionais fortes: ternura vs. dureza, nostalgia vs. celebração. Linguagem poética e vívida, com versos curtos e impactantes alternando com frases mais longas e fluidas. O refrão deve ser grandioso e emocionalmente poderoso.",
        es: "Escribe en estilo auténtico de TANGO CANCIÓN argentino, como una confesión dramática o monólogo musicalizado. El tono debe ser teatral, agridulce y profundamente emocional — piensa en Carlos Gardel, Discépolo, Homero Manzi. Usa la historia real del homenajeado como narrativa central, pero enmárcala con la lente poética del tango: calles empedradas, faroles, cafés humeantes, el llanto del bandoneón (NUNCA acordeón, NUNCA decir fuelle — el bandoneón suspira, llora, gime o lamenta). Teje imágenes urbanas — esquinas, noches, lluvia, sombras — como metáforas de las luchas y triunfos de la vida. La letra debe sonar como un porteño contando la saga de alguien en una milonga. Usa contrastes emocionales fuertes: ternura vs. dureza, nostalgia vs. celebración. Lenguaje poético y vívido, con versos cortos e impactantes alternando con frases más largas y fluidas. El estribillo debe ser grandioso y emocionalmente poderoso.",
        fr: "Écris dans un style authentique de TANGO CANCIÓN argentin, comme une confession dramatique ou un monologue mis en musique. Le ton doit être théâtral, doux-amer et profondément émouvant — pense à Carlos Gardel, Discépolo, Homero Manzi. Utilise l'histoire réelle de la personne honorée comme récit central, mais encadre-la à travers le prisme poétique du tango : rues pavées, réverbères, cafés enfumés, le cri du bandonéon (JAMAIS accordéon, JAMAIS dire soufflet — le bandonéon soupire, pleure, gémit ou se lamente). Tisse des images urbaines — coins de rue, nuits, pluie, ombres — comme métaphores des luttes et triomphes de la vie. Les paroles doivent sonner comme un porteño racontant la saga de quelqu'un dans une milonga. Utilise des contrastes émotionnels forts : tendresse vs. rudesse, nostalgie vs. célébration. Langage poétique et vivant. Le refrain doit être grandiose et émotionnellement puissant.",
        it: "Scrivi in stile autentico di TANGO CANCIÓN argentino, come una confessione drammatica o monologo musicato. Il tono deve essere teatrale, agrodolce e profondamente emotivo — pensa a Carlos Gardel, Discépolo, Homero Manzi. Usa la storia reale della persona omaggiata come narrativa centrale, ma inquadrala attraverso la lente poetica del tango: strade acciottolate, lampioni, caffè fumosi, il pianto del bandoneón (MAI fisarmonica, MAI dire mantice — il bandoneón sospira, piange, geme o si lamenta). Intreccia immagini urbane — angoli, notti, pioggia, ombre — come metafore delle lotte e dei trionfi della vita. Il testo deve suonare come un porteño che racconta la saga di qualcuno in una milonga. Usa forti contrasti emotivi: tenerezza vs. durezza, nostalgia vs. celebrazione. Linguaggio poetico e vivido. Il ritornello deve essere grandioso ed emotivamente potente.",
    },
    valsa: {
        en: "Write a WALTZ lyric with a clear 3/4 rhythm and a flowing, circular-dance feel. Use poetic, elegant, and emotional language. Prefer soft, short words — avoid harsh or overly long words. Use natural rhymes (alternating ABAB or paired AABB). The tone should be romantic, nostalgic, or tribute-like. Build a continuous narrative that turns gently, as if the story itself is waltzing. Write lines meant to be sung slowly, with gradual dynamic growth from verse to chorus.",
        pt: "Escreva uma letra de VALSA com ritmo claro de 3/4 e sensação de dança circular fluida. Use linguagem poética, elegante e emocional. Prefira palavras suaves e curtas — evite palavras duras ou muito longas. Use rimas naturais (alternadas ABAB ou emparelhadas AABB). O tom deve ser romântico, nostálgico ou de homenagem. Construa uma narrativa contínua que gire suavemente, como se a própria história estivesse valsando. Escreva versos pensados para serem cantados lentamente, com crescimento gradual do verso ao refrão.",
        es: "Escribe una letra de VALS con ritmo claro de 3/4 y sensación de danza circular fluida. Usa lenguaje poético, elegante y emocional. Prefiere palabras suaves y cortas — evita palabras duras o demasiado largas. Usa rimas naturales (alternadas ABAB o pareadas AABB). El tono debe ser romántico, nostálgico o de homenaje. Construye una narrativa continua que gire suavemente, como si la historia misma estuviera valsando. Escribe versos pensados para ser cantados lentamente, con crecimiento gradual del verso al estribillo.",
        fr: "Écris une parole de VALSE avec un rythme clair à 3/4 et une sensation de danse circulaire fluide. Utilise un langage poétique, élégant et émouvant. Préfère des mots doux et courts — évite les mots durs ou trop longs. Utilise des rimes naturelles (alternées ABAB ou suivies AABB). Le ton doit être romantique, nostalgique ou d'hommage. Construis une narration continue qui tourne doucement, comme si l'histoire elle-même valsait. Écris des vers pensés pour être chantés lentement, avec une montée progressive du couplet au refrain.",
        it: "Scrivi un testo di VALZER con ritmo chiaro in 3/4 e sensazione di danza circolare fluida. Usa un linguaggio poetico, elegante ed emozionale. Preferisci parole morbide e brevi — evita parole dure o troppo lunghe. Usa rime naturali (alternate ABAB o baciate AABB). Il tono deve essere romantico, nostalgico o di omaggio. Costruisci una narrazione continua che giri dolcemente, come se la storia stessa stesse danzando il valzer. Scrivi versi pensati per essere cantati lentamente, con crescita graduale dalla strofa al ritornello.",
    },
    // French-specific genres
    chanson: {
        en: "Write in a French Chanson style with poetic storytelling, emotional depth, and literary quality.",
        pt: "Escreva em estilo CHANSON FRANÇAISE com narrativa poética, profundidade emocional e qualidade literária.",
        es: "Escribe en estilo CHANSON FRANÇAISE con narrativa poética, profundidad emocional y calidad literaria.",
        fr: "Écris dans le style de la CHANSON FRANÇAISE avec une narration poétique, une profondeur émotionnelle et une qualité littéraire. Pense à des artistes comme Édith Piaf, Jacques Brel, Charles Aznavour, Barbara, ou plus récemment Zaz ou Clara Luciani. Les paroles doivent avoir cette élégance française, cette mélancolie poétique et cette capacité à raconter des histoires d'amour et de vie avec sophistication. Le ton doit être intime, expressif et profondément humain.",
        it: "Scrivi in stile CHANSON FRANÇAISE con narrazione poetica, profondità emotiva e qualità letteraria. Eleganza, malinconia poetica e sofisticazione.",
    },
    variete: {
        en: "Write in a French Variété style with accessible melodies, positive themes, and broad appeal.",
        pt: "Escreva em estilo VARIÉTÉ FRANÇAISE com melodias acessíveis, temas positivos e apelo amplo.",
        es: "Escribe en estilo VARIÉTÉ FRANÇAISE con melodías accesibles, temas positivos y atractivo amplio.",
        fr: "Écris dans le style de la VARIÉTÉ FRANÇAISE avec des mélodies accessibles, des thèmes positifs et un attrait large. Pense à des artistes comme Jean-Jacques Goldman, Michel Sardou, Céline Dion (en français), ou Vianney. Les paroles doivent être faciles à chanter, émotionnelles mais pas trop complexes, avec des refrains mémorables. Le ton doit être chaleureux, sincère et festif quand approprié.",
        it: "Scrivi in stile VARIÉTÉ FRANÇAISE con melodie accessibili, temi positivi e ampio appeal. Ritornelli memorabili, tono caldo e sincero.",
    },
    // Italian-specific genres
    tarantella: {
        en: "Write in a Tarantella style with fast-paced rhythm, joyful energy, and Southern Italian festivity.",
        pt: "Escreva em estilo TARANTELLA com ritmo acelerado, energia alegre e festividade do sul da Itália.",
        es: "Escribe en estilo TARANTELLA con ritmo rápido, energía alegre y festividad del sur de Italia.",
        fr: "Écris dans un style TARENTELLE avec un rythme rapide, une énergie joyeuse et une festivité du sud de l'Italie.",
        it: "Scrivi in stile TARANTELLA tradizionale italiana con ritmo veloce 6/8, energia contagiosa e spirito festivo del Sud Italia. Usa immagini di tamburelli, mandolini, fisarmoniche e celebrazioni popolari. Pensa alle feste di paese, ai matrimoni tradizionali e alla gioia di vivere meridionale. Le parole devono essere allegre, danzanti e piene di vita, celebrando l'amore e la famiglia con calore mediterraneo.",
    },
    napoletana: {
        en: "Write in a Neapolitan Song style with deep emotion, Mediterranean romance, and Naples tradition.",
        pt: "Escreva em estilo CANÇÃO NAPOLITANA com emoção profunda, romance mediterrâneo e tradição de Nápoles.",
        es: "Escribe en estilo CANCIÓN NAPOLITANA con emoción profunda, romance mediterráneo y tradición de Nápoles.",
        fr: "Écris dans un style de CHANSON NAPOLITAINE avec une émotion profonde, une romance méditerranéenne et la tradition de Naples.",
        it: "Scrivi in stile CANZONE NAPOLETANA classica con emozione profonda, romanticismo mediterraneo e la tradizione di Napoli. Pensa a canzoni come 'O Sole Mio, Torna a Surriento, o i classici di Roberto Murolo e Sergio Bruni. Le parole devono avere quella malinconia dolce napoletana, parlando d'amore, del mare, del sole e della bellezza della vita. Usa espressioni poetiche e sentimentali tipiche della tradizione partenopea.",
    },
    lirico: {
        en: "Write in an Operatic/Lyrical style with dramatic emotion, grand expression, and classical elegance.",
        pt: "Escreva em estilo LÍRICO / ÓPERA com emoção dramática, expressão grandiosa e elegância clássica.",
        es: "Escribe en estilo LÍRICO / ÓPERA con emoción dramática, expresión grandiosa y elegancia clásica.",
        fr: "Écris dans un style LYRIQUE / OPÉRA avec une émotion dramatique, une expression grandiose et une élégance classique.",
        it: "Scrivi in stile LIRICO / OPERA italiano con emozione drammatica, espressione grandiosa ed eleganza classica. Pensa alla tradizione operistica italiana di Verdi, Puccini, e alle arie che hanno fatto la storia. Le parole devono essere elevate, poetiche e piene di passione. Usa un linguaggio ricco, metafore profonde e sentimenti intensi. Il tono deve essere maestoso ma sincero, celebrando l'amore e la vita con la grandezza della tradizione lirica italiana.",
    },
};

// Relationship context for the prompt
export const RELATIONSHIP_CONTEXT: Record<string, { en: string; pt: string; es: string; fr: string; it: string }> = {
    husband: {
        en: "This song is a gift from a wife to her husband. Express deep romantic love, partnership, and life together.",
        pt: "Esta canção é um presente de uma esposa para seu marido. Expresse amor romântico profundo, parceria e vida juntos.",
        es: "Esta canción es un regalo de una esposa para su esposo. Expresa amor romántico profundo, compañerismo y vida juntos.",
        fr: "Cette chanson est un cadeau d'une femme à son mari. Exprime un amour romantique profond, le partenariat et la vie ensemble.",
        it: "Questa canzone è un regalo di una moglie a suo marito. Esprimi amore romantico profondo, partnership e vita insieme.",
    },
    wife: {
        en: "This song is a gift from a husband to his wife. Express deep romantic love, devotion, and cherished moments together.",
        pt: "Esta canção é um presente de um marido para sua esposa. Expresse amor romântico profundo, devoção e momentos preciosos juntos.",
        es: "Esta canción es un regalo de un esposo para su esposa. Expresa amor romántico profundo, devoción y momentos preciosos juntos.",
        fr: "Cette chanson est un cadeau d'un mari à sa femme. Exprime un amour romantique profond, la dévotion et les moments précieux ensemble.",
        it: "Questa canzone è un regalo di un marito a sua moglie. Esprimi amore romantico profondo, devozione e momenti preziosi insieme.",
    },
    boyfriend: {
        en: "This song is a gift from a girlfriend to her boyfriend. Express romantic love, affection, and the special bond between partners.",
        pt: "Esta canção é um presente de uma namorada para seu namorado. Expresse amor romântico, carinho e o vínculo especial entre o casal.",
        es: "Esta canción es un regalo de una novia para su novio. Expresa amor romántico, cariño y el vínculo especial entre la pareja.",
        fr: "Cette chanson est un cadeau d'une petite amie à son petit ami. Exprime l'amour romantique, l'affection et le lien spécial entre partenaires.",
        it: "Questa canzone è un regalo di una fidanzata al suo fidanzato. Esprimi amore romantico, affetto e il legame speciale tra partner.",
    },
    girlfriend: {
        en: "This song is a gift from a boyfriend to his girlfriend. Express romantic love, affection, and the special bond between partners.",
        pt: "Esta canção é um presente de um namorado para sua namorada. Expresse amor romântico, carinho e o vínculo especial entre o casal.",
        es: "Esta canción es un regalo de un novio para su novia. Expresa amor romántico, cariño y el vínculo especial entre la pareja.",
        fr: "Cette chanson est un cadeau d'un petit ami à sa petite amie. Exprime l'amour romantique, l'affection et le lien spécial entre partenaires.",
        it: "Questa canzone è un regalo di un fidanzato alla sua fidanzata. Esprimi amore romantico, affetto e il legame speciale tra partner.",
    },
    children: {
        en: "This song is a gift from a parent to their children. Express unconditional love, pride, and the joy of watching them grow.",
        pt: "Esta canção é um presente de um pai/mãe para seus filhos. Expresse amor incondicional, orgulho e a alegria de vê-los crescer.",
        es: "Esta canción es un regalo de un padre/madre para sus hijos. Expresa amor incondicional, orgullo y la alegría de verlos crecer.",
        fr: "Cette chanson est un cadeau d'un parent à ses enfants. Exprime un amour inconditionnel, la fierté et la joie de les voir grandir.",
        it: "Questa canzone è un regalo di un genitore ai propri figli. Esprimi amore incondizionato, orgoglio e la gioia di vederli crescere.",
    },
    father: {
        en: "This song is a gift for a father. Express gratitude, admiration, and the impact he has had on your life.",
        pt: "Esta canção é um presente para um pai. Expresse gratidão, admiração e o impacto que ele teve em sua vida.",
        es: "Esta canción es un regalo para un padre. Expresa gratitud, admiración y el impacto que ha tenido en tu vida.",
        fr: "Cette chanson est un cadeau pour un père. Exprime la gratitude, l'admiration et l'impact qu'il a eu sur ta vie.",
        it: "Questa canzone è un regalo per un padre. Esprimi gratitudine, ammirazione e l'impatto che ha avuto sulla tua vita.",
    },
    mother: {
        en: "This song is a gift for a mother. Express deep gratitude, love, and appreciation for her care and sacrifice.",
        pt: "Esta canção é um presente para uma mãe. Expresse gratidão profunda, amor e apreciação por seu cuidado e sacrifício.",
        es: "Esta canción es un regalo para una madre. Expresa gratitud profunda, amor y apreciación por su cuidado y sacrificio.",
        fr: "Cette chanson est un cadeau pour une mère. Exprime une gratitude profonde, l'amour et l'appréciation pour ses soins et son sacrifice.",
        it: "Questa canzone è un regalo per una madre. Esprimi gratitudine profonda, amore e apprezzamento per le sue cure e il suo sacrificio.",
    },
    sibling: {
        en: "This song is a gift for a sibling. Express the bond of shared childhood, inside jokes, and lifelong friendship.",
        pt: "Esta canção é um presente para um irmão/irmã. Expresse o vínculo de infância compartilhada, piadas internas e amizade vitalícia.",
        es: "Esta canción es un regalo para un hermano/hermana. Expresa el vínculo de la infancia compartida, bromas internas y amistad de por vida.",
        fr: "Cette chanson est un cadeau pour un frère/une sœur. Exprime le lien de l'enfance partagée, les blagues internes et l'amitié de toute une vie.",
        it: "Questa canzone è un regalo per un fratello/sorella. Esprimi il legame dell'infanzia condivisa, le battute interne e l'amicizia di una vita.",
    },
    friend: {
        en: "This song is a gift for a dear friend. Express appreciation, shared adventures, and the value of true friendship.",
        pt: "Esta canção é um presente para um amigo querido. Expresse apreciação, aventuras compartilhadas e o valor da verdadeira amizade.",
        es: "Esta canción es un regalo para un amigo querido. Expresa apreciación, aventuras compartidas y el valor de la verdadera amistad.",
        fr: "Cette chanson est un cadeau pour un ami cher. Exprime l'appréciation, les aventures partagées et la valeur de la vraie amitié.",
        it: "Questa canzone è un regalo per un caro amico. Esprimi apprezzamento, avventure condivise e il valore della vera amicizia.",
    },
    myself: {
        en: "This song is a personal anthem for self-celebration. Express self-love, personal journey, and inner strength.",
        pt: "Esta canção é um hino pessoal de autocelebração. Expresse amor próprio, jornada pessoal e força interior.",
        es: "Esta canción es un himno personal de autocelebración. Expresa amor propio, viaje personal y fuerza interior.",
        fr: "Cette chanson est un hymne personnel d'auto-célébration. Exprime l'amour de soi, le parcours personnel et la force intérieure.",
        it: "Questa canzone è un inno personale di autocelebrazione. Esprimi amore per te stesso, il tuo percorso personale e la forza interiore.",
    },
    other: {
        en: "This song is a gift for someone special. Express appreciation, love, and the unique bond you share.",
        pt: "Esta canção é um presente para alguém especial. Expresse apreciação, amor e o vínculo único que vocês compartilham.",
        es: "Esta canción es un regalo para alguien especial. Expresa apreciación, amor y el vínculo único que comparten.",
        fr: "Cette chanson est un cadeau pour quelqu'un de spécial. Exprime l'appréciation, l'amour et le lien unique que vous partagez.",
        it: "Questa canzone è un regalo per qualcuno di speciale. Esprimi apprezzamento, amore e il legame unico che condividete.",
    },
    group: {
        en: "This song is a gift for a group of people. Express the collective bond, shared experiences, and appreciation for the group.",
        pt: "Esta canção é um presente para um grupo de pessoas. Expresse o vínculo coletivo, experiências compartilhadas e apreciação pelo grupo.",
        es: "Esta canción es un regalo para un grupo de personas. Expresa el vínculo colectivo, experiencias compartidas y apreciación por el grupo.",
        fr: "Cette chanson est un cadeau pour un groupe de personnes. Exprime le lien collectif, les expériences partagées et l'appréciation du groupe.",
        it: "Questa canzone è un regalo per un gruppo di persone. Esprimi il legame collettivo, le esperienze condivise e l'apprezzamento per il gruppo.",
    },
};


// Genre modulation parameters extracted from viral hit methodology
// Controls how each genre should balance different lyrical dimensions
export interface GenreModulation {
    repetition: string;
    density: string;
    concreteness: string;
    metaphor: string;
    speechTone: string;
    suggestedStructure: string;
    rhymeScheme: string;
}

export const GENRE_MODULATION: Record<string, GenreModulation> = {
    // ── Universal ──
    pop:                       { repetition: "high", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "AABB or ABAB — couplets (1+2, 3+4) or alternating (1+3, 2+4)" },
    rock:                      { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); gives anthemic drive" },
    "rock-classico":           { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4)" },
    "pop-rock-brasileiro":     { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB or AABB — alternating or couplets" },
    "heavy-metal":             { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme; powerful and driving" },
    rnb:                       { repetition: "medium", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); smooth and flowing" },
    worship:                   { repetition: "medium", density: "low-medium", concreteness: "medium", metaphor: "medium-high", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "ABAB or ABCB — alternating (1+3, 2+4) or ballad-style (only 2+4)" },
    gospel:                    { repetition: "medium", density: "low-medium", concreteness: "medium", metaphor: "medium-high", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "ABAB or ABCB — alternating or ballad-style" },
    hiphop:                    { repetition: "medium", density: "high", concreteness: "high", metaphor: "medium", speechTone: "very-high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB with internal rhymes — couplets with rhymes inside lines for extra flow" },
    jazz:                      { repetition: "low", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "AABA", rhymeScheme: "AABA — lines 1+2+4 rhyme, line 3 free (jazz standard form)" },
    blues:                     { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AAB — lines 1+2 rhyme or repeat, line 3 resolves (12-bar blues tradition)" },
    "blues-melancholic":       { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AAB — lines 1+2 rhyme/repeat, line 3 resolves" },
    "blues-upbeat":            { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AAB — lines 1+2 rhyme/repeat, line 3 resolves" },
    reggae:                    { repetition: "high", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; relaxed, conversational feel" },
    country:                   { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low-medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; storytelling, narrative feel" },
    lullaby:                   { repetition: "high", density: "low", concreteness: "medium", metaphor: "medium", speechTone: "low", suggestedStructure: "V-C-V-C", rhymeScheme: "AABB — couplets (1+2, 3+4); simple, soothing, easy to memorize" },
    "lullaby-ninar":           { repetition: "high", density: "low", concreteness: "medium", metaphor: "medium", speechTone: "low", suggestedStructure: "V-C-V-C", rhymeScheme: "AABB — simple couplets; gentle and repetitive" },
    "lullaby-animada":         { repetition: "high", density: "low", concreteness: "medium", metaphor: "low", speechTone: "medium", suggestedStructure: "V-C-V-C", rhymeScheme: "AABB — simple couplets; catchy and playful" },
    eletronica:                { repetition: "very-high", density: "low", concreteness: "low", metaphor: "low", speechTone: "low", suggestedStructure: "Hook-V-Hook-V-Hook", rhymeScheme: "AABB — couplets; minimal lyrics, maximum hook" },
    "eletronica-afro-house":   { repetition: "very-high", density: "low", concreteness: "low", metaphor: "low", speechTone: "low", suggestedStructure: "Hook-V-Hook-V-Hook", rhymeScheme: "AABB — short mantra-like couplets" },
    "eletronica-progressive-house": { repetition: "very-high", density: "low", concreteness: "low", metaphor: "low", speechTone: "low", suggestedStructure: "Hook-V-Hook-V-Hook", rhymeScheme: "AABB — couplets; melodic and uplifting" },
    "eletronica-melodic-techno": { repetition: "very-high", density: "low", concreteness: "low", metaphor: "low", speechTone: "low", suggestedStructure: "Hook-V-Hook-V-Hook", rhymeScheme: "AABB — couplets; sparse and cinematic" },
    "musica-classica":         { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "low", suggestedStructure: "V-V-C-V-Bridge-C", rhymeScheme: "ABAB — alternating rhyme; formal, elevated poetic tradition" },
    // ── Brazilian: Sertanejo ──
    sertanejo:                 { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low-medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; narrative, storytelling feel" },
    "sertanejo-raiz":          { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low-medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; traditional storytelling" },
    "sertanejo-universitario": { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); direct, pop-friendly, easy to sing along" },
    "sertanejo-romantico":     { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; emotional, melodic narrative" },
    // ── Brazilian: Funk ──
    funk:                      { repetition: "very-high", density: "low", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AABB — couplets (1+2, 3+4); direct and punchy" },
    "funk-carioca":            { repetition: "very-high", density: "low", concreteness: "high", metaphor: "low", speechTone: "very-high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AAAA — all lines rhyme (monorhyme); raw, flow-driven" },
    "funk-paulista":           { repetition: "very-high", density: "low", concreteness: "high", metaphor: "low", speechTone: "very-high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AAAA — all lines rhyme (monorhyme); heavy bass, attitude" },
    "funk-melody":             { repetition: "very-high", density: "low", concreteness: "medium", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); melodic and romantic" },
    // ── Brazilian: Samba / Pagode ──
    samba:                     { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); swinging and rhythmic" },
    pagode:                    { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; conversational, roda feel" },
    "pagode-de-mesa":          { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; roots, conversational" },
    "pagode-romantico":        { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low-medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); romantic, radio-friendly" },
    "pagode-universitario":    { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); modern, pop hooks" },
    // ── Brazilian: Forró ──
    forro:                     { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; storytelling, danceable" },
    "forro-pe-de-serra-rapido": { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; traditional, festive" },
    "forro-pe-de-serra-lento": { repetition: "medium", density: "low-medium", concreteness: "high", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); contemplative, poetic" },
    "forro-universitario":     { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); modern, catchy" },
    "forro-eletronico":        { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); commercial, festival energy" },
    // ── Brazilian: MPB / Bossa ──
    mpb:                       { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-V-C-V-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); sophisticated, poetic" },
    "mpb-bossa-nova":          { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme; elegant, intimate" },
    "mpb-cancao-brasileira":   { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-V-C-V-Bridge-C", rhymeScheme: "ABAB — alternating rhyme; classic, timeless" },
    "mpb-pop":                 { repetition: "medium", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "AABB or ABAB — couplets or alternating; accessible, radio-friendly" },
    "mpb-intimista":           { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme; conversational, subtle" },
    bossa:                     { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); soft, poetic" },
    "jovem-guarda":            { repetition: "high", density: "low", concreteness: "medium", metaphor: "low", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); vintage pop, catchy" },
    // ── Brazilian: Others ──
    axe:                       { repetition: "very-high", density: "low", concreteness: "medium", metaphor: "low", speechTone: "high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AABB — couplets (1+2, 3+4); carnival, call-and-response" },
    capoeira:                  { repetition: "very-high", density: "low", concreteness: "medium", metaphor: "low", speechTone: "high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AABB — couplets; chant-like, call-and-response" },
    brega:                     { repetition: "high", density: "low", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); direct, sentimental" },
    "brega-romantico":         { repetition: "high", density: "low", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets; passionate, romantic" },
    tecnobrega:                { repetition: "very-high", density: "low", concreteness: "medium", metaphor: "low", speechTone: "high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AABB — couplets; electronic, party-driven" },
    // ── Spanish / Latin ──
    salsa:                     { repetition: "high", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); passionate, danceable" },
    bachata:                   { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; romantic, melancholic narrative" },
    merengue:                  { repetition: "very-high", density: "low", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AABB — couplets (1+2, 3+4); festive, high energy" },
    cumbia:                    { repetition: "high", density: "low", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); catchy, festive" },
    ranchera:                  { repetition: "high", density: "low-medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABCB — only lines 2+4 rhyme; storytelling, deep emotion" },
    balada:                    { repetition: "medium", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); elegant, timeless" },
    tango:                     { repetition: "medium", density: "medium", concreteness: "high", metaphor: "high", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); theatrical, dramatic" },
    valsa:                     { repetition: "medium", density: "medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB or AABB — alternating or couplets; elegant, flowing with 3/4 feel" },
    bolero:                    { repetition: "medium", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); romantic, nostalgic" },
    latina:                    { repetition: "high", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "AABB — couplets (1+2, 3+4); warm, rhythmic" },
    adoracion:                 { repetition: "medium", density: "low-medium", concreteness: "medium", metaphor: "medium-high", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "ABAB or ABCB — alternating or ballad-style" },
    // ── French ──
    chanson:                   { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "medium", suggestedStructure: "V-V-C-V-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); literary, poetic tradition" },
    variete:                   { repetition: "high", density: "low-medium", concreteness: "medium", metaphor: "medium", speechTone: "medium", suggestedStructure: "V-Pre-C-V-Pre-C-Bridge-C", rhymeScheme: "AABB or ABAB — couplets or alternating; accessible, singable" },
    // ── Italian ──
    tarantella:                { repetition: "very-high", density: "low", concreteness: "high", metaphor: "low", speechTone: "high", suggestedStructure: "C-V-C-V-C", rhymeScheme: "AABB — couplets (1+2, 3+4); festive, rapid, dancefloor energy" },
    napoletana:                { repetition: "medium", density: "medium", concreteness: "high", metaphor: "medium", speechTone: "high", suggestedStructure: "V-C-V-C-Bridge-C", rhymeScheme: "ABAB — alternating rhyme (1+3, 2+4); romantic, Mediterranean" },
    lirico:                    { repetition: "low", density: "medium", concreteness: "medium", metaphor: "high", speechTone: "low", suggestedStructure: "V-V-C-V-Bridge-C", rhymeScheme: "ABAB — alternating rhyme; grand, operatic tradition" },
};

export function getGenreModulation(genre: string): GenreModulation {
    if (GENRE_MODULATION[genre]) return GENRE_MODULATION[genre];
    const baseGenre = genre.split("-")[0]!;
    if (GENRE_MODULATION[baseGenre]) return GENRE_MODULATION[baseGenre];
    return GENRE_MODULATION.pop!;
}

export type SupportedLocale = "en" | "pt" | "es" | "fr" | "it";

export function getLocale(locale: string): SupportedLocale {
    if (locale === "pt" || locale === "es" || locale === "fr" || locale === "it") return locale;
    return "en";
}

export function buildPrompt(input: LyricsInput): string {
    const lang = getLocale(input.locale);
    const genreInstructions = GENRE_INSTRUCTIONS[input.genre]?.[lang] || GENRE_INSTRUCTIONS.pop![lang];
    const relationshipContext = RELATIONSHIP_CONTEXT[input.recipient]?.[lang] || RELATIONSHIP_CONTEXT.other![lang];
    const genreName = GENRE_NAMES[input.genre]?.[lang] || input.genre;
    const relationshipName = RELATIONSHIP_NAMES[input.recipient]?.[lang] || input.recipient;
    const modulation = getGenreModulation(input.genre);

    const langNames: Record<SupportedLocale, string> = {
        en: "English",
        pt: "Brazilian Portuguese",
        es: "Spanish (Latin American)",
        fr: "French",
        it: "Italian",
    };
    const langName = langNames[lang];

    const vocalsDescriptions: Record<SupportedLocale, { female: string; male: string; any: string }> = {
        en: { female: "female voice", male: "male voice", any: "any voice" },
        pt: { female: "voz feminina", male: "voz masculina", any: "qualquer voz" },
        es: { female: "voz femenina", male: "voz masculina", any: "cualquier voz" },
        fr: { female: "voix féminine", male: "voix masculine", any: "n'importe quelle voix" },
        it: { female: "voce femminile", male: "voce maschile", any: "qualsiasi voce" },
    };
    const vocalsDescription =
        input.vocals === "female"
            ? vocalsDescriptions[lang].female
            : input.vocals === "male"
                ? vocalsDescriptions[lang].male
                : vocalsDescriptions[lang].any;

    // Locale-specific abbreviation constraints
    const abbreviationConstraints: Record<SupportedLocale, string> = {
        pt: `NEVER use any abbreviations. All words must be written IN FULL. Examples: "Senhor" (never "Sr."), "Senhora" (never "Sra."), "Dona" (never "D."), "Doutor" (never "Dr."), "São" (never "S."), "Santo" (never "Sto."), "Santa" (never "Sta."), "Professor" (never "Prof."), "Padre" (never "Pe."), "Frei" (never "Fr."). This applies to ALL abbreviations — the AI recording system cannot interpret them.`,
        es: `NEVER use any abbreviations. All words must be written IN FULL. Examples: "Señor" (never "Sr."), "Señora" (never "Sra."), "Doctor" (never "Dr."), "San" (never "S."), "Santo" (never "Sto."), "Santa" (never "Sta."), "Profesor" (never "Prof."). This applies to ALL abbreviations — the AI recording system cannot interpret them.`,
        fr: `NEVER use any abbreviations. All words must be written IN FULL. Examples: "Monsieur" (never "M."), "Madame" (never "Mme"), "Docteur" (never "Dr."), "Saint" (never "St."), "Sainte" (never "Ste."), "Professeur" (never "Prof."). This applies to ALL abbreviations — the AI recording system cannot interpret them.`,
        it: `NEVER use any abbreviations. All words must be written IN FULL. Examples: "Signore" (never "Sig."), "Signora" (never "Sig.ra"), "Dottore" (never "Dr."), "San" (never "S."), "Santo" (never "Sto."), "Santa" (never "Sta."), "Professore" (never "Prof."). This applies to ALL abbreviations — the AI recording system cannot interpret them.`,
        en: `NEVER use any abbreviations. All words must be written IN FULL. Examples: "Mister" (never "Mr."), "Missus" (never "Mrs."), "Doctor" (never "Dr."), "Saint" (never "St."), "Professor" (never "Prof."), "Junior" (never "Jr."). This applies to ALL abbreviations — the AI recording system cannot interpret them.`,
    };

    // Locale-specific date writing instructions
    const dateConstraints: Record<SupportedLocale, string> = {
        pt: `When there are numeric dates or years (like 1994, 2010, 15 de março), ALWAYS write them out in full in Portuguese (e.g., "mil novecentos e noventa e quatro" instead of "1994", "quinze de março" instead of "15 de março").`,
        es: `When there are numeric dates or years (like 1994, 2010, 15 de marzo), ALWAYS write them out in full in Spanish (e.g., "mil novecientos noventa y cuatro" instead of "1994", "quince de marzo" instead of "15 de marzo").`,
        fr: `When there are numeric dates or years (like 1994, 2010, 15 mars), ALWAYS write them out in full in French (e.g., "mille neuf cent quatre-vingt-quatorze" instead of "1994", "quinze mars" instead of "15 mars").`,
        it: `When there are numeric dates or years (like 1994, 2010, 15 marzo), ALWAYS write them out in full in Italian (e.g., "millenovecentonovantaquattro" instead of "1994", "quindici marzo" instead of "15 marzo").`,
        en: `When there are numeric dates or years (like 1994, 2010, March 15th), ALWAYS write them out in full (e.g., "nineteen ninety-four" instead of "1994", "the fifteenth of March" instead of "March 15th").`,
    };

    return `=== SONG ORDER ===
Recipient: ${input.recipientName}
Relationship: ${relationshipName} — ${relationshipContext}
Genre: ${genreName}
Vocal: ${vocalsDescription}
Language: ${langName}

=== CLIENT MATERIAL ===
QUALITIES: ${input.qualities}

MEMORIES: ${input.memories}
${input.message ? `\nMESSAGE: ${input.message}` : ""}

=== GENRE DIRECTION ===
${genreInstructions}
Genre tuning: repetition=${modulation.repetition}, density=${modulation.density}, concreteness=${modulation.concreteness}, metaphor=${modulation.metaphor}, speech-tone=${modulation.speechTone}

=== CREATIVE REQUIREMENTS ===
1. HOOK-FIRST: Compose the chorus hook first (5-9 memorable words that capture the emotional core)
2. STRUCTURE: ${modulation.suggestedStructure} — adapt to content length, add verses if the story is rich. Bridge MUST come before the Final Chorus, never after.
3. NAME: Include "${input.recipientName}" naturally 2-3 times
4. NARRATIVE ARC: V1=Situation/Scene, V2=Conflict/Desire, Bridge=Transformation/Confession, Final Chorus=Climax/Resolution
5. SENSORY DETAIL: At least 4 sensory images drawn from the provided memories
6. DOOR-DETAIL RATIO: 1 ultra-specific detail per 3 universal images
7. CONFLICT ENGINE: Find the emotional tension in the material and drive the song with it
8. RHYME SCHEME: ${modulation.rhymeScheme}
9. TONE: Emotional, heartfelt, celebratory
10. INSTRUMENTAL TAGS: Include 2–4 mid-song instrumental direction tags to shape dynamics;
    prefer: buildup before a chorus, break after a chorus or before bridge, and a swell/drop/lift into the final chorus (genre-appropriate, as space allows).
11. CHORUS IMAGES: Every chorus line must be filmable — no abstract declarations ("love without end", "generous heart"). Use concrete actions or images instead.

=== HARD CONSTRAINTS ===
- Do not infer skin tone or hair color; only mention if the customer provided them
- ${dateConstraints[lang]}
- ${abbreviationConstraints[lang]}
- Avoid words with controversial religious connotations or references to non-Christian religions

=== OUTPUT FORMAT ===
Return ONLY Suno-formatted lyrics:
- FIRST line must be [start] alone (no lyrics inside)
- SECOND line must be an [Intro: ...] tag with a short instrumental direction using instruments and textures that are characteristic of the genre being generated. Choose instruments that would naturally open a song in that style. This sets the mood before vocals begin.
- LAST line must be [end] alone (no lyrics inside)
- Section tags in English: [Verse 1], [Pre-Chorus], [Chorus], [Bridge], [Final Chorus], [Outro]
- Musical direction tags use the pattern [Type: short phrase] in English.
  Allowed in Intro/Outro AND as transitions mid-song (2–4 total max, max 1 per section):
  [Instrumental buildup: ...] before choruses, [Instrumental break: ...] after choruses,
  [Bridge breakdown: ...] at bridge start, [Final swell: ...] or [Drop: ...] before final chorus.
- Musical-direction tags must contain ONLY instrumental directions, NO sung words.
  Keep each tag under ~10 words.
- Backing vocals in parentheses: (oh-oh), (stay with me)
- No explanations, no commentary — just the lyrics.

=== CRITICAL REMINDERS (re-read before generating) ===
- Bridge MUST come BEFORE the Final Chorus — never after. It prepares the climax.
- Pre-Chorus must build TENSION, not list facts. Use urgent language.
- Every chorus line must be filmable — no abstract phrases. Concrete images only.
- Final Chorus: the hook line must appear at least twice for maximum impact.`;
}

function applyPronunciationCorrections(
    text: string,
    corrections?: Array<{ original: string; replacement: string }>
): string {
    if (!corrections || corrections.length === 0) {
        return text;
    }

    const sortedCorrections = [...corrections].sort((a, b) => b.original.length - a.original.length);
    const wordChars = "[\\p{L}\\p{M}\\p{N}_]";
    let correctedText = text.normalize("NFC");

    for (const { original, replacement } of sortedCorrections) {
        const normalizedOriginal = original.normalize("NFC");
        const normalizedReplacement = replacement.normalize("NFC");
        // Escape special regex chars
        const escapedOriginal = normalizedOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Match whole words/phrases using Unicode-aware boundaries
        const regex = new RegExp(`(?<!${wordChars})${escapedOriginal}(?!${wordChars})`, "giu");
        correctedText = correctedText.replace(regex, normalizedReplacement);
    }

    return correctedText;
}

/**
 * Normalize section tags to English for better Suno AI compatibility.
 * Suno parses [Verse], [Chorus], [Bridge] more reliably than localized tags.
 */
/**
 * Expand common abbreviations that Suno AI cannot interpret.
 * Acts as a safety net in case the LLM still produces abbreviations despite prompt instructions.
 */
export function expandAbbreviations(lyrics: string): string {
    // Each entry: [regex matching abbreviation, full word replacement]
    // Only match when followed by a space, newline, or end of string to avoid false positives
    const abbreviations: Array<[RegExp, string]> = [
        // Portuguese
        [/\bSr\.\s/g, "Senhor "],
        [/\bSra\.\s/g, "Senhora "],
        [/\bSrta\.\s/g, "Senhorita "],
        [/\bD\.\s(?=[A-Z])/g, "Dona "],
        [/\bDr\.\s/g, "Doutor "],
        [/\bDra\.\s/g, "Doutora "],
        [/\bSto\.\s/g, "Santo "],
        [/\bSta\.\s/g, "Santa "],
        [/\bProf\.\s/g, "Professor "],
        [/\bProfa\.\s/g, "Professora "],
        [/\bPe\.\s/g, "Padre "],
        [/\bFr\.\s(?=[A-Z])/g, "Frei "],
        [/\bIr\.\s(?=[A-Z])/g, "Irmão "],
        // Spanish
        [/\bSr\.\s/g, "Señor "],
        [/\bSra\.\s/g, "Señora "],
        // French
        [/\bM\.\s(?=[A-Z])/g, "Monsieur "],
        [/\bMme\s(?=[A-Z])/g, "Madame "],
        [/\bMlle\s(?=[A-Z])/g, "Mademoiselle "],
        // Italian
        [/\bSig\.\s/g, "Signore "],
        [/\bSig\.ra\s/g, "Signora "],
        // English
        [/\bMr\.\s/g, "Mister "],
        [/\bMrs\.\s/g, "Missus "],
        [/\bMs\.\s/g, "Miss "],
        [/\bSt\.\s(?=[A-Z])/g, "Saint "],
        [/\bJr\.\s/g, "Junior "],
        // Common across languages
        [/\bNr\.\s/g, "Número "],
        [/\bAv\.\s/g, "Avenida "],
    ];

    let expanded = lyrics;
    for (const [pattern, replacement] of abbreviations) {
        expanded = expanded.replace(pattern, replacement);
    }
    return expanded;
}

export function normalizeTagsToEnglish(lyrics: string): string {
    const tagReplacements: Array<[RegExp, string]> = [
        // Portuguese
        [/\[Verso\s*(\d*)\]/gi, "[Verse $1]"],
        [/\[Refrão\]/gi, "[Chorus]"],
        [/\[Refrão Final\]/gi, "[Final Chorus]"],
        [/\[Ponte\]/gi, "[Bridge]"],
        [/\[Introdução\]/gi, "[Intro]"],
        [/\[Encerramento\]/gi, "[Outro]"],
        [/\[Pré-Refrão\]/gi, "[Pre-Chorus]"],
        // Spanish
        [/\[Estrofa\s*(\d*)\]/gi, "[Verse $1]"],
        [/\[Coro\]/gi, "[Chorus]"],
        [/\[Coro Final\]/gi, "[Final Chorus]"],
        [/\[Puente\]/gi, "[Bridge]"],
        [/\[Introducción\]/gi, "[Intro]"],
        [/\[Cierre\]/gi, "[Outro]"],
        [/\[Pre-Coro\]/gi, "[Pre-Chorus]"],
        [/\[Estribillo\]/gi, "[Chorus]"],
        // French
        [/\[Couplet\s*(\d*)\]/gi, "[Verse $1]"],
        [/\[Refrain\]/gi, "[Chorus]"],
        [/\[Refrain Final\]/gi, "[Final Chorus]"],
        [/\[Pont\]/gi, "[Bridge]"],
        [/\[Introduction\]/gi, "[Intro]"],
        [/\[Conclusion\]/gi, "[Outro]"],
        [/\[Pré-Refrain\]/gi, "[Pre-Chorus]"],
        // Italian
        [/\[Strofa\s*(\d*)\]/gi, "[Verse $1]"],
        [/\[Ritornello\]/gi, "[Chorus]"],
        [/\[Ritornello Finale\]/gi, "[Final Chorus]"],
        [/\[Ponte\]/gi, "[Bridge]"],
        [/\[Introduzione\]/gi, "[Intro]"],
        [/\[Chiusura\]/gi, "[Outro]"],
        [/\[Pre-Ritornello\]/gi, "[Pre-Chorus]"],
    ];

    let normalizedLyrics = lyrics;
    for (const [pattern, replacement] of tagReplacements) {
        normalizedLyrics = normalizedLyrics.replace(pattern, replacement);
    }

    // Clean up any extra spaces in tags like "[Verse  1]" -> "[Verse 1]"
    normalizedLyrics = normalizedLyrics.replace(/\[\s*(\w+)\s+(\d+)\s*\]/g, "[$1 $2]");
    // Clean up tags without numbers "[Verse ]" -> "[Verse]"
    normalizedLyrics = normalizedLyrics.replace(/\[\s*(\w+)\s+\]/g, "[$1]");

    return normalizedLyrics;
}

/**
 * Build system prompt for LLM, including avoidance instructions for EXTRA_SONG
 */
export function buildSystemPrompt(input: LyricsInput): string {
    const langNames: Record<string, string> = {
        en: "English",
        pt: "Brazilian Portuguese",
        es: "Latin American Spanish",
        fr: "French",
        it: "Italian",
    };
    const langName = langNames[getLocale(input.locale)] || "English";

    let systemPrompt = `You are a hit songwriter who creates deeply personal, emotionally powerful custom songs. You write lyrics in ${langName} with native fluency.

=== METHOD: HOOK-FIRST COMPOSITION ===
- Compose the chorus/hook FIRST (5-9 memorable words that capture the emotional core)
- Framework "1-3-1": 1 heart-phrase → 3 vivid scenes → 1 resolution/decision
- Narrative arc: Situation → Desire → Conflict → Transformation

=== LYRICISM CRAFT ===
- SHOW, don't tell ("I pressed my forehead against the glass" NOT "I was sad")
- 1 sensory detail per line (see/hear/smell/touch/taste)
- "Door-detail" technique: specific enough to feel real, open enough for anyone to enter. Ratio 1:3 (1 ultra-specific detail per 3 universal images)
- Conflict as engine: desire vs fear, love vs pride, faith vs doubt
- Metaphors through concrete objects: longing = "a house with echoes"
- "Neutral voice with soul" — write as the universal archetype of the emotion (1st person "I", avoid physical references to the singer, actions > adjectives)
- Authenticity: verifiable details, human contradictions, spoken-language phrases

=== SECTION FUNCTIONS ===
- VERSE: Scene + truth (concrete, intimate). Advances narrative. 8-12 words per line.
- PRE-CHORUS: Tension before catharsis. Must raise a question or create anticipation — NOT list facts or names. Use urgent, forward-leaning language ("And when I think…", "If only…"). Builds energy toward the chorus explosion.
- CHORUS: Catharsis + hook. Line 1 = hook/title, Line 2 = concrete emotional image (NOT abstract declarations like "love without end"), Line 3 = hook repeated/varied, Line 4 = consequence/promise. Short lines (4-9 words). Every chorus line must pass the "can I film this?" test — if you can't visualize it, rewrite it.
- BRIDGE: Perspective shift — changes time, person, or thesis. Confession moment. MUST appear BEFORE the Final Chorus, never after. The Bridge prepares the emotional climax.
- FINAL CHORUS: Reprise of the Chorus with heightened emotion. The hook line MUST appear at least twice. May add a new final line or altered backing vocals for closure.
- OUTRO: Acceptance, farewell, echo of the hook.

=== MATERIAL CURATION ===
- Layer 1 (Core — mandatory): Turning-point moment, human contradiction, real spoken phrase
- Layer 2 (Color — pick 1-2): Symbol-object, unique sensory detail, nickname/pet name
- Layer 3 (Context — does NOT enter lyrics by default): Dates, places, secondary names.
  EXCEPTION: If the customer EXPLICITLY requests that specific names, places, or dates be included, honor that request — the customer's wish overrides this guideline.
- 3-question filter for every line: Does it create an image? Does it carry conflict? Does it work without context?

=== SUNO AI FORMATTING ===
- ALWAYS start with [start] alone on the first line (no lyrics inside this tag)
- ALWAYS follow [start] with an [Intro: ...] tag — a short instrumental direction using instruments and textures characteristic of the genre being generated. Sets the mood before vocals begin.
- ALWAYS end with [end] alone on the last line (no lyrics inside this tag)
- Section tags in English: [Verse 1], [Pre-Chorus], [Chorus], [Bridge], [Final Chorus], [Outro]
- Musical direction tags use the pattern [Type: short phrase] in English.
  Allowed in ANY section as a transition (2–4 total max, max 1 per section).
  Preferred placements:
  1) Right before [Chorus] or [Final Chorus]: [Instrumental buildup: ...] or [Final swell: ...]
  2) Right after [Chorus]: [Instrumental break: ...]
  3) At start of [Bridge]: [Bridge breakdown: ...]
  4) Before final chorus (genre-appropriate): [Final swell: ...] or [Drop: ...] or [Lift: ...]
- Musical-direction tags must contain ONLY instrumental directions, NO sung words.
  Keep each tag under ~10 words.
- Backing vocals in parentheses on their own line: (oh-oh), (stay with me)
- Verse lines: 8-12 words; Chorus lines: 4-9 words
- Contrast is key: verse = restrained → pre-chorus = builds → chorus = explodes

=== SENSITIVE CONTENT ===
- Abstract facts into emotions (profession → action: "hands that learned to heal")
- Never expose private information that could embarrass
- Do not infer skin tone or hair color unless the customer explicitly provided them`;

    // PT-specific: terreiro prohibition
    if (input.locale === "pt") {
        systemPrompt += `\n\n=== MANDATORY RESTRICTIONS (PT) ===
- FORBIDDEN: the word "terreiro" (including variations, singular/plural, upper/lowercase). Use neutral alternatives: "quintal", "pátio", "rua", "praça", "quadra" (in samba/pagode context).
- Also avoid words with controversial religious connotation: "macumba", "despacho", "encruzilhada" (in religious sense), or references to Afro-Brazilian religions.
- Before responding, verify no forbidden words appear. If they do, rewrite before finalizing.`;
    }

    // EXTRA_SONG: avoid repetition with parent lyrics
    if (input.avoidLyrics) {
        systemPrompt += `\n\n=== ADDITIONAL SONG — AVOID REPETITION ===
This is an ADDITIONAL song for the same recipient. You MUST create lyrics that are COMPLETELY DIFFERENT from the following — use different themes, metaphors, phrases, structures, and emotional angles. DO NOT repeat ideas or keywords:

---LYRICS TO AVOID---
${input.avoidLyrics}
---END---`;
    }

    return systemPrompt;
}

function findForbiddenTermsInLyrics(text: string, locale: SupportedLocale): string[] {
    if (locale !== "pt") return [];

    const found: string[] = [];

    // "Terreiro" is common in samba/pagode imagery, but we want to avoid it entirely for PT.
    if (/\bterreir\w*\b/i.test(text)) found.push("terreiro");

    return found;
}

function sanitizeForbiddenTermsInLyrics(text: string, locale: SupportedLocale): string {
    if (locale !== "pt") return text;

    let sanitized = text;

    sanitized = sanitized.replace(/\bterreiro(s)?\b/gi, (_match, plural) => (plural ? "quintais" : "quintal"));
    // Catch uncommon variations like "terreirinho", etc.
    sanitized = sanitized.replace(/\bterreir\w*\b/gi, "quintal");

    return sanitized;
}

function buildRewritePromptToRemoveForbiddenTerms(
    lyrics: string,
    forbiddenTerms: string[],
    locale: SupportedLocale
): string {
    const forbiddenList = forbiddenTerms.length > 0 ? forbiddenTerms.join(", ") : "termos proibidos";

    if (locale === "pt") {
        return `A letra abaixo contém termo(s) proibido(s): ${forbiddenList}.
Reescreva a letra removendo COMPLETAMENTE esses termos, mantendo o sentido, a métrica, as rimas e a estrutura o máximo possível.
Não cite nem liste os termos proibidos no texto final.
Se precisar, substitua por alternativas neutras como "quintal", "pátio", "rua", "praça" ou "quadra" (no contexto de samba/pagode).

FORMATO DE SAÍDA:
Retorne APENAS a letra revisada, mantendo os rótulos de seção (ex.: [Verso 1], [Refrão], [Ponte], etc.). Sem explicações.

---LETRA ORIGINAL---
${lyrics}
---FIM---`;
    }

    return `The lyrics below contain forbidden term(s): ${forbiddenList}.
Rewrite the lyrics removing those terms completely while preserving meaning, meter, rhymes, and structure as much as possible.
Do not mention the forbidden terms in the final output. Return ONLY the revised lyrics.

---ORIGINAL LYRICS---
${lyrics}
---END---`;
}

export async function generateLyrics(input: LyricsInput): Promise<LyricsResult> {
    if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is not configured. Please set it in your environment variables.");
    }

    const lang = getLocale(input.locale);
    const prompt = buildPrompt(input);
    const systemPrompt = buildSystemPrompt(input);

    type OpenRouterChatMessage = { role: "system" | "user" | "assistant"; content: string };

    const requestLyrics = async (messages: OpenRouterChatMessage[], temperature: number): Promise<string> => {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://apollosong.com",
                "X-Title": "ApolloSong Lyrics Generator",
            },
            body: JSON.stringify({
                model: env.OPENROUTER_MODEL,
                messages,
                temperature,
                max_tokens: 2000,
                top_p: 0.95,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as {
            choices?: Array<{
                message?: {
                    content?: string;
                };
            }>;
            error?: {
                message?: string;
            };
        };

        if (data.error) {
            throw new Error(`OpenRouter API error: ${data.error.message}`);
        }

        const lyricsRaw = data.choices?.[0]?.message?.content;

        if (!lyricsRaw) {
            throw new Error("No lyrics generated from OpenRouter API");
        }

        return lyricsRaw.trim();
    };

    const baseMessages: OpenRouterChatMessage[] = [
        {
            role: "system",
            content: systemPrompt,
        },
        {
            role: "user",
            content: prompt,
        },
    ];

    let generatedLyricsRaw: string | null = null;
    let finalLyrics = "";
    let finalDisplayLyrics = "";
    let forbiddenTerms: string[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
        const temperature = attempt === 1 ? 0.8 : 0.2;
        const messages: OpenRouterChatMessage[] =
            attempt === 1
                ? baseMessages
                : [
                      {
                          role: "system",
                          content: systemPrompt,
                      },
                      {
                          role: "user",
                          content: buildRewritePromptToRemoveForbiddenTerms(
                              generatedLyricsRaw ?? "",
                              forbiddenTerms,
                              lang
                          ),
                      },
                  ];

        generatedLyricsRaw = await requestLyrics(messages, temperature);

        const lyricsNoAbbreviations = expandAbbreviations(generatedLyricsRaw);
        const lyricsWithCorrections = applyPronunciationCorrections(
            lyricsNoAbbreviations,
            input.pronunciationCorrections
        );
        const lyrics = normalizeTagsToEnglish(lyricsWithCorrections);
        // displayLyrics = clean version without pronunciation corrections (for PDF/email)
        const displayLyrics = normalizeTagsToEnglish(lyricsNoAbbreviations);

        forbiddenTerms = findForbiddenTermsInLyrics(lyrics, lang);
        if (forbiddenTerms.length === 0) {
            finalLyrics = lyrics;
            finalDisplayLyrics = displayLyrics;
            break;
        }
    }

    if (!finalLyrics || !finalDisplayLyrics) {
        const sanitizedRaw = sanitizeForbiddenTermsInLyrics(generatedLyricsRaw ?? "", lang);
        const lyricsNoAbbreviations = expandAbbreviations(sanitizedRaw);
        const lyricsWithCorrections = applyPronunciationCorrections(lyricsNoAbbreviations, input.pronunciationCorrections);
        finalLyrics = normalizeTagsToEnglish(lyricsWithCorrections);
        finalDisplayLyrics = normalizeTagsToEnglish(lyricsNoAbbreviations);
    }

    // Get music prompt from DB/hardcoded (no LLM call needed)
    // Dynamic import to avoid pulling server-side db into client bundles
    const { getSunoStylePrompt } = await import("~/server/services/suno/genre-mapping");
    const musicPrompt = await getSunoStylePrompt(input.genre, input.locale || "pt", input.vocals);

    return {
        lyrics: finalLyrics,
        displayLyrics: finalDisplayLyrics,
        musicPrompt,
        prompt,
    };
}

/**
 * Adapt existing lyrics from one genre to another.
 */
export async function adaptLyricsForGenre(
    originalLyrics: string,
    originalGenre: string,
    targetGenre: string,
    locale: string
): Promise<string> {
    if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is not configured");
    }

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
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://apollosong.com",
            "X-Title": "ApolloSong Lyrics Adapter",
        },
        body: JSON.stringify({
            model: env.OPENROUTER_MODEL,
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

    return normalizeTagsToEnglish(expandAbbreviations(adaptedLyrics));
}
