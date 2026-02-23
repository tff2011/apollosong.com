import React from "react";
import { format } from "date-fns";
import { ptBR, enUS, es, fr, it } from "date-fns/locale";
import { GENRE_NAMES } from "~/lib/lyrics-generator";

export type OrderStatus = "PENDING" | "PAID" | "IN_PROGRESS" | "COMPLETED" | "REVISION";

export const DATE_LOCALES = {
    pt: ptBR,
    en: enUS,
    es,
    fr,
    it,
};

export const SUPPORT_EMAIL = "contact@apollosong.com";

// Helper to get formatted genre name
export const getGenreDisplayName = (genre: string | null, locale: string): string => {
    if (!genre) return "";
    const genreData = GENRE_NAMES[genre];
    if (!genreData) return genre.charAt(0).toUpperCase() + genre.slice(1);
    return genreData[locale as keyof typeof genreData] || genreData.en || genre;
};

// Helper to get display name for recipient (with fallback for groups)
const toTitleCase = (value: string) =>
    value.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

export const getRecipientDisplayName = (recipientName: string | null, recipient: string | null, locale?: string): string => {
    if (recipientName && recipientName.trim()) return toTitleCase(recipientName.trim());
    if (recipient === "group") {
        const groupLabels = {
            pt: "seu grupo",
            en: "your group",
            es: "su grupo",
            fr: "votre groupe",
            it: "il vostro gruppo",
        } as const;
        type LocaleKey = keyof typeof groupLabels;
        const key = (locale || "en") as LocaleKey;
        return key in groupLabels ? groupLabels[key] : groupLabels.en;
    }
    return "---";
};

// Helper to get translated label for recipient type
export const getRecipientLabel = (recipient: string | null, locale?: string): string => {
    if (!recipient) return "";

    const labels: Record<string, Record<string, string>> = {
        mom: { pt: "Mãe", en: "Mom", es: "Mamá", fr: "Mère", it: "Mamma" },
        dad: { pt: "Pai", en: "Dad", es: "Papá", fr: "Père", it: "Papà" },
        wife: { pt: "Esposa", en: "Wife", es: "Esposa", fr: "Épouse", it: "Moglie" },
        husband: { pt: "Marido", en: "Husband", es: "Esposo", fr: "Époux", it: "Marito" },
        son: { pt: "Filho", en: "Son", es: "Hijo", fr: "Fils", it: "Figlio" },
        daughter: { pt: "Filha", en: "Daughter", es: "Hija", fr: "Fille", it: "Figlia" },
        grandma: { pt: "Avó", en: "Grandma", es: "Abuela", fr: "Grand-mère", it: "Nonna" },
        grandpa: { pt: "Avô", en: "Grandpa", es: "Abuelo", fr: "Grand-père", it: "Nonno" },
        friend: { pt: "Amigo(a)", en: "Friend", es: "Amigo(a)", fr: "Ami(e)", it: "Amico/a" },
        boyfriend: { pt: "Namorado", en: "Boyfriend", es: "Novio", fr: "Petit ami", it: "Fidanzato" },
        girlfriend: { pt: "Namorada", en: "Girlfriend", es: "Novia", fr: "Petite amie", it: "Fidanzata" },
        brother: { pt: "Irmão", en: "Brother", es: "Hermano", fr: "Frère", it: "Fratello" },
        sister: { pt: "Irmã", en: "Sister", es: "Hermana", fr: "Sœur", it: "Sorella" },
        uncle: { pt: "Tio", en: "Uncle", es: "Tío", fr: "Oncle", it: "Zio" },
        aunt: { pt: "Tia", en: "Aunt", es: "Tía", fr: "Tante", it: "Zia" },
        cousin: { pt: "Primo(a)", en: "Cousin", es: "Primo(a)", fr: "Cousin(e)", it: "Cugino/a" },
        godparent: { pt: "Padrinho/Madrinha", en: "Godparent", es: "Padrino/Madrina", fr: "Parrain/Marraine", it: "Padrino/Madrina" },
        godchild: { pt: "Afilhado(a)", en: "Godchild", es: "Ahijado(a)", fr: "Filleul(e)", it: "Figlioccio/a" },
        teacher: { pt: "Professor(a)", en: "Teacher", es: "Maestro(a)", fr: "Professeur", it: "Insegnante" },
        pastor: { pt: "Pastor(a)", en: "Pastor", es: "Pastor(a)", fr: "Pasteur", it: "Pastore" },
        mentor: { pt: "Mentor(a)", en: "Mentor", es: "Mentor(a)", fr: "Mentor", it: "Mentore" },
        colleague: { pt: "Colega", en: "Colleague", es: "Colega", fr: "Collègue", it: "Collega" },
        boss: { pt: "Chefe", en: "Boss", es: "Jefe(a)", fr: "Patron(ne)", it: "Capo" },
        pet: { pt: "Pet", en: "Pet", es: "Mascota", fr: "Animal", it: "Animale" },
        group: { pt: "Grupo", en: "Group", es: "Grupo", fr: "Groupe", it: "Gruppo" },
        other: { pt: "Outro", en: "Other", es: "Otro", fr: "Autre", it: "Altro" },
    };

    const recipientLabels = labels[recipient];
    if (!recipientLabels) return recipient;

    const key = locale || "en";
    return recipientLabels[key] || recipientLabels.en || recipient;
};

