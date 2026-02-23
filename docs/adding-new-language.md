# Adding a New Language to ApolloSong

This guide documents all the files and configurations that need to be modified when adding a new language/locale to the website.

## Overview

The website uses a custom i18n implementation with namespace-based lazy loading. Each locale has its own set of JSON translation files and requires updates to various configuration files.

**Current locales:** `en`, `pt`, `es`, `fr`, `it`

**Brand names per locale:**
- EN: ApolloSong
- PT: CançãoDivina
- ES: CanciónDivina
- FR: ChansonDivine
- IT: CanzoneDivina

---

## Step 1: Core Configuration Files

### 1.1 `src/i18n/config.ts`

Add the new locale code to the `locales` array:

```typescript
export const locales = ["en", "pt", "es", "fr", "NEW_LOCALE"] as const;
```

### 1.2 `src/i18n/messages.ts`

1. Create a new loader object for the locale (copy from an existing one):

```typescript
const newLocaleLoaders: Record<MessageNamespace, MessageLoader> = {
  common: () => import("../messages/NEW_LOCALE/common.json"),
  contact: () => import("../messages/NEW_LOCALE/contact.json"),
  "contact.page": () => import("../messages/NEW_LOCALE/contact/page.json"),
  "contact.seo": () => import("../messages/NEW_LOCALE/contact/seo.json"),
  blog: () => import("../messages/NEW_LOCALE/blog.json"),
  "blog.seo": () => import("../messages/NEW_LOCALE/blog/seo.json"),
  "terms.page": () => import("../messages/NEW_LOCALE/terms/page.json"),
  "terms.seo": () => import("../messages/NEW_LOCALE/terms/seo.json"),
  "privacy.page": () => import("../messages/NEW_LOCALE/privacy/page.json"),
  "privacy.seo": () => import("../messages/NEW_LOCALE/privacy/seo.json"),
  "customSongs.seo": () => import("../messages/NEW_LOCALE/custom-songs/seo.json"),
  "home.hero": () => import("../messages/NEW_LOCALE/home/hero.json"),
  "home.seo": () => import("../messages/NEW_LOCALE/home/seo.json"),
  "home.socialProof": () => import("../messages/NEW_LOCALE/home/social-proof.json"),
  "home.howItWorks": () => import("../messages/NEW_LOCALE/home/how-it-works.json"),
  "home.emotionalGallery": () => import("../messages/NEW_LOCALE/home/emotional-gallery.json"),
  "home.videoTestimonials": () => import("../messages/NEW_LOCALE/home/video-testimonials.json"),
  "home.productDetails": () => import("../messages/NEW_LOCALE/home/product-details.json"),
  "home.guarantee": () => import("../messages/NEW_LOCALE/home/guarantee.json"),
  "home.faq": () => import("../messages/NEW_LOCALE/home/faq.json"),
  "home.finalCta": () => import("../messages/NEW_LOCALE/home/final-cta.json"),
  "home.reviews": () => import("../messages/NEW_LOCALE/home/reviews.json"),
  "home.whatYouGet": () => import("../messages/NEW_LOCALE/home/what-you-get.json"),
  "home.giftOccasions": () => import("../messages/NEW_LOCALE/home/gift-occasions.json"),
  "home.exploreBlog": () => import("../messages/NEW_LOCALE/home/explore-blog.json"),
  "create.quiz": () => import("../messages/NEW_LOCALE/create/quiz.json"),
  checkout: () => import("../messages/NEW_LOCALE/checkout.json"),
  "track-order": () => import("../messages/NEW_LOCALE/track-order.json"),
  certificate: () => import("../messages/NEW_LOCALE/certificate.json"),
};
```

2. Add the new loader to `messageLoaders`:

```typescript
const messageLoaders: Record<Locale, Record<MessageNamespace, MessageLoader>> = {
  en: enLoaders,
  pt: ptLoaders,
  es: esLoaders,
  fr: frLoaders,
  NEW_LOCALE: newLocaleLoaders,  // Add this line
};
```

---

## Step 2: Create Translation Files

Create the following directory structure under `src/messages/NEW_LOCALE/`:

