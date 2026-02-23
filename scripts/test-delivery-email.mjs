import "dotenv/config";
import { buildSongDeliveryEmail } from "../src/server/email/song-delivery.ts";
import { sendEmail } from "../src/server/email/mailer.ts";

const testEmail = process.argv[2] || "thiagofelizola@gmail.com";

// Build test email with all features
const emailData = buildSongDeliveryEmail({
    orderId: "test-order-123",
    recipientName: "Maria",
    locale: "pt",
    trackOrderUrl: `https://apollosong.com/pt/track-order?orderId=test-order-123&email=${testEmail}`,
    songFileUrl: "https://example.com/song1.mp3",
    songFileUrl2: "https://example.com/song2.mp3",
    hasCertificate: true,
    certificateToken: "test-certificate-token",
    hasLyrics: true,
    genreVariants: [
        {
            orderId: "genre-variant-1",
            genre: "sertanejo",
            trackOrderUrl: `https://apollosong.com/pt/track-order?orderId=genre-variant-1&email=${testEmail}`,
        },
        {
            orderId: "genre-variant-2",
            genre: "rock",
            trackOrderUrl: `https://apollosong.com/pt/track-order?orderId=genre-variant-2&email=${testEmail}`,
        },
    ],
});

console.log("Sending test email to:", testEmail);
console.log("Subject:", emailData.subject);

await sendEmail({
    to: testEmail,
    subject: emailData.subject,
    html: emailData.html,
    text: emailData.text,
    template: "song-delivery-test",
    orderId: "test-order-123",
    metadata: { recipientName: "Maria" },
    from: emailData.from,
});

console.log("Email sent successfully!");
