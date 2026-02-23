/**
 * Suno AI service types
 */

export interface SunoCookie {
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
}

export interface SunoCookiesFile {
    cookies: SunoCookie[];
}

export interface SunoGenerationParams {
    orderId: string;
    lyrics: string;
    genre: string; // Internal genre key (e.g., "pop", "sertanejo")
    locale: string; // Locale for language context (e.g., "pt", "en", "es")
    vocals: "male" | "female" | "either";
    recipientName: string;
    existingTaskId?: string;
    onTaskCreated?: (taskId: string) => Promise<void> | void;
}

export interface SunoGeneratedSong {
    title: string;
    durationSeconds: number;
    mp3Buffer: Buffer;
    kieAudioId?: string;
}

export interface SunoGenerationResult {
    success: boolean;
    songs: SunoGeneratedSong[];
    creditsRemaining?: number;
    error?: string;
    kieTaskId?: string;
}

export interface SunoCreditsInfo {
    remaining: number;
    total: number;
}

export interface SunoJobData {
    orderId: string;
    lyrics: string;
    genre: string;
    locale: string;
    vocals: "male" | "female" | "either";
    recipientName: string;
    generationSignature?: string;
    kieTaskId?: string;
    attempt?: number;
}

export interface SunoJobResult {
    success: boolean;
    songUrl1?: string;
    songUrl2?: string;
    creditsRemaining?: number;
    error?: string;
}