```
src/messages/NEW_LOCALE/
├── common.json
├── contact.json
├── blog.json
├── checkout.json
├── certificate.json
├── track-order.json
├── contact/
│   ├── page.json
│   └── seo.json
├── blog/
│   └── seo.json
├── terms/
│   ├── page.json
│   └── seo.json
├── privacy/
│   ├── page.json
│   └── seo.json
├── custom-songs/
│   └── seo.json
├── home/
│   ├── hero.json
│   ├── seo.json
│   ├── social-proof.json
│   ├── how-it-works.json
│   ├── emotional-gallery.json
│   ├── video-testimonials.json
│   ├── product-details.json
│   ├── guarantee.json
│   ├── faq.json
│   ├── final-cta.json
│   ├── reviews.json
│   ├── what-you-get.json
│   ├── gift-occasions.json
│   └── explore-blog.json
└── create/
    └── quiz.json
```

**Tip:** Copy files from `src/messages/en/` as a starting point and translate.

### Important: `common.json`

In the `footer.languages` section, add the new language label in ALL locale files:

```json
// In src/messages/en/common.json
"languages": {
  "en": "English",
  "pt": "Português",
  "es": "Español",
  "fr": "Français",
  "NEW_LOCALE": "New Language Name"
}
```

Update this in all existing locale's `common.json` files.

### Important: `create/quiz.json`

The genre options should be culturally relevant for the target market. Example:

- **PT (Brazil):** samba, pagode, forró, axé, mpb, bossa nova
- **ES (Latin):** salsa, bachata, cumbia, ranchera, balada
- **FR (France):** chanson française, variété française, jazz

---

## Step 3: Update Page Metadata Files

### 3.1 `src/app/[locale]/layout.tsx`

Update the `names` objects in both `getOrganizationSchema` and `getWebSiteSchema`:

```typescript
const names: Record<Locale, string> = {
  en: "ApolloSong",
  pt: "CançãoDivina",
  es: "CanciónDivina",
  fr: "ChansonDivine",
  NEW_LOCALE: "BrandName",  // Add this
};
```

Also update:
- `availableLanguage` array in `contactPoint`
- `inLanguage` array in `getWebSiteSchema`

### 3.2 `src/app/[locale]/page.tsx`

Update the `names` object in `getServiceSchema`:

```typescript
const names: Record<Locale, { name: string; description: string }> = {
  // ... existing locales
  NEW_LOCALE: {
    name: "Custom Christian Songs",
    description: "Description in the new language...",
  },
};
```

Update `ogImages`:

```typescript
const ogImages: Record<Locale, string> = {
  // ... existing locales
  NEW_LOCALE: "/images/og/og-NEW_LOCALE.png",
};
```

### 3.3 `src/app/[locale]/create/page.tsx`

Update `titles`, `descriptions`, and `siteNames` objects:

```typescript
const titles = {
  // ... existing locales
  NEW_LOCALE: "Create Your Custom Christian Song | BrandName",
};

const descriptions = {
  // ... existing locales
  NEW_LOCALE: "Description in the new language...",
};

const siteNames = {
  // ... existing locales
  NEW_LOCALE: "BrandName",
};
```

### 3.4 `src/app/[locale]/order/[id]/page.tsx`

Update `titles` and `descriptions` objects.

### 3.5 `src/app/[locale]/order/[id]/success/page.tsx`

Update `titles` and `descriptions` objects.

---

## Step 4: Update Component Files

### 4.1 `src/components/create/song-quiz.tsx`

1. Add a new genre options array for the locale:

```typescript
const genreOptionsNEW_LOCALE = ["pop", "rock", "worship", /* culturally relevant genres */];
```

2. Update ALL places where `genreOptions` is set (search for `genreOptions =`):

```typescript
const genreOptions = locale === "pt" ? genreOptionsPT
  : locale === "es" ? genreOptionsES
  : locale === "fr" ? genreOptionsFR
  : locale === "NEW_LOCALE" ? genreOptionsNEW_LOCALE
  : genreOptionsEN;
```

**Note:** There are 3 places in the file where this needs to be updated:
- Around line 657 (StepGenre function)
- Around line 1024 (StepCheckout function)
- Around line 1645 (ReviewModal function)

### 4.2 `src/components/landing/reviews-section.tsx`

Update the `names` object in `getAggregateRatingSchema`:

