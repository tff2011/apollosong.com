"use client";

import { motion, AnimatePresence } from "framer-motion";
import { SiteHeader } from "~/components/landing/site-header";
import { SiteFooter } from "~/components/landing/site-footer";
import { useLocale, useTranslations } from "~/i18n/provider";
import { useTrackOrder } from "./hooks/use-track-order";
import { getRecipientDisplayName, getGenreDisplayName, DATE_LOCALES } from "./utils/order-helpers";
import type { OrderStatus } from "./utils/order-helpers";
import { format } from "date-fns";
import {
    TrackOrderSearch,
    OrderCard,
    OrderCarousel,
    RevisionModal,
    NotFoundState,
    LoadingSkeleton,
    NeedHelpSection,
    GuaranteeBanner,
    CreateAnotherCta,
    CreateNewSongCta,
    BottomTabBar,
    TabContentOrders,
    TabContentListen,
    TabContentExtras,
    TabContentHelp,
    OrdersSidebar,
} from "./components";
import type { TrackOrderChild } from "./hooks/use-track-order";

export function TrackOrderPageClient() {
    const t = useTranslations("track-order");
    const locale = useLocale();

    const {
        email,
        setEmail,
        searchedEmail,
        searchMode,
        setSearchMode,
        ordersList,
        currentOrderIndex,
        setCurrentOrderIndex,
        revisionModalOrderId,
        setRevisionModalOrderId,
        isLoading,
        isFetching,
        hasSearched,
        showNotFound,
        showResults,
        handleSubmit,
        handleReset,
        refetch,
        activeTab,
        setActiveTab,
        currentOrder,
    } = useTrackOrder();

    // Get all translations
    const form = t.raw("form") as {
        placeholder: string;
        phonePlaceholder: string;
        submit: string;
        searching: string;
        searchByEmail: string;
        searchByPhone: string;
        searchHint: string;
    };

    const guarantee = t.raw("guarantee") as {
        title: string;
        description: string;
    };

    const notFound = t.raw("notFound") as {
        icon: string;
        title: string;
        paragraph1: string;
        paragraph2: string;
        paragraph3: string;
        helpList: string[];
        supportNote: string;
        contactSupport: string;
        createSong: string;
    };

    const results = t.raw("results") as {
        title: string;
        titleWithCount: string;
        nowViewing: string;
        ofTotal: string;
        labelMainOrder: string;
        labelGenreExtra: string;
        orderFor: string;
        ordered: string;
        pricePaid: string;
        deliveryEstimate: {
            label: string;
            planExpress: string;
            planStandard: string;
            ready: string;
            pending: string;
        };
        status: Record<OrderStatus, string>;
        statusShort?: Partial<Record<OrderStatus, string>>;
        pendingPayment: { title: string; description: string; cta: string };
        editOrder: { title: string; description: string; cta: string };
        reviewInfo: {
            title: string;
            description: string;
            cta: string;
            hide: string;
            recipient: string;
            genre: string;
            vocals: string;
            vocalsFemale: string;
            vocalsMale: string;
            vocalsEither: string;
            qualities: string;
            memories: string;
            message: string;
            noQualities: string;
            noMemories: string;
            noMessage: string;
            edit: string;
            save: string;
            saving: string;
            cancel: string;
            saved: string;
            qualitiesPlaceholder: string;
            memoriesPlaceholder: string;
            messagePlaceholder: string;
        };
        fastDelivery: string;
        extraSong: string;
        extraSongFor: string;
        songReady: string;
        songsReady: string;
        listenNow: string;
        chooseFavorite: string;
        option1: string;
        option2: string;
        genreVariant: string;
        genreVariantFor: string;
        shareSongMessage: string;
        shareButton: string;
        downloadButton: string;
        revisionButton?: string;
        streamingButton?: string;
        orderBumps: {
            title: string;
            certificate: string;
            chooseOption: string;
            certificateDesc: string;
            openCertificate: string;
            copyLink: string;
            copiedLink: string;
            shareWhatsApp: string;
            whatsAppMessage: string;
            lyrics: string;
            lyricsDesc: string;
            downloadLyrics: string;
            streamingVip: string;
            streamingVipDesc: string;
            streamingVipListen: string;
            streamingVipListenFallback: string;
            streamingShare: string;
            streamingShareSuccess: string;
            pendingDesc: string;
            pending: string;
            songNameLabel: string;
            songNamePlaceholder: string;
            songNameSave: string;
            songNameSaving: string;
            songNameSaved: string;
            songNameError: string;
            karaoke: string;
            karaokeProcessing: string;
            karaokeReady: string;
            downloadKaraoke: string;
        };
    };

    const upsellSection = t.raw("upsellSection") as {
        title: string;
        description: string;
    };

    const genreVariantUpsell = t.raw("genreVariantUpsell") as {
        title: string;
        description: string;
        selectStyles: string;
        perStyle: string;
        buyNow: string;
        adding: string;
        total: string;
        alreadyHave: string;
        currentGenre: string;
        selectVoice: string;
        voiceFemale: string;
        voiceMale: string;
        voiceEither: string;
    };

    const lyricsUpsell = t.raw("lyricsUpsell") as {
        title: string;
        description: string;
        price: string;
        buyNow: string;
        adding: string;
    };

    const streamingVipUpsell = t.raw("streamingVipUpsell") as {
        badge?: string;
        title: string;
        description: string;
        bullets: string[];
        buyNow: string;
        adding: string;
    };

    const karaokeUpsell = t.raw("karaokeUpsell") as {
        title: string;
        description: string;
        price: string;
        buyNow: string;
        adding: string;
    };

    const createAnotherUpsell = t.raw("createAnotherUpsell") as {
        title: string;
        description: string;
        cta: string;
    };

    const musicianTip = t.raw("musicianTip") as {
        title: string;
        subtitle: string;
        description: string;
        placeholder: string;
        minValue: string;
        maxValue: string;
        button: string;
        processing: string;
        optional: string;
        thankYou: string;
    };

    const needHelp = t.raw("needHelp") as {
        title: string;
        description: string;
        contactSupport: string;
        whatsAppMessage: string;
        followInstagram?: string;
        createNewSongTitle: string;
        createNewSongCta: string;
    };

    const revision = t.raw("revision") as {
        button: string;
        cardTitle: string;
        cardSubtitle: string;
        cardDescription: string;
        modalTitle: string;
        modalWarning: string;
        modalDescription: string;
        modalFee: string;
        modalCancel: string;
        modalConfirm: string;
        statusInRevision: string;
        statusDescription: string;
        queuePosition: string;
        queueProcessing: string;
        cancelButton: string;
        cancelConfirmTitle: string;
        cancelConfirmDescription: string;
        cancelConfirmButton: string;
        cancelling: string;
        cancelHelperText: string;
        finalVersionTitle: string;
        finalVersionDescription: string;
        addNotesButton: string;
        addNotesTitle: string;
        addNotesDescription: string;
        addNotesPlaceholder: string;
        addNotesSend: string;
        addNotesSending: string;
        existingNotesLabel: string;
        preferredVersionLabel: string;
        melodyPreferenceLabel: string;
        melodyKeepCurrent: string;
        melodySuggestNew: string;
    };

    // Tab bar translations
    const tabs = t.raw("tabs") as {
        orders: string;
        listen: string;
        extras: string;
        help: string;
        ordersTitle?: string;
        listenTitle?: string;
        extrasTitle?: string;
        helpTitle?: string;
    } | undefined;

    const tabTranslations = tabs || {
        orders: "Orders",
        listen: "Listen",
        extras: "Extras",
        help: "Help",
        ordersTitle: "Your Orders ({count})",
        listenTitle: "Listen to Your Song 🎧",
        extrasTitle: "Services & Extras ✨",
        helpTitle: "Need Help?",
    };

    // Get tab-specific title
    const getMobileTabTitle = () => {
        const recipientName = currentOrder
            ? getRecipientDisplayName(currentOrder.recipientName, currentOrder.recipient, locale)
            : "";

        switch (activeTab) {
            case "orders":
                return (tabTranslations.ordersTitle || "Your Orders ({count})").replace("{count}", String(ordersList.length));
            case "listen":
                return (tabTranslations.listenTitle || "Listen to {name}'s Song 🎧").replace("{name}", recipientName);
            case "extras":
                return tabTranslations.extrasTitle || "Services & Extras ✨";
            case "help":
                return tabTranslations.helpTitle || "Need Help?";
            default:
                return results.titleWithCount.replace("{count}", String(ordersList.length));
        }
    };

    // Sidebar translations
    const sidebar = t.raw("sidebar") as {
        title: string;
        selectOrder: string;
    } | undefined;

    const sidebarTranslations = sidebar || {
        title: "Your Orders",
        selectOrder: "Select an order",
    };

    // FAQ translations for help tab
    const faq = t.raw("faq") as {
        title: string;
        items: Array<{ question: string; answer: string }>;
    } | undefined;

    const faqTranslations = faq || {
        title: "FAQ",
        items: [],
    };

    // Timeline labels
    const timelineLabels = {
        pendingPayment: t("timeline.pendingPayment") || "Awaiting Payment",
        ordered: t("timeline.ordered") || "Ordered",
        processing: t("timeline.processing") || "Processing",
        ready: t("timeline.ready") || "Ready",
    };

    // Get the order for the revision modal
    const revisionModalOrder = revisionModalOrderId
        ? ordersList.find((o) => o.id === revisionModalOrderId) ?? null
        : null;

    // Check if current order has song
    const hasCompletedOrder = ordersList.some((o) => o.status === "COMPLETED" && (o.songFileUrl || o.songFileUrl2));

    // Check if there are available upsells
    const hasAvailableUpsells = currentOrder && currentOrder.status === "COMPLETED" && (() => {
        const hasLyricsUpsell = currentOrder.hasLyrics || currentOrder.childOrders?.some(
            (child: TrackOrderChild) => child.orderType === "LYRICS_UPSELL" && child.hasLyrics
        );
        const hasStreamingUpsell = currentOrder.childOrders?.some(
            (child: TrackOrderChild) => child.orderType === "STREAMING_UPSELL" && child.status !== "PENDING"
        );
        const canShowGenreVariant = currentOrder.orderType === "MAIN" || currentOrder.orderType === "EXTRA_SONG";
        return canShowGenreVariant || !hasLyricsUpsell || !hasStreamingUpsell;
    })();

    // Render tab content for mobile
    const renderMobileTabContent = () => {
        switch (activeTab) {
            case "orders":
                return (
                    <TabContentOrders
                        orders={ordersList}
                        currentIndex={currentOrderIndex}
                        onIndexChange={setCurrentOrderIndex}
                        locale={locale}
                        translations={{
                            orderFor: results.orderFor,
                            status: results.status,
                            statusShort: results.statusShort,
                        }}
                    />
                );
            case "listen":
                return (
                    <TabContentListen
                        order={currentOrder}
                        locale={locale}
                        email={searchedEmail || ""}
                        onRefetch={() => refetch()}
                        onRequestRevision={setRevisionModalOrderId}
                        translations={{
                            songReady: results.songReady,
                            songsReady: results.songsReady,
                            listenNow: results.listenNow,
                            chooseFavorite: results.chooseFavorite,
                            option1: results.option1,
                            option2: results.option2,
                            shareSongMessage: results.shareSongMessage,
                            shareButton: results.shareButton,
                            downloadButton: results.downloadButton,
                            orderFor: results.orderFor,
                            noSongYet: t("listen.noSongYet") || "No song yet",
                            noSongDescription: t("listen.noSongDescription") || "Your song is being created",
                            genreVariant: results.genreVariant,
                            status: results.status,
                            deliveryEstimate: results.deliveryEstimate,
                            editOrder: results.editOrder,
                            ordered: results.ordered,
                            pricePaid: results.pricePaid,
                            revisionButton: results.revisionButton,
                            streamingButton: results.streamingButton,
                            musicianTip,
                            revision,
                            upsellSection,
                            genreVariantUpsell,
                            lyricsUpsell,
                            streamingVipUpsell,
                            karaokeUpsell,
                        }}
                    />
                );
            case "extras":
                return (
                    <TabContentExtras
                        order={currentOrder}
                        email={searchedEmail || ""}
                        locale={locale}
                        translations={{
                            purchased: t("extras.purchased") || "Purchased",
                            available: t("extras.available") || "Available",
                            noPurchased: t("extras.noPurchased") || "No purchases yet",
                            noAvailable: t("extras.noAvailable") || "No extras available",
                            orderBumps: results.orderBumps,
                            upsellSection,
                            genreVariant: results.genreVariant,
                            genreVariantUpsell,
                            lyricsUpsell,
                            streamingVipUpsell,
                            karaokeUpsell,
                            option1: results.option1,
                            option2: results.option2,
                            status: results.status,
                            musicianTip,
                        }}
                    />
                );
            case "help":
                return (
                    <TabContentHelp
                        locale={locale}
                        translations={{
                            needHelp,
                            guarantee,
                            faq: faqTranslations,
                        }}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-porcelain flex flex-col">
            <SiteHeader hideAnnouncement />
            <main className="flex-grow">
                {/* Search Section */}
                <TrackOrderSearch
                    email={email}
                    onEmailChange={setEmail}
                    onSubmit={handleSubmit}
                    onReset={handleReset}
                    isLoading={isLoading || isFetching}
                    isCompact={showResults}
                    searchedEmail={searchedEmail}
                    searchMode={searchMode}
                    onSearchModeChange={setSearchMode}
                    translations={{
                        title: t("title"),
                        subtitle: t("subtitle"),
                        ...form,
                        searchAnother: t("form.searchAnother") || undefined,
                    }}
                />

                {/* Loading State */}
                <AnimatePresence mode="wait">
                    {isLoading && hasSearched && (
                        <motion.section
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="pb-16"
                        >
                            <div className="container mx-auto px-4">
                                <LoadingSkeleton />
                            </div>
                        </motion.section>
                    )}
                </AnimatePresence>

                {/* Results Section */}
                <AnimatePresence mode="wait">
                    {showResults && (
                        <motion.section
                            key="results"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="pb-16 lg:pb-8"
                        >
                            <div className="container mx-auto px-4">
                                {/* Desktop Layout: Sidebar + Detail */}
                                <div className="hidden lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 max-w-5xl mx-auto">
                                    <OrdersSidebar
                                        orders={ordersList}
                                        selectedId={currentOrder?.id}
                                        onSelect={setCurrentOrderIndex}
                                        locale={locale}
                                        translations={{
                                            title: sidebarTranslations.title,
                                            selectOrder: sidebarTranslations.selectOrder,
                                            status: results.status,
                                            ordered: results.ordered,
                                        }}
                                    />

                                    {/* Order Detail */}
                                    <div className="max-w-2xl">
                                        <AnimatePresence mode="wait">
                                            {currentOrder && (
                                                <motion.div
                                                    key={currentOrder.id}
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -20 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <OrderCard
                                                        order={currentOrder}
                                                        ordersList={ordersList}
                                                        index={currentOrderIndex}
                                                        locale={locale}
                                                        email={searchedEmail || ""}
                                                        onRefetch={() => refetch()}
                                                        onRequestRevision={setRevisionModalOrderId}
                                                        translations={{
                                                            results,
                                                            upsellSection,
                                                            genreVariantUpsell,
                                                            lyricsUpsell,
                                                            streamingVipUpsell,
                                                            karaokeUpsell,
                                                            musicianTip,
                                                            revision,
                                                            timeline: timelineLabels,
                                                        }}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Mobile Layout: Tab Bar Navigation */}
                                <div className="lg:hidden">
                                    <div className="max-w-2xl mx-auto">
                                        {/* Tab-specific Title */}
                                        <motion.div
                                            key={activeTab}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-6 mb-4 text-center sm:text-left"
                                        >
                                            {/* Enhanced headers for all tabs */}
                                            {(() => {
                                                const isOrdersTab = activeTab === "orders";
                                                const isListenOrExtrasTab = (activeTab === "listen" || activeTab === "extras") && currentOrder;
                                                const titleTemplate = activeTab === "listen"
                                                    ? (tabTranslations.listenTitle || "Listen to {name}'s Song 🎧")
                                                    : (tabTranslations.extrasTitle || "Extras for {name} ✨");

                                                // Orders tab - enhanced header with arrows
                                                if (isOrdersTab) {
                                                    const cleanOrdersTitle = (tabTranslations.ordersTitle || "Your Orders ({count})")
                                                        .replace("{count}", "")
                                                        .replace("()", "")
                                                        .replace(/\s+$/, "");

                                                    return (
                                                        <>
                                                            <div className="flex flex-col items-center sm:items-start">
                                                                <div className="flex items-center gap-2">
                                                                    <h2 className="text-xl sm:text-2xl font-serif font-bold text-charcoal">
                                                                        {cleanOrdersTitle}
                                                                    </h2>
                                                                    <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-[#4A8E9A] text-dark text-sm font-bold">
                                                                        {ordersList.length}
                                                                    </span>
                                                                </div>

                                                                {ordersList.length > 1 && (
                                                                    <span className="text-xs text-charcoal/55 font-medium mt-0.5">
                                                                        {locale === "pt" ? "Selecione abaixo qual pedido visualizar" :
                                                                         locale === "es" ? "Selecciona abajo qué pedido quieres ver" :
                                                                         locale === "fr" ? "Sélectionnez ci-dessous la commande à afficher" :
                                                                         locale === "it" ? "Seleziona sotto quale ordine visualizzare" :
                                                                         "Select below which order to view"}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Subtitle with current order info */}
                                                            {currentOrder && (
                                                                <p className="text-sm text-charcoal/60 mt-1.5 flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                                                    <span className="font-medium text-dark">
                                                                        {getRecipientDisplayName(currentOrder.recipientName, currentOrder.recipient, locale)}
                                                                    </span>
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                                                                        🎵 {getGenreDisplayName(currentOrder.genre, locale)}
                                                                    </span>
                                                                    <span>•</span>
                                                                    <span>
                                                                        {format(new Date(currentOrder.createdAt), "dd/MM/yyyy", { locale: DATE_LOCALES[locale as keyof typeof DATE_LOCALES] })}
                                                                    </span>
                                                                </p>
                                                            )}
                                                        </>
                                                    );
                                                }

                                                // Help tab - simple but styled header
                                                if (activeTab === "help") {
                                                    return (
                                                        <div className="flex flex-col items-center sm:items-start">
                                                            <h2 className="text-xl sm:text-2xl font-serif font-bold text-charcoal">
                                                                {tabTranslations.helpTitle || "Need Help?"}
                                                            </h2>
                                                            <p className="text-sm text-charcoal/60 mt-1">
                                                                {locale === "pt" ? "Estamos aqui para ajudar você" :
                                                                 locale === "es" ? "Estamos aquí para ayudarte" :
                                                                 locale === "fr" ? "Nous sommes là pour vous aider" :
                                                                 locale === "it" ? "Siamo qui per aiutarti" :
                                                                 "We're here to help you"}
                                                            </p>
                                                        </div>
                                                    );
                                                }

                                                // Listen/Extras tabs - header without arrows (scroll strip handles navigation)
                                                return (
                                                    <>
                                                        <div className="flex flex-col items-center sm:items-start">
                                                            <h2 className="text-xl sm:text-2xl font-serif font-bold text-charcoal">
                                                                {isListenOrExtrasTab ? (
                                                                    <>
                                                                        {titleTemplate
                                                                            .split("{name}")
                                                                            .map((part, i, arr) => (
                                                                                <span key={i}>
                                                                                    {part}
                                                                                    {i < arr.length - 1 && (
                                                                                        <span className="text-dark">
                                                                                            {getRecipientDisplayName(currentOrder.recipientName, currentOrder.recipient, locale)}
                                                                                        </span>
                                                                                    )}
                                                                                </span>
                                                                            ))}
                                                                    </>
                                                                ) : (
                                                                    getMobileTabTitle()
                                                                )}
                                                            </h2>

                                                            {/* Subtitle with genre + date */}
                                                            {isListenOrExtrasTab && (
                                                                <p className="text-sm text-charcoal/60 mt-1 flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                                                                        🎵 {getGenreDisplayName(currentOrder.genre, locale)}
                                                                    </span>
                                                                    <span>•</span>
                                                                    <span>
                                                                        {format(new Date(currentOrder.createdAt), "dd/MM/yyyy", { locale: DATE_LOCALES[locale as keyof typeof DATE_LOCALES] })}
                                                                        {" às "}
                                                                        {format(new Date(currentOrder.createdAt), "HH:mm", { locale: DATE_LOCALES[locale as keyof typeof DATE_LOCALES] })}
                                                                    </span>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </motion.div>

                                        {/* Tab Content */}
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={activeTab}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                {/* Scroll strip for listen/extras tabs */}
                                                {(activeTab === "listen" || activeTab === "extras") && ordersList.length > 1 && (
                                                    <TabContentOrders
                                                        orders={ordersList}
                                                        currentIndex={currentOrderIndex}
                                                        onIndexChange={setCurrentOrderIndex}
                                                        locale={locale}
                                                        translations={{
                                                            orderFor: results.orderFor,
                                                            status: results.status,
                                                            statusShort: results.statusShort,
                                                        }}
                                                    />
                                                )}
                                                {renderMobileTabContent()}
                                            </motion.div>
                                        </AnimatePresence>

                                        {/* Show current OrderCard for orders tab */}
                                        {activeTab === "orders" && currentOrder && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-4 pb-20"
                                            >
                                                <OrderCard
                                                    order={currentOrder}
                                                    ordersList={ordersList}
                                                    index={currentOrderIndex}
                                                    locale={locale}
                                                    email={searchedEmail || ""}
                                                    onRefetch={() => refetch()}
                                                    onRequestRevision={setRevisionModalOrderId}
                                                    translations={{
                                                        results,
                                                        upsellSection,
                                                        genreVariantUpsell,
                                                        lyricsUpsell,
                                                        streamingVipUpsell,
                                                        karaokeUpsell,
                                                        musicianTip,
                                                        revision,
                                                        timeline: timelineLabels,
                                                    }}
                                                />
                                            </motion.div>
                                        )}

                                        {/* Add bottom padding for other tabs */}
                                        {activeTab !== "orders" && <div className="pb-20" />}
                                    </div>

                                    {/* Bottom Tab Bar */}
                                    <BottomTabBar
                                        activeTab={activeTab}
                                        onTabChange={setActiveTab}
                                        ordersCount={ordersList.length}
                                        hasUpsells={hasAvailableUpsells ?? false}
                                        hasCompletedOrder={hasCompletedOrder}
                                        whatsAppMessage={needHelp.whatsAppMessage}
                                        customerEmail={searchedEmail || undefined}
                                        translations={tabTranslations}
                                    />
                                </div>
                            </div>
                        </motion.section>
                    )}
                </AnimatePresence>

                {/* Create Another Song CTA - Desktop only when results shown */}
                {showResults && (
                    <div className="hidden lg:block">
                        <CreateAnotherCta
                            locale={locale}
                            translations={createAnotherUpsell}
                        />
                    </div>
                )}

                {/* Not Found State */}
                <AnimatePresence mode="wait">
                    {showNotFound && (
                        <motion.section
                            key="notfound"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="pb-16"
                        >
                            <div className="container mx-auto px-4">
                                <NotFoundState
                                    locale={locale}
                                    translations={notFound}
                                />
                            </div>
                        </motion.section>
                    )}
                </AnimatePresence>

                {/* Need Help Section - Desktop only */}
                <div className="hidden lg:block">
                    <NeedHelpSection translations={needHelp} />
                </div>

                {/* Create New Song CTA (when no search yet) */}
                {!hasSearched && (
                    <CreateNewSongCta locale={locale} translations={needHelp} />
                )}

                {/* Guarantee Banner - Desktop only */}
                <div className="hidden lg:block">
                    <GuaranteeBanner translations={guarantee} />
                </div>
            </main>
            <SiteFooter />

            {/* Revision Confirmation Modal */}
            <RevisionModal
                order={revisionModalOrder}
                email={searchedEmail || ""}
                locale={locale}
                open={!!revisionModalOrderId}
                onClose={() => setRevisionModalOrderId(null)}
                translations={revision}
            />

            {/* Floating WhatsApp Button - Desktop only */}
            <a
                href={`https://wa.me/5561995790193?text=${encodeURIComponent(
                    searchedEmail
                        ? `${needHelp.whatsAppMessage}\n\nEmail: ${searchedEmail}`
                        : needHelp.whatsAppMessage
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:flex fixed bottom-6 right-6 z-50 items-center gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                aria-label="WhatsApp"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-6 h-6"
                >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="font-medium text-sm">
                    {locale === "pt" ? "Ajuda" : locale === "es" ? "Ayuda" : locale === "fr" ? "Aide" : locale === "it" ? "Aiuto" : "Help"}
                </span>
            </a>
        </div>
    );
}
