# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apollo Song is a full-stack Next.js SaaS platform for selling custom AI-generated Christian songs. Users complete a quiz (recipient, genre, vocals, qualities, memories, message), pay via Stripe, receive AI-generated lyrics, and get a personalized song delivered via email.

## Commands

### Development
```bash
npm run dev           # Start Next.js dev server + Velite watcher (Turbo mode)
npm run build         # Production build (Velite + Next.js)
npm run preview       # Local production preview
npm run typecheck     # TypeScript validation
```

### Database (PostgreSQL + Prisma)
```bash
npm run db:generate   # Create/apply migrations (prisma migrate dev)
npm run db:migrate    # Deploy migrations (production)
npm run db:push       # Push schema without migrations
npm run db:studio     # Open Prisma Studio GUI
./start-database.sh   # Start local Postgres container
```

### Workers (BullMQ + Redis)
```bash
npm run worker:all            # Run all background workers
npm run worker:lyrics         # Lyrics generation worker only
npm run worker:order-reminders # Order reminder emails only
```

### No automated test suite - use `npm run typecheck` and manual verification.

## Architecture

### Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19
- **API:** tRPC 11 with React Query
- **Database:** PostgreSQL via Prisma 6
- **Queue:** BullMQ with Redis (IORedis)
- **Auth:** NextAuth.js 5 (Credentials + Discord OAuth)
- **UI:** Tailwind CSS 4 + Radix UI components
- **Storage:** Cloudflare R2 (S3-compatible)
- **Content:** Velite for MDX blog posts

### Directory Structure
```
src/
├── app/[locale]/        # Routes with i18n (en, pt, es, fr, it)
├── components/          # UI components (kebab-case filenames)
├── server/
│   ├── api/routers/     # tRPC routers (songOrder, admin, post)
│   ├── workers/         # BullMQ job processors
│   ├── queues/          # Job queue definitions
│   ├── email/           # Email templates (nodemailer)
│   └── auth/            # NextAuth config
├── lib/
│   ├── lyrics-generator/ # AI lyrics via OpenRouter
│   ├── validations/      # Zod schemas
│   ├── storage.ts        # R2 file uploads
│   └── facebook-capi.ts, tiktok-capi.ts, telegram.ts
├── i18n/                # Internationalization config
├── messages/<locale>/   # Translation JSON files
└── trpc/                # tRPC client setup
content/blog/            # MDX posts (processed by Velite)
prisma/schema.prisma     # Database schema
```

### Key Data Flow
1. User completes quiz → `songOrderRouter.create` → SongOrder saved with PENDING status
2. Stripe payment → status becomes PAID → lyrics job queued
3. Worker generates AI lyrics via OpenRouter → status IN_PROGRESS
4. Song file uploaded to R2 → status COMPLETED → delivery email sent

### tRPC Routers
- **songOrderRouter** (`src/server/api/routers/songOrder.ts`): Quiz submission, payment intents, order status, upsells
- **adminRouter** (`src/server/api/routers/admin.ts`): Protected routes for lead management, analytics, bulk actions
- **postRouter**: Basic blog post CRUD

### SongOrder Model (Core Domain)
The main model has 100+ fields including:
- Quiz data: recipient, genre (23 types), vocals, qualities, memories, message
- Pricing: locale, currency, priceAtOrder, planType
- Analytics: UTM params, fbp/fbc cookies, pageViews, quizDuration
- Order bumps: fastDelivery, certificate, extraSongs, lyricsPdf, streamingDistribution
- Status flow: PENDING → PAID → IN_PROGRESS → COMPLETED

## Code Conventions

- TypeScript strict mode, 2-space indent, double quotes, semicolons
- Path alias: `~/` maps to `src/`
- Component filenames: kebab-case (e.g., `song-player.tsx`)
- Localized strings go in `src/messages/<locale>/`
- Environment variables must be added to `src/env.js` with Zod validation

## Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis for BullMQ
- `ADMIN_PASSWORD` - Admin login password
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` - Admin notifications
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` - Email delivery

**Optional but common:**
- `AUTH_SECRET` - Required in production
- `R2_*` - Cloudflare R2 storage
- `OPENROUTER_API_KEY` - AI lyrics generation
- `FACEBOOK_CAPI_ACCESS_TOKEN`, `TIKTOK_CAPI_ACCESS_TOKEN` - Conversion tracking
- `NEXT_PUBLIC_FACEBOOK_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID` - Client pixels

## Commit Style

Short, lowercase, hyphenated messages (e.g., `fix-genre`, `quiz-burro-fix`, `melhorias-suno-fila`)
