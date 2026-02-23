"use client";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "~/components/ui/accordion";
import { useTranslations } from "~/i18n/provider";
import { MessagesSquare } from "lucide-react";

function parseMarkdown(text: string) {
    // First split by bold (**text**), then handle italic (*text*) in remaining parts
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return part;
    });
}

export function FAQSection() {
    const t = useTranslations("home.faq");
    const faqs = t.raw("items") as Array<{ question: string; answer: string }>;
    const contactType = t("contactType");

    const renderContactLink = () => {
        if (contactType === "whatsapp") {
            const whatsapp = t("whatsapp").replace(/\D/g, "");
            const message = encodeURIComponent(t("whatsappMessage"));
            const whatsappUrl = `https://wa.me/${whatsapp}?text=${message}`;
            return (
                <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 bg-white border border-dark/10 text-dark font-medium px-8 py-4 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group mt-4 w-full sm:w-auto"
                >
                    <MessagesSquare className="w-5 h-5 text-aegean group-hover:scale-110 transition-transform" />
                    {t("whatsappLabel")}
                </a>
            );
        }
        const email = t("email");
        return (
            <a href={`mailto:${email}`} className="text-aegean font-bold font-serif italic text-lg hover:text-dark transition-colors mt-4 inline-block">
                {email}
            </a>
        );
    };

    const schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map((faq) => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer,
            },
        })),
    };

    return (
        <section id="faq" className="py-24 md:py-32 bg-cream">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
            />
            <div className="container mx-auto px-6 max-w-4xl">
                <div className="text-center mb-16 md:mb-24">
                    <span className="text-aegean/80 uppercase tracking-[0.3em] text-xs font-bold font-serif mb-4 block">
                        FAQ
                    </span>
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-dark tracking-tight">
                        {t("title")}
                    </h2>
                </div>

                <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl shadow-dark/5 border border-dark/5">
                    <Accordion type="single" collapsible className="w-full">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`} className="border-dark/10 py-2">
                                <AccordionTrigger className="text-left text-xl md:text-2xl font-serif font-bold text-dark hover:text-aegean transition-colors duration-300 leading-snug">
                                    {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-base md:text-lg text-dark/60 leading-relaxed pt-2 pb-6">
                                    {parseMarkdown(faq.answer)}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>

                <div className="mt-16 text-center">
                    <p className="text-dark/50 font-serif italic mb-2 text-lg">{t("moreQuestions")}</p>
                    {renderContactLink()}
                </div>
            </div>
        </section>
    );
}
