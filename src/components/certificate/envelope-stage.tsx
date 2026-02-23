"use client";

import { Gift } from "lucide-react";
import { Button } from "~/components/ui/button";
import Link from "next/link";

interface EnvelopeStageProps {
    locale: string;
    logoText: string;
    teaser: string;
    openButtonText: string;
    onOpen: () => void;
}

// Elegant envelope SVG component
function EnvelopeSVG() {
    return (
        <svg
            viewBox="0 0 120 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-48 h-36 md:w-64 md:h-48"
        >
            {/* Envelope body */}
            <rect
                x="5"
                y="20"
                width="110"
                height="65"
                rx="4"
                fill="#0A0E1A"
                stroke="#C9A84C"
                strokeWidth="2"
            />

            {/* Envelope flap (open state) */}
            <path
                d="M5 24 L60 55 L115 24"
                fill="none"
                stroke="#C9A84C"
                strokeWidth="2"
                strokeLinecap="round"
            />

            {/* Inner shadow line */}
            <path
                d="M10 30 L60 58 L110 30"
                fill="none"
                stroke="#E8DDD3"
                strokeWidth="1"
                strokeLinecap="round"
            />

            {/* Decorative seal */}
            <circle
                cx="60"
                cy="55"
                r="12"
                fill="#C9A84C"
                className="animate-pulse-glow"
            />

            {/* Music note on seal */}
            <path
                d="M57 51 L57 59 M57 51 C57 49 61 49 61 51 L61 55"
                stroke="#0A0E1A"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
            />
            <circle cx="55" cy="59" r="2" fill="#0A0E1A" />
            <circle cx="59" cy="55" r="2" fill="#0A0E1A" />

            {/* Sparkles */}
            <circle cx="25" cy="15" r="1.5" fill="#C9A84C" opacity="0.6" className="animate-pulse" />
            <circle cx="95" cy="12" r="1" fill="#C9A84C" opacity="0.4" className="animate-pulse" />
            <circle cx="15" cy="70" r="1" fill="#C9A84C" opacity="0.5" className="animate-pulse" />
            <circle cx="105" cy="75" r="1.5" fill="#C9A84C" opacity="0.6" className="animate-pulse" />
        </svg>
    );
}

export function EnvelopeStage({
    locale,
    logoText,
    teaser,
    openButtonText,
    onOpen,
}: EnvelopeStageProps) {
    return (
        <div className="min-h-screen bg-[#0A0E1A] flex flex-col">
            {/* Header with Logo */}
            <header className="py-6 border-b border-[#E8DDD3]">
                <div className="max-w-2xl mx-auto px-4 text-center">
                    <Link href={`/${locale}`}>
                        <span className="font-serif text-2xl text-[#F0EDE6] tracking-tight">
                            {logoText}
                        </span>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                {/* Floating Envelope */}
                <div className="animate-float mb-8">
                    <EnvelopeSVG />
                </div>

                {/* Teaser Text */}
                <p className="text-[#44403C] text-lg md:text-xl text-center mb-8 max-w-md font-light">
                    {teaser}
                </p>

                {/* Open Button */}
                <Button
                    onClick={onOpen}
                    size="lg"
                    className="bg-[#C9A84C] hover:bg-[#A89240] text-white px-10 py-6 text-lg rounded-full shadow-lg hover:shadow-xl transition-all duration-300 animate-pulse-glow"
                >
                    <Gift className="w-5 h-5 mr-2" />
                    {openButtonText}
                </Button>
            </div>

            {/* Subtle footer */}
            <div className="py-4 text-center">
                <a
                    href={`https://apollosong.com${locale === "pt" ? "/pt" : ""}`}
                    className="text-[#C9A84C]/40 text-xs hover:text-[#C9A84C]/60"
                >
                    {locale === "pt" ? "apollosong.com/pt" : "apollosong.com"}
                </a>
            </div>
        </div>
    );
}
