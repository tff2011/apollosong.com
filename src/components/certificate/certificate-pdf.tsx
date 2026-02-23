"use client";

import {
    Document,
    Page,
    Text,
    View,
    Image,
    Link,
    StyleSheet,
} from "@react-pdf/renderer";

// Using Helvetica - built-in PDF font that supports Latin characters (including Portuguese accents)
// This avoids external font loading issues and works reliably

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
        alignItems: "center",
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
        fontSize: 24,
        color: "#F0EDE6",
        letterSpacing: 1,
        fontFamily: "Helvetica",
    },
    starsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 25,
        marginTop: 20,
    },
    starDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#C9A84C",
        opacity: 0.5,
    },
    starDotLarge: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#C9A84C",
    },
    title: {
        fontSize: 32,
        color: "#F0EDE6",
        marginBottom: 10,
        fontFamily: "Helvetica",
        fontWeight: 700,
        letterSpacing: 2,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 14,
        color: "#78716C",
        marginBottom: 25,
        textAlign: "center",
    },
    nameBox: {
        border: "2px solid #C9A84C",
        borderRadius: 12,
        padding: "16px 40px",
        marginBottom: 30,
        backgroundColor: "#0A0E1A",
    },
    recipientName: {
        fontSize: 28,
        color: "#F0EDE6",
        fontFamily: "Helvetica",
        fontWeight: 700,
        letterSpacing: 1,
        textAlign: "center",
    },
    detailsRow: {
        flexDirection: "row",
        gap: 30,
        marginBottom: 30,
    },
    detailText: {
        fontSize: 11,
        color: "#78716C",
    },
    detailLabel: {
        color: "#C9A84C",
        fontFamily: "Helvetica",
        fontWeight: 700,
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 30,
    },
    dividerLine: {
        width: 50,
        height: 1,
        backgroundColor: "#C9A84C",
        opacity: 0.4,
    },
    musicNoteDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#C9A84C",
    },
    qrSection: {
        alignItems: "center",
        marginBottom: 20,
    },
    emotionalMessage: {
        fontSize: 13,
        color: "#44403C",
        textAlign: "center",
        marginBottom: 15,
        maxWidth: 280,
        lineHeight: 1.5,
    },
    qrCode: {
        width: 120,
        height: 120,
        marginBottom: 10,
    },
    scanText: {
        fontSize: 11,
        color: "#9A9488",
        textAlign: "center",
    },
    footer: {
        marginTop: "auto",
        paddingTop: 25,
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
        fontFamily: "Helvetica",
        fontWeight: 700,
    },
});

interface CertificatePDFProps {
    recipientName: string;
    genre: string;
    createdAt: string;
    locale: string;
    certificateUrl: string;
    qrCodeDataUrl: string;
}

export function CertificatePDF({
    recipientName,
    genre,
    createdAt,
    locale,
    qrCodeDataUrl,
}: CertificatePDFProps) {
    const isPt = locale === "pt";

    // Branding with proper accents (Inter font supports Unicode)
    const logoText = isPt ? "Apollo Song" : "ApolloSong";
    const websiteDisplay = isPt ? "apollosong.com/pt" : "apollosong.com";
    const websiteHref = isPt ? "https://apollosong.com/pt" : "https://apollosong.com";

    // Labels with proper accents
    const title = isPt ? "Canção do Coração" : "Song of the Heart";
    const subtitle = isPt
        ? "Esta canção foi criada exclusivamente para"
        : "This song was created exclusively for";
    const genreLabel = isPt ? "Gênero" : "Genre";
    const createdOnLabel = isPt ? "Criada em" : "Created on";

    // Emotional message with recipient name
    const emotionalMessage = isPt
        ? `Alguém especial preparou uma apollo song para ${recipientName}...`
        : `Someone special prepared a divine song for ${recipientName}...`;

    const scanText = isPt
        ? "Escaneie o QR Code para ouvir"
        : "Scan the QR Code to listen";

    const footerText = isPt
        ? "Criado com amor"
        : "Created with love";

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.container}>
                    {/* Gold top border */}
                    <View style={styles.goldBorderTop} />

                    {/* Logo Header */}
                    <View style={styles.header}>
                        <Text style={styles.logoText}>{logoText}</Text>
                    </View>

                    {/* Decorative dots */}
                    <View style={styles.starsRow}>
                        <View style={styles.starDot} />
                        <View style={styles.starDot} />
                        <View style={styles.starDotLarge} />
                        <View style={styles.starDot} />
                        <View style={styles.starDot} />
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>

                    {/* Recipient Name Box */}
                    <View style={styles.nameBox}>
                        <Text style={styles.recipientName}>{recipientName}</Text>
                    </View>

                    {/* Details */}
                    <View style={styles.detailsRow}>
                        <Text style={styles.detailText}>
                            <Text style={styles.detailLabel}>{genreLabel}: </Text>
                            {genre}
                        </Text>
                        <Text style={styles.detailText}>
                            <Text style={styles.detailLabel}>{createdOnLabel}: </Text>
                            {createdAt}
                        </Text>
                    </View>

                    {/* Divider */}
                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <View style={styles.musicNoteDot} />
                        <View style={styles.dividerLine} />
                    </View>

                    {/* QR Code Section */}
                    <View style={styles.qrSection}>
                        <Text style={styles.emotionalMessage}>{emotionalMessage}</Text>
                        <Image src={qrCodeDataUrl} style={styles.qrCode} />
                        <Text style={styles.scanText}>{scanText}</Text>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>{footerText}</Text>
                        <Link src={websiteHref} style={styles.websiteLink}>
                            {websiteDisplay}
                        </Link>
                    </View>

                    {/* Gold bottom border */}
                    <View style={styles.goldBorderBottom} />
                </View>
            </Page>
        </Document>
    );
}
