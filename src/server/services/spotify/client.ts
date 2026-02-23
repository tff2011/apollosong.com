const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH_ENDPOINT = "https://api.spotify.com/v1/search";
const SPOTIFY_SEARCH_MAX_RETRIES = parseBoundedIntegerEnv(
    process.env.SPOTIFY_SEARCH_MAX_RETRIES,
    3,
    0,
    8
);
const SPOTIFY_SEARCH_BASE_DELAY_MS = parseBoundedIntegerEnv(
    process.env.SPOTIFY_SEARCH_BASE_DELAY_MS,
    1200,
    200,
    15000
);
const SPOTIFY_SEARCH_MAX_DELAY_MS = parseBoundedIntegerEnv(
    process.env.SPOTIFY_SEARCH_MAX_DELAY_MS,
    20000,
    1000,
    120000
);

type SpotifyTokenResponse = {
    access_token?: string;
    expires_in?: number;
};

type SpotifyTrackItem = {
    id?: string;
    name?: string;
    popularity?: number;
    external_urls?: {
        spotify?: string;
    };
    artists?: Array<{
        name?: string;
    }>;
};

type SpotifySearchResponse = {
    tracks?: {
        items?: SpotifyTrackItem[];
    };
};

export type SpotifyTrackMatch = {
    spotifyUrl: string;
    trackId: string;
    trackName: string;
    artistNames: string[];
    score: number;
};

type SearchTrackCandidate = {
    trackId: string;
    trackName: string;
    spotifyUrl: string;
    artistNames: string[];
    popularity: number;
};

export class SpotifyRateLimitError extends Error {
    status: number;
    retryAfterMs?: number;

    constructor(message: string, status: number, retryAfterMs?: number) {
        super(message);
        this.name = "SpotifyRateLimitError";
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function parseBoundedIntegerEnv(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number
): number {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | undefined {
    const retryAfter = response.headers.get("retry-after");
    if (!retryAfter) return undefined;

    const asSeconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return asSeconds * 1000;
    }

    const asDateMs = Date.parse(retryAfter);
    if (Number.isFinite(asDateMs)) {
        return Math.max(0, asDateMs - Date.now());
    }

    return undefined;
}

function computeRetryDelayMs(attemptNumber: number, retryAfterMs?: number): number {
    if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
        return Math.max(250, Math.min(SPOTIFY_SEARCH_MAX_DELAY_MS, retryAfterMs));
    }

    const exponent = Math.max(0, attemptNumber - 1);
    const jitter = Math.floor(Math.random() * 400);
    const exponentialDelay = SPOTIFY_SEARCH_BASE_DELAY_MS * (2 ** exponent);
    return Math.min(SPOTIFY_SEARCH_MAX_DELAY_MS, exponentialDelay + jitter);
}

function normalizeText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/["'`´]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeArtistForStrictMatch(value: string): string {
    return normalizeText(value).replace(/\s+/g, "");
}

function artistNameMatchesStrict(expectedArtistName: string, candidateArtistName: string): boolean {
    const expected = normalizeArtistForStrictMatch(expectedArtistName);
    const candidate = normalizeArtistForStrictMatch(candidateArtistName);
    if (!expected || !candidate) return false;
    return expected === candidate;
}

function stripSongTitleNoise(value: string): string {
    return value
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s*\[[^\]]*]\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(value: string): Set<string> {
    return new Set(
        normalizeText(value)
            .split(" ")
            .map((token) => token.trim())
            .filter(Boolean)
    );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection += 1;
    }
    const union = a.size + b.size - intersection;
    if (union === 0) return 0;
    return intersection / union;
}

