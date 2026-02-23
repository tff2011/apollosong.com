import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";

export async function POST(request: NextRequest) {
    console.log("[GrammarFix API] Request received");
    try {
        const { text, locale } = await request.json() as { text: string; locale: string };
        console.log("[GrammarFix API] Text length:", text?.length, "Locale:", locale);

        if (!text || text.trim().length < 5) {
            console.log("[GrammarFix API] Text too short, returning as-is");
            return NextResponse.json({ correctedText: text });
        }

        if (!OPENROUTER_API_KEY) {
            console.error("[GrammarFix API] OPENROUTER_API_KEY not configured");
            return NextResponse.json({ error: "API not configured" }, { status: 500 });
        }

        const languageMap: Record<string, string> = {
            pt: "Português Brasileiro",
            en: "English",
            es: "Español",
            fr: "Français",
            it: "Italiano",
        };

        const language = languageMap[locale] || "Português Brasileiro";

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://apollosong.com",
                "X-Title": "ApolloSong Grammar Fix",
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [
                    {
                        role: "system",
                        content: `Você é um corretor gramatical. Sua ÚNICA tarefa é corrigir erros de gramática, ortografia e pontuação.

REGRAS IMPORTANTES:
- Corrija APENAS erros gramaticais, ortográficos e de pontuação
- NÃO mude o significado, estilo ou tom do texto
- NÃO adicione ou remova informações
- NÃO reformule frases (a menos que estejam gramaticalmente incorretas)
- Mantenha gírias, expressões informais e o jeito de escrever da pessoa
- Se o texto já estiver correto, retorne exatamente igual
- Retorne APENAS o texto corrigido, sem explicações

Idioma do texto: ${language}`,
                    },
                    {
                        role: "user",
                        content: text,
                    },
                ],
                temperature: 0.1,
                max_tokens: 2000,
            }),
        });

        console.log("[GrammarFix API] OpenRouter response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[GrammarFix API] OpenRouter error:", response.status, errorText);
            return NextResponse.json({ error: "Failed to correct grammar" }, { status: 500 });
        }

        const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };

        const correctedText = data.choices?.[0]?.message?.content?.trim();
        console.log("[GrammarFix API] Corrected text received, length:", correctedText?.length);

        if (!correctedText) {
            console.log("[GrammarFix API] No corrected text, returning original");
            return NextResponse.json({ correctedText: text });
        }

        console.log("[GrammarFix API] Success, returning corrected text");
        return NextResponse.json({ correctedText });
    } catch (error) {
        console.error("[GrammarFix API] Catch error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
