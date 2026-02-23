import {
    Document,
    Page,
    Text,
    View,
    Link,
    StyleSheet,
} from "@react-pdf/renderer";
import { stripLyricsTags } from "~/lib/frameable-pdf/lyrics-cleaner";

// Note: Using Helvetica (built-in) for server-side PDF generation
// WOFF2 fonts don't work with renderToBuffer on the server

const styles = StyleSheet.create({
    page: {
        backgroundColor: "#0A0E1A",
        padding: 40,
        fontFamily: "Helvetica",
    },
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 40,
        position: "relative",
    },
    goldBorderTop: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: "#C9A84C",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    goldBorderBottom: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: "#C9A84C",
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
    header: {
        alignItems: "center",
        marginBottom: 20,
        marginTop: 10,
    },
    logoText: {
        fontSize: 22,
        color: "#F0EDE6",
        letterSpacing: 1,
        fontFamily: "Helvetica-Bold",
    },
    starsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 20,
        marginTop: 15,
    },
    starDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: "#C9A84C",
        opacity: 0.5,
    },
    starDotLarge: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#C9A84C",
    },
    title: {
        fontSize: 26,
        color: "#F0EDE6",
        marginBottom: 8,
        fontFamily: "Helvetica-Bold",
        letterSpacing: 1,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 13,
        color: "#78716C",
        textAlign: "center",
        marginBottom: 20,
    },
    nameBox: {
        border: "2px solid #C9A84C",
        borderRadius: 10,
        padding: "12px 30px",
        marginBottom: 20,
        backgroundColor: "#0A0E1A",
        alignSelf: "center",
    },
    recipientName: {
        fontSize: 22,
        color: "#F0EDE6",
        fontFamily: "Helvetica-Bold",
        letterSpacing: 0.5,
        textAlign: "center",
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginVertical: 20,
    },
    dividerLine: {
        width: 50,
        height: 1,
        backgroundColor: "#C9A84C",
        opacity: 0.4,
    },
    dividerDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#C9A84C",
    },
    lyricsContainer: {
        backgroundColor: "#0A0E1A",
        borderRadius: 10,
        padding: 25,
        border: "1px solid #E8DDD3",
        flex: 1,
    },
    lyricsText: {
        fontSize: 11,
        color: "#44403C",
        lineHeight: 1.8,
    },
    footer: {
        marginTop: 20,
        alignItems: "center",
    },
    footerText: {
        fontSize: 10,
        color: "#B8B0A5",
        textAlign: "center",
    },
    websiteLink: {
        fontSize: 11,
        color: "#C9A84C",
        marginTop: 6,
        fontFamily: "Helvetica-Bold",
    },
    paginationRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginVertical: 6,
    },
    paginationLine: {
        width: 25,
        height: 1,
        backgroundColor: "#C9A84C",
        opacity: 0.3,
    },
    paginationText: {
        fontSize: 9,
        color: "#C9A84C",
        fontFamily: "Helvetica-Bold",
        letterSpacing: 1,
    },
    // Continuation page styles
    continuationHeader: {
        alignItems: "center",
        marginBottom: 15,
        marginTop: 10,
    },
    continuationLogoText: {
        fontSize: 16,
        color: "#F0EDE6",
        letterSpacing: 1,
        fontFamily: "Helvetica-Bold",
    },
    continuationSubtitle: {
        fontSize: 11,
        color: "#78716C",
        textAlign: "center",
        marginTop: 5,
    },
});

interface LyricsPDFProps {
    recipientName: string;
    lyrics: string;
    locale: string;
}

// Estimate how many lines a verse takes (rough approximation)
function estimateVerseLines(verse: string): number {
    const lines = verse.split("\n").length;
    // Each line is roughly 11px font with 1.8 line height = ~20px per line
    // Add some margin between verses
    return lines;
}

