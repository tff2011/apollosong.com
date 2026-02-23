---
name: frontend-design
description: Generate distinctive, production-grade frontend interfaces that avoid generic AI aesthetics. Use when building UI components, landing pages, dashboards, or any frontend work requiring strong visual design.
argument-hint: "[component-or-page description]"
---

# Frontend Design Skill

Goal: create visually striking, production-grade frontend interfaces that avoid "AI slop" aesthetics. Every UI should feel genuinely designed, not generated.

## Core Methodology

Before writing any code, make deliberate aesthetic choices:

1. **Context Analysis** - Understand the interface's purpose, audience, and technical requirements
2. **Bold Direction** - Commit to a specific aesthetic tone (minimalist, maximalist, retro, organic, brutalist, etc.)
3. **Intentional Execution** - Prioritize clarity of vision over intensity

## Design Dimensions

### Typography

**NEVER use:** Inter, Roboto, Open Sans, Lato, Arial, default system fonts.

Choose fonts with character. Suggested directions:

- **Code aesthetic:** JetBrains Mono, Fira Code, Space Grotesk
- **Editorial:** Playfair Display, Crimson Pro, Fraunces
- **Startup:** Clash Display, Satoshi, Cabinet Grotesk
- **Technical:** IBM Plex family, Source Sans 3
- **Distinctive:** Bricolage Grotesque, Obviously, Newsreader

**Pairing principle:** High contrast = interesting. Display + monospace, serif + geometric sans, variable fonts across weights. Use weight extremes (100/200 vs 800/900), not timid middle ranges (400 vs 600). Size jumps of 3x+, not 1.5x.

### Color & Theme

- Commit to a cohesive palette using CSS variables
- Dominant colors with sharp accents outperform timid, evenly-distributed palettes
- **Avoid:** purple gradients on white, safe blue/gray palettes
- Draw inspiration from IDE themes, cultural aesthetics, nature, architecture

### Motion & Animation

- CSS-first for HTML; Motion library (framer-motion) for React when available
- One well-orchestrated page load with staggered reveals (`animation-delay`) > scattered micro-interactions
- Focus on high-impact moments: page entry, state transitions, hover feedback

### Backgrounds & Depth

- Create atmosphere via layered CSS gradients, geometric patterns, subtle textures
- Contextual effects that match the overall aesthetic
- **Never** default to flat solid white/gray backgrounds

### Spatial Design

- Embrace asymmetry and unexpected layouts
- Generous or tightly controlled spacing (never mediocre in-between)
- Break grid when it serves the design

## What to Avoid

- Overused font families (Inter, Roboto, Space Grotesk across all projects)
- Cliche color schemes (purple gradients, safe blue/gray)
- Predictable card-grid layouts
- Cookie-cutter components lacking context-specific character
- Timid, generic design that could be any project

## Implementation Standards

- Production-grade code: semantic HTML, accessible, responsive
- CSS variables for theming consistency
- Load fonts via Google Fonts or CDN with proper `font-display`
- Use Tailwind CSS classes (this project uses Tailwind CSS 4)
- Leverage Radix UI primitives when building interactive components
- Respect the project's existing component patterns in `src/components/`

## Output Expectations

- Choose and commit to a clear aesthetic direction
- Explain the design rationale briefly before implementation
- Deliver production-ready code with meticulous attention to visual detail
- Vary between different aesthetics across projects — avoid converging on the same choices
