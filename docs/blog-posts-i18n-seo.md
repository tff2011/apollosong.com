# Guia de Blog i18n (Velite) com SEO

Este documento formaliza como criar posts de blog por idioma no ApolloSong, seguindo o schema do Velite e garantindo boas praticas de SEO, links internos em cluster, link externo, autor e imagens otimizadas.

## Onde criar o arquivo

- Crie o post em `content/blog/<slug>.mdx`.
- Use **slug unico** por idioma (nao reutilize o mesmo nome de arquivo entre linguas).
- Use **kebab-case** em ASCII (sem acentos), ex: `cancao-oracao-personalizada.mdx`.
- O slug final vira a URL `blog/<slug>` automaticamente.

## Frontmatter obrigatorio (Velite)

Use exatamente estes campos. Eles sao consumidos pela UI, sitemap e JSON-LD.

```yaml
---
language: pt
title: "Titulo com o termo principal e ate 99 caracteres"
excerpt: "Resumo de 1-2 frases, usado como meta description e lead do artigo."
coverImage: /images/blog/blog-exemplo.webp
imageAlt: "Descricao clara da imagem, no idioma do post"
imageTitle: "Titulo da imagem com palavra-chave"
date: December 24, 2025
readTime: 9 min read
category: Saude
author:
  name: Equipe ApolloSong
  role: Equipe Editorial
  image: /icon.svg
  bio: "Breve bio do autor, no idioma do post."
---
```

### Regras importantes do frontmatter

- `language`: deve ser um dos valores em `src/i18n/config.ts` (`en`, `pt`, `es`, `fr`, `it`).
- `title`: maximo de 99 caracteres (schema). Ideal 50-70 para SEO.
- `excerpt`: 140-170 caracteres, 1-2 frases, sem repetir o titulo.
- `coverImage`: sempre em `public/images/blog` com extensao `.webp`.
- `date`: **sempre** no formato `MMMM d, yyyy` em **ingles** (ex: `December 24, 2025`).
- `readTime`: string exibida na UI. Ver regras por idioma abaixo.
- `category`: use categoria consistente para gerar cluster (Related Posts e Post Navigation dependem disso).
- `author`: `name`, `image` sao obrigatorios; `role` e `bio` sao recomendados (aparecem na pagina).

## Regras por idioma (i18n)

| Idioma | Prefixo de URL | Exemplo de link interno | `readTime` recomendado |
| --- | --- | --- | --- |
| `en` | sem prefixo | `/blog/custom-christian-baptism-song` | `9 min read` |
| `pt` | `/pt` | `/pt/blog/cancao-oracao-personalizada` | `9 min read` (a UI converte para "min de leitura") |
| `es` | `/es` | `/es/blog/cancion-oracion-personalizada` | `9 min read` (mantem compatibilidade com UI atual) |
| `fr` | `/fr` | `/fr/blog/chanson-oraison-personnalisee` | `9 min de lecture` |
| `it` | `/it` | `/it/blog/canzone-preghiera-personalizzata` | `9 min di lettura` |

Notas:
- O `language` do frontmatter precisa **coincidir** com o idioma do texto.
- Evite links cruzados entre idiomas. Cada post deve linkar posts do mesmo idioma.

## SEO e tamanho certo do post

- **Tamanho ideal:** 900-1400 palavras (7-10 min). Para "pillar", 1500-2200 palavras.
- **Palavra-chave principal:** no titulo, no primeiro paragrafo e em pelo menos um H2.
- **Headings:** use H2/H3 para escaneabilidade; inclua perguntas e listas.
- **FAQ:** inclua 3-5 perguntas no fim para capturar featured snippets.
- **Read time:** calcule por ~200 palavras/min (ex: 1200 palavras = 6 min).

## Cluster SEO e links internos

O cluster depende da **categoria** e dos links internos:

- Use a mesma `category` para posts do mesmo tema.
- Inclua **3-5 links internos** para outros posts da mesma categoria (mesmo idioma).
- Inclua **1 link para a pagina da categoria**:
  - `/blog/category/<slugify(category)>` no `en`
  - `/<locale>/blog/category/<slugify(category)>` nos demais
- Inclua 1 link interno para uma pagina-chave (ex: `/create` ou `/custom-christian-songs`, com prefixo do idioma quando aplicavel).

Exemplos de links internos:

```md
[Cancao de Oracao Personalizada](/pt/blog/cancao-oracao-personalizada)
[Ver mais na categoria Saude](/pt/blog/category/saude)
```

## Link externo (obrigatorio)

Inclua pelo menos 1 link externo para uma fonte confiavel (estudo, Biblia online, organizacao relevante).

Exemplo:

```html
<a href="https://www.bible.com/pt/verse/591/PSA.34.19" target="_blank" rel="noopener noreferrer">Salmos 34:19</a>
```

## Imagens otimizadas para SEO

- **Formato:** `.webp`
- **Local:** `public/images/blog/`
- **Resolucao recomendada:** 1600-2400px de largura, proporcao 21:9 ou 2.3:1.
- **Peso:** ideal abaixo de 250-300 KB.
- **SEO:** `imageAlt` e `imageTitle` descritivos, no idioma do post, sem keyword stuffing.

### Geracao de imagens via Replicate MCP

Use o modelo `black-forest-labs/flux-2-pro` para gerar cover images:

```json
{
  "model": "black-forest-labs/flux-2-pro",
  "input": {
    "prompt": "[prompt descritivo da imagem]",
    "aspect_ratio": "16:9",
    "output_format": "webp",
    "safety_tolerance": 2
  }
}
```

Diretrizes para o prompt:
- Descreva a cena de forma clara, focando no tema do post.
- Inclua mood/iluminacao (warm, soft, cinematic, peaceful).
- Evite texto nas imagens.
- Use elementos visuais cristaos/fe quando apropriado (luz, natureza, maos em oracao, Biblia).
- Nao inclua rostos identificaveis para evitar problemas de direitos.

Apos gerar, salve como `public/images/blog/blog-[slug].webp`.

Para imagens inline no corpo do post:

```md
![Descricao clara da imagem](/images/blog/blog-exemplo.webp "Titulo da imagem")
```

## Autor (author)

- Use nomes consistentes para evitar criar varias paginas de autor.
- `author.name` gera a URL do autor automaticamente.
- `role` e `bio` devem estar no idioma do post.
- `image` pode ser `/icon.svg` ou uma imagem em `public/images/authors/`.

## Estilo conversacional (obrigatorio)

- Escreva como se estivesse falando com uma pessoa: "voce", "sua familia", "imagine...".
- Paragrafos curtos (2-4 linhas) e frases diretas.
- Intercale historia, exemplos reais e aplicacao pratica.
- Use perguntas retoricas e linguagem calorosa, sem perder a clareza.

## Checklist final antes de publicar

- [ ] `language` correto e texto no idioma correspondente.
- [ ] `title` <= 99 caracteres e com palavra-chave.
- [ ] `excerpt` entre 140-170 caracteres.
- [ ] `date` em ingles no formato `MMMM d, yyyy`.
- [ ] `readTime` conforme idioma.
- [ ] `coverImage` existe em `public/images/blog` e esta otimizada.
- [ ] `imageAlt` e `imageTitle` preenchidos.
- [ ] `category` consistente com o cluster.
- [ ] 3-5 links internos no mesmo idioma.
- [ ] 1 link externo com `rel="noopener noreferrer"`.
- [ ] CTA interno para `/create` ou pagina chave do produto.