```typescript
const names: Record<Locale, string> = {
  // ... existing locales
  NEW_LOCALE: "Custom Christian Songs - BrandName",
};
```

---

## Step 5: Update Validation Schema

### `src/lib/validations/song-order.ts`

If adding new genre types for the locale, add them to `genreTypes`:

```typescript
export const genreTypes = [
  // Universal genres
  "pop", "country", "rock", "rnb", "jazz", "worship", "hiphop", "reggae", "lullaby",
  // Brazilian genres (PT)
  "samba", "pagode", "forro", "axe", "mpb", "bossa",
  // Latin genres (ES)
  "salsa", "bachata", "cumbia", "ranchera", "balada",
  // French genres (FR)
  "chanson", "variete",
  // NEW_LOCALE genres
  "new_genre_1", "new_genre_2",
] as const;
```

---

## Step 6: Update LLM/Lyrics Generator

There are two files that handle lyrics generation:
- `src/lib/lyrics-generator.ts` - Client-side helpers (GENRE_NAMES, RELATIONSHIP_NAMES, etc.)
- `src/server/workers/lyrics-generation.ts` - BullMQ worker that actually generates lyrics

### Part A: `src/lib/lyrics-generator.ts`

### 6.1 Add to `GENRE_NAMES`

For each new genre, add translations:

```typescript
export const GENRE_NAMES: Record<string, { en: string; pt: string; es: string; fr: string; NEW_LOCALE: string }> = {
  new_genre: {
    en: "Genre Name",
    pt: "Nome do Gênero",
    es: "Nombre del Género",
    fr: "Nom du Genre",
    NEW_LOCALE: "Genre Name in New Language"
  },
  // ... all existing genres need the new locale added
};
```

### 6.2 Add to `RELATIONSHIP_NAMES`

Add the new locale to all relationship translations:

```typescript
export const RELATIONSHIP_NAMES: Record<string, { en: string; pt: string; es: string; fr: string; NEW_LOCALE: string }> = {
  husband: {
    en: "Husband",
    pt: "Marido",
    es: "Esposo",
    fr: "Mari",
    NEW_LOCALE: "Translation"
  },
  // ... all relationships
};
```

### 6.3 Add to `GENRE_INSTRUCTIONS`

Add culturally-specific LLM prompts for each genre:

```typescript
const GENRE_INSTRUCTIONS: Record<string, { en: string; pt: string; es: string; fr: string; NEW_LOCALE: string }> = {
  pop: {
    // ... existing locales
    NEW_LOCALE: "Write in a modern pop style... (culturally specific instructions)",
  },
  // ... all genres
};
```

### 6.4 Add to `RELATIONSHIP_CONTEXT`

```typescript
const RELATIONSHIP_CONTEXT: Record<string, { en: string; pt: string; es: string; fr: string; NEW_LOCALE: string }> = {
  husband: {
    // ... existing locales
    NEW_LOCALE: "This song is a gift from a wife to her husband...",
  },
  // ... all relationships
};
```

### 6.5 Update `SupportedLocale` type

```typescript
type SupportedLocale = "en" | "pt" | "es" | "fr" | "NEW_LOCALE";
```

### 6.6 Add to `genreStyleHints` in `buildMusicPromptRequest`

For each genre, add the new locale's style hint:

```typescript
const genreStyleHints: Record<string, Record<SupportedLocale, string>> = {
  samba: {
    // ... existing locales
    NEW_LOCALE: "Description of samba style for music AI...",
  },
  // ... all genres
};
```

### 6.7 Add to `prompts` in `buildMusicPromptRequest`

Add the music prompt template for the new locale:

```typescript
const prompts: Record<SupportedLocale, string> = {
  // ... existing locales
  NEW_LOCALE: `Based on the lyrics below and the musical genre ${genreName}, create a SUMMARIZED MUSIC PRODUCTION PROMPT...`,
};
```

### Part B: `src/server/workers/lyrics-generation.ts`

This is the BullMQ worker that runs async lyrics generation. **Critical:** If you don't update this file, lyrics will be generated in English for non-PT locales.

### 6.8 Update `getLocale()` helper

The worker uses a `getLocale()` function to safely extract locale. Ensure the new locale is included in the type:

