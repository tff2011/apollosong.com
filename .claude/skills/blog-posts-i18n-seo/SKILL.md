---
name: blog-posts-i18n-seo
description: Create or review SEO-optimized i18n blog posts for ApolloSong using Velite. Use when drafting, translating, or checking frontmatter, links, author, and images in content/blog.
argument-hint: "[locale] [slug-or-topic]"
---

# Blog Post i18n + SEO (ApolloSong)

Goal: create/update blog posts in `content/blog` with correct frontmatter, SEO cluster links, and locale-safe URLs.

## Source of truth

Read `docs/blog-posts-i18n-seo.md` before making changes. It defines the frontmatter schema, link rules, SEO guidance, and checklist.

## Workflow

1) Identify the task
   - New post, translation, or review.

2) Frontmatter
   - Use the exact fields from the doc.
   - `language` must match the text locale.
   - `date` must be `MMMM d, yyyy` in English.
   - `coverImage` must be `.webp` in `/public/images/blog`.

3) Content rules
   - Conversational tone, short paragraphs.
   - 900-1400 words (1500-2200 for pillar).
   - Include 3-5 internal links in the same locale.
   - Add 1 category page link for the same locale.
   - Add 1 external link with `rel="noopener noreferrer"`.
   - End with 3-5 FAQ items.
   - Include CTA to `/create` with locale prefix.

4) Validate
   - `readTime` format matches locale rules in the doc.
   - Category is consistent with the cluster (related posts use category + locale).
   - No cross-locale links.

5) Generate cover image (if needed)
   - Use the Replicate MCP to generate images with model `black-forest-labs/flux-2-pro`.
   - Call `mcp__replicate__create_predictions` with:
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
   - Prompt guidelines:
     - Describe the scene clearly, focusing on the blog topic.
     - Include mood/lighting (warm, soft, cinematic).
     - Avoid text in images.
     - Use Christian/faith-related visual elements when appropriate.
   - After generation, download the image and save to `public/images/blog/blog-[slug].webp`.
   - Update `coverImage`, `imageAlt`, and `imageTitle` in frontmatter.

## Output expectations

- Provide the edited/created file path.
- Summarize what was done (frontmatter, links, SEO, FAQ).
- Call out any missing assets (images) or follow-up steps.
