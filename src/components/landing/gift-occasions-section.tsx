"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Gift } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "~/i18n/provider";
import { Link } from "~/i18n/navigation";
import { GreekCTA } from "~/components/ui/greek-cta";

type OccasionItem = {
    id: string;
    image: string;
};

const occasions: OccasionItem[] = [
    { id: "partner", image: "/images/occasions/partner.webp" },
    { id: "children", image: "/images/occasions/children.webp" },
    { id: "proposal", image: "/images/occasions/proposal.webp" },
    { id: "wedding", image: "/images/occasions/wedding.webp" },
    { id: "birthday", image: "/images/occasions/birthday.webp" },
    { id: "parents", image: "/images/occasions/parents.webp" },
    { id: "grandparents", image: "/images/occasions/grandparents.webp" },
    { id: "friends", image: "/images/occasions/friends.webp" },
    { id: "yourself", image: "/images/occasions/yourself.webp" },
    { id: "baptism", image: "/images/occasions/baptism.webp" },
    { id: "genderReveal", image: "/images/occasions/gender-reveal.webp" },
    { id: "graduation", image: "/images/occasions/graduation.webp" },
    { id: "anniversary", image: "/images/occasions/anniversary.webp" },
    { id: "loss", image: "/images/occasions/loss.webp" },
    { id: "strength", image: "/images/occasions/strength.webp" },
    { id: "healing", image: "/images/occasions/healing.webp" },
    { id: "prayers", image: "/images/occasions/prayers.webp" },
    { id: "breakthroughs", image: "/images/occasions/breakthroughs.webp" },
];

function OccasionCard({
    item,
    label,
}: {
    item: OccasionItem;
    label: string;
}) {
    return (
        <div
            className="group relative flex-none w-[140px] md:w-[160px] lg:w-[180px] aspect-[3/4] rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing border border-aegean/10 shadow-lg shadow-dark/5 transition-all duration-500 hover:shadow-2xl hover:shadow-aegean/20 hover:border-aegean/40 hover:-translate-y-2"
        >
            <Image
                src={item.image}
                alt={label}
                fill
                sizes="(min-width: 1024px) 180px, (min-width: 768px) 160px, 140px"
                className="object-cover opacity-90 transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-dark/90 via-dark/40 to-transparent transition-opacity duration-500 group-hover:opacity-90" />
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 px-3">
                <h3 className="text-sm md:text-base font-serif font-bold text-white tracking-wide text-center leading-tight drop-shadow-md group-hover:text-aegean-light transition-colors duration-300">
                    {label}
                </h3>
                <div className="w-8 h-0.5 bg-aegean mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0" />
            </div>
        </div>
    );
}

export function GiftOccasionsSection() {
    const t = useTranslations("home.giftOccasions");
    const containerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [dragRight, setDragRight] = useState(0);

    useEffect(() => {
        function measure() {
            if (!containerRef.current || !innerRef.current) return;
            const containerW = containerRef.current.offsetWidth;
            const innerW = innerRef.current.scrollWidth;
            setDragRight(Math.min(0, containerW - innerW));
        }
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    return (
        <section className="py-24 md:py-32 bg-porcelain text-dark relative overflow-hidden">
            {/* Background Texture */}
            <div className="absolute inset-0 bg-[url('/images/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
            <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-aegean/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="container mx-auto px-6 max-w-7xl relative z-10">
                <div className="text-center mb-16 md:mb-20">
                    <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6 text-dark tracking-tight">
                        {t("title")}
                    </h2>
                    <div className="w-24 h-1 bg-gradient-to-r from-aegean to-aegean mx-auto rounded-full" />
                </div>
            </div>

            {/* Swipe hint */}
            <p className="text-center text-xs tracking-[0.2em] font-bold uppercase text-dark/40 mb-8 flex items-center justify-center gap-2">
                <span className="w-8 h-[1px] bg-dark/20" />
                {t("swipeHint")}
                <span className="w-8 h-[1px] bg-dark/20" />
            </p>

            {/* Swipeable carousel */}
            <div ref={containerRef} className="overflow-hidden px-4 md:px-8 mb-12 md:mb-16">
                <motion.div
                    ref={innerRef}
                    className="flex gap-3 md:gap-4 w-max"
                    drag="x"
                    dragConstraints={{ left: dragRight, right: 0 }}
                    dragElastic={0.08}
                    style={{ touchAction: "pan-y" }}
                >
                    {occasions.map((item) => (
                        <OccasionCard
                            key={item.id}
                            item={item}
                            label={t(`items.${item.id}`)}
                        />
                    ))}
                </motion.div>
            </div>

            <div className="flex justify-center px-6 mt-8 relative z-10">
                <Link href="/create">
                    <GreekCTA>
                        {t("cta")}
                    </GreekCTA>
                </Link>
            </div>
        </section>
    );
}