function computeTitleSimilarity(expectedSongName: string, candidateSongName: string): number {
    const expected = normalizeText(stripSongTitleNoise(expectedSongName));
    const candidate = normalizeText(stripSongTitleNoise(candidateSongName));

    if (!expected || !candidate) return 0;
    if (expected === candidate) return 1;

    const expectedTokens = tokenize(expected);
    const candidateTokens = tokenize(candidate);
    const tokenScore = jaccardSimilarity(expectedTokens, candidateTokens);
    const includes =
        candidate.includes(expected) ||
        expected.includes(candidate);
    const startsMatch =
        candidate.startsWith(expected) ||
        expected.startsWith(candidate);

    let score = tokenScore;
    if (includes) score = Math.max(score, 0.9);
    if (startsMatch) score = Math.max(score, 0.92);

    return Math.min(1, Math.max(0, score));
}

function scoreTrackCandidate(
    candidate: SearchTrackCandidate,
    expectedSongName: string,
    expectedArtistName?: string
): number {
    const titleScore = computeTitleSimilarity(expectedSongName, candidate.trackName);
    let score = titleScore;

    if (expectedArtistName) {
        const artistMatched = candidate.artistNames.some((artistName) =>
            artistNameMatchesStrict(expectedArtistName, artistName)
        );
        score += artistMatched ? 0.08 : -0.08;
    }

    // Small tie-breaker favoring more popular exact-ish tracks.
    score += Math.min(candidate.popularity, 100) / 5000;

    return Math.min(1, Math.max(0, score));
}

function parseSearchCandidates(response: SpotifySearchResponse): SearchTrackCandidate[] {
    const items = response.tracks?.items ?? [];
    const candidates: SearchTrackCandidate[] = [];

    for (const item of items) {
        const trackId = item.id?.trim();
        const trackName = item.name?.trim();
        const spotifyUrl = item.external_urls?.spotify?.trim();
        if (!trackId || !trackName || !spotifyUrl) continue;

        candidates.push({
            trackId,
            trackName,
            spotifyUrl,
            artistNames: (item.artists ?? [])
                .map((artist) => artist.name?.trim() || "")
                .filter(Boolean),
            popularity: item.popularity ?? 0,
        });
    }

    return candidates;
}

function getSpotifyCredentials() {
    const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
}

function resolveMinScore(explicitMinScore?: number): number {
    if (typeof explicitMinScore === "number" && Number.isFinite(explicitMinScore)) {
        return Math.min(1, Math.max(0, explicitMinScore));
    }

    const envMinScore = Number.parseFloat(process.env.SPOTIFY_AUTO_MIN_SCORE || "");
    if (Number.isFinite(envMinScore)) {
        return Math.min(1, Math.max(0, envMinScore));
    }

    return 0.84;
}

function resolveArtistName(artistName?: string): string | undefined {
    const explicit = artistName?.trim();
    if (explicit) return explicit;
    const envArtist = process.env.SPOTIFY_ARTIST_NAME?.trim();
    return envArtist || undefined;
}

function resolveMarket(market?: string): string {
    const explicit = market?.trim().toUpperCase();
    if (explicit) return explicit;
    const envMarket = process.env.SPOTIFY_MARKET?.trim().toUpperCase();
    return envMarket || "BR";
}

async function fetchSpotifyAccessToken(): Promise<string> {
    const credentials = getSpotifyCredentials();
    if (!credentials) {
        throw new Error("Spotify credentials are not configured");
    }

    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
        return cachedAccessToken.value;
    }

    const authHeader = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
        cache: "no-store",
    });

    const body = await response.text();
    let payload: SpotifyTokenResponse = {};
    try {
        payload = JSON.parse(body) as SpotifyTokenResponse;
    } catch {
        payload = {};
    }

    if (!response.ok || !payload.access_token) {
        throw new Error(
            `Spotify token request failed (${response.status}): ${body.slice(0, 300)}`
        );
    }

    const expiresInSeconds = payload.expires_in && payload.expires_in > 0 ? payload.expires_in : 3600;
    const expiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
    cachedAccessToken = {
        value: payload.access_token,
        expiresAt,
    };

    return payload.access_token;
}

