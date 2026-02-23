import { env } from "~/env";
import { getUnsubscribeUrl } from "~/lib/email-unsubscribe";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

type TicketReplyEmailParams = {
    to: string;
    body: string;
    originalSubject: string;
    inReplyTo?: string | null;
    references?: string | null;
    locale?: string | null;
};

type SignatureLocale = "pt" | "en" | "es" | "fr" | "it";

const signatures: Record<SignatureLocale, { greeting: string; name: string; brandName: string; ctaLabel: string; ctaUrl: string; unsubLabel: string }> = {
    pt: {
        greeting: "Atenciosamente",
        name: "Equipe Apollo Song",
        brandName: "Apollo Song (Apollo Song)",
        ctaLabel: "Solicite uma nova canção pelo site",
        ctaUrl: "https://apollosong.com/pt",
        unsubLabel: "Não quer receber emails?",
    },
    en: {
        greeting: "Best regards",
        name: "Equipe Apollo Song",
        brandName: "Apollo Song",
        ctaLabel: "Request a new song on our website",
        ctaUrl: "https://apollosong.com",
        unsubLabel: "Don't want to receive emails?",
    },
    es: {
        greeting: "Atentamente",
        name: "Equipe Apollo Song",
        brandName: "Apollo Song (Apollo Song)",
        ctaLabel: "Solicita una nueva canción en nuestro sitio",
        ctaUrl: "https://apollosong.com/es",
        unsubLabel: "¿No quieres recibir emails?",
    },
    fr: {
        greeting: "Cordialement",
        name: "Equipe Apollo Song",
        brandName: "Apollo Song (Apollo Song)",
        ctaLabel: "Demandez une nouvelle chanson sur notre site",
        ctaUrl: "https://apollosong.com/fr",
        unsubLabel: "Vous ne souhaitez plus recevoir d'emails ?",
    },
    it: {
        greeting: "Cordiali saluti",
        name: "Equipe Apollo Song",
        brandName: "Apollo Song (Apollo Song)",
        ctaLabel: "Richiedi una nuova canzone sul nostro sito",
        ctaUrl: "https://apollosong.com/it",
        unsubLabel: "Non vuoi più ricevere email?",
    },
};

function normalizeSignatureLocale(locale?: string | null): SignatureLocale {
    const raw = (locale ?? "").trim().toLowerCase();
    if (!raw) return "en";
    if (raw === "pt" || raw.startsWith("pt-") || raw.startsWith("pt_")) return "pt";
    if (raw === "es" || raw.startsWith("es-") || raw.startsWith("es_")) return "es";
    if (raw === "fr" || raw.startsWith("fr-") || raw.startsWith("fr_")) return "fr";
    if (raw === "it" || raw.startsWith("it-") || raw.startsWith("it_")) return "it";
    return "en";
}

function getSignature(locale?: string | null) {
    return signatures[normalizeSignatureLocale(locale)];
}

export function buildTicketReplyEmail({
    to,
    body,
    originalSubject,
    inReplyTo,
    references,
    locale,
}: TicketReplyEmailParams) {
    const subject = originalSubject.startsWith("Re: ")
        ? originalSubject
        : `Re: ${originalSubject}`;

    const normalizedLocale = normalizeSignatureLocale(locale);
    const sig = getSignature(normalizedLocale);
    const unsubscribeUrl = getUnsubscribeUrl(to, normalizedLocale);
    const siteUrl = "https://apollosong.com";

    const safeBody = escapeHtml(body)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")   // **bold**
        .replace(/\*(.+?)\*/g, "<em>$1</em>")               // *italic*
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4f46e5;text-decoration:underline;">$1</a>')
        .replace(/\n/g, "<br>");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#f8f5f0;font-family:Arial, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 24px;line-height:1.7;color:#2b2b2b;font-size:15px;white-space:pre-wrap;">${safeBody}</p>
                <p style="margin:24px 0 0;color:#6f6f6f;font-size:14px;line-height:1.8;">
                  ${sig.greeting},<br>
                  <strong style="color:#2b2b2b;">${sig.name}</strong><br>
                  WhatsApp Suporte: (61) 99579-0193<br>
                  <a href="mailto:contact@apollosong.com" style="color:#4f46e5;text-decoration:none;">contact@apollosong.com</a><br>
                  <a href="${sig.ctaUrl}" style="color:#4f46e5;text-decoration:none;">${sig.ctaLabel}</a><br>
                  <span style="color:#9a9a9a;font-size:13px;">${sig.brandName}</span>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;color:#9a9a9a;font-size:10px;">
            <a href="${siteUrl}" style="color:#9a9a9a;text-decoration:none;">Apollo Song</a> | CSG 3 LT 7, Brasilia-DF, ZIP 72035-503, Brazil
          </p>
          <p style="margin:8px 0 0;color:#9a9a9a;font-size:10px;">
            ${sig.unsubLabel} <a href="${unsubscribeUrl}" style="color:#9a9a9a;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const text = `${body}\n\n--\n${sig.greeting},\n${sig.name}\nWhatsApp Suporte: (61) 99579-0193\ncontact@apollosong.com\n${sig.ctaLabel}: ${sig.ctaUrl}\n${sig.brandName}`;

    const headers: Record<string, string> = {
        "X-Mailer": "ApolloSong-Support/1.0",
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    if (inReplyTo) {
        headers["In-Reply-To"] = inReplyTo;
    }
    if (references) {
        headers["References"] = references;
    }

    return {
        to,
        subject,
        html,
        text,
        from: env.SMTP_FROM,
        headers,
    };
}
