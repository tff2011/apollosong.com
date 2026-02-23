# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` contains Next.js App Router routes (per-locale segments under `src/app/[locale]`).
- `src/components/` holds reusable UI and feature components (kebab-case filenames).
- `src/lib/` and `src/server/` contain shared utilities, services, API routers, workers, and queues.
- `src/i18n/` plus `src/messages/<locale>/` define localization config and message JSON.
- `content/blog/` stores MDX posts processed by Velite into `.velite/` (generated).
- `prisma/schema.prisma` defines the database schema; `public/` holds static assets.
- `scripts/` contains one-off operational scripts; `Dockerfile.worker` runs worker processes.

## Build, Test, and Development Commands
- `npm run dev`: starts Next.js dev server and Velite watcher.
- `npm run build`: builds Velite content and Next.js for production.
- `npm run preview`: local production preview (`next build` + `next start`).
- `npm run typecheck`: TypeScript checks without emitting.
- `npm run db:generate`: runs `prisma migrate dev` to create/apply migrations.
- `npm run db:migrate`: deploys migrations (production-style).
- `npm run db:push`: pushes schema changes without migrations.
- `npm run db:studio`: opens Prisma Studio.
- `./start-database.sh`: starts a local Postgres container using `.env`.
- `npm run worker:all` (or `worker:lyrics`, `worker:order-reminders`): runs BullMQ workers.

## Coding Style & Naming Conventions
- TypeScript, React, and Next.js; follow existing formatting (2-space indent, semicolons, double quotes).
- Use path aliases like `~/...` for `src/*` imports.
- Component and utility filenames use kebab-case; routes use Next.js conventions (`page.tsx`, `route.ts`).
- Keep localization content in `src/messages/<locale>/...` and blog posts in `content/blog/<slug>.mdx`.

## Testing Guidelines
- No dedicated automated test suite is configured.
- Use `npm run typecheck` and relevant scripts in `scripts/` for manual verification (e.g., email or Suno flows).
- If you add tests, document how to run them in this file.

## Commit & Pull Request Guidelines
- Recent commits are short, lowercase, and often hyphenated (e.g., `fix-genre`). Follow that style.
- PRs should include: a clear summary, testing notes (commands run), and screenshots for UI changes.
- Call out any new environment variables or Prisma migrations in the PR description.

## Security & Configuration Tips
- Environment variables are validated in `src/env.js`; required values include `DATABASE_URL`, `REDIS_URL`, and SMTP settings.
- Do not commit `.env` or generated content in `.velite/`; regenerate via `npm run build` or `npm run dev`.
