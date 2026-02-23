---
name: blog-posts-i18n-seo
description: Create or review SEO-optimized i18n blog posts for ApolloSong using Velite. Use when drafting, translating, or checking frontmatter, links, author, and images in content/blog.
---

# Blog Post i18n + SEO (ApolloSong)

Goal: create/update blog posts in `content/blog` with correct frontmatter, SEO cluster links, and locale-safe URLs.

## When to use this skill

- Creating a new blog post in any supported locale (en, pt, es, fr, it)
- Translating an existing post to another language
- Reviewing blog posts for SEO compliance
- Checking frontmatter, internal links, or image optimization

## Source of truth

Read `docs/blog-posts-i18n-seo.md` before making changes. It defines the frontmatter schema, link rules, SEO guidance, and checklist.

## Where to create files

- Create posts in `content/blog/<slug>.mdx`
- Use **unique slug** per locale (don't reuse filenames across languages)
- Use **kebab-case** in ASCII (no accents), e.g., `cancao-oracao-personalizada.mdx`
- The slug becomes the URL `blog/<slug>` automatically

## Required Frontmatter (Velite)

```yaml
---
language: pt
title: "Title with main keyword, max 99 characters"
excerpt: "1-2 sentence summary, used as meta description and article lead."
coverImage: /images/blog/blog-example.webp
imageAlt: "Clear image description in post language"
imageTitle: "Image title with keyword"
date: December 24, 2025
readTime: 9 min read
category: Health
author:
  name: Equipe ApolloSong
  role: Editorial Team
  image: /icon.svg
  bio: "Brief author bio in post language."
---
```

### Frontmatter rules

| Field | Rule |
|-------|------|
| `language` | Must match `src/i18n/config.ts` values: `en`, `pt`, `es`, `fr`, `it` |
| `title` | Max 99 chars (schema). Ideal 50-70 for SEO |
| `excerpt` | 140-170 chars, 1-2 sentences, don't repeat title |
| `coverImage` | Always in `public/images/blog` with `.webp` extension |
| `date` | **Always** in `MMMM d, yyyy` format in **English** (e.g., `December 24, 2025`) |
| `readTime` | See locale-specific rules below |
| `category` | Use consistent category for cluster generation |
| `author` | `name`, `image` required; `role`, `bio` recommended |

## Locale-specific rules

| Language | URL Prefix | Internal link example | `readTime` format |
|----------|------------|----------------------|-------------------|
| `en` | none | `/blog/custom-christian-baptism-song` | `9 min read` |
| `pt` | `/pt` | `/pt/blog/cancao-oracao-personalizada` | `9 min read` |
| `es` | `/es` | `/es/blog/cancion-oracion-personalizada` | `9 min read` |
| `fr` | `/fr` | `/fr/blog/chanson-oraison-personnalisee` | `9 min de lecture` |
| `it` | `/it` | `/it/blog/canzone-preghiera-personalizzata` | `9 min di lettura` |

**Important:** Avoid cross-locale links. Each post should only link to posts in the same language.

## SEO and content guidelines

- **Ideal length:** 900-1400 words (7-10 min). For pillar content: 1500-2200 words
- **Main keyword:** in title, first paragraph, and at least one H2
- **Headings:** use H2/H3 for scannability; include questions and lists
- **FAQ:** include 3-5 questions at the end for featured snippets
- **Read time:** calculate at ~200 words/min (e.g., 1200 words = 6 min)
- **Style:** conversational tone, short paragraphs (2-4 lines), direct sentences

## Link requirements

### Internal links (3-5 required)
- Link to other posts in the same category AND same locale
- Include 1 link to category page:
  - `/blog/category/<slugify(category)>` for `en`
  - `/<locale>/blog/category/<slugify(category)>` for others
- Include 1 CTA to `/create` (with locale prefix when applicable)

### External link (1 required)
Include at least 1 external link to a trusted source with proper attributes:

```html
<a href="https://www.bible.com/verse/..." target="_blank" rel="noopener noreferrer">Psalm 34:19</a>
```

## Image optimization

- **Format:** `.webp` only
- **Location:** `public/images/blog/`
- **Resolution:** 1600-2400px width, 21:9 or 2.3:1 aspect ratio
- **Size:** ideally under 250-300 KB
- **SEO:** `imageAlt` and `imageTitle` descriptive, in post language, no keyword stuffing

### Image generation (if needed)

Use Replicate with model `black-forest-labs/flux-2-pro`:

```json
{
  "model": "black-forest-labs/flux-2-pro",
  "input": {
    "prompt": "[descriptive prompt for blog cover image]",
    "aspect_ratio": "16:9",
    "output_format": "webp",
    "safety_tolerance": 2
  }
}
```

Prompt guidelines:
- Describe scene clearly, focusing on blog topic
- Include mood/lighting (warm, soft, cinematic, peaceful)
- Avoid text in images
- Use Christian/faith visual elements when appropriate (light, nature, praying hands, Bible)
- Avoid identifiable faces

Save as `public/images/blog/blog-[slug].webp`.

## Final checklist

Before publishing, verify:

- [ ] `language` correct and text matches the locale
- [ ] `title` <= 99 characters with keyword
- [ ] `excerpt` between 140-170 characters
- [ ] `date` in English format `MMMM d, yyyy`
- [ ] `readTime` per locale rules
- [ ] `coverImage` exists in `public/images/blog` and is optimized
- [ ] `imageAlt` and `imageTitle` filled
- [ ] `category` consistent with cluster
- [ ] 3-5 internal links in same locale
- [ ] 1 external link with `rel="noopener noreferrer"`
- [ ] CTA to `/create` or key product page

## Output expectations

When completing a task:
- Provide the edited/created file path
- Summarize what was done (frontmatter, links, SEO, FAQ)
- Call out any missing assets (images) or follow-up steps
