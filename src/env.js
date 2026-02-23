import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_DISCORD_ID: z.string().optional(),
    AUTH_DISCORD_SECRET: z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    TELEGRAM_BOT_TOKEN: z.string(),
    TELEGRAM_CHAT_ID: z.string(),
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string(),
    REDIS_URL: z.string(),
    SMTP_HOST: z.string(),
    SMTP_USER: z.string(),
    SMTP_PASSWORD: z.string(),
    SMTP_FROM: z.string(),
    SMTP_REPLY_TO: z.string().optional(),
    SMTP_SECURE: z.string().optional(),
    FACEBOOK_CAPI_ACCESS_TOKEN: z.string().optional(),
    FACEBOOK_CAPI_ACCESS_TOKEN_2: z.string().optional(),
    TIKTOK_CAPI_ACCESS_TOKEN: z.string().optional(),
    // Cloudflare R2
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_DOMAIN: z.string().optional(),
    // OpenRouter LLM for lyrics generation
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default("google/gemini-3-flash-preview"),
    // DistroKid automation credentials
    DISTROKID_EMAIL: z.string().optional(),
    DISTROKID_PASSWORD: z.string().optional(),
    // Spotify API (auto-fill streaming URLs)
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),
    SPOTIFY_ARTIST_NAME: z.string().optional(),
    SPOTIFY_MARKET: z.string().optional(),
    SPOTIFY_AUTO_SYNC_EVERY_MINUTES: z.string().optional(),
    SPOTIFY_AUTO_SYNC_BATCH_SIZE: z.string().optional(),
    SPOTIFY_AUTO_MIN_SCORE: z.string().optional(),
    // Email unsubscribe security
    UNSUBSCRIBE_SECRET: z.string().optional(),
    // Bounce webhook authentication
    BOUNCE_WEBHOOK_SECRET: z.string().optional(),
    // IMAP for support ticket email polling
    IMAP_HOST: z.string().optional(),
    IMAP_PORT: z.string().default("993"),
    // WhatsApp Cloud API
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),
    WHATSAPP_MEDIA_TTL_MINUTES: z.string().optional(),
    WHATSAPP_ENABLE_AUDIO_LINK_FALLBACK: z.string().optional(),
    // Suno automation (optional diagnostics/tuning)
    SUNO_FAST_MODE: z.string().optional(),
    SUNO_DISABLE_COFFEE_BREAKS: z.string().optional(),
    SUNO_DEBUG_CAPTCHA: z.string().optional(),
    SUNO_CAPTCHA_DEBOUNCE_MS: z.string().optional(),
    SUNO_RESOURCE_BLOCKING: z.string().optional(),
    SUNO_CAPTCHA_AUTO_SCREENSHOT: z.string().optional(),
    SUNO_CAPTCHA_SCREENSHOT_COOLDOWN_MS: z.string().optional(),
    SUNO_CAPTCHA_ALERT_COOLDOWN_MS: z.string().optional(),
    SUNO_CAPTCHA_SIREN: z.string().optional(),
    SUNO_CAPTCHA_SIREN_DURATION_MS: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID: z.string().optional(),
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID_2: z.string().optional(),
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
    AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    REDIS_URL: process.env.REDIS_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_REPLY_TO: process.env.SMTP_REPLY_TO,
    SMTP_SECURE: process.env.SMTP_SECURE,
    FACEBOOK_CAPI_ACCESS_TOKEN: process.env.FACEBOOK_CAPI_ACCESS_TOKEN,
    FACEBOOK_CAPI_ACCESS_TOKEN_2: process.env.FACEBOOK_CAPI_ACCESS_TOKEN_2,
    TIKTOK_CAPI_ACCESS_TOKEN: process.env.TIKTOK_CAPI_ACCESS_TOKEN,
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID: process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID,
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID_2: process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID_2,
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    // Cloudflare R2 (accepts both R2_* and CLOUDFLARE_R2_* prefixes)
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET_NAME,
    R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_URL,
    // OpenRouter LLM
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    // DistroKid automation
    DISTROKID_EMAIL: process.env.DISTROKID_EMAIL,
    DISTROKID_PASSWORD: process.env.DISTROKID_PASSWORD,
    // Spotify API (auto-fill streaming URLs)
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    SPOTIFY_ARTIST_NAME: process.env.SPOTIFY_ARTIST_NAME,
    SPOTIFY_MARKET: process.env.SPOTIFY_MARKET,
    SPOTIFY_AUTO_SYNC_EVERY_MINUTES: process.env.SPOTIFY_AUTO_SYNC_EVERY_MINUTES,
    SPOTIFY_AUTO_SYNC_BATCH_SIZE: process.env.SPOTIFY_AUTO_SYNC_BATCH_SIZE,
    SPOTIFY_AUTO_MIN_SCORE: process.env.SPOTIFY_AUTO_MIN_SCORE,
    // Email unsubscribe security
    UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET,
    // Bounce webhook authentication
    BOUNCE_WEBHOOK_SECRET: process.env.BOUNCE_WEBHOOK_SECRET,
    // IMAP for support ticket email polling
    IMAP_HOST: process.env.IMAP_HOST,
    IMAP_PORT: process.env.IMAP_PORT,
    // WhatsApp Cloud API
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    META_APP_SECRET: process.env.META_APP_SECRET,
    WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION,
    WHATSAPP_MEDIA_TTL_MINUTES: process.env.WHATSAPP_MEDIA_TTL_MINUTES,
    WHATSAPP_ENABLE_AUDIO_LINK_FALLBACK: process.env.WHATSAPP_ENABLE_AUDIO_LINK_FALLBACK,
    // Suno automation (optional diagnostics/tuning)
    SUNO_FAST_MODE: process.env.SUNO_FAST_MODE,
    SUNO_DISABLE_COFFEE_BREAKS: process.env.SUNO_DISABLE_COFFEE_BREAKS,
    SUNO_DEBUG_CAPTCHA: process.env.SUNO_DEBUG_CAPTCHA,
    SUNO_CAPTCHA_DEBOUNCE_MS: process.env.SUNO_CAPTCHA_DEBOUNCE_MS,
    SUNO_RESOURCE_BLOCKING: process.env.SUNO_RESOURCE_BLOCKING,
    SUNO_CAPTCHA_AUTO_SCREENSHOT: process.env.SUNO_CAPTCHA_AUTO_SCREENSHOT,
    SUNO_CAPTCHA_SCREENSHOT_COOLDOWN_MS: process.env.SUNO_CAPTCHA_SCREENSHOT_COOLDOWN_MS,
    SUNO_CAPTCHA_ALERT_COOLDOWN_MS: process.env.SUNO_CAPTCHA_ALERT_COOLDOWN_MS,
    SUNO_CAPTCHA_SIREN: process.env.SUNO_CAPTCHA_SIREN,
    SUNO_CAPTCHA_SIREN_DURATION_MS: process.env.SUNO_CAPTCHA_SIREN_DURATION_MS,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
