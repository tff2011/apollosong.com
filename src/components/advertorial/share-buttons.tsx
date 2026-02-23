"use client";

import { Facebook, Twitter, Share2 } from "lucide-react";
import { useState, useEffect } from "react";

export function ShareButtons() {
    const [shareUrl, setShareUrl] = useState("");

    useEffect(() => {
        setShareUrl(window.location.href);
    }, []);

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Homenagem Emocionante',
                    text: 'Impossível não se emocionar: A homenagem criativa de neto que quebrou a internet hoje.',
                    url: shareUrl,
                });
            } catch (error) {
                console.log('Error sharing:', error);
            }
        } else {
            alert("Copie o link desta página para compartilhar!");
        }
    };

    if (!shareUrl) return null; // Prevent hydration mismatch or layout shift, or just render empty div

    return (
        <div className="flex gap-2 mb-8">
            <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#3b5998] text-white p-2 rounded-full hover:bg-[#2d4373] transition-colors"
                aria-label="Compartilhar no Facebook"
            >
                <Facebook size={20} />
            </a>
            <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent("Impossível não se emocionar: A homenagem criativa de neto que quebrou a internet hoje.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#1da1f2] text-white p-2 rounded-full hover:bg-[#1a91da] transition-colors"
                aria-label="Compartilhar no Twitter"
            >
                <Twitter size={20} />
            </a>
            <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Impossível não se emocionar: A homenagem criativa de neto que quebrou a internet hoje. ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25d366] text-white p-2 rounded-full hover:bg-[#20bd5a] transition-colors"
                aria-label="Compartilhar no WhatsApp"
            >
                <Share2 size={20} />
            </a>
            <button
                onClick={handleShare}
                className="bg-white text-[#555] p-2 rounded-full hover:bg-gray-300 transition-colors"
                aria-label="Compartilhar"
            >
                <Share2 size={20} />
            </button>
        </div>
    );
}
