/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    distDir: process.env.NEXT_DIST_DIR || ".next",
    experimental: {
        turbopackFileSystemCacheForDev: false,
    },
    serverExternalPackages: ["@prisma/client", "prisma", "patchright", "patchright-core"],
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 604800, // 1 week
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "replicate.delivery",
            },
        ],
    },
    async headers() {
        const isDev = process.env.NODE_ENV === "development";
        return [
            {
                source: "/images/:path*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: isDev
                            ? "public, max-age=0, must-revalidate"
                            : "public, max-age=31536000, immutable",
                    },
                ],
            },
        ];
    },
};

export default config;
