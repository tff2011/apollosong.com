import { GENRE_NAMES } from "~/lib/lyrics-generator";
import { type Locale } from "~/i18n/config";

export type GenreAudioEntry = {
    id: string;
    parent?: string;
};

const BASE_GENRES_BY_LOCALE: Record<Locale, readonly string[]> = {
    en: ["pop", "country", "rock", "rnb", "jazz", "blues", "worship", "hiphop"],
    pt: [
        "worship",
        "pop",
        "country",
        "rock",
        "eletronica",
        "jovem-guarda",
        "rnb",
        "jazz",
        "blues",
        "hiphop",
        "funk",
        "brega",
        "samba",
        "pagode",
        "forro",
        "axe",
        "capoeira",
        "mpb",
        "reggae",
        "latina",
        "bolero",
        "lullaby",
        "tango",
        "valsa",
        "musica-classica",
    ],
    es: ["balada", "adoracion", "bachata", "salsa", "ranchera", "cumbia", "tango", "pop", "rnb", "blues", "hiphop", "rock"],
    fr: ["chanson", "balada", "variete", "worship", "pop", "jazz", "blues", "rnb", "hiphop", "rock"],
    it: ["balada", "napoletana", "lirico", "worship", "pop", "jazz", "blues", "lullaby", "tarantella", "rock"],
};

const SUBGENRES_BY_PARENT = {
    blues: ["blues-melancholic", "blues-upbeat"],
    forro: ["forro-pe-de-serra-rapido", "forro-pe-de-serra-lento", "forro-universitario", "forro-eletronico"],
    country: ["sertanejo-raiz", "sertanejo-universitario", "sertanejo-romantico"],
    funk: ["funk-carioca", "funk-paulista", "funk-melody"],
    rock: ["rock-classico", "pop-rock-brasileiro", "heavy-metal"],
    brega: ["brega-romantico", "tecnobrega"],
    pagode: ["pagode-de-mesa", "pagode-romantico", "pagode-universitario"],
    mpb: ["mpb-bossa-nova", "mpb-cancao-brasileira", "mpb-pop", "mpb-intimista"],
    eletronica: ["eletronica-afro-house", "eletronica-progressive-house", "eletronica-melodic-techno"],
    lullaby: ["lullaby-ninar", "lullaby-animada"],
    latina: ["salsa", "merengue", "bachata"],
} as const;

const PT_SUBGENRE_PARENTS = new Set([
    "forro",
    "country",
    "funk",
    "rock",
    "brega",
    "pagode",
    "mpb",
    "eletronica",
    "lullaby",
    "latina",
]);

// Sales priority for PT locale (most sold first) - updated from real sales data
const PT_SALES_PRIORITY: Record<string, number> = {
    // Top sellers
    "samba": 1,
    "worship": 2,
    "pagode-de-mesa": 3,
    "pagode-romantico": 4,
    "pagode-universitario": 5,
    "sertanejo-raiz": 6,
    "sertanejo-romantico": 7,
    "sertanejo-universitario": 8,
    "mpb-bossa-nova": 9,
    "mpb-cancao-brasileira": 10,
    "mpb-pop": 11,
    "mpb-intimista": 12,
    "pop": 13,
    "rock-classico": 14,
    "pop-rock-brasileiro": 14.5,
    "heavy-metal": 15,
    "jovem-guarda": 16,
    "forro-pe-de-serra-rapido": 17, // Dançante
    "forro-pe-de-serra-lento": 18, // Contemplativo 70-85 BPM
    "forro-universitario": 19,
    "forro-eletronico": 20,
    "reggae": 21,
    "hiphop": 22,
    "jazz": 23,
    "rnb": 24,
    "axe": 25,
    "brega-romantico": 26,
    "tecnobrega": 27,
    "lullaby-ninar": 28,
    "lullaby-animada": 29,
    "funk-carioca": 30,
    "funk-paulista": 31,
    "funk-melody": 32,
    "capoeira": 33,
    "blues-melancholic": 34,
    "blues-upbeat": 35,
    "tango": 36,
    "musica-classica": 37,
    "eletronica-afro-house": 38,
    "eletronica-progressive-house": 39,
    "eletronica-melodic-techno": 40,
    "salsa": 41,
    "merengue": 42,
    "bachata": 43,
    "bolero": 44,
    "valsa": 45,
};

export const getGenreAudioEntries = (locale: Locale): GenreAudioEntry[] => {
    const baseGenres = BASE_GENRES_BY_LOCALE[locale] ?? [];

    const entries = baseGenres.flatMap((genre) => {
        if (genre === "blues") {
            return SUBGENRES_BY_PARENT.blues.map((subgenre) => ({
                id: subgenre,
                parent: "blues",
            }));
        }

        if (locale === "pt" && PT_SUBGENRE_PARENTS.has(genre)) {
            const subgenres = SUBGENRES_BY_PARENT[genre as keyof typeof SUBGENRES_BY_PARENT] ?? [];
            return subgenres.map((subgenre) => ({
                id: subgenre,
                parent: genre,
            }));
        }

        return [{ id: genre }];
    });

    // Sort by sales priority for PT locale
    if (locale === "pt") {
        return entries.sort((a, b) => {
            const priorityA = PT_SALES_PRIORITY[a.id] ?? 999;
            const priorityB = PT_SALES_PRIORITY[b.id] ?? 999;
            return priorityA - priorityB;
        });
    }

    return entries;
};

export const getGenreDisplayName = (genre: string, locale: Locale) =>
    GENRE_NAMES[genre]?.[locale] ?? genre.charAt(0).toUpperCase() + genre.slice(1);
