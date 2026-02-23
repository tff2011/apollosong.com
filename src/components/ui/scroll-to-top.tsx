
"use client";

import { ChevronsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "./button";

export function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false);
    const pathname = usePathname();

    // Hide on certain pages
    const isCreatePage = pathname?.includes("/create");
    const isTrackOrderPage = pathname?.includes("/track-order");
    const isAdminPage = pathname?.includes("/admin");
    const isSuccessPage = pathname?.includes("/success");
    const isRevisionPage = pathname?.includes("/revision");

    useEffect(() => {
        const toggleVisibility = () => {
            if (window.scrollY > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        window.addEventListener("scroll", toggleVisibility);

        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const isAdvertorial = pathname?.includes("/noticia/homenagem-emocionante");

    if (!isVisible || isCreatePage || isAdvertorial || isTrackOrderPage || isAdminPage || isSuccessPage || isRevisionPage) {
        return null;
    }

    return (
        <Button
            size="icon"
            className="fixed bottom-8 right-8 z-50 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
            onClick={scrollToTop}
        >
            <ChevronsUp className="h-6 w-6" />
        </Button>
    );
}
