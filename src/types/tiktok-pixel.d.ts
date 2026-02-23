declare global {
    interface Window {
        ttq?: {
            page: (...args: unknown[]) => void;
            track: (
                event: string,
                properties?: Record<string, unknown>,
                options?: { event_id?: string }
            ) => void;
        };
    }
}

export {};