```typescript
type SupportedLocale = "en" | "pt" | "es" | "fr" | "it" | "NEW_LOCALE";

const getLocale = (locale?: string): SupportedLocale => {
  if (locale === "pt" || locale === "es" || locale === "fr" || locale === "it" || locale === "NEW_LOCALE") {
    return locale;
  }
  return "en";
};
```

### 6.9 Update `RELATIONSHIP_CONTEXT`

Add translations for all relationship types:

```typescript
const RELATIONSHIP_CONTEXT: Record<string, Record<SupportedLocale, string>> = {
  husband: {
    en: "This song is a heartfelt gift from a wife to her husband...",
    pt: "Esta música é um presente da esposa para o marido...",
    es: "Esta canción es un regalo de una esposa a su esposo...",
    fr: "Cette chanson est un cadeau d'une épouse à son mari...",
    it: "Questa canzone è un regalo da una moglie a suo marito...",
    NEW_LOCALE: "Translation for new locale...",
  },
  wife: { /* all locales */ },
  children: { /* all locales */ },
  father: { /* all locales */ },
  mother: { /* all locales */ },
  sibling: { /* all locales */ },
  friend: { /* all locales */ },
  myself: { /* all locales */ },
  other: { /* all locales */ },
  group: { /* all locales */ },
};
```

### 6.10 Update `buildPrompt()` function

Add the full prompt template for the new locale:

```typescript
const prompts: Record<SupportedLocale, string> = {
  en: `Write lyrics for a Christian song in English...`,
  pt: `Escreva a letra de uma música cristã em português...`,
  es: `Escribe la letra de una canción cristiana en español...`,
  fr: `Écris les paroles d'une chanson chrétienne en français...`,
  it: `Scrivi il testo di una canzone cristiana in italiano...`,
  NEW_LOCALE: `Write lyrics in NEW_LOCALE language...`,
};
```

Also update the system message in the same function:

```typescript
const systemMessages: Record<SupportedLocale, string> = {
  en: "You are a talented Christian songwriter...",
  pt: "Você é um talentoso compositor de músicas cristãs...",
  es: "Eres un talentoso compositor de canciones cristianas...",
  fr: "Tu es un compositeur talentueux de chansons chrétiennes...",
  it: "Sei un talentuoso compositore di canzoni cristiane...",
  NEW_LOCALE: "System message in new locale...",
};
```

### 6.11 Update `adaptLyricsForGenre()` function

Add locale-specific prompts and system messages:

```typescript
const prompts: Record<SupportedLocale, string> = {
  en: `Please adapt the following lyrics to fit the ${genreName} genre...`,
  pt: `Por favor, adapte a letra a seguir para combinar com o gênero ${genreName}...`,
  es: `Por favor, adapta la siguiente letra para que encaje con el género ${genreName}...`,
  fr: `Veuillez adapter les paroles suivantes au genre ${genreName}...`,
  it: `Per favore, adatta il seguente testo al genere ${genreName}...`,
  NEW_LOCALE: "Prompt in new locale...",
};

const systemMessages: Record<SupportedLocale, string> = {
  en: "You are an expert music producer and lyricist...",
  pt: "Você é um produtor musical e letrista especialista...",
  es: "Eres un productor musical y letrista experto...",
  fr: "Tu es un producteur de musique et parolier expert...",
  it: "Sei un esperto produttore musicale e paroliere...",
  NEW_LOCALE: "System message in new locale...",
};
```

### 6.12 Update `buildMusicPromptRequest()` function

Add locale-specific vocals description and prompt:

```typescript
const vocalsDescriptions: Record<SupportedLocale, string> = {
  en: `${voiceType} vocals`,
  pt: `Vocais ${voiceType === "male" ? "masculinos" : "femininos"}`,
  es: `Vocales ${voiceType === "male" ? "masculinos" : "femeninos"}`,
  fr: `Voix ${voiceType === "male" ? "masculine" : "féminine"}`,
  it: `Voce ${voiceType === "male" ? "maschile" : "femminile"}`,
  NEW_LOCALE: "Vocals description...",
};