async function searchSpotifyTracks(params: {
    query: string;
    market: string;
    limit: number;
}): Promise<SearchTrackCandidate[]> {
    const url = new URL(SPOTIFY_SEARCH_ENDPOINT);
    url.searchParams.set("q", params.query);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", String(params.limit));
    if (params.market) {
        url.searchParams.set("market", params.market);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= SPOTIFY_SEARCH_MAX_RETRIES; attempt += 1) {
        const accessToken = await fetchSpotifyAccessToken();
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
        });

        const body = await response.text();
        let payload: SpotifySearchResponse = {};
        try {
            payload = JSON.parse(body) as SpotifySearchResponse;
        } catch {
            payload = {};
        }

        if (response.ok) {
            return parseSearchCandidates(payload);
        }

        const bodyPreview = body.slice(0, 300);
        const retryAfterMs = parseRetryAfterMs(response);
        const nextAttempt = attempt + 1;
        const hasNextAttempt = attempt < SPOTIFY_SEARCH_MAX_RETRIES;

        if (response.status === 401 && hasNextAttempt) {
            cachedAccessToken = null;
            await sleep(computeRetryDelayMs(nextAttempt));
            continue;
        }

        if ((response.status === 429 || response.status >= 500) && hasNextAttempt) {
            await sleep(computeRetryDelayMs(nextAttempt, retryAfterMs));
            continue;
        }

        if (response.status === 429) {
            throw new SpotifyRateLimitError(
                `Spotify search failed (${response.status}): ${bodyPreview}`,
                response.status,
                retryAfterMs
            );
        }

        lastError = new Error(`Spotify search failed (${response.status}): ${bodyPreview}`);
        break;
    }

    if (lastError) {
        throw lastError;
    }

    throw new Error("Spotify search failed: exhausted retries");
}

export function isSpotifyApiConfigured(): boolean {
    return Boolean(getSpotifyCredentials());
}

export function isSpotifyRateLimitError(error: unknown): error is SpotifyRateLimitError {
    return error instanceof SpotifyRateLimitError;
}

export async function findBestSpotifyTrackMatch(input: {
    songName: string;
    artistName?: string;
    market?: string;
    minScore?: number;
    limit?: number;
}): Promise<SpotifyTrackMatch | null> {
    if (!isSpotifyApiConfigured()) return null;

    const songName = input.songName.trim();
    if (!songName) return null;

    const artistName = resolveArtistName(input.artistName);
    const market = resolveMarket(input.market);
    const minScore = resolveMinScore(input.minScore);
    const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(25, Math.floor(input.limit!))) : 10;
    const cleanedSongName = stripSongTitleNoise(songName);

    const queries: string[] = [];
    if (artistName) {
        queries.push(`track:"${cleanedSongName}" artist:"${artistName}"`);
    }
    queries.push(`track:"${cleanedSongName}"`);
    if (cleanedSongName !== songName) {
        queries.push(`track:"${songName}"`);
    }

    const bestByTrackId = new Map<string, SpotifyTrackMatch>();

    for (const query of queries) {
        const candidates = await searchSpotifyTracks({ query, market, limit });
        for (const candidate of candidates) {
            if (artistName) {
                const hasStrictArtistMatch = candidate.artistNames.some((candidateArtistName) =>
                    artistNameMatchesStrict(artistName, candidateArtistName)
                );
                if (!hasStrictArtistMatch) {
                    continue;
                }
            }

            const score = scoreTrackCandidate(candidate, songName, artistName);
            const currentBest = bestByTrackId.get(candidate.trackId);
            if (currentBest && currentBest.score >= score) continue;

            bestByTrackId.set(candidate.trackId, {
                spotifyUrl: candidate.spotifyUrl,
                trackId: candidate.trackId,
                trackName: candidate.trackName,
                artistNames: candidate.artistNames,
                score,
            });
        }
    }

    if (bestByTrackId.size === 0) return null;

    const sorted = [...bestByTrackId.values()].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    if (!best || best.score < minScore) return null;

    return best;
}