// Split verses into pages
// IMPORTANT: These values MUST match the HTML preview in lyrics-page-view.tsx
function splitVersesIntoPages(verses: string[]): string[][] {
    const pages: string[][] = [];
    let currentPage: string[] = [];
    let currentLines = 0;

    // First page has full header, so less space for lyrics
    const FIRST_PAGE_MAX_LINES = 18;
    // Continuation pages have smaller header
    const CONTINUATION_PAGE_MAX_LINES = 24;

    for (const verse of verses) {
        const verseLines = estimateVerseLines(verse);
        const maxLines = pages.length === 0 ? FIRST_PAGE_MAX_LINES : CONTINUATION_PAGE_MAX_LINES;

        // If adding this verse exceeds the page, start a new page
        if (currentLines + verseLines > maxLines && currentPage.length > 0) {
            pages.push(currentPage);
            currentPage = [];
            currentLines = 0;
        }

        currentPage.push(verse);
        currentLines += verseLines + 1; // +1 for margin between verses
    }

    // Don't forget the last page
    if (currentPage.length > 0) {
        pages.push(currentPage);
    }

    return pages;
}

export function LyricsPDF({
    recipientName,
    lyrics,
    locale,
}: LyricsPDFProps) {
    const isPt = locale === "pt";

    const logoText = isPt ? "Apollo Song" : "ApolloSong";
    const websiteDisplay = isPt ? "apollosong.com/pt" : "apollosong.com";
    const websiteHref = isPt ? "https://apollosong.com/pt" : "https://apollosong.com";

    const title = isPt ? "Letra da Música" : "Song Lyrics";
    const subtitle = isPt
        ? "Uma canção exclusiva para"
        : "An exclusive song for";
    const footerText = isPt ? "Criado com amor" : "Created with love";
    const continuationText = isPt ? "continuação" : "continued";

    const cleanLyrics = stripLyricsTags(lyrics);
    const verses = cleanLyrics.split(/\n\s*\n/);
    const pages = splitVersesIntoPages(verses);

    return (
        <Document>
            {pages.map((pageVerses, pageIndex) => (
                <Page key={pageIndex} size="A4" style={styles.page}>
                    <View style={styles.container}>
                        {/* Gold top border */}
                        <View style={styles.goldBorderTop} />

                        {pageIndex === 0 ? (
                            // First page - full header
                            <>
                                <View style={styles.header}>
                                    <Text style={styles.logoText}>{logoText}</Text>
                                </View>

                                <View style={styles.starsRow}>
                                    <View style={styles.starDot} />
                                    <View style={styles.starDot} />
                                    <View style={styles.starDotLarge} />
                                    <View style={styles.starDot} />
                                    <View style={styles.starDot} />
                                </View>

                                <Text style={styles.title}>{title}</Text>
                                <Text style={styles.subtitle}>{subtitle}</Text>

                                <View style={styles.nameBox}>
                                    <Text style={styles.recipientName}>{recipientName}</Text>
                                </View>

                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <View style={styles.dividerDot} />
                                    <View style={styles.dividerLine} />
                                </View>
                            </>
                        ) : (
                            // Continuation pages - smaller header
                            <View style={styles.continuationHeader}>
                                <Text style={styles.continuationLogoText}>{logoText}</Text>
                                <Text style={styles.continuationSubtitle}>
                                    {title} - {recipientName} ({continuationText})
                                </Text>
                            </View>
                        )}

                        {/* Lyrics */}
                        <View style={styles.lyricsContainer}>
                            {pageVerses.map((verse, index) => (
                                <Text
                                    key={index}
                                    style={{
                                        ...styles.lyricsText,
                                        marginBottom: index === pageVerses.length - 1 ? 0 : 16,
                                    }}
                                >
                                    {verse}
                                </Text>
                            ))}
                        </View>

                        {/* Footer */}
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>{footerText}</Text>

                            {/* Elegant pagination */}
                            {pages.length > 1 && (
                                <View style={styles.paginationRow}>
                                    <View style={styles.paginationLine} />
                                    <Text style={styles.paginationText}>
                                        {pageIndex + 1} / {pages.length}
                                    </Text>
                                    <View style={styles.paginationLine} />
                                </View>
                            )}

                            <Link src={websiteHref} style={styles.websiteLink}>
                                {websiteDisplay}
                            </Link>
                        </View>

                        {/* Gold bottom border */}
                        <View style={styles.goldBorderBottom} />
                    </View>
                </Page>
            ))}
        </Document>
    );
}
