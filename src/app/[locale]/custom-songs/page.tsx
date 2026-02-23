import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { Music, Star, Heart, Shield } from "lucide-react";
import Image from "next/image";
import { localizePath } from "~/i18n/routing";
import { defaultLocale, isLocale } from "~/i18n/config";
import { loadMessages } from "~/i18n/messages";
import { createTranslator } from "~/i18n/server";
import { buildAlternates } from "~/i18n/metadata";

export async function generateMetadata({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const messages = await loadMessages(locale, ["customSongs.seo"]);
    const t = createTranslator(messages, "customSongs.seo");
    const alternates = buildAlternates("/custom-songs", locale);
    const titleValue = t.raw("title");
    const descriptionValue = t.raw("description");
    const title =
        typeof titleValue === "string"
            ? titleValue
            : "The Ultimate Guide to Custom Personalized Songs | ApolloSong";
    const description =
        typeof descriptionValue === "string"
            ? descriptionValue
            : "Everything you need to know about personalized custom songs. How they work, why they are the perfect gift, and how to create one.";

    return {
        title,
        description,
        alternates,
        openGraph: {
            title,
            description,
            url: alternates.canonical,
            siteName: "ApolloSong",
            locale,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
        },
    };
}

export default async function PillarPage({
    params: paramsPromise,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: localeParam } = await paramsPromise;
    const locale = isLocale(localeParam) ? localeParam : defaultLocale;
    const withLocale = (href: string) => localizePath(href, locale);

    return (
        <main className="min-h-screen bg-cream">
            <SiteHeader />

            {/* Hero Section */}
            <section className="relative py-24 md:py-32 overflow-hidden bg-navy text-white">
                <div className="absolute inset-0 z-0">
                    <Image
                        src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2940&auto=format&fit=crop"
                        alt="Musician writing a song"
                        fill
                        className="object-cover opacity-20"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-navy" />
                </div>

                <div className="container relative z-10 mx-auto px-4 text-center">
                    <span className="inline-block py-1 px-4 rounded-full bg-white/10 text-aegean text-sm font-bold tracking-widest uppercase mb-6 border border-white/20 backdrop-blur-sm">
                        The Ultimate Guide
                    </span>
                    <h1 className="text-5xl md:text-7xl font-serif font-bold mb-8 leading-tight">
                        Custom <span className="text-aegean italic">Personalized Songs</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white/80 max-w-3xl mx-auto mb-10 font-light">
                        How to turn your story, memories, and emotions into a studio-quality song that lasts forever.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button
                            size="lg"
                            className="bg-aegean hover:bg-[#3A7E8A] text-white rounded-full px-10 py-8 text-xl font-semibold shadow-2xl shadow-aegean/40"
                            asChild
                        >
                            <Link href={withLocale("/#pricing")}>Create Your Song Now</Link>
                        </Button>
                    </div>
                </div>
            </section>

            {/* Table of Contents / Navigation */}
            <nav className="sticky top-20 z-40 bg-porcelain/95 backdrop-blur border-b border-[#4A8E9A]/20 py-4 shadow-sm hidden md:block">
                <div className="container mx-auto px-4 flex justify-center gap-8 text-sm font-bold tracking-wide uppercase text-[#1A1A2E]/50">
                    <Link href="#what-is-it" className="hover:text-aegean transition-colors">What Is It?</Link>
                    <Link href="#why-it-works" className="hover:text-aegean transition-colors">Why It Works</Link>
                    <Link href="#occasions" className="hover:text-aegean transition-colors">Occasions</Link>
                    <Link href="#process" className="hover:text-aegean transition-colors">The Process</Link>
                </div>
            </nav>

            <div className="container mx-auto px-4 max-w-4xl py-16 space-y-24">

                {/* Section 1: Definition */}
                <section id="what-is-it" className="scroll-mt-32">
                    <h2 className="text-4xl font-serif font-bold text-navy mb-6">What is a Personalized Song?</h2>
                    <p className="text-lg text-[#1A1A2E]/70 leading-relaxed mb-6">
                        A personalized song is more than just a custom track. It is a lasting keepsake. Unlike generic songs written for the masses, an ApolloSong is composed strictly for <strong>one person</strong> (or couple), weaving their specific life details into a melody.
                    </p>
                    <p className="text-lg text-[#1A1A2E]/70 leading-relaxed mb-6">
                        Imagine a professionally produced song that sounds like it belongs on the radio, but when you listen closely, the lyrics mention <em>your</em> anniversary, <em>your</em> favorite moments, and the specific details that make <em>your</em> story unique.
                    </p>
                    <div className="bg-aegean/10 border-l-4 border-aegean p-8 rounded-r-xl my-8">
                        <h4 className="text-aegean font-bold uppercase tracking-wide text-sm mb-2">Key Distinction</h4>
                        <p className="text-navy font-serif text-xl italic">
                            "It's not just music. It's your story, set to a melody."
                        </p>
                    </div>
                </section>

                {/* Section 2: Why It Works */}
                <section id="why-it-works" className="scroll-mt-32">
                    <h2 className="text-4xl font-serif font-bold text-navy mb-8">Why It Moves People to Tears</h2>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="bg-white p-8 rounded-2xl shadow-lg border border-[#4A8E9A]/10">
                            <div className="w-12 h-12 bg-navy rounded-full flex items-center justify-center mb-6">
                                <Heart className="text-white w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold text-navy mb-4">It Bypasses the Intellect</h3>
                            <p className="text-[#1A1A2E]/60">
                                Words alone can be analyzed or doubted. Music goes straight to the emotion. When someone hears their own story sung back to them, defenses crumble and hearts open.
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-2xl shadow-lg border border-[#4A8E9A]/10">
                            <div className="w-12 h-12 bg-navy rounded-full flex items-center justify-center mb-6">
                                <Star className="text-white w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold text-navy mb-4">It Validates Their Journey</h3>
                            <p className="text-[#1A1A2E]/60">
                                Hearing their struggles and victories in a song says: "Your life matters. I see you." It is the ultimate form of validation.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 3: Occasions Link Grid (Connecting to Clusters) */}
                <section id="occasions" className="scroll-mt-32">
                    <h2 className="text-4xl font-serif font-bold text-navy mb-4">The Perfect Occasions</h2>
                    <p className="text-lg text-[#1A1A2E]/60 mb-12">
                        While you never need a reason to bless someone, these life events are transformed by a custom song.
                    </p>

                    <div className="grid md:grid-cols-2 gap-6">
                        <Link href={withLocale("/create")} className="group block relative h-64 rounded-xl overflow-hidden shadow-md">
                            <Image
                                src="https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?q=80&w=2940&auto=format&fit=crop"
                                alt="Wedding"
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
                            <div className="absolute bottom-0 p-8 text-white">
                                <h3 className="text-2xl font-serif font-bold mb-2">Weddings & Vows</h3>
                                <div className="flex items-center text-sm font-medium text-aegean opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all">
                                    Create Your Song <Music className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </Link>

                        <Link href={withLocale("/create")} className="group block relative h-64 rounded-xl overflow-hidden shadow-md">
                            <Image
                                src="https://images.unsplash.com/photo-1499645902095-23eb29e38318?q=80&w=2938&auto=format&fit=crop"
                                alt="Memorial"
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
                            <div className="absolute bottom-0 p-8 text-white">
                                <h3 className="text-2xl font-serif font-bold mb-2">Memorials & Funerals</h3>
                                <div className="flex items-center text-sm font-medium text-aegean opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all">
                                    Create Your Song <Music className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </Link>

                        <Link href={withLocale("/create")} className="group block relative h-64 rounded-xl overflow-hidden shadow-md">
                            <Image
                                src="https://images.unsplash.com/photo-1522858547137-f1dcec554f55?q=80&w=2940&auto=format&fit=crop"
                                alt="Anniversary"
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
                            <div className="absolute bottom-0 p-8 text-white">
                                <h3 className="text-2xl font-serif font-bold mb-2">Anniversaries</h3>
                                <div className="flex items-center text-sm font-medium text-aegean opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all">
                                    Create Your Song <Music className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </Link>
                        <Link href={withLocale("/create")} className="group block relative h-64 rounded-xl overflow-hidden shadow-md">
                            <Image
                                src="https://images.unsplash.com/photo-1445445290350-12a3b8636b5e?q=80&w=2765&auto=format&fit=crop"
                                alt="Prayer"
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
                            <div className="absolute bottom-0 p-8 text-white">
                                <h3 className="text-2xl font-serif font-bold mb-2">Strength & Healing</h3>
                                <div className="flex items-center text-sm font-medium text-aegean opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all">
                                    Create Your Song <Music className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </Link>
                    </div>
                </section>

                {/* Section 4: The Process */}
                <section id="process" className="scroll-mt-32">
                    <h2 className="text-4xl font-serif font-bold text-navy mb-8">How We Create Your Masterpiece</h2>
                    <div className="space-y-8">
                        <div className="flex gap-6">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-aegean text-white flex items-center justify-center font-bold text-xl">1</div>
                            <div>
                                <h3 className="text-xl font-bold text-navy mb-2">You Share the Story</h3>
                                <p className="text-[#1A1A2E]/60 leading-relaxed">You tell us who the song is for, the genre they love, and the key memories or quotes you want included. It takes 5 minutes.</p>
                            </div>
                        </div>
                        <div className="flex gap-6">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-aegean text-white flex items-center justify-center font-bold text-xl">2</div>
                            <div>
                                <h3 className="text-xl font-bold text-navy mb-2">Our Artists Compose</h3>
                                <p className="text-[#1A1A2E]/60 leading-relaxed">Our team—made up of professional songwriters and studio engineers—crafts the lyrics and melody. We focus on emotional depth and musical excellence.</p>
                            </div>
                        </div>
                        <div className="flex gap-6">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-aegean text-white flex items-center justify-center font-bold text-xl">3</div>
                            <div>
                                <h3 className="text-xl font-bold text-navy mb-2">Delivery in 7 Days</h3>
                                <p className="text-[#1A1A2E]/60 leading-relaxed">You receive a studio-quality audio file, ready to be played at your event or gifted privately.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <div className="mt-16 text-center bg-cream-dark p-12 rounded-3xl border border-aegean/20">
                    <h2 className="text-4xl font-serif font-bold text-navy mb-6">Start Your Story Today</h2>
                    <p className="text-lg text-[#1A1A2E]/60 mb-8 max-w-2xl mx-auto">
                        Don't settle for a generic gift. Give them a song that will echo in their heart for eternity.
                    </p>
                    <Button
                        size="lg"
                        className="bg-navy hover:bg-navy/90 text-white rounded-full px-12 py-8 text-xl font-semibold shadow-xl"
                        asChild
                    >
                        <Link href={withLocale("/#pricing")}>Create My Custom Song</Link>
                    </Button>
                    <p className="mt-6 text-sm text-[#1A1A2E]/50 flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" /> 100% Satisfaction Guarantee
                    </p>
                </div>

            </div>

            <SiteFooter />
        </main>
    );
}