// Format price in cents to display string
export const formatPrice = (priceInCents: number, currency: string): string => {
    const amount = priceInCents / 100;
    if (currency === "BRL") {
        return `R$${amount.toFixed(2).replace(".", ",")}`;
    } else if (currency === "EUR") {
        return `€${amount.toFixed(2).replace(".", ",")}`;
    }
    return `$${amount.toFixed(2)}`;
};

// Get status color classes
export const getStatusColor = (status: string): string => {
    switch (status) {
        case "PENDING":
            return "bg-rose-100 text-rose-800 border-rose-200";
        case "PAID":
            return "bg-amber-100 text-amber-800 border-amber-200";
        case "IN_PROGRESS":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "COMPLETED":
            return "bg-green-100 text-green-800 border-green-200";
        case "REVISION":
            return "bg-pink-100 text-pink-800 border-pink-200";
        default:
            return "bg-slate-100 text-slate-800 border-slate-200";
    }
};

// Get status hero gradient classes
export const getStatusHeroGradient = (status: string): string => {
    switch (status) {
        case "PENDING":
            return "from-rose-500 to-rose-600";
        case "PAID":
            return "from-amber-500 to-amber-600";
        case "IN_PROGRESS":
            return "from-blue-500 to-blue-600";
        case "COMPLETED":
            return "from-emerald-500 to-emerald-600";
        case "REVISION":
            return "from-pink-500 to-pink-600";
        default:
            return "from-slate-500 to-slate-600";
    }
};

// Get status background color for hero section
export const getStatusHeroBackground = (status: string): string => {
    switch (status) {
        case "PENDING":
            return "bg-rose-50";
        case "PAID":
            return "bg-amber-50";
        case "IN_PROGRESS":
            return "bg-blue-50";
        case "COMPLETED":
            return "bg-emerald-50";
        case "REVISION":
            return "bg-pink-50";
        default:
            return "bg-slate-50";
    }
};

// Render markdown bold (**text**) as <strong>
export const renderBold = (text: string, className?: string): React.ReactNode[] =>
    text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i} className={className}>
                {part.slice(2, -2)}
            </strong>
        ) : (
            part
        )
    );

// Render order date with localization
export const renderOrderDate = (date: Date, locale: string): React.ReactNode => {
    const dateLocale = DATE_LOCALES[locale as keyof typeof DATE_LOCALES] || enUS;
    const day = format(date, "d", { locale: dateLocale });
    const month = format(date, "MMMM", { locale: dateLocale });
    const year = format(date, "yyyy", { locale: dateLocale });

    if (locale === "pt" || locale === "es") {
        return (
            <>
                <span className="font-semibold text-charcoal">{day}</span>{" "}
                <span className="text-charcoal/50">de</span>{" "}
                <span className="font-semibold text-charcoal">{month}</span>{" "}
                <span className="text-charcoal/50">de</span>{" "}
                <span className="font-semibold text-charcoal">{year}</span>
            </>
        );
    }

    if (locale === "fr" || locale === "it") {
        return (
            <>
                <span className="font-semibold text-charcoal">{day}</span>{" "}
                <span className="font-semibold text-charcoal">{month}</span>{" "}
                <span className="font-semibold text-charcoal">{year}</span>
            </>
        );
    }

    return (
        <>
            <span className="font-semibold text-charcoal">{month}</span>{" "}
            <span className="font-semibold text-charcoal">{day}</span>
            <span className="text-charcoal/50">,</span>{" "}
            <span className="font-semibold text-charcoal">{year}</span>
        </>
    );
};

// Get extra song price based on currency
export const getExtraSongPrice = (currency: string, orderLocale: string): number => {
    if (currency === "BRL") return 4990;
    if (orderLocale === "es") return 999;
    if (currency === "EUR") return 2900;
    return 4950;
};

// Get genre variant price
export const getGenreVariantPrice = (currency: string, orderLocale: string, useUpsell: boolean): number => {
    if (currency === "BRL") return useUpsell ? 4990 : 3990;
    if (orderLocale === "es") return 999;
    if (currency === "EUR") return 2900;
    return 3990;
};