const prompts: Record<SupportedLocale, string> = {
  en: `Based on the lyrics below and the musical genre ${genreName}, create a SUMMARIZED MUSIC PRODUCTION PROMPT...`,
  pt: `Com base na letra abaixo e no gênero musical ${genreName}, crie um PROMPT DE PRODUÇÃO MUSICAL RESUMIDO...`,
  es: `Basándote en la letra a continuación y en el género musical ${genreName}, crea un PROMPT DE PRODUCCIÓN MUSICAL RESUMIDO...`,
  fr: `En te basant sur les paroles ci-dessous et le genre musical ${genreName}, crée un PROMPT DE PRODUCTION MUSICALE RÉSUMÉ...`,
  it: `Basandoti sul testo qui sotto e sul genere musicale ${genreName}, crea un PROMPT DI PRODUZIONE MUSICALE RIASSUNTO...`,
  NEW_LOCALE: "Prompt in new locale...",
};
```

### 6.13 Update `generateLyrics()` system message

In the main `generateLyrics()` function, update the system message:

```typescript
const systemMessages: Record<SupportedLocale, string> = {
  en: "You are a talented Christian songwriter...",
  pt: "Você é um talentoso compositor de músicas cristãs...",
  es: "Eres un talentoso compositor de canciones cristianas...",
  fr: "Tu es un compositeur talentueux de chansons chrétiennes...",
  it: "Sei un talentuoso compositore di canzoni cristiane...",
  NEW_LOCALE: "System message in new locale...",
};
```

**Important:** Without these worker updates, the lyrics will default to English for any locale that isn't explicitly handled.

---

## Step 7: Update Admin Panel

### 7.1 `src/app/admin/(dashboard)/leads/columns.tsx`

#### Update `genreTranslations`

Add the new locale to all genre translations:

```typescript
const genreTranslations: Record<string, Record<SupportedLocale, string>> = {
  pop: { en: "Pop", pt: "Pop", es: "Pop", fr: "Pop", NEW_LOCALE: "Pop" },
  // ... all genres
};
```

#### Update `flags`

Add the flag emoji for the new locale:

```typescript
const flags: Record<string, { emoji: string; title: string }> = {
  pt: { emoji: "🇧🇷", title: "Português" },
  es: { emoji: "🇪🇸", title: "Español" },
  fr: { emoji: "🇫🇷", title: "Français" },
  en: { emoji: "🇺🇸", title: "English" },
  NEW_LOCALE: { emoji: "🏳️", title: "Language Name" },
};
```

### 7.2 `src/server/api/routers/admin.ts`

Add order count for the new locale in the `getStats` query:

```typescript
// In the Promise.all array, add:
// Orders by locale - NEW_LOCALE
ctx.db.songOrder.count({
    where: { status: { in: ["PAID", "IN_PROGRESS", "COMPLETED"] }, locale: "NEW_LOCALE" },
}),
```

Update the destructuring:

```typescript
const [
    // ... existing variables
    ordersEN, ordersPT, ordersES, ordersFR, ordersNEW_LOCALE, totalRevenue
] = await Promise.all([...]);
```

Add the new locale to `genreStatsByLocale`:

```typescript
const genreStatsByLocale: Record<string, { genre: string; count: number }[]> = {
    all: genreStats,
    en: [],
    pt: [],
    es: [],
    fr: [],
    NEW_LOCALE: [],  // Add this
};
```

Update the return object:

```typescript
return {
    // ... existing fields
    ordersNEW_LOCALE,
    // ...
};
```

### 7.3 `src/app/admin/(dashboard)/stats/page.tsx`

#### Add genre colors for new locale-specific genres

```typescript
const GENRE_COLORS: Record<string, string> = {
    // ... existing colors
    // NEW_LOCALE genres
    new_genre_1: "#hexcolor",
    new_genre_2: "#hexcolor",
};
```

#### Add genre labels

```typescript
const genreLabels: Record<string, string> = {
    // ... existing labels
    // NEW_LOCALE genres
    new_genre_1: "Genre 1 Name",
    new_genre_2: "Genre 2 Name",
};
```

#### Update `LOCALE_LABELS`

```typescript
const LOCALE_LABELS: Record<string, { emoji: string; name: string }> = {
    all: { emoji: "🌍", name: "All" },
    en: { emoji: "🇺🇸", name: "English" },
    pt: { emoji: "🇧🇷", name: "Português" },
    es: { emoji: "🇪🇸", name: "Español" },
    fr: { emoji: "🇫🇷", name: "Français" },
    NEW_LOCALE: { emoji: "🏳️", name: "Language Name" },  // Add this
};
```

#### Update Language Distribution section

Add the new locale to the `localeData` array:

```typescript
const localeData = [
    { key: "en", emoji: "🇺🇸", name: "English", count: stats.ordersEN, color: "bg-blue-500" },
    { key: "pt", emoji: "🇧🇷", name: "Português", count: stats.ordersPT, color: "bg-green-500" },
    { key: "es", emoji: "🇪🇸", name: "Español", count: stats.ordersES, color: "bg-amber-500" },
    { key: "fr", emoji: "🇫🇷", name: "Français", count: stats.ordersFR, color: "bg-purple-500" },
    { key: "NEW_LOCALE", emoji: "🏳️", name: "Language Name", count: stats.ordersNEW_LOCALE, color: "bg-pink-500" },
].sort((a, b) => b.count - a.count);
```

Update the total calculation:

```typescript
const totalLang = stats.ordersEN + stats.ordersPT + stats.ordersES + stats.ordersFR + stats.ordersNEW_LOCALE;
```

---

## Step 8: Update Email Templates

### `src/server/email/purchase-approved.ts`

1. Update `genreTranslations` with the new locale
2. Update `brandNames` object
3. Update all text template strings to include the new locale
4. Update `certificateLabels` and `lyricsLabels` objects

---

## Step 9: Create OG Image

Create an Open Graph image for the new locale:

```
public/images/og/og-NEW_LOCALE.png
```

Dimensions: 1200x630px

---

## Step 10: Test Checklist

After adding a new language, verify:

- [ ] Run `npm run typecheck` - no TypeScript errors
- [ ] Run `npm run build` - build completes successfully
- [ ] New locale pages are generated (check build output)
- [ ] Footer language selector shows the new language
- [ ] Quiz flow works with locale-specific genres
- [ ] Order submission works (Zod validation passes)
- [ ] Lyrics generation works for new locale
- [ ] Admin panel displays correct translations
- [ ] Email templates render correctly

---

## Notes

### Currency Handling

Currently, the site uses:
- **BRL** for `pt` locale
- **USD** for all other locales

If adding a locale with a different currency, update:
- `src/components/create/song-quiz.tsx` - currency logic
- Payment processing in checkout components
- Price display formatting

### Blog Content

Blog posts are in `content/blog/` and have locale-specific versions. Create translated versions of blog posts for the new locale.

---

## Quick Reference: Files to Modify

| File | Changes Required |
|------|-----------------|
| `src/i18n/config.ts` | Add locale to array |
| `src/i18n/messages.ts` | Add loader object and to messageLoaders |
| `src/messages/NEW_LOCALE/*` | Create all 29 translation files |
| `src/messages/*/common.json` | Add language label in ALL locales |
| `src/app/[locale]/layout.tsx` | Add to names, languages arrays |
| `src/app/[locale]/page.tsx` | Add to names, ogImages |
| `src/app/[locale]/create/page.tsx` | Add to titles, descriptions, siteNames |
| `src/app/[locale]/order/[id]/page.tsx` | Add to titles, descriptions |
| `src/app/[locale]/order/[id]/success/page.tsx` | Add to titles, descriptions |
| `src/components/create/song-quiz.tsx` | Add genreOptions array, update 3 places |
| `src/components/landing/reviews-section.tsx` | Add to names |
| `src/lib/validations/song-order.ts` | Add new genres if needed |
| `src/lib/lyrics-generator.ts` | Add to GENRE_NAMES, RELATIONSHIP_NAMES, GENRE_INSTRUCTIONS, etc. |
| `src/server/workers/lyrics-generation.ts` | Add to getLocale(), RELATIONSHIP_CONTEXT, buildPrompt(), adaptLyricsForGenre(), buildMusicPromptRequest(), generateLyrics() |
| `src/app/admin/(dashboard)/leads/columns.tsx` | Add to translations, flags |
| `src/server/api/routers/admin.ts` | Add locale count, genreStatsByLocale, return object |
| `src/app/admin/(dashboard)/stats/page.tsx` | Add GENRE_COLORS, genreLabels, LOCALE_LABELS, localeData |
| `src/server/email/purchase-approved.ts` | Add to all translation objects |
| `public/images/og/` | Create OG image |
